/* tests/test_snap_save_dirty.c — saving a mute snapshot schedules a save.
 *
 * THE BUG THIS PINS: `snap_save` stored the snapshot but never set
 * state_dirty, so the deferred save (JS polls the dirty flag) never ran for it.
 * The snapshot lived only in memory until some OTHER edit dirtied the state; a
 * session that ended before one lost it. `snap_delete` has always set the flag,
 * so deleting a snapshot persisted and saving one did not.
 *
 * The snapshot IS project state — `sn<N>_m` / `sn<N>_s` / `sn<N>de<T>` are
 * serialized — so the second check proves the flag guards something real. */
#include "harness.h"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* snap_save: t0 + t3 muted, t5 soloed, t0 drum eff-mute 7, into slot 4. */
    inst->state_dirty = 0;
    hx_set_param(h, "snap_save", "4 1 0 0 1 0 0 0 0 0 0 0 0 0 1 0 0 7 0 0 0 0 0 0 0");
    HX_ASSERT(inst->snap_valid[4] == 1, "control: snap_save stored slot 4");
    HX_ASSERT(inst->state_dirty == 1,
              "snap_save must set state_dirty, or the snapshot is not saved to disk");

    /* ...and what the flag schedules really does carry the snapshot. */
    {
        static char buf[262144];
        inst->state_dirty = 1;
        int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
        HX_ASSERT(n > 0, "state_full returned nothing");
        HX_ASSERT(strstr(buf, "\"sn4_m\":\"10010000\"") != NULL, "serialized state has slot 4's mutes");
        HX_ASSERT(strstr(buf, "\"sn4_s\":\"00000100\"") != NULL, "serialized state has slot 4's solos");
        HX_ASSERT(strstr(buf, "\"sn4de0\":7") != NULL, "serialized state has slot 4's drum mutes");
    }

    /* Control: an out-of-range slot stores nothing and schedules nothing. */
    inst->state_dirty = 0;
    hx_set_param(h, "snap_save", "16 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
    HX_ASSERT(inst->state_dirty == 0, "an invalid slot must not dirty the state");

    /* Control: delete already persisted — the two now agree. */
    inst->state_dirty = 0;
    hx_set_param(h, "snap_delete", "4");
    HX_ASSERT(inst->snap_valid[4] == 0, "control: snap_delete cleared slot 4");
    HX_ASSERT(inst->state_dirty == 1, "control: snap_delete sets state_dirty");

    hx_destroy(h);
    printf("PASS: snap_save_dirty\n");
    return 0;
}
