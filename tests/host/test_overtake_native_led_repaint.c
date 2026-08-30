/* Regression test for suspend-keeps-JS overtake LED handoff.
 *
 * A native note-layout snapshot can be incomplete when an overtake starts.
 * When the tool requests a native repaint on exit, the host must not replay
 * that snapshot or any queued tool LED writes over Move's fresh output.
 *
 * ⚠⚠ AND THE REQUEST MUST BE ITS OWN BYTE. The behaviour first shipped
 * reading `skip_led_clear`, copying upstream, where that byte carries both
 * meanings. In this fork skip_led_clear is a PERSISTENT CLAIM davebox's
 * primary-services layer holds for a whole move_native co-run session, so the
 * audio side read every ordinary overtake exit as a repaint request and
 * discarded davebox's queued pad writes -- while its JS setLED cache went on
 * believing they had landed, so no repaint ever came. Seen on hardware as
 * project management with no pad LEDs, and a loaded project showing PM's
 * stale pattern.
 *
 * The scenario that catches it is the THIRD one below, and the shape of it is
 * the whole point: the claim is raised MID-SESSION, after entry. A claim that
 * was already up at entry latches snapshot_skip_restore and takes neither
 * branch, which is why the original change looked safe -- the reasoning in
 * its own commit message stops exactly there.
 */
#include <stdio.h>
#include <string.h>

#include "shadow_led_queue.h"

static int fails = 0;
#define CHECK(cond, msg) do { \
    if (!(cond)) { fprintf(stderr, "FAIL: %s\n", msg); fails++; } \
} while (0)

static shadow_control_t control;
static shadow_control_t *control_ptr = &control;
static uint8_t midi_out[HW_MIDI_OUT_SIZE];
static uint8_t *ui_midi;

static void begin_host(void) {
    memset(&control, 0, sizeof control);
    memset(midi_out, 0, sizeof midi_out);
    led_queue_host_t host = {
        .midi_out_buf = midi_out,
        .shadow_control = &control_ptr,
        .shadow_ui_midi_shm = &ui_midi,
        .passthrough_ccs = NULL,
    };
    led_queue_init(&host);
}

static void empty_frame(void) {
    memset(midi_out, 0, sizeof midi_out);
}

static int packet_present(uint8_t type, uint8_t data1, uint8_t data2) {
    for (int i = 0; i < HW_MIDI_OUT_SIZE; i += 4) {
        if ((midi_out[i + 1] & 0xF0) == type &&
            midi_out[i + 2] == data1 && midi_out[i + 3] == data2) return 1;
    }
    return 0;
}

static void capture_native_then_enter_overtake(void) {
    /* Cache a representative C-major pad color and Shift-row icon. */
    midi_out[0] = 0x09; midi_out[1] = 0x90; midi_out[2] = 68; midi_out[3] = 17;
    midi_out[4] = 0x0B; midi_out[5] = 0xB0; midi_out[6] = 16; midi_out[7] = 5;
    shadow_clear_move_leds_if_overtake();

    control.overtake_mode = 2;
    shadow_clear_move_leds_if_overtake();

    /* Drain the entry clear ceremony so it cannot affect exit assertions. */
    for (int i = 0; i < 12; i++) {
        empty_frame();
        shadow_flush_pending_leds();
    }
}

static void test_default_exit_still_restores_snapshot(void) {
    begin_host();
    capture_native_then_enter_overtake();

    control.overtake_mode = 0;
    empty_frame();
    shadow_clear_move_leds_if_overtake();

    int restored_pad = 0;
    int restored_shift_row = 0;
    for (int i = 0; i < 12; i++) {
        empty_frame();
        shadow_flush_pending_leds();
        restored_pad |= packet_present(0x90, 68, 17);
        restored_shift_row |= packet_present(0xB0, 16, 5);
    }
    CHECK(restored_pad, "ordinary overtake exit restores cached native pad color");
    CHECK(restored_shift_row, "ordinary overtake exit restores cached Shift-row icon");
}

/*
 * THE REGRESSION. A standing skip_led_clear claim is NOT an exit request.
 *
 * Entry happens with the claim DOWN, so snapshot_skip_restore is 0 and the
 * exit transition really does have a decision to make -- which is what makes
 * this the discriminating case. davebox raises the claim after load, from a
 * co-run service, and then every subsequent overtake->0 transition has to go
 * on restoring the snapshot exactly as it did before the byte existed.
 */
static void test_standing_claim_is_not_an_exit_request(void) {
    begin_host();
    capture_native_then_enter_overtake();

    /* The primary-services layer raises the claim mid-session (move_native
     * co-run wants Move's own LED writes to pass through live). */
    control.skip_led_clear = 1;
    /* No exit request: this is a claim, not a one-shot. */

    control.overtake_mode = 0;
    empty_frame();
    shadow_clear_move_leds_if_overtake();

    CHECK(control.skip_led_clear == 1,
          "the standing claim is NOT consumed by the exit transition");

    int restored_pad = 0;
    for (int i = 0; i < 12; i++) {
        empty_frame();
        shadow_flush_pending_leds();
        restored_pad |= packet_present(0x90, 68, 17);
    }
    CHECK(restored_pad,
          "a standing skip_led_clear claim does not discard the snapshot on exit");
}

/*
 * And the RGB restore is still ARMED. This is the half the device actually
 * showed: project management's pads are Move-firmware RGB, replayed from the
 * sysex cache. With a standing claim misread as an exit request the replay
 * never ran, so the pads stayed dark -- and davebox's JS setLED cache believed
 * its writes had landed, so nothing repainted them either.
 *
 * Asserted on the ARMING rather than on emitted packets: the two paths differ
 * in exactly one observable here, and a queued NOTE write is not it --
 * queue_hw_leds_restore() overwrites every hardware note LED on an ordinary
 * exit, so a tool write to the same pad is legitimately superseded whichever
 * branch runs. Checking that would have been asserting the wrong mechanism.
 */
static void test_standing_claim_keeps_the_rgb_restore_armed(void) {
    begin_host();
    capture_native_then_enter_overtake();

    control.skip_led_clear = 1;

    control.overtake_mode = 0;
    empty_frame();
    shadow_clear_move_leds_if_overtake();

    CHECK(led_queue_move_sysex_restore_pending() != 0,
          "a standing claim leaves the Move sysex RGB restore armed");
}

int main(void) {
    test_default_exit_still_restores_snapshot();
    test_standing_claim_is_not_an_exit_request();
    test_standing_claim_keeps_the_rgb_restore_armed();
    if (fails) {
        fprintf(stderr, "%d check(s) failed\n", fails);
        return 1;
    }
    puts("PASS: overtake native LED repaint handoff");
    return 0;
}
