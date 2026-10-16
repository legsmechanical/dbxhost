/* midi_fx_offline.c — offline MIDI FX jobs. See midi_fx_offline.h. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "midi_fx_offline.h"
#include "midi_fx_offline_render.h"
#include "module_dlopen.h"
#include "schwung_paths.h"
#include "shim_thread.h"
#include "unified_log.h"

#define MFO_CACHE_DIR SCHWUNG_INSTALL_DIR "/cache/midifx-clone"

/* ---- the job: written by begin (SPI) while IDLE, owned by the job thread
 * from QUEUED until it publishes DONE / FAILED / IDLE ---- */
static struct {
    int            state;            /* MOVE_MIDI_FX_OFFLINE_* (atomic) */
    int            cancel;           /* atomic */
    float          bpm;
    uint32_t       length_ticks, tail_ticks;
    int            in_n, out_n, err;
    int            nsrc;
    move_midi_fx_offline_ev_t in[MOVE_MIDI_FX_OFFLINE_MAX_EV];
    move_midi_fx_offline_ev_t out[MOVE_MIDI_FX_OFFLINE_MAX_EV];
    mfo_fx_src_t   src[MFO_MAX_FX];
} J;

static const host_api_v1_t *g_live_host;
static mfo_slot_instance_fn g_slot_instance;
static chain_midi_fx_clone_source_fn *g_clone_source;   /* the shim's resolved export */

static inline int  st_get(void)        { return __atomic_load_n(&J.state, __ATOMIC_ACQUIRE); }
static inline void st_set(int v)       { __atomic_store_n(&J.state, v, __ATOMIC_RELEASE); }

/* ---- the copies' host: a virtual transport, and no way out ---- */
static mfo_transport_t g_tp;
static host_api_v1_t   g_vhost;

static float  vh_bpm(void)        { return g_tp.bpm; }
static int    vh_clock(void)      { return g_tp.running ? MOVE_CLOCK_STATUS_RUNNING : MOVE_CLOCK_STATUS_STOPPED; }
static double vh_beat(void)       { return g_tp.running ? g_tp.tick / 96.0 : -1.0; }
static int    vh_send(const uint8_t *m, int n) { (void)m; return n; }
static int    vh_send_slot(int s, const uint8_t *m, int n) { (void)s; (void)m; return n; }
static int    vh_recv_ch(void *i) { (void)i; return -2; }
static int    vh_clock_out(void)  { return 1; }

static void vhost_build(void) {
    memset(&g_vhost, 0, sizeof g_vhost);
    if (g_live_host) memcpy(&g_vhost, g_live_host, sizeof g_vhost);
    g_vhost.get_bpm = vh_bpm;
    g_vhost.get_clock_status = vh_clock;
    g_vhost.get_beat_position = vh_beat;
    g_vhost.midi_send_internal = vh_send;
    g_vhost.midi_send_external = vh_send;
    g_vhost.midi_inject_to_move = vh_send;
    g_vhost.midi_send_internal_slot = vh_send_slot;
    g_vhost.slot_recv_channel = vh_recv_ch;
    g_vhost.clock_output_enabled = vh_clock_out;
    g_vhost.mod_emit_value = NULL;
    g_vhost.mod_clear_source = NULL;
    g_vhost.mod_host_ctx = NULL;
}

/* ---- the copies' code, one per (path, mtime, size), for the session ---- */
#define MFO_CACHE_SLOTS 16
static struct {
    char src[512];
    long long mtime, size;
    midi_fx_api_v1_t *api;
} C[MFO_CACHE_SLOTS];
static int C_n;

static int copy_file(const char *from, const char *to) {
    char tmp[600], buf[65536];
    int in, out, ok = 1;
    ssize_t n;
    snprintf(tmp, sizeof tmp, "%s.tmp.%d", to, (int)getpid());
    in = open(from, O_RDONLY);
    if (in < 0) return 0;
    out = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (out < 0) { close(in); return 0; }
    while ((n = read(in, buf, sizeof buf)) > 0)
        if (write(out, buf, (size_t)n) != n) { ok = 0; break; }
    if (n < 0) ok = 0;
    if (fsync(out) != 0) ok = 0;
    close(in);
    if (close(out) != 0) ok = 0;
    if (ok && rename(tmp, to) != 0) ok = 0;
    if (!ok) unlink(tmp);
    return ok;
}

static const char *base_of_dir(const char *so_path, char *out, size_t cap) {
    /* .../midi_fx/<id>/dsp.so -> <id> */
    const char *end = strrchr(so_path, '/'), *beg;
    size_t n;
    if (!end) { snprintf(out, cap, "fx"); return out; }
    beg = end;
    while (beg > so_path && beg[-1] != '/') beg--;
    n = (size_t)(end - beg);
    if (n >= cap) n = cap - 1;
    memcpy(out, beg, n); out[n] = '\0';
    return out;
}

static midi_fx_api_v1_t *clone_load(const char *so_path) {
    struct stat sb;
    char id[128], dst[700];
    void *h;
    midi_fx_init_fn init;
    midi_fx_api_v1_t *api;
    int i;
    if (stat(so_path, &sb) != 0) return NULL;
    for (i = 0; i < C_n; i++)
        if (C[i].mtime == (long long)sb.st_mtime && C[i].size == (long long)sb.st_size && !strcmp(C[i].src, so_path))
            return C[i].api;
    if (C_n >= MFO_CACHE_SLOTS) return NULL;
    mkdir(SCHWUNG_INSTALL_DIR "/cache", 0755);
    mkdir(MFO_CACHE_DIR, 0755);
    snprintf(dst, sizeof dst, MFO_CACHE_DIR "/%s-%lld-%lld.so", base_of_dir(so_path, id, sizeof id),
             (long long)sb.st_mtime, (long long)sb.st_size);
    if (access(dst, R_OK) != 0 && !copy_file(so_path, dst)) {
        unified_log("mfo", LOG_LEVEL_ERROR, "could not copy %s -> %s (errno %d)", so_path, dst, errno);
        return NULL;
    }
    h = dlopen(dst, MODULE_DLOPEN_FLAGS);
    if (!h) { unified_log("mfo", LOG_LEVEL_ERROR, "dlopen %s: %s", dst, dlerror()); return NULL; }
    init = (midi_fx_init_fn)dlsym(h, MIDI_FX_INIT_SYMBOL);
    api = init ? init(&g_vhost) : NULL;
    if (!api || api->api_version != MIDI_FX_API_VERSION || !api->create_instance) {
        unified_log("mfo", LOG_LEVEL_ERROR, "%s: no MIDI FX API", dst);
        return NULL;                       /* NODELETE: the mapping stays, unused */
    }
    snprintf(C[C_n].src, sizeof C[C_n].src, "%s", so_path);
    C[C_n].mtime = (long long)sb.st_mtime;
    C[C_n].size = (long long)sb.st_size;
    C[C_n].api = api;
    C_n++;
    unified_log("mfo", LOG_LEVEL_INFO, "loaded a private copy of %s", so_path);
    return api;
}

/* ---- one job, on whichever thread runs it ---- */
static void run_job(void) {
    mfo_fx_t fx[MFO_MAX_FX];
    int i, j, nfx = 0, rc, n = 0;
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    vhost_build();      /* the live host API is filled in at chain load; refresh it in place */
    memset(fx, 0, sizeof fx);
    J.err = 0;
    for (i = 0; i < J.nsrc; i++) {
        const mfo_fx_src_t *s = &J.src[i];
        midi_fx_api_v1_t *api = clone_load(s->so_path);
        void *inst;
        if (!api) { J.err = MOVE_MIDI_FX_OFFLINE_ERR_LOAD; goto done; }
        inst = api->create_instance(s->dir, NULL);
        if (!inst) { J.err = MOVE_MIDI_FX_OFFLINE_ERR_CREATE; goto done; }
        fx[nfx].api = api; fx[nfx].inst = inst; nfx++;
        if (api->set_param) {
            for (j = 0; j < s->nparams; j++) api->set_param(inst, s->key[j], s->val[j]);
            if (s->state_len > 0) api->set_param(inst, "state", s->state);
        }
    }
    rc = mfo_render(fx, nfx, &g_tp, J.in, J.in_n, J.bpm, J.length_ticks, J.tail_ticks,
                    J.out, MOVE_MIDI_FX_OFFLINE_MAX_EV, &n, &J.cancel);
    J.out_n = n;
    if (rc == 2) J.err = MOVE_MIDI_FX_OFFLINE_ERR_OVERFLOW;
done:
    for (i = 0; i < nfx; i++) if (fx[i].api->destroy_instance) fx[i].api->destroy_instance(fx[i].inst);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    unified_log("mfo", LOG_LEVEL_INFO, "job: %d module(s), %d events in, %d out, err %d, %.1f ms",
                J.nsrc, J.in_n, J.out_n, J.err,
                (double)(t1.tv_sec - t0.tv_sec) * 1000.0 + (double)(t1.tv_nsec - t0.tv_nsec) / 1e6);
    if (__atomic_load_n(&J.cancel, __ATOMIC_ACQUIRE)) {
        __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
        st_set(MOVE_MIDI_FX_OFFLINE_IDLE);
    } else {
        st_set(J.err ? MOVE_MIDI_FX_OFFLINE_FAILED : MOVE_MIDI_FX_OFFLINE_DONE);
    }
}

int midi_fx_offline_run_pending(void) {
    int q = MOVE_MIDI_FX_OFFLINE_QUEUED;
    if (!__atomic_compare_exchange_n(&J.state, &q, MOVE_MIDI_FX_OFFLINE_RUNNING, 0,
                                     __ATOMIC_ACQ_REL, __ATOMIC_ACQUIRE)) return 0;
    if (__atomic_load_n(&J.cancel, __ATOMIC_ACQUIRE)) {
        __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
        st_set(MOVE_MIDI_FX_OFFLINE_IDLE);
        return 1;
    }
    run_job();
    return 1;
}

static void *job_main(void *arg) {
    (void)arg;
#ifdef __linux__
    {
        struct sched_param sp = { .sched_priority = 0 };
        cpu_set_t mask;
        pthread_setschedparam(pthread_self(), SCHED_OTHER, &sp);
        CPU_ZERO(&mask); CPU_SET(0, &mask); CPU_SET(1, &mask); CPU_SET(2, &mask);
        pthread_setaffinity_np(pthread_self(), sizeof(mask), &mask);
    }
#endif
    for (;;) {
        if (!midi_fx_offline_run_pending()) {
            struct timespec ts = { 0, 5 * 1000 * 1000 };   /* 5 ms: a bake starts within one tick */
            nanosleep(&ts, NULL);
        }
    }
    return NULL;
}

void midi_fx_offline_configure(const host_api_v1_t *host, mfo_slot_instance_fn slot_instance,
                               chain_midi_fx_clone_source_fn *clone_source) {
    g_live_host = host;
    g_slot_instance = slot_instance;
    g_clone_source = clone_source;
    vhost_build();
}

void midi_fx_offline_start(const host_api_v1_t *host, mfo_slot_instance_fn slot_instance,
                           chain_midi_fx_clone_source_fn *clone_source) {
    static int started;
    pthread_t tid;
    midi_fx_offline_configure(host, slot_instance, clone_source);
    if (started) return;
    started = 1;
    if (shim_pthread_create(&tid, NULL, job_main, NULL) == 0) pthread_detach(tid);
}

/* ---- the SPI-thread side ---- */
int midi_fx_offline_begin(int slot, float bpm, uint32_t length_ticks, uint32_t tail_ticks,
                          const move_midi_fx_offline_ev_t *in, int in_count) {
    void *ci;
    int n;
    if (st_get() != MOVE_MIDI_FX_OFFLINE_IDLE) return 0;
    if (in_count < 0 || in_count > MOVE_MIDI_FX_OFFLINE_MAX_EV || (in_count && !in)) return 0;
    if (!(bpm > 0.0f) || length_ticks == 0) return 0;
    if (!g_slot_instance || !g_clone_source || !*g_clone_source) return 0;
    ci = g_slot_instance(slot);
    if (!ci) return 0;
    n = (*g_clone_source)(ci, J.src, MFO_MAX_FX);
    if (n <= 0) return 0;
    J.nsrc = n;
    J.bpm = bpm; J.length_ticks = length_ticks; J.tail_ticks = tail_ticks;
    if (in_count) memcpy(J.in, in, (size_t)in_count * sizeof *in);
    J.in_n = in_count; J.out_n = 0; J.err = 0;
    __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
    st_set(MOVE_MIDI_FX_OFFLINE_QUEUED);
    return 1;
}

int midi_fx_offline_poll(move_midi_fx_offline_ev_t *out, int cap, int *out_count, int take) {
    const int st = st_get();
    if (out_count) *out_count = 0;
    if (st == MOVE_MIDI_FX_OFFLINE_DONE) {
        int n = J.out_n < cap ? J.out_n : cap;
        if (n > 0 && out) memcpy(out, J.out, (size_t)n * sizeof *out);
        if (out_count) *out_count = n > 0 ? n : 0;
        if (take) st_set(MOVE_MIDI_FX_OFFLINE_IDLE);
    } else if (st == MOVE_MIDI_FX_OFFLINE_FAILED) {
        if (out_count) *out_count = J.err;
        if (take) st_set(MOVE_MIDI_FX_OFFLINE_IDLE);
    }
    return st;
}

void midi_fx_offline_cancel(void) {
    const int st = st_get();
    if (st == MOVE_MIDI_FX_OFFLINE_DONE || st == MOVE_MIDI_FX_OFFLINE_FAILED) { st_set(MOVE_MIDI_FX_OFFLINE_IDLE); return; }
    if (st == MOVE_MIDI_FX_OFFLINE_QUEUED || st == MOVE_MIDI_FX_OFFLINE_RUNNING)
        __atomic_store_n(&J.cancel, 1, __ATOMIC_RELEASE);
}
