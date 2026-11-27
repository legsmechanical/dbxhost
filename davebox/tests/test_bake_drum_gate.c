/* tests/test_bake_drum_gate.c — a baked drum lane sounds as long as it did.
 * A drum hit lasts its own gate x Gate % or 12 ticks x Gate %, whichever is
 * longer (ruled intended). Bake wrote the gate x Gate % alone (at 300 % a
 * 6-tick hit, 36 live, baked 18), and set the lane's Gate back to 100 %, so a
 * hit under 12 ticks then played 12. Bake now keeps the lane's Gate and
 * writes each note at the gate that Gate plays back at the length it sounded:
 * the baked clip plays every hit, and its echoes, as the live one did. Lane
 * bake and clip bake. */
#include "pfx_rig.h"

static hx_t *rig(int gate_pct, int len, int echoes) {
    hx_t *h = hx_create(NULL);
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    char v[32];
    snprintf(v, sizeof v, "0 100 %d", len);    hx_set_param(h, "t2_l0_note_add", v);
    snprintf(v, sizeof v, "gate_time %d", gate_pct); hx_set_param(h, "t2_l0_pfx_set", v);
    if (echoes) {
        hx_set_param(h, "t2_l0_pfx_set", "delay_level 127");
        hx_set_param(h, "t2_l0_pfx_set", "delay_repeats 2");
        hx_set_param(h, "t2_l0_pfx_set", "delay_time 5");
        hx_set_param(h, "t2_l0_pfx_set", "delay_retrig 0");
    }
    return h;
}
/* the lengths of the notes playback sounds, in order */
static int played(hx_t *h, int *lens) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    rig_launch(h, 2, 0);
    hx_clear_capture(h); g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 400000;
    while (inst->playing && rig_now(h) < 130 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    hx_set_param(h, "transport", "stop");
    int n = 0;
    for (int i = 0; i < g_an && n < 8; i++) if (!g_a[i].kind)
        for (int k = i + 1; k < g_an; k++) if ((g_a[k].kind == 3 || !g_a[k].kind) && g_a[k].a == g_a[i].a) { lens[n++] = (int)(g_a[k].tick - g_a[i].tick); break; }
    return n;
}

int main(void) {
    int bad = 0;
    static const struct { int pct, len, echoes; } C[] = {
        { 300, 6, 0 }, { 200, 20, 0 }, { 100, 20, 0 }, { 150, 4, 0 },
        { 25, 8, 0 }, { 50, 4, 0 }, { 75, 10, 0 }, { 33, 30, 0 },
        { 50, 4, 1 }, { 25, 40, 1 }, { 150, 6, 1 } };   /* (not 200 %: the hit would end on its first echo) */
    for (int k = 0; k < (int)(sizeof C / sizeof *C); k++) for (int mode = 1; mode <= 2; mode++) {
        int a[8], b[8];
        hx_t *h = rig(C[k].pct, C[k].len, C[k].echoes);
        const int na = played(h, a);
        hx_destroy(h);
        h = rig(C[k].pct, C[k].len, C[k].echoes);
        hx_set_param(h, "bake", mode == 1 ? "2 0 1 1 0 0" : "2 0 2 1 0 0");
        const int kept = RIG_LANE(((seq8_instance_t *)h->inst)->tracks[2].drum_clips[0], 0)->pfx_params.gate_time;
        const int nb = played(h, b);
        hx_destroy(h);
        int ok = na == nb && na == 1 + 2 * C[k].echoes && kept == C[k].pct;
        printf("  %2d-tick hit%s, Gate %3d%%, %s bake: live", C[k].len, C[k].echoes ? " + 2 echoes" : "", C[k].pct, mode == 1 ? "lane" : "clip");
        for (int i = 0; i < na; i++) printf(" %d", a[i]);
        printf(", baked plays");
        for (int i = 0; i < nb; i++) { printf(" %d", b[i]); if (i < na) ok &= b[i] >= a[i] - 1 && b[i] <= a[i] + 1; }
        printf(", Gate kept %d%s\n", kept, ok ? "" : "   <- wrong");
        bad += !ok;
    }
    HX_ASSERT(bad == 0, "a baked drum lane sounds as long as it did");
    printf("PASS: bake drum gate\n");
    return 0;
}
