/* tests/test_resample_clip.c — CLIP RESAMPLE (seq8_resample.c resample_clip):
 * one track's clip ALONE, through the host's module take (the harness's
 * capture_start / capture_start_src stand-ins).
 *
 *   - its length is the clip's, in whole bars where it lines up with the bar
 *     (a drum clip: where its lanes line up); 0 = no notes;
 *   - from STOPPED only that track plays — another track with notes in the
 *     same row stays silent — and the take arms one render after its first
 *     note (the slots render before this module);
 *   - Wet = the mix (capture_start); Dry = the track's chain slot
 *     (capture_start_src, MOVE_CAPTURE_SLOT, its slot) — a MIDI track that
 *     follows another records THAT track's slot;
 *   - refusals: Dry on a Move instrument, a track that plays out MIDI only, a
 *     muted track, playing;
 *   - after the take, the transport stop puts back what was armed. */
#include "harness.h"

static int geti(hx_t *h, const char *k) {
    char b[32];
    return hx_get_param(h, k, b, sizeof b) > 0 ? atoi(b) : -1;
}

static void note_at(hx_t *h, int t, int c, int step, int pitch) {
    char k[48], v[16];
    snprintf(k, sizeof k, "t%d_c%d_step_%d_toggle", t, c, step);
    snprintf(v, sizeof v, "%d 100", pitch);
    hx_set_param(h, k, v);
}

/* note-ons per chain slot (slot-addressed sends) since the capture was reset */
static int note_ons_on_slot(int slot) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_PARAM_SET && e->slot == slot && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3]) n++;
    }
    return n;
}
static int first_note_block_on_slot(int slot) {
    int i;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_PARAM_SET && e->slot == slot && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3]) return e->block;
    }
    return -1;
}

#define BAR_FRAMES 88200u

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t2_route", "schwung");
    note_at(h, 1, 0, 0, 60);  note_at(h, 1, 0, 8, 64);
    note_at(h, 2, 0, 0, 48);  note_at(h, 2, 0, 4, 50);   /* the same row, another track */
    inst->tracks[1].clips[0].length = 16;                /* 1 bar */
    return h;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    int stops, block, kind, index, i;
    uint32_t frames;
    const char *path;

    /* ---- length ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(geti(h, "resample_bars_t1_c0") == 1, "a 1-bar clip is not 1 bar");
    inst->tracks[1].clips[0].length = 24;
    HX_ASSERT(geti(h, "resample_bars_t1_c0") == 3, "a 1.5-bar clip does not line up with the bar at 3");
    inst->tracks[1].clips[0].length = 16;
    HX_ASSERT(geti(h, "resample_bars_t1_c5") == 0, "an empty clip has a length");
    HX_ASSERT(geti(h, "resample_bars_0") == 1, "the scene length broke");

    /* ---- Wet, alone ---- */
    hx_clear_capture(h);
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/My 2A 1bar 120bpm.wav");
    HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED, "the clip take did not launch");
    for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
    HX_ASSERT(hx_stub_capture(&stops, &block, &frames, &path) == 1, "no host take");
    hx_stub_capture_src(&kind, &index);
    HX_ASSERT(kind == MOVE_CAPTURE_MIX, "Wet is not the mix");
    HX_ASSERT(first_note_block_on_slot(1) >= 0 && block == first_note_block_on_slot(1) + 1,
              "the take was not armed one render after the track's first note");
    HX_ASSERT(frames == BAR_FRAMES, "not 1 bar of frames");
    while (inst->resample_state == RS_RECORDING) hx_render(h, 1);
    HX_ASSERT(inst->resample_state == RS_DONE, "the take did not finish");
    HX_ASSERT(note_ons_on_slot(1) == 2, "track 2 did not play its clip once");
    HX_ASSERT(note_ons_on_slot(2) == 0, "ANOTHER track played during a clip take");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);

    /* ---- Dry: the track's own slot; a follower records its target's slot ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "resample_clip", "1 0 1 0 0 1 |/x/d.wav");
    for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
    hx_stub_capture_src(&kind, &index);
    HX_ASSERT(inst->resample_state == RS_RECORDING && kind == MOVE_CAPTURE_SLOT && index == 1,
              "Dry did not take track 2's slot");
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(inst->resample_state == RS_CANCELLED, "stop did not cancel");
    hx_set_param(h, "resample_clear", "1");
    hx_set_param(h, "t3_route", "external");
    hx_set_param(h, "t3_midi_to", "3");                  /* track 4 follows track 3 (slot 2) */
    note_at(h, 3, 0, 0, 55);
    hx_stub_capture_reset();
    hx_set_param(h, "resample_clip", "3 0 1 0 0 1 |/x/f.wav");
    for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
    hx_stub_capture_src(&kind, &index);
    HX_ASSERT(kind == MOVE_CAPTURE_SLOT && index == 2, "a follower's Dry take is not its target's slot");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);

    /* ---- refusals: nothing launches ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "resample_clip", "1 0 1 0 0 1 |/x/r.wav");
    HX_ASSERT(!inst->playing && geti(h, "resample_err") == RS_ERR_ROUTE, "Dry on a Move instrument was taken");
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/r.wav");
    HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED, "Wet on a Move instrument was refused");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_set_param(h, "t1_route", "external");
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/r.wav");
    HX_ASSERT(!inst->playing && geti(h, "resample_err") == RS_ERR_ROUTE, "an external-MIDI track was taken");
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_mute", "1");
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/r.wav");
    HX_ASSERT(!inst->playing && geti(h, "resample_err") == RS_ERR_MUTED, "a muted track was taken");
    hx_set_param(h, "t1_mute", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 2);
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/r.wav");
    HX_ASSERT(geti(h, "resample_err") == RS_ERR_PLAYING, "a clip take started while playing");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    /* ---- what was armed comes back ---- */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    inst->tracks[1].active_clip = 3; inst->tracks[1].will_relaunch = 1;
    inst->tracks[2].active_clip = 0; inst->tracks[2].will_relaunch = 1;
    hx_set_param(h, "resample_clip", "1 0 1 0 0 0 |/x/a.wav");
    while (inst->resample_state != RS_DONE) hx_render(h, 1);
    HX_ASSERT(inst->tracks[1].active_clip == 0, "rig: the take did not launch clip A");
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(inst->tracks[1].active_clip == 3 && inst->tracks[1].will_relaunch == 1,
              "track 2's armed clip did not come back");
    HX_ASSERT(inst->tracks[2].will_relaunch == 1, "track 3's armed state did not come back");
    hx_destroy(h);

    printf("PASS: test_resample_clip\n");
    return 0;
}
