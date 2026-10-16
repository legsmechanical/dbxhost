/* tests/harness/stub_host.c */
#include "stub_host.h"
#include <string.h>

#define HX_CAP_MAX  8192
#define HX_LOG_MAX  65536

static hx_midi_event g_events[HX_CAP_MAX];
static int           g_event_count;
static char          g_log[HX_LOG_MAX];
static size_t        g_log_len;
static float         g_bpm = 120.0f;
static int           g_block;

static void push_event(hx_midi_kind kind, const uint8_t *msg, int len, int slot) {
    if (g_event_count >= HX_CAP_MAX) return;
    hx_midi_event *e = &g_events[g_event_count++];
    e->kind = kind;
    e->block = g_block;
    e->len = (len > 4) ? 4 : len;
    e->slot = slot;
    e->key[0] = '\0'; e->value[0] = '\0';
    memset(e->bytes, 0, sizeof(e->bytes));
    memcpy(e->bytes, msg, (size_t)e->len);
}

static void  stub_log(const char *m) {
    if (!m) return;
    size_t n = strlen(m);
    if (g_log_len + n + 1 >= HX_LOG_MAX) return;
    memcpy(g_log + g_log_len, m, n);
    g_log_len += n;
    g_log[g_log_len++] = '\n';
    g_log[g_log_len] = '\0';
}
static int   stub_internal(const uint8_t *m, int n) { push_event(HX_MIDI_INTERNAL, m, n, -1); return n; }
static int   stub_internal_slot(int slot, const uint8_t *m, int n) { push_event(HX_MIDI_INTERNAL, m, n, slot); return n; }
static int   stub_external(const uint8_t *m, int n) { push_event(HX_MIDI_EXTERNAL, m, n, -1); return n; }
static int   stub_inject(const uint8_t *m, int n)   { push_event(HX_MIDI_INJECT,   m, n, -1); return n; }
static float stub_get_bpm(void) { return g_bpm; }

static int g_ext_refuse;
static int stub_set_slot_param(int slot, const char *key, const char *value) {
    if (g_ext_refuse || !key || !value) return 0;
    if (g_event_count >= HX_CAP_MAX) return 1;
    hx_midi_event *e = &g_events[g_event_count++];
    memset(e, 0, sizeof(*e));
    e->kind = HX_PARAM_SET;
    e->block = g_block;
    e->slot = slot;
    strncpy(e->key, key, sizeof(e->key) - 1);
    strncpy(e->value, value, sizeof(e->value) - 1);
    return 1;
}
static float g_ext_tempo = -1.0f;
static int   g_ext_tempo_calls;
static void stub_set_tempo(float bpm) { g_ext_tempo = bpm; g_ext_tempo_calls++; }
static int stub_send_slot_direct(int slot, const uint8_t *m, int n) { push_event(HX_MIDI_DIRECT, m, n, slot); return n; }
float hx_stub_ext_tempo(void)       { return g_ext_tempo; }
int   hx_stub_ext_tempo_calls(void) { return g_ext_tempo_calls; }
static move_info_t g_ext_mi;
static int         g_ext_mi_calls, g_ext_mi_live;
static void stub_set_move_info(const void *info, size_t size) {
    g_ext_mi_calls++;
    g_ext_mi_live = info != NULL;
    memset(&g_ext_mi, 0, sizeof g_ext_mi);
    if (info) memcpy(&g_ext_mi, info, size < sizeof g_ext_mi ? size : sizeof g_ext_mi);
}
const move_info_t *hx_stub_move_info(void) { return g_ext_mi_live ? &g_ext_mi : NULL; }
int hx_stub_move_info_calls(void)          { return g_ext_mi_calls; }
/* The offline MIDI FX job (midi_fx_offline_*), synchronous: a stand-in
 * module that answers every note `up` semitones higher (and, with `third`,
 * a major third on top of that). begin stores the job; the next poll finishes
 * it — unless held (hx_stub_mfo_hold), which keeps it RUNNING. */
static int   g_mfo_state, g_mfo_up = 12, g_mfo_third, g_mfo_refuse, g_mfo_hold, g_mfo_fail;
static int   g_mfo_begins, g_mfo_cancels, g_mfo_in_n, g_mfo_slot;
static float g_mfo_bpm;
static uint32_t g_mfo_len, g_mfo_tail;
static move_midi_fx_offline_ev_t g_mfo_in[MOVE_MIDI_FX_OFFLINE_MAX_EV];
static int stub_mfo_begin(int slot, float bpm, uint32_t len, uint32_t tail,
                          const move_midi_fx_offline_ev_t *in, int n) {
    if (g_mfo_refuse || g_mfo_state != MOVE_MIDI_FX_OFFLINE_IDLE || n > MOVE_MIDI_FX_OFFLINE_MAX_EV) return 0;
    g_mfo_slot = slot; g_mfo_bpm = bpm; g_mfo_len = len; g_mfo_tail = tail; g_mfo_in_n = n;
    if (n) memcpy(g_mfo_in, in, (size_t)n * sizeof *in);
    g_mfo_state = MOVE_MIDI_FX_OFFLINE_QUEUED;
    g_mfo_begins++;
    return 1;
}
static int stub_mfo_poll(move_midi_fx_offline_ev_t *out, int cap, int *out_n, int take) {
    int st = g_mfo_state;
    if (out_n) *out_n = 0;
    if (st == MOVE_MIDI_FX_OFFLINE_QUEUED || st == MOVE_MIDI_FX_OFFLINE_RUNNING) {
        if (g_mfo_hold) { g_mfo_state = MOVE_MIDI_FX_OFFLINE_RUNNING; return g_mfo_state; }
        st = g_mfo_fail ? MOVE_MIDI_FX_OFFLINE_FAILED : MOVE_MIDI_FX_OFFLINE_DONE;
        g_mfo_state = st;
    }
    if (st == MOVE_MIDI_FX_OFFLINE_DONE) {
        int i, n = 0;
        for (i = 0; i < g_mfo_in_n && n + 2 <= cap; i++) {
            out[n] = g_mfo_in[i]; out[n].d1 = (uint8_t)(g_mfo_in[i].d1 + g_mfo_up); n++;
            if (g_mfo_third) { out[n] = g_mfo_in[i]; out[n].d1 = (uint8_t)(g_mfo_in[i].d1 + g_mfo_up + 4); n++; }
        }
        if (out_n) *out_n = n;
    } else if (st == MOVE_MIDI_FX_OFFLINE_FAILED && out_n) {
        *out_n = MOVE_MIDI_FX_OFFLINE_ERR_LOAD;
    }
    if (take && (st == MOVE_MIDI_FX_OFFLINE_DONE || st == MOVE_MIDI_FX_OFFLINE_FAILED)) g_mfo_state = MOVE_MIDI_FX_OFFLINE_IDLE;
    return st;
}
static void stub_mfo_cancel(void) { g_mfo_cancels++; g_mfo_state = MOVE_MIDI_FX_OFFLINE_IDLE; }
void hx_stub_mfo_module(int up, int third) { g_mfo_up = up; g_mfo_third = third; }
void hx_stub_mfo_refuse(int on) { g_mfo_refuse = on; }
void hx_stub_mfo_hold(int on)   { g_mfo_hold = on; }
void hx_stub_mfo_fail(int on)   { g_mfo_fail = on; }
int  hx_stub_mfo_begins(void)   { return g_mfo_begins; }
int  hx_stub_mfo_cancels(void)  { return g_mfo_cancels; }
int  hx_stub_mfo_state(void)    { return g_mfo_state; }
const move_midi_fx_offline_ev_t *hx_stub_mfo_input(int *n, int *slot, float *bpm, uint32_t *len, uint32_t *tail) {
    if (n) *n = g_mfo_in_n; if (slot) *slot = g_mfo_slot; if (bpm) *bpm = g_mfo_bpm;
    if (len) *len = g_mfo_len; if (tail) *tail = g_mfo_tail;
    return g_mfo_in;
}

const move_host_ext_v1_t *hx_stub_ext(void) {
    static const move_host_ext_v1_t ext = {
        .size = sizeof(move_host_ext_v1_t),
        .set_slot_param = stub_set_slot_param,
        .set_tempo = stub_set_tempo,
        .midi_send_slot_direct = stub_send_slot_direct,
        .set_move_info = stub_set_move_info,
        .midi_fx_offline_begin = stub_mfo_begin,
        .midi_fx_offline_poll = stub_mfo_poll,
        .midi_fx_offline_cancel = stub_mfo_cancel,
    };
    return &ext;
}
void hx_stub_ext_refuse(int on) { g_ext_refuse = on; }

host_api_v1_t *hx_stub_host(void) {
    static host_api_v1_t host;
    memset(&host, 0, sizeof(host));
    host.api_version        = MOVE_PLUGIN_API_VERSION_2;
    host.sample_rate        = MOVE_SAMPLE_RATE;
    host.frames_per_block   = MOVE_FRAMES_PER_BLOCK;
    host.log                = stub_log;
    host.midi_send_internal = stub_internal;
    host.midi_send_internal_slot = stub_internal_slot;
    host.midi_send_external = stub_external;
    host.midi_inject_to_move = stub_inject;
    host.get_bpm            = stub_get_bpm;
    return &host;
}

void                 hx_stub_reset_capture(void) { g_event_count = 0; g_block = 0; g_log_len = 0; g_log[0] = '\0'; }
void                 hx_stub_next_block(void)    { g_block++; }
int                  hx_stub_event_count(void)   { return g_event_count; }
const hx_midi_event *hx_stub_event(int i)        { return (i >= 0 && i < g_event_count) ? &g_events[i] : NULL; }
int                  hx_stub_count_kind(hx_midi_kind k) {
    int c = 0; for (int i = 0; i < g_event_count; i++) if (g_events[i].kind == k) c++; return c;
}
void                 hx_stub_set_bpm(float bpm)  { g_bpm = bpm; }
const char          *hx_stub_log_text(void)      { return g_log; }
