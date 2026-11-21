/* tests/test_tarp_latch_survives_load.c — the LIVE ARP latch is saved with
 * the project. Before: no key carried it, so every reload came back unlatched
 * (device check: the file diff for latch on was empty). A file without the
 * key loads latch off, and no held notes come back with it. */
#include "harness.h"
#include <unistd.h>

static hx_t *reload(hx_t *h, const char *blob, int n) {
    char tmp[128];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_talt_state_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(blob, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    /* destroy_instance saves to state_path: point it nowhere first, or the
     * previous instance would overwrite the file just written. */
    ((seq8_instance_t *)h->inst)->state_path[0] = '\0';
    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    inst->state_path[sizeof(inst->state_path) - 1] = '\0';
    seq8_load_state(inst);
    remove(tmp);
    return h;
}

int main(void) {
    static char buf[262144];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    hx_set_param(h, "t1_tarp_style", "1");
    hx_set_param(h, "t1_tarp_latch", "1");
    HX_ASSERT(inst->tracks[1].tarp_latch == 1, "control: t1 latched");
    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0, "state_full empty");
    HX_ASSERT(strstr(buf, "\"t1_talt\":1") != NULL, "the blob carries t1's latch");
    HX_ASSERT(strstr(buf, "\"t2_talt\"") == NULL, "an unlatched track writes no latch key");

    h = reload(h, buf, n);
    inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->tracks[1].tarp_latch == 1, "t1's latch survived the reload");
    HX_ASSERT(inst->tracks[1].tarp.style == 1, "control: t1's arp style reloaded");
    HX_ASSERT(inst->tracks[2].tarp_latch == 0, "t2 reloads unlatched");

    /* An older file has no key: latch off. */
    {
        char *k = strstr(buf, ",\"t1_talt\":1");
        HX_ASSERT(k != NULL, "control: key present to remove");
        memmove(k, k + strlen(",\"t1_talt\":1"), strlen(k + strlen(",\"t1_talt\":1")) + 1);
        h = reload(h, buf, (int)strlen(buf));
        inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(inst->tracks[1].tarp_latch == 0, "a file without the key loads latch off");
        HX_ASSERT(inst->tracks[1].tarp.style == 1, "control: the rest still loads");
    }

    inst->state_path[0] = '\0';
    hx_destroy(h);
    printf("PASS: tarp_latch_survives_load\n");
    return 0;
}
