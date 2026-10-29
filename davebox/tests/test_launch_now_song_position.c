/* Launch Now with the transport running: where the new clip comes in.
 * Josh, 2026-10-28, on a 1-bar and a 4-bar clip: "it's not switching at the
 * right spot" — the 4-bar clip took the 1-bar clip's step % its length, so it
 * always came in in its first bar. Now (his pick, "song position"):
 *   - lengths differ (or nothing was playing): the song position, wrapped to
 *     the new clip's length in ITS ticks;
 *   - same length: the playing clip's phase carries over, as before (a clip
 *     launched on a bar runs from its own start, not the song's). */
#include "harness.h"

static seq8_track_t *T(hx_t *h) { return &((seq8_instance_t *)h->inst)->tracks[1]; }   /* melodic (t0 is a drum track) */
static void shape(hx_t *h, int c, int len, int tps) {
    T(h)->clips[c].length = (uint16_t)len;
    T(h)->clips[c].loop_start = 0;
    T(h)->clips[c].ticks_per_step = (uint16_t)tps;
}
/* the song position in master ticks */
static uint32_t song(hx_t *h) {
    seq8_instance_t *inst = h->inst;
    return inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    uint32_t el, want;
    HX_ASSERT(h, "create failed");
    inst = h->inst;
    HX_ASSERT(inst->launch_quant == 0, "the default launch is not Now");
    HX_ASSERT(T(h)->pad_mode != PAD_MODE_DRUM && inst->tracks[0].pad_mode == PAD_MODE_DRUM,
              "t1 is not melodic / t0 is not a drum track");
    /* drum track t0: lane 0 of clip A 1 bar, of clip B 4 bars (quarter steps) */
    {
        int c;
        for (c = 0; c < 2; c++) {
            HX_ASSERT(inst->tracks[0].drum_clips[c], "t0's drum clips are not allocated");
            inst->tracks[0].drum_clips[c]->lanes[0].clip.length = (uint16_t)(c ? 16 : 4);
            inst->tracks[0].drum_clips[c]->lanes[0].clip.loop_start = 0;
            inst->tracks[0].drum_clips[c]->lanes[0].clip.ticks_per_step = 96;
        }
        hx_set_param(h, "t0_launch_clip", "0");
    }
    shape(h, 0, 4, 96);      /* C: 4 quarter steps = 1 bar */
    shape(h, 1, 16, 96);     /* D: 16 quarter steps = 4 bars */
    shape(h, 2, 16, 96);     /* another 4-bar clip */
    hx_set_param(h, "t1_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    /* into song bar 3, part-way through a beat */
    while (song(h) < 2 * 384 + 2 * 96 + 37) hx_render(h, 1);

    /* ---- 1 bar -> 4 bars: the 4-bar clip comes in at bar 3 of itself ---- */
    HX_ASSERT(T(h)->active_clip == 0 && T(h)->clip_playing && T(h)->current_step < 4, "clip C is not playing");
    el = song(h) % (16 * 96);
    hx_set_param(h, "t1_launch_clip", "1");
    want = el / 96;
    {
        char m[160];
        snprintf(m, sizeof m, "the 4-bar clip came in at step %u.%u, not the song's %u.%u (bar %u)",
                 (unsigned)T(h)->current_step, (unsigned)T(h)->tick_in_step, (unsigned)want, (unsigned)(el % 96),
                 (unsigned)(want / 4 + 1));
        HX_ASSERT(T(h)->active_clip == 1 && T(h)->current_step == want && T(h)->tick_in_step == el % 96, m);
        HX_ASSERT(want >= 8, "the test is not in the 4-bar clip's third bar");
    }

    /* ---- a drum track: each lane comes in at the song position (it
     * always did — the fix brings melodic and audio clips to the same) ---- */
    {
        seq8_track_t *d = &inst->tracks[0];
        uint32_t de;
        HX_ASSERT(d->active_clip == 0 && d->clip_playing, "the drum clip is not playing");
        de = song(h) % (16 * 96);
        hx_set_param(h, "t0_launch_clip", "1");
        HX_ASSERT(d->active_clip == 1 && d->drum_current_step[0] == de / 96 && d->drum_tick_in_step[0] == de % 96,
                  "a drum lane did not come in at the song position");
    }

    /* ---- a Backward clip: the song position, counted from its end (it used
     * to jump to its start) ---- */
    hx_render(h, 4);
    shape(h, 3, 16, 96);
    T(h)->clips[3].playback_dir = 1;
    el = song(h) % (16 * 96);
    hx_set_param(h, "t1_launch_clip", "3");
    HX_ASSERT(T(h)->current_step == 15 - el / 96 && T(h)->tick_in_step == el % 96,
              "a Backward clip did not come in at the song position");
    T(h)->clips[3].playback_dir = 0;
    hx_set_param(h, "t1_launch_clip", "1");

    /* ---- 4 bars -> 4 bars, the old clip off the song's phase: its phase
     * carries over, unchanged ---- */
    hx_render(h, 3);
    T(h)->current_step = (uint16_t)((T(h)->current_step + 5) % 16);   /* as if launched on another bar */
    {
        uint16_t st = T(h)->current_step;
        uint32_t tis = T(h)->tick_in_step;
        hx_set_param(h, "t1_launch_clip", "2");
        HX_ASSERT(T(h)->active_clip == 2 && T(h)->current_step == st && T(h)->tick_in_step == tis,
                  "a same-length launch did not keep the playing clip's phase");
    }

    /* ---- 4 bars -> 1 bar: the song position wrapped to one bar ---- */
    hx_render(h, 5);
    el = song(h) % (4 * 96);
    hx_set_param(h, "t1_launch_clip", "0");
    HX_ASSERT(T(h)->current_step == el / 96 && T(h)->tick_in_step == el % 96,
              "the 1-bar clip did not come in at the song position");

    /* ---- nothing playing on the track (transport running): song position,
     * in the clip's own (quarter) steps, not master 1/16 steps ---- */
    hx_set_param(h, "t1_deactivate", "");
    hx_render(h, 7);
    HX_ASSERT(!T(h)->clip_playing && inst->playing, "the track did not stop with the transport running");
    el = song(h) % (16 * 96);
    hx_set_param(h, "t1_launch_clip", "1");
    HX_ASSERT(T(h)->clip_playing && T(h)->current_step == el / 96 && T(h)->tick_in_step == el % 96,
              "a clip launched onto a stopped track did not come in at the song position");

    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    printf("PASS: launch Now — a different length comes in at the song position (melodic, drum lanes, Backward); the same length keeps the phase\n");
    return 0;
}
