/* tests/test_stretch_keeps_hidden_hits.c — BEAT STRETCH ×2 NEVER DESTROYS
 * HITS PAST THE LOOP END.
 *
 * A lane (or clip) shortened after recording keeps its later hits, silent
 * past the loop end. Stretch ×2 doubles the window over the steps right after
 * it, and used to overwrite whatever was there: on the Move (2026-10-05) an
 * ALL LANES ×2 on a copied drum clip took lanes from 27 hits to 21, 19 to 15,
 * 16 to 8 and 15 to 7, while the audible part stretched correctly — so
 * nothing on screen said anything was lost.
 *
 * Now the stretch REFUSES when the steps it would grow into hold anything
 * (CROP FIRST — the same door every transform already uses for the loop
 * start), and moves nothing. Hits further out, past where the doubled window
 * reaches, are untouched by a stretch that goes ahead.
 *
 * Cases: (1) ALL LANES ×2 with a hidden hit in the growth range → result -2,
 * every lane unchanged; (2) one drum lane ×2 → stretch_blocked 2, unchanged;
 * (3) a melodic clip ×2 → stretch_blocked 2, unchanged; (4) a hidden hit PAST
 * the doubled window → the stretch goes ahead and that hit survives;
 * (5) CONTROL: no hidden hits → ALL LANES ×2 doubles every lane. */
#include "harness.h"

static clip_t *lane(seq8_instance_t *inst, int l) { return &inst->tracks[0].drum_clips[0]->lanes[l].clip; }

static void hit(clip_t *cl, int step, int pitch) {
    clip_insert_note(cl, (uint32_t)(step * cl->ticks_per_step), 12, (uint8_t)pitch, 100);
    clip_build_steps_from_notes(cl);
}

static hx_t *drum_rig(seq8_instance_t **out) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t0_pad_mode", "1");
    hx_set_param(h, "t0_all_lanes_length", "16");
    hit(lane(inst, 0), 0, 36); hit(lane(inst, 0), 8, 36);
    hit(lane(inst, 2), 4, 38);
    *out = inst;
    return h;
}

int main(void) {
    /* ---- 1. ALL LANES ×2, hidden hit in the growth range ----------------- */
    {
        seq8_instance_t *inst; hx_t *h = drum_rig(&inst);
        hit(lane(inst, 2), 20, 38);                 /* past the 16-step end: hidden */
        int before0 = lane(inst, 0)->note_count, before2 = lane(inst, 2)->note_count;
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        HX_ASSERT(inst->all_lanes_stretch_result == -2, "the stretch was not refused as CROP FIRST (-2)");
        HX_ASSERT(lane(inst, 0)->length == 16 && lane(inst, 2)->length == 16, "a refused stretch changed a length");
        HX_ASSERT(lane(inst, 0)->note_count == before0 && lane(inst, 2)->note_count == before2,
                  "a refused stretch changed the hits");
        hx_destroy(h);
        puts("  ok   — (1) ALL LANES ×2 over a hidden hit is refused (-2) and moves nothing");
    }
    /* ---- 2. one drum lane ×2 ---------------------------------------------- */
    {
        seq8_instance_t *inst; hx_t *h = drum_rig(&inst);
        hit(lane(inst, 2), 20, 38);
        int before = lane(inst, 2)->note_count;
        hx_set_param(h, "t0_l2_beat_stretch", "1");
        HX_ASSERT(inst->tracks[0].stretch_blocked == 2, "a lane ×2 over a hidden hit was not refused (2)");
        HX_ASSERT(lane(inst, 2)->length == 16 && lane(inst, 2)->note_count == before, "the refused lane changed");
        hx_destroy(h);
        puts("  ok   — (2) one lane ×2 over a hidden hit is refused and moves nothing");
    }
    /* ---- 3. melodic clip ×2 ----------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        clip_t *cl = &inst->tracks[1].clips[0];
        hx_set_param(h, "t1_c0_length", "16");
        HX_ASSERT(cl->length == 16, "setup: melodic length");
        hit(cl, 0, 60); hit(cl, 20, 64);             /* 20: hidden */
        int before = cl->note_count;
        hx_set_param(h, "t1_beat_stretch", "1");
        HX_ASSERT(inst->tracks[1].stretch_blocked == 2, "a melodic ×2 over a hidden note was not refused (2)");
        HX_ASSERT(cl->length == 16 && cl->note_count == before, "the refused melodic clip changed");
        hx_destroy(h);
        puts("  ok   — (3) a melodic ×2 over a hidden note is refused and moves nothing");
    }
    /* ---- 4. hidden hit beyond the doubled window survives the stretch ---- */
    {
        seq8_instance_t *inst; hx_t *h = drum_rig(&inst);
        hit(lane(inst, 2), 40, 38);                 /* past 32: outside the growth range */
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        HX_ASSERT(inst->all_lanes_stretch_result == 1, "a stretch with nothing in its way was refused");
        HX_ASSERT(lane(inst, 2)->length == 32, "lane 2 did not double");
        int found = 0;
        for (int i = 0; i < lane(inst, 2)->note_count; i++)
            if (lane(inst, 2)->notes[i].tick == (uint32_t)(40 * lane(inst, 2)->ticks_per_step)) found = 1;
        HX_ASSERT(found, "the hit past the doubled window was lost");
        hx_destroy(h);
        puts("  ok   — (4) a hit past the doubled window survives a stretch that goes ahead");
    }
    /* ---- 5. CONTROL: nothing hidden → every lane doubles ------------------- */
    {
        seq8_instance_t *inst; hx_t *h = drum_rig(&inst);
        hx_set_param(h, "t0_all_lanes_beat_stretch", "1");
        HX_ASSERT(inst->all_lanes_stretch_result == 1, "control: a clean stretch was refused");
        HX_ASSERT(lane(inst, 0)->length == 32 && lane(inst, 0)->note_count == 2, "control: lane 0 did not stretch");
        hx_destroy(h);
        puts("  ok   — CONTROL (5) with nothing hidden, ALL LANES ×2 doubles every lane");
    }
    puts("PASS: test_stretch_keeps_hidden_hits");
    return 0;
}
