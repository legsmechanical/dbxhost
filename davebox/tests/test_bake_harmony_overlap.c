/* tests/test_bake_harmony_overlap.c — a HARMONY copy landing on a pitch still
 * sounding bakes as live plays it: one held note. 60 for 40 ticks, then 55
 * harmonized +5 at 24 (60 again, while the first still sounds): live merges
 * them into one 60 held 0..64; the bake wrote two overlapping 60s, because
 * the merge ran only with DELAY on. Live is the clip's third pass; the bake
 * a wrapped one-loop bake. */
#include "pfx_rig.h"

#define L 8
#define SPAN (L * 24)

static hx_t *mk(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->length = L; cl->ticks_per_step = 24; cl->loop_start = 0;
    clip_insert_note(cl, 0, 40, 60, 100);
    clip_insert_note(cl, 24, 40, 55, 80);
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "harm_interval1 5");
    return h;
}
typedef struct { uint32_t p, t, g; } nt;
static int cmpn(const void *a, const void *b) {
    const nt *x = a, *y = b;
    return x->p != y->p ? (int)x->p - (int)y->p : x->t != y->t ? (int)x->t - (int)y->t : (int)x->g - (int)y->g;
}

int main(void) {
    nt a[64], b[64];
    int na = 0, nb = 0;
    {   /* live, third pass: each note-on with its length */
        hx_t *h = mk();
        hx_clear_capture(h); g_seen = 0; g_an = 0;
        hx_set_param(h, "t1_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        int guard = 400000;
        while (rig_now(h) < SPAN * 4 + 2 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
        hx_set_param(h, "transport", "stop");
        for (int i = 0; i < g_an && na < 64; i++) {
            if (g_a[i].kind || g_a[i].tick <= SPAN * 2 || g_a[i].tick > SPAN * 3) continue;
            for (int k = i + 1; k < g_an; k++)
                if (g_a[k].a == g_a[i].a && (g_a[k].kind == 3 || g_a[k].kind == 0)) {
                    a[na++] = (nt){ g_a[i].a, g_a[i].tick - SPAN * 2 - 1, g_a[k].tick - g_a[i].tick }; break;
                }
        }
        hx_destroy(h);
    }
    {
        hx_t *h = mk();
        hx_set_param(h, "bake", "1 0 0 1 0 1");
        const clip_t *cl = &((seq8_instance_t *)h->inst)->tracks[1].clips[0];
        for (int i = 0; i < cl->note_count && nb < 64; i++) b[nb++] = (nt){ cl->notes[i].pitch, cl->notes[i].tick, cl->notes[i].gate };
        hx_destroy(h);
    }
    qsort(a, na, sizeof *a, cmpn); qsort(b, nb, sizeof *b, cmpn);
    int same = na == nb;
    for (int i = 0; same && i < na; i++) same = a[i].p == b[i].p && a[i].t == b[i].t && a[i].g == b[i].g;
    printf("  live: "); for (int i = 0; i < na; i++) printf(" %u@%u+%u", a[i].p, a[i].t, a[i].g); printf("\n");
    printf("  baked:"); for (int i = 0; i < nb; i++) printf(" %u@%u+%u", b[i].p, b[i].t, b[i].g); printf("\n");
    HX_ASSERT(same, "a harmony copy on a sounding pitch bakes as one held note, as live");
    printf("PASS: bake harmony overlap\n");
    return 0;
}
