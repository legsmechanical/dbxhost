/* tests/test_arp_shared_pitch.c — SEQ ARP holds a pitch while anything holds
 * it. A long 64 and a short 60 harmonized a third up (also 64) give the arp
 * the same pitch twice; the arp kept one entry per pitch, so when the short
 * note ended it took 64 away from under the long one, and the arp played only
 * the long note's harmony (68) to its end. Live and baked. */
#include "pfx_rig.h"

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, 0, 192, 64, 100);      /* the long note */
    clip_insert_note(cl, 24, 12, 60, 100);      /* + a third: 64 again, ends at 36 */
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "harm_interval1 4");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    rig_launch(h, 1, 0);
    return h;
}

int main(void) {
    /* live */
    {
        hx_t *h = rig();
        play(h, 16, g_a, &g_an);
        int held = 0, after = 0;
        for (int i = 0; i < g_an; i++) {
            if (g_a[i].kind || g_a[i].a != 64) continue;
            held  += g_a[i].tick >= 60 && g_a[i].tick < 180;
            after += g_a[i].tick >= 192 + 24;
        }
        printf("  live: the arp plays 64 %d times while the long note holds it, %d after it ends\n", held, after);
        HX_ASSERT(held >= 2, "live: the short note ending leaves the long note's 64 in the arp");
        HX_ASSERT(after == 0, "live: and 64 goes when the long note ends");
        hx_destroy(h);
    }
    /* baked */
    {
        hx_t *h = rig();
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "bake", "1 0 0 1 0 1");
        const clip_t *cl = &inst->tracks[1].clips[0];
        int held = 0, after = 0;
        for (int i = 0; i < cl->note_count; i++) {
            if (cl->notes[i].pitch != 64) continue;
            held  += cl->notes[i].tick >= 60 && cl->notes[i].tick < 180;
            after += cl->notes[i].tick >= 192 + 24;
        }
        printf("  baked: 64 %d times while held, %d after (%d notes)\n", held, after, cl->note_count);
        HX_ASSERT(held >= 2, "baked: the short note ending leaves the long note's 64 in the arp");
        HX_ASSERT(after == 0, "baked: and 64 goes when the long note ends");
        hx_destroy(h);
    }
    printf("PASS: arp shared pitch\n");
    return 0;
}
