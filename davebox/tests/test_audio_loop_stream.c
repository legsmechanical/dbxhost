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
 *   - after everything else is let go, a jump to every point of the finest
 *     division — forwards and in Revrs — reads pinned frames: none waits;
 *   - moving Start pins the new points; a let-go chunk is freed only after
 *     two more blocks; a waiting JmpQ jump's target is read ahead;
 *   - two clips on one file share it; the file let go leaves the streamer. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

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
    for (n = 1; n < 400; n++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    stats(h, NULL, NULL, NULL, &under);
    HX_ASSERT(under > under0, "a voice past its pins found chunks nobody read");
    HX_ASSERT(blk[0] == 0 && blk[254] == 0, "a missing chunk was not silent");
    for (i = 0; i < 4; i++) au_stream_service(inst);
    hx_render(h, 1);                                 /* block 400: fading back in */
    hx_render(h, 1);                                 /* block 401: in */
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == ramp_at(401.0 * 128) && blk[254] == ramp_at(401.0 * 128 + 127),
              "after the gap the loop did not come back at the frame it would have reached");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- jumps: every point of the finest division, from pins alone ---- */
    for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
    hx_set_param(h, "t4_au_set_jump", "0 32");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    stats(h, NULL, NULL, &reads, &under0);
    bad = 0;
    for (k = 0; k < 32; k++) {
        char kk[8];
        double at = (double)FR * k / 32;
        snprintf(kk, sizeof kk, "%d", k);
        hx_set_param(h, "t4_au_jump", kk);
        hx_set_param(h, "t4_au_jump_off", kk);
        hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        if (abs(blk[0] - ramp_at(at)) > 1 || abs(blk[254] - ramp_at(at + 127)) > 1) bad++;
    }
    stats(h, NULL, NULL, NULL, &under);
    HX_ASSERT(bad == 0, "a jump did not land on its point");
    HX_ASSERT(under == under0, "a jump waited for a chunk: a point is not pinned");
    /* Revrs: point k mirrors onto the end, read backwards. Turning Revrs on
     * restarts the loop at the mirror of where it was — not a point, so the
     * streamer reads it; the jumps after that come from the pins alone. */
    hx_set_param(h, "t4_au_set_revrs", "0 1");
    hx_render(h, 1);
    for (i = 0; i < 4; i++) au_stream_service(inst);
    hx_render(h, 2);
    stats(h, NULL, NULL, NULL, &under0);
    bad = 0;
    for (k = 0; k < 32; k++) {
        char kk[8];
        double at = (double)FR - 1.0 - (double)FR * k / 32;
        snprintf(kk, sizeof kk, "%d", k);
        hx_set_param(h, "t4_au_jump", kk);
        hx_set_param(h, "t4_au_jump_off", kk);
        hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        if (abs(blk[0] - ramp_at(at)) > 1 || abs(blk[254] - ramp_at(at - 127)) > 1) bad++;
    }
    stats(h, NULL, NULL, NULL, &under);
    HX_ASSERT(bad == 0, "a Revrs jump did not land on its mirrored point");
    HX_ASSERT(under == under0, "a Revrs jump waited for a chunk");
    hx_set_param(h, "t4_au_set_revrs", "0 0");
    hx_render(h, 2);                                 /* the loop restarts (a restart lands a waiting jump) */

    /* ---- a waiting JmpQ jump: its target is read before it lands ---- */
    hx_set_param(h, "t4_au_set_jmpq", "0 3");        /* 1/4 */
    hx_set_param(h, "t4_au_jump", "7");
    hx_set_param(h, "t4_au_jump_off", "7");
    hx_render(h, 1);
    {
        uint32_t tgt = (uint32_t)((double)FR * 7 / 32), c = tgt >> AU_CHUNK_SHIFT;
        au_sample_t *s = inst->au_clip[4][0].smp;
        HX_ASSERT(inst->au_trk[4].pending_jump == 7, "the JmpQ jump did not wait");
        for (i = 0; i < 4; i++) au_stream_service(inst);
        HX_ASSERT(s->chunk[c + 4] != NULL, "a waiting jump's target was not read ahead");
    }
    hx_set_param(h, "t4_au_set_jmpq", "0 0");
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

    hx_destroy(h);
    printf("PASS: test_audio_loop_stream\n");
    return 0;
}
