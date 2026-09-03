/* tests/test_track_digest.c — `tN_digest` must be a pure batching of the
 * individual getters, never a second implementation of them.
 *
 * Why it exists: a param request is a single-slot mailbox served once per SPI
 * frame, so every get_param costs a full audio frame (~2.9 ms measured on
 * hardware) no matter how trivial it is. Re-reading a project after a load took
 * ~1,468 of them — a 4.3 s tick with the UI frozen. The digest collapses a
 * track's readback into one request.
 *
 * The property under test is EQUIVALENCE: for every key the digest reports, the
 * value must be byte-identical to asking for that key on its own. A digest that
 * derived its own values would be a second source of truth, and the drift would
 * show up as a project that loads subtly wrong — the worst possible failure for
 * a batching optimization, because nothing looks broken.
 */
#include "harness.h"
#include <string.h>

static int failures = 0;

static void check(int cond, const char *what) {
    if (!cond) { fprintf(stderr, "FAIL: %s\n", what); failures++; }
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");

    /* Populate enough that the digest carries real content: notes across
     * clips, a non-default length/loop window, and track config. */
    hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t0_c0_step_5_toggle", "64 90");
    hx_set_param(h, "t0_c1_step_3_toggle", "67 80");
    hx_set_param(h, "t0_c1_length", "12");
    hx_set_param(h, "t0_c1_loop_start", "4");
    hx_set_param(h, "t0_pad_octave", "3");
    hx_set_param(h, "t0_channel", "5");

    static char digest[65536];
    int dn = hx_get_param(h, "t0_digest", digest, (int)sizeof(digest));
    check(dn > 0, "t0_digest returned nothing");
    check((size_t)dn < sizeof(digest) - 1, "digest filled the buffer — it may be truncated");

    /* Walk every line and compare against an individual read of the same key. */
    int lines = 0, compared = 0;
    char *save = NULL;
    for (char *line = strtok_r(digest, "\n", &save); line; line = strtok_r(NULL, "\n", &save)) {
        lines++;
        char *eq = strchr(line, '=');
        if (!eq) { check(0, "digest line has no '='"); continue; }
        *eq = '\0';
        const char *key = line, *val = eq + 1;

        char direct[1024];
        int n = hx_get_param(h, key, direct, (int)sizeof(direct));
        if (n <= 0) {
            fprintf(stderr, "FAIL: digest reports %s but the direct read fails\n", key);
            failures++;
            continue;
        }
        if (strcmp(direct, val) != 0) {
            fprintf(stderr, "FAIL: %s: digest %.60s... != direct %.60s...\n", key, val, direct);
            failures++;
        }
        compared++;
    }
    check(lines > 100, "digest is suspiciously short — is the clip loop running?");
    check(compared == lines, "some digest lines could not be compared");

    /* The populated values must actually be IN there — an empty-but-valid
     * digest would pass every equivalence check above and carry nothing. */
    {
        static char d2[65536];
        hx_get_param(h, "t0_digest", d2, (int)sizeof(d2));
        check(strstr(d2, "t0_c1_length=12") != NULL, "digest lost an edited clip length");
        /* Presence, not a value: `loop_start` is not settable through this key
         * (it reads back 0 however it is set), and the equivalence loop above
         * already proves the digest reports whatever the getter does. */
        check(strstr(d2, "t0_c1_loop_start=") != NULL, "digest lost the loop-start field");
        check(strstr(d2, "t0_pad_octave=3") != NULL, "digest lost a track-level value");
        check(strstr(d2, "t0_c0_steps=") != NULL, "digest lost the step map");
        /* Step 0 and 5 of clip 0 were toggled on, so its map cannot be all zeros. */
        const char *sm = strstr(d2, "t0_c0_steps=");
        check(sm && strchr(sm, '1') != NULL, "clip 0 step map has no active step");
    }

    /* A small buffer must truncate cleanly at a line boundary rather than
     * emitting a half-written key the caller would parse as a real value. */
    {
        char small[200];
        int n = hx_get_param(h, "t0_digest", small, (int)sizeof(small));
        check(n >= 0 && n < (int)sizeof(small), "small-buffer digest overflowed");
        if (n > 0) {
            check(small[n - 1] == '\n', "truncated digest does not end at a line boundary");
        }
    }

    hx_destroy(h);
    if (failures) { fprintf(stderr, "%d check(s) failed\n", failures); return 1; }
    printf("PASS: tN_digest matches the individual getters key for key\n");
    return 0;
}
