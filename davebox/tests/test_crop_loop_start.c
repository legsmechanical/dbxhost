/* tests/test_crop_loop_start.c — Crop, and the transforms that need the loop at step 1.
 *
 * Josh, 2026-09-27: "expose crop as an item on the clip/lanes banks. and refuse
 * transforms when loop start isn't at one and direct them to crop."
 *
 * Crop (tN_crop, tN_lL_crop, tN_all_lanes_crop) moves the loop window to step 1
 * and removes everything outside it: the window's steps land on [0, length),
 * the rest of the clip is cleared, loop_start becomes 0, the length stays.
 * Linked automation that follows the clip moves with the notes; a lane on its
 * own Loop, and an unlinked lane, stay where they are. One Undo restores it.
 * A crop with nothing to do takes no undo snapshot and changes nothing.
 *
 * Every clip transform — Clock Shift, Nudge, Beat Stretch (both ways), Legato
 * and Resolution Zoom — is REFUSED (nothing changes) while the loop does not
 * start at step 1: on the clip, on the lane, and for ALL LANES when any lane's
 * loop is off step 1 (Josh: "these should require clip start at 1 too for
 * consistency"). Nudge 0 (the counter reset) still resets.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

#define TPS 24
#define LS  64
#define LEN 64
#define PACK(ls, len) ((long)(ls) * 65536L + (long)(len))

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }
static clip_t *mclip(hx_t *h) { return &I(h)->tracks[1].clips[0]; }
static clip_t *lane(hx_t *h, int l) {
    seq8_track_t *tr = &I(h)->tracks[0];
    return &tr->drum_clips[tr->active_clip]->lanes[l].clip;
}
static void toggle(hx_t *h, int step) {
    char k[64];
    snprintf(k, sizeof k, "t1_c0_step_%d_toggle", step);
    hx_set_param(h, k, "60 100");
}
static void loop_set(hx_t *h, int ls, int len) {
    char v[32];
    snprintf(v, sizeof v, "%ld", PACK(ls, len));
    hx_set_param(h, "t1_c0_loop_set", v);
}
static void dtoggle(hx_t *h, int l, int step) {
    char k[64];
    snprintf(k, sizeof k, "t0_l%d_step_%d_toggle", l, step);
    hx_set_param(h, k, "100");
}
static void dloop_set(hx_t *h, int l, int ls, int len) {
    char k[64], v[32];
    snprintf(k, sizeof k, "t0_l%d_loop_set", l);
    snprintf(v, sizeof v, "%ld", PACK(ls, len));
    hx_set_param(h, k, v);
}
static int has_note_at(const clip_t *cl, uint32_t tick) {
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].active && cl->notes[i].tick == tick) return 1;
    return 0;
}
static int any_step_from(const clip_t *cl, int from) {
    for (int s = from; s < SEQ_STEPS; s++)
        if (cl->steps[s] || cl->step_note_count[s]) return 1;
    return 0;
}

/* ---- automation helpers (as in test_clock_shift_loop_start.c) ------------ */
#define MTG  "1:synth:cutoff"
#define MTG2 "1:synth:reso"
#define MTG3 "1:synth:drive"
#define DTG  "1:synth:reso"
#define DTG2 "1:synth:drive"

static void pa_set(hx_t *h, int track, const char *tgt, int tick, int v) {
    char k[32], val[128];
    snprintf(k, sizeof k, "t%d_pa_set", track);
    snprintf(val, sizeof val, "0 %s %d %d", tgt, tick, v);
    hx_set_param(h, k, val);
}
static pa_entry_t *pentry(hx_t *h, int track, const char *tgt) {
    return pa_find(I(h), track, 0, pa_target_lookup(I(h), tgt));
}
static const char *pts(hx_t *h, int track, const char *tgt) {
    static char buf[4][512];
    static int k = 0;
    char *b = buf[k++ & 3];
    pa_entry_t *e = pentry(h, track, tgt);
    b[0] = '\0';
    if (!e) return b;
    for (int i = 0; i < e->count; i++) {
        char one[32];
        snprintf(one, sizeof one, "%s%u:%u", i ? " " : "", e->points[i].tick, e->points[i].val);
        strcat(b, one);
    }
    return b;
}
#define PTS_EQ(track, tgt, want, msg) do { \
    const char *_g = pts(h, track, tgt); \
    if (strcmp(_g, want)) { printf("  FAIL — %s\n    got  \"%s\"\n    want \"%s\"\n", msg, _g, want); exit(1); } \
} while (0)

/* A melodic clip (track index 1): notes on 70 and 127 inside the 64..127
 * window, on 3 and 200 outside it. */
static hx_t *melodic(void) {
    hx_t *h = hx_create(NULL);
    toggle(h, 3); toggle(h, 70); toggle(h, 127); toggle(h, 200);
    loop_set(h, LS, LEN);
    clip_t *cl = mclip(h);
    HX_ASSERT(cl->loop_start == LS && cl->length == LEN, "setup: the window");
    HX_ASSERT(cl->steps[3] && cl->steps[70] && cl->steps[127] && cl->steps[200], "setup: the steps");
    return h;
}

static clip_t snap_a, snap_b;
static char pts_before[3][512];

/* Nothing about the clip (steps, notes, window, counters) or its automation
 * changed since the snapshot. */
static void take_snap(hx_t *h, const clip_t *cl, int track, const char *t1, const char *t2) {
    memcpy(&snap_a, cl, sizeof snap_a);
    strcpy(pts_before[0], pts(h, track, t1));
    strcpy(pts_before[1], t2 ? pts(h, track, t2) : "");
}
static int unchanged(hx_t *h, const clip_t *cl, int track, const char *t1, const char *t2) {
    memcpy(&snap_b, cl, sizeof snap_b);
    return !memcmp(&snap_a, &snap_b, sizeof snap_a)
        && !strcmp(pts_before[0], pts(h, track, t1))
        && !strcmp(pts_before[1], t2 ? pts(h, track, t2) : "");
}

int main(void) {
    /* ---- melodic Crop ------------------------------------------------------ */
    {
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        /* a sub-step note: step 100 played 5 ticks late */
        toggle(h, 100);
        cl->note_tick_offset[100][0] = 5;
        clip_migrate_to_notes(cl);
        cl->step_ratchet[70] = 3;
        cl->step_iter[127] = (2 << 4) | 1;
        hx_set_param(h, "t1_crop", "1");
        HX_ASSERT(cl->loop_start == 0, "crop: the loop starts at step 1");
        HX_ASSERT(cl->length == LEN, "crop: the length is unchanged");
        HX_ASSERT(cl->steps[6] && cl->steps[63] && cl->steps[36], "crop: 70 -> 6, 127 -> 63, 100 -> 36");
        HX_ASSERT(!cl->steps[3] && !any_step_from(cl, LEN), "crop: nothing outside the window is left");
        HX_ASSERT(cl->step_ratchet[6] == 3 && cl->step_iter[63] == ((2 << 4) | 1), "crop: the trig conditions travel");
        HX_ASSERT(cl->step_ratchet[70] == 0 && cl->step_iter[127] == 0, "crop: the old places are reset");
        HX_ASSERT(cl->step_vel[200] == SEQ_VEL && cl->step_gate[200] == GATE_TICKS, "crop: outside reset to defaults");
        HX_ASSERT(cl->note_tick_offset[36][0] == 5, "crop: a sub-step offset survives");
        HX_ASSERT(has_note_at(cl, 6 * TPS) && has_note_at(cl, 63 * TPS) && has_note_at(cl, 36 * TPS + 5),
                  "crop: the note list follows");
        HX_ASSERT(!has_note_at(cl, 3 * TPS) && !has_note_at(cl, 200 * TPS) && !has_note_at(cl, 70 * TPS),
                  "crop: no note outside is left in the list");
        HX_ASSERT(cl->active, "crop: the clip is active");
        OK("melodic Crop moves the window to step 1 and removes everything outside it");
        hx_destroy(h);
    }
    {   /* a negative offset on the window's first step would wrap to the clip's end */
        hx_t *h = hx_create(NULL);
        toggle(h, 64);
        loop_set(h, LS, 16);
        clip_t *cl = mclip(h);
        cl->note_tick_offset[64][0] = -3;
        clip_migrate_to_notes(cl);
        hx_set_param(h, "t1_crop", "1");
        HX_ASSERT(cl->steps[0] && cl->note_tick_offset[0][0] == 0 && has_note_at(cl, 0),
                  "crop: an early note on the new step 1 is clamped to it, not wrapped");
        OK("melodic Crop clamps an early note on the window's first step to step 1");
        hx_destroy(h);
    }

    /* ---- melodic Crop: automation ------------------------------------------ */
    {
        hx_t *h = melodic();
        pa_set(h, 1, MTG, 10 * TPS, 100);          /* before the window */
        pa_set(h, 1, MTG, 70 * TPS, 200);
        pa_set(h, 1, MTG, 127 * TPS, 300);
        pa_set(h, 1, MTG, 200 * TPS, 400);         /* after the window */
        pa_set(h, 1, MTG2, 70 * TPS, 11);          /* own Loop: its own clock */
        pa_set(h, 1, MTG2, 200 * TPS, 12);
        pentry(h, 1, MTG2)->loop_len = 32 * TPS;
        pa_set(h, 1, MTG3, 70 * TPS, 21);          /* Link: Off */
        pa_set(h, 1, MTG3, 3 * TPS, 22);
        pentry(h, 1, MTG3)->flags |= PA_FLAG_UNLINKED;
        const char *own = "1680:11 4800:12", *unl = "72:22 1680:21";
        PTS_EQ(1, MTG2, own, "setup: own-Loop lane");
        PTS_EQ(1, MTG3, unl, "setup: unlinked lane");
        hx_set_param(h, "t1_crop", "1");
        PTS_EQ(1, MTG, "144:200 1512:300", "crop: in-window points shift to the new start, outside removed");
        PTS_EQ(1, MTG2, own, "crop: a lane on its own Loop is untouched");
        PTS_EQ(1, MTG3, unl, "crop: an unlinked lane is untouched");
        OK("melodic Crop moves linked automation with the notes and leaves cycled / unlinked lanes");
        hx_set_param(h, "undo_restore", "1");
        clip_t *cl = mclip(h);
        HX_ASSERT(cl->loop_start == LS && cl->length == LEN, "undo: the window is back");
        HX_ASSERT(cl->steps[3] && cl->steps[70] && cl->steps[127] && cl->steps[200] && !cl->steps[6],
                  "undo: the steps are back");
        HX_ASSERT(has_note_at(cl, 200 * TPS), "undo: the notes are back");
        PTS_EQ(1, MTG, "240:100 1680:200 3048:300 4800:400", "undo: the automation is back");
        OK("one Undo restores a melodic Crop, automation included");
        hx_destroy(h);
    }

    /* ---- no-op Crop takes no undo snapshot --------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        toggle(h, 2); toggle(h, 9);
        clip_t *cl = mclip(h);
        HX_ASSERT(cl->loop_start == 0 && cl->length == 16, "setup: default window");
        uint16_t g2 = cl->step_gate[2];
        hx_set_param(h, "t1_lgto_apply", "1");     /* an undoable edit */
        HX_ASSERT(cl->step_gate[2] != g2, "setup: legato changed the gate");
        take_snap(h, cl, 1, MTG, NULL);
        unsigned r = (unsigned)I(h)->rui_rev;
        hx_set_param(h, "t1_crop", "1");
        HX_ASSERT(unchanged(h, cl, 1, MTG, NULL), "no-op crop: nothing changed");
        HX_ASSERT((unsigned)I(h)->rui_rev == r, "no-op crop: no rev bump");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(cl->step_gate[2] == g2, "no-op crop: Undo still undoes the legato (no snapshot was taken)");
        OK("a Crop with nothing to do changes nothing and keeps the previous undo unit");
        hx_destroy(h);
    }
    {   /* loop at step 1, but a note past the loop end */
        hx_t *h = hx_create(NULL);
        toggle(h, 2); toggle(h, 20);
        clip_t *cl = mclip(h);
        hx_set_param(h, "t1_crop", "1");
        HX_ASSERT(cl->steps[2] && !cl->steps[20] && cl->length == 16, "crop: the note past the loop end is removed");
        HX_ASSERT(!has_note_at(cl, 20 * TPS), "crop: and its note");
        OK("Crop with the loop at step 1 removes notes after the loop end");
        hx_destroy(h);
    }

    /* ---- drum lane Crop ---------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 3); dtoggle(h, 0, 70); dtoggle(h, 0, 127);
        dtoggle(h, 1, 70);
        dloop_set(h, 0, LS, LEN);
        dloop_set(h, 1, LS, LEN);
        pa_set(h, 0, DTG2, 70 * TPS, 5);
        pentry(h, 0, DTG2)->loop_len = 0; pentry(h, 0, DTG2)->loop_off = 0;
        const char *before = pts(h, 0, DTG2);
        char bcopy[128]; strcpy(bcopy, before);
        clip_t *l0 = lane(h, 0), *l1 = lane(h, 1);
        hx_set_param(h, "t0_l0_crop", "1");
        HX_ASSERT(l0->loop_start == 0 && l0->length == LEN, "lane crop: its window at step 1");
        HX_ASSERT(l0->steps[6] && l0->steps[63] && !l0->steps[3] && !any_step_from(l0, LEN), "lane crop: the steps");
        HX_ASSERT(l1->loop_start == LS && l1->steps[70] && !l1->steps[6], "lane crop: the other lane is untouched");
        PTS_EQ(0, DTG2, bcopy, "lane crop: touches no automation");
        OK("a drum lane's Crop crops that lane only, and no automation");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(l0->loop_start == LS && l0->steps[70] && l0->steps[3], "lane crop: Undo restores it");
        OK("one Undo restores a lane Crop");
        hx_destroy(h);
    }

    /* ---- ALL LANES Crop ---------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 3); dtoggle(h, 0, 70); dtoggle(h, 0, 127);
        dtoggle(h, 5, 40); dtoggle(h, 5, 200);
        dloop_set(h, 0, LS, LEN);                     /* the longest lane: 64..127 */
        dloop_set(h, 5, 32, 16);                      /* 32..47 */
        pa_set(h, 0, DTG, 70 * TPS, 11);              /* cycled: adopts lane 0's window */
        pa_entry_t *cy = pentry(h, 0, DTG);
        HX_ASSERT(cy && cy->loop_len, "setup: a cycled lane");
        char cyb[128]; strcpy(cyb, pts(h, 0, DTG));
        pa_set(h, 0, DTG2, 10 * TPS, 21);
        pa_set(h, 0, DTG2, 70 * TPS, 22);
        pa_set(h, 0, DTG2, 127 * TPS, 23);
        pa_entry_t *nc = pentry(h, 0, DTG2);
        nc->loop_len = 0; nc->loop_off = 0; nc->step_ticks = 0;
        hx_set_param(h, "t0_all_lanes_crop", "1");
        clip_t *l0 = lane(h, 0), *l5 = lane(h, 5);
        HX_ASSERT(l0->loop_start == 0 && l0->steps[6] && l0->steps[63] && !l0->steps[3] && !any_step_from(l0, LEN),
                  "ALL LANES crop: lane 0 in its window");
        HX_ASSERT(l5->loop_start == 0 && l5->length == 16 && l5->steps[8] && !any_step_from(l5, 16),
                  "ALL LANES crop: lane 5 in ITS window");
        PTS_EQ(0, DTG2, "144:22 1512:23", "ALL LANES crop: un-cycled automation by the longest lane's start");
        PTS_EQ(0, DTG, cyb, "ALL LANES crop: a cycled lane is untouched");
        OK("ALL LANES Crop crops every lane in its own window and moves un-cycled automation");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(l0->loop_start == LS && l0->steps[70] && l0->steps[3], "undo: lane 0");
        HX_ASSERT(l5->loop_start == 32 && l5->steps[40] && l5->steps[200], "undo: lane 5");
        PTS_EQ(0, DTG2, "240:21 1680:22 3048:23", "undo: the automation");
        OK("one Undo restores every lane of an ALL LANES Crop");
        hx_destroy(h);
    }
    {   /* nothing to do on any lane: no snapshot */
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 2);
        hx_set_param(h, "t0_l0_lgto_apply", "1");
        HX_ASSERT(I(h)->drum_undo_valid, "setup: a drum undo unit");
        uint16_t g = lane(h, 0)->step_gate[2];
        unsigned r = (unsigned)I(h)->rui_rev;
        hx_set_param(h, "t0_all_lanes_crop", "1");
        hx_set_param(h, "t0_l0_crop", "1");
        HX_ASSERT((unsigned)I(h)->rui_rev == r && lane(h, 0)->step_gate[2] == g, "no-op crops change nothing");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(lane(h, 0)->step_gate[2] != g, "no-op crops: Undo still undoes the legato");
        OK("a lane / ALL LANES Crop with nothing to do takes no undo snapshot");
        hx_destroy(h);
    }

    /* ---- refusals: melodic ------------------------------------------------- */
    {
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        pa_set(h, 1, MTG, 70 * TPS, 200);
        take_snap(h, cl, 1, MTG, NULL);
        const char *refused[] = { "t1_clock_shift", "1", "t1_clock_shift", "-1",
                                  "t1_nudge", "1", "t1_nudge", "-1", "t1_beat_stretch", "1",
                                  "t1_beat_stretch", "-1", "t1_lgto_apply", "1",
                                  "t1_clip_resolution_zoom", "0" };
        for (int i = 0; i < 16; i += 2) {
            hx_set_param(h, refused[i], refused[i + 1]);
            char msg[96]; snprintf(msg, sizeof msg, "loop not at 1: %s=%s changes nothing", refused[i], refused[i + 1]);
            HX_ASSERT(unchanged(h, cl, 1, MTG, NULL), msg);
        }
        OK("loop not at 1: melodic Clock Shift, Nudge, Stretch x2 and /2, Legato and Zoom are refused");
        cl->nudge_pos = 7;
        hx_set_param(h, "t1_nudge", "0");
        HX_ASSERT(cl->nudge_pos == 0, "Nudge 0 still resets the counter");
        OK("loop not at 1: the Nudge counter reset still acts");
        hx_destroy(h);
    }
    {   /* after a Crop the same transforms run */
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        hx_set_param(h, "t1_crop", "1");
        hx_set_param(h, "t1_clock_shift", "1");
        HX_ASSERT(cl->steps[7] && cl->steps[0], "after crop: Clock Shift runs");
        hx_set_param(h, "t1_beat_stretch", "-1");
        HX_ASSERT(cl->length == 32 && cl->steps[3], "after crop: Stretch /2 runs");
        uint16_t g = cl->step_gate[3];
        hx_set_param(h, "t1_lgto_apply", "1");
        HX_ASSERT(cl->step_gate[3] != g, "after crop: Legato runs");
        hx_set_param(h, "t1_clip_resolution_zoom", "0");
        HX_ASSERT(cl->ticks_per_step == 12 && cl->length == 64, "after crop: Zoom runs");
        OK("after a Crop, Clock Shift, Stretch /2, Legato and Zoom run again");
        hx_destroy(h);
    }

    /* ---- refusals: drum lane and ALL LANES ---------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 70); dtoggle(h, 3, 5);
        dloop_set(h, 0, LS, LEN);
        clip_t *l0 = lane(h, 0), *l3 = lane(h, 3);
        take_snap(h, l0, 0, DTG2, NULL);
        hx_set_param(h, "t0_l0_clock_shift", "1");
        hx_set_param(h, "t0_l0_clock_shift", "-1");
        hx_set_param(h, "t0_l0_nudge", "1");
        hx_set_param(h, "t0_l0_nudge", "-1");
        hx_set_param(h, "t0_l0_beat_stretch", "1");
        hx_set_param(h, "t0_l0_beat_stretch", "-1");
        hx_set_param(h, "t0_l0_lgto_apply", "1");
        hx_set_param(h, "t0_l0_clip_resolution_zoom", "0");
        HX_ASSERT(unchanged(h, l0, 0, DTG2, NULL), "lane: Shift / Nudge / Stretch / Legato / Zoom refused");
        l0->nudge_pos = 4;
        hx_set_param(h, "t0_l0_nudge", "0");
        HX_ASSERT(l0->nudge_pos == 0, "lane: Nudge 0 still resets");
        OK("loop not at 1: a drum lane refuses Shift, Nudge, Stretch, Legato and Zoom");

        /* ALL LANES, with ONE lane off step 1: atomic refusal */
        char buf[16];
        hx_get_param(h, "t0_lanes_off_grid", buf, sizeof buf);
        HX_ASSERT(!strcmp(buf, "1"), "tN_lanes_off_grid counts the off-grid lane");
        pa_set(h, 0, DTG2, 5 * TPS, 9);
        pentry(h, 0, DTG2)->loop_len = 0; pentry(h, 0, DTG2)->loop_off = 0;
        take_snap(h, l3, 0, DTG2, NULL);
        I(h)->all_lanes_stretch_result = 42;
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        hx_set_param(h, "t0_all_lanes_clock_shift", "-1");
        hx_set_param(h, "t0_all_lanes_nudge", "1");
        hx_set_param(h, "t0_all_lanes_nudge", "-1");
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        hx_set_param(h, "t0_all_lanes_beat_stretch", "-1");
        HX_ASSERT(unchanged(h, l3, 0, DTG2, NULL), "ALL LANES: an on-grid lane did not move either");
        HX_ASSERT(I(h)->all_lanes_stretch_result == 42, "ALL LANES: the refusal leaves the stretch result alone");
        l3->nudge_pos = 2;
        hx_set_param(h, "t0_all_lanes_nudge", "0");
        HX_ASSERT(l3->nudge_pos == 0, "ALL LANES: Nudge 0 still resets");
        OK("loop not at 1 on ONE lane: ALL LANES refuses Shift, Nudge and Stretch on every lane");
        hx_set_param(h, "t0_all_lanes_crop", "1");
        hx_get_param(h, "t0_lanes_off_grid", buf, sizeof buf);
        HX_ASSERT(!strcmp(buf, "0"), "after ALL LANES crop: 0 lanes off grid");
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        HX_ASSERT(l3->steps[6] && !l3->steps[5], "after crop: ALL LANES Clock Shift runs");
        OK("after ALL LANES Crop, ALL LANES Clock Shift runs again");
        hx_get_param(h, "t1_lanes_off_grid", buf, sizeof buf);
        HX_ASSERT(!strcmp(buf, "0"), "a melodic track reads 0");
        OK("tN_lanes_off_grid reads 0 on a melodic track");
        hx_destroy(h);
    }

    /* ---- Crop while playing ------------------------------------------------ */
    {
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        seq8_track_t *tr = &I(h)->tracks[1];
        hx_set_param(h, "transport", "play");
        HX_ASSERT(I(h)->playing, "setup: playing");
        hx_render(h, 40);
        HX_ASSERT(tr->current_step >= LS && tr->current_step < LS + LEN, "setup: the playhead is in the window");
        hx_set_param(h, "t1_crop", "1");
        HX_ASSERT(tr->current_step < cl->length, "crop while playing: the playhead is inside the new window");
        hx_render(h, 40);
        HX_ASSERT(tr->current_step < cl->length, "crop while playing: and stays there");
        OK("Crop while playing keeps the playhead inside the window");
        hx_destroy(h);
    }
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 70);
        dloop_set(h, 0, LS, LEN);
        seq8_track_t *tr = &I(h)->tracks[0];
        hx_set_param(h, "transport", "play");
        hx_render(h, 40);
        hx_set_param(h, "t0_all_lanes_crop", "1");
        HX_ASSERT(tr->drum_current_step[0] < LEN, "ALL LANES crop while playing: lane 0's playhead in its window");
        hx_render(h, 40);
        HX_ASSERT(tr->drum_current_step[0] < LEN, "and stays there");
        OK("ALL LANES Crop while playing keeps each lane's playhead in its window");
        hx_destroy(h);
    }

    printf("test_crop_loop_start: %d ok\n", ok_count);
    return 0;
}
