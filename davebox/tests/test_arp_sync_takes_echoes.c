/* tests/test_arp_sync_takes_echoes.c — SEQ ARP with Sync on plays the DELAY
 * echoes fed into it. An echo due on an arp grid point leaves the echo queue
 * at the start of the next audio block, after that point's tick has run; the
 * arp then waited a whole step for the next point, and the echo (6 ticks
 * long) had ended by then. How many echoes were heard depended on the tempo
 * (2 of 6 at 120 bpm). Now a first note a tick or two past a point takes it,
 * and the arp stays on its grid. A note 3 or more ticks past still waits. */
#include "pfx_rig.h"

static hx_t *rig(const char *bpm, uint32_t at, uint16_t gate, int delay, int reps, int gfb) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", bpm);
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, at, gate, 60, 100);
    clip_build_steps_from_notes(cl);
    if (delay) {
        hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
        char v[32];
        snprintf(v, sizeof v, "delay_repeats %d", reps); hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_gate_fb %d", gfb);  hx_set_param(h, "t1_c0_pfx_set", v);
        hx_set_param(h, "t1_c0_pfx_set", "delay_time 5");      /* 1/16: on the arp's grid */
        hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 3");  /* 63 66 69 */
        hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
    }
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_sync 1");
    rig_launch(h, 1, 0);
    return h;
}

int main(void) {
    static const char *const bpms[] = { "77", "90", "100", "120", "133", "140", "174" };
    int bad = 0;
    for (int b = 0; b < 7; b++) {
        hx_t *h = rig(bpms[b], 0, 6, 1, 3, 0);
        play(h, 16, g_a, &g_an);
        int heard = 0, off_grid = 0;
        for (int i = 0; i < g_an; i++) {
            if (g_a[i].kind || g_a[i].a == 60) continue;
            heard++;
            off_grid += g_a[i].tick % 24 > 2;      /* on the point, or a tick or two past it */
        }
        if (heard != 3 || off_grid) { printf("  %s bpm: %d of 3 echoes heard, %d off the grid\n", bpms[b], heard, off_grid); bad++; }
        hx_destroy(h);
    }
    char m[64]; snprintf(m, sizeof m, "Sync on: every echo heard, on the grid (%d tempos wrong)", bad);
    printf("  %s\n", m);
    HX_ASSERT(bad == 0, m);

    /* one long echo (fixed Gate 96 ticks): the steps after its late first
     * one fall exactly on the grid, at every tempo */
    {
        int wrong = 0;
        for (int b = 0; b < 7; b++) {
            hx_t *h = rig(bpms[b], 0, 6, 1, 1, 8);
            play(h, 16, g_a, &g_an);
            int n63 = 0, off = 0;
            for (int i = 0; i < g_an; i++) {
                if (g_a[i].kind || g_a[i].a != 63) continue;
                off += n63++ ? g_a[i].tick % 24 != 0 : g_a[i].tick % 24 > 2;
            }
            if (n63 < 3 || off) { printf("  %s bpm, a long echo: %d arp steps, %d off the grid\n", bpms[b], n63, off); wrong++; }
            hx_destroy(h);
        }
        HX_ASSERT(wrong == 0, "after a first note a moment late, the arp's steps keep to the grid");
    }

    /* the grace is a tick or two: a note 3 ticks past a point waits for the next */
    {
        hx_t *h = rig("120", 3, 40, 0, 0, 0);
        play(h, 4, g_a, &g_an);
        uint32_t first = UINT32_MAX;
        for (int i = 0; i < g_an && first == UINT32_MAX; i++) if (!g_a[i].kind) first = g_a[i].tick;
        printf("  a note 3 ticks past a point: the arp's first note at tick %u (want 24)\n", first);
        HX_ASSERT(first == 24, "a note 3 ticks past a grid point waits for the next one");
        hx_destroy(h);
    }
    printf("PASS: arp sync takes echoes\n");
    return 0;
}
