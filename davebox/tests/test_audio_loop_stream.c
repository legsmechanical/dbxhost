/* tests/test_audio_loop_stream.c — Loop-mode STREAMING (seq8_audio.c,
 * STREAMING). The streamer runs by hand here (au_stream_manual: no thread),
 * one au_stream_service per call, so every step is deterministic. A 60 s
 * ramp (frame i holds i % 30000) streams once au_stream_sec is lowered.
 *   - the load keeps only the pins of the whole range; the loop starts from
 *     frame 0 at once;
 *   - with the streamer keeping up, a streamed loop renders exactly what the
 *     whole-file loop would;
 *   - a chunk that is not in plays silence, the loop keeps time, and it comes
 *     back at the right frame once read;
 *   - after everything else is let go, every point of the finest division
 *     (k/32: where a Remix grid lands) still has its chunks either side;
 *   - moving Start pins the new points; a let-go chunk is freed only after
 *     two more blocks;
 *   - Slice mode streams too: with only the pins in, every slice starts at
 *     once, forwards and Rev;
 *   - two clips on one file share it; the file let go leaves the streamer;
 *   - a stereo 24-bit file streams the same frames and waveform as it reads
 *     whole. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>
#include <sys/time.h>

static char g_root[256];

static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `secs`: frame i holds i % 30000 */
static void write_ramp_len(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}

/* stereo 24-bit 48 kHz, `secs`: frame i is (i*37 % 8388607, -(i*91 % 8388607)) */
static void write_st24(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(48000 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 6); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 2); put_le32(f, 48000); put_le32(f, 48000 * 6);
    put_le16(f, 6); put_le16(f, 24);
    fwrite("data", 1, 4, f); put_le32(f, n * 6);
    for (i = 0; i < n; i++) {
        int32_t l = (int32_t)((uint64_t)i * 37 % 8388607), r = -(int32_t)((uint64_t)i * 91 % 8388607);
        fputc(l & 255, f); fputc((l >> 8) & 255, f); fputc((l >> 16) & 255, f);
        fputc(r & 255, f); fputc((r >> 8) & 255, f); fputc((r >> 16) & 255, f);
    }
    fclose(f);
}

static int clip_state(hx_t *h, int t, int c) {
    char k[32], b[512];
    int st = -1;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    if (hx_get_param(h, k, b, sizeof b) <= 0) return -1;
    sscanf(b, "%d", &st);
    return st;
}
static int wait_loaded(hx_t *h, int t, int c) {
    int i, st = 1;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        st = clip_state(h, t, c);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

/* "samples chunks reads underruns" */
static void stats(hx_t *h, int *n, unsigned *chunks, unsigned *reads, unsigned *under) {
    char b[64];
    int a = 0;
    unsigned x = 0, y = 0, z = 0;
    hx_get_param(h, "t4_au_stream", b, sizeof b);
    sscanf(b, "%d %u %u %u", &a, &x, &y, &z);
    if (n) *n = a;
    if (chunks) *chunks = x;
    if (reads) *reads = y;
    if (under) *under = z;
}

static void count_pin(void *arg, uint32_t k) { ((uint8_t *)arg)[k] = 1; }
static unsigned pins_for(uint32_t frames, uint32_t rs, uint32_t re) {
    static uint8_t m[4096];
    unsigned n = 0, k, nch = (frames + AU_CHUNK - 1) / AU_CHUNK;
    memset(m, 0, sizeof m);
    au_pins(nch, frames, 44100, rs, re, count_pin, m);
    for (k = 0; k < nch; k++) n += m[k];
    return n;
}

/* The ramp's value at (fractional) frame x, as the voice interpolates it. */
static int ramp_at(double x) { return (int)((uint32_t)x % 30000); }

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[300];
    const int16_t *blk;
    int i, n, k, bad;
    unsigned chunks, reads, under, under0;
    const uint32_t FR = 44100u * 60u;

    au_stream_manual = 1;
    au_stream_sec = 1;

    snprintf(g_root, sizeof g_root, "/tmp/hx_stream_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp60.wav", g_root); write_ramp_len(p, 60.0);
    snprintf(p, sizeof p, "%s/src/ramp2.wav", g_root); write_ramp_len(p, 0.5);
    snprintf(p, sizeof p, "%s/src/st24.wav", g_root); write_st24(p, 3.0);

    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");

    /* ---- the load: streamed, holding only the whole range's pins ---- */
    snprintf(p, sizeof p, "0|%s/src/ramp60.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 0) == 2, "the 60 s ramp did not load");
    HX_ASSERT(inst->au_clip[4][0].smp && !inst->au_clip[4][0].smp->pcm, "the long file was read whole, not streamed");
    stats(h, &n, &chunks, &reads, &under);
    HX_ASSERT(n == 1, "the streamer does not hold the streamed sample");
    HX_ASSERT(chunks == pins_for(FR, 0, FR), "the load kept more (or less) than the pins");
    HX_ASSERT(chunks < (FR + AU_CHUNK - 1) / AU_CHUNK / 2, "the pins are most of the file");
    HX_ASSERT(reads == 0, "the streamer read before it was asked");

    /* played as recorded, sample for sample: Sync Pitch at the project's
     * Tempo (Orig) — what Free was before it left */
    hx_set_param(h, "t4_au_set_sync", "0 2");
    hx_set_param(h, "t4_au_set_orig", "0 0");

    /* ---- the loop starts from frame 0 at once (pinned) ---- */
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == 0 && blk[2] == 1 && blk[254] == 127, "the streamed loop did not start at its first frame");

    /* ---- the streamer keeping up: exactly the whole file's samples ---- */
    stats(h, NULL, NULL, NULL, &under0);
    bad = 0;
    for (n = 1; n < 1500; n++) {                     /* ~4.4 s: far past the start's pins */
        au_stream_service(inst);
        hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++)
            if (blk[k * 2] != ramp_at((double)n * 128 + k) || blk[k * 2 + 1] != blk[k * 2]) bad++;
    }
    stats(h, NULL, NULL, &reads, &under);
    HX_ASSERT(bad == 0, "a streamed loop did not render the file's samples exactly");
    HX_ASSERT(under == under0, "the streamer kept up, yet a voice found no chunk");
    HX_ASSERT(reads > 0, "the loop played past its pins without the streamer reading");

    /* ---- not kept up: silence, in time, back at the right frame ---- */
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
    stats(h, NULL, &chunks, NULL, NULL);
    HX_ASSERT(chunks == pins_for(FR, 0, FR), "with nothing playing, more than the pins stayed");
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    /* the start's pins run out at chunk 2 + ext (5 chunks = 40960 frames = block 320) */
    stats(h, NULL, NULL, NULL, &under0);
    for (n = 1; n < 320; n++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);                      /* block 319: frames 40832..40959, the last pinned */
    HX_ASSERT(blk[0] == ramp_at(319.0 * 128) && abs(blk[254]) < 200,
              "the voice did not fade out before the chunk it was missing");
    for (; n < 400; n++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    stats(h, NULL, NULL, NULL, &under);
    HX_ASSERT(under > under0, "a voice past its pins found chunks nobody read");
    HX_ASSERT(blk[0] == 0 && blk[254] == 0, "a missing chunk was not silent");
    for (i = 0; i < 4; i++) au_stream_service(inst);
    hx_render(h, 1);                                 /* block 400: fading back in */
    blk = hx_stub_feed_last(4);
    HX_ASSERT(abs(blk[0]) < ramp_at(400.0 * 128) / 16 && blk[254] == ramp_at(400.0 * 128 + 127),
              "the voice did not fade back in after the gap");
    hx_render(h, 1);                                 /* block 401: in */
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == ramp_at(401.0 * 128) && blk[254] == ramp_at(401.0 * 128 + 127),
              "after the gap the loop did not come back at the frame it would have reached");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- the pins: every point of the finest division (k/32 of the range)
     * holds the chunks either side of it, so a later Remix grid lands on
     * frames that are in, forwards and in Revrs ---- */
    for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
    {
        au_sample_t *s = inst->au_clip[4][0].smp;
        bad = 0;
        for (k = 0; k <= 32; k++) {
            uint32_t at = (uint32_t)((uint64_t)FR * k / 32), c = at >> AU_CHUNK_SHIFT;
            if (c < s->nchunks && !s->chunk[c]) bad++;
            if (c + 1 < s->nchunks && !s->chunk[c + 1]) bad++;
            if (c >= 1 && !s->chunk[c - 1]) bad++;
        }
        HX_ASSERT(bad == 0, "a point of the finest division is not pinned");
    }

    /* ---- Nudge -500 ms: the loop starts half a second in, from pins alone ---- */
    for (k = 0; k < 2; k++) {
        hx_set_param(h, "transport", "stop");
        hx_render(h, 4);
        for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
        hx_set_param(h, "t4_au_set_revrs", k ? "0 1" : "0 0");
        hx_set_param(h, "t4_au_set_nudge", "0 -500");
        hx_render(h, 1);
        stats(h, NULL, NULL, NULL, &under0);
        hx_stub_feed_reset();
        hx_set_param(h, "transport", "play");
        for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        HX_ASSERT(abs(blk[0] - ramp_at(k ? FR - 1 - 22050 : 22050)) <= 1, "Nudge -500 ms did not start half a second in");
        hx_render(h, 60);
        stats(h, NULL, NULL, NULL, &under);
        HX_ASSERT(under == under0, k ? "a Revrs loop nudged -500 ms waited for a chunk"
                                     : "a loop nudged -500 ms waited for a chunk");
    }
    hx_set_param(h, "t4_au_set_nudge", "0 0");
    hx_set_param(h, "t4_au_set_revrs", "0 0");
    hx_render(h, 2);

    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- Start moved: the new points are pinned; old ones let go ---- */
    {
        uint32_t rs = 1000003, c;
        char v[40];
        snprintf(v, sizeof v, "0 %u", (unsigned)rs);
        hx_set_param(h, "t4_au_set_start", v);
        HX_ASSERT(inst->au_clip[4][0].rstart == rs, "Start did not move");
        hx_render(h, 1);
        for (i = 0; i < 60; i++) au_stream_service(inst);
        c = (rs + (FR - rs) / 2) >> AU_CHUNK_SHIFT;  /* point 16 of the new range */
        HX_ASSERT(inst->au_clip[4][0].smp->chunk[c] != NULL, "a point of the new range is not pinned");
        for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
        stats(h, NULL, &chunks, NULL, NULL);
        HX_ASSERT(chunks == pins_for(FR, rs, FR), "the old range's pins were not let go");
        hx_set_param(h, "t4_au_set_start", "0 0");
        hx_render(h, 1);                             /* the range reaches the streamer with the block */
    }

    /* ---- a let-go chunk is freed only two blocks later ---- */
    {
        au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
        for (i = 0; i < AU_STREAM_GRACE + 5; i++) au_stream_service(inst);   /* no blocks */
        HX_ASSERT(S->ngrave > 0, "the let-go chunks were freed with no block rendered");
        hx_render(h, 1);
        au_stream_service(inst);
        HX_ASSERT(S->ngrave > 0, "a let-go chunk was freed after one block");
        hx_render(h, 1);
        au_stream_service(inst);
        HX_ASSERT(S->ngrave == 0, "let-go chunks were not freed after two blocks");
    }

    /* ---- Slice streams too: every slice starts (and, Rev, ends) pinned ---- */
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_set_param(h, "t4_au_set_mode", "0 1");
    hx_set_param(h, "t4_au_set_even", "0 7");     /* 7: no slice start is a Loop point */
    HX_ASSERT(!inst->au_clip[4][0].smp->pcm, "Slice mode reloaded the file whole");
    for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
    for (k = 0; k < 2; k++) {
        int l;
        char v[16];
        snprintf(v, sizeof v, "0 %d", k);
        hx_set_param(h, "t4_au_all_rev", v);
        hx_render(h, 1);
        stats(h, NULL, NULL, NULL, &under0);
        bad = 0;
        for (l = 0; l < 7; l++) {
            double a0 = (double)(uint32_t)((uint64_t)FR * l / 7), b0 = (double)(uint32_t)((uint64_t)FR * (l + 1) / 7);
            hx_stub_feed_reset();
            au_note_event(4, l, 0x90, 100, 0);
            hx_render(h, 1);
            blk = hx_stub_feed_last(4);
            /* past the 64-frame fade of the slice it cut */
            if (k ? abs(blk[200] - ramp_at(b0 - 1 - 100)) > 1 || abs(blk[254] - ramp_at(b0 - 1 - 127)) > 1
                  : abs(blk[200] - ramp_at(a0 + 100)) > 1 || abs(blk[254] - ramp_at(a0 + 127)) > 1) bad++;
            hx_render(h, 60);                        /* on into the next chunk: still pinned */
        }
        stats(h, NULL, NULL, NULL, &under);
        HX_ASSERT(bad == 0, k ? "a Rev slice did not start at its end" : "a slice did not start at its start");
        HX_ASSERT(under == under0, k ? "a Rev slice waited for a chunk" : "a slice waited for a chunk");
    }
    hx_set_param(h, "t4_au_all_rev", "0 0");
    hx_set_param(h, "t4_au_set_mode", "0 0");
    hx_render(h, 4);
    /* a Loop clip on Vintage moves through the sample as Free does (the
     * voices' read-ahead): its chops play no part, so none is pinned */
    /* (these keys were set_tempo / set_bars, which no longer exist and did
     * nothing: the block ran on Sync Pitch — found 2026-10-31) */
    int was_sync = inst->au_clip[4][0].sync;
    hx_set_param(h, "t4_au_set_sync", "0 1");                   /* Vintage */
    HX_ASSERT(inst->au_clip[4][0].sync == AU_SYNC_VINTAGE, "setup: the loop is not on Vintage");
    hx_render(h, 1);
    HX_ASSERT(inst->au_clipw[4][0].mode != AU_MODE_SLICE, "a Vintage Loop clip pins its chops");
    /* ...and the read-ahead alone keeps up with it: at a tempo well away
     * from the loop's own, slower and faster, forwards and in Revrs, from the
     * pins alone, through the clip coming round, no piece waits for a chunk */
    {
        static const char *bpms[2] = { "90", "160" };
        clip_t *lc = &inst->tracks[4].clips[0];
        uint16_t was_len = lc->length;
        int b, r, heard;
        hx_set_param(h, "t4_au_set_start", "0 0");
        hx_set_param(h, "t4_au_set_bpm", "0 1200");             /* 60 s: 30 bars at 120 */
        lc->length = 16;                                        /* one bar: it comes round often */
        for (b = 0; b < 2; b++)
            for (r = 0; r < 2; r++) {
                hx_set_param(h, "transport", "stop");
                hx_set_param(h, "bpm", bpms[b]);
                hx_set_param(h, "t4_au_set_revrs", r ? "0 1" : "0 0");
                for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
                stats(h, NULL, NULL, NULL, &under0);
                hx_stub_feed_reset();
                hx_set_param(h, "t4_launch_clip", "0");
                hx_set_param(h, "transport", "play");
                heard = 0;
                for (n = 0; n < 1500; n++) {                    /* ~4.4 s: past the pins, round 2-3 times */
                    au_stream_service(inst);
                    hx_render(h, 1);
                    blk = hx_stub_feed_last(4);
                    if (blk && blk[128]) heard++;
                }
                stats(h, NULL, NULL, NULL, &under);
                HX_ASSERT(heard > 1000, "Vintage on a streamed loop played (almost) nothing");
                HX_ASSERT(under == under0, b ? (r ? "Vintage at 160 bpm, Revrs, waited for a chunk" : "Vintage at 160 bpm waited for a chunk")
                                             : (r ? "Vintage at 90 bpm, Revrs, waited for a chunk" : "Vintage at 90 bpm waited for a chunk"));
            }
        hx_set_param(h, "transport", "stop");
        hx_set_param(h, "bpm", "120");
        hx_set_param(h, "t4_au_set_revrs", "0 0");
        lc->length = was_len;
    }
    {
        char sv[16];
        snprintf(sv, sizeof sv, "0 %d", was_sync);
        hx_set_param(h, "t4_au_set_sync", sv);
    }
    hx_render(h, 1);

    /* ---- two clips on one file share it; let go, it leaves the streamer ---- */
    snprintf(p, sizeof p, "1|%s/src/ramp60.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 1) == 2, "the second clip did not load");
    HX_ASSERT(inst->au_clip[4][1].smp == inst->au_clip[4][0].smp, "two clips on one file hold two copies");
    stats(h, &n, NULL, NULL, NULL);
    HX_ASSERT(n == 1, "two clips on one file are two streamed samples");
    snprintf(p, sizeof p, "0|%s/src/ramp2.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 0) == 2, "the short file did not load");
    HX_ASSERT(inst->au_clip[4][0].smp->pcm != NULL, "a half-second file streamed");
    snprintf(p, sizeof p, "1|%s/src/ramp2.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 1) == 2, "the short file did not load into clip 1");
    for (i = 0; i < 2000; i++) {
        stats(h, &n, NULL, NULL, NULL);
        if (n == 0) break;
        hx_render(h, 1);
        usleep(1000);
    }
    HX_ASSERT(n == 0, "a file no clip holds is still in the streamer");

    /* ---- a streamed chunk decodes as the whole-file read does (stereo 24-bit) ---- */
    {
        au_sample_t *whole, *str;
        int e1, e2;
        uint32_t c, f, diff = 0, nonzero = 0;
        snprintf(p, sizeof p, "%s/src/st24.wav", g_root);
        whole = au_read_file(p, 0, &e1);
        str = au_read_file(p, 1, &e2);
        HX_ASSERT(whole && str && !e1 && !e2 && whole->pcm && !str->pcm, "the stereo file did not read both ways");
        HX_ASSERT(str->ch == 2 && str->frames == whole->frames && str->rate == 48000, "streamed: wrong shape");
        HX_ASSERT(!memcmp(str->mip, whole->mip, (size_t)whole->nmip * 2) && !memcmp(str->peaks, whole->peaks, sizeof whole->peaks),
                  "the streamed waveform differs from the whole file's");
        HX_ASSERT(au_stream_add(inst, str), "the streamer would not take it");
        for (c = 0; c < str->nchunks; c++) {
            au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
            if (!str->chunk[c]) { pthread_mutex_lock(&S->mu); au_stream_read(S, str, c); pthread_mutex_unlock(&S->mu); }
            for (f = c * AU_CHUNK; f < (c + 1) * AU_CHUNK && f < str->frames; f++) {
                const int16_t *a = au_at(str, f), *b = au_at(whole, f);
                if (!a || a[0] != b[0] || a[1] != b[1]) diff++;
                if (b[0] || b[1]) nonzero++;
            }
        }
        HX_ASSERT(diff == 0 && nonzero > str->frames / 2, "a streamed chunk decoded differently from the whole file");
        au_stream_remove(inst, str);
        au_sample_free(str);
        au_sample_free(whole);
    }

    /* ---- the waveform summary is KEPT (review, 2026-10-31): a load of a
     * streamed file whose summary matches reads only its pinned chunks ---- */
    {
        char sp[400], mp[400];
        struct stat st0;
        struct timeval tv[2];
        au_sample_t *live, *again;
        uint32_t m;
        int e = 0, i;
        FILE *f;
        snprintf(sp, sizeof sp, "%s/proj/dAVEBOx/samples/ramp60.wav", g_root);
        snprintf(mp, sizeof mp, "%s/proj/dAVEBOx/.peaks/ramp60.wav.mip", g_root);
        live = au_read_file(sp, 1, &e);                       /* the reference, as the file is now */
        HX_ASSERT(live && !e && !live->pcm, "setup: the 60 s ramp does not stream");
        m = live->nmip / 2;                                   /* the middle: no pin there */
        HX_ASSERT(stat(mp, &st0) == 0 && st0.st_size > 0, "no summary was kept beside samples/");
        HX_ASSERT(live->mip[m][1] > 10, "setup: the middle of the ramp is quiet");
        /* the audio changes (silence over the middle), its size and time do not */
        HX_ASSERT(stat(sp, &st0) == 0, "setup: stat the sample");
        f = fopen(sp, "r+b");
        HX_ASSERT(f, "setup: open the sample");
        fseek(f, 44 + (long)(m - 64) * AU_MIP * 2, SEEK_SET);
        for (i = 0; i < 128 * AU_MIP * 2; i++) fputc(0, f);
        fclose(f);
        tv[0].tv_sec = st0.st_atime; tv[0].tv_usec = 0;
        tv[1].tv_sec = st0.st_mtime; tv[1].tv_usec = 0;
        utimes(sp, tv);
        again = au_read_file(sp, 1, &e);
        HX_ASSERT(again && !e && !again->pcm, "the kept-summary load failed");
        HX_ASSERT(again->nmip == live->nmip && again->mip[m][1] == live->mip[m][1] && again->frames == live->frames,
                  "the load rebuilt the summary instead of reading the kept one");
        HX_ASSERT(again->nhits == live->nhits, "the transient candidates differ from the kept summary's");
        au_sample_free(again);
        /* a newer file: the kept summary is stale and rebuilt from the audio */
        tv[1].tv_sec = st0.st_mtime + 10;
        utimes(sp, tv);
        again = au_read_file(sp, 1, &e);
        HX_ASSERT(again && !e && again->mip[m][1] == 0, "a changed file was summarised from the stale summary");
        au_sample_free(again);
        au_sample_free(live);
    }

    hx_destroy(h);
    printf("PASS: test_audio_loop_stream\n");
    return 0;
}
