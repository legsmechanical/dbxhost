/* tests/test_groove_table.c — a groove table arriving from the UI, and
 * travelling with the project.
 *
 * The UI sends a table in pieces (groove_begin, groove_slots_<i>,
 * groove_commit); nothing plays from the pieces until the commit swaps the
 * whole table in. The table is saved inside the project, so it survives the
 * file it came from. */
#include "harness.h"

static int geti(hx_t *h, const char *key) {
    char b[32]; b[0] = 0;
    hx_get_param(h, key, b, (int)sizeof(b));
    return atoi(b);
}
static const char *gets_(hx_t *h, const char *key) {
    static char b[2048];
    b[0] = 0;
    hx_get_param(h, key, b, (int)sizeof(b));
    return b;
}

/* 16 slots of a 1/16: every other slot 5 fine ticks early with velocity 90. */
static void send16(hx_t *h, const char *name) {
    char v[96];
    snprintf(v, sizeof(v), "24 16 90 10 20 30 %s", name);
    hx_set_param(h, "groove_begin", v);
    hx_set_param(h, "groove_slots_0", "0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90");
    hx_set_param(h, "groove_slots_8", "0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90");
    hx_set_param(h, "groove_commit", "");
}
#define TAB16 "24 16 0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90"

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;

    /* ---- nothing to select until a table is there ---- */
    hx_set_param(h, "groove_kind", "3");
    HX_ASSERT(geti(h, "groove_kind") != GROOVE_TABLE, "the table kind was selected with no table");
    HX_ASSERT(gets_(h, "groove_table")[0] == 0, "groove_table reads empty with no table");

    /* ---- the pieces do nothing until the commit ---- */
    hx_set_param(h, "groove_amt", "60");
    hx_set_param(h, "groove_begin", "24 16 90 10 20 30 Lazy Sixteenths");
    hx_set_param(h, "groove_slots_0", "0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90");
    HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_16 && !groove_has_table(&inst->groove),
              "a half-sent table reached the groove before its commit");
    hx_set_param(h, "groove_slots_8", "0 0 -5 90 0 0 -5 90 0 0 -5 90 0 0 -5 90");
    hx_set_param(h, "groove_commit", "");
    HX_ASSERT(geti(h, "groove_kind") == GROOVE_TABLE, "the commit selects the table");
    HX_ASSERT(!strcmp(gets_(h, "groove_table"), TAB16), "the table that plays is not the table that was sent");
    HX_ASSERT(!strcmp(gets_(h, "groove_name"), "Lazy Sixteenths"), "the name did not arrive");
    HX_ASSERT(geti(h, "groove_timing") == 90 && geti(h, "groove_quantize") == 10
              && geti(h, "groove_random") == 20 && geti(h, "groove_velocity") == 30,
              "the table's own four amounts did not arrive");
    HX_ASSERT(geti(h, "groove_amt") == 60, "loading a table changed the amount");
    printf("  ok   — a table is staged in pieces and swapped in whole on commit\n");

    /* ---- a commit with nothing staged, and pieces with no begin ---- */
    hx_set_param(h, "groove_commit", "");
    HX_ASSERT(!strcmp(gets_(h, "groove_table"), TAB16), "a second commit changed the table");
    hx_set_param(h, "groove_slots_0", "99 99 99 99");
    hx_set_param(h, "groove_commit", "");
    HX_ASSERT(!strcmp(gets_(h, "groove_table"), TAB16), "slots sent without a begin reached the groove");

    /* ---- out-of-range pieces are clamped or ignored, never written past the table ---- */
    hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Two");
    hx_set_param(h, "groove_slots_0", "1 1 2 2 3 3 4 4 5 5");      /* five pairs into two slots */
    HX_ASSERT(inst->groove_stage.off[2] == 0 && inst->groove_stage.vel[2] == 0,
              "a piece wrote past the table's own slot count");
    {
        /* a guard word after the staging copy would not survive a write past it */
        groove_t before = inst->groove_stage;
        hx_set_param(h, "groove_slots_100", "7 7");                /* inside the array, past this table */
        hx_set_param(h, "groove_slots_-3", "7 7");
        HX_ASSERT(!memcmp(&before, &inst->groove_stage, sizeof(before)),
                  "a piece addressed outside the table was written");
    }
    hx_set_param(h, "groove_commit", "");
    HX_ASSERT(!strcmp(gets_(h, "groove_table"), "24 2 1 1 2 2"), "extra or out-of-range slots were not dropped");
    hx_set_param(h, "groove_begin", "0 900 100 0 0 0 x\"y}z");
    hx_set_param(h, "groove_commit", "");
    HX_ASSERT(inst->groove.base == 1 && inst->groove.n_slots == GROOVE_MAX_SLOTS, "base and slot count are clamped");
    HX_ASSERT(!strchr(gets_(h, "groove_name"), '"') && !strchr(gets_(h, "groove_name"), '}'),
              "a name can carry a character that ends the project file's string");
    printf("  ok   — stray, extra and hostile pieces cannot reach past the table\n");

    /* ---- swing and back, with no file ---- */
    send16(h, "Lazy");
    hx_set_param(h, "groove_kind", "1");
    HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_16, "a swing can be chosen over a loaded table");
    hx_set_param(h, "groove_kind", "3");
    HX_ASSERT(geti(h, "groove_kind") == GROOVE_TABLE && !strcmp(gets_(h, "groove_table"), TAB16),
              "the table was lost by choosing a swing");

    /* ---- a TRIAL: heard, not chosen ---- */
    {
        static char blob[65536];
        hx_set_param(h, "groove_kind", "2");                 /* Swing 1/8 is what was chosen */
        hx_set_param(h, "groove_amt", "40");
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Trial One");
        hx_set_param(h, "groove_slots_0", "0 0 9 90");
        hx_set_param(h, "groove_commit", "a");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_TABLE && !strcmp(gets_(h, "groove_name"), "Trial One"),
                  "a trial does not play");
        HX_ASSERT(geti(h, "groove_amt") == 40, "a trial changed the amount");
        int n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0, "state_full"); blob[n] = '\0';
        HX_ASSERT(strstr(blob, "\"_gk\":2") && !strstr(blob, "Trial One"),
                  "a save while a trial plays stored the trial, not the groove that was chosen");
        /* a second trial over the first: the groove from BEFORE the first is still the one kept */
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Trial Two");
        hx_set_param(h, "groove_slots_0", "0 0 5 90");
        hx_set_param(h, "groove_commit", "a");
        hx_set_param(h, "groove_amt", "55");                 /* the amount moved while browsing */
        hx_set_param(h, "groove_revert", "1");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_8, "revert did not bring back the groove from before the trials");
        HX_ASSERT(geti(h, "groove_amt") == 55, "revert undid an amount change, which is not part of a trial");
        hx_set_param(h, "groove_revert", "1");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_8, "a second revert did something");

        /* keep: the trial is the choice, and it is what is saved */
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Trial Three");
        hx_set_param(h, "groove_slots_0", "0 0 7 90");
        hx_set_param(h, "groove_commit", "a");
        hx_set_param(h, "groove_keep", "1");
        hx_set_param(h, "groove_revert", "1");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_TABLE && !strcmp(gets_(h, "groove_name"), "Trial Three"),
                  "a kept trial was reverted");
        n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0, "state_full"); blob[n] = '\0';
        HX_ASSERT(strstr(blob, "Trial Three"), "a kept trial is not what is saved");

        /* an ordinary commit over a trial ends it: there is nothing to go back to */
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Trial Four");
        hx_set_param(h, "groove_slots_0", "0 0 7 90");
        hx_set_param(h, "groove_commit", "a");
        hx_set_param(h, "groove_begin", "24 2 100 0 0 0 Chosen");
        hx_set_param(h, "groove_slots_0", "0 0 3 90");
        hx_set_param(h, "groove_commit", "1");
        hx_set_param(h, "groove_revert", "1");
        HX_ASSERT(!strcmp(gets_(h, "groove_name"), "Chosen"), "a revert undid a groove that was chosen outright");
        send16(h, "Lazy");                                   /* what the next section saves */
        hx_set_param(h, "groove_amt", "0");
    }
    printf("  ok   — a trial plays without being chosen: revert restores, keep chooses, a save stores the choice\n");

    /* ---- it travels with the project ---- */
    {
        static char blob[65536];
        int n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0 && (size_t)n < sizeof(blob) - 1, "state_full");
        blob[n] = '\0';
        HX_ASSERT(strstr(blob, "\"_gtab\":\"" TAB16 "\""), "the table is not in the project");
        HX_ASSERT(strstr(blob, "\"_gn\":\"Lazy\"") && strstr(blob, "\"_gk\":3"), "the name or the kind is not in the project");
        hx_destroy(h);

        char tmp[256];
        snprintf(tmp, sizeof(tmp), "/tmp/hx_groove_tab_%d.json", (int)getpid());
        for (int torn = 0; torn < 2; torn++) {
            if (torn) {               /* the table cut short, as a torn write would leave it */
                char *p = strstr(blob, "\"_gtab\":\"");
                HX_ASSERT(p, "rig");
                char *q = strchr(p + 9, '"');
                memmove(p + 9 + 20, q, strlen(q) + 1);
            }
            FILE *wf = fopen(tmp, "w");
            HX_ASSERT(wf && fwrite(blob, 1, strlen(blob), wf) == strlen(blob), "tmp write failed");
            fclose(wf);
            h = hx_create(NULL);
            inst = (seq8_instance_t *)h->inst;
            strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
            seq8_load_state(inst);
            if (!torn) {
                HX_ASSERT(geti(h, "groove_kind") == GROOVE_TABLE, "a project's table groove did not come back selected");
                HX_ASSERT(!strcmp(gets_(h, "groove_table"), TAB16), "a project's table did not come back as saved");
                HX_ASSERT(!strcmp(gets_(h, "groove_name"), "Lazy"), "a project's groove name did not come back");
                HX_ASSERT(geti(h, "groove_velocity") == 30, "a project's groove amounts did not come back");
            } else {
                HX_ASSERT(geti(h, "groove_kind") == GROOVE_OFF && !groove_has_table(&inst->groove),
                          "a table cut short in the file was loaded anyway");
            }
            hx_destroy(h);
        }
        remove(tmp);
    }
    printf("  ok   — the table is saved in the project; a damaged one loads as Off\n");

    /* ---- and it plays: a sent table is the table the engine uses ---- */
    {
        h = hx_create(NULL);
        inst = (seq8_instance_t *)h->inst;
        send16(h, "Lazy");
        HX_ASSERT(groove_slot_off(&inst->groove, 24) == 0, "amount 0: nothing applied");
        hx_set_param(h, "groove_amt", "100");
        hx_set_param(h, "groove_timing", "100");
        HX_ASSERT(groove_slot_off(&inst->groove, 24) == -5 && groove_slot_off(&inst->groove, 0) == 0
                  && groove_slot_off(&inst->groove, 24 * 17) == -5,
                  "the engine does not read the offsets that were sent");
        hx_destroy(h);
    }
    printf("  ok   — the engine reads the offsets that were sent\n");

    printf("PASS: test_groove_table\n");
    return 0;
}
