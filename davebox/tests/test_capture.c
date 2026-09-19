/* test_capture.c — retrospective Capture (Move-style Capture MIDI).
 *
 * NOTE: track 0 defaults to DRUM mode in a fresh instance — melodic
 * scenarios use track 1.
 *
 * Covers:
 *  1. Stopped capture (melodic): 4 quarter notes played on a stopped
 *     transport → commit estimates ~120 BPM, writes a 16-step clip with 4
 *     notes at ~quarter spacing, arms the clip and starts the transport.
 *  2. Playing overdub: notes played while the transport runs land in the
 *     focused clip at their heard positions; clip length unchanged.
 *  3. Transport edges clear the ring (Move parity).
 *  5. Armed input is NOT captured (record path owns it).
 *  6. Stopped capture (drum): pad hits land in the matching drum lane.
 */
#include "harness.h"

static seq8_instance_t *I(hx_t *h) { return (seq8_instance_t *)h->inst; }

/* Play pitch for hold_blocks, with gap_blocks of silence after release. */
static void tap(hx_t *h, int track, int pitch, int vel,
                int hold_blocks, int gap_blocks) {
    seq8_instance_t *inst = I(h);
    live_note_on(inst, &inst->tracks[track], (uint8_t)pitch, (uint8_t)vel);
    hx_render(h, hold_blocks);
    live_note_off(inst, &inst->tracks[track], (uint8_t)pitch);
    hx_render(h, gap_blocks);
}

/* Play a melodic phrase whose note onsets fall on the given 1/16 grid
 * positions at ~120 BPM (1/16 ≈ 43 render blocks in the 44.1k/128 stub world).
 * Notes are short staccato hits; gaps between onsets are rendered. Unlike
 * evenly-spaced taps, a phrase with varied grid positions actually constrains
 * the tempo — a wrong BPM pushes some onsets off the 1/16 grid. */
static void play_phrase_120(hx_t *h, int track, const int *steps16, int n) {
    seq8_instance_t *inst = I(h);
    const int BLK_PER_16 = 43, HOLD = 8;
    int cur = 0, i;
    for (i = 0; i < n; i++) {
        int target = steps16[i] * BLK_PER_16;
        if (target > cur) { hx_render(h, target - cur); cur = target; }
        uint8_t p = (uint8_t)(60 + (i % 5));
        live_note_on(inst, &inst->tracks[track], p, 100);
        hx_render(h, HOLD);
        live_note_off(inst, &inst->tracks[track], p);
        cur += HOLD;
    }
}

int main(void) {
    /* ---- 1. Stopped capture, mechanics + tempo apply (melodic, track 1) ----
     * NOTE: 4 evenly-spaced notes is the DEGENERATE/ambiguous case for tempo
     * detection (even spacing fits many grids); it's kept to pin the commit
     * mechanics + a sane default. Scenario 8 is the representative test: a
     * varied phrase that actually constrains the tempo. */
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = I(h);
    HX_ASSERT(!inst->playing, "expected stopped transport");
    HX_ASSERT(inst->tracks[1].pad_mode != PAD_MODE_DRUM, "track 1 melodic");

    /* 4 quarter notes at ~120 BPM: onset every 172 blocks (22016 frames). */
    hx_render(h, 4); /* settle */
    tap(h, 1, 60, 100, 40, 132);
    tap(h, 1, 62, 100, 40, 132);
    tap(h, 1, 64, 100, 40, 132);
    tap(h, 1, 65, 100, 40, 132);

    HX_ASSERT(capture_pending_for_track(inst, 1) == 4, "4 pending note-ons");
    hx_set_param(h, "t1_capture_commit", "0");

    clip_t *cl = &inst->tracks[1].clips[0];
    HX_ASSERT(cl->note_count == 4, "4 notes committed");
    HX_ASSERT(cl->length == 16, "1-bar clip length");
    HX_ASSERT(inst->playing == 1, "transport started after stopped commit");
    HX_ASSERT(inst->tracks[1].clip_playing == 1, "committed clip armed+playing");
    HX_ASSERT(inst->cap_last_was_stopped == 1, "stopped path taken");
    {
        /* Grid-fit estimator: candidates sorted ascending, applied at
         * cap_select_idx. 4 steady quarter notes at ~120 → the best-fit default
         * is ~120 (comfort tiebreak among octave-equivalent fits). */
        double bpm = inst->cap_bpm_est[inst->cap_select_idx];
        HX_ASSERT(bpm > 117.0 && bpm < 123.0, "applied BPM near 120");
        HX_ASSERT(inst->tracks[1].pfx.cached_bpm == bpm, "tempo applied");
        HX_ASSERT(inst->cap_select_active == 1, "tempo selector opened");
        HX_ASSERT(inst->cap_bpm_count >= 2, "multiple candidates offered");
        int _k;
        for (_k = 1; _k < (int)inst->cap_bpm_count; _k++)
            HX_ASSERT(inst->cap_bpm_est[_k - 1] <= inst->cap_bpm_est[_k],
                      "candidates sorted ascending");
        /* Half-time of the best (~60) must be an offered option (in range). */
        double half = bpm * 0.5;
        int have_half = 0;
        for (_k = 0; _k < (int)inst->cap_bpm_count; _k++) {
            double d = inst->cap_bpm_est[_k] - half;
            if (d < 0) d = -d;
            if (d < 2.0) have_half = 1;
        }
        HX_ASSERT(have_half, "half-time equivalent of best is offered");
    }
    /* First note at clip start; later onsets near 96-tick (quarter) spacing. */
    HX_ASSERT(cl->notes[0].tick <= 2, "first note aligns to clip start");
    {
        int i, prev = -96;
        for (i = 0; i < 4; i++) {
            int d = (int)cl->notes[i].tick - prev;
            HX_ASSERT(d > 90 && d < 102, "quarter-note spacing preserved");
            prev = (int)cl->notes[i].tick;
        }
    }
    HX_ASSERT(inst->cap_count == 0, "ring consumed by commit");
    /* Commit consumed everything — a second commit is a no-op. */
    {
        uint32_t seq = inst->cap_commit_seq;
        hx_set_param(h, "t1_capture_commit", "0");
        HX_ASSERT(inst->cap_commit_seq == seq, "empty ring: commit no-op");
    }
    /* Tempo selector: re-tempo to the lowest candidate → clip gets longer (more
     * ticks for the same real-time take), playback speed constant, then confirm. */
    {
        uint16_t len_hi = cl->length;
        hx_set_param(h, "t1_capture_retempo", "0");   /* lowest bpm */
        HX_ASSERT(inst->tracks[1].pfx.cached_bpm == inst->cap_bpm_est[0],
                  "retempo applied candidate 0");
        HX_ASSERT(inst->cap_select_idx == 0, "select idx moved to 0");
        HX_ASSERT(cl->note_count == 4, "note count preserved across retempo");
        HX_ASSERT(cl->length <= len_hi, "lower bpm → shorter-or-equal clip in bars");
        hx_set_param(h, "t1_capture_confirm", "");
        HX_ASSERT(inst->cap_select_active == 0, "selector closed on confirm");
    }
    hx_destroy(h);

    /* ---- 2. Playing overdub at heard position, length unchanged ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    HX_ASSERT(inst->playing == 1, "transport running");
    hx_render(h, 100);
    /* Capturing over an EMPTY clip while playing = a first take: the note lands
     * on the beat of the TRANSPORT's bar where it was played, and the clip is
     * sized to fit — no wrap into a default 1-bar window. (This once compared
     * against the clip's own playhead, which is frozen on a clip that is not
     * playing — the test agreed with a frozen value.) */
    HX_ASSERT(!inst->tracks[1].clip_playing, "setup: the empty clip is not playing");
    uint32_t tick_at_play = (inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step)
                          % (16u * TICKS_PER_STEP);
    HX_ASSERT(tick_at_play >= 2 * TICKS_PER_STEP, "setup: played well into the bar");
    live_note_on(inst, &inst->tracks[1], 61, 90);
    hx_render(h, 10);
    live_note_off(inst, &inst->tracks[1], 61);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "1 pending while playing");
    hx_set_param(h, "t1_capture_commit", "0");
    cl = &inst->tracks[1].clips[0];
    HX_ASSERT(cl->note_count == 1, "overdub wrote 1 note");
    HX_ASSERT((cl->length % 16) == 0, "clip sized to whole bars");
    {
        int d = (int)cl->notes[0].tick - (int)tick_at_play;
        if (d < 0) d = -d;
        HX_ASSERT(d < 24, "note lands on the beat it was played (transport bar)");
    }
    HX_ASSERT(inst->tracks[1].queued_clip == 0 && inst->tracks[1].pending_page_stop,
              "the new take is queued to start on the next bar");
    hx_render(h, 16 * 43);
    HX_ASSERT(inst->tracks[1].clip_playing && inst->tracks[1].active_clip == 0,
              "...and it is playing after the bar line");
    HX_ASSERT(inst->playing == 1, "playing commit leaves transport running");

    /* ---- 3. Transport edges clear the ring ---- */
    live_note_on(inst, &inst->tracks[1], 63, 90);
    live_note_off(inst, &inst->tracks[1], 63);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "buffered");
    hx_set_param(h, "transport", "stop");
    HX_ASSERT(inst->cap_count == 0, "stop cleared capture ring");
    hx_destroy(h);

    /* ---- 2b. Multi-bar phrase over an empty clip GROWS it (no 1-bar wrap) ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    HX_ASSERT(inst->tracks[1].clips[0].length == 16, "clip starts at 1 bar");
    /* Big gaps (each below the new-take reset threshold so they stay one phrase). */
    tap(h, 1, 60, 100, 20, 500);
    tap(h, 1, 62, 100, 20, 500);
    tap(h, 1, 64, 100, 20, 500);
    tap(h, 1, 65, 100, 20, 500);
    hx_set_param(h, "t1_capture_commit", "0");
    {
        clip_t *c2 = &inst->tracks[1].clips[0];
        HX_ASSERT(c2->note_count == 4, "all 4 notes kept (not wrapped/overwritten)");
        HX_ASSERT(c2->length > 16, "empty clip grew past 1 bar to fit the phrase");
        int i; uint32_t prev = 0;
        for (i = 0; i < c2->note_count; i++) {
            HX_ASSERT(c2->notes[i].tick >= prev, "notes laid out in order (unwrapped)");
            prev = c2->notes[i].tick;
        }
    }
    hx_destroy(h);

    /* ---- 2c. New-take gap: long silence between notes starts a fresh buffer ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    tap(h, 1, 60, 100, 20, 20);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "first note buffered");
    hx_render(h, 3000);   /* > gap threshold (>=2s at 44.1k/128) of silence */
    tap(h, 1, 62, 100, 20, 20);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1,
              "gap dropped the old note; only the new one is buffered");
    hx_destroy(h);

    /* ---- 5. Armed input is not captured ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    inst->tracks[1].recording = 1;
    live_note_on(inst, &inst->tracks[1], 60, 100);
    live_note_off(inst, &inst->tracks[1], 60);
    HX_ASSERT(inst->cap_count == 0, "armed input skipped");
    inst->tracks[1].recording = 0;

    /* ---- 6. Stopped capture into a drum track (track 0 default) ---- */
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "track 0 drum");
    hx_render(h, 4);
    tap(h, 0, 60, 100, 40, 132);
    tap(h, 0, 60, 100, 40, 132);
    tap(h, 0, 60, 100, 40, 132);
    HX_ASSERT(capture_pending_for_track(inst, 0) == 3, "3 drum hits pending");
    hx_set_param(h, "t0_capture_commit", "0");
    HX_ASSERT(inst->tracks[0].drum_clips[0] != NULL, "drum clips allocated");
    {
        int l, found = -1;
        for (l = 0; l < DRUM_LANES; l++)
            if (inst->tracks[0].drum_clips[0]->lanes[l].midi_note == 60) { found = l; break; }
        HX_ASSERT(found >= 0, "lane for pitch 60 exists");
        HX_ASSERT(inst->tracks[0].drum_clips[0]->lanes[found].clip.note_count == 3,
                  "3 notes in drum lane");
    }
    HX_ASSERT(inst->playing == 1, "transport started after drum commit");
    hx_destroy(h);

    /* ---- 7. Stopped capture on a NON-empty session WARPS to fit the tempo ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    /* Seed a note on track 2 clip 3 → session no longer empty; tempo established. */
    clip_insert_note(&inst->tracks[2].clips[3], 0, 24, 60, 100);
    HX_ASSERT(capture_session_empty(inst) == 0, "session sees seeded content");
    double bpm_before = inst->tracks[1].pfx.cached_bpm;
    hx_render(h, 4);
    tap(h, 1, 60, 100, 40, 132);
    tap(h, 1, 62, 100, 40, 132);
    tap(h, 1, 64, 100, 40, 132);
    hx_set_param(h, "t1_capture_commit", "0");   /* into empty focused clip 0 */
    HX_ASSERT(inst->tracks[1].clips[0].note_count == 3, "warp wrote the 3 notes");
    HX_ASSERT(inst->tracks[1].pfx.cached_bpm == bpm_before, "session tempo NOT changed");
    HX_ASSERT(inst->cap_select_active == 1 && inst->cap_select_warp == 1,
              "warp selector opened");
    HX_ASSERT((inst->tracks[1].clips[0].length % 16) == 0, "warped to whole bars");
    HX_ASSERT(inst->playing == 1, "transport started");
    /* Re-warp to a different bar length → note count preserved, length changes. */
    {
        uint16_t len0 = inst->tracks[1].clips[0].length;
        /* candidate 0 = 1 bar, candidate for a longer length differs. */
        hx_set_param(h, "t1_capture_retempo", "0");
        HX_ASSERT(inst->tracks[1].clips[0].length == 16, "retempo to 1 bar");
        HX_ASSERT(inst->tracks[1].clips[0].note_count == 3, "notes kept across warp");
        HX_ASSERT(inst->tracks[1].pfx.cached_bpm == bpm_before, "tempo still untouched");
        (void)len0;
        hx_set_param(h, "t1_capture_retempo", "0");   /* back to 1 bar */
        /* Fine warp: expand the take well past the loop → trailing notes scroll
         * off the last bar and are dropped. */
        int nc_before = inst->tracks[1].clips[0].note_count;
        hx_set_param(h, "t1_capture_fine", "9000");   /* big positive → expand */
        HX_ASSERT(inst->tracks[1].clips[0].note_count < nc_before,
                  "fine expand drops trailing notes off the end");
        HX_ASSERT(inst->tracks[1].clips[0].length == 16, "loop length unchanged by fine");
        /* Compressing back restores them (re-derived from the frozen take). */
        hx_set_param(h, "t1_capture_fine", "-9000");
        HX_ASSERT(inst->tracks[1].clips[0].note_count == nc_before,
                  "fine compress restores the dropped notes");
        hx_set_param(h, "t1_capture_confirm", "");
        HX_ASSERT(inst->cap_select_active == 0, "warp selector closed on confirm");
    }
    hx_destroy(h);

    /* ---- 8. Realistic syncopated phrase pins the tempo decisively ---- */
    /* A 2-bar pattern with notes on varied 1/16 positions (on-beats, offbeats,
     * 16ths) — the representative case, unlike the even taps in scenario 1.
     * These only fit a 1/16 grid cleanly near 120, so the estimator should
     * default there confidently (no 150/90 competition). */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_render(h, 4);
    {
        static const int PH[] = { 0, 3, 4, 6, 8, 11, 14, 16, 19, 20, 24, 27, 28, 30 };
        play_phrase_120(h, 1, PH, (int)(sizeof(PH) / sizeof(PH[0])));
    }
    hx_render(h, 43);   /* let the final bar breathe to the loop end */
    hx_set_param(h, "t1_capture_commit", "0");
    {
        double bpm = inst->cap_bpm_est[inst->cap_select_idx];
        HX_ASSERT(bpm > 116.0 && bpm < 124.0, "phrase default locks near 120");
        HX_ASSERT(inst->tracks[1].clips[0].note_count == 14, "all 14 notes committed");
        /* The chosen tempo should make the take a whole number of bars. */
        HX_ASSERT((inst->tracks[1].clips[0].length % 16) == 0, "clip length is whole bars");
    }
    hx_destroy(h);

    /* ---- 9. A drum capture is ONE undo step (stopped and playing) ---- */
    {
        int pass;
        for (pass = 0; pass < 2; pass++) {
            h = hx_create(NULL);
            HX_ASSERT(h, "create failed");
            inst = I(h);
            if (pass == 1) hx_set_param(h, "transport", "play");
            hx_render(h, 4);
            tap(h, 0, 60, 100, 40, 132);
            tap(h, 0, 60, 100, 40, 132);
            tap(h, 0, 60, 100, 40, 132);
            hx_set_param(h, "t0_capture_commit", "0");
            HX_ASSERT(inst->tracks[0].drum_clips[0] != NULL, "drum clips allocated");
            int l, found = -1;
            for (l = 0; l < DRUM_LANES; l++)
                if (inst->tracks[0].drum_clips[0]->lanes[l].midi_note == 60) { found = l; break; }
            HX_ASSERT(found >= 0, "lane for pitch 60");
            HX_ASSERT(inst->tracks[0].drum_clips[0]->lanes[found].clip.note_count == 3,
                      "drum capture wrote 3 hits");
            HX_ASSERT(inst->drum_undo_valid, "drum capture took an undo snapshot");
            hx_set_param(h, "undo_restore", "1");
            HX_ASSERT(inst->tracks[0].drum_clips[0]->lanes[found].clip.note_count == 0,
                      pass ? "Undo removed the playing drum capture"
                           : "Undo removed the stopped drum capture");
            hx_destroy(h);
        }
    }

    /* ---- 10. EVERY Capture press consumes the ring, even one that writes
     * nothing: notes on track 1, a press on track 2 takes nothing — and the
     * track-1 notes must not be waiting for a later press. ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    tap(h, 1, 60, 100, 20, 20);
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "track-1 note buffered");
    {
        uint32_t seq = inst->cap_commit_seq;
        hx_set_param(h, "t2_capture_commit", "0");
        HX_ASSERT(inst->cap_commit_seq == seq, "a press with nothing to take writes nothing");
    }
    HX_ASSERT(inst->cap_count == 0, "an empty press still consumed the ring");
    hx_destroy(h);

    /* ---- 11. Changing track drops the buffer; re-pushing the SAME track's
     * pad map (a key/scale/octave change) does not. Driven through tN_padmap,
     * the message the UI sends when you select a track. ---- */
    {
        static const char *PM =
            "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 "
            "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91";
        h = hx_create(NULL);
        HX_ASSERT(h, "create failed");
        inst = I(h);
        hx_set_param(h, "transport", "play");
        hx_set_param(h, "t1_padmap", PM);
        tap(h, 1, 60, 100, 20, 20);
        HX_ASSERT(capture_pending_for_track(inst, 1) == 1, "note buffered on track 1");
        hx_set_param(h, "t1_padmap", PM);          /* same track, re-pushed */
        HX_ASSERT(capture_pending_for_track(inst, 1) == 1,
                  "a same-track pad-map push kept the phrase");
        hx_set_param(h, "t3_padmap", PM);          /* select track 3 */
        HX_ASSERT(inst->cap_count == 0, "changing track dropped the buffer");
        hx_set_param(h, "t1_padmap", PM);          /* and back */
        HX_ASSERT(capture_pending_for_track(inst, 1) == 0,
                  "the old track-1 phrase did not come back with the track");
        hx_destroy(h);
    }

    /* ---- 12. A deliberate edit drops the buffer; ordinary traffic does not ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    tap(h, 1, 60, 100, 20, 20);
    hx_set_param(h, "t1_c0_undo_checkpoint", "1");   /* rides the same Capture press */
    hx_set_param(h, "t1_c0_step_0_vel", "90");       /* a knob on a held step */
    HX_ASSERT(capture_pending_for_track(inst, 1) == 1,
              "an undo checkpoint / step knob write kept the phrase");
    hx_set_param(h, "t1_c0_step_4_toggle", "64 100"); /* hand-enter a step */
    HX_ASSERT(inst->cap_count == 0, "a step entry dropped the buffer");
    tap(h, 1, 62, 100, 20, 20);
    hx_set_param(h, "t1_launch_clip", "2");
    HX_ASSERT(inst->cap_count == 0, "a clip launch dropped the buffer");
    tap(h, 1, 62, 100, 20, 20);
    hx_set_param(h, "t1_recording", "0");            /* DISarm is not an edit */
    HX_ASSERT(inst->cap_count > 0, "disarming kept the buffer");
    hx_set_param(h, "t1_recording", "1");
    HX_ASSERT(inst->cap_count == 0, "arming dropped the buffer");
    hx_destroy(h);

    /* ---- 13. Capture reaches back 8 bars at most. Ten bars of quarter
     * notes at 120 on a stopped transport (1 quarter = 172 blocks): the
     * first two bars have aged out; the last eight (32 notes) remain. ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_render(h, 4);
    {
        int q;
        for (q = 0; q < 40; q++) tap(h, 1, 60 + (q % 12), 100, 20, 152);
        int n = capture_pending_for_track(inst, 1);
        HX_ASSERT(n >= 31 && n <= 33, "only the last ~8 bars (32 notes) are kept");
    }
    hx_destroy(h);

    /* ---- 14. The latest pass over the loop replaces the earlier one ----
     * Track 1's clip 0 holds one note so it loops (1 bar = 16 x 43 blocks). */
    {
        int pass;
        for (pass = 0; pass < 2; pass++) {
            h = hx_create(NULL);
            HX_ASSERT(h, "create failed");
            inst = I(h);
            clip_insert_note(&inst->tracks[1].clips[0], 0, 24, 48, 100);
            clip_build_steps_from_notes(&inst->tracks[1].clips[0]);
            hx_set_param(h, "transport", "play_focus:1:0");   /* launches track 1's clip */
            hx_render(h, 4);
            if (pass == 0) {
                HX_ASSERT(inst->tracks[1].clip_playing, "setup: track 1's clip loops");
            } else {
                /* CONTROL: a track whose clip is NOT looping has no "again" —
                 * its playhead is frozen and every note would look alike. */
                inst->tracks[1].clip_playing = 0;
            }
            tap(h, 1, 60, 100, 8, 35);           /* step 0 of pass 1 */
            tap(h, 1, 64, 100, 8, 35);           /* step 1: same pass, different spot */
            HX_ASSERT(capture_pending_for_track(inst, 1) == 2, "one pass: both notes kept");
            hx_render(h, 16 * 43 - 2 * 43);      /* round to step 0 of pass 2 */
            tap(h, 1, 62, 100, 8, 35);
            int n = capture_pending_for_track(inst, 1);
            if (pass == 0) {
                HX_ASSERT(n == 1, "playing the same spot again replaced the earlier pass");
                const cap_ev_t *ev = &inst->cap_ring[inst->cap_head];
                HX_ASSERT(ev->type == CAP_EV_NOTE_ON && ev->a == 62, "the survivor is the new note");
            } else {
                HX_ASSERT(n == 3, "no loop running: nothing was replaced");
            }
            hx_destroy(h);
        }
    }

    /* ---- 15. Drum first take while playing keeps its beat too (it used to be
     * pinned to the lane's loop start) ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = I(h);
    hx_set_param(h, "transport", "play");
    hx_render(h, 8 * 43);                            /* beat 3 of the bar */
    {
        uint32_t phase = (inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step)
                       % (16u * TICKS_PER_STEP);
        tap(h, 0, 60, 100, 8, 20);
        hx_set_param(h, "t0_capture_commit", "0");
        HX_ASSERT(inst->tracks[0].drum_clips[0] != NULL, "drum clips allocated");
        int l, found = -1;
        for (l = 0; l < DRUM_LANES; l++)
            if (inst->tracks[0].drum_clips[0]->lanes[l].midi_note == 60) { found = l; break; }
        HX_ASSERT(found >= 0, "lane for pitch 60");
        clip_t *lc = &inst->tracks[0].drum_clips[0]->lanes[found].clip;
        HX_ASSERT(lc->note_count == 1, "drum first take wrote the hit");
        int d = (int)lc->notes[0].tick - (int)phase;
        if (d < 0) d = -d;
        HX_ASSERT(phase >= 6 * TICKS_PER_STEP, "setup: played on beat 3");
        HX_ASSERT(d < 24, "the drum hit lands on the beat it was played, not the loop start");
        HX_ASSERT(inst->tracks[0].queued_clip == 0, "the drum take is queued for the next bar");
    }
    hx_destroy(h);

    printf("PASS: capture\n");
    return 0;
}
