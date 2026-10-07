/* tests/harness/stub_host.h — stub host + capture API. */
#ifndef HX_STUB_HOST_H
#define HX_STUB_HOST_H

#include <stdint.h>
#include "host/plugin_api_v1.h"

typedef enum {
    HX_MIDI_INTERNAL = 0,
    HX_MIDI_EXTERNAL = 1,
    HX_MIDI_INJECT   = 2,
    HX_PARAM_SET     = 3    /* the host extension's set_slot_param — in the
                               SAME ordered list as the MIDI, which is the
                               point: order between a value and a note */
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
} hx_midi_event;

/* Returns a configured, process-global host (sample_rate, log, all MIDI
 * sends, get_bpm wired to capture/config). */
host_api_v1_t *hx_stub_host(void);

/* Capture control + queries (ordered across all three MIDI channels). */
void                  hx_stub_reset_capture(void);
int                   hx_stub_event_count(void);
const hx_midi_event  *hx_stub_event(int i);      /* NULL if out of range */
int                   hx_stub_count_kind(hx_midi_kind k);

/* The host extension (move_host_ext_v1_t): hx_create hands it to the module
 * the way the host does after create_instance. set_slot_param records an
 * HX_PARAM_SET event; hx_stub_ext_refuse(1) makes it return 0 and record
 * nothing, as a host that refused the key would. */
const move_host_ext_v1_t *hx_stub_ext(void);
void                      hx_stub_ext_refuse(int on);

/* Config + introspection. */
void        hx_stub_set_bpm(float bpm);
const char *hx_stub_log_text(void);              /* accumulated seq8_ilog output */

#endif /* HX_STUB_HOST_H */
