/*
 * Schwung Plugin API v1
 *
 * Stable ABI for DSP modules loaded by the host runtime.
 * Modules are .so files loaded via dlopen() and must export move_plugin_init_v1().
 */

#ifndef MOVE_PLUGIN_API_V1_H
#define MOVE_PLUGIN_API_V1_H

#include <stdint.h>
#include <stddef.h>   /* offsetof, for the host_api_v1_t static asserts */

#define MOVE_PLUGIN_API_VERSION 1

/* Audio constants */
#define MOVE_SAMPLE_RATE 44100
#define MOVE_FRAMES_PER_BLOCK 128
#define MOVE_AUDIO_OUT_OFFSET 256
#define MOVE_AUDIO_IN_OFFSET (2048 + 256)
#define MOVE_AUDIO_BYTES_PER_BLOCK 512

/* MIDI source identifiers */
#define MOVE_MIDI_SOURCE_INTERNAL 0
#define MOVE_MIDI_SOURCE_EXTERNAL 2
#define MOVE_MIDI_SOURCE_HOST 3  /* Host-generated (clock, etc) */
#define MOVE_MIDI_SOURCE_FX_BROADCAST 4  /* Broadcast to audio FX only (skip synth) */

/* Clock status identifiers for host_api_v1.get_clock_status() */
#define MOVE_CLOCK_STATUS_UNAVAILABLE 0  /* Clock output not available/configured */
#define MOVE_CLOCK_STATUS_STOPPED 1      /* Clock available, transport stopped */
#define MOVE_CLOCK_STATUS_RUNNING 2      /* Clock available, transport running */

/* Optional modulation callbacks for chain-owned runtime modulation buses.
 * Sub-plugins can publish temporary modulation contributions without writing
 * target base values directly.
 */
typedef int (*move_mod_emit_value_fn)(void *ctx,
                                      const char *source_id,
                                      const char *target,
                                      const char *param,
                                      float signal,
                                      float depth,
                                      float offset,
                                      int bipolar,
                                      int enabled);
typedef void (*move_mod_clear_source_fn)(void *ctx, const char *source_id);

/*
 * Host API - provided by host to plugin during initialization
 */
typedef struct host_api_v1 {
    uint32_t api_version;

    /* Audio constants */
    int sample_rate;
    int frames_per_block;

    /* Direct mailbox access (use with care) */
    uint8_t *mapped_memory;
    int audio_out_offset;
    int audio_in_offset;

    /* Logging */
    void (*log)(const char *msg);

    /* MIDI send functions
     * msg: 4-byte USB-MIDI packet [cable|CIN, status, data1, data2]
     * len: number of bytes (typically 4)
     * Returns: bytes queued, or 0 on failure
     */
    int (*midi_send_internal)(const uint8_t *msg, int len);
    int (*midi_send_external)(const uint8_t *msg, int len);

    /* Clock status query for sync-aware plugins.
     * Returns one of MOVE_CLOCK_STATUS_*.
     */
    int (*get_clock_status)(void);

    /* Optional runtime modulation callbacks (NULL if unsupported). */
    move_mod_emit_value_fn mod_emit_value;
    move_mod_clear_source_fn mod_clear_source;
    void *mod_host_ctx;

    /* Tempo query — returns current BPM (120.0 default).
     * Uses sampler_get_bpm() fallback chain: MIDI clock → set tempo → settings → 120.
     * NULL if host does not support tempo. */
    float (*get_bpm)(void);

    /* Inject a USB-MIDI packet into Move's MIDI_IN as if it came from
     * internal hardware (pads/knobs). The drain forces cable 0 so Move
     * treats the event as native input — no MIDI_OUT cable-2 echo.
     *
     * msg: 4-byte USB-MIDI packet [cable|CIN, status, data1, data2]
     *      The cable nibble is ignored (always forced to 0 by the drain).
     * len: must be 4
     * Returns: bytes queued, or 0 on failure (SHM unavailable, ring full).
     *
     * NULL if host does not support MIDI-IN injection (non-shadow host).
     * Rate-limited to 8 packets/tick at the drain; callers should not
     * burst more than that per render block. */
    int (*midi_inject_to_move)(const uint8_t *msg, int len);

    /* Return the receive channel for the slot owning this plugin instance.
     * -1 = All (no filter), 0-15 = specific channel byte, -2 = instance not
     * registered (e.g. master FX, host-level plugin).
     *
     * Use this to address Move tracks via midi_inject_to_move: the inject
     * channel must be the slot's recv channel, NOT the slot's
     * forward_channel (which is purely an internal synth-side routing hint,
     * e.g. minijv part 6). NULL if the host doesn't expose slot context. */
    int (*slot_recv_channel)(void *instance);

    /* Beats since transport start of the active clock source (Move's native
     * sequencer, or an internal module's emitted clock), derived from
     * 24-PPQN realtime ticks and interpolated per block. Returns < 0 when
     * no transport is running — callers must fall back (e.g. LFO free-run).
     * Appended in 2026-07; may be NULL on older hosts, always guard. */
    double (*get_beat_position)(void);

    /* NULL RUN at +120..+167 -- load-bearing, do not put a field here.
     *
     * Upstream Schwung ends this struct in `void *reserved[8]` starting at
     * exactly +120 (sizeof 184), because a module's copy of this header can
     * declare a field the host does not have and then call it behind its own
     * `if (host->fn)` guard. breakbeat does exactly that: its header appends
     * `float (*get_project_bpm)(void)` after get_beat_position, which resolves
     * to +120. With a live pointer at +120 the guard passes and the call lands
     * on whatever is there -- upstream saw a SIGSEGV on the SPI callback and a
     * boot loop; here it would have called midi_send_internal_slot with a
     * garbage slot and message pointer.
     *
     * So this fork keeps upstream's geometry: sizeof stays 184 and its two
     * extra callbacks sit in the LAST two slots of upstream's reserved run.
     * That is also what keeps a dAVEBOx binary safe under STOCK Schwung: there
     * +168/+176 are upstream's zeroed reserved[6]/[7], so the module's
     * `if (host->fn)` guard reads NULL instead of reading past the end of a
     * 184-byte struct. Every instance is zeroed by construction (BSS statics,
     * mm_init's memset, chain_host's memcpy of sizeof()).
     *
     * A NEW host capability goes in as a dlsym'd export, not a field here:
     * taking from the front of this run re-creates the +120 hazard, and
     * growing the struct past 184 makes dAVEBOx over-read on stock. */
    void *reserved[6];

    /* Send an internal MIDI message directly to one chain slot (0-based),
     * bypassing receive-channel matching. Same 4-byte message form as
     * midi_send_internal ([type-nibble, status, d1, d2]); system realtime
     * (Clock/Start/Continue/Stop) is broadcast to every slot exactly as
     * midi_send_internal does — transport has no slot. The slot's forward
     * channel remap and transpose still apply on delivery.
     * Returns len on success, 0 on failure. NULL if the host doesn't
     * support slot-addressed dispatch. */
    int (*midi_send_internal_slot)(int slot, const uint8_t *msg, int len);

    /* Move's "MIDI Clock Out" preference as a cached word: 1 = output (or
     * unknown/unavailable), 0 = off / input. The host refreshes it off the
     * audio thread (~1 s); a plugin may call this from render. NULL if the
     * host does not provide it — treat as 1. (2026-09-05: the chain used to
     * read Settings.json itself, from the SPI callback.) */
    int (*clock_output_enabled)(void);

} host_api_v1_t;

/* The geometry above is the contract; these are its enforcement (a memset
 * probe cannot be -- a real field at +120 reads NULL in a zeroed struct). */
_Static_assert(offsetof(host_api_v1_t, reserved) == 120,
               "host_api_v1_t NULL run must start at +120 (breakbeat reads +120)");
_Static_assert(offsetof(host_api_v1_t, midi_send_internal_slot) == 168,
               "fork fields must sit in upstream's reserved[6]/[7]");
_Static_assert(sizeof(host_api_v1_t) == 184,
               "host_api_v1_t must stay 184 bytes, the same as upstream");

/*
 * HOST EXTENSIONS — capabilities added after the struct above was frozen.
 *
 * The host_api_v1_t geometry cannot grow (see the note at `reserved`), so a new
 * host capability is handed over by a call the HOST makes into the module:
 * after create_instance, the host looks up MOVE_PLUGIN_HOST_EXT_V1_SYMBOL in
 * the module and, if the module exports it, calls it once with a pointer to a
 * move_host_ext_v1_t that lives as long as the host does. A module that does
 * not export the symbol is not called; a host that does not know the symbol
 * never calls it, and the module's stored pointer stays NULL.
 *
 * `size` is sizeof the struct the host was built with: a module reads a member
 * only if it lies inside `size`, so the struct can grow at its end.
 */
#define MOVE_PLUGIN_HOST_EXT_V1_SYMBOL "move_plugin_host_ext_v1"

typedef struct move_host_ext_v1 {
    uint32_t size;

    /* Set one parameter of chain slot `slot` (0-based) NOW, from the caller's
     * render_block or set_param — i.e. on the audio thread, in program order
     * with the caller's own midi_send_internal_slot calls. A value written
     * here before a note is sent to the same slot is in place when that note
     * is voiced.
     *
     * `key` is what a chain parameter write takes ("synth:cutoff",
     * "fx2:mix", "slot:volume", "move_fx:1:volume"...). Keys that LOAD or
     * replace anything (a module, a patch, a state blob) are refused: this
     * moves values, it does not change what is loaded. The write is
     * transient — it does not mark the slot as edited.
     *
     * Returns 1 if the write was dispatched, 0 if it was refused (bad slot,
     * a key this entry does not carry, key or value too long). A refusal
     * changes nothing. */
    int (*set_slot_param)(int slot, const char *key, const char *value);
} move_host_ext_v1_t;

typedef void (*move_plugin_host_ext_v1_fn)(const move_host_ext_v1_t *ext);

/*
 * Plugin API - implemented by plugin, returned to host
 */
typedef struct plugin_api_v1 {
    uint32_t api_version;

    /* Lifecycle */

    /* Called after dlopen, before any other calls
     * module_dir: path to module directory (e.g., "/data/.../modules/sf2")
     * json_defaults: JSON string from module.json "defaults" section, or NULL
     * Returns: 0 on success, non-zero on failure
     */
    int (*on_load)(const char *module_dir, const char *json_defaults);

    /* Called before dlclose */
    void (*on_unload)(void);

    /* Events */

    /* Called for each MIDI message
     * msg: 3 bytes [status, data1, data2]
     * len: number of bytes (typically 3)
     * source: MOVE_MIDI_SOURCE_INTERNAL or MOVE_MIDI_SOURCE_EXTERNAL
     */
    void (*on_midi)(const uint8_t *msg, int len, int source);

    /* Set a parameter by name (stringly-typed for v1 simplicity)
     * key: parameter name (e.g., "preset", "soundfont_path")
     * val: parameter value as string
     */
    void (*set_param)(const char *key, const char *val);

    /* Get a parameter by name
     * key: parameter name
     * buf: output buffer
     * buf_len: size of output buffer
     * Returns: length written, or -1 if not found
     */
    int (*get_param)(const char *key, char *buf, int buf_len);

    /* Get error message if module is in error state
     * buf: output buffer
     * buf_len: size of output buffer
     * Returns: length written, or 0 if no error
     */
    int (*get_error)(char *buf, int buf_len);

    /* Audio rendering */

    /* Render one block of audio
     * out_interleaved_lr: output buffer for stereo interleaved int16 samples
     *                     layout: [L0, R0, L1, R1, ..., L127, R127]
     * frames: number of frames to render (always MOVE_FRAMES_PER_BLOCK)
     */
    void (*render_block)(int16_t *out_interleaved_lr, int frames);

} plugin_api_v1_t;

/*
 * Plugin entry point - must be exported by all plugins
 *
 * host: pointer to host API struct (valid for plugin lifetime)
 * Returns: pointer to plugin API struct (must remain valid until on_unload)
 */
typedef plugin_api_v1_t* (*move_plugin_init_v1_fn)(const host_api_v1_t *host);

#define MOVE_PLUGIN_INIT_SYMBOL "move_plugin_init_v1"

/*
 * Plugin API v2 - Instance-based API for multi-instance support
 *
 * v2 plugins return an instance pointer from create_instance() and all
 * subsequent calls pass that instance pointer. This allows multiple
 * instances of the same plugin to coexist with independent state.
 *
 * Plugins can export BOTH v1 and v2 symbols during migration.
 * Hosts should prefer v2 when available.
 */

#define MOVE_PLUGIN_API_VERSION_2 2

typedef struct plugin_api_v2 {
    uint32_t api_version;

    /* Create instance - returns opaque instance pointer, or NULL on failure
     * module_dir: path to module directory
     * json_defaults: JSON string from module.json "defaults" section, or NULL
     */
    void* (*create_instance)(const char *module_dir, const char *json_defaults);

    /* Destroy instance - clean up and free instance */
    void (*destroy_instance)(void *instance);

    /* All callbacks take instance as first parameter */
    void (*on_midi)(void *instance, const uint8_t *msg, int len, int source);
    void (*set_param)(void *instance, const char *key, const char *val);
    int (*get_param)(void *instance, const char *key, char *buf, int buf_len);
    int (*get_error)(void *instance, char *buf, int buf_len);
    void (*render_block)(void *instance, int16_t *out_interleaved_lr, int frames);

} plugin_api_v2_t;

typedef plugin_api_v2_t* (*move_plugin_init_v2_fn)(const host_api_v1_t *host);

#define MOVE_PLUGIN_INIT_V2_SYMBOL "move_plugin_init_v2"

#endif /* MOVE_PLUGIN_API_V1_H */
