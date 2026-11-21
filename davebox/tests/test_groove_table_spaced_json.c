/* tests/test_groove_table_spaced_json.c — a groove table loads from a state
 * file written with a space after each colon, as a template's state.json is
 * (Python's json.dump). The loader found the table and its name with a
 * literal "_gtab":" search, so a project made from a template opened with the
 * groove Off and the table gone (device check of the template fix). */
#include "harness.h"
#include <unistd.h>

int main(void) {
    static char buf[262144], spaced[300000];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    hx_set_param(h, "groove_begin", "24 4 100 0 0 0 Feel");
    hx_set_param(h, "groove_slots_0", "0 100 3 90 0 100 -2 80");
    hx_set_param(h, "groove_commit", "c");
    hx_set_param(h, "groove_amt", "60");
    HX_ASSERT(inst->groove.kind == GROOVE_TABLE, "control: the table is the groove");
    inst->state_dirty = 1;
    int n = hx_get_param(h, "state_full", buf, (int)sizeof(buf));
    HX_ASSERT(n > 0 && strstr(buf, "\"_gtab\":\""), "control: the blob carries the table");

    /* Re-write it the way Python's json.dump does: a space after each ':'. */
    { int i, j = 0, inq = 0;
      for (i = 0; i < n && j < (int)sizeof(spaced) - 2; i++) {
          if (buf[i] == '"') inq = !inq;
          spaced[j++] = buf[i];
          if (!inq && buf[i] == ':') spaced[j++] = ' ';
      }
      spaced[j] = '\0'; n = j; }
    HX_ASSERT(strstr(spaced, "\"_gtab\": \""), "control: the copy is spaced");

    char tmp[128];
    snprintf(tmp, sizeof(tmp), "/tmp/hx_gtab_state_%d.json", (int)getpid());
    FILE *wf = fopen(tmp, "w");
    HX_ASSERT(wf && fwrite(spaced, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
    fclose(wf);
    inst->state_path[0] = '\0';
    hx_destroy(h);
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
    seq8_load_state(inst);
    remove(tmp);

    HX_ASSERT(inst->groove.kind == GROOVE_TABLE, "spaced JSON: the groove is still the table");
    HX_ASSERT(inst->groove.n_slots == 4 && inst->groove.base == 24, "spaced JSON: the table's shape survived");
    HX_ASSERT(!strcmp(inst->groove.name, "Feel"), "spaced JSON: the table's name survived");
    HX_ASSERT(inst->groove.amt == 60, "control: the amount loaded");

    inst->state_path[0] = '\0';
    hx_destroy(h);
    printf("PASS: groove_table_spaced_json\n");
    return 0;
}
