/* test_dbx_state_subdir.c — the C copy of the state-dir naming rule, under
 * an INJECTED listing order (set-folder order fix, S8).
 *
 * The device's measured loser: "Project 32" lists AFTER `dAVEBOx`, `dAVEBOx~1`
 * and `dAVEBOx~2`, BEFORE `dAVEBOx~3`. A fake in-memory directory ranks names by
 * that table, so the chooser's mkdir/list/rmdir loop runs exactly as on ext4.
 * The same cases as the shell copy's test (tests/host/test_state_subdir_order.sh). */
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include "dbx_state_subdir.h"

static int fails = 0;
#define CHECK(c, m) do { if (c) printf("  ok   %s\n", m); else { printf("  FAIL %s\n", m); fails = 1; } } while (0)

/* ---- a fake directory ---------------------------------------------------- */
typedef struct {
    char names[16][DBX_STATE_NAME_MAX];
    int n;
    const char *song;              /* which entry holds Song.abl */
    const char *const *rank;       /* listing order: ranked names first, rest after */
    int mkdirs;
    int state_first;               /* every state name outranks everything */
} fakedir_t;

static int rank_of(fakedir_t *f, const char *n) {
    if (f->state_first) return dbx_state_is_name(n) ? 0 : 1;
    for (int i = 0; f->rank[i]; i++) if (!strcmp(f->rank[i], n)) return i;
    return 1000;
}
static const char *base(const char *p) { const char *s = strrchr(p, '/'); return s ? s + 1 : p; }

static int f_list(void *ctx, const char *dir, char out[][DBX_STATE_NAME_MAX], int max) {
    (void)dir;
    fakedir_t *f = ctx;
    int idx[16], k = 0;
    for (int i = 0; i < f->n; i++) idx[k++] = i;
    for (int i = 1; i < k; i++)                 /* stable insertion sort by rank */
        for (int j = i; j > 0 && rank_of(f, f->names[idx[j - 1]]) > rank_of(f, f->names[idx[j]]); j--) {
            int t = idx[j]; idx[j] = idx[j - 1]; idx[j - 1] = t;
        }
    int m = k < max ? k : max;
    for (int i = 0; i < m; i++) snprintf(out[i], DBX_STATE_NAME_MAX, "%s", f->names[idx[i]]);
    return m;
}
static int f_is_song(void *ctx, const char *dir, const char *name) {
    (void)dir; fakedir_t *f = ctx; return f->song && !strcmp(f->song, name);
}
static int f_mkdir(void *ctx, const char *path) {
    fakedir_t *f = ctx; const char *b = base(path);
    for (int i = 0; i < f->n; i++) if (!strcmp(f->names[i], b)) { errno = EEXIST; return -1; }
    snprintf(f->names[f->n++], DBX_STATE_NAME_MAX, "%s", b);
    f->mkdirs++;
    return 0;
}
static int f_rmdir(void *ctx, const char *path) {
    fakedir_t *f = ctx; const char *b = base(path);
    for (int i = 0; i < f->n; i++) if (!strcmp(f->names[i], b)) {
        f->names[i][0] = 0; memmove(f->names[i], f->names[i + 1], (size_t)(f->n - i - 1) * sizeof(f->names[0]));
        f->n--; return 0;
    }
    return -1;
}
static int has(fakedir_t *f, const char *n) {
    for (int i = 0; i < f->n; i++) if (!strcmp(f->names[i], n)) return 1;
    return 0;
}
static void add(fakedir_t *f, const char *n) { snprintf(f->names[f->n++], DBX_STATE_NAME_MAX, "%s", n); }

static const char *const LOSING[] = { "dAVEBOx", "dAVEBOx~1", "dAVEBOx~2", "Project 32", "dAVEBOx~3", NULL };

int main(void) {
    printf("test_dbx_state_subdir\n");
    char out[DBX_STATE_NAME_MAX];

    CHECK(dbx_state_is_name("dAVEBOx") && dbx_state_is_name("dAVEBOx~1") && dbx_state_is_name("dAVEBOx~255"),
          "names: dAVEBOx and dAVEBOx~<digits> match");
    CHECK(!dbx_state_is_name("dAVEBOx~") && !dbx_state_is_name("dAVEBOx~3a") && !dbx_state_is_name("xdAVEBOx")
          && !dbx_state_is_name("dAVEBOx Copy") && !dbx_state_is_name("davebox"),
          "names: near misses do not");

    /* CONTROL: the fake really lists a plain dAVEBOx before the song. */
    {
        fakedir_t f = { .rank = LOSING, .song = "Project 32" };
        add(&f, "Project 32"); add(&f, "dAVEBOx");
        char l[4][DBX_STATE_NAME_MAX];
        int n = f_list(&f, "", l, 4);
        CHECK(n == 2 && !strcmp(l[0], "dAVEBOx"), "control: the injected order puts dAVEBOx first");
    }
    dbx_state_ops_t ops = { f_list, f_is_song, f_mkdir, f_rmdir, NULL };

    /* creation path runs the chooser */
    {
        fakedir_t f = { .rank = LOSING, .song = "Project 32" };
        add(&f, "Project 32");
        ops.ctx = &f;
        int r = dbx_state_subdir_resolve_ops(&ops, "/x", 1, out, sizeof(out));
        CHECK(r == 1 && !strcmp(out, "dAVEBOx~3"), "create: the chooser picks dAVEBOx~3");
        CHECK(f.n == 2 && has(&f, "dAVEBOx~3") && !has(&f, "dAVEBOx") && !has(&f, "dAVEBOx~1") && !has(&f, "dAVEBOx~2"),
              "create: losers removed, only the winner left");
        r = dbx_state_subdir_resolve_ops(&ops, "/x", 1, out, sizeof(out));
        CHECK(r == 0 && !strcmp(out, "dAVEBOx~3") && f.n == 2, "create again: finds it, makes nothing");
    }
    /* read path makes nothing */
    {
        fakedir_t f = { .rank = LOSING, .song = "Project 32" };
        add(&f, "Project 32");
        ops.ctx = &f;
        int r = dbx_state_subdir_resolve_ops(&ops, "/x", 0, out, sizeof(out));
        CHECK(r == 2 && !strcmp(out, "dAVEBOx") && f.n == 1 && f.mkdirs == 0, "read (create=0): default name, nothing made");
    }
    /* two matches: the last listed wins */
    {
        fakedir_t f = { .rank = LOSING, .song = "Project 32" };
        add(&f, "dAVEBOx~3"); add(&f, "Project 32"); add(&f, "dAVEBOx");
        ops.ctx = &f;
        dbx_state_subdir_resolve_ops(&ops, "/x", 1, out, sizeof(out));
        CHECK(!strcmp(out, "dAVEBOx~3"), "a stray plain dAVEBOx does not shadow a chosen dAVEBOx~3");
    }
    /* no song folder: plain name, created */
    {
        fakedir_t f = { .rank = LOSING, .song = NULL };
        ops.ctx = &f;
        dbx_state_subdir_resolve_ops(&ops, "/x", 1, out, sizeof(out));
        CHECK(!strcmp(out, "dAVEBOx") && has(&f, "dAVEBOx"), "no song folder: dAVEBOx, created");
    }
    /* a listing where EVERY state name lists first never converges: bounded
     * (DBX_STATE_MAX_TRIES), no probe dirs left, falls back to the plain name */
    {
        fakedir_t f = { .rank = LOSING, .song = "Project 32", .state_first = 1 };
        add(&f, "Project 32");
        ops.ctx = &f;
        int r = dbx_state_subdir_resolve_ops(&ops, "/x", 1, out, sizeof(out));
        CHECK(r == 2 && !strcmp(out, "dAVEBOx") && f.n == 2 && has(&f, "dAVEBOx")
              && f.mkdirs == DBX_STATE_MAX_TRIES + 1,
              "never converging: 256 tries, then the plain name, nothing else left behind");
    }

    if (fails) { printf("FAIL: dbx_state_subdir\n"); return 1; }
    printf("PASS: dbx_state_subdir\n");
    return 0;
}
