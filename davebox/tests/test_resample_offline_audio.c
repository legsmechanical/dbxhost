/* tests/test_resample_offline_audio.c — an AUDIO TRACK's clip take recorded
 * offline (seq8_resample.c rs_offline_try; seq8_audio.c au_offline_pump).
 *
 * The host's copy of the engine renders as fast as it can, so its sample
 * threads cannot run against the clock: none is started, and each block runs
 * them by hand first. Here the copy plays a 60 s STREAMED ramp (frame i holds
 * i % 30000; it streams once au_stream_sec is lowered):
 *   - the live engine hands an Audio track's Pre take to the host, telling its
 *     copy where the project's samples are (offline_samples, first);
 *   - the copy starts no loader, streamer or stretcher thread;
 *   - its sample is in for the take's first tick, though no thread loaded it;
 *   - it plays the file sample for sample, far past what the load pinned and
 *     with only one streamer pass a block: no gap, no fade;
 *   - what it has played is let go of (the streamer's pass runs: a long take
 *     does not hold the whole file);
 *   - a chunk nobody read is read when reached (a live engine finds none);
 *   - a Warp clip (stretched) plays with its ring never empty;
 *   - it writes nothing: no waveform summary for a file that had none. */
#define SEQ8_LOG_PATH "/tmp/davebox-tests/resample-offline-audio.log"
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];

static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `secs`: frame i holds i % 30000 */
static void write_ramp(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}
static int ramp_at(double x) { return (int)((uint32_t)x % 30000); }

static void count_pin(void *arg, uint32_t k) { if (k < 4096) ((uint8_t *)arg)[k] = 1; }

static int exists(const char *p) { struct stat sb; return stat(p, &sb) == 0; }

/* the copy: made as the host makes it, the snapshot and setup applied */
static hx_t *copy_of(const char *snap, const char *setup, const char *cmd) {
    hx_t *h = hx_create_raw("{\"offline\":1}");
    char line[512];
    const char *p = setup;
    HX_ASSERT(h, "the copy was not made");
    hx_set_param(h, "offline_load", snap);
    while (p && *p) {                                   /* offline_take.c apply_setup */
        const char *nl = strchr(p, '\n');
        size_t n = nl ? (size_t)(nl - p) : strlen(p);
        if (n > 0 && n < sizeof line) {
            char *sp;
            memcpy(line, p, n); line[n] = '\0';
            if ((sp = strchr(line, ' '))) { *sp = '\0'; hx_set_param(h, line, sp + 1); }
        }
        p = nl ? nl + 1 : p + n;
    }
    hx_set_param(h, "resample_clip", cmd);
    return h;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[300], snap[300], dir[300];
    static char state[1u << 20], setup[8192];
    const move_offline_take_t *t;
    const char *st, *su;
    const uint32_t FR = 44100u * 60u;
    int i, n, k, bad, t0, fed, slot;

    au_stream_sec = 1;
    snprintf(g_root, sizeof g_root, "/tmp/hx_offaudio_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp60.wav", g_root); write_ramp(p, 60.0);
    snprintf(dir, sizeof dir, "%s/proj/dAVEBOx/samples", g_root);
    snprintf(snap, sizeof snap, "%s/snapshot.json", g_root);

    hx_stub_ot_enable(1);

    /* ---- the live engine: T5 an Audio track playing the ramp as recorded ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "rig: T5 is not an Audio track");
    snprintf(p, sizeof p, "0|%s/src/ramp60.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (i = 0; i < 4000 && inst->au_clip[4][0].state != 2; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2 && inst->au_clip[4][0].smp && !inst->au_clip[4][0].smp->pcm,
              "rig: the 60 s ramp did not load streamed");
    hx_set_param(h, "t4_au_set_sync", "0 2");        /* Pitch at the project's Tempo: sample for sample */
    hx_set_param(h, "t4_au_set_orig", "0 0");
    slot = inst->tracks[4].pfx.slot;
    /* its summary was written by the live load: the copy's own must not be */
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/.peaks/ramp60.wav.mip", g_root);
    HX_ASSERT(exists(p), "rig: the live load kept no waveform summary");
    unlink(p);

    hx_set_param(h, "resample_clip", "4 0 2 0 0 2 |/x/audio.wav");
    HX_ASSERT(hx_stub_ot_begins() == 1 && inst->resample_offline && !inst->playing,
              "an Audio track's Pre take did not go offline");
    t = hx_stub_ot_take(&st, &su);
    HX_ASSERT(t->slot == slot && t->kind == MOVE_CAPTURE_SLOT_PRE, "not the Audio track's slot before its FX");
    snprintf(p, sizeof p, "offline_samples %s\n", dir);
    HX_ASSERT(su && !strncmp(su, p, strlen(p)), "the copy was not told first where the samples are");
    snprintf(state, sizeof state, "%s", st);
    snprintf(setup, sizeof setup, "%s", su);
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);
    {
        FILE *f = fopen(snap, "w");
        HX_ASSERT(f && fputs(state, f) >= 0 && fclose(f) == 0, "rig: could not write the snapshot");
    }

    /* ---- the copy ---- */
    h = copy_of(snap, setup, "4 0 2 0 0 2 |/x/audio.wav");
    inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(!((au_loader_t *)inst->au_loader)->started && !((au_streamer_t *)inst->au_streamer)->started &&
              !((au_warper_t *)inst->au_warper)->started, "the copy started a sample thread");
    HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED, "the copy did not play the take itself");
    /* block by block from the transport's start, with no waiting: the first
     * block that sounds plays the ramp from frame 0, on its tick's frame */
    fed = -1;
    for (i = 0; i < 400 && fed < 0; i++) { hx_render(h, 1); hx_stub_feed(slot, &fed, NULL); }
    HX_ASSERT(fed >= 0, "the copy's Audio clip never sounded");
    HX_ASSERT(inst->au_clip[4][0].state == 2 && !inst->au_clip[4][0].smp->pcm,
              "the copy's sample is not in (streamed)");
    {
        const int16_t *blk = hx_stub_feed_last(slot);
        t0 = -1;
        for (k = 0; k < 128 && t0 < 0; k++) if (blk[k * 2]) t0 = k - 1;   /* frame 0 holds 0 */
        HX_ASSERT(t0 >= 0, "rig: no ramp in the first sounding block");
        for (k = t0; k < 128; k++)
            HX_ASSERT(blk[k * 2] == ramp_at(k - t0), "the copy's sample did not start at frame 0, at once");
    }
    /* the take's 2 bars (it fades out at 1378 blocks): past the start's pins
     * and between the others, one streamer pass a block */
    bad = 0;
    for (n = 1; n < 1370; n++) {
        const int16_t *blk;
        hx_render(h, 1);
        blk = hx_stub_feed_last(slot);
        for (k = 0; k < 128; k++)
            if (blk[k * 2] != ramp_at((double)n * 128 + k - t0)) bad++;
    }
    HX_ASSERT(inst->resample_state == RS_RECORDING || inst->resample_state == RS_DONE, "the copy did not take it");
    HX_ASSERT(bad == 0, "the copy's streamed sample had a gap or a fade (it waited on the clock)");
    HX_ASSERT(inst->au_underruns == 0, "the copy counted an underrun");
    {   /* played, ~2 s behind the voice and not one the load keeps: let go of */
        static uint8_t pin[4096];
        au_sample_t *s = inst->au_clip[4][0].smp;
        uint32_t kk, played = (uint32_t)((1370.0 * 128 - t0) / AU_CHUNK), let = 0;
        memset(pin, 0, sizeof pin);
        au_pins(s->nchunks, s->frames, s->rate, 0, FR, count_pin, pin);
        for (kk = 0; kk + 12 < played; kk++) {
            HX_ASSERT(pin[kk] || !s->chunk[kk], "the copy kept a chunk it had played (no streamer pass)");
            if (!pin[kk]) let++;
        }
        HX_ASSERT(let > 0, "rig: every chunk played was a pinned one");
    }

    /* a chunk nobody read is read when reached */
    {
        au_sample_t *s = inst->au_clip[4][0].smp;
        uint32_t kk = s->nchunks / 2;
        const int16_t *fr;
        while (kk < s->nchunks && s->chunk[kk]) kk++;
        HX_ASSERT(kk < s->nchunks, "rig: every chunk past the middle is in already");
        fr = au_at(s, kk * AU_CHUNK + 5);
        HX_ASSERT(fr && fr[0] == ramp_at((double)kk * AU_CHUNK + 5), "the copy did not read a chunk when it was reached");
    }
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/.peaks/ramp60.wav.mip", g_root);
    HX_ASSERT(!exists(p), "the copy wrote a waveform summary");

    /* ---- a live engine never reads a chunk on demand ---- */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/ramp60.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    for (i = 0; i < 4000 && inst->au_clip[4][0].state != 2; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(inst->au_clip[4][0].state == 2, "rig: the live reload did not load");
    {
        au_sample_t *s = inst->au_clip[4][0].smp;
        uint32_t kk = s->nchunks / 2;
        while (kk < s->nchunks && s->chunk[kk]) kk++;
        HX_ASSERT(kk < s->nchunks && !au_at(s, kk * AU_CHUNK + 5), "a live engine read a chunk on the audio thread");
    }

    /* ---- Warp: stretched by the copy's own stretcher, never short ---- */
    hx_set_param(h, "t4_au_set_sync", "0 0");
    hx_set_param(h, "t4_au_set_bpm", "0 1200");      /* the file at 120, the project at 125 */
    hx_set_param(h, "bpm", "125");
    hx_stub_ot_enable(1);
    i = hx_stub_ot_begins();
    hx_set_param(h, "resample_clip", "4 0 2 0 0 2 |/x/warp.wav");
    HX_ASSERT(hx_stub_ot_begins() == i + 1, "a Warp clip's take did not go offline");
    hx_stub_ot_take(&st, &su);
    snprintf(state, sizeof state, "%s", st);
    snprintf(setup, sizeof setup, "%s", su);
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);
    {
        FILE *f = fopen(snap, "w");
        HX_ASSERT(f && fputs(state, f) >= 0 && fclose(f) == 0, "rig: could not write the snapshot");
    }
    h = copy_of(snap, setup, "4 0 2 0 0 2 |/x/warp.wav");
    inst = (seq8_instance_t *)h->inst;
    for (i = 0; i < 400 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
    HX_ASSERT(inst->resample_state == RS_RECORDING, "the Warp copy did not start its take");
    hx_stub_feed_reset();
    {
        uint64_t e0 = 0, e1 = 0;
        for (n = 0; n < 20; n++) hx_render(h, 1);
        hx_stub_feed(slot, NULL, &e0);
        HX_ASSERT(e0 > 0, "the copy's Warp clip was silent at the take's start");
        for (n = 0; n < 1500; n++) hx_render(h, 1);
        hx_stub_feed(slot, NULL, &e1);
        HX_ASSERT(e1 > e0, "the copy's Warp clip went silent");
    }
    HX_ASSERT(inst->au_underruns == 0, "the copy's Warp ring ran empty");
    HX_ASSERT(((au_warper_t *)inst->au_warper)->underruns == 0, "the copy's stretcher found a chunk missing");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);

    printf("PASS: an Audio track's take recorded offline: its samples waited for, never the clock\n");
    return 0;
}
