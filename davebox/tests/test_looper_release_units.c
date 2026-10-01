/* tests/test_looper_release_units.c — the looper's three release edges, each
 * driven directly (the end-to-end cases in test_looper_note_balance.c do not
 * reach them; three mutations survived there).
 *
 *   1. a gate mod drops a captured note-off ONLY when it queued one itself —
 *      a note sounding when Legato/Staccato/Ramp Gate went on queued none, and
 *      dropping its off stranded the note and its pitch count;
 *   2. the switch to looping sends every QUEUED note-off now (the queue's own
 *      path is what LOOPING suppresses) — but not one whose note-on was
 *      dropped with it;
 *   3. a stop from LOOPING removes the looper's share of every pitch count,
 *      and only that share. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

static int offs_for(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0;
        if ((st == 0x80 || (st == 0x90 && e->bytes[3] == 0)) && e->bytes[2] == note) n++;
    }
    return n;
}

int main(void) {
    int checks = 0;
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    hx_set_param(h, "state_load", "aaaaaaaa-2222-3333-4444-555555555555");
    hx_set_param(h, "t1_pad_mode", "0");

    /* ---- 1. gate mods */
    in->looper_capture_ticks = 48; in->looper_state = LOOPER_STATE_LOOPING;
    in->perf_mods_active = PERF_MOD_LEGATO; in->perf_staccato_count = 0;
    in->perf_emitted_pitch[1][60] = 60;
    {
        uint8_t d1 = 60, d2 = 0;
        HX_ASSERT(perf_apply(in, 1, 0x80, &d1, &d2) == 1,
                  "Legato dropped the off of a note it never queued one for");
        in->perf_emitted_pitch[1][60] = 60;
        in->perf_staccato_notes[0].track = 1; in->perf_staccato_notes[0].raw_pitch = 60;
        in->perf_staccato_notes[0].emitted_pitch = 60; in->perf_staccato_notes[0].fire_at = 10;
        in->perf_staccato_count = 1;
        d1 = 60; d2 = 0;
        HX_ASSERT(perf_apply(in, 1, 0x80, &d1, &d2) == 0,
                  "control: Legato's own queued off must still replace the captured one");
        checks += 2;
    }
    in->perf_mods_active = 0; in->perf_staccato_count = 0;
    in->looper_state = LOOPER_STATE_IDLE; in->looper_capture_ticks = 0;

    /* ---- 2. queued note-offs go out at the switch; a dropped on takes its off with it */
    {
        play_fx_t *fx = &in->tracks[1].pfx;
        fx->event_count = 0;
        fx->pitch_refcount[62] = 1;                             /* 62 sounding, its off queued */
        pfx_q_insert(fx, fx->sample_counter + 100000, (uint8_t)(0x80 | in->tracks[1].channel), 62, 0, 0);
        pfx_q_insert(fx, fx->sample_counter + 100001, (uint8_t)(0x90 | in->tracks[1].channel), 65, 90, 0);  /* not yet sounded */
        pfx_q_insert(fx, fx->sample_counter + 100002, (uint8_t)(0x80 | in->tracks[1].channel), 65, 0, 0);
        hx_clear_capture(h);
        looper_release_tracks(in);
        HX_ASSERT(offs_for(62) == 1, "the queued note-off was not sent at the switch");
        HX_ASSERT(offs_for(65) == 0, "a note-off went out for a note-on that never sounded");
        HX_ASSERT(fx->event_count == 0, "note events stayed queued");
        checks += 3;
    }

    /* ---- 3. a stop from LOOPING clears exactly the looper's share */
    {
        play_fx_t *fx = &in->tracks[1].pfx;
        fx->pitch_refcount[70] = 3;                             /* a leaked looper count */
        in->looper_state = LOOPER_STATE_LOOPING; in->looper_capture_ticks = 48;
        looper_stop(in);
        fx->pitch_refcount[72] = 1;                             /* a live note begun after the stop */
        hx_clear_capture(h);
        looper_tick(in);                                        /* the deferred drain */
        HX_ASSERT(fx->pitch_refcount[70] == 0 && offs_for(70) == 1, "the looper's count was not cleared at the stop");
        HX_ASSERT(fx->pitch_refcount[72] == 1 && offs_for(72) == 0, "the stop cut a live note begun after it");
        checks += 2;
    }

    hx_destroy(h);
    printf("PASS: test_looper_release_units (%d checks)\n", checks);
    return 0;
}
