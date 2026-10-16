/* tests/test_fx_post_release.c — what a POST MIDI FX module SOUNDS is closed
 * where it sounds (2026-10-15 review of the module-first change).
 *
 * The module's output is the track's own output, but its notes' records are
 * wiped by a stop, a switch-off and a route change without a note-off, and a
 * release path that walks the track's records used to send a note the module
 * ALSO held raw back into the module instead of closing it. Every case below
 * left a note on at the destination before the fix; each has a control that
 * shows the path closes a plain track's note:
 *
 *   - transport stop mid-gate on a MOVE track (Move gets no CC sweep);
 *   - switching Post off (the UI writes it on every Position change and on
 *     [ none ]): closed at the synth, and its pitch is playable again;
 *   - the looper engaging over a held pad whose pitch the module returns;
 *   - a route change: closed at the OLD destination, not the new one;
 *   - a drum note-off finds the lane its note-on played on, though the lane
 *     map changed in between;
 *   - a project load closes what the old project had in the module.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static int seen(hx_midi_kind k, uint8_t status, uint8_t d1) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == k && e->bytes[1] == status && e->bytes[2] == d1) n++;
    }
    return n;
}
/* The stand-in module: every note sent into `slot` comes back `up` higher. */
static void answer(hx_t *h, int slot, int up) {
    uint8_t q[256][3];
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count() && n < 256; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        const uint8_t ty = e->bytes[1] & 0xF0;
        if (e->kind != HX_MIDI_INTERNAL || e->slot != slot || (ty != 0x90 && ty != 0x80)) continue;
        q[n][0] = e->bytes[1]; q[n][1] = (uint8_t)(e->bytes[2] + up); q[n][2] = e->bytes[3];
        n++;
    }
    for (i = 0; i < n; i++) move_plugin_slot_midi_v1(h->inst, slot, q[i], 3);
}
static int bal[128];
static void tally(hx_midi_kind k) {
    int i;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        const uint8_t ty = e->bytes[1] & 0xF0;
        if (e->kind != k) continue;
        if (ty == 0x90 && e->bytes[3] > 0) bal[e->bytes[2]]++;
        else if (ty == 0x80 || ty == 0x90) bal[e->bytes[2]]--;
    }
}
/* render n blocks, the module answering, tallying kind k */
static void run(hx_t *h, int slot, int up, hx_midi_kind k, int n, int module) {
    int i;
    for (i = 0; i < n; i++) {
        hx_clear_capture(h);
        hx_render(h, 1);
        if (module) answer(h, slot, up);
        tally(k);
    }
}

/* ---- 1. transport stop mid-gate on a Move track ---- */
static int stop_on_move(int fxpost) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = I(h);
    const int M = 2;
    seq8_track_t *mt = &inst->tracks[M];
    hx_set_param(h, "t2_route", "move");
    hx_set_param(h, "t2_channel", "3");
    if (fxpost) hx_set_param(h, "t2_fxpost", "1");
    inst->active_track = M;
    hx_set_param(h, "t2_launch_clip", "0");
    hx_render(h, 2);
    hx_set_param(h, "t2_c0_step_0_toggle", "48 100");
    hx_render(h, 2);
    const uint8_t MC = (uint8_t)(mt->channel & 0x0F);
    const uint8_t P = fxpost ? 55 : 48;
    memset(bal, 0, sizeof bal);
    hx_set_param(h, "transport", "play");
    {
        int b, got = 0;
        for (b = 0; b < 3000 && !got; b++) {
            hx_clear_capture(h); hx_render(h, 1);
            if (fxpost) answer(h, M, 7);
            tally(HX_MIDI_INJECT);
            if (seen(HX_MIDI_INJECT, (uint8_t)(0x90 | MC), P)) got = 1;
        }
        HX_ASSERT(got, "rig: the note never sounded at Move");
    }
    hx_clear_capture(h);
    hx_set_param(h, "transport", "stop");          /* the gate is still running */
    tally(HX_MIDI_INJECT);
    run(h, M, 7, HX_MIDI_INJECT, 600, fxpost);
    const int r = bal[P];
    HX_ASSERT(mt->post.held[48] == 0, "the raw note is still in the module after stop");
    hx_destroy(h);
    return r;
}

int main(void) {
    char buf[32];

    HX_ASSERT(stop_on_move(0) == 0, "control: a plain Move track leaves its note on at stop");
    HX_ASSERT(stop_on_move(1) == 0, "stop on a Move track left the module's output sounding at Move");

    /* ---- 2. switching Post off closes the module's output at the synth ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = I(h);
        const int T = 1;
        seq8_track_t *tr = &inst->tracks[T];
        hx_set_param(h, "t1_route", "schwung");
        hx_set_param(h, "t1_fxpost", "1");
        inst->active_track = T;
        hx_render(h, 2);
        const uint8_t CH = (uint8_t)(tr->channel & 0x0F);
        hx_clear_capture(h);
        hx_set_param(h, "t1_live_notes", "eon 60 100");
        hx_render(h, 1);
        answer(h, T, 7);
        HX_ASSERT(seen(HX_MIDI_DIRECT, (uint8_t)(0x90 | CH), 67) == 1, "rig: the module's output at the synth");
        hx_clear_capture(h);
        hx_set_param(h, "t1_fxpost", "0");
        hx_render(h, 1);
        answer(h, T, 7);                            /* the module's own late off */
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INTERNAL, (uint8_t)(0x80 | CH), 60) == 1, "switching off left the raw note in the module");
        HX_ASSERT(seen(HX_MIDI_DIRECT, (uint8_t)(0x80 | CH), 67) == 1, "switching off left the module's output sounding at the synth");
        HX_ASSERT(tr->pfx.pitch_refcount[67] == 0, "switching off left the output pitch counted (its next note would be swallowed)");
        hx_set_param(h, "t1_live_notes", "eoff 60");
        hx_render(h, 1);
        hx_clear_capture(h);
        hx_set_param(h, "t1_live_notes", "eon 67 100");   /* now plays straight through */
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INTERNAL, (uint8_t)(0x90 | CH), 67) == 1, "after switching off, the pitch the module had sounding is dead");
        hx_set_param(h, "t1_live_notes", "eoff 67");
        hx_render(h, 1);
        hx_destroy(h);
    }

    /* ---- 3. the looper engaging over a held pad the module returns as-is ---- */
    {
        int fxpost;
        for (fxpost = 0; fxpost < 2; fxpost++) {
            hx_t *h = hx_create(NULL);
            seq8_instance_t *inst = I(h);
            const int T = 1;
            seq8_track_t *tr = &inst->tracks[T];
            const hx_midi_kind K = fxpost ? HX_MIDI_DIRECT : HX_MIDI_INTERNAL;
            int i;
            hx_set_param(h, "t1_route", "schwung");
            hx_set_param(h, "t1_track_looper", "1");
            if (fxpost) hx_set_param(h, "t1_fxpost", "1");
            inst->active_track = T;
            hx_render(h, 4);
            memset(bal, 0, sizeof bal);
            hx_clear_capture(h);
            hx_set_param(h, "t1_live_notes", "eon 60 100");
            hx_render(h, 1);
            if (fxpost) answer(h, T, 0);            /* a passthrough: 60 comes back as 60 */
            tally(K);
            HX_ASSERT(tr->pfx.active_notes[60].active, "rig: no record of the sounding note");
            if (fxpost) HX_ASSERT(tr->post.held[60], "rig: the raw note is not in the module");
            hx_set_param(h, "looper_sync", "0");
            for (i = 0; i < 200 && (inst->arp_master_tick % TICKS_PER_STEP) != TICKS_PER_STEP - 1; i++)
                run(h, T, 0, K, 1, fxpost);
            hx_set_param(h, "looper_arm", "48");
            for (i = 0; i < 400 && inst->looper_state != LOOPER_STATE_LOOPING; i++)
                run(h, T, 0, K, 1, fxpost);
            HX_ASSERT(inst->looper_state == LOOPER_STATE_LOOPING, "rig: never looping");
            run(h, T, 0, K, 300, fxpost);
            HX_ASSERT(bal[60] == 0, fxpost ? "the looper left the module's returned note sounding"
                                           : "control: the looper left a plain track's note sounding");
            HX_ASSERT(tr->pfx.pitch_refcount[60] == 0, "the looper left the pitch counted (its replays would be dropped)");
            hx_set_param(h, "t1_live_notes", "eoff 60");
            run(h, T, 0, K, 50, fxpost);
            HX_ASSERT(bal[60] == 0, "a note was left on after the pad was released");
            hx_destroy(h);
        }
    }

    /* ---- 4. a route change closes it at the OLD destination ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = I(h);
        const int M = 2;
        seq8_track_t *mt = &inst->tracks[M];
        hx_set_param(h, "t2_route", "move");
        hx_set_param(h, "t2_channel", "3");
        hx_set_param(h, "t2_fxpost", "1");
        inst->active_track = M;
        hx_render(h, 2);
        const uint8_t MC = (uint8_t)(mt->channel & 0x0F);
        hx_clear_capture(h);
        hx_set_param(h, "t2_live_notes", "eon 50 100");
        hx_render(h, 1);
        answer(h, M, 7);
        HX_ASSERT(seen(HX_MIDI_INJECT, (uint8_t)(0x90 | MC), 57) == 1, "rig: the module's output at Move");
        hx_clear_capture(h);
        hx_set_param(h, "t2_route", "external");
        hx_render(h, 1);
        answer(h, M, 7);
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INJECT, (uint8_t)(0x80 | MC), 57) == 1, "a route change left the module's output sounding at Move");
        HX_ASSERT(seen(HX_MIDI_EXTERNAL, (uint8_t)(0x80 | MC), 57) == 0, "a route change sent the off to the NEW destination");
        hx_set_param(h, "t2_live_notes", "eoff 50");
        hx_render(h, 1);
        hx_destroy(h);
    }

    /* ---- 5. a drum note-off finds the lane its note-on played on ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = I(h);
        seq8_track_t *dt = &inst->tracks[0];
        HX_ASSERT(dt->pad_mode == PAD_MODE_DRUM, "rig: track 0 is a drum track");
        hx_set_param(h, "t0_route", "schwung");
        hx_set_param(h, "t0_fxpost", "1");
        inst->active_track = 0;
        hx_render(h, 2);
        drum_clip_t *dc = dt->drum_clips[dt->active_clip];
        const uint8_t n2 = dc->lanes[2].midi_note, DC = (uint8_t)(dt->channel & 0x0F);
        const uint8_t on[3] = { (uint8_t)(0x90 | DC), n2, 100 }, off[3] = { (uint8_t)(0x80 | DC), n2, 0 };
        move_plugin_slot_midi_v1(h->inst, 0, on, 3);
        HX_ASSERT(dt->drum_lane_pfx[2].active_note.active, "rig: lane 2 plays the module's note");
        dc->lanes[2].midi_note = (uint8_t)(n2 + 1);   /* the lane map moves under it */
        hx_clear_capture(h);
        move_plugin_slot_midi_v1(h->inst, 0, off, 3);
        HX_ASSERT(!dt->drum_lane_pfx[2].active_note.active, "the note-off did not find the lane its note-on played on");
        HX_ASSERT(seen(HX_MIDI_DIRECT, (uint8_t)(0x80 | DC), n2) == 1, "the lane's note was not closed at the synth");
        dc->lanes[2].midi_note = n2;
        hx_destroy(h);
    }

    /* ---- 6. a project load closes what the old project had in the module ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = I(h);
        const int T = 1;
        seq8_track_t *tr = &inst->tracks[T];
        char path[256];
        hx_set_param(h, "t1_route", "schwung");
        hx_set_param(h, "t1_fxpost", "1");
        inst->active_track = T;
        hx_render(h, 2);
        const uint8_t CH = (uint8_t)(tr->channel & 0x0F);
        snprintf(path, sizeof path, "/tmp/hx_fxpost_rel_%d.json", (int)getpid());
        snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
        seq8_save_state(inst);
        hx_set_param(h, "t1_live_notes", "eon 62 100");
        hx_render(h, 1);
        answer(h, T, 7);
        HX_ASSERT(tr->post.held[62], "rig: the raw note is in the module");
        hx_clear_capture(h);
        seq8_load_state(inst);
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INTERNAL, (uint8_t)(0x80 | CH), 62) == 1, "a load left the old project's note in the module");
        HX_ASSERT(seen(HX_MIDI_DIRECT, (uint8_t)(0x80 | CH), 69) == 1, "a load left the module's output sounding");
        HX_ASSERT(tr->fx_post == 1 && hx_get_param(h, "t1_fxpost", buf, sizeof buf) > 0 && buf[0] == '1', "rig: Post loaded back");
        remove(path);
        hx_destroy(h);
    }

    printf("PASS: a POST module's output is closed where it sounds: stop, switch-off, looper, route change, drum lane, load\n");
    return 0;
}
