/*
 * Host-side unit test for shadow_loaded_set_policy.h — does the host publish
 * the set its xattr scan resolved, or "Move did not open it"?
 *
 * The directions that matter, each with the near-miss a lazy rule gets wrong:
 *   - ABSENT is UNKNOWN, never `default`: a missing file must not produce the
 *     unopened identity at ANY elapsed time (it publishes the resolution once
 *     the hold runs out). A rule that treated "no answer" as failure would put
 *     the screen up on every boot where the reader lagged.
 *   - `default` IS a mismatch, but only once it has persisted past the settle
 *     window (a reader lagging an in-place switch still shows the old value).
 *   - a DIFFERENT uuid is a mismatch too; the resolved uuid with trailing
 *     newline / other case is a match.
 *   - the unopened identity carries the PROVISIONAL prefix (`__pending-`), so
 *     every existing "never save to a placeholder" gate applies to it.
 */
#include <stdio.h>
#include <string.h>
#include "shadow_loaded_set_policy.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

#define X "aaaaaaaa-1111-4bbb-8ccc-000000000001"
#define Y "bbbbbbbb-2222-4ccc-8ddd-000000000002"

int main(void) {
    /* --- verdicts ------------------------------------------------------- */
    OK(loaded_set_verdict(X, NULL) == LOADED_SET_UNKNOWN, "absent file = UNKNOWN");
    OK(loaded_set_verdict(X, "") == LOADED_SET_UNKNOWN, "empty file = UNKNOWN");
    OK(loaded_set_verdict(X, "\n") == LOADED_SET_UNKNOWN, "blank line = UNKNOWN");
    OK(loaded_set_verdict(X, X "\n") == LOADED_SET_MATCH, "resolved uuid + newline = MATCH");
    OK(loaded_set_verdict(X, "AAAAAAAA-1111-4BBB-8CCC-000000000001") == LOADED_SET_MATCH,
       "case differs = MATCH");
    OK(loaded_set_verdict(X, "default\n") == LOADED_SET_MISMATCH, "`default` = MISMATCH");
    OK(loaded_set_verdict(X, Y "\n") == LOADED_SET_MISMATCH, "other uuid = MISMATCH");
    OK(loaded_set_verdict(X, X "0") == LOADED_SET_MISMATCH, "uuid prefix-extension = MISMATCH");

    /* --- actions -------------------------------------------------------- */
    OK(loaded_set_action(LOADED_SET_MATCH, 0) == LOADED_SET_ACT_PUBLISH_RESOLVED,
       "MATCH publishes the resolution at once");
    for (long t = 0; t <= 60000; t += 250) {
        if (loaded_set_action(LOADED_SET_UNKNOWN, t) == LOADED_SET_ACT_PUBLISH_UNOPENED) {
            printf("  FAIL UNKNOWN produced UNOPENED at %ld ms\n", t);
            return 1;
        }
    }
    checks++; printf("  ok   UNKNOWN never publishes UNOPENED (0..60 s)\n");
    OK(loaded_set_action(LOADED_SET_UNKNOWN, 0) == LOADED_SET_ACT_HOLD, "UNKNOWN holds at first");
    OK(loaded_set_action(LOADED_SET_UNKNOWN, LOADED_SET_UNKNOWN_HOLD_MS) == LOADED_SET_ACT_PUBLISH_RESOLVED,
       "UNKNOWN publishes the resolution once the hold runs out");
    OK(loaded_set_action(LOADED_SET_MISMATCH, 0) == LOADED_SET_ACT_HOLD,
       "MISMATCH inside the settle window holds (reader lag)");
    OK(loaded_set_action(LOADED_SET_MISMATCH, LOADED_SET_SETTLE_MS) == LOADED_SET_ACT_PUBLISH_UNOPENED,
       "persistent MISMATCH publishes UNOPENED");
    OK(LOADED_SET_SETTLE_MS < LOADED_SET_UNKNOWN_HOLD_MS && LOADED_SET_UNKNOWN_HOLD_MS < LOADED_SET_WATCH_MS,
       "settle < hold < watch");

    /* --- re-checking ---------------------------------------------------- */
    OK(!loaded_set_keep_checking(LOADED_SET_MATCH, 0), "MATCH stops the re-checks");
    OK(loaded_set_keep_checking(LOADED_SET_UNKNOWN, LOADED_SET_UNKNOWN_HOLD_MS),
       "published-on-UNKNOWN keeps watching for a late `default`");
    OK(loaded_set_keep_checking(LOADED_SET_MISMATCH, LOADED_SET_SETTLE_MS),
       "UNOPENED keeps watching for a late match");
    OK(!loaded_set_keep_checking(LOADED_SET_MISMATCH, LOADED_SET_WATCH_MS), "watch window ends");

    /* --- retargeting -----------------------------------------------------
     * A resolution change mid-verification must NOT be adopted while still
     * inside the settle window — that is exactly Move rewriting
     * currentSongIndex to reflect the project it fell back into (pad 13
     * device log: d6b24c82 -> c63c3e77/Project 1, one launch, < 300 ms),
     * which would otherwise legitimately MATCH move_loaded_set.txt's last
     * line and silently publish the fallback instead of UNOPENED. */
    OK(!loaded_set_may_retarget(0), "retarget refused at 0 ms (settle window)");
    OK(!loaded_set_may_retarget(LOADED_SET_SETTLE_MS - 1),
       "retarget still refused just inside the settle window");
    OK(loaded_set_may_retarget(LOADED_SET_SETTLE_MS),
       "retarget allowed once the settle window has elapsed");
    OK(loaded_set_may_retarget(60000), "retarget allowed well past settle");

    /* --- the identity --------------------------------------------------- */
    char u[64];
    loaded_set_unopened_uuid(u, sizeof u, 31, 7);
    OK(strcmp(u, "__pending-unopened-31-7") == 0, "unopened identity carries the index");
    OK(strncmp(u, "__pending-", 10) == 0, "unopened identity is PROVISIONAL (`__pending-`)");

    printf("PASS: loaded_set_policy (%d checks)\n", checks);
    return 0;
}
