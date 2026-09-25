/* tests/test_param_auto_drum_cycle.c — EVERY DRUM AUTOMATION LANE HAS ITS OWN CYCLE.
 *
 * Josh, 2026-09-24: a drum track's automation is shared by all 32 lanes, and
 * each automation lane has its own cycle — the pad that was active when it was
 * recorded; a snapshot, which edits never change ("drum lanes can be any
 * length, not just multiples of a bar"; no "Longest lane" mode; "i don't care
 * about old projects"). Before this, every drum automation lane ran on the
 * LONGEST drum lane's window, so a 12-step hat's filter sweep wrapped at 16.
 *
 * Pinned here, with the transport really running where it matters:
 *   - a recording takes the ACTIVE pad's cycle (length, start, step) when the
 *     hand goes down, and switching pads mid-recording changes nothing;
 *   - a lane's cycle is kept when a shorter pad records onto it, and a lock
 *     at step 40 of a 4-bar cycle PLAYS — even after that pad is shortened;
 *   - a 13-step lane at 1/32 wraps at 156 ticks; Rate x2 at 78; Punch lasts
 *     its own 12-tick step;
 *   - the cycle survives save + reload, and a lane saved WITHOUT one (an older
 *     project) is given the longest-lane window once — the pads' aftertouch
 *     lane excepted;
 *   - pa_loop with length 0 on a drum track = match the active pad;
 *   - a Capture on a drum track lands in the cycle it was heard against;
 *   - ALL LANES Clock Shift / Resolution / Double move each lane inside ITS
 *     cycle, in ITS steps.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

#define TG "1:synth:cut"

/* pa_list's line for TG: loop_len, loop_off, step_ticks (-1 when absent). */
static int cycle_of(hx_t *h, int *ll, int *lo, int *st) {
    char buf[8192];
    hx_get_param(h, "pa_list", buf, sizeof buf);
    char *p = strstr(buf, " " TG " ");
    if (!p) return 0;
    int res = 0, sc = 0;
    *lo = -1; *st = -1;
    int n = sscanf(p + strlen(" " TG " "), "%d %d %d %d %d", ll, &res, &sc, lo, st);
    return n >= 3;
}

static pa_entry_t *entry(seq8_instance_t *in, const char *tgt) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &in->pa_entries[i];
        if (e->used && e->count && !strcmp(in->pa_targets[e->target], tgt)) return e;
    }
    return NULL;
}

static void lock(hx_t *h, int step, int tps, int v) {
    char val[128];
    snprintf(val, sizeof val, "0 " TG " %d %d %d", step * tps, step * tps + tps - 1, v);
    hx_set_param(h, "t0_pa_set2", val);
}

/* The order in which TG's staged value changes during `blocks` of playback. */
static int play_sequence(hx_t *h, int *seq, int max, int blocks) {
    char buf[8192];
    int n = 0;
    for (int i = 0; i < blocks / 5; i++) {
        hx_render(h, 5);
        hx_get_param(h, "pa_pending", buf, sizeof buf);
        for (char *p = strstr(buf, TG " "); p; p = strstr(p + 1, TG " ")) {
            int v = 0;
            sscanf(p + strlen(TG " "), "%d", &v);
            if (n < max && (n == 0 || seq[n - 1] != v)) seq[n++] = v;
        }
    }
    return n;
}

static char big[sizeof(((seq8_instance_t *)0)->state_buf) * 2];
static seq8_instance_t *save_reload(hx_t **hp) {
    seq8_instance_t *in = (seq8_instance_t *)(*hp)->inst;
    FILE *fp = fmemopen(big, sizeof(big) - 1, "w");
    HX_ASSERT(fp, "fmemopen failed");
    seq8_do_serialize(in, fp);
    long n = ftell(fp);
    fclose(fp);
    HX_ASSERT(n > 0 && n < (long)sizeof(big) - 1, "serialized size out of range");
    char tmp[256];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_drum_cycle_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(big, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    hx_destroy(*hp);
    *hp = hx_create(NULL);
    in = (seq8_instance_t *)(*hp)->inst;
    strncpy(in->state_path, tmp, sizeof(in->state_path) - 1);
    seq8_load_state(in);
    remove(tmp);
    return in;
}

int main(void) {
    int ll, lo, st;

    /* ---- a recording takes the ACTIVE pad's cycle ---------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l2_clip_length", "12");           /* the hat: 12 steps */
        hx_set_param(h, "t0_active_drum_lane", "2");
        hx_set_param(h, "transport", "play_focus:0:0");
        in->tracks[0].recording = 1;
        for (int i = 0; i < 40; i++) {                        /* a sweep, several steps long */
            char v[64];
            snprintf(v, sizeof v, TG " %d", 2000 + i * 100);
            hx_set_param(h, "t0_pa_live", v);
            if (i == 20) hx_set_param(h, "t0_active_drum_lane", "0");   /* a 16-step pad, mid-sweep */
            hx_render(h, 40);
        }
        hx_set_param(h, "t0_pa_live_end", TG);
        in->tracks[0].recording = 0;
        HX_ASSERT(in->global_tick > 16, "setup: the sweep ran past step 16");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st), "the lane is listed");
        HX_ASSERT(ll == 12 * 24 && lo == 0 && st == 24,
                  "⭐ the cycle is the 12-step pad's (288 ticks of 24), listed with its start and step");
        const pa_entry_t *e = entry(in, TG);
        for (int k = 0; k < e->count; k++)
            HX_ASSERT(e->points[k].tick < 288, "every recorded point lies inside the 12-step cycle");
        OK("⭐ a recording takes the active pad's cycle; switching pads mid-sweep changes nothing");
        hx_destroy(h);
    }

    /* ---- the snapshot is taken as the HAND goes down, not at the first write */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l2_clip_length", "12");
        hx_set_param(h, "t0_active_drum_lane", "2");
        hx_set_param(h, "transport", "play_focus:0:0");
        in->tracks[0].recording = 1;
        hx_set_param(h, "t0_pa_live", TG " 2000");             /* hand down on the 12-step pad */
        hx_set_param(h, "t0_active_drum_lane", "0");          /* ...then a 16-step pad, before any tick */
        for (int i = 0; i < 10; i++) { hx_set_param(h, "t0_pa_live", TG " 2500"); hx_render(h, 40); }
        hx_set_param(h, "t0_pa_live_end", TG);
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 12 * 24,
                  "the cycle is the pad under the hand when it went down (12), not the one at the first write (16)");
        OK("the snapshot is taken at hand-down");
        hx_destroy(h);
    }

    /* ---- a 4-bar lane keeps its cycle; a step-40 lock PLAYS ------------ */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l5_clip_length", "64");           /* a 4-bar pad */
        hx_set_param(h, "t0_active_drum_lane", "5");
        lock(h, 0, 24, 1000);
        lock(h, 40, 24, 9000);                                /* step 40: bar 3 */
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 64 * 24, "setup: a 4-bar cycle (1536)");
        hx_set_param(h, "t0_active_drum_lane", "0");          /* a 1-bar pad */
        lock(h, 4, 24, 5000);                                 /* written from it */
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 64 * 24,
                  "⭐ writing from a 1-bar pad onto the 4-bar lane leaves its cycle at 1536");
        hx_set_param(h, "transport", "play_focus:0:0");      /* RECORD onto it from the 1-bar pad */
        in->tracks[0].recording = 1;
        const int before = entry(in, TG)->count;
        while (in->global_tick < 8) {                         /* steps 0..7: over the step-4 lock */
            hx_set_param(h, "t0_pa_live", TG " 6000");
            hx_render(h, 5);
        }
        hx_set_param(h, "t0_pa_live_end", TG);
        in->tracks[0].recording = 0;
        hx_set_param(h, "transport", "stop");
        HX_ASSERT(entry(in, TG)->count > before, "setup: the recording really wrote points");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 64 * 24,
                  "⭐ RECORDING onto it from the 1-bar pad leaves its cycle at 1536 too");
        {   /* put the locks back over what that recording wrote */
            char v[96];
            snprintf(v, sizeof v, "0 " TG " 0 %d 1000", 8 * 24 - 1);
            hx_set_param(h, "t0_pa_set2", v);
        }
        lock(h, 4, 24, 5000);
        hx_set_param(h, "t0_pa_smooth", "0 " TG " 0");       /* a recording turns Smooth on: back to steps */
        hx_set_param(h, "t0_l5_clip_length", "16");           /* the 4-bar pad, shortened */
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 64 * 24, "shortening the pad afterwards changes nothing");
        hx_set_param(h, "transport", "play_focus:0:0");
        int seq[16];
        int n = play_sequence(h, seq, 16, 2400);              /* ~55 steps */
        HX_ASSERT(n >= 3 && seq[0] == 1000 && seq[1] == 5000 && seq[2] == 9000,
                  "⭐ under real playback the step-40 lock plays — no drum lane is longer than 16 steps");
        OK("⭐ a lane's cycle outlives the pads: a 4-bar cycle plays in full over 1-bar lanes");
        hx_destroy(h);
    }

    /* ---- 13 steps at 1/32: wraps at 156; Rate x2 at 78; Punch = 12 ---- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l3_clip_resolution", "0");        /* 1/32: 12 ticks */
        hx_set_param(h, "t0_l3_clip_length", "13");
        hx_set_param(h, "t0_active_drum_lane", "3");
        lock(h, 1, 12, 4000);
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 156 && st == 12, "a 13-step 1/32 cycle: 156 ticks of 12");
        pa_entry_t *e = entry(in, TG);
        in->global_tick = 6; in->master_tick_in_step = 12;    /* abs 156: the wrap */
        HX_ASSERT(pa_lane_tick(in, tr, e, 999, 384, 0) == 0, "abs 156 is tick 0 of the cycle (the clip tick is ignored)");
        in->global_tick = 6; in->master_tick_in_step = 11;
        HX_ASSERT(pa_lane_tick(in, tr, e, 0, 384, 0) == 155, "abs 155 is its last tick");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 156 0 6");     /* Rate x2 */
        in->global_tick = 3; in->master_tick_in_step = 6;     /* abs 78 */
        HX_ASSERT(pa_lane_tick(in, tr, e, 0, 384, 0) == 0, "Rate x2: the cycle wraps at abs 78");
        HX_ASSERT(pa_lane_step(tr, e, 24) == 12, "Punch lasts the lane's own 12-tick step, not the track's 24");
        OK("a 13-step 1/32 lane wraps at 156, at 78 under Rate x2, and its step is 12 ticks");
        hx_destroy(h);
    }

    /* ---- save + reload; an older project's lane is pinned once -------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l3_clip_resolution", "0");
        hx_set_param(h, "t0_l3_clip_length", "13");
        hx_set_param(h, "t0_active_drum_lane", "3");
        lock(h, 1, 12, 4000);
        in = save_reload(&h);
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 156 && st == 12, "⭐ the cycle and its step survive a reload");

        /* An older project: the lane saved with no cycle, the longest lane 20
         * steps; and an aftertouch lane beside it. */
        hx_set_param(h, "t0_l7_clip_length", "20");
        pa_entry_t *e = entry(in, TG);
        e->loop_len = e->loop_off = e->step_ticks = 0;
        hx_set_param(h, "t0_pa_set", "0 at 24 3000");
        pa_entry_t *at = entry(in, "at");
        HX_ASSERT(at, "setup: an aftertouch lane");
        at->loop_len = at->loop_off = at->step_ticks = 0;
        in = save_reload(&h);
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 20 * 24 && st == 24,
                  "a lane saved without a cycle is given the longest-lane window (20 steps) on load");
        HX_ASSERT(entry(in, "at") && entry(in, "at")->loop_len == 0, "the pads' aftertouch lane keeps following the longest lane");
        OK("⭐ the cycle survives a reload; an older project's drum lane is pinned to its old window, once");
        hx_destroy(h);
    }

    /* ---- pa_loop 0 on a drum track = match the active pad ------------- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l4_clip_length", "7");
        hx_set_param(h, "t0_active_drum_lane", "4");
        lock(h, 2, 24, 4000);
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 7 * 24, "setup: a 7-step cycle");
        hx_set_param(h, "t0_active_drum_lane", "0");          /* 16 steps */
        hx_set_param(h, "t0_pa_loop", "0 " TG " 0 0 0");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 16 * 24 && st == 24, "Loop 0 = the active pad's cycle, not \"none\"");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 240 0 0 48");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 240 && st == 48, "an explicit loop sets length and, with a 6th token, the step");
        OK("pa_loop: 0 matches the active pad on a drum track; the 6th token sets the step");
        hx_destroy(h);
    }

    /* ---- a Capture lands in the cycle it was heard against ------------ */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l1_clip_length", "10");
        hx_set_param(h, "t0_active_drum_lane", "1");
        hx_set_param(h, "transport", "play_focus:0:0");
        in->tracks[0].recording = 0;                          /* Record OFF: a capture */
        for (int i = 0; i < 30; i++) {
            char v[64];
            snprintf(v, sizeof v, TG " %d", 3000 + i * 50);
            hx_set_param(h, "t0_pa_live", v);
            hx_render(h, 40);
        }
        HX_ASSERT(in->global_tick > 10, "setup: the sweep ran past the 10-step pad");
        hx_set_param(h, "t0_pa_capture_commit", "0");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 10 * 24, "⭐ the captured lane has the 10-step pad's cycle");
        const pa_entry_t *e = entry(in, TG);
        for (int k = 0; k < e->count; k++)
            HX_ASSERT(e->points[k].tick < 240, "every captured point lies inside that cycle");
        OK("a Capture on a drum track lands in the cycle it was heard against");
        hx_destroy(h);
    }

    /* ---- ALL LANES ops move each lane in ITS cycle, in ITS steps ------ */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l3_clip_resolution", "0");
        hx_set_param(h, "t0_l3_clip_length", "13");
        hx_set_param(h, "t0_active_drum_lane", "3");
        lock(h, 12, 12, 4000);                                /* its last step: tick 144 */
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        HX_ASSERT(entry(in, TG)->points[0].tick == 0,
                  "⭐ Clock Shift moves it one of ITS steps and wraps at ITS end (144 -> 0, not 168)");
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        HX_ASSERT(entry(in, TG)->points[0].tick == 12, "and on by one 12-tick step");
        hx_set_param(h, "t0_all_lanes_clip_resolution", "1"); /* every lane to 1/16 */
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 312 && st == 24,
                  "Resolution 1/32 -> 1/16: the cycle doubles in ticks and takes the new step");
        HX_ASSERT(entry(in, TG)->points[0].tick == 24, "and the point stays on its step (1 x 24)");
        hx_set_param(h, "t0_all_lanes_double_fill", "1");
        HX_ASSERT(cycle_of(h, &ll, &lo, &st) && ll == 624, "Double: the cycle doubles");
        const pa_entry_t *e = entry(in, TG);
        HX_ASSERT(e->count == 2 && e->points[0].tick == 24 && e->points[1].tick == 24 + 312,
                  "and its points are copied one cycle forward");
        OK("⭐ ALL LANES Clock Shift, Resolution and Double move each lane inside its own cycle");
        hx_destroy(h);
    }

    /* ---- the export clock: where each lane is at the export's first tick */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l3_clip_resolution", "0");
        hx_set_param(h, "t0_l3_clip_length", "13");
        in->tracks[0].drum_clips[0]->lanes[3].clip.loop_start = 2;   /* no loop-start key: set it */
        hx_set_param(h, "t0_active_drum_lane", "3");
        lock(h, 3, 12, 4000);
        uint32_t ws, wl, p0, mul, div;
        pa_entry_t *e = entry(in, TG);
        HX_ASSERT(e && e->loop_off == 24, "setup: a cycle starting at step 2 of 1/32 (tick 24)");
        HX_ASSERT(pa_export_clock(&in->tracks[0], e, &ws, &wl, &p0, &mul, &div)
                  && ws == 24 && wl == 156 && p0 == 24 && mul == 1 && div == 1,
                  "⭐ a drum cycle starts the export at its own start (every drum lane renders from its loop start)");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 156 24 6 12");  /* Rate x2 */
        HX_ASSERT(pa_export_clock(&in->tracks[0], e, &ws, &wl, &p0, &mul, &div) && mul == 2 && div == 1,
                  "and carries its rate");
        hx_destroy(h);

        /* Melodic: a 16-step clip whose loop starts at step 4, and a lane
         * with its own 8-step Loop. At the clip's first rendered tick (96)
         * playback puts that lane at 96 % 192 = 96. */
        h = hx_create(NULL);
        in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        in->tracks[1].clips[0].loop_start = 4;
        hx_set_param(h, "t1_pa_set", "0 1:synth:cutoff 0 100");
        hx_set_param(h, "t1_pa_loop", "0 1:synth:cutoff 192 0 0");
        e = entry(in, "1:synth:cutoff");
        HX_ASSERT(in->tracks[1].clips[0].loop_start == 4, "setup: the clip's loop starts at step 4");
        HX_ASSERT(pa_export_clock(&in->tracks[1], e, &ws, &wl, &p0, &mul, &div)
                  && ws == 0 && wl == 192 && p0 == 96,
                  "⭐ a melodic Loop lane starts the export where playback has it at the clip's first tick (96)");
        OK("the export clock: a drum cycle from its own start, a melodic lane where playback puts it");
        hx_destroy(h);
    }

    printf("test_param_auto_drum_cycle: %d ok\n", ok_count);
    return 0;
}
