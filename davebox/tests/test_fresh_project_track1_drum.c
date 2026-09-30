/* tests/test_fresh_project_track1_drum.c — a project with no saved state opens
 * with track 1 in DRUM mode, whatever the project before it was.
 *
 * Reported by a tester on a fresh install ("the first is a drumpad i think, but
 * the pads are in chromatic layout") and seen intermittently by Josh. The
 * `state_load` handler resets every track to melodic so the previous project's
 * drum tracks do not leak, and a load that finds no project data then left it
 * there — track 1's drum default came back only if the UI later pushed
 * `t0_pad_mode`, which it does only when it finds no UI sidecar. The UI reads
 * pad modes BACK from the DSP, so the DSP has to hold the default itself. */
#include "harness.h"
#include <stdio.h>
#include <string.h>
#include <unistd.h>

/* Any well-formed uuid; the set dir it names does not exist off-device. */
#define FRESH_UUID "11111111-2222-3333-4444-555555555555"

static int drum_clip_empty(seq8_track_t *tr) {
    for (int c = 0; c < NUM_CLIPS; c++) {
        drum_clip_t *dc = tr->drum_clips[c];
        if (!dc) return 0;
        for (int l = 0; l < DRUM_LANES; l++)
            for (int s = 0; s < SEQ_STEPS; s++)
                if (dc->lanes[l].clip.steps[s]) return 0;
    }
    return 1;
}

static void load_file(hx_t *h, const char *body) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char tmp[256];
    snprintf(tmp, sizeof tmp, "/tmp/hx_fresh_t1_%d.json", (int)getpid());
    FILE *f = fopen(tmp, "w"); fputs(body, f); fclose(f);
    snprintf(inst->state_path, sizeof inst->state_path, "%s", tmp);
    seq8_load_state(inst);
    remove(tmp);
}

int main(void) {
    int checks = 0;
    hx_t *h = hx_create(NULL);
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "control: a new instance starts track 1 in drum mode"); checks++;

    /* The project before: track 1 melodic with a drum hit left over, track 3 drum. */
    hx_set_param(h, "t0_l0_step_0_toggle", "100");
    hx_set_param(h, "t0_pad_mode", "0");
    hx_set_param(h, "t2_pad_mode", "1");
    HX_ASSERT(in->tracks[0].pad_mode != PAD_MODE_DRUM, "rig: track 1 did not leave drum mode"); checks++;
    HX_ASSERT(in->tracks[2].pad_mode == PAD_MODE_DRUM, "rig: track 3 did not enter drum mode"); checks++;

    hx_set_param(h, "state_load", FRESH_UUID);
    HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM,
              "a project with no saved state opened with track 1 NOT in drum mode"); checks++;
    HX_ASSERT(in->tracks[2].pad_mode == PAD_MODE_MELODIC_SCALE,
              "the previous project's drum track 3 leaked into the new one"); checks++;
    HX_ASSERT(drum_clip_empty(&in->tracks[0]),
              "track 1's drum clips carried the previous project's hits"); checks++;

    /* A Clear Session file (v=0) is also a project with nothing in it. */
    hx_set_param(h, "t0_pad_mode", "0");
    load_file(h, "{\"v\":0}");
    HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "a cleared session opened with track 1 not in drum mode"); checks++;

    /* ...but a SAVED project where the user made track 1 melodic keeps it. */
    hx_set_param(h, "t0_pad_mode", "0");
    static char buf[65536];
    int n = hx_get_param(h, "state_full", buf, (int)sizeof buf);
    HX_ASSERT(n > 0 && (size_t)n < sizeof buf - 1, "state_full failed");
    buf[n] = 0;
    hx_set_param(h, "t0_pad_mode", "1");
    load_file(h, buf);
    HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_MELODIC_SCALE,
              "a saved project's melodic track 1 was forced back to drum"); checks++;

    hx_destroy(h);
    printf("PASS: test_fresh_project_track1_drum (%d checks)\n", checks);
    return 0;
}
