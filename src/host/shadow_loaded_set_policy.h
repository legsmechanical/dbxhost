/* shadow_loaded_set_policy.h — WHICH PROJECT IS OPEN, as a state machine.
 *
 * ── Why this is a machine and not a lookup ────────────────────────────────
 *
 * Identity used to be inferred: the host read Settings.json's currentSongIndex,
 * scanned `user.song-index` xattrs for a dir carrying it, and published that.
 * That answers "which set dir carries this index", never "which set is Move
 * holding". The two part company — Move can look in a project folder, not find
 * a song where it expects one, treat the pad as empty and load a set of its own
 * (`About to load default song`), while the host goes on believing the project
 * is open. Every save keyed on that belief then lands in a project Move never
 * loaded.
 *
 * ⭑ But Move SAYS what it loaded. It logs `About to load <path>` for every
 * load, and the launcher distills that into a record
 * (standalone/scripts/move-loaded-set-reader.sh): a counter, a uuid or the
 * literal `default`, and the project's folder name. Measured on device
 * 2026-09-16: the line lands 0.18 s after `starting Move`, five samples, no
 * spread worth naming. Two of those five were the sessions that lost a night's
 * work — Move named the project 0.18 s in, both times, and nothing read it.
 *
 * So identity is no longer resolved. It is DECIDED, by three parties with one
 * record each:
 *   dAVEBOx authors the REQUEST  (intended_set.txt, at the pick)
 *   Move    authors the CONFIRMATION (the log line, via the reader)
 *   this    decides the STATE    (open / pending / none)
 *
 * ── The rule that makes it safe ───────────────────────────────────────────
 *
 * 🔴 **OPEN is always Move-confirmed.** There is no path that promotes a
 * request, a guess or a user's choice into `open` (Josh, 2026-09-15: "retry
 * only"). The sole producer of `open` is a reader line whose counter is PAST
 * the counter recorded when the request was armed. The counter is what makes
 * "Move loaded something since I asked" expressible at all: a line naming the
 * set we wanted may have been written before we wanted it, and taking that for
 * confirmation is how a stale answer passes for a fresh one.
 *
 * ⚠ The resolver survives as a HINT and nothing more (it is upstream code, and
 * it is the only source that can answer before Move has loaded anything). A
 * hint never appears as a state and is never saved into; see the `confirmed`
 * gate at the outgoing save in shadow_ui.js.
 *
 * ── Why there is no prefix here any more ──────────────────────────────────
 *
 * The verdict used to be smuggled inside the identity as
 * `__pending-unopened-<idx>-<seq>`, sharing the `__pending-` prefix with the
 * placeholder ON PURPOSE so that writers refusing a placeholder refused it too.
 * That cleverness cost a whole mechanism: a guard added to the placeholder
 * prefix silently swallowed the verdict, and `active_set.txt` is the verdict's
 * only channel, so "PROJECT DID NOT OPEN" went dark with both suites green.
 * A state is a FIELD now. Nothing decodes a name.
 *
 * Pure and header-only, so the whole machine is unit-tested off-device
 * (tests/host/test_loaded_set_policy.c). It does no I/O and keeps no statics:
 * the caller supplies the inputs and stores the record.
 */
#ifndef SHADOW_LOADED_SET_POLICY_H
#define SHADOW_LOADED_SET_POLICY_H

#include <stddef.h>
#include <string.h>

/* How long a request waits for Move's word before it is called a failure.
 *
 * ⚠ HALF-EVIDENCED, and deliberately recorded as such. The BOOT arm is
 * measured at 0.18 s (device, 2026-09-16, 5 samples). The in-place actuator
 * arm — which is the path that actually sets this constant — writes no
 * timestamp and was NOT measured; the only figure for it is a remembered
 * "~6.5 s arm to resume". 8000 keeps a wide margin over that. Instrument the
 * arm site before treating this number as anything but a ceiling. */
#define LOADED_SET_REQUEST_TIMEOUT_MS 8000

typedef enum {
    LOADED_SET_PENDING = 0,  /* waiting for Move's word — NOT a failure */
    LOADED_SET_OPEN,         /* Move confirmed it; the only state with an identity */
    LOADED_SET_NONE          /* nothing is open, and `reason` says why */
} loaded_set_state_t;

typedef enum {
    LOADED_SET_REASON_NONE = 0,
    LOADED_SET_REASON_UNOPENED,  /* we asked for something and did not get it */
    LOADED_SET_REASON_DEFAULT,   /* Move is on a set it minted; nobody asked */
    LOADED_SET_REASON_UNKNOWN    /* Move has not said anything: reader dead,
                                  * still booting past the timeout, or the log
                                  * line no longer matches the parser */
} loaded_set_reason_t;

#define LOADED_SET_UUID_MAX 64
#define LOADED_SET_NAME_MAX 128

typedef struct {
    loaded_set_state_t  state;
    loaded_set_reason_t reason;
    char uuid[LOADED_SET_UUID_MAX];  /* set only when state == OPEN */
    char name[LOADED_SET_NAME_MAX];  /* the project's name, when known */
    int  index;                      /* song index: the open one, or the one asked for, or -1 */
} loaded_set_record_t;

/* Everything the decision depends on. The caller reads these; the machine
 * touches no file, no clock and no global. */
typedef struct {
    /* the request, if one is armed (dAVEBOx's intended_set.txt, consumed) */
    int  have_request;
    char req_uuid[LOADED_SET_UUID_MAX];
    char req_name[LOADED_SET_NAME_MAX];
    int  req_index;
    int  req_n0;            /* the reader's counter at the moment of arming */

    /* Move's word (move_loaded_set.txt), or n == 0 for "nothing said yet" */
    int  line_n;
    const char *line_uuid;  /* a uuid, or "default"; NULL when n == 0 */
    const char *line_name;  /* may be NULL or empty */

    long elapsed_ms;        /* since the request was armed, or since Move start */
    long timeout_ms;        /* LOADED_SET_REQUEST_TIMEOUT_MS unless a test overrides */
} loaded_set_input_t;

static inline int loaded_set_is_default(const char *u)
{
    return u && strcmp(u, "default") == 0;
}

static inline void loaded_set_copy(char *dst, size_t cap, const char *src)
{
    if (!src) { dst[0] = '\0'; return; }
    size_t n = strlen(src);
    if (n >= cap) n = cap - 1;
    memcpy(dst, src, n);
    dst[n] = '\0';
}

static inline void loaded_set_none(loaded_set_record_t *out, loaded_set_reason_t why,
                                   int index, const char *name)
{
    out->state = LOADED_SET_NONE;
    out->reason = why;
    out->uuid[0] = '\0';
    loaded_set_copy(out->name, sizeof(out->name), name);
    out->index = index;
}

/* One step of the machine. Total: every input shape produces exactly one
 * record, and the caller publishes it.
 *
 *   with a request R armed, n0 = the counter when it was armed:
 *     a line PAST n0 naming R's uuid  -> OPEN(R)
 *     a line PAST n0 naming anything else, or `default` -> NONE(unopened, R)
 *     no line past n0 by the timeout  -> NONE(unopened, R)
 *     otherwise                       -> PENDING
 *
 *   with no request (Move moving of its own accord, or a plain boot):
 *     any line naming a uuid          -> OPEN(that uuid)
 *     a line saying `default`         -> NONE(default)
 *     no line at all by the timeout   -> NONE(unknown)
 *     otherwise                       -> PENDING
 *
 * ⚠ Note what is NOT here: a transition that accepts a line at or BELOW n0 as
 * confirmation of a request ("Move already holds it"). It re-used Move's word
 * about an earlier moment, and a stale confirmation is not a confirmation. The
 * cost is that re-selecting the project Move already holds waits for a fresh
 * line; measured on device 2026-09-16, Move does re-log a set it already named,
 * so the fast path holds — though that evidence spans restarts and the pure
 * in-place same-set case is still unobserved. If it turns out Move stays quiet
 * there, the pick times out to `unopened` and the user's Retry relaunches:
 * slow, never wrong. */
static inline void loaded_set_step(const loaded_set_input_t *in, loaded_set_record_t *out)
{
    int fresh = (in->line_n > 0) &&
                (!in->have_request || in->line_n > in->req_n0);
    int timed_out = in->elapsed_ms >= in->timeout_ms;

    if (in->have_request) {
        if (fresh) {
            if (!loaded_set_is_default(in->line_uuid) &&
                in->line_uuid && in->req_uuid[0] &&
                strcmp(in->line_uuid, in->req_uuid) == 0) {
                out->state = LOADED_SET_OPEN;
                out->reason = LOADED_SET_REASON_NONE;
                loaded_set_copy(out->uuid, sizeof(out->uuid), in->line_uuid);
                /* Move's own name for it when it gave one, else the request's:
                 * the two agree, and the request's is what the user just read
                 * off the picker. */
                loaded_set_copy(out->name, sizeof(out->name),
                                (in->line_name && in->line_name[0]) ? in->line_name : in->req_name);
                out->index = in->req_index;
                return;
            }
            /* Move loaded something else, or minted its own. Either way the
             * project the user asked for is not open. The index carried is the
             * REQUEST's, because Retry must land back on the pad they pressed,
             * not on whatever Move settled on. */
            loaded_set_none(out, LOADED_SET_REASON_UNOPENED, in->req_index, in->req_name);
            return;
        }
        if (timed_out) {
            loaded_set_none(out, LOADED_SET_REASON_UNOPENED, in->req_index, in->req_name);
            return;
        }
        out->state = LOADED_SET_PENDING;
        out->reason = LOADED_SET_REASON_NONE;
        out->uuid[0] = '\0';
        loaded_set_copy(out->name, sizeof(out->name), in->req_name);
        out->index = in->req_index;
        return;
    }

    /* No request: Move is moving on its own, or this is a plain boot. */
    if (fresh) {
        if (loaded_set_is_default(in->line_uuid)) {
            loaded_set_none(out, LOADED_SET_REASON_DEFAULT, -1, in->line_name);
            return;
        }
        if (in->line_uuid && in->line_uuid[0]) {
            out->state = LOADED_SET_OPEN;
            out->reason = LOADED_SET_REASON_NONE;
            loaded_set_copy(out->uuid, sizeof(out->uuid), in->line_uuid);
            loaded_set_copy(out->name, sizeof(out->name), in->line_name);
            out->index = -1;   /* the caller fills this from its own resolution */
            return;
        }
    }
    if (timed_out) {
        loaded_set_none(out, LOADED_SET_REASON_UNKNOWN, -1, NULL);
        return;
    }
    out->state = LOADED_SET_PENDING;
    out->reason = LOADED_SET_REASON_NONE;
    out->uuid[0] = '\0';
    out->name[0] = '\0';
    out->index = -1;
}

/* The wire spelling of a state, for the fork-only `active_set_state` param and
 * for logs. One place, so the C and the JS cannot drift apart in wording. */
static inline const char *loaded_set_state_str(loaded_set_state_t s)
{
    switch (s) {
    case LOADED_SET_OPEN:    return "open";
    case LOADED_SET_NONE:    return "none";
    case LOADED_SET_PENDING:
    default:                 return "pending";
    }
}

static inline const char *loaded_set_reason_str(loaded_set_reason_t r)
{
    switch (r) {
    case LOADED_SET_REASON_UNOPENED: return "unopened";
    case LOADED_SET_REASON_DEFAULT:  return "default";
    case LOADED_SET_REASON_UNKNOWN:  return "unknown";
    case LOADED_SET_REASON_NONE:
    default:                         return "";
    }
}

#endif /* SHADOW_LOADED_SET_POLICY_H */
