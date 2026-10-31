/* tests/test_audio_track.c — AUDIO (seq8_audio.c + sp_track_audio.c).
 *
 * Audio is picked in Instmt/Dest like the Conductor: pad_mode PAD_MODE_AUDIO,
 * melodic clips whose notes are slices (pitch 36 + slice).
 *   - convert: the notes go (Q2), leaving Audio clears the steps and lets the
 *     samples go (Q3);
 *   - a pick copies the file into the project's samples/ and loads it on the
 *     loader thread (WAV 16-bit mono 48k, WAV 24-bit stereo, AIFF); a file over
 *     the length cap fails with AU_ERR_LONG, the same name with other content
 *     gets "~2"; a Loop clip's length is the sample's in whole bars;
 *   - Slice: a note plays exactly its slice through the TRACK'S SLOT feed,
 *     sends no MIDI, ignores velocity, cuts the slice before it, honours slice
 *     gain / GATE; no pitch transform moves it (transpose, NOTE FX octave);
 *     DELAY echoes nothing (it left Audio tracks); ALL SLICES sets every slice;
 *     Chop lays one step per slice at 36..;
 *   - the hand set (frames): Manual, markers added / removed (steps follow),
 *     pinned and home ends, Even as an override, the zoomed waveform; Lazy
 *     armed silent, first tap plays, taps mark, Back / played out, keep or
 *     restore; an older project's permille Start / End arrive in frames;
 *   - Loop: the voice follows the clip from the sample's first frame; Revrs
 *     plays it backwards, Nudge delays it; a new clip has Even 16, and Slice
 *     on a clip with no steps lays the chops on them in order, which then play
 *     the sample straight through (the joins);
 *   - detune: cents on top of the semitones, clip + slice, read back, saved;
 *     a project from before it loads as saved, at 0 cents;
 *   - the project file keeps it all and a reload loads the samples again; a
 *     set from the drum-flag build loads as a drum track. */
#include "harness.h"
#include <math.h>
#include <signal.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
static void put_be16(FILE *f, int v) { fputc((v >> 8) & 255, f); fputc(v & 255, f); }
static void put_be32(FILE *f, uint32_t v) { put_be16(f, (int)(v >> 16)); put_be16(f, (int)(v & 0xFFFF)); }

/* mono 16-bit 48 kHz, 1 s: eighth k holds the constant (k+1)*1000 */
static void write_mono48(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 48000, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 48000); put_le32(f, 96000);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)((i / 6000) + 1) * 1000);
    fclose(f);
}
/* mono 16-bit 44.1 kHz, 2 s: a 440 Hz triangle, +-12000 (no libm: run.sh links none) */
static void write_tri(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 88200, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) {
        double ph = (double)(i * 440 % 44100) / 44100.0;          /* 0..1 */
        double v = ph < 0.5 ? -1.0 + 4.0 * ph : 3.0 - 4.0 * ph;   /* -1..1..-1 */
        put_le16(f, (int)(v * 12000.0));
    }
    fclose(f);
}
/* stereo 24-bit 44.1 kHz, `secs`: L = +4096, R = -4096 (as int16) */
static void write_st24(const char *path, double secs) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 6); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 2); put_le32(f, 44100); put_le32(f, 44100 * 6);
    put_le16(f, 6); put_le16(f, 24);
    fwrite("data", 1, 4, f); put_le32(f, n * 6);
    for (i = 0; i < n; i++) {
        int32_t l = 4096 << 8, r = -(4096 << 8);
        fputc(l & 255, f); fputc((l >> 8) & 255, f); fputc((l >> 16) & 255, f);
        fputc(r & 255, f); fputc((r >> 8) & 255, f); fputc((r >> 16) & 255, f);
    }
    fclose(f);
}
/* AIFF 16-bit stereo 44.1 kHz, 0.5 s, constant 2000 / -2000 */
static void write_aiff(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 22050, i;
    static const uint8_t r44100[10] = { 0x40, 0x0E, 0xAC, 0x44, 0, 0, 0, 0, 0, 0 };
    fwrite("FORM", 1, 4, f); put_be32(f, 4 + 26 + 16 + n * 4); fwrite("AIFF", 1, 4, f);
    fwrite("COMM", 1, 4, f); put_be32(f, 18); put_be16(f, 2); put_be32(f, n); put_be16(f, 16);
    fwrite(r44100, 1, 10, f);
    fwrite("SSND", 1, 4, f); put_be32(f, 8 + n * 4); put_be32(f, 0); put_be32(f, 0);
    for (i = 0; i < n; i++) { put_be16(f, 2000); put_be16(f, -2000 & 0xFFFF); }
    fclose(f);
}
/* mono 16-bit 44.1 kHz, 1 s: frame i holds the value i % 30000 (a ramp: where
 * playback starts is readable off the first sample) */
static void write_ramp(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}
/* mono 16-bit 44.1 kHz, `secs`: frame i holds i % 30000 */
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
/* mono 16-bit 44.1 kHz, 3 s of silence with ONE loud frame at 66002 (off any sampling stride) */
static void write_spike(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100 * 3, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, i == 66002 ? 20000 : 0);
    fclose(f);
}
/* a WAV whose data chunk claims 31 minutes (Loop's limit is 30) */
static void write_long(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100u * 1860u;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    put_le32(f, 0);
    fclose(f);
}

static int info_state(hx_t *h, int t, int c, int *err, uint32_t *frames, uint32_t *rate, int *ch, char *name) {
    char k[32], b[512];
    int st = -1, e = 0, x[8];
    unsigned fr = 0, rt = 0;
    int chn = 0;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    if (hx_get_param(h, k, b, sizeof b) <= 0) return -1;
    sscanf(b, "%d %d %d %d %d %d %d %d %d %d %u %u %d", &st, &e, &x[0], &x[1], &x[2], &x[3], &x[4], &x[5], &x[6], &x[7], &fr, &rt, &chn);
    if (err) *err = e;
    if (frames) *frames = fr;
    if (rate) *rate = rt;
    if (ch) *ch = chn;
    if (name) { const char *bar = strchr(b, '|'); snprintf(name, 160, "%s", bar ? bar + 1 : ""); }
    return st;
}

/* Render until clip (t,c) is no longer loading (the loader is a thread). */
static int wait_loaded(hx_t *h, int t, int c) {
    int i, st = 1;
    for (i = 0; i < 2000; i++) {
        hx_render(h, 1);
        st = info_state(h, t, c, NULL, NULL, NULL, NULL, NULL);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

/* A Loop clip played exactly as recorded: Sync Pitch at the project's Tempo
 * (Orig) — what Free was before it left (Josh, 2026-10-29: Free out, Orig in). */
static void as_recorded(hx_t *h, int t, int c) {
    char k[40], v[16];
    snprintf(v, sizeof v, "%d 2", c);
    snprintf(k, sizeof k, "t%d_au_set_sync", t);
    hx_set_param(h, k, v);
    snprintf(v, sizeof v, "%d 0", c);
    snprintf(k, sizeof k, "t%d_au_set_orig", t);
    hx_set_param(h, k, v);
}

static int note_events_on_slot(int slot) {
    int i, n = 0;
    for (i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_PARAM_SET && e->slot == slot && ((e->bytes[1] & 0xF0) == 0x90 || (e->bytes[1] & 0xF0) == 0x80)) n++;
    }
    return n;
}

static hx_t *rig(int audio) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    char p[300];
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root);
    mkdir(p, 0775);
    if (audio) hx_set_param(h, "t4_convert_to_audio", "");
    return h;
}


static int clip_pitches(seq8_instance_t *inst, int t, int c, int *out, int max) {
    clip_t *cl = &inst->tracks[t].clips[c];
    int i, n = 0;
    for (i = 0; i < cl->note_count && n < max; i++) if (cl->notes[i].active) out[n++] = cl->notes[i].pitch;
    return n;
}

/* mono 44.1 kHz: `secs` of quarter-note clicks at `bpm` (a 10 ms decaying burst each) */
static void write_clicks(const char *path, double secs, double bpm) {
    FILE *f = fopen(path, "wb");
    uint32_t n = (uint32_t)(44100 * secs), i, beat = (uint32_t)(44100.0 * 60.0 / bpm);
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) {
        uint32_t ph = i % beat;
        put_le16(f, ph < 441 ? (int)((ph & 1 ? 1 : -1) * (20000 - ph * 40)) : 0);
    }
    fclose(f);
}

/* Play `blocks` blocks from the transport's start and count where the ramp
 * the clip feeds did not go on by one (a cut, a jump or a silent block). */
/* a render that never returns is an audio-thread hang on the device */
static void on_hang(int sig) {
    static const char m[] = "FAIL: the render hung (audio-thread hang)\n";
    (void)sig;
    if (write(2, m, sizeof m - 1) < 0) {}
    _exit(3);
}

static int ramp_breaks(hx_t *h, int blocks) {
    const int16_t *b;
    int prev = -1, breaks = 0, k, n, fed;
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (n = 0; n < 20 && hx_stub_feed(4, NULL, NULL) == 0; n++) hx_render(h, 1);
    fed = hx_stub_feed(4, NULL, NULL);
    b = hx_stub_feed_last(4);
    for (k = 0; k < 128; k++) if (b[k * 2]) prev = b[k * 2];
    for (n = 0; n < blocks; n++) {
        hx_render(h, 1);
        if (hx_stub_feed(4, NULL, NULL) == fed) { breaks++; continue; }
        fed = hx_stub_feed(4, NULL, NULL);
        b = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++) {
            if (b[k * 2] != (prev + 1) % 30000) breaks++;
            prev = b[k * 2];
        }
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 60);
    return breaks;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    seq8_track_t *tr;
    char p[300], name[160], blob[262144];
    int err, ch, st, first, i, n, pit[64];
    uint32_t frames, rate;
    uint64_t energy;
    const int16_t *blk;

    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/mono48.wav", g_root); write_mono48(p);
    snprintf(p, sizeof p, "%s/src/st24.wav", g_root); write_st24(p, 4.0);
    snprintf(p, sizeof p, "%s/src/loop.aif", g_root); write_aiff(p);
    snprintf(p, sizeof p, "%s/src/long.wav", g_root); write_long(p);
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root); write_ramp(p);
    snprintf(p, sizeof p, "%s/src/ramp3.wav", g_root); write_ramp_len(p, 3.0);
    snprintf(p, sizeof p, "%s/src/spike.wav", g_root); write_spike(p);

    /* ---- the mode: picked like the Conductor; the notes go (Q2) ---- */
    h = rig(0); inst = (seq8_instance_t *)h->inst; tr = &inst->tracks[4];
    hx_set_param(h, "t4_c0_step_0_toggle", "60");
    hx_render(h, 1);
    HX_ASSERT(tr->clips[0].note_count == 1, "the setup note did not land");
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(tr->pad_mode == PAD_MODE_AUDIO, "t4 is not Audio");
    HX_ASSERT(tr->clips[0].note_count == 0, "converting to Audio kept the notes");
    HX_ASSERT(!pad_mode_pitched(PAD_MODE_AUDIO) && pad_mode_pitched(PAD_MODE_CONDUCT) &&
              pad_mode_pitched(PAD_MODE_MELODIC_SCALE) && !pad_mode_pitched(PAD_MODE_DRUM), "pad_mode_pitched");
    /* drum -> Audio too */
    hx_set_param(h, "t6_convert_to_drum", "");
    hx_set_param(h, "t6_convert_to_audio", "");
    HX_ASSERT(inst->tracks[6].pad_mode == PAD_MODE_AUDIO, "a drum track did not become Audio");
    /* the arp's Step reaches 15 on Audio; leaving, it comes back to ±4 octaves */
    hx_set_param(h, "t6_tarp_octaves", "15");
    HX_ASSERT(inst->tracks[6].tarp.octaves == 15, "Audio's arp Step did not reach 15");
    hx_set_param(h, "t6_convert_to_melodic", "");
    HX_ASSERT(inst->tracks[6].tarp.octaves == 4, "leaving Audio kept a 15-octave arp");

    /* ---- pick: copied into the project, loaded off-thread ---- */
    snprintf(p, sizeof p, "0|%s/src/mono48.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    st = wait_loaded(h, 4, 0);
    info_state(h, 4, 0, &err, &frames, &rate, &ch, name);
    HX_ASSERT(st == 2 && err == 0, "the mono WAV did not load");
    HX_ASSERT(frames == 48000 && rate == 48000 && ch == 1, "mono WAV: wrong frames / rate / channels");
    HX_ASSERT(!strcmp(name, "mono48.wav"), "the clip does not name its project copy");
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/mono48.wav", g_root);
    HX_ASSERT(access(p, R_OK) == 0, "the sample was not copied into the project's samples/");
    HX_ASSERT(tr->clips[0].length == 16, "a Loop pick did not set a 1-bar clip");

    /* ---- resample: a Loop clip has no notes and still plays, so it is as long
     * as the clip; a take of it hears the sample fed to the track's slot ---- */
    {
        char b[16];
        int kind, index;
        HX_ASSERT(hx_get_param(h, "resample_bars_t4_c0", b, sizeof b) > 0 && atoi(b) == 1,
                  "a 1-bar Loop clip has no resample length");
        HX_ASSERT(hx_get_param(h, "resample_bars_0", b, sizeof b) > 0 && atoi(b) == 1,
                  "a scene holding a Loop clip has no resample length");
        HX_ASSERT(hx_get_param(h, "resample_bars_t4_c1", b, sizeof b) > 0 && atoi(b) == 0,
                  "an Audio clip with no sample has a resample length");
        int sync0 = inst->au_clip[4][0].sync, bpm0 = inst->au_clip[4][0].bpm10;
        as_recorded(h, 4, 0);                /* Pitch: Warp's stretcher is not run in this file */
        hx_stub_feed_reset();
        hx_set_param(h, "resample_clip", "4 0 1 0 0 1 |/x/loop 5A.wav");
        for (i = 0; i < 40 && inst->resample_state != RS_RECORDING; i++) hx_render(h, 1);
        hx_stub_capture_src(&kind, &index);
        HX_ASSERT(inst->resample_state == RS_RECORDING && kind == MOVE_CAPTURE_SLOT && index == tr->pfx.slot,
                  "a Dry take of a Loop clip did not take the track's slot");
        hx_render(h, 20);
        HX_ASSERT(hx_stub_feed(tr->pfx.slot, NULL, &energy) > 0 && energy > 0,
                  "the Loop clip fed nothing during its take");
        hx_set_param(h, "transport", "stop");
        hx_set_param(h, "resample_clear", "1");
        hx_render(h, 4);
        snprintf(b, sizeof b, "0 %d", sync0); hx_set_param(h, "t4_au_set_sync", b);
        snprintf(b, sizeof b, "0 %d", bpm0);  hx_set_param(h, "t4_au_set_bpm", b);
    }

    /* ---- Loop -> Slice on a clip with no steps: the chops (Even 16, a new
     * clip's) go onto the steps in order ---- */
    HX_ASSERT(inst->au_clip[4][0].even == 16, "a new clip did not start with Even 16");
    HX_ASSERT(inst->au_clip[4][0].bpm10 == 1200, "a sample with nothing to go on did not take the project's tempo");
    hx_set_param(h, "t4_au_set_bpm", "0 2400");            /* its 1 s as one bar: 16 steps for the 16 chops */
    hx_set_param(h, "t4_au_set_mode", "0 1");
    {
        int np = clip_pitches(inst, 4, 0, pit, 64), k, ordered = np == 16;
        for (k = 0; ordered && k < 16; k++) if (pit[k] != AU_NOTE_BASE + k) ordered = 0;
        HX_ASSERT(ordered, "switching a stepless clip to Slice did not lay its 16 chops in order");
    }
    hx_set_param(h, "t4_au_set_mode", "0 0");
    hx_set_param(h, "t4_c0_step_0_toggle", "0");         /* a step of the user's own */
    hx_set_param(h, "t4_au_set_mode", "0 1");
    HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 15, "switching a clip WITH steps to Slice rewrote them");
    hx_set_param(h, "t4_au_wipe", "0");

    /* ---- Slice: a note plays exactly its slice, on the track's slot ---- */
    hx_set_param(h, "t4_au_set_even", "0 8");
    hx_stub_feed_reset();
    hx_clear_capture(h);
    au_note_event(4, 2, 0x90, 1, 0);               /* velocity 1: ignored */
    hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(hx_stub_feed(4, &first, &energy) == 1, "the slice was not fed to slot 4");
    HX_ASSERT(blk[0] == 3000 && blk[1] == 3000 && blk[255] == 3000, "slice 3 did not play its own audio at full level");
    au_note_event(4, 5, 0x90, 100, 0);
    hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] > 6000 && blk[255] == 6000, "slice 6 did not cut slice 3 (mono)");
    hx_set_param(h, "t4_au_slice_gain", "0 1 -6");
    au_note_event(4, 1, 0x90, 100, 0);
    hx_render(h, 2);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[255] >= 990 && blk[255] <= 1010, "slice gain -6 dB did not halve the slice");
    hx_set_param(h, "t4_au_slice_play", "0 1 1");
    au_note_event(4, 1, 0x90, 100, 0);
    hx_render(h, 1);
    au_note_event(4, 1, 0x80, 0, 0);
    hx_render(h, 3);
    hx_stub_feed_reset();
    hx_render(h, 2);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 0, "a GATE slice kept sounding after its note-off");
    au_note_event(4, 20, 0x90, 100, 0);
    hx_render(h, 1);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 0, "a slice past the count played");

    /* ---- the whole note path: a played note reaches its slice, no MIDI
     * leaves, and nothing pitched moves it ---- */
    hx_set_param(h, "t4_transpose", "7");
    hx_set_param(h, "t4_noteFX_octave", "1");
    hx_set_param(h, "t4_noteFX_offset", "3");
    tr->pfx.octave_shift = 1; tr->pfx.note_offset = 3;
    hx_render(h, 40);
    hx_stub_feed_reset();
    hx_clear_capture(h);
    live_note_on(inst, tr, AU_NOTE_BASE + 2, 100);
    hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) >= 1 && blk[255] == 3000, "a played note did not reach slice 3 untouched");
    HX_ASSERT(note_events_on_slot(4) == 0 && hx_count_midi(h, HX_MIDI_INTERNAL) == 0, "an Audio track sent MIDI");
    live_note_off(inst, tr, AU_NOTE_BASE + 2);
    hx_set_param(h, "t4_transpose", "0");
    tr->pfx.octave_shift = 0; tr->pfx.note_offset = 0;
    hx_render(h, 60);

    /* ---- DELAY left Audio tracks: an older project's DELAY echoes nothing ---- */
    tr->pfx.delay_time_idx = 3; tr->pfx.delay_level = 64; tr->pfx.repeat_times = 1; tr->pfx.fb_velocity = 0;
    hx_stub_feed_reset();
    live_note_on(inst, tr, AU_NOTE_BASE + 2, 100);
    hx_render(h, 1);
    live_note_off(inst, tr, AU_NOTE_BASE + 2);
    HX_ASSERT(hx_stub_feed_last(4)[255] == 3000, "the played slice was not at full level");
    /* the track feeds its slot only while a voice sounds: slice 3 (6000
     * frames) fills 47 blocks; an echo 1/16 later would play it again */
    for (i = 0; i < 400; i++) hx_render(h, 1);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) <= 48, "a DELAY echo played a slice on an Audio track");
    tr->pfx.delay_level = 0; tr->pfx.repeat_times = 0;
    hx_render(h, 60);

    /* ---- the hand set: Manual, markers added / removed, ends, Even over it ---- */
    {
        au_clip_t *ac = &inst->au_clip[4][0];
        char mk[600];
        hx_set_param(h, "t4_au_manual", "0");
        HX_ASSERT(ac->even == 0 && ac->nslices == 1 && ac->sl[0].start == 0, "Manual did not make one slice at Start");
        hx_set_param(h, "t4_au_mark_add", "0 12000");
        HX_ASSERT(ac->nslices == 2 && ac->sl[1].start == 12000, "a marker did not split the slice");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(!strcmp(mk, "0 12000 12000 48000"), "marks: two slices, home ends");
        /* steps follow a marker: slice 2's step plays the same audio after a split before it */
        hx_set_param(h, "t4_c0_step_4_toggle", "1");
        hx_set_param(h, "t4_au_mark_add", "0 6000");
        HX_ASSERT(ac->nslices == 3 && ac->sl[1].start == 6000 && ac->sl[2].start == 12000, "the middle marker");
        HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == AU_NOTE_BASE + 2, "a split did not move the later slice's step up");
        hx_set_param(h, "t4_au_mark_add", "0 6005");
        HX_ASSERT(ac->nslices == 3, "a marker on top of a marker was added");
        /* slice 2 (6000..12000) plays the third eighth: 2000 */
        hx_stub_feed_reset();
        au_note_event(4, 1, 0x90, 100, 0);
        hx_render(h, 1);
        HX_ASSERT(hx_stub_feed_last(4)[255] == 2000, "a hand-set slice did not play its own frames");
        hx_render(h, 60);
        hx_set_param(h, "t4_au_mark_del", "0 1");
        HX_ASSERT(ac->nslices == 2 && ac->sl[1].start == 12000, "a marker did not go");
        HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == AU_NOTE_BASE + 1, "a delete did not move the later step down");
        hx_set_param(h, "t4_au_mark_del", "0 0");
        HX_ASSERT(ac->nslices == 2 && ac->sl[0].start == 0, "slice 1's start was deleted");
        hx_set_param(h, "t4_au_wipe", "0");
        /* ends: pinned, back home on the home frame or 0 */
        hx_set_param(h, "t4_au_slice_end", "0 0 9000");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(!strcmp(mk, "0 9000 12000 48000"), "a pinned end");
        hx_set_param(h, "t4_au_slice_end", "0 0 12000");
        HX_ASSERT(ac->sl[0].end == 0, "the home frame did not send the end home");
        hx_set_param(h, "t4_au_slice_end", "0 0 30000");
        HX_ASSERT(ac->sl[0].end == 30000, "an end past the next start (overlap)");
        hx_set_param(h, "t4_au_mark_add", "0 6000");
        HX_ASSERT(ac->sl[0].end == 0 && ac->sl[1].start == 6000 && ac->sl[1].end == 30000,
                  "a split did not hand the pinned end to the new slice");
        hx_set_param(h, "t4_au_mark_del", "0 1");
        HX_ASSERT(ac->sl[0].end == 30000, "a merge did not keep the merged slice's end");
        hx_set_param(h, "t4_au_slice_end", "0 0 0");
        /* starts stay between their neighbours */
        hx_set_param(h, "t4_au_slice_start", "0 1 1");
        HX_ASSERT(ac->sl[1].start == AU_GAP, "a start passed the one before");
        hx_set_param(h, "t4_au_slice_start", "0 1 12000");
        /* Even overrides, keeping the hand set; markers locked while it is on */
        hx_set_param(h, "t4_au_set_even", "0 4");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(!strcmp(mk, "0 12000 12000 24000 24000 36000 36000 48000"), "Even 4 over the hand set");
        hx_set_param(h, "t4_au_set_even", "0 0");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(!strcmp(mk, "0 12000 12000 48000"), "Even Off did not bring the hand set back");
        /* Even is a way to chop, never a lock (Josh): a hand edit while it is
         * on makes its slices the hand set first, then applies */
        hx_set_param(h, "t4_au_set_even", "0 4");
        hx_set_param(h, "t4_au_slice_start", "0 1 13000");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(ac->even == 0 && ac->nslices == 4 && !strcmp(mk, "0 13000 13000 24000 24000 36000 36000 48000"),
                  "an edit while Even was on did not bake it and apply");
        hx_set_param(h, "t4_au_set_even", "0 4");
        hx_set_param(h, "t4_au_slice_end", "0 1 20000");
        HX_ASSERT(ac->even == 0 && ac->nslices == 4 && ac->sl[1].start == 12000 && ac->sl[1].end == 20000,
                  "an end edit while Even was on did not bake it and apply");
        hx_set_param(h, "t4_au_set_even", "0 4");
        hx_set_param(h, "t4_au_mark_add", "0 6000");
        HX_ASSERT(ac->even == 0 && ac->nslices == 5 && ac->sl[1].start == 6000, "a marker added while Even was on");
        hx_set_param(h, "t4_au_set_even", "0 4");
        hx_set_param(h, "t4_au_mark_del", "0 1");
        HX_ASSERT(ac->even == 0 && ac->nslices == 3 && ac->sl[1].start == 24000, "a marker removed while Even was on");
        hx_set_param(h, "t4_au_set_even", "0 3");
        hx_set_param(h, "t4_au_even_bake", "0");
        HX_ASSERT(ac->even == 0 && ac->nslices == 3 && ac->sl[1].start == 16000 && ac->sl[2].start == 32000, "even_bake");
        /* back to the two-slice hand set the rest of the test expects */
        hx_set_param(h, "t4_au_manual", "0");
        hx_set_param(h, "t4_au_mark_add", "0 12000");
        /* Start is frames; Length (Slice) ticks at the sample's Tempo, 0 = to
         * the end — no End anywhere */
        hx_set_param(h, "t4_au_set_start", "0 24000");
        hx_set_param(h, "t4_au_set_even", "0 2");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(ac->slen == 0 && !strcmp(mk, "24000 36000 36000 48000"), "Even did not divide Start..the end in frames");
        {
            char lb[32];
            snprintf(lb, sizeof lb, "0 %u", (unsigned)(12000.0 / au_fpt_s(ac, ac->smp) + 0.5));
            hx_set_param(h, "t4_au_set_slen", lb);
            hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
            HX_ASSERT(!strcmp(mk, "24000 30000 30000 36000"), "Even did not divide Start..Start + Length");
            hx_set_param(h, "t4_au_set_slen", "0 0");
        }
        hx_set_param(h, "t4_au_set_start", "0 0");
        /* the zoomed waveform: frames 6000..6128, one per column, all 2000 */
        hx_get_param(h, "t4_au_wave_0_6000_6128", mk, sizeof mk);
        HX_ASSERT(!strncmp(mk, "00070007", 8) && !strncmp(mk + 127 * 4, "0007", 4), "the zoomed waveform");

        /* ---- Lazy: armed silent, the first tap plays, taps mark, keep / restore ---- */
        hx_set_param(h, "t4_au_set_even", "0 0");
        hx_set_param(h, "t4_au_lazy", "0 1");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_ARMED, "Lazy did not arm");
        hx_stub_feed_reset();
        hx_render(h, 4);
        HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 0, "an armed Lazy chop played before the first tap");
        hx_set_param(h, "t4_au_lazy", "0 0");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_NONE && ac->nslices == 2 && ac->sl[1].start == 12000,
                  "Back before the first tap changed the chops");
        hx_set_param(h, "t4_au_lazy", "0 1");
        hx_set_param(h, "t4_au_lazy_tap", "");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_RUN && ac->nslices == 1 && ac->sl[0].start == 0, "the first tap");
        hx_render(h, 10);
        HX_ASSERT(hx_stub_feed(4, NULL, NULL) > 0, "the first tap did not play the sample");
        hx_set_param(h, "t4_au_lazy_tap", "");
        HX_ASSERT(ac->nslices == 2 && ac->sl[1].start > 1200 && ac->sl[1].start < 1600, "a tap did not mark the playhead");
        hx_set_param(h, "t4_au_lazy", "0 0");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_ENDED, "Back did not end the chop");
        hx_set_param(h, "t4_au_lazy_keep", "0");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_NONE && ac->nslices == 2 && ac->sl[1].start == 12000,
                  "No did not put the old chops back");
        hx_set_param(h, "t4_au_set_even", "0 8");
        hx_set_param(h, "t4_au_lazy", "0 1");
        hx_set_param(h, "t4_au_lazy_tap", "");
        HX_ASSERT(ac->even == 0, "a Lazy chop left Even on");
        for (i = 0; i < 600 && inst->au_lazy_state == AU_LAZY_RUN; i++) hx_render(h, 1);
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_ENDED, "the chop did not end with the sample");
        hx_set_param(h, "t4_au_lazy_keep", "1");
        HX_ASSERT(inst->au_lazy_state == AU_LAZY_NONE && ac->nslices == 1 && ac->even == 0, "Yes did not keep the new chops");
        hx_set_param(h, "t4_au_set_even", "0 8");
        hx_render(h, 20);
    }

    /* ---- ALL SLICES: one value into every slice ---- */
    hx_set_param(h, "t4_au_all_gain", "0 -6");
    for (i = 0, n = 0; i < AU_MAX_SLICES; i++) n += inst->au_clip[4][0].sl[i].gain_db == -6;
    HX_ASSERT(n == AU_MAX_SLICES, "ALL SLICES did not set every slice's gain");
    {
        char ab[64];
        hx_get_param(h, "t4_au_all_0", ab, sizeof ab);
        HX_ASSERT(!strcmp(ab, "0 -6 0 0 0 x 0"), "ALL SLICES read does not show the common gain and the differing Play (and detune last)");
    }
    hx_set_param(h, "t4_au_all_play", "0 0");
    hx_set_param(h, "t4_au_all_gain", "0 0");
    hx_set_param(h, "t4_au_slice_gain", "0 1 -6");
    hx_set_param(h, "t4_au_slice_play", "0 1 1");

    /* ---- only into a Schwung slot of its own ---- */
    hx_set_param(h, "t4_route", "move");
    hx_stub_feed_reset();
    au_note_event(4, 2, 0x90, 100, 0);
    hx_render(h, 2);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 0 && hx_stub_feed(0, NULL, NULL) == 0, "a Move-routed Audio track fed a slot");
    hx_set_param(h, "t4_route", "schwung");
    hx_render(h, 30);

    /* ---- Chop: one step per slice, at 36.. in order ---- */
    hx_set_param(h, "t4_au_chop", "0");
    n = clip_pitches(inst, 4, 0, pit, 64);
    HX_ASSERT(n == 8, "Chop did not lay one step per slice");
    for (i = 0; i < 8; i++) HX_ASSERT(pit[i] == AU_NOTE_BASE + i, "Chop's notes are not slices 1..8 in order");
    HX_ASSERT(tr->clips[0].notes[3].tick == 3 * 48, "slice 4's step is not at 3/8 of the bar");
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "0");
    hx_set_param(h, "transport", "play");
    hx_render(h, 4);
    HX_ASSERT(hx_stub_feed(4, &first, &energy) > 0 && energy > 0, "the chopped clip played nothing");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 20);

    /* ---- wipe ---- */
    hx_set_param(h, "t4_au_wipe", "0");
    HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 0, "wipe left notes in the clip");

    /* ---- review: clearing an empty clip leaves other clips' voices alone ---- */
    au_note_event(4, 2, 0x90, 100, 0);
    hx_render(h, 1);
    hx_set_param(h, "t4_au_clear", "7");
    hx_stub_feed_reset();
    hx_render(h, 1);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 1, "clearing an empty clip cut the sounding slice");
    hx_render(h, 60);
    /* ...and overdubbing one step again and again never fills the clip */
    tr->recording = 1;
    for (i = 0; i < 700; i++) {
        tr->current_clip_tick = 0;
        hx_set_param(h, "t4_record_note_on", i & 1 ? "e38 100" : "e39 100");
        hx_set_param(h, "t4_record_note_off", i & 1 ? "e38" : "e39");
    }
    tr->recording = 0;
    HX_ASSERT(tr->clips[0].note_count <= 2 && clip_pitches(inst, 4, 0, pit, 64) == 1,
              "overdubbing one step grew the clip's notes");
    /* ...and LIVE ARP on Audio repeats a step of one CHOP, not an octave
     * (Josh, 2026-10-28: "change octave to "step""): Up, Step 2, chop 3 held
     * plays chops 3, 4, 5 */
    hx_set_param(h, "t4_tarp_octaves", "9");
    HX_ASSERT(tr->tarp.octaves == 9, "Step did not reach past an octave's 4 on an Audio track");
    hx_set_param(h, "t4_tarp_octaves", "2");
    tr->tarp_on = 1; tr->tarp.style = 1; tr->tarp.rate_idx = 0;
    live_note_on(inst, tr, AU_NOTE_BASE + 2, 100);
    {
        int seen[AU_MAX_SLICES] = { 0 }, vi, other = 0;
        for (i = 0; i < 400; i++) {
            hx_render(h, 1);
            for (vi = 0; vi < AU_VOICES; vi++) {
                const au_voice_t *v = &inst->au_trk[4].v[vi];
                if (v->active && !v->mode_loop) seen[v->slice] = 1;
            }
        }
        for (vi = 0; vi < AU_MAX_SLICES; vi++) if (seen[vi] && (vi < 2 || vi > 4)) other = 1;
        HX_ASSERT(seen[2] && seen[3] && seen[4] && !other, "LIVE ARP Step 2 did not play chops 3, 4, 5 alone");
    }
    live_note_off(inst, tr, AU_NOTE_BASE + 2);
    tr->tarp_on = 0; tr->tarp.style = 0;
    hx_set_param(h, "t4_tarp_octaves", "0");
    hx_render(h, 60);
    hx_set_param(h, "t4_au_wipe", "0");

    /* ---- a step holds one slice: placed by hand or recorded ---- */
    hx_set_param(h, "t4_c0_step_2_toggle", "2");
    hx_set_param(h, "t4_c0_step_2_toggle", "4");
    HX_ASSERT(tr->clips[0].step_note_count[2] == 1 && tr->clips[0].step_notes[2][0] == 4,
              "a second slice placed on a step did not replace the first");
    hx_set_param(h, "t4_au_wipe", "0");
    tr->recording = 1; tr->current_clip_tick = 0;
    hx_set_param(h, "t4_record_note_on", "e2 100");
    hx_set_param(h, "t4_record_note_off", "e2");
    hx_set_param(h, "t4_record_note_on", "e5 100");
    hx_set_param(h, "t4_record_note_off", "e5");
    n = clip_pitches(inst, 4, 0, pit, 64);
    HX_ASSERT(n == 1 && pit[0] == 5, "recording left two slices on one step");
    /* Loop mode records nothing */
    hx_set_param(h, "t4_au_set_mode", "0 0");
    tr->current_clip_tick = 24 * 4;
    hx_set_param(h, "t4_record_note_on", "e8 100");
    hx_set_param(h, "t4_record_note_off", "e8");
    HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 1, "a Loop clip recorded a slice");
    tr->recording = 0;
    hx_set_param(h, "t4_au_set_mode", "0 1");
    hx_set_param(h, "t4_au_wipe", "0");

    /* ---- formats + refusals ---- */
    snprintf(p, sizeof p, "1|%s/src/st24.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 1) == 2, "the 24-bit stereo WAV did not load");
    as_recorded(h, 4, 1);
    info_state(h, 4, 1, &err, &frames, &rate, &ch, NULL);
    HX_ASSERT(frames == 176400 && rate == 44100 && ch == 2, "24-bit WAV: wrong shape");
    HX_ASSERT(tr->clips[1].length == 32, "a 4 s Loop pick at 120 bpm is not a 2-bar clip");
    snprintf(p, sizeof p, "2|%s/src/loop.aif", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 2) == 2, "the AIFF did not load");
    info_state(h, 4, 2, &err, &frames, &rate, &ch, NULL);
    HX_ASSERT(frames == 22050 && rate == 44100 && ch == 2, "AIFF: wrong shape");
    snprintf(p, sizeof p, "3|%s/src/long.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    st = wait_loaded(h, 4, 3);
    info_state(h, 4, 3, &err, NULL, NULL, NULL, NULL);
    HX_ASSERT(st == 3 && err == AU_ERR_LONG, "a 31-minute file was not refused as too long");
    snprintf(p, sizeof p, "%s/src/mono48.wav", g_root); write_st24(p, 0.25);
    snprintf(p, sizeof p, "4|%s/src/mono48.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 4) == 2, "the second mono48.wav did not load");
    info_state(h, 4, 4, NULL, NULL, NULL, NULL, name);
    HX_ASSERT(!strcmp(name, "mono48~2.wav"), "a different file of the same name overwrote the project's copy");

    /* ---- Loop: follows the clip ---- */
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "1");
    hx_set_param(h, "transport", "play");
    hx_render(h, 3);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) > 0 && blk[0] == 4096 && blk[1] == -4096, "the Loop clip did not play its sample");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_stub_feed_reset();
    hx_render(h, 2);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 0, "the Loop clip kept playing after Stop");

    /* ---- Loop: the sample starts at ITS frame 0 with the clip ---- */
    snprintf(p, sizeof p, "5|%s/src/ramp.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 5) == 2, "the ramp did not load");
    as_recorded(h, 4, 5);
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "5");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) == 1, "the Loop clip did not start");
    HX_ASSERT(blk[0] == 0 && blk[2] == 1 && blk[254] == 127, "the Loop clip did not start at the sample's first frame");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_set_param(h, "launch_quant", "5");
    hx_set_param(h, "t4_launch_clip", "1");
    hx_set_param(h, "transport", "play");
    hx_render(h, 10);
    hx_set_param(h, "t4_launch_clip", "5");
    for (i = 0; i < 2000; i++) {
        hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        if (blk[255] == blk[254] && blk[254] != -4096) break;
    }
    HX_ASSERT(i < 2000, "the launched Loop clip never played");
    HX_ASSERT(blk[254] == 127, "a Loop clip launched on the bar began past its first frame");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "launch_quant", "0");
    hx_render(h, 4);

    /* ---- a sample longer than its bar plays to the bar's last block: the
     * restart waits for the bar (found on the device: it came one block early) ---- */
    snprintf(p, sizeof p, "6|%s/src/ramp3.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 6) == 2, "the long ramp did not load");
    as_recorded(h, 4, 6);
    {
        /* a wide window reads the summary: column 64 is frames 66150..67183 (to 7183 -> 28) */
        char wv[600];
        unsigned hi = 0;
        hx_get_param(h, "t4_au_wave_6_0_132300", wv, sizeof wv);
        sscanf(wv + 64 * 4 + 2, "%2x", &hi);
        HX_ASSERT(strlen(wv) == 512 && hi >= 27 && hi <= 29, "the wide waveform window");
    }
    {
        /* ...and a one-frame spike still shows in a wide window: the summary
         * holds every frame's peak, where sampling the frames would skip it */
        char wv[600];
        unsigned hi = 0;
        snprintf(p, sizeof p, "7|%s/src/spike.wav", g_root);
        hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 7) == 2, "the spike did not load");
        hx_get_param(h, "t4_au_wave_7_0_132300", wv, sizeof wv);
        sscanf(wv + 63 * 4 + 2, "%2x", &hi);
        HX_ASSERT(hi == 20000 / 256, "a one-frame peak vanished from the wide waveform");
    }
    hx_set_param(h, "t4_au_set_len_bars", "6 1");
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "6");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    for (n = 1; n <= 688; n++) hx_render(h, 1);         /* block 688 (from 0) holds frames 88064..88191 */
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == 88064 % 30000 && blk[254] == 88191 % 30000,
              "the loop restarted before its bar ended");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_set_param(h, "t4_launch_clip", "5");

    /* ---- review: a Loop clip with Dir Backward still plays forward, once per pass ---- */
    hx_set_param(h, "t4_c5_dir", "1");
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    hx_render(h, 10);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[255] > 128 * 9, "a Backward Loop clip kept restarting");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "t4_c5_dir", "0");
    hx_render(h, 4);

    /* ---- Loop Revrs: backwards from the end ---- */
    hx_set_param(h, "t4_au_set_revrs", "5 1");
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == 44099 % 30000 && blk[2] == 44098 % 30000, "Revrs did not play the sample backwards from its end");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "t4_au_set_revrs", "5 0");
    hx_render(h, 4);

    /* ---- Loop Nudge: +10 ms = 441 frames of silence first ---- */
    hx_set_param(h, "t4_au_set_nudge", "5 10");
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == 0 && blk[254] == 0, "Nudge +10 ms did not hold the sample back");
    hx_render(h, 3);
    blk = hx_stub_feed_last(4);
    /* block 4 holds frames 384..511: frame 441 is the sample's first */
    HX_ASSERT(blk[(441 - 384) * 2] == 0 && blk[(442 - 384) * 2] == 1 && blk[(511 - 384) * 2] == 70,
              "Nudge +10 ms did not start the sample 441 frames late");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "t4_au_set_nudge", "5 0");
    hx_render(h, 4);

    /* ---- Loop Shift (Josh, 2026-10-30: Stretch and Shift "an audio-based
     * analog of what they do with midi"): the clip's audio rotated 300 ticks
     * later inside its 384 — the transport starts 84 ticks into the sample
     * (its tail wrapped round), and the sample's first frame falls on tick
     * 300, to the frame: in Pitch (the voice starts again there) and in
     * Vintage (the pieces rotate) ---- */
    {
        int mode;
        for (mode = 0; mode < 2; mode++) {
            double fpt = 44100.0 * 60.0 / ((tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0) * PPQN);
            double at0 = 300.0 * fpt;                     /* the frame tick 300 falls on */
            int B = (int)((at0 + 200.0) / 128.0), want, got, f0;
            HX_ASSERT(tr->clips[5].length * (tr->clips[5].ticks_per_step ? tr->clips[5].ticks_per_step : TICKS_PER_STEP) == 384,
                      "the Shift test expects a one-bar clip");
            hx_set_param(h, "t4_au_set_sync", mode ? "5 1" : "5 2");
            hx_set_param(h, "t4_au_set_rot", "5 300");
            HX_ASSERT(inst->au_clip[4][5].rot == 300, "set_rot did not set the Shift");
            hx_stub_feed_reset();
            hx_set_param(h, "transport", "play");
            for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
            blk = hx_stub_feed_last(4);                   /* block 0: frames 0..127 */
            /* the frame tick 0 fell on, read off the sample's 84th tick: Pitch
             * starts on the block, Vintage on the clock's first tick */
            f0 = 127 - (int)((double)blk[127 * 2] - 84.0 * fpt + 0.5);
            HX_ASSERT(blk[127 * 2] > 0 && f0 >= -4 && f0 <= 160,
                      mode ? "Vintage: Shift 300 did not start the transport 84 ticks into the sample"
                           : "Pitch: Shift 300 did not start the transport 84 ticks into the sample");
            /* ...then silence past the sample's end, until the sample starts
             * again from its first frame on tick 300 (within a block: the
             * transport's own start is block-aligned) and plays on at speed */
            for (n = 1; n < B - 4; n++) hx_render(h, 1);
            {
                int found = -1, k, b;
                const int16_t *q;
                for (b = B - 4; b <= B + 4 && found < 0; b++) {
                    hx_render(h, 1);
                    q = hx_stub_feed_last(4);
                    for (k = 1; k < 128; k++) if (q[(k - 1) * 2] == 0 && q[k * 2] > 0 && q[k * 2] < 4) { found = b * 128 + k; break; }
                    if (found >= 0) {
                        int kk = k + 40 < 128 ? k + 40 : 127;
                        HX_ASSERT(q[kk * 2] - q[k * 2] == kk - k, mode ? "Vintage: after the Shift point the sample did not play on at speed"
                                                                         : "Pitch: after the Shift point the sample did not play on at speed");
                    }
                }
                want = (int)(f0 + at0 + 0.5);
                got = found;
                /* Vintage's pieces sit on the clock, to the frame; Pitch starts
                 * on the block the tick falls in, as at the loop's top */
                HX_ASSERT(got >= 0 && got >= want - (mode ? 8 : 160) && got <= want + (mode ? 8 : 160),
                          mode ? "Vintage: Shift 300 did not put the sample's start at tick 300"
                               : "Pitch: Shift 300 did not put the sample's start at tick 300");
            }
            hx_set_param(h, "transport", "stop");
            hx_set_param(h, "t4_au_set_rot", "5 0");
            hx_render(h, 4);
        }
        hx_set_param(h, "t4_au_set_sync", "5 2");
        /* ...and where the sample is still sounding at the Shift's point (a
         * clip shorter than the sample: 4 steps, Shift 2), Pitch jumps back
         * to the sample's first frame there, not on through it */
        {
            uint16_t was_len = tr->clips[5].length;
            double fpt = 44100.0 * 60.0 / ((tr->pfx.cached_bpm > 0 ? tr->pfx.cached_bpm : 120.0) * PPQN);
            uint32_t tps = tr->clips[5].ticks_per_step ? tr->clips[5].ticks_per_step : TICKS_PER_STEP;
            int f0, jump = -1, b, k;
            const int16_t *q;
            tr->clips[5].length = 4;
            snprintf(p, sizeof p, "5 %u", (unsigned)(2 * tps));
            hx_set_param(h, "t4_au_set_rot", p);
            hx_stub_feed_reset();
            hx_set_param(h, "transport", "play");
            for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
            q = hx_stub_feed_last(4);
            f0 = 127 - (int)((double)q[127 * 2] - 2.0 * tps * fpt + 0.5);   /* tick 0 reads the sample 2 steps in */
            HX_ASSERT(q[127 * 2] > 0 && f0 >= -4 && f0 <= 160, "Pitch: a short clip with Shift 2 did not start 2 steps into the sample");
            for (b = 1; b < 120 && jump < 0; b++) {
                hx_render(h, 1);
                q = hx_stub_feed_last(4);
                for (k = 1; k < 128; k++) if (q[k * 2] < q[(k - 1) * 2] - 100) { jump = b * 128 + k; break; }
            }
            HX_ASSERT(jump >= 0 && jump >= (int)(f0 + 2.0 * tps * fpt) - 160 && jump <= (int)(f0 + 2.0 * tps * fpt) + 160,
                      "Pitch: the sounding sample did not cut at the Shift's point");
            /* past the cut's fade (the old voice lets go, as at the loop's top):
             * the sample's opening frames, not on through it (~22000 here) */
            hx_render(h, 2);
            q = hx_stub_feed_last(4);
            HX_ASSERT(q[64 * 2] > 0 && q[64 * 2] < 700, "Pitch: the sounding sample did not go back to its first frame at the Shift's point");
            hx_set_param(h, "transport", "stop");
            hx_set_param(h, "t4_au_set_rot", "5 0");
            tr->clips[5].length = was_len;
            hx_render(h, 4);
        }
        /* Warp reads its map through the Shift: tick r is the clip's own tick 0 */
        {
            au_warp_t *Wt = (au_warp_t *)calloc(1, sizeof *Wt);
            Wt->rpt = 100.0; Wt->cur.rs = 1000; Wt->cur.re = 1000 + 38400; Wt->cur.L = 384.0; Wt->cur.rot = 96.0;
            au_warp_watch_at(Wt, 96.0 * 100.0);
            HX_ASSERT(Wt->read_pos == 1000, "Warp: the Shift's point does not read the sample's first frame");
            au_warp_watch_at(Wt, 0.0);
            HX_ASSERT(Wt->read_pos == 1000 + 288 * 100, "Warp: tick 0 does not read the rotated tail");
            free(Wt);
        }
    }

    /* ---- Trim / Normalize (Josh, 2026-10-30: "trim and normalize options";
     * "dialog: overwrite or new sample"): the loader writes a 16-bit WAV and
     * the clip lands on it with its settings kept ---- */
    {
        au_clip_t *ac = &inst->au_clip[4][13];
        clip_t *lc = &tr->clips[13];
        uint32_t tps, want, i;
        int pk = 0;
        snprintf(p, sizeof p, "%s/src/rampe.wav", g_root); write_ramp(p);
        snprintf(p, sizeof p, "13|%s/src/rampe.wav", g_root);
        hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 13) == 2, "the edit ramp did not load");
        as_recorded(h, 4, 13);
        hx_set_param(h, "t4_au_set_pitch", "13 3");
        tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
        ac->rstart = 1000; lc->length = 4;
        {
            uint16_t bpm0 = ac->bpm10;
            want = (uint32_t)(1000.0 + 4.0 * tps * au_fpt_s(ac, ac->smp) + 0.5) - 1000;
            hx_set_param(h, "t4_au_edit", "13 0 0");               /* Trim, a new sample */
            HX_ASSERT(wait_loaded(h, 4, 13) == 2, "Trim did not land");
            HX_ASSERT(!strcmp(ac->name, "rampe trim.wav"), "Trim's new sample is not \"rampe trim.wav\"");
            HX_ASSERT(ac->smp->pcm && ac->smp->frames + 1 >= want && ac->smp->frames <= want + 1 &&
                      ac->smp->pcm[0] == 1000 && ac->smp->pcm[1] == 1001, "Trim did not keep exactly what the clip plays");
            HX_ASSERT(ac->rstart == 0 && ac->bpm10 == bpm0 && ac->pitch == 3 && lc->length == 4,
                      "Trim did not keep the clip's settings (Start moves to the cut)");
        }
        snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/rampe.wav", g_root);
        HX_ASSERT(au_file_size(p) == 44 + 44100 * 2, "a new-sample Trim touched the original");
        hx_set_param(h, "t4_au_edit", "13 1 0");                   /* Normalize, a new sample */
        HX_ASSERT(wait_loaded(h, 4, 13) == 2 && !strcmp(ac->name, "rampe trim norm.wav"), "Normalize did not land as \"rampe trim norm.wav\"");
        for (i = 0; i < ac->smp->frames; i++) if (ac->smp->pcm[i] > pk) pk = ac->smp->pcm[i];
        HX_ASSERT(pk == 32767 && ac->smp->pcm[0] > 1000, "Normalize did not raise the peak to full scale");
        /* nothing to trim (the clip plays the whole file): no request */
        {
            uint32_t g = ac->gen;
            ac->rstart = 0; lc->length = 256;
            hx_set_param(h, "t4_au_edit", "13 0 0");
            HX_ASSERT(ac->gen == g && ac->state == 2, "a Trim with nothing to cut still ran");
        }
        /* Overwrite: the file itself; another clip on it reloads, moved with the cut */
        {
            au_clip_t *b14 = &inst->au_clip[4][14], *b15 = &inst->au_clip[4][15];
            snprintf(p, sizeof p, "%s/src/rampo.wav", g_root); write_ramp(p);
            snprintf(p, sizeof p, "14|%s/src/rampo.wav", g_root); hx_set_param(h, "t4_au_pick", p);
            HX_ASSERT(wait_loaded(h, 4, 14) == 2, "rampo did not load in 14");
            snprintf(p, sizeof p, "15|%s/src/rampo.wav", g_root); hx_set_param(h, "t4_au_pick", p);
            HX_ASSERT(wait_loaded(h, 4, 15) == 2 && b14->smp == b15->smp, "clips 14 and 15 do not share rampo");
            as_recorded(h, 4, 14);
            b14->rstart = 2000; tr->clips[14].length = 4;
            b15->rstart = 3000;
            hx_set_param(h, "t4_au_edit", "14 0 1");               /* Trim, overwrite */
            HX_ASSERT(wait_loaded(h, 4, 14) == 2 && !strcmp(b14->name, "rampo.wav"), "an overwrite renamed the sample");
            HX_ASSERT(b14->smp->pcm[0] == 2000 && b14->rstart == 0, "the overwrite did not trim clip 14's file");
            for (i = 0; i < 400 && (b15->state != 2 || b15->smp == NULL || b15->smp->pcm[0] != 2000); i++) { hx_render(h, 1); usleep(1000); }
            HX_ASSERT(b15->state == 2 && b15->smp == b14->smp && b15->smp->pcm[0] == 2000 && b15->rstart == 1000,
                      "the other clip on the overwritten file did not reload it, moved with the cut");
        }
        hx_set_param(h, "t4_au_clear", "13");
        hx_set_param(h, "t4_au_clear", "14");
        hx_set_param(h, "t4_au_clear", "15");
        hx_render(h, 4);
    }

    /* ---- Sync Pitch: the tempo sets the speed, so Detune gives way — the
     * loop stays at its Tempo (Warp transposes instead: test_audio_warp) ---- */
    hx_set_param(h, "t4_au_set_detune", "5 30");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    hx_render(h, 2);
    {
        int vi, found = 0;
        double want = (double)inst->au_clip[4][5].smp->rate / 44100.0;    /* its own Tempo = the project's */
        for (vi = 0; vi < AU_VOICES; vi++) {
            const au_voice_t *v = &inst->au_trk[4].v[vi];
            if (v->active && v->mode_loop && !v->rel_len)
                found = v->step > want - 1e-6 && v->step < want + 1e-6;
        }
        HX_ASSERT(found, "Detune moved a Sync Pitch loop off its tempo");
    }
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "t4_au_set_detune", "5 0");
    hx_render(h, 4);

    /* ---- Mute is a bus: the loop plays on silently and comes back in place ---- */
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    hx_render(h, 9);                                    /* 10 blocks: frames 0..1279 */
    hx_set_param(h, "t4_mute", "1");
    hx_render(h, 2);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[0] == 0 && blk[254] == 0, "a muted Loop clip was not silent");
    hx_render(h, 18);                                   /* 30 blocks in all */
    hx_set_param(h, "t4_mute", "0");
    hx_render(h, 1);                                    /* block 30: frames 3840..3967, fading in */
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[254] == 3967, "unmuting restarted the loop instead of carrying on in place");
    HX_ASSERT(blk[0] < 3840 / 8, "unmuting did not fade in");
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- the chops in order play the sample straight through: no cut, no
     * fade at a join (a slice carries on the one sounding, on its tick's
     * frame). A 2 s ramp is exactly a bar at 120 bpm: 16 chops, 16 steps. ---- */
    snprintf(p, sizeof p, "%s/src/ramp2.wav", g_root); write_ramp_len(p, 2.0);
    snprintf(p, sizeof p, "7|%s/src/ramp2.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 7) == 2 && tr->clips[7].length == 16, "the 2 s ramp did not load as a bar");
    hx_set_param(h, "t4_au_set_mode", "7 1");               /* the 16 chops onto the 16 steps */
    HX_ASSERT(clip_pitches(inst, 4, 7, pit, 64) == 16, "the chops were not laid on the steps");
    hx_stub_feed_reset();
    hx_set_param(h, "t4_launch_clip", "7");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    {
        int prev = -1, breaks = 0, k, fed = hx_stub_feed(4, NULL, NULL);
        blk = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++) if (blk[k * 2]) { prev = blk[k * 2]; }   /* the first block: its last frame */
        for (n = 0; n < 660; n++) {                          /* ~84,500 frames: short of the wrap at 88,200 */
            hx_render(h, 1);
            if (hx_stub_feed(4, NULL, NULL) == fed) { breaks++; continue; }   /* nothing fed: silence */
            fed = hx_stub_feed(4, NULL, NULL);
            blk = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++) {
                if (blk[k * 2] != (prev + 1) % 30000) breaks++;
                prev = blk[k * 2];
            }
        }
        HX_ASSERT(breaks == 0, "the chops in order did not play the sample straight through (a cut or a fade at a join)");
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- a slice starts on its tick's frame, not its block's: step 1 is
     * 24 ticks = 5512.5 frames after step 0, mid-block; the slice before it
     * plays on, unfaded, up to that frame ---- */
    hx_render(h, 60);                                         /* the last chop rings out */
    hx_set_param(h, "t4_au_wipe", "7");
    hx_set_param(h, "t4_c7_step_0_toggle", "5");              /* chop 6: not followed by its next */
    hx_set_param(h, "t4_c7_step_1_toggle", "0");              /* chop 1 */
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    {
        long g = 0, start = -1, swap = -1;
        int prev = -1, fed = 0, k;
        for (n = 0; n < 120 && swap < 0; n++) {
            hx_render(h, 1);
            if (hx_stub_feed(4, NULL, NULL) == fed) { g += 128; continue; }
            fed = hx_stub_feed(4, NULL, NULL);
            blk = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++, g++) {
                int v = blk[k * 2];
                if (start < 0) { if (v) { start = g; prev = v; } continue; }
                if (v != (prev + 1) % 30000) { swap = g; break; }
                prev = v;
            }
        }
        HX_ASSERT(start >= 0 && swap - start >= 5511 && swap - start <= 5514,
                  "the next slice did not start on its tick's frame (or the one before it faded early)");
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);

    /* ---- Tempo Vintage (Josh, 2026-10-29: "make it as fine as possible and
     * call it "vintage""): the sample cut on the clock, one piece a tick. At
     * the loop's own tempo it plays the sample straight through, as Free
     * does; at another tempo each piece starts on its own tick ---- */
    hx_render(h, 60);
    hx_set_param(h, "t4_au_wipe", "7");                       /* no steps: Vintage needs none */
    hx_set_param(h, "t4_au_set_mode", "7 0");
    hx_set_param(h, "t4_au_set_sync", "7 1");
    HX_ASSERT(inst->au_clip[4][7].sync == AU_SYNC_VINTAGE && clip_pitches(inst, 4, 7, pit, 64) == 0,
              "Tempo did not go to Vintage (or wrote steps)");
    /* ...as recorded: the chops' own sound is Slice's, and Vintage ignores it
     * (Josh: "attack/decay shouldn't play into it") — straight through below */
    hx_set_param(h, "t4_au_all_atk", "7 12");
    hx_set_param(h, "t4_au_all_dec", "7 30");
    hx_set_param(h, "t4_au_all_pitch", "7 3");
    hx_set_param(h, "t4_au_all_gain", "7 -6");
    hx_set_param(h, "t4_au_all_rev", "7 1");
    hx_set_param(h, "t4_au_all_play", "7 1");
    HX_ASSERT(inst->au_clip[4][7].sl[1].attack_ms == 12 && inst->au_clip[4][7].sl[1].pitch == 3 && inst->au_clip[4][7].sl[1].play == 1,
              "the chops' own sound did not set");
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    {
        int prev = -1, breaks = 0, k, fed = hx_stub_feed(4, NULL, NULL), chops = 0, vi;
        blk = hx_stub_feed_last(4);
        for (k = 0; k < 128; k++) if (blk[k * 2]) prev = blk[k * 2];
        for (n = 0; n < 660; n++) {
            hx_render(h, 1);
            for (vi = 0; vi < AU_VOICES; vi++)
                if (inst->au_trk[4].v[vi].active && !inst->au_trk[4].v[vi].mode_loop) chops = 1;
            if (hx_stub_feed(4, NULL, NULL) == fed) { breaks++; continue; }
            fed = hx_stub_feed(4, NULL, NULL);
            blk = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++) {
                if (blk[k * 2] != (prev + 1) % 30000) breaks++;
                prev = blk[k * 2];
            }
        }
        HX_ASSERT(chops, "Vintage played the loop voice, not its pieces");
        HX_ASSERT(breaks == 0, "Vintage at the loop's own tempo did not play the sample straight through");
    }
    hx_set_param(h, "transport", "stop");
    hx_render(h, 60);
    /* at 150 bpm a tick is 183.75 frames and holds 229.6875 of the sample (a
     * tick at its own 120): each piece plays on from the last until it has
     * fallen too far behind (au_range_on's join), then the sample jumps to
     * where its tick says — always ON a tick, always to that tick's frame.
     * The jump is a CROSSFADE (AU_VINTAGE_XF): it shows as the ramp rising
     * faster than a frame a frame, from the tick's frame; read 140 frames on,
     * past the fade and before the next tick, it is that tick's place */
    hx_set_param(h, "bpm", "150");
    hx_render(h, 2);
    hx_stub_feed_reset();
    hx_set_param(h, "transport", "play");
    {
        long g = 0, start = -1, chk = -1, want = 0;
        int prev = -1, v0 = 0, fed = 0, k, ns = 0, bad = 0;
        for (n = 0; n < 400 && ns < 6; n++) {
            hx_render(h, 1);
            if (hx_stub_feed(4, NULL, NULL) == fed) { g += 128; continue; }
            fed = hx_stub_feed(4, NULL, NULL);
            blk = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++, g++) {
                int v = blk[k * 2];
                if (start < 0) { if (v) { start = g; prev = v0 = v; } continue; }
                if (chk < 0 && v - prev > 1 && v - prev < 20000) {
                    /* a piece starting (the crossfade's first frame): on a tick */
                    /* (no libm: run.sh links none, and Linux has no implicit -lm) */
                    double d = (double)(g - 1 - start), j = (double)(long)(d / 183.75 + 0.5), e = d - j * 183.75;
                    /* the fade's first frames barely tilt the ramp: seen a frame or few late */
                    if (e > 6 || e < -3) bad++;
                    want = ((long)v0 + (long)(j * 229.6875 + 0.5) + 141) % 30000;
                    chk = g + 140;
                }
                if (g == chk) {
                    /* ...from its tick's frame (the fades round a few units) */
                    if (labs((long)v - want) > 4) bad++;
                    chk = -1; ns++;
                }
                prev = v;
            }
        }
        HX_ASSERT(start >= 0 && ns >= 3, "Vintage at 150 bpm never caught the sample up to the clock");
        HX_ASSERT(bad == 0, "a Vintage piece at 150 bpm did not start on a tick, at that tick's frame");
    }
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t4_au_set_sync", "7 2");
    hx_set_param(h, "t4_au_all_atk", "7 0");
    hx_set_param(h, "t4_au_all_dec", "7 0");
    hx_set_param(h, "t4_au_all_pitch", "7 0");
    hx_set_param(h, "t4_au_all_gain", "7 0");
    hx_set_param(h, "t4_au_all_rev", "7 0");
    hx_set_param(h, "t4_au_all_play", "7 0");
    hx_render(h, 60);
    hx_set_param(h, "t4_launch_clip", "5");

    /* ---- Tempo (Josh, 2026-10-28: "A", then "both"): Vintage places the
     * pieces by the SAMPLE's own Bars; Pitch retunes the loop to fill them.
     * Fit is gone (Josh, 2026-10-29): it loads and sets as Vintage ---- */
    {
        au_clip_t *ac = &inst->au_clip[4][7];
        clip_t *lc = &tr->clips[7];
        uint16_t was_len = lc->length;
        int b16, b128;
        hx_set_param(h, "t4_launch_clip", "7");
        hx_render(h, 4);
        hx_set_param(h, "t4_au_set_bpm", "7 1200");               /* ramp2 is 2 s: 1 bar at 120 */
        lc->length = 8;                                         /* the clip: half of it */
        hx_set_param(h, "t4_au_set_sync", "7 1");
        hx_set_param(h, "t4_au_set_even", "7 16");
        b16 = ramp_breaks(h, 300);                              /* 300 blocks < the half bar's 344 */
        hx_set_param(h, "t4_au_set_even", "7 128");
        b128 = ramp_breaks(h, 300);
        HX_ASSERT(b16 == 0 && b128 == 0, "Vintage on a clip half the sample's Bars did not play its first half as recorded (or the chop count changed it)");
        hx_set_param(h, "t4_au_set_sync", "7 9");              /* past the last value */
        HX_ASSERT(ac->sync == AU_SYNC_MAX, "a Sync past the last did not clamp to it");
        hx_set_param(h, "t4_au_set_sync", "7 1");
        /* Nudge earlier on Vintage starts the loop further in, as Free's does:
         * the pieces before the clip's start never play (wrapped to its end
         * they fought the pieces due there, a cut every tick — found by
         * review). 340 blocks reach the clip's last ticks, short of its wrap. */
        hx_set_param(h, "t4_au_set_nudge", "7 -50");
        HX_ASSERT(ramp_breaks(h, 340) == 0, "Vintage nudged -50 ms broke up at the clip's end");
        hx_set_param(h, "t4_au_set_nudge", "7 0");
        /* a followed clock (Move's): Vintage plays the loop straight, forwards and in Revrs, from the sample's first frame (it was
         * silent, every piece just past the block's window; then, each 0xF8
         * bringing 4 ticks at frame 0, the third piece cut the first two;
         * then the first pulse played only its last tick) */
        {
            const uint8_t st = 0xFA, clk = 0xF8, sp = 0xFC;
            int mode, silent[3], brk[3], first[3];
            uint16_t was16 = lc->length;
            lc->length = 16;                                    /* the whole bar */
            for (mode = 0; mode < 3; mode++) {                  /* Pitch, Vintage, Vintage Revrs */
                int prev = -1, k2, rev = mode == 2;
                hx_set_param(h, "t4_au_set_sync", mode ? "7 1" : "7 2");
                hx_set_param(h, "t4_au_set_revrs", rev ? "7 1" : "7 0");
                hx_set_param(h, "clock_follow_on", "1");
                hx_stub_feed_reset();
                hx_send_midi(h, &st, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 1;
                hx_render(h, 2);
                silent[mode] = brk[mode] = 0; first[mode] = -1;
                /* one 0xF8 every 7 blocks (896 frames: ~123 bpm on a 120 bpm
                 * loop); breaks and silence count after the first 96 blocks */
                for (i = 0; i < 96 * 7; i++) {
                    int before = hx_stub_feed(4, NULL, NULL);
                    const int16_t *fb;
                    if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
                    hx_render(h, 1);
                    fb = hx_stub_feed(4, NULL, NULL) == before ? NULL : hx_stub_feed_last(4);
                    for (k2 = 0; fb && first[mode] < 0 && k2 < 128; k2++) if (fb[k2 * 2]) first[mode] = fb[k2 * 2];
                    if (i < 96) continue;
                    if (!fb) { silent[mode]++; prev = -1; continue; }
                    for (k2 = 0; k2 < 128; k2++) {
                        int want = rev ? (prev - 1 + 30000) % 30000 : (prev + 1) % 30000;
                        if (!fb[k2 * 2]) silent[mode]++;
                        else if (prev >= 0 && fb[k2 * 2] != want) brk[mode]++;
                        prev = fb[k2 * 2];
                    }
                }
                hx_send_midi(h, &sp, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 0;
                hx_set_param(h, "clock_follow_on", "0");
                hx_set_param(h, "transport", "stop");
                hx_render(h, 60);
            }
            hx_set_param(h, "t4_au_set_revrs", "7 0");
            /* Pitch (Free's place since it left) sounds throughout; it retunes
             * to the clock, so its "breaks" are the resampling, not cuts */
            HX_ASSERT(silent[0] < 64, "the Pitch control went silent under a followed clock");
            /* Vintage's breaks: a cut each time the slightly fast clock pulls
             * it AU_JOIN ahead (~6 here, ~390 samples); a cut a pulse would be
             * thousands */
            HX_ASSERT(silent[1] < 64 && silent[2] < 64, "Vintage fell silent under a followed clock");
            HX_ASSERT(brk[1] < 1000, "Vintage broke up under a followed clock");
            HX_ASSERT(brk[2] < 1000, "Vintage in Revrs broke up under a followed clock");
            HX_ASSERT(first[1] >= 0 && first[1] <= 2, "Vintage's first pulse did not start at the sample's first frame");
            /* the clip counter jumping (Loop moved, Dir changed) without the
             * loop restarting: Vintage plays on from where the clip now is,
             * no burst */
            {
                const int16_t *fb;
                int v0 = -1, v1 = -1, k3;
                hx_set_param(h, "t4_au_set_sync", "7 1");
                hx_set_param(h, "clock_follow_on", "1");
                hx_send_midi(h, &st, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 1;
                for (i = 0; i < 70; i++) { if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL); hx_render(h, 1); }
                fb = hx_stub_feed_last(4);
                for (k3 = 0; k3 < 128; k3++) if (fb[k3 * 2]) v0 = fb[k3 * 2];
                tr->current_step = (uint16_t)((tr->current_step + 8) % 16);   /* half a bar on */
                for (i = 0; i < 7; i++) { if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL); hx_render(h, 1); }
                fb = hx_stub_feed_last(4);
                for (k3 = 0; k3 < 128; k3++) if (fb[k3 * 2]) v1 = fb[k3 * 2];
                /* 7 blocks on and half the bar (44100 frames) further */
                HX_ASSERT(v0 > 0 && v1 > 0 && abs((v1 - v0 + 2 * 30000 - 44100 % 30000) % 30000 - 7 * 128) < 2000,
                          "Vintage did not play on from where a jumped clip counter is");
                hx_send_midi(h, &sp, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 0;
                hx_set_param(h, "clock_follow_on", "0");
                hx_set_param(h, "transport", "stop");
                hx_render(h, 60);
            }
            /* Record with a count-in under a followed clock: the count-in's
             * end resets the 32-bit master tick inside the block, and the
             * tick count underflowed — the render never returned (a frozen
             * Move: found by review). Vintage plays on after it. */
            {
                int guard = 0, fedafter = 0, before;
                hx_set_param(h, "t4_au_set_sync", "7 1");
                hx_set_param(h, "clock_follow_on", "1");
                hx_send_midi(h, &st, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 1;
                for (i = 0; i < 70; i++) { if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL); hx_render(h, 1); }
                hx_set_param(h, "record_count_in", "1");          /* a count-in, then track 1 records */
                HX_ASSERT(inst->count_in_ticks > 0, "no count-in started");
                signal(SIGALRM, on_hang);
                alarm(10);
                /* the ticks a block consumed: the difference, or — the master
                 * tick reset to 0 inside the block — the ticks since */
                HX_ASSERT(au_block_ticks(40, 36) == 4 && au_block_ticks(3, 420) == 3 && au_block_ticks(0, 420) == 0 &&
                          au_block_ticks(500, 36) == AU_VINTAGE_PER_BLOCK, "au_block_ticks miscounts");
                /* and au_wrap ends for any input (the audio thread calls it) */
                HX_ASSERT(au_wrap(-1.8e19, 384.0) >= 0.0 && au_wrap(-1.8e19, 384.0) < 384.0 &&
                          au_wrap(1e30, 384.0) == 0.0 && au_wrap(-5.0, 4.0) == 3.0 && au_wrap(9.5, 4.0) == 1.5,
                          "au_wrap is wrong for a far-out or ordinary value");
                while (inst->count_in_ticks > 0 && guard++ < 20000) {
                    if (guard % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
                    hx_render(h, 1);
                }
                HX_ASSERT(inst->count_in_ticks == 0, "the count-in never ended");
                hx_stub_feed_reset(); before = hx_stub_feed(4, NULL, NULL);
                for (i = 0; i < 70; i++) {
                    if (i % 7 == 0) hx_send_midi(h, &clk, 1, MOVE_MIDI_SOURCE_INTERNAL);
                    hx_render(h, 1);
                    if (hx_stub_feed(4, NULL, NULL) != before) { fedafter++; before = hx_stub_feed(4, NULL, NULL); }
                }
                alarm(0);
                HX_ASSERT(fedafter > 50, "Vintage did not play on after a count-in under a followed clock");
                hx_send_midi(h, &sp, 1, MOVE_MIDI_SOURCE_INTERNAL);
                inst->playing = 0;
                hx_set_param(h, "clock_follow_on", "0");
                hx_set_param(h, "transport", "stop");
                inst->tracks[1].recording = 0;                  /* the count-in's take, done */
                inst->tracks[1].clip_playing = 0;
                hx_render(h, 60);
            }
            lc->length = was16;
            hx_set_param(h, "bpm", "120");                      /* the followed clock left ~123 */
            hx_render(h, 2);
        }
        hx_set_param(h, "t4_au_set_sync", "7 1");
        /* Pitch: Start..End (88200 frames) over the sample's Bars, not the
         * clip (Josh: "does pitch sync'ing not respect the set bars?"): 1 bar
         * at 120 is 2 s = as recorded, though the clip is half a bar; 2 bars
         * is half speed */
        hx_set_param(h, "t4_au_set_sync", "7 2");
        hx_set_param(h, "transport", "play");
        hx_render(h, 8);
        {
            const au_voice_t *lv = NULL;
            for (i = 0; i < AU_VOICES; i++)
                if (inst->au_trk[4].v[i].active && inst->au_trk[4].v[i].mode_loop && !inst->au_trk[4].v[i].rel_len) lv = &inst->au_trk[4].v[i];
            HX_ASSERT(lv && lv->step > 1.0 - 1e-9 && lv->step < 1.0 + 1e-9, "Pitch did not retune the loop to its Bars (1)");
            hx_set_param(h, "t4_au_set_bpm", "7 2400");
            hx_render(h, 2);
            HX_ASSERT(lv->active && lv->step > 0.5 - 1e-9 && lv->step < 0.5 + 1e-9, "Pitch did not retune the loop to its Bars (2)");
            hx_set_param(h, "t4_au_set_bpm", "7 1200");
        }
        hx_set_param(h, "transport", "stop");
        hx_render(h, 60);

        /* the user's chops play no part (Josh, 2026-10-29: "chops should just
         * be completely invisible in loop mode"): a hand set whose first chop
         * is a quarter in still plays Start..End whole on Vintage */
        {
            au_slice_t bak[2];
            uint8_t be = ac->even, bn = ac->nslices;
            int bh;
            memcpy(bak, ac->sl, sizeof bak);
            lc->length = 16;
            hx_set_param(h, "t4_au_set_sync", "7 1");
            ac->even = 0; ac->nslices = 2;
            memset(ac->sl, 0, 2 * sizeof ac->sl[0]);
            ac->sl[0].start = 22050; ac->sl[1].start = 66150;
            bh = ramp_breaks(h, 300);
            HX_ASSERT(bh == 0, "Vintage followed the user's chops");
            ac->even = be; ac->nslices = bn;
            memcpy(ac->sl, bak, sizeof bak);
            lc->length = 8;
        }

        /* Loop + steps on a Loop clip picks the part of the sample under the
         * window, the steps laid over the sample from Start at its Tempo
         * (Josh: "a loop length in loop mode that directly changes the
         * start/end point"); Start itself stays — the window is read live */
        {
            uint32_t ors = ac->rstart, rs, re;
            uint16_t ols = lc->loop_start, olen = lc->length;
            uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
            double per = au_fpt_s(ac, ac->smp) * tps;                   /* frames a step */
            snprintf(p, sizeof p, "%d", (4 << 16) | 8);
            hx_set_param(h, "t4_c7_loop_set", p);
            HX_ASSERT(lc->loop_start == 4 && lc->length == 8, "the window was not set");
            au_range(ac, ac->smp, &rs, &re);
            HX_ASSERT(ac->rstart == ors && rs + 1 >= (uint32_t)(4 * per) && rs <= (uint32_t)(4 * per) + 1 &&
                      re == ac->smp->frames, "the Loop window did not move where the sample is read from (or Start moved)");
            {
                char b[256];
                uint32_t got = 0;
                hx_get_param(h, "t4_au_info_7", b, sizeof b);
                sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
                HX_ASSERT(got + 1 >= (uint32_t)(8 * per) && got <= (uint32_t)(8 * per) + 1, "the window's 8 steps are not what sounds");
            }
            ac->mode = AU_MODE_SLICE;
            hx_set_param(h, "t4_c7_loop_set", "16");
            au_range(ac, ac->smp, &rs, &re);
            HX_ASSERT(rs == ors, "a Slice clip's window moved what it chops");
            ac->mode = AU_MODE_LOOP;
            lc->loop_start = ols; lc->length = olen;
        }

        /* >Seq: each chop on the step of its place in the sample's own Bars */
        hx_set_param(h, "t4_au_set_sync", "7 2");
        hx_set_param(h, "t4_au_set_even", "7 16");
        hx_set_param(h, "t4_au_chop", "7");                     /* a set length stays: 8 steps */
        {
            int got = clip_pitches(inst, 4, 7, pit, 64);
            HX_ASSERT(got == 16 && lc->length == 8, ">Seq on a set length did not lay all 16 chops (8 out of bounds)");
            for (i = 0; i < lc->note_count; i++)
                if (lc->notes[i].active && lc->notes[i].pitch == AU_NOTE_BASE + 12)
                    HX_ASSERT(lc->notes[i].tick == 12u * (lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP),
                              ">Seq did not put chop 13 on step 13 of the sample's bar");
        }
        hx_set_param(h, "t4_au_set_bpm", "7 2400");
        hx_set_param(h, "t4_au_chop", "7 1");                   /* grow: the clip takes the 2 bars */
        HX_ASSERT(lc->length * (lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP) == 2u * PPQN * 4,
                  ">Seq with grow did not make the clip the sample's 2 bars");
        for (i = 0; i < lc->note_count; i++)
            if (lc->notes[i].active && lc->notes[i].pitch == AU_NOTE_BASE + 5)
                HX_ASSERT(lc->notes[i].tick == 10u * TICKS_PER_STEP, ">Seq over 2 bars did not put chop 6 on step 11");
        hx_set_param(h, "t4_au_wipe", "7");
        lc->length = was_len;
        (void)ac;
    }

    /* ---- the guess at a sample's own Tempo: a tempo in its name, else bars
     * in its name, else its beats, else the project's tempo (Josh: "is there
     * a better way to evaluate loop lengths algorithimically?"; then
     * 2026-10-29: the Tempo is the stored fact, and a tail must not skew it) ---- */
    {
        static const struct { const char *file; double secs, bpm; int want; } G[] = {
            { "Pad 4bar.wav",          6.0,   0, 1600 },   /* 4 bars in its 6 s: 160 (3 bars at 120) */
            { "Break Phenom 84 bpm.wav", 2 * 240.0 / 84, 0, 840 },   /* the name's tempo */
            { "Loop 100 bpm tail.wav", 2 * 240.0 / 100 + 0.3, 0, 1000 }, /* a tail after 2 bars at 100: still 100 */
            { "clicks80.wav",          2 * 240.0 / 80, 80, 800 },  /* its beats: 2 bars at 80 */
            { "clicks90.wav",          2 * 240.0 / 90, 90, 900 },  /* 90 (2 bars) over 180 (4): its 8ths are silent */
            { "quiet.wav",             3.0,   0, 1200 },   /* nothing to go on: the project's 120 */
        };
        int g;
        for (g = 0; g < 6; g++) {
            snprintf(p, sizeof p, "%s/src/%s", g_root, G[g].file);
            if (G[g].bpm > 0) write_clicks(p, G[g].secs, G[g].bpm);
            else {
                /* silence of the length: nothing for the beats to find */
                FILE *f = fopen(p, "wb");
                uint32_t nn = (uint32_t)(44100 * G[g].secs), q;
                fwrite("RIFF", 1, 4, f); put_le32(f, 36 + nn * 2); fwrite("WAVEfmt ", 1, 8, f);
                put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
                put_le16(f, 2); put_le16(f, 16);
                fwrite("data", 1, 4, f); put_le32(f, nn * 2);
                for (q = 0; q < nn; q++) put_le16(f, 0);
                fclose(f);
            }
            snprintf(p, sizeof p, "12|%s/src/%s", g_root, G[g].file);
            hx_set_param(h, "t4_au_pick", p);
            HX_ASSERT(wait_loaded(h, 4, 12) == 2, "a guess sample did not load");
            if (inst->au_clip[4][12].bpm10 != G[g].want) {
                fprintf(stderr, "%s: bpm10 %d, want %d\n", G[g].file, inst->au_clip[4][12].bpm10, G[g].want);
                HX_ASSERT(0, "the Tempo guess is wrong");
            }
        }
        HX_ASSERT(tr->clips[12].length * (tr->clips[12].ticks_per_step ? tr->clips[12].ticks_per_step : TICKS_PER_STEP) == 2u * PPQN * 4,
                  "a Loop pick did not set the clip to the sample's length in whole bars at its Tempo");
        hx_set_param(h, "t4_au_clear", "12");
    }

    /* ---- copy / cut / clear carry the sample; a mismatched paste is refused ---- */
    hx_set_param(h, "clip_copy", "4 0 4 9");
    HX_ASSERT(!strcmp(inst->au_clip[4][9].name, "mono48.wav") && inst->au_clip[4][9].mode == AU_MODE_SLICE &&
              inst->au_clip[4][9].sl[1].gain_db == -6, "a copied clip did not carry its sample and settings");
    HX_ASSERT(wait_loaded(h, 4, 9) == 2 && inst->au_clip[4][9].smp == inst->au_clip[4][0].smp,
              "the copy did not load the same sample (once)");
    hx_set_param(h, "t1_c0_step_0_toggle", "60");
    hx_set_param(h, "clip_copy", "1 0 4 10");
    HX_ASSERT(tr->clips[10].note_count == 0, "a melodic clip pasted onto an Audio track");
    hx_set_param(h, "clip_copy", "4 0 1 3");
    HX_ASSERT(inst->tracks[1].clips[3].note_count == 0, "an Audio clip pasted onto a melodic track");
    hx_set_param(h, "clip_cut", "4 9 4 11");
    HX_ASSERT(!inst->au_clip[4][9].name[0] && !strcmp(inst->au_clip[4][11].name, "mono48.wav"), "a cut did not move the sample");
    /* Delete + track clears the sequence only (Josh, 2026-10-28: "shouldn't
     * clear the sample - only clear the sequence"); Shift + Delete + track
     * (`_hard_reset`) is the sample and every setting */
    HX_ASSERT(wait_loaded(h, 4, 11) == 2, "the cut clip did not load");
    tr->clips[11].length = 48;
    hx_set_param(h, "t4_au_set_gain", "11 -7");
    hx_set_param(h, "t4_au_chop", "11");
    HX_ASSERT(tr->clips[11].note_count > 0, "no sequence to clear");
    hx_set_param(h, "t4_c11_clear", "");
    HX_ASSERT(clip_pitches(inst, 4, 11, pit, 64) == 0, "clearing an Audio clip kept its sequence");
    HX_ASSERT(!strcmp(inst->au_clip[4][11].name, "mono48.wav") && inst->au_clip[4][11].smp &&
              inst->au_clip[4][11].gain_db == -7 && tr->clips[11].length == 48,
              "clearing an Audio clip's sequence lost its sample, settings or length");
    hx_set_param(h, "row_clear", "11");
    HX_ASSERT(inst->au_clip[4][11].smp && tr->clips[11].length == 48, "clearing the row lost the Audio clip's sample or length");
    hx_set_param(h, "t4_c11_hard_reset", "");
    HX_ASSERT(!inst->au_clip[4][11].name[0] && !inst->au_clip[4][11].smp && inst->au_clip[4][11].gain_db == 0,
              "the full reset kept the sample or a setting");
    HX_ASSERT(inst->au_clip[4][0].smp, "resetting a copy let the original's sample go");

    /* ---- detune: cents on top of the semitones, clip + slice ---- */
    HX_ASSERT(au_tune(0, 50) > 1.0293022366 && au_tune(0, 50) < 1.0293022367 &&
              au_tune(1, -100) > 0.9999999 && au_tune(1, -100) < 1.0000001, "au_tune is not 2^(st/12 + ct/1200)");
    hx_set_param(h, "t4_au_set_detune", "0 -17");
    hx_set_param(h, "t4_au_slice_detune", "0 1 9");
    HX_ASSERT(inst->au_clip[4][0].detune == -17 && inst->au_clip[4][0].sl[1].detune == 9, "detune did not set");
    hx_set_param(h, "t4_au_set_detune", "0 99");
    HX_ASSERT(inst->au_clip[4][0].detune == 50, "detune is not clamped to 50 cents");
    hx_set_param(h, "t4_au_set_detune", "0 -17");
    hx_set_param(h, "t4_launch_clip", "0");
    hx_render(h, 1);
    HX_ASSERT(tr->active_clip == 0, "clip A is not the one playing");
    au_note_event(4, 1, 0x90, 100, 0);
    {
        int vi, found = 0;
        double want = au_tune(inst->au_clip[4][0].pitch + inst->au_clip[4][0].sl[1].pitch, -8) * 48000.0 / 44100.0;
        for (vi = 0; vi < AU_VOICES; vi++) {
            const au_voice_t *v = &inst->au_trk[4].v[vi];
            if (v->active && !v->rel_len && v->slice == 1) {
                double st = v->step < 0 ? -v->step : v->step;
                found = st > want - 1e-9 && st < want + 1e-9;
            }
        }
        HX_ASSERT(found, "a slice does not play at the clip's detune plus its own");
    }
    hx_render(h, 2);
    {
        char b[256];
        hx_get_param(h, "t4_au_sl_0_1", b, sizeof b);
        HX_ASSERT(strlen(b) > 2 && !strcmp(b + strlen(b) - 2, " 9"), "sl_C_L does not end with the slice's detune");
        hx_get_param(h, "t4_au_info_0", b, sizeof b);
        HX_ASSERT(strstr(b, " -17 0 "), "info_C does not carry the clip's detune, then its Tempo");
    }

    /* ---- reach (Josh, 2026-10-28: "pads outside of the current end point
     * should be shown as gray"): how much of the sample sounds before the
     * clip comes round — the clip's window at the sample's own Tempo, less
     * Nudge; all of it, and no further, when the clip outlasts the sample ---- */
    {
        char b[256];
        au_clip_t *ac = &inst->au_clip[4][7];
        clip_t *lc = &inst->tracks[4].clips[7];
        uint16_t was_len = lc->length;
        uint32_t rs, re, got = 0;
        uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
        hx_set_param(h, "t4_au_set_sync", "7 2");
        hx_set_param(h, "t4_au_set_bpm", "7 1200");             /* ramp2 is 2 s: 1 bar at 120 */
        lc->length = 1;                                        /* one step: well short of the sample */
        double one = (double)tps * au_fpt_s(ac, ac->smp);
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        HX_ASSERT(got + 1 >= (uint32_t)one && got <= (uint32_t)one + 1, "reach is not one step of the sample at its Tempo");
        {
            /* ...and the end the screen shows is where it stops: Start + its
             * length at the Tempo, not the file's end (the clip reads on past it) */
            uint32_t irs = 0, ire = 0;
            sscanf(b, "%*d %*d %*d %*d %*d %*d %u %u", &irs, &ire);
            HX_ASSERT(ire - irs + 1 >= (uint32_t)one && ire - irs <= (uint32_t)one + 1 && ire < ac->smp->frames,
                      "a Loop clip's info end is not Start + its length");
        }
        lc->length = 256;                                       /* the clip outlasts it: all of it */
        au_range(ac, ac->smp, &rs, &re);
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        HX_ASSERT(re == ac->smp->frames && got == re - rs, "a clip longer than the sample does not reach its end, and stop there");
        lc->length = 1;
        /* Vintage at 240: the sample is 2 bars, one step its 32nd part */
        hx_set_param(h, "t4_au_set_sync", "7 1");
        hx_set_param(h, "t4_au_set_bpm", "7 2400");
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        {
            double want = (double)tps * (double)ac->smp->frames / (2.0 * PPQN * 4);
            HX_ASSERT(got + 1 >= (uint32_t)want && got <= (uint32_t)want + 1, "Vintage's reach is not one step of the sample's 2 bars");
        }
        hx_set_param(h, "t4_au_set_sync", "7 2");
        lc->length = was_len;
    }

    /* ---- the project file keeps it (Tempo and the PAD MODE Layout too) ---- */
    hx_set_param(h, "t4_au_set_sync", "7 1");
    hx_set_param(h, "t4_au_set_bpm", "7 2400");
    hx_set_param(h, "t4_au_layout", "1");
    hx_set_param(h, "t4_au_set_rot", "7 12");                 /* Shift */
    /* the arp's octaves load by track type: Audio's Step keeps 15, a pitched
     * track's 15 (only a hand edit or an old build could write it) loads as 4 */
    hx_set_param(h, "t4_tarp_octaves", "15");
    HX_ASSERT(inst->tracks[6].pad_mode != PAD_MODE_AUDIO, "t6 is still Audio");
    inst->tracks[6].tarp.octaves = 15;
    n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
    HX_ASSERT(strstr(blob, " 1 2400 50 12|ramp2.wav\"") && strstr(blob, "\"t4_aul\":1"), "the state does not keep Sync Vintage, the Tempo, the Shift or the Layout");
    HX_ASSERT(n > 0 && (size_t)n < sizeof blob - 1, "state_full failed");
    HX_ASSERT(strstr(blob, "\"t4_pm\":3") && strstr(blob, "\"t4c0_au3\":\"1 8 1 16 0 0 0 0 0 0 0 -17 0 ") && strstr(blob, "|mono48.wav\""),
              "the state does not carry the Audio track and clip A");
    HX_ASSERT(!strstr(blob, "\"t4_au\""), "the state still writes the old Audio flag");
    HX_ASSERT(strstr(blob, "\"t4c0s1_au2\":\""), "the state does not carry slice 2's settings");
    {
        FILE *wf = fopen(inst->state_path, "w");
        HX_ASSERT(wf && fwrite(blob, 1, (size_t)n, wf) == (size_t)n, "write state");
        fclose(wf);
    }
    hx_destroy(h);
    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "the reload lost the Audio track");
    HX_ASSERT(inst->au_clip[4][7].sync == AU_SYNC_VINTAGE && inst->au_clip[4][7].bpm10 == 2400 && inst->au_clip[4][7].rot == 12 &&
              inst->au_trk[4].layout == 1, "the reload lost Sync Vintage, the Tempo, the Shift or the Layout");
    HX_ASSERT(inst->tracks[4].tarp.octaves == 15 && inst->tracks[6].tarp.octaves == 4,
              "the arp's octaves did not load by track type");
    HX_ASSERT(inst->au_clip[4][0].mode == AU_MODE_SLICE && inst->au_clip[4][0].sl[1].gain_db == -6 &&
              inst->au_clip[4][0].sl[1].play == AU_PLAY_GATE, "the reload lost clip A's settings");
    HX_ASSERT(inst->au_clip[4][0].detune == -17 && inst->au_clip[4][0].sl[1].detune == 9, "the reload lost the detunes");
    HX_ASSERT(wait_loaded(h, 4, 0) == 2 && wait_loaded(h, 4, 2) == 2, "the reload did not load the samples");
    HX_ASSERT(inst->au_clip[4][0].smp && inst->au_clip[4][0].smp->frames == 48000, "clip A's sample is not the saved one");

    /* ---- a chop's end fades back the way it came (Josh: "a very short fade
     * out on slice end so it doesn't click?"), never a hard stop ---- */
    {
        au_voice_t v;
        int32_t acc[2 * 128];
        memset(&v, 0, sizeof v);
        v.smp = inst->au_clip[4][0].smp;
        v.lo = 1000; v.hi = 2000; v.pos = 1990; v.step = 1.0; v.gain = 1.0f; v.starve = 64; v.active = 1;
        memset(acc, 0, sizeof acc);
        au_voice_render(&v, acc, 64);
        HX_ASSERT(v.active && v.tail && v.step < 0 && v.pos < 2000 && v.pos > 1900, "the end did not turn into a tail");
        memset(acc, 0, sizeof acc);
        au_voice_render(&v, acc, 128);
        HX_ASSERT(!v.active, "the tail did not end within AU_TAIL frames");
    }

    /* ---- leaving Audio: samples let go, steps cleared (Q3) ---- */
    hx_set_param(h, "t4_au_chop", "0");
    HX_ASSERT(inst->tracks[4].clips[0].note_count == 8, "chop after reload");
    hx_set_param(h, "t4_convert_to_melodic", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_MELODIC_SCALE, "leaving Audio did not make the track melodic");
    HX_ASSERT(!inst->au_clip[4][0].smp && !inst->au_clip[4][0].name[0], "leaving Audio kept clip A's sample");
    HX_ASSERT(inst->tracks[4].clips[0].note_count == 0, "leaving Audio kept the slice steps");
    hx_destroy(h);

    /* ---- review: the plain pad_mode key leaves Audio the convert's way ---- */
    h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t2_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/st24.wav", g_root);
    hx_set_param(h, "t2_au_pick", p);
    HX_ASSERT(wait_loaded(h, 2, 0) == 2, "pick for the pad_mode check");
    hx_set_param(h, "t2_pad_mode", "1");
    HX_ASSERT(inst->tracks[2].pad_mode == PAD_MODE_DRUM && !inst->au_clip[2][0].smp, "pad_mode left Audio holding its samples");
    hx_destroy(h);

    /* ---- an older clip line (Bars and End, `_au2` / `_au`) is not read:
     * Audio tracks are unreleased (Josh, 2026-10-28: "preserving backward
     * compatibility with pre release projects/clips/etc is unecessary"), and
     * read as Start + Length its End would be a nonsense Length ---- */
    {
        FILE *wf;
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":36,\"t4_pm\":3,\"t4c0_au2\":\"0 0 1 8 0 36000 3 -2 1 40 2 0 1 2 50|mono48.wav\","
                    "\"t4c1_au\":\"1 1 2 16 250 750 0 0 0 0 0|mono48.wav\"}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "the Audio track did not load");
        HX_ASSERT(!inst->au_clip[4][0].name[0] && !inst->au_clip[4][0].slen && !inst->au_clip[4][0].pitch &&
                  !inst->au_clip[4][1].name[0], "an older clip line was read");
        hx_destroy(h);
    }

    /* ---- a set from the drum-flag build loads as a drum track ---- */
    {
        FILE *wf;
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":36,\"t4_pm\":1,\"t4_au\":1,\"t4c0_au\":\"1 0 8 16 0 1000 0 0|mono48.wav\"}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_DRUM, "an old Audio set did not load as drums");
        HX_ASSERT(!inst->au_clip[4][0].name[0], "an old Audio set's clip keys were applied to a drum track");
        hx_destroy(h);
    }

    /* ---- VINTAGE CROSSFADES its pieces (Josh, 2026-10-30, by ear: "vintage is
     * super noisy in general" · chose every tick crossfaded, 128 frames): at
     * 3/4 speed a 440 Hz triangle's pieces cut every tick, and a hard cut steps
     * the wave by up to 24000 in a frame. Crossfaded, no frame steps by more
     * than the wave's own slope (~480) and a share of the jump spread over the
     * fade ---- */
    {
        int fed = 0, maxd = 0, prev = 0, have = 0, k;
        h = rig(1); inst = (seq8_instance_t *)h->inst;
        snprintf(p, sizeof p, "%s/src/tri.wav", g_root); write_tri(p);
        snprintf(p, sizeof p, "0|%s/src/tri.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "vintage xf: the pick");
        hx_set_param(h, "t4_au_set_sync", "0 1");
        hx_set_param(h, "t4_au_set_bpm", "0 1600");               /* a 120 project: 3/4 speed */
        hx_set_param(h, "t4_launch_clip", "0");
        hx_stub_feed_reset();
        hx_set_param(h, "transport", "play");
        hx_render(h, 20);
        fed = hx_stub_feed(4, NULL, NULL);
        for (n = 0; n < 300; n++) {
            hx_render(h, 1);
            if (hx_stub_feed(4, NULL, NULL) == fed) { have = 0; continue; }
            fed = hx_stub_feed(4, NULL, NULL);
            blk = hx_stub_feed_last(4);
            for (k = 0; k < 128; k++) {
                int v = blk[k * 2];
                if (have) { int d = v > prev ? v - prev : prev - v; if (d > maxd) maxd = d; }
                prev = v; have = 1;
            }
        }
        HX_ASSERT(maxd > 300, "vintage xf: the triangle did not play");
        HX_ASSERT(maxd < 1200, "vintage xf: a piece cut the wave in one frame (no crossfade)");
        hx_set_param(h, "transport", "stop");
        hx_destroy(h);
    }

    /* ---- THE CONDUCTOR repitches a responding Audio track (Josh, 2026-10-30:
     * "conductor needs to work on audio tracks" · "repitch"): its chops play
     * the Conductor's semitones up or down; its notes are never transposed ---- */
    {
        double base;
        au_voice_t *v = NULL;
        clip_t *cc;
        int k;
        h = rig(1); inst = (seq8_instance_t *)h->inst;
        snprintf(p, sizeof p, "0|%s/src/mono48.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "conductor: the pick");
        base = (double)inst->au_clip[4][0].smp->rate / 44100.0;   /* the step at Pitch 0 */
        hx_set_param(h, "t4_au_set_mode", "0 1");             /* Slice */
        hx_set_param(h, "t6_convert_to_conduct", "1");
        HX_ASSERT(inst->conductor_track == 6, "conductor: no Conductor");
        cc = &inst->tracks[6].clips[inst->tracks[6].active_clip];
        hx_set_param(h, "scale_aware", "0");
        HX_ASSERT(au_cond_now(inst, 4) == 0, "conductor: a silent Conductor moved the Audio track");
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 3);
        HX_ASSERT(au_cond_now(inst, 4) == 3, "conductor: +3 semitones did not reach the Audio track");
        cc->cond_oct[4] = 1;
        HX_ASSERT(au_cond_now(inst, 4) == 15, "conductor: the track's octave is not added");
        cc->cond_oct[4] = 0;
        /* a chop takes it as it starts */
        au_slice_on(inst, 4, 0, 1.0f);
        for (k = 0; k < AU_VOICES; k++) if (inst->au_trk[4].v[k].active && !inst->au_trk[4].v[k].mode_loop) v = &inst->au_trk[4].v[k];
        HX_ASSERT(v && fabs(v->step - base * pow(2.0, 3.0 / 12.0)) < 1e-9, "conductor: the chop did not start 3 semitones up");
        /* Next (the default): what sounds keeps its pitch */
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 5);
        hx_render(h, 1);
        HX_ASSERT(fabs(v->step - base * pow(2.0, 3.0 / 12.0)) < 1e-9, "conductor: Next moved a sounding chop");
        /* Now: it moves at once */
        cc->cond_when[4] = 1;
        hx_render(h, 1);
        HX_ASSERT(fabs(v->step - base * pow(2.0, 5.0 / 12.0)) < 1e-9, "conductor: Now did not move the sounding chop");
        /* the chop's own note is untouched: the slice it plays stays the slice */
        HX_ASSERT(v->slice == 0, "conductor: the chop changed");
        /* scale-aware: C major, the Conductor on E = 2 degrees = 4 semitones */
        hx_set_param(h, "scale_aware", "1"); hx_set_param(h, "key", "0"); hx_set_param(h, "scale", "0");
        conductor_set_offset_from_note(inst, 64);
        HX_ASSERT(au_cond_now(inst, 4) == 4, "conductor: scale-aware E in C major is not +4");
        /* an off-scale Conductor note moves an Audio track IN KEY, as it moves a
         * melodic responder by degrees: D# in C major lands on a C major note */
        conductor_set_offset_from_note(inst, 63);
        {
            int st = au_cond_now(inst, 4), pc = ((st % 12) + 12) % 12;
            HX_ASSERT(st != 3 && (pc == 0 || pc == 2 || pc == 4 || pc == 5 || pc == 7 || pc == 9 || pc == 11),
                      "conductor: an off-scale note moved the Audio track out of key");
        }
        /* not responding: nothing */
        cc->cond_resp[4] = 0;
        HX_ASSERT(au_cond_now(inst, 4) == 0, "conductor: a track that does not respond moved");
        cc->cond_resp[4] = 1;
        conductor_clear_offset(inst);
        HX_ASSERT(au_cond_now(inst, 4) == 0, "conductor: a cleared Conductor left the track moved");
        /* a Loop clip (Vintage): on Next the semitones are taken when the loop
         * comes round; on Now at once */
        hx_set_param(h, "scale_aware", "0");
        cc->cond_when[4] = 0;
        hx_set_param(h, "t4_au_set_mode", "0 0");
        hx_set_param(h, "t4_au_set_sync", "0 1");
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 2);
        hx_set_param(h, "t4_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        hx_render(h, 10);
        HX_ASSERT(inst->au_trk[4].cond == 2, "conductor: a Loop did not start at the Conductor's +2");
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 5);
        hx_render(h, 20);
        HX_ASSERT(inst->au_trk[4].cond == 2, "conductor: Next moved a Loop mid-pass");
        hx_render(h, 760);                                    /* past the 1-bar wrap */
        HX_ASSERT(inst->au_trk[4].cond == 5, "conductor: Next did not take the Loop's new pitch at the wrap");
        cc->cond_when[4] = 1;
        conductor_set_offset_from_note(inst, eff_pad_key(inst) + 60 + 7);
        hx_render(h, 1);
        HX_ASSERT(inst->au_trk[4].cond == 7, "conductor: Now did not move a Loop at once");
        hx_set_param(h, "transport", "stop");
        hx_destroy(h);
    }

    /* ---- scene bake, Apply Conductor (Josh, 2026-10-30: "a"): an Audio clip's
     * chops are never transposed; ONE shift folds into its Pitch, a changing
     * one leaves it following the Conductor ---- */
    {
        clip_t *cc, *ac_steps;
        au_clip_t *ac;
        char v[32], b[16];
        int R;
        h = rig(1); inst = (seq8_instance_t *)h->inst;
        snprintf(p, sizeof p, "0|%s/src/mono48.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "bake cond: the pick");
        ac = &inst->au_clip[4][0];
        ac_steps = &inst->tracks[4].clips[0];
        hx_set_param(h, "t6_convert_to_conduct", "1");
        hx_set_param(h, "scale_aware", "0");
        cc = &inst->tracks[6].clips[0];
        R = eff_pad_key(inst) + 60;
        snprintf(v, sizeof v, "%d", R + 3); hx_set_param(h, "t6_c0_step_0_toggle", v);
        HX_ASSERT(cc->note_count == 1, "bake cond: the Conductor's note");
        cc->cond_lock = 1;                                    /* +3 held the whole clip */
        ac_steps->length = cc->length;

        /* a Loop clip, one shift: folded into Pitch; the track stops following */
        cc->cond_resp[4] = 1; cc->cond_when[4] = 0;
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 3 && !cc->cond_resp[4], "bake cond: one shift did not fold into a Loop clip's Pitch");
        hx_get_param(h, "bake_au_kept", b, sizeof b);
        HX_ASSERT(!strcmp(b, "1 0"), "bake cond: a folded track reads as kept, or the bake was not counted");

        /* +5 from step 8: a Loop on Next takes the shift at its wrap only — still one */
        snprintf(v, sizeof v, "%d", R + 5); hx_set_param(h, "t6_c0_step_8_toggle", v);
        HX_ASSERT(cc->note_count == 2, "bake cond: the second Conductor note");
        ac->pitch = 0; cc->cond_resp[4] = 1;
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 3 && !cc->cond_resp[4], "bake cond: a Loop on Next did not fold the shift at its wrap");
        /* ...on Now it hears both: left alone, still following, named */
        ac->pitch = 0; cc->cond_resp[4] = 1; cc->cond_when[4] = 1;
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 0 && cc->cond_resp[4], "bake cond: a changing shift was folded, or the track stopped following");
        hx_get_param(h, "bake_au_kept", b, sizeof b);
        HX_ASSERT(!strcmp(b, "3 16"), "bake cond: the kept track is not named (bit 4), or the bakes not counted");
        cc->cond_when[4] = 0;

        /* a Slice clip: the shift at each chop's onset; the chops never move */
        hx_set_param(h, "t4_au_set_mode", "0 1");
        hx_set_param(h, "t4_au_chop", "0");
        HX_ASSERT(ac_steps->note_count > 1, "bake cond: no chops on steps");
        ac_steps->notes[1].tick = 12 * 24;                    /* the second chop on step 13, under the +5 */
        {
            int i, pit_before[64], nb = clip_pitches(inst, 4, 0, pit_before, 64), pit_after[64];
            ac->pitch = 0; cc->cond_resp[4] = 1;
            hx_set_param(h, "bake_scene", "0 1 0 1");
            HX_ASSERT(clip_pitches(inst, 4, 0, pit_after, 64) == nb, "bake cond: the bake lost chops");
            for (i = 0; i < nb; i++) HX_ASSERT(pit_after[i] == pit_before[i], "bake cond: a chop was transposed");
        }
        /* chops on steps 1 and 13 hear +3 and +5: kept */
        HX_ASSERT(ac->pitch == 0 && cc->cond_resp[4], "bake cond: a Slice clip's changing shift was folded");
        /* the +5 note gone: one shift, folded */
        hx_set_param(h, "t6_c0_step_8_toggle", v);
        HX_ASSERT(cc->note_count == 1 || !cc->notes[1].active, "bake cond: the +5 note did not go");
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 3 && !cc->cond_resp[4], "bake cond: a Slice clip's one shift did not fold");
        /* a chop past the clip's end never plays: its shift does not count */
        {
            note_t *n = &ac_steps->notes[ac_steps->note_count - 1];
            uint32_t was = n->tick;
            snprintf(v, sizeof v, "%d", R + 5); hx_set_param(h, "t6_c0_step_8_toggle", v);   /* +5 back */
            n->tick = 24 * 24;                                /* step 25: would land on the +5 */
            ac->pitch = 0; cc->cond_resp[4] = 1;
            for (int i = 0; i < ac_steps->note_count; i++) if (&ac_steps->notes[i] != n && ac_steps->notes[i].active) ac_steps->notes[i].tick = 0;
            hx_set_param(h, "bake_scene", "0 1 0 1");
            HX_ASSERT(ac->pitch == 3 && !cc->cond_resp[4], "bake cond: a chop past the end counted");
            n->tick = was;
            hx_set_param(h, "t6_c0_step_8_toggle", v);        /* +5 gone again */
        }
        /* the track's octave goes in with the shift */
        ac->pitch = 0; cc->cond_resp[4] = 1; cc->cond_oct[4] = 1;
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 15, "bake cond: the track's octave was not folded");
        cc->cond_oct[4] = 0;
        /* a Loop on Now, the Conductor's note let go mid-clip (no Lock): the
         * shift ends there, so it changes — kept */
        hx_set_param(h, "t4_au_set_mode", "0 0");
        ac->pitch = 0; cc->cond_resp[4] = 1; cc->cond_when[4] = 1; cc->cond_lock = 0;
        HX_ASSERT(cc->notes[0].active && cc->notes[0].gate < cc->length * 24, "setup: the Conductor note fills the clip");
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 0 && cc->cond_resp[4], "bake cond: a shift that ends mid-clip was folded");
        cc->cond_when[4] = 0; cc->cond_lock = 1;
        /* a Pitch that cannot hold it: left following */
        ac->pitch = 23; cc->cond_resp[4] = 1;
        hx_set_param(h, "bake_scene", "0 1 0 1");
        HX_ASSERT(ac->pitch == 23 && cc->cond_resp[4], "bake cond: a fold past +24 was clamped instead of kept");
        /* without Apply Conductor nothing moves and the track keeps following */
        ac->pitch = 0;
        hx_set_param(h, "bake_scene", "0 1 0 0");
        HX_ASSERT(ac->pitch == 0 && cc->cond_resp[4], "bake cond: a plain bake touched the Conductor");
        hx_destroy(h);
    }

    /* ---- review fixes: a same-name, same-size file is not taken for the
     * same audio; Trim drops chops past the new end ---- */
    {
        char d1[300], d2[300], n0[160];
        FILE *f;
        snprintf(d1, sizeof d1, "%s/src/one", g_root); mkdir(d1, 0775);
        snprintf(d2, sizeof d2, "%s/src/two", g_root); mkdir(d2, 0775);
        snprintf(p, sizeof p, "%s/same.wav", d1); write_ramp(p);
        snprintf(p, sizeof p, "%s/same.wav", d2); write_ramp(p);
        f = fopen(p, "r+b");                                  /* same size, one sample different */
        HX_ASSERT(f, "review: open the second file");
        fseek(f, -2, SEEK_END); fputc(0x55, f); fputc(0x55, f); fclose(f);
        h = rig(1); inst = (seq8_instance_t *)h->inst;
        snprintf(p, sizeof p, "0|%s/same.wav", d1); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "review: the first same.wav");
        snprintf(n0, sizeof n0, "%s", inst->au_clip[4][0].name);
        snprintf(p, sizeof p, "1|%s/same.wav", d2); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 1) == 2, "review: the second same.wav");
        HX_ASSERT(strcmp(inst->au_clip[4][1].name, n0) != 0,
                  "review: a different file of the same name and size was taken for the same audio");
        /* control: the same file again IS reused */
        snprintf(p, sizeof p, "2|%s/same.wav", d1); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 2) == 2 && !strcmp(inst->au_clip[4][2].name, n0), "review: the same file was not reused");
        /* Transient's chops: a knob turn marks them due; a read (or the
         * block) works them out — once, not a walk per detent */
        {
            char b[512];
            au_clip_t *cl = &inst->au_clip[4][0];
            hx_get_param(h, "t4_au_progress_0", b, sizeof b);
        HX_ASSERT(!strcmp(b, "0 0"), "review: progress reads as loading with nothing loading");
        hx_set_param(h, "t4_au_set_trans", "0 1");
            hx_set_param(h, "t4_au_set_sens", "0 30");
            HX_ASSERT(cl->tr_due == 1, "review: a Sens turn worked the chops out at once");
            hx_get_param(h, "t4_au_info_0", b, sizeof b);
            HX_ASSERT(cl->tr_due == 0 && cl->tr_n >= 1 && cl->tr_at[0] == cl->rstart, "review: a read did not settle Transient's chops");
            HX_ASSERT(cl->hc_smp == (const void *)cl->smp && cl->hc_sens == 30, "review: the info count was not kept");
            hx_set_param(h, "t4_au_set_sens", "0 70");
            hx_render(h, 1);
            HX_ASSERT(cl->tr_due == 0, "review: the block did not settle Transient's chops");
            hx_get_param(h, "t4_au_info_0", b, sizeof b);
            HX_ASSERT(cl->hc_sens == 70, "review: the info count was not recounted for a new Sens");
        }
        hx_destroy(h);
    }
    {
        au_clip_t cl;
        memset(&cl, 0, sizeof cl);
        cl.nslices = 3;
        cl.sl[0].start = 0;    cl.sl[0].end = 800;
        cl.sl[1].start = 5000;
        cl.sl[2].start = 9000; cl.sl[2].end = 9500;
        au_clip_shift(&cl, 1000, 6000);
        HX_ASSERT(cl.nslices == 2 && cl.sl[1].start == 4000 && !cl.sl[2].start && !cl.sl[2].end,
                  "review: Trim kept a chop past the new end");
        HX_ASSERT(cl.sl[0].end == 0, "review: an end before its start was not sent HOME");
    }

    /* ---- undo: an Audio clip's sample side comes back with its steps ---- */
    {
        au_clip_t *ac;
        char n1[160], n2[160], n3[160];   /* the names as imported (a name taken gets ~2) */
        h = rig(1); inst = (seq8_instance_t *)h->inst; tr = &inst->tracks[4];
        ac = &inst->au_clip[4][0];
        /* a pick is one undo step: undo empties the clip again, redo picks it back */
        snprintf(p, sizeof p, "0|%s/src/mono48.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "undo: the first pick did not load");
        snprintf(n1, sizeof n1, "%s", ac->name);
        hx_set_param(h, "t4_au_set_gain", "0 -9");
        hx_set_param(h, "t4_au_set_start", "0 1000");
        /* a second pick: undo puts the first sample back with ITS settings */
        snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && strcmp(ac->name, n1), "undo: the second pick did not load");
        snprintf(n2, sizeof n2, "%s", ac->name);
        HX_ASSERT(ac->rstart == 0, "undo: a pick kept the old Start");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(ac->name, n1), "undo: the pick's sample did not come back");
        HX_ASSERT(ac->gain_db == -9 && ac->rstart == 1000, "undo: the old sample came back without its settings");
        HX_ASSERT(ac->smp && !strcmp(ac->smp->name, n1), "undo: the clip plays another sample than it names");
        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(ac->name, n2) && ac->rstart == 0 && ac->gain_db == -9,
                  "redo: the second pick did not come back as it was");
        /* the same file: settings only, the loaded audio kept (no reload) */
        hx_set_param(h, "t4_au_set_gain", "0 -3");
        {
            uint32_t gen;
            const au_sample_t *now;
            hx_set_param(h, "t4_c0_hard_reset", "");
            snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root); hx_set_param(h, "t4_au_pick_join", p);
            HX_ASSERT(wait_loaded(h, 4, 0) == 2 && ac->gain_db == 0 && !strcmp(ac->name, n2),
                      "In place: the reset + pick did not land at defaults");
            gen = ac->gen; now = ac->smp;
            hx_set_param(h, "undo_restore", "1");
            HX_ASSERT(ac->state == 2 && ac->gen == gen && ac->smp == now && ac->gain_db == -3,
                      "undo of a reset + pick_join of the same file did not keep its audio and restore its settings");
        }
        /* Shift + Delete (the reset alone) and the chooser's None: undoable */
        hx_set_param(h, "t4_c0_hard_reset", "");
        HX_ASSERT(!ac->name[0], "the reset kept the sample");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(ac->name, n2) && ac->gain_db == -3, "undo of Shift + Delete lost the sample");
        hx_set_param(h, "t4_au_clear", "0");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(ac->name, n2), "undo of None lost the sample");
        /* Flatten: one step over every clip it replaces, each reset joining it */
        snprintf(p, sizeof p, "2|%s/src/mono48.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 2) == 2, "undo: clip C did not load");
        snprintf(n3, sizeof n3, "%s", inst->au_clip[4][2].name);
        tr->clips[2].length = 32;
        hx_set_param(h, "t4_au_undo", "0 2");
        hx_set_param(h, "t4_c0_hard_reset", "j");
        snprintf(p, sizeof p, "0|%s/src/spike.wav", g_root); hx_set_param(h, "t4_au_pick_join", p);
        hx_set_param(h, "t4_c2_hard_reset", "j");
        snprintf(p, sizeof p, "2|%s/src/spike.wav", g_root); hx_set_param(h, "t4_au_pick_join", p);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && wait_loaded(h, 4, 2) == 2 &&
                  strcmp(ac->name, n2) && strcmp(inst->au_clip[4][2].name, n3), "Flatten's picks did not land");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && wait_loaded(h, 4, 2) == 2 &&
                  !strcmp(ac->name, n2) && !strcmp(inst->au_clip[4][2].name, n3) &&
                  tr->clips[2].length == 32, "one undo did not bring back every clip Flatten replaced");
        /* Trim New: undo goes back to the untrimmed file, Start where it was */
        hx_set_param(h, "t4_au_set_start", "0 4000");
        hx_set_param(h, "t4_au_set_mode", "0 1");
        hx_set_param(h, "t4_au_edit", "0 0 0");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && strcmp(ac->name, n2) && ac->rstart == 0, "Trim New did not land");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2 && !strcmp(ac->name, n2) && ac->rstart == 4000, "undo of Trim New");
        /* Overwrite: a step holding a clip on that file goes (clip B shares it) */
        snprintf(p, sizeof p, "1|%s/src/ramp.wav", g_root); hx_set_param(h, "t4_au_pick", p);
        HX_ASSERT(wait_loaded(h, 4, 1) == 2 && !strcmp(inst->au_clip[4][1].name, n2), "setup: clip B is not on clip A's file");
        hx_set_param(h, "t4_c1_hard_reset", "");
        HX_ASSERT(inst->undo_valid, "setup: no undo step");
        hx_set_param(h, "t4_au_edit", "0 0 1");
        HX_ASSERT(!inst->undo_valid, "an Overwrite left an undo step that would restore over different audio");
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "Trim Overwrite did not land");
        /* a melodic track's undo carries no sample side */
        hx_set_param(h, "t1_c0_hard_reset", "");
        HX_ASSERT(!inst->undo_au_on[0], "a melodic clip's snapshot is marked Audio");
        hx_destroy(h);
    }

    {
        char cmd[320];
        snprintf(cmd, sizeof cmd, "rm -rf '%s'", g_root);
        if (system(cmd)) { /* best effort */ }
    }
    printf("PASS: test_audio_track\n");
    return 0;
}
