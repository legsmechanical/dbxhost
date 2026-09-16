/* tests/test_state_no_identity.c — "no project" is not a destination.
 *
 * THE BUG THIS PINS: the DSP used to resolve its own identity at
 * create_instance (a read of active_set.txt) and to keep an install-wide
 * fallback state file for when that came up empty. Two sessions on 2026-09-16
 * therefore ran their whole lives against that fallback — inside the STOCK
 * install, which is not ours to write to — while the project the user had
 * picked was never touched once. Nothing logged, nothing failed; the work
 * simply was not where anybody would look for it.
 *
 * The fix is a deletion, so what has to be pinned is the ABSENCE of a
 * destination: a fresh instance has no path and no uuid, an empty `state_load`
 * is refused rather than aimed somewhere default, and a save that somehow
 * arrives with no identity is PARKED in our own tree instead of guessing.
 *
 * Both device roots are redirected into a temp tree below (seq8.c guards each
 * with #ifndef), which is also what proves the log and the quarantine hang off
 * one install-dir constant rather than being spelled out separately. */
#define SEQ8_DBX_DIR        "/tmp/davebox-tests/noident-dbx"
#define SEQ8_SET_STATE_ROOT "/tmp/davebox-tests/noident-sets"

#include "harness.h"
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#define PLANTED_UUID "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
#define QDIR         SEQ8_DBX_DIR "/quarantine"

static void rm_tree_children(const char *dir) {
    DIR *d = opendir(dir);
    if (!d) return;
    struct dirent *e;
    while ((e = readdir(d))) {
        if (e->d_name[0] == '.') continue;
        char p[512];
        snprintf(p, sizeof(p), "%s/%s", dir, e->d_name);
        unlink(p);
    }
    closedir(d);
}

/* Names of the non-dot entries in dir (count returned; first name copied). */
static int dir_entries(const char *dir, char *first, size_t fsz) {
    if (first && fsz) first[0] = '\0';
    DIR *d = opendir(dir);
    if (!d) return 0;
    int n = 0;
    struct dirent *e;
    while ((e = readdir(d))) {
        if (e->d_name[0] == '.') continue;
        if (n == 0 && first && fsz) snprintf(first, fsz, "%s", e->d_name);
        n++;
    }
    closedir(d);
    return n;
}

static void mkpath(const char *p) { mkdir(p, 0755); }

int main(void) {
    mkpath("/tmp/davebox-tests");
    mkpath(SEQ8_DBX_DIR);
    mkpath(SEQ8_SET_STATE_ROOT);
    mkpath(QDIR);
    rm_tree_children(QDIR);

    /* ---- Plant a complete, loadable project AND the identity file the DSP
     * used to read, so "it did not load" cannot be explained away as "there
     * was nothing to load". ---- */
    char planted_dir[384], planted_state[512];
    snprintf(planted_dir, sizeof(planted_dir),
             SEQ8_SET_STATE_ROOT "/" PLANTED_UUID);
    mkpath(planted_dir);
    {
        char sub[512];
        snprintf(sub, sizeof(sub), "%s/dAVEBOx", planted_dir);
        mkpath(sub);
        snprintf(planted_state, sizeof(planted_state),
                 "%s/" SEQ8_STATE_PREFIX "-state.json", sub);
    }
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create for the planted project failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "bpm", "137");
        strncpy(inst->state_path, planted_state, sizeof(inst->state_path) - 1);
        seq8_save_state(inst);
        hx_destroy(h);
        FILE *f = fopen(planted_state, "r");
        HX_ASSERT(f, "the planted project did not reach disk");
        fclose(f);
    }
    /* The old identity file, in the old place, naming that project. */
    {
        FILE *af = fopen(SEQ8_DBX_DIR "/active_set.txt", "w");
        HX_ASSERT(af, "cannot write the planted active_set.txt");
        fputs(PLANTED_UUID "\nPlanted Project\n", af);
        fclose(af);
    }

    /* ---- 1. A fresh instance adopts NOTHING. ---- */
    {
        hx_t *h = hx_create_raw(NULL);
        HX_ASSERT(h, "raw create failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(inst->awaiting_select == 1,
                  "create_instance must come up awaiting a selection");
        HX_ASSERT(inst->state_uuid[0] == '\0',
                  "create_instance resolved an identity — it must be told, never ask");
        HX_ASSERT(inst->state_path[0] == '\0',
                  "create_instance chose a state path — there is no default destination");
        char buf[64] = {0};
        hx_get_param(h, "bpm", buf, sizeof(buf));
        HX_ASSERT(atoi(buf) != 137,
                  "create_instance LOADED the planted project — it read an identity file");
        hx_destroy(h);
    }

    /* ---- 2. An empty state_load is REFUSED, not aimed at a default. ---- */
    {
        hx_t *h = hx_create_raw(NULL);
        HX_ASSERT(h, "create for the empty-load case failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "state_load", "");
        HX_ASSERT(inst->state_path[0] == '\0',
                  "state_load(\"\") put the instance on a path — an empty identity is no project");
        HX_ASSERT(inst->state_uuid[0] == '\0',
                  "state_load(\"\") invented an identity");
        HX_ASSERT(inst->awaiting_select == 1,
                  "state_load(\"\") counted as the selection — saving is now unguarded");
        hx_destroy(h);
    }

    /* ---- 3. A CLEAN instance with no identity writes nothing at all.
     * Defaults are not work: this is the crash-before-init case and parking it
     * would fill the quarantine with empty files nobody wants. ---- */
    rm_tree_children(QDIR);
    {
        hx_t *h = hx_create(NULL);          /* live, but never given an identity */
        HX_ASSERT(h, "create for the clean case failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        inst->state_dirty = 0;
        seq8_save_state(inst);
        HX_ASSERT(dir_entries(QDIR, NULL, 0) == 0,
                  "a CLEAN identity-less save parked defaults — nothing was at stake");
        hx_destroy(h);
    }

    /* ---- 4. A DIRTY instance with no identity is PARKED in OUR tree, under a
     * per-instance name, and nothing is adopted as a result. ---- */
    rm_tree_children(QDIR);
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create for the dirty case failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "bpm", "149");
        inst->state_dirty = 1;
        seq8_save_state(inst);

        char name[256];
        int n = dir_entries(QDIR, name, sizeof(name));
        HX_ASSERT(n == 1,
                  "a DIRTY identity-less save did not park exactly one file");
        HX_ASSERT(!strncmp(name, SEQ8_STATE_PREFIX "-", sizeof(SEQ8_STATE_PREFIX)),
                  "the parked file is not named for this module");
        HX_ASSERT(strstr(name, ".json"),
                  "the parked file is not a state blob");

        /* It really holds the work, or parking it was pointless. */
        char full[512];
        snprintf(full, sizeof(full), "%s/%s", QDIR, name);
        FILE *f = fopen(full, "r");
        HX_ASSERT(f, "the parked file cannot be opened");
        char body[8192] = {0};
        size_t got = fread(body, 1, sizeof(body) - 1, f);
        fclose(f);
        HX_ASSERT(got > 0 && strstr(body, "\"bpm\":149"),
                  "the parked file does not contain the work that was at stake");

        /* Parking is not adoption: the instance still has no project. */
        HX_ASSERT(inst->state_uuid[0] == '\0' && inst->state_path[0] == '\0',
                  "parking a save gave the instance an identity it never earned");

        /* A second save parks a SEPARATE file — a park is evidence, and
         * evidence that overwrites itself is worse than none. */
        inst->state_dirty = 1;
        sleep(1);                    /* the name carries a whole-second stamp */
        seq8_save_state(inst);
        HX_ASSERT(dir_entries(QDIR, NULL, 0) == 2,
                  "the second park overwrote the first");
        hx_destroy(h);
    }

    /* ---- 5. Nothing this build writes for state or logging lands in the
     * STOCK install. Both constants derive from one install-dir define, so
     * redirecting that define moves them; if either had kept its own literal,
     * this would still point at /data/UserData/schwung. ---- */
    HX_ASSERT(!strstr(SEQ8_LOG_PATH, "/data/UserData/schwung"),
              "the log path still points into the stock install");
    HX_ASSERT(!strstr(SEQ8_QUARANTINE_DIR, "/data/UserData/schwung"),
              "the quarantine still points into the stock install");
    HX_ASSERT(!strncmp(SEQ8_LOG_PATH, SEQ8_DBX_DIR, sizeof(SEQ8_DBX_DIR) - 1),
              "the log path does not derive from the install dir");
    HX_ASSERT(!strncmp(SEQ8_QUARANTINE_DIR, SEQ8_DBX_DIR, sizeof(SEQ8_DBX_DIR) - 1),
              "the quarantine does not derive from the install dir");

    rm_tree_children(QDIR);
    printf("PASS: no identity is no destination — nothing is guessed, nothing is lost\n");
    return 0;
}
