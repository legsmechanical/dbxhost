/* ONE-SHOT AUDIO CLIPS (Josh, 2026-10-29: "a one-shot mode in sample mode so
 * that clips can be fired off and stop at their end"; 2026-11-10: "it should be
 * a clip bank setting"). An Audio clip's Mode: Loop (as ever) or Shot — the
 * clip plays its length once per launch, then stops. Pinned here:
 *   - a Shot clip stops at its end; a Loop clip, launched the same way, plays on;
 *   - the Shot clip's sample goes quiet with it (the track's clip_playing gates it);
 *   - relaunched, a Shot clip plays once again;
 *   - Shot is saved and loaded (os=1); a Loop clip writes no os key;
 *   - the info read reports it (the field after rot);
 *   - a Slicer refuses it: its clips are sequences. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

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
/* an Audio track 2 with the tone in clip A (and clip B), project at state_path */
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
    HX_ASSERT(inst->tracks[2].pad_mode == PAD_MODE_AUDIO, "rig: track 2 is not an Audio track");
    /* Sync Pitch, as the other playback tests: deterministic in the harness
     * (Warp runs on a worker); one-shot does not depend on the sync mode */
    hx_set_param(h, "t2_au_set_sync", "0 2");
    hx_set_param(h, "t2_au_set_sync", "1 2");
    return h;
}
/* launch clip c and play; render until the clip stops or `max` blocks pass.
 * Returns the steps the clock moved while the clip played (-1: never stopped). */
static int play_until_stop(hx_t *h, int c, int max) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char v[8]; int i;
    snprintf(v, sizeof v, "%d", c);
    hx_set_param(h, "t2_launch_clip", v);
    hx_set_param(h, "transport", "play");
    for (i = 0; i < 400 && !inst->tracks[2].clip_playing; i++) hx_render(h, 1);
    HX_ASSERT(inst->tracks[2].clip_playing, "the clip never started playing");
    uint32_t t0 = inst->global_tick;
    for (i = 0; i < max; i++) {
        hx_render(h, 1);
        if (!inst->tracks[2].clip_playing) return (int)(inst->global_tick - t0);
    }
    return -1;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400];
    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_shot_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/tone.wav", g_root); write_tone(p, 4.0);

    /* ==== 1. a Loop clip plays on; a Shot clip stops at its end ==== */
    h = rig(); inst = (seq8_instance_t *)h->inst;
    {
        int len = inst->tracks[2].clips[0].length;
        HX_ASSERT(len > 0, "rig: clip A has no length");
        HX_ASSERT(play_until_stop(h, 0, 3000) == -1, "a Loop clip stopped by itself");
        {   /* the witness used below works: a playing clip feeds its slot sound */
            uint64_t e = 0; int slot = inst->tracks[2].pfx.slot;
            hx_stub_feed_reset(); hx_render(h, 40); hx_stub_feed(slot, NULL, &e);
            HX_ASSERT(e > 0, "a playing Audio clip fed its slot no sound (the quiet check below would prove nothing)");
        }
        hx_set_param(h, "transport", "stop"); hx_render(h, 20);

        hx_set_param(h, "t2_au_set_shot", "0 1");
        HX_ASSERT(au_cl(inst, 2, 0)->shot == 1, "set_shot did not reach the clip");
        int moved = play_until_stop(h, 0, 4000);
        HX_ASSERT(moved >= 0, "a Shot clip played on past its end");
        HX_ASSERT(moved >= len - 1 && moved <= len + 1, "a Shot clip did not stop after ONE pass of its length");
        HX_ASSERT(inst->playing, "the transport stopped with the clip (only the clip should)");
        /* ...and its sample went quiet with it: its slot is fed silence once any
         * fade has passed (an Audio track renders into its chain slot) */
        {
            uint64_t e = 0; int slot = inst->tracks[2].pfx.slot;
            hx_render(h, 60);                               /* any fade-out passes */
            hx_stub_feed_reset(); hx_render(h, 40); hx_stub_feed(slot, NULL, &e);
            HX_ASSERT(e == 0, "the Shot clip's sample still sounds after the clip stopped");
        }
        /* ...relaunched mid-song, it plays once more, ALL of it: from its top,
         * not joining in step with the song as a looping clip does */
        moved = play_until_stop(h, 0, 4000);
        HX_ASSERT(moved >= len - 1 && moved <= len + 1, "a relaunched Shot clip did not play its length once again");
        hx_set_param(h, "transport", "stop"); hx_render(h, 20);
    }

    /* ==== 2. the info read reports Mode; clip B (Loop) reports 0 ==== */
    {
        char buf[512];
        int n = hx_get_param(h, "t2_au_info_0", buf, (int)sizeof buf);
        HX_ASSERT(n > 0, "no info read for clip A");
        char *bar = strchr(buf, '|'); HX_ASSERT(bar != NULL, "the info read has no name");
        *bar = 0;
        char *last = strrchr(buf, ' ');
        HX_ASSERT(last && atoi(last + 1) == 1, "the info read does not report Shot as its last field");
        n = hx_get_param(h, "t2_au_info_1", buf, (int)sizeof buf);
        bar = strchr(buf, '|'); *bar = 0; last = strrchr(buf, ' ');
        HX_ASSERT(last && atoi(last + 1) == 0, "a Loop clip reports Shot");
    }

    /* ==== 3. saved and loaded: os=1 on the Shot clip, none on the Loop one ==== */
    seq8_save_state(inst);
    {
        FILE *f = fopen(inst->state_path, "r");
        static char st[65536]; size_t n = f ? fread(st, 1, sizeof st - 1, f) : 0; if (f) fclose(f); st[n] = 0;
        const char *a = strstr(st, "\"t2c0_aud\":\""), *b = strstr(st, "\"t2c1_aud\":\"");
        HX_ASSERT(a && b, "the Audio clips were not saved");
        const char *ae = strchr(a + 12, '"'), *be = strchr(b + 12, '"');
        HX_ASSERT(memmem(a, (size_t)(ae - a), "os=1", 4) != NULL, "a Shot clip saved without os=1");
        HX_ASSERT(memmem(b, (size_t)(be - b), "os=", 3) == NULL, "a Loop clip saved an os key");
    }
    hx_destroy(h);
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    seq8_load_state(inst);
    HX_ASSERT(inst->tracks[2].pad_mode == PAD_MODE_AUDIO, "reloaded: track 2 is not Audio");
    HX_ASSERT(au_cl(inst, 2, 0)->shot == 1, "reloaded: clip A lost Shot");
    HX_ASSERT(au_cl(inst, 2, 1)->shot == 0, "reloaded: clip B became Shot");
    hx_destroy(h);

    /* ==== 4. a Slicer refuses it ==== */
    h = hx_create(NULL); HX_NO_LEAD(h); inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t4_convert_to_slicer", "");
    hx_set_param(h, "t4_au_set_shot", "16 1");
    HX_ASSERT(au_cl(inst, 4, AU_SLC)->shot == 0, "a Slicer took Shot");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_audio_shot\n");
    return 0;
}
