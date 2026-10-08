/*
 * Host-side unit tests for ext_midi_in.h — which packets the external MIDI
 * input ring may carry, and what Move is sent for each under the cable-2
 * channel remap. Runs on the dev machine, not on Move.
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "ext_midi_in.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { \
    printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

static void test_valid(void)
{
    uint8_t on[4]  = { 0x29, 0x90, 60, 100 };
    uint8_t cc[4]  = { 0x2B, 0xB3, 1, 64 };
    CHECK(ext_midi_in_valid(on));
    CHECK(ext_midi_in_valid(cc));

    /* Cable 0 is the surface: a pad press must never enter by this ring. */
    uint8_t pad[4] = { 0x09, 0x90, 68, 100 };
    CHECK(!ext_midi_in_valid(pad));
    /* A zero header is what aborts Move. */
    uint8_t zero[4] = { 0, 0, 0, 0 };
    CHECK(!ext_midi_in_valid(zero));
    /* SysEx and system messages are not carried. */
    uint8_t sx[4]  = { 0x24, 0xF0, 1, 2 };
    uint8_t clk[4] = { 0x2F, 0xF8, 0, 0 };
    CHECK(!ext_midi_in_valid(sx));
    CHECK(!ext_midi_in_valid(clk));
    /* CIN and status must agree. */
    uint8_t bad[4] = { 0x29, 0xB0, 1, 2 };
    CHECK(!ext_midi_in_valid(bad));
}

static void test_for_move(void)
{
    schwung_ext_midi_remap_t remap;
    memset(&remap, 0, sizeof(remap));
    memset((void *)remap.remap, EXT_MIDI_REMAP_PASSTHROUGH, 16);
    uint8_t out[4];

    uint8_t on[4]  = { 0x29, 0x92, 60, 100 };
    uint8_t off[4] = { 0x28, 0x82, 60, 0 };
    uint8_t cc[4]  = { 0x2B, 0xB2, 1, 64 };

    /* No table, or a disabled one: Move gets the packet unchanged. */
    CHECK(ext_midi_in_for_move(on, NULL, 0, out) == 1 && memcmp(out, on, 4) == 0);
    remap.remap[2] = 5;
    CHECK(ext_midi_in_for_move(on, &remap, 0, out) == 1 && memcmp(out, on, 4) == 0);

    /* Enabled: the channel is rewritten, nothing else. */
    remap.enabled = 1;
    CHECK(ext_midi_in_for_move(on, &remap, 0, out) == 1);
    CHECK(out[0] == 0x29 && out[1] == 0x95 && out[2] == 60 && out[3] == 100);
    CHECK(ext_midi_in_for_move(cc, &remap, 0, out) == 1 && out[1] == 0xB5);

    /* MPE passthrough overrides the table. */
    CHECK(ext_midi_in_for_move(on, &remap, 1, out) == 1 && out[1] == 0x92);

    /* Passthrough entry. */
    remap.remap[2] = EXT_MIDI_REMAP_PASSTHROUGH;
    CHECK(ext_midi_in_for_move(on, &remap, 0, out) == 1 && out[1] == 0x92);

    /* Blocked channel: Move never sounds the note, but still gets the
     * release and the controllers. */
    remap.remap[2] = EXT_MIDI_REMAP_BLOCK;
    CHECK(ext_midi_in_for_move(on, &remap, 0, out) == 0);
    CHECK(ext_midi_in_for_move(off, &remap, 0, out) == 1 && memcmp(out, off, 4) == 0);
    uint8_t on_v0[4] = { 0x29, 0x92, 60, 0 };       /* note-on velocity 0 = release */
    CHECK(ext_midi_in_for_move(on_v0, &remap, 0, out) == 1);
    CHECK(ext_midi_in_for_move(cc, &remap, 0, out) == 1);

    /* Another channel is unaffected by the block. */
    uint8_t on7[4] = { 0x29, 0x97, 60, 100 };
    CHECK(ext_midi_in_for_move(on7, &remap, 0, out) == 1 && out[1] == 0x97);

    /* An out-of-range entry is treated as passthrough. */
    remap.remap[2] = 0x40;
    CHECK(ext_midi_in_for_move(on, &remap, 0, out) == 1 && out[1] == 0x92);
}

int main(void)
{
    test_valid();
    test_for_move();
    if (failures) { printf("test_ext_midi_in: %d FAILED\n", failures); return 1; }
    printf("test_ext_midi_in: OK\n");
    return 0;
}
