/* tests/test_remix_state.c — REMIX's per-clip settings (Remix on, TYPE,
 * setting) on Audio and Slicer clips: set through the bank key (the active
 * clip) and the clip-addressed tN_cC_pfx_set, clamped, saved sparse and
 * reloaded, independent per clip — a Slicer's clips share one sample slot,
 * never their remix. */
#include "harness.h"
#include <sys/stat.h>

static char g_root[256];

int main(void) {
    char p[400];
    hx_t *h; seq8_instance_t *inst;
    snprintf(g_root, sizeof g_root, "/tmp/dbx-remix-state-%d", (int)getpid());
    snprintf(p, sizeof p, "rm -rf '%s' && mkdir -p '%s/proj/dAVEBOx'", g_root, g_root);
    HX_ASSERT(system(p) == 0, "could not make the project dir");

    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t2_convert_to_audio", "");
    hx_set_param(h, "t5_convert_to_slicer", "");
    HX_ASSERT(inst->tracks[2].pad_mode == PAD_MODE_AUDIO && inst->tracks[5].pad_mode == PAD_MODE_SLICER, "rig: track types");

    /* fresh clips: off, TYPE 1, NORMAL 1 */
    HX_ASSERT(!inst->tracks[2].clips[0].pfx_params.rmx_on && !inst->tracks[2].clips[0].pfx_params.rmx_type
              && !inst->tracks[2].clips[0].pfx_params.rmx_var, "a fresh clip is not off / 0 / 0");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_rvel == 1, "a fresh clip's ROLL velocity is not On");

    /* the bank keys: the active clip (A) */
    hx_set_param(h, "t2_remix_on", "1");
    hx_set_param(h, "t2_remix_type", "9");
    hx_set_param(h, "t2_remix_var", "24");                 /* REVERSE 9 */
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_on == 1, "remix_on did not land on the active clip");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_type == 9 && inst->tracks[2].clips[0].pfx_params.rmx_var == 24, "type/var did not land");
    HX_ASSERT(!inst->tracks[2].clips[1].pfx_params.rmx_on, "clip B took clip A's Remix");
    /* clamped */
    hx_set_param(h, "t2_remix_type", "40");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_type == 15, "TYPE not clamped to 15");
    hx_set_param(h, "t2_remix_var", "200");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_var == 79, "setting not clamped to 79");
    hx_set_param(h, "t2_remix_var", "24");
    hx_set_param(h, "t2_remix_type", "9");
    hx_set_param(h, "t2_remix_rvel", "0");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_rvel == 0, "remix_rvel did not land");
    /* a preset sets the dials (REVERSE 9: Shuffle 100, Reverse 50); the dials then the user's */
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_shuf == 100 && inst->tracks[2].clips[0].pfx_params.rmx_rev == 50
              && !inst->tracks[2].clips[0].pfx_params.rmx_roll, "REVERSE 9 did not set its dials");
    hx_set_param(h, "t2_remix_roll", "60");
    hx_set_param(h, "t2_remix_pit", "30");
    hx_set_param(h, "t2_remix_rate", "2");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_roll == 60 && inst->tracks[2].clips[0].pfx_params.rmx_pit == 24
              && inst->tracks[2].clips[0].pfx_params.rmx_rate == 2, "a dial did not land (or Pitch not clamped to 24)");

    /* a Slicer: clip C set by address, clip A untouched */
    hx_set_param(h, "t5_c2_pfx_set", "remix_on 1");
    hx_set_param(h, "t5_c2_pfx_set", "remix_type 3");
    hx_set_param(h, "t5_c2_pfx_set", "remix_var 47");      /* ROLL 16 */
    hx_set_param(h, "t5_c2_pfx_set", "remix_pit -30");     /* bipolar: clamped to -24 */
    /* Order: the arrangement only, the dials kept; Depth saved sparse */
    hx_set_param(h, "t5_c2_pfx_set", "remix_bdep 40");
    hx_set_param(h, "t5_c2_pfx_set", "remix_ord 5");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_var == 5 && inst->tracks[5].clips[2].pfx_params.rmx_bdep == 40,
              "remix_ord / remix_bdep did not land");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_roll == 100, "remix_ord reset the dials (ROLL 16's Roll 100 gone)");
    /* the UI reads Depth from the clip's snapshot, field 54 (found on the device: the
     * format string had no slot for it, so the UI only ever saw the default) */
    {
        char sb[1024]; int f = 0, last = -1; char *p, *save = NULL;
        HX_ASSERT(hx_get_param(h, "t5_c2_pfx_snapshot", sb, sizeof sb) > 0, "no snapshot");
        for (p = strtok_r(sb, " ", &save); p; p = strtok_r(NULL, " ", &save)) { if (f == 54) last = atoi(p); f++; }
        HX_ASSERT(f == 55 && last == 40, "the snapshot does not carry Depth as field 54");
    }
    hx_set_param(h, "t5_c2_pfx_set", "remix_ord 47");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_pit == -24, "a negative Pitch did not land clamped to -24");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_on && inst->tracks[5].clips[2].pfx_params.rmx_type == 3
              && inst->tracks[5].clips[2].pfx_params.rmx_var == 47, "Slicer clip C's remix did not land");
    HX_ASSERT(!inst->tracks[5].clips[0].pfx_params.rmx_on, "Slicer clip A took clip C's Remix");
    HX_ASSERT(inst->state_dirty, "a remix edit did not mark the project dirty");

    /* saved sparse, reloaded */
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char buf[1 << 20]; size_t n;
        HX_ASSERT(f, "no state file");
        n = fread(buf, 1, sizeof buf - 1, f); buf[n] = 0; fclose(f);
        HX_ASSERT(strstr(buf, "\"t2c0_rxo\":1") && strstr(buf, "\"t2c0_rxt\":9") && strstr(buf, "\"t2c0_rxv\":24"), "clip A's remix not saved");
        HX_ASSERT(strstr(buf, "\"t2c0_rxr\":0"), "clip A's ROLL velocity Off not saved");
        HX_ASSERT(strstr(buf, "\"t2c0_rxre\":50") && strstr(buf, "\"t2c0_rxro\":60") && strstr(buf, "\"t2c0_rxpi\":24")
                  && strstr(buf, "\"t2c0_rxra\":2") && !strstr(buf, "\"t2c0_rxsh\""), "clip A's dials not saved sparse");
        HX_ASSERT(!strstr(buf, "\"t2c1_rx"), "a default clip wrote remix keys (not sparse)");
        HX_ASSERT(strstr(buf, "\"t5c2_rxpi\":-24"), "a negative Pitch not saved");
        HX_ASSERT(strstr(buf, "\"t5c2_rxbd\":40") && !strstr(buf, "\"t2c0_rxbd\""), "Depth not saved sparse");
    }
    hx_destroy(h);

    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_on == 1 && inst->tracks[2].clips[0].pfx_params.rmx_type == 9
              && inst->tracks[2].clips[0].pfx_params.rmx_var == 24, "reloaded: Audio clip A's remix lost");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_on && inst->tracks[5].clips[2].pfx_params.rmx_type == 3
              && inst->tracks[5].clips[2].pfx_params.rmx_var == 47, "reloaded: Slicer clip C's remix lost");
    HX_ASSERT(!inst->tracks[5].clips[0].pfx_params.rmx_on, "reloaded: Slicer clip A turned on");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_pit == -24, "reloaded: a negative Pitch lost");
    HX_ASSERT(inst->tracks[5].clips[2].pfx_params.rmx_bdep == 40 && inst->tracks[2].clips[0].pfx_params.rmx_bdep == 100,
              "reloaded: Depth lost (or a default clip's not 100)");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_rvel == 0, "reloaded: clip A's ROLL velocity came back On");
    HX_ASSERT(inst->tracks[2].clips[0].pfx_params.rmx_rev == 50 && inst->tracks[2].clips[0].pfx_params.rmx_roll == 60
              && inst->tracks[2].clips[0].pfx_params.rmx_pit == 24 && inst->tracks[2].clips[0].pfx_params.rmx_rate == 2
              && inst->tracks[2].clips[0].pfx_params.rmx_shuf == 100, "reloaded: clip A's dials lost");
    HX_ASSERT(inst->tracks[2].clips[1].pfx_params.rmx_rvel == 1, "reloaded: a default clip's ROLL velocity is not On");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_remix_state\n");
    return 0;
}
