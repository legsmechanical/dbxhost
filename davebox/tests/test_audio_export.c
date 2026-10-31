/* tests/test_audio_export.c — an Audio clip as the Ableton export reads it
 * (`tN_cM_au_export`):
 *   1. a Loop clip describes itself: rate, frames, where its window starts,
 *      Tempo, Pitch / Detune / Gain, and its sample's path in the project;
 *   2. a Slice clip is rendered offline to a WAV one cycle long at the project
 *      tempo, each chop on its step playing its own frames, silence after it;
 *   3. a chop sounding over the loop point is heard at the start (the
 *      sequence plays twice and the second pass is kept);
 *   4. no sample: no line;
 *   5. a Loop clip on Sync Pitch or Vintage is rendered, as Live has
 *      neither; a Warp clip on Revrs goes as its sample reversed;
 *   6. those renders, and a Slice clip's, match the engine playing the clip. */
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

/* ---- 6. against the engine itself: the clip played live (the transport,
 * the slot feed captured block by block) and its render agree. ---- */
static int16_t g_live[44100 * 7];
/* How many frames of the render differ by more than 8 from the live take's
 * second bar, at the best alignment within +-16 frames. Pitch's voice runs
 * 8 frames apart from the live one (its start against the block). What the
 * sequencer's ticks start live — a Vintage piece, a Slice chop — lands ONE
 * TICK after its grid frame in this harness (measured 2026-10-31: the take
 * agrees exactly a tick on); the render keeps the grid, as Live will, so
 * those are compared a tick later. A Vintage clip whose pieces carry on (AU_JOIN) differs bar
 * to bar live as well, so only one that cuts every piece is compared. */
static int vs_live(int sync, int bpm10, int nudge, int rot) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[300], b[1024];
    uint32_t frames, rate;
    int ch, n, fed, best = 1 << 30, o;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root); hx_set_param(h, "t4_au_pick", p);
    if (wait_loaded(h, 4, 0) != 2) return -1;
    snprintf(b, sizeof b, "0 %d", bpm10); hx_set_param(h, "t4_au_set_bpm", b);
    /* sync -1: a Slice clip, Even 16 laid on its steps */
    if (sync < 0) hx_set_param(h, "t4_au_set_mode", "0 1");
    else { snprintf(b, sizeof b, "0 %d", sync); hx_set_param(h, "t4_au_set_sync", b); }
    if (nudge) { snprintf(b, sizeof b, "0 %d", nudge); hx_set_param(h, "t4_au_set_nudge", b); }
    if (rot) { snprintf(b, sizeof b, "0 %d", rot); hx_set_param(h, "t4_au_set_rot", b); }
    if (hx_get_param(h, "t4_c0_au_export", b, sizeof b) <= 0 || b[0] != (sync < 0 ? 'S' : 'R')) return -1;
    snprintf(p, sizeof p, "%s/au_4_0.wav", au_export_dir);
    int16_t *w = read_wav(p, &frames, &rate, &ch);
    if (!w) return -1;
    int slot = inst->tracks[4].pfx.slot, blocks = (int)(sizeof g_live / sizeof g_live[0]) / 128;
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    fed = hx_stub_feed(slot, NULL, NULL);
    for (n = 0; n < blocks; n++) {
        hx_render(h, 1);
        int f2 = hx_stub_feed(slot, NULL, NULL);
        const int16_t *bl = hx_stub_feed_last(slot);
        for (int k = 0; k < 128; k++) g_live[n * 128 + k] = f2 != fed ? bl[k * 2] : 0;
        fed = f2;
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 20);
    int lag = sync != 2 ? (int)(44100.0 * 60.0 / (120.0 * 96.0) + 0.5) : 0;
    for (o = -16; o <= 16; o++) {
        int bad = 0;
        for (uint32_t i = 0; i < frames; i++) if (abs(g_live[(int)frames + lag + o + (int)i] - w[i]) > 8) bad++;
        if (bad < best) best = bad;
    }
    free(w);
    hx_destroy(h);
    return best;
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
    hx_set_param(h, "t4_au_set_start", "0 1000");
    HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0, "a Loop clip exported nothing");
    {
        unsigned rate, frames, rs, bpm10, rot, loopt;
        int pitch, detune, gain, revrs, sync, nudge;
        char want[400];
        HX_ASSERT(b[0] == 'L' && sscanf(b, "L %u %u %u %u %d %d %d %d %d %u %d %u",
                  &rate, &frames, &rs, &bpm10, &pitch, &detune, &gain, &revrs, &sync, &rot, &nudge, &loopt) == 12,
                  "the Loop line does not parse");
        HX_ASSERT(rate == 44100 && frames == 44100 && rs == 1000, "the Loop line's sample");
        HX_ASSERT(bpm10 == 2400 && pitch == -3 && detune == 0 && gain == -6, "the Loop line's settings");
        HX_ASSERT(loopt == (unsigned)inst->tracks[4].clips[0].length * 24, "the Loop line's length is not the clip's");
        snprintf(want, sizeof want, "|%s/proj/dAVEBOx/samples/ramp.wav", g_root);
        HX_ASSERT(strstr(b, want) && !strcmp(strstr(b, want), want), "the Loop line does not name the project's copy");
    }
    printf("  ok   — a Loop clip describes itself\n");
    hx_set_param(h, "t4_au_set_pitch", "0 0");
    hx_set_param(h, "t4_au_set_gain", "0 0");
    hx_set_param(h, "t4_au_set_start", "0 0");

    /* ---- 5. Loop clips Live cannot warp itself are rendered: Sync Pitch
     * retunes the sample to fill the clip; Vintage cuts it on the clock at
     * its own pitch. A Warp clip on Revrs goes as the sample reversed. ---- */
    {
        double bpm = inst->tracks[0].pfx.cached_bpm > 0 ? inst->tracks[0].pfx.cached_bpm : (double)BPM_DEFAULT;
        double fpt = 44100.0 * 60.0 / (bpm * 96.0);
        uint32_t frames, rate;
        int ch, bad = 0;
        long fr = 0;
        unsigned lt = 0;
        int16_t *w;
        /* the 1 s sample is a bar at 240, the clip a bar at the project's
         * 120: Pitch plays it at half speed */
        hx_set_param(h, "t4_au_set_sync", "0 2");
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'R', "a Pitch clip was not rendered");
        HX_ASSERT(sscanf(b, "R %ld %u", &fr, &lt) == 2 && lt == 384, "the render line");
        snprintf(p, sizeof p, "%s/au_4_0.wav", stage);
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w && frames == (uint32_t)fr && rate == 44100 && ch == 2, "the Pitch render's header");
        for (k = 1; k < 8; k++) {
            uint32_t at = (uint32_t)(k * 10000);
            int want_v = 1 + (int)((double)at * 44100.0 / (384.0 * fpt) + 0.5) % 30000;
            if (abs(w[at] - want_v) > 2) bad++;
        }
        HX_ASSERT(bad == 0, "Pitch did not retune the sample to fill the clip");
        free(w);
        /* Shift a beat: the sample starts at the clip's tick 96, its last
         * beat wrapped round before it. Checked against the grid, not the
         * engine: live, a Pitch loop restarts at Shift on its block's
         * boundary, and drifts 4 sample frames a bar (seen 2026-10-31) */
        hx_set_param(h, "t4_au_set_rot", "0 96");
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'R', "a Shifted Pitch clip was not rendered");
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w, "no Shifted Pitch render");
        {
            double half = 44100.0 / (384.0 * fpt), sh = 96 * fpt;
            int want_a = 1 + (int)((288 * fpt + 2000) * half + 0.5) % 30000;       /* before: the last beat */
            int want_b = 1 + (int)((3 * 10000.0 - sh) * half + 0.5) % 30000;       /* after: from the top */
            HX_ASSERT(abs(w[2000] - want_a) <= 2, "before its Shift a clip does not play its wrapped end");
            HX_ASSERT(abs(w[30000] - want_b) <= 2, "a Shifted clip does not start its sample at the Shift");
        }
        free(w);
        hx_set_param(h, "t4_au_set_rot", "0 0");
        printf("  ok   — a Sync Pitch Loop clip renders, retuned to fill the clip\n");

        /* Vintage: tick j of the sample's own Tempo sounds at the clip's
         * tick j, at its own speed. At 30 BPM a sample tick is 919 frames
         * against the clip's 230, so every piece is a cut (a piece within
         * AU_JOIN of where the sounding one has got to carries it on, live
         * and here alike); its 48 ticks spent, the clip is silent. */
        hx_set_param(h, "t4_au_set_bpm", "0 300");
        hx_set_param(h, "t4_au_set_sync", "0 1");
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'R', "a Vintage clip was not rendered");
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w, "no Vintage render");
        double fs = 44100.0 * 60.0 / (30.0 * 96.0);
        for (k = 1, bad = 0; k < 48; k++) {
            uint32_t at = (uint32_t)((double)k * fpt) + 180;
            int want_v = 1 + (int)((double)k * fs + 180) % 30000;
            if (abs(w[at] - want_v) > 3) bad++;
        }
        HX_ASSERT(bad == 0, "Vintage did not lay each piece on its tick");
        HX_ASSERT(w[(uint32_t)(60 * fpt)] == 0 && w[(uint32_t)(300 * fpt)] == 0, "Vintage sounded past the sample's ticks");
        free(w);
        /* a sample longer than its clip (at 480, 2 bars of it against the
         * clip's one): only the pieces inside the clip play — each tick
         * reads from its own part of the sample (a piece carries on up to
         * AU_JOIN), never from the half past the clip's end */
        hx_set_param(h, "t4_au_set_bpm", "0 4800");
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'R', "a long Vintage clip was not rendered");
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w, "no long Vintage render");
        double fl = 44100.0 * 60.0 / (480.0 * 96.0);
        for (k = 1, bad = 0; k < 380; k += 3) {
            int v = w[(uint32_t)((double)k * fpt) + 180] - 1;
            if (v < (int)(k * fl) || v > (int)(k * fl) + 900) bad++;
        }
        HX_ASSERT(bad == 0, "a Vintage clip played a piece from past its end");
        free(w);
        hx_set_param(h, "t4_au_set_bpm", "0 2400");
        printf("  ok   — a Vintage Loop clip renders, a piece on each tick\n");

        /* Warp on Revrs: the reversed sample, its frame 0 the sample's end */
        hx_set_param(h, "t4_au_set_sync", "0 0");
        hx_set_param(h, "t4_au_set_revrs", "0 1");
        hx_set_param(h, "t4_au_set_start", "0 1000");      /* forwards the window starts at 1000 */
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'L', "a Warp clip was rendered");
        snprintf(p, sizeof p, "|%s/au_4_0_rev.wav", stage);
        HX_ASSERT(strstr(b, p) != NULL, "a Warp clip on Revrs does not name the reversed sample");
        {
            unsigned r1, f1, rs1;
            HX_ASSERT(sscanf(b, "L %u %u %u", &r1, &f1, &rs1) == 3 && rs1 == 0, "the reversed window does not start at its frame 0");
        }
        snprintf(p, sizeof p, "%s/au_4_0_rev.wav", stage);
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w && frames == 44100 && ch == 1 && w[0] == 1 + 44099 % 30000 && w[44099] == 1, "the sample is not reversed");
        free(w);
        hx_set_param(h, "t4_au_set_revrs", "0 0");
        hx_set_param(h, "t4_au_set_start", "0 0");
        printf("  ok   — a Warp clip on Revrs goes as its sample reversed\n");
    }

    /* ---- 2. a Slice clip renders: chop k on step k, its own frames ---- */
    hx_set_param(h, "t4_au_set_mode", "0 1");         /* Even 16, laid on the 16 steps in order */
    hx_set_param(h, "t4_au_slice_pitch", "0 5 12");   /* chop 5 an octave up: its own sound */
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
            int want_v = 1 + (int)((44100 * k) / 16 + (k == 5 ? 80 : 40)) % 30000;
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
        /* a gate that ends inside the cycle ends in the pass that is kept */
        hx_set_param(h, "t4_c0_step_15_toggle", "0");
        hx_set_param(h, "t4_c0_step_4_toggle", "0");
        HX_ASSERT(cl->note_count == 1, "the step-4 note did not land");
        cl->notes[0].gate = 24;
        HX_ASSERT(hx_get_param(h, "t4_c0_au_export", b, sizeof b) > 0 && b[0] == 'S', "no render of step 4");
        w = read_wav(p, &frames, &rate, &ch);
        HX_ASSERT(w, "no WAV of step 4");
        HX_ASSERT(w[4 * stepf + 10] != 0, "the step-4 chop did not sound");
        HX_ASSERT(w[5 * stepf + 1000] == 0 && w[9 * stepf] == 0, "the step-4 chop sounded past its gate");
        free(w);
    }
    printf("  ok   — the loop point carries what sounds over it\n");

    hx_destroy(h);

    {
        /* sync, the sample's Tempo x10, Nudge ms, frames allowed to differ,
         * Shift ticks:
         * a Nudge puts Vintage's pieces between ticks, where live rounds a
         * piece's frame its own way — one frame, which inside a crossfade
         * over the ramp's jump back to 1 is one crossfade of difference */
        static const int cases[][5] = { { 2, 2400, 0, 16 }, { 2, 1500, 0, 16 }, { 2, 900, 0, 16 }, { 2, 2400, 37, 16 },
                                        { 1, 300, 0, 0 }, { 1, 1200, 0, 0 }, { 1, 300, 37, AU_VINTAGE_XF }, { 1, 300, -61, AU_VINTAGE_XF },
                                        { -1, 2400, 0, 16 }, { -1, 900, 0, 16 },
                                        { 1, 300, 0, 0, 50 } };
        for (k = 0; k < 11; k++) {
            int bad = vs_live(cases[k][0], cases[k][1], cases[k][2], cases[k][4]);
            if (bad < 0 || bad > cases[k][3])
                printf("FAIL: Sync %d at %d, Nudge %d: %d frames differ from the engine\n", cases[k][0], cases[k][1], cases[k][2], bad);
            HX_ASSERT(bad >= 0 && bad <= cases[k][3], "a render does not match the engine playing it");
        }
    }
    printf("  ok   — Pitch, Vintage and Slice renders match the engine playing the clip\n");

    snprintf(b, sizeof b, "rm -rf '%s'", g_root);
    if (system(b)) {}
    printf("PASS test_audio_export\n");
    return 0;
}
