/* tests/test_flatten_undo.c — Undo after a track is made Audio (Flatten, or
 * Audio picked in Instmt/Dest: tN_convert_to_audio "u").
 *
 *   - a MIDI track comes back whole: every clip's notes, its type, transpose,
 *     TRACK ARP, MIDI FX Pre / Post and its route; Redo makes it Audio again,
 *     its clips' samples back by name; Undo again brings the notes back;
 *   - a drum track comes back as a drum track: every clip's lanes, the lane
 *     mutes, the repeat groove;
 *   - a Conductor comes back as the Conductor;
 *   - the restore names the track ("f t") so the UI re-reads everything;
 *   - a later edit is the Undo step, and the flattened track stays Audio;
 *   - a track converted again since is not touched by the Undo;
 *   - CONTROL: a conversion without "u" takes no step. */
#include "harness.h"

static int notes(seq8_instance_t *inst, int t, int c) {
    clip_t *cl = &inst->tracks[t].clips[c];
    int n = 0;
    for (int i = 0; i < (int)cl->note_count; i++) n += cl->notes[i].active;
    return n;
}
static int lane_notes(seq8_instance_t *inst, int t, int c, int l) {
    drum_clip_t *dc = inst->tracks[t].drum_clips[c];
    if (!dc) return -1;
    clip_t *cl = &dc->lanes[l].clip;
    int n = 0;
    for (int i = 0; i < (int)cl->note_count; i++) n += cl->notes[i].active;
    return n;
}
static char g_info[64];
static const char *info(hx_t *h) { g_info[0] = 0; hx_get_param(h, "last_restore", g_info, sizeof g_info); return g_info; }

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "hx_create");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[2];

    /* ---- a MIDI track ---- */
    hx_set_param(h, "t2_c0_note_add", "0 60 100 24");
    hx_set_param(h, "t2_c0_note_add", "48 64 100 24");
    hx_set_param(h, "t2_c5_note_add", "24 67 100 24");
    tr->transpose = 3; tr->tarp_on = 1; tr->tarp.style = 4; tr->fx_pre = 1; tr->pfx.route = ROUTE_MOVE;
    hx_set_param(h, "t2_convert_to_audio", "u");
    HX_ASSERT(tr->pad_mode == PAD_MODE_AUDIO && notes(inst, 2, 0) == 0 && tr->transpose == 0 && !tr->tarp_on,
              "the conversion did not happen");
    HX_ASSERT(tr->pfx.route == ROUTE_SCHWUNG, "an Audio track is not on its slot");
    /* the clip takes its recording (a pick, here only its name) */
    snprintf(inst->au_clip[2][0].name, sizeof inst->au_clip[2][0].name, "%s", "T3 A.wav");
    inst->au_clip[2][0].state = 1;

    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(tr->pad_mode == PAD_MODE_MELODIC_SCALE, "⭐ Undo did not make the track MIDI again");
    HX_ASSERT(notes(inst, 2, 0) == 2 && notes(inst, 2, 5) == 1, "⭐ Undo did not bring every clip's notes back");
    HX_ASSERT(tr->transpose == 3 && tr->tarp_on && tr->tarp.style == 4 && tr->fx_pre == 1,
              "⭐ Undo did not bring back transpose / TRACK ARP / MIDI FX");
    HX_ASSERT(tr->pfx.route == ROUTE_MOVE, "⭐ Undo did not bring the route back");
    HX_ASSERT(!strcmp(info(h), "f 2"), "the restore does not name the flattened track");

    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(tr->pad_mode == PAD_MODE_AUDIO && notes(inst, 2, 0) == 0 && tr->transpose == 0,
              "⭐ Redo did not make the track Audio again");
    HX_ASSERT(!strcmp(inst->au_clip[2][0].name, "T3 A.wav"), "⭐ Redo lost the clip's sample");
    HX_ASSERT(!strcmp(info(h), "f 2"), "the redo does not name the flattened track");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(tr->pad_mode == PAD_MODE_MELODIC_SCALE && notes(inst, 2, 0) == 2,
              "Undo after Redo did not bring the notes back");

    /* ---- a drum track ---- */
    seq8_track_t *dr = &inst->tracks[3];
    hx_set_param(h, "t3_convert_to_drum", "1");
    HX_ASSERT(dr->pad_mode == PAD_MODE_DRUM && dr->drum_clips[0], "t3 is not a drum track");
    clip_insert_note(&dr->drum_clips[0]->lanes[0].clip, 0, 12, DRUM_BASE_NOTE, 100);
    clip_insert_note(&dr->drum_clips[0]->lanes[5].clip, 24, 12, DRUM_BASE_NOTE + 5, 90);
    clip_insert_note(&dr->drum_clips[2]->lanes[5].clip, 48, 12, DRUM_BASE_NOTE + 5, 90);
    dr->drum_clips[2]->lanes[5].midi_note = 50;
    dr->drum_lane_mute = 1u << 5;
    dr->drum_repeat_gate[5] = 0x0F;
    drum_clip_t *was0 = dr->drum_clips[0];
    hx_set_param(h, "t3_convert_to_audio", "u");
    HX_ASSERT(dr->pad_mode == PAD_MODE_AUDIO && lane_notes(inst, 3, 0, 0) == 0 && !dr->drum_lane_mute,
              "the drum conversion did not happen");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(dr->pad_mode == PAD_MODE_DRUM, "⭐ Undo did not make the track a drum track again");
    HX_ASSERT(lane_notes(inst, 3, 0, 0) == 1 && lane_notes(inst, 3, 0, 5) == 1 && lane_notes(inst, 3, 2, 5) == 1,
              "⭐ Undo did not bring every drum clip's lanes back");
    HX_ASSERT(dr->drum_clips[2]->lanes[5].midi_note == 50, "a lane lost its note");
    HX_ASSERT(dr->drum_lane_mute == (1u << 5) && dr->drum_repeat_gate[5] == 0x0F,
              "⭐ Undo did not bring the lane mutes / repeat groove back");
    HX_ASSERT(dr->drum_clips[0] == was0, "the drum clips came back as copies");
    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(dr->pad_mode == PAD_MODE_AUDIO && lane_notes(inst, 3, 0, 5) == 0, "drum Redo did not convert again");
    /* a second drum Flatten after the first's step went: the kept set is reused */
    hx_set_param(h, "undo_restore", "1");
    hx_set_param(h, "t3_convert_to_audio", "u");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(dr->pad_mode == PAD_MODE_DRUM && lane_notes(inst, 3, 0, 5) == 1, "a second drum Flatten did not undo");

    /* ---- the Conductor ---- */
    hx_set_param(h, "t6_convert_to_conduct", "1");
    HX_ASSERT(inst->conductor_track == 6, "t6 is not the Conductor");
    hx_set_param(h, "t6_convert_to_audio", "u");
    HX_ASSERT(inst->conductor_track == -1, "an Audio track kept the Conductor role");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(inst->tracks[6].pad_mode == PAD_MODE_CONDUCT && inst->conductor_track == 6,
              "⭐ Undo did not bring the Conductor back");

    /* ---- a later edit is the Undo step ---- */
    hx_set_param(h, "t1_c0_note_add", "0 60 100 24");
    hx_set_param(h, "t2_convert_to_audio", "u");
    hx_set_param(h, "t1_c0_clear", "1");                 /* the later step */
    HX_ASSERT(notes(inst, 1, 0) == 0, "the clear did not clear");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(notes(inst, 1, 0) == 1, "the later edit was not undone");
    HX_ASSERT(tr->pad_mode == PAD_MODE_AUDIO && notes(inst, 2, 0) == 0, "⭐ a later edit's Undo brought the MIDI track back");
    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(notes(inst, 1, 0) == 0 && tr->pad_mode == PAD_MODE_AUDIO, "the later edit's Redo touched the flattened track");

    /* ---- converted again since ---- */
    hx_set_param(h, "t4_c0_note_add", "0 60 100 24");
    hx_set_param(h, "t4_convert_to_audio", "u");
    hx_set_param(h, "t4_convert_to_melodic", "1");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(notes(inst, 4, 0) == 0 && inst->tracks[4].pad_mode == PAD_MODE_MELODIC_SCALE,
              "⭐ Undo wrote the old notes over a track converted since");

    /* ---- CONTROL: no "u", no step ---- */
    hx_set_param(h, "t5_c0_note_add", "0 60 100 24");
    hx_set_param(h, "t5_c1_note_add", "0 62 100 24");      /* the Undo step: this note */
    hx_set_param(h, "t5_convert_to_audio", "1");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(inst->tracks[5].pad_mode == PAD_MODE_AUDIO, "CONTROL: a plain conversion was undone");

    hx_destroy(h);
    printf("PASS: Undo after a track is made Audio (MIDI, drum, Conductor; Redo; later steps)\n");
    return 0;
}
