/* tests/test_audio_repeat_tape.c — REPEAT and TAPE, the two Audio / Slicer FX
 * banks beside REMIX (Josh, 2026-11-14: "implement the 2 other slice/audio
 * track effects banks (and test)"). Pinned:
 *   REPEAT (seq8_repeat.h rpt_bar, after REMIX): the window's events replaced
 *     by the grabbed piece, again and again — Grid, Start, Length, Gate, Pitch,
 *     Fade; heard on a Slicer (what 1/16 plays which chop), on a Loop clip's
 *     latched bar, in the Slicer's export and its Bake;
 *   TAPE (au_tape_*): the head over a ramp (Stop, Start, Half, Back, the way
 *     back), the bar-cycle windows, and heard on a Slicer — Back plays the
 *     last 1/16s backwards in order, Half lags, Stop fades, Start lags out of
 *     silence; its export the same;
 *   both saved / loaded sparse, read back in the clip snapshot.
 * Rig: test_remix_slicer's — a one-bar sample in 16 chops at levels 1..16. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>
#include <math.h>

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


/* the export's rendered file (44-byte header, 16-bit stereo): the mean level
 * of the middle of 1/16 k of a one-bar render */
static double wav_part_level(const char *line, int k, int part);
static double wav_slot_level(const char *line, int k) { return wav_part_level(line, k, -1); }
/* part 0: the first third of 1/16 k, 2: its last third, -1: its middle */
static double wav_part_level(const char *line, int k, int part) {
    const char *bar = strchr(line, '|');
    FILE *f;
    static int16_t buf[88200 * 2 + 64];
    long n;
    if (!bar) return -1;
    f = fopen(bar + 1, "rb");
    if (!f) return -1;
    fseek(f, 44, SEEK_SET);
    n = (long)fread(buf, sizeof(int16_t), sizeof buf / sizeof buf[0], f) / 2;
    fclose(f);
    {
        long a = (long)(k * n / 16 + n / 64), b = (long)((k + 1) * n / 16 - n / 64), i;
        if (part == 0) b = a + (b - a) / 3;
        if (part == 2) a = b - (b - a) / 3;
        double s = 0;
        if (b <= a) return -1;
        for (i = a; i < b; i++) s += abs(buf[i * 2]);
        return s / (double)(b - a);
    }
}


/* ---- REPEAT, the transform alone ---- */
static void repeat_unit(void) {
    rmx_ev_t in[16], out[RMX_MAX];
    rpt_dials_t d;
    int k, n;
    char msg[200];
    memset(in, 0, sizeof in);
    for (k = 0; k < 16; k++) { in[k].tick = k * 24; in[k].gate = 24; in[k].vel = 100; in[k].key = (uint8_t)k; }
    /* 1/16 from slot 12 for 4: 12 12 12 12 */
    d.grid = 2; d.at = 12; d.len = 4; d.gate = 100; d.pitch = 0; d.fade = 0;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    HX_ASSERT(n == 16, "REPEAT 1/16: not 16 events");
    for (k = 0; k < 16; k++) {
        int want = k < 12 ? k : 12;
        snprintf(msg, sizeof msg, "REPEAT 1/16 at 13 for 4: event %d at %d key %d, want %d key %d", k, out[k].tick, out[k].key, k * 24, want);
        HX_ASSERT(out[k].tick == k * 24 && out[k].key == want && out[k].gate == 24 && out[k].vel == 100, msg);
    }
    /* 1/32: 8 hits of slot 12 across the last beat, each 12 ticks long */
    d.grid = 3;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    HX_ASSERT(n == 12 + 8, "REPEAT 1/32: not 12 + 8 events");
    for (k = 0; k < 8; k++) HX_ASSERT(out[12 + k].tick == 288 + k * 12 && out[12 + k].key == 12 && out[12 + k].gate == 12, "REPEAT 1/32: a hit is not slot 12 every 12 ticks, 12 long");
    /* 1/4 over the whole bar: 0 1 2 3, four times */
    d.grid = 0; d.at = 0; d.len = 16;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    HX_ASSERT(n == 16, "REPEAT 1/4: not 16 events");
    for (k = 0; k < 16; k++) HX_ASSERT(out[k].key == (k & 3) && out[k].tick == k * 24, "REPEAT 1/4: not 0 1 2 3 x4");
    /* Gate 50, Pitch +2, Fade 50 */
    d.grid = 2; d.at = 12; d.len = 4; d.gate = 50; d.pitch = 2; d.fade = 50;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    {
        int vel[4] = { 100, 50, 25, 13 };
        for (k = 0; k < 4; k++) {
            snprintf(msg, sizeof msg, "REPEAT Gate/Pitch/Fade: repeat %d gate %d pitch %d vel %d", k, out[12 + k].gate, out[12 + k].pitch, out[12 + k].vel);
            HX_ASSERT(out[12 + k].gate == 12 && out[12 + k].pitch == 2 * k && out[12 + k].vel == vel[k], msg);
        }
        HX_ASSERT(out[11].gate == 24 && out[11].vel == 100 && out[11].pitch == 0, "REPEAT touched an event outside its window");
    }
    /* cut at the bar's end, and Pitch held to +-24 */
    d.grid = 0; d.at = 14; d.len = 16; d.gate = 100; d.pitch = 12; d.fade = 0;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    HX_ASSERT(n == 16 && out[14].key == 14 && out[15].key == 15, "REPEAT past the bar's end: not cut there");
    d.grid = 4; d.at = 0; d.len = 16;
    n = rpt_bar(&d, 384, in, 16, out, RMX_MAX);
    HX_ASSERT(n == 64 && out[63].pitch == 24 && out[63].key == 0, "REPEAT 1/64 x64: pitch not held at +24");
    printf("  ok   — REPEAT: Grid, Start, Length, Gate, Pitch and Fade as the transform\n");
}

/* ---- TAPE, the head over a ramp ---- */
static int16_t g_ring[AU_TAPE_RING * 2];
static void tape_unit(void) {
    au_tape_t T;
    int32_t l, r;
    int i, fx;
    char msg[200];
    const double wf = 4000;
    /* the ramp: frame i reads i % 30000 */
    for (fx = 0; fx < AU_TAPE_FX; fx++) {
        double want_e[4] = { 0, 1000, 2000, 3000 };
        memset(&T, 0, sizeof T); memset(g_ring, 0, sizeof g_ring);
        for (i = 0; i < 20000; i++) { l = r = i % 30000; au_tape_frame(&T, g_ring, &l, &r, 0, fx, wf); HX_ASSERT(l == i % 30000, "TAPE outside a window is not straight through"); }
        double r0 = 20000;
        int j;
        for (j = 0; j < 4000; j++) {
            int32_t in = (20000 + j) % 30000;
            l = r = in;
            au_tape_frame(&T, g_ring, &l, &r, 1, fx, wf);
            double e = j, pos;
            int k;
            for (k = 0; k < 4; k++) if (e == want_e[k] && e > 0) {
                double g = 1;
                if (fx == AU_TAPE_STOP)  { pos = r0 + e - e * e / (2 * wf); g = (wf - e) / AU_TAPE_FADE; if ((1 - e / wf) / AU_TAPE_SLOW < g) g = (1 - e / wf) / AU_TAPE_SLOW; }
                else if (fx == AU_TAPE_START) { pos = r0 + e * e / (2 * wf); g = e / AU_TAPE_FADE; if ((e / wf) / AU_TAPE_SLOW < g) g = (e / wf) / AU_TAPE_SLOW; }
                else if (fx == AU_TAPE_HALF)  pos = r0 + e / 2;
                else pos = r0 - e;
                if (g > 1) g = 1;
                double want = pos * g;
                snprintf(msg, sizeof msg, "TAPE fx %d at %g: %d, want %.1f", fx, e, l, want);
                HX_ASSERT(fabs((double)l - want) <= 1.5, msg);
            }
        }
        /* the window closes: back to the track (Stop at once; the rest over AU_TAPE_XF) */
        for (j = 0; j < AU_TAPE_XF + 4; j++) {
            int32_t in = (24000 + j) % 30000;
            l = r = in;
            au_tape_frame(&T, g_ring, &l, &r, 0, fx, wf);
            if (j == AU_TAPE_XF + 2) {
                snprintf(msg, sizeof msg, "TAPE fx %d: not back to the track after the window (%d vs %d)", fx, l, in);
                HX_ASSERT(l == in && T.st == 0, msg);
            }
        }
    }
    /* the bar cycle: Every 1, 1/4 bar (96 ticks) — the last beat; Start the first */
    HX_ASSERT(!au_tape_inwin(287, AU_TAPE_STOP, 0, 2) && au_tape_inwin(288, AU_TAPE_STOP, 0, 2) && au_tape_inwin(383.9, AU_TAPE_STOP, 0, 2)
              && !au_tape_inwin(384, AU_TAPE_STOP, 0, 2), "TAPE Every 1 bar, 1/4: not the last beat");
    HX_ASSERT(au_tape_inwin(0, AU_TAPE_START, 0, 2) && au_tape_inwin(95, AU_TAPE_START, 0, 2) && !au_tape_inwin(96, AU_TAPE_START, 0, 2),
              "TAPE Start: not the first beat");
    HX_ASSERT(!au_tape_inwin(383, AU_TAPE_STOP, 1, 2) && au_tape_inwin(767, AU_TAPE_STOP, 1, 2) && !au_tape_inwin(768 + 300, AU_TAPE_STOP, 1, 2),
              "TAPE Every 2 bars: not the last beat of every other bar");
    /* a window longer than the ring has behind it is held to it (Back: what is there) */
    memset(&T, 0, sizeof T);
    for (i = 0; i < 3000; i++) { l = r = 100; au_tape_frame(&T, g_ring, &l, &r, i >= 2000, AU_TAPE_BACK, 100000); }
    HX_ASSERT(T.wf <= 2000 - 1024 + 1, "TAPE Back: a window longer than the ring's past was not held to it");
    /* Back over a whole bar at 100 BPM (105840 frames), the ring full: the
     * past backwards all the way, never the audio written in the window
     * (found by review: at the old 4 s ring it went wrong at frame 88200) */
    memset(&T, 0, sizeof T);
    for (i = 0; i < AU_TAPE_RING; i++) { l = r = i % 30000; au_tape_frame(&T, g_ring, &l, &r, 0, AU_TAPE_BACK, 105840); }
    {
        int bad = 0, j;
        double r0 = AU_TAPE_RING;
        for (j = 0; j < 105840; j++) {
            l = r = (AU_TAPE_RING + j) % 30000;
            au_tape_frame(&T, g_ring, &l, &r, 1, AU_TAPE_BACK, 105840);
            long want = ((long)(r0 - j) % 30000 + 30000) % 30000;
            if (j > 0 && labs((long)l - want) > 1) bad++;
        }
        snprintf(msg, sizeof msg, "TAPE Back, a bar at 100 BPM: %d frames read the wrong audio", bad);
        HX_ASSERT(bad == 0, msg);
    }
    /* ...and a bar at 50 BPM (211680 frames, past half the ring): held to half
     * the ring, every frame of it the past, backwards */
    memset(&T, 0, sizeof T);
    for (i = 0; i < AU_TAPE_RING; i++) { l = r = i % 30000; au_tape_frame(&T, g_ring, &l, &r, 0, AU_TAPE_BACK, 211680); }
    {
        int bad = 0, j;
        double r0 = AU_TAPE_RING, half = (AU_TAPE_RING - 1024) / 2.0;
        for (j = 0; j < 211680; j++) {
            l = r = (AU_TAPE_RING + j) % 30000;
            au_tape_frame(&T, g_ring, &l, &r, 1, AU_TAPE_BACK, 211680);
            if (j == 0) { HX_ASSERT(fabs(T.wf - half) < 1.0, "TAPE Back, a bar at 50 BPM: not held to half the ring"); }
            if (T.st != 1) break;
            long want = ((long)(r0 - j) % 30000 + 30000) % 30000;
            if (j > 0 && labs((long)l - want) > 1) bad++;
        }
        snprintf(msg, sizeof msg, "TAPE Back, a bar at 50 BPM: %d frames read the wrong audio", bad);
        HX_ASSERT(bad == 0, msg);
    }
    /* Start on the first bar after a load (nothing written yet) still plays */
    memset(&T, 0, sizeof T);
    l = r = 0;
    au_tape_frame(&T, g_ring, &l, &r, 1, AU_TAPE_START, 22050);
    HX_ASSERT(T.st == 1 && T.wf == 22050, "TAPE Start on the first frame after a load was skipped");
    printf("  ok   — TAPE: Stop, Start, Half and Back over a ramp, the way back, the bar cycle\n");
}

/* rmx_ev keys of a Loop clip's latched bar, as a string */
static void keys_of(const au_track_t *at, char *o, int n) {
    int i, len = 0;
    o[0] = 0;
    for (i = 0; i < at->rmx_n && len < n - 8; i++) len += snprintf(o + len, (size_t)(n - len), "%s%d", i ? "," : "", at->rmx_e[i].key);
}

int main(void) {
    char p[400], msg[300];
    int k;
    hx_t *h;
    seq8_instance_t *inst;
    sl_t m[16];
    double unit;
    snprintf(g_root, sizeof g_root, "/tmp/hx_repeat_tape_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/bar.wav", g_root); write_bar(p);
    au_warp_manual = 0;

    repeat_unit();
    tape_unit();

    h = rig(); inst = (seq8_instance_t *)h->inst;
    measure_bar(h, m);
    measure_bar(h, m);
    unit = m[0].mid;
    HX_ASSERT(unit > 100, "witness: chop 0 is silent");
    for (k = 0; k < 16; k++) HX_ASSERT(which(m[k].mid, unit) == k, "witness: a 1/16 does not play its own chop");

    /* ==== REPEAT on a Slicer, heard ==== */
    hx_set_param(h, "t5_repeat_on", "1");                    /* 1/16 from 13 for 4 (the defaults) */
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        int want = k < 12 ? k : 12;
        snprintf(msg, sizeof msg, "REPEAT (defaults): 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
    }
    hx_set_param(h, "t5_repeat_grid", "1");                  /* 1/8 from 9 for 8: 8 9 8 9 ... */
    hx_set_param(h, "t5_repeat_at", "8");
    hx_set_param(h, "t5_repeat_len", "8");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        int want = k < 8 ? k : 8 + (k & 1);
        snprintf(msg, sizeof msg, "REPEAT 1/8 at 9 for 8: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
    }
    /* Fade: each repeat quieter (a Slicer plays a repeat at its level) */
    hx_set_param(h, "t5_repeat_grid", "2");
    hx_set_param(h, "t5_repeat_at", "12");
    hx_set_param(h, "t5_repeat_len", "4");
    hx_set_param(h, "t5_repeat_fade", "50");
    measure_bar(h, m);
    snprintf(msg, sizeof msg, "REPEAT Fade 50: 1/16s 13-16 at %.0f %.0f %.0f %.0f", m[12].mid, m[13].mid, m[14].mid, m[15].mid);
    HX_ASSERT(m[13].mid < m[12].mid * 0.75 && m[14].mid < m[13].mid * 0.8 && m[15].mid < m[14].mid * 0.8 && m[15].mid > 10, msg);
    hx_set_param(h, "t5_repeat_fade", "0");
    /* Export: the repeat rendered */
    {
        char b[512];
        static char stage[300];
        snprintf(stage, sizeof stage, "%s/stage", g_root); mkdir(stage, 0775);
        au_export_dir = stage;
        HX_ASSERT(hx_get_param(h, "t5_c0_au_export", b, sizeof b) > 0 && b[0] == 'S', "REPEAT: the Slicer clip did not export");
        double l12 = wav_slot_level(b, 12), l14 = wav_slot_level(b, 14), l11 = wav_slot_level(b, 11);
        snprintf(msg, sizeof msg, "REPEAT export: 1/16 15 at %.0f vs 13 at %.0f (12: %.0f)", l14, l12, l11);
        HX_ASSERT(l12 > 100 && fabs(l14 - l12) < l12 * 0.25 && l11 < l12, msg);
    }
    /* with REMIX: REMIX first (T1 NORMAL 1: 0..9 0..5), then REPEAT of 1/16 13 = chop 2 */
    hx_set_param(h, "t5_remix_type", "0");
    hx_set_param(h, "t5_remix_var", "0");
    hx_set_param(h, "t5_remix_on", "1");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) {
        int want = k < 10 ? k : k < 12 ? k - 10 : 2;
        snprintf(msg, sizeof msg, "REMIX then REPEAT: 1/16 %d plays %d, not %d", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
    }
    hx_set_param(h, "t5_remix_on", "0");
    hx_set_param(h, "t5_repeat_on", "0");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) HX_ASSERT(which(m[k].mid, unit) == k, "REPEAT off: a 1/16 does not play its own chop again");
    printf("  ok   — REPEAT on a Slicer: heard, with Fade, after REMIX, exported; off again\n");

    /* ==== TAPE on a Slicer, heard ==== */
    hx_set_param(h, "t5_tape_fx", "3");                      /* Back, the last 1/4 of every bar */
    hx_set_param(h, "t5_tape_on", "1");
    measure_bar(h, m);
    measure_bar(h, m);
    for (k = 1; k < 12; k++) HX_ASSERT(which(m[k].mid, unit) == k, "TAPE Back: a 1/16 before the window changed");
    for (k = 12; k < 16; k++) {
        int want = 23 - k;
        snprintf(msg, sizeof msg, "TAPE Back: 1/16 %d plays %d, not %d (backwards)", k, which(m[k].mid, unit), want);
        HX_ASSERT(which(m[k].mid, unit) == want, msg);
        snprintf(msg, sizeof msg, "TAPE Back: 1/16 %d does not ramp down (%.0f -> %.0f)", k, m[k].early, m[k].late);
        HX_ASSERT(m[k].early > m[k].late, msg);
    }
    hx_set_param(h, "t5_tape_fx", "2");                      /* Half: chop 12 then 13, at half speed */
    measure_bar(h, m);
    snprintf(msg, sizeof msg, "TAPE Half: crossings in 1/16s 13-16 %.1f %.1f %.1f %.1f vs 6 %.1f; levels %.0f %.0f %.0f %.0f",
             m[12].xr, m[13].xr, m[14].xr, m[15].xr, m[5].xr, m[12].mid, m[13].mid, m[14].mid, m[15].mid);
    HX_ASSERT(m[12].xr < m[5].xr * 0.7 && m[13].xr < m[5].xr * 0.7 && m[15].xr < m[5].xr * 0.7, msg);
    /* half a chop a 1/16: 13 is chop 12's second half, louder than 12's first; 14 starts chop 13 */
    HX_ASSERT(m[13].mid > m[12].mid && m[14].mid < m[13].mid && m[15].mid > m[14].mid && m[14].mid > m[12].mid, msg);
    hx_set_param(h, "t5_tape_fx", "0");                      /* Stop: slowing and fading into the bar line */
    measure_bar(h, m);
    /* the pitch falls 1/16 by 1/16 (the head slowing: 7/8, 5/8, 3/8, 1/8 of the speed);
     * the fade to silence is its last AU_TAPE_FADE frames (tape_unit pins it) */
    snprintf(msg, sizeof msg, "TAPE Stop: crossings in the last 1/16s %.1f %.1f %.1f %.1f (6: %.1f)", m[12].xr, m[13].xr, m[14].xr, m[15].xr, m[5].xr);
    HX_ASSERT(m[12].xr < m[5].xr && m[13].xr < m[12].xr && m[14].xr < m[13].xr && m[15].xr < m[14].xr && m[14].xr < m[5].xr * 0.55, msg);
    HX_ASSERT(which(m[1].mid, unit) == 1 && which(m[0].mid, unit) == 0, "TAPE Stop: the bar after the stop does not start as it was");
    hx_set_param(h, "t5_tape_fx", "1");                      /* Start: out of silence, lagging, the first 1/4 */
    measure_bar(h, m);
    snprintf(msg, sizeof msg, "TAPE Start: the first 1/16s play %d %d %d %d (1/16 1 early %.0f vs unit %.0f; 1/16 6 plays %d)", which(m[0].mid, unit), which(m[1].mid, unit), which(m[2].mid, unit), which(m[3].mid, unit), m[0].early, unit, which(m[5].mid, unit));
    HX_ASSERT(which(m[3].mid, unit) < 3 && which(m[3].mid, unit) >= 0 && m[1].xr < m[5].xr * 0.6 && m[2].xr < m[3].xr
              && which(m[5].mid, unit) == 5, msg);
    /* its export: Back over the render */
    hx_set_param(h, "t5_tape_fx", "3");
    {
        char b[512];
        HX_ASSERT(hx_get_param(h, "t5_c0_au_export", b, sizeof b) > 0 && b[0] == 'S', "TAPE: the Slicer clip did not export");
        double l13 = wav_slot_level(b, 13), l10 = wav_slot_level(b, 10), l2 = wav_slot_level(b, 2);
        snprintf(msg, sizeof msg, "TAPE export: 1/16 14 at %.0f, want 1/16 11's %.0f (1/16 3: %.0f)", l13, l10, l2);
        HX_ASSERT(l2 > 50 && fabs(l13 - l10) < l10 * 0.25, msg);
    }
    hx_set_param(h, "t5_tape_on", "0");
    measure_bar(h, m);
    for (k = 0; k < 16; k++) HX_ASSERT(which(m[k].mid, unit) == k, "TAPE off: a 1/16 does not play its own chop again");
    printf("  ok   — TAPE on a Slicer: Back, Half, Stop and Start heard; exported; off again\n");

    /* ==== saved, loaded, read back ==== */
    hx_set_param(h, "t5_repeat_on", "1");
    hx_set_param(h, "t5_repeat_grid", "3");
    hx_set_param(h, "t5_repeat_pit", "-5");
    hx_set_param(h, "t5_tape_on", "1");
    hx_set_param(h, "t5_tape_every", "2");
    hx_set_param(h, "t5_tape_len", "4");
    {
        char b[2048];
        HX_ASSERT(hx_get_param(h, "t5_c0_pfx_snapshot", b, sizeof b) > 0, "no clip snapshot");
        int v[80], nv = 0;
        char *q = b;
        while (*q && nv < 80) { v[nv++] = (int)strtol(q, &q, 10); while (*q == ' ') q++; }
        snprintf(msg, sizeof msg, "the snapshot's REPEAT / TAPE fields (%d values): %d %d %d %d %d %d %d / %d %d %d %d", nv,
                 v[55], v[56], v[57], v[58], v[59], v[60], v[61], v[62], v[63], v[64], v[65]);
        HX_ASSERT(nv == 66 && v[55] == 1 && v[56] == 3 && v[57] == 12 && v[58] == 4 && v[59] == 100 && v[60] == -5 && v[61] == 0
                  && v[62] == 1 && v[63] == 3 && v[64] == 2 && v[65] == 4, msg);
    }
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char st[1 << 20]; size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        HX_ASSERT(strstr(st, "\"t5c0_rpo\":1") && strstr(st, "\"t5c0_rpg\":3") && strstr(st, "\"t5c0_rpp\":-5")
                  && !strstr(st, "t5c0_rpa") && !strstr(st, "t5c0_rpl"), "REPEAT not saved sparse");
        HX_ASSERT(strstr(st, "\"t5c0_tpo\":1") && strstr(st, "\"t5c0_tpf\":3") && strstr(st, "\"t5c0_tpe\":2") && strstr(st, "\"t5c0_tpl\":4"),
                  "TAPE not saved");
        HX_ASSERT(!strstr(st, "t5c1_rpo") && !strstr(st, "t5c1_tp"), "a clip without them saved REPEAT / TAPE keys");
    }
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    {
        const clip_pfx_params_t *pp = &inst->tracks[5].clips[0].pfx_params;
        HX_ASSERT(pp->rpt_on == 1 && pp->rpt_grid == 3 && pp->rpt_at == 12 && pp->rpt_len == 4 && pp->rpt_pit == -5 && pp->rpt_gate == 100
                  && pp->tape_on == 1 && pp->tape_fx == 3 && pp->tape_every == 2 && pp->tape_len == 4, "REPEAT / TAPE did not reload");
        const clip_pfx_params_t *p1 = &inst->tracks[5].clips[1].pfx_params;
        HX_ASSERT(!p1->rpt_on && p1->rpt_grid == 2 && p1->rpt_at == 12 && p1->rpt_len == 4 && !p1->tape_on && p1->tape_len == 2,
                  "a clip without them did not load the defaults");
    }
    printf("  ok   — REPEAT and TAPE saved sparse, loaded, in the clip snapshot\n");
    hx_destroy(h);

    /* ==== a Loop clip: its latched bar carries the repeat ==== */
    {
        hx_t *g = hx_create(NULL); HX_NO_LEAD(g);
        seq8_instance_t *in2 = (seq8_instance_t *)g->inst;
        char ks[600];
        int i;
        snprintf(in2->state_path, sizeof in2->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        hx_set_param(g, "t2_convert_to_audio", "");
        snprintf(p, sizeof p, "0|%s/src/bar.wav", g_root);
        hx_set_param(g, "t2_au_pick", p);
        HX_ASSERT(wait_loaded(g, 2, 0) == 2, "Loop rig: the sample did not load");
        hx_set_param(g, "t2_au_set_bpm", "0 1200");
        hx_set_param(g, "t2_au_set_sync", "0 1");             /* Vintage: pieces */
        hx_set_param(g, "t2_repeat_on", "1");
        hx_set_param(g, "t2_launch_clip", "0");
        hx_set_param(g, "transport", "play");
        for (i = 0; i < 400 && !in2->au_trk[2].rmx_n; i++) rn(g, 1);
        keys_of(&in2->au_trk[2], ks, sizeof ks);
        snprintf(msg, sizeof msg, "Loop REPEAT: the latched bar's slots %s", ks);
        HX_ASSERT(!strcmp(ks, "0,1,2,3,4,5,6,7,8,9,10,11,12,12,12,12") && in2->au_trk[2].rmx_on && !in2->au_trk[2].rmx_ron, msg);
        /* a setting lands at the next bar line */
        hx_set_param(g, "t2_repeat_grid", "0");
        hx_set_param(g, "t2_repeat_at", "0");
        hx_set_param(g, "t2_repeat_len", "16");
        for (i = 0; i < 1500; i++) { rn(g, 1); keys_of(&in2->au_trk[2], ks, sizeof ks); if (!strcmp(ks, "0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3")) break; }
        snprintf(msg, sizeof msg, "Loop REPEAT 1/4 over the bar: %s", ks);
        HX_ASSERT(!strcmp(ks, "0,1,2,3,0,1,2,3,0,1,2,3,0,1,2,3"), msg);
        hx_set_param(g, "t2_repeat_on", "0");
        for (i = 0; i < 1500 && in2->au_trk[2].rmx_on; i++) rn(g, 1);
        HX_ASSERT(!in2->au_trk[2].rmx_on, "Loop REPEAT off: the bar still plays as events");
        printf("  ok   — REPEAT on a Loop clip: its bar latched with the repeat, a change at the bar line, off again\n");
        hx_destroy(g);
    }

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_audio_repeat_tape\n");
    return 0;
}
