/* tests/test_audio_rec.c — RECORD THE MOVE'S INPUT into an Audio clip
 * (seq8_audio_rec.c; Josh's model, 2026-11-12).
 *
 * The input is a LOOPBACK, as on the device with a cable from the output to the
 * input: what a click track (t5, an Audio clip whose sample is a click on each
 * beat) feeds its slot comes back to the input `lat` frames later. A take lined
 * up right holds the click at frame 0 — so the start, the lead and the latency
 * are all checked against the music, not against the formula.
 *   - stopped: the count-in, then the take from the top; it does not record
 *     notes or take an undo step at the count-in; Rec again ends it on the next
 *     bar (two bars here), exactly that many frames;
 *   - the lead on and off, and three latencies: the click at frame 0 each time;
 *   - the input is heard through the track (its slot) while the take runs, not
 *     after;
 *   - playing: Rec arms, the take waits for the next bar;
 *   - landing: one undo step, the clip two bars long, its Offset where the take
 *     began on the master clock, the file's Tempo the project's; Undo restores;
 *   - a LAYER on a clip with a sample: the take is the clip's length, the clip as
 *     heard plus the input, the clip's settings baked out when it lands; Rec again
 *     punches out (the input fades, the clip runs on to the loop's end);
 *   - refusals and ends: a Slicer, a loading clip, the sampler busy (FAILED), a
 *     transport stop (CANCELLED, the host told to stop), a silent take (nothing
 *     to land), another clip launched. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>
#include <stdlib.h>

#define T_REC   4
#define T_CLICK 5
#define BAR     88200u              /* frames, 120 bpm */
#define CLICK   20000

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* stereo 16-bit 44.1 kHz WAV of `n` frames from `lr` */
static void write_wav(const char *path, const int16_t *lr, uint32_t n) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 4); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 2); put_le32(f, 44100); put_le32(f, 176400);
    put_le16(f, 4); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 4);
    for (i = 0; i < n * 2; i++) put_le16(f, lr[i]);
    fclose(f);
}

/* one bar at 120 bpm: a click (64 frames) on each beat, the downbeat loudest */
static void write_click(const char *path) {
    static int16_t b[BAR * 2];
    uint32_t i;
    memset(b, 0, sizeof b);
    for (i = 0; i < 64; i++) {
        int k;
        for (k = 0; k < 4; k++) {
            int16_t v = (int16_t)(k == 0 ? CLICK : CLICK / 2);
            b[(k * (BAR / 4) + i) * 2] = v; b[(k * (BAR / 4) + i) * 2 + 1] = v;
        }
    }
    write_wav(path, b, BAR);
}

static int info_state(hx_t *h, int t, int c) {
    char k[32], b[512];
    int st = -1;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    if (hx_get_param(h, k, b, sizeof b) <= 0) return -1;
    sscanf(b, "%d", &st);
    return st;
}
static int wait_loaded(hx_t *h, int t, int c) {
    int i, st = 1;
    for (i = 0; i < 2000; i++) {
        hx_render(h, 1);
        st = info_state(h, t, c);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

/* ---- the loopback: the click track's feed, back at the input lat frames later ---- */
#define LB_RING 8192
static int16_t  g_lb[LB_RING * 2];
static uint64_t g_lb_pos;        /* stream position of the next block */
static int      g_lb_lat, g_lb_on, g_lb_slot;
static int      g_lb_self;       /* 1: the recorded track's own feed loops back too (a layer: none) */

static void lb_reset(int lat, int slot) {
    memset(g_lb, 0, sizeof g_lb); g_lb_pos = 0; g_lb_lat = lat; g_lb_on = 1; g_lb_slot = slot; g_lb_self = 0;
}
/* render one block: the input is the click feed from lat frames ago; then
 * this block's feed goes into the ring */
static void render1(hx_t *h) {
    int16_t *in = hx_stub_input();
    int f;
    for (f = 0; f < 128; f++) {
        int64_t q = (int64_t)g_lb_pos + f - g_lb_lat;
        int16_t v = (g_lb_on && q >= 0) ? g_lb[(q % LB_RING) * 2] : 0;
        in[f * 2] = v; in[f * 2 + 1] = v;
    }
    hx_stub_feed_reset();
    hx_render(h, 1);
    {
        const int16_t *fd = hx_stub_feed_last(g_lb_slot);
        int got = hx_stub_feed(g_lb_slot, NULL, NULL);
        for (f = 0; f < 128; f++) {
            uint64_t q = g_lb_pos + f;
            g_lb[(q % LB_RING) * 2] = got ? fd[f * 2] : 0;
        }
    }
    g_lb_pos += 128;
}
#define RUN_UNTIL(h, cond, max) ({ int _n = 0; while (!(cond) && _n < (max)) { render1(h); _n++; } (cond) ? _n : -1; })

static void status(hx_t *h, int *st, uint64_t *done, uint64_t *total, int *err) {
    char b[128];
    int t, c; unsigned pk, ticks; unsigned long long d = 0, tt = 0;
    *st = -1;
    if (hx_get_param(h, "t4_au_rec", b, sizeof b) > 0)
        sscanf(b, "%d %d %d %llu %llu %u %d %u", st, &t, &c, &d, &tt, &pk, err, &ticks);
    if (done) *done = d; if (total) *total = tt;
}

static hx_t *rig(int lead, int click) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    char p[300];
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    if (!lead) HX_NO_LEAD(h);
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    hx_set_param(h, "t5_convert_to_audio", "");
    HX_ASSERT(inst->tracks[T_REC].pad_mode == PAD_MODE_AUDIO && inst->tracks[T_CLICK].pad_mode == PAD_MODE_AUDIO, "rig: not Audio");
    if (click) {
        snprintf(p, sizeof p, "0|%s/src/click.wav", g_root);
        hx_set_param(h, "t5_au_pick", p);
        HX_ASSERT(wait_loaded(h, T_CLICK, 0) == 2, "rig: the click did not load");
        hx_set_param(h, "t5_au_set_sync", "0 2");      /* Pitch at its own tempo: the file as it is */
        hx_set_param(h, "t5_au_set_orig", "0 0");
        inst->tracks[T_CLICK].active_clip = 0;
        inst->tracks[T_CLICK].will_relaunch = 1;
    }
    inst->tracks[T_REC].active_clip = 0;
    hx_stub_cfeed_reset();
    return h;
}

static int arm(hx_t *h, int lat, const char *name) {
    char v[300];
    snprintf(v, sizeof v, "0 %d |%s/proj/dAVEBOx/samples/%s", lat, g_root, name);
    hx_set_param(h, "t4_au_rec_arm", v);
    return ((seq8_instance_t *)h->inst)->ar_state;
}

/* Is there a click at frame n of the take (the first frame of 64 near CLICK)? */
static int click_at(const int16_t *b, uint32_t n, int16_t level) {
    return b[n * 2] > level * 9 / 10 && (n == 0 || b[(n - 1) * 2] < level / 10);
}

/* Stopped: count-in, Rec in bar 2, the take two bars; the click at frame 0. */
static void stopped_take(int lead, int lat) {
    hx_t *h = rig(lead, 1);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    const int16_t *b;
    uint32_t n;
    int st, err, k, slot = inst->tracks[T_REC].pfx.slot;
    uint64_t done, total;
    char msg[160];
    lb_reset(lat, inst->tracks[T_CLICK].pfx.slot);
    HX_ASSERT(arm(h, lat, "take.wav") == AR_ARMED, "the take did not arm");
    inst->undo_valid = 0;                                 /* the rig's own picks */
    hx_set_param(h, "record_count_in", "4");
    HX_ASSERT(!inst->undo_valid, "the count-in took an undo step for an Audio take");
    k = RUN_UNTIL(h, inst->playing, 4000);
    HX_ASSERT(k > 0, "the count-in never ended");
    HX_ASSERT(!inst->tracks[T_REC].recording, "the count-in armed note recording on an Audio take");
    k = RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 50);
    HX_ASSERT(k >= 0 && inst->ar_start_abs == 0, "the take did not start on the first tick");
    /* the input is heard through the track while the take runs */
    for (k = 0; k < 800; k++) render1(h);                 /* into bar 2 (a bar ~689 blocks) */
    HX_ASSERT(hx_stub_feed(slot, NULL, NULL) > 0, "the input was not fed to the track's slot (the monitor)");
    hx_set_param(h, "t4_au_rec_stop", "");
    k = RUN_UNTIL(h, inst->ar_state == AR_DONE || inst->ar_state >= AR_CANCELLED, 4000);
    status(h, &st, &done, &total, &err);
    snprintf(msg, sizeof msg, "lead %d lat %d: the take did not end DONE (state %d err %d)", lead, lat, st, err);
    HX_ASSERT(st == AR_DONE, msg);
    HX_ASSERT(inst->ar_ticks == 2 * RS_BAR_TICKS, "Rec in bar 2 did not end the take on bar 3");
    b = hx_stub_cfeed(&n, NULL);
    snprintf(msg, sizeof msg, "lead %d lat %d: the take is %u frames, not two bars (%u)", lead, lat, n, 2 * BAR);
    HX_ASSERT(n == 2 * BAR && total == 2 * BAR && done == 2 * BAR, msg);
    { uint32_t i, first = 0xFFFFFFFF; for (i = 0; i < n; i++) if (b[i*2] > 1000) { first = i; break; }
      if (getenv("ARDBG")) printf("  dbg: first loud frame %u (%d), click slot %d, t5 playing %d smp %p\n", first, first < n ? b[first*2] : 0,
             inst->tracks[T_CLICK].pfx.slot, inst->tracks[T_CLICK].clip_playing, (void*)inst->au_store[T_CLICK][0].smp); }
    snprintf(msg, sizeof msg, "lead %d lat %d: the downbeat is not at frame 0 (%d %d %d)", lead, lat, b[0], b[2], b[(BAR / 4) * 2]);
    HX_ASSERT(click_at(b, 0, CLICK), msg);
    HX_ASSERT(click_at(b, BAR / 4, CLICK / 2) && click_at(b, BAR, CLICK), "the beats are not where the bar puts them");
    /* after the take: not heard any more */
    hx_stub_feed_reset();
    render1(h);
    HX_ASSERT(hx_stub_feed(slot, NULL, NULL) == 0 || hx_stub_feed_last(slot)[0] == 0, "the input was still heard after the take");
    hx_destroy(h);
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[300];
    int st, err, k, lat;
    uint64_t done, total;
    const int16_t *b;
    uint32_t n;

    snprintf(g_root, sizeof g_root, "/tmp/hx_audiorec_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/click.wav", g_root); write_click(p);

    /* ---- stopped: count-in, the take lined up with the music ---- */
    stopped_take(1, 128);   /* a loopback is a block late at least: fed in render k, heard in k+1 */
    stopped_take(0, 128);
    stopped_take(1, 700);
    stopped_take(0, 333);

    /* ---- playing: Rec arms, the take waits for the next bar ---- */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    lat = 400;
    lb_reset(lat, inst->tracks[T_CLICK].pfx.slot);
    hx_set_param(h, "transport", "play");
    inst->tracks[T_REC].clip_playing = 1;
    k = RUN_UNTIL(h, inst->playing, 50);
    for (k = 0; k < 300; k++) render1(h);                 /* mid bar 1 */
    HX_ASSERT(arm(h, lat, "play.wav") == AR_ARMED, "playing: the take did not arm");
    {   /* the monitor rides the track's mute: an input heard while armed, silent once muted */
        int slot = inst->tracks[T_REC].pfx.slot, f2;
        int16_t *in = hx_stub_input();
        uint64_t e1 = 0, e2 = 0;
        g_lb_on = 0;
        for (k = 0; k < 8; k++) { for (f2 = 0; f2 < 256; f2++) in[f2] = 5000; hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; }
        hx_stub_feed(slot, NULL, &e1);
        hx_set_param(h, "t4_mute", "1");
        for (k = 0; k < 8; k++) { for (f2 = 0; f2 < 256; f2++) in[f2] = 5000; hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; }
        hx_stub_feed(slot, NULL, &e2);
        HX_ASSERT(e1 > 1000000 && e2 == 0, "the monitor does not follow the track's mute");
        hx_set_param(h, "t4_mute", "0");
        g_lb_on = 1;
    }
    render1(h);
    HX_ASSERT(inst->ar_state == AR_ARMED, "playing: the take started mid-bar");
    k = RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 1000);
    HX_ASSERT(k > 0 && inst->ar_start_abs == RS_BAR_TICKS, "playing: the take did not start on the next bar");
    hx_set_param(h, "t4_au_rec_stop", "");
    k = RUN_UNTIL(h, inst->ar_state == AR_DONE || inst->ar_state >= AR_CANCELLED, 2000);
    b = hx_stub_cfeed(&n, NULL);
    HX_ASSERT(inst->ar_state == AR_DONE && n == BAR, "playing: Rec in its first bar did not make a one-bar take");
    HX_ASSERT(click_at(b, 0, CLICK), "playing: the downbeat is not at frame 0");

    /* landing: the host wrote the file; one undo step; the clip one bar */
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/play.wav", g_root);
    write_wav(p, b, n);
    inst->tracks[T_REC].clips[0].length = 7;               /* whatever it was: the take sets it */
    hx_set_param(h, "t4_au_rec_land", "0");
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2, "landing: the take did not load into the clip");
    HX_ASSERT(!strcmp(inst->au_store[T_REC][0].name, "play.wav"), "landing: the clip is not the take");
    HX_ASSERT(inst->tracks[T_REC].clips[0].length * inst->tracks[T_REC].clips[0].ticks_per_step == RS_BAR_TICKS,
              "landing: the clip is not the take's one bar");
    HX_ASSERT(inst->au_store[T_REC][0].bpm10 == 1200, "landing: the file's Tempo is not the project's");
    HX_ASSERT(inst->au_store[T_REC][0].rot == RS_BAR_TICKS % RS_BAR_TICKS, "landing: the Offset is not where the take began");
    HX_ASSERT(inst->undo_valid, "landing: no undo step");
    hx_set_param(h, "undo_restore", "1");
    hx_render(h, 2);
    HX_ASSERT(inst->tracks[T_REC].clips[0].length == 7, "Undo did not give the clip its length back");
    hx_destroy(h);

    /* ---- the transport stops mid-take: CANCELLED, the host told ---- */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    lb_reset(0, inst->tracks[T_CLICK].pfx.slot);
    arm(h, 0, "stop.wav");
    hx_set_param(h, "record_count_in", "4");
    RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 4000);
    for (k = 0; k < 50; k++) render1(h);
    {
        int stops0 = 0; hx_stub_capture(&stops0, NULL, NULL, NULL);
        hx_set_param(h, "transport", "stop");
        int stops1 = 0; hx_stub_capture(&stops1, NULL, NULL, NULL);
        HX_ASSERT(inst->ar_state == AR_CANCELLED && stops1 == stops0 + 1, "a transport stop did not cancel the take and stop the host's");
    }
    hx_destroy(h);

    /* ---- a silent take: nothing to land ---- */
    h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
    lb_reset(0, inst->tracks[T_CLICK].pfx.slot);
    arm(h, 0, "silent.wav");
    hx_set_param(h, "record_count_in", "4");
    RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 4000);
    hx_set_param(h, "t4_au_rec_stop", "");
    RUN_UNTIL(h, inst->ar_state >= AR_DONE, 2000);
    status(h, &st, &done, &total, &err);
    HX_ASSERT(st == AR_CANCELLED && err == AR_ERR_SILENT, "a take that heard nothing was not dropped as silent");
    hx_destroy(h);

    /* ---- refusals ---- */
    h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
    hx_stub_capture_refuse(1);
    lb_reset(0, inst->tracks[T_CLICK].pfx.slot);
    arm(h, 0, "busy.wav");
    hx_set_param(h, "record_count_in", "4");
    RUN_UNTIL(h, inst->ar_state >= AR_RECORDING, 4000);
    HX_ASSERT(inst->ar_state == AR_FAILED && inst->ar_err == AR_ERR_SAMPLER, "the sampler busy did not fail the take");
    hx_stub_capture_refuse(0);
    hx_destroy(h);

    h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t4_convert_to_slicer", "");
    arm(h, 0, "slicer.wav");
    HX_ASSERT(inst->ar_state != AR_ARMED && inst->ar_err == AR_ERR_TRACK, "a Slicer armed an input take");
    hx_destroy(h);

    /* ---- another clip launched: the take is the clip's ---- */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    lb_reset(0, inst->tracks[T_CLICK].pfx.slot);
    arm(h, 0, "switch.wav");
    hx_set_param(h, "record_count_in", "4");
    RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 4000);
    inst->tracks[T_REC].active_clip = 1;
    for (k = 0; k < 4; k++) render1(h);                  /* a block can hold no tick */
    HX_ASSERT(inst->ar_state == AR_CANCELLED, "another clip on the track did not end the take");
    hx_destroy(h);

    /* ---- a LAYER: the clip has a sample (12 steps long) ---- */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    snprintf(p, sizeof p, "0|%s/src/click.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2, "layer: the clip's sample did not load");
    hx_set_param(h, "t4_au_set_sync", "0 2");
    hx_set_param(h, "t4_au_set_orig", "0 0");
    hx_set_param(h, "t4_c0_length", "12");
    HX_ASSERT(inst->tracks[T_REC].clips[0].length == 12, "layer: the clip is not 12 steps");
    lat = 300;
    lb_reset(lat, inst->tracks[T_CLICK].pfx.slot);
    g_lb_on = 0;                                          /* first: no input, the take is the clip as heard */
    HX_ASSERT(arm(h, lat, "layer.wav") == AR_ARMED && inst->ar_fixed, "layer: the take did not arm as a layer");
    hx_set_param(h, "record_count_in", "4");
    k = RUN_UNTIL(h, inst->ar_state == AR_DONE || inst->ar_state >= AR_CANCELLED, 6000);
    b = hx_stub_cfeed(&n, NULL);
    {
        char msg[160];
        snprintf(msg, sizeof msg, "layer: the take is %u frames, not the clip's 12 steps (66150) (state %d err %d)", n, inst->ar_state, inst->ar_err);
        HX_ASSERT(n == 66150, msg);
    }
    /* no input: the silent rule is about the input, so a layer with nothing played is dropped */
    HX_ASSERT(inst->ar_state == AR_CANCELLED && inst->ar_err == AR_ERR_SILENT, "layer: a layer with no input was kept");
    HX_ASSERT(click_at(b, 0, CLICK) && click_at(b, BAR / 4, CLICK / 2), "layer: the clip as heard is not lined up in the take");
    hx_destroy(h);

    /* the clip and the input together, then a punch-out */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    snprintf(p, sizeof p, "0|%s/src/click.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2, "layer 2: the clip's sample did not load");
    hx_set_param(h, "t4_au_set_sync", "0 2");
    hx_set_param(h, "t4_au_set_orig", "0 0");
    hx_set_param(h, "t4_c0_length", "12");               /* not a whole bar: the landing must keep it */
    lat = 300;
    lb_reset(lat, inst->tracks[T_CLICK].pfx.slot);
    arm(h, lat, "layer2.wav");
    hx_set_param(h, "record_count_in", "4");
    RUN_UNTIL(h, inst->ar_state == AR_RECORDING, 6000);
    /* Rec again in the third beat: the input fades, the clip runs on to the loop's end */
    RUN_UNTIL(h, inst->ar_done > BAR / 4 + 2000, 2000);
    hx_set_param(h, "t4_au_rec_stop", "");
    k = RUN_UNTIL(h, inst->ar_state == AR_DONE || inst->ar_state >= AR_CANCELLED, 3000);
    b = hx_stub_cfeed(&n, NULL);
    HX_ASSERT(inst->ar_state == AR_DONE && n == 66150, "punch-out: the layer did not run on to the loop's end (12 steps)");
    HX_ASSERT(b[0] == 32767 && b[(BAR / 4) * 2] >= CLICK * 9 / 10, "layer: the clip and the input are not both at their beats");
    HX_ASSERT(b[(BAR / 2) * 2] < CLICK * 6 / 10 && b[(BAR / 2) * 2] > CLICK * 4 / 10,
              "punch-out: after it, the input is still in the take (or the clip is not)");
    /* landing a layer: the length kept, what was baked set back */
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples/layer2.wav", g_root);
    write_wav(p, b, n);
    inst->au_store[T_REC][0].pitch = 3;                   /* baked into the file: undone by the landing */
    inst->au_store[T_REC][0].rot = 24;
    k = inst->tracks[T_REC].clips[0].length;
    hx_set_param(h, "t4_au_rec_land", "0");
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2 && !strcmp(inst->au_store[T_REC][0].name, "layer2.wav"), "layer: the take did not land");
    HX_ASSERT(k == 12 && inst->tracks[T_REC].clips[0].length == 12, "layer: the landing changed the clip's length (12 steps)");
    HX_ASSERT(inst->au_store[T_REC][0].pitch == 0 && inst->au_store[T_REC][0].rot == 0, "layer: the clip's settings were not set back (baked in)");
    hx_set_param(h, "undo_restore", "1");
    hx_render(h, 2);
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2 && !strcmp(inst->au_store[T_REC][0].name, "click.wav"), "Undo did not bring the last layer back");
    hx_destroy(h);

    /* ---- the INPUT bank (per track) ---- */
    {
        int16_t *in;
        int f2, slot;
        uint64_t e;
        char v[128];
        #define FILL(L, R) do { in = hx_stub_input(); for (f2 = 0; f2 < 128; f2++) { in[f2 * 2] = (L); in[f2 * 2 + 1] = (R); } } while (0)
        #define BLOCK() do { hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; } while (0)

        /* Mono L x2 (+6 dB): the take and the monitor */
        h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
        slot = inst->tracks[T_REC].pfx.slot;
        lb_reset(0, inst->tracks[T_CLICK].pfx.slot); g_lb_on = 0;
        hx_set_param(h, "ain_mode", "1"); hx_set_param(h, "ain_gain", "6");
        HX_ASSERT(inst->ain_mode == 1 && inst->ain_gain == 6, "the input keys did not take");
        snprintf(p, sizeof p, "0 128 |%s/proj/dAVEBOx/samples/gain.wav", g_root);
        hx_set_param(h, "t4_au_rec_arm", p);
        hx_set_param(h, "record_count_in", "4");
        for (k = 0; k < 4000 && inst->ar_state != AR_RECORDING; k++) { FILL(1000, -3000); BLOCK(); }
        for (k = 0; k < 80; k++) { FILL(1000, -3000); BLOCK(); }
        b = hx_stub_cfeed(&n, NULL);
        HX_ASSERT(n > 200 && b[400] >= 1990 && b[400] <= 2000 && b[401] == b[400], "Mono L +6 dB: the take is not the left channel doubled on both sides");
        HX_ASSERT(hx_stub_feed_last(slot)[2] == b[400] && hx_stub_feed_last(slot)[3] == b[400], "Mono L +6 dB: the monitor is not the input as set");
        /* Mono R */
        hx_set_param(h, "ain_mode", "2"); hx_set_param(h, "ain_gain", "0");
        FILL(1000, -3000); BLOCK(); FILL(1000, -3000); BLOCK();
        HX_ASSERT(hx_stub_feed_last(slot)[0] == -3000 && hx_stub_feed_last(slot)[1] == -3000, "Mono R: not the right channel on both sides");
        /* the meter: the input as it comes, largest since the last read, then cleared */
        hx_get_param(h, "t0_au_in_meter", v, sizeof v);
        HX_ASSERT(!strcmp(v, "1000 3000"), v);
        hx_get_param(h, "t0_au_in_meter", v, sizeof v);
        HX_ASSERT(!strcmp(v, "0 0"), "the meter did not clear on read");
        /* saved and loaded */
        hx_set_param(h, "ain_mon", "2"); hx_set_param(h, "t4_au_in_len", "3"); hx_set_param(h, "t4_au_in_ovr", "1");
        hx_get_param(h, "t4_au_in", v, sizeof v);
        HX_ASSERT(!strcmp(v, "2 2 0 3 1"), v);
        hx_set_param(h, "t4_au_rec_cancel", "");
        {
            char *blob = malloc(1u << 20);
            FILE *fp = fmemopen(blob, 1u << 20, "w");
            au_save_state(inst, fp); fclose(fp);
            HX_ASSERT(strstr(blob, "\"t4_ain\":\"len=3 ovr=1\""), "the INPUT bank's track part is not saved");
            HX_ASSERT(!strstr(blob, "ain_mon"), "the device-wide input went into the project");
            au_track_release(inst, T_REC);
            HX_ASSERT(inst->au_trk[T_REC].in_len == 0 && inst->au_trk[T_REC].in_ovr == 0, "a released track kept its INPUT bank");
            au_load_state(inst, blob);
            HX_ASSERT(inst->au_trk[T_REC].in_len == 3 && inst->au_trk[T_REC].in_ovr == 1, "the INPUT bank did not load");
            free(blob);
        }
        hx_destroy(h);

        /* Monitor On with no take: straight to the output, not through a track;
         * during a take: through the take's track, not the output. Rec: only
         * while a take runs. Off: never. */
        h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
        slot = inst->tracks[T_REC].pfx.slot;
        hx_set_param(h, "ain_mon", "2");
        for (k = 0; k < 4; k++) { FILL(4000, 4000); BLOCK(); }
        HX_ASSERT(hx_last_audio()[0] == 4000 && hx_last_audio()[255] == 4000, "Monitor On: the input is not at the output with no take");
        HX_ASSERT(hx_stub_feed(slot, NULL, NULL) == 0, "Monitor On, no take: the input went through a track");
        lb_reset(0, inst->tracks[T_CLICK].pfx.slot); g_lb_on = 0;
        snprintf(p, sizeof p, "0 128 |%s/proj/dAVEBOx/samples/on.wav", g_root);
        hx_set_param(h, "t4_au_rec_arm", p);
        for (k = 0; k < 4; k++) { FILL(4000, 4000); BLOCK(); }
        HX_ASSERT(hx_last_audio()[0] == 0 && hx_stub_feed_last(slot)[0] == 4000, "Monitor On, a take armed: not moved to the take's track");
        hx_set_param(h, "t4_au_rec_cancel", "");
        for (k = 0; k < 4; k++) { FILL(4000, 4000); BLOCK(); }
        HX_ASSERT(hx_last_audio()[0] == 4000, "Monitor On: not back at the output after the take");
        hx_set_param(h, "ain_mon", "0");
        for (k = 0; k < 4; k++) { FILL(4000, 4000); BLOCK(); }
        HX_ASSERT(hx_last_audio()[0] == 0 && hx_stub_feed(slot, NULL, NULL) == 0, "Monitor Rec: heard with no take running");
        hx_set_param(h, "ain_mon", "1");
        snprintf(p, sizeof p, "0 128 |%s/proj/dAVEBOx/samples/off.wav", g_root);
        hx_set_param(h, "t4_au_rec_arm", p);
        hx_set_param(h, "record_count_in", "4");
        for (k = 0; k < 4000 && inst->ar_state != AR_RECORDING; k++) { FILL(4000, 4000); BLOCK(); }
        for (k = 0; k < 20; k++) { FILL(4000, 4000); BLOCK(); }
        HX_ASSERT(hx_stub_feed(slot, NULL, NULL) == 0 && hx_last_audio()[0] == 0, "Monitor Off: the input was heard during the take");
        b = hx_stub_cfeed(&n, NULL);
        HX_ASSERT(n > 0 && b[(n - 1) * 2] == 4000, "Monitor Off: the take did not record the input");
        hx_set_param(h, "t4_au_rec_cancel", "");
        hx_destroy(h);

        /* Length 2 bars: an empty clip's take ends itself after two bars */
        h = rig(1, 0); inst = (seq8_instance_t *)h->inst;
        lb_reset(0, inst->tracks[T_CLICK].pfx.slot); g_lb_on = 0;
        hx_set_param(h, "t4_au_in_len", "2");
        snprintf(p, sizeof p, "0 128 |%s/proj/dAVEBOx/samples/len.wav", g_root);
        hx_set_param(h, "t4_au_rec_arm", p);
        hx_set_param(h, "record_count_in", "4");
        for (k = 0; k < 9000 && inst->ar_state != AR_DONE && inst->ar_state < AR_CANCELLED; k++) { FILL(2000, 2000); BLOCK(); }
        b = hx_stub_cfeed(&n, NULL);
        HX_ASSERT(inst->ar_state == AR_DONE && inst->ar_ticks == 2 * RS_BAR_TICKS && n == 2 * BAR, "Length 2: the take did not end itself after two bars");
        hx_destroy(h);
    }
    /* Replace: the clip's sound is out while the input is in, back after a punch-out */
    h = rig(1, 1); inst = (seq8_instance_t *)h->inst;
    snprintf(p, sizeof p, "0|%s/src/click.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, T_REC, 0) == 2, "replace: the clip's sample did not load");
    hx_set_param(h, "t4_au_set_sync", "0 2");
    hx_set_param(h, "t4_au_set_orig", "0 0");
    hx_set_param(h, "t4_au_in_ovr", "1");
    lb_reset(300, inst->tracks[T_CLICK].pfx.slot); g_lb_on = 0;
    {
        int16_t *in2; int f3;
        snprintf(p, sizeof p, "0 300 |%s/proj/dAVEBOx/samples/replace.wav", g_root);
        hx_set_param(h, "t4_au_rec_arm", p);
        HX_ASSERT(inst->ar_replace == 1, "replace: not armed as a replace");
        hx_set_param(h, "record_count_in", "4");
        for (k = 0; k < 6000 && inst->ar_state != AR_RECORDING; k++) { in2 = hx_stub_input(); for (f3 = 0; f3 < 256; f3++) in2[f3] = 100; hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; }
        for (k = 0; k < 6000 && inst->ar_done <= BAR / 4 + 2000; k++) { in2 = hx_stub_input(); for (f3 = 0; f3 < 256; f3++) in2[f3] = 100; hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; }
        hx_set_param(h, "t4_au_rec_stop", "");
        for (k = 0; k < 6000 && inst->ar_state != AR_DONE && inst->ar_state < AR_CANCELLED; k++) { in2 = hx_stub_input(); for (f3 = 0; f3 < 256; f3++) in2[f3] = 100; hx_stub_feed_reset(); hx_render(h, 1); g_lb_pos += 128; }
        b = hx_stub_cfeed(&n, NULL);
        HX_ASSERT(inst->ar_state == AR_DONE && n == BAR, "replace: the take is not the clip's bar");
        HX_ASSERT(b[0] == 100 && b[(BAR / 4) * 2] == 100, "replace: the clip's sound is in the take while the input is in");
        HX_ASSERT(b[(BAR / 2) * 2] > CLICK / 2 - 200 && b[(BAR / 2) * 2] < CLICK / 2 + 200, "replace: after the punch-out the clip's sound did not come back");
    }
    hx_destroy(h);

    printf("PASS: test_audio_rec\n");
    return 0;
}
