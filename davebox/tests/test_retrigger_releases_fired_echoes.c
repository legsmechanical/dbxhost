/* tests/test_retrigger_releases_fired_echoes.c — retriggering a note that has
 * MIDI DLY echoes does not leave the echoes that already sounded stuck.
 *
 * THE BUG THIS PINS (2026-10-04 module review): pfx_note_on's retrigger guard
 * sent offs for the old note's own pitches and then overwrote its record. An
 * echo's note-off is scheduled only from that record, when the note ends
 * (pfx_sched_delay_offs). Echoes already fired from the queue therefore never
 * got their offs: the output refcount stayed up, later hits on the pitch were
 * dropped as "already sounding", and the synth held the note. The 09-30 fixes
 * covered QUEUED offs, not FIRED echoes.
 *
 * Driven through pfx_note_on / pfx_note_off directly (the path both sequenced
 * and live notes take). Pitch feedback +12 keeps the echoes on their own
 * pitches, so each pitch's count is unambiguous. Both delay_retrig settings. */
#include "harness.h"

static int ons(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == (uint8_t)note && e->bytes[3] > 0) n++;
    }
    return n;
}

static void run(const char *retrig) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_delay_level", "100");
    hx_set_param(h, "t1_delay_repeats", "3");
    hx_set_param(h, "t1_delay_pitch_fb", "12");
    hx_set_param(h, "t1_delay_retrig", retrig);
    hx_stub_reset_capture();

    pfx_note_on(inst, tr, 60, 100);
    int g = 0;
    while (!ons(72) && g++ < 20000) hx_render(h, 1);   /* the first echo has sounded */
    HX_ASSERT(ons(72) == 1, "control: the first echo sounded");

    pfx_note_on(inst, tr, 60, 100);                      /* retrigger, no note-off between */
    hx_render(h, 50);
    pfx_note_off(inst, tr, 60);
    hx_render(h, 40000);                                 /* every echo and its gate run out */

    for (int n = 0; n < 128; n++) {
        if (tr->pfx.pitch_refcount[n]) {
            fprintf(stderr, "FAIL (delay_retrig %s): pitch %d left sounding (refcount %d)\n",
                    retrig, n, (int)tr->pfx.pitch_refcount[n]);
            exit(1);
        }
    }
    hx_destroy(h);
    printf("  ok   — delay_retrig %s: nothing left sounding\n", retrig);
}

int main(void) {
    run("1");
    run("0");
    printf("PASS: retrigger_releases_fired_echoes\n");
    return 0;
}
