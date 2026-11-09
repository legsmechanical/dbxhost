/*
 * Host-side unit tests for remote_surface.h — which packets the browser's
 * surface ring may carry. The page sends the Move's own gestures; anything the
 * Move's surface could not have sent is dropped at the drain, because the
 * producer (the manager) faces the network. Runs on the dev machine.
 */

#include <stdint.h>
#include <stdio.h>

#include "remote_surface.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { \
    printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

static int ok(uint8_t h, uint8_t s, uint8_t d1, uint8_t d2)
{
    uint8_t p[4] = { h, s, d1, d2 };
    return remote_surface_valid(p);
}

int main(void)
{
    /* What a hand does: knob turn + touch, pads, steps, jog, buttons. */
    CHECK(ok(0x0B, 0xB0, 71, 1));      /* encoder 1, one detent right */
    CHECK(ok(0x0B, 0xB0, 78, 127));    /* encoder 8, one detent left */
    CHECK(ok(0x09, 0x90, 0, 127));     /* knob 1 touched */
    CHECK(ok(0x08, 0x80, 7, 0));       /* knob 8 released */
    CHECK(ok(0x09, 0x90, 9, 127));     /* jog touched */
    CHECK(ok(0x09, 0x90, 68, 100));    /* bottom-left pad */
    CHECK(ok(0x09, 0x90, 99, 100));    /* top-right pad */
    CHECK(ok(0x09, 0x90, 16, 127));    /* step 1 */
    CHECK(ok(0x09, 0x90, 31, 127));    /* step 16 */
    CHECK(ok(0x0B, 0xB0, 14, 1));      /* jog turn */
    CHECK(ok(0x0B, 0xB0, 3, 127));     /* jog click */
    CHECK(ok(0x0B, 0xB0, 49, 127));    /* Shift */
    CHECK(ok(0x0B, 0xB0, 51, 127));    /* Back */
    CHECK(ok(0x0B, 0xB0, 85, 127));    /* Play */
    CHECK(ok(0x0B, 0xB0, 119, 127));   /* Delete */
    CHECK(ok(0x0B, 0xB0, 40, 127));    /* a track button */

    /* Never the master knob: Move handles it itself. Never plug detect. */
    CHECK(!ok(0x0B, 0xB0, 79, 1));
    CHECK(!ok(0x0B, 0xB0, 114, 0));
    CHECK(!ok(0x0B, 0xB0, 115, 127));
    /* Notes the surface has no sensor for. */
    CHECK(!ok(0x09, 0x90, 10, 127));
    CHECK(!ok(0x09, 0x90, 15, 127));
    CHECK(!ok(0x09, 0x90, 32, 127));
    CHECK(!ok(0x09, 0x90, 67, 100));
    CHECK(!ok(0x09, 0x90, 100, 100));
    /* Another cable is another device. */
    CHECK(!ok(0x29, 0x90, 68, 100));
    CHECK(!ok(0x1B, 0xB0, 71, 1));
    /* The surface talks on channel 1 only. */
    CHECK(!ok(0x09, 0x91, 68, 100));
    CHECK(!ok(0x0B, 0xBF, 71, 1));
    /* CIN must agree with the status. */
    CHECK(!ok(0x0B, 0x90, 68, 100));
    CHECK(!ok(0x09, 0xB0, 71, 1));
    /* 7-bit data only. */
    CHECK(!ok(0x09, 0x90, 68, 0x80));
    CHECK(!ok(0x0B, 0xB0, 0x80 | 71, 1));
    /* Aftertouch, pitch bend, SysEx, system, a zero header. */
    CHECK(!ok(0x0A, 0xA0, 68, 64));
    CHECK(!ok(0x0E, 0xE0, 0, 64));
    CHECK(!ok(0x04, 0xF0, 0, 0));
    CHECK(!ok(0x0F, 0xF8, 0, 0));
    CHECK(!ok(0, 0, 0, 0));

    if (failures) { printf("FAIL: test_remote_surface (%d)\n", failures); return 1; }
    printf("PASS: test_remote_surface\n");
    return 0;
}
