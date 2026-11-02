/* offline_take.c — offline takes. See offline_take.h. */
#define _GNU_SOURCE
#include <math.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "audio_fx_api_v2.h"
#include "module_clone.h"
#include "offline_take.h"
#include "schwung_paths.h"
#include "shim_thread.h"

#define OT_CACHE_DIR    SCHWUNG_INSTALL_DIR "/cache/offline-clone"
#define OT_STATE_PATH   OT_CACHE_DIR "/engine-state.json"
#define OT_BLOCK        128
#define OT_RATE         44100
/* The longest a copy may play before its take starts (a warm-up pass of 64
 * bars at 20 BPM is under 13 minutes); then something is wrong. */
#define OT_GUARD_FRAMES ((uint64_t)OT_RATE * 60 * 30)
#define OT_EXT_SYMBOL   MOVE_PLUGIN_HOST_EXT_V1_SYMBOL

/* job states: begin writes the job while IDLE; the job thread owns it from
 * QUEUED until it publishes DONE / FAILED / IDLE */
enum { OT_IDLE = 0, OT_QUEUED, OT_RUNNING, OT_DONE, OT_FAILED };

static offline_take_host_t H;
static char g_engine_so[512], g_engine_dir[512];

static struct {
    int state;                    /* OT_* (atomic) */
    int cancel;                   /* atomic */
    uint32_t done, total;         /* atomics: frames written, the take's length */
    move_offline_take_t take;
    offline_slot_info_t info;
    char engine_so[512], engine_dir[512];
    slc_src_t src;
} J;

static inline int  st_get(void)  { return __atomic_load_n(&J.state, __ATOMIC_ACQUIRE); }
static inline void st_set(int v) { __atomic_store_n(&J.state, v, __ATOMIC_RELEASE); }

static void ot_log(const char *m) { if (H.log) H.log(m); }

/* ---- the copies' transport: the engine copy's tempo and clock ---- */
static struct {
    volatile float  bpm;
    volatile int    running;
    volatile uint32_t clocks;     /* 0xF8 since the last Start */
} g_tp;

/* ---- the running take (job thread only) ---- */
static struct {
    plugin_api_v2_t   *sapi;  void *sinst;
    audio_fx_api_v2_t *fapi[SLC_MAX_FX]; void *finst[SLC_MAX_FX]; int fpos[SLC_MAX_FX]; int nfx;
    int32_t feed[OT_BLOCK * 2]; int fed;           /* slot_audio_feed for the next block */
    uint8_t held[16][128];                          /* transposed note per (channel, note), 0xFF none */
    FILE   *file;
    char    path[512];
    uint32_t total, written;
    int     on, failed;
    char    why[160];
} T;

static void t_fail(const char *why) {
    if (!T.failed) { T.failed = 1; snprintf(T.why, sizeof T.why, "%s", why); }
}

/* ---- what the engine copy sends, as the host would deliver it ---- */

/* The chain's own front (chain_midi.c v2_on_midi): a knob-mapped CC is the
 * chain's, not the instrument's — it moves a parameter by the time between
 * turns, which a copy cannot replay; the take is refused. */
static void t_to_synth(const uint8_t *m, int len, int source) {
    if (source != MOVE_MIDI_SOURCE_DIRECT && len >= 3 && (m[0] & 0xF0) == 0xB0 &&
            m[1] >= 71 && m[1] <= 78 && (J.src.knob_ccs & (1u << (m[1] - 71)))) {
        t_fail("a knob-mapped CC reached the slot");
        return;
    }
    if (!T.sapi || !T.sinst || !T.sapi->on_midi) return;    /* no instrument: nothing hears it */
    T.sapi->on_midi(T.sinst, m, len, source == MOVE_MIDI_SOURCE_DIRECT ? MOVE_MIDI_SOURCE_EXTERNAL : source);
}

static void t_realtime(uint8_t st) {
    const uint8_t m[1] = { st };
    if (st == 0xFA) { g_tp.running = 1; g_tp.clocks = 0; }
    else if (st == 0xFB) g_tp.running = 1;
    else if (st == 0xFC) g_tp.running = 0;
    else if (st == 0xF8 && g_tp.running) g_tp.clocks++;
    /* shadow_chain_broadcast_realtime */
    if (T.sapi && T.sinst && T.sapi->on_midi) T.sapi->on_midi(T.sinst, m, 1, MOVE_MIDI_SOURCE_EXTERNAL);
}

static int is_realtime(uint8_t s) { return s == 0xF8 || s == 0xFA || s == 0xFB || s == 0xFC; }

/* shadow_chain_remap_channel + shadow_chain_apply_transpose: 0 = dropped */
static int t_slot_shape(uint8_t *m, int direct) {
    const uint8_t type = m[0] & 0xF0;
    uint8_t ch, orig, held;
    int note;
    if (J.info.fwd_ch >= 0 && type >= 0x80 && type < 0xF0) m[0] = (uint8_t)(type | (J.info.fwd_ch & 0x0F));
    if (direct || (type != 0x80 && type != 0x90 && type != 0xA0)) return 1;
    ch = m[0] & 0x0F; orig = m[1] & 0x7F;
    if (type == 0x90 && m[2] > 0) {
        note = (int)orig + J.info.transpose;
        if (note < 0 || note > 127) return 0;
        T.held[ch][orig] = (uint8_t)note;
        m[1] = (uint8_t)note;
        return 1;
    }
    held = T.held[ch][orig];
    if (held != 0xFF) {
        m[1] = held;
        if (type != 0xA0) T.held[ch][orig] = 0xFF;
        return 1;
    }
    if (!J.info.transpose) return 1;
    note = (int)orig + J.info.transpose;
    if (note < 0 || note > 127) return 0;
    m[1] = (uint8_t)note;
    return 1;
}

static int eh_send_internal(const uint8_t *msg, int len) {
    if (!msg || len < 4) return 0;
    if (is_realtime(msg[1])) t_realtime(msg[1]);
    /* channel-matched voice messages go to Move's tracks / other slots: not this take's */
    return len;
}
static int eh_send_slot(int slot, const uint8_t *msg, int len) {
    uint8_t m[3];
    if (!msg || len < 4) return 0;
    if (is_realtime(msg[1])) { t_realtime(msg[1]); return len; }
    if (slot != J.take.slot) return len;
    m[0] = msg[1]; m[1] = msg[2]; m[2] = msg[3];
    if (t_slot_shape(m, 0)) t_to_synth(m, 3, MOVE_MIDI_SOURCE_EXTERNAL);
    return len;
}
static int eh_send_out(const uint8_t *msg, int len) { (void)msg; return len; }
static float  eh_bpm(void)   { return g_tp.bpm; }
static double eh_beat(void)  { return g_tp.running ? (double)g_tp.clocks / 24.0 : -1.0; }
static int    eh_clock(void) { return g_tp.running ? MOVE_CLOCK_STATUS_RUNNING : MOVE_CLOCK_STATUS_STOPPED; }
static int    eh_recv_ch(void *i) { (void)i; return -2; }
static int    eh_clock_out(void) { return 1; }
static int    eh_send_slot_any(int s, const uint8_t *m, int n) { (void)s; (void)m; return n; }

static int ex_set_slot_param(int slot, const char *key, const char *val) {
    int i;
    if (slot != J.take.slot || !key || !val) return 1;
    if (!strncmp(key, "synth:", 6)) {
        if (T.sapi && T.sinst && T.sapi->set_param) T.sapi->set_param(T.sinst, key + 6, val);
    } else if (!strncmp(key, "fx", 2) && key[2] >= '1' && key[2] <= '4' && key[3] == ':') {
        for (i = 0; i < T.nfx; i++)
            if (T.fpos[i] == key[2] - '1' && T.fapi[i]->set_param) T.fapi[i]->set_param(T.finst[i], key + 4, val);
    }
    return 1;
}
static void ex_set_tempo(float bpm) { if (bpm > 0.0f) g_tp.bpm = bpm; }
static int  ex_send_direct(int slot, const uint8_t *msg, int len) {
    uint8_t m[3];
    if (!msg || len < 4) return 0;
    if ((msg[1] & 0xF0) < 0x80 || (msg[1] & 0xF0) == 0xF0) return eh_send_slot(slot, msg, len);
    if (slot != J.take.slot) return len;
    m[0] = msg[1]; m[1] = msg[2]; m[2] = msg[3];
    if (t_slot_shape(m, 1)) t_to_synth(m, 3, MOVE_MIDI_SOURCE_DIRECT);
    return len;
}
static void ex_set_move_info(const void *info, size_t size) { (void)info; (void)size; }
static int  ex_mfo_begin(int s, float b, uint32_t l, uint32_t t, const struct move_midi_fx_offline_ev *in, int n) {
    (void)s; (void)b; (void)l; (void)t; (void)in; (void)n; return 0;
}
static int  ex_mfo_poll(struct move_midi_fx_offline_ev *o, int c, int *n, int t) {
    (void)o; (void)c; (void)t; if (n) *n = 0; return MOVE_MIDI_FX_OFFLINE_IDLE;
}
static void ex_mfo_cancel(void) {}
static int  ex_capture_mix(const char *p, uint32_t f) { (void)p; (void)f; return 0; }

static void t_mkdir_for(const char *path) {
    char dir[512];
    char *sl;
    struct stat sb;
    snprintf(dir, sizeof dir, "%s", path);
    sl = strrchr(dir, '/');
    if (!sl || sl == dir) return;
    *sl = '\0';
    if (stat(dir, &sb) == 0) return;
    if (H.run_command) {
        const char *mk[] = { "mkdir", "-p", dir, NULL };
        const char *ch[] = { "chown", "ableton:users", dir, NULL };
        H.run_command(mk);
        H.run_command(ch);
    }
}

static void t_header(FILE *f, uint32_t frames) {
    uint8_t h[44];
    uint32_t data = frames * 4, v;
#define P32(o, x) do { v = (x); h[o] = v; h[o+1] = v >> 8; h[o+2] = v >> 16; h[o+3] = v >> 24; } while (0)
#define P16(o, x) do { v = (x); h[o] = v; h[o+1] = v >> 8; } while (0)
    memcpy(h, "RIFF", 4);         P32(4, 36 + data);
    memcpy(h + 8, "WAVEfmt ", 8); P32(16, 16);
    P16(20, 1);                   P16(22, 2);
    P32(24, OT_RATE);             P32(28, OT_RATE * 4);
    P16(32, 4);                   P16(34, 16);
    memcpy(h + 36, "data", 4);    P32(40, data);
#undef P32
#undef P16
    fseek(f, 0, SEEK_SET);
    fwrite(h, 1, sizeof h, f);
}

/* The take starts: this block's slot output is its first. */
static int ex_capture_src(const char *path, uint32_t frames, int kind, int index) {
    if (T.on || T.file || !path || path[0] != '/' || !frames) return 0;
    if (index != J.take.slot || kind != J.take.kind) return 0;
    if (strlen(path) >= sizeof T.path) return 0;
    snprintf(T.path, sizeof T.path, "%s", path);
    t_mkdir_for(path);
    T.file = fopen(path, "wb");
    if (!T.file) { t_fail("the take's file would not open"); return 0; }
    t_header(T.file, 0);
    T.total = frames; T.written = 0; T.on = 1;
    __atomic_store_n(&J.total, frames, __ATOMIC_RELEASE);
    return 1;
}
/* The copy stopped its take early: a cancel, not a take. */
static void ex_capture_stop(void) { if (T.on) t_fail("the copy stopped its take"); }
static int ex_feed(int slot, const int16_t *lr, uint32_t frames) {
    uint32_t i;
    if (slot != J.take.slot || !lr) return 0;
    if (frames > OT_BLOCK) frames = OT_BLOCK;
    for (i = 0; i < frames * 2; i++) T.feed[i] += lr[i];
    T.fed = 1;
    return 1;
}
static int  ex_stems_start(int n, const int *s, const char *const *p, uint32_t f) {
    (void)n; (void)s; (void)p; (void)f; return 0;
}
static void ex_stems_limit(uint32_t f) { (void)f; }
static void ex_stems_stop(void) {}
static int  ex_stems_state(uint16_t *p, int c) { (void)p; (void)c; return MOVE_STEMS_IDLE; }
static int  ex_ot_begin(const struct move_offline_take *t) { (void)t; return MOVE_OFFLINE_ERR_BUSY; }
static int  ex_ot_state(uint32_t *d, uint32_t *t) { if (d) *d = 0; if (t) *t = 0; return MOVE_OFFLINE_IDLE; }
static void ex_ot_cancel(void) {}

static const move_host_ext_v1_t g_vext = {
    .size = sizeof(move_host_ext_v1_t),
    .set_slot_param = ex_set_slot_param,
    .set_tempo = ex_set_tempo,
    .midi_send_slot_direct = ex_send_direct,
    .set_move_info = ex_set_move_info,
    .midi_fx_offline_begin = ex_mfo_begin,
    .midi_fx_offline_poll = ex_mfo_poll,
    .midi_fx_offline_cancel = ex_mfo_cancel,
    .capture_start = ex_capture_mix,
    .capture_stop = ex_capture_stop,
    .capture_start_src = ex_capture_src,
    .slot_audio_feed = ex_feed,
    .stems_start = ex_stems_start,
    .stems_limit = ex_stems_limit,
    .stems_stop = ex_stems_stop,
    .stems_state = ex_stems_state,
    .offline_take_begin = ex_ot_begin,
    .offline_take_state = ex_ot_state,
    .offline_take_cancel = ex_ot_cancel,
};

/* the engine copy's host, and the module copies' (sends go nowhere, the
 * clock answers the copy's transport) */
static host_api_v1_t g_eng_host, g_mod_host;

static void hosts_build(void) {
    memset(&g_eng_host, 0, sizeof g_eng_host);
    g_eng_host.api_version = MOVE_PLUGIN_API_VERSION;
    g_eng_host.sample_rate = OT_RATE;
    g_eng_host.frames_per_block = OT_BLOCK;
    g_eng_host.log = H.host ? H.host->log : NULL;
    g_eng_host.midi_send_internal = eh_send_internal;
    g_eng_host.midi_send_internal_slot = eh_send_slot;
    g_eng_host.midi_send_external = eh_send_out;
    g_eng_host.midi_inject_to_move = eh_send_out;
    g_eng_host.clock_output_enabled = eh_clock_out;
    g_eng_host.get_bpm = eh_bpm;
    g_eng_host.get_beat_position = eh_beat;
    g_eng_host.get_clock_status = eh_clock;

    memset(&g_mod_host, 0, sizeof g_mod_host);
    if (H.host) memcpy(&g_mod_host, H.host, sizeof g_mod_host);
    g_mod_host.get_bpm = eh_bpm;
    g_mod_host.get_clock_status = eh_clock;
    g_mod_host.get_beat_position = eh_beat;
    g_mod_host.midi_send_internal = eh_send_out;
    g_mod_host.midi_send_external = eh_send_out;
    g_mod_host.midi_inject_to_move = eh_send_out;
    g_mod_host.midi_send_internal_slot = eh_send_slot_any;
    g_mod_host.slot_recv_channel = eh_recv_ch;
    g_mod_host.clock_output_enabled = eh_clock_out;
    g_mod_host.mod_emit_value = NULL;
    g_mod_host.mod_clear_source = NULL;
    g_mod_host.mod_host_ctx = NULL;
}

/* ---- the copies' code: each handle's init answered once ---- */
#define OT_APIS 24
static struct { void *h; void *api; } A[OT_APIS];
static int A_n;

static void *api_of(const char *so_path, const char *sym, const host_api_v1_t *host) {
    void *h = module_clone_open(so_path, OT_CACHE_DIR, ot_log, NULL);
    void *(*init)(const host_api_v1_t *);
    void *api;
    int i;
    if (!h) return NULL;
    for (i = 0; i < A_n; i++) if (A[i].h == h) return A[i].api;
    if (A_n >= OT_APIS) return NULL;
    *(void **)&init = dlsym(h, sym);
    api = init ? init(host) : NULL;
    if (!api) return NULL;
    /* the engine copy asks for the host extensions as the shim hands them over */
    if (host == &g_eng_host) {
        void (*ext)(const move_host_ext_v1_t *);
        *(void **)&ext = dlsym(h, OT_EXT_SYMBOL);
        if (ext) ext(&g_vext);
    }
    A[A_n].h = h; A[A_n].api = api; A_n++;
    return api;
}

static void apply_params(void (*set)(void *, const char *, const char *), void *inst,
                         const slc_param_t *p, int n, const char *state, int state_len) {
    int i;
    if (!set) return;
    for (i = 0; i < n; i++) set(inst, p[i].key, p[i].val);
    if (state_len > 0) set(inst, "state", state);
}

static void level(int16_t *b) {
    const float lvl = J.info.synth_level;
    int i;
    if (lvl == 1.0f) return;
    for (i = 0; i < OT_BLOCK * 2; i++) {
        int32_t v = (int32_t)lroundf((float)b[i] * lvl);
        b[i] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
    }
}

/* The caller's state, for its copy to load: a file of the take's own. */
static int write_state(void) {
    char tmp[sizeof OT_STATE_PATH + 8];
    FILE *f;
    int ok;
    mkdir(SCHWUNG_INSTALL_DIR "/cache", 0755);
    mkdir(OT_CACHE_DIR, 0755);
    snprintf(tmp, sizeof tmp, "%s.tmp", OT_STATE_PATH);
    f = fopen(tmp, "wb");
    if (!f) return 0;
    ok = fwrite(J.take.state, 1, J.take.state_len, f) == J.take.state_len;
    if (fclose(f) != 0) ok = 0;
    if (ok && rename(tmp, OT_STATE_PATH) != 0) ok = 0;
    if (!ok) unlink(tmp);
    return ok;
}

/* take->setup: one set_param per "key value" line. */
static void apply_setup(plugin_api_v2_t *eng, void *einst) {
    const char *p = J.take.setup;
    char line[512], *sp;
    while (p && *p) {
        const char *nl = strchr(p, '\n');
        size_t n = nl ? (size_t)(nl - p) : strlen(p);
        if (n > 0 && n < sizeof line) {
            memcpy(line, p, n); line[n] = '\0';
            sp = strchr(line, ' ');
            if (sp) { *sp = '\0'; eng->set_param(einst, line, sp + 1); }
        }
        p = nl ? nl + 1 : p + n;
    }
}

/* ---- one take, on whichever thread runs it ---- */
static void run_job(void) {
    plugin_api_v2_t *eng;
    void *einst = NULL;
    int16_t sbuf[OT_BLOCK * 2], ebuf[OT_BLOCK * 2];
    uint64_t played = 0;
    char msg[700];
    int i, ok = 0, cancelled = 0;
    struct timespec t0, t1;

    clock_gettime(CLOCK_MONOTONIC, &t0);
    memset(&T, 0, sizeof T);
    memset(T.held, 0xFF, sizeof T.held);
    g_tp.bpm = J.take.bpm > 0.0f ? J.take.bpm : 120.0f;
    g_tp.running = 0; g_tp.clocks = 0;
    hosts_build();

    eng = (plugin_api_v2_t *)api_of(J.engine_so, MOVE_PLUGIN_INIT_V2_SYMBOL, &g_eng_host);
    if (!eng || !eng->create_instance || !eng->render_block || !eng->set_param) { t_fail("no copy of the sequencer"); goto done; }
    /* no instrument (an Audio track's slot): the slot is silence plus the feed */
    if (J.src.so_path[0]) {
        T.sapi = (plugin_api_v2_t *)api_of(J.src.so_path, MOVE_PLUGIN_INIT_V2_SYMBOL, &g_mod_host);
        if (!T.sapi || !T.sapi->create_instance || !T.sapi->render_block) { t_fail("no copy of the instrument"); goto done; }
        T.sinst = T.sapi->create_instance(J.src.dir, J.src.config[0] ? J.src.config : NULL);
        if (!T.sinst) { t_fail("the instrument copy was not made"); goto done; }
        /* as a patch load: preset, the mod wheel down, then the settings */
        if (J.src.preset[0] && T.sapi->set_param) T.sapi->set_param(T.sinst, "preset", J.src.preset);
        if (T.sapi->on_midi)
            for (i = 0; i < 16; i++) {
                const uint8_t mw[3] = { (uint8_t)(0xB0 | i), 1, 0 };
                T.sapi->on_midi(T.sinst, mw, 3, MOVE_MIDI_SOURCE_HOST);
            }
        apply_params(T.sapi->set_param, T.sinst, J.src.params, J.src.nparams, J.src.state, J.src.state_len);
    }

    if (J.take.kind == MOVE_CAPTURE_SLOT_FX)
        for (i = 0; i < J.src.nfx; i++) {
            const slc_fx_src_t *f = &J.src.fx[i];
            audio_fx_api_v2_t *fa = (audio_fx_api_v2_t *)api_of(f->so_path, AUDIO_FX_INIT_V2_SYMBOL, &g_mod_host);
            void *fi;
            if (!fa || !fa->create_instance || !fa->process_block) { t_fail("no copy of an effect"); goto done; }
            fi = fa->create_instance(f->dir, NULL);
            if (!fi) { t_fail("an effect copy was not made"); goto done; }
            T.fapi[T.nfx] = fa; T.finst[T.nfx] = fi; T.fpos[T.nfx] = f->position; T.nfx++;
            apply_params(fa->set_param, fi, f->params, f->nparams, f->state, f->state_len);
        }

    if (!write_state()) { t_fail("the project snapshot was not written"); goto done; }
    einst = eng->create_instance(J.engine_dir, "{\"offline\":1}");
    if (!einst) { t_fail("the sequencer copy was not made"); goto done; }
    eng->set_param(einst, "offline_load", OT_STATE_PATH);
    apply_setup(eng, einst);
    eng->set_param(einst, J.take.key, J.take.val);

    for (;;) {
        if (__atomic_load_n(&J.cancel, __ATOMIC_ACQUIRE)) { cancelled = 1; break; }
        /* the slot renders what earlier blocks sent it */
        if (T.sinst) T.sapi->render_block(T.sinst, sbuf, OT_BLOCK);
        else memset(sbuf, 0, sizeof sbuf);
        if (T.fed) {
            for (i = 0; i < OT_BLOCK * 2; i++) {
                int32_t v = sbuf[i] + T.feed[i];
                sbuf[i] = (int16_t)(v > 32767 ? 32767 : v < -32768 ? -32768 : v);
            }
            memset(T.feed, 0, sizeof T.feed); T.fed = 0;
        }
        level(sbuf);
        for (i = 0; i < T.nfx; i++) T.fapi[i]->process_block(T.finst[i], sbuf, OT_BLOCK);
        /* the sequencer copy: its sends land now, its take may start */
        eng->render_block(einst, ebuf, OT_BLOCK);
        played += OT_BLOCK;
        if (T.failed) break;
        if (T.on) {
            uint32_t n = T.total - T.written;
            if (n > OT_BLOCK) n = OT_BLOCK;
            if (fwrite(sbuf, 4, n, T.file) != n) { t_fail("the disk refused the take"); break; }
            T.written += n;
            __atomic_store_n(&J.done, T.written, __ATOMIC_RELEASE);
            if (T.written >= T.total) { ok = 1; break; }
        } else if (played > OT_GUARD_FRAMES) {
            t_fail("the copy never started its take"); break;
        } else if ((played & 8191) == 0 && eng->get_param) {
            /* the copy refused the command, or cancelled it */
            char rs[16] = { 0 };
            int n = eng->get_param(einst, "resample_state", rs, (int)sizeof rs - 1);
            if (n > 0 && (atoi(rs) == 5 || atoi(rs) == 6)) { t_fail("the copy did not start its take"); break; }
        }
    }

done:
    if (einst && eng->destroy_instance) eng->destroy_instance(einst);
    for (i = 0; i < T.nfx; i++) if (T.fapi[i]->destroy_instance) T.fapi[i]->destroy_instance(T.finst[i]);
    if (T.sinst && T.sapi->destroy_instance) T.sapi->destroy_instance(T.sinst);
    if (T.file) {
        if (ok) t_header(T.file, T.written);
        fclose(T.file);
        T.file = NULL;
        if (!ok) unlink(T.path);
        else if (H.run_command) { const char *ch[] = { "chown", "ableton:users", T.path, NULL }; H.run_command(ch); }
    }
    clock_gettime(CLOCK_MONOTONIC, &t1);
    snprintf(msg, sizeof msg, "offline take: %s, %u of %u frames, %llu played, %.0f ms%s%s",
             ok ? "saved" : cancelled ? "cancelled" : "FAILED", T.written, T.total,
             (unsigned long long)played,
             (double)(t1.tv_sec - t0.tv_sec) * 1000.0 + (double)(t1.tv_nsec - t0.tv_nsec) / 1e6,
             T.failed ? " -- " : "", T.failed ? T.why : "");
    ot_log(msg);
    if (cancelled || __atomic_load_n(&J.cancel, __ATOMIC_ACQUIRE)) {
        __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
        st_set(OT_IDLE);
    } else {
        st_set(ok ? OT_DONE : OT_FAILED);
    }
}

int offline_take_run_pending(void) {
    int q = OT_QUEUED;
    if (!__atomic_compare_exchange_n(&J.state, &q, OT_RUNNING, 0, __ATOMIC_ACQ_REL, __ATOMIC_ACQUIRE))
        return 0;
    if (__atomic_load_n(&J.cancel, __ATOMIC_ACQUIRE)) {
        __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
        st_set(OT_IDLE);
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
        if (!offline_take_run_pending()) {
            struct timespec ts = { 0, 5 * 1000 * 1000 };
            nanosleep(&ts, NULL);
        }
    }
    return NULL;
}

void offline_take_configure(const offline_take_host_t *host) {
    if (host) H = *host;
}

void offline_take_start(const offline_take_host_t *host) {
    static int started;
    pthread_t tid;
    offline_take_configure(host);
    if (started) return;
    started = 1;
    if (shim_pthread_create(&tid, NULL, job_main, NULL) == 0) pthread_detach(tid);
}

void offline_take_set_engine(const char *so_path, const char *module_dir) {
    snprintf(g_engine_so, sizeof g_engine_so, "%s", so_path ? so_path : "");
    snprintf(g_engine_dir, sizeof g_engine_dir, "%s", module_dir ? module_dir : "");
    if (!g_engine_so[0]) offline_take_cancel();
}

/* ---- the caller's side ---- */
int offline_take_begin(const move_offline_take_t *take) {
    void *ci;
    int n;
    if (st_get() != OT_IDLE) return MOVE_OFFLINE_ERR_BUSY;
    if (!take || !take->state || !take->state_len || !take->key[0] ||
            (take->kind != MOVE_CAPTURE_SLOT_PRE && take->kind != MOVE_CAPTURE_SLOT_FX))
        return MOVE_OFFLINE_ERR_ARGS;
    if (!g_engine_so[0] || !H.slot_instance || !H.clone_source || !*H.clone_source || !H.slot_info)
        return MOVE_OFFLINE_ERR_NO_HOST;
    ci = H.slot_instance(take->slot);
    if (!ci || !H.slot_info(take->slot, &J.info)) return MOVE_OFFLINE_ERR_NO_HOST;
    n = (*H.clone_source)(ci, &J.src, take->kind == MOVE_CAPTURE_SLOT_FX);
    if (n < 0) return n;
    if (n == 0) return MOVE_OFFLINE_ERR_NO_SYNTH;
    J.take = *take;
    J.take.key[sizeof J.take.key - 1] = '\0';
    J.take.val[sizeof J.take.val - 1] = '\0';
    snprintf(J.engine_so, sizeof J.engine_so, "%s", g_engine_so);
    snprintf(J.engine_dir, sizeof J.engine_dir, "%s", g_engine_dir);
    __atomic_store_n(&J.done, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&J.total, 0, __ATOMIC_RELEASE);
    __atomic_store_n(&J.cancel, 0, __ATOMIC_RELEASE);
    st_set(OT_QUEUED);
    return 1;
}

int offline_take_state(uint32_t *done, uint32_t *total) {
    const int st = st_get();
    if (done)  *done  = __atomic_load_n(&J.done, __ATOMIC_ACQUIRE);
    if (total) *total = __atomic_load_n(&J.total, __ATOMIC_ACQUIRE);
    if (st == OT_QUEUED || st == OT_RUNNING) return MOVE_OFFLINE_RUNNING;
    if (st == OT_DONE)   return MOVE_OFFLINE_DONE;
    if (st == OT_FAILED) return MOVE_OFFLINE_FAILED;
    return MOVE_OFFLINE_IDLE;
}

void offline_take_cancel(void) {
    const int st = st_get();
    if (st == OT_DONE || st == OT_FAILED) { st_set(OT_IDLE); return; }
    if (st == OT_QUEUED || st == OT_RUNNING) __atomic_store_n(&J.cancel, 1, __ATOMIC_RELEASE);
}
