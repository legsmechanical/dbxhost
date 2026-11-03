/* Audio and Slicer hold their model whatever way state reaches them — not
 * only through the screens that build it:
 *   - a Slicer has no velocity: a chop enters the chain at one level, so a
 *     DELAY echo's level never follows how hard the pad was hit;
 *   - a Live merge onto a Slicer lays one chop per step;
 *   - a drum-lane key never turns an Audio or Slicer track into a drum track;
 *   - a sample pick lands only on a track that plays samples;
 *   - a file that makes an Audio track the Conductor keeps the Conductor's
 *     notes and lets the samples go. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

static void write_ramp(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(1 + i % 30000));
    fclose(f);
}

static int wait_loaded(hx_t *h, int t, int c) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        if (au_cl(inst, t, c)->state != 1) return au_cl(inst, t, c)->state;
        usleep(1000);
    }
    return au_cl(inst, t, c)->state;
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL); HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[400];
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root);
    mkdir(p, 0775);
    hx_set_param(h, "t4_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/ramp.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2, "rig: the Slicer's sample did not load");
    return h;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400];
    FILE *wf;

    snprintf(g_root, sizeof g_root, "/tmp/hx_sampled_entry_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p, 1.0);

    /* ==== 1. a Slicer's chop enters the chain at one level ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    {
        seq8_track_t *tr = &inst->tracks[4];
        pfx_note_on(inst, tr, 37, 30);
        HX_ASSERT(tr->pfx.active_notes[37].orig_velocity == SEQ_VEL,
                  "a soft pad on a Slicer set the echo level (velocity reached the chain)");
        pfx_note_off(inst, tr, 37);
        pfx_note_on(inst, &inst->tracks[2], 60, 30);
        HX_ASSERT(inst->tracks[2].pfx.active_notes[60].orig_velocity == 30,
                  "a melodic track lost its velocity");
        pfx_note_off(inst, &inst->tracks[2], 60);
    }

    /* ==== 2. a Live merge lays one chop per step on a Slicer ==== */
    {
        int i, n = 0;
        inst->merge_state = MERGE_STATE_CAPTURED;
        inst->merge_tps = TICKS_PER_STEP;
        inst->merge_end_abs = 16 * TICKS_PER_STEP;
        memset(inst->merge_pending_count, 0, sizeof inst->merge_pending_count);
        /* two chops in step 1 (the later wins), one in step 3 */
        inst->merge_pending[4][0].pitch = AU_NOTE_BASE + 2; inst->merge_pending[4][0].tick_at_on = 0;
        inst->merge_pending[4][1].pitch = AU_NOTE_BASE + 5; inst->merge_pending[4][1].tick_at_on = 3;
        inst->merge_pending[4][2].pitch = AU_NOTE_BASE + 7; inst->merge_pending[4][2].tick_at_on = 2 * TICKS_PER_STEP;
        for (i = 0; i < 3; i++) { inst->merge_pending[4][i].vel = 90; inst->merge_pending[4][i].gate = 12; }
        inst->merge_pending_count[4] = 3;
        merge_place(inst, 1);
        {
            clip_t *cl = &inst->tracks[4].clips[1];
            for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active) n++;
            HX_ASSERT(n == 2, "a merge left more than one chop on a Slicer step");
            HX_ASSERT(cl->step_note_count[0] == 1 && cl->step_notes[0][0] == AU_NOTE_BASE + 5,
                      "a merged Slicer step does not hold the later chop");
        }
        inst->merge_state = MERGE_STATE_IDLE;
    }

    /* ==== 3. a lane key leaves a Slicer a Slicer ==== */
    hx_set_param(h, "t4_l0_note_add", "0 100 12");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER, "a drum-lane key turned the Slicer into a drum track");
    HX_ASSERT(au_cl(inst, 4, AU_SLC)->smp != NULL, "a drum-lane key let the Slicer's sample go");

    /* ==== 4. a pick on a melodic track lands nowhere ==== */
    {
        uint16_t len = inst->tracks[2].clips[0].length, tps = inst->tracks[2].clips[0].ticks_per_step;
        snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root);
        hx_set_param(h, "t2_au_pick", p);
        wait_loaded(h, 2, 0);
        HX_ASSERT(inst->au_store[2][0].smp == NULL && inst->au_store[2][0].state == 0,
                  "a pick loaded a sample onto a melodic track");
        HX_ASSERT(inst->tracks[2].clips[0].length == len && inst->tracks[2].clips[0].ticks_per_step == tps,
                  "a pick resized a melodic clip");
    }
    hx_destroy(h);

    /* ==== 5. cndt names an Audio track: a Conductor with its notes, no samples ==== */
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "cp '%s/src/ramp.wav' '%s/proj/dAVEBOx/samples/ramp.wav'", g_root, g_root);
    if (system(p)) {}
    wf = fopen(inst->state_path, "w");
    fprintf(wf, "{\"v\":37,\"cndt\":3,\"t3_pm\":3,\"t3c0_n\":\"0:60:100:24;\","
                "\"t3c0_aud\":\"g=-5|ramp.wav\"}");
    fclose(wf);
    seq8_load_state(inst);
    {
        int i;
        for (i = 0; i < 400; i++) { hx_render(h, 1); usleep(1000); }
    }
    HX_ASSERT(inst->tracks[3].pad_mode == PAD_MODE_CONDUCT, "cndt did not make the track the Conductor");
    HX_ASSERT(inst->tracks[3].clips[0].note_count == 1, "the Conductor lost its notes to the Audio wipe");
    HX_ASSERT(inst->au_store[3][0].smp == NULL && !inst->au_store[3][0].name[0],
              "a Conductor holds an Audio clip's sample");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_sampled_entry_paths\n");
    return 0;
}
