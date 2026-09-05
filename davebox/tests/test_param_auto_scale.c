/* tests/test_param_auto_scale.c — THE LANE SCALE (Josh, 2026-09-05: "automation
 * scale 0-200 % that scales the value of all automation on the lane up or
 * down").
 *
 * The law: out = clamp(v * pct / 100, 0, PA_VAL_MAX), applied at PLAYBACK and
 * in pa_export; the recorded points are never touched, so 100 % is
 * bit-identical to a store that never had the field, and a file written before
 * the field existed loads as 100 %. The store is reached the way the device
 * reaches it (set_param / get_param), playback the way test_param_auto_playback
 * drives it (pa_playback_scan directly). */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pa_set(hx_t *h, int t, int c, const char *tgt, int tick, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, tick, val);
    hx_set_param(h, k, v);
}
static void pa_scale(hx_t *h, int t, int c, const char *tgt, int pct) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_scale", t);
    snprintf(v, sizeof(v), "%d %s %d", c, tgt, pct);
    hx_set_param(h, k, v);
}
/* pa_scale with the optional 4th token: the lane's BIPOLAR centre (14-bit). */
static void pa_scale_c(hx_t *h, int t, int c, const char *tgt, int pct, int ctr) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_scale", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, pct, ctr);
    hx_set_param(h, k, v);
}
/* The value playback staged for the ring's one target, or -1. */
static int staged(hx_t *h) {
    char buf[4096] = {0};
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
    hx_get_param(h, "pa_pending", buf, sizeof(buf));
    if (!buf[0]) return -1;
    const char *sp = strchr(buf, ' ');
    return sp ? atoi(sp + 1) : -1;
}
/* pa_list's scale field for the one entry. */
static int listed_scale(hx_t *h) {
    char buf[4096] = {0};
    hx_get_param(h, "pa_list", buf, sizeof(buf));
    /* "<t> <c> <flags> <count> <target> <loop> <res> <scale>" */
    int t, c, f, n, ll, rs, sc; char tgt[64];
    if (sscanf(buf, "%d %d %d %d %63s %d %d %d", &t, &c, &f, &n, tgt, &ll, &rs, &sc) != 8) return -999;
    return sc;
}

int main(void) {
    /* ---- the arithmetic, on an entry ---------------------------------- */
    {
        pa_entry_t e; memset(&e, 0, sizeof(e));
        HX_ASSERT(pa_scale_pct(&e) == 100, "a zeroed entry is 100 %% — the v1 layout is the identity");
        HX_ASSERT(pa_scaled(&e, 0) == 0 && pa_scaled(&e, 8191) == 8191 && pa_scaled(&e, PA_VAL_MAX) == PA_VAL_MAX,
                  "100 %% is bit-identical");
        e.scale_off = -50;
        HX_ASSERT(pa_scaled(&e, 8000) == 4000, "50 %% halves");
        e.scale_off = 100;
        HX_ASSERT(pa_scaled(&e, 4000) == 8000, "200 %% doubles");
        HX_ASSERT(pa_scaled(&e, 12000) == PA_VAL_MAX, "200 %% CLAMPS at the top of the range, never wraps");
        e.scale_off = -100;
        HX_ASSERT(pa_scaled(&e, PA_VAL_MAX) == 0, "0 %% is silence");
        OK("out = clamp(v * pct / 100): identity at 100, halves, doubles, clamps, zeroes");
    }

    /* ---- through the store and playback --------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        in->playing = 1;
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 8000);
        HX_ASSERT(listed_scale(h) == 100, "a fresh lane lists 100 %%");
        HX_ASSERT(staged(h) == 8000, "at 100 %% playback stages the recorded value");

        pa_scale(h, 0, 0, "0:fx1:cutoff", 50);
        HX_ASSERT(listed_scale(h) == 50, "pa_scale sets it and pa_list reports it");
        HX_ASSERT(staged(h) == 4000, "playback stages HALF — the points are untouched, the output is scaled");
        {   /* the points themselves did not move */
            char buf[4096] = {0};
            hx_get_param(h, "pa_list", buf, sizeof(buf));
            HX_ASSERT(strstr(buf, " 1 0:fx1:cutoff "), "still one point");
        }
        pa_scale(h, 0, 0, "0:fx1:cutoff", 200);
        HX_ASSERT(staged(h) == 16000, "200 %% doubles on the way out");
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 9000);            /* 18000 would overflow the range */
        HX_ASSERT(staged(h) == PA_VAL_MAX, "200 %% of 9000 clamps to the range top on the way out");
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 8000);
        pa_scale(h, 0, 0, "0:fx1:cutoff", 250);
        HX_ASSERT(listed_scale(h) == 200, "the store clamps the percent to 0..200");
        pa_scale(h, 0, 0, "0:fx1:cutoff", 100);
        HX_ASSERT(staged(h) == 8000, "back at 100 %% the original value plays again — nothing was lost");
        OK("the scale is applied at playback and never rewrites the points");
        hx_destroy(h);
    }

    /* ---- BIPOLAR: the lane scales its distance from a CENTRE (Josh, 2026-09-05,
     * automating pan: "scale toward center and out rather than full knob
     * travel"). Pan's centre is 0.5 = 8191 in 14 bits. ---------------------- */
    {
        hx_t *h = hx_create(NULL);
        const int C = 8191;
        pa_set(h, 0, 0, "0:slot:pan", 0, C + 4000);           /* right of centre */
        pa_scale_c(h, 0, 0, "0:slot:pan", 100, C);
        HX_ASSERT(staged(h) == C + 4000, "100 %% is the identity for a bipolar lane too");
        pa_scale_c(h, 0, 0, "0:slot:pan", 50, C);
        HX_ASSERT(staged(h) == C + 2000, "50 %% halves the swing to the RIGHT of centre");
        pa_set(h, 0, 0, "0:slot:pan", 0, C - 4000);           /* left of centre */
        pa_scale_c(h, 0, 0, "0:slot:pan", 50, C);
        HX_ASSERT(staged(h) == C - 2000, "...and to the LEFT: toward centre, not toward zero");
        pa_scale_c(h, 0, 0, "0:slot:pan", 200, C);
        HX_ASSERT(staged(h) == C - 8000, "200 %% doubles the swing");
        pa_set(h, 0, 0, "0:slot:pan", 0, 16000);
        pa_scale_c(h, 0, 0, "0:slot:pan", 200, C);
        HX_ASSERT(staged(h) == PA_VAL_MAX, "...and clamps at the top of the range");
        pa_set(h, 0, 0, "0:slot:pan", 0, 300);
        pa_scale_c(h, 0, 0, "0:slot:pan", 200, C);
        HX_ASSERT(staged(h) == 0, "...and at the bottom");
        pa_scale_c(h, 0, 0, "0:slot:pan", 0, C);
        HX_ASSERT(staged(h) == C, "0 %% is the CENTRE, not zero");
        /* The 3-token form keeps the centre the lane already has. */
        pa_set(h, 0, 0, "0:slot:pan", 0, C + 4000);
        pa_scale(h, 0, 0, "0:slot:pan", 50);
        HX_ASSERT(staged(h) == C + 2000, "pa_scale without a centre keeps the lane bipolar");
        /* The unipolar law is untouched: a lane never given a centre. */
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 8000);
        pa_scale(h, 0, 0, "0:fx1:cutoff", 50);
        {   char buf[4096] = {0}; seq8_instance_t *in = (seq8_instance_t *)h->inst;
            pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
            hx_get_param(h, "pa_pending", buf, sizeof(buf));
            HX_ASSERT(strstr(buf, "0:fx1:cutoff 4000"), "a unipolar lane still scales from zero"); }
        OK("bipolar: out = clamp(c + (v - c) * pct / 100); unipolar unchanged");
        hx_destroy(h);
    }

    /* ---- persistence: round-trip, and files without the field ----------- */
    {
        char dir[] = "/tmp/pa_scale_XXXXXX";
        HX_ASSERT(mkdtemp(dir), "tmpdir");
        char state[256];
        snprintf(state, sizeof(state), "%s/seq8sa-state.json", dir);

        hx_t *h = hx_create(NULL);
        hx_set_param(h, "state_path", state);
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 8000);
        pa_scale(h, 0, 0, "0:fx1:cutoff", 75);
        hx_set_param(h, "save", "1");
        hx_destroy(h);

        char fbuf[65536] = {0};
        FILE *fp = fopen(state, "r"); HX_ASSERT(fp, "state written");
        size_t got = fread(fbuf, 1, sizeof(fbuf) - 1, fp); fclose(fp);
        HX_ASSERT(got > 0 && strstr(fbuf, "\"sc\":75"), "the scale is in the project file");

        h = hx_create(NULL);
        {   seq8_instance_t *in2 = (seq8_instance_t *)h->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2); }
        HX_ASSERT(listed_scale(h) == 75, "and it reloads");
        OK("the scale round-trips through the project file");

        /* A file WITHOUT the field: every project saved before 2026-09-05.
         * Strip the key and reload — must read as 100 %, not 0. ⚠ Destroy
         * FIRST: destroy autosaves into state_path and would put the key back. */
        hx_destroy(h);
        char *sc = strstr(fbuf, ",\"sc\":75");
        HX_ASSERT(sc, "found the key to strip");
        memmove(sc, sc + 8, strlen(sc + 8) + 1);
        fp = fopen(state, "w"); HX_ASSERT(fp, "rewrite"); fputs(fbuf, fp); fclose(fp);
        h = hx_create(NULL);
        {   seq8_instance_t *in2 = (seq8_instance_t *)h->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2); }
        HX_ASSERT(listed_scale(h) == 100, "a file without the field loads as 100 %%");
        {   /* and a 100 % lane writes NO key — sparse, so old files and new agree byte for byte */
            hx_set_param(h, "save", "1");
            char b2[65536] = {0};
            fp = fopen(state, "r"); fread(b2, 1, sizeof(b2) - 1, fp); fclose(fp);
            HX_ASSERT(!strstr(b2, "\"sc\":"), "100 %% writes no sc key");
        }
        OK("backward compatible: absent = 100 %%, and 100 %% stays absent");
        hx_destroy(h);

        /* The CENTRE round-trips as "cc"; a file without it loads UNIPOLAR. */
        h = hx_create(NULL);
        hx_set_param(h, "state_path", state);
        pa_set(h, 0, 0, "0:slot:pan", 0, 8191 + 4000);
        pa_scale_c(h, 0, 0, "0:slot:pan", 50, 8191);
        hx_set_param(h, "save", "1");
        hx_destroy(h);
        memset(fbuf, 0, sizeof(fbuf));
        fp = fopen(state, "r"); HX_ASSERT(fp, "state written (bipolar)");
        got = fread(fbuf, 1, sizeof(fbuf) - 1, fp); fclose(fp);
        HX_ASSERT(got > 0 && strstr(fbuf, "\"cc\":8191"), "the centre is in the project file");
        h = hx_create(NULL);
        {   seq8_instance_t *in2 = (seq8_instance_t *)h->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2); }
        HX_ASSERT(staged(h) == 8191 + 2000, "...and the lane reloads bipolar (50 %% of the swing)");
        hx_destroy(h);
        {   char *cc = strstr(fbuf, ",\"cc\":8191"); HX_ASSERT(cc, "found the centre key to strip");
            memmove(cc, cc + 10, strlen(cc + 10) + 1);
            fp = fopen(state, "w"); HX_ASSERT(fp, "rewrite"); fputs(fbuf, fp); fclose(fp); }
        h = hx_create(NULL);
        {   seq8_instance_t *in2 = (seq8_instance_t *)h->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2); }
        HX_ASSERT(staged(h) == (8191 + 4000) / 2, "a file without the centre loads UNIPOLAR (50 %% from zero)");
        OK("the centre round-trips; a file without it is unipolar");
        hx_destroy(h);
        unlink(state); rmdir(dir);
    }

    printf("PASS: test_param_auto_scale (%d checks)\n", ok_count);
    return 0;
}
