/* tests/test_edits_mark_dirty.c — persisted edits schedule a save.
 *
 * THE BUG THIS PINS (2026-10-04 module review): these handlers change state
 * that seq8_state.c serializes but never set state_dirty, so the deferred save
 * (JS polls the flag) never ran for them. The edit lived only in memory until a
 * suspend, a project switch, or some OTHER edit dirtied the state; a power-off
 * or kill lost it. Their drum / remote twins already marked it.
 *
 *   - the play-effects catch-all (every NoteFX/Harm/Delay/Quantize/SeqArp knob)
 *   - clip_copy (row_copy, clip_cut, drum_clip_copy all marked it)
 *   - tN_clip_length, tN_clock_shift, tN_nudge, tN_transpose
 *
 * Track 2 (t1) is used: track 1 (t0) is a DRUM track by default. */
#include "harness.h"

static seq8_instance_t *I;

static void expect_dirty(hx_t *h, const char *key, const char *val) {
    I->state_dirty = 0;
    hx_set_param(h, key, val);
    if (I->state_dirty != 1) {
        fprintf(stderr, "FAIL: %s=%s did not set state_dirty\n", key, val);
        exit(1);
    }
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    I = (seq8_instance_t *)h->inst;
    HX_ASSERT(I->tracks[1].pad_mode != PAD_MODE_DRUM, "control: t1 is melodic");

    /* Control: a read-only path leaves the flag alone, so the helper can fail. */
    I->state_dirty = 0;
    { char b[64]; hx_get_param(h, "state_dirty", b, (int)sizeof(b)); }
    HX_ASSERT(I->state_dirty == 0, "control: a get_param does not dirty the state");

    /* Give the clip notes, so clock_shift / nudge have something to move. */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");

    expect_dirty(h, "t1_noteFX_octave", "2");
    HX_ASSERT(I->tracks[1].clips[I->tracks[1].active_clip].pfx_params.octave_shift == 2,
              "control: the knob reached the clip's pfx params");
    expect_dirty(h, "t1_clip_length", "8");
    HX_ASSERT(I->tracks[1].clips[I->tracks[1].active_clip].length == 8, "control: length is 8");
    expect_dirty(h, "t1_clock_shift", "1");
    expect_dirty(h, "t1_nudge", "1");
    expect_dirty(h, "t1_transpose", "3");
    HX_ASSERT(I->tracks[1].transpose == 3, "control: transpose is 3");
    expect_dirty(h, "clip_copy", "1 0 1 1");

    /* ...and what the flag schedules carries the edit. */
    {
        static char buf[262144];
        I->state_dirty = 1;
        int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
        HX_ASSERT(n > 0, "state_full returned nothing");
        HX_ASSERT(strstr(buf, "\"t1_tr\":3") != NULL, "serialized state has t1's transpose");
    }

    hx_destroy(h);
    printf("PASS: edits_mark_dirty\n");
    return 0;
}
