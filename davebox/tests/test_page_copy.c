/* tests/test_page_copy.c — Page copy: hold Loop + Copy, tap a page, tap another.
 *
 * Josh, 2026-09-30: "Sequence page copy/paste: Allow entire sequence pages to
 * be copied and pasted while holding the loop button using copy+step button.
 * works like all other copy operations (Sticky, etc.). if a paste would extend
 * beyond the clip length, then extend the clip length to accommodate."
 * Ruled the same day: notes only (no automation), and a paste before the loop
 * start moves the loop start back.
 *
 * tN_cC_page_copy / tN_lL_page_copy / tN_all_lanes_page_copy "src dst cut":
 * - the destination page becomes the source page AS IT PLAYS: every per-step
 *   field; an empty source step clears the destination step; a source step
 *   outside the loop window copies as empty;
 * - cut clears the source page's in-window steps;
 * - the window grows to take the destination page, at the back or the front;
 * - a paste that cannot run changes nothing and takes no undo snapshot;
 *   one Undo restores the pages and the window; refused while recording.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define TPS 24
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
static int step_empty(const clip_t *cl, int s) {
    return !cl->steps[s] && !cl->step_note_count[s] && cl->step_vel[s] == SEQ_VEL
        && cl->step_gate[s] == GATE_TICKS && !cl->step_iter[s] && !cl->step_random[s]
        && !cl->step_ratchet[s];
}
/* Every per-step field of step a equals step b's (b in another snapshot). */
static int step_same(const clip_t *x, int a, const clip_t *y, int b) {
    return x->steps[a] == y->steps[b] && !memcmp(x->step_notes[a], y->step_notes[b], 8)
        && x->step_note_count[a] == y->step_note_count[b] && x->step_vel[a] == y->step_vel[b]
        && x->step_gate[a] == y->step_gate[b]
        && !memcmp(x->note_tick_offset[a], y->note_tick_offset[b], 8 * sizeof(int16_t))
        && x->step_iter[a] == y->step_iter[b] && x->step_random[a] == y->step_random[b]
        && x->step_ratchet[a] == y->step_ratchet[b];
}

static clip_t before, after;

int main(void) {
    /* ---- the copy itself --------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 0); toggle(h, 5); toggle(h, 15);      /* page 0 */
        toggle(h, 18); toggle(h, 30);                   /* page 1: will be overwritten */
        loop_set(h, 0, 32);
        hx_set_param(h, "t1_c0_step_5_set_notes", "60 64 67");
        cl->step_vel[5] = 77; cl->step_gate[5] = 90; cl->note_tick_offset[5][1] = 4;
        cl->step_iter[0] = (2 << 4) | 1; cl->step_random[15] = 40; cl->step_ratchet[15] = 3;
        clip_migrate_to_notes(cl);
        memcpy(&before, cl, sizeof before);
        hx_set_param(h, "t1_c0_page_copy", "0 1 0");
        int s, all = 1;
        for (s = 0; s < 16; s++) if (!step_same(cl, 16 + s, &before, s)) all = 0;
        HX_ASSERT(all, "copy: every per-step field of page 1 equals page 0's");
        HX_ASSERT(step_empty(cl, 18) && step_empty(cl, 30), "copy: an empty source step clears the destination");
        HX_ASSERT(cl->step_note_count[21] == 3 && cl->note_tick_offset[21][1] == 4, "copy: the chord and its timing");
        for (s = 0; s < 16; s++) if (!step_same(cl, s, &before, s)) all = 0;
        HX_ASSERT(all, "copy: the source page is unchanged");
        HX_ASSERT(cl->loop_start == 0 && cl->length == 32, "copy: a paste inside the window keeps it");
        HX_ASSERT(has_note_at(cl, 16 * TPS) && has_note_at(cl, 21 * TPS + 4) && !has_note_at(cl, 18 * TPS),
                  "copy: the note list follows");
        printf("  ok   — melodic page copy replicates every step and clears what the source lacks\n");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(!memcmp(cl->steps, before.steps, sizeof before.steps)
                  && step_same(cl, 18, &before, 18) && step_same(cl, 21, &before, 21),
                  "undo: page 1 is back");
        printf("  ok   — one Undo restores the page\n");
        hx_destroy(h);
    }

    /* ---- the source is what plays ------------------------------------------ */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 2); toggle(h, 10);
        loop_set(h, 0, 8);                              /* 10 is hidden past the end */
        hx_set_param(h, "t1_c0_page_copy", "0 2 0");
        HX_ASSERT(cl->steps[34] && step_empty(cl, 42), "a source step past the loop end copies as empty");
        HX_ASSERT(cl->steps[10], "and it stays where it was");
        printf("  ok   — steps outside the loop window copy as empty\n");
        hx_destroy(h);
    }

    /* ---- growing the window ------------------------------------------------ */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 1);
        loop_set(h, 0, 24);                             /* 1.5 pages */
        hx_set_param(h, "t1_c0_page_copy", "0 1 0");
        HX_ASSERT(cl->loop_start == 0 && cl->length == 32, "a paste onto the partial last page fills it out");
        hx_set_param(h, "t1_c0_page_copy", "0 5 0");
        HX_ASSERT(cl->loop_start == 0 && cl->length == 96 && cl->steps[81], "a paste past the end grows the clip to that page");
        hx_set_param(h, "t1_c0_page_copy", "0 15 0");
        HX_ASSERT(cl->length == 256 && cl->steps[241], "the last page: 256 steps");
        printf("  ok   — a paste past the end grows the clip to the end of that page\n");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(cl->length == 96 && !cl->steps[241], "undo: the length and the page are back");
        printf("  ok   — one Undo restores the length with the page\n");
        hx_destroy(h);
    }
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 50);
        loop_set(h, 48, 16);                            /* page 3 only */
        hx_set_param(h, "t1_c0_page_copy", "3 1 0");
        HX_ASSERT(cl->loop_start == 16 && cl->length == 48 && cl->steps[18],
                  "a paste before the loop start moves the start back to that page");
        printf("  ok   — a paste before the loop start moves the loop start back\n");
        hx_destroy(h);
    }
    {   /* an early note pasted onto step 1 would wrap to the clip's end */
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 16);
        loop_set(h, 16, 16);
        cl->note_tick_offset[16][0] = -3;
        clip_migrate_to_notes(cl);
        hx_set_param(h, "t1_c0_page_copy", "1 0 0");
        HX_ASSERT(cl->steps[0] && cl->note_tick_offset[0][0] == 0 && has_note_at(cl, 0),
                  "an early note pasted onto step 1 is clamped to it");
        printf("  ok   — an early note pasted onto step 1 is not wrapped to the end\n");
        hx_destroy(h);
    }

    /* ---- cut --------------------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 3); toggle(h, 12);
        loop_set(h, 0, 8);                              /* 12 hidden */
        hx_set_param(h, "t1_c0_page_copy", "0 1 1");
        HX_ASSERT(cl->steps[19] && step_empty(cl, 3), "cut: pasted, and the source step cleared");
        HX_ASSERT(cl->steps[12], "cut: a hidden step outside the window is not touched");
        HX_ASSERT(cl->length == 32, "cut: the window grew to the pasted page");
        HX_ASSERT(cl->active, "cut: the clip is still active");
        printf("  ok   — cut pastes, then clears the source page's in-window steps\n");
        hx_destroy(h);
    }

    /* ---- refusals ---------------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 2); toggle(h, 9);
        uint16_t g2 = cl->step_gate[2];
        hx_set_param(h, "t1_lgto_apply", "1");          /* an undoable edit */
        HX_ASSERT(cl->step_gate[2] != g2, "setup: legato changed the gate");
        memcpy(&before, cl, sizeof before);
        unsigned r = (unsigned)I(h)->rui_rev;
        hx_set_param(h, "t1_c0_page_copy", "3 0 0");    /* source outside the window */
        hx_set_param(h, "t1_c0_page_copy", "0 0 0");    /* source == destination */
        hx_set_param(h, "t1_c0_page_copy", "0 16 0");   /* no such page */
        hx_set_param(h, "t1_c0_page_copy", "0 x 0");    /* malformed */
        hx_set_param(h, "t1_c0_page_copy", "");
        memcpy(&after, cl, sizeof after);
        HX_ASSERT(!memcmp(&before, &after, sizeof before), "refusals: nothing changed");
        HX_ASSERT((unsigned)I(h)->rui_rev == r, "refusals: no rev bump");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(cl->step_gate[2] == g2, "refusals: Undo still undoes the legato (no snapshot was taken)");
        printf("  ok   — a paste that cannot run changes nothing and takes no undo snapshot\n");
        hx_destroy(h);
    }
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        toggle(h, 2);
        I(h)->tracks[1].recording = 1;
        memcpy(&before, cl, sizeof before);
        hx_set_param(h, "t1_c0_page_copy", "0 1 0");
        memcpy(&after, cl, sizeof after);
        HX_ASSERT(!memcmp(&before, &after, sizeof before), "recording: refused");
        printf("  ok   — refused while the track records\n");
        hx_destroy(h);
    }

    /* ---- drum lane --------------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 1); dtoggle(h, 0, 7);
        dtoggle(h, 1, 1);
        clip_t *l0 = lane(h, 0), *l1 = lane(h, 1);
        l0->step_ratchet[7] = 2;
        hx_set_param(h, "t0_l0_page_copy", "0 2 0");
        HX_ASSERT(l0->steps[33] && l0->steps[39] && l0->step_ratchet[39] == 2, "lane: page 0 onto page 2");
        HX_ASSERT(l0->loop_start == 0 && l0->length == 48, "lane: its window grew");
        HX_ASSERT(!l1->steps[33] && l1->length == 16, "lane: the other lane is untouched");
        printf("  ok   — a drum lane's page copy acts on that lane only\n");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(!l0->steps[33] && l0->length == 16, "lane: Undo restores it");
        printf("  ok   — one Undo restores a lane page copy\n");
        hx_destroy(h);
    }

    /* ---- ALL LANES --------------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 1);
        dtoggle(h, 3, 20);
        dloop_set(h, 3, 16, 16);                        /* lane 3: page 1 only */
        clip_t *l0 = lane(h, 0), *l3 = lane(h, 3), *l5 = lane(h, 5);
        hx_set_param(h, "t0_all_lanes_page_copy", "0 2 0");
        HX_ASSERT(l0->steps[33] && l0->length == 48, "ALL LANES: lane 0 pasted and grown");
        HX_ASSERT(l5->length == 48 && !l5->steps[33], "ALL LANES: an empty lane grows too");
        HX_ASSERT(l3->loop_start == 16 && l3->length == 16 && !l3->steps[33],
                  "ALL LANES: a lane the source page misses is left alone");
        printf("  ok   — ALL LANES pastes on every lane against its own window\n");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(!l0->steps[33] && l0->length == 16 && l5->length == 16, "ALL LANES: Undo restores every lane");
        printf("  ok   — one Undo restores every lane\n");
        hx_destroy(h);
    }
    {   /* no lane able to paste: no snapshot */
        hx_t *h = hx_create(NULL);
        dtoggle(h, 0, 2);
        hx_set_param(h, "t0_l0_lgto_apply", "1");
        HX_ASSERT(I(h)->drum_undo_valid, "setup: a drum undo unit");
        uint16_t g = lane(h, 0)->step_gate[2];
        hx_set_param(h, "t0_all_lanes_page_copy", "5 1 0");
        hx_set_param(h, "t0_l0_page_copy", "5 1 0");
        HX_ASSERT(lane(h, 0)->step_gate[2] == g && !lane(h, 0)->steps[17], "no-op: nothing changed");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(lane(h, 0)->step_gate[2] != g, "no-op: Undo still undoes the legato");
        printf("  ok   — a lane / ALL LANES paste that cannot run takes no undo snapshot\n");
        hx_destroy(h);
    }

    /* ---- while playing ----------------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        clip_t *cl = mclip(h);
        seq8_track_t *tr = &I(h)->tracks[1];
        toggle(h, 2);
        hx_set_param(h, "transport", "play");
        HX_ASSERT(I(h)->playing, "setup: playing");
        hx_render(h, 400);
        uint32_t el = (uint32_t)I(h)->global_tick * (uint32_t)TICKS_PER_STEP + I(h)->master_tick_in_step;
        HX_ASSERT(el / TPS % 64 != tr->current_step, "setup: the 16-step playhead is not where a 64-step one would be");
        hx_set_param(h, "t1_c0_page_copy", "0 3 0");
        HX_ASSERT(cl->length == 64, "playing: grown");
        HX_ASSERT(tr->current_step == el / TPS % 64,
                  "playing: the playhead is re-anchored to the master clock, as a length change does");
        hx_render(h, 40);
        HX_ASSERT(tr->current_step < 64, "playing: and stays there");
        printf("  ok   — a paste while playing keeps the playhead in the window\n");
        hx_destroy(h);
    }

    printf("PASS: test_page_copy\n");
    return 0;
}
