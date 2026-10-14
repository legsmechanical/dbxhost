/* tests/test_fx_pre_post.c — a MIDI FX module set to PRE.
 *
 * PRE: what is PLAYED goes through the track's MIDI FX module, and the
 * module's OUTPUT is what is heard, captured and recorded; what the clip
 * plays back skips the module. The engine's side of it:
 *
 *   - a played note (tN_live_notes) goes into the track's OWN slot, through
 *     its MIDI FX, and nowhere else;
 *   - what the slot hands back (move_plugin_slot_midi_v1) is played as if it
 *     had been played — on a Schwung track to the slot DIRECT (past the MIDI
 *     FX), on a Move track to Move — and RECORDED while recording;
 *   - the raw played note is never recorded (record_note_on is skipped);
 *   - the clip's playback goes DIRECT on a Schwung track (never through the
 *     effect again);
 *   - Post (the switch off) is today's behaviour;
 *   - it is saved with the project, sparse.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static void back(hx_t *h, int slot, uint8_t status, uint8_t d1, uint8_t d2) {
    const uint8_t msg[3] = { status, d1, d2 };
    move_plugin_slot_midi_v1(h->inst, slot, msg, 3);
}
static int seen(hx_midi_kind k, int slot, uint8_t type, uint8_t d1) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != k || (e->bytes[1] & 0xF0) != type || e->bytes[2] != d1) continue;
        if (slot >= 0 && e->slot != slot) continue;
        n++;
    }
    return n;
}
static int notes_of(hx_midi_kind k) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == k && ((e->bytes[1] & 0xF0) == 0x90 || (e->bytes[1] & 0xF0) == 0x80)) n++;
    }
    return n;
}
static int clip_has(const clip_t *cl, uint8_t pitch) {
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].pitch == pitch) n++;
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    const int T = 1;
    seq8_track_t *tr = &inst->tracks[T];
    char buf[32];

    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(tr->pfx.route == ROUTE_SCHWUNG && tr->pfx.slot == T && tr->pad_mode != PAD_MODE_DRUM, "rig: melodic Schwung track 1, slot 1");
    inst->active_track = T;
    hx_render(h, 4);

    /* ---- CONTROL: Post (off) — a pad goes to the slot the usual way ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 60 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0x90, 60) == 1 && notes_of(HX_MIDI_DIRECT) == 0, "control: Post, the pad reaches the slot through its MIDI FX");
    hx_set_param(h, "t1_live_notes", "eoff 60");
    hx_render(h, 1);

    /* ---- 1. PRE: the pad goes INTO the effect, and nothing else sounds yet ---- */
    hx_set_param(h, "t1_fxpre", "1");
    HX_ASSERT(hx_get_param(h, "t1_fxpre", buf, sizeof buf) > 0 && buf[0] == '1', "the switch reads back");
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 62 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0x90, 62) == 1, "pre: the played note goes into the slot (its MIDI FX)");
    HX_ASSERT(notes_of(HX_MIDI_DIRECT) == 0, "pre: the raw note does not reach the instrument directly");

    /* ---- 2. what the effect hands back is played, DIRECT (past the effect) ---- */
    hx_clear_capture(h);
    back(h, T, 0x90, 62, 100);
    back(h, T, 0x90, 66, 100);                          /* a chord effect's third */
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, 0x90, 62) == 1 && seen(HX_MIDI_DIRECT, T, 0x90, 66) == 1,
              "pre: the effect's output reaches the instrument DIRECT");
    HX_ASSERT(notes_of(HX_MIDI_INTERNAL) == 0, "pre: the output is not sent back into the effect");
    hx_set_param(h, "t1_live_notes", "eoff 62");
    hx_render(h, 1);
    hx_clear_capture(h);
    back(h, T, 0x80, 62, 0);
    back(h, T, 0x80, 66, 0);
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, 0x80, 62) == 1 && seen(HX_MIDI_DIRECT, T, 0x80, 66) == 1, "pre: the offs follow");

    /* ---- 3. RECORDING: the effect's output is recorded, the played note is not ---- */
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 20);
    hx_set_param(h, "t1_recording", "1");
    HX_ASSERT(tr->recording, "rig: recording");
    hx_render(h, 6);
    {
        const clip_t *cl = &tr->clips[tr->active_clip];
        hx_set_param(h, "t1_live_notes", "eon 64 100");
        hx_set_param(h, "t1_record_note_on", "64 100");  /* what the JS sends while recording */
        /* the effect TRANSPOSES (64 → 65) and adds a third, so a raw 64 in
         * the clip can only be the played note recorded as well */
        back(h, T, 0x90, 65, 100);
        back(h, T, 0x90, 69, 100);
        hx_render(h, 3);
        hx_set_param(h, "t1_live_notes", "eoff 64");
        hx_set_param(h, "t1_record_note_off", "64");
        back(h, T, 0x80, 65, 0);
        back(h, T, 0x80, 69, 0);
        HX_ASSERT(clip_has(cl, 65) == 1 && clip_has(cl, 69) == 1, "recording: the effect's output is in the clip");
        HX_ASSERT(clip_has(cl, 64) == 0, "recording: the PLAYED note was recorded as well as the effect's output");
    }
    hx_set_param(h, "t1_recording", "0");
    hx_render(h, 2);

    /* ---- 4. PLAYBACK skips the effect: the clip's notes go DIRECT ---- */
    hx_clear_capture(h);
    hx_render(h, 1600);                                 /* a full pass of the clip (16 steps at 120 = 4 s) */
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, 0x90, 69) >= 1, "playback: the recorded note plays DIRECT");
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0x90, 69) == 0, "playback: the clip went through the effect again (a chord of a chord)");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 2);

    /* ---- 5. a MOVE track in Pre: into the slot, the output to Move ---- */
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "t1_channel", "4");
    hx_render(h, 1);
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 50 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0x90, 50) == 1 && notes_of(HX_MIDI_INJECT) == 0, "Move pre: the played note goes into the slot, not to Move");
    hx_clear_capture(h);
    back(h, T, 0x90, 50, 100);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, 0x90, 50) == 1, "Move pre: the effect's output reaches Move");
    HX_ASSERT(notes_of(HX_MIDI_INTERNAL) == 0 && notes_of(HX_MIDI_DIRECT) == 0, "Move pre: and nothing else");
    hx_set_param(h, "t1_live_notes", "eoff 50");
    back(h, T, 0x80, 50, 0);
    hx_render(h, 1);

    /* ---- 6. switching to POST: today's behaviour again ---- */
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_fxpre", "0");
    hx_render(h, 1);
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 55 100");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0x90, 55) == 1 && notes_of(HX_MIDI_DIRECT) == 0, "post: the pad goes through the slot's MIDI FX as always");
    hx_clear_capture(h);
    back(h, T, 0x90, 59, 100);
    HX_ASSERT(notes_of(HX_MIDI_DIRECT) == 0 && notes_of(HX_MIDI_INJECT) == 0, "post: a hand-back on a Schwung track is not played by the engine");
    hx_set_param(h, "t1_live_notes", "eoff 55");
    hx_render(h, 1);

    /* ---- 7. SAVED with the project, sparse; absent = Post ---- */
    hx_set_param(h, "t1_fxpre", "1");
    {
        char path[256];
        snprintf(path, sizeof path, "/tmp/hx_fxpre_%d.json", (int)getpid());
        snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
        seq8_save_state(inst);
        FILE *f = fopen(path, "r");
        HX_ASSERT(f, "the state file was written");
        static char st[1 << 20];
        size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; st[n] = 0;
        if (f) fclose(f);
        HX_ASSERT(strstr(st, "\"t1_fp\":1") != NULL, "Pre is saved");
        HX_ASSERT(strstr(st, "\"t0_fp\"") == NULL, "a Post track costs no key");
        tr->fx_pre = 0;
        seq8_load_state(inst);
        HX_ASSERT(tr->fx_pre == 1, "Pre is loaded back");
        HX_ASSERT(inst->tracks[0].fx_pre == 0, "absent loads as Post");
        remove(path);
    }

    hx_destroy(h);
    printf("PASS: a PRE MIDI FX module: played notes through it, its output heard and recorded, playback past it\n");
    return 0;
}
