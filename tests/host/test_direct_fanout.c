/*
 * What a DIRECT message (past a slot's MIDI FX) broadcasts to the other slots'
 * audio FX and the master FX: its NOTES, so a ducker still keys off what is
 * played — and nothing else, so one track's player cannot retune another
 * track's amp through a CC both amps listen on (src/host/shadow_direct_fanout.h).
 */
#include <stdio.h>
#include "shadow_direct_fanout.h"

static int fails = 0;
#define OK(c, what) do { if (c) printf("  ok   %s\n", what); else { printf("  FAIL %s\n", what); fails++; } } while (0)

int main(void) {
    OK(shadow_direct_fans_out(0x90) && shadow_direct_fans_out(0x9F), "note-on fans out (any channel)");
    OK(shadow_direct_fans_out(0x80) && shadow_direct_fans_out(0x8C), "note-off fans out (any channel)");
    OK(!shadow_direct_fans_out(0xB0) && !shadow_direct_fans_out(0xB6), "a CC stays with its slot (an amp's gain, a guitar's tone)");
    OK(!shadow_direct_fans_out(0xE0), "pitch bend stays with its slot");
    OK(!shadow_direct_fans_out(0xA0) && !shadow_direct_fans_out(0xD0), "aftertouch stays with its slot");
    OK(!shadow_direct_fans_out(0xC0), "program change stays with its slot");
    if (fails) { printf("FAIL: test_direct_fanout\n"); return 1; }
    printf("PASS: test_direct_fanout\n"); return 0;
}
