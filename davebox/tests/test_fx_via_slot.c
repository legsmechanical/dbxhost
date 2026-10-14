/* tests/test_fx_via_slot.c — MIDI FX on a MOVE track and a MIDI track.
 *
 * Such a track's own chain slot is parked (its instrument is Move's, or a
 * device on the port), so its MIDI FX are borrowed. With tN_fxslot on:
 *
 *   - everything the track would send to Move / the port goes to its OWN slot
 *     instead (slot-addressed), and nothing goes to the destination directly;
 *   - what the slot's effects hand back (move_plugin_slot_midi_v1) is SENT to
 *     the track's destination, re-addressed to the track's channel (the slot
 *     may have changed it) — never recorded;
 *   - note pairs are counted, so overlapping chord notes and the late offs a
 *     stopping arp sends after a panic cannot unbalance Move's voices;
 *   - panic, a route change and switching it off close what the effects have
 *     sounding, where it sounds;
 *   - a Schwung track, a track with it off, and a None track are untouched;
 *   - it is saved with the project (sparse), and absent means off.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

static void back(hx_t *h, int slot, uint8_t status, uint8_t d1, uint8_t d2) {
    const uint8_t msg[3] = { status, d1, d2 };
    move_plugin_slot_midi_v1(h->inst, slot, msg, 3);
}
/* Channel-voice events of kind k (the engine's realtime clock to the slots is
 * not what this counts). */
static int voice(hx_midi_kind k) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != k) continue;
        if (e->bytes[1] >= 0x80 && e->bytes[1] < 0xF0) n++;
    }
    return n;
}
static int seen(hx_midi_kind k, int slot, uint8_t status, uint8_t d1) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != k || e->bytes[1] != status || e->bytes[2] != d1) continue;
        if (k == HX_MIDI_INTERNAL && slot >= 0 && e->slot != slot) continue;
        n++;
    }
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    const int T = 2;
    seq8_track_t *tr = &inst->tracks[T];
    char buf[64];

    hx_set_param(h, "t2_route", "move");
    hx_set_param(h, "t2_channel", "3");                 /* Move instrument on ch 3 -> nibble 2 */
    HX_ASSERT(tr->pfx.route == ROUTE_MOVE && tr->pfx.slot == T, "rig: track 2 is a Move track owning slot 2");
    const uint8_t CH = (uint8_t)(tr->channel & 0x0F);
    inst->active_track = T;
    hx_render(h, 4);

    /* ---- CONTROL: off, a played note goes straight to Move ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t2_live_notes", "eon 60 100");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x90 | CH), 60) == 1, "control: off, the note reaches Move directly");
    HX_ASSERT(voice(HX_MIDI_INTERNAL) == 0, "control: off, nothing goes to the slot");
    hx_set_param(h, "t2_live_notes", "eoff 60");
    hx_render(h, 2);

    /* ---- 1. ON: the note goes to the track's OWN slot, not to Move ---- */
    hx_set_param(h, "t2_fxslot", "1");
    HX_ASSERT(hx_get_param(h, "t2_fxslot", buf, sizeof buf) > 0 && buf[0] == '1', "the switch reads back");
    HX_ASSERT(inst->state_dirty, "the switch marks the project for saving");
    hx_clear_capture(h);
    hx_set_param(h, "t2_live_notes", "eon 62 100");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 62) == 1, "on: the note goes to the track's own slot");
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0, "on: nothing reaches Move directly (it would sound twice)");

    /* ---- 2. what the effect hands back is SENT, on the track's channel ---- */
    hx_clear_capture(h);
    back(h, T, 0x95, 62, 100);                          /* the slot answered on another channel */
    back(h, T, 0x95, 66, 100);                          /* ...with a third on top (a chord) */
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x90 | CH), 62) == 1 &&
              seen(HX_MIDI_INJECT, -1, (uint8_t)(0x90 | CH), 66) == 1, "the effect's output reaches Move, on the track's channel");
    HX_ASSERT(voice(HX_MIDI_INTERNAL) == 0, "the output is not sent back into the slot");
    {
        int i, recorded = 0;
        const clip_t *cl = &tr->clips[tr->active_clip];
        for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].pitch == 66) recorded++;
        HX_ASSERT(recorded == 0, "the output is never recorded (it carries the clip's own notes back)");
    }

    /* ---- 3. counted pairs: a second on of a sounding pitch, an off of one
     *         that never sounded, and the extra off of a double ---- */
    hx_clear_capture(h);
    back(h, T, 0x90, 66, 100);                          /* 66 again: already sounding */
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0, "a pitch already sounding is not struck twice");
    back(h, T, 0x80, 66, 0);
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0, "the first of two offs does not close it");
    back(h, T, 0x80, 66, 0);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x80 | CH), 66) == 1, "the last off closes it");
    back(h, T, 0x80, 70, 0);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x80 | CH), 70) == 0, "an off for a note it never played is dropped");
    back(h, T, 0x90, 70, 90);                           /* ...and leaves that pitch playable */
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x90 | CH), 70) == 1, "after a stray off the pitch still sounds (the count did not wrap)");
    back(h, T, 0x80, 70, 0);
    back(h, T, 0xB0, 1, 64);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0xB0 | CH), 1) == 1, "a CC passes through, re-addressed");

    /* ---- 4. PANIC closes what the effect has sounding — 62 still is ---- */
    hx_clear_capture(h);
    hx_set_param(h, "transport", "panic");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x80 | CH), 62) == 1, "panic closes the effect's sounding note at Move");
    hx_clear_capture(h);
    back(h, T, 0x80, 62, 0);                            /* the arp's own late off, after the panic */
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0, "the effect's late off after a panic is not sent again");

    /* ---- 5. a ROUTE CHANGE closes them at the OLD destination ---- */
    back(h, T, 0x90, 64, 90);
    hx_clear_capture(h);
    hx_set_param(h, "t2_route", "schwung");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_INJECT, -1, (uint8_t)(0x80 | CH), 64) == 1, "a route change closes the note where it sounded (Move)");

    /* ---- 6. a SCHWUNG track is untouched even with the switch on: its notes
     *         go to its slot as always, and the slot's output is not taken ---- */
    hx_clear_capture(h);
    back(h, T, 0x90, 67, 90);
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0 && voice(HX_MIDI_EXTERNAL) == 0, "a Schwung track's slot output is not sent anywhere by the engine");

    /* ---- 7. a MIDI track: out of the port ---- */
    hx_set_param(h, "t2_route", "external");
    hx_render(h, 1);
    hx_clear_capture(h);
    hx_set_param(h, "t2_live_notes", "eon 48 100");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_INTERNAL, T, (uint8_t)(0x90 | CH), 48) == 1 && voice(HX_MIDI_EXTERNAL) == 0, "MIDI track: the note goes to the slot, not the port");
    hx_clear_capture(h);
    back(h, T, 0x90, 48, 100);
    HX_ASSERT(seen(HX_MIDI_EXTERNAL, -1, (uint8_t)(0x90 | CH), 48) == 1, "MIDI track: the effect's output leaves by the port");
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0, "MIDI track: nothing reaches Move");

    /* ---- 8. OFF closes what it has sounding, and the direct path returns ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t2_fxslot", "0");
    hx_render(h, 1);
    HX_ASSERT(seen(HX_MIDI_EXTERNAL, -1, (uint8_t)(0x80 | CH), 48) == 1, "switching it off closes the effect's note at the port");
    hx_set_param(h, "t2_live_notes", "eoff 48");
    hx_clear_capture(h);
    hx_set_param(h, "t2_live_notes", "eon 50 100");
    hx_render(h, 2);
    HX_ASSERT(seen(HX_MIDI_EXTERNAL, -1, (uint8_t)(0x90 | CH), 50) == 1 && voice(HX_MIDI_INTERNAL) == 0, "off: notes go straight out again");
    hx_set_param(h, "t2_live_notes", "eoff 50");
    hx_render(h, 2);

    /* ---- 9. NONE: a handed-back note goes nowhere ---- */
    hx_set_param(h, "t2_fxslot", "1");
    hx_set_param(h, "t2_route", "none");
    hx_clear_capture(h);
    back(h, T, 0x90, 52, 100);
    HX_ASSERT(voice(HX_MIDI_INJECT) == 0 && voice(HX_MIDI_EXTERNAL) == 0, "a None track sends nothing");

    /* ---- 10. SAVED with the project, sparse; absent = off ---- */
    hx_set_param(h, "t2_route", "move");
    {
        char path[256];
        snprintf(path, sizeof path, "/tmp/hx_fxslot_%d.json", (int)getpid());
        snprintf(inst->state_path, sizeof(inst->state_path), "%s", path);
        seq8_save_state(inst);
        FILE *f = fopen(path, "r");
        HX_ASSERT(f, "the state file was written");
        static char st[1 << 20];
        size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; st[n] = 0;
        if (f) fclose(f);
        HX_ASSERT(strstr(st, "\"t2_fs\":1") != NULL, "the switch is saved");
        HX_ASSERT(strstr(st, "\"t1_fs\"") == NULL, "a track without it costs no key");
        tr->fx_via_slot = 0;
        seq8_load_state(inst);
        HX_ASSERT(tr->fx_via_slot == 1, "the switch is loaded back");
        HX_ASSERT(inst->tracks[1].fx_via_slot == 0, "absent loads as off");
        remove(path);
    }

    hx_destroy(h);
    printf("PASS: MIDI FX on Move / MIDI tracks: through the slot and back out, counted, closed, saved\n");
    return 0;
}
