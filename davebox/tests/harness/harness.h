/* tests/harness/harness.h — white-box test API for the davebox DSP.
 * Each test_*.c that includes this gets its own copy of the seq8.c TU and
 * thus full access to its instance struct and static functions. */
#ifndef HX_HARNESS_H
#define HX_HARNESS_H

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "compat.h"          /* fmemopen decl BEFORE seq8.c uses it */
#include "stub_host.h"
#include "../../dsp/seq8.c"  /* white-box: defines move_plugin_init_v2 + statics */

typedef struct {
    plugin_api_v2_t *api;
    void *inst;             /* cast to the davebox instance type for white-box reads */
} hx_t;

#define HX_ASSERT(cond, msg) do { \
    if (!(cond)) { fprintf(stderr, "FAIL: %s (%s:%d)\n", (msg), __FILE__, __LINE__); exit(1); } \
} while (0)

/* create_instance EXACTLY as the host calls it: no identity, no state path,
 * awaiting_select armed. Use this only to assert what a fresh instance IS —
 * every other test wants hx_create() below, because an instance in that state
 * refuses every save and a test that saves would pin nothing. */
static inline hx_t *hx_create_raw(const char *json_defaults) {
    static hx_t h;
    host_api_v1_t *host = hx_stub_host();
    h.api = move_plugin_init_v2(host);
    if (!h.api) return NULL;
    hx_stub_reset_capture();
    hx_stub_set_bpm(120.0f);   /* fresh instance => default tempo (capture clears are independent) */
    h.inst = h.api->create_instance(".", json_defaults);
    return h.inst ? &h : NULL;
}

/* A LIVE instance — what every test that is not about identity means by "an
 * instance". The DSP no longer resolves a project for itself, so on device it
 * sits at defaults and refuses to save until JS sends `state_load <uuid>`;
 * lifting awaiting_select here stands in for that load without dragging a real
 * Sets/<uuid>/ tree into every unrelated test. The path is still whatever the
 * test names, exactly as before. */
static inline hx_t *hx_create(const char *json_defaults) {
    hx_t *h = hx_create_raw(json_defaults);
    if (h) ((seq8_instance_t *)h->inst)->awaiting_select = 0;
    return h;
}
static inline void hx_destroy(hx_t *h) {
    if (h && h->api && h->inst) h->api->destroy_instance(h->inst);
}

static inline void hx_send_midi(hx_t *h, const uint8_t *msg, int len, int source) {
    h->api->on_midi(h->inst, msg, len, source);
}
static inline void hx_set_param(hx_t *h, const char *key, const char *val) {
    h->api->set_param(h->inst, key, val);
}
static inline int hx_get_param(hx_t *h, const char *key, char *buf, int len) {
    return h->api->get_param(h->inst, key, buf, len);
}

/* Last rendered audio block, retained for assertion. davebox renders silence,
 * so this is plumbing-only here — present so the harness can be lifted to an
 * audio module (osirus/jv880/obxd) without restructuring (see spec, reuse). */
static int16_t hx_last_block[MOVE_FRAMES_PER_BLOCK * 2];

static inline void hx_render(hx_t *h, int n_blocks) {
    for (int i = 0; i < n_blocks; i++)
        h->api->render_block(h->inst, hx_last_block, MOVE_FRAMES_PER_BLOCK);
}
/* Pointer to the most recently rendered stereo-interleaved block
 * ([L0,R0,...,L127,R127]); valid after at least one hx_render(). */
static inline const int16_t *hx_last_audio(void) { return hx_last_block; }

static inline void hx_set_bpm(hx_t *h, float bpm) { (void)h; hx_stub_set_bpm(bpm); }

/* Capture helpers. */
static inline void hx_clear_capture(hx_t *h) { (void)h; hx_stub_reset_capture(); }
static inline int  hx_count_midi(hx_t *h, hx_midi_kind k) { (void)h; return hx_stub_count_kind(k); }

static inline void hx_dump_midi(hx_t *h) {
    (void)h;
    int n = hx_stub_event_count();
    fprintf(stderr, "--- MIDI capture (%d events) ---\n", n);
    for (int i = 0; i < n; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        fprintf(stderr, "[%d] kind=%d  %02x %02x %02x %02x\n",
                i, e->kind, e->bytes[0], e->bytes[1], e->bytes[2], e->bytes[3]);
    }
}

/* True if any captured packet is a note-on (status 0x9n, velocity>0) on the
 * given channel (0-15) and note number. */
static inline int hx_seen_note_on(hx_t *h, int ch, int note) {
    (void)h;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && (e->bytes[1] & 0x0F) == ch
            && e->bytes[2] == (uint8_t)note && e->bytes[3] > 0)
            return 1;
    }
    return 0;
}

#endif /* HX_HARNESS_H */
