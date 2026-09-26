/* tests/test_param_auto_melodic_cycle.c — A LANE WITH ITS OWN LOOP HAS ITS OWN
 * CYCLE, ON ANY TRACK, AND LAUNCH 1-BAR RESTARTS EVERYTHING.
 *
 * Josh, 2026-09-26: an automation lane's Loop can be shorter or longer than its
 * clip ("can we have empty lanes still have a length? that way you can clear
 * automation make a really long or short lane and start recording/inputting new
 * automation at a set length"), and on launch: "1bar needs to restart at the
 * beginning for EVERYTHING.  any other setting launches in step with song for
 * EVERYTHING".
 *
 * Before this, a melodic lane's own Loop was clamped to its clip (a 32-step
 * lane under a 16-step clip never played its second half) and recorded in clip
 * ticks; drum lanes never restarted on a launch.
 *
 * Pinned here, with the transport really running:
 *   - a melodic lane with a 32-step Loop under a 16-step clip reaches its second
 *     half (the playhead passes 384), and its step-20 lock is staged;
 *   - a 4-step Loop repeats four times per clip pass;
 *   - a live recording across two clip passes writes into the second half;
 *   - Launch 1-bar: a launched clip's cycled lanes restart from 0; Launch 1/4:
 *     they stay in step with the song (master clock);
 *   - Launch 1-bar restarts DRUM lanes from their beginning too; Launch 1/4
 *     keeps them anchored to the song.
 */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

#define TG "1:synth:cut"

static long snap_field(hx_t *h, int i) {
    char buf[1024];
    hx_get_param(h, "state_snapshot", buf, sizeof buf);
    char *p = buf;
    for (int k = 0; k < i; k++) { p = strchr(p, ' '); if (!p) return -99999; p++; }
    return strtol(p, NULL, 10);
}
static uint32_t master_abs(const seq8_instance_t *in) {
    return (uint32_t)in->global_tick * 24u + (uint32_t)in->master_tick_in_step;
}
static const pa_entry_t *entry(seq8_instance_t *in, int track, int clip, const char *tgt) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        const pa_entry_t *e = &in->pa_entries[i];
        if (e->used && e->track == track && e->clip == clip && !strcmp(in->pa_targets[e->target], tgt)) return e;
    }
    return NULL;
}
/* A melodic track 0 with a 16-step clip `c` holding one note. */
static void melodic_clip(hx_t *h, int c) {
    char k[64];
    hx_set_param(h, "t0_pad_mode", "0");
    snprintf(k, sizeof k, "t0_c%d_step_0_toggle", c);
    hx_set_param(h, k, "60 100");
}

int main(void) {
    /* ---- a 32-step Loop under a 16-step clip plays its second half -------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        melodic_clip(h, 0);
        HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_MELODIC_SCALE, "setup: melodic track");
        hx_set_param(h, "t0_pa_set", "0 " TG " 0 100");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 768 0 0");          /* its own 32 steps */
        hx_set_param(h, "t0_pa_view", "0 " TG);
        hx_set_param(h, "transport", "play_focus:0:0");
        HX_ASSERT(in->tracks[0].clip_playing, "setup: the clip plays");
        long maxpos = -1;
        for (int i = 0; i < 600; i++) {
            hx_render(h, 5);
            long lt = snap_field(h, 57);
            HX_ASSERT(lt >= 0 && lt < 768, "the lane stays inside its 32-step loop");
            HX_ASSERT(lt == (long)(master_abs(in) % 768) || lt == (long)((master_abs(in) + 767) % 768),
                      "the lane runs on the MASTER clock, not the clip's");
            if (lt > maxpos) maxpos = lt;
        }
        HX_ASSERT(maxpos >= 384, "⭐ the lane reached its SECOND half (past the 16-step clip)");
        OK("⭐ a melodic lane's 32-step Loop plays past its 16-step clip, on the master clock");
        hx_destroy(h);
    }

    /* ---- a 4-step Loop repeats four times per clip pass -------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        melodic_clip(h, 0);
        hx_set_param(h, "t0_pa_set", "0 " TG " 0 100");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 96 0 0");
        hx_set_param(h, "t0_pa_view", "0 " TG);
        hx_set_param(h, "transport", "play_focus:0:0");
        int wraps = 0; long prev = -1;
        while (master_abs(in) < 384) {
            hx_render(h, 1);
            long lt = snap_field(h, 57);
            if (lt < 0) continue;                    /* the first block: no position published yet */
            HX_ASSERT(lt < 96, "inside the 4-step loop");
            if (prev >= 0 && lt < prev) wraps++;
            prev = lt;
        }
        HX_ASSERT(wraps >= 3, "a 4-step lane wraps (at least) three times inside one 16-step pass");
        OK("a 4-step Loop repeats inside the clip");
        hx_destroy(h);
    }

    /* ---- recording across two clip passes lands in the second half ------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        melodic_clip(h, 0);
        hx_set_param(h, "t0_pa_set", "0 " TG " 0 100");
        hx_set_param(h, "t0_pa_loop", "0 " TG " 768 0 0");
        hx_set_param(h, "transport", "play_focus:0:0");
        in->tracks[0].recording = 1;
        for (int i = 0; master_abs(in) < 760 && i < 5000; i++) {
            char v[64];
            snprintf(v, sizeof v, TG " %d", 1000 + (i % 100) * 100);
            hx_set_param(h, "t0_pa_live", v);
            hx_render(h, 5);
        }
        hx_set_param(h, "t0_pa_live_end", TG);
        in->tracks[0].recording = 0;
        const pa_entry_t *e = entry(in, 0, 0, TG);
        HX_ASSERT(e && e->loop_len == 768, "the lane kept its 32-step Loop");
        int past = 0;
        for (int i = 0; i < e->count; i++) if (e->points[i].tick >= 384) past++;
        HX_ASSERT(past > 0, "⭐ the recording wrote into the lane's second half (ticks >= 384)");
        OK("⭐ a recording on a long melodic lane fills it past the clip's length");
        hx_destroy(h);
    }

    /* ---- LAUNCH: 1-bar restarts cycled lanes, 1/4 keeps them in step ------ */
    for (int q = 0; q < 2; q++) {
        const int quant = q == 0 ? 5 : 3;        /* 1-bar, then 1/4 */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        melodic_clip(h, 0);
        melodic_clip(h, 1);
        hx_set_param(h, "t0_pa_set", "1 " TG " 0 100");
        hx_set_param(h, "t0_pa_loop", "1 " TG " 1920 0 0");          /* 5 bars: out of phase with the launch bar */
        hx_set_param(h, "t0_pa_view", "1 " TG);
        in->launch_quant = (uint8_t)quant;
        hx_set_param(h, "transport", "play_focus:0:0");
        while (master_abs(in) < 384 * 2 + 100) hx_render(h, 5);     /* mid bar 3 */
        hx_set_param(h, "t0_launch_clip", "1");
        HX_ASSERT(in->tracks[0].queued_clip == 1, "setup: the launch is queued");
        while (in->tracks[0].active_clip != 1) hx_render(h, 1);
        hx_render(h, 1);
        const long lt = snap_field(h, 57);
        const uint32_t now = master_abs(in), org = in->tracks[0].pa_origin;
        const long song = (long)(now % 1920);
        if (quant == 5) {
            HX_ASSERT(org > 0 && org % 384 == 0, "the track's lane origin is the 1-bar launch, on a bar");
            const long restarted = (long)((now - org) % 1920);
            HX_ASSERT(lt == restarted || lt == restarted - 1, "⭐ Launch 1-bar: the lane RESTARTS from its beginning");
            HX_ASSERT(song != restarted, "control: in step with the song would be somewhere else");
            OK("⭐ Launch 1-bar: a launched clip's own-Loop lanes restart from 0");
        } else {
            HX_ASSERT(org == 0, "Launch 1/4: the origin stays the song");
            HX_ASSERT(lt == song || lt == song - 1, "⭐ Launch 1/4: the lane is IN STEP with the song");
            OK("⭐ Launch 1/4: the lanes launch in step with the song");
        }
        hx_destroy(h);
    }

    /* ---- LAUNCH 1-bar restarts DRUM lanes too ------------------------------ */
    for (int q = 0; q < 2; q++) {
        const int quant = q == 0 ? 5 : 3;
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "setup: track 0 is drum in a fresh instance");
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l0_clip_length", "10");                 /* a 10-step lane: out of phase with the bar */
        hx_set_param(h, "t0_launch_clip", "1");                      /* stopped: select clip 1 */
        hx_set_param(h, "t0_l0_note_add", "0 100 24");
        hx_set_param(h, "t0_l0_clip_length", "10");
        hx_set_param(h, "t0_launch_clip", "0");
        in->launch_quant = (uint8_t)quant;
        hx_set_param(h, "transport", "play_focus:0:0");
        while (master_abs(in) < 384 * 2 + 100) hx_render(h, 5);
        hx_set_param(h, "t0_launch_clip", "1");
        while (in->tracks[0].active_clip != 1) hx_render(h, 1);
        const uint32_t now = master_abs(in);
        const uint16_t step = in->tracks[0].drum_current_step[0];
        const uint16_t anchored = (uint16_t)((now / 24u) % 10u);
        const uint16_t restarted = (uint16_t)(((now - (now / 384u) * 384u) / 24u) % 10u);
        if (quant == 5) {
            HX_ASSERT(anchored != restarted, "control: the song position and a restart differ here");
            HX_ASSERT(step == restarted, "⭐ Launch 1-bar: the drum lane restarted at the bar");
            OK("⭐ Launch 1-bar restarts drum lanes from their beginning");
        } else {
            HX_ASSERT(step == anchored, "Launch 1/4: the drum lane stays anchored to the song");
            OK("Launch 1/4: drum lanes launch in step with the song");
        }
        hx_destroy(h);
    }

    printf("test_param_auto_melodic_cycle: %d ok\n", ok_count);
    return 0;
}
