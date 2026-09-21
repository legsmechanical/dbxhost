/*
 * Host-side unit test for shadow_set_request.h — dAVEBOx's REQUEST record.
 *
 * WHY THIS FILE EXISTS. A project created this session bounced straight back
 * to the project picker on its FIRST load, every time, while every later load
 * worked (device, 2026-09-21). Move had opened exactly the right project; the
 * host simply never confirmed it, because on the RELAUNCH route the request is
 * consumed by the shim that is about to die, so the next session armed
 * nothing. The fix carries the record across the restart and states the
 * counter it is measured against EXPLICITLY — and this file is the part of
 * that fix that a bench can actually run.
 *
 * ⚠ The cases below feed the parser the EXACT BYTES each writer produces:
 *   · dAVEBOx:   uuid \n index \n name \n          (_pppWriteRequest)
 *   · launch.sh: the same, plus a line `0`         (install_relaunch_request)
 * A fixture that invents a plausible-looking record instead is how the last
 * round of this stayed green beside a broken device — the fixture was testing
 * an identity shape the device never produces.
 */
#include <stdio.h>
#include <string.h>
#include "shadow_set_request.h"
#include "shadow_loaded_set_policy.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

static const char *SLOT = "5107b000-0000-4000-8000-000000000001";

int main(void)
{
    identity_request_t r;
    char buf[512];

    printf("the request record, as each writer actually writes it:\n");

    /* 1. dAVEBOx's own bytes — the in-place route. No counter in the record,
     *    so the arm must sample, exactly as it always has. */
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n", SLOT);
    OK(identity_request_parse(buf, &r), "dAVEBOx's record parses");
    OK(strcmp(r.uuid, SLOT) == 0, "...uuid is the SLOT entry, intact");
    OK(r.index == 1, "...index is the slot position");
    OK(strcmp(r.name, "Project 8") == 0, "...name survives the trailing newline");
    OK(r.have_n0 == 0, "...and carries NO counter, so the arm samples");

    /* 2. What launch.sh installs across a relaunch: the same three lines plus
     *    an explicit 0. The name must NOT swallow the counter line. */
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n0\n", SLOT);
    OK(identity_request_parse(buf, &r), "the carried record parses");
    OK(strcmp(r.name, "Project 8") == 0,
       "...the name stops at its own newline, not at the counter");
    OK(r.have_n0 == 1 && r.n0 == 0, "...and carries an EXPLICIT n0 of 0");

    /* 3. Garbage on line 4 must degrade to sampling — the old behaviour —
     *    rather than to a confident wrong number. */
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\nx\n", SLOT);
    OK(identity_request_parse(buf, &r) && r.have_n0 == 0,
       "a non-numeric line 4 is ignored, not guessed at");
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n12x\n", SLOT);
    OK(identity_request_parse(buf, &r) && r.have_n0 == 0,
       "...and so is a half-numeric one");

    /* 4. Which counter wins. */
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n0\n", SLOT);
    identity_request_parse(buf, &r);
    OK(identity_request_arm_n0(&r, 1) == 0,
       "an explicit n0 BEATS the sampled one");
    snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n", SLOT);
    identity_request_parse(buf, &r);
    OK(identity_request_arm_n0(&r, 7) == 7,
       "without one, the sampled counter is used unchanged");

    /* 5. ⭐⭐ THE BUG ITSELF, END TO END THROUGH THE MACHINE.
     *
     * The relaunch shape: the launcher installed the record with n0 = 0 while
     * Move was down, and Move's first load of this run is line 1 naming the
     * slot we asked for. That must be OPEN.
     *
     * Then the SAME line, armed the way the new session would have armed it
     * without the fix — its first poll sleeps 200 ms while Move logs at
     * ~0.18 s, so it samples n0 = 1 against line_n = 1. That must NOT be open,
     * and the fact that it is merely PENDING (heading for an 8 s `unopened`)
     * is the silent failure this whole change exists to remove. */
    {
        loaded_set_input_t in;
        loaded_set_record_t out;

        snprintf(buf, sizeof(buf), "%s\n1\nProject 8\n0\n", SLOT);
        identity_request_parse(buf, &r);

        memset(&in, 0, sizeof(in));
        in.have_request = 1;
        snprintf(in.req_uuid, sizeof(in.req_uuid), "%s", r.uuid);
        snprintf(in.req_name, sizeof(in.req_name), "%s", r.name);
        in.req_index = r.index;
        in.line_n = 1;
        in.line_uuid = SLOT;
        in.line_name = "Project 8";
        in.elapsed_ms = 300;
        in.timeout_ms = LOADED_SET_REQUEST_TIMEOUT_MS;

        in.req_n0 = identity_request_arm_n0(&r, 1);   /* explicit 0 */
        memset(&out, 0, sizeof(out));
        loaded_set_step(&in, &out);
        OK(out.state == LOADED_SET_OPEN,
           "carried across the relaunch, Move's first line CONFIRMS the project");
        OK(strcmp(out.uuid, SLOT) == 0, "...and the identity is the slot entry");

        in.req_n0 = 1;                                /* what sampling would give */
        memset(&out, 0, sizeof(out));
        loaded_set_step(&in, &out);
        OK(out.state == LOADED_SET_PENDING,
           "CONTROL: a sampled counter refuses that same line — the race, named");
    }

    printf("PASS: test_set_request (%d checks)\n", checks);
    return 0;
}
