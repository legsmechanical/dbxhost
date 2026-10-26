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
 *     a DELAY echo's velocity is its volume (Q1); ALL SLICES sets every slice;
 *     Chop lays one step per slice at 36..;
 *   - the hand set (frames): Manual, markers added / removed (steps follow),
 *     pinned and home ends, Even as an override, the zoomed waveform; Lazy
 *     armed silent, first tap plays, taps mark, Back / played out, keep or
 *     restore; an older project's permille Start / End arrive in frames;
 *   - Loop: the voice follows the clip from the sample's first frame; Revrs
 *     plays it backwards, Nudge delays it, JmpQ holds a jump to its boundary;
 *   - the project file keeps it all and a reload loads the samples again; a
 *     set from the drum-flag build loads as a drum track. */
#include "harness.h"
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
/* a WAV whose data chunk claims 11 minutes */
static void write_long(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100u * 660u;
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

    /* ---- Slice: a note plays exactly its slice, on the track's slot ---- */
    hx_set_param(h, "t4_au_set_mode", "0 1");
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
    live_note_on(inst, tr, DRUM_BASE_NOTE + 2, 100);
    hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(hx_stub_feed(4, NULL, NULL) >= 1 && blk[255] == 3000, "a played note did not reach slice 3 untouched");
    HX_ASSERT(note_events_on_slot(4) == 0 && hx_count_midi(h, HX_MIDI_INTERNAL) == 0, "an Audio track sent MIDI");
    live_note_off(inst, tr, DRUM_BASE_NOTE + 2);
    hx_set_param(h, "t4_transpose", "0");
    tr->pfx.octave_shift = 0; tr->pfx.note_offset = 0;
    hx_render(h, 60);

    /* ---- echoes fade: a DELAY echo's velocity is its volume (Q1) ---- */
    tr->pfx.delay_time_idx = 3; tr->pfx.delay_level = 64; tr->pfx.repeat_times = 1; tr->pfx.fb_velocity = 0;
    hx_stub_feed_reset();
    live_note_on(inst, tr, DRUM_BASE_NOTE + 2, 100);
    hx_render(h, 1);
    live_note_off(inst, tr, DRUM_BASE_NOTE + 2);
    HX_ASSERT(hx_stub_feed_last(4)[255] == 3000, "the played slice was not at full level");
    for (i = 0, n = 0; i < 400; i++) {
        hx_render(h, 1);
        blk = hx_stub_feed_last(4);
        if (blk && blk[255] > 1000 && blk[255] < 1500) { n = 1; break; }
    }
    HX_ASSERT(n, "the echo did not play at its own (velocity) level");
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
        hx_set_param(h, "t4_c0_step_4_toggle", "37");
        hx_set_param(h, "t4_au_mark_add", "0 6000");
        HX_ASSERT(ac->nslices == 3 && ac->sl[1].start == 6000 && ac->sl[2].start == 12000, "the middle marker");
        HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == DRUM_BASE_NOTE + 2, "a split did not move the later slice's step up");
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
        HX_ASSERT(clip_pitches(inst, 4, 0, pit, 64) == 1 && pit[0] == DRUM_BASE_NOTE + 1, "a delete did not move the later step down");
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
        HX_ASSERT(!strcmp(ab, "0 -6 0 0 0 x"), "ALL SLICES read does not show the common gain and the differing Play");
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
    for (i = 0; i < 8; i++) HX_ASSERT(pit[i] == DRUM_BASE_NOTE + i, "Chop's notes are not slices 1..8 in order");
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
    /* ...and LIVE ARP leaves slices alone */
    tr->tarp_on = 1;
    hx_stub_feed_reset();
    live_note_on(inst, tr, DRUM_BASE_NOTE + 2, 100);
    hx_render(h, 1);
    HX_ASSERT(hx_stub_feed_last(4)[255] == 3000, "LIVE ARP on an Audio track did not play the slice as played");
    live_note_off(inst, tr, DRUM_BASE_NOTE + 2);
    tr->tarp_on = 0;
    hx_render(h, 60);
    hx_set_param(h, "t4_au_wipe", "0");

    /* ---- a step holds one slice: placed by hand or recorded ---- */
    hx_set_param(h, "t4_c0_step_2_toggle", "38");
    hx_set_param(h, "t4_c0_step_2_toggle", "40");
    HX_ASSERT(tr->clips[0].step_note_count[2] == 1 && tr->clips[0].step_notes[2][0] == 40,
              "a second slice placed on a step did not replace the first");
    hx_set_param(h, "t4_au_wipe", "0");
    tr->recording = 1; tr->current_clip_tick = 0;
    hx_set_param(h, "t4_record_note_on", "e38 100");
    hx_set_param(h, "t4_record_note_off", "e38");
    hx_set_param(h, "t4_record_note_on", "e41 100");
    hx_set_param(h, "t4_record_note_off", "e41");
    n = clip_pitches(inst, 4, 0, pit, 64);
    HX_ASSERT(n == 1 && pit[0] == 41, "recording left two slices on one step");
    /* Loop mode records nothing */
    hx_set_param(h, "t4_au_set_mode", "0 0");
    tr->current_clip_tick = 24 * 4;
    hx_set_param(h, "t4_record_note_on", "e44 100");
    hx_set_param(h, "t4_record_note_off", "e44");
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
    HX_ASSERT(st == 3 && err == AU_ERR_LONG, "an 11-minute file was not refused as too long");
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
    hx_set_param(h, "t4_au_set_bars", "6 1");
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

    /* ---- JmpQ: a jump waits for its 1/16 ---- */
    hx_set_param(h, "t4_au_set_jmpq", "5 1");
    hx_set_param(h, "transport", "play");
    hx_render(h, 3);
    hx_set_param(h, "t4_au_jump", "8");                /* half way: frame 22050 */
    hx_render(h, 1);
    blk = hx_stub_feed_last(4);
    HX_ASSERT(blk[255] < 2000, "a JmpQ jump did not wait for its boundary");
    for (i = 0; i < 80; i++) { hx_render(h, 1); blk = hx_stub_feed_last(4); if (blk[255] > 20000) break; }
    /* the 1/16 is 24 ticks = 5512 frames: block 43 from the start (4 + i) */
    HX_ASSERT(i < 80 && 4 + i >= 42 && 4 + i <= 44, "a JmpQ jump did not land on its 1/16");
    hx_set_param(h, "transport", "stop");
    hx_set_param(h, "t4_au_set_jmpq", "5 0");
    hx_render(h, 4);

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
    hx_set_param(h, "t4_c11_clear", "");
    HX_ASSERT(!inst->au_clip[4][11].name[0] && !inst->au_clip[4][11].smp, "clearing an Audio clip kept its sample");
    HX_ASSERT(inst->au_clip[4][0].smp, "clearing a copy let the original's sample go");

    /* ---- the project file keeps it ---- */
    n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
    HX_ASSERT(n > 0 && (size_t)n < sizeof blob - 1, "state_full failed");
    HX_ASSERT(strstr(blob, "\"t4_pm\":3") && strstr(blob, "\"t4c0_au2\":\"1 8 1 16 0 0 0 0 0 0 0|mono48.wav\""),
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
    HX_ASSERT(inst->au_clip[4][0].mode == AU_MODE_SLICE && inst->au_clip[4][0].sl[1].gain_db == -6 &&
              inst->au_clip[4][0].sl[1].play == AU_PLAY_GATE, "the reload lost clip A's settings");
    HX_ASSERT(wait_loaded(h, 4, 0) == 2 && wait_loaded(h, 4, 2) == 2, "the reload did not load the samples");
    HX_ASSERT(inst->au_clip[4][0].smp && inst->au_clip[4][0].smp->frames == 48000, "clip A's sample is not the saved one");

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
