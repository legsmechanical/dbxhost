/* test_midi_via_slot.c — item 15 (2026-09-05): a MIDI track's stream goes
 * THROUGH its parked chain slot (midi_send_internal_slot) when JS says the slot
 * can take it (tN_midi_via_slot = 1), and straight to the port otherwise.
 * The chain's own `midi_out` sink is tests/host/test_chain_midi_out.sh. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

#define MEL_MAP \
    "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 " \
    "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91"

static void pad_on(hx_t *h, int padIdx, int vel) {
    uint8_t m[3] = { 0x90, (uint8_t)(68 + padIdx), (uint8_t)vel };
    hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
}
static void pad_off(hx_t *h, int padIdx) {
    uint8_t m[3] = { 0x80, (uint8_t)(68 + padIdx), 0 };
    hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
}
static int internal_to_slot(int slot) {
    int i, hit = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && e->slot == slot) hit++;
    }
    return hit;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char buf[32];

    hx_set_param(h, "t6_route", "external");
    hx_set_param(h, "t6_padmap", MEL_MAP);
    HX_ASSERT(hx_get_param(h, "t6_midi_via_slot", buf, sizeof buf) > 0 && !strcmp(buf, "0"),
              "default: a MIDI track goes straight to the port (midi_via_slot 0)");
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(hx_count_midi(h, HX_MIDI_EXTERNAL) > 0, "control: a MIDI track emits to the port");
    HX_ASSERT(internal_to_slot(inst->tracks[6].pfx.slot) == 0, "control: nothing into its parked slot");
    printf("  ok   — control: a MIDI track emits straight to the port (%d packets)\n", hx_count_midi(h, HX_MIDI_EXTERNAL));

    hx_set_param(h, "t6_midi_via_slot", "1");
    HX_ASSERT(inst->tracks[6].pfx.midi_via_slot == 1, "flag set on pfx");
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(hx_count_midi(h, HX_MIDI_EXTERNAL) == 0, "via slot: NOTHING goes straight to the port");
    HX_ASSERT(internal_to_slot(inst->tracks[6].pfx.slot) >= 2, "via slot: the note-on and note-off went INTO the track's own slot");
    printf("  ok   — via slot: the stream enters the parked slot (%d packets), none to the port\n", internal_to_slot(inst->tracks[6].pfx.slot));

    /* The status byte keeps the TRACK's channel on the way in (the chain
     * rewrites it on the way out). */
    {
        int i, ok = 0;
        for (i = 0; i < hx_stub_event_count(); i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_INTERNAL && e->slot == inst->tracks[6].pfx.slot &&
                (e->bytes[1] & 0xF0) == 0x90) { ok = 1; break; }
        }
        HX_ASSERT(ok, "via slot: a note-on packet reached the slot");
    }

    hx_set_param(h, "t6_midi_via_slot", "0");
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(hx_count_midi(h, HX_MIDI_EXTERNAL) > 0, "flag off: back to the port");
    HX_ASSERT(internal_to_slot(inst->tracks[6].pfx.slot) == 0, "flag off: nothing into the slot");
    printf("  ok   — flag off: straight to the port again\n");

    /* A Schwung track is untouched by the flag: its notes go into its slot regardless. */
    hx_set_param(h, "t6_route", "schwung");
    hx_set_param(h, "t6_midi_via_slot", "1");
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(hx_count_midi(h, HX_MIDI_EXTERNAL) == 0 && internal_to_slot(inst->tracks[6].pfx.slot) >= 2,
              "a Schwung track ignores the flag (its slot as always)");
    printf("  ok   — the flag means nothing off the MIDI route\n");

    hx_destroy(h);
    printf("PASS: test_midi_via_slot\n");
    return 0;
}
