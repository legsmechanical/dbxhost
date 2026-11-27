/* tests/test_quantize_last_half_step.c — NOTE FX Quantize plays a note in the
 * loop's last half step at the top of the next pass. It rounds to the loop's
 * end, which the playhead never reaches; playback pointed it there and never
 * played it (Bake wrote it at the top). Session playback, a 4-step loop in a
 * clip that stores more; a loop window that does not start at 0 too. */
#include "pfx_rig.h"

static int run(int loop_start, int q, int *at_top, int *passes) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->loop_start = (uint16_t)loop_start; cl->length = 4;
    const uint32_t ws = (uint32_t)loop_start * 24;
    clip_insert_note(cl, ws + 30, 10, 60, 100);
    clip_insert_note(cl, ws + 92, 10, 72, 100);   /* the last half step: rounds to the loop's end */
    clip_build_steps_from_notes(cl);
    char v[24]; snprintf(v, sizeof v, "quantize %d", q); hx_set_param(h, "t1_c0_pfx_set", v);
    hx_clear_capture(h); g_seen = 0; g_an = 0;
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    for (int i = 0; i < 800; i++) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    const uint32_t end = rig_now(h);
    hx_set_param(h, "transport", "stop");
    int n72 = 0, top = 0, n60 = 0;   /* (60 is the control: it plays every pass) */
    for (int i = 0; i < g_an; i++) {
        if (g_a[i].kind) continue;
        if (g_a[i].a == 60) n60++;
        if (g_a[i].a == 72) { n72++; top += (g_a[i].tick - 1) % 96 == (q >= 100 ? 0u : 94u); }
    }
    /* the passes that reached where it plays (the capture is a tick late) */
    const uint32_t off = q >= 100 ? 0u : 94u;
    int want = 0;
    for (uint32_t k = 0; k * 96 + off + 1 < end; k++) want++;
    (void)n60;
    *at_top = top; *passes = want;
    hx_destroy(h);
    return n72;
}

int main(void) {
    int bad = 0;
    for (int ls = 0; ls <= 4; ls += 4) {
        int top, passes;
        const int n = run(ls, 100, &top, &passes);
        printf("  loop from step %d, Quantize 100: the last note played %d times, %d due, %d at the top\n", ls, n, passes, top);
        bad += n != passes || top != n;
        const int m = run(ls, 50, &top, &passes);   /* half: 92 -> 94, still in the loop */
        printf("  loop from step %d, Quantize 50: played %d times, %d due, %d at 94\n", ls, m, passes, top);
        bad += m != passes || top != m;
    }
    HX_ASSERT(bad == 0, "a note in the loop's last half step plays, at the top of the next pass");
    printf("PASS: quantize last half step\n");
    return 0;
}
