/* tests/test_state_save_atomic.c — a project's state file must be REPLACED,
 * never rewritten in place.
 *
 * seq8_save_state serializes with thousands of fprintf calls. Writing that
 * straight to the live path means the only copy on disk is a fragment for the
 * whole of it, and a power cut anywhere in that window leaves one behind.
 * Nothing downstream notices: seq8_load_state validates the "v" field and then
 * pulls every other value with strstr, so a truncated document loads as a
 * SMALLER project — missing clips, missing tracks — rather than as an error.
 *
 * The observable signature of a temp+rename save is that the destination gets
 * a new inode; an in-place rewrite keeps the old one. That, plus "no .tmp
 * sibling survives", is what this pins.
 */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    char path[256], tmp[280];
    snprintf(path, sizeof(path), "/tmp/hx_atomic_state_%d.json", (int)getpid());
    snprintf(tmp, sizeof(tmp), "%s.tmp", path);
    remove(path);
    remove(tmp);

    hx_set_param(h, "state_path", path);
    /* A save is refused until a load has happened (select-before-load), which
     * is what the device does on entry; mirror it so "save" actually writes. */
    inst->awaiting_select = 0;

    hx_set_param(h, "bpm", "137");
    hx_set_param(h, "t1_c2_step_0_toggle", "60 100");
    hx_set_param(h, "save", "1");

    struct stat first;
    HX_ASSERT(stat(path, &first) == 0, "first save wrote no state file");
    HX_ASSERT(first.st_size > 0, "first save wrote an empty state file");
    {
        struct stat st;
        HX_ASSERT(stat(tmp, &st) != 0, "a .tmp sibling survived the first save");
    }

    hx_set_param(h, "bpm", "90");
    hx_set_param(h, "save", "1");

    struct stat second;
    HX_ASSERT(stat(path, &second) == 0, "second save lost the state file");
    HX_ASSERT(first.st_ino != second.st_ino,
              "save rewrote the live file in place (same inode) instead of "
              "replacing it via temp+rename — a power cut mid-save leaves a "
              "truncated project that loads without complaint");
    {
        struct stat st;
        HX_ASSERT(stat(tmp, &st) != 0, "a .tmp sibling survived the second save");
    }

    /* The replacement must be a COMPLETE document, not just a new inode. */
    FILE *f = fopen(path, "rb");
    HX_ASSERT(f, "cannot reopen state file");
    static char buf[262144];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    buf[n] = '\0';
    HX_ASSERT(n > 2, "state file too short to be a document");
    HX_ASSERT(buf[0] == '{' && buf[n - 1] == '}', "state file is not a closed JSON object");
    HX_ASSERT(strstr(buf, "\"bpm\":90") != NULL, "second save did not land");

    remove(path);
    hx_destroy(h);
    printf("PASS: project state is replaced atomically, never rewritten in place\n");
    return 0;
}
