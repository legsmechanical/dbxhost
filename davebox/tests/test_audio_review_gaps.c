/* tests/test_audio_review_gaps.c — Audio-track paths a code review listed as
 * untested (2026-10-31). Each block names the gap it pins:
 *   1. state round trip: a sample name holding `"` and `\`; a hand-set
 *      slice's every field (`t%dc%ds%d_au2`); Shift (`rot`);
 *   2. loader failures: a non-audio file (AU_ERR_FORMAT); a file gone from
 *      samples/ on reload (AU_ERR_OPEN, the name kept for "Missing: name");
 *      no project (AU_ERR_COPY); a failed Normalize keeps the old sample;
 *   3. undo onto a purged file (state 3, no crash); redo after a Trim-New undo;
 *   4. row_copy / row_cut carry Audio clips; undo of a clip_cut restores both;
 *   5. Trim Overwrite reloads a clip on the same file on ANOTHER track;
 *   6. streaming: Vintage across chunk boundaries; a Slice clip of more than
 *      AU_PIN_FULL hand-set slices, each past 32 still playing;
 *   7. solo on another track silences an Audio track's slot feed;
 *   8. the Conductor: Sync Pitch ignores it, Vintage and Warp follow it. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `secs`: frame i holds i % 30000 (where playback is,
 * readable off the sample) */
static void write_ramp_len(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}
/* mono 16-bit 44.1 kHz, 0.5 s of digital silence */
static void write_silent(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 22050, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, 0);
    fclose(f);
}
/* not audio at all */
static void write_junk(const char *path) {
    FILE *f = fopen(path, "wb");
    fputs("this is a text file wearing a .wav name, not RIFF/WAVE\n", f);
    fclose(f);
}

static int info_state(hx_t *h, int t, int c, int *err, char *name) {
    char k[32], b[512];
    int st = -1, e = 0;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    if (hx_get_param(h, k, b, sizeof b) <= 0) return -1;
    sscanf(b, "%d %d", &st, &e);
    if (err) *err = e;
    if (name) { const char *bar = strchr(b, '|'); snprintf(name, 160, "%s", bar ? bar + 1 : ""); }
    return st;
}

/* Render until clip (t,c) is no longer loading (the loader is a thread). */
static int wait_loaded(hx_t *h, int t, int c) {
    int i, st = 1;
    for (i = 0; i < 3000; i++) {
        hx_render(h, 1);
        st = info_state(h, t, c, NULL, NULL);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

/* Let the loader drain (drops / releases are queued requests). */
static void settle(hx_t *h) {
    int i;
    for (i = 0; i < 40; i++) { hx_render(h, 1); usleep(1000); }
}

static void as_recorded(hx_t *h, int t, int c) {
    char k[40], v[16];
    snprintf(v, sizeof v, "%d 2", c);
    snprintf(k, sizeof k, "t%d_au_set_sync", t);
    hx_set_param(h, k, v);
    snprintf(v, sizeof v, "%d 0", c);
    snprintf(k, sizeof k, "t%d_au_set_orig", t);
    hx_set_param(h, k, v);
}

static void set_path(seq8_instance_t *inst) {
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    set_path((seq8_instance_t *)h->inst);
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[4].pad_mode == PAD_MODE_AUDIO, "rig: t4 is not Audio");
    return h;
}

static void pick(hx_t *h, int t, int c, const char *file) {
    char k[32], v[400];
    snprintf(k, sizeof k, "t%d_au_pick", t);
    snprintf(v, sizeof v, "%d|%s/src/%s", c, g_root, file);
    hx_set_param(h, k, v);
}

/* Save the project, then load it into a FRESH instance (as the device's
 * state_load does). Returns the new instance. */
static char g_blob[262144];
static hx_t *save_and_reload(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    FILE *wf;
    int n;
    hx_set_param(h, "bpm", "120");                       /* state_full needs state_dirty */
    n = hx_get_param(h, "state_full", g_blob, (int)sizeof g_blob);
    HX_ASSERT(n > 0 && (size_t)n < sizeof g_blob - 1, "save: state_full failed");
    wf = fopen(inst->state_path, "w");
    HX_ASSERT(wf && fwrite(g_blob, 1, (size_t)n, wf) == (size_t)n, "save: write the state file");
    fclose(wf);
    hx_destroy(h);
    h = hx_create(NULL);
    HX_ASSERT(h, "reload: create failed");
    inst = (seq8_instance_t *)h->inst;
    set_path(inst);
    seq8_load_state(inst);
    return h;
}

static const au_voice_t *chop_voice(const au_track_t *at) {
    int i;
    const au_voice_t *v = NULL;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop && !at->v[i].rel_len) v = &at->v[i];
    return v;
}
static const au_voice_t *loop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}

static int ramp_at(double x) { return (int)((uint32_t)x % 30000); }

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400], name[160];
    int err, i;
    static const char *WEIRD = "q\"b\\s.wav";            /* q"b\s.wav */

    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_gaps_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp_len(p, 1.0);
    snprintf(p, sizeof p, "%s/src/rampb.wav", g_root); write_ramp_len(p, 0.75);
    snprintf(p, sizeof p, "%s/src/gone.wav", g_root); write_ramp_len(p, 0.5);
    snprintf(p, sizeof p, "%s/src/purged.wav", g_root); write_ramp_len(p, 0.6);
    snprintf(p, sizeof p, "%s/src/trimme.wav", g_root); write_ramp_len(p, 1.0);
    snprintf(p, sizeof p, "%s/src/shared.wav", g_root); write_ramp_len(p, 1.0);
    snprintf(p, sizeof p, "%s/src/%s", g_root, WEIRD); write_ramp_len(p, 0.5);
    snprintf(p, sizeof p, "%s/src/silent.wav", g_root); write_silent(p);
    snprintf(p, sizeof p, "%s/src/junk.wav", g_root); write_junk(p);
    snprintf(p, sizeof p, "%s/src/long10.wav", g_root); write_ramp_len(p, 10.0);

    /* ==== 1 + 2b. state round trip; a file gone from samples/ on reload ==== */
    {
        au_clip_t *ac;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        pick(h, 4, 0, WEIRD);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "round trip: the sample named q\"b\\s.wav did not load");
        ac = &inst->au_clip[4][0];
        HX_ASSERT(!strcmp(ac->name, WEIRD), "round trip: the pick did not keep the name q\"b\\s.wav");
        /* a hand set of 3 (Even Off), slice 1 set by hand in every field */
        hx_set_param(h, "t4_au_set_mode", "0 1");
        hx_set_param(h, "t4_au_set_even", "0 0");
        hx_set_param(h, "t4_au_mark_add", "0 7000");
        hx_set_param(h, "t4_au_mark_add", "0 15000");
        HX_ASSERT(ac->even == 0 && ac->nslices == 3 && ac->sl[1].start == 7000 && ac->sl[2].start == 15000,
                  "round trip setup: the hand set is not 3 slices at 0 / 7000 / 15000");
        hx_set_param(h, "t4_au_slice_end", "0 1 12345");
        hx_set_param(h, "t4_au_slice_pitch", "0 1 -7");
        hx_set_param(h, "t4_au_slice_gain", "0 1 -13");
        hx_set_param(h, "t4_au_slice_rev", "0 1 1");
        hx_set_param(h, "t4_au_slice_play", "0 1 2");
        hx_set_param(h, "t4_au_slice_atk", "0 1 37");
        hx_set_param(h, "t4_au_slice_dec", "0 1 1234");
        hx_set_param(h, "t4_au_slice_detune", "0 1 -23");
        hx_set_param(h, "t4_au_set_rot", "0 77");
        {
            au_slice_t *s = &ac->sl[1];
            HX_ASSERT(s->start == 7000 && s->end == 12345 && s->pitch == -7 && s->gain_db == -13 && s->rev == 1 &&
                      s->play == 2 && s->attack_ms == 37 && s->decay_ms == 1234 && s->detune == -23 && ac->rot == 77,
                      "round trip setup: the slice keys did not set slice 2's fields");
        }
        /* clip 1: a file that will be gone from samples/ when the project loads */
        pick(h, 4, 1, "gone.wav");
        HX_ASSERT(wait_loaded(h, 4, 1) == 2, "missing: gone.wav did not load");
        h = save_and_reload(h); inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(strstr(g_blob, "\"t4c0s1_au2\":\"7000 12345 -7 -13 1 2 37 1234 -23\""),
                  "round trip: the saved slice line is not \"7000 12345 -7 -13 1 2 37 1234 -23\"");
        ac = &inst->au_clip[4][0];
        HX_ASSERT(!strcmp(ac->name, WEIRD), "round trip: a sample name holding \" and \\ did not survive the reload");
        {
            au_slice_t *s = &ac->sl[1];
            HX_ASSERT(ac->nslices == 3 && ac->even == 0 && ac->sl[2].start == 15000,
                      "round trip: the hand set's count / Even / slice 3 changed over a reload");
            HX_ASSERT(s->start == 7000 && s->end == 12345 && s->pitch == -7 && s->gain_db == -13 && s->rev == 1 &&
                      s->play == 2 && s->attack_ms == 37 && s->decay_ms == 1234 && s->detune == -23,
                      "round trip: a hand-set slice's fields did not survive a reload exactly");
        }
        HX_ASSERT(ac->rot == 77, "round trip: Shift (rot) did not survive a reload");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && ac->smp, "round trip: the q\"b\\s.wav sample did not load again from samples/");
        hx_destroy(h);

        /* gone.wav deleted from samples/, then the project reloaded */
        snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/gone.wav", g_root);
        HX_ASSERT(unlink(p) == 0, "missing setup: could not delete samples/gone.wav");
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        set_path(inst);
        seq8_load_state(inst);
        HX_ASSERT(wait_loaded(h, 4, 1) == 3, "missing: a sample deleted from samples/ did not fail its load (state 3)");
        info_state(h, 4, 1, &err, name);
        HX_ASSERT(err == AU_ERR_OPEN, "missing: a deleted sample's load is not AU_ERR_OPEN");
        HX_ASSERT(!strcmp(name, "gone.wav") && !inst->au_clip[4][1].smp,
                  "missing: the failed clip lost its name (the UI cannot say \"Missing: gone.wav\")");
        /* au_request_load directly (as an undo does) fails the same way */
        au_request_load(inst, 4, 1);
        HX_ASSERT(wait_loaded(h, 4, 1) == 3 && inst->au_clip[4][1].err == AU_ERR_OPEN &&
                  !strcmp(inst->au_clip[4][1].name, "gone.wav"), "missing: au_request_load of a deleted file");
        hx_destroy(h);
    }

    /* ==== 2. loader failures ==== */
    {
        au_clip_t *ac;
        const au_sample_t *was;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        /* a non-audio file */
        pick(h, 4, 2, "junk.wav");
        HX_ASSERT(wait_loaded(h, 4, 2) == 3, "garbage: a non-audio file did not fail (state 3)");
        info_state(h, 4, 2, &err, NULL);
        HX_ASSERT(err == AU_ERR_FORMAT, "garbage: a non-audio file's error is not AU_ERR_FORMAT");
        HX_ASSERT(!inst->au_clip[4][2].smp, "garbage: a non-audio file left a sample on the clip");
        /* a Normalize that fails (a silent file) keeps the sample it had */
        pick(h, 4, 3, "silent.wav");
        HX_ASSERT(wait_loaded(h, 4, 3) == 2, "silent: the silent file did not load");
        ac = &inst->au_clip[4][3];
        was = ac->smp;
        hx_set_param(h, "t4_au_edit", "3 1 0");                   /* Normalize, a new sample */
        HX_ASSERT(wait_loaded(h, 4, 3) == 2, "silent: a failed Normalize did not leave the clip ready (state 2)");
        HX_ASSERT(ac->smp == was && !strcmp(ac->name, "silent.wav"), "silent: a failed Normalize changed the clip's sample or name");
        HX_ASSERT(ac->err == AU_ERR_SILENT, "silent: a failed Normalize did not say AU_ERR_SILENT");
        snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/silent norm.wav", g_root);
        HX_ASSERT(access(p, F_OK) != 0, "silent: a failed Normalize left a file behind");
        hx_destroy(h);

        /* no project: no state path, so no samples/ */
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        inst->state_path[0] = '\0';
        hx_set_param(h, "t4_convert_to_audio", "");
        pick(h, 4, 0, "ramp.wav");
        HX_ASSERT(info_state(h, 4, 0, &err, NULL) == 3 && err == AU_ERR_COPY,
                  "no project: a pick with no state path is not state 3 / AU_ERR_COPY");
        hx_render(h, 4);
        HX_ASSERT(inst->au_clip[4][0].state == 3 && !inst->au_clip[4][0].smp, "no project: a pick loaded anyway");
        hx_destroy(h);
    }

    /* ==== 3. undo / redo ==== */
    {
        au_clip_t *ac;
        char nt[160];
        h = rig(); inst = (seq8_instance_t *)h->inst;
        ac = &inst->au_clip[4][5];
        /* a snapshot whose file was purged */
        pick(h, 4, 5, "purged.wav");
        HX_ASSERT(wait_loaded(h, 4, 5) == 2, "purged: setup pick");
        pick(h, 4, 5, "rampb.wav");
        HX_ASSERT(wait_loaded(h, 4, 5) == 2 && !strcmp(ac->name, "rampb.wav"), "purged: the second pick");
        settle(h);                                               /* purged.wav let go by the pool */
        snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/purged.wav", g_root);
        HX_ASSERT(unlink(p) == 0, "purged setup: could not delete samples/purged.wav");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 5) == 3, "purged: undo onto a deleted file did not end failed (state 3)");
        HX_ASSERT(ac->err == AU_ERR_OPEN && !strcmp(ac->name, "purged.wav") && !ac->smp,
                  "purged: undo onto a deleted file is not AU_ERR_OPEN with the old name kept");
        hx_render(h, 20);                                         /* and nothing crashes after */
        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 5) == 2 && !strcmp(ac->name, "rampb.wav") && ac->smp,
                  "purged: redo did not bring the second pick back");

        /* redo after a Trim-New undo puts the trimmed sample back */
        ac = &inst->au_clip[4][6];
        pick(h, 4, 6, "trimme.wav");
        HX_ASSERT(wait_loaded(h, 4, 6) == 2, "trim redo: setup pick");
        hx_set_param(h, "t4_au_set_mode", "6 1");
        hx_set_param(h, "t4_au_set_start", "6 4000");
        hx_set_param(h, "t4_au_edit", "6 0 0");                   /* Trim, a new sample */
        HX_ASSERT(wait_loaded(h, 4, 6) == 2 && strcmp(ac->name, "trimme.wav") && ac->rstart == 0,
                  "trim redo: Trim New did not land");
        snprintf(nt, sizeof nt, "%s", ac->name);
        HX_ASSERT(ac->smp->pcm[0] == 4000, "trim redo: the trimmed file does not start at the old Start");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 6) == 2 && !strcmp(ac->name, "trimme.wav") && ac->rstart == 4000,
                  "trim redo: undo did not go back to the untrimmed file");
        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 6) == 2 && !strcmp(ac->name, nt) && ac->rstart == 0,
                  "trim redo: redo did not put the trimmed sample back (name / Start)");
        HX_ASSERT(ac->smp && ac->smp->pcm && ac->smp->pcm[0] == 4000 && !strcmp(ac->smp->name, nt),
                  "trim redo: redo names the trimmed sample but plays other audio");
        hx_destroy(h);
    }

    /* ==== 4. row_copy / row_cut; undo of a clip_cut ==== */
    {
        au_clip_t *a7, *a8, *a9;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        a7 = &inst->au_clip[4][7]; a8 = &inst->au_clip[4][8]; a9 = &inst->au_clip[4][9];
        pick(h, 4, 7, "ramp.wav");
        HX_ASSERT(wait_loaded(h, 4, 7) == 2, "row: setup pick");
        hx_set_param(h, "t4_au_set_gain", "7 -5");
        hx_set_param(h, "row_copy", "7 8");
        HX_ASSERT(!strcmp(a8->name, "ramp.wav") && a8->gain_db == -5, "row_copy: the Audio clip's sample / settings did not copy");
        HX_ASSERT(wait_loaded(h, 4, 8) == 2 && a8->smp == a7->smp, "row_copy: the copy did not load the same sample");
        HX_ASSERT(!strcmp(a7->name, "ramp.wav") && a7->smp, "row_copy: the source row lost its sample");
        hx_set_param(h, "row_cut", "8 9");
        HX_ASSERT(!a8->name[0] && !a8->smp && !strcmp(a9->name, "ramp.wav") && a9->gain_db == -5,
                  "row_cut: the Audio clip's sample did not move");
        HX_ASSERT(wait_loaded(h, 4, 9) == 2 && a9->smp == a7->smp, "row_cut: the moved clip did not load");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 8) == 2 && !strcmp(a8->name, "ramp.wav") && a8->smp && !a9->name[0] && !a9->smp,
                  "row_cut undo: the Audio clip did not go back to its row");

        /* clip_cut between two clips that both hold a sample; undo restores both */
        {
            au_clip_t *a10 = &inst->au_clip[4][10], *a11 = &inst->au_clip[4][11];
            pick(h, 4, 10, "ramp.wav");
            HX_ASSERT(wait_loaded(h, 4, 10) == 2, "cut undo: setup pick 10");
            pick(h, 4, 11, "rampb.wav");
            HX_ASSERT(wait_loaded(h, 4, 11) == 2, "cut undo: setup pick 11");
            hx_set_param(h, "t4_au_set_pitch", "11 4");
            hx_set_param(h, "clip_cut", "4 10 4 11");
            HX_ASSERT(!a10->name[0] && !strcmp(a11->name, "ramp.wav"), "cut undo: the cut did not move clip 10 onto 11");
            HX_ASSERT(wait_loaded(h, 4, 11) == 2, "cut undo: the cut clip did not load");
            hx_set_param(h, "undo_restore", "1");
            HX_ASSERT(wait_loaded(h, 4, 10) == 2 && wait_loaded(h, 4, 11) == 2, "cut undo: the clips did not load after undo");
            HX_ASSERT(!strcmp(a10->name, "ramp.wav") && a10->smp && a10->smp->frames == 44100,
                      "cut undo: the source clip's sample did not come back");
            HX_ASSERT(!strcmp(a11->name, "rampb.wav") && a11->smp && a11->smp->frames == 33075 && a11->pitch == 4,
                      "cut undo: the destination clip's own sample / settings did not come back");
        }
        hx_destroy(h);
    }

    /* ==== 5. Trim Overwrite reloads a clip on the same file on ANOTHER track ==== */
    {
        au_clip_t *b4, *b5;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t5_convert_to_audio", "");
        HX_ASSERT(inst->tracks[5].pad_mode == PAD_MODE_AUDIO, "overwrite: t5 is not Audio");
        b4 = &inst->au_clip[4][0]; b5 = &inst->au_clip[5][0];
        pick(h, 4, 0, "shared.wav");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "overwrite: t4 pick");
        pick(h, 5, 0, "shared.wav");
        HX_ASSERT(wait_loaded(h, 5, 0) == 2 && b4->smp == b5->smp && !strcmp(b5->name, "shared.wav"),
                  "overwrite: the two tracks' clips do not share shared.wav");
        as_recorded(h, 4, 0);
        b4->rstart = 2000; inst->tracks[4].clips[0].length = 4;
        b5->rstart = 3000;
        hx_set_param(h, "t4_au_edit", "0 0 1");                   /* Trim, overwrite */
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(b4->name, "shared.wav") && b4->smp->pcm[0] == 2000,
                  "overwrite: the overwrite did not trim t4's file");
        for (i = 0; i < 600 && (b5->state != 2 || !b5->smp || !b5->smp->pcm || b5->smp->pcm[0] != 2000); i++) {
            hx_render(h, 1); usleep(1000);
        }
        HX_ASSERT(b5->state == 2 && b5->smp == b4->smp && b5->smp->pcm[0] == 2000 && b5->rstart == 1000,
                  "overwrite: a clip on the same file on ANOTHER track did not reload it, shifted by the cut");
        hx_destroy(h);
    }

    /* ==== 7. solo on another track silences the Audio track's output ==== */
    {
        uint64_t en;
        const int16_t *blk;
        int k, loud;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        pick(h, 4, 0, "ramp.wav");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "solo: pick");
        as_recorded(h, 4, 0);
        hx_stub_feed_reset();
        hx_set_param(h, "t4_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
        hx_render(h, 4);
        HX_ASSERT(hx_stub_feed(4, NULL, &en) > 0 && en > 0, "solo setup: the loop fed nothing to slot 4");
        hx_set_param(h, "t1_solo", "1");
        HX_ASSERT(inst->solo[1] && effective_mute(inst, 4), "solo: soloing track 2 does not mute track 5");
        hx_render(h, 3);                                          /* the 64-frame ramp down */
        hx_stub_feed_reset();
        hx_render(h, 10);
        hx_stub_feed(4, NULL, &en);
        HX_ASSERT(en == 0, "solo: soloing another track did not silence the Audio track's output");
        HX_ASSERT(loop_voice(&inst->au_trk[4]), "solo: the loop stopped instead of playing on silently");
        /* soloed too, it sounds again */
        hx_set_param(h, "t4_solo", "1");
        hx_render(h, 3);
        hx_stub_feed_reset();
        hx_render(h, 4);
        blk = hx_stub_feed_last(4);
        for (k = 0, loud = 0; k < 256; k++) if (blk[k]) loud = 1;
        hx_stub_feed(4, NULL, &en);
        HX_ASSERT(en > 0 && loud, "solo: the Audio track soloed with another stayed silent");
        hx_set_param(h, "t1_solo", "0");
        hx_set_param(h, "t4_solo", "0");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 4);
        hx_destroy(h);
    }

    /* ==== 8. the Conductor: Sync Pitch ignores it, Vintage and Warp follow ==== */
    {
        clip_t *cc;
        const au_voice_t *v;
        double up3 = pow(2.0, 3.0 / 12.0), step0, step3;
        h = rig(); inst = (seq8_instance_t *)h->inst;
        pick(h, 4, 0, "ramp.wav");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "conductor: pick");
        hx_set_param(h, "t4_au_set_bpm", "0 2400");               /* its 1 s as one bar at 240: Pitch runs it at half speed */
        hx_set_param(h, "t6_convert_to_conduct", "1");
        HX_ASSERT(inst->conductor_track == 6, "conductor: no Conductor");
        cc = &inst->tracks[6].clips[inst->tracks[6].active_clip];
        hx_set_param(h, "scale_aware", "0");
        cc->cond_resp[4] = 1; cc->cond_when[4] = 0;
        hx_set_param(h, "t4_launch_clip", "0");

        /* Sync Pitch: the loop's speed is the tempo's, with or without the shift */
        hx_set_param(h, "t4_au_set_sync", "0 2");
        conductor_clear_offset(inst);
        hx_set_param(h, "transport", "play");
        hx_render(h, 10);
        v = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(v, "conductor: no Sync Pitch loop voice");
        step0 = v->step;
        hx_set_param(h, "transport", "stop"); hx_render(h, 10);
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 3);
        HX_ASSERT(au_cond_now(inst, 4) == 3, "conductor setup: +3 did not reach track 5");
        hx_set_param(h, "transport", "play");
        hx_render(h, 10);
        v = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(inst->au_trk[4].cond == 3, "conductor: the track did not take the +3 (the Pitch check would prove nothing)");
        HX_ASSERT(v && fabs(v->step - step0) < 1e-9 && v->cond == 0,
                  "conductor: a Sync Pitch loop followed the Conductor (its speed is the tempo's)");
        hx_set_param(h, "transport", "stop"); hx_render(h, 10);

        /* Vintage: each piece plays the Conductor's semitones */
        hx_set_param(h, "t4_au_set_sync", "0 1");
        hx_set_param(h, "t4_au_set_bpm", "0 1200");               /* at the project's tempo: pieces at the sample's own speed */
        conductor_clear_offset(inst);
        hx_set_param(h, "transport", "play");
        hx_render(h, 20);
        v = chop_voice(&inst->au_trk[4]);
        HX_ASSERT(inst->au_trk[4].sync_on && v, "conductor: no Vintage piece sounding");
        step0 = v->step;
        hx_set_param(h, "transport", "stop"); hx_render(h, 10);
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 3);
        hx_set_param(h, "transport", "play");
        hx_render(h, 20);
        v = chop_voice(&inst->au_trk[4]);
        HX_ASSERT(v, "conductor: no Vintage piece sounding with the shift");
        step3 = v->step;
        HX_ASSERT(inst->au_trk[4].cond == 3 && fabs(step3 - step0 * up3) < 1e-6,
                  "conductor: a Vintage loop's pieces did not play the Conductor's +3");
        hx_set_param(h, "transport", "stop"); hx_render(h, 10);

        /* Warp: the stretcher's pitch is the Conductor's */
        hx_set_param(h, "t4_au_set_sync", "0 0");
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 3);   /* a stop let the shift go */
        hx_set_param(h, "transport", "play");
        hx_render(h, 10);
        {
            au_warper_t *X = (au_warper_t *)inst->au_warper;
            HX_ASSERT(X && X->trk[4], "conductor: no Warp stretcher for track 5");
            HX_ASSERT(inst->au_trk[4].cond == 3 && fabs(X->trk[4]->cmd.pitch - up3) < 1e-9,
                      "conductor: a Warp loop's pitch did not take the Conductor's +3");
        }
        hx_set_param(h, "transport", "stop"); hx_render(h, 10);
        hx_destroy(h);
    }

    /* ==== 6. streaming (manual streamer: deterministic) ==== */
    au_stream_manual = 1;
    au_stream_sec = 1;
    {
        const int16_t *blk;
        unsigned u0 = 0, u1 = 0, xx;
        int a, n, silent = 0, k, loud;
        char b[64];
        h = rig(); inst = (seq8_instance_t *)h->inst;
        pick(h, 4, 0, "long10.wav");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "stream: the 10 s ramp did not load");
        HX_ASSERT(inst->au_clip[4][0].smp && !inst->au_clip[4][0].smp->pcm, "stream setup: the 10 s ramp is not streamed");
        /* Vintage at the project's tempo, across several chunk boundaries */
        hx_set_param(h, "t4_au_set_sync", "0 1");
        hx_set_param(h, "t4_au_set_orig", "0 0");
        HX_ASSERT(inst->au_clip[4][0].sync == AU_SYNC_VINTAGE, "stream setup: the clip is not Vintage");
        for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
        hx_get_param(h, "t4_au_stream", b, sizeof b); sscanf(b, "%d %u %u %u", &a, &xx, &xx, &u0);
        hx_stub_feed_reset();
        hx_set_param(h, "t4_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) { au_stream_service(inst); hx_render(h, 1); }
        HX_ASSERT(inst->au_trk[4].sync_on, "stream: the Vintage pieces are not playing");
        for (n = 0; n < 5 * AU_CHUNK / 128; n++) {                 /* 5 chunks' worth of blocks */
            au_stream_service(inst);
            hx_render(h, 1);
            blk = hx_stub_feed_last(4);
            for (k = 0, loud = 0; k < 256; k++) if (blk[k]) loud = 1;
            if (!loud) silent++;
        }
        hx_get_param(h, "t4_au_stream", b, sizeof b); sscanf(b, "%d %u %u %u", &a, &xx, &xx, &u1);
        HX_ASSERT(silent == 0, "stream: a streamed Vintage loop went silent across a chunk boundary");
        HX_ASSERT(u1 == u0, "stream: a streamed Vintage piece waited for a chunk");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 10);
        hx_destroy(h);

        /* Slice with more than AU_PIN_FULL hand-set slices */
        h = rig(); inst = (seq8_instance_t *)h->inst;
        pick(h, 4, 0, "long10.wav");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !inst->au_clip[4][0].smp->pcm, "stream slice: the streamed load");
        hx_set_param(h, "t4_au_set_mode", "0 1");
        hx_set_param(h, "t4_au_set_even", "0 0");
        for (k = 1; k < 40; k++) {
            char v[32];
            snprintf(v, sizeof v, "0 %d", k * 10007 + 123);       /* every start off the 30000 ramp wrap */
            hx_set_param(h, "t4_au_mark_add", v);
        }
        HX_ASSERT(inst->au_clip[4][0].nslices == 40 && inst->au_clip[4][0].even == 0,
                  "stream slice setup: the hand set is not 40 slices");
        for (i = 0; i < AU_STREAM_GRACE + 5; i++) { hx_render(h, 1); au_stream_service(inst); }
        {
            au_sample_t *s = inst->au_clip[4][0].smp;
            int missing = 0, bad = 0, edge_bad = 0, l;
            for (l = AU_PIN_FULL; l < 40; l++) {
                uint32_t st = inst->au_clip[4][0].sl[l].start;
                if (!s->chunk[st >> AU_CHUNK_SHIFT]) missing++;
            }
            HX_ASSERT(missing == 0, "stream slice: a slice past AU_PIN_FULL has no chunk pinned at its start");
            /* Found here, 2026-10-31, and FIXED: a slice past AU_PIN_FULL pinned ONE
             * chunk at its start, so one starting less than a block before that
             * chunk's end ran into the next, unpinned chunk and played silence until
             * the streamer read it — slice 37 here (start 360375, its chunk ends at
             * 360448). au_stream_pin_slice now pins the next chunk for such a start.
             * Every slice past 32, edge or not, must play its own frames at once. */
            for (l = AU_PIN_FULL; l < 40; l++) {
                uint32_t st = inst->au_clip[4][0].sl[l].start;
                int edge = (st & (AU_CHUNK - 1)) + 2 * 128 > AU_CHUNK, wrong;
                unsigned ua = 0, ub = 0;
                hx_get_param(h, "t4_au_stream", b, sizeof b); sscanf(b, "%d %u %u %u", &a, &xx, &xx, &ua);
                hx_stub_feed_reset();
                au_note_event(4, l, 0x90, 100, 0);
                hx_render(h, 1);
                blk = hx_stub_feed_last(4);
                hx_get_param(h, "t4_au_stream", b, sizeof b); sscanf(b, "%d %u %u %u", &a, &xx, &xx, &ub);
                /* past the cut slice's 64-frame fade: this slice's own frames */
                wrong = hx_stub_feed(4, NULL, NULL) < 1 || abs(blk[200] - ramp_at(st + 100)) > 1 ||
                        abs(blk[254] - ramp_at(st + 127)) > 1 || ub != ua;
                if (wrong && edge) edge_bad++;
                else if (wrong) bad++;
                for (i = 0; i < 10; i++) { au_stream_service(inst); hx_render(h, 1); }
            }
            HX_ASSERT(bad == 0, "stream slice: a slice past AU_PIN_FULL did not play its own audio at once (or waited for a chunk)");
            HX_ASSERT(edge_bad == 0, "stream slice: a slice starting near its chunk's end went silent (the next chunk unpinned)");
        }
        hx_destroy(h);
    }

    {
        char cmd[320];
        snprintf(cmd, sizeof cmd, "rm -rf '%s'", g_root);
        if (system(cmd)) { /* best effort */ }
    }
    printf("PASS: test_audio_review_gaps\n");
    return 0;
}
