/* tests/test_rng_differs_between_launches.c — the per-track and per-lane random
 * generators do not start from the same value at every launch (ruled
 * 2026-11-21), so the first pass after a load is not the same "random"
 * pattern each time.
 *
 * Before: every play_fx_t and drum lane seeded rng = 12345 at create.
 *
 *  1. seed not fixed: four launches give four different track seeds and four
 *     different lane seeds, none zero; tracks differ from each other.
 *  2. CONTROL: the test build's fixed seed — every launch is 12345, so the
 *     rest of the suite stays bit-identical. */
#include "harness.h"

#define LAUNCHES 4

/* Each launch is a fresh process on the device, so the seed state starts from
 * its initial value every time: reset it here, so only what create_instance
 * stirs in can tell launches apart. The instances stay alive until the end
 * (as separate processes would be distinct allocations). */
static void *alive[2 * LAUNCHES];
static int n_alive;
static void launch(uint32_t *trk0, uint32_t *trk1, uint32_t *lane) {
    seq8_rng_state = 0x6A09E667u;
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    *trk0 = inst->tracks[0].pfx.rng;
    *trk1 = inst->tracks[1].pfx.rng;
    *lane = inst->tracks[0].drum_lane_pfx[3].rng;
    inst->state_path[0] = '\0';        /* nothing to save on the way out */
    alive[n_alive++] = h->inst;
}
static void destroy_all(void) {
    hx_t *h = hx_create_raw(NULL);
    void *last = h->inst;
    for (int i = 0; i < n_alive; i++) { h->inst = alive[i]; hx_destroy(h); }
    h->inst = last; ((seq8_instance_t *)last)->state_path[0] = '\0'; hx_destroy(h);
    n_alive = 0;
}

int main(void) {
    uint32_t t0[LAUNCHES], t1[LAUNCHES], ln[LAUNCHES];
    int i, j;

    seq8_rng_fixed = 0;
    for (i = 0; i < LAUNCHES; i++) launch(&t0[i], &t1[i], &ln[i]);
    for (i = 0; i < LAUNCHES; i++) {
        HX_ASSERT(t0[i] && t1[i] && ln[i], "a seed is zero (an xorshift generator would stick)");
        HX_ASSERT(t0[i] != t1[i], "two tracks share a seed");
        for (j = 0; j < i; j++) {
            if (t0[i] == t0[j] || ln[i] == ln[j]) {
                fprintf(stderr, "FAIL: launch %d and %d start a generator from the same seed "
                        "(track %08x/%08x, lane %08x/%08x)\n", j, i,
                        (unsigned)t0[j], (unsigned)t0[i], (unsigned)ln[j], (unsigned)ln[i]);
                return 1;
            }
        }
    }

    destroy_all();
    seq8_rng_fixed = 1;
    for (i = 0; i < LAUNCHES; i++) {
        launch(&t0[i], &t1[i], &ln[i]);
        HX_ASSERT(t0[i] == 12345u && t1[i] == 12345u && ln[i] == 12345u,
                  "control: the fixed test seed is 12345 at every launch");
    }
    destroy_all();
    printf("PASS: rng_differs_between_launches\n");
    return 0;
}
