/* tests/harness/stub_host.h — stub host + capture API. */
#ifndef HX_STUB_HOST_H
#define HX_STUB_HOST_H

#include <stdint.h>
#include "host/plugin_api_v1.h"
#define MOVE_INFO_NO_READER
#include "host/move_info.h"

typedef enum {
    HX_MIDI_INTERNAL = 0,
    HX_MIDI_EXTERNAL = 1,
    HX_MIDI_INJECT   = 2,
    HX_PARAM_SET     = 3,   /* the host extension's set_slot_param — in the
                               SAME ordered list as the MIDI, which is the
                               point: order between a value and a note */
    HX_MIDI_DIRECT   = 4    /* the extension's midi_send_slot_direct: to a slot's
                               instrument, past its MIDI FX (`slot` set) */
} hx_midi_kind;

typedef struct {
    hx_midi_kind kind;
    uint8_t bytes[4];   /* USB-MIDI packet [cable|CIN, status, d1, d2] */
    int len;
    int slot;           /* HX_MIDI_INTERNAL: addressed chain slot (slot-addressed
                           send), or -1 for the legacy channel-matched send;
                           HX_PARAM_SET: the slot written */
    char key[64];       /* HX_PARAM_SET only */
    char value[32];     /* HX_PARAM_SET only */
    int block;          /* the render block this was emitted in (hx_render counts
                           them; an event sent outside a render carries the
                           count so far). The capture's only clock: one block
                           is the engine's emission granularity, so a timing
                           change of a block or more shows here and nowhere
                           else. */
} hx_midi_event;

/* Returns a configured, process-global host (sample_rate, log, all MIDI
 * sends, get_bpm wired to capture/config). */
host_api_v1_t *hx_stub_host(void);

/* Capture control + queries (ordered across all three MIDI channels). */
void                  hx_stub_reset_capture(void);
/* The block clock behind hx_midi_event.block: hx_render bumps it before each
 * render_block; reset to 0 with the capture. */
void                  hx_stub_next_block(void);
int                   hx_stub_event_count(void);
const hx_midi_event  *hx_stub_event(int i);      /* NULL if out of range */
int                   hx_stub_count_kind(hx_midi_kind k);

/* The host extension (move_host_ext_v1_t): hx_create hands it to the module
 * the way the host does after create_instance. set_slot_param records an
 * HX_PARAM_SET event; hx_stub_ext_refuse(1) makes it return 0 and record
 * nothing, as a host that refused the key would. */
const move_host_ext_v1_t *hx_stub_ext(void);
/* set_tempo: the last tempo the module declared (-1 = never), and how often. */
float hx_stub_ext_tempo(void);
int   hx_stub_ext_tempo_calls(void);
void                      hx_stub_ext_refuse(int on);
/* The offline MIDI FX job stand-in (midi_fx_offline_*): a module that answers
 * every note `up` higher (+ a major third with `third`); refuse / hold
 * (stays RUNNING) / fail; what the last begin was given. */
void hx_stub_mfo_module(int up, int third);
void hx_stub_mfo_refuse(int on);
void hx_stub_mfo_hold(int on);
void hx_stub_mfo_fail(int on);
int  hx_stub_mfo_begins(void);
int  hx_stub_mfo_cancels(void);
int  hx_stub_mfo_state(void);
const move_midi_fx_offline_ev_t *hx_stub_mfo_input(int *n, int *slot, float *bpm, uint32_t *len, uint32_t *tail);
/* The module take (capture_start / capture_stop): refuse (as a busy sampler
 * would); how many starts, and what the last was given — the block it was
 * called in (hx_midi_event.block's clock), its frames and path. */
void hx_stub_capture_reset(void);
void hx_stub_capture_refuse(int on);
int  hx_stub_capture(int *stops, int *block, uint32_t *frames, const char **path);
/* capture_start_src: the last take's source (MOVE_CAPTURE_MIX for capture_start). */
int  hx_stub_capture_src(int *kind, int *index);
/* set_move_info: what the module last published (NULL = never, or withdrawn),
 * and how many times it called. */
const move_info_t *hx_stub_move_info(void);
int                hx_stub_move_info_calls(void);

/* Config + introspection. */
void        hx_stub_set_bpm(float bpm);
const char *hx_stub_log_text(void);              /* accumulated seq8_ilog output */

#endif /* HX_STUB_HOST_H */
