/*
 * A STATE READ SAVES THE KNOB, and A STATE WRITE IS THE NEW KNOB
 * (from upstream #572; re-implemented here, see chain_mod.c).
 *
 * A module serialises what it holds, and a parameter an LFO is driving holds
 * the LFO's swing. Every save path reads "<comp>:state" — the slot autosave, a
 * snapshot, a User Preset — so the save recorded wherever the LFO happened to
 * be as the knob, and a reload brought that back as the knob.
 *
 * And the other way round: a state/preset write replaces every knob at once,
 * but the modulation bus kept the base it captured BEFORE, and wrote that old
 * value back on its next tick.
 *
 * Runs the real chain_mod.c against a fake synth whose "state" is its cutoff.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "chain_internal.h"

void chain_log(const char *msg) { (void)msg; }
void parse_debug_log(const char *msg) { (void)msg; }
void v2_chain_log(chain_instance_t *inst, const char *msg) { (void)inst; (void)msg; }
void v2_synth_panic(chain_instance_t *inst) { (void)inst; }
int v2_load_synth(chain_instance_t *inst, const char *m) { (void)inst; (void)m; return 0; }
void v2_unload_synth(chain_instance_t *inst) { (void)inst; }
int v2_load_audio_fx(chain_instance_t *inst, const char *m) { (void)inst; (void)m; return 0; }
void v2_unload_all_audio_fx(chain_instance_t *inst) { inst->fx_count = 0; }
int v2_load_midi_fx(chain_instance_t *inst, const char *m) { (void)inst; (void)m; return 0; }
void v2_unload_all_midi_fx(chain_instance_t *inst) { inst->midi_fx_count = 0; }

static char fake_cutoff[64] = "10";
static char fake_gain[64]   = "20";

static void fake_set_param(void *instance, const char *key, const char *val) {
    (void)instance;
    if (strcmp(key, "cutoff") == 0) snprintf(fake_cutoff, sizeof(fake_cutoff), "%s", val);
    else if (strcmp(key, "gain") == 0) snprintf(fake_gain, sizeof(fake_gain), "%s", val);
    else if (strcmp(key, "state") == 0) snprintf(fake_cutoff, sizeof(fake_cutoff), "%s", val);   /* a blob of one knob */
}
static int fake_get_param(void *instance, const char *key, char *buf, int buf_len) {
    (void)instance;
    if (strcmp(key, "cutoff") == 0 || strcmp(key, "state") == 0) return snprintf(buf, buf_len, "%s", fake_cutoff);
    if (strcmp(key, "gain") == 0) return snprintf(buf, buf_len, "%s", fake_gain);
    return -1;
}

static int failures = 0;
static void check(int cond, const char *what) {
    if (cond) printf("  ok  %s\n", what);
    else { printf("FAIL: %s\n", what); failures++; }
}
static void add_param(chain_instance_t *inst, int i, const char *key) {
    chain_param_info_t *p = &inst->synth_params[i];
    snprintf(p->key, sizeof(p->key), "%s", key);
    snprintf(p->name, sizeof(p->name), "%s", key);
    p->type = KNOB_TYPE_FLOAT;
    p->min_val = 0.0f; p->max_val = 127.0f; p->default_val = 0.0f;
    inst->synth_param_count = i + 1;
}
/* What v2_get_param does around the route (chain_host.c). */
static void read_state(chain_instance_t *inst, const char *key, char *out, int cap) {
    char target[16];
    const int swapped = chain_mod_state_read_begin(inst, key, target);
    const char *sub = strchr(key, ':');
    fake_get_param(NULL, sub ? sub + 1 : key, out, cap);
    if (swapped) chain_mod_state_swap_out(inst, target);
}

int main(void) {
    chain_instance_t *inst = calloc(1, sizeof(*inst));
    chain_alloc_position_storage(inst);
    static plugin_api_v2_t fake_api;
    fake_api.api_version = 2;
    fake_api.set_param = fake_set_param;
    fake_api.get_param = fake_get_param;
    inst->synth_plugin_v2 = &fake_api;
    inst->synth_instance = (void *)0x1;
    add_param(inst, 0, "cutoff");
    add_param(inst, 1, "gain");
    char buf[64];

    /* control: nothing modulated, a state read is just the read */
    read_state(inst, "synth:state", buf, sizeof(buf));
    check(atof(buf) == 10.0, "control: an unmodulated state read is the module's own value");

    /* An LFO on cutoff: base 10, contribution 0.5 * (0.5 * 127) = 31.75. */
    chain_mod_emit_value(inst, "lfo1", "synth", "cutoff", 0.5f, 1.0f, 0.0f, 1, 1);
    check(atof(fake_cutoff) == 10.0 + 31.75, "rig: the module holds base + modulation");

    read_state(inst, "synth:state", buf, sizeof(buf));
    check(atof(buf) == 10.0, "a state read while the LFO runs saves the KNOB (10), not the swing (41.75)");
    check(atof(fake_cutoff) == 10.0 + 31.75, "and the modulation is back on the module after the read");

    /* a key that is not a state read does not swap anything */
    read_state(inst, "synth:cutoff", buf, sizeof(buf));
    check(atof(buf) == 10.0 + 31.75, "control: a plain param read is not swapped");
    char tgt[16];
    check(chain_mod_state_read_begin(inst, "fx1:state", tgt) == 0, "a state read of ANOTHER component swaps nothing");
    check(atof(fake_cutoff) == 10.0 + 31.75, "...and leaves this one alone");

    /* A BULK WRITE: the module is handed a new state (cutoff 80). */
    fake_set_param(NULL, "state", "80");
    chain_mod_after_set_param(inst, "synth:state");
    mod_target_state_t *e = chain_mod_find_target_entry(inst, "synth", "cutoff");
    check(e != NULL && e->base_value == 80.0f, "a state write re-captures the base from the module (80)");
    check(atof(fake_cutoff) == 80.0 + 31.75, "and the modulation sits on top of the NEW knob");
    chain_mod_apply_effective_value(inst, e, 1);                 /* the LFO's next tick */
    check(atof(fake_cutoff) == 80.0 + 31.75, "the next tick does not write the old knob back");
    read_state(inst, "synth:state", buf, sizeof(buf));
    check(atof(buf) == 80.0, "and the next save records the loaded value");

    /* an ordinary single-param write is not a bulk write */
    fake_set_param(NULL, "gain", "55");
    chain_mod_after_set_param(inst, "synth:gain");
    check(e->base_value == 80.0f, "control: a single-param write rebases nothing");

    free(inst);
    if (failures) { printf("\n%d check(s) failed\n", failures); return 1; }
    printf("\nall checks passed\n");
    return 0;
}
