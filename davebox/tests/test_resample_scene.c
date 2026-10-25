/* tests/test_resample_scene.c — SCENE RESAMPLE (seq8_resample.c): a scene's
 * audio through the host's module take (the harness's capture_start stand-in).
 *
 *   - the natural length is the shortest span where every non-empty clip lines
 *     up again, in whole bars; past 32 bars the longest clip; empty = 0;
 *   - from STOPPED it launches the row and starts the transport, and the take
 *     is armed ONE render after the render that plays the first tick: the
 *     slots render before this module, so a note sent in render k is heard
 *     from k+1 — arming in k puts a block of silence at the front of the loop;
 *   - the take is exactly bars (+ tail) long in frames at the running tempo;
 *   - a warm-up pass moves the start one pass in;
 *   - every clip stops at the end of the pass, so tail bars are ring-out;
 *   - the metronome is silent while a take is pending or running;
 *   - a transport stop cancels (and stops the host's take); refusals change
 *     nothing; a busy sampler fails the take. */
#include "harness.h"

static int geti(hx_t *h, const char *k) {
    char b[32];
    return hx_get_param(h, k, b, sizeof b) > 0 ? atoi(b) : -1;
}

/* Track 1, clip `c`: one note on step 0, `steps` long. */
static void clip_with_note(hx_t *h, int t, int c, int steps) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char k[48];
    snprintf(k, sizeof k, "t%d_route", t);           hx_set_param(h, k, "schwung");
    snprintf(k, sizeof k, "t%d_c%d_step_0_toggle", t, c); hx_set_param(h, k, "60 100");
    inst->tracks[t].clips[c].length = (uint16_t)steps;
}

/* The block of the first note-on emitted, or -1. */
static int first_note_block(void) {
    int i;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_PARAM_SET && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[3]) return e->block;
    }
    return -1;
}

static int audio_silent(void) {
    const int16_t *a = hx_last_audio();
    int i;
    for (i = 0; i < MOVE_FRAMES_PER_BLOCK * 2; i++) if (a[i]) return 0;
    return 1;
}

/* 120 bpm: one bar = 2 s = 88200 frames. */
#define BAR_FRAMES 88200u

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    int stops, block, i, starts;
    uint32_t frames;
    const char *path;

    /* ---- natural length ---- */
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    clip_with_note(h, 1, 0, 16);                     /* 1 bar */
    clip_with_note(h, 2, 0, 24);                     /* 1.5 bars */
    HX_ASSERT(geti(h, "resample_bars_0") == 3, "16 + 24 steps did not line up at 3 bars");
    clip_with_note(h, 1, 1, 31);
    clip_with_note(h, 2, 1, 33);                     /* lines up only after 1023 bars */
    HX_ASSERT(geti(h, "resample_bars_1") == 3, "past 32 bars it is not the longest clip, rounded up");
    HX_ASSERT(geti(h, "resample_bars_5") == 0, "an empty scene has a length");

    /* ---- refusals: nothing moves ---- */
    hx_set_param(h, "resample_scene", "0 3 0 0 |relative.wav");
    HX_ASSERT(!inst->playing && inst->resample_state == RS_FAILED && geti(h, "resample_err") == RS_ERR_ARGS,
              "a relative path was taken");
    hx_set_param(h, "transport", "play");
    hx_render(h, 2);
    hx_set_param(h, "resample_scene", "0 3 0 0 |/x/a.wav");
    HX_ASSERT(inst->resample_state == RS_FAILED && geti(h, "resample_err") == RS_ERR_PLAYING
              && hx_stub_capture(NULL, NULL, NULL, NULL) == 0, "a take started while playing");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 2);
    hx_set_param(h, "resample_clear", "1");
    HX_ASSERT(inst->resample_state == RS_IDLE, "clear did not return to idle");

    /* ---- the take ---- */
    /* The harness loads no click WAV, so "silent" would be true of any build:
     * give it one, and prove it sounds when no take is running. */
    {
        static int16_t click[256];
        int c, heard = 0;
        for (c = 0; c < 256; c++) click[c] = 8000;
        inst->metro_wav_data = click; inst->metro_wav_frames = 256; inst->metro_vol = 100;
        hx_set_param(h, "metro_on", "3");            /* clicks on every beat */
        hx_set_param(h, "transport", "play");
        for (c = 0; c < 400 && !heard; c++) { hx_render(h, 1); heard = !audio_silent(); }
        HX_ASSERT(heard, "control: the click never sounded, so silence below would prove nothing");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 400);                            /* the click runs out */
        HX_ASSERT(audio_silent(), "control: stopped, yet still clicking");
    }
    hx_clear_capture(h);
    hx_set_param(h, "resample_scene", "0 3 0 0 |/x/My S1 3bar 120bpm.wav");
    HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED, "the take did not launch from stopped");
    for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) {
        hx_render(h, 1);
        HX_ASSERT(audio_silent(), "the metronome clicked into a pending take");
    }
    starts = hx_stub_capture(&stops, &block, &frames, &path);
    HX_ASSERT(starts == 1, "the host take did not start");
    HX_ASSERT(first_note_block() >= 0, "the scene played nothing");
    HX_ASSERT(block == first_note_block() + 1,
              "the take was not armed one render after the first tick played");
    HX_ASSERT(frames == 3 * BAR_FRAMES, "the take is not exactly 3 bars of frames");
    HX_ASSERT(!strcmp(path, "/x/My S1 3bar 120bpm.wav"), "the path did not reach the host");
    HX_ASSERT(inst->tracks[1].active_clip == 0 && inst->tracks[2].active_clip == 0,
              "the row did not launch");

    /* through the pass: silent click, and every clip stops at the bar line */
    while (inst->resample_state == RS_RECORDING) {
        hx_render(h, 1);
        HX_ASSERT(audio_silent(), "the metronome clicked into the take");
    }
    HX_ASSERT(inst->resample_state == RS_DONE && inst->resample_done == 3 * BAR_FRAMES,
              "the take did not finish at its length");
    HX_ASSERT(!inst->tracks[1].clip_playing && !inst->tracks[2].clip_playing,
              "the clips played on past the pass");
    for (i = 0; i < 200; i++) {                      /* transport still running: beats fall */
        hx_render(h, 1);
        HX_ASSERT(audio_silent(), "the click came back before the UI read the outcome");
    }
    hx_set_param(h, "transport", "stop");
    hx_stub_capture(&stops, NULL, NULL, NULL);
    HX_ASSERT(inst->resample_state == RS_DONE && stops == 0, "stopping after DONE cancelled the take");
    hx_set_param(h, "resample_clear", "1");
    hx_destroy(h);

    /* ---- warm-up: the take starts one pass in ---- */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    clip_with_note(h, 1, 0, 16);
    hx_clear_capture(h);
    hx_set_param(h, "resample_scene", "0 1 1 0 |/x/w.wav");
    {
        int starting_block = -1;
        for (i = 0; i < 2000 && inst->resample_state != RS_RECORDING; i++) {
            hx_render(h, 1);
            if (inst->resample_state == RS_STARTING && starting_block < 0) {
                starting_block = i + 1;   /* hx_render bumps the clock first: block numbers start at 1 */
                HX_ASSERT(inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step >= RS_BAR_TICKS,
                          "the warm-up take started before the pass was over");
            }
        }
        hx_stub_capture(NULL, &block, &frames, NULL);
        HX_ASSERT(starting_block > first_note_block() + 100, "warm-up did not delay the take");
        HX_ASSERT(block == starting_block + 1, "the warm-up take was not armed one render later");
        HX_ASSERT(frames == BAR_FRAMES, "the warm-up take is not one bar");
    }
    hx_destroy(h);

    /* ---- tail: ring-out, not the loop again ---- */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    clip_with_note(h, 1, 0, 16);
    hx_set_param(h, "resample_scene", "0 1 0 2 |/x/t.wav");
    while (inst->resample_state != RS_RECORDING) hx_render(h, 1);
    hx_stub_capture(NULL, NULL, &frames, NULL);
    HX_ASSERT(frames == 3 * BAR_FRAMES, "1 bar + 2 tail bars is not 3 bars of frames");
    while (inst->resample_done < 3 * BAR_FRAMES / 2) hx_render(h, 1);   /* into the tail */
    HX_ASSERT(inst->resample_state == RS_RECORDING && !inst->tracks[1].clip_playing,
              "the clip played into the tail");
    /* ---- cancel ---- */
    hx_set_param(h, "transport", "stop");
    hx_stub_capture(&stops, NULL, NULL, NULL);
    HX_ASSERT(inst->resample_state == RS_CANCELLED && stops == 1, "a stop mid-take did not cancel it");
    hx_destroy(h);

    /* ---- a busy sampler ---- */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    clip_with_note(h, 1, 0, 16);
    hx_stub_capture_refuse(1);
    hx_set_param(h, "resample_scene", "0 1 0 0 |/x/b.wav");
    for (i = 0; i < 40 && inst->resample_state == RS_ARMED; i++) hx_render(h, 1);
    hx_render(h, 1);
    HX_ASSERT(inst->resample_state == RS_FAILED && geti(h, "resample_err") == RS_ERR_SAMPLER,
              "a refused take was not reported");
    hx_destroy(h);

    printf("PASS: test_resample_scene\n");
    return 0;
}
