/* tests/test_fx_post_order.c — a POST MIDI FX module runs FIRST (Josh,
 * 2026-10-15: "i thought it went through midi fx modules first today. that's
 * how it should be at least.").
 *
 * With tN_fxpost on, what the track plays goes into its own chain slot RAW,
 * the slot hands the module's output back (move_plugin_slot_midi_v1), and
 * that output plays through the track's own effects to where its notes go,
 * past the module. Here the module is a stand-in that answers every note a
 * fifth up, so the composition can be read off the pitches:
 *
 *   - the module sees what was played (60), never the track's effects'
 *     output; the instrument gets effects(module(60)), DIRECT (past the
 *     module) on a Schwung track;
 *   - with it off, the old path: the effects, then the slot (through the
 *     module) — nothing direct;
 *   - a sequenced note goes in at its step and comes out at its gate;
 *   - the module's output is not swung again (it went in swung);
 *   - every note the module sounded gets its off, with a MIDI delay on;
 *   - a drum track: the output plays on the lane whose note it is; a pitch no
 *     lane has is dropped;
 *   - a Move track: the output goes to Move;
 *   - switching it off, a route change and panic close what the module has;
 *   - it is saved with the project (t%d_fo) and reads back.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

/* Events of kind k to `slot` (-1 any) with this status / pitch. */
static int seen(hx_midi_kind k, int slot, uint8_t status, uint8_t d1) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != k || e->bytes[1] != status || e->bytes[2] != d1) continue;
        if (slot >= 0 && e->slot != slot) continue;
        n++;
    }
    return n;
}
static int notes(hx_midi_kind k) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        const uint8_t ty = e->bytes[1] & 0xF0;
        if (e->kind == k && (ty == 0x90 || ty == 0x80)) n++;
    }
    return n;
}

/* The stand-in module: every note the engine sent into `slot` since the last
 * capture comes back a fifth up, as the host's drain would hand it back —
 * after the render. Returns how many it answered. */
static int answer(hx_t *h, int slot, int up) {
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
    return n;
}

/* Per pitch: note-ons minus note-offs that reached kind k, over a capture. */
static int balance[128];
static int ons55;                     /* note-ons of 55 at the instrument (the delay's echoes) */
static void tally(hx_midi_kind k, int slot) {
    int i;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        const uint8_t ty = e->bytes[1] & 0xF0;
        if (e->kind != k || (slot >= 0 && e->slot != slot)) continue;
        if (ty == 0x90 && e->bytes[3] > 0) { balance[e->bytes[2]]++; if (e->bytes[2] == 55) ons55++; }
        else if (ty == 0x80 || ty == 0x90) balance[e->bytes[2]]--;
    }
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    const int T = 1;
    seq8_track_t *tr = &inst->tracks[T];
    char buf[32];

    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(tr->pfx.slot == T && tr->pad_mode != PAD_MODE_DRUM, "rig: melodic Schwung track 1, slot 1");
    inst->active_track = T;
    hx_set_param(h, "t1_c0_pfx_set", "noteFX_offset 7");   /* the track's effect: up a fifth */
    hx_render(h, 4);
    const uint8_t CH = (uint8_t)(tr->channel & 0x0F);

    /* ---- CONTROL: off, the old path — effects, then the slot (through it) ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 60 100");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 67) == 1, "control: off, the effects' output goes to the slot");
    HX_ASSERT(notes(HX_MIDI_DIRECT) == 0, "control: off, nothing goes past the module");
    hx_set_param(h, "t1_live_notes", "eoff 60");
    hx_render(h, 2);

    /* ---- 1. ON: the module sees what was PLAYED ---- */
    hx_set_param(h, "t1_fxpost", "1");
    HX_ASSERT(hx_get_param(h, "t1_fxpost", buf, sizeof buf) > 0 && buf[0] == '1', "the switch reads back");
    HX_ASSERT(inst->state_dirty, "the switch marks the project for saving");
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 60 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 60) == 1, "the module gets the played note, raw");
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 67) == 0, "the module got the track's effects' output");
    HX_ASSERT(notes(HX_MIDI_DIRECT) == 0, "something reached the instrument before the module answered");

    /* ---- 2. ...and its output plays through the effects, past the module ---- */
    {
        int i;
        uint8_t got[4] = { 0 };
        int ng = 0;
        HX_ASSERT(answer(h, T, 7) == 1, "rig: the module answered");     /* 60 -> 67 */
        for (i = 0; i < hx_stub_event_count() && ng < 4; i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_DIRECT && (e->bytes[1] & 0xF0) == 0x90) got[ng++] = e->bytes[2];
        }
        HX_ASSERT(ng == 1 && got[0] == 74, "the instrument does not get effects(module(60)) = 74");
        HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 67) == 0 &&
                  seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 74) == 0, "the module's output went back into the module");
    }
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eoff 60");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x80 | CH), 60) == 1, "the release goes into the module");
    answer(h, T, 7);
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, (uint8_t)(0x80 | CH), 74) == 1, "the module's release reaches the instrument");

    /* ---- 3. a SEQUENCED note goes in at its step and its off at its gate ---- */
    hx_set_param(h, "t1_c0_pfx_set", "noteFX_offset 0");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_render(h, 2);
    hx_set_param(h, "t1_c0_step_0_toggle", "48 100");
    hx_render(h, 2);
    hx_set_param(h, "t1_delay_level", "100");
    hx_set_param(h, "t1_delay_repeats", "3");
    memset(balance, 0, sizeof balance);
    hx_set_param(h, "transport", "play");
    {
        int b, on_at = -1, off_at = -1;
        for (b = 0; b < 3000; b++) {
            hx_clear_capture(h);
            hx_render(h, 1);
            if (on_at < 0 && seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 48)) on_at = b;
            if (on_at >= 0 && off_at < 0 && seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x80 | CH), 48)) off_at = b;
            HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 55) == 0, "an echo or the module's output went into the module");
            answer(h, T, 7);
            tally(HX_MIDI_DIRECT, T);
            if (off_at >= 0 && b > off_at + 400) break;
        }
        HX_ASSERT(on_at >= 0, "the step never went into the module");
        HX_ASSERT(off_at > on_at, "the step's note-off never went into the module");
    }
    hx_set_param(h, "transport", "stop");
    {
        int b;
        for (b = 0; b < 2000; b++) { hx_clear_capture(h); hx_render(h, 1); answer(h, T, 7); tally(HX_MIDI_DIRECT, T); }
    }
    {
        int p, bad = 0;
        for (p = 0; p < 128; p++) if (balance[p] != 0) bad++;
        HX_ASSERT(bad == 0, "a note the module sounded was left on at the instrument (with a MIDI delay on)");
        HX_ASSERT(ons55 >= 2, "rig: the MIDI delay never echoed the module's output");
    }
    hx_set_param(h, "t1_delay_level", "0");
    hx_set_param(h, "t1_c0_step_0_toggle", "48 100");     /* off again */
    hx_render(h, 2);

    /* ---- 4. SWING: a swung step goes INTO the module late, and what the
     *         module hands back is not held back a second time ---- */
    {
        int sw, at[2] = { -1, -1 }, direct_same_block = 0;
        hx_set_param(h, "t1_c0_step_1_toggle", "52 100");   /* an off-beat step: swing moves it */
        hx_render(h, 2);
        for (sw = 0; sw < 2; sw++) {
            int b;
            hx_set_param(h, "swing_amt", sw ? "100" : "0");
            hx_set_param(h, "transport", "play");
            for (b = 0; b < 3000; b++) {
                hx_clear_capture(h);
                hx_render(h, 1);
                if (seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 52)) {
                    at[sw] = b;
                    answer(h, T, 7);
                    if (sw && seen(HX_MIDI_DIRECT, T, (uint8_t)(0x90 | CH), 59) == 1) direct_same_block = 1;
                    break;
                }
                answer(h, T, 7);
            }
            /* ...and its note-off follows it in, held back as long */
            {
                int got_off = 0;
                for (b = 0; b < 600 && !got_off; b++) {
                    hx_clear_capture(h);
                    hx_render(h, 1);
                    if (seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x80 | CH), 52)) got_off = 1;
                    answer(h, T, 7);
                }
                HX_ASSERT(got_off, "a swung step's note-off never went into the module (stuck in it)");
            }
            hx_set_param(h, "transport", "stop");
            for (b = 0; b < 400; b++) { hx_clear_capture(h); hx_render(h, 1); answer(h, T, 7); }
        }
        HX_ASSERT(at[0] >= 0 && at[1] >= 0, "rig: the off-beat step never went into the module");
        HX_ASSERT(at[1] > at[0], "swing did not hold the step back on its way INTO the module");
        HX_ASSERT(direct_same_block, "the module's output was held back again (swung twice)");
        hx_set_param(h, "swing_amt", "0");
        hx_set_param(h, "t1_c0_step_1_toggle", "52 100");   /* off again */
        hx_render(h, 2);
    }

    /* ---- 5. switching it OFF closes what the module has ---- */
    hx_set_param(h, "t1_live_notes", "eon 64 100");
    hx_render(h, 1);
    hx_clear_capture(h);
    hx_set_param(h, "t1_fxpost", "0");
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x80 | CH), 64) == 1, "switching it off left a note in the module");
    hx_set_param(h, "t1_live_notes", "eoff 64");
    hx_render(h, 1);

    /* ---- 6. PANIC closes what the module has ---- */
    hx_set_param(h, "t1_fxpost", "1");
    hx_set_param(h, "t1_live_notes", "eon 65 100");
    hx_render(h, 1);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "panic");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x80 | CH), 65) == 1, "panic left a note in the module");
    hx_set_param(h, "t1_live_notes", "eoff 65");
    hx_render(h, 1);

    /* ---- 7. saved with the project (sparse), and loaded back ---- */
    {
        char path[256];
        static char st[1 << 20];
        snprintf(path, sizeof path, "/tmp/hx_fxpost_%d.json", (int)getpid());
        snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
        seq8_save_state(inst);
        FILE *f = fopen(path, "r");
        HX_ASSERT(f, "the state file was written");
        size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; st[n] = 0;
        if (f) fclose(f);
        HX_ASSERT(strstr(st, "\"t1_fo\":1") != NULL, "Post is saved");
        HX_ASSERT(strstr(st, "\"t3_fo\"") == NULL, "a track without it costs no key");
        tr->fx_post = 0;
        seq8_load_state(inst);
        HX_ASSERT(tr->fx_post == 1, "Post is loaded back");
        HX_ASSERT(inst->tracks[3].fx_post == 0, "absent loads as off");
        remove(path);
    }

    /* ---- 8. a MOVE track: in through its parked slot, out to Move ---- */
    {
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
        HX_ASSERT(seen(HX_MIDI_INTERNAL, M, (uint8_t)(0x90 | MC), 50) == 1, "Move track: the note goes into its slot");
        HX_ASSERT(notes(HX_MIDI_INJECT) == 0, "Move track: the note reached Move before the module");
        answer(h, M, 7);
        HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x90 | MC), 57) == 1, "Move track: the module's output does not reach Move");
        hx_clear_capture(h);
        hx_set_param(h, "t2_route", "external");
        HX_ASSERT(seen(HX_MIDI_INTERNAL, M, (uint8_t)(0x80 | MC), 50) == 1, "a route change left the note in the module");
        hx_set_param(h, "t2_live_notes", "eoff 50");
        hx_render(h, 1);
    }

    /* ---- 9. a DRUM track: the output plays on the lane whose note it is ---- */
    {
        const int D = 0;
        seq8_track_t *dt = &inst->tracks[D];
        HX_ASSERT(dt->pad_mode == PAD_MODE_DRUM, "rig: track 0 is a drum track");
        hx_set_param(h, "t0_route", "schwung");
        hx_set_param(h, "t0_fxpost", "1");
        inst->active_track = D;
        hx_render(h, 2);
        const drum_clip_t *dc = dt->drum_clips[dt->active_clip];
        HX_ASSERT(dc, "rig: a drum clip");
        const uint8_t n0 = dc->lanes[0].midi_note, n2 = dc->lanes[2].midi_note;
        const uint8_t DC = (uint8_t)(dt->channel & 0x0F);
        uint8_t stray = 0;
        {
            int p, l, used;
            for (p = 127; p > 0; p--) {
                used = 0;
                for (l = 0; l < DRUM_LANES; l++) if (dc->lanes[l].midi_note == p) used = 1;
                if (!used) { stray = (uint8_t)p; break; }
            }
        }
        HX_ASSERT(stray, "rig: a pitch no lane has");
        hx_clear_capture(h);
        snprintf(buf, sizeof buf, "eon %d 100", n0);
        hx_set_param(h, "t0_live_notes", buf);
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INTERNAL, D, (uint8_t)(0x90 | DC), n0) == 1, "drum: the pad's note goes into the module");
        HX_ASSERT(notes(HX_MIDI_DIRECT) == 0, "drum: the lane sounded before the module");
        hx_clear_capture(h);
        {
            const uint8_t a[3] = { (uint8_t)(0x90 | DC), n2, 100 };
            const uint8_t b[3] = { (uint8_t)(0x90 | DC), stray, 100 };
            move_plugin_slot_midi_v1(h->inst, D, a, 3);
            move_plugin_slot_midi_v1(h->inst, D, b, 3);
        }
        HX_ASSERT(dt->drum_lane_pfx[2].active_note.active, "drum: the module's note did not play on lane 2");
        HX_ASSERT(seen(HX_MIDI_DIRECT, D, (uint8_t)(0x90 | DC), n2) == 1, "drum: lane 2's note did not reach the instrument");
        HX_ASSERT(seen(HX_MIDI_DIRECT, D, (uint8_t)(0x90 | DC), stray) == 0, "drum: a pitch no lane has was sounded");
        hx_clear_capture(h);
        snprintf(buf, sizeof buf, "eoff %d", n0);
        hx_set_param(h, "t0_live_notes", buf);
        hx_render(h, 1);
        HX_ASSERT(seen(HX_MIDI_INTERNAL, D, (uint8_t)(0x80 | DC), n0) == 1, "drum: the release goes into the module");
        {
            const uint8_t a[3] = { (uint8_t)(0x80 | DC), n2, 0 };
            move_plugin_slot_midi_v1(h->inst, D, a, 3);
        }
        HX_ASSERT(seen(HX_MIDI_DIRECT, D, (uint8_t)(0x80 | DC), n2) == 1, "drum: the module's release did not close lane 2");
    }

    /* ---- 10. a PRE module is not POST: nothing changes for it ---- */
    hx_set_param(h, "t1_fxpost", "0");
    hx_set_param(h, "t1_fxpre", "1");
    inst->active_track = T;
    hx_render(h, 2);
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 60 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 60) == 1, "Pre: the played note goes into the slot as before");
    hx_set_param(h, "t1_live_notes", "eoff 60");
    hx_render(h, 1);

    hx_destroy(h);
    printf("PASS: a POST MIDI FX module runs first: raw in, effects after, past the module, closed on off/route/panic\n");
    return 0;
}
