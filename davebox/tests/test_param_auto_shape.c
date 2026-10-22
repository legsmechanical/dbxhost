/* tests/test_param_auto_shape.c — tN_cC_pa_shape_<n>: a lane's SHAPE for the
 * AUTOMATION bank's lane graph (the ops pop-up draws one column a sample).
 *
 * The graph must be what PLAYS, so this does not compare the read with the
 * evaluator it calls — it runs the transport and compares every sample the
 * playhead passes with the value playback actually sent at that lane tick
 * (the lane tick from state_snapshot, the value from the ring or the host
 * write). Asked with n = the lane's window in ticks, so sample c IS lane tick
 * ws + c and nothing is interpolated between them. Covered: Wrap Carry and
 * Reset (which differ after the last point — asserted, so the comparison can
 * tell them apart), a Rate of x2 (the lane runs twice per clip pass), and a
 * STEPPED target (an enum, which never glides). Plus the line format: 2n hex
 * digits, ff outside the window, and malformed keys refused. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static char g_ans[65536];

static long snap_field(hx_t *h, int i) {
    char buf[1024];
    hx_get_param(h, "state_snapshot", buf, sizeof buf);
    char *p = buf;
    for (int k = 0; k < i; k++) { p = strchr(p, ' '); if (!p) return -99999; p++; }
    return strtol(p, NULL, 10);
}
static void pa_set(hx_t *h, const char *tgt, int tick, int val) {
    char v[128];
    snprintf(v, sizeof(v), "0 %s %d %d", tgt, tick, val);
    hx_set_param(h, "t0_pa_set", v);
}
/* The lane's window, from the same function the read and playback use. */
static void lane_window(hx_t *h, const char *tgt, uint32_t *ws, uint32_t *wl) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    pa_entry_t *e = pa_find(in, 0, 0, pa_target_lookup(in, tgt));
    uint32_t st = 0;
    HX_ASSERT(e && pa_export_window(&in->tracks[0], e, ws, wl, &st) && *wl, "the lane has a window");
}
/* `tgt`'s samples (-1 = ff) into `v`; returns how many, 0 when no line. */
static int shape_for(const char *ans, const char *tgt, int *v, int max) {
    char key[96];
    snprintf(key, sizeof(key), "%s ", tgt);
    const char *p = strstr(ans, key);
    if (!p) return 0;
    p += strlen(key);
    int n = 0;
    while (n < max && p[0] && p[0] != '\n' && p[1] && p[1] != '\n') {
        unsigned x = 0;
        char d[3] = { p[0], p[1], 0 };
        if (sscanf(d, "%2x", &x) != 1) return 0;
        v[n++] = x == 0xff ? -1 : (int)x;
        p += 2;
    }
    return n;
}
/* Blocks where the lane tick was NOT the clip tick folded into the window —
 * a lane on its own clock (a Rate other than x1). */
static int g_off_clock = 0;
static int v8_of(int v14) { return (v14 * 254 + 8191) / 16383; }

/* Runs the transport and checks every block: the value playback last sent
 * for `tgt` (`last`, as v8) must be the shape's sample at the lane tick the
 * snapshot reports. `host` = the value leaves through the host extension
 * (a resolved target; `enum_max` its option count - 1), else through the ring.
 * Returns the number of comparisons; fails on the first mismatch. */
static int compare_playback(hx_t *h, const char *tgt, const int *shape, uint32_t ws, uint32_t wl,
                            int host, int enum_max, int blocks, int *distinct_ticks) {
    static unsigned char seen[4096];
    memset(seen, 0, sizeof seen);
    int last = -1, n = 0;
    char pat[96];
    snprintf(pat, sizeof pat, "%s ", tgt);
    const char *ck = strchr(strchr(tgt, ':') + 1, ':') ? strchr(tgt, ':') + 1 : tgt;   /* "synth:mode" */
    int ev0 = hx_stub_event_count();
    for (int b = 0; b < blocks; b++) {
        hx_render(h, 1);
        if (host) {
            for (int i = ev0; i < hx_stub_event_count(); i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind == HX_PARAM_SET && !strcmp(e->key, ck)) last = atoi(e->value);
            }
            ev0 = hx_stub_event_count();
        } else {
            hx_get_param(h, "pa_pending", g_ans, sizeof g_ans);
            for (char *p = strstr(g_ans, pat); p; p = strstr(p + 1, pat)) last = v8_of(atoi(p + strlen(pat)));
        }
        const long lt = snap_field(h, 57);
        if (lt >= 0 && (uint32_t)lt != ws + ((seq8_instance_t *)h->inst)->tracks[0].pa_last_ct % wl) g_off_clock++;
        if (last < 0 || lt < 0) continue;
        HX_ASSERT((uint32_t)lt >= ws && (uint32_t)lt < ws + wl, "the playhead stays inside the lane's window");
        const int s = shape[lt - ws];
        HX_ASSERT(s >= 0, "a sample inside the window has a value");
        const int want = host ? (int)((s * enum_max * 2 + 254) / (2 * 254)) : s;   /* option index, rounded */
        if (want != last) {
            fprintf(stderr, "FAIL: %s at lane tick %ld: shape %d (%d), playback sent %d\n", tgt, lt, s, want, last);
            exit(1);
        }
        if (lt - ws < (long)sizeof seen) seen[lt - ws] = 1;
        n++;
    }
    int d = 0;
    for (size_t i = 0; i < sizeof seen; i++) d += seen[i];
    if (distinct_ticks) *distinct_ticks = d;
    return n;
}

int main(void) {
    static int shape[2][4096];
    uint32_t ws = 0, wl = 0;

    /* ---- Carry and Reset, each against real playback; the two must differ */
    for (int reset = 0; reset <= 1; reset++) {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");          /* a playing 16-step clip */
        pa_set(h, "1:synth:cutoff", 48, 2000);
        pa_set(h, "1:synth:cutoff", 200, 14000);
        pa_set(h, "1:synth:cutoff", 300, 4000);                    /* the start point is 2000 */
        hx_set_param(h, "t0_pa_wrap", reset ? "0 1:synth:cutoff 1" : "0 1:synth:cutoff 0");
        hx_set_param(h, "t0_pa_view", "0 1:synth:cutoff");
        lane_window(h, "1:synth:cutoff", &ws, &wl);
        HX_ASSERT(ws == 0 && wl == 384, "setup: the clip's 16 steps");
        char key[64];
        snprintf(key, sizeof key, "t0_c0_pa_shape_%u", wl);
        HX_ASSERT(hx_get_param(h, key, g_ans, sizeof g_ans) > 0, "the read answers");
        HX_ASSERT(shape_for(g_ans, "1:synth:cutoff", shape[reset], 4096) == (int)wl, "a line of exactly n samples");
        hx_set_param(h, "transport", "play_focus:0:0");
        int d = 0;
        g_off_clock = 0;
        const int n = compare_playback(h, "1:synth:cutoff", shape[reset], ws, wl, 0, 0, 900, &d);
        HX_ASSERT(n > 300 && d > 200, "the playhead crossed most of the lane, value checked at each block");
        HX_ASSERT(g_off_clock == 0, "at x1 the lane tick IS the clip tick (the control for the x2 case)");
        hx_destroy(h);
    }
    HX_ASSERT(shape[0][350] != shape[1][350], "Carry glides after the last point, Reset holds it: the shapes differ");
    HX_ASSERT(shape[1][350] == v8_of(4000) && shape[0][350] > v8_of(2000) && shape[0][350] < v8_of(4000),
              "Reset holds 4000; Carry is on its way back to the start point (2000)");
    OK("⭐ Carry and Reset: every sample the playhead passes is what playback sent there");

    /* ---- Rate x2: the lane runs twice per clip pass, in its own ticks */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        pa_set(h, "1:synth:cutoff", 0, 0);
        pa_set(h, "1:synth:cutoff", 360, 16383);
        hx_set_param(h, "t0_pa_loop", "0 1:synth:cutoff 0 0 6");   /* follow the clip, Rate x2 */
        hx_set_param(h, "t0_pa_view", "0 1:synth:cutoff");
        lane_window(h, "1:synth:cutoff", &ws, &wl);
        char key[64];
        snprintf(key, sizeof key, "t0_c0_pa_shape_%u", wl);
        HX_ASSERT(hx_get_param(h, key, g_ans, sizeof g_ans) > 0, "the read answers");
        HX_ASSERT(shape_for(g_ans, "1:synth:cutoff", shape[0], 4096) == (int)wl, "n samples");
        hx_set_param(h, "transport", "play_focus:0:0");
        int d = 0;
        g_off_clock = 0;
        const int n = compare_playback(h, "1:synth:cutoff", shape[0], ws, wl, 0, 0, 900, &d);
        HX_ASSERT(n > 300 && d > 100, "compared across the lane at x2");
        HX_ASSERT(g_off_clock > 100, "setup: the lane really ran on its own clock (lane tick != clip tick)");
        hx_destroy(h);
    }
    OK("⭐ Rate x2: the shape is in lane ticks, the same ones playback evaluates at");

    /* ---- a STEPPED target (an enum, resolved: the engine writes it itself) */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        pa_set(h, "1:synth:mode", 0, 0);
        pa_set(h, "1:synth:mode", 96, 16383);
        pa_set(h, "1:synth:mode", 192, 5461);
        pa_set(h, "1:synth:mode", 288, 10922);
        hx_set_param(h, "pa_resolve", "1:synth:mode 1 synth:mode 2 0 3 1");
        hx_set_param(h, "t0_pa_view", "0 1:synth:mode");
        lane_window(h, "1:synth:mode", &ws, &wl);
        char key[64];
        snprintf(key, sizeof key, "t0_c0_pa_shape_%u", wl);
        HX_ASSERT(hx_get_param(h, key, g_ans, sizeof g_ans) > 0, "the read answers");
        HX_ASSERT(shape_for(g_ans, "1:synth:mode", shape[0], 4096) == (int)wl, "n samples");
        HX_ASSERT(shape[0][95] == 0 && shape[0][96] == 254 && shape[0][191] == 254 && shape[0][192] == v8_of(5461),
                  "stepped: each value HOLDS to the next point, no glide between");
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:0:0");
        int d = 0;
        const int n = compare_playback(h, "1:synth:mode", shape[0], ws, wl, 1, 3, 900, &d);
        HX_ASSERT(n > 300 && d > 200, "compared across the lane");
        hx_destroy(h);
    }
    OK("⭐ a stepped target: flat steps, and what the host was told at every tick");

    /* ---- the format, and refusals */
    {
        hx_t *h = hx_create(NULL);
        pa_set(h, "1:synth:cutoff", 0, 16383);
        hx_set_param(h, "t0_pa_scale", "0 1:synth:cutoff 50");
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_126", g_ans, sizeof g_ans) > 0, "the read answers");
        int v[200];
        HX_ASSERT(shape_for(g_ans, "1:synth:cutoff", v, 200) == 126, "126 samples, two hex digits each");
        HX_ASSERT(v[0] == v8_of(8192) || v[0] == v8_of(8191), "Scale applies (50 % of full)");
        HX_ASSERT(strchr(g_ans, '\n') && strchr(g_ans, '\n')[1] == '\0', "one line per lane, newline-terminated");
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_", g_ans, sizeof g_ans) < 0, "no n: refused");
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_0", g_ans, sizeof g_ans) < 0, "n 0: refused");
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_99999", g_ans, sizeof g_ans) < 0, "n too large: refused");
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_12x", g_ans, sizeof g_ans) < 0, "junk after n: refused");
        HX_ASSERT(hx_get_param(h, "t0_c1_pa_shape_126", g_ans, sizeof g_ans) == 0, "a clip with no lane: empty");
        /* A buffer too small for the line: nothing half-written. */
        char small[64];
        HX_ASSERT(hx_get_param(h, "t0_c0_pa_shape_126", small, sizeof small) == 0 && small[0] == '\0',
                  "a line that does not fit is left out whole");
        hx_destroy(h);
    }
    OK("the line format; malformed keys refused; a short buffer gets no partial line");

    printf("test_param_auto_shape: %d ok\n", ok_count);
    return 0;
}
