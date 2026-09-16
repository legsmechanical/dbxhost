/*
 * Host-side unit test for shadow_loaded_set_policy.h — the identity state
 * machine. Rewritten 2026-09-16 with the machine itself; the previous version
 * tested a three-window string verdict that no longer exists.
 *
 * The one rule everything here exists to defend: **OPEN is always
 * Move-confirmed** (Josh, 2026-09-15: "retry only"). No request, no guess and
 * no user choice may become `open`. So the tests are written as attempts to
 * BREAK that — the interesting cases are all the ways a not-quite-confirmation
 * could be mistaken for one:
 *
 *   - a line that names exactly what we asked for, but was written BEFORE we
 *     asked (counter at or below n0). This is the stale-confirmation trap, and
 *     it is the case a uuid comparison alone physically cannot see.
 *   - `default` arriving while a request is outstanding — a positive statement
 *     that Move made its own set, not an absence.
 *   - no answer at all, which is UNKNOWN and must never read as `default`: a
 *     rule that treated silence as failure would raise a dialog on every boot
 *     where the reader lagged.
 *   - the timeout firing with a request armed (unopened, carrying the REQUEST's
 *     index so Retry lands on the pad the user pressed) versus with none
 *     (unknown).
 */
#include <stdio.h>
#include <string.h>
#include "shadow_loaded_set_policy.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

#define X "aaaaaaaa-1111-4bbb-8ccc-000000000001"
#define Y "bbbbbbbb-2222-4ccc-8ddd-000000000002"

/* A request for X at pad 7, armed when the reader's counter was n0. */
static void req(loaded_set_input_t *in, int n0)
{
    memset(in, 0, sizeof(*in));
    in->have_request = 1;
    snprintf(in->req_uuid, sizeof(in->req_uuid), "%s", X);
    snprintf(in->req_name, sizeof(in->req_name), "%s", "Project 8");
    in->req_index = 7;
    in->req_n0 = n0;
    in->timeout_ms = LOADED_SET_REQUEST_TIMEOUT_MS;
}

static void noreq(loaded_set_input_t *in)
{
    memset(in, 0, sizeof(*in));
    in->req_index = -1;
    in->timeout_ms = LOADED_SET_REQUEST_TIMEOUT_MS;
}

int main(void) {
    loaded_set_input_t in;
    loaded_set_record_t r;

    /* ---- a request, confirmed ------------------------------------------ */
    req(&in, 3);
    in.line_n = 4; in.line_uuid = X; in.line_name = "Project 8"; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_OPEN, "a FRESH line naming the requested set -> OPEN");
    OK(strcmp(r.uuid, X) == 0, "...carrying that uuid");
    OK(r.index == 7, "...and the request's index");

    /* ---- the stale-confirmation trap: the heart of the ruling ---------- */
    req(&in, 4);
    in.line_n = 4; in.line_uuid = X; in.line_name = "Project 8"; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_PENDING,
       "⭑ a line naming the requested set but NOT past n0 is NOT confirmation (still PENDING)");
    req(&in, 9);
    in.line_n = 4; in.line_uuid = X; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_PENDING,
       "⭑ ...nor is an older line still sitting in the file");
    /* ...and that same stale line must NOT rescue the request at the timeout */
    req(&in, 4);
    in.line_n = 4; in.line_uuid = X; in.elapsed_ms = LOADED_SET_REQUEST_TIMEOUT_MS;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_UNOPENED,
       "⭑⭑ a stale line does not become confirmation when the timeout fires");

    /* ---- a request, refused -------------------------------------------- */
    req(&in, 1);
    in.line_n = 2; in.line_uuid = Y; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_UNOPENED,
       "a fresh line naming a DIFFERENT set -> NONE(unopened)");
    OK(r.index == 7, "...carrying the REQUEST's index, so Retry lands on the pad pressed");
    OK(r.uuid[0] == '\0', "...and NO identity (nothing may be saved under it)");

    req(&in, 1);
    in.line_n = 2; in.line_uuid = "default"; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_UNOPENED,
       "`default` while a request is outstanding -> NONE(unopened), not `default`");

    /* ---- a request, silence -------------------------------------------- */
    req(&in, 1);
    in.line_n = 0; in.line_uuid = NULL; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_PENDING, "silence before the timeout is PENDING, never a failure");
    OK(r.index == 7 && strcmp(r.name, "Project 8") == 0,
       "...and PENDING still names what is being waited for (the LOADING screen)");
    in.elapsed_ms = LOADED_SET_REQUEST_TIMEOUT_MS;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_UNOPENED,
       "silence past the timeout, with a request -> NONE(unopened)");

    /* ---- no request: Move moving on its own ---------------------------- */
    noreq(&in);
    in.line_n = 1; in.line_uuid = X; in.line_name = "Project 8"; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_OPEN && strcmp(r.uuid, X) == 0,
       "no request + a line naming a set -> OPEN (a boot, or Move moved itself)");
    OK(strcmp(r.name, "Project 8") == 0, "...with Move's own name for it");

    noreq(&in);
    in.line_n = 1; in.line_uuid = "default"; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_DEFAULT,
       "no request + `default` -> NONE(default): nobody asked, Move minted one");

    noreq(&in);
    in.line_n = 0; in.line_uuid = NULL; in.elapsed_ms = 200;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_PENDING, "no request + silence before the timeout -> PENDING");
    in.elapsed_ms = LOADED_SET_REQUEST_TIMEOUT_MS;
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_NONE && r.reason == LOADED_SET_REASON_UNKNOWN,
       "⚠ no request + silence past the timeout -> NONE(UNKNOWN), never `default`");

    /* ---- absence is never a uuid --------------------------------------- */
    noreq(&in);
    in.line_n = 0; in.line_uuid = X; in.elapsed_ms = 200;   /* n == 0: nothing said */
    loaded_set_step(&in, &r);
    OK(r.state == LOADED_SET_PENDING,
       "⚠ CONTROL: a uuid with counter 0 is NOT a line — the counter gates it");

    /* ---- the wire spellings, pinned so C and JS cannot drift ----------- */
    OK(strcmp(loaded_set_state_str(LOADED_SET_OPEN), "open") == 0, "state spelling: open");
    OK(strcmp(loaded_set_state_str(LOADED_SET_NONE), "none") == 0, "state spelling: none");
    OK(strcmp(loaded_set_state_str(LOADED_SET_PENDING), "pending") == 0, "state spelling: pending");
    OK(strcmp(loaded_set_reason_str(LOADED_SET_REASON_UNOPENED), "unopened") == 0, "reason: unopened");
    OK(strcmp(loaded_set_reason_str(LOADED_SET_REASON_DEFAULT), "default") == 0, "reason: default");
    OK(strcmp(loaded_set_reason_str(LOADED_SET_REASON_UNKNOWN), "unknown") == 0, "reason: unknown");
    OK(loaded_set_reason_str(LOADED_SET_REASON_NONE)[0] == '\0', "reason: none is empty");

    printf("PASS: loaded_set_policy (%d checks)\n", checks);
    return 0;
}
