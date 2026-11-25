/* tests/test_bake_echo_live.c — a baked clip's delay echoes sound as the live
 * ones do: the same start AND the same end. Random melodic clips (fixed
 * seeds): 1-3 notes of their own lengths, MIDI delay with its own time,
 * repeats, pitch feedback and retrig, the echo Gate left at the default (so an
 * echo is as long as the note it echoes) or a fixed one. Each clip is played
 * live, then baked (tails wrapped, the steady loop) and played again; from the
 * third pass on, every note-on and note-off is compared. Two instances with
 * the same seed: one plays, the other bakes. Pitches are spread so no two
 * sounding notes share a pitch (a shared pitch is a different question).
 * BEL_FG=1 adds a fixed echo Gate, BEL_KIND=1 runs drum lanes instead — both
 * still differ from playback, and are open. */
#include "pfx_rig.h"

/* Notes as heard: an on opens its pitch, the next off closes it; an off for
 * a pitch not sounding is dropped (playback's Retrig sends offs for echoes
 * that never started — the synth ignores them). One tick of slack each way,
 * counted: playback times an echo in samples. */
typedef struct { uint32_t on, off; uint8_t p, v; } nt_t;
static int to_notes(const ev_t *e, int n, nt_t *out, uint32_t end) {
    int open[128], k = 0;
    for (int p = 0; p < 128; p++) open[p] = -1;
    for (int i = 0; i < n; i++) {
        const uint8_t p = e[i].a & 0x7F;
        if (e[i].kind == 0) {
            if (open[p] >= 0) out[open[p]].off = e[i].tick;   /* a restrike ends it */
            out[k] = (nt_t){ e[i].tick, UINT32_MAX, p, e[i].b }; open[p] = k++;
        } else if (e[i].kind == 3 && open[p] >= 0) { out[open[p]].off = e[i].tick; open[p] = -1; }
    }
    for (int i = 0; i < k; i++) if (out[i].off == UINT32_MAX) out[i].off = end;
    return k;
}
static long g_slack, g_ties;
static uint32_t g_span;            /* the clip's loop, in ticks */
static uint32_t g_ons[4]; static int g_non;
/* An echo due on the very tick a note starts (Retrig on): playback fires one
 * or the other first by a sample — at some tempos the echo plays, at others
 * the note's Retrig drops it. A tie, counted; a zero-length note is silence. */
static int tie(const nt_t *x) {
    if (x->off == x->on) return 1;
    for (int i = 0; i < g_non; i++) if (x->on % g_span == g_ons[i] % g_span) return 1;
    return 0;
}
static int cmp_window(uint32_t w0, uint32_t w1, uint32_t end, int verbose) {
    static nt_t A[EV_MAX], B[EV_MAX];
    static char used[EV_MAX];
    const int an = to_notes(g_a, g_an, A, end), bn = to_notes(g_b, g_bn, B, end);
    int bad = 0;
    memset(used, 0, sizeof used);
    for (int j = 0; j < bn; j++) {
        if (B[j].on < w0 || B[j].on >= w1) continue;
        int k = -1;
        for (int q = 0; q < an && k < 0; q++)
            if (!used[q] && A[q].p == B[j].p && A[q].v == B[j].v
                && A[q].on + 1 >= B[j].on && A[q].on <= B[j].on + 1
                && A[q].off + 1 >= B[j].off && A[q].off <= B[j].off + 1) k = q;
        if (k < 0 && tie(&B[j])) { g_ties++; continue; }
        if (k < 0) { bad++; if (verbose && bad <= 6) printf("    only baked: %u @%u-%u\n", B[j].p, B[j].on, B[j].off); continue; }
        g_slack += A[k].on != B[j].on || A[k].off != B[j].off;
        used[k] = 1;
    }
    for (int q = 0; q < an; q++)
        if (!used[q] && A[q].on + 1 >= w0 && A[q].on <= w1) {
            int edge = A[q].on < w0 || A[q].on >= w1;      /* slack across the window's edge */
            if (edge) continue;
            if (tie(&A[q])) { g_ties++; continue; }
            bad++; if (verbose && bad <= 12) printf("    only live:  %u @%u-%u\n", A[q].p, A[q].on, A[q].off);
        }
    return bad;
}

static int g_drum, g_export_bad;
static hx_t *setup(int seed, int bake, char *desc, size_t dn) {
    static const int TPS[] = { 12, 24, 48 };
    rs = (uint32_t)seed * 2654435761u;
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    clip_t *cl;
    drum_lane_t *ln = NULL;
    if (g_drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 6");       /* track 3 a drum track */
        ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        HX_ASSERT(ln, "control: the lane");
        cl = &ln->clip;
    } else {
        hx_set_param(h, "t1_c0_step_0_toggle", "40 100");   /* the clip exists */
        cl = &inst->tracks[1].clips[0];
    }
    const int tps = TPS[rnd(3)], L = 2 * (2 + (int)rnd(7));   /* even: whole song steps at any step size */
    cl->note_count = 0; g_non = 0;
    cl->ticks_per_step = (uint16_t)tps; cl->length = (uint16_t)L; cl->loop_start = 0;
    const int span = L * tps, nn = 1 + (int)rnd(3);
    int at = 0, w = 0;
    for (int i = 0; i < nn; i++) {
        const int tk = at + (int)rnd((uint32_t)(span / nn));
        const int g = 1 + (int)rnd((uint32_t)(span - 1));   /* shorter than the loop */
        const uint8_t p = g_drum ? ln->midi_note : (uint8_t)(36 + 24 * i);
        if (g_non < 4) g_ons[g_non++] = (uint32_t)tk;
        clip_insert_note(cl, (uint32_t)tk, (uint16_t)g, p, 90);
        w += snprintf(desc + w, dn - w, " n%u@%d+%d", p, tk, g);
        at += span / nn;
    }
    clip_build_steps_from_notes(cl);
    const int dt = (int)rnd(8), rep = 1 + (int)rnd(3), pfb = 1 + (int)rnd(5), rt = (int)rnd(2);
    const int fg = getenv("BEL_FG") && rnd(3) == 0 ? 1 + (int)rnd(5) : 0;
    if (g_drum) {
        ln->pfx_params.delay_level = 127; ln->pfx_params.repeat_times = rep;
        ln->pfx_params.delay_time_idx = dt; ln->pfx_params.delay_retrig = rt;
        ln->pfx_params.fb_gate_time = fg;
        ln->pfx_params.gate_time = 30 + (int)rnd(200);
    } else {
        char v[48];
        hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
        snprintf(v, sizeof v, "delay_repeats %d", rep);   hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_time %d", dt);       hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_pitch_fb %d", pfb);  hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_retrig %d", rt);     hx_set_param(h, "t1_c0_pfx_set", v);
        snprintf(v, sizeof v, "delay_gate_fb %d", fg);    hx_set_param(h, "t1_c0_pfx_set", v);
    }
    w += snprintf(desc + w, dn - w, " | %s tps%d L%d dt%d rep%d pfb%d rt%d fg%d g%d", g_drum ? "drum" : "melodic",
                  tps, L, dt, rep, pfb, rt, fg, ln ? ln->pfx_params.gate_time : 100);
    if (bake && !g_drum) {
        /* the Ableton export renders the same echoes, without baking */
        static bake_note_t ex[BAKE_BUF];
        uint32_t esp = 0, ecy = 0;
        const int en = render_melodic_clip(inst, 1, 0, 1, 0, ex, BAKE_BUF, &esp, &ecy, 0);
        hx_set_param(h, "bake", "1 0 0 1 0 1");
        int same = en == cl->note_count;
        for (int i = 0; same && i < en; i++) {
            int hit = 0;
            for (int j = 0; j < cl->note_count && !hit; j++)
                hit = cl->notes[j].tick == ex[i].tick && cl->notes[j].pitch == ex[i].pitch && cl->notes[j].gate == ex[i].gate;
            same = hit;
        }
        if (!same) { printf("  seed %d: the export (%d notes) differs from the bake (%d)\n", seed, en, cl->note_count); g_export_bad++; }
    } else if (bake) hx_set_param(h, "bake", "2 0 1 1 1 1");
    g_span = (uint32_t)span;
    rig_launch(h, g_drum ? 2 : 1, 0);
    return h;
}

int main(int argc, char **argv) {
    const int s0 = argc > 1 ? atoi(argv[1]) : 1, s1 = argc > 2 ? atoi(argv[2]) : 150;
    int fails = 0; long cmp = 0;
    for (int run = 0; run < 2 * (s1 - s0 + 1); run++) {
        const int seed = s0 + run / 2;
        g_drum = run & 1;
        /* drum lanes only on request (BEL_KIND=1): a drum echo repeats its
         * hit's own pitch, and how a bake should hold that is still open */
        if ((getenv("BEL_KIND") ? atoi(getenv("BEL_KIND")) : 0) != g_drum) continue;
        char desc[256];
        hx_t *h = setup(seed, 0, desc, sizeof desc);
        play(h, g_span * 5 / TICKS_PER_STEP, g_a, &g_an);
        hx_destroy(h);
        h = setup(seed, 1, desc, sizeof desc);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        HX_ASSERT((g_drum ? RIG_LANE(inst->tracks[2].drum_clips[0], 1)->pfx_params.repeat_times
                          : inst->tracks[1].clips[0].pfx_params.repeat_times) == 0, "control: the bake cleared the delay");
        play(h, g_span * 5 / TICKS_PER_STEP, g_b, &g_bn);
        const uint32_t w0 = g_span * 2, w1 = g_span * 4;
        for (int i = 0; i < g_an; i++) cmp += !g_a[i].kind && g_a[i].tick >= w0 && g_a[i].tick < w1;
        if (cmp_window(w0, w1, g_span * 5, 0)) {
            fails++;
            printf("  seed %d:%s\n", seed, desc);
            cmp_window(w0, w1, g_span * 5, 1);
        }
        hx_destroy(h);
    }
    printf("  bake echoes vs live, seeds %d..%d: %d failed, %ld notes compared, %ld a tick apart, %ld same-tick ties\n", s0, s1, fails, cmp, g_slack, g_ties);
    HX_ASSERT(cmp > 0, "control: something was compared");
    HX_ASSERT(fails == 0, "a baked clip's echoes start and end as the live ones");
    HX_ASSERT(g_export_bad == 0, "the Ableton export renders the notes the bake writes");
    printf("PASS: bake echo live\n");
    return 0;
}
