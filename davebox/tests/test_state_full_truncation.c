/* tests/test_state_full_truncation.c — state_full must NEVER hand back a
 * truncated blob.
 *
 * The bug this pins (found 2026-09-02): get_param("state_full") clamped its
 * copy to the caller's buffer with no log and no error. Under SA,
 * host_module_get_param routes through shadow_get_param, whose value field is
 * SHADOW_PARAM_VALUE_LEN = 65536, while the DSP's own state_buf is 131072. A
 * project serializing between those two sizes therefore arrived at JS cut in
 * half — mid-note — and JS wrote it straight to the project file. Readers
 * parse with strstr, so it reloaded as a silently SMALLER project: no error at
 * any layer, just missing music. Measured: a 90,818-byte project came back as
 * exactly 65,535 bytes.
 *
 * The invariant is binary: for any caller buffer, the result is either the
 * COMPLETE blob or nothing at all (the DSP writes the file itself instead).
 * Never a prefix. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

/* Fill until the serialized state lands above `target` bytes, so the test
 * pins the behaviour by SIZE rather than by a note count that a format change
 * would silently invalidate. */
static int fill_until(hx_t *h, size_t target, char *big, int big_len) {
    char k[128], v[128];
    int n = 0;
    for (int c = 0; c < NUM_CLIPS; c++) {
        for (int t = 0; t < NUM_TRACKS; t++)
            for (int s = 0; s < 32; s++) {
                snprintf(k, sizeof(k), "t%d_c%d_step_%d_toggle", t, c, s);
                snprintf(v, sizeof(v), "%d 100", 48 + (s % 12));
                hx_set_param(h, k, v);
                snprintf(k, sizeof(k), "t%d_c%d_step_%d_set_notes", t, c, s);
                snprintf(v, sizeof(v), "%d %d %d", 48+(s%12), 52+(s%12), 55+(s%12));
                hx_set_param(h, k, v);
            }
        hx_set_param(h, "bpm", "120");   /* re-dirty: state_full only serves when dirty */
        n = hx_get_param(h, "state_full", big, big_len);
        if ((size_t)n > target) return n;
    }
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");

    static char big[131072];
    static char sa[65536];      /* exactly the SA transport buffer */

    int full = fill_until(h, 70000, big, (int)sizeof(big));
    HX_ASSERT(full > 65535, "fixture never exceeded the SA buffer — cannot test truncation");
    HX_ASSERT(full < (int)sizeof(big) - 1, "fixture overflowed state_buf; different path");

    /* The whole point: through a buffer too small to hold it. */
    hx_set_param(h, "bpm", "120");
    int viaSA = hx_get_param(h, "state_full", sa, (int)sizeof(sa));

    HX_ASSERT(viaSA != (int)sizeof(sa) - 1, "state_full returned a buffer-sized prefix — TRUNCATED");
    HX_ASSERT(viaSA == 0, "state_full must return nothing when the blob cannot fit");
    HX_ASSERT(sa[0] == '\0', "state_full must leave an empty string, which JS treats as nothing-to-save");

    /* And it must still serve a blob that DOES fit. */
    hx_t *h2 = hx_create(NULL);
    HX_ASSERT(h2, "create 2 failed");
    hx_set_param(h2, "bpm", "137");
    hx_set_param(h2, "t1_c2_step_0_toggle", "60 100");
    int small = hx_get_param(h2, "state_full", sa, (int)sizeof(sa));
    HX_ASSERT(small > 0, "a small project must still be served");
    HX_ASSERT(sa[small - 1] == '}', "a served blob must be complete JSON");

    printf("PASS: state_full refuses to truncate (%d-byte project, SA buffer %d)\n",
           full, (int)sizeof(sa));
    hx_destroy(h2);
    return 0;
}
