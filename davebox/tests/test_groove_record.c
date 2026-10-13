/* tests/test_groove_record.c — recording under a groove: what you play is
 * what you get back.
 *
 * A note recorded with Input Quantize off is stored where the groove will
 * play it at the moment it was heard, not where the clock stood (which the
 * groove would then move a second time). With Input Quantize on it snaps to
 * the grid and the groove moves it from there, as before. A track whose
 * Groove is off stores what the clock said. */
#include "harness.h"

static seq8_instance_t *I;
static void at(uint32_t mt) {
    I->global_tick = mt / TICKS_PER_STEP;
    I->master_tick_in_step = (uint8_t)(mt % TICKS_PER_STEP);
}
static void swing(int kind, int amt) { groove_reset(&I->groove); I->groove.kind = (uint8_t)kind; I->groove.amt = (uint8_t)amt; groove_sync_tracks(I); }
static void table2(int off0_ticks, int off1_ticks) {
    groove_reset(&I->groove);
    I->groove.kind = GROOVE_TABLE; I->groove.base = 24; I->groove.n_slots = 2; I->groove.amt = 100;
    I->groove.off[0] = (int16_t)(off0_ticks * GROOVE_FINE);
    I->groove.off[1] = (int16_t)(off1_ticks * GROOVE_FINE);
    groove_sync_tracks(I);
}
/* Where a note stored at master tick `m` is played. */
static int32_t plays_at(uint32_t m) { return (int32_t)m + groove_off_ticks(&I->tgroove[1], m); }

static note_t *find_note(clip_t *cl, uint8_t pitch) {
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].active && cl->notes[i].pitch == pitch) return &cl->notes[i];
    return NULL;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];

    /* ---- the shift itself ---- */
    swing(GROOVE_SWING_16, 100);                       /* odd steps 12 ticks late */
    HX_ASSERT(groove_record_shift(I, tr, 5) == 0, "a note heard in an on-time slot is stored where it was heard");
    HX_ASSERT(groove_record_shift(I, tr, 24 + 14) == -12, "a note heard in a late slot is stored the slot's delay sooner");
    HX_ASSERT(plays_at(24 + 14 - 12) == 24 + 14, "…so it plays back exactly where it was heard");
    HX_ASSERT(groove_record_shift(I, tr, 24 + 3) == -3,
              "heard before a late slot starts playing: stored on the slot's first tick, not in the slot before");
    swing(GROOVE_SWING_8, 100);                        /* steps 2,3 of 4 are 24 ticks late */
    HX_ASSERT(groove_record_shift(I, tr, 48 + 30) == -24, "Swing 1/8 is undone by its own, larger delay");
    swing(GROOVE_OFF, 100);
    HX_ASSERT(groove_record_shift(I, tr, 24 + 14) == 0, "with the groove Off nothing is moved");
    swing(GROOVE_SWING_16, 0);
    HX_ASSERT(groove_record_shift(I, tr, 24 + 14) == 0, "at amount 0 nothing is moved");

    table2(0, -6);                                     /* slot 2 six ticks early */
    HX_ASSERT(groove_record_shift(I, tr, 24 + 2) == 6, "a note heard in an early slot is stored that much later");
    HX_ASSERT(plays_at(24 + 2 + 6) == 24 + 2, "…so it plays back exactly where it was heard");
    HX_ASSERT(groove_record_shift(I, tr, 24 + 20) == 3,
              "heard after an early slot has finished playing: stored on the slot's last tick");
    HX_ASSERT(groove_record_shift(I, tr, 20) == 0, "the slot before an early one still stores as heard");

    /* Whatever the groove: playback never lands further from where the note
     * was heard than the groove's own largest offset, and usually on it. */
    {
        struct { int kind, amt, o0, o1; } gs[] = {
            { GROOVE_SWING_16, 100, 0, 0 }, { GROOVE_SWING_16, 37, 0, 0 }, { GROOVE_SWING_8, 80, 0, 0 },
            { GROOVE_TABLE, 100, 0, -6 }, { GROOVE_TABLE, 100, 5, -9 }, { GROOVE_TABLE, 100, -12, 12 },
        };
        for (unsigned gi = 0; gi < sizeof(gs) / sizeof(gs[0]); gi++) {
            if (gs[gi].kind == GROOVE_TABLE) table2(gs[gi].o0, gs[gi].o1); else swing(gs[gi].kind, gs[gi].amt);
            int exact = 0;
            for (uint32_t mt = 96; mt < 192; mt++) {
                int32_t err = plays_at((uint32_t)((int32_t)mt + groove_record_shift(I, tr, mt))) - (int32_t)mt;
                int32_t was = plays_at(mt) - (int32_t)mt;          /* the error if nothing were undone */
                if (err < 0) err = -err;
                if (was < 0) was = -was;
                HX_ASSERT(err <= was, "un-grooving made a note land further from where it was heard");
                if (err == 0) exact++;
            }
            /* at least half: the last groove leaves a gap as wide as a slot,
             * and nothing stored anywhere plays inside a gap */
            HX_ASSERT(exact >= 48, "un-grooving is exact for fewer than half the positions");
        }
    }

    /* an arp step or a repeat: the groove only ever delayed it */
    swing(GROOVE_SWING_16, 100);
    HX_ASSERT(groove_record_shift_late(I, tr, 24 + 3) == 0, "a delayed step stored in its own late slot does not move");
    HX_ASSERT(groove_record_shift_late(I, tr, 24 + 20) == 12,
              "a step delayed into the NEXT slot is stored there, where it was heard");
    table2(0, -6);
    HX_ASSERT(groove_record_shift_late(I, tr, 24 + 2) == 6,
              "a step fired in an early slot was heard on time, and is stored so it plays back there");

    tr->pfx.g_amt = 0;                                  /* this track's own amount: none */
    swing(GROOVE_SWING_16, 100);
    HX_ASSERT(groove_record_shift(I, tr, 24 + 14) == 0 && groove_record_shift_late(I, tr, 24 + 20) == 0,
              "a track with Groove off stores what the clock said");
    tr->pfx.g_amt = -1; groove_sync_tracks(I);
    printf("  ok   — the shift: exact where a slot can reach, nearest tick where it cannot\n");

    /* ---- positions: kept inside the loop window ---- */
    {
        clip_t *cl = &tr->clips[0];                    /* 16 steps from 0 */
        HX_ASSERT(groove_shift_clip_tick(cl, 30, -12) == 18, "a clip tick moves by the shift");
        /* never across the loop's edge: past the end it would play again at
         * the wrap, before the start it would sit silent through a pass */
        HX_ASSERT(groove_shift_clip_tick(cl, 4, -12) == 4, "a note is not moved back across the loop's start");
        HX_ASSERT(groove_shift_clip_tick(cl, 16 * 24 - 2, 6) == 16 * 24 - 2, "…nor on across its end");
        HX_ASSERT(groove_shift_clip_tick(cl, 16 * 24 - 8, 6) == 16 * 24 - 2, "…but right up to it");
        uint16_t st = 1; int16_t off = 2;
        groove_shift_drum_pos(cl, &st, &off, 6);
        HX_ASSERT(st == 1 && off == 8, "a drum position moves inside its step");
        st = 1; off = 2; groove_shift_drum_pos(cl, &st, &off, -20);
        HX_ASSERT(st == 0 && off == 6, "…and back into the step before");
        st = 0; off = -2; groove_shift_drum_pos(cl, &st, &off, -12);
        HX_ASSERT(st == 0 && off == -2, "…but not back across the loop's start");
        st = 15; off = 20; groove_shift_drum_pos(cl, &st, &off, 6);
        HX_ASSERT(st == 15 && off == 20, "…nor on across its end");
    }

    /* ---- a note the count-in put on the first tick stays there ---- */
    {
        clip_t *cl = &tr->clips[tr->active_clip];
        table2(8, 0);                                  /* the first slot is eight ticks late */
        tr->recording = 1;
        at(0); tr->current_clip_tick = 0;
        hx_set_param(h, "t1_record_note_on", "e70 100");
        note_t *n = find_note(cl, 70);
        HX_ASSERT(n && n->tick == 0, "a note on the loop's first tick was moved to its end");
        hx_set_param(h, "t1_record_note_off", "e70");
        tr->recording = 0;
        swing(GROOVE_SWING_16, 100);
    }
    printf("  ok   — a moved position stays inside the loop window\n");

    /* ---- the pad recorder ---- */
    {
        clip_t *cl = &tr->clips[tr->active_clip];
        swing(GROOVE_SWING_16, 100);
        tr->recording = 1;
        at(24 + 14); tr->current_clip_tick = 24 + 14;
        hx_set_param(h, "t1_record_note_on", "e64 100");
        note_t *n = find_note(cl, 64);
        HX_ASSERT(n, "rig: the note was not recorded");
        HX_ASSERT(n->tick == 24 + 2, "a pad note recorded in a swung step is stored where swing will play it back");
        at(24 + 14 + 30); tr->current_clip_tick = 24 + 14 + 30;
        hx_set_param(h, "t1_record_note_off", "e64");
        HX_ASSERT(n->gate == 30, "…and keeps the length it was held for");

        tr->drum_inp_quant = 1;                        /* Input Quantize on */
        at(24 + 14); tr->current_clip_tick = 24 + 14;
        hx_set_param(h, "t1_record_note_on", "e65 100");
        n = find_note(cl, 65);
        {
            uint32_t qt = (uint32_t)DRUM_INQ_TICKS[1], want = ((24u + 14u + qt / 2) / qt) * qt;
            HX_ASSERT(n && n->tick == want, "with Input Quantize on the note snaps to the grid, and is not moved again");
        }
        hx_set_param(h, "t1_record_note_off", "e65");
        tr->drum_inp_quant = 0;

        hx_set_param(h, "t1_groove_on", "0"); groove_sync_tracks(I);
        at(72 + 14); tr->current_clip_tick = 72 + 14;
        hx_set_param(h, "t1_record_note_on", "e66 100");
        n = find_note(cl, 66);
        HX_ASSERT(n && n->tick == 72 + 14, "a track with Groove off records what the clock said");
        hx_set_param(h, "t1_record_note_off", "e66");
        hx_set_param(h, "t1_groove_on", "1"); groove_sync_tracks(I);
    }
    printf("  ok   — the pad recorder: un-grooved with Input Quantize off, snapped with it on\n");

    hx_destroy(h);
    printf("PASS: test_groove_record\n");
    return 0;
}
