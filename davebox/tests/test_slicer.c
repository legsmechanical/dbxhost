/* tests/test_slicer.c — the SLICER (PAD_MODE_SLICER): one sample and its
 * chops for the whole track, au_store[t][AU_SLC] (Josh, 2026-11-02: "two
 * instruments "audio" and "slicer""). Pinned here:
 *   1. every clip of a Slicer plays the slot's chops; a clip's steps are
 *      chop numbers; another clip's steps play the same chops;
 *   2. Sync Off plays a chop at its own speed, Pitch retunes it by the
 *      project's tempo over the sample's own;
 *   3. a chop edit renumbers the steps of EVERY clip, and one undo step per
 *      chop-editor visit (tN_au_undo_slc) brings back the slot and every
 *      clip's steps; Redo puts the edit back;
 *   4. a pick, None and a Trim on a Slicer are one undo step each; None
 *      keeps every clip's steps; a pick lands as 16 even chops;
 *   5. Trim is a step before chopping: frames a..b into a new file, 16 even
 *      chops over it, the steps kept;
 *   6. a sample over 4 minutes is refused (AU_ERR_LONG), the old one kept;
 *   7. paste: an Audio clip onto a Slicer with no sample (its sample, the
 *      part it plays in 16 even chops laid on the steps in order); refused
 *      onto one that has a sample; a Slicer's clip onto an Audio clip (the
 *      sample into it, the steps gone); Slicer to Slicer is steps only;
 *      nothing crosses with a MIDI track; a cut stays in its kind;
 *   8. leaving a Slicer with "u" is one undo step: Undo brings the Slicer
 *      back — sample, chops, Layout, Conductor switch, every clip's steps;
 *   9. the file: a kind this build does not know is refused (flag 2), an
 *      unknown Sync or Play reads as Off / One, an unknown key is skipped;
 *  10. Purge's list holds the Slicer's sample. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define AUS(t)    (&inst->au_store[(t)][AU_SLC])
#define AUA(t, c) (&inst->au_store[(t)][(c)])

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `secs`: frame i holds 1 + i % 30000 (never 0, so
 * where playback is reads off the sample) */
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
/* a header that says 241 s (a few frames of data: only its length is read
 * for the cap — the loader refuses or reads it whole) */
static void write_long(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100u * 241u, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, 0);
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

static void pick(hx_t *h, int t, int c, const char *file) {
    char k[32], v[400];
    snprintf(k, sizeof k, "t%d_au_pick", t);
    snprintf(v, sizeof v, "%d|%s/src/%s", c, g_root, file);
    hx_set_param(h, k, v);
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL); HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[300];
    HX_ASSERT(h, "create failed");
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root);
    mkdir(p, 0775);
    hx_set_param(h, "t4_convert_to_slicer", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER, "rig: t4 is not a Slicer");
    pick(h, 4, AU_SLC, "ramp.wav");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2, "rig: the ramp did not load");
    return h;
}

/* the active pitches of clip (t,c), in note order */
static int pitches(seq8_instance_t *inst, int t, int c, int *out, int max) {
    clip_t *cl = &inst->tracks[t].clips[c];
    int i, n = 0;
    for (i = 0; i < cl->note_count && n < max; i++) if (cl->notes[i].active) out[n++] = cl->notes[i].pitch;
    return n;
}

static const au_voice_t *chop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400], b[2048];
    static char blob[262144];
    int pit[64], n, i;

    snprintf(g_root, sizeof g_root, "/tmp/hx_slicer_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p, 1.0);
    snprintf(p, sizeof p, "%s/src/ramp2.wav", g_root); write_ramp(p, 2.0);
    snprintf(p, sizeof p, "%s/src/long.wav", g_root); write_long(p);

    /* ==== 1. every clip plays the slot's chops ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(AUS(4)->nslices == 16 && AUS(4)->sl[3].start == 3 * 44100 / 16, "a pick did not cut 16 even chops");
    HX_ASSERT(au_cl(inst, 4, 0) == AUS(4) && au_cl(inst, 4, 9) == AUS(4), "a Slicer's clip does not play its slot");
    HX_ASSERT(au_cl(inst, 3, 0) == AUA(3, 0), "another track's clip resolves to a slot");
    hx_set_param(h, "t4_c2_step_0_toggle", "3");             /* clip C, step 1: chop 4 */
    hx_set_param(h, "t4_launch_clip", "2");
    hx_set_param(h, "transport", "play");
    {
        const au_voice_t *v = NULL;
        for (i = 0; i < 40 && !(v = chop_voice(&inst->au_trk[4])); i++) hx_render(h, 1);
        HX_ASSERT(v && v->slice == 3 && (uint32_t)v->lo == AUS(4)->sl[3].start, "clip C's step did not play the slot's chop 4");
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 60);

    /* ==== 2. Sync Off: its own speed; Pitch: by the tempo over its own ==== */
    {
        const au_voice_t *v;
        hx_set_param(h, "bpm", "120");
        hx_set_param(h, "t4_au_set_bpm", "16 1000");            /* the sample's own: 100 */
        au_note_event(4, 1, 0x90, 100, 0);
        hx_render(h, 1);
        v = chop_voice(&inst->au_trk[4]);
        HX_ASSERT(v && fabs(v->step - 1.0) < 1e-9, "Sync Off: a chop did not play at its own speed");
        hx_render(h, 60);
        hx_set_param(h, "t4_au_set_sync", "16 1");
        HX_ASSERT(AUS(4)->sync == AU_SLC_SYNC_PITCH, "Sync did not go to Pitch");
        au_note_event(4, 1, 0x90, 100, 0);
        hx_render(h, 1);
        v = chop_voice(&inst->au_trk[4]);
        HX_ASSERT(v && fabs(v->step - 1.2) < 1e-9, "Sync Pitch: a chop at 120 over its own 100 is not 1.2x");
        hx_render(h, 60);
        hx_set_param(h, "t4_au_set_sync", "16 2");               /* Snap: parked, not offered */
        HX_ASSERT(AUS(4)->sync == AU_SLC_SYNC_OFF, "a Sync past Pitch was not Off");
        hx_set_param(h, "t4_au_set_sync", "16 0");
    }

    /* ==== 3. a chop edit renumbers every clip; one undo per visit ==== */
    hx_set_param(h, "t4_c0_step_0_toggle", "5");             /* clip A: chop 6 */
    hx_set_param(h, "t4_c5_step_2_toggle", "9");             /* clip F: chop 10 */
    hx_set_param(h, "t4_au_undo_slc", "");                   /* the chop editor opens */
    HX_ASSERT(inst->undo_valid && inst->undo_slc_t == 4, "opening the chop editor took no undo step with the slot");
    {
        uint32_t at = (AUS(4)->sl[2].start + AUS(4)->sl[3].start) / 2;
        snprintf(b, sizeof b, "16 %u", at);
        hx_set_param(h, "t4_au_mark_add", b);                /* a chop inside 3: 4.. move up */
    }
    HX_ASSERT(AUS(4)->nslices == 17, "the marker did not split a chop");
    HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 6, "clip A's chop did not move up with the split");
    HX_ASSERT(pitches(inst, 4, 5, pit, 64) == 1 && pit[0] == 10, "clip F's chop did not move up with the split");
    HX_ASSERT(pitches(inst, 4, 2, pit, 64) == 1 && pit[0] == 4, "clip C's chop did not move up with the split");
    hx_set_param(h, "t4_au_slice_gain", "16 3 -9");          /* the same visit: no new step */
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(AUS(4)->nslices == 16 && AUS(4)->sl[3].gain_db == 0, "undo did not bring the chops back");
    HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 5 && pitches(inst, 4, 5, pit, 64) == 1 && pit[0] == 9,
              "undo did not bring every clip's steps back");
    HX_ASSERT(AUS(4)->smp && AUS(4)->state == 2, "undo of a chop edit lost the loaded sample");
    hx_set_param(h, "redo_restore", "1");
    HX_ASSERT(AUS(4)->nslices == 17 && AUS(4)->sl[3].gain_db == -9 && pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 6,
              "redo did not put the visit's edits back");
    hx_set_param(h, "t4_au_undo_slc", "");
    hx_set_param(h, "t4_au_set_even", "16 16");               /* back to 16 even for what follows */
    hx_set_param(h, "t1_c0_clear", "");                      /* any other step: the slot rides no more */
    HX_ASSERT(inst->undo_slc_t == -1, "a later step still carries the slot");

    /* ==== 4. pick / None / Trim: one step each; None keeps the steps ==== */
    hx_set_param(h, "t4_au_clear", "16");
    HX_ASSERT(!AUS(4)->name[0] && !AUS(4)->smp && AUS(4)->state == 0, "None left the sample");
    HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pitches(inst, 4, 5, pit, 64) == 1, "None took the steps");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp.wav") && AUS(4)->nslices == 16,
              "undo of None did not bring the sample and its chops back");
    pick(h, 4, AU_SLC, "ramp2.wav");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp2.wav") && AUS(4)->nslices == 16 &&
              AUS(4)->sl[1].start == 88200 / 16, "a second pick did not land as 16 even chops");
    HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 6, "a pick changed the steps");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp.wav"), "undo of a pick did not bring the old sample back");

    /* ==== 5. Trim: frames a..b, a new file, 16 even chops, the steps kept ==== */
    hx_set_param(h, "t4_au_edit", "16 0 0 11025 33075");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && strcmp(AUS(4)->name, "ramp.wav") && AUS(4)->smp->frames == 22050,
              "Trim did not cut the file to a..b");
    HX_ASSERT(AUS(4)->nslices == 16 && AUS(4)->sl[1].start == 22050 / 16 && AUS(4)->sl[0].start == 0,
              "Trim did not chop the result 16 even");
    HX_ASSERT(AUS(4)->smp->pcm[0] == 1 + 11025, "the trimmed file does not start at a");
    HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 6, "Trim changed the steps");
    hx_set_param(h, "undo_restore", "1");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp.wav") && AUS(4)->smp->frames == 44100,
              "undo of a Trim did not bring the untrimmed file back");
    hx_set_param(h, "t4_au_edit", "16 0 0 0 44100");         /* the whole file: nothing to trim */
    HX_ASSERT(AUS(4)->state == 2 && !strcmp(AUS(4)->name, "ramp.wav"), "a Trim of the whole file did something");
    hx_set_param(h, "t4_au_edit", "16 0 0");                 /* a Slicer's Trim needs its frames */
    HX_ASSERT(AUS(4)->state == 2 && !strcmp(AUS(4)->name, "ramp.wav"), "a Trim with no frames did something");

    /* ==== 6. over 4 minutes: refused, the old sample kept ==== */
    pick(h, 4, AU_SLC, "long.wav");
    HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 3 || (AUS(4)->err == AU_ERR_LONG), "a 241 s file was not refused");
    HX_ASSERT(AUS(4)->err == AU_ERR_LONG, "the refusal is not AU_ERR_LONG");
    hx_destroy(h);

    /* ==== 7. paste ==== */
    {
        h = rig(); inst = (seq8_instance_t *)h->inst;
        /* t2: Audio, the 2 s ramp in clip A, Warp; t6: a Slicer, no sample */
        hx_set_param(h, "t2_convert_to_audio", "");
        pick(h, 2, 0, "ramp2.wav");
        HX_ASSERT(wait_loaded(h, 2, 0) == 2, "paste: the Audio clip's pick");
        hx_set_param(h, "t2_au_set_bpm", "0 1200");              /* 2 s: one bar at 120 */
        hx_set_param(h, "t2_au_set_gain", "0 -4");
        hx_set_param(h, "t2_au_set_start", "0 4410");            /* it plays from 0.1 s */
        hx_set_param(h, "t6_convert_to_slicer", "");
        hx_set_param(h, "t6_c3_step_0_toggle", "9");             /* the destination clip has a step */
        hx_set_param(h, "clip_copy", "2 0 6 3");
        HX_ASSERT(!strcmp(AUS(6)->name, "ramp2.wav") && AUS(6)->gain_db == -4 && AUS(6)->bpm10 == 1200 &&
                  AUS(6)->sync == AU_SLC_SYNC_OFF, "Audio -> Slicer: the slot did not take the clip's sample and sound");
        HX_ASSERT(AUS(6)->nslices == 16 && AUS(6)->sl[0].start == 4410, "Audio -> Slicer: chop 1 is not where the clip starts");
        {
            uint32_t L = 4410 + (uint32_t)(16 * 24 * au_fpt_s(AUS(6), AUA(2, 0)->smp) + 0.5);
            if (L > 88200) L = 88200;
            HX_ASSERT(AUS(6)->sl[1].start == 4410 + (L - 4410) / 16, "Audio -> Slicer: the chops are not 16 even over what the clip plays");
        }
        n = pitches(inst, 6, 3, pit, 64);
        HX_ASSERT(n == 16, "Audio -> Slicer: the chops were not laid on the clip's steps");
        for (i = 0; i < 16; i++) HX_ASSERT(pit[i] == AU_NOTE_BASE + i, "Audio -> Slicer: the chops are not in order");
        {
            /* what it plays is 0.1 s short of the bar (Start 4410, the file's
             * end): chop 2 lands where that sixteenth of it falls */
            double P = (88200.0 - 4410.0) / au_fpt_s(AUA(2, 0), AUA(2, 0)->smp);
            HX_ASSERT(inst->tracks[6].clips[3].notes[1].tick == (uint32_t)(P / 16.0 + 0.5) &&
                      inst->tracks[6].clips[3].length == inst->tracks[2].clips[0].length,
                      "Audio -> Slicer: chop 2 is not a sixteenth of the loop in (or the clip is not as long as the loop)");
        }
        HX_ASSERT(wait_loaded(h, 6, AU_SLC) == 2 && AUS(6)->smp == AUA(2, 0)->smp, "Audio -> Slicer: the slot did not load the same sample");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(!AUS(6)->name[0] && pitches(inst, 6, 3, pit, 64) == 1 && pit[0] == 9,
                  "Audio -> Slicer: one undo did not take the paste back (sample and steps)");
        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(!strcmp(AUS(6)->name, "ramp2.wav") && pitches(inst, 6, 3, pit, 64) == 16, "Audio -> Slicer: redo");
        /* onto a Slicer that has a sample: refused */
        hx_set_param(h, "t2_au_set_gain", "0 -1");
        hx_set_param(h, "clip_copy", "2 0 4 1");
        HX_ASSERT(!strcmp(AUS(4)->name, "ramp.wav") && pitches(inst, 4, 1, pit, 64) == 0,
                  "Audio -> Slicer: a paste onto a Slicer with a sample was not refused");
        /* Slicer -> Audio: the sample into the clip, the steps gone */
        hx_set_param(h, "t4_au_set_gain", "16 -3");
        hx_set_param(h, "t4_au_set_sync", "16 1");
        hx_set_param(h, "t2_c5_step_0_toggle", "2");
        hx_set_param(h, "clip_copy", "4 0 2 5");
        HX_ASSERT(!strcmp(AUA(2, 5)->name, "ramp.wav") && AUA(2, 5)->gain_db == -3 && AUA(2, 5)->sync == AU_SYNC_PITCH &&
                  AUA(2, 5)->mode == AU_MODE_LOOP && pitches(inst, 2, 5, pit, 64) == 0,
                  "Slicer -> Audio: the clip did not take the sample (or kept steps)");
        HX_ASSERT(wait_loaded(h, 2, 5) == 2, "Slicer -> Audio: the clip's sample did not load");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(!AUA(2, 5)->name[0], "Slicer -> Audio: undo did not take it back");
        /* Slicer -> Slicer: steps only, the destination's chops */
        hx_set_param(h, "t4_c7_step_3_toggle", "11");
        hx_set_param(h, "clip_copy", "4 7 6 8");
        HX_ASSERT(pitches(inst, 6, 8, pit, 64) == 1 && pit[0] == 11 && !strcmp(AUS(6)->name, "ramp2.wav"),
                  "Slicer -> Slicer: not the steps alone");
        /* MIDI <-> either: nothing */
        hx_set_param(h, "t1_c0_step_0_toggle", "60");
        hx_set_param(h, "clip_copy", "1 0 6 9");
        HX_ASSERT(pitches(inst, 6, 9, pit, 64) == 0, "a MIDI clip pasted onto a Slicer");
        hx_set_param(h, "clip_copy", "6 3 1 4");
        HX_ASSERT(pitches(inst, 1, 4, pit, 64) == 0, "a Slicer's clip pasted onto a MIDI track");
        /* a cut stays in its kind */
        hx_set_param(h, "clip_cut", "2 0 6 10");
        HX_ASSERT(AUA(2, 0)->name[0] && pitches(inst, 6, 10, pit, 64) == 0, "a cut crossed from Audio to a Slicer");
        hx_destroy(h);
    }

    /* ==== 8. leaving a Slicer with "u": one undo step brings it back ==== */
    {
        h = rig(); inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t4_au_layout", "1");
        hx_set_param(h, "t4_au_cond", "1");
        hx_set_param(h, "t4_au_slice_pitch", "16 2 5");
        hx_set_param(h, "t4_c0_step_0_toggle", "2");
        hx_set_param(h, "t4_c9_step_4_toggle", "7");
        hx_set_param(h, "t4_convert_to_drum", "u");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_DRUM && !AUS(4)->name[0], "leave: the Slicer did not go");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER, "leave: undo did not bring the Slicer back");
        HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp.wav") && AUS(4)->sl[2].pitch == 5 &&
                  AUS(4)->nslices == 16, "leave: undo did not bring the sample and chops back");
        HX_ASSERT(inst->au_trk[4].layout == 1 && inst->au_trk[4].cond_on == 1, "leave: undo lost the Layout or the Conductor switch");
        HX_ASSERT(pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == 2 && pitches(inst, 4, 9, pit, 64) == 1 && pit[0] == 7,
                  "leave: undo did not bring every clip's steps back");
        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_DRUM && !AUS(4)->name[0], "leave: redo did not leave again");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER, "leave: a second undo");
        /* Slicer -> Audio is a leave too */
        hx_set_param(h, "t4_convert_to_audio", "u");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO && !AUS(4)->name[0], "leave: Slicer -> Audio");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER && wait_loaded(h, 4, AU_SLC) == 2 && !strcmp(AUS(4)->name, "ramp.wav"),
                  "leave: undo of Slicer -> Audio");
        /* no "u": no step (a later conversion is not undone into) */
        hx_set_param(h, "t4_convert_to_melodic", "1");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_MELODIC_SCALE, "leave: a conversion without u was undone");
        hx_destroy(h);
    }

    /* ==== 9. the file ==== */
    {
        FILE *wf;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        /* a Slicer with no sample still saves (its Layout, its switch) */
        hx_set_param(h, "t6_convert_to_slicer", "");
        hx_set_param(h, "t6_au_layout", "1");
        hx_set_param(h, "bpm", "121");
        n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
        HX_ASSERT(n > 0 && strstr(blob, "\"t6_pm\":4") && strstr(blob, "\"t6_slc\":\"p=0 dt=0 g=0 rv=0 bpm=0 sy=0 sens=50 cond=0 lay=1 n=1|\""),
                  "file: a Slicer with no sample did not save its line");
        /* a chop's sound belongs to its number: past the count it is kept
         * (an Even of more chops later brings it back) */
        hx_set_param(h, "t4_au_set_even", "16 4");
        hx_set_param(h, "t4_au_slice_gain", "16 9 -5");
        hx_set_param(h, "bpm", "122");
        n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
        HX_ASSERT(n > 0 && strstr(blob, "\"t4s9_slc\":\"st=0 en=0 p=0 dt=0 g=-5 ") && !strstr(blob, "\"t4s8_slc\""),
                  "file: a chop's sound past the count was not kept (or a default one was written)");
        /* a Slicer's load shows its progress on any clip's key */
        {
            au_ld_key = 4 * (NUM_CLIPS + 1) + AU_SLC; au_ld_done = 5; au_ld_total = 10;
            hx_get_param(h, "t4_au_progress_3", b, sizeof b);
            HX_ASSERT(!strcmp(b, "5 10"), "a Slicer's load progress does not read on its clip's key");
            hx_get_param(h, "t2_au_progress_3", b, sizeof b);
            HX_ASSERT(!strcmp(b, "0 0"), "another track reads the Slicer's progress");
            au_ld_key = -1; au_ld_done = au_ld_total = 0;
        }
        hx_destroy(h);
        /* unknown Sync / Play read as Off / One; an unknown key is skipped */
        h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":37,\"t4_pm\":4,\"t4_slc\":\"p=3 zz=9 sy=2 n=2 lay=1|ramp.wav\","
                    "\"t4s0_slc\":\"st=0 pl=7 qq=1 g=-2\",\"t4s1_slc\":\"st=22050 pl=1\","
                    "\"t4s2_slc\":\"st=0 g=-4\","
                    "\"t3_pm\":3,\"t3c1_aud\":\"sy=9 g=-5|ramp2.wav\"}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_SLICER && AUS(4)->pitch == 3 && AUS(4)->sync == AU_SLC_SYNC_OFF &&
                  AUS(4)->nslices == 2 && inst->au_trk[4].layout == 1, "file: the Slicer line did not read (or Snap's 2 is not Off)");
        HX_ASSERT(AUS(4)->sl[0].play == AU_PLAY_ONE && AUS(4)->sl[0].gain_db == -2 && AUS(4)->sl[1].play == AU_PLAY_GATE &&
                  AUS(4)->sl[1].start == 22050, "file: an unknown Play is not One, or a chop line did not read");
        HX_ASSERT(AUS(4)->sl[2].play == AU_PLAY_ONE && AUS(4)->sl[2].gain_db == -4,
                  "file: a chop line with no Play is not One (or a chop past the count lost its sound)");
        HX_ASSERT(AUA(3, 1)->sync == AU_SYNC_WARP && AUA(3, 1)->gain_db == -5 && !strcmp(AUA(3, 1)->name, "ramp2.wav"),
                  "file: an unknown Audio Sync is not Warp");
        HX_ASSERT(wait_loaded(h, 4, AU_SLC) == 2 && AUS(4)->nslices == 2, "file: the Slicer's sample did not load (or the load re-chopped it)");
        hx_destroy(h);
        /* a kind this build does not know: refused as a newer build's, untouched */
        h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        hx_set_param(h, "bpm", "133");
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":37,\"bpm\":99,\"t2_pm\":5}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(inst->state_version_mismatch == 2 && inst->tracks[2].pad_mode != 5, "file: pad mode 5 was not refused");
        HX_ASSERT(hx_get_param(h, "bpm", b, sizeof b) > 0 && atoi(b) == 133, "file: a refused file's bpm loaded");
        {
            FILE *chk = fopen(inst->state_path, "r");
            HX_ASSERT(chk, "file: a refused file was deleted");
            if (chk) fclose(chk);
        }
        inst->state_version_mismatch = 0;
        hx_destroy(h);
    }

    /* ==== 10. Purge's list holds the Slicer's sample ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_get_param(h, "au_used", b, sizeof b);
    HX_ASSERT(strstr(b, "ramp.wav\n") != NULL, "au_used does not list the Slicer's sample");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_slicer\n");
    return 0;
}
