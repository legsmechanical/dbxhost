/* Which saved headphone-jack state a host believes at boot (jack_state.h).
 *
 * The fork's file had said "speaker" since 10-31 while stock's host, which saw
 * the hardware last, had written "jack" on 11-07 — headphones in all along —
 * and the fork told Move "speaker" at every launch. */
#include "../../src/host/jack_state.h"
#include <stdio.h>

static int fails = 0;
static void expect(int cond, const char *what) {
    printf("  %s %s\n", cond ? "ok  " : "FAIL", what);
    if (!cond) fails = 1;
}

int main(void) {
    printf("saved jack state at boot:\n");
    expect(jack_state_pick(0, 1000, 127, 2000) == 127, "the device case: own says speaker (older), stock says jack (newer) -> jack");
    expect(jack_state_pick(127, 3000, 0, 2000) == 127, "own newer: own");
    expect(jack_state_pick(0, 3000, 127, 2000) == 0, "own newer, speaker: own (a cable pulled since)");
    expect(jack_state_pick(-1, 0, 127, 2000) == 127, "no file of its own: stock's");
    expect(jack_state_pick(0, 1000, -1, 0) == 0, "no stock file: its own");
    expect(jack_state_pick(-1, 0, -1, 0) == -1, "neither: unknown");
    expect(jack_state_pick(64, 5000, 127, 2000) == 127, "a damaged own value is not believed");
    expect(jack_state_pick(127, 2000, 0, 2000) == 127, "a tie: its own");
    return fails;
}
