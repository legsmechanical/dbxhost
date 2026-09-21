/* shadow_set_pages.h - Set tracking and per-set state management
 * Extracted from schwung_shim.c for maintainability. */

#ifndef SHADOW_SET_PAGES_H
#define SHADOW_SET_PAGES_H

#include <stddef.h>   /* size_t, for shadow_set_identity_state */

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
 * 2026-08-12): Sets/<uuid>/<state dir>/PER_SET_STATE_LEAF/. It travels with the
 * set on copy/delete/rename because it is in the set — the old parallel
 * SCHWUNG_INSTALL_DIR/set_state tree needed a sweeper to stay in step.
 * ⚠⚠ The state dir's NAME is resolved per set, never spelled: it is chosen so
 * it lists AFTER Move's song folder (Move opens the first subfolder it lists).
 * Build the path with dbx_state_subdir_resolve() (dbx_state_subdir.h).
 * ⚠ Genericity waiver, recorded: the state dir's name names a module, which this
 * repo's "keep host changes generic" rule discourages. Accepted deliberately —
 * one host, one module, one deliverable. */
#define PER_SET_STATE_LEAF "host"
#define SLOT_STATE_DIR SCHWUNG_INSTALL_DIR "/slot_state"
#define ACTIVE_SET_PATH SCHWUNG_INSTALL_DIR "/active_set.txt"
/* What Move itself logged loading (`About to load ...`), distilled by the
 * session launcher's reader: a uuid, or `default`. ABSENT = not known yet.
 * The reader's presence is what switches verification on. */
#define MOVE_LOADED_SET_PATH SCHWUNG_INSTALL_DIR "/move_loaded_set.txt"
#define MOVE_LOADED_SET_READER SCHWUNG_INSTALL_DIR "/scripts/move-loaded-set-reader.sh"
/* The song index a relaunch actually asked Move to open (launch.sh, applied
 * alongside `relaunch_song_index` -> "applied project index N"). Left in
 * place across the whole session until the next relaunch overwrites it;
 * ABSENT = no relaunch has pinned an index yet, trust the scan as-is. See
 * loaded_set_index_matches() in shadow_loaded_set_policy.h. */
/* dAVEBOx's REQUEST: the project it deliberately switched to, written at the
 * moment of the pick (when the answer is known rather than inferred) and
 * CONSUMED by the shim when it arms. One record:
 *   uuid\nindex\nname[\nn0]
 * ⚠ The old comment here said the fourth field was `seq`. There has never been
 * a `seq`. Line 4 is an optional explicit n0, written ONLY by launch.sh when
 * it carries a request across a Move relaunch; dAVEBOx writes lines 1-3 and
 * never line 4. shadow_set_request.h says why it has to exist.
 * It replaces move_intended_index.txt, which carried only the index — two
 * request records that could disagree, where one will do. */
#define MOVE_INTENDED_SET_PATH SCHWUNG_INSTALL_DIR "/intended_set.txt"

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

/* ── Identity (the 2026-09-16 state machine) ──────────────────────────────
 *
 * Arm a request: a switch has been set in motion and we are now waiting for
 * Move's own word about it. Called from the two places a switch actually
 * starts — the relaunch boot and the in-place select actuator. It reads and
 * CONSUMES dAVEBOx's intended_set.txt and records the reader's counter, which
 * is what lets a later line be recognised as newer than the request. */
void shadow_set_identity_arm(void);

/* The typed record behind get_param("active_set_state"):
 *   <state>\n<reason>\n<index>
 * where state is open|pending|none. ⚠ A uuid exists ONLY when state is open —
 * `pending` and `none` publish an empty identity on purpose, so nothing
 * downstream can name a project Move has not confirmed. */
int shadow_set_identity_state(char *out, size_t out_len);

#endif /* SHADOW_SET_PAGES_H */
