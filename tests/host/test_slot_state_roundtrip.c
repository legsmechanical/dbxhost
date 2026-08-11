/* Round-trip test for shadow_chain_config.json — every per-slot array, at
 * whatever SHADOW_CHAIN_INSTANCES currently is.
 *
 * ⚠ WHY THIS EXISTS, and why it had to be written BEFORE the count moved:
 * shadow_state.c wrote its ten per-slot arrays fully unrolled ("[%f, %f, %f,
 * %f]" with four explicit derefs) and read them back with `sscanf(...) == 4`.
 * At more than four slots the writer emits N values and the reader consumes the
 * first four — and an N-element file still MATCHES, because sscanf stops when
 * its format runs out. So slots 4+ would silently revert to defaults on every
 * load, with no error, no version mismatch, and no file that fails to parse.
 * There is no count at which that breaks loudly, which is exactly why a test
 * has to hold the line instead.
 *
 * The test is deliberately count-agnostic: it fills every slot with a distinct
 * value derived from its index, saves, zeroes the live state, loads, and
 * demands every slot come back. Written and proven to PASS at 4 (so it is known
 * to exercise the real path, not vacuously succeed), and it is what makes the
 * bump to 8 safe.
 *
 * Built with the paths header's include guard pre-defined so the config file
 * lands in a temp dir rather than /data/UserData — see the Makefile recipe.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <unistd.h>

#include "shadow_constants.h"
#include "shadow_chain_mgmt.h"
#include "shadow_state.h"

/* --- the pieces shadow_state.c expects the rest of the host to provide --- */
shadow_chain_slot_t shadow_chain_slots_test[SHADOW_CHAIN_INSTANCES];
int solo_count_test = 0;
float shadow_send_return_level[2] = { 0.0f, 0.0f };
float shadow_send_a_to_b_level = 0.0f;
int shadow_per_set_config_loaded = 0;

static void test_log(const char *msg) { (void)msg; }

static int failures = 0;
#define CHECK(cond, fmt, ...) do { \
    if (!(cond)) { printf("  FAIL — " fmt "\n", ##__VA_ARGS__); failures++; } \
} while (0)

/* Distinct, index-derived values: if the reader aliases or truncates, the
 * survivor is another slot's value or the default — both visibly wrong. */
static float f_vol(int s)   { return 0.10f + 0.07f * (float)s; }
static float f_synth(int s) { return 0.20f + 0.05f * (float)s; }
static float f_senda(int s) { return 0.30f + 0.04f * (float)s; }
static float f_sendb(int s) { return 0.40f + 0.03f * (float)s; }
static int   i_chan(int s)  { return s % 16; }
static int   i_fwd(int s)   { return (s % 3) - 2; }      /* covers -2/-1/0 */
static int   i_tr(int s)    { return (s % 5) - 2; }
static int   i_muted(int s) { return (s & 1); }
static int   i_solo(int s)  { return ((s >> 1) & 1); }

static int near(float a, float b) { return fabsf(a - b) < 0.002f; }

/* A distinct value in every slot, every array. */
static void fill_slots(void)
{
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        shadow_chain_slot_t *sl = &shadow_chain_slots_test[s];
        memset(sl, 0, sizeof(*sl));
        sl->volume          = f_vol(s);
        sl->synth_volume    = f_synth(s);
        sl->send_a          = f_senda(s);
        sl->send_b          = f_sendb(s);
        sl->channel         = i_chan(s);
        sl->forward_channel = i_fwd(s);
        sl->transpose       = i_tr(s);
        sl->muted           = i_muted(s);
        sl->soloed          = i_solo(s);
    }
    shadow_send_return_level[0] = 0.61f;
    shadow_send_return_level[1] = 0.62f;
    shadow_send_a_to_b_level    = 0.63f;
}

/* Wipe to values that are NOT the defaults, so "the loader did nothing" and
 * "the loader restored" cannot look alike. */
static void wipe_slots(void)
{
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        shadow_chain_slot_t *sl = &shadow_chain_slots_test[s];
        memset(sl, 0, sizeof(*sl));
        sl->volume  = -1.0f;
        sl->channel = -99;
    }
    shadow_send_return_level[0] = -1.0f;
    shadow_send_return_level[1] = -1.0f;
    shadow_send_a_to_b_level    = -1.0f;
}

int main(void)
{
    printf("slot-state round trip (SHADOW_CHAIN_INSTANCES = %d):\n",
           SHADOW_CHAIN_INSTANCES);

    state_host_t host = {
        .log = test_log,
        .chain_slots = shadow_chain_slots_test,
        .solo_count = &solo_count_test,
    };
    state_init(&host);

    /* The heal is one-time per install dir, so clear its flag to make this test
     * idempotent — otherwise a second run in the same dir sees the heal already
     * spent and the assertions below become impossible to satisfy. */
    unlink(SCHWUNG_INSTALL_DIR "/mute_solo_reset_v1_done");

    /* ⚠ The load path carries a ONE-TIME HEAL that clears mute/solo, gated on a
     * flag file in the install dir (it repairs slots stuck muted by a removed
     * D-Bus auto-correct). In a fresh install dir — which every run of this test
     * has — the flag is absent, so the heal fires and mute/solo legitimately
     * come back zero. That is correct behaviour, and it cost an hour of chasing
     * a "persistence bug" that was the heal doing its job.
     *
     * So the test drives BOTH paths deliberately: first with the flag absent,
     * asserting the heal clears mute/solo and leaves everything else intact,
     * then with it present, asserting the full round trip. */
    fill_slots();
    shadow_save_state();
    wipe_slots();
    shadow_load_state();
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        CHECK(shadow_chain_slots_test[s].muted == 0,
              "heal: slot %d muted should be cleared, got %d",
              s, shadow_chain_slots_test[s].muted);
        CHECK(shadow_chain_slots_test[s].soloed == 0,
              "heal: slot %d soloed should be cleared, got %d",
              s, shadow_chain_slots_test[s].soloed);
        /* The heal must not touch anything else — it is a mute/solo repair. */
        CHECK(near(shadow_chain_slots_test[s].volume, f_vol(s)),
              "heal: slot %d volume collateral, got %.3f", s,
              shadow_chain_slots_test[s].volume);
    }
    CHECK(solo_count_test == 0, "heal: solo_count should be 0, got %d", solo_count_test);
    CHECK(access(SCHWUNG_INSTALL_DIR "/mute_solo_reset_v1_done", F_OK) == 0,
          "heal: the flag file was not written, so the heal would fire forever");

    /* From here the heal is spent — the ordinary steady-state round trip. */

    fill_slots();
    shadow_save_state();
    wipe_slots();
    shadow_load_state();

    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
        shadow_chain_slot_t *sl = &shadow_chain_slots_test[s];
        CHECK(near(sl->volume, f_vol(s)),
              "slot %d volume: got %.3f want %.3f", s, sl->volume, f_vol(s));
        CHECK(near(sl->synth_volume, f_synth(s)),
              "slot %d synth_volume: got %.3f want %.3f", s, sl->synth_volume, f_synth(s));
        CHECK(near(sl->send_a, f_senda(s)),
              "slot %d send_a: got %.3f want %.3f", s, sl->send_a, f_senda(s));
        CHECK(near(sl->send_b, f_sendb(s)),
              "slot %d send_b: got %.3f want %.3f", s, sl->send_b, f_sendb(s));
        CHECK(sl->channel == i_chan(s),
              "slot %d channel: got %d want %d", s, sl->channel, i_chan(s));
        CHECK(sl->forward_channel == i_fwd(s),
              "slot %d forward_channel: got %d want %d", s, sl->forward_channel, i_fwd(s));
        CHECK(sl->transpose == i_tr(s),
              "slot %d transpose: got %d want %d", s, sl->transpose, i_tr(s));
        CHECK(sl->muted == i_muted(s),
              "slot %d muted: got %d want %d", s, sl->muted, i_muted(s));
        CHECK(sl->soloed == i_solo(s),
              "slot %d soloed: got %d want %d", s, sl->soloed, i_solo(s));
    }
    CHECK(near(shadow_send_return_level[0], 0.61f), "send return A");
    CHECK(near(shadow_send_return_level[1], 0.62f), "send return B");
    CHECK(near(shadow_send_a_to_b_level, 0.63f), "send A->B");

    /* The solo count is DERIVED on load, not stored — a slot flagged soloed
     * must be counted, or solo silences everything after a restore. */
    int want_solo = 0;
    for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) want_solo += i_solo(s);
    CHECK(solo_count_test == want_solo,
          "solo_count: got %d want %d", solo_count_test, want_solo);

    /* MIGRATION: a config written by a build with FEWER slots. The short array
     * must restore the slots it has and leave the rest at their defaults —
     * never alias, never abandon the whole array. This is what makes an
     * already-saved 4-slot set load correctly into an 8-slot build, and it is
     * the behaviour the old `sscanf(...) == 4` reader could not express (it was
     * all-or-nothing at exactly four). Written with two values so the case is
     * exercised at any slot count >= 3. */
    {
        FILE *cf = fopen(SCHWUNG_INSTALL_DIR "/shadow_chain_config.json", "w");
        CHECK(cf != NULL, "migration: could not write a short config");
        if (cf) {
            fprintf(cf, "{\n  \"master_fx\": \"\",\n"
                        "  \"slot_volumes\": [0.250, 0.750],\n"
                        "  \"slot_channels\": [5, 6]\n}\n");
            fclose(cf);
        }
        wipe_slots();
        for (int s = 0; s < SHADOW_CHAIN_INSTANCES; s++) {
            shadow_chain_slots_test[s].volume  = 1.0f;    /* the real default */
            shadow_chain_slots_test[s].channel = s;
        }
        shadow_load_state();
        CHECK(near(shadow_chain_slots_test[0].volume, 0.25f),
              "migration: slot 0 volume got %.3f want 0.250",
              shadow_chain_slots_test[0].volume);
        CHECK(near(shadow_chain_slots_test[1].volume, 0.75f),
              "migration: slot 1 volume got %.3f want 0.750",
              shadow_chain_slots_test[1].volume);
        CHECK(shadow_chain_slots_test[0].channel == 5, "migration: slot 0 channel");
        CHECK(shadow_chain_slots_test[1].channel == 6, "migration: slot 1 channel");
        for (int s = 2; s < SHADOW_CHAIN_INSTANCES; s++) {
            CHECK(near(shadow_chain_slots_test[s].volume, 1.0f),
                  "migration: slot %d volume should keep its default, got %.3f",
                  s, shadow_chain_slots_test[s].volume);
            CHECK(shadow_chain_slots_test[s].channel == s,
                  "migration: slot %d channel should keep its default, got %d",
                  s, shadow_chain_slots_test[s].channel);
        }
    }

    if (failures == 0) {
        printf("  ok   — all %d slots survive save/load, every array\n",
               SHADOW_CHAIN_INSTANCES);
        return 0;
    }
    printf("  %d failure(s)\n", failures);
    return 1;
}
