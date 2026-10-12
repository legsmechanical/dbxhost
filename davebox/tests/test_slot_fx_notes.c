/* tests/test_slot_fx_notes.c — notes the instrument's MIDI effect generated.
 *
 * A track's instrument can carry a MIDI effect that GENERATES notes (a drum
 * pattern from the clock, an arpeggio). With "Notes to Seq" on for it, the
 * host hands each generated note to move_plugin_slot_midi_v1() after the
 * engine's render. They are live input on the track that owns the instrument:
 *
 *   - RECORDED into the clip while the track is recording (and in the last
 *     eighth of its count-in), with a length taken from the note-off;
 *   - otherwise kept by CAPTURE — on the ACTIVE track only, so a generator on
 *     another track can neither fill nor wipe the one capture ring;
 *   - NEVER EMITTED: they already sounded, from the instrument;
 *   - never duplicated: a generator repeats its bar every lap of the clip;
 *   - drum tracks: to the lane that answers to the pitch, empty steps only,
 *     and a pitch no lane plays is dropped;
 *   - nothing at all for a track whose instrument is not a chain slot.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static void fx(hx_t *h, int slot, uint8_t status, uint8_t pitch, uint8_t vel) {
    const uint8_t msg[3] = { status, pitch, vel };
    move_plugin_slot_midi_v1(h->inst, slot, msg, 3);
}
/* Channel-voice MIDI the engine sent anywhere (its own transport clock to the
 * slots is realtime and is not what this counts). */
static int voice_out(void) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_PARAM_SET) continue;
        if (e->bytes[1] >= 0x80 && e->bytes[1] < 0xF0) n++;
    }
    return n;
}
static int clip_has(const clip_t *cl, uint8_t pitch) {
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].pitch == pitch) n++;
    return n;
}
static int clip_active_notes(const clip_t *cl) {
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active) n++;
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    seq8_track_t *tr = &inst->tracks[1];
    clip_t *cl;
    HX_ASSERT(tr->pad_mode != PAD_MODE_DRUM, "rig: track 1 is melodic");
    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(tr->pfx.route == ROUTE_SCHWUNG && tr->pfx.slot == 1, "rig: track 1 owns slot 1");
    inst->active_track = 1;
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 40);
    cl = &tr->clips[tr->active_clip];

    /* ---- CONTROL: the rig can see an emission at all ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_live_notes", "eon 72 100");
    hx_render(h, 2);
    HX_ASSERT(voice_out() > 0, "control: a played note emits MIDI (or the zero-emission checks below prove nothing)");
    hx_set_param(h, "t1_live_notes", "eoff 72");
    hx_render(h, 2);

    /* ---- 1. RECORDING: written into the clip, length from the note-off ---- */
    hx_set_param(h, "t1_recording", "1");
    HX_ASSERT(tr->recording, "rig: track 1 is recording");
    hx_render(h, 10);
    hx_clear_capture(h);
    {
        int before = clip_active_notes(cl);
        uint32_t t_on = tr->current_clip_tick;
        fx(h, 1, 0x90, 60, 97);
        HX_ASSERT(clip_has(cl, 60) == 1 && clip_active_notes(cl) == before + 1, "recording: the generated note is in the clip");
        {
            int i; const note_t *n = NULL;
            for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].pitch == 60) n = &cl->notes[i];
            HX_ASSERT(n && n->vel == 97, "recording: the pattern's own velocity is kept");
            HX_ASSERT(n->tick == t_on, "recording: stamped at the clip position of the hand-off");
            hx_render(h, 60);
            fx(h, 1, 0x80, 60, 0);
            HX_ASSERT(n->gate != (uint16_t)GATE_TICKS && n->gate == (uint16_t)(tr->current_clip_tick - t_on),
                      "recording: the note-off sets the length");
        }
        HX_ASSERT(tr->fx_pending_count == 0, "recording: the closed note is no longer pending");
    }

    /* ---- 2. NO DUPLICATES across laps: same pitch on the same step ---- */
    {
        fx(h, 1, 0x90, 64, 100);
        fx(h, 1, 0x80, 64, 0);
        fx(h, 1, 0x90, 64, 100);                       /* the next lap's identical hit */
        fx(h, 1, 0x80, 64, 0);
        HX_ASSERT(clip_has(cl, 64) == 1, "a pitch already on the step was recorded again");
        fx(h, 1, 0x90, 67, 100);                       /* a different pitch on that step is a chord */
        fx(h, 1, 0x80, 67, 0);
        HX_ASSERT(clip_has(cl, 67) == 1, "a second pitch on the same step was refused");
        hx_render(h, 120);                             /* well into a later step */
        fx(h, 1, 0x90, 64, 100);
        fx(h, 1, 0x80, 64, 0);
        HX_ASSERT(clip_has(cl, 64) == 2, "the same pitch on a DIFFERENT step was refused");
    }
    HX_ASSERT(inst->cap_count == 0, "recording: Capture took a recorded note as well");

    /* ---- 3. NEVER EMITTED ---- */
    HX_ASSERT(voice_out() == 0, "a generated note was sent back out — it would sound twice, into the effect that made it");

    /* ---- 4. one take = one Undo ---- */
    hx_set_param(h, "t1_recording", "0");
    HX_ASSERT(!tr->recording && tr->fx_pending_count == 0, "disarm");
    HX_ASSERT(clip_active_notes(cl) >= 4, "rig: the take holds notes");
    hx_set_param(h, "undo_restore", "1");
    hx_render(h, 2);
    HX_ASSERT(clip_active_notes(&tr->clips[tr->active_clip]) == 0, "one Undo did not take the whole take back");

    /* ---- 5. NOT recording, ACTIVE track: Capture keeps it, still silent ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_capture_clear", "1");
    HX_ASSERT(capture_pending_for_track(inst, 1) == 0, "rig: nothing pending");
    fx(h, 1, 0x90, 62, 90);
    hx_render(h, 20);
    fx(h, 1, 0x80, 62, 0);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "not recording: Capture did not keep the generated note");
    HX_ASSERT(clip_active_notes(&tr->clips[tr->active_clip]) == 0, "not recording: the note was written into the clip anyway");
    HX_ASSERT(voice_out() == 0, "a captured generated note was sent back out");

    /* ---- 6. a generator on ANOTHER track cannot touch the capture ring ---- */
    hx_set_param(h, "t2_route", "schwung");
    HX_ASSERT(inst->tracks[2].pfx.route == ROUTE_SCHWUNG && inst->active_track == 1, "rig: track 2 owns slot 2, track 1 is active");
    {
        int before = (int)inst->cap_count;
        int i;
        for (i = 0; i < 40; i++) { fx(h, 2, 0x90, 50, 100); fx(h, 2, 0x80, 50, 0); hx_render(h, 5); }
        HX_ASSERT(capture_pending_for_track(inst, 2) == 0, "a non-active track's generator reached Capture");
        HX_ASSERT((int)inst->cap_count == before && capture_pending_for_track(inst, 1) == 1,
                  "a non-active track's generator changed what the active track had captured");
    }

    /* ---- 7. an instrument that is not a chain slot: nothing ---- */
    hx_set_param(h, "t1_capture_clear", "1");
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "t1_recording", "1");
    fx(h, 1, 0x90, 70, 100);
    HX_ASSERT(clip_active_notes(&tr->clips[tr->active_clip]) == 0 && inst->cap_count == 0,
              "slot 1's notes were taken by a track whose instrument is not slot 1");
    hx_set_param(h, "t1_recording", "0");
    hx_set_param(h, "t1_route", "schwung");
    /* ...and a slot nobody owns, or out of range, is ignored outright */
    fx(h, 7, 0x90, 70, 100);
    {
        const uint8_t m[3] = { 0x90, 70, 100 };
        move_plugin_slot_midi_v1(h->inst, -1, m, 3);
        move_plugin_slot_midi_v1(h->inst, 99, m, 3);
        move_plugin_slot_midi_v1(h->inst, 1, m, 2);
        move_plugin_slot_midi_v1(h->inst, 1, NULL, 3);
    }
    hx_set_param(h, "t1_capture_clear", "1");

    /* ---- 8. only notes: a controller from the effect is not recorded ---- */
    hx_set_param(h, "t1_recording", "1");
    fx(h, 1, 0xB0, 7, 100);
    fx(h, 1, 0xE0, 0, 64);
    HX_ASSERT(clip_active_notes(&tr->clips[tr->active_clip]) == 0, "a controller was recorded as a note");
    hx_set_param(h, "t1_recording", "0");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    /* ---- 9. DRUM track: the lane that answers, empty steps only ---- */
    h = hx_create(NULL);
    inst = I(h);
    tr = &inst->tracks[0];
    HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM && tr->drum_clips[tr->active_clip], "rig: track 0 is a drum track with a clip");
    hx_set_param(h, "t0_route", "schwung");
    inst->active_track = 0;
    hx_set_param(h, "t0_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 30);
    hx_set_param(h, "t0_recording", "1");
    HX_ASSERT(tr->recording, "rig: the drum track is recording");
    hx_render(h, 30);
    hx_clear_capture(h);
    {
        drum_clip_t *dc = tr->drum_clips[tr->active_clip];
        uint8_t p0 = dc->lanes[0].midi_note, p3 = dc->lanes[3].midi_note;
        clip_t *l0 = &dc->lanes[0].clip, *l3 = &dc->lanes[3].clip;
        int l, others = 0;
        fx(h, 0, 0x90, p0, 110);
        HX_ASSERT(l0->note_count == 1, "drum: the hit did not land in the lane that plays its note");
        fx(h, 0, 0x80, p0, 0);
        fx(h, 0, 0x90, p0, 110);                       /* the next lap, same step */
        HX_ASSERT(l0->note_count == 1, "drum: an occupied step took the hit again");
        fx(h, 0, 0x90, p3, 80);
        HX_ASSERT(l3->note_count == 1, "drum: a second lane's hit on the same step was refused");
        hx_render(h, 120);
        fx(h, 0, 0x90, p0, 110);
        HX_ASSERT(l0->note_count == 2, "drum: a later step did not take a hit");
        /* a pitch no lane plays */
        {
            uint8_t stray = 1;
            for (l = 0; l < DRUM_LANES; l++) if (dc->lanes[l].midi_note == stray) stray = 2;
            fx(h, 0, 0x90, stray, 100);
        }
        for (l = 0; l < DRUM_LANES; l++) if (l != 0 && l != 3) others += (int)dc->lanes[l].clip.note_count;
        HX_ASSERT(others == 0 && l0->note_count == 2 && l3->note_count == 1, "drum: a pitch no lane plays was recorded somewhere");
    }
    HX_ASSERT(voice_out() == 0, "drum: a generated hit was sent back out");
    hx_set_param(h, "t0_recording", "0");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    /* ---- 10. the count-in's last eighth lands on the first step ---- */
    h = hx_create(NULL);
    inst = I(h);
    tr = &inst->tracks[1];
    hx_set_param(h, "t1_route", "schwung");
    inst->active_track = 1;
    hx_set_param(h, "record_count_in", "1");
    HX_ASSERT(inst->count_in_ticks > 0 && inst->count_in_track == 1, "rig: counting in for track 1");
    fx(h, 1, 0x90, 60, 100);                           /* too early: the count-in has just begun */
    HX_ASSERT(clip_active_notes(&tr->clips[tr->active_clip]) == 0, "count-in: a note long before the downbeat was recorded");
    {
        int guard = 0;
        while (inst->count_in_ticks > (int32_t)(PPQN / 2) && guard++ < 4000) hx_render(h, 1);
        HX_ASSERT(inst->count_in_ticks > 0 && inst->count_in_ticks <= (int32_t)(PPQN / 2), "rig: inside the last eighth");
    }
    fx(h, 1, 0x90, 60, 100);
    cl = &tr->clips[tr->active_clip];
    HX_ASSERT(clip_has(cl, 60) == 1, "count-in: a note in the last eighth was not recorded");
    {
        int i;
        for (i = 0; i < cl->note_count; i++)
            if (cl->notes[i].active && cl->notes[i].pitch == 60)
                HX_ASSERT(cl->notes[i].tick == (uint32_t)cl->loop_start * cl->ticks_per_step, "count-in: not placed on the first step");
    }
    hx_set_param(h, "record_count_in_cancel", "1");
    hx_destroy(h);

    printf("PASS: slot_fx_notes\n");
    return 0;
}
