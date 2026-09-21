/* shadow_set_request.h — dAVEBOx's REQUEST record: parsing, and which counter
 * the arm is measured against.
 *
 * ── Why line 4 exists ─────────────────────────────────────────────────────
 *
 * `OPEN` is only ever produced by a confirmation line whose counter is PAST
 * the counter recorded when the request was armed (shadow_loaded_set_policy.h).
 * That rule is what makes "Move loaded something SINCE I asked" expressible,
 * and it is correct — but it assumes the arming shim is the one that will see
 * the answer. On a RELAUNCH it is not, and for a while nothing said so:
 *
 *   · dAVEBOx writes the request; the STILL-LIVE shim's poll consumes it
 *     within ~1.4 s; the relaunch kills that shim ~1 s later. The new session
 *     starts with no request file, never arms, and therefore can never
 *     confirm. Move opened exactly the right project and the host never said
 *     so, so dAVEBOx sat on `pending` — which means "nothing is open" — and
 *     showed the picker. Measured on device 2026-09-21: a project created
 *     this session bounced back to the picker on its FIRST load, every time,
 *     while every later load worked (those take the in-place route, where one
 *     shim lives through the whole thing).
 *
 *   · ⚠ And carrying the FILE across the restart is not enough on its own.
 *     The shim's worker sleeps 200 ms before its first poll; Move logs its
 *     load ~0.18 s after start. So the new shim's first poll lands AFTER the
 *     line it is waiting for, samples n0 = 1 against line_n = 1, and refuses
 *     its own answer as stale — turning "pending forever" into a confident
 *     "PROJECT DID NOT OPEN" 8 s later. Rarer and therefore worse.
 *
 * ⭐ So the relaunch route does not race at all: the LAUNCHER installs the
 * record while Move is down, and states the counter explicitly as 0. That is
 * exact by construction rather than by timing — the same loop iteration
 * deletes move_loaded_set.txt before starting Move (launch.sh), and the reader
 * takes its counter FROM that file, so this run's first load is always 1.
 *
 * ⚠ Do NOT "improve" this by having the launcher sample the counter instead.
 * It would read the PREVIOUS Move run's number (1, or higher after a flap),
 * which the clear is about to reset — so the new run's `1 <slot>` line would
 * be judged stale forever. The literal 0 is the whole point.
 *
 * An ABSENT or malformed line 4 means "sample it, as always" — the in-place
 * route is unchanged, and garbage degrades to the old behaviour rather than to
 * a confident wrong answer.
 *
 * Pure and header-only so the record can be unit-tested against the exact
 * bytes each writer produces (tests/host/test_set_request.c). No I/O here. */
#ifndef SHADOW_SET_REQUEST_H
#define SHADOW_SET_REQUEST_H

#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#define IDENTITY_REQ_UUID_MAX 64
#define IDENTITY_REQ_NAME_MAX 128

typedef struct {
    char uuid[IDENTITY_REQ_UUID_MAX];
    char name[IDENTITY_REQ_NAME_MAX];
    int  index;
    /* Line 4, written ONLY by launch.sh on the relaunch route. `have_n0 == 0`
     * means the arm samples the reader's counter, exactly as it always has. */
    int  n0;
    int  have_n0;
} identity_request_t;

/* Parse `uuid \n index \n name [\n n0]`. Destructive on `buf` (it writes NULs
 * at the separators), which is what the caller already had. Returns non-zero
 * when a uuid was found — the same contract the consumer had before. */
static inline int identity_request_parse(char *buf, identity_request_t *out)
{
    out->uuid[0] = '\0'; out->name[0] = '\0';
    out->index = -1; out->n0 = 0; out->have_n0 = 0;
    if (!buf) return 0;

    char *p1 = strchr(buf, '\n');
    if (!p1) return 0;
    *p1++ = '\0';
    size_t ulen = strcspn(buf, "\r");
    if (ulen == 0 || ulen >= sizeof(out->uuid)) return 0;
    memcpy(out->uuid, buf, ulen); out->uuid[ulen] = '\0';

    char *p2 = strchr(p1, '\n');
    if (p2) *p2++ = '\0';
    out->index = atoi(p1);

    if (p2) {
        /* The NAME may not contain a newline, so line 4 begins after it. */
        char *p3 = strchr(p2, '\n');
        if (p3) *p3++ = '\0';
        size_t nlen = strcspn(p2, "\r\n");
        if (nlen >= sizeof(out->name)) nlen = sizeof(out->name) - 1;
        memcpy(out->name, p2, nlen); out->name[nlen] = '\0';

        if (p3) {
            /* Digits only. Anything else is not a counter, and guessing at one
             * would be inventing the very evidence this machine refuses to
             * invent — fall back to sampling. */
            size_t dlen = strcspn(p3, "\r\n");
            if (dlen > 0) {
                size_t i;
                for (i = 0; i < dlen; i++)
                    if (p3[i] < '0' || p3[i] > '9') break;
                if (i == dlen) { out->n0 = atoi(p3); out->have_n0 = 1; }
            }
        }
    }
    return out->uuid[0] != '\0';
}

/* Which counter this arm is measured against: the record's own when it carries
 * one (the launcher installed it while Move was down), else the value sampled
 * from the reader at the moment of arming. */
static inline int identity_request_arm_n0(const identity_request_t *r, int sampled)
{
    return (r && r->have_n0) ? r->n0 : sampled;
}

#endif /* SHADOW_SET_REQUEST_H */
