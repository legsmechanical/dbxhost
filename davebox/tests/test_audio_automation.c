/* tests/test_audio_automation.c — an Audio clip's Pitch, Detune, Gain, Revrs
 * and Tempo as AUTOMATION lanes (seq:<t>:au_pitch .. au_bpm).
 *
 * The engine applies them at the tick, like the sequencer's own bank knobs,
 * but onto a LIVE value over the clip's own setting (au_clip_t ov): playback
 * never rewrites what the clip stores. Pinned here:
 *   1. a Gain lane holds the clip live — stored value, dirty flag and remote
 *      revision untouched; the loop voice sounds at the lane's level; the info
 *      read and pa_seq_vals show it; Stop gives the setting back;
 *   2. a Revrs lane turns the loop round at its step; the clip's Revrs stays;
 *   3. a Tempo lane moves the sample's tempo (what Sync follows) live;
 *   4. a hand's setting wins over the live value; a clip switch drops it;
 *   5. a sounding chop follows Pitch, Detune and Gain as they move
 *      (au_voice_follow); a Tempo Pitch loop's speed does not;
 *   6. off-mode: an au_ key on a track that is not Audio does nothing;
 *   7. a live value never travels with a copy or an undo snapshot. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, 2 s of a ramp */
static void write_ramp(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 88200, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}

static int wait_loaded(hx_t *h, int t, int c) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 3000; i++) {
        hx_render(h, 1);
        if (inst->au_clip[t][c].state != 1) return inst->au_clip[t][c].state;
        usleep(1000);
    }
    return inst->au_clip[t][c].state;
}

/* the 14-bit store's value for v on lo..hi (as JS normalises it) */
static int norm(int v, int lo, int hi) { return (int)((double)(v - lo) * 16383.0 / (double)(hi - lo) + 0.5); }

static hx_t *rig(int sync) {
    char p[400];
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "rig: t4 is not Audio");
    snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 0) == 2, "rig: the sample did not load");
    snprintf(p, sizeof p, "0 %d", sync);
    hx_set_param(h, "t4_au_set_sync", p);
    hx_set_param(h, "t4_au_set_bpm", "0 1200");
    return h;
}
/* a lane on t4 clip 0: `v` held from step `from` to the clip's end; rests at `rest` */
static void lane(hx_t *h, const char *key, int lo, int hi, int rest, int from, int v) {
    char b[160];
    snprintf(b, sizeof b, "0 seq:4:%s %d", key, norm(rest, lo, hi));
    hx_set_param(h, "t4_pa_rest", b);
    if (from > 0) {
        snprintf(b, sizeof b, "0 seq:4:%s 0 %d 24 %d 1 0", key, from - 1, norm(rest, lo, hi));
        hx_set_param(h, "t4_pa_hold_write", b);
    }
    snprintf(b, sizeof b, "0 seq:4:%s %d 15 24 %d 1 0", key, from, norm(v, lo, hi));
    hx_set_param(h, "t4_pa_hold_write", b);
}
static void play(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "transport", "play_focus:4:0");
    inst->state_dirty = 0;
}
/* blocks until the playing clip is past `step` */
static void to_step(hx_t *h, int step) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000 && (int)inst->tracks[4].current_step <= step; i++) hx_render(h, 1);
    hx_render(h, 2);
}
static const au_voice_t *loop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}
static int info_field(hx_t *h, int idx) {         /* t4_au_info_0's idx-th number */
    char b[512];
    const char *p = b;
    int i;
    hx_get_param(h, "t4_au_info_0", b, sizeof b);
    for (i = 0; i < idx; i++) { p = strchr(p, ' '); if (!p) return -9999; p++; }
    return atoi(p);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    au_clip_t *cl;
    char p[400], b[2048];

    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_auto_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p);

    /* ==== 1. Gain: live over the clip's own, given back at Stop ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        lane(h, "au_gain", -40, 12, 0, 4, -20);
        play(h);
        uint32_t rev0 = inst->rui_rev;
        to_step(h, 1);
        HX_ASSERT(au_gain(cl) == 0, "gain: the lane's -20 dB is in force before its step");
        to_step(h, 4);
        HX_ASSERT((cl->ov & AU_OV_GAIN) && cl->ov_gain == -20, "gain: the lane's -20 dB is not held live from its step");
        HX_ASSERT(cl->gain_db == 0, "gain: playback rewrote the clip's STORED gain");
        HX_ASSERT(inst->state_dirty == 0 && inst->rui_rev == rev0, "gain: playback dirtied the project / bumped the remote revision");
        const au_voice_t *lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(lv && fabsf(lv->gain - au_db(-20)) < 1e-4f, "gain: the sounding loop is not at the lane's level");
        HX_ASSERT(info_field(h, 9) == -20, "gain: the info read does not show the level that plays");
        hx_get_param(h, "pa_seq_vals", b, sizeof b);
        HX_ASSERT(strstr(b, "4 au_gain -20\n"), "gain: pa_seq_vals does not report the live value");
        hx_set_param(h, "transport", "stop");
        hx_render(h, 20);
        HX_ASSERT(!(cl->ov & AU_OV_GAIN) && cl->gain_db == 0, "gain: Stop did not give the clip's own setting back");
        HX_ASSERT(info_field(h, 9) == 0, "gain: after Stop the info read still shows the lane's value");
        hx_destroy(h);
        printf("  ok   — Gain plays live over the clip's own; nothing stored or dirtied; Stop gives it back\n");
    }

    /* ==== 2. Revrs: the loop turns round at its step ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        lane(h, "au_revrs", 0, 1, 0, 4, 1);
        play(h);
        to_step(h, 2);
        const au_voice_t *lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(lv && lv->step > 0, "revrs: rig — the loop is not playing forwards before the lane's step");
        to_step(h, 5);
        lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(cl->revrs == 0 && (cl->ov & AU_OV_REVRS) && cl->ov_revrs == 1, "revrs: not held live (or stored)");
        HX_ASSERT(lv && lv->step < 0, "revrs: the loop did not turn round at the lane's step");
        hx_destroy(h);
        printf("  ok   — Revrs turns the loop round at its step; the clip's own stays forwards\n");
    }

    /* ==== 3. Tempo: Sync follows the lane's tempo ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        lane(h, "au_bpm", AU_BPM10_MIN, AU_BPM10_MAX, 1200, 4, 2400);
        play(h);
        to_step(h, 2);
        const au_voice_t *lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(lv, "tempo: rig — no loop voice");
        double s0 = lv->step;
        to_step(h, 5);
        lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(cl->bpm10 == 1200 && (cl->ov & AU_OV_BPM) && au_bpm10(cl) >= 2398 && au_bpm10(cl) <= 2402,
                  "tempo: the lane's 240 BPM is not held live (or it was stored)");
        HX_ASSERT(lv && fabs(lv->step / s0 - 0.5) < 0.01,
                  "tempo: Tempo Pitch did not follow — the sample at twice its tempo should play half as fast");
        hx_destroy(h);
        printf("  ok   — Tempo moves the sample's tempo live (Tempo Pitch halves its speed at 2x)\n");
    }

    /* ==== 4. a hand wins; a clip switch drops the live value ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        lane(h, "au_gain", -40, 12, 0, 0, -20);
        play(h);
        to_step(h, 1);
        HX_ASSERT(cl->ov & AU_OV_GAIN, "hand: rig — the lane is not holding Gain");
        hx_set_param(h, "t4_au_set_gain", "0 -5");
        HX_ASSERT(!(cl->ov & AU_OV_GAIN) && au_gain(cl) == -5, "hand: the knob's setting did not take over from the lane");
        cl->ov |= AU_OV_GAIN; cl->ov_gain = -30;                  /* held again */
        hx_set_param(h, "t4_launch_clip", "1");
        for (int i = 0; i < 4000 && inst->tracks[4].active_clip != 1; i++) hx_render(h, 1);
        hx_render(h, 2);
        HX_ASSERT(inst->tracks[4].active_clip == 1, "switch: rig — clip 1 did not take over");
        HX_ASSERT(cl->ov == 0, "switch: a live value stayed on the clip that stopped playing");
        hx_destroy(h);
        printf("  ok   — a hand's setting wins; a clip switch drops the live value\n");
    }

    /* ==== 5. a sounding voice follows; a Tempo Pitch loop's speed does not ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        hx_set_param(h, "t4_au_set_mode", "0 1");
        au_voice_t *v = au_range_on(inst, 4, 0, 0, 0, 44100, 0.5f, 0, 0);
        HX_ASSERT(v, "follow: rig — no chop voice");
        double s0 = v->step;
        float g0 = v->gain;
        cl->ov |= AU_OV_PITCH | AU_OV_DETUNE | AU_OV_GAIN;
        cl->ov_pitch = 12; cl->ov_detune = 0; cl->ov_gain = -6;
        au_voice_follow(inst, 4);
        HX_ASSERT(fabs(v->step / s0 - 2.0) < 1e-6, "follow: a sounding chop did not go up the octave");
        HX_ASSERT(fabsf(v->gain - au_db(-6) * 0.5f) < 1e-5f && fabsf(g0 - 0.5f) < 1e-5f,
                  "follow: a sounding chop's level is not the clip's new gain at its own velocity");
        cl->ov_detune = 50;
        au_voice_follow(inst, 4);
        HX_ASSERT(fabs(v->step / s0 - 2.0 * au_cents(50)) < 1e-6, "follow: Detune did not move the sounding chop");
        cl->ov = 0;
        au_voice_follow(inst, 4);
        HX_ASSERT(fabs(v->step / s0 - 1.0) < 1e-6 && fabsf(v->gain - g0) < 1e-6f, "follow: the chop did not come back");
        /* Tempo Pitch's loop: its speed is the tempo's */
        hx_set_param(h, "t4_au_set_mode", "0 0");
        au_loop_start(inst, 4, 0, 0, 1.25);
        const au_voice_t *lv = loop_voice(&inst->au_trk[4]);
        HX_ASSERT(lv && !lv->fpitch, "follow: a Tempo Pitch loop is marked to follow Pitch");
        cl->ov |= AU_OV_PITCH; cl->ov_pitch = 12;
        au_voice_follow(inst, 4);
        HX_ASSERT(fabs(lv->step - 1.25) < 1e-9, "follow: Pitch moved a Tempo Pitch loop");
        hx_destroy(h);
        printf("  ok   — a sounding chop follows Pitch, Detune and Gain; Tempo Pitch's speed stays the tempo's\n");
    }

    /* ==== 6. off-mode: nothing on a track that is not Audio ==== */
    {
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(!pa_seq_on_mode(&inst->tracks[1], PA_SEQ_IDX_AU), "off-mode: au_pitch is on a melodic track");
        HX_ASSERT(pa_seq_on_mode(&inst->tracks[4], PA_SEQ_IDX_AU + 4), "off-mode: au_bpm is off on an Audio track");
        HX_ASSERT(!strcmp(pa_seq_defs[PA_SEQ_IDX_AU].key, "au_pitch") &&
                  !strcmp(pa_seq_defs[PA_SEQ_IDX_AU + 4].key, "au_bpm"), "table: the au_ keys are not where PA_SEQ_IDX_AU says");
        /* every au_ key: both ends of its range, live, then rest into the clip */
        seq8_track_t *tr = &inst->tracks[4];
        for (int i = PA_SEQ_IDX_AU; i < PA_SEQ_IDX_AU + 5; i++) {
            const pa_seq_def_t *d = &pa_seq_defs[i];
            pa_seq_apply(inst, 4, i, 16383, -1);
            int hi = pa_seq_read(inst, tr, tr->active_clip, i);
            pa_seq_apply(inst, 4, i, 0, -1);
            int lo = pa_seq_read(inst, tr, tr->active_clip, i);
            if (hi != d->max || lo != d->min) {
                fprintf(stderr, "FAIL: %s read %d..%d live, the table says %d..%d\n", d->key, lo, hi, (int)d->min, (int)d->max);
                return 1;
            }
            pa_seq_apply(inst, 4, i, 16383, tr->active_clip);
        }
        cl = &inst->au_clip[4][tr->active_clip];
        HX_ASSERT(cl->ov == 0 && cl->pitch == 24 && cl->detune == 50 && cl->gain_db == 12 && cl->revrs == 1 && cl->bpm10 == 9999,
                  "a rest did not write each field and drop its live value");
        hx_destroy(h);
        printf("  ok   — au_ keys apply on Audio tracks only; each reads back both ends; rest writes the clip\n");
    }

    /* ==== 7. a live value never travels: copy, undo snapshot, restore ==== */
    {
        au_clip_t snap;
        uint8_t on;
        h = rig(AU_SYNC_PITCH); inst = (seq8_instance_t *)h->inst; cl = &inst->au_clip[4][0];
        cl->ov = AU_OV_GAIN; cl->ov_gain = -30;
        au_copy_clip(inst, 4, 0, 4, 2, 0);
        HX_ASSERT(inst->au_clip[4][2].ov == 0, "copy: the live value went with the copy");
        au_undo_snap(inst, &snap, &on, 4, 0);
        HX_ASSERT(on && snap.ov == 0, "undo: the snapshot keeps a live value");
        cl->gain_db = 7;                                        /* changed since, still held live */
        au_undo_restore(inst, &snap, on, 4, 0);
        HX_ASSERT(cl->gain_db == 0 && (cl->ov & AU_OV_GAIN) && cl->ov_gain == -30,
                  "undo: the restore did not take the setting back and leave the playing lane's value");
        hx_destroy(h);
        printf("  ok   — a live value never travels with a copy or an undo snapshot\n");
    }

    snprintf(p, sizeof p, "rm -rf %s", g_root);
    (void)!system(p);
    return 0;
}
