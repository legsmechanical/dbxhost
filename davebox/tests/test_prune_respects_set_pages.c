/* tests/test_prune_respects_set_pages.c — the orphan prune must not delete the
 * state of a set that is merely parked on an inactive SET PAGE.
 *
 * The bug this pins destroyed real musical work. `prune_orphan_states` decided a
 * set was gone by a single stat() of UserLibrary/Sets/<uuid>. Schwung's set-pages
 * feature physically rename()s whole set folders OUT of Sets/ and into a stash
 * while a different page is active — so every set on an inactive page looked
 * deleted, and opening dAVEBOx erased its patterns, UI state and every snapshot.
 * No error, nothing to restore from. (Found 2026-08-04 while investigating set
 * pages; it had never fired only because set pages had not been used.)
 *
 * This is a behavioural test, not a source pin: it builds a real temp tree and
 * runs the real handler. That is why dsp/seq8.c gives the four base directories
 * #ifndef guards — a guard against irreversible deletion is worth little if it
 * cannot exercise the deletion.
 *
 * The macros MUST be defined before harness.h, which #includes seq8.c. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define PRUNE_TMP "/tmp/davebox-prune-test"

#define SEQ8_SETS_DIR        PRUNE_TMP "/Sets"
#define SEQ8_SET_STATE_DIR   PRUNE_TMP "/set_state"
#define SEQ8_SET_PAGES_DIR_A PRUNE_TMP "/set_pages"
#define SEQ8_SET_PAGES_DIR_B PRUNE_TMP "/dbx_set_pages"

#include "harness.h"

/* Real-shaped UUIDs — the prune only considers 36-char 8-4-4-4-12 hex names. */
#define UUID_LIVE  "11111111-1111-4111-8111-111111111111"  /* present in Sets/ */
#define UUID_PAGED "22222222-2222-4222-8222-222222222222"  /* stashed on a page */
#define UUID_GONE  "33333333-3333-4333-8333-333333333333"  /* genuinely deleted */

static void rm_rf(const char *path) {
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "rm -rf '%s'", path);
    if (system(cmd) != 0) { /* fresh tree either way */ }
}

static void mkdirs(const char *path) {
    char cmd[512];
    snprintf(cmd, sizeof(cmd), "mkdir -p '%s'", path);
    HX_ASSERT(system(cmd) == 0, "mkdir -p failed");
}

static void write_file(const char *path, const char *body) {
    FILE *f = fopen(path, "w");
    HX_ASSERT(f != NULL, "could not create fixture file");
    fputs(body, f);
    fclose(f);
}

static int exists(const char *path) {
    struct stat st;
    return stat(path, &st) == 0;
}

/* Give a set a full complement of dAVEBOx state, so the test covers the
 * snapshot sweep as well as the two top-level files. */
static void seed_state(const char *uuid) {
    char p[512];
    snprintf(p, sizeof(p), SEQ8_SET_STATE_DIR "/%s", uuid);
    mkdirs(p);
    snprintf(p, sizeof(p), SEQ8_SET_STATE_FMT, uuid);
    write_file(p, "{\"v\":36}\n");
    snprintf(p, sizeof(p), SEQ8_SET_UISTATE_FMT, uuid);
    write_file(p, "{\"v\":8}\n");
    snprintf(p, sizeof(p), SEQ8_SET_STATE_DIR "/%s/" SEQ8_SNAP_PREFIX "index.json", uuid);
    write_file(p, "{}\n");
}

static int state_present(const char *uuid) {
    char p[512];
    snprintf(p, sizeof(p), SEQ8_SET_STATE_FMT, uuid);
    return exists(p);
}

static int snapshot_present(const char *uuid) {
    char p[512];
    snprintf(p, sizeof(p), SEQ8_SET_STATE_DIR "/%s/" SEQ8_SNAP_PREFIX "index.json", uuid);
    return exists(p);
}

int main(void) {
    rm_rf(PRUNE_TMP);

    /* Sets/ holds only the live one. */
    mkdirs(SEQ8_SETS_DIR "/" UUID_LIVE);

    /* The paged set is parked in a stash — exactly what a page switch does.
     * Note the page directory name is arbitrary: the fix enumerates whatever is
     * in the stash rather than assuming page_0..N, so that a future re-layout
     * cannot quietly reintroduce the bug. */
    mkdirs(SEQ8_SET_PAGES_DIR_A "/page_3/" UUID_PAGED);

    /* UUID_GONE exists nowhere but in set_state — a genuine orphan. */
    seed_state(UUID_LIVE);
    seed_state(UUID_PAGED);
    seed_state(UUID_GONE);

    HX_ASSERT(state_present(UUID_LIVE),  "fixture: live state missing");
    HX_ASSERT(state_present(UUID_PAGED), "fixture: paged state missing");
    HX_ASSERT(state_present(UUID_GONE),  "fixture: orphan state missing");

    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "instance creation failed");

    hx_set_param(h, "prune_orphan_states", "1");

    /* 1. A set present in Sets/ is untouched. */
    HX_ASSERT(state_present(UUID_LIVE),    "prune deleted state for a set still in Sets/");
    HX_ASSERT(snapshot_present(UUID_LIVE), "prune deleted snapshots for a set still in Sets/");

    /* 2. THE REGRESSION: a set parked on an inactive page is NOT an orphan. */
    HX_ASSERT(state_present(UUID_PAGED),
              "prune deleted the state of a set stashed on an inactive SET PAGE "
              "— this is the data-loss bug; a paged set is alive, not deleted");
    HX_ASSERT(snapshot_present(UUID_PAGED),
              "prune deleted the SNAPSHOTS of a set stashed on an inactive set page");

    /* 3. It must still do its job: a truly absent set is pruned. A fix that
     *    simply stopped deleting would pass 1 and 2 and be useless. */
    HX_ASSERT(!state_present(UUID_GONE),
              "prune no longer removes genuinely orphaned state — the feature is dead");
    HX_ASSERT(!snapshot_present(UUID_GONE),
              "prune no longer removes snapshots of genuinely orphaned sets");

    hx_destroy(h);
    rm_rf(PRUNE_TMP);
    printf("PASS: orphan prune spares set-page-stashed sets, still prunes real orphans\n");
    return 0;
}
