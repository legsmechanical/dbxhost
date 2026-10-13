/* tests/test_groove_engine.c — the groove engine in its late-only form.
 *
 * Swing is now two KINDS of one global groove. test_swing_sweep_golden.c pins
 * that every swing setting still plays exactly when it did; this file pins the
 * parts that sweep cannot see:
 *
 *   - the old names (swing_amt / swing_res) and the new ones (groove_kind /
 *     groove_amt) are two views of one setting, in both directions
 *   - a project saved before the groove existed opens with the same swing
 *   - a new project has a groove chosen and nothing applied
 *   - Off plays straight whatever the amount says
 *   - Timing scales the amount
 *   - a TABLE groove delays the slots it says to, by what it says (early
 *     slots: test_groove_early.c)
 *
 * Timing is compared as a hash of (render block, packet) per event — the same
 * capture the sweep uses. */
#include "harness.h"

static int is_slot_transport(const hx_midi_event *e) {
    return e->kind == HX_MIDI_INTERNAL && e->bytes[0] == 0x0F && e->bytes[1] >= 0xF8;
}

static int geti(hx_t *h, const char *key) {
    char b[32];
    int n = hx_get_param(h, key, b, (int)sizeof(b));
    HX_ASSERT(n > 0, key);
    return atoi(b);
}

typedef void (*setup_fn)(hx_t *h);

/* Track 1, a note on every 1/16 with a short gate, two bars at 120. Returns a
 * hash of when every packet left. */
static int g_ons_only;   /* hash note-ons alone: a table groove ends its notes by another rule than the swings */
static uint64_t timing_of(setup_fn setup) {
    char k[48], v[48];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        hx_set_param(h, k, "12");
    }
    if (setup) setup(h);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 1420);

    uint64_t hsh = 1469598103934665603ULL;
    int n = 0, total = hx_stub_event_count();
    for (int i = 0; i < total; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (is_slot_transport(e)) continue;
        if (g_ons_only && !((e->bytes[1] & 0xF0) == 0x90 && e->bytes[3] > 0)) continue;
        uint8_t rec[8];
        rec[0] = (uint8_t)(e->block & 0xFF); rec[1] = (uint8_t)((e->block >> 8) & 0xFF);
        rec[2] = (uint8_t)((e->block >> 16) & 0xFF); rec[3] = (uint8_t)e->kind;
        memcpy(rec + 4, e->bytes, 4);
        for (int b = 0; b < 8; b++) { hsh ^= rec[b]; hsh *= 1099511628211ULL; }
        n++;
    }
    HX_ASSERT(n >= 30, "the pattern produced almost no events — the comparison means nothing");
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    return hsh;
}

static void s_straight(hx_t *h)   { (void)h; }
static void s_swing16_100(hx_t *h){ hx_set_param(h, "swing_amt", "100"); }
static void s_swing16_50(hx_t *h) { hx_set_param(h, "swing_amt", "50"); }
static void s_swing8_100(hx_t *h) { hx_set_param(h, "swing_amt", "100"); hx_set_param(h, "swing_res", "1"); }
static void s_new_names_8(hx_t *h){ hx_set_param(h, "groove_kind", "2"); hx_set_param(h, "groove_amt", "100"); }
static void s_off_100(hx_t *h)    { hx_set_param(h, "groove_amt", "100"); hx_set_param(h, "groove_kind", "0"); }
static void s_timing_half(hx_t *h){ hx_set_param(h, "groove_amt", "100"); hx_set_param(h, "groove_timing", "50"); }

/* A table that says what Swing 1/16 at full says: two 1/16 slots, the second
 * 12 ticks late. There is no way to load a table yet, so it is set directly. */
static void table_two_slots(hx_t *h, int off_fine_slot1) {
    groove_t *g = &((seq8_instance_t *)h->inst)->groove;
    g->kind = GROOVE_TABLE;
    g->base = 24;
    g->n_slots = 2;
    g->off[0] = 0;
    g->off[1] = (int16_t)off_fine_slot1;
    g->amt = 100;
}
static void s_table_like_swing(hx_t *h) { table_two_slots(h, 12 * GROOVE_FINE); }
static void s_table_early(hx_t *h)      { table_two_slots(h, -12 * GROOVE_FINE); }
static void s_table_half_amt(hx_t *h)   { table_two_slots(h, 24 * GROOVE_FINE);
                                          ((seq8_instance_t *)h->inst)->groove.amt = 50; }
static void s_table_too_late(hx_t *h)   { table_two_slots(h, 20 * GROOVE_FINE); }
static void s_table_empty(hx_t *h) {
    groove_t *g = &((seq8_instance_t *)h->inst)->groove;
    g->kind = GROOVE_TABLE; g->amt = 100;   /* no slots: nothing to play */
}

int main(void) {
    /* ---- a new project: a groove is chosen, nothing is applied ---- */
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create failed");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_16, "a new project starts on Swing 1/16");
        HX_ASSERT(geti(h, "groove_amt") == 0, "…with nothing applied");
        HX_ASSERT(geti(h, "groove_timing") == 100, "Timing defaults to 100");
        HX_ASSERT(geti(h, "groove_quantize") == 0 && geti(h, "groove_random") == 0
                  && geti(h, "groove_velocity") == 0, "the other amounts default to 0");

        /* ---- old names and new names are one setting ---- */
        hx_set_param(h, "swing_amt", "37");
        HX_ASSERT(geti(h, "groove_amt") == 37 && geti(h, "groove_kind") == GROOVE_SWING_16,
                  "swing_amt writes the groove amount");
        hx_set_param(h, "swing_res", "1");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_8, "swing_res 1 selects Swing 1/8");
        HX_ASSERT(geti(h, "swing_amt") == 37, "…and keeps the amount");
        hx_set_param(h, "groove_kind", "1");
        HX_ASSERT(geti(h, "swing_res") == 0, "groove_kind 1 reads back as swing_res 0");
        hx_set_param(h, "groove_amt", "64");
        HX_ASSERT(geti(h, "swing_amt") == 64, "groove_amt reads back as swing_amt");
        hx_set_param(h, "groove_kind", "0");
        HX_ASSERT(geti(h, "swing_amt") == 0, "with the groove Off, swing_amt reads 0");
        HX_ASSERT(geti(h, "groove_amt") == 64, "…while the amount itself is kept");
        hx_set_param(h, "swing_amt", "20");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_16, "setting swing_amt from Off selects a swing");
        hx_set_param(h, "groove_kind", "3");
        HX_ASSERT(geti(h, "groove_kind") != GROOVE_TABLE, "a table kind cannot be selected without a table");
        hx_set_param(h, "groove_amt", "250");
        HX_ASSERT(geti(h, "groove_amt") == 100, "the amount stops at 100");

        /* ---- opening a project with no saved state returns to that ---- */
        hx_set_param(h, "groove_kind", "2");
        hx_set_param(h, "groove_amt", "70");
        hx_set_param(h, "groove_timing", "30");
        hx_set_param(h, "state_load", "00000000-0000-4000-8000-0000067007e0");
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_16 && geti(h, "groove_amt") == 0
                  && geti(h, "groove_timing") == 100,
                  "a project with no saved state opens on Swing 1/16 with nothing applied");
        hx_destroy(h);
    }

    /* ---- state: round trip, and a file from before the groove ---- */
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create failed");
        hx_set_param(h, "swing_amt", "42");
        hx_set_param(h, "swing_res", "1");
        hx_set_param(h, "groove_timing", "80");
        hx_set_param(h, "groove_quantize", "11");
        hx_set_param(h, "groove_random", "22");
        hx_set_param(h, "groove_velocity", "33");
        static char blob[65536];
        int n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0 && (size_t)n < sizeof(blob) - 1, "state_full");
        blob[n] = '\0';
        HX_ASSERT(strstr(blob, "\"_swa\":42") && strstr(blob, "\"_swr\":1"),
                  "the old keys are still written, for a build from before the groove");
        HX_ASSERT(strstr(blob, "\"_gk\":2") && strstr(blob, "\"_ga\":42"), "the new keys are written");
        hx_destroy(h);

        char tmp[256];
        snprintf(tmp, sizeof(tmp), "/tmp/hx_groove_state_%d.json", (int)getpid());

        /* (a) the file as written */
        FILE *wf = fopen(tmp, "w");
        HX_ASSERT(wf && fwrite(blob, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
        fclose(wf);
        h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
        seq8_load_state(inst);
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_8 && geti(h, "groove_amt") == 42,
                  "kind and amount survive a save and load");
        HX_ASSERT(geti(h, "groove_timing") == 80 && geti(h, "groove_quantize") == 11
                  && geti(h, "groove_random") == 22 && geti(h, "groove_velocity") == 33,
                  "the four amounts survive a save and load");
        hx_destroy(h);

        /* (a2) a table kind with no table to go with it opens Off, not as a swing */
        {
            static char t3[65536];
            strcpy(t3, blob);
            char *p = strstr(t3, "\"_gk\":2");
            HX_ASSERT(p, "rig: _gk");
            p[6] = '3';
            wf = fopen(tmp, "w");
            HX_ASSERT(wf && fwrite(t3, 1, strlen(t3), wf) == strlen(t3), "tmp write failed");
            fclose(wf);
            h = hx_create(NULL);
            inst = (seq8_instance_t *)h->inst;
            strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
            seq8_load_state(inst);
            HX_ASSERT(geti(h, "groove_kind") == GROOVE_OFF, "a table kind with no table opens Off");
            hx_destroy(h);
        }

        /* (b) the same file with the new keys cut out: what an older build wrote */
        const char *cut[] = { ",\"_gk\":2", ",\"_ga\":42", ",\"_gt\":80", ",\"_gq\":11",
                              ",\"_gr\":22", ",\"_gv\":33" };
        for (unsigned i = 0; i < sizeof(cut) / sizeof(cut[0]); i++) {
            char *p = strstr(blob, cut[i]);
            HX_ASSERT(p, cut[i]);
            memmove(p, p + strlen(cut[i]), strlen(p + strlen(cut[i])) + 1);
        }
        HX_ASSERT(!strstr(blob, "\"_g"), "the old-format fixture still carries a groove key");
        wf = fopen(tmp, "w");
        HX_ASSERT(wf && fwrite(blob, 1, strlen(blob), wf) == strlen(blob), "tmp write failed");
        fclose(wf);
        h = hx_create(NULL);
        inst = (seq8_instance_t *)h->inst;
        strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
        seq8_load_state(inst);
        remove(tmp);
        HX_ASSERT(geti(h, "groove_kind") == GROOVE_SWING_8, "an old project's swing_res 1 opens as Swing 1/8");
        HX_ASSERT(geti(h, "groove_amt") == 42, "…with its swing amount");
        HX_ASSERT(geti(h, "groove_timing") == 100, "…and Timing at its default");
        hx_destroy(h);
    }

    /* ---- timing ---- */
    uint64_t straight = timing_of(s_straight);
    uint64_t sw16     = timing_of(s_swing16_100);
    uint64_t sw16half = timing_of(s_swing16_50);
    uint64_t sw8      = timing_of(s_swing8_100);
    HX_ASSERT(sw16 != straight && sw8 != straight && sw16 != sw8 && sw16half != sw16
              && sw16half != straight,
              "control: the capture tells straight, the two swings and two amounts apart");

    HX_ASSERT(timing_of(s_new_names_8) == sw8, "groove_kind 2 at 100 plays as swing_res 1 at 100");
    HX_ASSERT(timing_of(s_off_100) == straight, "Off plays straight whatever the amount");
    HX_ASSERT(timing_of(s_timing_half) == sw16half, "Timing 50 at amount 100 plays as amount 50");

    /* A table's note-ONS against the swing's: a table groove keeps every
     * note's length, the swings re-time note-offs by where they land. */
    g_ons_only = 1;
    {
        uint64_t sw16_on = timing_of(s_swing16_100), straight_on = timing_of(s_straight);
        HX_ASSERT(sw16_on != straight_on, "control: note-ons alone tell swing from straight");
        HX_ASSERT(timing_of(s_table_like_swing) == sw16_on,
                  "a table with slot 2 twelve ticks late starts its notes as Swing 1/16 at full does");
        HX_ASSERT(timing_of(s_table_half_amt) == sw16_on,
                  "a table's amount scales its offsets (24 ticks at 50 = 12 ticks)");
        HX_ASSERT(timing_of(s_table_too_late) == sw16_on,
                  "a slot is never more than half a slot late (20 ticks in a 24-tick slot plays as 12)");
        HX_ASSERT(timing_of(s_table_empty) == straight_on, "a table with no slots plays straight");
    }
    g_ons_only = 0;
    /* early slots: test_groove_early.c. Here only that early is not late. */
    HX_ASSERT(timing_of(s_table_early) != straight && timing_of(s_table_early) != sw16,
              "an early slot plays neither on time nor late");

    printf("PASS: test_groove_engine\n");
    return 0;
}
