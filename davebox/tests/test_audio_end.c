/* AN AUDIO CLIP'S END: Start..End IS THE LOOP (Josh, 2026-11-12: "i need it
 * fine like start. and maybe that should just BE knob 3 and we let the loop
 * button gestures handle per bar / per step" · "not every sample we load is
 * going to be a perfect loop. and we need a way to say this is where the loop
 * starts and ends" · fill the clip, the Tempo following: "yes"). K3 sets a
 * Loop clip's End in frames, as fine as Start; the clip's Length stays whole
 * steps, the Loop gestures'. Pinned here:
 *   - au_range ends at End; 0 or past the sample's end means none, the
 *     sample's end itself is an End;
 *   - with an End, Start..End fills the clip exactly (the speed follows,
 *     whatever the Tempo knob says); a new Length refits; the info's Tempo is
 *     the fitted one; without, the Tempo knob's again;
 *   - End stays past Start by a slice, and Start short of End;
 *   - the info read reports End as its last field;
 *   - End is saved (en=) and loaded; a clip with none writes no en key;
 *   - a Trim (au_clip_shift) moves End with the audio and keeps it on the
 *     new file's end;
 *   - a new sample clears it; a Slicer refuses it. */
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
    snprintf(p, sizeof p, "1|%s/src/tone.wav", g_root);
    hx_set_param(h, "t2_au_pick", p);
    HX_ASSERT(wait_loaded(h, 2, 1) == 2, "rig: clip B's sample did not load");
    hx_set_param(h, "t2_au_set_sync", "0 2");          /* Pitch: deterministic in the harness */
    hx_set_param(h, "t2_au_set_sync", "1 2");
    return h;
}
/* The slot's sound over `n` blocks, `skip` blocks after clip c starts playing. */
static uint64_t energy_after(hx_t *h, int c, int skip, int n) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char v[8]; int i; uint64_t e = 0;
    snprintf(v, sizeof v, "%d", c);
    hx_set_param(h, "t2_launch_clip", v);
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 400 && !inst->tracks[2].clip_playing; i++) hx_render(h, 1);
    HX_ASSERT(inst->tracks[2].clip_playing, "the clip never started playing");
    hx_render(h, skip);
    hx_stub_feed_reset(); hx_render(h, n); hx_stub_feed(inst->tracks[2].pfx.slot, NULL, &e);
    hx_set_param(h, "transport", "stop"); hx_render(h, 30);
    return e;
}
static unsigned info_last(hx_t *h, int c) {
    char buf[512], k[32];
    snprintf(k, sizeof k, "t2_au_info_%d", c);
    HX_ASSERT(hx_get_param(h, k, buf, (int)sizeof buf) > 0, "no info read");
    char *bar = strchr(buf, '|'); HX_ASSERT(bar, "the info read has no name"); *bar = 0;
    return (unsigned)strtoul(strrchr(buf, ' ') + 1, NULL, 10);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400];
    uint32_t rs, re;
    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_end_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/tone.wav", g_root); write_tone(p, 4.0);

    h = rig(); inst = (seq8_instance_t *)h->inst;
    au_clip_t *cl = au_cl(inst, 2, 0);
    uint32_t fr = cl->smp->frames;

    /* ==== 1. the range ends at End; 0 and the file's end are none ==== */
    HX_ASSERT(cl->rend == 0, "a new sample has an End");
    hx_set_param(h, "t2_au_set_end", "0 4410");
    HX_ASSERT(cl->rend == 4410, "set_end did not reach the clip");
    au_range(cl, cl->smp, &rs, &re);
    HX_ASSERT(re == 4410, "au_range does not end at End");
    HX_ASSERT(info_last(h, 0) == 4410, "the info read does not report End as its last field");
    hx_set_param(h, "t2_au_set_end", "0 0");
    au_range(cl, cl->smp, &rs, &re);
    HX_ASSERT(cl->rend == 0 && re == fr, "End 0 is not none");
    snprintf(p, sizeof p, "0 %u", (unsigned)fr + 100);
    hx_set_param(h, "t2_au_set_end", p);
    HX_ASSERT(cl->rend == 0, "End past the file's end is not none");
    snprintf(p, sizeof p, "0 %u", (unsigned)fr);
    hx_set_param(h, "t2_au_set_end", p);
    HX_ASSERT(cl->rend == fr, "the file's own end is not an End");

    /* ==== 2. Start..End fills the clip, exactly, whatever the Tempo ==== */
    {
        clip_t *lc = &inst->tracks[2].clips[0];
        double tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
        double L = ((double)lc->loop_start + lc->length) * tps;
        char buf[512];
        hx_set_param(h, "t2_au_set_end", "0 30000");
        hx_set_param(h, "t2_au_set_bpm", "0 900");   /* the knob's Tempo: ignored with an End */
        au_range(cl, cl->smp, &rs, &re);
        HX_ASSERT(re == 30000, "the range does not end at End");
        HX_ASSERT(fabs(au_fpt_s(cl, cl->smp) * L - 30000.0) < 1e-6, "Start..End does not fill the clip exactly");
        HX_ASSERT(fabs(au_span_ticks(cl, cl->smp, rs, re) - (double)lc->length * tps) < 1e-6, "the loop window is not the clip's length");
        /* a new Length refits */
        double f1 = au_fpt_s(cl, cl->smp);
        lc->length /= 2;          /* half the length: twice the frames a tick (doubling here would pass 999.9 BPM) */
        HX_ASSERT(fabs(au_fpt_s(cl, cl->smp) - 2 * f1) < 1e-9, "a new Length did not refit");
        lc->length *= 2;
        /* the info's Tempo is the fitted one */
        double want = 44100.0 * 60.0 / (f1 * PPQN);
        hx_get_param(h, "t2_au_info_0", buf, (int)sizeof buf);
        {   int f = 0; char *q = buf; unsigned b10 = 0;
            while (*q && f < 20) { if (*q == ' ') f++; q++; }
            b10 = (unsigned)strtoul(q, NULL, 10);
            HX_ASSERT(abs((int)b10 - (int)(want * 10 + 0.5)) <= 1, "the info does not report the fitted Tempo"); }
        /* and it plays, end to end: sounding late in the clip */
        HX_ASSERT(energy_after(h, 0, 100, 40) > 0, "a fitted clip is silent");
        /* none: the knob's Tempo again */
        hx_set_param(h, "t2_au_set_end", "0 0");
        HX_ASSERT(fabs(au_fpt_s(cl, cl->smp) - 44100.0 * 60.0 / (90.0 * PPQN)) < 1e-9, "without End the knob's Tempo does not rule");
        hx_set_param(h, "t2_au_set_end", "0 4410");
    }

    /* ==== 3. End past Start by a slice; Start short of End ==== */
    hx_set_param(h, "t2_au_set_start", "0 4400");
    HX_ASSERT(cl->rstart == 4410 - AU_GAP, "Start went past End");
    hx_set_param(h, "t2_au_set_start", "0 1000");
    hx_set_param(h, "t2_au_set_end", "0 500");
    HX_ASSERT(cl->rend == 1000 + AU_GAP, "End went before Start");
    hx_set_param(h, "t2_au_set_end", "0 4410");

    /* ==== 4. saved and loaded: en= on clip A, none on clip B ==== */
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char st[65536]; size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        const char *a = strstr(st, "\"t2c0_aud\":\""), *b = strstr(st, "\"t2c1_aud\":\"");
        HX_ASSERT(a && b, "the Audio clips were not saved");
        const char *ae = strchr(a + 12, '"'), *be = strchr(b + 12, '"');
        HX_ASSERT(memmem(a, (size_t)(ae - a), "en=4410", 7) != NULL, "End saved without en=");
        HX_ASSERT(memmem(b, (size_t)(be - b), "en=", 3) == NULL, "a clip with no End saved an en key");
    }
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(au_cl(inst, 2, 0)->rend == 4410, "reloaded: clip A lost its End");
    HX_ASSERT(au_cl(inst, 2, 1)->rend == 0, "reloaded: clip B has an End");

    /* ==== 5. a Trim moves End with the audio; it stays on the new file's end ==== */
    cl = au_cl(inst, 2, 0);
    cl->rstart = 1000; cl->rend = 4410;
    au_clip_shift(cl, 1000, 100000);
    HX_ASSERT(cl->rstart == 0 && cl->rend == 3410, "a Trim did not move End with the audio");
    au_clip_shift(cl, 0, 3000);
    HX_ASSERT(cl->rend == 3000, "End past the trimmed file's end did not stop on it (the loop's fit lost)");
    hx_destroy(h);

    /* ==== 6. a new sample clears End; a Slicer refuses it ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t2_au_set_end", "0 4410");
    snprintf(p, sizeof p, "%s/src/tone2.wav", g_root); write_tone(p, 2.0);
    snprintf(p, sizeof p, "0|%s/src/tone2.wav", g_root);
    hx_set_param(h, "t2_au_pick", p);
    HX_ASSERT(wait_loaded(h, 2, 0) == 2, "the new sample did not load");
    HX_ASSERT(au_cl(inst, 2, 0)->rend == 0, "a new sample kept the old End");
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t4_convert_to_slicer", "");
    hx_set_param(h, "t4_au_set_end", "16 4410");
    HX_ASSERT(au_cl(inst, 4, AU_SLC)->rend == 0, "a Slicer took End");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_audio_end\n");
    return 0;
}
