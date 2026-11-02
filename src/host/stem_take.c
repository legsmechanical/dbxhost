/* stem_take.c — several chain slots recorded at once, each to its own WAV.
 * See stem_take.h for the contract and the threads. */

#define _GNU_SOURCE
#include "stem_take.h"
#include "host/shim_thread.h"   /* shim threads must never receive the host's SIGTERM */

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define ST_RATE      44100
#define ST_CH        2
#define ST_RING      (ST_RATE * STEM_TAKE_RING_SECONDS * ST_CH)   /* samples */
#define ST_PATH_MAX  256

typedef struct {
    int16_t *ring;
    size_t   wpos, rpos;            /* atomics: RT writes wpos, the writer rpos */
    FILE    *file;
    char     path[ST_PATH_MAX];
    int      slot;
    uint16_t peak;
    uint32_t written;               /* frames in the file (the writer's) */
} stem_t;

static stem_take_host_t st_host;
static stem_t   st_stems[STEM_TAKE_MAX];
static int16_t *st_rings = NULL;

static volatile int st_state = STEM_TAKE_IDLE;  /* RECORDING / WRITING / IDLE */
static volatile int st_last_failed = 0;
static volatile int st_failed = 0;              /* this take is void */
static int      st_n = 0;
static int      st_limited = 0;
static uint32_t st_frames_left = 0;
static uint32_t st_done = 0;                    /* frames captured per stem */
static uint32_t st_dropped = 0;

static pthread_t    st_writer;
static volatile int st_writer_running = 0;
static volatile int st_writer_exit = 0;

int stem_take_init(const stem_take_host_t *host) {
    int i;
    if (host) st_host = *host;
    if (!st_rings) st_rings = malloc((size_t)STEM_TAKE_MAX * ST_RING * sizeof(int16_t));
    if (!st_rings) {
        if (st_host.log) st_host.log("stem take: ring allocation failed -- stem takes disabled");
        return -1;
    }
    for (i = 0; i < STEM_TAKE_MAX; i++) st_stems[i].ring = st_rings + (size_t)i * ST_RING;
    return 0;
}

/* ---- RT ---------------------------------------------------------------- */

static void st_request_stop(void) {
    if (st_state != STEM_TAKE_RECORDING) return;
    st_state = STEM_TAKE_WRITING;
    if (st_host.post) st_host.post(1);
}

int stem_take_start(int n, const int *slots, const char *const *paths, uint32_t frames) {
    int i;
    if (!st_rings || st_state != STEM_TAKE_IDLE || n < 1 || n > STEM_TAKE_MAX || !slots || !paths)
        return 0;
    for (i = 0; i < n; i++) {
        size_t len;
        if (!paths[i] || paths[i][0] != '/' || slots[i] < 0) return 0;
        len = strlen(paths[i]);
        if (len >= ST_PATH_MAX) return 0;
    }
    for (i = 0; i < n; i++) {
        stem_t *s = &st_stems[i];
        memcpy(s->path, paths[i], strlen(paths[i]) + 1);
        s->slot = slots[i];
        s->peak = 0;
        s->written = 0;
        s->file = NULL;
        __atomic_store_n(&s->wpos, 0, __ATOMIC_RELEASE);
        __atomic_store_n(&s->rpos, 0, __ATOMIC_RELEASE);
    }
    st_n = n;
    st_done = 0;
    st_dropped = 0;
    st_failed = 0;
    st_limited = frames > 0;
    st_frames_left = frames;
    st_state = STEM_TAKE_RECORDING;
    if (st_host.post) st_host.post(0);
    return 1;
}

void stem_take_limit(uint32_t frames) {
    if (st_state != STEM_TAKE_RECORDING) return;
    if (frames <= st_done) { st_request_stop(); return; }
    st_limited = 1;
    st_frames_left = frames - st_done;
}

void stem_take_stop(void) { st_request_stop(); }

int stem_take_state(uint16_t *peaks, int cap) {
    int i;
    if (peaks)
        for (i = 0; i < cap && i < STEM_TAKE_MAX; i++) peaks[i] = i < st_n ? st_stems[i].peak : 0;
    if (st_state != STEM_TAKE_IDLE) return st_state;
    return st_last_failed ? STEM_TAKE_FAILED : STEM_TAKE_IDLE;
}

int stem_take_slot(int i) {
    if (st_state != STEM_TAKE_RECORDING || i < 0 || i >= st_n) return -1;
    return st_stems[i].slot;
}

/* Frames of this block the take keeps. */
static uint32_t st_block_frames(void) {
    if (!st_limited) return STEM_TAKE_BLOCK_FRAMES;
    return st_frames_left < STEM_TAKE_BLOCK_FRAMES ? st_frames_left : STEM_TAKE_BLOCK_FRAMES;
}

void stem_take_capture(int i, const int16_t *block) {
    stem_t *s;
    size_t w, r, used, k, samples;
    uint16_t peak;
    if (st_state != STEM_TAKE_RECORDING || st_failed || i < 0 || i >= st_n) return;
    s = &st_stems[i];
    samples = (size_t)st_block_frames() * ST_CH;
    if (!samples) return;
    w = __atomic_load_n(&s->wpos, __ATOMIC_ACQUIRE);
    r = __atomic_load_n(&s->rpos, __ATOMIC_ACQUIRE);
    used = (w + ST_RING - r) % ST_RING;
    if (ST_RING - 1 - used < samples) {
        /* the disk is RING_SECONDS behind: the loop would be short, so void it */
        st_dropped++;
        st_failed = 1;
        return;
    }
    peak = s->peak;
    for (k = 0; k < samples; k++) {
        int16_t v = block ? block[k] : 0;
        uint16_t m = (uint16_t)(v < 0 ? -(int32_t)v : v);
        if (m > peak) peak = m;
        s->ring[w] = v;
        if (++w == ST_RING) w = 0;
    }
    s->peak = peak;
    __atomic_store_n(&s->wpos, w, __ATOMIC_RELEASE);
}

void stem_take_block_end(void) {
    uint32_t n;
    if (st_state != STEM_TAKE_RECORDING) return;
    if (st_failed) { st_request_stop(); return; }
    n = st_block_frames();
    st_done += n;
    if (st_limited) {
        st_frames_left -= n;
        if (!st_frames_left) st_request_stop();
    }
}

/* ---- writer ------------------------------------------------------------ */

static void st_wav_header(FILE *f, uint32_t frames) {
    uint8_t h[44];
    uint32_t data = frames * ST_CH * 2;
    uint32_t v;
#define PUT32(o, x) do { v = (x); h[o] = v; h[o+1] = v >> 8; h[o+2] = v >> 16; h[o+3] = v >> 24; } while (0)
#define PUT16(o, x) do { v = (x); h[o] = v; h[o+1] = v >> 8; } while (0)
    memcpy(h, "RIFF", 4);      PUT32(4, 36 + data);
    memcpy(h + 8, "WAVEfmt ", 8); PUT32(16, 16);
    PUT16(20, 1);              PUT16(22, ST_CH);
    PUT32(24, ST_RATE);        PUT32(28, ST_RATE * ST_CH * 2);
    PUT16(32, ST_CH * 2);      PUT16(34, 16);
    memcpy(h + 36, "data", 4); PUT32(40, data);
#undef PUT32
#undef PUT16
    fseek(f, 0, SEEK_SET);
    fwrite(h, 1, sizeof h, f);
}

/* Drain stem i's ring into its file; 1 if anything was written. */
static int st_drain(stem_t *s) {
    int any = 0;
    for (;;) {
        size_t r = __atomic_load_n(&s->rpos, __ATOMIC_ACQUIRE);
        size_t w = __atomic_load_n(&s->wpos, __ATOMIC_ACQUIRE);
        size_t n;
        if (r == w) return any;
        n = w > r ? w - r : ST_RING - r;
        if (s->file) fwrite(s->ring + r, sizeof(int16_t), n, s->file);
        s->written += (uint32_t)(n / ST_CH);
        __atomic_store_n(&s->rpos, (r + n) % ST_RING, __ATOMIC_RELEASE);
        any = 1;
    }
}

static void *st_writer_func(void *arg) {
    (void)arg;
    for (;;) {
        int i, ex = st_writer_exit;
        for (i = 0; i < st_n; i++) st_drain(&st_stems[i]);
        if (ex) break;   /* drained after the exit was seen: nothing is left */
        usleep(20000);
    }
    return NULL;
}

/* ---- worker ------------------------------------------------------------ */

static void st_log(const char *m) { if (st_host.log) st_host.log(m); }

static void st_chown(const char *p) {
    const char *argv[] = { "chown", "ableton:users", p, NULL };
    if (st_host.run_command) st_host.run_command(argv);
}

void stem_take_worker_prepare(void) {
    int i;
    char msg[320];
    for (i = 0; i < st_n; i++) {
        stem_t *s = &st_stems[i];
        char dir[ST_PATH_MAX];
        char *sl;
        struct stat sb;
        snprintf(dir, sizeof dir, "%s", s->path);
        sl = strrchr(dir, '/');
        if (sl && sl != dir) {
            *sl = '\0';
            if (stat(dir, &sb) != 0) {
                const char *argv[] = { "mkdir", "-p", dir, NULL };
                if (st_host.run_command) st_host.run_command(argv);
                st_chown(dir);
            }
        }
        s->file = fopen(s->path, "wb");
        if (!s->file) {
            snprintf(msg, sizeof msg, "stem take: could not open %s", s->path);
            st_log(msg);
            st_failed = 1;
            return;
        }
        st_wav_header(s->file, 0);
    }
    st_writer_exit = 0;
    if (shim_pthread_create(&st_writer, NULL, st_writer_func, NULL) != 0) {
        st_log("stem take: could not start the writer");
        st_failed = 1;
        return;
    }
    st_writer_running = 1;
    snprintf(msg, sizeof msg, "stem take: recording %d stem(s), first %s", st_n, st_stems[0].path);
    st_log(msg);
}

void stem_take_worker_finalize(void) {
    int i, failed;
    char msg[320];
    if (st_writer_running) {
        st_writer_exit = 1;
        pthread_join(st_writer, NULL);
        st_writer_running = 0;
    }
    failed = st_failed;
    for (i = 0; i < st_n; i++) {
        stem_t *s = &st_stems[i];
        if (s->file) {
            if (!failed) st_wav_header(s->file, s->written);
            fclose(s->file);
            s->file = NULL;
            if (failed) unlink(s->path);
            else        st_chown(s->path);
        }
    }
    if (failed) {
        snprintf(msg, sizeof msg, "stem take: VOIDED (%u dropped block(s) or a file that would not open) -- files removed",
                 st_dropped);
        st_log(msg);
    } else {
        snprintf(msg, sizeof msg, "stem take: saved %d stem(s), %u frames each", st_n, st_done);
        st_log(msg);
    }
    /* ⚠ The outcome before IDLE: IDLE is startable from the audio thread. */
    st_last_failed = failed;
    st_state = STEM_TAKE_IDLE;
}
