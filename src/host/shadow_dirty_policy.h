/*
 * shadow_dirty_policy.h — WHICH autosave file a slot parameter write dirties.
 *
 * A slot's persisted state lives in two files with very different save costs:
 *
 *   slot_N.json                the CHAIN: module ids, `<comp>:state` blobs,
 *                              bypass, knob mappings, LFOs, buses — one slot's
 *                              worth, written per slot.
 *   shadow_chain_config.json   the SLOT SETTINGS (volume, pan, channels,
 *                              mute/solo, sends, transpose, synth volume) —
 *                              ONE file covering all eight slots.
 *
 * The autosave used to write both for every dirty slot, so a mixer gesture
 * across four slots re-read and re-wrote the whole eight-slot config four
 * times, and a synth knob paid for a config it never touched. Classifying the
 * key at the mark site lets the consumer write only the file that changed.
 *
 * Pure: no SHM, no globals, no allocation. Unit-tested standalone by
 * tests/host/test_dirty_policy.c.
 *
 * ⚠ UNDER-MARKING LOSES AN EDIT; OVER-MARKING COSTS ONE REDUNDANT SAVE. Every
 * doubtful case therefore classes BOTH: NULL, the empty key, and the two
 * `slot:` keys that are ALSO written into slot_N.json (buildSlotPatchJson reads
 * slot:receive_channel and slot:forward_channel). A `slot:` key that gains a
 * slot_N.json field must be added to that list, or a chain file stops being
 * rewritten when it changes.
 */
#ifndef SHADOW_DIRTY_POLICY_H
#define SHADOW_DIRTY_POLICY_H

#include <string.h>

#define SHADOW_DIRTY_CHAIN   0x1u   /* slot_N.json */
#define SHADOW_DIRTY_CONFIG  0x2u   /* shadow_chain_config.json */
#define SHADOW_DIRTY_BOTH    (SHADOW_DIRTY_CHAIN | SHADOW_DIRTY_CONFIG)

/* shadow_slot_key_dirty_class — the SHADOW_DIRTY_* bits a SET of `key` on a
 * chain slot dirties.
 *
 *   "overtake_dsp:*"            0. The overtake DSP is the tool's own
 *                               instrument, persisted by the tool; its keys
 *                               are addressed at slot 0 only because the
 *                               mailbox needs a slot.
 *   "slot:receive_channel",     BOTH — in the config AND in slot_N.json.
 *   "slot:forward_channel"
 *   "slot:*" (any other)        CONFIG.
 *   anything else               CHAIN (module/FX params, :state, bypass...).
 *   NULL, ""                    BOTH — unknown, so never under-mark.
 */
static inline unsigned shadow_slot_key_dirty_class(const char *key)
{
    if (!key || !key[0]) return SHADOW_DIRTY_BOTH;
    if (strncmp(key, "overtake_dsp:", 13) == 0) return 0;
    if (strncmp(key, "slot:", 5) == 0) {
        if (strcmp(key + 5, "receive_channel") == 0 ||
            strcmp(key + 5, "forward_channel") == 0)
            return SHADOW_DIRTY_BOTH;
        return SHADOW_DIRTY_CONFIG;
    }
    return SHADOW_DIRTY_CHAIN;
}

#endif /* SHADOW_DIRTY_POLICY_H */
