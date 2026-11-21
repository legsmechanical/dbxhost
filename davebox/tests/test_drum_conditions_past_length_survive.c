/* tests/test_drum_conditions_past_length_survive.c — a drum lane's step
 * conditions are saved for all 256 steps, as melodic clips' are. Before:
 * only the first `length` were written, so shortening a lane from 32 to 16
 * lost a condition on step 20 at the next save (device check), although the
 * engine still held it and the notes past the length were still saved. */
#include "harness.h"
#include <unistd.h>

int main(void) {
    static char buf[262144];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->tracks[0].pad_mode == PAD_MODE_DRUM, "control: t0 is drum");

    hx_set_param(h, "t0_l0_step_0_toggle", "110");               /* allocates the clip */
    int ac = inst->tracks[0].active_clip;
    hx_set_param(h, "t0_l3_clip_length", "32");
    hx_set_param(h, "t0_l3_step_2_ratch", "3");
    hx_set_param(h, "t0_l3_step_20_iter", "51");
    hx_set_param(h, "t0_l3_clip_length", "16");
    clip_t *l3 = &inst->tracks[0].drum_clips[ac]->lanes[3].clip;
    HX_ASSERT(l3->length == 16 && l3->step_iter[20] == 0x33, "control: lane 3 is 16 long, step 20 holds Iter");
    hx_set_param(h, "t0_l5_step_20_rand", "40");                  /* an empty lane, default length */

    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0, "state_full empty");
    {   /* Trailing zeros are trimmed: 21 steps = 42 hex chars, not 512. */
        char want[64]; snprintf(want, sizeof(want), "\"t0c%dl3_si\":\"", ac);
        const char *p = strstr(buf, want);
        HX_ASSERT(p != NULL, "lane 3's iter string is written");
        p += strlen(want);
        const char *e = strchr(p, '"');
        HX_ASSERT(e && e - p == 42, "lane 3's iter string is trimmed after step 20");
    }

    char tmp[128];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_dcond_state_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(buf, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    inst->state_path[0] = '\0';   /* destroy saves to state_path */
    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "second create failed");
    inst = (seq8_instance_t *)h->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    seq8_load_state(inst);
    remove(tmp);

    l3 = &inst->tracks[0].drum_clips[ac]->lanes[3].clip;
    HX_ASSERT(l3->length == 16, "control: lane 3 reloads 16 long");
    HX_ASSERT(l3->step_iter[20] == 0x33, "lane 3's Iter past its length survived");
    HX_ASSERT(l3->step_ratchet[2] == 3, "lane 3's ratchet inside its length survived");
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[5].clip.step_random[20] == 40,
              "an empty lane's condition past its length survived");
    HX_ASSERT(inst->tracks[0].drum_clips[ac]->lanes[0].clip.note_count > 0, "control: lane 0's hit reloaded");

    inst->state_path[0] = '\0';
    hx_destroy(h);
    printf("PASS: drum_conditions_past_length_survive\n");
    return 0;
}
