/* tests/test_select_before_load.c — SELECT-BEFORE-LOAD.
 *
 * The session marker means "the user has not chosen a project yet", so
 * create_instance comes up EMPTY and every save path is refused until a real
 * load lands. The refusal is the whole point: an unloaded instance holds
 * defaults, and letting it serialize would overwrite the boot project's state
 * file with an empty one — silent, total data loss on a session the user never
 * opened. These assertions are the guard rail for that, so treat a failure
 * here as "we are about to eat someone's work", not as a stale pin.
 *
 * SEQ8_SELECT_MARKER is redirected to a temp path below (seq8.c guards the
 * define with #ifndef) so the test never touches a device path. */
#define SEQ8_SELECT_MARKER "/tmp/davebox-tests/select-marker"

#include "harness.h"
#include <unistd.h>

#define STATE_TMP "/tmp/davebox-tests/select-state.json"

static void marker_write(const char *body) {
    FILE *f = fopen(SEQ8_SELECT_MARKER, "w");
    HX_ASSERT(f, "cannot write marker");
    if (body && *body) fputs(body, f);
    fclose(f);
}

static char *slurp(const char *path, long *len_out) {
    FILE *f = fopen(path, "r");
    if (!f) { *len_out = -1; return NULL; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = (char *)malloc((size_t)n + 1);
    HX_ASSERT(buf, "oom");
    size_t got = fread(buf, 1, (size_t)n, f);
    fclose(f);
    buf[got] = '\0';
    *len_out = (long)got;
    return buf;
}

int main(void) {
    unlink(SEQ8_SELECT_MARKER);
    unlink(STATE_TMP);

    /* --- A real project on disk: populate an ordinary instance and save it. --- */
    long ref_len = 0;
    char *ref = NULL;
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create A failed");
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(inst->awaiting_select == 0,
                  "no marker => ordinary boot, must NOT be awaiting");

        /* Something recognizable that survives serialize/load. */
        hx_set_param(h, "bpm", "137");
        hx_set_param(h, "t0_c0_toggle", "4");

        strncpy(inst->state_path, STATE_TMP, sizeof(inst->state_path) - 1);
        seq8_save_state(inst);
        ref = slurp(STATE_TMP, &ref_len);
        HX_ASSERT(ref && ref_len > 0, "reference project did not save");
        hx_destroy(h);
    }

    /* --- Marker present: create_instance must skip the load entirely. --- */
    marker_write("1\n");
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create B failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->awaiting_select == 1,
              "marker present => must come up awaiting selection");

    strncpy(inst->state_path, STATE_TMP, sizeof(inst->state_path) - 1);

    /* Defaults, not the saved project — nothing was loaded. */
    {
        char buf[64] = {0};
        hx_get_param(h, "bpm", buf, sizeof(buf));
        HX_ASSERT(atoi(buf) != 137, "state was loaded despite the marker");
    }

    /* The readback JS gates on. */
    {
        char buf[16] = {0};
        hx_get_param(h, "awaiting_select", buf, sizeof(buf));
        HX_ASSERT(!strcmp(buf, "1"), "awaiting_select get_param must report 1");
    }

    /* THE GUARD: an explicit save must not touch the real project's file. */
    seq8_save_state(inst);
    {
        long n = 0;
        char *after = slurp(STATE_TMP, &n);
        HX_ASSERT(after && n == ref_len && !memcmp(after, ref, (size_t)n),
                  "save while awaiting OVERWROTE the project state file");
        free(after);
    }

    /* Same guard on the deferred path: state_full must stay empty even dirty,
     * so JS never gets a payload to write. */
    inst->state_dirty = 1;
    {
        char buf[4096] = {0};
        int n = hx_get_param(h, "state_full", buf, sizeof(buf));
        HX_ASSERT(n == 0 && buf[0] == '\0',
                  "state_full served an empty instance while awaiting");
    }

    /* --- The selection: a load clears the flag and restores normal service. --- */
    seq8_load_state(inst);
    HX_ASSERT(inst->awaiting_select == 0, "a load must clear awaiting_select");
    {
        char buf[64] = {0};
        hx_get_param(h, "bpm", buf, sizeof(buf));
        HX_ASSERT(atoi(buf) == 137, "load did not restore the project");
    }

    /* Saving works again. */
    hx_set_param(h, "bpm", "101");
    seq8_save_state(inst);
    {
        long n = 0;
        char *after = slurp(STATE_TMP, &n);
        HX_ASSERT(after && n > 0 && (n != ref_len || memcmp(after, ref, (size_t)n)),
                  "save after selection did not reach disk");
        free(after);
    }

    /* A brand-new project has no state file on disk. The flag must still clear
     * — otherwise the user records into it and every save is silently dropped. */
    {
        hx_destroy(h);
        marker_write("1\n");
        hx_t *h2 = hx_create(NULL);
        HX_ASSERT(h2, "create C failed");
        seq8_instance_t *i2 = (seq8_instance_t *)h2->inst;
        HX_ASSERT(i2->awaiting_select == 1, "C should start awaiting");
        strncpy(i2->state_path, "/tmp/davebox-tests/select-absent.json",
                sizeof(i2->state_path) - 1);
        unlink("/tmp/davebox-tests/select-absent.json");
        seq8_load_state(i2);
        HX_ASSERT(i2->awaiting_select == 0,
                  "load of an ABSENT state file must still count as the selection");
        hx_destroy(h2);
    }

    /* A version mismatch is PRODUCED BY the load, so under select-before-load
     * it does not exist until the user selects. Pin that ordering: awaiting =>
     * mismatch is 0 (nothing read it yet), and only the load raises it. JS must
     * therefore re-read the key AFTER the load lands — reading it before, as
     * init() used to, now always sees 0 and the "Incompatible State" dialog
     * never appears, leaving a blank session that silently refuses to save. */
    {
        const char *badpath = "/tmp/davebox-tests/select-badversion.json";
        FILE *bf = fopen(badpath, "w");
        HX_ASSERT(bf, "cannot write old-format state");
        fputs("{\"v\":1}", bf);
        fclose(bf);

        marker_write("1\n");
        hx_t *h4 = hx_create(NULL);
        HX_ASSERT(h4, "create E failed");
        seq8_instance_t *i4 = (seq8_instance_t *)h4->inst;
        HX_ASSERT(i4->awaiting_select == 1, "E should start awaiting");
        HX_ASSERT(i4->state_version_mismatch == 0,
                  "no load has run, so no mismatch can be known yet");

        strncpy(i4->state_path, badpath, sizeof(i4->state_path) - 1);
        seq8_load_state(i4);
        HX_ASSERT(i4->state_version_mismatch == 1,
                  "the LOAD is what raises the mismatch — JS must read it after");
        {
            char buf[16] = {0};
            hx_get_param(h4, "state_version_mismatch", buf, sizeof(buf));
            HX_ASSERT(!strcmp(buf, "1"), "mismatch must be readable post-load");
        }
        hx_destroy(h4);
        unlink(badpath);
    }

    /* A spent (blanked) marker is not a selection request — JS blanks it to
     * consume, and a later create_instance must boot normally. */
    {
        marker_write("");
        hx_t *h3 = hx_create(NULL);
        HX_ASSERT(h3, "create D failed");
        seq8_instance_t *i3 = (seq8_instance_t *)h3->inst;
        HX_ASSERT(i3->awaiting_select == 0,
                  "an empty marker is spent and must boot normally");
        hx_destroy(h3);
    }

    free(ref);
    unlink(SEQ8_SELECT_MARKER);
    printf("PASS: select-before-load — empty instance never overwrites a project\n");
    return 0;
}
