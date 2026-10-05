/* tests/test_failed_read_keeps_saving_off.c — a state file that cannot be READ
 * in full leaves saving OFF and the file untouched.
 *
 * THE BUG THIS PINS (2026-10-04 module review): seq8_load_state cleared
 * awaiting_select before reading. A malloc failure then returned silently, a
 * short fread was accepted as the whole file, and a zero-byte read of a
 * non-empty file was treated as a brand-new project AND DELETED THE FILE. In
 * each case the instance (already reset by state_load) held a blank or partial
 * project with saving armed, so the next edit saved it over the real file.
 *
 * The short read is driven by the test hook seq8_test_read_cap (SEQ8_TESTING
 * only), which caps how many bytes the load may read. Control: a full read
 * loads and arms saving. */
#include "harness.h"
#include <unistd.h>

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* A real project on disk. */
    hx_set_param(h, "bpm", "133");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    static char buf[262144];
    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0, "state_full empty");
    char path[128];
    snprintf(path, sizeof(path), "/tmp/hx_fread_%d.json", (int)getpid());
    FILE *wf = fopen(path, "w");
    HX_ASSERT(wf && fwrite(buf, 1, (size_t)n, wf) == (size_t)n, "write failed");
    fclose(wf);

    /* Control: a full read loads it and arms saving. */
    hx_destroy(h);
    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
    inst->awaiting_select = 1;
    seq8_test_read_cap = -1;
    seq8_load_state(inst);
    HX_ASSERT(inst->awaiting_select == 0, "control: a full read arms saving");
    HX_ASSERT(inst->tracks[1].clips[0].note_count == 1, "control: the note loaded");

    /* A short read: half the file. */
    hx_destroy(h);
    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
    inst->awaiting_select = 1;
    seq8_test_read_cap = n / 2;
    seq8_load_state(inst);
    HX_ASSERT(inst->awaiting_select == 1, "a SHORT read armed saving over a partial project");
    HX_ASSERT(access(path, F_OK) == 0, "control: the file is still there");

    /* A zero-byte read of a non-empty file: must not delete it. */
    inst->awaiting_select = 1;
    seq8_test_read_cap = 0;
    seq8_load_state(inst);
    HX_ASSERT(access(path, F_OK) == 0, "a failed read DELETED the project file");
    HX_ASSERT(inst->awaiting_select == 1, "a failed read armed saving");

    /* And no save path writes while it is refused. */
    inst->state_dirty = 1;
    seq8_save_state(inst);
    {
        FILE *rf = fopen(path, "r");
        HX_ASSERT(rf, "file gone");
        fseek(rf, 0, SEEK_END);
        long sz = ftell(rf);
        fclose(rf);
        HX_ASSERT(sz == n, "the project file was overwritten after a failed read");
    }

    seq8_test_read_cap = -1;
    remove(path);
    hx_destroy(h);
    printf("PASS: failed_read_keeps_saving_off\n");
    return 0;
}
