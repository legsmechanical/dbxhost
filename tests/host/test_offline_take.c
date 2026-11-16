/* test_offline_take.c — the REAL offline take (src/host/offline_take.c) against
 * fixture modules (test_offline_take.sh builds them): an engine that plays a
 * scripted take, an instrument whose output says what reached it, an effect.
 *
 * Pins:
 *   - the take is the instrument copy's output from the block the engine copy
 *     called capture_start_src in, `frames` long, at the synth level (PRE) or
 *     after the effect copy (FX); its WAV header is right;
 *   - what the engine copy sends arrives as the host delivers it: the slot's
 *     channel remap and transpose, heard the NEXT block; a DIRECT send past
 *     the transpose; Start broadcast; set_slot_param "synth:" to the copy; the
 *     tempo the engine copy declares is what the module copies' host reports;
 *     another slot's sends and params go nowhere;
 *   - the engine copy is made {"offline":1}, loads the caller's state from a
 *     file and gets the setup lines before the command;
 *   - copies are private: the live load of the engine code made no instance
 *     and was handed no extension;
 *   - audio the engine copy feeds the slot (slot_audio_feed) is mixed into
 *     its NEXT block before the level, the instrument's output and all; a
 *     slot with no instrument (an Audio track's) is that feed alone; another
 *     slot's feed is not heard;
 *   - a knob-mapped CC fails the take and removes its file (with or without
 *     an instrument: the chain takes it); a cancel too;
 *     refusals (the slot's, busy, bad args). */
#include <dlfcn.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "host/offline_take.h"
#include "host/mix_strip.h"
#include "host/mix_glide.h"

static int failures;
#define CHECK(c, ...) do { if (!(c)) { failures++; fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); \
    fprintf(stderr, __VA_ARGS__); fputc('\n', stderr); } } while (0)

static int g_slot_err;           /* what the chain's export answers */
static int g_no_synth;           /* ...for a slot with no instrument */
static int g_with_fx_asked;
static int g_mfx_asked;          /* the take copies the MIDI FX itself */
static int g_mfx_on;             /* the slot plays one */

static void *slot_instance(int slot) { static int dummy; return slot >= 0 && slot < 8 ? &dummy : NULL; }
static int clone_source(void *inst, slc_src_t *out, int with_fx) {
    (void)inst;
    g_with_fx_asked = with_fx & SLC_WITH_FX;
    g_mfx_asked = with_fx & SLC_WITH_MIDI_FX;
    if (g_slot_err) return g_slot_err;
    memset(out, 0, sizeof *out);
    out->knob_ccs = 1u << 1;                            /* CC 72 is a knob mapping */
    if (!g_no_synth) {
        snprintf(out->so_path, sizeof out->so_path, FIXTURE_DIR "/synth/dsp.so");
        snprintf(out->dir, sizeof out->dir, FIXTURE_DIR "/synth");
        out->nparams = 1;
        snprintf(out->params[0].key, sizeof out->params[0].key, "gain");
        snprintf(out->params[0].val, sizeof out->params[0].val, "5");
        snprintf(out->state, sizeof out->state, "G=1 B=30");   /* the state wins over the param, as a load */
        out->state_len = (int)strlen(out->state);
    }
    if (with_fx & SLC_WITH_FX) {
        out->nfx = 1;
        snprintf(out->fx[0].so_path, sizeof out->fx[0].so_path, FIXTURE_DIR "/fx/fx.so");
        snprintf(out->fx[0].dir, sizeof out->fx[0].dir, FIXTURE_DIR "/fx");
        out->fx[0].position = 1;
        out->fx[0].nparams = 1;
        snprintf(out->fx[0].params[0].key, sizeof out->fx[0].params[0].key, "amount");
        snprintf(out->fx[0].params[0].val, sizeof out->fx[0].params[0].val, "7");
    }
    return 1;
}
static chain_slot_clone_source_fn g_clone = clone_source;
static int mfx_source(void *inst, mfo_fx_src_t *out, int max) {
    (void)inst;
    if (!g_mfx_on || max < 1) return 0;
    memset(out, 0, sizeof *out);
    snprintf(out->so_path, sizeof out->so_path, FIXTURE_DIR "/mfx/dsp.so");
    snprintf(out->dir, sizeof out->dir, FIXTURE_DIR "/mfx");
    snprintf(out->state, sizeof out->state, "O=12");
    out->state_len = 4;
    return 1;
}
static chain_midi_fx_clone_source_fn g_mfx = mfx_source;
static float g_strip[5] = { 0.0f, 0.0f, 0.5f, 0.0f, 0.0f };   /* the channel strip: flat, comp off */
static int slot_info(int slot, offline_slot_info_t *o) {
    (void)slot;
    o->synth_level = 0.5f; o->transpose = 2; o->fwd_ch = 3;
    o->volume = 0.5f; o->pan = 0.125f;                     /* a Dry take's fader; pan: L 1, R 0.25 */
    memcpy(o->strip, g_strip, sizeof g_strip);
    return 1;
}
static void quiet(const char *m) { (void)m; }

static const char *STATE = "PROJECT v=1";
static const char *SETUP = "pa_resolve 1:synth:cut 1 synth:cut 0 0 1 0\n";

static move_offline_take_t take(int mode, uint32_t frames, int kind, const char *path) {
    move_offline_take_t t;
    memset(&t, 0, sizeof t);
    t.state = STATE; t.state_len = (uint32_t)strlen(STATE); t.setup = SETUP;
    snprintf(t.key, sizeof t.key, "resample_clip");
    snprintf(t.val, sizeof t.val, "%d %u %d 1 |%s", mode, frames, kind, path);
    t.slot = 1; t.kind = kind; t.bpm = 120.0f;
    return t;
}

/* the WAV: its frame count from the header, and frame i's two samples */
static int16_t *read_wav(const char *path, uint32_t *frames) {
    FILE *f = fopen(path, "rb");
    uint8_t h[44];
    int16_t *d;
    uint32_t n;
    *frames = 0;
    if (!f) return NULL;
    if (fread(h, 1, 44, f) != 44 || memcmp(h, "RIFF", 4) || memcmp(h + 36, "data", 4)) { fclose(f); return NULL; }
    n = (uint32_t)h[40] | (uint32_t)h[41] << 8 | (uint32_t)h[42] << 16 | (uint32_t)h[43] << 24;
    n /= 4;
    d = malloc((size_t)n * 4 + 4);
    if (fread(d, 4, n, f) != n) { fclose(f); free(d); return NULL; }
    fclose(f);
    *frames = n;
    return d;
}

static plugin_api_v2_t *live_eng;

static int exists(const char *p) { struct stat sb; return stat(p, &sb) == 0; }
static int16_t half(int v) { return (int16_t)lroundf((float)v * 0.5f); }

int main(void) {
    const offline_take_host_t host = {
        .host = NULL, .slot_instance = slot_instance, .clone_source = &g_clone,
        .slot_info = slot_info, .run_command = NULL, .log = quiet, .mfx_source = &g_mfx,
    };
    const char *pre = FIXTURE_DIR "/takes/pre.wav";
    uint32_t done = 0, total = 0, n;
    int16_t *w;
    move_offline_take_t t;

    {   /* the engine code loaded the ordinary way first, as the shim has it */
        void *h = dlopen(FIXTURE_DIR "/eng/dsp.so", RTLD_NOW | RTLD_LOCAL);
        plugin_api_v2_t *(*init)(const host_api_v1_t *);
        *(void **)&init = h ? dlsym(h, "move_plugin_init_v2") : NULL;
        live_eng = init ? init(NULL) : NULL;
        if (!live_eng) { fprintf(stderr, "FAIL: rig: the engine fixture did not load\n"); return 1; }
    }
    offline_take_configure(&host);
    t = take(0, 300, MOVE_CAPTURE_SLOT_PRE, pre);
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_NO_HOST, "no engine loaded: refused");
    offline_take_set_engine(FIXTURE_DIR "/eng/dsp.so", FIXTURE_DIR "/eng");

    /* ---- a PRE take ---- */
    CHECK(offline_take_begin(&t) == 1, "begin");
    CHECK(!g_with_fx_asked, "a PRE take does not copy the effects");
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_BUSY, "a second take while one is queued");
    CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_RUNNING, "queued reads RUNNING");
    CHECK(offline_take_run_pending() == 1, "it ran");
    CHECK(offline_take_state(&done, &total) == MOVE_OFFLINE_DONE, "DONE");
    CHECK(done == 300 && total == 300, "frames %u of %u", done, total);
    w = read_wav(pre, &n);
    CHECK(w && n == 300, "the file: %u frames", n);
    if (w && n == 300) {
        /* block 1 (the take's first): note 60 sent in block 0, +2 = 62, remapped
         * to channel 3; vel 100 x gain 2 (set by the copy) + 1000 (one Start)
         * + 10 x 133 (the tempo the engine copy declared) + 30 (the state's
         * base); x 0.5. Another slot's note, sent after it, is not heard. */
        CHECK(w[0] == half(6203) && w[1] == half(200 + 1000 + 1330 + 30), "frame 0: %d %d", w[0], w[1]);
        CHECK(w[2 * 127] == half(6203), "frame 127: %d", w[2 * 127]);
        /* block 2: note 62 sent in block 1 (the start's) is heard now: 64 */
        CHECK(w[2 * 128] == half(6403), "frame 128: %d (the next block's note)", w[2 * 128]);
        CHECK(w[2 * 299] == half(6403), "frame 299: %d", w[2 * 299]);
    }
    free(w);
    offline_take_cancel();
    CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_IDLE, "cancel clears DONE");

    /* ---- after its effects ---- */
    {
        const char *fxp = FIXTURE_DIR "/takes/fx.wav";
        t = take(0, 128, MOVE_CAPTURE_SLOT_FX, fxp);
        CHECK(offline_take_begin(&t) == 1, "FX begin");
        CHECK(g_with_fx_asked, "an FX take copies the effects");
        offline_take_run_pending();
        w = read_wav(fxp, &n);
        CHECK(w && n == 128 && w[0] == half(6203) + 7, "FX: after the level, + the effect: %d", w ? w[0] : -1);
        int16_t fxl = w ? w[0] : 0, fxr = w ? w[1] : 0;
        free(w);
        offline_take_cancel();

        /* ---- Dry (MOVE_CAPTURE_SLOT): after the effects, at the fader and pan ---- */
        const char *dp = FIXTURE_DIR "/takes/dry.wav";
        g_with_fx_asked = 0;
        t = take(0, 128, MOVE_CAPTURE_SLOT, dp);
        CHECK(offline_take_begin(&t) == 1, "Dry begin");
        CHECK(g_with_fx_asked, "a Dry take copies the effects");
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_DONE, "Dry: DONE");
        w = read_wav(dp, &n);
        CHECK(w && n == 128 && w[0] == (int16_t)lroundf((float)fxl * 0.5f * 1.0f) && w[1] == (int16_t)lroundf((float)fxr * 0.5f * 0.25f),
              "Dry: the FX take at the fader and pan: %d %d (FX %d %d)", w ? w[0] : -1, w ? w[1] : -1, fxl, fxr);
        free(w);
        offline_take_cancel();

        /* ---- Dry with the channel strip engaged: the FX take through the strip
         * (mix_strip.h — the code the live mix runs), then the fader and pan.
         * The fixture's input changes block to block before the take starts,
         * so the setting is one with no memory: the comp at 50% on a signal
         * under its knee is its make-up alone (+3.5 dB), the same from the
         * first sample. (The bands and the comp's curve are test_mix_strip's.) ---- */
        {
            const float set[5] = { 0.0f, 0.0f, 0.5f, 0.0f, 0.5f };
            memcpy(g_strip, set, sizeof set);
            int16_t *fx = read_wav(fxp, &n);
            t = take(0, 128, MOVE_CAPTURE_SLOT, dp);
            CHECK(offline_take_begin(&t) == 1, "Dry + strip: begin");
            offline_take_run_pending();
            w = read_wav(dp, &n);
            mix_strip_t ms; mix_strip_init(&ms);
            for (int f = 0; f < 5; f++) mix_strip_set_now(&ms, f, set[f]);
            int16_t sx[256];
            const int16_t *o = fx ? mix_strip_run(&ms, fx, sx, 128, 1) : NULL;
            int same = o && o != fx && w && n == 128, diff = -1;
            for (int i = 0; same && i < 256; i++) {
                int16_t want = (int16_t)lroundf((float)o[i] * 0.5f * ((i & 1) ? 0.25f : 1.0f));
                if (w[i] != want) { same = 0; diff = i; }
            }
            CHECK(same, "Dry + strip: the FX take through the strip, then the fader (first diff at %d)", diff);
            CHECK(w && fx && abs(w[0] - (int)lroundf((float)fx[0] * 1.4962f * 0.5f)) <= 1,
                  "Dry + strip: +3.5 dB of make-up is heard: %d (FX %d)", w ? w[0] : -1, fx ? fx[0] : -1);
            free(w); free(fx);
            offline_take_cancel();
            const float flat[5] = { 0.0f, 0.0f, 0.5f, 0.0f, 0.0f };
            memcpy(g_strip, flat, sizeof flat);
        }

        /* ---- Dry: the copy's slot:volume write (its automation) moves the
         * fader from the next block, gliding as the live mix does ---- */
        t = take(4, 256, MOVE_CAPTURE_SLOT, dp);
        CHECK(offline_take_begin(&t) == 1, "Dry + level: begin");
        offline_take_run_pending();
        w = read_wav(dp, &n);
        {
            /* block 2 hears 62 + 2 = 64; the gain at its frame k is the glide
             * after k advances toward 1.0 from 0.5 */
            const float pre2 = (float)(half(6403) + 7);
            float gl = 0.5f;
            int k;
            for (k = 0; k < 127; k++) gl += (1.0f - gl) * MIX_GLIDE_SMOOTH;
            CHECK(w && n == 256 && w[0] == (int16_t)lroundf((float)fxl * 0.5f) &&
                  w[2 * 128] == (int16_t)lroundf(pre2 * 0.5f) && w[2 * 255] == (int16_t)lroundf(pre2 * gl),
                  "Dry + level: %d / %d / %d (want %d, %d, %d)", w ? w[0] : -1, w ? w[2 * 128] : -1, w ? w[2 * 255] : -1,
                  (int)lroundf((float)fxl * 0.5f), (int)lroundf(pre2 * 0.5f), (int)lroundf(pre2 * gl));
        }
        free(w);
        offline_take_cancel();
    }

    /* ---- the slot's MIDI FX, copied: the copy's notes (and the clock) pass
     * through them on the way to the instrument; their tick output reaches it ---- */
    {
        const char *mp = FIXTURE_DIR "/takes/mfx.wav";
        g_mfx_on = 1;
        t = take(0, 384, MOVE_CAPTURE_SLOT_PRE, mp);
        CHECK(offline_take_begin(&t) == 1, "MIDI FX: begin");
        CHECK(g_mfx_asked, "the take did not say it copies the MIDI FX itself");
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_DONE, "MIDI FX: DONE");
        w = read_wav(mp, &n);
        /* block 1: block 0's 60 (+2 transpose, +12 the effect) = 74; block 2:
         * the effect's own 40 from its third tick, after block 1's 64+12;
         * R: the Start reached the instrument through the effect */
        CHECK(w && n == 384 && w[0] == half(7403) && w[2 * 128] == half(4003),
              "MIDI FX: %d %d (want %d %d)", w ? w[0] : -1, w ? w[2 * 128] : -1, half(7403), half(4003));
        CHECK(w && w[1] == half(200 + 2000 + 1330 + 30), "MIDI FX: the clock did not pass the effect (its Start doubled): R %d", w ? w[1] : -1);
        free(w);
        offline_take_cancel();
        g_mfx_on = 0;
    }

    /* ---- DIRECT: past the transpose, still remapped ---- */
    {
        const char *dp = FIXTURE_DIR "/takes/direct.wav";
        t = take(2, 256, MOVE_CAPTURE_SLOT_PRE, dp);
        offline_take_begin(&t);
        offline_take_run_pending();
        w = read_wav(dp, &n);
        CHECK(w && n == 256 && w[2 * 128] == half(7003), "DIRECT: %d", w ? w[2 * 128] : -1);
        free(w);
        offline_take_cancel();
    }

    /* ---- audio fed to the slot: next block, before the level ---- */
    {
        const char *ap = FIXTURE_DIR "/takes/feed.wav";
        t = take(3, 256, MOVE_CAPTURE_SLOT_PRE, ap);
        offline_take_begin(&t);
        offline_take_run_pending();
        w = read_wav(ap, &n);
        /* block 1: the instrument's 6203 + block 0's feed 1000; R: 1330 ... - 500 */
        CHECK(w && n == 256 && w[0] == half(7203) && w[1] == half(200 + 1000 + 1330 + 30 - 500),
              "feed + instrument: %d %d", w ? w[0] : -1, w ? w[1] : -1);
        CHECK(w && n == 256 && w[2 * 128] == half(6403 + 1001), "the next block's feed: %d", w ? w[2 * 128] : -1);
        free(w);
        offline_take_cancel();

        g_no_synth = 1;
        t = take(3, 256, MOVE_CAPTURE_SLOT_PRE, ap);
        CHECK(offline_take_begin(&t) == 1, "no instrument: begin");
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_DONE, "no instrument: DONE");
        w = read_wav(ap, &n);
        CHECK(w && n == 256 && w[0] == half(1000) && w[1] == half(-500) && w[2 * 128] == half(1001),
              "no instrument: the feed alone: %d %d %d", w ? w[0] : -1, w ? w[1] : -1, w ? w[2 * 128] : -1);
        free(w);
        offline_take_cancel();

        t = take(3, 128, MOVE_CAPTURE_SLOT_FX, ap);
        offline_take_begin(&t);
        offline_take_run_pending();
        w = read_wav(ap, &n);
        CHECK(w && n == 128 && w[0] == half(1000) + 7, "no instrument, FX: %d", w ? w[0] : -1);
        free(w);
        offline_take_cancel();

        t = take(1, 256, MOVE_CAPTURE_SLOT_PRE, ap);
        offline_take_begin(&t);
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_FAILED, "no instrument: a knob-mapped CC still fails it");
        offline_take_cancel();
        g_no_synth = 0;
    }

    /* ---- a knob-mapped CC: the chain would take it, the copy cannot ---- */
    {
        const char *kp = FIXTURE_DIR "/takes/knob.wav";
        t = take(1, 256, MOVE_CAPTURE_SLOT_PRE, kp);
        offline_take_begin(&t);
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_FAILED, "a knob-mapped CC fails the take");
        CHECK(!exists(kp), "and its file is gone");
        offline_take_cancel();
    }

    /* ---- the copy refuses (a state it does not know): FAILED, no file ---- */
    {
        const char *bp = FIXTURE_DIR "/takes/bad.wav";
        t = take(0, 256, MOVE_CAPTURE_SLOT_PRE, bp);
        t.state = "OTHER"; t.state_len = 5;
        offline_take_begin(&t);
        offline_take_run_pending();
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_FAILED, "a copy that refused: FAILED");
        CHECK(!exists(bp), "no file");
        offline_take_cancel();
    }

    /* ---- absent: automation the caller cannot write is harmless only where
     * its module does not play ---- */
    t = take(0, 128, MOVE_CAPTURE_SLOT_PRE, pre);
    t.absent = 1u;                                       /* the instrument must not play: it does */
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_LANE, "absent instrument that plays: not refused");
    g_no_synth = 1;
    CHECK(offline_take_begin(&t) == 1, "absent instrument that does not play: refused");
    offline_take_cancel(); offline_take_run_pending();
    g_no_synth = 0;
    t = take(0, 128, MOVE_CAPTURE_SLOT_FX, pre);
    t.absent = 1u << 2;                                  /* fx2: the fixture's effect sits at position 1 = fx2 */
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_LANE, "absent fx2 that plays: not refused");
    t.absent = 1u << 3;                                  /* fx3: nothing there */
    CHECK(offline_take_begin(&t) == 1, "absent fx3 (none there): refused");
    offline_take_cancel(); offline_take_run_pending();

    /* ---- refusals ---- */
    g_slot_err = SLC_ERR_MOD;
    t = take(0, 256, MOVE_CAPTURE_SLOT_PRE, pre);
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_MOD, "the slot's refusal is the answer");
    g_slot_err = 0;
    t.kind = MOVE_CAPTURE_MIX;
    CHECK(offline_take_begin(&t) == MOVE_OFFLINE_ERR_ARGS, "only PRE / FX / Dry");
    CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_IDLE, "refusals leave it idle");

    /* ---- cancel while it runs, on the real thread ---- */
    {
        const char *cp = FIXTURE_DIR "/takes/cancel.wav";
        struct timespec ts = { 0, 20 * 1000 * 1000 };
        int i;
        offline_take_start(&host);
        t = take(0, 200u * 1000 * 1000, MOVE_CAPTURE_SLOT_PRE, cp);
        CHECK(offline_take_begin(&t) == 1, "long begin");
        for (i = 0; i < 100 && offline_take_state(&done, NULL) == MOVE_OFFLINE_RUNNING && !done; i++) nanosleep(&ts, NULL);
        CHECK(done > 0, "it was writing");
        offline_take_cancel();
        for (i = 0; i < 200 && offline_take_state(NULL, NULL) != MOVE_OFFLINE_IDLE; i++) nanosleep(&ts, NULL);
        CHECK(offline_take_state(NULL, NULL) == MOVE_OFFLINE_IDLE, "cancelled: IDLE");
        CHECK(!exists(cp), "cancelled: the file is gone");
    }

    /* ---- the live load of the engine code is untouched ---- */
    {
        char b[16] = { 0 };
        live_eng->get_param(NULL, "made", b, sizeof b);
        CHECK(!strcmp(b, "0"), "the live code made %s instance(s)", b);
        live_eng->get_param(NULL, "has_ext", b, sizeof b);
        CHECK(!strcmp(b, "0"), "the live code was handed the copy's extension");
    }

    if (failures) { fprintf(stderr, "FAIL: offline take (%d)\n", failures); return 1; }
    printf("PASS: offline take: copies of the engine and the slot, in the live order, the live delivery, refusals, cancel\n");
    return 0;
}
