/* tests/test_state_subdir_path.c — the DSP files state in the RESOLVED state
 * dir, never a spelled `dAVEBOx/` (set-folder order fix, S8).
 *
 * Move opens the first subfolder of Sets/<uuid>/ it lists as the song, so the
 * state dir is `dAVEBOx` or `dAVEBOx~<n>` per project (dsp/dbx_state_subdir.h).
 * A reader that still spells `dAVEBOx` loads nothing for a `dAVEBOx~3` project,
 * and a writer that spells it RE-CREATES a plain `dAVEBOx/` — which can list
 * before the song and reopen the very bug.
 *
 * The set library is redirected to a temp tree (SEQ8_SETS_DIR, the harness's
 * documented seam) so real directories are made and listed. Listing ORDER is
 * the host unit's job (tests/host/test_dbx_state_subdir.c injects it); this
 * pins that every DSP path goes through the rule:
 *   1. state_load of a project holding `dAVEBOx~3` builds its path there;
 *   2. a save into it writes there and creates NO plain `dAVEBOx/`;
 *   3. a project's FIRST save (no state dir yet) creates exactly one state
 *      dir, through the chooser, and the file lands in it;
 *   4. the path is re-resolved per save, so a state dir chosen by the UI after
 *      the load is followed rather than shadowed by a plain `dAVEBOx/`. */
#define SEQ8_SETS_DIR "/tmp/davebox-tests/state_subdir_sets"
#include "harness.h"
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#define ROOT SEQ8_SETS_DIR
#define U1 "11111111-aaaa-4bbb-8ccc-000000000001"
#define U2 "22222222-aaaa-4bbb-8ccc-000000000002"

static int exists(const char *p) { struct stat st; return stat(p, &st) == 0; }
static void mk(const char *p) { mkdir(p, 0755); }
static void song(const char *uuid, const char *name) {
    char p[512];
    snprintf(p, sizeof(p), ROOT "/%s", uuid); mk(p);
    snprintf(p, sizeof(p), ROOT "/%s/%s", uuid, name); mk(p);
    snprintf(p, sizeof(p), ROOT "/%s/%s/Song.abl", uuid, name);
    FILE *f = fopen(p, "w"); if (f) { fputs("{}", f); fclose(f); }
}
static int count_state_dirs(const char *uuid, char *last, size_t sz) {
    char p[512];
    snprintf(p, sizeof(p), ROOT "/%s", uuid);
    DIR *d = opendir(p);
    int n = 0;
    struct dirent *e;
    if (!d) return -1;
    while ((e = readdir(d)) != NULL)
        if (dbx_state_is_name(e->d_name)) { n++; snprintf(last, sz, "%s", e->d_name); }
    closedir(d);
    return n;
}

int main(void) {
    HX_ASSERT(system("rm -rf " ROOT " && mkdir -p " ROOT) == 0, "temp set library");

    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* 1. an existing chosen state dir is where the path points */
    song(U1, "Project 32");
    mk(ROOT "/" U1 "/dAVEBOx~3");
    hx_set_param(h, "state_load", U1);
    HX_ASSERT(!strcmp(inst->state_path, ROOT "/" U1 "/dAVEBOx~3/" SEQ8_STATE_PREFIX "-state.json"),
              "state_load resolves the existing dAVEBOx~3, not a spelled dAVEBOx");

    /* 2. the save lands there and makes no plain dAVEBOx/ beside it */
    inst->awaiting_select = 0;
    hx_set_param(h, "save", "1");
    HX_ASSERT(exists(ROOT "/" U1 "/dAVEBOx~3/" SEQ8_STATE_PREFIX "-state.json"),
              "save wrote into dAVEBOx~3");
    HX_ASSERT(!exists(ROOT "/" U1 "/dAVEBOx"),
              "save did NOT re-create a plain dAVEBOx/ (it can list before the song)");

    /* 3. first save of a project with no state dir: one dir, via the chooser */
    song(U2, "Project 14");
    hx_set_param(h, "state_load", U2);
    HX_ASSERT(!exists(ROOT "/" U2 "/dAVEBOx"), "state_load (a READ) made no directory");
    inst->awaiting_select = 0;
    hx_set_param(h, "save", "1");
    char name[64] = "";
    HX_ASSERT(count_state_dirs(U2, name, sizeof(name)) == 1, "first save made exactly one state dir");
    char want[512];
    snprintf(want, sizeof(want), ROOT "/" U2 "/%s/" SEQ8_STATE_PREFIX "-state.json", name);
    HX_ASSERT(!strcmp(inst->state_path, want) && exists(want),
              "first save's file is inside the dir the chooser made");

    /* 4. the path is RE-RESOLVED at save: loaded while the project had no state
     * dir (path = default), then the UI's first write chose `dAVEBOx~5` (the
     * host_state_subdir binding runs the same chooser). The save must follow
     * it — not ensure_parent_dir a second, plain `dAVEBOx/` into existence. */
    #define U3 "33333333-aaaa-4bbb-8ccc-000000000003"
    song(U3, "Project 22");
    hx_set_param(h, "state_load", U3);
    mk(ROOT "/" U3 "/dAVEBOx~5");
    inst->awaiting_select = 0;
    hx_set_param(h, "save", "1");
    HX_ASSERT(exists(ROOT "/" U3 "/dAVEBOx~5/" SEQ8_STATE_PREFIX "-state.json"),
              "save re-resolved to the dAVEBOx~5 the UI chose after the load");
    HX_ASSERT(!exists(ROOT "/" U3 "/dAVEBOx"),
              "save made no second, plain dAVEBOx/ beside it");

    system("rm -rf " ROOT);
    printf("PASS: state subdir path (load resolves dAVEBOx~3, save keeps it, first save chooses)\n");
    return 0;
}
