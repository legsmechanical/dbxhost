/* tests/test_route_none.c — ROUTE_NONE: a track with NO instrument (Josh,
 * 2026-09-05: "add none option for instrument selection in sound menu").
 *
 * The pattern plays, nothing is emitted, the chain slot is parked. ONE gate
 * implements it — midi_dest_resolve() answers emit=0 for ROUTE_NONE — so this
 * file pins the OBSERVABLE (zero MIDI of any kind out of a NONE track: live
 * notes, and the panic sweep) against a POSITIVE CONTROL (the same pad on the
 * same track routed to Schwung emits), plus the two edges that lose data
 * silently: the `t<N>_route` string round trip, and the state clamp that used
 * to turn a saved NONE into EXTERNAL on load. */
#include "harness.h"
#include <stdio.h>
#include <string.h>
#include <unistd.h>

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
static int all_midi(hx_t *h) {
    return hx_count_midi(h, HX_MIDI_INTERNAL) + hx_count_midi(h, HX_MIDI_EXTERNAL) +
           hx_count_midi(h, HX_MIDI_INJECT);
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char buf[64];

    /* ---- POSITIVE CONTROL: the same pad on a SCHWUNG-routed track emits ---- */
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_padmap", MEL_MAP);
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(all_midi(h) > 0, "control: a Schwung-routed pad emits MIDI");
    printf("  ok   — control: a Schwung-routed track emits (%d events)\n", all_midi(h));

    /* ---- NONE: the string sets it, reads back, fans out to the lanes ---- */
    hx_set_param(h, "t1_route", "none");
    HX_ASSERT(inst->tracks[1].pfx.route == ROUTE_NONE, "none: pfx.route");
    HX_ASSERT(inst->tracks[1].drum_lane_pfx[DRUM_LANES - 1].route == ROUTE_NONE, "none: lane fan-out");
    HX_ASSERT(hx_get_param(h, "t1_route", buf, sizeof buf) > 0 && !strcmp(buf, "none"),
              "none: get_param reads back 'none'");
    printf("  ok   — 'none' is a route: set, lane fan-out, read back\n");

    /* ---- NONE emits NOTHING: live notes ---- */
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    if (all_midi(h) != 0) hx_dump_midi(h);
    HX_ASSERT(all_midi(h) == 0, "none: a live pad emits no MIDI of any kind");
    printf("  ok   — a NONE track's pad emits nothing (not even into the parked chain)\n");

    /* ---- NONE emits NOTHING: the panic sweep skips it ---- */
    hx_clear_capture(h);
    hx_set_param(h, "transport", "panic");
    hx_render(h, 8);
    /* Other tracks DO get swept (that is the control for this assertion), so
     * look only for events addressed at t1's slot / channel. Internal events
     * carry the slot; t1's slot is 1. */
    {
        int i, hit = 0;
        for (i = 0; i < hx_stub_event_count(); i++) {
            const hx_midi_event *e = hx_stub_event(i);
            if (e->kind == HX_MIDI_INTERNAL && e->slot == 1) hit++;
        }
        HX_ASSERT(hit == 0, "none: the panic sweep does not address the parked slot");
        HX_ASSERT(all_midi(h) > 0, "control: the panic sweep still sweeps the other tracks");
    }
    printf("  ok   — panic sweeps the other tracks and skips the NONE one\n");

    /* ---- the parked chain: switching back finds the slot untouched ---- */
    hx_set_param(h, "t1_route", "schwung");
    HX_ASSERT(inst->tracks[1].pfx.slot == 1, "parked: the slot is still the track's own");
    hx_clear_capture(h);
    pad_on(h, 0, 100); hx_render(h, 8); pad_off(h, 0); hx_render(h, 8);
    HX_ASSERT(all_midi(h) > 0, "parked: back on Schwung the pad emits again");
    printf("  ok   — back to Schwung, the same pad emits again (parked, not destroyed)\n");

    /* ---- state round trip: a saved NONE loads as NONE, not EXTERNAL ---- */
    {
        char dir[128], state[192], cmd[256];
        snprintf(dir, sizeof dir, "/tmp/hx_none_%d", (int)getpid());
        snprintf(cmd, sizeof cmd, "mkdir -p %s", dir);
        if (system(cmd)) { printf("FAIL: mkdir\n"); return 1; }
        snprintf(state, sizeof state, "%s/seq8sa-state.json", dir);
        hx_set_param(h, "state_path", state);
        hx_set_param(h, "t1_route", "none");
        hx_set_param(h, "save", "1");
        {
            FILE *fp = fopen(state, "r");
            HX_ASSERT(fp, "state file written");
            char fbuf[65536] = {0};
            size_t got = fread(fbuf, 1, sizeof(fbuf) - 1, fp);
            fclose(fp);
            HX_ASSERT(got > 0 && strstr(fbuf, "\"t1_rt\":3"), "the file carries t1_rt:3");
        }
        /* ⚠ ONE instance at a time: the DSP keeps a process-global g_inst, so
         * the second instance must not overlap the first (destroy-time autosave
         * of h then also lands while the fixture dir still exists). */
        hx_destroy(h);
        h = NULL;
        hx_t *h2 = hx_create(NULL);
        HX_ASSERT(h2, "create 2");
        {
            seq8_instance_t *in2 = (seq8_instance_t *)h2->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2);
            /* ⚠ THE clamp edge: with the old [SCHWUNG, EXTERNAL] bound this read
             * back as 2 — an EXTERNAL track the user never made. */
            HX_ASSERT(in2->tracks[1].pfx.route == ROUTE_NONE, "a saved NONE loads as NONE, not EXTERNAL");
        }
        hx_destroy(h2);
        snprintf(cmd, sizeof cmd, "rm -rf %s", dir);
        if (system(cmd)) { /* best effort */ }
    }
    printf("  ok   — a saved NONE track loads as NONE (the clamp admits it)\n");

    printf("PASS: test_route_none\n");
    return 0;
}
