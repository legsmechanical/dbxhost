/* tests/test_slot_transport.c — db's transport reaches the instrument slots.
 *
 * A slot's clock-driven MIDI FX (a step generator such as a drum sequencer)
 * and its synced LFOs read Start, clock and Stop from the host's internal
 * transport. db is the master while it plays on its own clock, so it must
 * send them: Start on play, 24-PPQN clock while playing, Stop on stop —
 * through host->midi_send_internal, as [0x0F, status, 0, 0].
 *
 * While db FOLLOWS Move's clock, Move's own transport reaches the slots from
 * the host; db sending too would double it.
 *
 * And db DECLARES its tempo to the host (the extension's set_tempo), so a
 * module that asks the host for the tempo gets db's exactly — stopped or
 * playing — instead of one measured from those block-quantized clocks. */
#include "harness.h"

static int is_rt(const hx_midi_event *e, int status) {
    return e->kind == HX_MIDI_INTERNAL && e->slot == -1 && e->len == 4 &&
           e->bytes[0] == 0x0F && e->bytes[1] == status && e->bytes[2] == 0 && e->bytes[3] == 0;
}
static int count_rt(int status) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) if (is_rt(hx_stub_event(i), status)) n++;
    return n;
}
static int count_any_rt(void) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && e->bytes[1] >= 0xF8) n++;
    }
    return n;
}
/* Index of the first / last event with this status, or -1. */
static int first_rt(int status) {
    int i;
    for (i = 0; i < hx_stub_event_count(); i++) if (is_rt(hx_stub_event(i), status)) return i;
    return -1;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");

    /* Stopped: nothing. A clock with no Start would read as a running
     * transport to the host. */
    hx_clear_capture(h);
    HX_ASSERT(hx_stub_ext_tempo_calls() == 0, "setup: a tempo was declared before any block");
    hx_render(h, 200);
    HX_ASSERT(count_any_rt() == 0, "transport sent to the slots while stopped");
    printf("  ok   — stopped: no Start, no clock\n");

    /* ...but the host already knows the tempo, and is told once, not per block. */
    HX_ASSERT(hx_stub_ext_tempo() == 120.0f, "the default tempo was not declared while stopped");
    HX_ASSERT(hx_stub_ext_tempo_calls() == 1, "the tempo was declared more than once for one value");
    hx_set_param(h, "bpm", "97");
    hx_render(h, 1);
    HX_ASSERT(hx_stub_ext_tempo() == 97.0f, "a tempo change while stopped was not declared");
    HX_ASSERT(hx_stub_ext_tempo_calls() == 2, "one change, one declaration");
    hx_set_param(h, "bpm", "120");
    hx_render(h, 1);
    printf("  ok   — the host is told db's tempo while stopped, once per change\n");

    /* Play: one Start, before any clock; then clock at 24 PPQN.
     * 690 blocks x 128 frames at 44.1 kHz and 120 BPM = 4.005 beats. */
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 690);
    HX_ASSERT(count_rt(0xFA) == 1, "play did not send exactly one Start");
    HX_ASSERT(first_rt(0xF8) > first_rt(0xFA), "a clock went out before Start");
    HX_ASSERT(count_rt(0xFC) == 0, "Stop sent while playing");
    {
        int n = count_rt(0xF8);
        if (n < 95 || n > 97) { fprintf(stderr, "FAIL: %d clocks in 4 beats, want 96\n", n); return 1; }
    }
    printf("  ok   — play: one Start, then 24 clocks a beat\n");

    /* Stop: one Stop, and the clock ends with it. */
    hx_clear_capture(h);
    hx_set_param(h, "transport", "stop");
    hx_render(h, 200);
    HX_ASSERT(count_rt(0xFC) == 1, "stop did not send exactly one Stop");
    HX_ASSERT(count_rt(0xF8) == 0 && count_rt(0xFA) == 0, "clock or Start after stop");
    printf("  ok   — stop: one Stop, then silence\n");

    /* A second play starts again. */
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 50);
    HX_ASSERT(count_rt(0xFA) == 1 && count_rt(0xF8) > 0, "the second play sent no Start / clock");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* Following Move: db sends nothing — Move's transport is the slots'. */
    hx_set_param(h, "clock_follow_on", "1");
    hx_clear_capture(h);
    {
        /* Move starts and clocks two beats; db's playhead must really advance
         * on those clocks, or "sent nothing" proves nothing. */
        const uint8_t start = 0xFA, clk = 0xF8;
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        uint32_t tick0;
        int i;
        hx_send_midi(h, &start, 1, MOVE_MIDI_SOURCE_INTERNAL);
        inst->playing = 1;                          /* as a followed Start leaves it */
        hx_render(h, 2);
        tick0 = inst->arp_master_tick;
        for (i = 0; i < 48; i++) { hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL); hx_render(h, 2); }
        HX_ASSERT(inst->clock_follow_on && inst->playing, "setup: not following and playing");
        HX_ASSERT(inst->arp_master_tick - tick0 >= 96, "setup: the followed clock did not advance db");
    }
    HX_ASSERT(count_any_rt() == 0, "db sent transport to the slots while following Move");
    HX_ASSERT(hx_stub_ext_tempo() == 0.0f, "db kept its tempo declared while following Move");
    ((seq8_instance_t *)h->inst)->playing = 0;
    hx_set_param(h, "clock_follow_on", "0");
    hx_render(h, 2);
    HX_ASSERT(hx_stub_ext_tempo() >= 40.0f, "leaving follow did not declare db's tempo again");
    printf("  ok   — following Move: db sends none of its own\n");

    hx_destroy(h);
    printf("PASS: slot_transport\n");
    return 0;
}
