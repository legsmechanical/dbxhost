/* tests/test_tarp_record_track_inq.c — LIVE ARP recording quantizes with the
 * track's own Input Quantize (tN_diq), as a pad note does (ruled 2026-11-21).
 *
 * Before: tarp_fire_step read the old global inp_quant, which no control sets,
 * so with the track's InQ at 1/16 the arp's notes still landed where they fell.
 *
 *  1. track InQ 1/16, global off: a press 5 ticks past a step records every
 *     arp note on the 1/16 grid.
 *  2. CONTROL: track InQ off, global ON: the global is not read — the notes
 *     stay where they were played. */
#include "harness.h"

static int off_grid_notes(int diq, int global_iq, int *count_out) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    inst->active_track = 1;
    HX_ASSERT(tr->pad_mode != PAD_MODE_DRUM, "rig: track 1 is melodic");
    hx_set_param(h, "t1_tarp_style", "1");          /* Up; turns the arp on */
    hx_set_param(h, "t1_tarp_sync", "0");           /* free: fires on the press */
    char v[8];
    snprintf(v, sizeof v, "%d", diq);
    hx_set_param(h, "t1_diq", v);
    inst->inp_quant = (uint8_t)global_iq;
    HX_ASSERT(tr->tarp_on && tr->drum_inp_quant == diq, "rig: arp on, track InQ as asked");
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 20);
    tr->recording = 1;
    clip_t *cl = &tr->clips[tr->active_clip];
    HX_ASSERT(cl->ticks_per_step == 24, "rig: the clip is at 1/16");
    { int g = 0; while ((tr->current_clip_tick % 24) != 5 && g++ < 2000) hx_render(h, 1); }
    HX_ASSERT((tr->current_clip_tick % 24) == 5, "rig: could not reach 5 ticks past a step");
    live_note_on(inst, tr, 60, 100);
    hx_render(h, 150);
    live_note_off(inst, tr, 60);
    tr->recording = 0;
    hx_render(h, 4);
    int off = 0;
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].tick % 24 != 0) off++;
    *count_out = cl->note_count;
    hx_destroy(h);
    return off;
}

int main(void) {
    int n = 0;
    int off = off_grid_notes(3, 0, &n);             /* DRUM_INQ_TICKS[3] = 24 = 1/16 */
    HX_ASSERT(n >= 2, "rig: the arp recorded too few notes");
    if (off) {
        fprintf(stderr, "FAIL: track InQ 1/16: %d of %d arp notes recorded off the grid\n", off, n);
        return 1;
    }
    int n2 = 0;
    int off2 = off_grid_notes(0, 1, &n2);
    HX_ASSERT(n2 >= 2, "control: the arp recorded too few notes");
    HX_ASSERT(off2 == n2, "control: track InQ off — the global value is not read, notes stay off the grid");
    printf("PASS: tarp_record_track_inq (%d notes on the grid; control %d off it)\n", n, off2);
    return 0;
}
