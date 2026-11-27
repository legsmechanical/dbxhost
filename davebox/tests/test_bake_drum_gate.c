/* tests/test_bake_drum_gate.c — a baked drum hit is as long as it plays. A
 * drum hit lasts its own gate or 12 ticks x the lane's Gate %, whichever is
 * longer (ruled intended); Bake wrote the gate x Gate % alone, so at Gate
 * 300 % a 6-tick hit (36 live) baked as 18. Lane bake and clip bake; and the
 * baked clip played back sounds as the live one did. */
#include "pfx_rig.h"

static hx_t *rig(int gate_pct, int len) {
    hx_t *h = hx_create(NULL);
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    char v[32];
    snprintf(v, sizeof v, "0 100 %d", len);    hx_set_param(h, "t2_l0_note_add", v);
    snprintf(v, sizeof v, "gate_time %d", gate_pct); hx_set_param(h, "t2_l0_pfx_set", v);
    return h;
}
/* the first hit's length as playback sounds it */
static int played(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    rig_launch(h, 2, 0);
    hx_clear_capture(h); g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 400000;
    while (inst->playing && rig_now(h) < 100 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    hx_set_param(h, "transport", "stop");
    for (int i = 0; i < g_an; i++) if (!g_a[i].kind)
        for (int k = i + 1; k < g_an; k++) if (g_a[k].kind == 3 && g_a[k].a == g_a[i].a) return (int)(g_a[k].tick - g_a[i].tick);
    return -1;
}

int main(void) {
    int bad = 0;
    static const struct { int pct, len, want; } C[] = { { 300, 6, 36 }, { 200, 20, 40 }, { 100, 20, 20 }, { 150, 4, 18 } };
    for (int k = 0; k < 4; k++) for (int mode = 1; mode <= 2; mode++) {
        hx_t *h = rig(C[k].pct, C[k].len);
        const int live = played(h);
        hx_destroy(h);
        h = rig(C[k].pct, C[k].len);
        hx_set_param(h, "bake", mode == 1 ? "2 0 1 1 0 0" : "2 0 2 1 0 0");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        const clip_t *cl = &RIG_LANE(inst->tracks[2].drum_clips[0], 0)->clip;
        const int baked = cl->note_count ? cl->notes[0].gate : -1;
        const int back = played(h);
        hx_destroy(h);
        const int ok = live >= C[k].want - 1 && live <= C[k].want + 1 && baked == C[k].want && back >= live - 1 && back <= live + 1;
        printf("  %d-tick hit, Gate %d%%, %s bake: live %d, baked %d, baked played %d (want %d)%s\n",
               C[k].len, C[k].pct, mode == 1 ? "lane" : "clip", live, baked, back, C[k].want, ok ? "" : "   <- wrong");
        bad += !ok;
    }
    HX_ASSERT(bad == 0, "a baked drum hit is as long as it plays");
    printf("PASS: bake drum gate\n");
    return 0;
}
