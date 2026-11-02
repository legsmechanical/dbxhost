/* A stem take records several slots at once, each to its own file, and keeps
 * exactly the frames asked for — the files are loops.
 *
 * Runs stem_take.c itself: real files, its real writer thread. The worker
 * events are run in place when posted (as the shim's worker would, later),
 * except where a test holds them back to play a slow disk. */
#define _GNU_SOURCE
#include "../../src/host/stem_take.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>

static int fails = 0;
static void expect(int cond, const char *what) {
    printf("  %s %s\n", cond ? "ok  " : "FAIL", what);
    if (!cond) fails = 1;
}

static int hold_events = 0, held_prep = 0, held_fin = 0;
static void t_log(const char *m) { (void)m; }
static int t_run(const char *const argv[]) { (void)argv; return 0; }
static void t_post(int fin) {
    if (hold_events) { if (fin) held_fin = 1; else held_prep = 1; return; }
    if (fin) stem_take_worker_finalize(); else stem_take_worker_prepare();
}

static char dir[256];

/* The file's data frames (-1: no file) and, into out, its first `cap` samples. */
static long wav_frames(const char *path, int16_t *out, size_t cap) {
    FILE *f = fopen(path, "rb");
    unsigned char h[44];
    long frames;
    if (!f) return -1;
    if (fread(h, 1, 44, f) != 44 || memcmp(h, "RIFF", 4) || memcmp(h + 36, "data", 4)) { fclose(f); return -2; }
    frames = (long)(h[40] | h[41] << 8 | h[42] << 16 | (unsigned long)h[43] << 24) / 4;
    if (out) { size_t got = fread(out, 2, cap, f); (void)got; }
    fseek(f, 0, SEEK_END);
    if (ftell(f) != 44 + frames * 4) frames = -3;   /* the header and the data disagree */
    fclose(f);
    return frames;
}

/* One block: stem i's samples are (i+1)*1000 + the frame's index in the take. */
static void block(int n, uint32_t at, int silent_stem) {
    int16_t b[STEM_TAKE_BLOCK_FRAMES * 2];
    for (int i = 0; i < n; i++) {
        for (int k = 0; k < STEM_TAKE_BLOCK_FRAMES * 2; k++)
            b[k] = (int16_t)((i + 1) * 1000 + (int)((at + k / 2) % 997));
        stem_take_capture(i, i == silent_stem ? NULL : b);
    }
    stem_take_block_end();
}

/* Blocks until the take is no longer recording; returns how many ran. */
static int run_until_done(int n, int silent_stem, int max) {
    int k = 0;
    while (stem_take_state(NULL, 0) == STEM_TAKE_RECORDING && k < max) {
        block(n, (uint32_t)k * STEM_TAKE_BLOCK_FRAMES, silent_stem);
        k++;
    }
    return k;
}

int main(void) {
    char a[300], b[300], c[300];
    const char *paths[3];
    int slots[3] = { 2, 5, 0 };
    uint16_t peaks[STEM_TAKE_MAX];
    int16_t data[8];
    snprintf(dir, sizeof dir, "%s", "/tmp/stem_take_XXXXXX");
    if (!mkdtemp(dir)) { perror("mkdtemp"); return 1; }
    snprintf(a, sizeof a, "%s/sub/a.wav", dir);
    snprintf(b, sizeof b, "%s/sub/b.wav", dir);
    snprintf(c, sizeof c, "%s/sub/c.wav", dir);
    paths[0] = a; paths[1] = b; paths[2] = c;
    stem_take_host_t h = { t_log, t_run, t_post };

    printf("stem take: refusals\n");
    expect(stem_take_start(1, slots, paths, 0) == 0, "no rings before init: refused");
    expect(stem_take_init(&h) == 0, "init allocates the rings");
    expect(stem_take_start(0, slots, paths, 0) == 0, "no stems: refused");
    expect(stem_take_start(STEM_TAKE_MAX + 1, slots, paths, 0) == 0, "too many stems: refused");
    { const char *rel[1] = { "x.wav" };
      expect(stem_take_start(1, slots, rel, 0) == 0, "a relative path: refused"); }
    expect(stem_take_slot(0) == -1, "no take: no slot");

    /* the directory does not exist: the stub host runs no mkdir, so make it */
    { char sub[300]; snprintf(sub, sizeof sub, "%s/sub", dir); mkdir(sub, 0755); }

    printf("stem take: a fixed length, two stems\n");
    expect(stem_take_start(2, slots, paths, 300) == 1, "starts");
    expect(stem_take_start(1, slots, paths, 0) == 0, "a second take while one runs: refused");
    expect(stem_take_slot(0) == 2 && stem_take_slot(1) == 5 && stem_take_slot(2) == -1, "each stem's slot");
    int blocks = run_until_done(2, 1, 50);
    expect(blocks == 3, "300 frames take 3 blocks (the last partial)");
    expect(stem_take_state(peaks, 2) == STEM_TAKE_IDLE, "written and idle");
    expect(wav_frames(a, data, 8) == 300, "stem 1 holds exactly 300 frames");
    expect(data[0] == 1000 && data[1] == 1000 && data[2] == 1001, "stem 1's first frames are its own, in order");
    expect(wav_frames(b, NULL, 0) == 300, "stem 2 holds exactly 300 frames");
    expect(peaks[0] > 1000 && peaks[1] == 0, "the peak: sound on stem 1, silence on stem 2");

    printf("stem take: a length set while it runs\n");
    expect(stem_take_start(3, slots, paths, 0) == 1, "starts open-ended");
    block(3, 0, -1); block(3, 128, -1); block(3, 256, -1);   /* 384 frames */
    stem_take_limit(500);
    blocks = run_until_done(3, -1, 50);
    expect(blocks == 1, "the limit ends it in the next block");
    expect(wav_frames(c, NULL, 0) == 500, "500 frames, counted from the first");

    printf("stem take: a length already passed\n");
    expect(stem_take_start(1, slots, paths, 0) == 1, "starts open-ended");
    block(1, 0, -1); block(1, 128, -1);
    stem_take_limit(100);
    expect(stem_take_state(NULL, 0) == STEM_TAKE_IDLE, "ends at once");
    expect(wav_frames(a, NULL, 0) == 256, "at what it has");

    printf("stem take: stop\n");
    expect(stem_take_start(1, slots, paths, 0) == 1, "starts");
    block(1, 0, -1);
    stem_take_stop();
    block(1, 128, -1);
    expect(wav_frames(a, NULL, 0) == 128, "nothing after the stop");

    printf("stem take: a disk that falls behind voids the take\n");
    hold_events = 1;
    expect(stem_take_start(2, slots, paths, 0) == 1, "starts (prepare held back: no writer)");
    blocks = run_until_done(2, -1, 2000);
    expect(blocks < 2000 && held_fin, "the full ring ends the take");
    hold_events = 0;
    stem_take_worker_prepare();   /* the events, late, in order */
    stem_take_worker_finalize();
    expect(stem_take_state(NULL, 0) == STEM_TAKE_FAILED, "reported as failed");
    expect(wav_frames(a, NULL, 0) == -1 && wav_frames(b, NULL, 0) == -1, "every file removed");
    expect(stem_take_start(1, slots, paths, 128) == 1, "the next take starts");
    expect(stem_take_state(NULL, 0) == STEM_TAKE_RECORDING, "and the failure is cleared");
    run_until_done(1, -1, 10);
    expect(wav_frames(a, NULL, 0) == 128, "and is saved");

    printf("stem take: a file that will not open voids the take\n");
    { const char *bad[2] = { a, "/nonexistent-dir-for-test/x.wav" };
      expect(stem_take_start(2, slots, bad, 0) == 1, "starts");
      block(2, 0, -1);
      expect(stem_take_state(NULL, 0) == STEM_TAKE_FAILED, "ends, failed");
      expect(wav_frames(a, NULL, 0) == -1, "the stem that did open is removed too"); }

    char cmd[300];
    snprintf(cmd, sizeof cmd, "rm -rf '%s'", dir);
    if (system(cmd) != 0) fprintf(stderr, "could not remove %s\n", dir);
    printf(fails ? "FAIL\n" : "PASS\n");
    return fails;
}
