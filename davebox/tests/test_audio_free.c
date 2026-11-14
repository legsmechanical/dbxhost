/* AN AUDIO CLIP'S FREE MODE (Josh, 2026-11-13: "is there maybe another mode
 * we can do beside one-shot/loop that gives us the flexibility to chagne how a
 * sample plays back irrespective of the sequencer's timing?" · "why not keep
 * sync? it'd basically allow pitch and time to work independently" · "yep").
 * Pinned here:
 *   - Tape (Sync Pitch): one voice from Start on the launch tick, looping
 *     Start..End on its own at Speed x Pitch x Detune — never restarted when
 *     the clip comes round; the Tempo, Bars and the clip's loop window do
 *     not reach it; Speed and Pitch move it at once;
 *   - Warp (else): the stretcher on a clock of its own whose loop is the
 *     region at Speed (cmd.L = cmd.P = the region's ticks), no Shift or
 *     Nudge, Pitch its own; the clock never restarts at the clip's wrap; it
 *     sounds;
 *   - stopping stops it, and the next launch starts again at Start;
 *   - Free goes with Loop or Shot (Josh, 2026-11-14: "free isn't really a clip
 *     mode. it should be available in both loop and one shot"): Shot + Free
 *     plays one pass of Start..End from the launch and the clip stops — the
 *     grid's Shot does not cut it at the clip's end;
 *   - Offset and Nudge reach a Free clip: it starts that far into Start..End
 *     (the Offset at the sample's own Tempo, less the Nudge in time), Tape
 *     and Warp alike;
 *   - saved (fr=1 spd=, with os=1) and loaded; a clip with neither writes neither;
 *   - the info read reports Free (field 29) and Speed (30, per mille);
 *   - a Slicer refuses both keys. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>
#include <math.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
static void write_tone(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)((i / 50) % 2 ? 12000 : -12000));
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
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    hx_set_param(h, "t2_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/tone.wav", g_root);
    hx_set_param(h, "t2_au_pick", p);
    HX_ASSERT(wait_loaded(h, 2, 0) == 2, "rig: clip A's sample did not load");
    hx_set_param(h, "t2_au_set_bpm", "0 1200");
    return h;
}
/* one block, the stretcher serviced first as its thread would */
static void step(hx_t *h) {
    au_warp_service((seq8_instance_t *)h->inst);
    hx_render(h, 1);
}
static void start(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    hx_set_param(h, "t2_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 400 && !inst->au_trk[2].free_on; i++) step(h);
    HX_ASSERT(inst->au_trk[2].free_on, "the Free clip never started");
}
static void stop(hx_t *h) {
    int i;
    hx_set_param(h, "transport", "stop");
    for (i = 0; i < 30; i++) step(h);
}
/* field `i` of clip 0's info read, counted from the first */
static long info_at(hx_t *h, int i) {
    char buf[512], *p = buf;
    HX_ASSERT(hx_get_param(h, "t2_au_info_0", buf, (int)sizeof buf) > 0, "no info read");
    char *bar = strchr(buf, '|'); HX_ASSERT(bar, "the info read has no name"); *bar = 0;
    while (i-- > 0) { p = strchr(p, ' '); HX_ASSERT(p, "the info read is short"); p++; }
    return strtol(p, NULL, 10);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400];
    au_warp_manual = 1;                          /* the stretcher by hand (step) */
    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_free_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/tone.wav", g_root); write_tone(p, 3.0);

    h = rig(); inst = (seq8_instance_t *)h->inst;
    au_clip_t *cl = au_cl(inst, 2, 0);
    au_track_t *at = &inst->au_trk[2];

    /* ==== 1. Tape: its own loop, never restarted by the clip ==== */
    hx_set_param(h, "t2_au_set_start", "0 4410");
    hx_set_param(h, "t2_au_set_end", "0 26460");               /* a 0.5 s region */
    hx_set_param(h, "t2_au_set_sync", "0 2");                  /* Pitch = Tape */
    hx_set_param(h, "t2_au_set_free", "0 1");
    HX_ASSERT(cl->freerun == 1 && cl->shot == 0, "set_free did not reach the clip");
    hx_set_param(h, "t2_au_set_bars", "0 1536");               /* Bars and the Tempo do not reach it */
    start(h);
    au_voice_t *v = au_loop_voice(at);
    HX_ASSERT(v && v->loop && v->lo == 4410 && v->hi == 26460, "Tape: no voice looping Start..End");
    HX_ASSERT(fabs(v->step - 1.0) < 1e-9, "Tape: not the sample's own speed at Speed 100 %");
    {
        /* a bar at 120 = 88200 frames: well past the clip's wrap */
        int i;
        for (i = 0; i < 900; i++) step(h);
        au_voice_t *w = au_loop_voice(at);
        HX_ASSERT(w == v && w->age > 88200 + 1000, "Tape: the voice was started again (the clip's wrap reached it)");
        double want = 4410.0 + fmod((double)w->age * 1.0, 22050.0);
        HX_ASSERT(fabs(w->pos - want) < 2.0, "Tape: not where its own loop puts it");
    }
    hx_set_param(h, "t2_au_set_speed", "0 2000");
    step(h);
    HX_ASSERT(fabs(au_loop_voice(at)->step - 2.0) < 1e-9, "Tape: Speed 200 % did not double the speed at once");
    hx_set_param(h, "t2_au_set_pitch", "0 12");
    step(h);
    HX_ASSERT(fabs(au_loop_voice(at)->step - 4.0) < 1e-6, "Tape: Pitch +12 is not twice the speed on top");
    hx_set_param(h, "t2_au_set_pitch", "0 0");
    hx_set_param(h, "bpm", "90");
    step(h); step(h);
    HX_ASSERT(fabs(au_loop_voice(at)->step - 2.0) < 1e-9, "Tape: the project's tempo moved a Free clip");
    stop(h);
    HX_ASSERT(!au_loop_voice(at) && !at->free_on, "stopping did not stop the Free clip");
    hx_set_param(h, "bpm", "120");
    start(h);
    v = au_loop_voice(at);
    HX_ASSERT(v && v->age < 2000 && v->pos < 4410.0 + 4000.0, "a new launch did not start again at Start");
    printf("  ok   — Tape: Start..End loops on its own at Speed x Pitch, the clip's wrap and the tempo not reaching it\n");
    stop(h);

    /* ==== 2. Warp: the stretcher on its own clock ==== */
    hx_set_param(h, "t2_au_set_sync", "0 0");
    hx_set_param(h, "t2_au_set_speed", "0 500");
    hx_set_param(h, "t2_au_set_rot", "0 96");                  /* Shift and Nudge do not reach it */
    hx_set_param(h, "t2_au_set_nudge", "0 100");
    hx_set_param(h, "t2_au_set_pitch", "0 7");
    start(h);
    {
        au_warper_t *X = (au_warper_t *)inst->au_warper;
        au_warp_t *W = X->trk[2];
        double fpt = 44100.0 * 60.0 / (120.0 * PPQN);
        double P = 22050.0 * 44100.0 / (0.5 * 44100.0 * fpt);   /* the region's ticks at Speed 50 % */
        uint64_t e = 0;
        int i;
        HX_ASSERT(!au_loop_voice(at), "Warp: a voice is playing too");
        HX_ASSERT(W->cmd.run && fabs(W->cmd.L - P) < 1e-6 && fabs(W->cmd.P - P) < 1e-6,
                  "Warp: the stretcher's loop is not the region at Speed");
        HX_ASSERT(W->cmd.rs == 4410 && W->cmd.re == 26460, "Warp: not Start..End");
        HX_ASSERT(W->cmd.rot == 0.0 && W->cmd.nud == 0.0, "Warp: Shift or Nudge reached it");
        HX_ASSERT(fabs(W->cmd.pitch - pow(2.0, 7.0 / 12.0)) < 1e-6, "Warp: Pitch is not its own");
        double ph0 = at->free_ph;
        for (i = 0; i < 900; i++) step(h);                     /* past the clip's wrap */
        double want = fmod(ph0 + 900.0 * 128.0 / (fpt * P), 1.0);
        HX_ASSERT(fabs(at->free_ph - want) < 1e-6, "Warp: its clock was moved (the clip's wrap reached it)");
        hx_stub_feed_reset();
        for (i = 0; i < 100; i++) step(h);
        hx_stub_feed(inst->tracks[2].pfx.slot, NULL, &e);
        HX_ASSERT(e > 0, "Warp: a Free clip is silent");
    }
    printf("  ok   — Warp: the stretcher loops the region on its own clock at Speed, its own Pitch, no Shift / Nudge\n");
    stop(h);
    hx_set_param(h, "t2_au_set_rot", "0 0");
    hx_set_param(h, "t2_au_set_nudge", "0 0");
    hx_set_param(h, "t2_au_set_pitch", "0 0");

    /* ==== 3. Free goes with Loop or Shot ==== */
    hx_set_param(h, "t2_au_set_shot", "0 1");
    HX_ASSERT(cl->shot == 1 && cl->freerun == 1, "Shot cleared Free");
    hx_set_param(h, "t2_au_set_free", "0 0");
    HX_ASSERT(cl->shot == 1 && cl->freerun == 0, "Free off cleared Shot");
    hx_set_param(h, "t2_au_set_free", "0 1");
    HX_ASSERT(cl->shot == 1 && cl->freerun == 1, "Free cleared Shot");
    {
        /* one pass of the 22050-frame region, then the clip stops: n blocks of 128 */
        int n;
        double fpt = 44100.0 * 60.0 / (120.0 * PPQN);
        hx_set_param(h, "t2_au_set_sync", "0 2");              /* Tape */
        hx_set_param(h, "t2_au_set_speed", "0 1000");
        start(h);
        for (n = 0; n < 4000 && inst->tracks[2].clip_playing; n++) step(h);
        HX_ASSERT(!inst->tracks[2].clip_playing, "Tape + Shot: the clip never stopped");
        HX_ASSERT(n >= 170 && n <= 174, "Tape + Shot: did not stop after one pass of Start..End");
        for (int i = 0; i < 10; i++) step(h);
        HX_ASSERT(!au_loop_voice(at) && !at->free_on, "Tape + Shot: still sounding after the clip stopped");
        stop(h);
        /* a pass longer than the clip (Speed 10 %: 220500 frames, the clip a
         * bar of 88200): the grid's Shot must not cut it at the clip's end */
        hx_set_param(h, "t2_au_set_speed", "0 100");
        start(h);
        for (n = 0; n < 1000; n++) step(h);
        HX_ASSERT(inst->tracks[2].clip_playing && at->free_on, "Tape + Shot: the clip's end cut a Free pass short");
        for (; n < 4000 && inst->tracks[2].clip_playing; n++) step(h);
        HX_ASSERT(n >= 1720 && n <= 1726, "Tape + Shot: a long pass did not stop at its end");
        stop(h);
        /* Warp: one pass plus the stretcher's lead */
        hx_set_param(h, "t2_au_set_sync", "0 0");
        hx_set_param(h, "t2_au_set_speed", "0 1000");
        start(h);
        for (n = 0; n < 4000 && inst->tracks[2].clip_playing; n++) step(h);
        double want = (22050.0 + AU_WARP_LEAD) / 128.0;
        HX_ASSERT(!inst->tracks[2].clip_playing && fabs(n - want) <= 2.0, "Warp + Shot: did not stop after one pass");
        (void)fpt;
        stop(h);
    }
    hx_set_param(h, "t2_au_set_shot", "0 0");
    {
        /* Offset and Nudge: where a launch starts in Start..End */
        const au_sample_t *sm = cl->smp;
        double off = fmod(48.0 * au_fpt_s(cl, sm), 22050.0), x, d;
        hx_set_param(h, "t2_au_set_sync", "0 2");              /* Tape, Speed 100 %: frames as heard */
        hx_set_param(h, "t2_au_set_rot", "0 48");
        start(h);
        x = au_loop_voice(at)->pos - 4410.0;
        d = fmod(x - off + 22050.0, 22050.0);
        HX_ASSERT(off > 1000.0 && d <= 130.0, "Tape: the Offset did not start it that far into Start..End");
        stop(h);
        hx_set_param(h, "t2_au_set_nudge", "0 100");            /* 100 ms later = 4410 frames back */
        start(h);
        x = au_loop_voice(at)->pos - 4410.0;
        d = fmod(x - (off - 4410.0) + 2 * 22050.0, 22050.0);
        HX_ASSERT(d <= 130.0, "Tape: the Nudge did not move the start");
        stop(h);
        /* Warp: the clock starts at the same place less the lead */
        hx_set_param(h, "t2_au_set_sync", "0 0");
        start(h);
        {
            double fpt = 44100.0 * 60.0 / (120.0 * PPQN), P = 22050.0 / fpt;
            double ph0 = fmod((off - 4410.0) / 22050.0 + 2.0, 1.0);
            double w = fmod(ph0 - AU_WARP_LEAD / (fpt * P) + 128.0 / (fpt * P) + 2.0, 1.0);
            HX_ASSERT(fabs(at->free_ph - w) < 1e-6, "Warp: Offset and Nudge did not set where its clock starts");
        }
        stop(h);
        hx_set_param(h, "t2_au_set_rot", "0 0");
        hx_set_param(h, "t2_au_set_nudge", "0 0");
        hx_set_param(h, "t2_au_set_speed", "0 500");
    }
    printf("  ok   — Free goes with Loop or Shot (Shot: one pass, then the clip stops); Offset and Nudge reach it\n");

    /* ==== 4. the info read ==== */
    HX_ASSERT(info_at(h, 29) == 1 && info_at(h, 30) == 500, "the info read does not report Free / Speed");
    hx_set_param(h, "t2_au_set_speed", "0 1000");
    HX_ASSERT(cl->speed_pm == 0 && info_at(h, 30) == 1000, "Speed 100 % is not the default");
    hx_set_param(h, "t2_au_set_speed", "0 99999");
    HX_ASSERT(cl->speed_pm == AU_SPEED_MAX, "Speed is not held to its range");
    hx_set_param(h, "t2_au_set_speed", "0 10");
    HX_ASSERT(cl->speed_pm == 10, "Speed 1 % refused (Josh, 2026-11-13: \"can we make speed minimum lower?\")");
    hx_set_param(h, "t2_au_set_speed", "0 5");
    HX_ASSERT(cl->speed_pm == AU_SPEED_MIN && AU_SPEED_MIN == 10, "Speed below 1 % is not held at 1 %");
    {
        /* Warp at 1 %: still sounding (the stretcher at its slowest) */
        uint64_t e = 0;
        int i;
        hx_set_param(h, "t2_au_set_sync", "0 0");
        start(h);
        for (i = 0; i < 200; i++) step(h);
        hx_stub_feed_reset();
        for (i = 0; i < 200; i++) step(h);
        hx_stub_feed(inst->tracks[2].pfx.slot, NULL, &e);
        HX_ASSERT(e > 0, "Warp at 1 % is silent");
        stop(h);
    }
    hx_set_param(h, "t2_au_set_speed", "0 750");
    printf("  ok   — the info read reports Free and Speed; Speed goes down to 1 %%, and Warp sounds there\n");

    /* ==== 5. saved and loaded ==== */
    hx_set_param(h, "t2_au_set_shot", "0 1");                  /* Free with Shot */
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char st[65536]; size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        const char *a = strstr(st, "\"t2c0_aud\":\"");
        HX_ASSERT(a, "the Audio clip was not saved");
        const char *ae = strchr(a + 12, '"');
        HX_ASSERT(memmem(a, (size_t)(ae - a), "fr=1", 4) != NULL, "Free saved without fr=1");
        HX_ASSERT(memmem(a, (size_t)(ae - a), "spd=750", 7) != NULL, "Speed saved without spd=");
        HX_ASSERT(memmem(a, (size_t)(ae - a), "os=1", 4) != NULL, "Free with Shot saved without os=1");
    }
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(au_cl(inst, 2, 0)->freerun == 1 && au_cl(inst, 2, 0)->speed_pm == 750, "reloaded: Free or Speed lost");
    HX_ASSERT(au_cl(inst, 2, 0)->shot == 1, "reloaded: Free with Shot lost the Shot");
    au_cl(inst, 2, 0)->freerun = 0; au_cl(inst, 2, 0)->speed_pm = 0; au_cl(inst, 2, 0)->shot = 0;
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char st[65536]; size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        const char *a = strstr(st, "\"t2c0_aud\":\"");
        HX_ASSERT(a, "the Audio clip was not saved");
        const char *ae = strchr(a + 12, '"');
        HX_ASSERT(!memmem(a, (size_t)(ae - a), "fr=", 3) && !memmem(a, (size_t)(ae - a), "spd=", 4),
                  "a clip that is not Free saved fr= or spd=");
    }
    /* a clip with only Free is still saved */
    au_cl(inst, 2, 5)->freerun = 1;
    HX_ASSERT(!au_clip_default(au_cl(inst, 2, 5)), "a clip with only Free counts as default (not saved)");
    printf("  ok   — Free and Speed are saved and loaded\n");

    /* ==== 6. Offset: saved as `of`, where in the sample the clip starts
     * (Josh, 2026-11-13: step 1 plays from it); an older file's `sh` was
     * where in the clip the sample started, so it loads as the loop minus
     * it ==== */
    {
        static char st[65536], st2[65536];
        const clip_t *lc0 = &inst->tracks[2].clips[0];
        long Lt = (long)lc0->length * (lc0->ticks_per_step ? lc0->ticks_per_step : TICKS_PER_STEP);
        HX_ASSERT(Lt > 96, "the Offset load test expects a clip over a beat");
        hx_set_param(h, "t2_au_set_rot", "0 96");
        seq8_save_state(inst);
        FILE *f = fopen(inst->state_path, "r");
        size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        const char *a = strstr(st, "\"t2c0_aud\":\"");
        HX_ASSERT(a, "the Offset clip was not saved");
        const char *ae = strchr(a + 12, '"');
        HX_ASSERT(memmem(a, (size_t)(ae - a), " of=96", 6) && memmem(a, (size_t)(ae - a), " sh=0 ", 6),
                  "Offset is not saved as of= (with sh= left 0 for an older build)");
        /* reloaded as it was */
        hx_destroy(h);
        h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        seq8_load_state(inst);
        HX_ASSERT(au_cl(inst, 2, 0)->rot == 96, "of=96 did not load as Offset 96");
        /* the same clip as an older build wrote it: sh=96, no of= */
        {
            const char *sh = strstr(a, " sh=0 "), *of = strstr(a, " of=96");
            size_t k = 0;
            HX_ASSERT(sh && of && sh < ae && of < ae, "the saved line");
            memcpy(st2, st, (size_t)(sh - st)); k = (size_t)(sh - st);
            k += (size_t)sprintf(st2 + k, " sh=96 ");
            memcpy(st2 + k, sh + 6, (size_t)(of - (sh + 6))); k += (size_t)(of - (sh + 6));
            strcpy(st2 + k, of + 6);
        }
        hx_destroy(h);                    /* (it saves the project: the older file goes in after) */
        {
            char sp[300];
            snprintf(sp, sizeof sp, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
            f = fopen(sp, "w"); HX_ASSERT(f, "rig: the older file"); fputs(st2, f); fclose(f);
        }
        h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        seq8_load_state(inst);
        HX_ASSERT(au_cl(inst, 2, 0)->rot == (uint32_t)(Lt - 96),
                  "an older file's sh=96 did not load as the clip's loop minus it");
    }
    printf("  ok   — Offset is saved as of=; an older sh= loads the other way round\n");
    hx_destroy(h);

    /* ==== 6. a Slicer refuses both ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t4_convert_to_slicer", "");
    hx_set_param(h, "t4_au_set_free", "16 1");
    hx_set_param(h, "t4_au_set_speed", "16 2000");
    HX_ASSERT(au_cl(inst, 4, AU_SLC)->freerun == 0 && au_cl(inst, 4, AU_SLC)->speed_pm == 0, "a Slicer took Free or Speed");
    printf("  ok   — a Slicer refuses Free and Speed\n");
    hx_destroy(h);

    printf("PASS: test_audio_free\n");
    return 0;
}
