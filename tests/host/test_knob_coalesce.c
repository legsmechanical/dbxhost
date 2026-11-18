/* knob_coalesce.h: summing, carry, encoding, placement — and, in a model of
 * the inject drain's gate, that a fast volume spin no longer starves notes
 * bound for Move's own tracks. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "knob_coalesce.h"

static int fails = 0;
#define CHECK(c, ...) do { if (!(c)) { printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); fails++; } } while (0)

/* The drain gate from shadow_drain_midi_inject: any occupied MIDI_IN slot
 * resets the counter; after DEFER_FRAMES empty frames it drains. Returns how
 * many frames out of `frames` the queued notes could drain on. */
static int drain_windows(const int *occupied, int frames)
{
    int defer = 0, windows = 0;
    for (int f = 0; f < frames; f++) {
        if (occupied[f]) { defer = 0; continue; }
        if (defer < 2) { defer++; continue; }
        windows++;
    }
    return windows;
}

int main(void)
{
    knob_coalesce_t c;

    /* encoding */
    CHECK(knob_coalesce_delta(1) == 1 && knob_coalesce_delta(63) == 63, "up");
    CHECK(knob_coalesce_delta(127) == -1 && knob_coalesce_delta(65) == -63, "down");
    CHECK(knob_coalesce_delta(0) == 0 && knob_coalesce_delta(64) == 0, "neutral");
    CHECK(knob_coalesce_cc(0) == 71 && knob_coalesce_cc(7) == 78, "track knobs");
    CHECK(knob_coalesce_cc(KNOB_COALESCE_VOLUME) == 79, "volume knob");

    /* emit every PERIOD frames, summed */
    memset(&c, 0, sizeof c);
    int emits = 0;
    for (int f = 1; f <= 40; f++) emits += knob_coalesce_tick(&c);
    CHECK(emits == 40 / KNOB_COALESCE_PERIOD, "emit frames %d", emits);

    memset(&c, 0, sizeof c);
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 1);
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 1);
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 3);
    CHECK(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME) == 5, "sum up");
    CHECK(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME) == 0, "emptied");
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 127);
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 126);
    CHECK(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME) == 125, "sum down (-3)");
    /* up and down cancel: nothing to send */
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 2);
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 126);
    CHECK(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME) == 0, "cancel");

    /* carry past ±63, nothing lost */
    for (int i = 0; i < 50; i++) knob_coalesce_add(&c, 3, 2);   /* +100 */
    CHECK(knob_coalesce_take(&c, 3) == 63, "clamped");
    CHECK(knob_coalesce_take(&c, 3) == 37, "carried");
    for (int i = 0; i < 50; i++) knob_coalesce_add(&c, 3, 126); /* -100 */
    CHECK(knob_coalesce_take(&c, 3) == 65, "clamped down");
    CHECK(knob_coalesce_take(&c, 3) == 128 - 37, "carried down");

    /* drop */
    knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 9);
    knob_coalesce_drop(&c, KNOB_COALESCE_VOLUME);
    CHECK(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME) == 0, "dropped");

    /* placement: first empty event, 8-byte aligned, timestamp zeroed */
    uint8_t mi[248];
    memset(mi, 0, sizeof mi);
    memset(mi, 0xAA, 16);                       /* two events in use */
    mi[16 + 4] = 0x55;                          /* stale timestamp in the empty one */
    CHECK(knob_coalesce_place(mi, sizeof mi, 79, 5) == 0, "placed");
    CHECK(mi[16] == 0x0B && mi[17] == 0xB0 && mi[18] == 79 && mi[19] == 5, "event bytes");
    CHECK(mi[20] == 0 && mi[21] == 0 && mi[22] == 0 && mi[23] == 0, "timestamp zeroed");
    CHECK(mi[8] == 0xAA && mi[24] == 0, "neighbours untouched");
    memset(mi, 0xAA, sizeof mi);
    CHECK(knob_coalesce_place(mi, sizeof mi, 79, 5) == -1, "full");

    /* A FAST SPIN: a detent in every frame for 1000 frames (~2.9 s).
     * Passed one CC per detent, MIDI_IN is never empty and queued notes for
     * Move's tracks never drain. Coalesced, they drain on most frames. */
    enum { N = 1000 };
    int raw[N], coal[N];
    memset(&c, 0, sizeof c);
    int sent = 0;
    for (int f = 0; f < N; f++) {
        raw[f] = 1;
        knob_coalesce_add(&c, KNOB_COALESCE_VOLUME, 1);
        coal[f] = 0;
        if (knob_coalesce_tick(&c)) {
            uint8_t d2 = knob_coalesce_take(&c, KNOB_COALESCE_VOLUME);
            if (d2) { coal[f] = 1; sent += knob_coalesce_delta(d2); }
        }
    }
    sent += knob_coalesce_delta(knob_coalesce_take(&c, KNOB_COALESCE_VOLUME));
    int wr = drain_windows(raw, N), wc = drain_windows(coal, N);
    CHECK(wr == 0, "raw spin left %d drain frames (model broken?)", wr);
    CHECK(wc >= N / KNOB_COALESCE_PERIOD, "coalesced spin left only %d drain frames", wc);
    CHECK(sent == N, "motion lost: %d of %d detents reached Move", sent, N);

    if (fails) { printf("test_knob_coalesce: %d FAIL\n", fails); return 1; }
    printf("test_knob_coalesce: PASS (fast spin: %d drain frames per-detent, %d coalesced)\n", wr, wc);
    return 0;
}
