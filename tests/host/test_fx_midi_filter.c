/* Unit test for the predicate that gates Move-surface notes into audio FX.
 *
 * It runs on the SCHED_FIFO 90 SPI callback, so it is pure inline code with no
 * allocation, I/O or locks — and therefore testable natively here rather than
 * only on the device.
 *
 * Adapted from upstream schwung tests/host/test_fx_midi_filter.c: the
 * fx_midi_channel_accepts half is dropped along with the listen-channel
 * setting it belongs to, which this fork does not carry.
 */
#include <stdio.h>
#include "fx_midi_filter.h"

static int fails = 0;
#define CHECK(cond, msg) do { if (!(cond)) { fprintf(stderr, "FAIL: %s\n", msg); fails++; } } while (0)

/* Move's cable-0 surface note map, from CLAUDE.md "Move Hardware MIDI":
 * knob touch 0-9, steps 16-31, tracks 40-43, pads 68-99. */
static void test_pad_range(void)
{
    CHECK(move_surface_note_is_pad(68), "pad low bound 68 accepted");
    CHECK(move_surface_note_is_pad(99), "pad high bound 99 accepted");
    CHECK(move_surface_note_is_pad(80), "mid pad accepted");

    CHECK(!move_surface_note_is_pad(67), "67 just below pads rejected");
    CHECK(!move_surface_note_is_pad(100), "100 just above pads rejected");

    /* The reported bug: a step button reached every loaded audio FX because
     * the only guard was `d1 >= 10`, which exists to drop knob touch. */
    for (int n = 16; n <= 31; n++)
        CHECK(!move_surface_note_is_pad((uint8_t)n), "step button rejected");
    for (int n = 40; n <= 43; n++)
        CHECK(!move_surface_note_is_pad((uint8_t)n), "track button rejected");
    for (int n = 0; n <= 9; n++)
        CHECK(!move_surface_note_is_pad((uint8_t)n), "knob touch rejected");
}

int main(void)
{
    test_pad_range();
    if (fails) {
        fprintf(stderr, "%d check(s) failed\n", fails);
        return 1;
    }
    printf("PASS: only Move's pads reach audio FX\n");
    return 0;
}
