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

    /* a Slicer: clip C set by address, clip A untouched */
    hx_set_param(h, "t5_c2_pfx_set", "remix_on 1");
    hx_set_param(h, "t5_c2_pfx_set", "remix_type 3");
    hx_set_param(h, "t5_c2_pfx_set", "remix_var 47");      /* ROLL 16 */
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
        HX_ASSERT(!strstr(buf, "\"t2c1_rx"), "a default clip wrote remix keys (not sparse)");
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
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_remix_state\n");
    return 0;
}
