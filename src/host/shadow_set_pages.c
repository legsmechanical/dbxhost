/* shadow_set_pages.c - Set tracking and per-set state management
 * (The 8-page set-library stash this file was named for died in P3 of the
 * re-architecture; the name stays to keep history legible.)
 * Extracted from schwung_shim.c for maintainability. */

#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <sys/stat.h>
#include <sys/xattr.h>
#include <dirent.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <pthread.h>
#include <time.h>

#include "shadow_set_pages.h"
#include "shadow_chain_mgmt.h"  /* MASTER_FX_SLOTS — its own axis, see the seed loops */
#include "host/schwung_paths.h"
#include "shadow_sampler.h"  /* for SAMPLER_SETS_DIR, sampler_read_set_tempo */

/* ============================================================================
 * Globals
 * ============================================================================ */

/* Set tracking globals */
float sampler_set_tempo = 0.0f;              /* 0 = not yet detected */
char sampler_current_set_name[128] = "";      /* current set name */
char sampler_current_set_uuid[64] = "";       /* UUID from Sets/<UUID>/<Name>/ path */
int sampler_last_song_index = -1;             /* last seen currentSongIndex */
int sampler_pending_song_index = -1;          /* unresolved currentSongIndex without UUID dir yet */
uint32_t sampler_pending_set_seq = 0;         /* synthetic pending-set UUID sequence */

/* Xattr names to preserve when stashing/restoring set UUID dirs */
static const char *set_page_xattr_names[] = {
    "user.song-index",
    "user.song-color",
    "user.last-modified-time",
    "user.was-externally-modified",
    "user.local-cloud-state",
    NULL
};

/* ============================================================================
 * Host callbacks (set during init)
 * ============================================================================ */

static set_pages_host_t host;

void set_pages_init(const set_pages_host_t *h) {
    host = *h;
}

/* ============================================================================
 * Utility functions
 * ============================================================================ */

/* Fix file ownership after writing as root */
static void chown_to_ableton(const char *path) {
    const char *argv[] = { "chown", "ableton:users", path, NULL };
    host.run_command(argv);
}

/* Ensure a directory exists, creating it if needed (like mkdir -p) */
void shadow_ensure_dir(const char *dir) {
    struct stat st;
    if (stat(dir, &st) != 0) {
        const char *mkdir_argv[] = { "mkdir", "-p", dir, NULL };
        host.run_command(mkdir_argv);
    }
}

/* Copy a single file from src_path to dst_path. Returns 1 on success. */
int shadow_copy_file(const char *src_path, const char *dst_path) {
    FILE *sf = fopen(src_path, "r");
    if (!sf) return 0;
    fseek(sf, 0, SEEK_END);
    long sz = ftell(sf);
    fseek(sf, 0, SEEK_SET);
    if (sz <= 0 || sz > 1024 * 1024) { fclose(sf); return 0; }
    char *buf = malloc(sz);
    if (!buf) { fclose(sf); return 0; }
    size_t nr = fread(buf, 1, sz, sf);
    fclose(sf);
    if (nr == 0) { free(buf); return 0; }
    FILE *df = fopen(dst_path, "w");
    if (!df) { free(buf); return 0; }
    size_t nw = fwrite(buf, 1, nr, df);
    fclose(df);
    chown_to_ableton(dst_path);
    free(buf);
    if (nw != nr) { unlink(dst_path); return 0; }
    return 1;
}

/* Write a small text file and fix ownership (we run as root). */
static int write_text_file_as_ableton(const char *path, const char *content) {
    FILE *f = fopen(path, "w");
    if (!f) return 0;
    fputs(content, f);
    fclose(f);
    chown_to_ableton(path);
    return 1;
}

/* ⚠ seed_empty_set_state + shadow_batch_migrate_sets are GONE (state
 * co-location, 2026-08-12). The batch migration seeded EMPTY per-set state
 * under the parallel set_state/ root for every existing set, once, at shim
 * init. Under co-location the state lives inside each set dir and a set's
 * FIRST VISIT seeds it (the SET_CHANGED handler in shadow_ui.js) — an
 * init-time sweep would create module-named dirs inside every set visible at
 * boot, for no reader. The boot restore (shadow_chain_mgmt.c) falls back to
 * SLOT_STATE_DIR when a set has no per-set state yet, exactly as it always
 * did for a set the migration had not reached. */


/* ============================================================================
 * Config save/load
 * ============================================================================ */

void shadow_save_config_to_dir(const char *dir) {
    shadow_ensure_dir(dir);
    char path[512];
    snprintf(path, sizeof(path), "%s/" SHADOW_CHAIN_CONFIG_FILENAME, dir);

    FILE *f = fopen(path, "w");
    if (!f) return;
    fprintf(f, "{\n  \"slots\": [\n");
    for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) {
        int display_ch = host.chain_slots[i].channel < 0
            ? 0 : host.chain_slots[i].channel + 1;
        int display_fwd = host.chain_slots[i].forward_channel >= 0
            ? host.chain_slots[i].forward_channel + 1
            : host.chain_slots[i].forward_channel;
        /* ⚠ Must write EVERY per-set slot field. This file has two writers —
         * this one and the shadow UI's saveChainConfigToDir — and whichever
         * runs last wins the whole file. Emitting a subset here silently
         * STRIPS the fields it omits, so a setting saved by the other writer
         * disappears the next time this one runs. That is how transpose and the
         * sends could vanish without anything failing. */
        fprintf(f, "    {\"name\": \"%s\", \"channel\": %d, \"volume\": %.3f, \"forward_channel\": %d, \"muted\": %d, \"soloed\": %d, \"send_a\": %.3f, \"send_b\": %.3f, \"transpose\": %d, \"synth_volume\": %.3f}%s\n",
                host.chain_slots[i].patch_name, display_ch,
                host.chain_slots[i].volume, display_fwd,
                host.chain_slots[i].muted, host.chain_slots[i].soloed,
                host.chain_slots[i].send_a, host.chain_slots[i].send_b,
                host.chain_slots[i].transpose,
                host.chain_slots[i].synth_volume,
                i < SHADOW_CHAIN_INSTANCES - 1 ? "," : "");
    }
    fprintf(f, "  ]\n}\n");
    fclose(f);
    chown_to_ableton(path);
}

int shadow_load_config_from_dir(const char *dir) {
    char path[512];
    snprintf(path, sizeof(path), "%s/" SHADOW_CHAIN_CONFIG_FILENAME, dir);

    FILE *f = fopen(path, "r");
    if (!f) return 0;

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (size <= 0 || size > 4096) { fclose(f); return 0; }

    char *json = malloc(size + 1);
    if (!json) { fclose(f); return 0; }
    size_t nread = fread(json, 1, size, f);
    json[nread] = '\0';
    fclose(f);

    /* Parse slots - same logic as shadow_chain_load_config */
    char *cursor = json;
    *host.solo_count = 0;
    for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) {
        char *name_pos = strstr(cursor, "\"name\"");
        if (!name_pos) break;
        char *colon = strchr(name_pos, ':');
        if (colon) {
            char *q1 = strchr(colon, '"');
            if (q1) {
                q1++;
                char *q2 = strchr(q1, '"');
                if (q2 && q2 > q1) {
                    size_t len = (size_t)(q2 - q1);
                    if (len < sizeof(host.chain_slots[i].patch_name)) {
                        memcpy(host.chain_slots[i].patch_name, q1, len);
                        host.chain_slots[i].patch_name[len] = '\0';
                    }
                }
            }
        }
        char *chan_pos = strstr(name_pos, "\"channel\"");
        if (chan_pos) {
            char *chan_colon = strchr(chan_pos, ':');
            if (chan_colon) {
                int ch = atoi(chan_colon + 1);
                if (ch >= 0 && ch <= 16)
                    host.chain_slots[i].channel = host.chain_parse_channel(ch);
            }
            cursor = chan_pos + 8;
        } else {
            cursor = name_pos + 6;
        }
        char *vol_pos = strstr(name_pos, "\"volume\"");
        if (vol_pos) {
            char *vol_colon = strchr(vol_pos, ':');
            if (vol_colon) {
                float vol = atof(vol_colon + 1);
                if (vol >= 0.0f && vol <= 1.0f)
                    host.chain_slots[i].volume = vol;
            }
        }
        char *fwd_pos = strstr(name_pos, "\"forward_channel\"");
        if (fwd_pos) {
            char *fwd_colon = strchr(fwd_pos, ':');
            if (fwd_colon) {
                int ch = atoi(fwd_colon + 1);
                if (ch >= -2 && ch <= 15)
                    host.chain_slots[i].forward_channel = ch;
            }
        }
        char *muted_pos = strstr(name_pos, "\"muted\"");
        if (muted_pos) {
            char *muted_colon = strchr(muted_pos, ':');
            if (muted_colon) {
                host.chain_slots[i].muted = atoi(muted_colon + 1);
            }
        }
        char *soloed_pos = strstr(name_pos, "\"soloed\"");
        if (soloed_pos) {
            char *soloed_colon = strchr(soloed_pos, ':');
            if (soloed_colon) {
                host.chain_slots[i].soloed = atoi(soloed_colon + 1);
                if (host.chain_slots[i].soloed) (*host.solo_count)++;
            }
        }
        /* Everything below was written by the per-set saver but never read
         * back here, so these settings could only ever be restored from the
         * GLOBAL file — which is install-wide, not per-set, and is written on a
         * different trigger entirely (mute/solo, dbus, clean shutdown). The
         * visible effect was a setting that "would not stick": edited, saved
         * into this file, then overwritten at boot by a global value from some
         * earlier session. Every slot setting is per-set; anything missing here
         * silently is not. */
        char *tr_pos = strstr(name_pos, "\"transpose\"");
        if (tr_pos) {
            char *tr_colon = strchr(tr_pos, ':');
            if (tr_colon) {
                int t = atoi(tr_colon + 1);
                if (t >= -12 && t <= 12) host.chain_slots[i].transpose = t;
            }
        }
        char *sa_pos = strstr(name_pos, "\"send_a\"");
        if (sa_pos) {
            char *sa_colon = strchr(sa_pos, ':');
            if (sa_colon) {
                float v = (float)atof(sa_colon + 1);
                if (v >= 0.0f && v <= 2.0f) host.chain_slots[i].send_a = v;
            }
        }
        char *sb_pos = strstr(name_pos, "\"send_b\"");
        if (sb_pos) {
            char *sb_colon = strchr(sb_pos, ':');
            if (sb_colon) {
                float v = (float)atof(sb_colon + 1);
                if (v >= 0.0f && v <= 2.0f) host.chain_slots[i].send_b = v;
            }
        }
        char *sv_pos = strstr(name_pos, "\"synth_volume\"");
        if (sv_pos) {
            char *sv_colon = strchr(sv_pos, ':');
            if (sv_colon) {
                float v = (float)atof(sv_colon + 1);
                if (v >= 0.0f && v <= 4.0f) host.chain_slots[i].synth_volume = v;
            }
        }
    }
    free(json);
    host.ui_state_refresh();
    return 1;
}

/* ============================================================================
 * Set detection
 * ============================================================================ */

/* ⚠ The duplicate-DETECTION helpers that lived here are gone (Phase 0 of the
 * state-co-location plan): shadow_get_song_abl_size, shadow_set_name_looks_like_copy
 * and shadow_detect_copy_source. They guessed a new set's ancestor by matching
 * "copy"/"duplicate" in its name and comparing Song.abl file SIZES, so a module
 * could seed the duplicate's state from it. Nothing had called them for some
 * time — the JS side owned the same guess — and the guess itself is retired: a
 * module that manages its own projects seeds state when it makes the copy, and
 * a set duplicated out of band honestly starts empty. */

/* Handle a Set being loaded — called from Settings.json poll.
 * set_name: human-readable name (e.g. "My Song")
 * uuid: UUID directory name from Sets/<UUID>/<Name>/ path
 *
 * This runs on the audio thread during the periodic set poll.
 * Heavy file I/O (config save/load, copy detection, mkdir) has been
 * removed and is handled by the UI thread via SHADOW_UI_FLAG_SET_CHANGED.
 * Only small writes (active_set.txt) and tempo read remain here. */
void shadow_handle_set_loaded(const char *set_name, const char *uuid) {
    if (!set_name || !set_name[0]) return;

    /* Avoid re-triggering for the same set */
    if (strcmp(sampler_current_set_name, set_name) == 0 &&
        (uuid == NULL || strcmp(sampler_current_set_uuid, uuid) == 0)) {
        return;
    }

    /* Update in-memory state */
    snprintf(sampler_current_set_name, sizeof(sampler_current_set_name), "%s", set_name);
    if (uuid) {
        snprintf(sampler_current_set_uuid, sizeof(sampler_current_set_uuid), "%s", uuid);
    }

    /* Signal shadow UI to handle ALL file I/O (active_set.txt, config,
     * tempo read, etc.) — zero file ops on the audio thread. */
    if (*host.shadow_control_ptr) {
        (*host.shadow_control_ptr)->ui_flags |= SHADOW_UI_FLAG_SET_CHANGED;
    }
}

/* ============================================================================
 * Current-set snapshot (worker → SPI thread)
 *
 * shadow_poll_current_set() runs on the shim worker thread (it walks the
 * filesystem: Settings.json + per-Set getxattr — never allowed on the SPI
 * thread). Its result is published through this seqlock so the SPI path
 * keeps calling shadow_handle_set_loaded() on its own thread, preserving
 * the existing ui_flags / sampler_current_set_* threading semantics.
 * ============================================================================ */

static struct {
    volatile uint32_t seq;   /* odd while the worker is writing */
    char name[128];
    char uuid[64];
} set_snapshot;

static void shadow_set_pages_publish(const char *name, const char *uuid)
{
    set_snapshot.seq++;            /* odd: write in progress */
    __sync_synchronize();
    snprintf(set_snapshot.name, sizeof(set_snapshot.name), "%s", name ? name : "");
    snprintf(set_snapshot.uuid, sizeof(set_snapshot.uuid), "%s", uuid ? uuid : "");
    __sync_synchronize();
    set_snapshot.seq++;            /* even: stable */
}

/* Called from the SPI path. Cheap: two volatile reads + memcpy; the
 * dedupe inside shadow_handle_set_loaded makes repeat delivery a no-op. */
void shadow_set_pages_consume(void)
{
    char name[128];
    char uuid[64];
    uint32_t seq1 = set_snapshot.seq;
    if (seq1 & 1u) return;                  /* write in progress */
    if (!set_snapshot.name[0]) return;      /* nothing published yet */
    memcpy(name, (const void *)set_snapshot.name, sizeof(name));
    memcpy(uuid, (const void *)set_snapshot.uuid, sizeof(uuid));
    __sync_synchronize();
    if (set_snapshot.seq != seq1) return;   /* torn read — next frame */
    name[sizeof(name) - 1] = '\0';
    uuid[sizeof(uuid) - 1] = '\0';
    shadow_handle_set_loaded(name, uuid);
}

/* Forced-index fast path. Settings.json is written LAZILY by Move — after an
 * in-place set switch (the select gate's picker) the index on disk can trail
 * the actual load by seconds, and that lag was the dominant chunk of a
 * project switch. A caller that KNOWS the new index (the gate: pad k ↔
 * user.song-index k) stores it here; the poll uses it instead of the stale
 * file until the file catches up. Plain volatile store — safe from any
 * thread, consumed on the worker. */
static volatile int set_tracking_forced_index = -1;

void shadow_set_tracking_force_index(int idx)
{
    set_tracking_forced_index = idx;
}

int shadow_set_tracking_forced_pending(void)
{
    return set_tracking_forced_index >= 0;
}

/* Poll Settings.json for currentSongIndex changes, then match via xattr.
 * Runs on the shim worker thread (~every 1.4 s; every ~200 ms while a forced
 * index is pending); publishes results via the snapshot above instead of
 * calling shadow_handle_set_loaded directly. */
void shadow_poll_current_set(void)
{
    static const char settings_path[] = "/data/UserData/settings/Settings.json";

    /* Read currentSongIndex from Settings.json */
    FILE *f = fopen(settings_path, "r");
    if (!f) return;

    int song_index = -1;
    char line[256];
    while (fgets(line, sizeof(line), f)) {
        char *p = strstr(line, "\"currentSongIndex\":");
        if (p) {
            p += 19;  /* skip past "currentSongIndex": */
            while (*p == ' ') p++;
            song_index = atoi(p);
            break;
        }
    }
    fclose(f);

    /* Forced index overrides the (possibly stale) file; retire the override
     * once the file agrees so ordinary tracking resumes. */
    {
        int forced = set_tracking_forced_index;
        if (forced >= 0) {
            if (song_index == forced) set_tracking_forced_index = -1;
            else song_index = forced;
        }
    }

    if (song_index < 0) return;

    /* Normal path: react when index changes.
     * Pending path: keep retrying the same unresolved index until a UUID appears. */
    if (song_index == sampler_last_song_index &&
        song_index != sampler_pending_song_index) {
        return;
    }

    int song_index_changed = (song_index != sampler_last_song_index);
    if (song_index_changed) {
        sampler_last_song_index = song_index;
    }

    /* Scan Sets directories for matching user.song-index xattr */
    DIR *sets_dir = opendir(SAMPLER_SETS_DIR);
    if (!sets_dir) return;

    int matched = 0;
    struct dirent *entry;
    while ((entry = readdir(sets_dir)) != NULL) {
        if (entry->d_name[0] == '.') continue;

        char uuid_path[512];
        snprintf(uuid_path, sizeof(uuid_path), "%s/%s", SAMPLER_SETS_DIR, entry->d_name);

        /* Read user.song-index xattr from UUID directory */
        char xattr_val[32] = "";
        ssize_t xlen = getxattr(uuid_path, "user.song-index", xattr_val, sizeof(xattr_val) - 1);
        if (xlen <= 0) continue;
        xattr_val[xlen] = '\0';

        int idx = atoi(xattr_val);
        if (idx != song_index) continue;

        /* Found matching UUID dir — get set name from subdirectory */
        DIR *uuid_dir = opendir(uuid_path);
        if (!uuid_dir) continue;

        int handled = 0;
        struct dirent *sub;
        while ((sub = readdir(uuid_dir)) != NULL) {
            if (sub->d_name[0] == '.') continue;
            /* This subdirectory name is the set name */
            shadow_set_pages_publish(sub->d_name, entry->d_name);
            handled = 1;
            break;
        }
        closedir(uuid_dir);
        if (handled) {
            matched = 1;
            break;
        }
    }
    closedir(sets_dir);

    if (matched) {
        sampler_pending_song_index = -1;
        return;
    }

    /* currentSongIndex changed, but the Sets/<UUID>/ folder is not materialized yet.
     * Present an immediate blank working state in a synthetic pending namespace. */
    if (song_index_changed || song_index != sampler_pending_song_index) {
        sampler_pending_set_seq++;
        if (sampler_pending_set_seq == 0) sampler_pending_set_seq = 1;
    }
    sampler_pending_song_index = song_index;

    char pending_name[128];
    char pending_uuid[64];
    snprintf(pending_name, sizeof(pending_name), "New Set %d", song_index + 1);
    snprintf(pending_uuid, sizeof(pending_uuid), "__pending-%d-%u",
             song_index, (unsigned)sampler_pending_set_seq);
    shadow_set_pages_publish(pending_name, pending_uuid);
}
