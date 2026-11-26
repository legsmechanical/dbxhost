/* tests/test_arp_holds_32.c — SEQ ARP holds up to 32 pitches. An 8-note chord
 * with two harmony voices gives it 24; it held 16, and the other 8 never
 * played. Every one now plays, live and baked, and the pattern stays within
 * 64 steps (octave copies give way). */
#include "pfx_rig.h"

static const uint8_t CH[8] = { 40, 43, 47, 50, 53, 57, 60, 64 };

static hx_t *rig(int octaves) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 64; cl->loop_start = 0;
    for (int i = 0; i < 8; i++) clip_insert_note(cl, 0, 24 * 60, CH[i], 100);
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "harm_interval1 1");   /* +1 and +2: 24 pitches, none shared */
    hx_set_param(h, "t1_c0_pfx_set", "harm_interval2 2");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    char v[32]; snprintf(v, sizeof v, "seq_arp_octaves %d", octaves); hx_set_param(h, "t1_c0_pfx_set", v);
    rig_launch(h, 1, 0);
    return h;
}

/* how many of the 24 pitches (in octave copy 0) are among the notes given */
static int count24(const uint8_t *seen) {
    int n = 0;
    for (int i = 0; i < 8; i++) for (int k = 0; k <= 2; k++) n += seen[CH[i] + k] != 0;
    return n;
}

int main(void) {
    /* live, and with Octaves +2 (72 > 64: the copies give way, nothing breaks) */
    for (int oct = 0; oct <= 2; oct += 2) {
        hx_t *h = rig(oct);
        play(h, 64, g_a, &g_an);
        uint8_t seen[128] = { 0 };
        int notes = 0;
        for (int i = 0; i < g_an; i++) if (!g_a[i].kind && g_a[i].tick < 24 * 60) { seen[g_a[i].a] = 1; notes++; }
        const int n = count24(seen);
        printf("  live, Octaves +%d: %d of 24 pitches played (%d notes)\n", oct, n, notes);
        HX_ASSERT(n == 24, "live: every pitch of a 24-pitch hold plays");
        hx_destroy(h);
    }
    /* baked */
    {
        hx_t *h = rig(0);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "bake", "1 0 0 1 0 1");
        const clip_t *cl = &inst->tracks[1].clips[0];
        uint8_t seen[128] = { 0 };
        for (int i = 0; i < cl->note_count; i++) seen[cl->notes[i].pitch] = 1;
        const int n = count24(seen);
        printf("  baked: %d of 24 pitches (%d notes)\n", n, cl->note_count);
        HX_ASSERT(n == 24, "baked: every pitch of a 24-pitch hold plays");
        hx_destroy(h);
    }
    printf("PASS: arp holds 32\n");
    return 0;
}
