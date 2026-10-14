/*
 * What does `midi_fx_to_host` hand to the host — and what must it never?
 *
 * A slot's MIDI FX can GENERATE notes: from the clock (a step sequencer fires
 * on Start and on every 24-PPQN tick) or from its per-block tick. With the
 * slot's `midi_fx_to_host` on, those notes are also passed to the sink the
 * host registered (chain_set_midi_fx_sink), so a host-side sequencer can
 * record them.
 *
 * The line that matters is what does NOT cross:
 *   - the output of a NOTE the slot was sent. That is a transform of someone's
 *     playing; and a host-side sequencer plays its own clip into the slot, so
 *     handing that back would record what it already holds, again, every pass;
 *   - system realtime (with no FX loaded the transform copies the clock byte
 *     straight through — it would be "output");
 *   - anything at all while the flag is off, or with no sink;
 *   - and nothing here may reach Move (that is Pre mode, a different axis).
 *
 * Runs the real chain_midi.c against a generator plugin built by the wrapper.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "chain_internal.h"
#include "chain_fx_to_host.h"

/* ------------------------------------------------------------------ stubs */
/*
 * chain_midi.c pulls these in from chain_params.c / chain_json.c /
 * chain_mod.c / chain_host.c. None of them decide slot placement, so they are
 * stubbed to the cheapest thing that lets the loader run to completion.
 * parse_chain_params returning < 0 would make the loader roll back, so it must
 * succeed here — a rollback would look like "the slot is empty", which is the
 * exact failure this test is trying to distinguish.
 */
CHAIN_INTERNAL void v2_chain_log(chain_instance_t *inst, const char *msg) {
    (void)inst; (void)msg;
}
CHAIN_INTERNAL int parse_chain_params(const char *module_path,
                                      chain_param_info_t *params, int *count) {
    (void)module_path; (void)params;
    if (count) *count = 0;
    return 0;
}
CHAIN_INTERNAL int parse_ui_hierarchy_cache(const char *module_path, char *out, int out_len) {
    (void)module_path;
    if (out && out_len > 0) out[0] = '\0';
    return 0;
}
CHAIN_INTERNAL int json_get_int_in_section(const char *json, const char *section_key,
                                           const char *key, int *out) {
    (void)json; (void)section_key; (void)key; (void)out;
    return -1;
}
CHAIN_INTERNAL int json_get_flag_in_section(const char *json, const char *section_key,
                                            const char *key) {
    (void)json; (void)section_key; (void)key;
    return 0;
}
CHAIN_INTERNAL void chain_mod_clear_target_entries(chain_instance_t *inst,
                                                   const char *target, int restore_base) {
    (void)inst; (void)target; (void)restore_base;
}
CHAIN_INTERNAL chain_param_info_t *knob_find_param(chain_instance_t *inst,
                                                   const char *target, const char *param) {
    (void)inst; (void)target; (void)param;
    return NULL;
}
CHAIN_INTERNAL void knob_forward_value(chain_instance_t *inst, const char *target,
                                       const char *param, const char *val_str) {
    (void)inst; (void)target; (void)param; (void)val_str;
}

/* ------------------------------------------------------------------ harness */

#ifndef FIXTURE_DIR
#error "FIXTURE_DIR must be defined by the test wrapper"
#endif
static int failures = 0;
#define OK(cond, what) do { if (!(cond)) { fprintf(stderr, "FAIL: %s\n", what); failures++; } } while (0)

/* What the sink was handed. */
static struct { void *inst; uint8_t b[3]; int len; } got[64];
static int got_n;
static void sink(void *instance, const uint8_t *msg, int len) {
    if (got_n >= 64) return;
    got[got_n].inst = instance; got[got_n].len = len;
    memcpy(got[got_n].b, msg, (size_t)(len > 3 ? 3 : len));
    got_n++;
}
static int saw(uint8_t status, uint8_t d1) {
    int n = 0;
    for (int i = 0; i < got_n; i++) if (got[i].b[0] == status && got[i].b[1] == d1) n++;
    return n;
}

/* A stand-in synth: counts what reaches it. */
static int synth_heard;
static void fake_synth_on_midi(void *instance, const uint8_t *msg, int len, int source) {
    (void)instance; (void)msg; (void)len; (void)source; synth_heard++;
}

/* Nothing may be injected into Move by this feature. */
static int injected;
static int stub_inject(const uint8_t *msg, int len) { (void)msg; injected++; return len; }
static host_api_v1_t g_fake_host;

static chain_instance_t *fresh_instance(void) {
    chain_instance_t *inst = calloc(1, sizeof(*inst));
    if (!inst) { fprintf(stderr, "FAIL: out of memory\n"); exit(1); }
    chain_alloc_position_storage(inst);
    snprintf(inst->module_dir, sizeof(inst->module_dir), "%s/chain", FIXTURE_DIR);
    memset(&g_fake_host, 0, sizeof(g_fake_host));
    g_fake_host.midi_inject_to_move = stub_inject;
    inst->host = &g_fake_host;
    return inst;
}

static void clock_bytes(chain_instance_t *inst) {
    const uint8_t fa = 0xFA, f8 = 0xF8, fc = 0xFC;
    v2_on_midi(inst, &fa, 1, MOVE_MIDI_SOURCE_EXTERNAL);
    v2_on_midi(inst, &f8, 1, MOVE_MIDI_SOURCE_EXTERNAL);
    v2_on_midi(inst, &fc, 1, MOVE_MIDI_SOURCE_EXTERNAL);
}

int main(void) {
    /* ---- the pure rule ---- */
    {
        const uint8_t on[3] = { 0x93, 60, 100 }, pc[2] = { 0xC0, 5 }, f8[1] = { 0xF8 },
                      sx[3] = { 0xF0, 1, 2 }, cc[3] = { 0xB0, 7, 9 }, fe[1] = { 0xFE };
        OK(chain_fx_to_host_should_emit(1, on, 3), "a note-on crosses");
        OK(chain_fx_to_host_should_emit(1, cc, 3) && chain_fx_to_host_should_emit(1, pc, 2), "channel voice crosses, 2 or 3 bytes");
        OK(!chain_fx_to_host_should_emit(0, on, 3), "flag off: nothing crosses");
        OK(!chain_fx_to_host_should_emit(1, f8, 1), "realtime never crosses");
        OK(!chain_fx_to_host_should_emit(1, sx, 3), "system messages never cross");
        OK(!chain_fx_to_host_should_emit(1, NULL, 3) && !chain_fx_to_host_should_emit(1, on, 4), "NULL / over-long refused");
        OK(chain_fx_input_is_clock(f8, 1) && !chain_fx_input_is_clock(on, 3), "clock input vs note input");
        OK(!chain_fx_input_is_clock(fe, 1), "active sensing is not a clock a generator runs from");
    }

    chain_instance_t *inst = fresh_instance();
    OK(v2_load_midi_fx_slot(inst, 0, "gen") == 0, "setup: the generator loaded");
    OK(inst->midi_fx_count == 1, "setup: one MIDI FX");

    /* ---- flag OFF: the sink hears nothing, from any path ---- */
    chain_set_midi_fx_sink(sink);
    got_n = 0; injected = 0;
    clock_bytes(inst);
    v2_tick_midi_fx(inst, 128);
    OK(got_n == 0, "flag off: generated output reached the host");

    /* ---- flag ON ---- */
    inst->midi_fx_to_host = 1;
    got_n = 0;
    clock_bytes(inst);
    OK(saw(0x90, 36) == 1, "Start-driven note-on did not reach the host");
    OK(saw(0x90, 38) == 1 && saw(0x80, 38) == 1, "Clock-driven note-on / note-off did not reach the host");
    OK(saw(0x80, 36) == 1, "Stop-driven note-off did not reach the host (a held note would never close)");
    OK(got_n == 4, "something other than the four generated notes crossed (the clock bytes themselves?)");
    for (int i = 0; i < got_n; i++)
        OK(got[i].inst == (void *)inst && got[i].len == 3, "the sink was not handed the instance and a 3-byte message");

    got_n = 0;
    OK(v2_tick_midi_fx(inst, 128) == 0, "setup: no synth, so tick reports nothing delivered");
    OK(saw(0x90, 42) == 1 && got_n == 1, "tick output did not reach the host (and it must, with or without a synth)");

    /* ---- a NOTE the slot is sent: its output stays in the slot ---- */
    {
        const uint8_t on[3] = { 0x90, 60, 100 }, off[3] = { 0x80, 60, 0 };
        got_n = 0;
        v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
        v2_on_midi(inst, off, 3, MOVE_MIDI_SOURCE_INTERNAL);
        OK(got_n == 0, "the transform of a note the slot was SENT was handed to the host - a sequencer playing its own clip into the slot would record it again every pass");
    }

    /* ---- nothing reaches Move, and Pre mode is untouched ---- */
    OK(injected == 0, "midi_fx_to_host injected into Move");
    OK(inst->midi_fx_pre_mode == 0, "midi_fx_to_host switched Pre mode on");

    /* ---- midi_fx_host_route: the WHOLE output to the host, none to the synth.
     *      A host-side sequencer sends a track's notes into a slot whose synth
     *      is not that track's instrument, only to borrow the slot's MIDI FX. */
    {
        static plugin_api_v2_t fake_synth;
        memset(&fake_synth, 0, sizeof(fake_synth));
        fake_synth.on_midi = fake_synth_on_midi;
        inst->synth_plugin_v2 = &fake_synth;
        inst->synth_instance = (void *)&fake_synth;
        const uint8_t on[3] = { 0x90, 60, 100 }, off[3] = { 0x80, 60, 0 };

        /* control: route OFF, the synth plays the transform and the host hears none of it */
        inst->midi_fx_to_host = 0; inst->midi_fx_host_route = 0;
        got_n = 0; synth_heard = 0;
        v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
        OK(synth_heard == 2 && got_n == 0, "control: with the route off the synth plays the chord and the host hears nothing");

        inst->midi_fx_host_route = 1;
        got_n = 0; synth_heard = 0;
        v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
        v2_on_midi(inst, off, 3, MOVE_MIDI_SOURCE_INTERNAL);
        OK(saw(0x90, 60) == 1 && saw(0x90, 64) == 1, "route: the transform of a note sent did not reach the host (root + third)");
        OK(saw(0x80, 60) == 1 && saw(0x80, 64) == 1, "route: the note-offs did not follow (the track would hang notes)");
        OK(synth_heard == 0, "route: the slot's own synth played the notes as well");

        got_n = 0; synth_heard = 0;
        clock_bytes(inst);
        OK(saw(0x90, 36) == 1 && saw(0x90, 38) == 1 && saw(0x80, 36) == 1, "route: clock-generated notes did not reach the host");
        OK(got_n == 4, "route: something other than the generated notes crossed (a clock byte?)");
        OK(synth_heard == 0, "route: the synth played clock-generated notes");

        got_n = 0; synth_heard = 0;
        OK(v2_tick_midi_fx(inst, 128) == 0, "route: tick reported a delivery to the synth");
        OK(saw(0x90, 42) == 1 && got_n == 1 && synth_heard == 0, "route: tick output did not go to the host only");

        inst->midi_fx_pre_mode = 1; injected = 0; got_n = 0;
        v2_on_midi(inst, on, 3, MOVE_MIDI_SOURCE_INTERNAL);
        v2_tick_midi_fx(inst, 128);
        OK(injected == 0, "route: Pre mode still injected into Move — the host would play it a second time");
        OK(got_n == 3, "route: with Pre on, the host did not still get the whole output");
        inst->midi_fx_pre_mode = 0;

        inst->midi_fx_host_route = 0;
        inst->synth_plugin_v2 = NULL; inst->synth_instance = NULL;
    }

    /* ---- no sink registered: safe, and silent ---- */
    chain_set_midi_fx_sink(NULL);
    got_n = 0;
    clock_bytes(inst);
    v2_tick_midi_fx(inst, 128);
    OK(got_n == 0, "output arrived with no sink registered");
    chain_set_midi_fx_sink(sink);

    /* ---- with NO effect loaded the clock byte passes through the transform
     *      as "output": it must not cross ---- */
    inst->midi_fx_host_route = 1;
    v2_unload_midi_fx_slot(inst, 0);
    OK(inst->midi_fx_to_host == 0, "unloading the effect did not reset midi_fx_to_host");
    OK(inst->midi_fx_host_route == 0, "unloading the effect did not reset midi_fx_host_route");
    inst->midi_fx_to_host = 1;
    got_n = 0;
    clock_bytes(inst);
    OK(got_n == 0, "with no MIDI FX loaded, a pass-through clock byte was handed to the host");

    v2_unload_all_midi_fx(inst);
    free(inst);
    if (failures) return 1;
    printf("PASS: midi_fx_to_host hands generated (clock + tick) output to the host, and nothing else; midi_fx_host_route hands ALL of it, and none to the synth\n");
    return 0;
}
