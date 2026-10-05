/* tests/test_save_failure_logged.c — a DSP save that fails says so in the log.
 *
 * THE BUG THIS PINS (2026-10-04 module review): seq8_save_state returned on a
 * failed fopen, and removed the temp file on a failed write or rename, with no
 * trace. A suspend / quit / project-switch save that never reached the disk
 * looked exactly like one that did.
 *
 * Control: the same save to a writable path logs no failure and lands. */
#include "harness.h"
#include <unistd.h>

/* seq8_ilog writes to inst->log_fp (a device path that does not exist here),
 * so point it at a temp file and read that back. */
static int log_has(FILE *fp, const char *needle) {
    static char b[16384];
    fflush(fp);
    long n = ftell(fp);
    if (n <= 0) return 0;
    rewind(fp);
    size_t r = fread(b, 1, sizeof(b) - 1, fp);
    b[r] = '\0';
    fseek(fp, 0, SEEK_END);
    return strstr(b, needle) != NULL;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    inst->awaiting_select = 0;
    inst->state_uuid[0] = '\0';
    if (inst->log_fp) fclose(inst->log_fp);
    inst->log_fp = tmpfile();
    HX_ASSERT(inst->log_fp, "tmpfile failed");

    /* Control: a writable path. */
    char good[128];
    snprintf(good, sizeof(good), "/tmp/hx_save_ok_%d.json", (int)getpid());
    snprintf(inst->state_path, sizeof(inst->state_path), "%s", good);
    inst->state_dirty = 1;
    seq8_save_state(inst);
    HX_ASSERT(access(good, F_OK) == 0, "control: the save landed");
    HX_ASSERT(!log_has(inst->log_fp, "SAVE FAILED"), "control: no failure logged");
    remove(good);

    /* A path under a directory that cannot be created. */
    snprintf(inst->state_path, sizeof(inst->state_path), "%s",
             "/hx-no-such-root-dir/cannot/state.json");
    inst->state_dirty = 1;
    seq8_save_state(inst);
    HX_ASSERT(log_has(inst->log_fp, "SAVE FAILED"),
              "a save that could not open its file left no trace in the log");

    hx_destroy(h);
    printf("PASS: save_failure_logged\n");
    return 0;
}
