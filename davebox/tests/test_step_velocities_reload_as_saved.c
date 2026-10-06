/* tests/test_step_velocities_reload_as_saved.c — a step velocity reloads as
 * the value that was saved.
 *
 * THE BUG THIS PINS (2026-10-04 module review): three loaders carried
 * conversions for an earlier encoding of the same keys, and the values they
 * converted are valid today:
 *   - drum repeat step velocity 100  → reloaded as Thru (old "100%")
 *   - TRACK ARP / SEQ ARP step velocity 0..4 → reloaded as 0/32/64/96/Thru
 *     (old five-level scale)
 * The setters store 1..127 (repeat) and 0..127 (arp) verbatim and the writer
 * writes them verbatim, so a quiet arp step or a repeat step at exactly 100
 * changed across a save. dAVEBOx SA has had no release, so there is no old
 * file to honour: the conversions are gone. */
#include "harness.h"
#include <unistd.h>

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    static const uint8_t arp[8] = { 0, 1, 2, 3, 4, 5, 100, 127 };

    hx_set_param(h, "t0_l0_step_0_toggle", "110");          /* allocates t0's drum clip */
    inst->tracks[0].drum_repeat_vel_scale[2][0] = 100;
    inst->tracks[0].drum_repeat_vel_scale[2][1] = 99;
    inst->tracks[0].drum_repeat_vel_scale[2][2] = 1;
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    for (int i = 0; i < 8; i++) {
        inst->tracks[1].tarp.step_vel[i] = arp[i];
        inst->tracks[1].clips[0].pfx_params.seq_arp_step_vel[i] = arp[i];
    }

    static char buf[262144];
    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0, "state_full empty");
    HX_ASSERT(strstr(buf, "\"t0l2rvs0\":100") != NULL, "control: the repeat velocity 100 was written");
    HX_ASSERT(strstr(buf, "\"t1_tasv1\":1") != NULL, "control: the arp velocity 1 was written");

    char tmp[128];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_stepvel_state_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(buf, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);

    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "second create failed");
    inst = (seq8_instance_t *)h->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    inst->state_path[sizeof(inst->state_path) - 1] = '\0';
    seq8_load_state(inst);
    remove(tmp);

    HX_ASSERT(inst->tracks[0].drum_repeat_vel_scale[2][0] == 100, "repeat step velocity 100 reloaded as something else");
    HX_ASSERT(inst->tracks[0].drum_repeat_vel_scale[2][1] == 99,  "control: repeat step velocity 99");
    HX_ASSERT(inst->tracks[0].drum_repeat_vel_scale[2][2] == 1,   "control: repeat step velocity 1");
    HX_ASSERT(inst->tracks[0].drum_repeat_vel_scale[2][3] == 255, "control: an untouched repeat step is Thru");
    for (int i = 0; i < 8; i++) {
        if (inst->tracks[1].tarp.step_vel[i] != arp[i]) {
            fprintf(stderr, "FAIL: TRACK ARP step velocity %d reloaded as %d\n", arp[i], inst->tracks[1].tarp.step_vel[i]);
            return 1;
        }
        if (inst->tracks[1].clips[0].pfx_params.seq_arp_step_vel[i] != arp[i]) {
            fprintf(stderr, "FAIL: SEQ ARP step velocity %d reloaded as %d\n", arp[i],
                    inst->tracks[1].clips[0].pfx_params.seq_arp_step_vel[i]);
            return 1;
        }
    }
    HX_ASSERT(inst->tracks[2].tarp.step_vel[0] == 255, "control: an untouched arp step is Thru");

    hx_destroy(h);
    printf("PASS: step_velocities_reload_as_saved\n");
    return 0;
}
