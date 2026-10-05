/* tests/test_restart_releases_queued_offs.c — Restart and Restart-at-page send
 * the note-offs still waiting in a MIDI-to follower's play-effects queue.
 *
 * THE BUG THIS PINS (2026-10-04 module review): the restart, restart_at and
 * panic branches carried their own copy of the silencer, written before Stop's
 * was fixed: they tested the track's OWN route and, for anything but Move,
 * ZEROED the queue. A MIDI DLY echo that has already sounded has its note-off
 * waiting there. On a chain synth the restart's panic sweep covers it anyway,
 * but a `MIDI to Track N` follower whose target plays a MOVE instrument reads
 * as external, lost its offs, and the sweep never touches Move (it corrupts
 * Move's voices): the echo stuck. They now share Stop's silencer
 * (silence_track_from_set_param), which goes by the EFFECTIVE route.
 *
 * Measured at the moment the note itself has ended (nothing left for the
 * per-note silencer) but an echo's note-off is still queued. */
#include "harness.h"

static int queued_offs(const play_fx_t *fx) {
    int n = 0;
    for (int i = 0; i < fx->event_count; i++) {
        uint8_t st = fx->events[i].msg[0] & 0xF0;
        if (st == 0x80 || (st == 0x90 && fx->events[i].msg[2] == 0)) n++;
    }
    return n;
}
/* Offs that reached MOVE (the inject path): the panic sweep's offs go to
 * Schwung slots and must not count. */
static int emitted_offs(void) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        int st = e->bytes[1] & 0xF0;
        if (st == 0x80 || (st == 0x90 && e->bytes[3] == 0)) n++;
    }
    return n;
}

static void run(const char *verb) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    hx_set_param(h, "t1_route", "external");
    hx_set_param(h, "t1_midi_to", "3");       /* plays track 3's instrument */
    hx_set_param(h, "t2_route", "move");
    HX_ASSERT(midi_dest_resolve(tr->pfx.route, tr->pfx.slot, tr->pfx.midi_to).route == ROUTE_MOVE,
              "control: t1 follows a Move instrument");
    hx_set_param(h, "t1_delay_level", "100");
    hx_set_param(h, "t1_delay_repeats", "4");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");

    /* The note has ended; an echo has sounded and its off is still queued. */
    int g = 0;
    while (!(tr->play_pending_count == 0 && !tr->note_active
             && queued_offs(&tr->pfx) > 0 && inst->global_tick > 0) && g++ < 20000)
        hx_render(h, 1);
    int q = queued_offs(&tr->pfx);
    HX_ASSERT(q > 0, "control: an echo's note-off is queued");

    hx_stub_reset_capture();
    hx_set_param(h, "transport", verb);
    hx_render(h, 2);
    int sent = emitted_offs();
    if (sent < q) {
        fprintf(stderr, "FAIL: '%s' sent %d of %d queued note-offs\n", verb, sent, q);
        exit(1);
    }
    hx_destroy(h);
    printf("  ok   — %s sends the %d queued note-off(s)\n", verb, q);
}

int main(void) {
    run("restart");
    run("restart_at:0:0:-1");
    printf("PASS: restart_releases_queued_offs\n");
    return 0;
}
