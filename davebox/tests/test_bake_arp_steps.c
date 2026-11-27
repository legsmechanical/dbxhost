/* tests/test_bake_arp_steps.c — a baked SEQ ARP plays the steps live plays.
 * (A) A note ending exactly on an arp step: live plays that step (the note's
 * off goes out after the tick's step), the bake released first and lost it.
 * (B) A note held across the loop end: live keeps arpeggiating it at the top
 * of the loop, the bake started each pass with the arp empty. (C) Echoes
 * landing past the loop end feed the arp at the top too. Live is the clip's
 * third pass; the bake is a wrapped one-loop bake. A step a tick apart is
 * the same step. */
#include "pfx_rig.h"

typedef struct { int tick, gate, pitch; } N;
#define L 8
#define SPAN (L * 24)

static hx_t *mk(const N *n, int nn, const char *const *fx) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->length = L; cl->ticks_per_step = 24; cl->loop_start = 0;
    for (int i = 0; i < nn; i++) clip_insert_note(cl, (uint32_t)n[i].tick, (uint16_t)n[i].gate, (uint8_t)n[i].pitch, 100);
    clip_build_steps_from_notes(cl);
    for (int i = 0; fx[i]; i++) hx_set_param(h, "t1_c0_pfx_set", fx[i]);
    return h;
}

/* note-ons of the clip's third pass, as "pitch@tick" in order */
static int live3(hx_t *h, uint32_t *key, int max) {
    hx_clear_capture(h); g_seen = 0; g_an = 0;
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    int guard = 400000;
    while (rig_now(h) < SPAN * 4 + 2 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    hx_set_param(h, "transport", "stop");
    int k = 0;
    for (int i = 0; i < g_an && k < max; i++)
        if (g_a[i].kind == 0 && g_a[i].tick > SPAN * 2 && g_a[i].tick <= SPAN * 3)
            key[k++] = (uint32_t)g_a[i].a << 16 | (g_a[i].tick - SPAN * 2 - 1);   /* (the capture is a tick late) */
    return k;
}
static int cmpu(const void *a, const void *b) { uint32_t x = *(const uint32_t *)a, y = *(const uint32_t *)b; return x < y ? -1 : x > y; }

static int one(const char *what, const N *n, int nn, const char *const *fx) {
    uint32_t a[256], b[256];
    hx_t *h = mk(n, nn, fx);
    int na = live3(h, a, 256);
    hx_destroy(h);
    h = mk(n, nn, fx);
    hx_set_param(h, "bake", "1 0 0 1 0 1");
    const clip_t *cl = &((seq8_instance_t *)h->inst)->tracks[1].clips[0];
    int nb = 0;
    for (int i = 0; i < cl->note_count && nb < 256; i++) b[nb++] = (uint32_t)cl->notes[i].pitch << 16 | cl->notes[i].tick;
    hx_destroy(h);
    qsort(a, na, sizeof *a, cmpu); qsort(b, nb, sizeof *b, cmpu);
    int same = na == nb;
    for (int i = 0; same && i < na; i++)               /* the same pitch, within a tick (live's echoes leave the queue a block late) */
        same = a[i] >> 16 == b[i] >> 16 && (int)(a[i] & 0xFFFF) - (int)(b[i] & 0xFFFF) <= 1 && (int)(b[i] & 0xFFFF) - (int)(a[i] & 0xFFFF) <= 1;
    printf("  %s: live %d steps, baked %d%s\n", what, na, nb, same ? "" : "   <- differ");
    if (!same) {
        printf("    live: "); for (int i = 0; i < na; i++) printf(" %u@%u", a[i] >> 16, a[i] & 0xFFFF); printf("\n");
        printf("    baked:"); for (int i = 0; i < nb; i++) printf(" %u@%u", b[i] >> 16, b[i] & 0xFFFF); printf("\n");
    }
    return !same;
}

int main(void) {
    static const char *const up16[] = { "seq_arp_style 1", "seq_arp_rate 1", NULL };
    static const char *const echo[] = { "seq_arp_style 1", "seq_arp_rate 1", "delay_level 127", "delay_repeats 3",
                                        "delay_time 5", "delay_pitch_fb -2", "delay_retrig 0", NULL };
    int bad = 0;
    { N n[] = { { 0, 48, 60 }, { 96, 12, 64 } };  bad += one("A, a note ending on an arp step", n, 2, up16); }
    { N n[] = { { 144, 96, 60 } };                bad += one("B, a note held across the loop end", n, 1, up16); }
    { N n[] = { { 144, 20, 58 } };                bad += one("C, echoes landing past the loop end", n, 1, echo); }
    HX_ASSERT(bad == 0, "a baked SEQ ARP plays the steps live plays");
    printf("PASS: bake arp steps\n");
    return 0;
}
