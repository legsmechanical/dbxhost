/* tests/test_remix_slicer.c — REMIX on a Slicer (Josh, 2026-11-10: "having
 * it work on both makes sense"): the clip's steps remixed bar by bar, as the
 * RS7000 remixes a sliced phrase, and what is HEARD in each 1/16.
 *
 * A one-bar sample in 16 chops, each a square wave at level k+1 ramping up
 * within the chop, laid in order on the 16 steps (>Seq). Pinned:
 *   - Remix off: chop k in 1/16 k (the witness);
 *   - T1 NORMAL 1: chops 0..9 then 0..5;
 *   - T1 REVERSE 9: the flagged chops play reversed (ramp down) while it plays;
 *   - BREAK 1: its silent last 1/16 is silent;
 *   - PITCH: a chop of a +12 source slot plays an octave up;
 *   - ROLL 1: its repeats at their velocity (about half), or with K5 Vel off
 *     at the Slicer's one level;
 *   - Remix off again: the clip's own steps, chops back to normal.
 * The clip's own notes are never touched. */
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
    int slot = inst->tracks[5].pfx.slot, i, k;
    double se[16] = {0}, sl[16] = {0}, sm[16] = {0}, sx[16] = {0};
    int ne[16] = {0}, nl[16] = {0}, nm[16] = {0}, nx[16] = {0};
    /* wait for the NEXT bar's top (a setting made now lands there) */
    for (i = 0; i < 4000 && inst->tracks[5].current_step == 0; i++) r1(h);
    for (i = 0; i < 4000 && !(inst->tracks[5].current_step == 0 && inst->tracks[5].tick_in_step < 3); i++) r1(h);
    for (i = 0; i < 4000; i++) {
        int st = inst->tracks[5].current_step, tis = inst->tracks[5].tick_in_step;
        hx_stub_feed_reset();
        r1(h);
        if (i > 20 && inst->tracks[5].current_step == 0 && st == 15) break;
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


static hx_t *rig(void) {
    hx_t *h = hx_create(NULL); HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[400];
    int i, n = 0;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    hx_set_param(h, "t5_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/bar.wav", AU_SLC, g_root);
    hx_set_param(h, "t5_au_pick", p);
    HX_ASSERT(wait_loaded(h, 5, AU_SLC) == 2, "rig: the sample did not load");
    hx_set_param(h, "t5_au_set_bpm", "16 1200");
    hx_set_param(h, "t5_au_set_even", "16 16");
    hx_set_param(h, "t5_au_chop", "0");                 /* the 16 chops onto the 16 steps */
    for (i = 0; i < inst->tracks[5].clips[0].note_count; i++) n += inst->tracks[5].clips[0].notes[i].active;
    HX_ASSERT(n == 16 && inst->tracks[5].clips[0].length == 16, "rig: the chops were not laid on the 16 steps");
    hx_set_param(h, "t5_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    return h;
}

int main(void) {
    char p[400], msg[200];
    int k;
    hx_t *h;
    seq8_instance_t *inst;
    sl_t m[16];
    double unit;
    snprintf(g_root, sizeof g_root, "/tmp/hx_remix_slicer_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/bar.wav", g_root); write_bar(p);
    au_warp_manual = 0;

    h = rig(); inst = (seq8_instance_t *)h->inst;
    uint16_t own_n = inst->tracks[5].clips[0].note_count;
    note_t own[MAX_NOTES_PER_CLIP];
    memcpy(own, inst->tracks[5].clips[0].notes, sizeof own);

    measure_bar(h, m);
    measure_bar(h, m);
    unit = m[0].mid;
    HX_ASSERT(unit > 100, "Remix off: chop 0 is silent (the witness)");
    for (k = 0; k < 16; k++) {
        snprintf(msg, sizeof msg, "Remix off: 1/16 %d does not play chop %d (heard %d)", k, k, which(m[k].mid, unit));
        HX_ASSERT(which(m[k].mid, unit) == k, msg);
    }

    /* ==== T1 NORMAL 1 ==== */
    hx_set_param(h, "t5_remix_type", "0");
    hx_set_param(h, "t5_remix_var", "0");
    hx_set_param(h, "t5_remix_on", "1");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        int want = k < 10 ? k : k - 10;
        snprintf(msg, sizeof msg, "T1 NORMAL 1: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
    }

    /* ==== T1 REVERSE 9: sources, and the flagged chops reversed ==== */
    hx_set_param(h, "t5_remix_var", "24");
    measure_bar(h, m);
    {
        int nrev = 0;
        for (k = 1; k < 16; k++) {
            int want = k < 10 ? 4 + k : (14 + k - 10) & 15;
            snprintf(msg, sizeof msg, "T1 REVERSE 9: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
            HX_ASSERT(which(m[k].mid, unit) == want, msg);
            if (rmx_rev_flag[8][want]) {
                snprintf(msg, sizeof msg, "REVERSE 9: flagged chop in 1/16 %d does not ramp down", k);
                HX_ASSERT(m[k].early > m[k].late, msg);
                nrev++;
            } else {
                snprintf(msg, sizeof msg, "REVERSE 9: unflagged chop in 1/16 %d does not ramp up", k);
                HX_ASSERT(m[k].early < m[k].late, msg);
            }
        }
        HX_ASSERT(nrev > 0, "REVERSE 9: no flagged chop was checked");
    }

    /* ==== BREAK 1 (TYPE 16): the last 1/16 silent ==== */
    hx_set_param(h, "t5_remix_type", "15");
    hx_set_param(h, "t5_remix_var", "48");
    measure_bar(h, m);
    HX_ASSERT(m[15].mid < unit * 0.05, "BREAK 1: the silent last 1/16 sounds");
    HX_ASSERT(m[13].mid > unit * 0.5, "BREAK 1: a 1/16 before the break went quiet");

    /* ==== PITCH (TYPE 16): a +12 chop an octave up ==== */
    {
        int pv = -1, up = -1, flat = -1, v;
        for (v = 0; v < RMX_VARS && pv < 0; v++) {
            int u = -1, f = -1;
            for (k = 1; k < 15; k++) {
                int src = rmx_source[RMX_PITCH][v][k];
                if (rmx_pitch[v][src] == 12 && u < 0) u = k;
                if (rmx_pitch[v][src] == 0 && f < 0) f = k;
            }
            /* a chop's pitch is its KEY's, track-wide (as the RS7000's sample
             * keys): the plain slot must not play a chop some other slot pitched */
            if (u >= 0 && f >= 0) {
                int fs = rmx_source[RMX_PITCH][v][f], clash = 0, j;
                for (j = 0; j < 16; j++) if (rmx_source[RMX_PITCH][v][j] == fs && rmx_pitch[v][fs]) clash = 1;
                if (!clash) { pv = v; up = u; flat = f; }
            }
        }
        HX_ASSERT(pv >= 0, "data: no PITCH variation has both a +12 and a plain slot");
        snprintf(p, sizeof p, "%d", RMX_PITCH * RMX_VARS + pv);
        hx_set_param(h, "t5_remix_var", p);
        measure_bar(h, m);
        snprintf(msg, sizeof msg, "PITCH %d: +12 chop crossings %.1f vs plain %.1f", pv + 1, m[up].xr, m[flat].xr);
        HX_ASSERT(m[up].xr > m[flat].xr * 1.6, msg);
    }

    /* ==== ROLL 1 (TYPE 16): repeats at their velocity; Vel off: one level ==== */
    hx_set_param(h, "t5_remix_var", "32");
    measure_bar(h, m);
    {
        int src = rmx_source[RMX_ROLL][0][12], j, ref = -1;
        for (j = 1; j < 14; j++) if (rmx_source[RMX_ROLL][0][j] == src) { ref = j; break; }
        HX_ASSERT(ref >= 0, "data: ROLL 1 plays slot 12's source nowhere else in the bar");
        snprintf(msg, sizeof msg, "ROLL 1: the last 1/16 at %.2f of the same chop at full level (want ~0.3-0.5)", m[15].mid / m[ref].mid);
        HX_ASSERT(m[15].mid > m[ref].mid * 0.25 && m[15].mid < m[ref].mid * 0.55, msg);
        hx_set_param(h, "t5_remix_rvel", "0");
        measure_bar(h, m);
        snprintf(msg, sizeof msg, "ROLL 1 Vel Off: the last 1/16 at %.2f of the same chop (want ~0.8)", m[15].mid / m[ref].mid);
        HX_ASSERT(m[15].mid > m[ref].mid * 0.65, msg);
    }

    /* ==== stopped: no sequenced hit left waiting — a pad played now plays
     * the chop as it is, never reversed / repitched by a remix gone quiet ==== */
    hx_set_param(h, "t5_remix_type", "0");
    hx_set_param(h, "t5_remix_var", "24");                /* REVERSE 9 */
    measure_bar(h, m);
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    {
        int i, any = 0;
        for (i = 0; i < AU_MAX_SLICES; i++) any |= inst->au_trk[5].nm_on[i];
        HX_ASSERT(!any && !inst->au_trk[5].rmx_slive, "stopped, a sequenced hit is still waiting for a chop");
    }
    hx_set_param(h, "transport", "play");

    /* ==== off again: the clip's own steps, the chops as they were ==== */
    hx_set_param(h, "t5_remix_on", "0");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        snprintf(msg, sizeof msg, "Remix off again: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), k);
        HX_ASSERT(which(m[k].mid, unit) == k && m[k].early < m[k].late, msg);
    }
    HX_ASSERT(inst->tracks[5].clips[0].note_count == own_n && !memcmp(own, inst->tracks[5].clips[0].notes, sizeof own),
              "the remix changed the clip's own notes");
    /* ==== A STEP'S OWN SOUND (Josh, 2026-11-11: per-step reverse and pitch on
     * Slicer steps, "that's the way"), Remix off: step 4 reversed, step 7 an
     * octave up; the rest as they were; saved and reloaded ==== */
    hx_set_param(h, "t5_remix_on", "0");
    measure_bar(h, m);
    hx_set_param(h, "t5_c0_step_3_xrev", "1");
    hx_set_param(h, "t5_c0_step_6_xsemi", "12");
    HX_ASSERT(inst->tracks[5].clips[0].step_xrev[3] == 1 && (int8_t)inst->tracks[5].clips[0].step_xsemi[6] == 12, "the step keys did not land");
    measure_bar(h, m);
    measure_bar(h, m);
    HX_ASSERT(which(m[3].mid, unit) == 3 && m[3].early > m[3].late, "step 4 does not play its chop reversed");
    HX_ASSERT(m[2].early < m[2].late && m[4].early < m[4].late, "a neighbouring step played reversed");
    snprintf(msg, sizeof msg, "step 7 not an octave up: crossings %.1f vs step 6's %.1f", m[6].xr, m[5].xr);
    HX_ASSERT(m[6].xr > m[5].xr * 1.6, msg);
    {
        char b[32];
        hx_get_param(h, "t5_c0_step_6_xsemi", b, sizeof b);
        HX_ASSERT(atoi(b) == 12, "the step's pitch does not read back");
    }
    /* ...Start / Length: the part of the chop the step plays (Josh,
     * 2026-11-11: "have length set sample length for that step" · "a slice
     * start/end knob"). Step 9 Length 50 %: its first half, then quiet; step
     * 11 Start 50 %: its second half (the louder end of its ramp), then quiet */
    hx_set_param(h, "t5_c0_step_8_xlen", "50");
    hx_set_param(h, "t5_c0_step_10_xstart", "50");
    measure_bar(h, m);
    measure_bar(h, m);
    snprintf(msg, sizeof msg, "Length 50 %%: step 9 still sounds late (early %.0f late %.0f)", m[8].early, m[8].late);
    HX_ASSERT(m[8].early > unit * 3 && m[8].late < m[8].early * 0.2, msg);
    snprintf(msg, sizeof msg, "Start 50 %%: step 11 does not start in its chop's second half (early %.0f vs step 10's %.0f)", m[10].early, m[9].early);
    HX_ASSERT(m[10].early / 11.0 > m[9].early / 10.0 * 1.15 && m[10].late < m[10].early * 0.2, msg);
    {
        char b[32];
        hx_get_param(h, "t5_c0_step_8_xlen", b, sizeof b);
        HX_ASSERT(atoi(b) == 50, "Length does not read back");
        hx_get_param(h, "t5_c0_step_7_xlen", b, sizeof b);
        HX_ASSERT(atoi(b) == 100, "an untouched step's Length does not read 100");
    }
    hx_set_param(h, "t5_c0_step_8_xlen", "100");
    hx_set_param(h, "t5_c0_step_10_xstart", "0");
    HX_ASSERT(!inst->tracks[5].clips[0].step_xlen[8] && !inst->tracks[5].clips[0].step_xstart[10], "100 % / 0 % are not stored as 'as the chop is'");

    /* ...a ratchet repeats the step's sound */
    hx_set_param(h, "t5_c0_step_3_ratch", "2");
    measure_bar(h, m);
    measure_bar(h, m);
    HX_ASSERT(m[3].late > 100 && m[3].early > m[3].late * 0.9, "a ratcheted reversed step's repeat did not play reversed");
    hx_set_param(h, "t5_c0_step_3_ratch", "0");
    /* ...saved and reloaded */
    seq8_save_state(inst);
    {
        /* (a second instance would take over the harness's one handle: read the file) */
        FILE *f = fopen(inst->state_path, "r");
        static char sb[1 << 20]; size_t sn;
        HX_ASSERT(f, "no state file");
        sn = fread(sb, 1, sizeof sb - 1, f); sb[sn] = 0; fclose(f);
        HX_ASSERT(strstr(sb, "\"t5c0_sxr\":\"00000001") && strstr(sb, "\"t5c0_sxs\":\"0000000000000c"),
                  "the step's sound was not saved (t5c0_sxr / t5c0_sxs)");
        /* ...and read back by the loader */
        inst->tracks[5].clips[0].step_xrev[3] = 0; inst->tracks[5].clips[0].step_xsemi[6] = 0;
        parse_step_hex_arr(sb, "t5c0_sxr", inst->tracks[5].clips[0].step_xrev,  inst->tracks[5].clips[0].length, 1);
        parse_step_hex_arr(sb, "t5c0_sxs", inst->tracks[5].clips[0].step_xsemi, inst->tracks[5].clips[0].length, 255);
        HX_ASSERT(inst->tracks[5].clips[0].step_xrev[3] == 1 && (int8_t)inst->tracks[5].clips[0].step_xsemi[6] == 12,
                  "the saved step sound does not parse back");
    }
    hx_set_param(h, "t5_c0_step_3_xrev", "0");
    hx_set_param(h, "t5_c0_step_6_xsemi", "0");

    /* ==== BAKE (Josh, 2026-11-11: "bake is flatten what you hear in the
     * context of the track type"): the remixed steps become the clip's, REMIX
     * turns off, and the clip plays as the remix did ==== */
    hx_set_param(h, "t5_remix_type", "0");
    hx_set_param(h, "t5_remix_var", "0");                 /* T1 NORMAL 1 */
    hx_set_param(h, "t5_remix_on", "1");
    measure_bar(h, m);
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_set_param(h, "bake", "5 0 0 1 0 0");
    HX_ASSERT(!inst->tracks[5].clips[0].pfx_params.rmx_on, "bake left REMIX on");
    {
        int i, n = 0, at10 = -1;
        for (i = 0; i < inst->tracks[5].clips[0].note_count; i++) {
            const note_t *nt = &inst->tracks[5].clips[0].notes[i];
            if (!nt->active) continue;
            n++;
            if (nt->tick == 10u * 24) at10 = nt->pitch - AU_NOTE_BASE;
        }
        HX_ASSERT(n == 16, "bake did not leave 16 steps");
        HX_ASSERT(at10 == 0, "baked step 11 is not chop 1 (NORMAL 1's second piece starts over)");
    }
    hx_set_param(h, "transport", "play");
    measure_bar(h, m);
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        int want = k < 10 ? k : k - 10;
        snprintf(msg, sizeof msg, "baked: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
    }
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_remix_slicer\n");
    return 0;
}
