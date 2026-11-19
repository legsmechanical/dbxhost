/* tests/test_mute_mode.c — MUTE MODE, a TRACK CONFIG row (Josh, 2026-11-19:
 * "option for mute to be midi (current way mute works) or audio (mute the
 * track's audio bus immediately)").
 *
 * MIDI (the default) is mute as it always was: the notes stop, and the track's
 * bus is never written. Audio lets the notes play on and mutes the track's bus
 * instead — the chain slot's `slot:muted`, or a Move track's `move_fx:N:muted`
 * — through the host extension, in the block the mute changes. Pinned here:
 *   - CONTROL: a MIDI-mode mute stops the notes and writes no bus mute
 *   - Audio: the notes keep coming, the slot is muted, then unmuted on unmute
 *   - a solo elsewhere mutes an Audio-mode track's bus too (effective mute)
 *   - writes happen on a CHANGE only, never per block
 *   - a route change moves the mute: the old target is let go
 *   - back to MIDI: the bus is let go and the notes stop
 *   - tN_mute_mode reads back, and survives a save / load */
#include "harness.h"
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int note_ons(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_PARAM_SET) continue;
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == (uint8_t)note && e->bytes[3] > 0) n++;
    }
    return n;
}
/* The mute writes, as "<slot>|<key>=<value>" joined by spaces. */
static const char *mute_writes(void) {
    static char out[1024];
    out[0] = '\0';
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_PARAM_SET || !strstr(e->key, "muted")) continue;
        char one[96];
        snprintf(one, sizeof one, "%s%d|%s=%s", out[0] ? " " : "", e->slot, e->key, e->value);
        strncat(out, one, sizeof out - strlen(out) - 1);
    }
    return out;
}
#define EXPECT_WRITES(want, what) do { const char *_g = mute_writes(); \
    if (strcmp(_g, (want))) { fprintf(stderr, "FAIL: %s\n  want: '%s'\n  got:  '%s'\n", (what), (want), _g); return 1; } } while (0)

#define BAR 800   /* blocks: a bar at 120 BPM is ~690 */

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create");
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char buf[32];

    hx_set_param(h, "t0_route", "schwung");
    hx_set_param(h, "t1_route", "schwung");
    for (int s = 0; s < 16; s += 4) {
        char k[48];
        snprintf(k, sizeof k, "t1_c0_step_%d_toggle", s);
        hx_set_param(h, k, "60 100");
    }
    hx_set_param(h, "transport", "play_focus:1:0");
    HX_ASSERT(in->playing == 1, "transport running");
    const int slot = (int)in->tracks[1].pfx.slot;
    HX_ASSERT(slot == 1, "t1 plays its own slot");

    hx_clear_capture(h);
    hx_render(h, BAR);
    HX_ASSERT(note_ons(60) >= 3, "control: the unmuted clip plays");
    EXPECT_WRITES("", "an unmuted MIDI-mode track writes no bus mute");
    printf("  ok   — control: the clip plays (%d note-ons), nothing written to the bus\n", note_ons(60));

    /* ---- MIDI mode (the default): the notes stop, the bus is left alone ---- */
    HX_ASSERT(hx_get_param(h, "t1_mute_mode", buf, sizeof buf) > 0 && !strcmp(buf, "0"), "default reads 0 (MIDI)");
    hx_set_param(h, "t1_mute", "1");
    hx_clear_capture(h);
    hx_render(h, BAR);
    HX_ASSERT(note_ons(60) == 0, "MIDI mute: the notes stop");
    EXPECT_WRITES("", "MIDI mute writes no bus mute");
    printf("  ok   — MIDI mode: muted, the notes stop and the bus is never written\n");

    /* ---- Audio mode while muted: the bus mutes at once, the notes come back ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_mute_mode", "1");
    HX_ASSERT(hx_get_param(h, "t1_mute_mode", buf, sizeof buf) > 0 && !strcmp(buf, "1"), "reads back 1 (Audio)");
    hx_render(h, 1);
    EXPECT_WRITES("1|slot:muted=1", "Audio mode while muted mutes the slot in the next block");
    hx_render(h, BAR);
    HX_ASSERT(note_ons(60) >= 3, "Audio mute: the notes keep playing");
    EXPECT_WRITES("1|slot:muted=1", "written once, not per block");
    printf("  ok   — Audio mode: the slot is muted in the next block, once; the notes play on (%d)\n", note_ons(60));

    /* ---- unmute: let go of the slot ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_mute", "0");
    hx_render(h, 4);
    EXPECT_WRITES("1|slot:muted=0", "unmute unmutes the slot");
    printf("  ok   — unmute writes slot:muted=0 in the next block\n");

    /* ---- a solo elsewhere: effective mute reaches the bus too ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t0_solo", "1");
    hx_render(h, 4);
    hx_set_param(h, "t0_solo", "0");
    hx_render(h, 4);
    EXPECT_WRITES("1|slot:muted=1 1|slot:muted=0", "soloed out mutes the bus, unsolo lets it go");
    printf("  ok   — soloed out by another track: the bus mutes, and unmutes with the solo\n");

    /* ---- a route change moves the mute: Move on channel 3 = move_fx:3 ---- */
    hx_set_param(h, "t1_mute", "1");
    hx_render(h, 2);
    hx_clear_capture(h);
    hx_set_param(h, "t1_channel", "3");
    hx_set_param(h, "t1_route", "move");
    hx_render(h, 2);
    EXPECT_WRITES("1|slot:muted=0 0|move_fx:3:muted=1", "the old slot let go, the Move bus muted");
    printf("  ok   — routed to Move: the slot is let go and move_fx:3 is muted\n");

    /* ---- back to MIDI while muted: the bus is let go, the notes stop ---- */
    hx_clear_capture(h);
    hx_set_param(h, "t1_mute_mode", "0");
    hx_render(h, BAR);
    EXPECT_WRITES("0|move_fx:3:muted=0", "MIDI mode lets the bus go");
    HX_ASSERT(note_ons(60) == 0, "MIDI mode again: the muted notes stop");
    printf("  ok   — back to MIDI: the bus is unmuted, the notes stop\n");

    /* ---- a MIDI-routed track has no bus: Audio mode mutes its notes ---- */
    hx_set_param(h, "t1_route", "external");
    hx_set_param(h, "t1_mute_mode", "1");
    hx_clear_capture(h);
    hx_render(h, BAR);
    EXPECT_WRITES("", "a MIDI-routed track writes no bus");
    HX_ASSERT(note_ons(60) == 0, "a MIDI-routed track's mute still stops its notes in Audio mode");
    printf("  ok   — MIDI-routed: no bus to mute, so the notes stop whatever the mode\n");

    /* ---- state round trip ---- */
    {
        char dir[128], state[192], cmd[256];
        snprintf(dir, sizeof dir, "/tmp/hx_mutemode_%d", (int)getpid());
        snprintf(cmd, sizeof cmd, "mkdir -p %s", dir);
        if (system(cmd)) { printf("FAIL: mkdir\n"); return 1; }
        snprintf(state, sizeof state, "%s/seq8sa-state.json", dir);
        hx_set_param(h, "transport", "stop");
        hx_set_param(h, "t1_route", "schwung");
        hx_set_param(h, "state_path", state);
        hx_set_param(h, "save", "1");
        {
            FILE *fp = fopen(state, "r");
            HX_ASSERT(fp, "state file written");
            static char fbuf[1 << 20];
            size_t got = fread(fbuf, 1, sizeof(fbuf) - 1, fp);
            fclose(fp);
            fbuf[got] = '\0';
            HX_ASSERT(strstr(fbuf, "\"t1_ma\":1") && !strstr(fbuf, "\"t0_ma\""), "t1_ma:1 saved, t0 (MIDI) absent");
        }
        hx_destroy(h);
        h = NULL;
        hx_t *h2 = hx_create(NULL);
        HX_ASSERT(h2, "create 2");
        seq8_instance_t *in2 = (seq8_instance_t *)h2->inst;
        strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
        seq8_load_state(in2);
        HX_ASSERT(in2->mute_audio[1] == 1 && in2->mute_audio[0] == 0, "Audio mode survives the load");
        HX_ASSERT(in2->mute[1] == 1, "and so does the mute");
        /* the loaded project asserts its own bus at once */
        hx_clear_capture(h2);
        hx_render(h2, 2);
        EXPECT_WRITES("1|slot:muted=1", "a loaded Audio-mode muted track mutes its slot");
        hx_destroy(h2);
        snprintf(cmd, sizeof cmd, "rm -rf %s", dir);
        if (system(cmd)) { /* best effort */ }
    }
    printf("  ok   — saved as t1_ma, loaded back, and the slot re-asserted on load\n");

    printf("PASS: test_mute_mode\n");
    return 0;
}
