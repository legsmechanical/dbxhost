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
    hx_set_param(h, "t6_convert_to_melodic", "");

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

    /* ---- Loop -> Slice on a clip with no steps: the chops (Even 16, a new
     * clip's) go onto the steps in order ---- */
    HX_ASSERT(inst->au_clip[4][0].even == 16, "a new clip did not start with Even 16");
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
        /* Start / End are frames */
        hx_set_param(h, "t4_au_set_start", "0 24000");
        hx_set_param(h, "t4_au_set_even", "0 2");
        hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
        HX_ASSERT(!strcmp(mk, "24000 36000 36000 48000"), "Even did not divide Start..End in frames");
        hx_set_param(h, "t4_au_set_end", "0 48000");
        HX_ASSERT(ac->rend == 0, "End at the sample's end is not 'the end'");
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

    /* ---- Loop detune: the loop plays 2^(30/1200) faster ---- */
    hx_set_param(h, "t4_au_set_detune", "5 30");
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 20 && hx_stub_feed(4, NULL, NULL) == 0; i++) hx_render(h, 1);
    hx_render(h, 2);
    {
        int vi, found = 0;
        for (vi = 0; vi < AU_VOICES; vi++) {
            const au_voice_t *v = &inst->au_trk[4].v[vi];
            if (v->active && v->mode_loop && !v->rel_len)
                found = v->step > au_tune(0, 30) - 1e-9 && v->step < au_tune(0, 30) + 1e-9;
        }
        HX_ASSERT(found, "a Loop clip does not play at its detune");
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
    hx_set_param(h, "t4_au_set_tempo", "7 1");
    HX_ASSERT(inst->au_clip[4][7].tempo == AU_TEMPO_VINTAGE && clip_pitches(inst, 4, 7, pit, 64) == 0,
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
     * where its tick says — always ON a tick, always to that tick's frame
     * (read once the cut voice's 64-frame fade has gone: the two sum till then) */
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
                if (chk < 0 && v - prev > 100) {
                    /* a piece starting: on a tick */
                    double d = (double)(g - start), j = floor(d / 183.75 + 0.5);
                    if (fabs(d - j * 183.75) > 3) bad++;
                    want = ((long)v0 + (long)floor(j * 229.6875 + 0.5) + 80) % 30000;
                    chk = g + 80;
                }
                if (g == chk) {
                    /* ...from its tick's frame */
                    if (labs((long)v - want) > 3) bad++;
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
    hx_set_param(h, "t4_au_set_tempo", "7 0");
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
        hx_set_param(h, "t4_au_set_bars", "7 1");               /* ramp2 is 2 s: 1 bar at 120 */
        lc->length = 8;                                         /* the clip: half of it */
        hx_set_param(h, "t4_au_set_tempo", "7 1");
        hx_set_param(h, "t4_au_set_even", "7 16");
        b16 = ramp_breaks(h, 300);                              /* 300 blocks < the half bar's 344 */
        hx_set_param(h, "t4_au_set_even", "7 128");
        b128 = ramp_breaks(h, 300);
        HX_ASSERT(b16 == 0 && b128 == 0, "Vintage on a clip half the sample's Bars did not play its first half as recorded (or the chop count changed it)");
        hx_set_param(h, "t4_au_set_tempo", "7 2");              /* the old Fit */
        HX_ASSERT(ac->tempo == AU_TEMPO_VINTAGE, "Fit did not set as Vintage");
        /* Pitch: Start..End (88200 frames) over the sample's Bars, not the
         * clip (Josh: "does pitch sync'ing not respect the set bars?"): 1 bar
         * at 120 is 2 s = as recorded, though the clip is half a bar; 2 bars
         * is half speed */
        hx_set_param(h, "t4_au_set_tempo", "7 3");
        hx_set_param(h, "transport", "play");
        hx_render(h, 8);
        {
            const au_voice_t *lv = NULL;
            for (i = 0; i < AU_VOICES; i++)
                if (inst->au_trk[4].v[i].active && inst->au_trk[4].v[i].mode_loop && !inst->au_trk[4].v[i].rel_len) lv = &inst->au_trk[4].v[i];
            HX_ASSERT(lv && lv->step > 1.0 - 1e-9 && lv->step < 1.0 + 1e-9, "Pitch did not retune the loop to its Bars (1)");
            hx_set_param(h, "t4_au_set_bars", "7 2");
            hx_render(h, 2);
            HX_ASSERT(lv->active && lv->step > 0.5 - 1e-9 && lv->step < 0.5 + 1e-9, "Pitch did not retune the loop to its Bars (2)");
            hx_set_param(h, "t4_au_set_bars", "7 1");
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
            hx_set_param(h, "t4_au_set_tempo", "7 1");
            ac->even = 0; ac->nslices = 2;
            memset(ac->sl, 0, 2 * sizeof ac->sl[0]);
            ac->sl[0].start = 22050; ac->sl[1].start = 66150;
            bh = ramp_breaks(h, 300);
            HX_ASSERT(bh == 0, "Vintage followed the user's chops");
            ac->even = be; ac->nslices = bn;
            memcpy(ac->sl, bak, sizeof bak);
            lc->length = 8;
        }

        /* Loop + steps on a Loop clip sets Start..End to the part of the
         * sample under the window, the steps over its Bars (Josh: "a loop
         * length in loop mode that directly changes the start/end point") */
        {
            uint32_t ors = ac->rstart, ore = ac->rend;
            uint16_t ols = lc->loop_start, olen = lc->length;
            uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
            double per = (double)ac->smp->frames / (PPQN * 4.0 / tps);   /* frames a step, 1 bar */
            snprintf(p, sizeof p, "%d", (4 << 16) | 8);
            hx_set_param(h, "t4_c7_loop_set", p);
            HX_ASSERT(lc->loop_start == 4 && lc->length == 8, "the window was not set");
            HX_ASSERT(ac->rstart + 1 >= (uint32_t)(4 * per) && ac->rstart <= (uint32_t)(4 * per) + 1 &&
                      ac->rend + 1 >= (uint32_t)(12 * per) && ac->rend <= (uint32_t)(12 * per) + 1,
                      "Start..End did not follow the Loop window");
            ac->mode = AU_MODE_SLICE;
            hx_set_param(h, "t4_c7_loop_set", "16");
            HX_ASSERT(ac->rstart + 1 >= (uint32_t)(4 * per) && ac->rstart <= (uint32_t)(4 * per) + 1, "a Slice clip's window moved Start");
            ac->mode = AU_MODE_LOOP;
            ac->rstart = ors; ac->rend = ore; lc->loop_start = ols; lc->length = olen;
        }

        /* >Seq: each chop on the step of its place in the sample's own Bars */
        hx_set_param(h, "t4_au_set_tempo", "7 0");
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
        hx_set_param(h, "t4_au_set_bars", "7 2");
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

    /* ---- the guess at a sample's Bars: its name, else its beats, else the
     * length at the tempo (Josh: "is there a better way to evaluate loop
     * lengths algorithimically?") ---- */
    {
        static const struct { const char *file; double secs, bpm; int want; } G[] = {
            { "Pad 4bar.wav",          3.0,   0, 4 },    /* the name says, whatever the length (2 at 120) */
            { "Break Phenom 84 bpm.wav", 2 * 240.0 / 84, 0, 2 },   /* 84 bpm, 5.71 s: 2 bars (3 at 120) */
            { "clicks80.wav",          2 * 240.0 / 80, 80, 2 },    /* 2 bars at 80, not the 3 its 6 s are at 120 */
            { "clicks90.wav",          2 * 240.0 / 90, 90, 2 },    /* 90 (2 bars) over 180 (4): its 8ths are silent; not 3 at 120 */
            { "quiet.wav",             3.0,   0, 2 },    /* nothing to go on: 1.5 bars at 120, rounded */
        };
        int g;
        for (g = 0; g < 5; g++) {
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
            if (inst->au_clip[4][12].bars != G[g].want) {
                fprintf(stderr, "%s: bars %d, want %d\n", G[g].file, inst->au_clip[4][12].bars, G[g].want);
                HX_ASSERT(0, "the Bars guess is wrong");
            }
        }
        HX_ASSERT(tr->clips[12].length * (tr->clips[12].ticks_per_step ? tr->clips[12].ticks_per_step : TICKS_PER_STEP) == 2u * PPQN * 4,
                  "a Loop pick did not set the clip to the guessed Bars");
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
     * should be shown as gray"): how far into Start..End a Free loop gets
     * before its clip wraps — the clip's ticks at the tempo and the pitch,
     * less Nudge; all of it when the clip outlasts the sample ---- */
    {
        char b[256];
        au_clip_t *ac = &inst->au_clip[4][7];
        clip_t *lc = &inst->tracks[4].clips[7];
        uint16_t was_len = lc->length;
        uint32_t rs, re, got = 0;
        au_range(ac, ac->smp, &rs, &re);
        hx_set_param(h, "t4_au_set_tempo", "7 0");
        lc->length = 1;                                        /* one step: well short of the sample */
        double bpm = inst->tracks[4].pfx.cached_bpm > 0 ? inst->tracks[4].pfx.cached_bpm : 120.0;
        uint32_t tps = lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
        double one = (double)tps * 44100.0 * 60.0 / (bpm * PPQN) * (double)ac->smp->rate / 44100.0;
        HX_ASSERT(one < (double)(re - rs), "the test sample is shorter than one step");
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        HX_ASSERT(got + 1 >= (uint32_t)one && got <= (uint32_t)one + 1, "reach is not one step's worth of the sample");
        hx_set_param(h, "t4_au_set_pitch", "7 12");            /* an octave up gets twice as far */
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        HX_ASSERT(got + 2 >= (uint32_t)(2 * one) && got <= (uint32_t)(2 * one) + 2 || got == re - rs, "reach ignores the pitch");
        hx_set_param(h, "t4_au_set_pitch", "7 0");
        lc->length = 256;                                       /* the clip outlasts it: all of it */
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        HX_ASSERT(got == re - rs, "a clip longer than the sample does not reach its end");
        lc->length = 1;
        /* Vintage: one step's share of the sample's own Bars */
        hx_set_param(h, "t4_au_set_tempo", "7 1");
        hx_set_param(h, "t4_au_set_bars", "7 2");
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        {
            /* one step of ticks over the 2 bars' worth (2 * PPQN * 4) of the whole sample */
            double want = (double)tps * (double)ac->smp->frames / (2.0 * PPQN * 4);
            HX_ASSERT(got + 1 >= (uint32_t)want && got <= (uint32_t)want + 1, "Vintage's reach is not one step of the sample's 2 bars");
        }
        hx_set_param(h, "t4_au_set_tempo", "7 3");
        hx_get_param(h, "t4_au_info_7", b, sizeof b);
        sscanf(b, "%*d %*d %*d %*d %*d %*d %*u %*u %*d %*d %*u %*u %*d %*d %*d %*d %*d %*d %*d %u", &got);
        {
            /* Pitch: on the sample's Bars too, so Vintage's reach */
            double want = (double)tps * (double)ac->smp->frames / (2.0 * PPQN * 4);
            HX_ASSERT(got + 1 >= (uint32_t)want && got <= (uint32_t)want + 1, "Pitch's reach is not one step of the sample's 2 bars");
        }
        hx_set_param(h, "t4_au_set_tempo", "7 0");
        lc->length = was_len;
    }

    /* ---- the project file keeps it (Tempo and the PAD MODE Layout too) ---- */
    hx_set_param(h, "t4_au_set_tempo", "7 1");
    hx_set_param(h, "t4_au_set_bars", "7 2");
    hx_set_param(h, "t4_au_layout", "1");
    n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
    HX_ASSERT(strstr(blob, " 1 2|ramp2.wav\"") && strstr(blob, "\"t4_aul\":1"), "the state does not keep Tempo Vintage, Bars or the Layout");
    HX_ASSERT(n > 0 && (size_t)n < sizeof blob - 1, "state_full failed");
    HX_ASSERT(strstr(blob, "\"t4_pm\":3") && strstr(blob, "\"t4c0_au2\":\"1 8 1 16 0 0 0 0 0 0 0 -17 0 ") && strstr(blob, "|mono48.wav\""),
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
    HX_ASSERT(inst->au_clip[4][7].tempo == AU_TEMPO_VINTAGE && inst->au_clip[4][7].bars == 2 && inst->au_trk[4].layout == 1,
              "the reload lost Tempo Vintage, Bars or the Layout");
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

    /* ---- a project from before frames: Start / End in 1/1000 wait for the
     * sample; hand-set starts (already frames) carry over ---- */
    {
        FILE *wf;
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":36,\"t4_pm\":3,\"t4c0_au\":\"1 1 2 16 250 750 0 0 0 0 0|mono48.wav\","
                    "\"t4c0s1_au\":\"30000 0 100 0 0 0 0 0 0\"}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(wait_loaded(h, 4, 0) == 2, "the old project's sample did not load");
        HX_ASSERT(inst->au_clip[4][0].rstart == 12000 && inst->au_clip[4][0].rend == 36000 &&
                  inst->au_clip[4][0].even == 0 && inst->au_clip[4][0].nslices == 2 &&
                  inst->au_clip[4][0].sl[1].start == 30000, "an old project's clip did not come over in frames");
        hx_destroy(h);
    }

    /* ---- a project saved before detune: its fields as they were, 0 cents ---- */
    {
        FILE *wf;
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        wf = fopen(inst->state_path, "w");
        fprintf(wf, "{\"v\":36,\"t4_pm\":3,\"t4c0_au2\":\"0 0 1 8 0 0 3 -2 1 40 2|mono48.wav\","
                    "\"t4c0s1_au2\":\"0 0 5 -4 1 2 10 20\"}");
        fclose(wf);
        seq8_load_state(inst);
        HX_ASSERT(inst->au_clip[4][0].pitch == 3 && inst->au_clip[4][0].gain_db == -2 && inst->au_clip[4][0].revrs == 1 &&
                  inst->au_clip[4][0].nudge_ms == 40 && inst->au_clip[4][0].jmpq == 2 && inst->au_clip[4][0].detune == 0 &&
                  !strcmp(inst->au_clip[4][0].name, "mono48.wav"), "a pre-detune clip did not load as saved");
        HX_ASSERT(inst->au_clip[4][0].sl[1].pitch == 5 && inst->au_clip[4][0].sl[1].decay_ms == 20 &&
                  inst->au_clip[4][0].sl[1].detune == 0, "a pre-detune slice did not load as saved");
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

    {
        char cmd[320];
        snprintf(cmd, sizeof cmd, "rm -rf '%s'", g_root);
        if (system(cmd)) { /* best effort */ }
    }
    printf("PASS: test_audio_track\n");
    return 0;
}
