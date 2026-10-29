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
#include <pthread.h>

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

static void write_sine(const char *path, double hz) {
    FILE *f = fopen(path, "wb");
    uint32_t i, n = 4 * BEAT;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, SR); put_le32(f, SR * 2);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(12000 * sin(2 * M_PI * hz * i / SR)));
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
static int g_late = 0;                              /* blocks the stretcher misses (as one held up on the Move) */
static void step(hx_t *h) {
    au_warper_t *X = (au_warper_t *)((seq8_instance_t *)h->inst)->au_warper;
    if (g_stream) au_stream_service((seq8_instance_t *)h->inst);
    if (X->started) {
        /* the thread runs on its own; a loaded machine (the hook, CI) can
         * starve it, so a block waits — a while at most — for the frames it
         * needs rather than for the wall clock */
        au_warp_t *W = X->trk[4];
        int k;
        for (k = 0; k < 400; k++) {
            uint32_t ahead = __atomic_load_n(&W->head, __ATOMIC_ACQUIRE) - __atomic_load_n(&W->tail, __ATOMIC_ACQUIRE);
            if (!W->cmd.run || ahead >= 1024) break;
            usleep(500);
        }
    } else if (g_late > 0) g_late--;
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
    snprintf(p, sizeof p, "%s/s660.wav", g_root);
    write_sine(p, 660);
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
            HX_ASSERT(X->trk[4]->st_ch == 1, "a mono sample did not get a mono stretcher");
            if (bpms[b] == 120) {
                /* the loop's own tempo, no pitch: Bungee is bypassed and the
                 * sample comes out as it is (the drift trim may varispeed it
                 * by a hair) */
                /* compared at its best alignment within a block: Warp lands on
                 * the tick's own frame, Free / Pitch on the block it falls in
                 * (measured: Warp ~63 frames earlier) */
                double best = 1e30, e = 0;
                int k0 = (int)(1.1 * SR / 4), k, lag, bl = 0;
                HX_ASSERT(X->trk[4]->byp, "Warp at the loop's own tempo did not bypass Bungee");
                for (lag = -200; lag <= 200; lag++) {
                    double d = 0;
                    e = 0;
                    for (k = 0; k < 2000; k++) {
                        int at = 4 * (int)BEAT + k0 + k;                    /* bar 2 */
                        double want = 12000 * sin(2 * M_PI * 440 * (double)(k0 + k) / SR) * 32767.0 / 32768.0;
                        d += (g_rec[at + lag] - want) * (g_rec[at + lag] - want);
                        e += want * want;
                    }
                    if (d < best) { best = d; bl = lag; }
                }
                printf("  bypass at 120: the sample as it is to %.2f %% (at %d frames)\n", 100.0 * sqrt(best / e), bl);
                HX_ASSERT(sqrt(best / e) < 0.01, "the bypass did not hand the sample back as it is");
            } else {
                HX_ASSERT(!X->trk[4]->byp, "Warp off the loop's tempo bypassed Bungee");
            }
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

    /* ---- launch Now from one Warp clip to another while playing (Josh: "the
     * lag is significantly more than 23ms as compared to switching between
     * them in pitch mode"): the old clip plays on until the new one's first
     * frame is due, then they crossfade — no silent block, the new tone due
     * within a few ms of the launch ---- */
    {
        int k, n, b;
        hx_set_param(h, "t4_au_set_pitch", "0 0");
        snprintf(p, sizeof p, "1|%s/s660.wav", g_root);
        hx_set_param(h, "t4_au_pick", p);
        for (i = 0; i < 2000 && inst->au_clip[4][1].state != 2; i++) { hx_render(h, 1); usleep(1000); }
        HX_ASSERT(inst->au_clip[4][1].state == 2, "the 660 Hz sine did not load");
        hx_set_param(h, "t4_au_set_bars", "1 1");
        hx_set_param(h, "t4_au_set_tempo", "1 4");
        hx_set_param(h, "t4_au_set_tempo", "0 4");          /* the Warp -> Free case above left clip A on Free */
        HX_ASSERT(inst->au_clip[4][0].tempo == AU_TEMPO_WARP && inst->au_clip[4][1].tempo == AU_TEMPO_WARP,
                  "both clips are not on Warp");
        hx_set_param(h, "bpm", "100");
        for (k = 0; k < 8; k++) step(h);
        hx_set_param(h, "transport", "play");
        for (k = 0; k < 300; k++) step(h);
        for (b = 0; b < 4; b++) {
            int fed = hx_stub_feed(4, NULL, NULL), quiet = 0, blank = 0;
            char m[160];
            /* mid-beat-3 of tone.wav, where it sounds: a gap would show */
            hx_set_param(h, "t4_launch_clip", b % 2 ? "0" : "1");
            if (b == 3) g_late = 4;                 /* a stretcher 11.6 ms late: the old clip covers it */
            for (n = 0; n < 24; n++) {
                double r = 0;
                step(h);
                if (hx_stub_feed(4, NULL, NULL) != fed) {
                    const int16_t *fb = hx_stub_feed_last(4);
                    fed = hx_stub_feed(4, NULL, NULL);
                    for (k = 0; k < 128; k++) r += (double)fb[k * 2] * fb[k * 2];
                    r = sqrt(r / 128);
                }
                /* judged where each side is continuous: into the 660 sine from
                 * block 2 on (the old clip's tone may be on a silent beat), out
                 * of it for the first 3 (the new one's may be) — before the fix
                 * blocks 1..3 were silent */
                if (r < 3000 && (b % 2 == 0 ? n >= 2 : n < (b == 3 ? 5 : 3))) quiet++;
                {
                    char pb[64];
                    int sounding = 0;
                    hx_get_param(h, "t4_au_pos", pb, sizeof pb);
                    sscanf(pb, "%d", &sounding);
                    if (!sounding) blank++;       /* the playhead on the screen blinked out */
                }
            }
            snprintf(m, sizeof m, "launch %d between Warp clips: %d quiet blocks, the new one due after %.1f ms", b, quiet,
                     inst->au_trk[4].w.last_wait * 1000.0 / SR);
            HX_ASSERT(quiet == 0, m);
            snprintf(m, sizeof m, "launch %d between Warp clips: the playhead blinked out for %d blocks", b, blank);
            HX_ASSERT(blank == 0, m);
            HX_ASSERT(inst->au_trk[4].w.last_wait * 1000.0 / SR <= (b == 3 ? 16.0 : 4.0), m);
            HX_ASSERT(inst->tracks[4].active_clip == (b % 2 ? 0 : 1), "the launch did not land");
            for (k = 0; k < 150 + 37 * b; k++) step(h);
        }
        /* a stretcher 87 ms late (more than the 46 ms it renders ahead): every
         * frame it has made for the new clip is late and skipped — it must
         * render on from the reader, not wait for ever with the reader (found
         * under TSan: silence for good) */
        hx_set_param(h, "t4_launch_clip", "1");
        g_late = 30;
        for (n = 0; n < 120 && !(n > 30 && inst->au_trk[4].w.state == AU_WARP_PLAY); n++) step(h);
        HX_ASSERT(inst->au_trk[4].w.state == AU_WARP_PLAY && inst->au_trk[4].w.clip == 1,
                  "after a stretcher 87 ms late, Warp never played again");
        hx_set_param(h, "transport", "stop");
        for (k = 0; k < 60; k++) step(h);
        hx_set_param(h, "t4_launch_clip", "0");
        for (k = 0; k < 8; k++) step(h);
    }

    /* ---- the bypass and Bungee hand over without a gap, a restart or a
     * pitch change: a continuous 660 Hz sine at its own tempo (bypassed),
     * off it (Bungee), Pitch +1 then 0 (Bungee, bypass) ---- */
    {
        int k, n, ph;
        static const char *bpm_at[] = { "120", "126", "120", "120", "120" };
        static const char *pit_at[] = { "1 0", "1 0", "1 0", "1 1", "1 0" };
        static const int byp_at[] = { 1, 0, 1, 0, 1 };
        hx_set_param(h, "t4_launch_clip", "1");
        hx_set_param(h, "bpm", "120");
        for (k = 0; k < 8; k++) step(h);
        hx_set_param(h, "transport", "play");
        for (k = 0; k < 200; k++) step(h);
        for (ph = 0; ph < 5; ph++) {
            uint32_t gen = inst->au_trk[4].w.gen;
            int fed = hx_stub_feed(4, NULL, NULL), quiet = 0, zc = 0, fr = 0;
            double t0 = -1, t1 = -1;       /* the first and last rising crossing (frames, interpolated) */
            int prev = 0, have_prev = 0;    /* the last frame of the block before (a crossing between blocks counts) */
            int flips = 0, wasbyp = X->trk[4]->byp, back = 0;
            uint32_t seen = X->trk[4]->head;
            float lastag = -1.f;
            char m[200];
            hx_set_param(h, "bpm", bpm_at[ph]);
            hx_set_param(h, "t4_au_set_pitch", pit_at[ph]);
            for (n = 0; n < 960; n++) {
                double r = 0;
                step(h);
                if (hx_stub_feed(4, NULL, NULL) != fed) {
                    const int16_t *fb = hx_stub_feed_last(4);
                    fed = hx_stub_feed(4, NULL, NULL);
                    for (k = 0; k < 128; k++) {
                        int a0 = k ? fb[(k - 1) * 2] : prev;
                        r += (double)fb[k * 2] * fb[k * 2];
                        if (n >= 880 && (k || have_prev) && a0 < 0 && fb[k * 2] >= 0) {
                            double a = a0, c = fb[k * 2];
                            double t = fr + (k - 1) + (-a) / (c - a);
                            if (t0 < 0) t0 = t;
                            t1 = t;
                            zc++;
                        }
                    }
                    prev = fb[127 * 2];
                    have_prev = n >= 880;
                    if (n >= 880) fr += 128;
                    r = sqrt(r / 128);
                }
                if (r < 5000) quiet++;
                if (X->trk[4]->byp != wasbyp) { flips++; wasbyp = X->trk[4]->byp; }
                /* the ring's frames only ever move on in time across a hand-over
                 * (Bungee's overlap with what the bypass already wrote is dropped) */
                {
                    au_warp_t *W = X->trk[4];
                    for (; seen != W->head; seen++) {
                        float tg = W->tag[seen & (AU_WARP_RING - 1)];
                        if (tg < 0) continue;
                        if (lastag >= 0) {
                            double d = au_wrap_signed((double)tg - lastag, W->cmd.L);
                            if (d < -1e-4 || d > 0.05) back++;
                        }
                        lastag = tg;
                    }
                }
                /* bypassing and off the clock by 100 frames (under the hand-back):
                 * its trim is a pitch change, so it stays within a hair */
                if (ph == 4 && n == 600) {
                    HX_ASSERT(X->trk[4]->byp, "not bypassing before the drift was put in");
                    X->trk[4]->bpos += 100.0;           /* 100 input frames = 100 output frames at its own tempo */
                    seen = X->trk[4]->head;             /* the jump put in is not one of ours */
                    lastag = -1.f;
                }
            }
            double hz = zc > 1 ? (zc - 1) * (double)SR / (t1 - t0) : 0, want = ph == 3 ? 660 * 1.059463 : 660;
            snprintf(m, sizeof m, "bypass hand-over %d (%s bpm, pitch %s): %d quiet blocks, %u re-anchors, %.1f Hz (want %.1f), bypass %d",
                     ph, bpm_at[ph], pit_at[ph], quiet, inst->au_trk[4].w.gen - gen, hz, want, X->trk[4]->byp);
            HX_ASSERT(quiet == 0 && inst->au_trk[4].w.gen == gen, m);
            HX_ASSERT(fabs(hz - want) < want * 0.003, m);      /* 5 cents */
            HX_ASSERT(X->trk[4]->byp == byp_at[ph], m);
            snprintf(m, sizeof m, "bypass hand-over %d: %d switches between bypass and Bungee (flapping), %d frames out of time order",
                     ph, flips, back);
            HX_ASSERT(flips <= 1 && back == 0, m);
        }
        hx_set_param(h, "transport", "stop");
        for (k = 0; k < 60; k++) step(h);
        hx_set_param(h, "t4_launch_clip", "0");
        for (k = 0; k < 8; k++) step(h);
    }

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
    {
        /* its own name in a thread list, not its creator's (it read as the audio thread) */
        char nm[32] = "";
        for (i = 0; i < 200 && strcmp(nm, "dbx-warp"); i++) { pthread_getname_np(X->th, nm, sizeof nm); usleep(1000); }
        HX_ASSERT(!strcmp(nm, "dbx-warp"), "the stretcher thread is not named dbx-warp");
    }
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
    printf("PASS: Warp (70 / 120 / 160 bpm: the tone on its beats at 440 Hz; Revrs; +12; a tempo change trims, no restart; Free lets go; launch Now between Warp clips without a gap; bypassed at its own tempo, handing over to Bungee and back without a gap; a followed clock; the thread; a sample cleared while it plays; streamed)\n");
    return 0;
}
