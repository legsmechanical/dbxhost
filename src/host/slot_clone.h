/* slot_clone.h — what the host needs to run a COPY of a chain slot's
 * instrument (and, for a take after its effects, its audio FX) offline
 * (move_host_ext_v1_t.offline_take_*): where each module's code is, and the
 * live instance's settings, read on the audio thread by the chain's exported
 * chain_slot_clone_source() and applied to the copy the way a patch load
 * applies them (preset, each parameter, then "state").
 *
 * Shared by the chain (which fills it) and the shim (which reads it): the
 * shim resolves the export by dlsym, so this header is the one layout. */
#ifndef SLOT_CLONE_H
#define SLOT_CLONE_H

#define SLC_MAX_FX          4       /* the chain's MAX_AUDIO_FX (fx1..fx4) */
#define SLC_MAX_PARAMS      256     /* the chain's MAX_CHAIN_PARAMS */
#define SLC_SYNTH_STATE_MAX 65536   /* the chain's MAX_SYNTH_STATE_LEN */
#define SLC_FX_STATE_MAX    16384   /* the chain's MAX_FX_STATE_LEN */

typedef struct {
    char key[32];
    char val[128];
} slc_param_t;

typedef struct {
    char so_path[512];                  /* .../audio_fx/<id>/<id>.so */
    char dir[512];                      /* its module directory (create_instance) */
    int  position;                      /* fx1..fx4 = 0..3: what an "fxN:" key names */
    int  nparams;
    slc_param_t params[SLC_MAX_PARAMS];
    int  state_len;                     /* 0 = the module keeps none */
    char state[SLC_FX_STATE_MAX];
} slc_fx_src_t;

typedef struct {
    char so_path[512];                  /* .../sound_generators/<id>/dsp.so; "" = no instrument
                                         * (none loaded, or bypassed): the slot sounds silence
                                         * plus what is fed to it */
    char dir[512];                      /* its module directory (create_instance) */
    char config[1024];                  /* a pack's config JSON, "" for none */
    char preset[16];                    /* "" = the module answers none */
    int  nparams;
    slc_param_t params[SLC_MAX_PARAMS];
    int  state_len;
    char state[SLC_SYNTH_STATE_MAX];
    unsigned knob_ccs;                  /* bit n: CC 71+n is a knob mapping the chain takes
                                         * for itself (it never reaches the instrument) */
    int  nfx;                           /* the playing audio FX, in chain order */
    slc_fx_src_t fx[SLC_MAX_FX];
} slc_src_t;

/* Why a slot cannot be copied (chain_slot_clone_source's negative answers):
 * the take is then recorded in real time. */
#define SLC_ERR_NONE        0
#define SLC_ERR_NO_SYNTH   -1   /* no chain on the slot */
#define SLC_ERR_MOD        -2   /* modulation / an LFO moves a parameter */
#define SLC_ERR_SPLIT      -3   /* the instrument's voices go to buses */
#define SLC_ERR_MIDI_FX    -4   /* a MIDI FX plays */
#define SLC_ERR_FX_MIDI    -5   /* an audio FX takes MIDI (it hears other tracks) */
#define SLC_ERR_LINE_IN    -6   /* the instrument listens to the line input */
#define SLC_ERR_TOO_BIG    -7   /* a state that does not fit */

/* Exported by the chain DSP. Fills `out` with the instance's instrument and,
 * when `with_fx`, its playing audio FX. Returns 1, or an SLC_ERR_*. Audio
 * thread: get_param calls only. */
typedef int (*chain_slot_clone_source_fn)(void *instance, slc_src_t *out, int with_fx);

#endif /* SLOT_CLONE_H */
