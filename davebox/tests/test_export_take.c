/* tests/test_export_take.c — the Ableton export's take of an Audio track's
 * clip (seq8_resample.c export_take_start; Josh, 2026-11-02: "export
 * flattens"):
 *   - its length is the clip's own span in ticks (not whole bars), or where it
 *     and the Conductor's clip line up; 0 = silent, -1 = past the cap;
 *   - the track's slot, Dry (its effects, its fader), after a warm-up pass;
 *   - a muted or soloed-out track plays for the take (and only then);
 *   - with `cond` the Conductor's clip in the row plays with it and moves the
 *     track; without, it does not;
 *   - the project is left as it was: the clips armed before come back. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
static void write_tone(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 44100, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (i & 64) ? 9000 : -9000);
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
static long geti(hx_t *h, const char *k) {
    char b[64];
    return hx_get_param(h, k, b, sizeof b) > 0 ? atol(b) : -999;
}

/* Track 4 Audio, clip 0 a Loop clip with the tone, `steps` long. */
static hx_t *rig(int steps) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    char p[300];
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    snprintf(p, sizeof p, "0|%s/src/tone.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    if (wait_loaded(h, 4, 0) != 2) return NULL;
    inst->tracks[4].clips[0].length = (uint16_t)steps;
    /* Sync Pitch: plain varispeed. Warp's stretcher runs on its own thread,
     * which a render loop this fast starves; what is tested is the routing */
    hx_set_param(h, "t4_au_set_sync", "0 2");
    return h;
}

/* Run a take to its end; the slot's fed energy while it RECORDED. */
static uint64_t take(hx_t *h, const char *val, int *ok) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int slot = inst->tracks[4].pfx.slot, i;
    uint64_t e0 = 0, e1 = 0;
    hx_stub_capture_reset();
    hx_stub_feed_reset();
    hx_set_param(h, "export_take", val);
    for (i = 0; i < 20000 && inst->resample_state != RS_RECORDING
                && inst->resample_state != RS_FAILED; i++) hx_render(h, 1);
    hx_stub_feed(slot, NULL, &e0);
    for (i = 0; i < 20000 && inst->resample_state == RS_RECORDING; i++) hx_render(h, 1);
    hx_stub_feed(slot, NULL, &e1);
    *ok = inst->resample_state == RS_DONE;
    return e1 - e0;
}
static void finish(hx_t *h) {
    hx_set_param(h, "transport", "stop");
    hx_render(h, 4);
    hx_set_param(h, "resample_clear", "1");
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[300];
    int ok, kind, index, block;
    uint32_t frames;
    const char *path;

    snprintf(g_root, sizeof g_root, "/tmp/hx_xtake_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/tone.wav", g_root); write_tone(p);

    /* ---- the length: the clip's own span, in ticks ---- */
    h = rig(24);                                     /* 1.5 bars */
    HX_ASSERT(h, "the tone did not load");
    inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(geti(h, "export_take_ticks_t4_c0_k0") == 576, "a 24-step clip's take is not its 576 ticks");
    HX_ASSERT(geti(h, "export_take_ticks_t4_c1_k0") == 0, "an empty clip has a take");
    HX_ASSERT(geti(h, "resample_bars_t4_c0") == 3, "control: Resample clip rounds to whole bars");
    hx_set_param(h, "t6_convert_to_conduct", "1");
    HX_ASSERT(inst->conductor_track == 6, "no Conductor");
    HX_ASSERT(geti(h, "export_take_ticks_t4_c0_k1") == 576, "an empty Conductor clip changed the length");
    {   /* three semitones above the key's root */
        char n[16];
        snprintf(n, sizeof n, "%d 100", eff_pad_key(inst) + 60 + 3);
        hx_set_param(h, "t6_c0_step_0_toggle", n);
    }
    HX_ASSERT(geti(h, "export_take_ticks_t4_c0_k1") == 1152, "the take is not where the clip and the Conductor's line up");
    HX_ASSERT(geti(h, "export_take_ticks_t4_c0_k0") == 576, "without the Conductor its clip counts");
    inst->tracks[6].clips[0].length = 255;          /* 6120 ticks against 576: past 64 bars */
    HX_ASSERT(geti(h, "export_take_ticks_t4_c0_k1") == -1, "a take past the cap was not refused");
    inst->tracks[6].clips[0].length = 16;
    printf("  ok   — a take is the clip's own span, or where it and the Conductor's line up\n");

    /* ---- the take: the slot, Dry, one pass in, exactly its ticks ---- */
    {
        uint64_t e;
        int starting = -1, i;
        hx_stub_capture_reset();
        snprintf(p, sizeof p, "4 0 576 0 |%s/a.wav", g_root);
        hx_set_param(h, "export_take", p);
        HX_ASSERT(inst->playing && inst->resample_state == RS_ARMED, "the take did not launch");
        for (i = 0; i < 20000 && inst->resample_state != RS_RECORDING; i++) {
            hx_render(h, 1);
            if (starting < 0 && inst->resample_state == RS_STARTING) {
                starting = i + 1;
                HX_ASSERT(inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step >= 576,
                          "the take started before its warm-up pass was over");
            }
        }
        HX_ASSERT(hx_stub_capture(NULL, &block, &frames, &path) == 1, "no capture");
        hx_stub_capture_src(&kind, &index);
        HX_ASSERT(kind == MOVE_CAPTURE_SLOT && index == inst->tracks[4].pfx.slot, "not the track's slot, Dry");
        HX_ASSERT(frames == rs_ticks_to_frames(inst, 576), "the take is not exactly 576 ticks of frames");
        HX_ASSERT(!strcmp(path, strchr(p, '|') + 1), "the path did not reach the host");
        (void)e;
        while (inst->resample_state == RS_RECORDING) hx_render(h, 1);
        HX_ASSERT(inst->resample_state == RS_DONE, "the take did not finish");
        finish(h);
        HX_ASSERT(inst->tracks[4].active_clip == 0 && !inst->playing, "after the take");
    }
    printf("  ok   — the take is the track's slot, Dry, one pass in, exactly its ticks\n");

    /* ---- muted: the take hears it; control: playing muted is silent ---- */
    {
        uint64_t e;
        snprintf(p, sizeof p, "4 0 576 0 |%s/b.wav", g_root);
        e = take(h, p, &ok);
        HX_ASSERT(ok && e > 0, "control: an unmuted take recorded nothing");
        finish(h);
        hx_set_param(h, "t4_mute", "1");
        HX_ASSERT(effective_mute(inst, 4), "the mute did not land");
        e = take(h, p, &ok);
        HX_ASSERT(ok && e > 0, "a muted track recorded silence");
        finish(h);
        HX_ASSERT(effective_mute(inst, 4), "the take left the track unmuted");
        /* control: muted, played normally, it is silent */
        {
            uint64_t a, b;
            int slot = inst->tracks[4].pfx.slot;
            hx_stub_feed_reset();
            hx_set_param(h, "t4_launch_clip", "0");
            hx_set_param(h, "transport", "play");
            hx_render(h, 50);
            hx_stub_feed(slot, NULL, &a);
            hx_render(h, 400);
            hx_stub_feed(slot, NULL, &b);
            HX_ASSERT(b == a, "control: a muted track sounds in plain play");
            hx_set_param(h, "transport", "stop");
            hx_render(h, 4);
        }
        hx_set_param(h, "t4_mute", "0");
        hx_set_param(h, "t2_solo", "1");             /* soloed out */
        e = take(h, p, &ok);
        HX_ASSERT(ok && e > 0, "a soloed-out track recorded silence");
        finish(h);
        hx_set_param(h, "t2_solo", "0");
    }
    printf("  ok   — a muted or soloed-out track plays for its take, and only then\n");

    /* ---- the Conductor plays with it only when asked ---- */
    {
        int i, moved = 0, cplay = 0;
        hx_set_param(h, "scale_aware", "0");
        snprintf(p, sizeof p, "4 0 1152 1 |%s/c.wav", g_root);
        hx_set_param(h, "export_take", p);
        for (i = 0; i < 20000 && inst->resample_state != RS_DONE && inst->resample_state != RS_FAILED; i++) {
            hx_render(h, 1);
            if (inst->resample_state == RS_RECORDING) {
                if (inst->tracks[6].clip_playing) cplay = 1;
                if (au_cond_now(inst, 4) == 3) moved = 1;
            }
        }
        HX_ASSERT(inst->resample_state == RS_DONE, "the Conductor take did not finish");
        HX_ASSERT(cplay && moved, "with the Conductor asked for, it did not move the track");
        finish(h);
        snprintf(p, sizeof p, "4 0 576 0 |%s/d.wav", g_root);
        hx_set_param(h, "export_take", p);
        moved = cplay = 0;
        for (i = 0; i < 20000 && inst->resample_state != RS_DONE && inst->resample_state != RS_FAILED; i++) {
            hx_render(h, 1);
            if (inst->tracks[6].clip_playing) cplay = 1;
            if (au_cond_now(inst, 4)) moved = 1;
        }
        HX_ASSERT(!cplay && !moved, "the Conductor played in a take that did not ask for it");
        finish(h);
    }
    printf("  ok   — the Conductor's clip plays with the take only when asked\n");

    /* ---- the project as it was ---- */
    {
        hx_set_param(h, "t4_launch_clip", "0");     /* armed before (stopped: queued) */
        int before = inst->tracks[4].active_clip, rel = inst->tracks[4].will_relaunch;
        uint32_t rs = inst->au_clip[4][0].rstart;
        snprintf(p, sizeof p, "4 0 576 0 |%s/e.wav", g_root);
        take(h, p, &ok);
        finish(h);
        HX_ASSERT(ok && inst->tracks[4].active_clip == before && inst->tracks[4].will_relaunch == rel,
                  "the armed clips did not come back");
        HX_ASSERT(inst->au_clip[4][0].rstart == rs && !strcmp(inst->au_clip[4][0].name, "tone.wav"),
                  "the take changed the clip");
    }
    printf("  ok   — the project is left as it was\n");

    /* ---- refusals ---- */
    snprintf(p, sizeof p, "3 0 576 0 |%s/f.wav", g_root);
    hx_set_param(h, "export_take", p);
    HX_ASSERT(inst->resample_state == RS_FAILED && geti(h, "resample_err") == RS_ERR_ROUTE, "a non-Audio track was taken");
    hx_set_param(h, "resample_clear", "1");
    snprintf(p, sizeof p, "4 0 0 0 |%s/f.wav", g_root);
    hx_set_param(h, "export_take", p);
    HX_ASSERT(inst->resample_state == RS_FAILED && geti(h, "resample_err") == RS_ERR_ARGS, "no length was taken");
    hx_set_param(h, "resample_clear", "1");
    printf("  ok   — refusals\n");

    hx_destroy(h);
    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS test_export_take\n");
    return 0;
}
