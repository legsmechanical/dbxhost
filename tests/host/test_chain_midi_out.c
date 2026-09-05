/*
 * test_chain_midi_out.c — the chain's `midi_out` sink (item 15, 2026-09-05).
 *
 * Runs the REAL v2_on_midi out of chain_midi.c against a fake synth and a
 * fake host: where does the post-MIDI-FX stream go?
 *   synth    (default) — the synth hears it, the port hears nothing
 *   external           — the port gets USB-MIDI packets (cable 2), synth silent
 *   both               — both
 * and the channel nibble is rewritten on the way out when midi_out_channel
 * says so; realtime bytes (clock/start/stop) are forwarded too.
 * No MIDI FX loaded: v2_process_midi_fx passes the message through.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "chain_internal.h"

/* --- the symbols chain_midi.c reaches that live elsewhere ------------- */
CHAIN_INTERNAL void v2_chain_log(chain_instance_t *inst, const char *msg) { (void)inst; (void)msg; }
CHAIN_INTERNAL int parse_chain_params(const char *module_path, chain_param_info_t *params, int *count) {
    (void)module_path; (void)params; if (count) *count = 0; return 0;
}
CHAIN_INTERNAL int parse_ui_hierarchy_cache(const char *module_path, char *out, int out_len) {
    (void)module_path; if (out && out_len > 0) out[0] = '\0'; return 0;
}
CHAIN_INTERNAL int json_get_int_in_section(const char *json, const char *section_key, const char *key, int *out) {
    (void)json; (void)section_key; (void)key; (void)out; return -1;
}
CHAIN_INTERNAL void chain_mod_clear_target_entries(chain_instance_t *inst, const char *target, int restore_base) {
    (void)inst; (void)target; (void)restore_base;
}
CHAIN_INTERNAL chain_param_info_t *knob_find_param(chain_instance_t *inst, const char *target, const char *param) {
    (void)inst; (void)target; (void)param; return NULL;
}
CHAIN_INTERNAL void knob_forward_value(chain_instance_t *inst, const char *target, const char *param, const char *val_str) {
    (void)inst; (void)target; (void)param; (void)val_str;
}

/* --- captures ---------------------------------------------------------- */
static uint8_t synth_msgs[32][3]; static int synth_n;
static uint8_t port_pkts[32][4];  static int port_n;

static void fake_synth_on_midi(void *instance, const uint8_t *msg, int len, int source) {
    (void)instance; (void)source;
    if (synth_n < 32) { memset(synth_msgs[synth_n], 0, 3); memcpy(synth_msgs[synth_n], msg, len > 3 ? 3 : len); synth_n++; }
}
static int fake_send_external(const uint8_t *msg, int len) {
    if (len == 4 && port_n < 32) memcpy(port_pkts[port_n++], msg, 4);
    return len;
}

static int failures = 0;
#define OK(cond, what) do { if (cond) printf("  ok   %s\n", what); else { printf("  FAIL %s\n", what); failures++; } } while (0)

static void reset(void) { synth_n = 0; port_n = 0; }

int main(void) {
    chain_instance_t *inst = calloc(1, sizeof(*inst));
    plugin_api_v2_t synth; memset(&synth, 0, sizeof synth); synth.on_midi = fake_synth_on_midi;
    host_api_v1_t host; memset(&host, 0, sizeof host); host.midi_send_external = fake_send_external;
    int synth_token = 1;
    inst->synth_plugin_v2 = &synth; inst->synth_instance = &synth_token; inst->host = &host;
    inst->midi_out_channel = -1;

    const uint8_t on[3] = { 0x94, 60, 100 };   /* channel 5 (0x4) */

    /* synth (default) */
    reset(); v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    OK(synth_n == 1 && synth_msgs[0][0] == 0x94 && synth_msgs[0][1] == 60, "default: the synth hears the note");
    OK(port_n == 0, "default: the port hears nothing");

    /* external */
    inst->midi_out = CHAIN_MIDI_OUT_EXTERNAL;
    reset(); v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    OK(synth_n == 0, "external: the synth is silent");
    OK(port_n == 1 && port_pkts[0][0] == 0x29 && port_pkts[0][1] == 0x94 && port_pkts[0][2] == 60 && port_pkts[0][3] == 100,
       "external: the port gets a cable-2 USB-MIDI packet (CIN 9 = note on), channel as-is");

    /* channel rewrite */
    inst->midi_out_channel = 2;
    reset(); v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    OK(port_n == 1 && port_pkts[0][1] == 0x92, "external + midi_out_channel 2: the status carries channel 3 on the wire");
    inst->midi_out_channel = -1;

    /* both */
    inst->midi_out = CHAIN_MIDI_OUT_BOTH;
    reset(); v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    OK(synth_n == 1 && port_n == 1, "both: synth and port");

    /* realtime bytes when external */
    inst->midi_out = CHAIN_MIDI_OUT_EXTERNAL;
    const uint8_t clk[1] = { 0xF8 }, start[1] = { 0xFA }, stop[1] = { 0xFC };
    reset(); v2_on_midi(inst, clk, 1, MOVE_MIDI_SOURCE_INTERNAL); v2_on_midi(inst, start, 1, MOVE_MIDI_SOURCE_INTERNAL); v2_on_midi(inst, stop, 1, MOVE_MIDI_SOURCE_INTERNAL);
    OK(port_n == 3 && port_pkts[0][0] == 0x2F && port_pkts[0][1] == 0xF8 && port_pkts[1][1] == 0xFA && port_pkts[2][1] == 0xFC,
       "external: clock, start and stop reach the port as single-byte packets (CIN F)");
    inst->midi_out_channel = 5;
    reset(); v2_on_midi(inst, clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
    OK(port_n == 1 && port_pkts[0][1] == 0xF8, "a realtime byte is never channel-rewritten");

    /* no host ring: external keeps the stream rather than crashing; synth still silent by law */
    inst->host = NULL; inst->midi_out = CHAIN_MIDI_OUT_EXTERNAL;
    reset(); v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
    OK(port_n == 0 && synth_n == 0, "no host ring: nothing sent, nothing crashes");

    free(inst);
    if (failures) { printf("FAIL: test_chain_midi_out (%d)\n", failures); return 1; }
    printf("PASS: test_chain_midi_out\n");
    return 0;
}
