/* tests/test_bake_post_offline.c — Bake of a clip whose track has a POST MIDI
 * FX module, OFFLINE (print_offline; seq8_bake_post.c). The host job is the
 * harness's stand-in: the module answers every note 12 higher.
 *
 *   - what goes INTO the module is what the clip plays, raw: its pitches and
 *     velocities, not the track's effects; N passes, the span's ticks, the
 *     track's slot and tempo;
 *   - the clip ends up holding effects(module(clip)): the module's notes
 *     with the track's NOTE FX on them, N passes long; the effects are reset
 *     (baked), and it is one undo step;
 *   - the MIDI delay echoes the module's output, inside the span;
 *   - nothing before the job lands: print_state 2, the clip untouched;
 *   - refusals (a drum track, no Post module, the host saying no) run nothing;
 *     Back during the job cancels it and leaves the clip; a FAILED job leaves
 *     the clip and says so. */
#include "harness.h"

static int state(hx_t *h, const char *k) {
    char b[16];
    return hx_get_param(h, k, b, sizeof b) > 0 ? atoi(b) : -1;
}
static int count(const clip_t *cl, int pitch) {
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && (pitch < 0 || cl->notes[i].pitch == pitch)) n++;
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    const int T = 1;
    seq8_track_t *tr = &inst->tracks[T];
    clip_t *cl = &tr->clips[0];

    hx_set_param(h, "t1_route", "schwung");
    inst->active_track = T;
    hx_set_param(h, "t1_launch_clip", "0");
    hx_render(h, 2);
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_8_toggle", "67 100");
    hx_set_param(h, "t1_c0_pfx_set", "noteFX_offset 2");
    hx_set_param(h, "t1_c0_pfx_set", "noteFX_velocity 10");
    hx_render(h, 2);
    HX_ASSERT(count(cl, 60) == 1 && count(cl, 67) == 1, "rig: the clip holds 60 and 67");
    const uint16_t len0 = cl->length, tps = cl->ticks_per_step;

    /* ---- refusals ---- */
    hx_set_param(h, "print_offline", "1 0 2 0");
    HX_ASSERT(state(h, "print_state") == 0 && state(h, "print_err") > 0 && hx_stub_mfo_begins() == 0,
              "a track with no Post module was baked offline");
    hx_set_param(h, "t1_fxpost", "1");
    hx_set_param(h, "print_offline", "0 0 2 0");             /* track 0: a drum track */
    HX_ASSERT(state(h, "print_state") == 0 && hx_stub_mfo_begins() == 0, "a drum track was baked offline");
    hx_stub_mfo_refuse(1);
    hx_set_param(h, "print_offline", "1 0 2 0");
    HX_ASSERT(state(h, "print_state") == 0 && state(h, "print_err") == 4, "the host's refusal was not reported");
    hx_stub_mfo_refuse(0);

    /* ---- the job: what goes in ---- */
    hx_stub_mfo_hold(1);
    hx_set_param(h, "print_offline", "1 0 2 0");
    HX_ASSERT(state(h, "print_state") == 2 && hx_stub_mfo_begins() == 1, "the job did not start");
    {
        int n = 0, slot = -1, i, ons = 0;
        float bpm = 0; uint32_t len = 0, tail = 0;
        const move_midi_fx_offline_ev_t *in = hx_stub_mfo_input(&n, &slot, &bpm, &len, &tail);
        HX_ASSERT(slot == T, "the job is not on the track's slot");
        HX_ASSERT(len == (uint32_t)len0 * tps * 2, "the job is not two passes long");
        HX_ASSERT(tail > 0 && bpm > 0, "no tail, or no tempo");
        HX_ASSERT(n == 8, "not one on and one off per note per pass");
        for (i = 0; i < n; i++) {
            if ((in[i].status & 0xF0) != 0x90) continue;
            ons++;
            HX_ASSERT(in[i].d1 == 60 || in[i].d1 == 67, "the module was given the effects' pitch, not the clip's");
            HX_ASSERT(in[i].d2 == 100, "the module was given the effects' velocity, not the clip's");
            HX_ASSERT(in[i].tick % ((uint32_t)len0 * tps) == (in[i].d1 == 60 ? 0u : 8u * tps), "a note went in off its step");
            if (i) HX_ASSERT(in[i].tick >= in[i - 1].tick, "the events are not in tick order");
        }
        HX_ASSERT(ons == 4, "not four note-ons");
    }
    hx_render(h, 4);
    HX_ASSERT(state(h, "print_state") == 2 && count(cl, 72) == 0, "the clip changed before the job landed");

    /* ---- Back cancels: the clip as it was ---- */
    hx_set_param(h, "print_cancel", "1");
    HX_ASSERT(state(h, "print_state") == 0 && hx_stub_mfo_cancels() == 1, "Back did not cancel the job");
    hx_render(h, 2);
    HX_ASSERT(count(cl, 60) == 1 && cl->length == len0, "a cancelled bake changed the clip");
    hx_stub_mfo_hold(0);

    /* ---- a FAILED job leaves the clip, and says so ---- */
    hx_stub_mfo_fail(1);
    hx_set_param(h, "print_offline", "1 0 2 0");
    hx_render(h, 1);
    HX_ASSERT(state(h, "print_state") == 0 && state(h, "print_err") >= 10, "a failed job was not reported");
    HX_ASSERT(count(cl, 60) == 1 && cl->length == len0, "a failed job changed the clip");
    hx_stub_mfo_fail(0);

    /* ---- done: effects(module(clip)), two passes, one undo step ---- */
    hx_set_param(h, "print_offline", "1 0 2 0");
    hx_render(h, 1);
    HX_ASSERT(state(h, "print_state") == 3, "the job landed but the bake did not finish");
    HX_ASSERT(cl->length == (uint16_t)(len0 * 2), "the clip is not two passes long");
    HX_ASSERT(count(cl, 74) == 2 && count(cl, 81) == 2, "the clip does not hold the module's notes with the track's effect on them (60+12+2, 67+12+2), twice");
    HX_ASSERT(count(cl, -1) == 4, "the clip holds more than the module's notes");
    {
        int i;
        for (i = 0; i < cl->note_count; i++)
            if (cl->notes[i].active) HX_ASSERT(cl->notes[i].vel == 110, "the track's velocity offset is not on the baked notes");
    }
    HX_ASSERT(cl->pfx_params.note_offset == 0 && cl->pfx_params.velocity_offset == 0, "the baked effects were left on (they would apply twice)");
    hx_set_param(h, "print_done", "1");
    HX_ASSERT(state(h, "print_state") == 0, "print_done did not clear it");
    hx_set_param(h, "undo_restore", "1");
    hx_render(h, 2);
    HX_ASSERT(count(cl, 60) == 1 && count(cl, 67) == 1 && cl->length == len0, "the bake is not one undo step");

    /* ---- the MIDI delay echoes the MODULE's notes ---- */
    hx_set_param(h, "t1_c0_pfx_set", "noteFX_offset 0");
    hx_set_param(h, "t1_delay_level", "100");
    hx_set_param(h, "t1_delay_repeats", "2");
    hx_render(h, 1);
    hx_set_param(h, "print_offline", "1 0 1 0");
    hx_render(h, 1);
    HX_ASSERT(state(h, "print_state") == 3, "rig: the delay bake did not finish");
    HX_ASSERT(count(cl, 72) >= 2 && count(cl, 60) == 0, "the delay did not echo the module's note (72), or the clip's own (60) leaked through");
    hx_set_param(h, "print_done", "1");

    hx_destroy(h);
    printf("PASS: a Post module bakes offline: raw clip in, effects(module(clip)) out, one undo step, cancel and failure leave the clip\n");
    return 0;
}
