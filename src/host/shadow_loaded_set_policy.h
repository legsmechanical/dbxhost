/* shadow_loaded_set_policy.h — did Move actually OPEN the set the host
 * resolved?
 *
 * The host resolves the active set from Settings.json's currentSongIndex by
 * scanning `user.song-index` xattrs (shadow_set_pages.c). That answers "which
 * set dir carries this index", NOT "which set is Move holding". The two part
 * company when Move rejects the dir it was pointed at and logs
 * `About to load default song`: it then sits on an unsaved default set of its
 * own while the host believes the project is open, and every save keyed on
 * the active set lands in a project Move never loaded (root cause:
 * _worklogs/specs/2026-09-14-new-project-default-song-plan.md).
 *
 * The launcher distills Move's own `About to load ...` line into a one-line
 * file (standalone/scripts/move-loaded-set-reader.sh): a uuid, or `default`.
 * ⚠ ABSENT means UNKNOWN — the reader has not seen the line yet — and is
 * never read as `default`.
 *
 * This header is the pure decision, so it can be tested off-device
 * (tests/host/test_loaded_set_policy.c). The poll feeds it the file contents
 * and the time since this index was first resolved, and publishes what it
 * says.
 */
#ifndef SHADOW_LOADED_SET_POLICY_H
#define SHADOW_LOADED_SET_POLICY_H

#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <ctype.h>

/* The identity published when Move did not open the resolved set. It starts
 * with the PROVISIONAL prefix `__pending-` on purpose: every writer that
 * already refuses a provisional identity (shared/session_state.mjs
 * setUuidIsProvisional, the host's perSetStateDir, dAVEBOx's readActiveSet and
 * ensureStateDir) refuses this one for free. The `unopened-` part is the flag
 * dAVEBOx reads to put up its screen; the index is the pad to retry.
 * Must match UNOPENED_SET_UUID_PREFIX in src/shared/session_state.mjs. */
#define LOADED_SET_UNOPENED_PREFIX "__pending-unopened-"

/* A non-matching answer must PERSIST this long before it is believed. The
 * reader lags Move's log by up to a second (tail polling), and on an in-place
 * switch the file still holds the PREVIOUS load until then. */
#define LOADED_SET_SETTLE_MS       3000
/* No answer at all: hold the publish this long, then publish the resolution
 * as before — unknown is not a failure. */
#define LOADED_SET_UNKNOWN_HOLD_MS 10000
/* Keep re-checking this long after the index was first resolved, so a late
 * `default` (a slow Move boot) still flips the published identity. */
#define LOADED_SET_WATCH_MS        30000

typedef enum {
    LOADED_SET_UNKNOWN  = 0,  /* file absent or empty */
    LOADED_SET_MATCH    = 1,  /* file names the resolved uuid */
    LOADED_SET_MISMATCH = 2,  /* `default`, or a different uuid */
} loaded_set_verdict_t;

typedef enum {
    LOADED_SET_ACT_HOLD = 0,          /* publish nothing yet */
    LOADED_SET_ACT_PUBLISH_RESOLVED,  /* publish the xattr resolution */
    LOADED_SET_ACT_PUBLISH_UNOPENED,  /* publish "no active set" + the flag */
} loaded_set_action_t;

/* file: the file's contents, or NULL when it does not exist. */
static inline loaded_set_verdict_t loaded_set_verdict(const char *resolved_uuid,
                                                      const char *file)
{
    if (!file) return LOADED_SET_UNKNOWN;
    while (*file && isspace((unsigned char)*file)) file++;
    size_t n = strlen(file);
    while (n > 0 && isspace((unsigned char)file[n - 1])) n--;
    if (n == 0) return LOADED_SET_UNKNOWN;
    if (resolved_uuid && resolved_uuid[0] && strlen(resolved_uuid) == n &&
        strncasecmp(file, resolved_uuid, n) == 0)
        return LOADED_SET_MATCH;
    return LOADED_SET_MISMATCH;
}

static inline loaded_set_action_t loaded_set_action(loaded_set_verdict_t v,
                                                    long elapsed_ms)
{
    switch (v) {
    case LOADED_SET_MATCH:
        return LOADED_SET_ACT_PUBLISH_RESOLVED;
    case LOADED_SET_MISMATCH:
        return elapsed_ms < LOADED_SET_SETTLE_MS ? LOADED_SET_ACT_HOLD
                                                 : LOADED_SET_ACT_PUBLISH_UNOPENED;
    case LOADED_SET_UNKNOWN:
    default:
        return elapsed_ms < LOADED_SET_UNKNOWN_HOLD_MS ? LOADED_SET_ACT_HOLD
                                                       : LOADED_SET_ACT_PUBLISH_RESOLVED;
    }
}

/* Should the poll come back to this index even though nothing changed? */
static inline int loaded_set_keep_checking(loaded_set_verdict_t v, long elapsed_ms)
{
    return v != LOADED_SET_MATCH && elapsed_ms < LOADED_SET_WATCH_MS;
}

/* May the poll RETARGET verification onto a freshly-scanned uuid, abandoning
 * whichever uuid it is currently verifying?
 *
 * Settings.json's currentSongIndex is Move's own state, not just ours: when
 * Move rejects the set we asked it to open, it does not merely log `About to
 * load default song` — it can also keep hunting and settle on a DIFFERENT
 * real project of its own, rewriting currentSongIndex to that project's
 * index. If the poll blindly re-resolves via the xattr scan whenever the
 * index moves, it re-targets verification onto Move's fallback mid-flight,
 * and that fallback's own uuid legitimately MATCHES move_loaded_set.txt's
 * last line (that really is what Move loaded) — silently publishing the set
 * Move fell back into instead of raising "did not open" for the one we
 * asked for. Device log, one launch, pad 13:
 *   About to load d6b24c82... -> About to load c63c3e77.../Project 1
 *   -> About to load default song -> About to load .../Project 1
 * all inside the settle window.
 *
 * So: while a verification is still within its settle window, a new
 * resolution must NOT replace it — keep verifying the ORIGINAL uuid, and let
 * move_loaded_set.txt naming a different real uuid resolve as the MISMATCH
 * it is (-> UNOPENED once the settle window elapses). Once the settle window
 * has passed (the original verification has either matched, or is already on
 * its way to UNOPENED), a differing resolution is trusted as a legitimate new
 * target. */
static inline int loaded_set_may_retarget(long elapsed_since_verify_start_ms)
{
    return elapsed_since_verify_start_ms >= LOADED_SET_SETTLE_MS;
}

static inline void loaded_set_unopened_uuid(char *out, size_t out_len,
                                            int song_index, unsigned seq)
{
    snprintf(out, out_len, LOADED_SET_UNOPENED_PREFIX "%d-%u", song_index, seq);
}

#endif /* SHADOW_LOADED_SET_POLICY_H */
