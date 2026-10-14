/* tests/test_print_bake.c — PRINT: Bake of a clip whose track has an active
 * POST MIDI FX module (Josh, 2026-10-14: "is there no way to make it so they
 * CAN be baked?").
 *
 * The offline bake cannot run a module, so a print plays the clip for real —
 * a solo Live Merge of the track — and records what the MODULE put out (the
 * slot's hand-back), not this engine's own output (which is before the
 * module). It ends itself after N passes, to the tick, writes the take over
 * the clip, and stops the transport. Here the module is a stand-in: every
 * note the engine sends into slot 1 comes back with a third on top.
 *
 *   - refused while playing, or for a clip that is not the track's active one;
 *   - armed → a count-in → printing → done (state 1 → 2 → 3);
 *   - on a Schwung track the module's output is sent on to the instrument
 *     DIRECT, so the print is heard;
 *   - the clip ends up holding the module's output — root AND third — and
 *     nothing the engine sent before the module twice;
 *   - the take is exactly N passes long, and the transport has stopped;
 *   - Back (print_cancel) leaves the clip as it was.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static int state(hx_t *h) {
    char b[16];
    if (hx_get_param(h, "print_state", b, sizeof b) <= 0) return -1;
    return atoi(b);
}
static int clip_has(const clip_t *cl, uint8_t pitch) {
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].pitch == pitch) n++;
    return n;
}
/* Render block by block; every note the engine sends into slot `slot` comes
 * back from the "module" with a third on top. Returns blocks rendered. */
static int run_module(hx_t *h, int slot, int max_blocks, int stop_at_state) {
    int b;
    for (b = 0; b < max_blocks; b++) {
        hx_clear_capture(h);
        hx_render(h, 1);
        int i, n = hx_stub_event_count();
        for (i = 0; i < n; i++) {
            const hx_midi_event *e = hx_stub_event(i);
            uint8_t st = e->bytes[1], ty = st & 0xF0;
            if (e->kind != HX_MIDI_INTERNAL || e->slot != slot) continue;
            if (ty != 0x90 && ty != 0x80) continue;
            const uint8_t a[3] = { st, e->bytes[2], e->bytes[3] };
            const uint8_t c[3] = { st, (uint8_t)(e->bytes[2] + 4), e->bytes[3] };
            move_plugin_slot_midi_v1(h->inst, slot, a, 3);
            move_plugin_slot_midi_v1(h->inst, slot, c, 3);
        }
        if (stop_at_state >= 0 && state(h) == stop_at_state) return b + 1;
    }
    return b;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    const int T = 1;
    seq8_track_t *tr = &inst->tracks[T];

    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(tr->pfx.slot == T && tr->pad_mode != PAD_MODE_DRUM, "rig: melodic Schwung track 1, slot 1");
    inst->active_track = T;
    hx_set_param(h, "t1_launch_clip", "0");
    hx_render(h, 2);
    HX_ASSERT(tr->active_clip == 0, "rig: clip 0 is active");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_8_toggle", "67 100");
    hx_render(h, 2);
    clip_t *cl = &tr->clips[0];
    HX_ASSERT(clip_has(cl, 60) == 1 && clip_has(cl, 67) == 1 && clip_has(cl, 64) == 0, "rig: the clip holds 60 and 67");
    const uint16_t len0 = cl->length;

    /* ---- refusals ---- */
    hx_set_param(h, "print_arm", "1 3 1");
    HX_ASSERT(state(h) == 0, "a clip that is not the active one is refused");
    hx_set_param(h, "transport", "play");
    hx_render(h, 4);
    hx_set_param(h, "print_arm", "1 0 1");
    HX_ASSERT(state(h) == 0, "refused while playing");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- Back during the count-in leaves everything as it was ---- */
    hx_set_param(h, "print_arm", "1 0 1");
    HX_ASSERT(state(h) == 1, "armed");
    hx_render(h, 20);
    hx_set_param(h, "print_cancel", "1");
    hx_render(h, 4);
    HX_ASSERT(state(h) == 0 && !inst->playing && inst->merge_state == MERGE_STATE_IDLE, "cancel: idle and stopped");
    HX_ASSERT(clip_has(cl, 60) == 1 && clip_has(cl, 64) == 0, "cancel: the clip is untouched");

    /* ---- the print ---- */
    hx_set_param(h, "print_arm", "1 0 2");
    HX_ASSERT(state(h) == 1, "armed again");
    {
        int b = run_module(h, T, 3000, 2);
        HX_ASSERT(state(h) == 2, "never left the count-in");
        HX_ASSERT(b > 100, "printing began without a count-in");
    }
    /* heard: the module's output goes on to the instrument DIRECT */
    {
        int i, direct = 0, b;
        for (b = 0; b < 3000 && state(h) == 2; b++) {
            hx_clear_capture(h);
            hx_render(h, 1);
            int n = hx_stub_event_count();
            for (i = 0; i < n; i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind == HX_MIDI_INTERNAL && e->slot == T && ((e->bytes[1] & 0xF0) == 0x90 || (e->bytes[1] & 0xF0) == 0x80)) {
                    const uint8_t a[3] = { e->bytes[1], e->bytes[2], e->bytes[3] };
                    const uint8_t c[3] = { e->bytes[1], (uint8_t)(e->bytes[2] + 4), e->bytes[3] };
                    move_plugin_slot_midi_v1(h->inst, T, a, 3);
                    move_plugin_slot_midi_v1(h->inst, T, c, 3);
                }
            }
            for (i = 0; i < hx_stub_event_count(); i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind == HX_MIDI_DIRECT && e->slot == T && (e->bytes[1] & 0xF0) == 0x90) direct++;
            }
        }
        HX_ASSERT(direct >= 4, "the module's output was not sent on to the instrument (the print would be silent)");
    }
    HX_ASSERT(state(h) == 3, "the print never finished");
    HX_ASSERT(!inst->playing, "the transport is still running after the print");
    HX_ASSERT(cl->length == (uint16_t)(len0 * 2), "the take is not exactly two passes long");
    HX_ASSERT(clip_has(cl, 64) == 2 && clip_has(cl, 71) == 2, "the module's thirds are not in the clip, once per pass");
    HX_ASSERT(clip_has(cl, 60) == 2 && clip_has(cl, 67) == 2, "the roots are not in the clip exactly once per pass (the engine's own output was captured too?)");
    hx_set_param(h, "print_done", "1");
    HX_ASSERT(state(h) == 0, "print_done did not clear the state");

    hx_destroy(h);
    printf("PASS: PRINT records the module's output for N passes, sends it on, ends itself, and cancels clean\n");
    return 0;
}
