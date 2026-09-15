/* dbx_state_subdir.h — the C side's rule for naming a project's state dir.
 *
 * A project is Sets/<uuid>/{<Name>/, <state>/}. Move opens the FIRST subfolder
 * its directory listing returns as the song, and on ext4 that order is a hash
 * of the name — so a fixed "dAVEBOx" lists before the song for about a fifth of
 * all song names, and Move opens the state dir as an empty set (measured
 * 2026-09-14, the set-folder order fix).
 *
 * So the state dir is "dAVEBOx" or "dAVEBOx~<n>", chosen per project: each
 * candidate is created and the real listing read back, first one that lists
 * after the song wins. No hash is computed, so it holds on any filesystem.
 *
 * ⚠ ONE RULE, THREE LANGUAGES. This header is the C copy, included by the shim
 * (boot read), shadow_ui.c (the host_state_subdir JS binding, which both the
 * host UI and dAVEBOx's UI call) and — as a BYTE-IDENTICAL copy in
 * davebox/dsp/ — the DSP, whose Docker build cannot see src/. The shell copy is
 * standalone/scripts/state_subdir.py. check-config.sh pins the copies equal and
 * the pattern + retry bound in both languages.
 *
 * Header-only and static inline so neither build needs a new object file. Never call
 * from the audio thread: it does directory I/O. */
#ifndef DBX_STATE_SUBDIR_H
#define DBX_STATE_SUBDIR_H

#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define DBX_STATE_BASE       "dAVEBOx"
#define DBX_STATE_PATTERN    "^dAVEBOx(~[0-9]+)?$"   /* documentation + pin; matched by hand below */
#define DBX_STATE_MAX_TRIES  256
#define DBX_STATE_NAME_MAX   64
#define DBX_STATE_LIST_MAX   32

/* The listing seam. `list` fills names[] with the NON-DOT child DIRECTORIES of
 * dir in filesystem order and returns the count (or -1); `is_song` says whether
 * dir/name holds Song.abl. Tests inject an order; production uses readdir. */
typedef struct {
    int (*list)(void *ctx, const char *dir, char names[][DBX_STATE_NAME_MAX], int max);
    int (*is_song)(void *ctx, const char *dir, const char *name);
    int (*mkdir_)(void *ctx, const char *path);   /* 0, or -1 with errno */
    int (*rmdir_)(void *ctx, const char *path);
    void *ctx;
} dbx_state_ops_t;

/* "dAVEBOx" or "dAVEBOx~<digits>", nothing else. */
static inline int dbx_state_is_name(const char *n) {
    size_t b = sizeof(DBX_STATE_BASE) - 1;
    if (strncmp(n, DBX_STATE_BASE, b) != 0) return 0;
    if (n[b] == '\0') return 1;
    if (n[b] != '~' || n[b + 1] == '\0') return 0;
    for (const char *p = n + b + 1; *p; p++)
        if (*p < '0' || *p > '9') return 0;
    return 1;
}

static inline void dbx_state_candidate(int n, char *out, size_t sz) {
    if (n == 0) snprintf(out, sz, "%s", DBX_STATE_BASE);
    else        snprintf(out, sz, "%s~%d", DBX_STATE_BASE, n);
}

/* ---- production ops ------------------------------------------------------ */
static inline int dbx_state_sys_list(void *ctx, const char *dir, char names[][DBX_STATE_NAME_MAX], int max) {
    (void)ctx;
    DIR *d = opendir(dir);
    if (!d) return -1;
    int n = 0;
    struct dirent *e;
    char p[1024];
    struct stat st;
    while (n < max && (e = readdir(d)) != NULL) {
        if (e->d_name[0] == '.') continue;
        if (strlen(e->d_name) >= DBX_STATE_NAME_MAX) continue;
        snprintf(p, sizeof(p), "%s/%s", dir, e->d_name);
        if (stat(p, &st) != 0 || !S_ISDIR(st.st_mode)) continue;
        snprintf(names[n++], DBX_STATE_NAME_MAX, "%s", e->d_name);
    }
    closedir(d);
    return n;
}
static inline int dbx_state_sys_is_song(void *ctx, const char *dir, const char *name) {
    (void)ctx;
    char p[1024];
    struct stat st;
    snprintf(p, sizeof(p), "%s/%s/Song.abl", dir, name);
    return stat(p, &st) == 0 && S_ISREG(st.st_mode);
}
static inline int dbx_state_sys_mkdir(void *ctx, const char *path) { (void)ctx; return mkdir(path, 0755); }
static inline int dbx_state_sys_rmdir(void *ctx, const char *path) { (void)ctx; return rmdir(path); }

/* ---- the rule ------------------------------------------------------------ */
static inline int dbx_state_index_of(char names[][DBX_STATE_NAME_MAX], int n, const char *want) {
    for (int i = 0; i < n; i++) if (!strcmp(names[i], want)) return i;
    return -1;
}

/* Resolve the state dir NAME for uuid_dir into out.
 *   existing state dir            -> that name (the LAST match in listing order,
 *                                     so a stray plain dAVEBOx re-created by a
 *                                     missed writer cannot shadow a chosen one)
 *   none, create == 0             -> "dAVEBOx" (a path to read; nothing made)
 *   none, create, no song folder  -> "dAVEBOx", created
 *   none, create, song folder     -> the chooser: first candidate that lists
 *                                     after the song, created; "dAVEBOx" if
 *                                     none does within DBX_STATE_MAX_TRIES
 * Returns 0 found, 1 chosen, 2 default. */
static inline int dbx_state_subdir_resolve_ops(const dbx_state_ops_t *ops, const char *uuid_dir,
                                        int create, char *out, size_t outsz) {
    char names[DBX_STATE_LIST_MAX][DBX_STATE_NAME_MAX];
    int n = ops->list(ops->ctx, uuid_dir, names, DBX_STATE_LIST_MAX);
    int song = -1, state = -1;
    for (int i = 0; i < n; i++) {
        if (dbx_state_is_name(names[i])) state = i;
        else if (song < 0 && ops->is_song(ops->ctx, uuid_dir, names[i])) song = i;
    }
    if (state >= 0) { snprintf(out, outsz, "%s", names[state]); return 0; }
    snprintf(out, outsz, "%s", DBX_STATE_BASE);
    if (!create || n < 0) return 2;
    char path[1024];
    if (song < 0) {
        snprintf(path, sizeof(path), "%s/%s", uuid_dir, DBX_STATE_BASE);
        ops->mkdir_(ops->ctx, path);
        return 2;
    }
    char song_name[DBX_STATE_NAME_MAX];
    snprintf(song_name, sizeof(song_name), "%s", names[song]);
    char cand[DBX_STATE_NAME_MAX];
    for (int t = 0; t < DBX_STATE_MAX_TRIES; t++) {
        dbx_state_candidate(t, cand, sizeof(cand));
        snprintf(path, sizeof(path), "%s/%s", uuid_dir, cand);
        if (ops->mkdir_(ops->ctx, path) != 0) {
            if (errno == EEXIST) continue;
            return 2;
        }
        int m = ops->list(ops->ctx, uuid_dir, names, DBX_STATE_LIST_MAX);
        int ci = dbx_state_index_of(names, m, cand);
        int si = dbx_state_index_of(names, m, song_name);
        if (ci >= 0 && si >= 0 && ci > si) { snprintf(out, outsz, "%s", cand); return 1; }
        ops->rmdir_(ops->ctx, path);
    }
    snprintf(path, sizeof(path), "%s/%s", uuid_dir, DBX_STATE_BASE);
    ops->mkdir_(ops->ctx, path);
    return 2;
}

static inline int dbx_state_subdir_resolve(const char *uuid_dir, int create, char *out, size_t outsz) {
    const dbx_state_ops_t sys_ops = {
        dbx_state_sys_list, dbx_state_sys_is_song, dbx_state_sys_mkdir, dbx_state_sys_rmdir, NULL
    };
    return dbx_state_subdir_resolve_ops(&sys_ops, uuid_dir, create, out, outsz);
}

#endif /* DBX_STATE_SUBDIR_H */
