/* tests/test_param_auto_seq_apply.c — a lock on one of the sequencer's OWN
 * bank knobs (NOTE FX, HARMONIZE, DELAY, SEQ ARP, the two directions) is
 * applied by the engine, on its step.
 *
 * It used to leave by the ring: staged for JS, read a tick later, written back
 * as a set_param a frame after that — so the step's note was made with the
 * PREVIOUS step's setting, and every value playback sent rewrote the clip's
 * stored setting and marked the project dirty.
 *
 * Pinned here, through the notes that come out:
 *   - the lock shapes ITS OWN step's note, both going up and coming back;
 *   - nothing is staged for JS and nothing goes to the host;
 *   - playback leaves the clip's stored value, the dirty flag and the remote
 *     revision alone; Stop gives the resting value back and dirties only when
 *     the stored value actually moved;
 *   - a hand on the knob wins; a swung step is NOT held back (the note is made
 *     at the tick, then parked); an off-mode or unknown key is dropped;
 *   - a reload of the live surface from the clip does not strand the lane;
 *   - pa_seq_vals / pa_seq_keys, and every key written at both ends of its
 *     range reads back the same. */
#include "harness.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static int note_on_at(int from, int *pitch) {
    for (int i = from; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0) {
            *pitch = e->bytes[2];
            return i;
        }
    }
    return -1;
}
/* The first `n` note-on pitches, in order. */
static int pitches(int *out, int n) {
    int got = 0, at = 0, p;
    while (got < n && (at = note_on_at(at, &p)) >= 0) { out[got++] = p; at++; }
    return got;
}

/* t1 melodic: C on step 1, E on step 5. NOTE FX Octave locked at 0 on step 1
 * and +4 on step 5 — so step 5 must sound 64 + 48 = 112, and step 1 must come
 * back to 60 on the next pass. */
static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_4_toggle", "64 100");
    hx_set_param(h, "t1_pa_set2", "0 seq:1:noteFX_octave 0 23 8192");
    hx_set_param(h, "t1_pa_set2", "0 seq:1:noteFX_octave 96 119 16383");
    return h;
}
static void play(hx_t *h) {
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_clear_capture(h);
    I->state_dirty = 0;
    hx_set_param(h, "transport", "play_focus:1:0");
}

int main(void) {
    char buf[8192];

    /* ---- the lock shapes its own step's note */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        play(h);
        uint32_t rev0 = I->rui_rev;
        hx_render(h, 1500);                              /* past the first loop */
        int p[3] = { 0, 0, 0 };
        HX_ASSERT(pitches(p, 3) == 3, "rig: fewer than three notes played");
        if (p[0] != 60 || p[1] != 112 || p[2] != 60) {
            fprintf(stderr, "FAIL: notes were %d %d %d, want 60 112 60 — the lock did not shape its own step\n",
                    p[0], p[1], p[2]);
            return 1;
        }
        HX_ASSERT(hx_stub_count_kind(HX_PARAM_SET) == 0, "a sequencer lock was sent to the HOST");
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '\0', "a sequencer lock was staged for JS as well");
        hx_get_param(h, "pa_ring_any", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '0', "pa_ring_any is set with only sequencer lanes playing");
        /* playback is transient: the clip keeps what it stored */
        HX_ASSERT(I->tracks[1].clips[0].pfx_params.octave_shift == 0, "playback rewrote the clip's STORED octave");
        HX_ASSERT(I->state_dirty == 0, "playback of a sequencer lane marked the project dirty");
        HX_ASSERT(I->rui_rev == rev0, "playback of a sequencer lane bumped the remote revision");
        hx_destroy(h);
        printf("  ok   — the lock is on its own step; nothing staged, stored, dirtied or re-synced\n");
    }

    /* ---- pa_seq_vals follows the live value; pa_seq_keys is the table */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        play(h);
        int seen4 = 0, seen0 = 0;
        for (int b = 0; b < 1500; b++) {
            hx_render(h, 1);
            hx_get_param(h, "pa_seq_vals", buf, sizeof(buf));
            if (!strcmp(buf, "1 noteFX_octave 4\n")) seen4 = 1;
            if (!strcmp(buf, "1 noteFX_octave 0\n")) seen0 = 1;
        }
        HX_ASSERT(seen4 && seen0, "pa_seq_vals never showed both lock values");
        (void)I;
        hx_get_param(h, "pa_seq_keys", buf, sizeof(buf));
        int lines = 0; for (char *c = buf; *c; c++) if (*c == '\n') lines++;
        HX_ASSERT(lines == PA_SEQ_COUNT && lines == 27, "pa_seq_keys does not list the whole table");
        HX_ASSERT(strstr(buf, "noteFX_gate 0 400 0\n") && strstr(buf, "all_lanes_playback_dir 0 3 1\n"),
                  "pa_seq_keys rows are not '<key> <min> <max> <mode>'");
        hx_destroy(h);
        printf("  ok   — pa_seq_vals follows the knob; pa_seq_keys lists %d keys\n", lines);
    }

    /* ---- Stop: the rest comes back, stored too, dirty only if stored moved */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pa_rest", "0 seq:1:noteFX_octave 8192");     /* = 0, what is stored */
        play(h);
        hx_render(h, 600);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 4, "rig: the step-5 lock is not in force");
        hx_set_param(h, "transport", "stop");
        I->state_dirty = 0;
        hx_render(h, 20);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 0, "Stop did not give the live value back");
        HX_ASSERT(I->state_dirty == 0, "Stop dirtied the project though the stored value never moved");
        hx_destroy(h);

        h = rig();
        I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pa_rest", "0 seq:1:noteFX_octave 12287");    /* = +2 */
        play(h);
        hx_render(h, 600);
        hx_set_param(h, "transport", "stop");
        I->state_dirty = 0;
        hx_render(h, 20);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 2, "Stop did not write the resting value live");
        HX_ASSERT(I->tracks[1].clips[0].pfx_params.octave_shift == 2, "Stop did not write the resting value to the clip");
        HX_ASSERT(I->state_dirty == 1, "a rest that MOVED the stored value did not mark the project dirty");
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '\0', "the rest was staged for JS");
        hx_destroy(h);
        printf("  ok   — Stop writes the rest live and stored; dirty only when stored moved\n");
    }

    /* ---- a hand on the knob wins */
    {
        hx_t *h = rig();
        hx_set_param(h, "t1_pa_hold", "seq:1:noteFX_octave");
        play(h);
        hx_render(h, 800);
        int p[2] = { 0, 0 };
        HX_ASSERT(pitches(p, 2) == 2, "rig: the held run played fewer than two notes");
        HX_ASSERT(p[0] == 60 && p[1] == 64, "automation moved a bank knob that is being held");
        hx_destroy(h);
        printf("  ok   — a held bank knob is not moved\n");
    }

    /* ---- SWING: applied at the tick, not held back with the note */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_route", "schwung");
        hx_set_param(h, "swing_res", "0");
        hx_set_param(h, "swing_amt", "60");
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        hx_set_param(h, "t1_c0_step_1_toggle", "64 100");                /* a swung step */
        hx_set_param(h, "t1_pa_set2", "0 seq:1:noteFX_octave 0 23 8192");
        hx_set_param(h, "t1_pa_set2", "0 seq:1:noteFX_octave 24 47 16383");
        play(h);
        int swung = 0, p = 0;
        for (int b = 0; b < 400; b++) { hx_render(h, 1); if (I->swing_step_delay > 0) swung = 1; }
        HX_ASSERT(swung, "rig: swing never delayed a step");
        int at = note_on_at(0, &p);
        HX_ASSERT(at >= 0 && p == 60, "rig: the first note is not the unswung C");
        at = note_on_at(at + 1, &p);
        if (at < 0 || p != 112) {
            fprintf(stderr, "FAIL: the swung step sounded %d, want 112 — its lock was held back past the note\n", p);
            return 1;
        }
        for (int i = 0; i < PA_DEFER_MAX; i++)
            HX_ASSERT(!I->pa_defer[i].used, "a sequencer lock was parked in the swing hold-back");
        hx_destroy(h);
        printf("  ok   — a swung step's bank-knob lock shapes that step's note\n");
    }

    /* ---- the live surface reloaded from the clip: the lane sends again */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        play(h);
        hx_render(h, 600);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 4, "rig: the step-5 lock is not in force");
        pfx_sync_from_clip(&I->tracks[1]);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 0, "control: the reload did not reset the live value");
        hx_render(h, 30);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 4, "after a reload from the clip the lane's value never came back");
        hx_destroy(h);
        printf("  ok   — a reload of the live surface does not strand the lane\n");
    }

    /* ---- off-mode and unknown keys are dropped, never staged */
    {
        hx_t *h = rig();
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pa_set2", "0 seq:1:all_lanes_playback_dir 0 23 16383");   /* a drum key, melodic track */
        hx_set_param(h, "t1_pa_set2", "0 seq:1:tarp_style 0 23 16383");               /* not automatable */
        hx_set_param(h, "t1_pa_set2", "0 seq:1:no_such_key 0 23 16383");
        play(h);
        hx_render(h, 600);
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '\0', "an off-mode or unknown sequencer target reached the ring");
        hx_get_param(h, "pa_seq_vals", buf, sizeof(buf));
        HX_ASSERT(!strstr(buf, "all_lanes") && !strstr(buf, "tarp") && !strstr(buf, "no_such"),
                  "pa_seq_vals lists a target the engine does not apply");
        HX_ASSERT(I->tracks[1].tarp.style == 0, "a LIVE ARP lane was applied");
        hx_destroy(h);

        /* conduct: nothing at all */
        h = hx_create(NULL);
        I = (seq8_instance_t *)h->inst;
        I->tracks[1].pad_mode = PAD_MODE_CONDUCT;
        pa_seq_apply(I, 1, 1, 16383, -1);
        HX_ASSERT(I->tracks[1].pfx.octave_shift == 0, "a conduct track took a bank-knob value");
        /* drum: its own key lands on every lane; a melodic key does not */
        hx_set_param(h, "t2_pad_mode", "1");
        seq8_track_t *tr = &I->tracks[2];
        HX_ASSERT(tr->pad_mode == PAD_MODE_DRUM && tr->drum_clips[tr->active_clip], "rig: t2 is not a drum track with a clip");
        pa_seq_apply(I, 2, 1, 16383, -1);
        HX_ASSERT(tr->pfx.octave_shift == 0, "a drum track took a melodic bank value");
        pa_seq_apply(I, 2, PA_SEQ_IDX_LANES_DIR, 16383, -1);
        HX_ASSERT(tr->drum_clips[tr->active_clip]->lanes[0].clip.playback_dir == 3 &&
                  tr->drum_clips[tr->active_clip]->lanes[DRUM_LANES - 1].clip.playback_dir == 3,
                  "the all-lanes direction did not reach every lane");
        HX_ASSERT(pa_seq_read(tr, tr->active_clip, PA_SEQ_IDX_LANES_DIR) == 3, "the all-lanes direction does not read back");
        hx_destroy(h);
        printf("  ok   — off-mode, unknown and conduct are dropped; the drum key reaches every lane\n");
    }

    /* ---- every melodic key: both ends of its range read back */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &I->tracks[1];
        for (int i = 0; i < PA_SEQ_COUNT - 1; i++) {
            const pa_seq_def_t *d = &pa_seq_defs[i];
            pa_seq_apply(I, 1, i, 16383, -1);
            int hi = pa_seq_read(tr, tr->active_clip, i);
            pa_seq_apply(I, 1, i, 0, -1);
            int lo = pa_seq_read(tr, tr->active_clip, i);
            if (hi != d->max || lo != d->min) {
                fprintf(stderr, "FAIL: %s wrote %d..%d, the table says %d..%d — the table, the writer and "
                                "the reader disagree\n", d->key, lo, hi, (int)d->min, (int)d->max);
                return 1;
            }
            /* and the rest writes the clip's stored copy as well as the live one */
            pa_seq_apply(I, 1, i, 16383, tr->active_clip);
            HX_ASSERT(pa_seq_read(tr, tr->active_clip, i) == d->max, "a rest did not write the live value");
        }
        clip_pfx_params_t *cp = &tr->clips[tr->active_clip].pfx_params;
        HX_ASSERT(cp->gate_time == 400 && cp->fb_clock == 100 && cp->seq_arp_gate == 200 && cp->octaver == 4,
                  "a rest did not reach the clip's stored settings");
        hx_destroy(h);
        printf("  ok   — all %d melodic keys read back at both ends of their range\n", PA_SEQ_COUNT - 1);
    }

    printf("PASS test_param_auto_seq_apply\n");
    return 0;
}
