/* Unit test for edit-CC (Undo/Copy/Delete) press/release routing —
 * shadow_edit_cc_route() in shadow_constants.h.
 *
 * The property under test is NOT "a claimed button goes to the module". It is
 * that press and release ALWAYS go to the SAME consumer, even when the claim
 * (capabilities.claims_edit_ccs) flips while the button is physically held.
 *
 * That case is the reason the helper exists and is awkward to produce by hand on
 * the device — you would have to change what is on screen mid-press. Getting it
 * wrong is silent and nasty in both directions:
 *   - claim engages mid-hold  -> Move saw the press, never the release
 *                                => Move believes the button is still down.
 *   - claim drops mid-hold    -> Move never saw the press, then gets a release
 *                                => Move acts on an orphan release.
 *
 * Build/run: bash tests/host/test_edit_cc_route.sh
 */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include "shadow_constants.h"

static int fails = 0;
#define CHECK(cond, msg) do { if (!(cond)) { fprintf(stderr, "FAIL: %s\n", msg); fails++; } } while (0)

#define PRESS   1
#define RELEASE 0
#define MODULE  1   /* routed to the module: withheld from Move, forwarded to shadow_ui */
#define MOVE    0   /* routed to Move firmware */

int main(void) {
    /* ── Steady state: unclaimed ── Move owns both edges. This is the default for
     * every module that does not declare the capability, and the regression that
     * got upstream PR #154 reverted (it stole Move's native Undo). */
    {
        uint8_t latch = 0;
        CHECK(shadow_edit_cc_route(PRESS,   0, &latch) == MOVE, "unclaimed: press -> Move");
        CHECK(shadow_edit_cc_route(RELEASE, 0, &latch) == MOVE, "unclaimed: release -> Move");
    }

    /* ── Steady state: claimed ── the module owns both edges. */
    {
        uint8_t latch = 0;
        CHECK(shadow_edit_cc_route(PRESS,   1, &latch) == MODULE, "claimed: press -> module");
        CHECK(shadow_edit_cc_route(RELEASE, 1, &latch) == MODULE, "claimed: release -> module");
    }

    /* ── Claim ENGAGES mid-hold ── pressed while unclaimed, so Move already saw
     * the press. The release MUST still go to Move, or Move is left believing the
     * button is held down. */
    {
        uint8_t latch = 0;
        CHECK(shadow_edit_cc_route(PRESS,   0, &latch) == MOVE, "engage mid-hold: press -> Move");
        CHECK(shadow_edit_cc_route(RELEASE, 1, &latch) == MOVE,
              "engage mid-hold: release MUST follow the press to Move");
    }

    /* ── Claim DROPS mid-hold ── pressed while claimed, so Move never saw the
     * press. The release MUST NOT leak to Move as an orphan. */
    {
        uint8_t latch = 0;
        CHECK(shadow_edit_cc_route(PRESS,   1, &latch) == MODULE, "drop mid-hold: press -> module");
        CHECK(shadow_edit_cc_route(RELEASE, 0, &latch) == MODULE,
              "drop mid-hold: release MUST follow the press to the module");
    }

    /* ── The next press RE-ARMS ── a latch left set by a claimed hold must not
     * capture the following press once the claim is gone. This is what makes it
     * safe never to clear the latch on release. */
    {
        uint8_t latch = 0;
        shadow_edit_cc_route(PRESS,   1, &latch);           /* claimed hold */
        shadow_edit_cc_route(RELEASE, 1, &latch);
        CHECK(shadow_edit_cc_route(PRESS, 0, &latch) == MOVE,
              "re-arm: next press after claim released goes to Move");
        CHECK(shadow_edit_cc_route(RELEASE, 0, &latch) == MOVE, "re-arm: its release too");
    }

    /* ── Read-only query ── the forward-to-shadow_ui site runs LATER in the same
     * SPI frame and must observe the decision the filter already made, without
     * changing it. is_press=0 is that query, and it must never mutate the latch
     * regardless of the `claimed` argument passed. */
    {
        uint8_t latch = 0;
        shadow_edit_cc_route(PRESS, 1, &latch);             /* module owns this press */
        CHECK(shadow_edit_cc_route(0, 0, &latch) == MODULE, "query: sees the latched press");
        CHECK(latch == 1, "query with claimed=0 must NOT clear the latch");
        CHECK(shadow_edit_cc_route(0, 1, &latch) == MODULE, "query is repeatable");
        CHECK(latch == 1, "query with claimed=1 must NOT set the latch either");
    }

    /* ── Per-button independence ── Undo/Copy/Delete each carry their own latch
     * (the shim indexes them 0/1/2 via EDIT_CC_INDEX), so holding one across a
     * claim change cannot reroute another. */
    {
        uint8_t latch[3] = { 0, 0, 0 };
        shadow_edit_cc_route(PRESS, 1, &latch[1]);          /* Copy held, claimed */
        CHECK(shadow_edit_cc_route(PRESS, 0, &latch[2]) == MOVE,
              "independence: Delete pressed unclaimed while Copy is held -> Move");
        CHECK(shadow_edit_cc_route(RELEASE, 0, &latch[1]) == MODULE,
              "independence: Copy's release still follows Copy's own latch");
    }

    if (fails) { fprintf(stderr, "%d check(s) FAILED\n", fails); return 1; }
    printf("test_edit_cc_route: ALL PASS\n");
    return 0;
}
