/* Behavioural unit for the mixer gating rule shared by chain slots and FX
 * buses (shadow_effective_volume / shadow_move_fx_effective_volume, both
 * inline in shadow_chain_mgmt.h).
 *
 * Two properties, and they pull in opposite directions, which is why they are
 * worth pinning together:
 *   MUTE is per-family. A bus and the chain slot at the same index are
 *   alternative occupants of one mixer position, so muting the slot must not
 *   silence the bus.
 *   SOLO is shared. shadow_solo_count is raised by either family, and anything
 *   not soloed goes silent regardless of which family it belongs to —
 *   otherwise "solo" leaves half the mixer playing.
 */
#define SCHWUNG_INSTALL_DIR "/tmp/schwung-test"
#define SCHWUNG_SHM_PREFIX "schwung-test"

#include <stdio.h>
#include <string.h>

#include "shadow_chain_mgmt.h"

/* The two inline helpers read exactly these three objects. */
shadow_chain_slot_t shadow_chain_slots[SHADOW_CHAIN_INSTANCES];
volatile int shadow_solo_count = 0;
move_fx_strip_t shadow_move_fx_strip[MOVE_FX_SLOTS];

static int failures = 0;

static void check(int cond, const char *what) {
    if (!cond) {
        fprintf(stderr, "FAIL: %s\n", what);
        failures++;
    }
}

static void reset(void) {
    memset(shadow_chain_slots, 0, sizeof(shadow_chain_slots));
    memset((void *)shadow_move_fx_strip, 0, sizeof(shadow_move_fx_strip));
    shadow_solo_count = 0;
    for (int i = 0; i < SHADOW_CHAIN_INSTANCES; i++) shadow_chain_slots[i].volume = 1.0f;
    for (int i = 0; i < MOVE_FX_SLOTS; i++) shadow_move_fx_strip[i].volume = 1.0f;
}

int main(void) {
    /* Nothing muted or soloed: everything passes at its own volume. */
    reset();
    shadow_move_fx_strip[1].volume = 0.25f;
    check(shadow_move_fx_effective_volume(1) == 0.25f, "an ungated bus passes its own volume");
    check(shadow_effective_volume(1) == 1.0f, "an ungated slot passes its own volume");

    /* Mute is per-family, in both directions. */
    reset();
    shadow_chain_slots[2].muted = 1;
    check(shadow_effective_volume(2) == 0.0f, "muting a slot silences the slot");
    check(shadow_move_fx_effective_volume(2) == 1.0f,
          "muting a chain slot must NOT silence the bus at the same index — they are "
          "alternative occupants of one position, not a shared signal path");

    reset();
    shadow_move_fx_strip[2].muted = 1;
    check(shadow_move_fx_effective_volume(2) == 0.0f, "muting a bus silences the bus");
    check(shadow_effective_volume(2) == 1.0f, "muting a bus must not silence the chain slot");

    /* Solo is shared: a soloed BUS silences every chain slot. */
    reset();
    shadow_move_fx_strip[0].soloed = 1;
    shadow_solo_count = 1;
    check(shadow_move_fx_effective_volume(0) == 1.0f, "the soloed bus still sounds");
    check(shadow_move_fx_effective_volume(1) == 0.0f, "a non-soloed bus is silenced by a bus solo");
    check(shadow_effective_volume(0) == 0.0f,
          "a chain slot is silenced by a BUS solo — solo is one group across both families");

    /* ...and a soloed chain slot silences every bus. */
    reset();
    shadow_chain_slots[3].soloed = 1;
    shadow_solo_count = 1;
    check(shadow_effective_volume(3) == 1.0f, "the soloed slot still sounds");
    check(shadow_move_fx_effective_volume(0) == 0.0f,
          "a bus is silenced by a chain-slot solo — solo is one group across both families");

    /* Solo wins over mute, for a bus as for a slot. */
    reset();
    shadow_move_fx_strip[1].muted = 1;
    shadow_move_fx_strip[1].soloed = 1;
    shadow_solo_count = 1;
    check(shadow_move_fx_effective_volume(1) == 1.0f, "solo wins over mute on a bus");

    if (failures) {
        fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    printf("test_move_bus_mute_solo: all checks passed\n");
    return 0;
}
