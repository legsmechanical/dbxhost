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
#include "unified_log.h"

#include "shadow_set_pages.h"
#include "shadow_chain_mgmt.h"  /* MASTER_FX_SLOTS — its own axis, see the seed loops */
#include "host/schwung_paths.h"
#include "shadow_sampler.h"  /* for SAMPLER_SETS_DIR, sampler_read_set_tempo */
#include "shadow_loaded_set_policy.h"

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
        fprintf(f, "    {\"name\": \"%s\", \"channel\": %d, \"volume\": %.3f, \"pan\": %.3f, \"forward_channel\": %d, \"muted\": %d, \"soloed\": %d, \"send_a\": %.3f, \"send_b\": %.3f, \"transpose\": %d, \"synth_volume\": %.3f}%s\n",
                host.chain_slots[i].patch_name, display_ch,
                host.chain_slots[i].volume, host.chain_slots[i].pan,
                display_fwd,
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
        char *pan_pos = strstr(name_pos, "\"pan\"");
        if (pan_pos) {
            char *pan_colon = strchr(pan_pos, ':');
            if (pan_colon) {
                float p = (float)atof(pan_colon + 1);
                if (p >= 0.0f && p <= 1.0f) host.chain_slots[i].pan = p;
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

/* ---- Did Move OPEN what we resolved? (shadow_loaded_set_policy.h) --------
 * State for the index currently under verification. Worker thread only. */
static int      loaded_verify_index = -1;     /* song index being verified, -1 = none */
static int      loaded_verify_active = 0;     /* keep re-polling this index */
static long     loaded_verify_start_ms = 0;
static unsigned loaded_verify_seq = 0;
static char     loaded_verify_name[128];
static char     loaded_verify_uuid[64];

static long loaded_set_now_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long)ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

/* The launcher's answer, parsed. The file is one line, `<n> <uuid|default>
 * <name>` (move-loaded-set-reader.sh's contract) — three fields, of which the
 * LAST may contain spaces, so this splits on the first two separators only and
 * never on whitespace generally.
 *
 * `n` is the load COUNTER. It is what lets a caller ask "did Move load
 * something SINCE I asked", which a uuid alone cannot answer: a line naming
 * the set we requested may have been written before the request existed, and
 * treating that as confirmation is how a stale answer passes for a fresh one.
 *
 * A file that does not parse yields n == 0 and an empty uuid, which every
 * caller already treats as ABSENT — the deliberately safe reading, and the one
 * a file left over from an older reader collapses to. */
typedef struct {
    int  n;
    char uuid[64];      /* a uuid, or the literal "default" */
    char name[128];     /* project folder name; empty for "default" */
} loaded_set_line_t;

static int loaded_set_parse_line(const char *raw, loaded_set_line_t *out)
{
    out->n = 0; out->uuid[0] = '\0'; out->name[0] = '\0';
    if (!raw) return 0;
    while (*raw == ' ') raw++;
    if (*raw < '0' || *raw > '9') return 0;          /* no counter: not our format */
    out->n = atoi(raw);
    const char *p = strchr(raw, ' ');
    if (!p) return 0;
    p++;
    const char *q = strchr(p, ' ');
    size_t ulen = q ? (size_t)(q - p) : strcspn(p, "\r\n");
    if (ulen == 0 || ulen >= sizeof(out->uuid)) return 0;
    memcpy(out->uuid, p, ulen);
    out->uuid[ulen] = '\0';
    if (q) {
        q++;
        size_t nlen = strcspn(q, "\r\n");
        if (nlen >= sizeof(out->name)) nlen = sizeof(out->name) - 1;
        memcpy(out->name, q, nlen);
        out->name[nlen] = '\0';
    }
    return out->n > 0;
}

static int loaded_set_read_line(loaded_set_line_t *out)
{
    char raw[256];
    FILE *f = fopen(MOVE_LOADED_SET_PATH, "r");
    if (!f) { loaded_set_parse_line(NULL, out); return 0; }
    size_t n = fread(raw, 1, sizeof(raw) - 1, f);
    fclose(f);
    raw[n] = '\0';
    return loaded_set_parse_line(raw, out);
}

/* Read the launcher's answer as today's callers want it: the uuid field alone,
 * or NULL when the file is absent or unparseable. The counter and the name are
 * reached with loaded_set_read_line(). */
static const char *loaded_set_read_file(char *buf, size_t len)
{
    loaded_set_line_t line;
    if (!loaded_set_read_line(&line)) return NULL;
    snprintf(buf, len, "%s", line.uuid);
    return buf;
}

/* ── THE REQUEST ───────────────────────────────────────────────────────────
 *
 * dAVEBOx writes `intended_set.txt` at the moment it picks a project, which is
 * the one moment the answer is KNOWN rather than inferred: the picker is
 * holding that project's record when the user presses the pad. Before this,
 * both actuators carried only a pad INDEX onward and every layer downstream
 * re-derived the uuid by watching Move.
 *
 * ⚠⚠ It is CONSUMED (unlinked) the instant it is armed. A request record that
 * outlived its request would be judged against a later, unrelated load — which
 * is exactly how the previous attempt at this failed review. One request, one
 * arming, no precedence. */
typedef struct {
    char uuid[LOADED_SET_UUID_MAX];
    char name[LOADED_SET_NAME_MAX];
    int  index;
} identity_request_t;

static int identity_read_and_consume_request(identity_request_t *out)
{
    out->uuid[0] = '\0'; out->name[0] = '\0'; out->index = -1;

    FILE *f = fopen(MOVE_INTENDED_SET_PATH, "r");
    if (!f) return 0;
    char buf[512];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    buf[n] = '\0';
    /* Consume it here, not after parsing: a malformed record must not be left
     * behind to be re-read on every tick for the rest of the session. */
    unlink(MOVE_INTENDED_SET_PATH);

    /* uuid \n index \n name */
    char *p1 = strchr(buf, '\n');
    if (!p1) return 0;
    *p1++ = '\0';
    size_t ulen = strcspn(buf, "\r");
    if (ulen == 0 || ulen >= sizeof(out->uuid)) return 0;
    memcpy(out->uuid, buf, ulen); out->uuid[ulen] = '\0';

    char *p2 = strchr(p1, '\n');
    if (p2) *p2++ = '\0';
    out->index = atoi(p1);
    if (p2) {
        size_t nlen = strcspn(p2, "\r\n");
        if (nlen >= sizeof(out->name)) nlen = sizeof(out->name) - 1;
        memcpy(out->name, p2, nlen); out->name[nlen] = '\0';
    }
    return out->uuid[0] != '\0';
}

/* ── THE GATE ──────────────────────────────────────────────────────────────
 *
 * Every publish goes through here. That is the whole point: one choke point
 * means a placeholder, a guess or an unconfirmed identity cannot reach
 * active_set.txt, the DSP or dAVEBOx by ANY road, rather than each consumer
 * having to refuse it correctly (which is what failed — a guard on the
 * placeholder namespace silently swallowed the verdict that shared it).
 *
 * The resolver's answer arrives here as a HINT and never as a state. */
static identity_request_t identity_req;
static int  identity_have_request = 0;
static int  identity_req_n0 = 0;
static long identity_arm_ms = 0;
static loaded_set_record_t identity_published;
static int  identity_ever_published = 0;
static int  identity_hint_index = -1;
/* Move's index while a NONE is being shown for an index that resolves to no
 * dir. Held so the re-poll of that same unresolved index does not overwrite
 * the answer with a blank "New Set" on the very next tick; a real change of
 * index releases it. */
static int  loaded_unopened_empty_index = -1;

/* Arm a request. Called when a switch is actually set in motion: the relaunch
 * boot (the launcher applied relaunch_song_index) and the in-place actuator. */
void shadow_set_identity_arm(void)
{
    loaded_set_line_t line;
    loaded_set_read_line(&line);          /* n now; 0 when nothing said yet */

    identity_request_t r;
    if (!identity_read_and_consume_request(&r)) return;

    identity_req = r;
    identity_have_request = 1;
    identity_req_n0 = line.n;
    identity_arm_ms = loaded_set_now_ms();
}

/* The REQUEST FILE'S APPEARANCE is the signal — there is no cross-process call
 * to make. dAVEBOx runs in shadow_ui and the machine lives in the shim (inside
 * MoveOriginal), so the file is the only thing both can touch. It is written
 * before either actuator fires and consumed the moment it is seen.
 *
 * ⚠ ORDERING, stated rather than assumed. Arming must happen before Move can
 * log the load it is being asked for, or the confirming line would sit at or
 * below n0 and be correctly refused as stale — costing a timeout and a Retry,
 * never a wrong answer.
 *   · relaunch: EXACT. Move restarts, so the shim restarts with it and reads
 *     the file at n = 0 before Move has logged anything.
 *   · in-place actuator: the shim is live, so this depends on a poll landing
 *     between the write and Move's line. The actuator walks Move's overview
 *     over SECONDS while the poll runs every ~200 ms in that state, so the
 *     margin is large — but it IS a margin, not a proof. The failure mode is
 *     the safe one by construction, which is why this is acceptable rather
 *     than merely convenient. */
static void identity_poll_request(void)
{
    if (access(MOVE_INTENDED_SET_PATH, F_OK) != 0) return;
    shadow_set_identity_arm();
}

static int identity_record_differs(const loaded_set_record_t *a, const loaded_set_record_t *b)
{
    return a->state != b->state || a->reason != b->reason ||
           a->index != b->index ||
           strcmp(a->uuid, b->uuid) != 0 || strcmp(a->name, b->name) != 0;
}

/* Run one step and publish if the answer changed. `hint_*` is the resolver's
 * guess for this index — used ONLY to fill in the index of an OPEN that Move
 * confirmed, never to produce a state. */
static void identity_tick(int hint_index, const char *hint_name)
{
    loaded_set_line_t line;
    loaded_set_read_line(&line);

    loaded_set_input_t in;
    memset(&in, 0, sizeof(in));
    in.have_request = identity_have_request;
    if (identity_have_request) {
        snprintf(in.req_uuid, sizeof(in.req_uuid), "%s", identity_req.uuid);
        snprintf(in.req_name, sizeof(in.req_name), "%s", identity_req.name);
        in.req_index = identity_req.index;
    } else {
        in.req_index = -1;
    }
    in.req_n0 = identity_req_n0;
    in.line_n = line.n;
    in.line_uuid = line.n > 0 ? line.uuid : NULL;
    in.line_name = line.n > 0 ? line.name : NULL;
    in.elapsed_ms = loaded_set_now_ms() - identity_arm_ms;
    in.timeout_ms = LOADED_SET_REQUEST_TIMEOUT_MS;

    loaded_set_record_t rec;
    loaded_set_step(&in, &rec);

    /* An OPEN with no request carries no index of its own; the resolver's is
     * the only source for it, and it is a HINT — it names a pad, which is
     * cosmetic, never a save destination. */
    if (rec.state == LOADED_SET_OPEN && rec.index < 0) rec.index = hint_index;
    if (rec.state == LOADED_SET_OPEN && rec.name[0] == '\0' && hint_name)
        snprintf(rec.name, sizeof(rec.name), "%s", hint_name);

    /* A settled request stops being one, so a later spontaneous move by Move
     * is judged on its own terms rather than against a request nobody is
     * making any more. */
    if (rec.state != LOADED_SET_PENDING) identity_have_request = 0;

    if (identity_ever_published && !identity_record_differs(&rec, &identity_published)) return;

    /* One line per CHANGE — not per tick, so this is a handful of lines per
     * session. Identity was the least legible thing in this system: the
     * 2026-09-16 data loss ran for two whole sessions and the logs said
     * nothing, because nobody logs a value that looks fine. A state machine
     * that never says which state it is in reproduces exactly that.
     *
     * `elapsed` is measured from the arm, so this line is also the measurement
     * of how long Move takes to answer — the number the request timeout should
     * be set from, instead of the guess it currently is. */
    /* unified_log_important, not unified_log: this is one line per CHANGE, and
     * the best-effort logger drops a line whenever another thread holds the
     * mutex — which at a project switch is exactly when everything else is
     * logging. A dropped identity event reads as "no change happened", which is
     * the failure this whole subsystem exists to make impossible. The worker
     * thread is not the realtime path, so blocking briefly here is legal. */
    unified_log_important("shim", LOG_LEVEL_INFO,
                "identity: %s%s%s uuid=%s name=%s index=%d elapsed=%ldms%s",
                loaded_set_state_str(rec.state),
                rec.reason != LOADED_SET_REASON_NONE ? "/" : "",
                loaded_set_reason_str(rec.reason),
                rec.uuid[0] ? rec.uuid : "-",
                rec.name[0] ? rec.name : "-",
                rec.index,
                (long)(loaded_set_now_ms() - identity_arm_ms),
                in.have_request ? " (requested)" : "");

    identity_published = rec;
    identity_ever_published = 1;

    /* Only an OPEN has an identity to publish. PENDING and NONE publish an
     * EMPTY one — that is the point: downstream cannot name a project we have
     * not been told is open. The state itself travels in the fork-only
     * `active_set_state` param (shadow_chain_mgmt.c). */
    if (rec.state == LOADED_SET_OPEN)
        shadow_set_pages_publish(rec.name, rec.uuid);
    else
        shadow_set_pages_publish(rec.name, "");
}

/* The fork-only typed record, read by the host UI and dAVEBOx through
 * get_param("active_set_state"). Four lines: state, reason, index, seq. */
int shadow_set_identity_state(char *out, size_t out_len)
{
    return snprintf(out, out_len, "%s\n%s\n%d",
                    loaded_set_state_str(identity_published.state),
                    loaded_set_reason_str(identity_published.reason),
                    identity_published.index);
}

int shadow_set_tracking_forced_pending(void)
{
    /* Also poll at the fast cadence while a load is being verified, so a
     * confirmed switch publishes within a worker tick rather than 1.4 s. */
    return set_tracking_forced_index >= 0 || loaded_verify_active;
}

/* Poll Settings.json for currentSongIndex changes, then match via xattr.
 * Runs on the shim worker thread (~every 1.4 s; every ~200 ms while a forced
 * index is pending); publishes results via the snapshot above instead of
 * calling shadow_handle_set_loaded directly. */
void shadow_poll_current_set(void)
{
    static const char settings_path[] = "/data/UserData/settings/Settings.json";

    /* Before anything else: has dAVEBOx asked for a project since the last
     * tick? Arming first means the counter recorded as "before the request"
     * really is. */
    identity_poll_request();

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

    /* ⭑⭑ THE MACHINE TICKS ON EVERY POLL, before any index-change check.
     *
     * The gate used to live inside the resolver's directory scan, which is
     * skipped whenever Move's song index has not changed since the shim last
     * saw it. That made identity depend on the index MOVING — so a session
     * that opened the same project the shim already knew about never ticked,
     * never published, and left the module waiting on a record that was never
     * written. Caught on device 2026-09-16: a whole session with no identity
     * line and nothing saved.
     *
     * The machine is driven by Move's own log line and by elapsed time, and
     * neither of those has anything to do with the index changing. So it ticks
     * here, unconditionally, using whatever the resolver last hinted. The
     * resolver below still refines the hint when it does rescan.
     *
     * (Cheap: the tick reads one small file and returns early unless the
     * answer actually changed.) */
    identity_tick(song_index, NULL);

    /* Normal path: react when index changes.
     * Pending path: keep retrying the same unresolved index until a UUID appears. */
    /* Verification in flight for this very index: re-check the launcher's
     * answer only. The dir was already matched; rescanning the library five
     * times a second would buy nothing. */
    if (loaded_verify_active && song_index == loaded_verify_index &&
        song_index == sampler_last_song_index) {
        identity_tick(song_index, loaded_verify_name);
        return;
    }

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
            /* ⚠ Not published blindly: the index names a DIR, not what Move
             * opened. When a launcher provides Move's own answer
             * (MOVE_LOADED_SET_PATH, written by move-loaded-set-reader.sh),
             * the publish waits for it — see shadow_loaded_set_policy.h.
             * Without that launcher (an ordinary install) nothing changes. */
            if (access(MOVE_LOADED_SET_READER, F_OK) == 0) {
                if (song_index_changed || song_index != loaded_verify_index ||
                    strcmp(loaded_verify_uuid, entry->d_name) != 0) {
                    loaded_verify_index = song_index;
                    loaded_verify_start_ms = loaded_set_now_ms();
                    if (++loaded_verify_seq == 0) loaded_verify_seq = 1;
                }
                snprintf(loaded_verify_name, sizeof(loaded_verify_name), "%s", sub->d_name);
                snprintf(loaded_verify_uuid, sizeof(loaded_verify_uuid), "%s", entry->d_name);
                /* The resolver matched a dir. That is a HINT — it says which
                 * dir carries this index, never which set Move is holding.
                 * The gate decides. */
                if (identity_hint_index != song_index) {
                    identity_hint_index = song_index;
                    /* The resolver answered. It is a HINT and never a state —
                     * logged so the gap between it and Move's own word can be
                     * measured, which is what decides whether keeping the
                     * resolver buys anything at all. */
                    unified_log_important("shim", LOG_LEVEL_INFO,
                                "identity: hint index=%d dir=%s (resolver, NOT confirmation)",
                                song_index, sub->d_name);
                }
                identity_tick(song_index, sub->d_name);
            } else {
                loaded_verify_active = 0;
                shadow_set_pages_publish(sub->d_name, entry->d_name);
            }
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

    /* A relaunch asked for pad N but Move sits on an index with NO project
     * (an early pad press selected an empty pad, device 2026-09-15: intended 2,
     * Move on 19). That is not "a new set still materialising" — the user's
     * project did not open. Say so instead of presenting a blank set. */
    /* Once published, hold it: this path is re-polled while the index stays
     * unresolved, and falling through would overwrite the verdict with a
     * blank "New Set" on the very next poll. A real change of index (Move
     * moved on, or the user picked a set) releases it. */
    /* ⭑ The index resolves to no dir — either an empty pad, or a set still
     * materialising. Upstream's two branches below (the "did not open" case and
     * the placeholder mint) are LEFT AS THEY ARE; only what they PUBLISH is
     * re-pointed at the gate. The machine already distinguishes these cases
     * from Move's own word, so neither branch needs to invent an identity, and
     * keeping their structure keeps this fork's delta to the publish lines. */
    if (loaded_unopened_empty_index >= 0 && song_index == loaded_unopened_empty_index) return;
    loaded_unopened_empty_index = -1;
    {
        /* Nothing is confirmed open at this index. Tick the gate: it says
         * PENDING while a request is still outstanding and NONE when the
         * timeout says Move is not coming. No identity is minted here. */
        identity_tick(song_index, NULL);
        if (identity_published.state == LOADED_SET_NONE) {
            loaded_unopened_empty_index = song_index;
            sampler_pending_song_index = -1;
            return;
        }
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
    /* ⭑ The placeholder is still MINTED (upstream code, untouched) but it no
     * longer reaches anyone: the gate publishes the machine's answer instead.
     * A placeholder persisting into the next boot is what sent two sessions to
     * the fallback state file on 2026-09-16 — cutting it here, at the one choke
     * point, is what makes that unwritable rather than merely guarded against. */
    (void)pending_uuid;
    identity_tick(song_index, pending_name);
}
