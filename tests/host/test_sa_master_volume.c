/* The session's own master volume must survive a launch.
 *
 * ⚠⚠ The bug this pins is a SILENT one, and it was silent for months: Move's
 * Settings.json holds the master volume, Move only rewrites it on its own clean
 * exit, and the SA session's exit path does not give it one — so the file keeps
 * whatever it said when the session STARTED. Measured on device 2026-08-25: a
 * session at -19.9 dB, file still -70.0, which the shim maps to linear 0.0.
 * dAVEBOx came up silent every time.
 *
 * The properties that matter, none of which a "does it write a file" test would
 * catch:
 *   - a stored value comes back EXACTLY (a level you set is the level you get)
 *   - a SHORTER value overwrites a longer one completely (fixed-length record —
 *     without it 1.000000 followed by 0.5 reads back as 0.5000001.000000)
 *   - garbage and out-of-range values are REFUSED, so a corrupt file falls back
 *     to Settings.json rather than pinning the volume at something wrong
 *   - load() says "no" when nothing has ever been stored, which is what makes
 *     the first launch on a fresh device honour stock's setting
 */
#include "../../src/host/sa_master_volume.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <sys/stat.h>
#include <sys/types.h>

static int fails = 0;
static char path[256];

static void check(const char *desc, int cond)
{
    printf(cond ? "  ok   %s\n" : "  FAIL %s\n", desc);
    if (!cond) fails = 1;
}

static void write_raw(const char *text)
{
    FILE *f = fopen(path, "w");
    if (!f) { perror("fopen"); exit(2); }
    fputs(text, f);
    fclose(f);
}

static float roundtrip(float v)
{
    float got = -1.0f;
    sa_master_volume_open();
    sa_master_volume_store(v);
    return sa_master_volume_load(&got) ? got : -1.0f;
}

int main(void)
{
    char dir[64];
    float got = 12345.0f;

    /* ⚠ NOT mkdtemp: it needs a feature macro under -std=c11 on glibc, and
     * defining that macro HIDES it on macOS. pid + mkdir needs neither and is
     * unique enough for a test that removes its own directory. */
    snprintf(dir, sizeof(dir), "/tmp/samv-%ld", (long)getpid());
    if (mkdir(dir, 0700) != 0) { perror("mkdir"); return 2; }
    snprintf(path, sizeof(path), "%s/sa_master_volume", dir);
    sa_master_volume_set_path_for_test(path);

    printf("test_sa_master_volume\n");

    /* Nothing stored yet: the caller must fall back to Settings.json. */
    check("no file -> load says no (first launch honours stock)",
          sa_master_volume_load(&got) == 0);
    check("...and the out param is left alone", got == 12345.0f);

    check("a stored level comes back",            fabsf(roundtrip(0.5f) - 0.5f) < 1e-5f);
    check("full scale survives",                  fabsf(roundtrip(1.0f) - 1.0f) < 1e-5f);
    check("silence survives (0.0 is a level)",    fabsf(roundtrip(0.0f) - 0.0f) < 1e-5f);

    /* ⭑ The one that bites without a fixed-length record: long, then short. */
    sa_master_volume_store(1.0f);
    sa_master_volume_store(0.5f);
    got = -1.0f;
    check("a SHORTER value fully replaces a longer one",
          sa_master_volume_load(&got) && fabsf(got - 0.5f) < 1e-5f);

    /* A corrupt or out-of-range file must be refused, not adopted. */
    write_raw("not a number\n");
    check("garbage is refused",                   sa_master_volume_load(&got) == 0);
    write_raw("2.5\n");
    check("above full scale is refused",          sa_master_volume_load(&got) == 0);
    write_raw("-0.5\n");
    check("below silence is refused",             sa_master_volume_load(&got) == 0);
    write_raw("nan\n");
    check("NaN is refused",                       sa_master_volume_load(&got) == 0);
    write_raw("");
    check("an empty file is refused",             sa_master_volume_load(&got) == 0);

    /* ...and after all that, a good store still works. */
    check("a good value still lands after a bad one",
          fabsf(roundtrip(0.25f) - 0.25f) < 1e-5f);

    unlink(path);
    rmdir(dir);
    printf(fails ? "FAIL: sa_master_volume\n" : "PASS: sa_master_volume\n");
    return fails;
}
