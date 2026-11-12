/* A fixed-length module take keeps exactly the frames it asked for.
 *
 * The take is a loop: a file a block too long or too short drifts against the
 * tempo every pass. So the count must come out exact for lengths that are not
 * a multiple of the block, the last block must be PARTIAL, and nothing may be
 * kept after it. */
#include "../../src/host/sampler_take.h"
#include "../../src/host/sampler_take_tap.h"
#include "../../src/host/take_feed.h"
#include "../../src/host/plugin_api_v1.h"
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
        /* MOVE_CAPTURE_SLOT_PRE: the render task taps, the mix loops do not */
    expect(sampler_take_tap_wants_pre(1, SAMPLER_TAKE_SRC_PRE, 3, 3) == 1, "PRE: the slot's render task taps");
    expect(sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_PRE, 3, 3) == 0, "PRE: its mix loop does not");
    expect(sampler_take_tap_wants_pre(1, SAMPLER_TAKE_SRC_SLOT, 3, 3) == 0, "SLOT: the render task does not");
    expect(sampler_take_tap_wants_pre(1, SAMPLER_TAKE_SRC_PRE, 3, 2) == 0, "PRE: another slot does not");
    expect(sampler_take_from_tap(1, SAMPLER_TAKE_SRC_PRE) && sampler_take_from_tap(1, SAMPLER_TAKE_SRC_SLOT)
           && !sampler_take_from_tap(1, SAMPLER_TAKE_SRC_MIX) && !sampler_take_from_tap(0, SAMPLER_TAKE_SRC_PRE),
           "the take reads the tap for SLOT and PRE only");
    printf("the unity and Move-track sources:\n");
    expect(sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_FX, 2, 2) && !sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_FX, 2, 1),
           "FX (after FX, at unity): its own slot's mix loop taps");
    expect(sampler_take_tap_wants_move(1, SAMPLER_TAKE_SRC_MOVE, 1, 1) && sampler_take_tap_wants_move(1, SAMPLER_TAKE_SRC_MOVE_PRE, 1, 1)
           && sampler_take_tap_wants_move(1, SAMPLER_TAKE_SRC_MOVE_FX, 1, 1), "MOVE / MOVE_PRE / MOVE_FX: its own bus taps");
    expect(!sampler_take_tap_wants_move(1, SAMPLER_TAKE_SRC_MOVE, 1, 2), "...and no other bus");
    expect(!sampler_take_tap_wants_move(1, SAMPLER_TAKE_SRC_SLOT, 1, 1) && !sampler_take_tap_wants(1, SAMPLER_TAKE_SRC_MOVE, 1, 1),
           "a slot take taps no bus, a bus take no slot (same index)");
    expect(!sampler_take_tap_wants_move(0, SAMPLER_TAKE_SRC_MOVE, 1, 1), "no take running: no bus is kept");
    expect(sampler_take_tap_unity(SAMPLER_TAKE_SRC_FX) && sampler_take_tap_unity(SAMPLER_TAKE_SRC_MOVE_PRE)
           && sampler_take_tap_unity(SAMPLER_TAKE_SRC_MOVE_FX), "FX, MOVE_PRE, MOVE_FX are at unity");
    expect(!sampler_take_tap_unity(SAMPLER_TAKE_SRC_SLOT) && !sampler_take_tap_unity(SAMPLER_TAKE_SRC_MOVE)
           && !sampler_take_tap_unity(SAMPLER_TAKE_SRC_PRE), "SLOT and MOVE carry the fader; PRE its synth level");
    expect(sampler_take_from_tap(1, SAMPLER_TAKE_SRC_FX) && sampler_take_from_tap(1, SAMPLER_TAKE_SRC_MOVE)
           && sampler_take_from_tap(1, SAMPLER_TAKE_SRC_MOVE_PRE) && sampler_take_from_tap(1, SAMPLER_TAKE_SRC_MOVE_FX)
           && !sampler_take_from_tap(1, 7), "the take reads the tap for every one-source kind, none past them");
    expect(SAMPLER_TAKE_SRC_FX == MOVE_CAPTURE_SLOT_FX && SAMPLER_TAKE_SRC_MOVE == MOVE_CAPTURE_MOVE
           && SAMPLER_TAKE_SRC_MOVE_PRE == MOVE_CAPTURE_MOVE_PRE && SAMPLER_TAKE_SRC_MOVE_FX == MOVE_CAPTURE_MOVE_FX
           && SAMPLER_TAKE_SRC_SLOT == MOVE_CAPTURE_SLOT && SAMPLER_TAKE_SRC_PRE == MOVE_CAPTURE_SLOT_PRE,
           "the host's kinds ARE the take's sources (capture_start_src passes them through)");
    printf("a stem ignores mute and solo:\n");
    expect(!sampler_take_tap_silenced(0, 0, 0), "plain: the mix's own gain");
    expect(sampler_take_tap_silenced(1, 0, 0), "muted: silenced in the mix");
    expect(sampler_take_tap_silenced(0, 1, 0), "another slot soloed: silenced");
    expect(!sampler_take_tap_silenced(0, 1, 1), "itself soloed: the mix's own gain");
    expect(sampler_take_tap_as_set(0.5f, 0.8f, 0.6f, 0) == 0.5f * 0.8f
           && sampler_take_tap_as_set(0.5f, 0.8f, 0.6f, 1) == 0.5f * 0.6f, "as set: its volume and pan, left then right");
    printf("a FEED take (capture_feed):\n");
    {
        static take_feed_t f;
        int16_t a[300 * 2], b[40 * 2];
        for (int i = 0; i < 600; i++) a[i] = (int16_t)(i + 1);
        for (int i = 0; i < 80; i++) b[i] = (int16_t)(-1 - i);
        const int16_t *out;
        expect(take_feed_take(&f, &out) == 0, "nothing handed over: nothing to write (not a block of silence)");
        expect(take_feed_put(&f, a, 37) == 1, "a partial block is taken");
        expect(take_feed_put(&f, b, 40) == 1, "a second call in the same render appends");
        uint32_t n = take_feed_take(&f, &out);
        expect(n == 77 && out[0] == 1 && out[73] == 37 * 2 && out[74] == -1 && out[153] == -80,
               "the mix gets every frame handed over, in order, and no more");
        expect(take_feed_take(&f, &out) == 0, "...and the next mix gets nothing until more is handed over");
        expect(take_feed_put(&f, a, 300) == 1 && take_feed_put(&f, a, 300) == 0 && f.frames == 300,
               "more than MOVE_CAPTURE_FEED_MAX in one render: the extra call is refused whole");
        take_feed_take(&f, &out);
        expect(take_feed_put(&f, a, 0) == 0 && take_feed_put(&f, NULL, 4) == 0 && f.frames == 0,
               "no frames / no audio: refused, nothing kept");
        expect(TAKE_FEED_MAX_FRAMES == MOVE_CAPTURE_FEED_MAX && SAMPLER_TAKE_SRC_FEED == MOVE_CAPTURE_FEED,
               "the host's FEED kind and limit are the feed's");
        expect(!sampler_take_from_tap(1, SAMPLER_TAKE_SRC_FEED), "a FEED take reads no slot tap");
    }
    return fails;
}
