/* tests/test_drum_lane_geometry_survives_load.c — a drum lane with NO
 * notes must keep its length, loop start, step size, pad note and play-effects
 * settings across a save and reload.
 *
 * The serializer used to skip any lane without an active note, whole, and the
 * loader skipped any lane without an `_n` key. So: set a clip to 4 bars with
 * ALL LANES, put hits on the kick only, reload — every other lane came back as
 * 1 bar, and a snare added later on bar 3 never played. Found 2026-09-24 by the
 * drum-automation design pass; the drum automation clock (the longest lane)
 * shrank the same way.
 *
 * Asserts the LOADED STATE, not the bytes — plus the few byte-level facts the
 * size budget depends on (the base key, and that a lane matching it writes
 * nothing). And the worst case: every empty lane of every clip of 8 drum tracks
 * at a distinct geometry must still fit state_buf, because the serializer
 * REFUSES (no save at all) past it. */
#include "harness.h"
#include <unistd.h>

static char big[sizeof(((seq8_instance_t *)0)->state_buf) * 2];

static int serialize(seq8_instance_t *inst) {
    FILE *fp = fmemopen(big, sizeof(big) - 1, "w");
    HX_ASSERT(fp, "fmemopen failed");
    seq8_do_serialize(inst, fp);
    long n = ftell(fp);
    fclose(fp);
    HX_ASSERT(n > 0 && n < (long)sizeof(big) - 1, "serialized size out of range");
    big[n] = '\0';
    return (int)n;
}

static seq8_instance_t *reload(hx_t **hp, int n) {
    char tmp[256];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_lane_geom_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(big, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    hx_destroy(*hp);
    *hp = hx_create(NULL);
    HX_ASSERT(*hp, "second create failed");
    seq8_instance_t *inst = (seq8_instance_t *)(*hp)->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    inst->state_path[sizeof(inst->state_path) - 1] = '\0';
    seq8_load_state(inst);
    remove(tmp);
    return inst;
}

static clip_t *lane(seq8_instance_t *inst, int t, int c, int l) {
    HX_ASSERT(inst->tracks[t].drum_clips[c], "drum clip not allocated");
    return &inst->tracks[t].drum_clips[c]->lanes[l].clip;
}

int main(void) {
    int n;

    /* ---- 1. the reported case, plus an empty lane with its own settings ---- */
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t0_pad_mode", "1");                     /* drum */
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "t0 is not drum");
    hx_set_param(h, "t0_all_lanes_length", "64");            /* the ALL LANES gesture */
    for (int l = 0; l < DRUM_LANES; l++)
        HX_ASSERT(lane(inst, 0, 0, l)->length == 64, "setup: ALL LANES did not set 64");
    clip_insert_note(lane(inst, 0, 0, 0), 0, 12, 36, 100);   /* the kick has a hit */
    /* lane 3: empty, but with its own geometry and settings */
    {
        drum_lane_t *dl = &inst->tracks[0].drum_clips[0]->lanes[3];
        dl->clip.length = 12; dl->clip.loop_start = 16; dl->clip.ticks_per_step = 48;
        dl->midi_note = 50;
        dl->pfx_params.delay_level = 0;                      /* init is 127 */
    }

    n = serialize(inst);
    HX_ASSERT(strstr(big, "\"t0c0_lg\":\"64:0:24\""),
              "the ALL LANES clip must write ONE base key, not 32 lengths");
    HX_ASSERT(!strstr(big, "\"t0c0l5_"),
              "an empty lane that matches the base must write nothing at all");
    HX_ASSERT(!strstr(big, "\"t0c0l0_len\""),
              "a lane WITH notes that matches the base writes no length either");
    HX_ASSERT(strstr(big, "\"t0c0l3_g\":\"12:16:48:50:0:0\""),
              "an empty lane writes ONE packed _g: len:ls:tps:mn:pd:par");
    HX_ASSERT(strstr(big, "\"t0c0l3_dpdl\":0"),
              "...and its non-init delay level (0; init is 127) beside it");
    HX_ASSERT(!strstr(big, "\"t0c0l3_mn\""), "...with no separate pad-note key");
    HX_ASSERT(!strstr(big, "\"t0c1_lg\""), "an untouched clip writes no base");

    inst = reload(&h, n);
    for (int l = 0; l < DRUM_LANES; l++) {
        if (l == 3) continue;
        HX_ASSERT(lane(inst, 0, 0, l)->length == 64,
                  "⭐ every lane of the 4-bar clip is 4 bars after a reload");
    }
    HX_ASSERT(lane(inst, 0, 0, 0)->note_count == 1, "the kick's hit survived");
    {
        drum_lane_t *dl = &inst->tracks[0].drum_clips[0]->lanes[3];
        HX_ASSERT(dl->clip.length == 12 && dl->clip.loop_start == 16
                  && dl->clip.ticks_per_step == 48,
                  "an empty lane keeps its own length, loop start and step size");
        HX_ASSERT(dl->midi_note == 50, "an empty lane keeps its pad note");
        HX_ASSERT(dl->pfx_params.delay_level == 0, "an empty lane keeps its play-effects");
    }
    HX_ASSERT(inst->tracks[0].drum_clips[0]->lanes[5].pfx_params.delay_level == 127,
              "control: an untouched empty lane still reloads at the init delay level");
    HX_ASSERT(lane(inst, 0, 1, 7)->length == SEQ_STEPS_DEFAULT,
              "control: a lane in an untouched clip is still the default length");
    printf("  ok   — ⭐ empty drum lanes keep their geometry and settings on reload\n");

    /* ---- 2. worst case: every empty lane distinct, all 8 tracks x 16 clips ---- */
    hx_destroy(h);
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    for (int t = 0; t < NUM_TRACKS; t++) {
        char k[24];
        snprintf(k, sizeof(k), "t%d_pad_mode", t);
        hx_set_param(h, k, "1");
        HX_ASSERT(inst->tracks[t].pad_mode == PAD_MODE_DRUM, "worst case: track not drum");
        for (int c = 0; c < NUM_CLIPS; c++)
            for (int l = 0; l < DRUM_LANES; l++) {
                drum_lane_t *dl = &inst->tracks[t].drum_clips[c]->lanes[l];
                dl->clip.length = (uint16_t)(100 + l);       /* 32 distinct lengths */
                dl->clip.loop_start = (uint16_t)(10 + l);
                dl->clip.ticks_per_step = 192;
                dl->midi_note = (uint8_t)(60 + l);
                dl->clip.playback_dir = 2;
            }
    }
    n = serialize(inst);
    printf("  ok   — worst case (8x16x32 empty lanes, all distinct): %d bytes of %d\n",
           n, (int)sizeof(inst->state_buf));
    HX_ASSERT(n < (int)sizeof(inst->state_buf) * 3 / 4,
              "the worst case must leave a quarter of state_buf for notes and the rest — "
              "past state_buf the serializer refuses and nothing is saved");
    inst = reload(&h, n);
    HX_ASSERT(lane(inst, 7, 15, 31)->length == 131 && lane(inst, 7, 15, 31)->loop_start == 41
              && lane(inst, 7, 15, 31)->ticks_per_step == 192,
              "the worst case round-trips (last lane of the last clip)");
    HX_ASSERT(inst->tracks[7].drum_clips[15]->lanes[31].midi_note == 91
              && lane(inst, 7, 15, 31)->playback_dir == 2,
              "...with its pad note and direction");

    hx_destroy(h);
    printf("PASS: test_drum_lane_geometry_survives_load\n");
    return 0;
}
