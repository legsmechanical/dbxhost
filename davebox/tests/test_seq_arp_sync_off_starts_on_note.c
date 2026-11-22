/* tests/test_seq_arp_sync_off_starts_on_note.c — SEQ ARP with Sync off starts
 * on the note, as LIVE ARP does (ruled 2026-11-21).
 *
 * Before: arp_tick's Sync-off branch waited for (master tick − anchor) to be
 * a multiple of the rate — the Sync-on test again, since the anchor is not the
 * note's arrival. A sequenced note nudged off the grid waited up to a whole
 * rate interval (here a quarter note) before the arp played anything.
 *
 *  1. Up, 1/4, Sync off, a note nudged +10 ticks: the arp fires within two
 *     ticks of the note reaching it.
 *  2. CONTROL: Sync on waits for the 1/4 grid (most of a quarter note).
 *  3. the free start re-anchors the Arp Steps column: a note arriving more
 *     than a rate interval into the bar plays column 0, as LIVE ARP does. */
#include "harness.h"

static int wait_after_note(int sync, int step, int *col_out) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    HX_ASSERT(tr->pad_mode != PAD_MODE_DRUM, "rig: track 1 is melodic");
    char k[40];
    snprintf(k, sizeof k, "t1_c0_step_%d_add", step);
    hx_set_param(h, k, "60 10 100");                      /* +10 ticks */
    snprintf(k, sizeof k, "t1_c0_step_%d_gate", step);
    hx_set_param(h, k, "200");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");  /* Up */
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 5");   /* 1/4 = 96 ticks */
    hx_set_param(h, "t1_c0_pfx_set", sync ? "seq_arp_sync 1" : "seq_arp_sync 0");
    arp_engine_t *a = &tr->pfx.arp;
    HX_ASSERT(a->style == 1 && ARP_RATE_TICKS[a->rate_idx] == 96, "rig: SEQ ARP Up at 1/4");
    HX_ASSERT(tr->pfx.seq_arp_sync == (sync ? 1 : 0), "rig: sync as asked");
    hx_set_param(h, "transport", "play_focus:1:0");
    uint32_t fires0 = a->fire_count;
    uint32_t before = inst->arp_master_tick;
    { int g = 0; while (a->held_count == 0 && g++ < 4000) { before = inst->arp_master_tick; hx_render(h, 1); } }
    HX_ASSERT(a->held_count > 0, "rig: the sequenced note never reached the arp");
    uint32_t arrived = before + 1;     /* the first tick of the block that brought it */
    HX_ASSERT((arrived % 96) != 0, "rig: the note arrived on the arp grid — nothing to tell apart");
    { int g = 0; while (a->fire_count == fires0 && g++ < 4000) hx_render(h, 1); }
    HX_ASSERT(a->fire_count > fires0, "the arp never fired");
    int waited = (int)(inst->arp_master_tick - arrived);
    *col_out = a->step_pos;
    hx_destroy(h);
    return waited;
}

int main(void) {
    int col = -1;
    int on = wait_after_note(1, 1, &col);
    HX_ASSERT(on >= 48, "control: Sync on waits for the 1/4 grid");
    int off = wait_after_note(0, 1, &col);
    if (off > 2) {
        fprintf(stderr, "FAIL: SEQ ARP Sync off waited %d ticks after the note (Sync on %d)\n", off, on);
        return 1;
    }
    /* 3. the free start re-anchors the Arp Steps column: a note arriving
     * more than one rate interval into the bar still plays column 0. */
    off = wait_after_note(0, 5, &col);
    HX_ASSERT(off <= 2, "Sync off, later note: fires on the note");
    if (col != 0) {
        fprintf(stderr, "FAIL: Sync off first note played Arp Steps column %d, not 0\n", col);
        return 1;
    }
    printf("PASS: seq_arp_sync_off_starts_on_note (sync on waits %d ticks, off %d)\n", on, off);
    return 0;
}
