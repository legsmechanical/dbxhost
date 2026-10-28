/* Tempo WARP: a Loop clip stretched to the tempo at its own pitch, rendered
 * ahead by the stretcher (seq8_audio.c, STRETCHING) and read by the audio
 * thread against the clock (sp_track_audio.c). The stretcher runs by hand
 * here: one au_warp_service before each block, as its thread would.
 *
 * The sample: one bar at 120 bpm (2 s), a 440 Hz tone on beats 1 and 3 and
 * silence on 2 and 4. Warped at any tempo the tone must sit on beats 1 and 3
 * of THAT tempo's bar, still at 440 Hz; in Revrs (the sample backwards) on 2
 * and 4; Pitch +12 puts it at 880 Hz without moving it. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define SR    44100
#define BEAT  22050u                                /* a quarter note at 120 bpm */
static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
static void write_tone(const char *path, uint32_t bars) {
    FILE *f = fopen(path, "wb");
    uint32_t i, n = 4 * BEAT * bars;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, SR); put_le32(f, SR * 2);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (i / BEAT) % 2 ? 0 : (int)(12000 * sin(2 * M_PI * 440 * i / SR)));
    fclose(f);
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

/* one block, the stretcher first (by hand; with its thread running, a
 * block's worth of real time instead) */
static int g_stream = 0;                            /* the streamer too, by hand */
static void step(hx_t *h) {
    au_warper_t *X = (au_warper_t *)((seq8_instance_t *)h->inst)->au_warper;
    if (g_stream) au_stream_service((seq8_instance_t *)h->inst);
    if (X->started) usleep(2900);
    else au_warp_service((seq8_instance_t *)h->inst);
    hx_render(h, 1);
}

#define REC 600000
static int16_t g_rec[REC];
/* Play `blocks` blocks from the transport's start, keeping slot 4's left
 * channel (silence where nothing was fed). Returns the frames. */
static int record(hx_t *h, int blocks) {
    int n, k, fed = 0, g = 0;
    for (k = 0; k < 8; k++) step(h);                /* stopped: the downbeat is rendered ahead */
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (n = 0; n < blocks && g + 128 <= REC; n++) {
        step(h);
        if (hx_stub_feed(4, NULL, NULL) == fed) { for (k = 0; k < 128; k++) g_rec[g++] = 0; continue; }
        fed = hx_stub_feed(4, NULL, NULL);
        const int16_t *b = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++) g_rec[g++] = b[k * 2];
    }
    hx_set_param(h, "transport", "stop");
    for (k = 0; k < 60; k++) step(h);
    return g;
}

static double rms(int a, int b) {
    double s = 0;
    int i;
    for (i = a; i < b; i++) s += (double)g_rec[i] * g_rec[i];
    return sqrt(s / (b - a));
}
static double freq(int a, int b) {
    int i, c = 0;
    for (i = a + 1; i < b; i++) if (g_rec[i - 1] < 0 && g_rec[i] >= 0) c++;
    return c * (double)SR / (b - a);
}
/* the first frame from `a` with a clear level */
static int onset(int a, int b) {
    int i;
    for (i = a < 0 ? 0 : a; i < b; i++) if (abs(g_rec[i]) > 2000) return i;
    return -1;
}

/* Bar `bar` at `bpm`: the tone on the quarters `on` (bit q = quarter q),
 * at `hz`, starting within `early`..`late` ms of where it should. */
static void check_bar(int g, double bpm, int bar, unsigned on, double hz, const char *what) {
    double q = SR * 60.0 / bpm;
    int k;
    char m[200];
    for (k = 0; k < 4; k++) {
        int a = (int)((bar * 4 + k) * q), mid0 = a + (int)(q * 0.25), mid1 = a + (int)(q * 0.75);
        double r = rms(mid0, mid1);
        HX_ASSERT(mid1 < g, "the recording is too short for the bar asked");
        snprintf(m, sizeof m, "%s: quarter %d of bar %d at %.0f bpm %s (rms %.0f)", what, k + 1, bar + 1, bpm,
                 (on >> k) & 1 ? "is silent" : "sounds", r);
        if ((on >> k) & 1) {
            HX_ASSERT(r > 3000, m);
            double f = freq(mid0, mid1);
            snprintf(m, sizeof m, "%s: quarter %d at %.0f bpm is %.1f Hz, not %.0f", what, k + 1, bpm, f, hz);
            HX_ASSERT(fabs(f - hz) < hz * 0.02, m);
            /* its onset: within 25 ms of the quarter (a phase vocoder smears an edge) */
            int o = onset(a - (int)(0.05 * SR), mid0);
            snprintf(m, sizeof m, "%s: quarter %d at %.0f bpm starts %.1f ms off", what, k + 1, bpm, (o - a) * 1000.0 / SR);
            HX_ASSERT(o >= 0 && abs(o - a) < (int)(0.025 * SR), m);
        } else {
            HX_ASSERT(r < 1500, m);
        }
    }
}

int main(void) {
    char p[300];
    hx_t *h;
    seq8_instance_t *inst;
    au_warper_t *X;
    int g, i;
    uint32_t gen;

    au_warp_manual = 1;
    snprintf(g_root, sizeof g_root, "/tmp/hx_warp_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/tone.wav", g_root);
    write_tone(p, 1);
    snprintf(p, sizeof p, "%s/tone30.wav", g_root);
    write_tone(p, 30);                              /* a minute: streams, most of it never resident */

    h = rig();
    inst = (seq8_instance_t *)h->inst;
    X = (au_warper_t *)inst->au_warper;
    HX_ASSERT(X && !X->started, "the stretcher started a thread in manual mode");
    snprintf(p, sizeof p, "0|%s/tone.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (i = 0; i < 2000 && inst->au_clip[4][0].state == 1; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2, "the tone did not load");
    hx_set_param(h, "t4_au_set_bars", "0 1");
    hx_set_param(h, "t4_au_set_tempo", "0 4");
    HX_ASSERT(inst->au_clip[4][0].tempo == AU_TEMPO_WARP, "Tempo did not go to Warp");
    hx_set_param(h, "t4_launch_clip", "0");

    /* ---- the tempo moves the tone, never its pitch ---- */
    {
        static const double bpms[] = { 120, 70, 160 };
        int b;
        for (b = 0; b < 3; b++) {
            char v[16];
            snprintf(v, sizeof v, "%.0f", bpms[b]);
            hx_set_param(h, "bpm", v);
            g = record(h, (int)(3 * 4 * SR * 60.0 / bpms[b] / 128) + 8);
            for (i = 0; i < 3; i++) check_bar(g, bpms[b], i, 0x5, 440, "Warp");
            HX_ASSERT(X->trk[4]->st, "no stretcher was made for the Warp track");
        }
    }

    /* ---- Revrs: the sample backwards, so the tone on 2 and 4 ---- */
    hx_set_param(h, "bpm", "90");
    hx_set_param(h, "t4_au_set_revrs", "0 1");
    g = record(h, (int)(2 * 4 * SR * 60.0 / 90 / 128) + 8);
    for (i = 0; i < 2; i++) check_bar(g, 90, i, 0xA, 440, "Warp Revrs");
    hx_set_param(h, "t4_au_set_revrs", "0 0");

    /* ---- Pitch +12: an octave up, in the same place ---- */
    hx_set_param(h, "t4_au_set_pitch", "0 12");
    g = record(h, (int)(2 * 4 * SR * 60.0 / 90 / 128) + 8);
    for (i = 0; i < 2; i++) check_bar(g, 90, i, 0x5, 880, "Warp +12");
    hx_set_param(h, "t4_au_set_pitch", "0 0");

    /* ---- a tempo change mid-loop is a new speed, not a restart ---- */
    {
        int k;
        hx_set_param(h, "bpm", "120");
        for (k = 0; k < 8; k++) step(h);
        hx_set_param(h, "transport", "play");
        for (k = 0; k < 200; k++) step(h);
        gen = inst->au_trk[4].w.gen;
        HX_ASSERT(inst->au_trk[4].w.state == AU_WARP_PLAY, "Warp was not playing");
        hx_set_param(h, "bpm", "132");
        for (k = 0; k < 600; k++) step(h);
        HX_ASSERT(inst->au_trk[4].w.gen == gen, "a tempo change re-anchored Warp (a restart, a gap)");
        HX_ASSERT(fabs(inst->au_trk[4].w.drift) < 64, "the drift after a tempo change was not trimmed away");
        hx_set_param(h, "transport", "stop");
        for (k = 0; k < 60; k++) step(h);
    }

    /* ---- Warp -> Free: the stretcher lets go of its instance ---- */
    hx_set_param(h, "t4_au_set_tempo", "0 0");
    step(h);
    step(h);
    HX_ASSERT(!X->trk[4]->st && !X->trk[4]->held, "the stretcher kept its instance after the clip left Warp");

    /* ---- a followed clock (Move's: one 0xF8 every 7 blocks, ~123 bpm on a
     * 120 bpm loop): it plays on, steered, never re-anchoring pulse by pulse ---- */
    {
        const uint8_t stb = 0xFA, clk = 0xF8, sp = 0xFC;
        int loud = 0, total = 0, anchors = 0, k;
        uint32_t g0;
        hx_set_param(h, "t4_au_set_tempo", "0 4");
        hx_set_param(h, "clock_follow_on", "1");
        for (k = 0; k < 8; k++) step(h);
        hx_stub_feed_reset();
        hx_send_midi(h, &stb, 1, MOVE_MIDI_SOURCE_INTERNAL);
        inst->playing = 1;
        step(h); step(h);
        g0 = inst->au_trk[4].w.gen;
        for (i = 0; i < 96 * 7; i++) {
            int before = hx_stub_feed(4, NULL, NULL);
            uint32_t gb = inst->au_trk[4].w.gen;
            if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
            step(h);
            if (inst->au_trk[4].w.gen != gb) anchors++;
            if (i < 96) continue;
            total += 128;
            if (hx_stub_feed(4, NULL, NULL) == before) continue;
            const int16_t *fb = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++) if (abs(fb[k * 2]) > 2000) loud++;
        }
        hx_send_midi(h, &sp, 1, MOVE_MIDI_SOURCE_INTERNAL);
        inst->playing = 0;
        hx_set_param(h, "clock_follow_on", "0");
        hx_set_param(h, "transport", "stop");
        for (k = 0; k < 60; k++) step(h);
        printf("  followed clock: %d anchors after the start (gen %u), %.0f%% loud\n", anchors, g0, 100.0 * loud / total);
        HX_ASSERT(anchors <= 1, "Warp under a followed clock kept re-anchoring (a gap each time)");
        HX_ASSERT(loud > total * 35 / 100, "Warp under a followed clock was mostly silent (the tone is half the bar)");
    }

    hx_destroy(h);

    /* ---- the real thread: the same tone on its beats; then the clip's sample
     * cleared while it plays (the stretcher must let go before it is freed) ---- */
    au_warp_manual = 0;
    h = rig();
    inst = (seq8_instance_t *)h->inst;
    X = (au_warper_t *)inst->au_warper;
    HX_ASSERT(X && X->started, "the stretcher thread did not start");
    snprintf(p, sizeof p, "0|%s/tone.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (i = 0; i < 2000 && inst->au_clip[4][0].state == 1; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2, "the tone did not load (thread)");
    hx_set_param(h, "t4_au_set_bars", "0 1");
    hx_set_param(h, "t4_au_set_tempo", "0 4");
    hx_set_param(h, "t4_launch_clip", "0");
    hx_set_param(h, "bpm", "100");
    {
        uint32_t u0 = inst->au_underruns, gen0 = inst->au_trk[4].w.gen;
        g = record(h, (int)(2 * 4 * SR * 60.0 / 100 / 128) + 8);
        printf("  thread: %u frames short, %u anchors\n", inst->au_underruns - u0, inst->au_trk[4].w.gen - gen0);
    }
    for (i = 0; i < 2; i++) check_bar(g, 100, i, 0x5, 440, "Warp (thread)");
    {
        int k;
        hx_set_param(h, "transport", "play");
        for (k = 0; k < 150; k++) step(h);
        hx_set_param(h, "t4_au_clear", "0");
        for (k = 0; k < 400; k++) step(h);
        HX_ASSERT(!__atomic_load_n(&X->trk[4]->held, __ATOMIC_RELAXED) && !X->trk[4]->cmd.smp,
                  "the stretcher still holds a cleared sample");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 10);
    }
    hx_destroy(h);

    /* ---- a STREAMED sample (its frames come in chunks): with no chunk in,
     * the stretcher reads silence and says so, never hangs; once the
     * streamer runs, following where the stretcher reads, the tone is back
     * on its beats ---- */
    au_warp_manual = 1;
    au_stream_manual = 1;
    au_stream_sec = 1;
    h = rig();
    inst = (seq8_instance_t *)h->inst;
    X = (au_warper_t *)inst->au_warper;
    snprintf(p, sizeof p, "0|%s/tone30.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (i = 0; i < 2000 && inst->au_clip[4][0].state == 1; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2 && !inst->au_clip[4][0].smp->pcm, "the tone did not load streamed");
    hx_set_param(h, "t4_au_set_bars", "0 30");
    hx_set_param(h, "t4_au_set_tempo", "0 4");
    hx_set_param(h, "t4_launch_clip", "0");
    hx_set_param(h, "bpm", "110");
    {
        uint32_t u0 = X->underruns;
        int k;
        for (k = 0; k < 8; k++) step(h);
        hx_set_param(h, "transport", "play");
        for (k = 0; k < 700; k++) step(h);
        HX_ASSERT(X->underruns > u0, "with no chunk in, the stretcher did not count what it missed");
        hx_set_param(h, "transport", "stop");
        for (k = 0; k < 60; k++) step(h);
    }
    g_stream = 1;
    g = record(h, (int)(3 * 4 * SR * 60.0 / 110 / 128) + 8);
    for (i = 1; i < 3; i++) check_bar(g, 110, i, 0x5, 440, "Warp (streamed)");
    g_stream = 0;
    hx_destroy(h);
    printf("PASS: Warp (70 / 120 / 160 bpm: the tone on its beats at 440 Hz; Revrs; +12; a tempo change trims, no restart; Free lets go; a followed clock; the thread; a sample cleared while it plays; streamed)\n");
    return 0;
}
