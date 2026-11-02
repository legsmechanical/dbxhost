/* chain_clone.c — the slot read for a COPY: what the host needs to run this
 * chain's instrument and audio FX offline (slot_clone.h,
 * move_host_ext_v1_t.offline_take_*). Its MIDI FX sibling is
 * chain_midi_fx_clone_source (chain_midi.c). */
#include <stdio.h>
#include <string.h>

#include "chain_internal.h"
#include "host/slot_clone.h"

/* Exported (slot_clone.h): this slot's instrument and, with `with_fx`, its
 * playing audio FX, for a copy that records a take faster than real time.
 * A slot whose sound depends on more than its notes and parameters -- a
 * modulation source, voices sent to buses, a MIDI FX, an audio FX that hears
 * MIDI (it would hear other tracks'), the line input -- is refused, and the
 * take is recorded in real time. Parameters are read as the bulk read reads
 * them; one whose value does not fit is left at the copy's default, a state
 * that does not fit refuses the copy. */
static int slc_read_params(void *mod, int (*get)(void *, const char *, char *, int),
                           const chain_param_info_t *info, int count, slc_param_t *out) {
    int j, k = 0, len;
    for (j = 0; get && j < count && k < SLC_MAX_PARAMS; j++) {
        const char *key = info[j].key;
        if (!key[0] || !strcmp(key, "state") || strlen(key) >= sizeof out[k].key) continue;
        len = get(mod, key, out[k].val, (int)sizeof out[k].val);
        if (len < 0 || len >= (int)sizeof out[k].val) continue;
        out[k].val[len] = '\0';
        snprintf(out[k].key, sizeof out[k].key, "%s", key);
        k++;
    }
    return k;
}

int chain_slot_clone_source(void *instance, slc_src_t *out, int with_fx) {
    chain_instance_t *inst = (chain_instance_t *)instance;
    plugin_api_v2_t *api;
    int i, len;
    if (!inst || !out) return SLC_ERR_NO_SYNTH;
    api = inst->synth_plugin_v2;
    if (!api || !inst->synth_instance || inst->synth_bypassed || !inst->synth_dir[0])
        return SLC_ERR_NO_SYNTH;
    for (i = 0; i < LFO_COUNT; i++)
        if (inst->lfos[i].enabled && inst->lfos[i].active) return SLC_ERR_MOD;
    if (chain_mod_any_active(inst)) return SLC_ERR_MOD;
    if (inst->synth_render_split && inst->synth_split_voice_count > 0) return SLC_ERR_SPLIT;
    for (i = 0; i < inst->midi_fx_count && i < MAX_MIDI_FX; i++)
        if (inst->midi_fx_instances[i] && !inst->midi_fx_bypassed[i]) return SLC_ERR_MIDI_FX;
    if (inst->synth_consumes_line_input) return SLC_ERR_LINE_IN;

    snprintf(out->so_path, sizeof out->so_path, "%s/dsp.so", inst->synth_dir);
    snprintf(out->dir, sizeof out->dir, "%s", inst->synth_dir);
    snprintf(out->config, sizeof out->config, "%s", inst->synth_config);
    out->preset[0] = '\0';
    if (api->get_param) {
        len = api->get_param(inst->synth_instance, "preset", out->preset, (int)sizeof out->preset);
        out->preset[len > 0 && len < (int)sizeof out->preset ? len : 0] = '\0';
    }
    out->nparams = slc_read_params(inst->synth_instance, api->get_param,
                                   inst->synth_params, inst->synth_param_count, out->params);
    out->state_len = 0;
    if (api->get_param) {
        len = api->get_param(inst->synth_instance, "state", out->state, SLC_SYNTH_STATE_MAX);
        if (len >= SLC_SYNTH_STATE_MAX) return SLC_ERR_TOO_BIG;
        if (len > 0) { out->state[len] = '\0'; out->state_len = len; }
    }

    out->knob_ccs = 0;
    for (i = 0; i < inst->knob_mapping_count && i < MAX_KNOB_MAPPINGS; i++) {
        const int cc = inst->knob_mappings[i].cc;
        if (cc >= KNOB_CC_START && cc <= KNOB_CC_END) out->knob_ccs |= 1u << (cc - KNOB_CC_START);
    }

    out->nfx = 0;
    for (i = 0; with_fx && i < inst->fx_count && i < MAX_AUDIO_FX; i++) {
        audio_fx_api_v2_t *fa = inst->fx_plugins_v2[i];
        slc_fx_src_t *o;
        if (!fa || !inst->fx_instances[i] || inst->fx_bypassed[i] || !inst->current_fx_modules[i][0]) continue;
        if (inst->fx_on_midi[i] || fa->on_midi) return SLC_ERR_FX_MIDI;
        o = &out->fx[out->nfx];
        snprintf(o->so_path, sizeof o->so_path, "%s/../audio_fx/%s/%s.so", inst->module_dir,
                 inst->current_fx_modules[i], inst->current_fx_modules[i]);
        snprintf(o->dir, sizeof o->dir, "%s/../audio_fx/%s", inst->module_dir, inst->current_fx_modules[i]);
        o->position = i;
        o->nparams = slc_read_params(inst->fx_instances[i], fa->get_param,
                                     inst->fx_params[i], inst->fx_param_counts[i], o->params);
        o->state_len = 0;
        if (fa->get_param) {
            len = fa->get_param(inst->fx_instances[i], "state", o->state, SLC_FX_STATE_MAX);
            if (len >= SLC_FX_STATE_MAX) return SLC_ERR_TOO_BIG;
            if (len > 0) { o->state[len] = '\0'; o->state_len = len; }
        }
        out->nfx++;
    }
    return 1;
}
