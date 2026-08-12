/* tests/test_prune_respects_live_roots.c — the orphan prune must not delete the
 * state of a set that is alive in a root other than Sets/.
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
#define SEQ8_SET_LIBRARY_DIR PRUNE_TMP "/library"

#include "harness.h"

/* Real-shaped UUIDs — the prune only considers 36-char 8-4-4-4-12 hex names. */
#define UUID_LIVE  "11111111-1111-4111-8111-111111111111"  /* present in Sets/ */
#define UUID_GONE  "33333333-3333-4333-8333-333333333333"  /* genuinely deleted */
#define UUID_LIB   "44444444-4444-4444-8444-444444444444"  /* in the SA library */

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

    /* The SA project library: where set-swap.sh parks the standalone sets while
     * no session runs. Sets/ then holds the user's NATIVE sets, so a liveness
     * test that only knows about Sets/ calls EVERY standalone project dead. The
     * prune only runs in-session today, which is the sole reason that has never
     * fired — a guard whose correctness rests on a caller's timing is one
     * refactor from data loss. */
    mkdirs(SEQ8_SET_LIBRARY_DIR "/" UUID_LIB);

    /* UUID_GONE exists nowhere but in set_state — a genuine orphan. */
    seed_state(UUID_LIVE);
    seed_state(UUID_LIB);
    seed_state(UUID_GONE);

    HX_ASSERT(state_present(UUID_LIVE),  "fixture: live state missing");
    HX_ASSERT(state_present(UUID_LIB),   "fixture: library state missing");
    HX_ASSERT(state_present(UUID_GONE),  "fixture: orphan state missing");

    hx_t *h = hx_create(NULL);
    HX_ASSERT(h != NULL, "instance creation failed");

    hx_set_param(h, "prune_orphan_states", "1");

    /* 1. A set present in Sets/ is untouched. */
    HX_ASSERT(state_present(UUID_LIVE),    "prune deleted state for a set still in Sets/");
    HX_ASSERT(snapshot_present(UUID_LIVE), "prune deleted snapshots for a set still in Sets/");

    /* 2. THE REGRESSION SHAPE: a set that is alive in a root OTHER than Sets/.
     *    (The original case was a set stashed on an inactive SET PAGE; that
     *    feature died in P3 and its arm was removed 2026-08-12. The SA library
     *    is the same bug with a bigger blast radius — outside a session Sets/
     *    holds the user's NATIVE sets, so a Sets/-only test calls every
     *    standalone project deleted.) */
    HX_ASSERT(state_present(UUID_LIB),
              "prune deleted the state of a set in the SA LIBRARY — that is where "
              "every standalone project lives while no session runs");
    HX_ASSERT(snapshot_present(UUID_LIB),
              "prune deleted the SNAPSHOTS of a set in the SA library");

    /* 3. It must still do its job: a truly absent set is pruned. A fix that
     *    simply stopped deleting would pass 1 and 2 and be useless. */
    HX_ASSERT(!state_present(UUID_GONE),
              "prune no longer removes genuinely orphaned state — the feature is dead");
    HX_ASSERT(!snapshot_present(UUID_GONE),
              "prune no longer removes snapshots of genuinely orphaned sets");

    hx_destroy(h);
    rm_rf(PRUNE_TMP);
    printf("PASS: orphan prune spares sets alive in ANY live root, still prunes real orphans\n");
    return 0;
}
