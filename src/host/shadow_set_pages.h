/* shadow_set_pages.h - Set tracking and per-set state management
 * Extracted from schwung_shim.c for maintainability. */

#ifndef SHADOW_SET_PAGES_H
#define SHADOW_SET_PAGES_H

#include <stdint.h>
#include "shadow_constants.h"
#include "shadow_chain_types.h"
#include "shadow_sampler.h"   /* SAMPLER_SETS_DIR — the per-set state root since co-location */

/* ============================================================================
 * Constants
 * ============================================================================ */

/* Path constants used by set/config management */
#define SHADOW_CHAIN_CONFIG_FILENAME "shadow_chain_config.json"
#define SHADOW_CHAIN_CONFIG_PATH SCHWUNG_INSTALL_DIR "/" SHADOW_CHAIN_CONFIG_FILENAME
/* ⭑ Per-set state lives INSIDE the set's own directory (state co-location,
 * 2026-08-12): Sets/<uuid>/PER_SET_STATE_SUBDIR/. It travels with the set on
 * copy/delete/rename because it is in the set — the old parallel
 * SCHWUNG_INSTALL_DIR/set_state tree needed a sweeper to stay in step.
 * ⚠ Genericity waiver, recorded: the SUBDIR's VALUE names a module, which this
 * repo's "keep host changes generic" rule discourages. Accepted deliberately —
 * one host, one module, one deliverable — and kept to this single constant so
 * a rename (or an upstream offer under a neutral name) is one line + the
 * check-config pin. The macro NAME stays generic. */
#ifndef PER_SET_STATE_SUBDIR
#define PER_SET_STATE_SUBDIR "dAVEBOx/host"
#endif
#define SET_STATE_DIR_FMT SAMPLER_SETS_DIR "/%s/" PER_SET_STATE_SUBDIR
#define SLOT_STATE_DIR SCHWUNG_INSTALL_DIR "/slot_state"
#define ACTIVE_SET_PATH SCHWUNG_INSTALL_DIR "/active_set.txt"

/* ============================================================================
 * Callback struct - shim functions set pages needs
 * ============================================================================ */

typedef struct {
    void (*log)(const char *msg);
    void (*announce)(const char *msg);
    void (*overlay_sync)(void);
    int (*run_command)(const char *const argv[]);
    void (*save_state)(void);
    int (*read_set_mute_states)(const char *set_name, int muted_out[4], int soloed_out[4]);
    float (*read_set_tempo)(const char *set_name);
    void (*ui_state_update_slot)(int slot);
    void (*ui_state_refresh)(void);
    int (*chain_parse_channel)(int ch);
    /* Shared state pointers */
    shadow_chain_slot_t *chain_slots;
    shadow_control_t **shadow_control_ptr;
    volatile int *solo_count;
} set_pages_host_t;

/* ============================================================================
 * Extern globals - set page state readable/writable by the shim
 * ============================================================================ */

/* Set tracking globals (shared with sampler for tempo) */
extern float sampler_set_tempo;
extern char sampler_current_set_name[128];
extern char sampler_current_set_uuid[64];
extern int sampler_last_song_index;
extern int sampler_pending_song_index;
extern uint32_t sampler_pending_set_seq;

/* ============================================================================
 * Public functions
 * ============================================================================ */

/* Initialize set pages subsystem with callbacks to shim functions.
 * Must be called before any other set pages function. */
void set_pages_init(const set_pages_host_t *host);

/* Utility: ensure a directory exists (mkdir -p) */
void shadow_ensure_dir(const char *dir);

/* Utility: copy a single file. Returns 1 on success. */
int shadow_copy_file(const char *src_path, const char *dst_path);

/* Batch migration: seed per-set state for all existing sets */

/* Save shadow chain config to a specific directory */
void shadow_save_config_to_dir(const char *dir);

/* Load shadow chain config from a specific directory. Returns 1 if loaded. */
int shadow_load_config_from_dir(const char *dir);

/* Handle a set being loaded (from Settings.json poll) */
void shadow_handle_set_loaded(const char *set_name, const char *uuid);

/* Poll Settings.json for set changes */
void shadow_poll_current_set(void);

/* Forced-index fast path: a caller that KNOWS the new currentSongIndex (the
 * select gate — Settings.json trails an in-place switch by seconds) stores
 * it here; the poll uses it until the file catches up. Any thread. */
void shadow_set_tracking_force_index(int idx);
int shadow_set_tracking_forced_pending(void);

/* Consume the worker-published current-set snapshot on the SPI thread
 * (cheap; calls shadow_handle_set_loaded, which dedupes). The filesystem
 * scan itself (shadow_poll_current_set) runs on the shim worker. */
void shadow_set_pages_consume(void);

#endif /* SHADOW_SET_PAGES_H */
