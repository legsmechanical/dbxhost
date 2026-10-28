/* tests/test_audio_beats.c — Tempo Beats (seq8_audio.c, sp_track_audio.c).
 *
 * The hits: found once by the loader from the waveform summary, each at the
 * start of its rising block (<= 256 frames before the attack), the same for a
 * streamed file as for a whole one; Sens picks which count, live.
 * The engine: at the loop's own tempo the pieces join and the sample plays
 * straight through (forward and Revrs); faster, each piece starts on its own
 * tick at its own frame; slower, the gap is silent (Off), the tail back and
 * forth (Ping) or looped without a click (Loop), dying away with Fade; with
 * nothing sounding, the piece under the playhead starts at once, in place. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `n` frames of gen(i) */
static void write_gen(const char *path, uint32_t n, int (*gen)(uint32_t)) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, gen(i));
    fclose(f);
}
#define BEAT 22050u                                 /* a quarter note at 120 bpm */
/* a 10 ms decaying burst on every quarter note */
static int g_clicks(uint32_t i) {
    uint32_t ph = i % BEAT;
    return ph < 441 ? (int)((ph & 1 ? 1 : -1) * (20000 - (int)ph * 40)) : 0;
}
static int g_ramp(uint32_t i) { return (int)(i % 30000); }
static int g_silence(uint32_t i) { (void)i; return 0; }
/* a steady +-3000 bed; a loud burst on each quarter, a soft one (5000) on each off-beat */
static int g_soft(uint32_t i) {
    uint32_t ph = i % BEAT, sign = i & 1;
    int a = 3000;
    if (ph < 441) a = 20000 - (int)ph * 40;
    else if (ph >= BEAT / 2 && ph < BEAT / 2 + 441) a = 5000;
    return sign ? a : -a;
}

/* a buzz: the level jumps up every other block — rises everywhere, none
 * standing out from the ~100 ms around it */
static int g_buzz(uint32_t i) { int a = (i / 256) & 1 ? 20000 : 3000; return i & 1 ? a : -a; }
/* a flam on each beat: a click, and a louder one 1024 frames (4 blocks) later */
static int g_flam(uint32_t i) {
    uint32_t ph = i % BEAT;
    int a = 0;
    if (ph >= 2048 && ph < 2489) a = 12000;
    else if (ph >= 3072 && ph < 3513) a = 20000;
    return i & 1 ? a : -a;
}
/* a slow attack on each beat: 6000 for 256 frames, then 20000 — a rise in two
 * blocks next to each other, which is one hit */
static int g_slow(uint32_t i) {
    uint32_t ph = i % BEAT;
    int a = 0;
    if (ph >= 2048 && ph < 2304) a = 6000;
    else if (ph >= 2304 && ph < 2745) a = 20000;
    return i & 1 ? a : -a;
}

static au_sample_t *load(const char *name, int stream) {
    char p[300];
    int err = -1;
    snprintf(p, sizeof p, "%s/%s", g_root, name);
    au_sample_t *s = au_read_file(p, stream, &err);
    HX_ASSERT(s && err == AU_ERR_NONE, "a test file did not load");
    return s;
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    char p[300];
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    hx_set_param(h, "t4_convert_to_audio", "");
    return h;
}
static int info_n(hx_t *h, int field) {
    char b[512];
    int k = 0, v = -1;
    const char *q = b;
    if (hx_get_param(h, "t4_au_info_0", b, sizeof b) <= 0) return -1;
    for (k = 0; k < field; k++) { q = strchr(q, ' '); if (!q) return -1; q++; }
    sscanf(q, "%d", &v);
    return v;
}
#define REC 160000
static int16_t g_rec[REC];
/* Play `blocks` blocks from the transport's start, keeping slot 4's left
 * channel frame by frame (silence where nothing was fed). Returns the frames. */
static int record(hx_t *h, int blocks) {
    int n, k, fed = 0, g = 0;
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (n = 0; n < blocks && g + 128 <= REC; n++) {
        hx_render(h, 1);
        if (hx_stub_feed(4, NULL, NULL) == fed) { for (k = 0; k < 128; k++) g_rec[g++] = 0; continue; }
        fed = hx_stub_feed(4, NULL, NULL);
        const int16_t *b = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++) g_rec[g++] = b[k * 2];
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 60);
    return g;
}
/* where the ramp began: the first sounding frame less its value (the ramp plays at 1x) */
static int ramp_start(int g) {
    int i;
    for (i = 0; i < g; i++) if (g_rec[i]) return i - g_rec[i];
    return -1;
}
static int dm(int a, int b) { int d = ((a - b) % 30000 + 30000) % 30000; return d > 15000 ? d - 30000 : d; }

int main(void) {
    char p[300];
    au_sample_t *s, *t;
    uint32_t k;

    snprintf(g_root, sizeof g_root, "/tmp/hx_beats_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/clicks.wav", g_root); write_gen(p, 4 * BEAT, g_clicks);
    snprintf(p, sizeof p, "%s/ramp.wav", g_root);   write_gen(p, 44100, g_ramp);
    snprintf(p, sizeof p, "%s/silent.wav", g_root); write_gen(p, 44100, g_silence);
    snprintf(p, sizeof p, "%s/soft.wav", g_root);   write_gen(p, 4 * BEAT, g_soft);
    snprintf(p, sizeof p, "%s/long.wav", g_root);   write_gen(p, 40 * BEAT, g_clicks);
    snprintf(p, sizeof p, "%s/buzz.wav", g_root);   write_gen(p, 44100, g_buzz);
    snprintf(p, sizeof p, "%s/flam.wav", g_root);   write_gen(p, 4 * BEAT, g_flam);
    snprintf(p, sizeof p, "%s/slow.wav", g_root);   write_gen(p, 4 * BEAT, g_slow);

    /* ---- clicks: Start + one hit per later click, each just before it ---- */
    s = load("clicks.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, AU_SENS_DEFAULT) == 4, "4 clicks are not 4 pieces at the default Sens");
    {
        int rmin, dmin, kept = 0;
        au_sens_min(AU_SENS_DEFAULT, &rmin, &dmin);
        for (k = 0; k < s->nhits; k++) {
            if (!au_hit_kept(s, k, rmin, dmin)) continue;
            uint32_t click = (uint32_t)(kept + 1) * BEAT;
            HX_ASSERT(s->hits[k] <= click && click - s->hits[k] < AU_MIP,
                      "a hit is not in the 256 frames before its click");
            kept++;
        }
        HX_ASSERT(kept == 3, "the clicks after the first are not 3 kept hits");
    }
    /* Start..End: only the hits inside count (Start itself is one) */
    HX_ASSERT(au_hit_count(s, BEAT + 100, 3 * BEAT + 100, AU_SENS_DEFAULT) == 3,                      /* Start, clicks 2 and 3 */ "Start..End did not bound the hits");
    au_sample_free(s);

    /* ---- a ramp and silence have no hits: one piece, from Start ---- */
    s = load("ramp.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, AU_SENS_DEFAULT) == 1, "a ramp found hits at the default Sens");
    au_sample_free(s);
    s = load("silent.wav", 0);
    HX_ASSERT(s->nhits == 0 && au_hit_count(s, 0, s->frames, 100) == 1, "silence found hits");
    au_sample_free(s);

    /* ---- Sens: low keeps the loud hits, high the soft ones too ---- */
    s = load("soft.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, 0) == 4, "Sens 0 did not keep only the 4 loud hits (Start + 3)");
    HX_ASSERT(au_hit_count(s, 0, s->frames, 100) == 8, "Sens 100 did not keep the soft off-beats too");
    au_sample_free(s);

    /* ---- a rise only counts against what is around it: a buzz has none
     * at Sens 0, however big each step ---- */
    s = load("buzz.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, 0) == 1, "a buzz's steady rises counted as hits at Sens 0");
    au_sample_free(s);
    /* ---- a rise over two blocks is one candidate (the bigger) ---- */
    s = load("slow.wav", 0);
    HX_ASSERT(s->nhits == 4, "a slow attack gave more than one candidate");
    au_sample_free(s);
    /* ---- a flam (two hits 23 ms apart) is one hit, its first ---- */
    s = load("flam.wav", 0);
    HX_ASSERT(s->nhits == 8, "a flam's two clicks are not two candidates");
    HX_ASSERT(au_hit_count(s, 0, s->frames, 100) == 5, "a flam counted as two hits (Start + 4 beats)");
    au_sample_free(s);

    /* ---- a streamed file finds exactly the hits a whole one does ---- */
    au_stream_sec = 1;
    s = load("long.wav", 0);
    t = load("long.wav", 1);
    HX_ASSERT(!s->st && t->st, "the long file did not load once whole and once streamed");
    HX_ASSERT(s->nhits == t->nhits && s->nhits >= 39, "streamed and whole found a different number of hits");
    for (k = 0; k < s->nhits; k++)
        HX_ASSERT(s->hits[k] == t->hits[k] && s->hit_d[k] == t->hit_d[k] && s->hit_r[k] == t->hit_r[k],
                  "a streamed hit differs from the whole file's");
    au_sample_free(s);
    au_sample_free(t);

    /* ================= the engine ================= */
    au_stream_sec = 60;
    {
        hx_t *h = rig();
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        au_sample_t *rs;
        int g, st, i, bad, z;
        static const uint32_t H[3] = { BEAT, 2 * BEAT, 3 * BEAT };
        snprintf(p, sizeof p, "%s/ramp2.wav", g_root); write_gen(p, 4 * BEAT, g_ramp);   /* 2 s: a bar at 120 */
        snprintf(p, sizeof p, "0|%s/ramp2.wav", g_root);
        hx_set_param(h, "t4_au_pick", p);
        for (i = 0; i < 2000 && inst->au_clip[4][0].state == 1; i++) { hx_render(h, 1); usleep(1000); }
        HX_ASSERT(inst->au_clip[4][0].state == 2, "the ramp did not load");
        hx_set_param(h, "t4_au_set_bars", "0 1");
        hx_set_param(h, "t4_au_set_tempo", "0 3");
        HX_ASSERT(inst->au_clip[4][0].tempo == AU_TEMPO_BEATS && inst->au_clip[4][0].fill == AU_FILL_PING &&
                  inst->au_clip[4][0].fade == 0 && inst->au_clip[4][0].sens == AU_SENS_DEFAULT,
                  "Tempo did not go to Beats, or the defaults are not Ping / Fade 0 / Sens 50");
        /* a ramp has no hits: give it three, on the quarter notes */
        rs = (au_sample_t *)inst->au_clip[4][0].smp;
        free(rs->hits); free(rs->hit_d); free(rs->hit_r);
        rs->hits = malloc(sizeof H); rs->hit_d = malloc(3); rs->hit_r = malloc(3);
        for (i = 0; i < 3; i++) { rs->hits[i] = H[i]; rs->hit_d[i] = 50; rs->hit_r[i] = 255; }
        rs->nhits = 3;
        HX_ASSERT(info_n(h, 21) == 4 && info_n(h, 22) == 50 && info_n(h, 23) == 2 && info_n(h, 24) == 0,
                  "the info line does not report 4 pieces, Sens 50, Fill Ping, Fade 0");
        hx_set_param(h, "t4_launch_clip", "0");

        /* ---- its own tempo: the pieces join, the sample plays straight through ---- */
        g = record(h, 660);
        st = ramp_start(g);
        for (i = st + 1, bad = 0; i < st + 84000; i++) if (dm(g_rec[i], g_rec[i - 1]) != 1) bad++;
        HX_ASSERT(st >= 0 && bad == 0, "Beats at the loop's own tempo did not play it straight through");
        HX_ASSERT(inst->au_trk[4].v[0].beats || inst->au_trk[4].v[1].beats, "Beats played no pieces");

        /* ---- Revrs at its own tempo: straight through backwards ---- */
        hx_set_param(h, "t4_au_set_revrs", "0 1");
        g = record(h, 660);
        for (i = 0; i < g && !g_rec[i]; i++) {}
        for (st = i, i = st + 1, bad = 0; i < st + 84000; i++) if (dm(g_rec[i], g_rec[i - 1]) != -1) bad++;
        HX_ASSERT(st < g && bad == 0, "Beats in Revrs at the loop's own tempo did not play it straight back");
        hx_set_param(h, "t4_au_set_revrs", "0 0");

        /* ---- faster (150): each piece on its quarter's tick (17640 frames),
         * from its hit's frame ---- */
        hx_set_param(h, "bpm", "150");
        hx_render(h, 2);
        g = record(h, 700);
        st = ramp_start(g);
        for (i = 1, bad = 0; i < 4; i++) {
            int at = st + i * 17640;
            if (dm(g_rec[at + 80], (int)(i * BEAT + 80)) > 3 || dm(g_rec[at + 80], (int)(i * BEAT + 80)) < -3) bad++;
            if (dm(g_rec[at - 2], (int)(i * BEAT)) > -4000) bad++;           /* the last piece till then */
        }
        HX_ASSERT(st >= 0 && bad == 0, "a Beats piece at 150 bpm did not start on its quarter, from its hit");

        /* ---- slower (90): the gap after each piece, by Fill ---- */
        hx_set_param(h, "bpm", "90");
        hx_render(h, 2);
        hx_set_param(h, "t4_au_set_fill", "0 0");
        g = record(h, 700);
        st = ramp_start(g);
        for (i = 0, z = 0, bad = 0; i < 3; i++) {
            int k, a = st + i * 29400 + (int)BEAT + 200, b = st + (i + 1) * 29400 - 4;
            for (k = a; k < b; k++) if (g_rec[k]) bad++;
            if (dm(g_rec[st + (i + 1) * 29400 + 80], (int)((i + 1) * BEAT + 80)) != 0) z++;
        }
        HX_ASSERT(st >= 0 && bad == 0, "Fill Off: the gap after a piece is not silent");
        HX_ASSERT(z == 0, "at 90 bpm a piece did not start on its quarter (29400 frames), from its hit");
        hx_set_param(h, "t4_au_set_fill", "0 2");
        g = record(h, 700);
        st = ramp_start(g);
        for (i = 0, z = 0, bad = 0; i < 3; i++) {
            int k, end = (int)((i + 1) * BEAT % 30000), a = st + i * 29400 + (int)BEAT + 8, b = st + (i + 1) * 29400 - 4;
            for (k = a; k < b; k++) {
                int d = dm(g_rec[k], end);
                if (d >= 0 || d < -2048) bad++;                        /* inside the tail window */
                if (!g_rec[k]) z++;
            }
        }
        HX_ASSERT(st >= 0 && bad == 0 && z < 10, "Fill Ping: the gap is not the piece's tail, back and forth");
        hx_set_param(h, "t4_au_set_fill", "0 1");
        g = record(h, 700);
        st = ramp_start(g);
        for (i = 0, z = 0, bad = 0; i < 3; i++) {
            int k, end = (int)((i + 1) * BEAT % 30000), a = st + i * 29400 + (int)BEAT - 200, b = st + (i + 1) * 29400 - 4;
            for (k = a; k < b; k++) {
                int d = dm(g_rec[k], end);
                if (k > a + 208 && (d >= 0 || d < -2048)) bad++;
                if (abs(g_rec[k] - g_rec[k - 1]) > 100) z++;          /* a click at the seam */
            }
        }
        HX_ASSERT(st >= 0 && bad == 0, "Fill Loop: the gap is not the piece's tail, looped");
        HX_ASSERT(z == 0, "Fill Loop clicked at its seam");
        /* Fade 100: the fill has died away by the next hit */
        hx_set_param(h, "t4_au_set_fill", "0 2");
        hx_set_param(h, "t4_au_set_fade", "0 100");
        g = record(h, 700);
        st = ramp_start(g);
        for (i = 0, bad = 0; i < 3; i++) {
            int k, b = st + (i + 1) * 29400 - 4;
            for (k = b - 150; k < b; k++) if (abs(g_rec[k]) > 1000) bad++;
            /* ...from its full level: 300 frames in, the tail (within 2048 below
             * the piece's end) at > 90 % of the level it has without Fade */
            if (abs(g_rec[st + i * 29400 + (int)BEAT + 300]) < (int)(0.9 * (double)(((i + 1) * BEAT % 30000) - 2048))) bad++;
        }
        HX_ASSERT(st >= 0 && bad == 0, "Fade 100 did not take the fill from full level to nothing by the next hit");
        hx_set_param(h, "t4_au_set_fade", "0 0");

        /* ---- nothing sounding: the piece under the playhead starts at once,
         * in place (a launch or a start part-way in) ---- */
        hx_set_param(h, "bpm", "120");
        hx_render(h, 2);
        hx_stub_feed_reset();
        hx_set_param(h, "transport", "play");
        hx_render(h, 300);
        {
            const int16_t *b = hx_stub_feed_last(4);
            int last = b[127 * 2], first;
            au_track_kill(inst, 4, NULL);
            hx_render(h, 1);
            b = hx_stub_feed_last(4);
            first = b[0];
            /* within a frame or two of the next one (the window rounds) */
            HX_ASSERT(hx_stub_feed(4, NULL, NULL) > 0 && abs(dm(first, last) - 1) <= 2, "with nothing sounding, the piece under the playhead did not start in place");
        }
        hx_set_param(h, "transport", "stop");
        hx_render(h, 60);

        /* ---- a followed clock (Move's: one 0xF8 every 7 blocks, ~123 bpm on
         * the 120 bpm loop): Beats plays on, the pieces landing on the pulses,
         * never silent for long, forward and in Revrs ---- */
        {
            const uint8_t stb = 0xFA, clk = 0xF8, sp = 0xFC;
            int mode;
            for (mode = 0; mode < 2; mode++) {
                int silent = 0, fedb = 0;
                hx_set_param(h, "t4_au_set_revrs", mode ? "0 1" : "0 0");
                hx_set_param(h, "clock_follow_on", "1");
                hx_stub_feed_reset();
                hx_send_midi(h, &stb, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 1;
                hx_render(h, 2);
                for (i = 0; i < 96 * 7; i++) {
                    int before = hx_stub_feed(4, NULL, NULL), k;
                    if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
                    hx_render(h, 1);
                    if (i < 96) continue;
                    if (hx_stub_feed(4, NULL, NULL) == before) { silent += 128; continue; }
                    fedb++;
                    const int16_t *fb = hx_stub_feed_last(4);
                    for (k = 0; k < 128; k++) if (!fb[k * 2]) silent++;
                }
                hx_send_midi(h, &sp, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 0;
                hx_set_param(h, "clock_follow_on", "0");
                hx_set_param(h, "transport", "stop");
                hx_render(h, 60);
                /* the loop is ~3 % slow against the clock: a short fill before
                 * each hit at most, never whole stretches of silence */
                HX_ASSERT(fedb > 500 && silent < 2000, mode ? "Beats in Revrs fell silent under a followed clock"
                                                             : "Beats fell silent under a followed clock");
            }
            hx_set_param(h, "t4_au_set_revrs", "0 0");
        }

        /* ---- the project keeps Tempo Beats, Sens, Fill and Fade ---- */
        {
            static char blob[262144];
            hx_set_param(h, "t4_au_set_sens", "0 70");
            hx_set_param(h, "t4_au_set_fill", "0 1");
            hx_set_param(h, "t4_au_set_fade", "0 30");
            HX_ASSERT(hx_get_param(h, "state_full", blob, (int)sizeof blob) > 0 && strstr(blob, " 3 1 70 1 30|ramp2.wav\""),
                      "the state does not keep Tempo Beats, Sens, Fill and Fade");
            hx_set_param(h, "t4_au_set_tempo", "0 9");
            HX_ASSERT(inst->au_clip[4][0].tempo == AU_TEMPO_BEATS, "a Tempo past the last did not clamp to Beats");
        }
        hx_destroy(h);
    }

    printf("PASS: Beats (hits, Sens, streamed = whole; own tempo, Revrs, faster, Off / Ping / Loop / Fade, in place, state)\n");
    return 0;
}
