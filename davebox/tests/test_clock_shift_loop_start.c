/* tests/test_clock_shift_loop_start.c — the clip transforms work INSIDE THE LOOP WINDOW.
 *
 * Josh, on the device: "clock shift isn't working on a melodic track" — "it
 * works on some tracks (track 2 of current set, eg) but not on others (track 5
 * of current set)" — confirmed "works when i set the loop start to 1". Track
 * 5's clip was 64 steps long with its loop starting at step 65, so it played
 * steps 64..127, while Clock Shift rotated steps 0..63: every note it moved was
 * one the clip never plays. Nudge, Beat Stretch and Legato indexed the same
 * [0, length) instead of [loop_start, loop_start + length); Beat Stretch's
 * compress also wiped every step outside it.
 *
 * Pinned here, each through the set_param key the UI sends:
 *   - melodic Clock Shift rotates the window (wrap at ITS end), leaves steps
 *     outside it alone, counts clock_shift_pos, and -1 undoes +1;
 *   - melodic Nudge moves a note across a step boundary inside the window and
 *     wraps at the window's end;
 *   - linked automation rotates inside the window with the notes;
 *   - a drum lane's Clock Shift / Nudge, and ALL LANES, in each lane's window,
 *     with the ALL LANES automation (cycled and un-cycled) moving too;
 *   - Beat Stretch expands / compresses inside the window, is refused when the
 *     doubled window would pass step 256, and keeps notes outside it;
 *   - Legato fills each in-window note to the next in-window note, the last to
 *     the window's end;
 *   - with loop_start 0 the rotate and nudge are byte-for-byte the old code
 *     (reference copies below, run over random clips).
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
/* tN_cC_loop_set packs loop_start * 65536 + length. */
#define PACK(ls, len) ((long)(ls) * 65536L + (long)(len))

static clip_t *mclip(hx_t *h) { return &((seq8_instance_t *)h->inst)->tracks[1].clips[0]; }
static clip_t *lane(hx_t *h, int l) {
    seq8_track_t *tr = &((seq8_instance_t *)h->inst)->tracks[0];
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

/* A melodic clip (track index 1) with notes on steps 70 and 127 inside the
 * 64..127 window, and on steps 3 and 200 outside it. */
static hx_t *melodic(void) {
    hx_t *h = hx_create(NULL);
    toggle(h, 3); toggle(h, 70); toggle(h, 127); toggle(h, 200);
    loop_set(h, LS, LEN);
    clip_t *cl = mclip(h);
    HX_ASSERT(cl->loop_start == LS && cl->length == LEN && cl->ticks_per_step == TPS, "setup: the window");
    HX_ASSERT(cl->steps[3] && cl->steps[70] && cl->steps[127] && cl->steps[200], "setup: the steps");
    return h;
}

static int has_note_at(const clip_t *cl, uint32_t tick) {
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].active && cl->notes[i].tick == tick) return 1;
    return 0;
}

/* ---- automation helpers ------------------------------------------------ */
#define MTG "1:synth:cutoff"
#define DTG "1:synth:reso"
#define DTG2 "1:synth:drive"

static void pa_set(hx_t *h, int track, const char *tgt, int tick, int v) {
    char k[32], val[128];
    snprintf(k, sizeof k, "t%d_pa_set", track);
    snprintf(val, sizeof val, "0 %s %d %d", tgt, tick, v);
    hx_set_param(h, k, val);
}
static pa_entry_t *pentry(hx_t *h, int track, const char *tgt) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    return pa_find(in, track, 0, pa_target_lookup(in, tgt));
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

/* ---- the old code, verbatim in behaviour, for the loop_start == 0 check -- */
static void ref_rotate(clip_t *cl, int dir) {
    int len = (int)cl->length;
    uint8_t tmp_s, tmp_nc, tmp_ns[8], tmp_v; uint16_t tmp_g; int16_t tmp_toff[8];
    if (dir == 1) {
        tmp_s = cl->steps[len-1]; memcpy(tmp_ns, cl->step_notes[len-1], 8);
        tmp_nc = cl->step_note_count[len-1]; tmp_v = cl->step_vel[len-1]; tmp_g = cl->step_gate[len-1];
        memcpy(tmp_toff, cl->note_tick_offset[len-1], 8 * sizeof(int16_t));
        memmove(&cl->steps[1], &cl->steps[0], (size_t)(len-1));
        memmove(&cl->step_notes[1][0], &cl->step_notes[0][0], (size_t)(len-1) * 8);
        memmove(&cl->step_note_count[1], &cl->step_note_count[0], (size_t)(len-1));
        memmove(&cl->step_vel[1], &cl->step_vel[0], (size_t)(len-1));
        memmove(&cl->step_gate[1], &cl->step_gate[0], (size_t)(len-1) * 2);
        memmove(&cl->note_tick_offset[1][0], &cl->note_tick_offset[0][0], (size_t)(len-1) * 8 * sizeof(int16_t));
        cl->steps[0] = tmp_s; memcpy(cl->step_notes[0], tmp_ns, 8); cl->step_note_count[0] = tmp_nc;
        cl->step_vel[0] = tmp_v; cl->step_gate[0] = tmp_g; memcpy(cl->note_tick_offset[0], tmp_toff, 8 * sizeof(int16_t));
        cl->clock_shift_pos = (uint16_t)((cl->clock_shift_pos + 1) % (uint16_t)len);
    } else {
        tmp_s = cl->steps[0]; memcpy(tmp_ns, cl->step_notes[0], 8);
        tmp_nc = cl->step_note_count[0]; tmp_v = cl->step_vel[0]; tmp_g = cl->step_gate[0];
        memcpy(tmp_toff, cl->note_tick_offset[0], 8 * sizeof(int16_t));
        memmove(&cl->steps[0], &cl->steps[1], (size_t)(len-1));
        memmove(&cl->step_notes[0][0], &cl->step_notes[1][0], (size_t)(len-1) * 8);
        memmove(&cl->step_note_count[0], &cl->step_note_count[1], (size_t)(len-1));
        memmove(&cl->step_vel[0], &cl->step_vel[1], (size_t)(len-1));
        memmove(&cl->step_gate[0], &cl->step_gate[1], (size_t)(len-1) * 2);
        memmove(&cl->note_tick_offset[0][0], &cl->note_tick_offset[1][0], (size_t)(len-1) * 8 * sizeof(int16_t));
        cl->steps[len-1] = tmp_s; memcpy(cl->step_notes[len-1], tmp_ns, 8); cl->step_note_count[len-1] = tmp_nc;
        cl->step_vel[len-1] = tmp_v; cl->step_gate[len-1] = tmp_g; memcpy(cl->note_tick_offset[len-1], tmp_toff, 8 * sizeof(int16_t));
        cl->clock_shift_pos = (uint16_t)((cl->clock_shift_pos + (uint16_t)(len-1)) % (uint16_t)len);
    }
    int i, any = 0;
    for (i = 0; i < len; i++) if (cl->steps[i]) { any = 1; break; }
    cl->active = (uint8_t)any;
}

static void ref_nudge(clip_t *cl, int dir, int drum) {
    int len = (int)cl->length, tps = (int)cl->ticks_per_step, midpoint = tps / 2;
    struct { int16_t dst, dst_off; uint8_t pitch, vel, active; uint16_t gate; } cross[512];
    int ncross = 0, s, ni, wi;
    for (s = 0; s < len; s++) {
        if (cl->step_note_count[s] == 0) continue;
        wi = 0;
        for (ni = 0; ni < (int)cl->step_note_count[s]; ni++) {
            int new_off = (int)cl->note_tick_offset[s][ni] + dir;
            if (drum ? new_off >= midpoint : new_off > midpoint) {
                if (ncross < 512) {
                    cross[ncross].dst = (int16_t)((s + 1) % len); cross[ncross].dst_off = (int16_t)(new_off - tps);
                    cross[ncross].pitch = cl->step_notes[s][ni]; cross[ncross].vel = cl->step_vel[s];
                    cross[ncross].gate = cl->step_gate[s]; cross[ncross].active = cl->steps[s]; ncross++;
                }
            } else if (new_off < -midpoint) {
                if (ncross < 512) {
                    cross[ncross].dst = (int16_t)((s - 1 + len) % len); cross[ncross].dst_off = (int16_t)(new_off + tps);
                    cross[ncross].pitch = cl->step_notes[s][ni]; cross[ncross].vel = cl->step_vel[s];
                    cross[ncross].gate = cl->step_gate[s]; cross[ncross].active = cl->steps[s]; ncross++;
                }
            } else {
                cl->step_notes[s][wi] = cl->step_notes[s][ni];
                cl->note_tick_offset[s][wi] = (int16_t)new_off;
                wi++;
            }
        }
        for (ni = wi; ni < (int)cl->step_note_count[s]; ni++) { cl->step_notes[s][ni] = 0; cl->note_tick_offset[s][ni] = 0; }
        cl->step_note_count[s] = (uint8_t)wi;
        if (wi == 0) { cl->steps[s] = 0; cl->step_vel[s] = (uint8_t)SEQ_VEL; cl->step_gate[s] = (uint16_t)GATE_TICKS; }
    }
    for (int ci = 0; ci < ncross; ci++) {
        int dst = (int)cross[ci].dst;
        if (cl->step_note_count[dst] >= 8) continue;
        int slot = (int)cl->step_note_count[dst];
        cl->step_notes[dst][slot] = cross[ci].pitch; cl->note_tick_offset[dst][slot] = cross[ci].dst_off;
        if (slot == 0) { cl->step_vel[dst] = cross[ci].vel; cl->step_gate[dst] = cross[ci].gate; }
        if (cross[ci].active) cl->steps[dst] = 1;
        cl->step_note_count[dst]++;
    }
    int any2 = 0;
    for (s = 0; s < len; s++) if (cl->steps[s]) { any2 = 1; break; }
    cl->active = (uint8_t)any2;
    cl->nudge_pos += (int16_t)dir;
}

static void random_clip(clip_t *cl, int len) {
    memset(cl, 0, sizeof *cl);
    cl->length = (uint16_t)len; cl->loop_start = 0; cl->ticks_per_step = TPS;
    cl->clock_shift_pos = (uint16_t)(rand() % len);
    for (int s = 0; s < SEQ_STEPS; s++) {
        int nc = (rand() % 3 == 0) ? rand() % 9 : 0;
        cl->step_note_count[s] = (uint8_t)nc;
        cl->steps[s] = (uint8_t)(nc ? rand() % 2 : 0);
        cl->step_vel[s] = (uint8_t)(rand() % 128);
        cl->step_gate[s] = (uint16_t)(rand() % 400);
        for (int n = 0; n < 8; n++) {
            cl->step_notes[s][n] = n < nc ? (uint8_t)(rand() % 128) : 0;
            cl->note_tick_offset[s][n] = n < nc ? (int16_t)(rand() % 23 - 11) : 0;
        }
    }
}

static int same_steps(const clip_t *a, const clip_t *b) {
    return !memcmp(a->steps, b->steps, sizeof a->steps)
        && !memcmp(a->step_notes, b->step_notes, sizeof a->step_notes)
        && !memcmp(a->step_note_count, b->step_note_count, sizeof a->step_note_count)
        && !memcmp(a->step_vel, b->step_vel, sizeof a->step_vel)
        && !memcmp(a->step_gate, b->step_gate, sizeof a->step_gate)
        && !memcmp(a->note_tick_offset, b->note_tick_offset, sizeof a->note_tick_offset)
        && a->clock_shift_pos == b->clock_shift_pos && a->active == b->active
        && a->nudge_pos == b->nudge_pos;
}

static clip_t ca, cb;

int main(void) {
    srand(12345);

    /* ---- loop_start 0: byte-for-byte the old code ------------------------ */
    {
        for (int it = 0; it < 400; it++) {
            int len = 2 + rand() % (SEQ_STEPS - 1);
            int dir = (rand() & 1) ? 1 : -1;
            random_clip(&ca, len); cb = ca;
            ref_rotate(&ca, dir);
            clip_rotate_window(&cb, dir);
            HX_ASSERT(same_steps(&ca, &cb), "loop_start 0: the rotate differs from the old code");
        }
        OK("loop_start 0: the rotate is the old code, over 400 random clips");
        for (int it = 0; it < 400; it++) {
            int len = 1 + rand() % SEQ_STEPS;
            int dir = (rand() & 1) ? 1 : -1, drum = rand() & 1;
            random_clip(&ca, len); cb = ca;
            ref_nudge(&ca, dir, drum);
            clip_nudge_window(&cb, dir, drum);
            HX_ASSERT(same_steps(&ca, &cb), "loop_start 0: the nudge differs from the old code");
        }
        OK("loop_start 0: the nudge (both thresholds) is the old code, over 400 random clips");
    }

    /* ---- melodic Clock Shift ---------------------------------------------- */
    {
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        hx_set_param(h, "t1_clock_shift", "1");
        HX_ASSERT(cl->steps[71] && !cl->steps[70], "+1: step 70 moves to 71");
        HX_ASSERT(cl->steps[64] && !cl->steps[127], "+1: step 127 wraps to 64, the window's start");
        HX_ASSERT(cl->steps[3] && cl->steps[200] && !cl->steps[4] && !cl->steps[201], "+1: steps outside the window stay put");
        HX_ASSERT(cl->clock_shift_pos == 1, "+1: clock_shift_pos counts 1");
        HX_ASSERT(has_note_at(cl, 71 * TPS) && has_note_at(cl, 64 * TPS) && has_note_at(cl, 3 * TPS),
                  "+1: the note list follows");
        HX_ASSERT(cl->active, "+1: the clip stays active");
        OK("melodic Clock Shift +1 rotates the loop window, wrapping at ITS end");
        hx_set_param(h, "t1_clock_shift", "-1");
        HX_ASSERT(cl->steps[70] && cl->steps[127] && !cl->steps[71] && !cl->steps[64], "-1: back where they were");
        HX_ASSERT(cl->steps[3] && cl->steps[200], "-1: outside still untouched");
        HX_ASSERT(cl->clock_shift_pos == 0, "-1: clock_shift_pos back to 0");
        hx_set_param(h, "t1_clock_shift", "-1");
        HX_ASSERT(cl->steps[69] && cl->steps[126], "-1 again: one step earlier");
        HX_ASSERT(cl->clock_shift_pos == LEN - 1, "-1 from 0: clock_shift_pos wraps to length-1");
        OK("melodic Clock Shift -1 undoes +1, and counts back round the window");
        hx_destroy(h);
    }

    /* ---- melodic Nudge ----------------------------------------------------- */
    {
        hx_t *h = melodic();
        clip_t *cl = mclip(h);
        for (int i = 0; i < 12; i++) hx_set_param(h, "t1_nudge", "1");
        HX_ASSERT(cl->steps[70] && !cl->steps[71], "12 x +1 at tps 24: still on step 70 (melodic threshold is past the midpoint)");
        hx_set_param(h, "t1_nudge", "1");
        HX_ASSERT(cl->steps[71] && !cl->steps[70], "13 x +1: moved on to step 71");
        HX_ASSERT(cl->note_tick_offset[71][0] == 13 - TPS, "13 x +1: offset carried (-11)");
        HX_ASSERT(cl->steps[64] && !cl->steps[127], "13 x +1: step 127 wraps to 64, inside the window");
        HX_ASSERT(cl->steps[3] && cl->note_tick_offset[3][0] == 0, "outside the window: not nudged");
        HX_ASSERT(cl->steps[200] && cl->note_tick_offset[200][0] == 0, "after the window: not nudged");
        HX_ASSERT(cl->nudge_pos == 13, "nudge_pos counts");
        OK("melodic Nudge moves notes across a step inside the window and wraps at its end");
        hx_destroy(h);
    }
    {   /* backwards: the window's first step wraps to its last */
        hx_t *h = hx_create(NULL);
        toggle(h, 3); toggle(h, 64); toggle(h, 70);
        loop_set(h, LS, LEN);
        clip_t *cl = mclip(h);
        for (int i = 0; i < 13; i++) hx_set_param(h, "t1_nudge", "-1");
        HX_ASSERT(cl->steps[69] && !cl->steps[70], "13 x -1: step 70 moved back to 69");
        HX_ASSERT(cl->steps[127] && !cl->steps[64], "13 x -1: step 64 wraps back to 127, the window's end");
        HX_ASSERT(cl->note_tick_offset[127][0] == TPS - 13, "13 x -1: offset carried (+11)");
        HX_ASSERT(cl->steps[3] && !cl->steps[2], "13 x -1: outside untouched");
        OK("melodic Nudge backwards wraps from the window's start to its end");
        hx_destroy(h);
    }
    {   /* a clip whose only notes are in the window stays ACTIVE when shifted
         * (its first `length` steps, [0, 64), are empty) */
        hx_t *h = hx_create(NULL);
        toggle(h, 70);
        loop_set(h, LS, LEN);
        clip_t *cl = mclip(h);
        hx_set_param(h, "t1_clock_shift", "1");
        HX_ASSERT(cl->steps[71] && cl->active, "Clock Shift: active is read from the window");
        hx_set_param(h, "t1_nudge", "1");
        HX_ASSERT(cl->active, "Nudge: active is read from the window");
        hx_set_param(h, "t1_beat_stretch", "-1");
        HX_ASSERT(cl->active && cl->length == 32, "Beat Stretch: active is read from the window");
        OK("a clip with notes only in its window stays active through Shift, Nudge and Stretch");
        hx_destroy(h);
    }

    /* ---- melodic automation follows the notes ------------------------------ */
    {
        hx_t *h = melodic();
        pa_set(h, 1, MTG, 10 * TPS, 100);          /* before the window */
        pa_set(h, 1, MTG, 70 * TPS, 200);
        pa_set(h, 1, MTG, 127 * TPS, 300);
        pa_set(h, 1, MTG, 200 * TPS, 400);         /* after the window */
        PTS_EQ(1, MTG, "240:100 1680:200 3048:300 4800:400", "setup: the points");
        hx_set_param(h, "t1_clock_shift", "1");
        PTS_EQ(1, MTG, "240:100 1536:300 1704:200 4800:400",
               "Clock Shift: 70 -> 71, 127 wraps to 64, outside unmoved");
        hx_set_param(h, "t1_clock_shift", "-1");
        PTS_EQ(1, MTG, "240:100 1680:200 3048:300 4800:400", "Clock Shift -1: back");
        OK("melodic Clock Shift rotates linked automation inside the window");
        hx_set_param(h, "t1_nudge", "-1");
        PTS_EQ(1, MTG, "240:100 1679:200 3047:300 4800:400", "Nudge -1: one tick earlier");
        hx_set_param(h, "t1_nudge", "1");
        hx_set_param(h, "t1_nudge", "1");
        PTS_EQ(1, MTG, "240:100 1681:200 3049:300 4800:400", "Nudge +1 x2");
        pa_set(h, 1, MTG, 128 * TPS - 1, 500);     /* the window's last tick */
        hx_set_param(h, "t1_nudge", "1");
        PTS_EQ(1, MTG, "240:100 1536:500 1682:200 3050:300 4800:400", "Nudge: the last tick wraps to the window's first");
        OK("melodic Nudge moves linked automation inside the window, wrapping at its end");
        hx_destroy(h);
    }

    /* ---- drum lane Clock Shift / Nudge ------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 3); dtoggle(h, 0, 70); dtoggle(h, 0, 127);
        dloop_set(h, 0, LS, LEN);
        clip_t *dl = lane(h, 0);
        HX_ASSERT(dl->loop_start == LS && dl->length == LEN, "setup: the lane window");
        hx_set_param(h, "t0_l0_clock_shift", "1");
        HX_ASSERT(dl->steps[71] && !dl->steps[70] && dl->steps[64] && !dl->steps[127], "lane +1: inside the window");
        HX_ASSERT(dl->steps[3] && !dl->steps[4], "lane +1: outside untouched");
        HX_ASSERT(dl->clock_shift_pos == 1, "lane +1: clock_shift_pos");
        hx_set_param(h, "t0_l0_clock_shift", "-1");
        HX_ASSERT(dl->steps[70] && dl->steps[127] && dl->clock_shift_pos == 0, "lane -1: back");
        OK("a drum lane's Clock Shift rotates its own window");
        for (int i = 0; i < 11; i++) hx_set_param(h, "t0_l0_nudge", "1");
        HX_ASSERT(dl->steps[70] && !dl->steps[71], "lane 11 x +1: not yet");
        hx_set_param(h, "t0_l0_nudge", "1");
        HX_ASSERT(dl->steps[71] && !dl->steps[70], "lane 12 x +1: crosses (the drum threshold is AT the midpoint)");
        HX_ASSERT(dl->steps[64] && !dl->steps[127], "lane nudge: 127 wraps to 64");
        HX_ASSERT(dl->steps[3] && dl->note_tick_offset[3][0] == 0, "lane nudge: outside untouched");
        OK("a drum lane's Nudge works inside its window, keeping the drum threshold");
        hx_destroy(h);
    }

    /* ---- ALL LANES --------------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 70); dtoggle(h, 0, 127); dtoggle(h, 0, 3);
        dtoggle(h, 5, 80);
        for (int l = 0; l < DRUM_LANES; l++) dloop_set(h, l, LS, LEN);
        dloop_set(h, 5, 32, 64);                     /* its own window: 32..95 */
        dtoggle(h, 5, 95);
        /* One lane with a cycle (the active pad's, adopted on write) and one
         * without (the pads' aftertouch kind) — each moves in its own window. */
        pa_set(h, 0, DTG, 70 * TPS, 11);
        pa_set(h, 0, DTG, 127 * TPS, 12);
        pa_entry_t *cy = pentry(h, 0, DTG);
        HX_ASSERT(cy && cy->loop_len == LEN * TPS && cy->loop_off == LS * TPS, "setup: the cycled lane took the pad's window");
        pa_set(h, 0, DTG2, 70 * TPS, 21);
        pa_set(h, 0, DTG2, 127 * TPS, 22);
        pa_set(h, 0, DTG2, 10 * TPS, 23);
        pa_entry_t *nc = pentry(h, 0, DTG2);
        nc->loop_len = 0; nc->loop_off = 0; nc->step_ticks = 0;
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        clip_t *l0 = lane(h, 0), *l5 = lane(h, 5);
        HX_ASSERT(l0->steps[71] && !l0->steps[70] && l0->steps[64] && !l0->steps[127], "lane 0: its window 64..127");
        HX_ASSERT(l0->steps[3], "lane 0: outside untouched");
        HX_ASSERT(l5->steps[81] && !l5->steps[80] && l5->steps[32] && !l5->steps[95], "lane 5: ITS window 32..95");
        OK("ALL LANES Clock Shift rotates each lane in its own window");
        PTS_EQ(0, DTG, "1536:12 1704:11", "the cycled automation lane: inside its cycle");
        PTS_EQ(0, DTG2, "240:23 1536:22 1704:21", "the un-cycled automation lane: inside the longest lane's window");
        OK("ALL LANES Clock Shift moves automation in the window, start included");
        hx_set_param(h, "t0_all_lanes_nudge", "-1");
        PTS_EQ(0, DTG2, "240:23 1703:21 3071:22", "ALL LANES Nudge -1: one tick, the first tick wrapping to the last");
        hx_set_param(h, "t0_all_lanes_nudge", "1");
        hx_set_param(h, "t0_all_lanes_nudge", "1");
        pa_set(h, 0, DTG2, 128 * TPS - 1, 24);
        nc->loop_len = 0; nc->loop_off = 0; nc->step_ticks = 0;
        hx_set_param(h, "t0_all_lanes_nudge", "1");
        PTS_EQ(0, DTG2, "240:23 1536:24 1538:22 1706:21", "ALL LANES Nudge: the window's last tick wraps to its first");
        HX_ASSERT(l0->nudge_pos == 2, "ALL LANES Nudge: lane nudge_pos");
        OK("ALL LANES Nudge moves automation in the window, start included");
        hx_destroy(h);
    }

    /* ---- Beat Stretch ------------------------------------------------------ */
    {
        hx_t *h = hx_create(NULL);
        toggle(h, 3); toggle(h, 64); toggle(h, 70); toggle(h, 95); toggle(h, 200);
        loop_set(h, LS, 32);
        pa_set(h, 1, MTG, 10 * TPS, 1);
        pa_set(h, 1, MTG, 70 * TPS, 2);
        clip_t *cl = mclip(h);
        hx_set_param(h, "t1_beat_stretch", "1");
        HX_ASSERT(cl->length == 64 && cl->loop_start == LS, "x2: the window doubles from its start");
        HX_ASSERT(cl->steps[64] && cl->steps[76] && cl->steps[126], "x2: 64 -> 64, 70 -> 76, 95 -> 126");
        HX_ASSERT(!cl->steps[70] && !cl->steps[95], "x2: the old places are empty");
        HX_ASSERT(cl->steps[3] && cl->steps[200], "x2: outside the window untouched");
        PTS_EQ(1, MTG, "240:1 1824:2", "x2: automation scales from the window's start");
        OK("Beat Stretch x2 works inside the window");
        hx_set_param(h, "t1_beat_stretch", "-1");
        HX_ASSERT(cl->length == 32, "/2: back to 32");
        HX_ASSERT(cl->steps[64] && cl->steps[70] && cl->steps[95], "/2: back where they were");
        HX_ASSERT(!cl->steps[76] && !cl->steps[126], "/2: the doubled places are empty");
        HX_ASSERT(cl->steps[3] && cl->steps[200], "/2: notes OUTSIDE the window survive");
        HX_ASSERT(has_note_at(cl, 3 * TPS) && has_note_at(cl, 200 * TPS), "/2: and their notes");
        PTS_EQ(1, MTG, "240:1 1680:2", "/2: automation back");
        OK("Beat Stretch /2 works inside the window and keeps notes outside it");
        loop_set(h, LS, 100);                         /* 64 + 200 > 256; 2 x 100 alone is not */
        hx_set_param(h, "t1_beat_stretch", "1");
        HX_ASSERT(cl->length == 100 && cl->loop_start == LS, "x2 refused when the doubled window passes step 256");
        HX_ASSERT(cl->loop_start + cl->length <= SEQ_STEPS, "the window stays inside storage");
        OK("Beat Stretch x2 is refused when loop start + 2 x length > 256");
        hx_destroy(h);
    }
    {   /* a drum lane, and ALL LANES */
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 3); dtoggle(h, 0, 70); dtoggle(h, 0, 95);
        dloop_set(h, 0, LS, 32);
        clip_t *dl = lane(h, 0);
        hx_set_param(h, "t0_l0_beat_stretch", "1");
        HX_ASSERT(dl->length == 64 && dl->steps[76] && dl->steps[126] && !dl->steps[70], "lane x2: in its window");
        hx_set_param(h, "t0_l0_beat_stretch", "-1");
        HX_ASSERT(dl->length == 32 && dl->steps[70] && dl->steps[95] && dl->steps[3], "lane /2: back, outside kept");
        dloop_set(h, 0, LS, 100);
        hx_set_param(h, "t0_l0_beat_stretch", "1");
        HX_ASSERT(dl->length == 100, "lane x2 refused past step 256");
        OK("a drum lane's Beat Stretch works inside its window");
        for (int l = 0; l < DRUM_LANES; l++) dloop_set(h, l, LS, 32);
        pa_set(h, 0, DTG2, 10 * TPS, 1);
        pa_set(h, 0, DTG2, 70 * TPS, 2);
        pa_entry_t *nc = pentry(h, 0, DTG2);
        nc->loop_len = 0; nc->loop_off = 0; nc->step_ticks = 0;
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        HX_ASSERT(in->all_lanes_stretch_result == 1, "ALL LANES x2 ran");
        HX_ASSERT(dl->length == 64 && dl->steps[76] && dl->steps[126] && dl->steps[3], "ALL LANES x2: in the window");
        PTS_EQ(0, DTG2, "240:1 1824:2", "ALL LANES x2: un-cycled automation scales from the window's start");
        hx_set_param(h, "t0_all_lanes_beat_stretch", "-1");
        HX_ASSERT(dl->length == 32 && dl->steps[70] && dl->steps[95] && dl->steps[3], "ALL LANES /2: back, outside kept");
        dloop_set(h, 7, LS, 100);
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        HX_ASSERT(in->all_lanes_stretch_result == -1 && dl->length == 32, "ALL LANES x2 refused when one lane would pass 256");
        OK("ALL LANES Beat Stretch works inside each lane's window");
        hx_destroy(h);
    }

    /* ---- Legato ------------------------------------------------------------ */
    {
        hx_t *h = melodic();                         /* 3, 70, 127, 200; window 64..127 */
        toggle(h, 80);
        clip_t *cl = mclip(h);
        uint16_t g3 = cl->step_gate[3], g200 = cl->step_gate[200];
        hx_set_param(h, "t1_lgto_apply", "1");
        HX_ASSERT(cl->step_gate[70] == 10 * TPS, "70 fills to the next in-window note, 80");
        HX_ASSERT(cl->step_gate[80] == 47 * TPS, "80 fills to 127");
        HX_ASSERT(cl->step_gate[127] == 1 * TPS, "127, the last, fills to the window's end");
        HX_ASSERT(cl->step_gate[3] == g3 && cl->step_gate[200] == g200, "notes outside the window keep their gates");
        OK("Legato works inside the window, the last note filling to its end");
        hx_destroy(h);
    }

    printf("test_clock_shift_loop_start: %d ok\n", ok_count);
    return 0;
}
