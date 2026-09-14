/*
 * Host-side unit test for shadow_dirty_policy.h — WHICH autosave file a slot
 * parameter write dirties (slot_N.json = CHAIN, shadow_chain_config.json =
 * CONFIG).
 *
 * ⚠ The failure that matters is UNDER-marking: a key classed into the wrong
 * file is an edit the autosave never writes. So the assertions are grouped by
 * the direction each one guards, and the CONTROLS are the near-misses a lazy
 * classifier would get wrong while passing the obvious cases:
 *   - `slot:receive_channel` / `slot:forward_channel` live in BOTH files; a
 *     classifier that sent every `slot:` key to CONFIG would pass every other
 *     `slot:` assertion and stop rewriting the chain file on a channel change.
 *   - `overtake_dsp:t0_route` vs a chain key that merely CONTAINS "overtake"
 *     or "slot:" later in the string — prefixes, not substrings.
 *   - NULL / "" class BOTH, never 0.
 */
#include <stdio.h>
#include <string.h>
#include "shadow_dirty_policy.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

int main(void) {
    /* --- the slot-settings file ------------------------------------------ */
    static const char *config_keys[] = {
        "slot:volume", "slot:pan", "slot:muted", "slot:soloed", "slot:send_a",
        "slot:send_b", "slot:transpose", "slot:synth_volume", "slot:feedback_hold",
    };
    for (size_t i = 0; i < sizeof config_keys / sizeof *config_keys; i++) {
        char msg[96];
        snprintf(msg, sizeof msg, "%s dirties CONFIG only", config_keys[i]);
        OK(shadow_slot_key_dirty_class(config_keys[i]) == SHADOW_DIRTY_CONFIG, msg);
    }

    /* --- keys in BOTH files (control for "every slot: is CONFIG") -------- */
    OK(shadow_slot_key_dirty_class("slot:receive_channel") == SHADOW_DIRTY_BOTH,
       "slot:receive_channel dirties BOTH (also in slot_N.json)");
    OK(shadow_slot_key_dirty_class("slot:forward_channel") == SHADOW_DIRTY_BOTH,
       "slot:forward_channel dirties BOTH (also in slot_N.json)");
    OK(shadow_slot_key_dirty_class("slot:receive_channel_x") == SHADOW_DIRTY_CONFIG,
       "slot:receive_channel_x is an exact-match miss, CONFIG");

    /* --- the chain file -------------------------------------------------- */
    OK(shadow_slot_key_dirty_class("synth:cutoff") == SHADOW_DIRTY_CHAIN,   "synth:cutoff dirties CHAIN");
    OK(shadow_slot_key_dirty_class("synth:state") == SHADOW_DIRTY_CHAIN,    "synth:state dirties CHAIN");
    OK(shadow_slot_key_dirty_class("synth:module") == SHADOW_DIRTY_CHAIN,   "synth:module dirties CHAIN");
    OK(shadow_slot_key_dirty_class("fx1:bypassed") == SHADOW_DIRTY_CHAIN,   "fx1:bypassed dirties CHAIN");
    OK(shadow_slot_key_dirty_class("knob_1_set") == SHADOW_DIRTY_CHAIN,     "an unprefixed chain key dirties CHAIN");
    OK(shadow_slot_key_dirty_class("chain:") == SHADOW_DIRTY_CHAIN,         "the bulk marker chain: is non-zero");
    OK(shadow_slot_key_dirty_class("synth:slot:volume") == SHADOW_DIRTY_CHAIN,
       "a key CONTAINING slot: later is not a slot setting (prefix, not substring)");
    OK(shadow_slot_key_dirty_class("slot") == SHADOW_DIRTY_CHAIN,           "bare `slot` without the colon is not the prefix");

    /* --- the tool's own DSP ---------------------------------------------- */
    OK(shadow_slot_key_dirty_class("overtake_dsp:t0_route") == 0,  "overtake_dsp:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("overtake_dsp:state") == 0,     "overtake_dsp:state dirties nothing");
    OK(shadow_slot_key_dirty_class("overtake_dsp:") == 0,          "the overtake_dsp: bulk marker dirties nothing");
    OK(shadow_slot_key_dirty_class("synth:overtake_dsp:x") == SHADOW_DIRTY_CHAIN,
       "a key CONTAINING overtake_dsp: later still dirties CHAIN");

    /* --- the FX buses: addressed at slot 0, tracked by their own mask ---- */
    OK(shadow_slot_key_dirty_class("master_fx:volume") == 0,       "master_fx:<param> dirties nothing (bus mask owns it)");
    OK(shadow_slot_key_dirty_class("master_fx:fx1:bypassed") == 0, "master_fx:fx1:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("master_fx:") == 0,             "the master_fx: bulk marker dirties nothing");
    OK(shadow_slot_key_dirty_class("send_fx:a:return_level") == 0, "send_fx:a:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("send_fx:b:fx2:bypassed") == 0, "send_fx:b:fx2:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("send_fx:") == 0,                "the send_fx: bulk marker dirties nothing");
    OK(shadow_slot_key_dirty_class("move_fx:1:volume") == 0,       "move_fx:1:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("move_fx:16:fx4:bypassed") == 0,"move_fx:16:fx4:<param> dirties nothing");
    OK(shadow_slot_key_dirty_class("move_fx:") == 0,                "the move_fx: bulk marker dirties nothing");
    OK(shadow_slot_key_dirty_class("synth:master_fx:x") == SHADOW_DIRTY_CHAIN,
       "a key CONTAINING master_fx: later still dirties CHAIN");

    /* --- near-miss controls: prefix, not substring ------------------------ */
    OK(shadow_slot_key_dirty_class("master_fxx:volume") == SHADOW_DIRTY_CHAIN,
       "master_fxx: (no colon after fx) is not the master_fx: prefix, CHAIN");
    OK(shadow_slot_key_dirty_class("send_fxa:x") == SHADOW_DIRTY_CHAIN,
       "send_fxa: (missing the colon) is not the send_fx: prefix, CHAIN");
    OK(shadow_slot_key_dirty_class("move_fx") == SHADOW_DIRTY_CHAIN,
       "bare move_fx without the colon is not the prefix, CHAIN");
    OK(shadow_slot_key_dirty_class("move_fx1:volume") == SHADOW_DIRTY_CHAIN,
       "move_fx1: (missing the colon after move_fx) is not the prefix, CHAIN");

    /* --- unknown: never under-mark --------------------------------------- */
    OK(shadow_slot_key_dirty_class(NULL) == SHADOW_DIRTY_BOTH, "NULL dirties BOTH");
    OK(shadow_slot_key_dirty_class("") == SHADOW_DIRTY_BOTH,   "the empty key dirties BOTH");

    printf("test_dirty_policy: %d checks passed\n", checks);
    return 0;
}
