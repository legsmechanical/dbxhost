/* A fixed-length module take keeps exactly the frames it asked for.
 *
 * The take is a loop: a file a block too long or too short drifts against the
 * tempo every pass. So the count must come out exact for lengths that are not
 * a multiple of the block, the last block must be PARTIAL, and nothing may be
 * kept after it. */
#include "../../src/host/sampler_take.h"
#include "../../src/host/sampler_take_tap.h"
#include <stdio.h>
#include <string.h>

static int fails = 0;

static void expect(int cond, const char *what) {
    printf("  %s %s\n", cond ? "ok  " : "FAIL", what);
    if (!cond) fails = 1;
}

/* Run blocks until the take stops wanting frames; report the total kept,
 * how many blocks kept anything, and what the last of those kept. */
static void run(uint32_t frames, uint32_t *total, uint32_t *blocks, uint32_t *last) {
    uint32_t left = frames;
    *total = *blocks = *last = 0;
    for (int b = 0; b < 100000; b++) {
        uint32_t n = sampler_take_block_frames(&left, 128);
        if (n == 0) break;
        *total += n; (*blocks)++; *last = n;
    }
}

/* The tree as it stands: Samples/Schwung exists, Samples/dAVEBOx does not. */
static int fake_exists(const char *p) {
    static const char *have[] = { "/data", "/data/UserData", "/data/UserData/UserLibrary",
        "/data/UserData/UserLibrary/Samples", "/data/UserData/UserLibrary/Samples/Schwung", NULL };
    for (int i = 0; have[i]; i++) if (!strcmp(p, have[i])) return 1;
    return 0;
}

int main(void) {
    uint32_t total, blocks, last;
    printf("fixed-length module take:\n");

    run(128 * 10, &total, &blocks, &last);
    expect(total == 1280 && blocks == 10 && last == 128, "a whole number of blocks: every block full");

    /* 4 bars at 120 bpm = 8 s = 352800 frames = 2756.25 blocks */
    run(352800, &total, &blocks, &last);
    expect(total == 352800, "4 bars at 120 bpm: exactly 352800 frames");
    expect(blocks == 2757 && last == 32, "...the last block is partial (32 of 128)");

    run(1, &total, &blocks, &last);
    expect(total == 1 && blocks == 1, "one frame: one partial block");

    run(0, &total, &blocks, &last);
    expect(total == 0 && blocks == 0, "zero frames: nothing kept");

    uint32_t left = 0;
    expect(sampler_take_block_frames(&left, 128) == 0 && left == 0,
           "a finished take keeps nothing more and never wraps below zero");

    printf("directories a take creates:\n");
    {
        char top[256];
        sampler_shallowest_missing("/data/UserData/UserLibrary/Samples/dAVEBOx/Resample",
                                   fake_exists, top, sizeof top);
        expect(!strcmp(top, "/data/UserData/UserLibrary/Samples/dAVEBOx"),
               "two new levels: the chown starts at the first one");
        sampler_shallowest_missing("/data/UserData/UserLibrary/Samples/Schwung/Resampler",
                                   fake_exists, top, sizeof top);
        expect(!strcmp(top, "/data/UserData/UserLibrary/Samples/Schwung/Resampler"),
               "only the leaf missing: the leaf");
    }
    printf("a one-slot take's source:\n");
    expect(sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_SLOT, 4, 4), "a slot take keeps its own slot");
    expect(!sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_SLOT, 4, 3), "...and no other slot");
    expect(!sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_MIX, 0, 0), "a mix take taps no slot (slot 0 included)");
    expect(!sampler_take_tap_wants(0, SAMPLER_TAKE_SRC_SLOT, 4, 4), "no take running: nothing is kept");
    expect(sampler_take_tap_sample(40000) == 32767 && sampler_take_tap_sample(-40000) == -32768
           && sampler_take_tap_sample(-123) == -123, "a kept sample is the contribution, clamped");
    return fails;
}
