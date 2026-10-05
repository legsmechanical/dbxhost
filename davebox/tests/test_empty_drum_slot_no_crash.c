/* tests/test_empty_drum_slot_no_crash.c — the audio-thread paths survive an
 * EMPTY active drum-clip slot.
 *
 * THE BUG THIS PINS (2026-10-04 module review): `drum_clips[c]` is legitimately
 * NULL for an empty slot (dsp/CLAUDE.md; merge_place notes a clip-copy of an
 * empty source or a state load can leave one), and the serializer, live_note_on
 * and ext_stamp_record_slot guard it — but the repeat ticks (Rpt1 and Rpt2) and
 * the record-stamp scan in on_midi dereferenced it unguarded, on the SPI
 * thread. A NULL there is a crash of the whole host.
 *
 * Reachability (checked 2026-10-04): every path that makes a track DRUM
 * allocates all its slots, and a drum clip copy refuses an empty side, so on a
 * drum track a NULL slot means a FAILED ALLOCATION. White-box: the slot is
 * emptied directly. A crash fails the test (the process dies). Writing the
 * pad half of this found a fourth unguarded site, drum_lane_note_off_imm. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM, "control: t0 is a drum track");
    int ac = (int)tr->active_clip;

    /* Rpt1 running, sync off, then the slot goes empty. */
    hx_set_param(h, "t0_drum_repeat_sync", "0");
    hx_set_param(h, "t0_drum_repeat_start", "0 3 100");
    HX_ASSERT(tr->drum_repeat_active, "control: Rpt1 active");
    /* Rpt2 on lane 1 too. */
    hx_set_param(h, "t0_drum_repeat2_lane_on", "1 100");
    hx_set_param(h, "transport", "play");

    free(tr->drum_clips[ac]);
    tr->drum_clips[ac] = NULL;

    hx_render(h, 400);   /* many repeat periods: every fire point is crossed */
    printf("  ok   — Rpt1 + Rpt2 ticks over an empty slot\n");

    /* The pad paths: repeats off (an active repeat swallows a single hit),
     * the DSP owning the pads, track 1 active. */
    hx_set_param(h, "t0_drum_repeat_stop", "1");
    hx_set_param(h, "t0_drum_repeat2_lane_off", "1");
    inst->dsp_inbound_enabled = 1;
    inst->active_track = 0;
    inst->drum_right_inert = 0;
    inst->pad_dispatch_muted = 0;
    inst->pad_note_map[0][0] = 36;   /* left-half pad 0 = a lane note */
    tr->recording = 1;

    /* Left-half pad while recording: on_midi's record-stamp scan. */
    { uint8_t on[3] = { 0x90, 68, 100 }; hx_send_midi(h, on, 3, 0); }
    hx_render(h, 4);
    { uint8_t off[3] = { 0x80, 68, 0 }; hx_send_midi(h, off, 3, 0); }
    printf("  ok   — a recorded lane pad over an empty slot\n");

    /* Right-half pad: the velocity-zone press. */
    { uint8_t on[3] = { 0x90, 72, 100 }; hx_send_midi(h, on, 3, 0); }
    hx_render(h, 4);
    { uint8_t off[3] = { 0x80, 72, 0 }; hx_send_midi(h, off, 3, 0); }
    tr->recording = 0;
    printf("  ok   — a velocity-zone pad over an empty slot\n");

    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_destroy(h);
    printf("PASS: empty_drum_slot_no_crash\n");
    return 0;
}
