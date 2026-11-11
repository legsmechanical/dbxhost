/* tests/test_remix_loop.c — REMIX on an Audio Loop clip (Sync Pitch and
 * Vintage): what is HEARD at each 1/16 of the bar.
 *
 * The sample is one bar whose 1/16 k plays a square wave at level k+1 (a ramp
 * up within the slot, so a reversed slot ramps down), so the slot sounding in
 * each 1/16 of the output can be read off its level. Pinned:
 *   - Remix off: slot k in 1/16 k (the witness for the rest);
 *   - T1 NORMAL 1: slots 0..9 then 0..5;
 *   - T1 REVERSE 9: sources 4..13, 14, 15, 0..3 — the flagged slots ramp DOWN;
 *   - BREAK 1: its silent steps are silent;
 *   - PITCH 1: a slot pitched +12 plays its square wave an octave up;
 *   - a setting change lands at the next bar line, not mid-bar. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
#define BAR 88200u                  /* one bar at 120 bpm */
static void write_bar(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = BAR, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) {
        double k = (double)i * 16.0 / BAR, pos = k - (int)k;
        int a = (int)((1500.0 * ((int)k + 1)) * (0.6 + 0.4 * pos));
        put_le16(f, (i / 40) % 2 ? a : -a);
    }
    fclose(f);
}
static int wait_loaded(hx_t *h, int t, int c) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        if (au_cl(inst, t, c)->state != 1) return au_cl(inst, t, c)->state;
        usleep(1000);
    }
    return au_cl(inst, t, c)->state;
}

/* one block, the stretcher serviced first as its thread would (Warp: by hand) */
static void r1(hx_t *h) {
    if (au_warp_manual) au_warp_service((seq8_instance_t *)h->inst);
    hx_render(h, 1);
}
static void rn(hx_t *h, int n) { while (n-- > 0) r1(h); }

/* per 1/16 of one bar: the level early in it, late in it, and its zero
 * crossings per sounding block (pitch) */
typedef struct { double early, late, mid; double xr; } sl_t;
static void measure_bar(hx_t *h, sl_t *o) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int slot = inst->tracks[2].pfx.slot, i, k;
    double se[16] = {0}, sl[16] = {0}, sm[16] = {0}, sx[16] = {0};
    int ne[16] = {0}, nl[16] = {0}, nm[16] = {0}, nx[16] = {0};
    /* wait for the NEXT bar's top (a setting made now lands there) */
    for (i = 0; i < 4000 && inst->tracks[2].current_step == 0; i++) r1(h);
    for (i = 0; i < 4000 && !(inst->tracks[2].current_step == 0 && inst->tracks[2].tick_in_step < 3); i++) r1(h);
    for (i = 0; i < 4000; i++) {
        int st = inst->tracks[2].current_step, tis = inst->tracks[2].tick_in_step;
        hx_stub_feed_reset();
        r1(h);
        if (i > 20 && inst->tracks[2].current_step == 0 && st == 15) break;
        /* a silent track feeds its slot nothing at all: no feed is silence */
        const int16_t *b = hx_stub_feed_last(slot);
        int fed = hx_stub_feed(slot, NULL, NULL) > 0;
        double lv = 0; int xc = 0;
        if (fed) for (k = 0; k < 128; k++) { lv += abs(b[k * 2]); if (k && ((b[k * 2] > 0) != (b[k * 2 - 2] > 0))) xc++; }
        lv /= 128.0;
        if (st < 0 || st > 15) continue;
        if (tis >= 3 && tis < 8)   { se[st] += lv; ne[st]++; }
        if (tis >= 16 && tis < 21) { sl[st] += lv; nl[st]++; }
        if (tis >= 6 && tis < 18)  { sm[st] += lv; nm[st]++; }
        if (lv > 400)              { sx[st] += xc; nx[st]++; }   /* pitch: where it sounds (a repitched slot ends early) */
    }
    for (k = 0; k < 16; k++) {
        o[k].early = ne[k] ? se[k] / ne[k] : 0; o[k].late = nl[k] ? sl[k] / nl[k] : 0;
        o[k].mid = nm[k] ? sm[k] / nm[k] : 0; o[k].xr = nx[k] ? sx[k] / nx[k] : 0;
    }
}
/* the source slot a measured level is, against the unit (slot 0's level) */
static int which(double mid, double unit) { return (int)(mid / unit + 0.5) - 1; }

static hx_t *rig(int sync) {
    hx_t *h = hx_create(NULL); HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[400];
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    hx_set_param(h, "t2_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/bar.wav", g_root);
    hx_set_param(h, "t2_au_pick", p);
    HX_ASSERT(wait_loaded(h, 2, 0) == 2, "rig: the sample did not load");
    snprintf(p, sizeof p, "0 %d", sync);
    hx_set_param(h, "t2_au_set_sync", p);
    HX_ASSERT(inst->tracks[2].clips[0].length == 16, "rig: the clip is not one bar");
    hx_set_param(h, "t2_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    return h;
}

int main(void) {
    char p[400];
    int sync, k;
    snprintf(g_root, sizeof g_root, "/tmp/hx_remix_loop_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/bar.wav", g_root); write_bar(p);

    for (sync = 0; sync <= 2; sync++) {                 /* Warp, Vintage, Pitch */
        au_warp_manual = sync == 0;                     /* Warp: the stretcher by hand */
        hx_t *h = rig(sync);
        sl_t m[16];
        double unit;
        char msg[160];
        measure_bar(h, m);                              /* settle a bar */
        /* ==== off: slot k in 1/16 k ==== */
        measure_bar(h, m);
        unit = m[0].mid;
        HX_ASSERT(unit > 100, "Remix off: slot 0 is silent (the witness)");
        for (k = 0; k < 16; k++) {
            snprintf(msg, sizeof msg, "sync %d, Remix off: 1/16 %d does not play slot %d (heard %d)", sync, k, k, which(m[k].mid, unit));
            HX_ASSERT(which(m[k].mid, unit) == k, msg);
        }

        /* ==== T1 NORMAL 1 ==== */
        hx_set_param(h, "t2_remix_type", "0");
        hx_set_param(h, "t2_remix_var", "0");
        hx_set_param(h, "t2_remix_on", "1");
        measure_bar(h, m);
        for (k = 0; k < 16; k++) {
            int want = k < 10 ? k : k - 10;
            snprintf(msg, sizeof msg, "sync %d, T1 NORMAL 1: 1/16 %d plays %d, not %d", sync, k, which(m[k].mid, unit), want);
            HX_ASSERT(which(m[k].mid, unit) == want, msg);
        }

        /* ==== T1 REVERSE 9: sources, and the flagged slots ramp down ==== */
        hx_set_param(h, "t2_remix_var", "24");
        measure_bar(h, m);
        {
            int nrev = 0;
            for (k = 0; k < 16; k++) {
                int want = k < 10 ? 4 + k : (14 + k - 10) & 15;
                /* the first 1/16 starts 2 ticks late (a gap): under Warp the
                 * stretcher's few ticks of delay put that gap in the window
                 * read, so read its later part there */
                double lv = (sync == 0 && k == 0) ? m[k].late * 0.8 / 0.95 : m[k].mid;
                snprintf(msg, sizeof msg, "sync %d, T1 REVERSE 9: 1/16 %d plays %d, not %d", sync, k, which(lv, unit), want);
                HX_ASSERT(which(lv, unit) == want, msg);
                if (k == 0) continue;                   /* the late first slot */
                if (rmx_rev_flag[8][want]) {
                    snprintf(msg, sizeof msg, "sync %d, REVERSE 9: flagged 1/16 %d does not ramp down", sync, k);
                    HX_ASSERT(m[k].early > m[k].late, msg);
                    nrev++;
                } else {
                    snprintf(msg, sizeof msg, "sync %d, REVERSE 9: unflagged 1/16 %d does not ramp up", sync, k);
                    HX_ASSERT(m[k].early < m[k].late, msg);
                }
            }
            HX_ASSERT(nrev > 0, "REVERSE 9: no flagged slot was checked");
        }

        /* ==== BREAK 1 (TYPE 16): step 56 on is silent ==== */
        hx_set_param(h, "t2_remix_type", "15");
        hx_set_param(h, "t2_remix_var", "48");
        measure_bar(h, m);
        HX_ASSERT(m[15].mid < unit * 0.05, "BREAK 1: the silent last 1/16 sounds");
        HX_ASSERT(m[13].mid > unit * 0.5, "BREAK 1: a 1/16 before the break went quiet");

        /* ==== BREAK (TYPE 16): a 1/16 at a partial gate falls silent part way ==== */
        {
            int bv = -1, bk = -1, v;
            for (v = 0; v < RMX_VARS && bv < 0; v++)
                for (k = 1; k < 15 && bv < 0; k++) {
                    int p0 = rmx_break_pct[v][k * 4];
                    if (p0 > 0 && p0 <= 50 && rmx_break_pct[v][k * 4 + 1] == p0 && rmx_break_pct[v][k * 4 + 2] == p0
                        && rmx_break_pct[v][k * 4 + 3] == p0 && rmx_break_pct[v][(k - 1) * 4] == 100) { bv = v; bk = k; }
                }
            HX_ASSERT(bv >= 0, "data: no BREAK variation has a whole 1/16 at <= 50 %");
            snprintf(p, sizeof p, "%d", RMX_BREAK * RMX_VARS + bv);
            hx_set_param(h, "t2_remix_var", p);
            measure_bar(h, m);
            snprintf(msg, sizeof msg, "sync %d, BREAK %d: 1/16 %d at %d %% still sounds late (early %.2f late %.2f units)",
                     sync, bv + 1, bk, rmx_break_pct[bv][bk * 4], m[bk].early / unit, m[bk].late / unit);
            HX_ASSERT(m[bk].early > unit * 0.5 && m[bk].late < m[bk].early * 0.2, msg);
        }

        /* ==== ROLL 1 (TYPE 16): the last 1/16's runs at velocity 40-50 ==== */
        hx_set_param(h, "t2_remix_var", "32");
        measure_bar(h, m);
        {
            /* its runs replay the start of the piece-moved remix's slot 12 —
             * source slot rmx_source[ROLL][0][12] (TYPE 16: piece = slot) —
             * at velocity 40 / 50; that slot's start is ~0.65 of its level */
            int src = rmx_source[RMX_ROLL][0][12];
            double full = (src + 1) * 0.65;
            snprintf(msg, sizeof msg, "sync %d, ROLL 1: the last 1/16 at %.2f units, not about half of its source slot %d's %.2f", sync, m[15].mid / unit, src, full);
            HX_ASSERT(m[15].mid > unit * full * 0.25 && m[15].mid < unit * full * 0.75, msg);
        }

        /* ==== PITCH (TYPE 16): a +12 slot is an octave up ==== */
        {
            int pv = -1, up = -1, flat = -1, v;
            for (v = 0; v < RMX_VARS && pv < 0; v++) {
                int u = -1, f = -1;
                for (k = 1; k < 15; k++) {
                    int src = rmx_source[RMX_PITCH][v][k];
                    if (rmx_pitch[v][src] == 12 && u < 0) u = k;
                    if (rmx_pitch[v][src] == 0 && f < 0) f = k;
                }
                if (u >= 0 && f >= 0) { pv = v; up = u; flat = f; }
            }
            HX_ASSERT(pv >= 0, "data: no PITCH variation has both a +12 and a plain slot");
            snprintf(p, sizeof p, "%d", RMX_PITCH * RMX_VARS + pv);
            hx_set_param(h, "t2_remix_var", p);
            measure_bar(h, m);
            snprintf(msg, sizeof msg, "sync %d, PITCH %d: +12 slot crossings %.1f vs plain %.1f", sync, pv + 1, m[up].xr, m[flat].xr);
            HX_ASSERT(m[up].xr > m[flat].xr * 1.6, msg);
        }

        /* ==== a change lands at the next bar line ==== */
        hx_set_param(h, "t2_remix_type", "0");
        hx_set_param(h, "t2_remix_var", "0");
        measure_bar(h, m);                              /* T1 NORMAL 1 in force */
        {
            seq8_instance_t *inst = (seq8_instance_t *)h->inst;
            int i;
            for (i = 0; i < 4000 && inst->tracks[2].current_step != 6; i++) r1(h);
            hx_set_param(h, "t2_remix_on", "0");        /* mid-bar */
            rn(h, 6);
            rn(h, 30);
            /* still NORMAL 1 in 1/16 11..: slot 1 (level 2), not slot 11 */
            for (i = 0; i < 4000 && inst->tracks[2].current_step != 11; i++) r1(h);
            rn(h, 14);
            hx_stub_feed_reset();
            r1(h);
            {
                const int16_t *b = hx_stub_feed_last(inst->tracks[2].pfx.slot);
                double lv = 0;
                if (hx_stub_feed(inst->tracks[2].pfx.slot, NULL, NULL) > 0) for (k = 0; k < 128; k++) lv += abs(b[k * 2]);
                lv /= 128.0;
                HX_ASSERT(which(lv, unit) == 1, "Remix off landed mid-bar (1/16 11 played slot 11, not NORMAL 1's slot 1)");
            }
            measure_bar(h, m);
            for (k = 0; k < 16; k++) HX_ASSERT(which(m[k].mid, unit) == k, "Remix off did not land at the next bar");
        }
        hx_destroy(h);
    }

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_remix_loop\n");
    return 0;
}
