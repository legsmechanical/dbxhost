/* tests/test_audio_export.c — an Audio clip as the Ableton export reads it
 * (`tN_cM_au_export`):
 *   1. a Loop clip describes itself: rate, frames, where its window starts,
 *      Tempo, Pitch / Detune / Gain, and its sample's path in the project;
 *   2. a Slice clip is rendered offline to a WAV one cycle long at the project
 *      tempo, each chop on its step playing its own frames, silence after it;
 *   3. a chop sounding over the loop point is heard at the start (the
 *      sequence plays twice and the second pass is kept);
 *   4. no sample: no line. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, 1 s: frame i holds 1 + i % 30000 (never 0, so
 * silence is told from the ramp's start) */
static void write_ramp(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(1 + i % 30000));
    fclose(f);
}

static int wait_loaded(hx_t *h, int t, int c) {
    char k[32], b[512];
    int i, st = 1;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    for (i = 0; i < 3000; i++) {
        hx_render(h, 1);
        if (hx_get_param(h, k, b, sizeof b) > 0) sscanf(b, "%d", &st);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

/* the WAV's left channel, frames counted from its data */
static int16_t *read_wav(const char *path, uint32_t *frames, uint32_t *rate, int *ch) {
    FILE *f = fopen(path, "rb");
    uint8_t hd[44];
    if (!f || fread(hd, 1, 44, f) != 44) { if (f) fclose(f); return NULL; }
    *ch = hd[22] | hd[23] << 8;
    *rate = (uint32_t)hd[24] | (uint32_t)hd[25] << 8 | (uint32_t)hd[26] << 16 | (uint32_t)hd[27] << 24;
    uint32_t data = (uint32_t)hd[40] | (uint32_t)hd[41] << 8 | (uint32_t)hd[42] << 16 | (uint32_t)hd[43] << 24;
    *frames = data / (uint32_t)(*ch * 2);
    int16_t *all = malloc(data), *l = malloc(*frames * sizeof(int16_t));
    uint32_t got = (uint32_t)fread(all, 1, data, f), i;
    fclose(f);
    if (got != data) { free(all); free(l); return NULL; }
    for (i = 0; i < *frames; i++) l[i] = all[i * (uint32_t)*ch];
    free(all);
    return l;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[300], b[1024];
    int st, k;

    snprintf(g_root, sizeof g_root, "/tmp/hx_auexp_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/stage", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p);
    static char stage[300];
    snprintf(stage, sizeof stage, "%s/stage", g_root);
    au_export_dir = stage;

    h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");

    /* ---- 4. no sample: no line ---- */
    HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) <= 0, "an empty Audio clip exported a line");

    /* ---- 1. a Loop clip describes itself ---- */
    snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    st = wait_loaded(h, 4, 0);
    HX_ASSERT(st == 2, "the ramp did not load");
    hx_set_param(h, "t4_au_set_bpm", "0 2400");      /* its 1 s is one bar at 240 */
    hx_set_param(h, "t4_au_set_pitch", "0 -3");
    hx_set_param(h, "t4_au_set_gain", "0 -6");
    HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0, "a Loop clip exported nothing");
    {
        unsigned rate, frames, rs, bpm10, rot, loopt;
        int pitch, detune, gain, revrs, sync, nudge;
        char want[400];
        HX_ASSERT(b[0] == 'L' && sscanf(b, "L %u %u %u %u %d %d %d %d %d %u %d %u",
                  &rate, &frames, &rs, &bpm10, &pitch, &detune, &gain, &revrs, &sync, &rot, &nudge, &loopt) == 12,
                  "the Loop line does not parse");
        HX_ASSERT(rate == 44100 && frames == 44100 && rs == 0, "the Loop line's sample");
        HX_ASSERT(bpm10 == 2400 && pitch == -3 && detune == 0 && gain == -6, "the Loop line's settings");
        HX_ASSERT(loopt == (unsigned)inst->tracks[4].clips[0].length * 24, "the Loop line's length is not the clip's");
        snprintf(want, sizeof want, "|%s/proj/dAVEBOx/samples/ramp.wav", g_root);
        HX_ASSERT(strstr(b, want) && !strcmp(strstr(b, want), want), "the Loop line does not name the project's copy");
    }
    printf("  ok   — a Loop clip describes itself\n");
    hx_set_param(h, "t4_au_set_pitch", "0 0");
    hx_set_param(h, "t4_au_set_gain", "0 0");

    /* ---- 2. a Slice clip renders: chop k on step k, its own frames ---- */
    hx_set_param(h, "t4_au_set_mode", "0 1");         /* Even 16, laid on the 16 steps in order */
    HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'S', "a Slice clip exported no render");
    {
        long fr = 0;
        unsigned span = 0;
        char want[300];
        uint32_t frames, rate;
        int ch;
        HX_ASSERT(sscanf(b, "S %ld %u", &fr, &span) == 2, "the Slice line does not parse");
        snprintf(want, sizeof want, "|%s/au_4_0.wav", stage);
        HX_ASSERT(strstr(b, want) != NULL, "the Slice line does not name its render");
        HX_ASSERT(span == 384, "a 1-bar clip's span is not 384 ticks");
        double bpm = inst->tracks[0].pfx.cached_bpm > 0 ? inst->tracks[0].pfx.cached_bpm : (double)BPM_DEFAULT;
        double fpt = 44100.0 * 60.0 / (bpm * 96.0);
        HX_ASSERT(fr == (long)((double)span * 2 * fpt + 0.5) - (long)((double)span * fpt + 0.5),
                  "the render is not one cycle at the project tempo");
        snprintf(p, sizeof p, "%s/au_4_0.wav", stage);
        int16_t *w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w && frames == (uint32_t)fr && rate == 44100 && ch == 2, "the WAV's header");
        /* each step is 24 ticks; chop k is frames 2756.25k.. of the ramp */
        int bad = 0, loud = 0;
        for (k = 1; k < 16; k++) {
            uint32_t at = (uint32_t)(k * 24 * fpt + 0.5) + 40;
            int want_v = 1 + (int)((44100 * k) / 16 + 40) % 30000;
            if (abs(w[at] - want_v) > 2) bad++;
            /* well after the chop's 2756 frames and its fade: silence */
            uint32_t after = (uint32_t)(k * 24 * fpt + 0.5) + 3200;
            if (24 * fpt > 3400 && w[after] != 0) loud++;
        }
        HX_ASSERT(bad == 0, "a chop did not play its own frames on its step");
        HX_ASSERT(loud == 0, "a one-shot chop sounded past its end");
        free(w);
    }
    printf("  ok   — a Slice clip renders one cycle, each chop on its step\n");

    /* ---- 3. a chop over the loop point sounds at the start ---- */
    {
        uint32_t frames, rate;
        int ch;
        /* the last step's chop held to a 3-step gate on a 16-step clip, in
         * Loop play, so it runs over the loop point into steps 0..1 */
        clip_t *cl = &inst->tracks[4].clips[0];
        int i;
        for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active) cl->notes[i].active = 0;
        clip_compact_notes(cl);
        for (i = 0; i < SEQ_STEPS; i++) { cl->steps[i] = 0; cl->step_note_count[i] = 0; }
        hx_set_param(h, "t4_c0_step_15_toggle", "0");
        HX_ASSERT(cl->note_count == 1, "the one step did not land");
        cl->notes[0].gate = 24 * 3;
        hx_set_param(h, "t4_au_all_play", "0 2");    /* AU_PLAY_LOOP: it sounds for its gate */
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'S', "no render of one step");
        snprintf(p, sizeof p, "%s/au_4_0.wav", stage);
        int16_t *w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w, "no WAV of one step");
        double bpm = inst->tracks[0].pfx.cached_bpm > 0 ? inst->tracks[0].pfx.cached_bpm : (double)BPM_DEFAULT;
        double fpt = 44100.0 * 60.0 / (bpm * 96.0);
        uint32_t stepf = (uint32_t)(24 * fpt + 0.5), from = (uint32_t)(15 * 24 * fpt + 0.5);
        HX_ASSERT(w[from + 10] == 11, "the last step's chop did not start on it");
        /* Loop play holds the chop for its 3-step gate: on through steps 0
         * and 1 of the next pass, so the render's start sounds; released at
         * the gate's end (step 2), silence well after it */
        HX_ASSERT(w[10] != 0 && w[stepf + 10] != 0, "the chop held over the loop point is not at the start");
        HX_ASSERT(w[2 * stepf + 1000] == 0, "the chop sounded past its gate");
        free(w);
    }
    printf("  ok   — the loop point carries what sounds over it\n");

    hx_destroy(h);
    snprintf(b, sizeof b, "rm -rf '%s'", g_root);
    if (system(b)) {}
    printf("PASS test_audio_export\n");
    return 0;
}
