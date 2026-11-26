/* tests/test_arp_swing_releases.c — SEQ ARP under swing lets go of every clip
 * note when it ends. DELAY's Retrig drain used to take a clip note's queued
 * note-off, find the arp's OWN swing-held output note-on of that pitch, and
 * queue the off behind it as a bypass event — which went straight out and
 * never reached the arp: the arp held the note and played it for ever.
 * Two short notes in a swung step, swept over tempos, swing amounts and
 * positions; DELAY off. At the end the arp holds nothing and is silent. */
#include "pfx_rig.h"

static int one(const char *bpm, int amt, int retrig, uint32_t at, uint16_t gate, uint32_t at2) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", bpm);
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, at, gate, 60, 100);
    clip_insert_note(cl, at2, 6, 64, 100);
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", retrig ? "delay_retrig 1" : "delay_retrig 0");
    char v[16];
    hx_set_param(h, "groove_kind", "1");
    snprintf(v, sizeof v, "%d", amt); hx_set_param(h, "groove_amt", v);
    rig_launch(h, 1, 0);
    /* to just before the loop comes round */
    hx_clear_capture(h);
    g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 4000000;
    while (inst->playing && rig_now(h) < ST(15) && guard-- > 0) {
        hx_render(h, 1);
        drain(g_a, &g_an, rig_now(h) ? rig_now(h) - 1 : 0);
    }
    const int held = inst->tracks[1].pfx.arp.held_count;
    int late = 0;                                  /* arp notes long after both clip notes ended */
    for (int i = 0; i < g_an; i++) late += !g_a[i].kind && g_a[i].tick > 200;
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    return held || late;
}

int main(void) {
    /* where it hung (133), and two others (a wider sweep, 55,296 clips over
     * both groove kinds, six tempos, three arp rates and chords, found none) */
    static const char *const bpms[] = { "133", "120", "174" };
    int n = 0, stuck = 0, shown = 0;
    for (int retrig = 0; retrig <= 1; retrig++) for (int b = 0; b < 3; b++)
    for (int amt = 50; amt <= 100; amt += 25) for (uint32_t at = 24; at < 48; at += 2)
    for (uint16_t gate = 4; gate <= 16; gate += 12) for (uint32_t d = 2; d <= 14; d += 3) {
        n++;
        if (one(bpms[b], amt, retrig, at, gate, at + d)) {
            stuck++;
            if (shown++ < 4) printf("  stuck: bpm %s swing %d Retrig %d: 60@%u for %u, 64@%u\n", bpms[b], amt, retrig, at, gate, at + d);
        }
    }
    /* the case that hung before (133 bpm, swing 50 %) */
    const int known = one("133", 50, 1, 24, 4, 29);
    char m[96]; snprintf(m, sizeof m, "%d of %d two-note clips left the arp playing", stuck, n);
    printf("  %s\n", m);
    HX_ASSERT(!known, "133 bpm, swing 50 %: 60@24 for 4, 64@29 — the arp lets go");
    HX_ASSERT(stuck == 0, m);
    printf("PASS: arp swing releases\n");
    return 0;
}
