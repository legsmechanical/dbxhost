/*
 * chain_reorder.c — MOVE an audio-FX position by PERMUTING the instance's
 * per-position arrays, rather than reloading modules.
 *
 * Ported from upstream Schwung (da427483a / f8e98c1f8 / 53df334e1) for this
 * fork's chain, which differs in two ways that shape everything below:
 *
 *   FOUR FIXED POSITIONS, holes allowed. Upstream's chain is variable-length and
 *   compact; here fx1..fx4 are addressed independently and `fx_count` is a
 *   HIGH-WATER MARK (a position below it may be empty — both walks skip it).
 *   ⚠ A MOVE NEVER CROSSES A HOLE: both ends and everything between must hold
 *   a module. The slot save writes positions COMPACTED and the load appends
 *   (chain_patch.c), so an order with a hole in it does not survive a reload —
 *   a move through one would come back different, with every "fxN" reference
 *   outside this chain naming the wrong module. The shim refuses such a move
 *   with an answer (shadow_fx_move_check); this refuses it again.
 *
 *   MOVE ONLY, AUDIO FX ONLY. No insert/remove verbs (positions are fixed) and
 *   MIDI FX are not moved (their storage is still inline).
 *
 * WHY PERMUTE. A `<id>:module` write unloads and dlopen()s, so renumbering by
 * rewriting ids destroyed every module downstream of the edit — a reverb lost
 * its tail, an arp its phase. A move keeps every instance running; only the
 * index changes. The big per-position blocks (param metadata, ui_hierarchy)
 * are behind pointers for exactly this (chain_alloc_position_storage), so a
 * move copies a few hundred bytes per field at most.
 *
 * THREAD. Called from the chain's set_param, which the shim services on the
 * SPI callback — the thread that renders this instance. ⚠ Not the only one in
 * this fork: the shim's render pool can leave a helper lane inside a chain
 * after a bail. The SHIM refuses to deliver a move for a slot whose render is
 * still in flight; this file assumes that gate.
 */

#include "chain_internal.h"
#include "host/chain_permute.h"

#define PERM_FIELD(arr) { (void *)(arr), sizeof((arr)[0]), 0 }
#define PERM_OWNED(arr, bytes) { (void *)(arr), sizeof((arr)[0]), (bytes) }
#define PERM_PARAMS_BYTES (MAX_CHAIN_PARAMS * sizeof(chain_param_info_t))

/*
 * EVERY per-position field of the audio-FX section, as data. This list is the
 * whole correctness argument: a field left out keeps the value of whatever
 * module USED to be at that index. tests/host/test_chain_permute.sh pins it
 * against the struct, and classifies owned buffers from the allocator.
 * `patches[]` / `patch_info_t.audio_fx[]` are deliberately absent — the saved
 * library, written from these arrays at save time.
 */
static int chain_perm_collect_fx(chain_instance_t *inst, chain_perm_array_t *out) {
    int n = 0;
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_handles);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_plugins_v2);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_instances);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_is_v2);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->current_fx_modules);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_on_midi);
    out[n++] = (chain_perm_array_t)PERM_OWNED(inst->fx_params, PERM_PARAMS_BYTES);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_param_counts);
    out[n++] = (chain_perm_array_t)PERM_OWNED(inst->fx_ui_hierarchy, CHAIN_UI_HIERARCHY_LEN);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->mod_param_refresh_ms_fx);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_smoothers);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_bypassed);
    out[n++] = (chain_perm_array_t)PERM_FIELD(inst->fx_requires_continuous);
    return n;
}

/*
 * Re-aim everything that names a position BY STRING ("fx2"): the runtime
 * modulation targets (their entries carry the modulation BASE, so they simply
 * stay valid), the per-slot LFOs and the knob mappings. A move never drops a
 * position, so nothing here is cleared — every id is renamed or left alone.
 */
static void chain_perm_retarget_all(chain_instance_t *inst, const int *map, int count) {
    for (int i = 0; i < inst->mod_target_count && i < MAX_MOD_TARGETS; i++) {
        mod_target_state_t *e = &inst->mod_targets[i];
        if (!e->active) continue;
        chain_perm_retarget(e->target, sizeof(e->target), "fx", MAX_AUDIO_FX, map, count);
    }
    for (int i = 0; i < LFO_COUNT; i++) {
        lfo_state_t *l = &inst->lfos[i];
        chain_perm_retarget(l->target, sizeof(l->target), "fx", MAX_AUDIO_FX, map, count);
    }
    for (int i = 0; i < inst->knob_mapping_count && i < MAX_KNOB_MAPPINGS; i++) {
        knob_mapping_t *k = &inst->knob_mappings[i];
        chain_perm_retarget(k->target, sizeof(k->target), "fx", MAX_AUDIO_FX, map, count);
    }
}

/* The param-smoother is the largest per-position value field, and the permute
 * refuses (silently, as a failed move) anything over its scratch size. */
_Static_assert(sizeof(param_smoother_t) <= CHAIN_PERM_MAX_ELEM,
               "param_smoother_t outgrew chain_permute.h's scratch: every fx:move would be refused");

/*
 * Move position `from` to position `to`, both 0-based, rotating everything in
 * between. Returns 1 on success, 0 if refused (out of range, same position, a
 * hole anywhere in [from..to], an owned buffer missing).
 */
int chain_reorder_move(chain_instance_t *inst, int from, int to) {
    if (!inst) return 0;
    if (from < 0 || from >= MAX_AUDIO_FX || to < 0 || to >= MAX_AUDIO_FX) return 0;
    {
        int lo = from < to ? from : to, hi = from < to ? to : from;
        for (int i = lo; i <= hi; i++) if (!inst->fx_instances[i]) return 0;
    }
    chain_perm_array_t arrays[16];
    int n = chain_perm_collect_fx(inst, arrays);
    int map[CHAIN_PERM_MAX_POS];
    if (chain_perm_move(arrays, n, MAX_AUDIO_FX, from, to, map) < 0) return 0;
    chain_perm_retarget_all(inst, map, MAX_AUDIO_FX);
    /* The high-water mark follows the modules, not the move: recompute it. */
    int hw = MAX_AUDIO_FX;
    while (hw > 0 && inst->fx_handles[hw - 1] == NULL && inst->fx_instances[hw - 1] == NULL) hw--;
    inst->fx_count = hw;
    return 1;
}

/* The set_param door: "fx:move" = "<from>><to>", 1-based positions (upstream's
 * spelling). Returns 1 when the key was this verb (handled, moved or refused),
 * 0 to let set_param route it on. A refused move changes nothing. */
int chain_reorder_set_param(chain_instance_t *inst, const char *key, const char *val) {
    if (!key || strcmp(key, "fx:move") != 0) return 0;
    int from = 0, to = 0;
    if (val && sscanf(val, "%d>%d", &from, &to) == 2 &&
        chain_reorder_move(inst, from - 1, to - 1))
        inst->dirty = 1;
    return 1;
}
