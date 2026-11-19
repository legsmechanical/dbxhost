/* tests/test_fx_aftertouch_into_module.c — aftertouch goes INTO a track's MIDI
 * FX module, the way its notes do.
 *
 * A tester's aftertouch-driven effect in front of the instrument heard no
 * pressure in dAVEBOx, while stock Schwung runs pad pressure through the
 * chain's MIDI FX: every pressure message left the track past the module,
 * straight to the instrument. Pinned:
 *
 *   - control: no module switch — pressure reaches the slot the usual way
 *     (through the chain, so its MIDI FX already see it), nothing direct;
 *   - PRE: poly and channel pressure go into the slot (the effect), and
 *     nothing reaches the instrument directly until the effect hands it back;
 *     what it hands back goes DIRECT, past the effect, and not in again;
 *   - POST: the same, into the module;
 *   - a Move track in Pre: into the slot, not to Move; the output to Move.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static void back(hx_t *h, int slot, uint8_t status, uint8_t d1, uint8_t d2) {
    const uint8_t msg[3] = { status, d1, d2 };
    move_plugin_slot_midi_v1(h->inst, slot, msg, 3);
}
/* Events of kind k to `slot` (-1 any) whose status TYPE is `type` and first
 * data byte d1. */
static int seen(hx_midi_kind k, int slot, uint8_t type, uint8_t d1) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != k || (e->bytes[1] & 0xF0) != type || e->bytes[2] != d1) continue;
        if (slot >= 0 && e->slot != slot) continue;
        n++;
    }
    return n;
}
static int pressure_of(hx_midi_kind k) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        const uint8_t t = e->bytes[1] & 0xF0;
        if (e->kind == k && (t == 0xA0 || t == 0xD0)) n++;
    }
    return n;
}

/* Hold a pad, press it, let go — the gesture the tester makes. */
static void press(hx_t *h, int pitch, int pressure, int mode) {
    char v[32];
    snprintf(v, sizeof v, "%d %d %d", pitch, pressure, mode);
    hx_set_param(h, "t1_live_at", v);
    hx_render(h, 1);
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    const int T = 1;
    seq8_track_t *tr = &inst->tracks[T];

    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(tr->pfx.route == ROUTE_SCHWUNG && tr->pfx.slot == T && tr->pad_mode != PAD_MODE_DRUM,
              "rig: melodic Schwung track 1, slot 1");
    inst->active_track = T;
    hx_render(h, 4);
    hx_set_param(h, "t1_live_notes", "eon 60 100");
    hx_render(h, 1);

    /* ---- CONTROL: no module switch — through the chain, nothing direct ---- */
    hx_clear_capture(h);
    press(h, 60, 90, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xA0, 60) == 1 && pressure_of(HX_MIDI_DIRECT) == 0,
              "control: poly pressure reaches the slot through its chain");

    /* ---- 1. PRE: pressure goes INTO the effect ---- */
    hx_set_param(h, "t1_fxpre", "1");
    HX_ASSERT(tr->fx_pre, "rig: pre on");
    hx_clear_capture(h);
    press(h, 60, 80, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xA0, 60) == 1, "pre: poly pressure goes into the slot (its MIDI FX)");
    HX_ASSERT(pressure_of(HX_MIDI_DIRECT) == 0, "pre: poly pressure went around the effect, straight to the instrument");
    hx_clear_capture(h);
    press(h, 60, 70, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xD0, 70) == 1, "pre: channel pressure goes into the slot");
    HX_ASSERT(pressure_of(HX_MIDI_DIRECT) == 0, "pre: channel pressure went around the effect");

    /* what the effect makes of it reaches the instrument, past the effect */
    hx_clear_capture(h);
    back(h, T, 0xA0 | (tr->channel & 0x0F), 60, 55);
    back(h, T, 0xD0 | (tr->channel & 0x0F), 44, 0);
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, 0xA0, 60) == 1 && seen(HX_MIDI_DIRECT, T, 0xD0, 44) == 1,
              "pre: the effect's pressure output reaches the instrument DIRECT");
    HX_ASSERT(pressure_of(HX_MIDI_INTERNAL) == 0, "pre: the effect's output went back into the effect");
    hx_set_param(h, "t1_fxpre", "0");
    hx_render(h, 1);

    /* ---- 2. POST: into the module ---- */
    hx_set_param(h, "t1_fxpost", "1");
    HX_ASSERT(tr->fx_post && !tr->fx_pre, "rig: post on");
    hx_render(h, 1);
    hx_clear_capture(h);
    press(h, 60, 81, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xA0, 60) == 1, "post: poly pressure goes into the module");
    HX_ASSERT(pressure_of(HX_MIDI_DIRECT) == 0, "post: poly pressure went around the module");
    hx_clear_capture(h);
    press(h, 60, 71, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xD0, 71) == 1 && pressure_of(HX_MIDI_DIRECT) == 0,
              "post: channel pressure goes into the module, not around it");
    hx_clear_capture(h);
    back(h, T, 0xA0 | (tr->channel & 0x0F), 60, 33);
    HX_ASSERT(seen(HX_MIDI_DIRECT, T, 0xA0, 60) == 1 && pressure_of(HX_MIDI_INTERNAL) == 0,
              "post: the module's pressure output reaches the instrument DIRECT, and only there");
    hx_set_param(h, "t1_fxpost", "0");
    hx_render(h, 1);

    /* ---- 3. a MOVE track in Pre: into the slot, the output to Move ---- */
    hx_set_param(h, "t1_route", "move");
    hx_set_param(h, "t1_channel", "4");
    hx_set_param(h, "t1_fxpre", "1");
    hx_render(h, 1);
    hx_clear_capture(h);
    press(h, 60, 66, 1);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, 0xA0, 60) == 1 && pressure_of(HX_MIDI_INJECT) == 0,
              "Move pre: pressure goes into the slot, not to Move");
    hx_clear_capture(h);
    back(h, T, 0xA0, 60, 22);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, 0xA0, 60) == 1, "Move pre: the effect's pressure output reaches Move");

    hx_destroy(h);
    printf("PASS: aftertouch goes into the track's MIDI FX module, Pre and Post\n");
    return 0;
}
