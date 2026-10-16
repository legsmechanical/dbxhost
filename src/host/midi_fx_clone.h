/* midi_fx_clone.h — what the host needs to run a COPY of a chain slot's MIDI FX
 * module offline (move_host_ext_v1_t.midi_fx_offline_*): where its code is,
 * and the live instance's settings, read once on the audio thread by the
 * chain's exported chain_midi_fx_clone_source() and applied to the copy the
 * way a patch load applies them (each parameter, then "state").
 *
 * Shared by the chain (which fills it) and the shim (which reads it): the
 * shim resolves the export by dlsym, so this header is the one layout. */
#ifndef MIDI_FX_CLONE_H
#define MIDI_FX_CLONE_H

#define MFO_MAX_FX      2       /* the chain's MAX_MIDI_FX */
#define MFO_MAX_PARAMS  64
#define MFO_STATE_MAX   16384   /* the chain's MAX_FX_STATE_LEN */

typedef struct {
    char so_path[512];                     /* <modules>/midi_fx/<id>/dsp.so */
    char dir[512];                         /* its module directory (create_instance) */
    int  nparams;
    char key[MFO_MAX_PARAMS][32];
    char val[MFO_MAX_PARAMS][128];
    int  state_len;                        /* 0 = the module keeps none */
    char state[MFO_STATE_MAX];
} mfo_fx_src_t;

/* Exported by the chain DSP (chain_midi.c). Fills up to `max` sources with
 * the instance's ACTIVE MIDI FX (loaded, not bypassed), in chain order.
 * Returns how many, or -1 if a setting does not fit (a state blob of
 * MFO_STATE_MAX or more). Audio thread: get_param calls only. */
typedef int (*chain_midi_fx_clone_source_fn)(void *instance, mfo_fx_src_t *out, int max);

#endif /* MIDI_FX_CLONE_H */
