/* tests/test_audio_dir.c — an Audio Loop clip's Dir, as a MIDI clip's: Fwd,
 * Bwd, PPf, PPb (Josh, 2026-11-14: "make reverse a clip param ... mirror the
 * same options"). A ping-pong plays a pass each way in turn, counted from the
 * clip's start; a Shot plays one pass, so its ping-pongs are its first way.
 *
 *   1. Tempo Pitch (one voice): PPf forwards, then backwards, then forwards;
 *      PPb the other way round; Bwd backwards every pass; the engine's `pos`
 *      read says which way it goes now.
 *   2. Vintage: the pieces of the second pass of a PPf play backwards.
 *   3. Warp: the stretcher is told the cycle (both passes) and reads the
 *      second half backwards, from where the first ended.
 *   4. Free Tape: a ping-pong turns at End instead of wrapping to Start.
 *   5. Shot: PPf plays forwards and stops after ONE pass; PPb backwards.
 *   6. The project file keeps it (dr=); a Slicer's slot takes none. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, 2 s of a ramp: one bar at 120 */
static void write_ramp(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = 88200, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (int)(i % 30000));
    fclose(f);
}

static int wait_loaded(hx_t *h, int t, int c) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 3000; i++) {
        hx_render(h, 1);
        if ((*au_cl(inst, t, c)).state != 1) return (*au_cl(inst, t, c)).state;
        usleep(1000);
    }
    return (*au_cl(inst, t, c)).state;
}

static hx_t *rig(int sync, int dir) {
    char p[400];
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "rig: t4 is not Audio");
    snprintf(p, sizeof p, "0|%s/src/ramp.wav", g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 0) == 2, "rig: the sample did not load");
    snprintf(p, sizeof p, "0 %d", sync);
    hx_set_param(h, "t4_au_set_sync", p);
    hx_set_param(h, "t4_au_set_bpm", "0 1200");
    snprintf(p, sizeof p, "0 %d", dir);
    hx_set_param(h, "t4_au_set_dir", p);
    HX_ASSERT(au_cl(inst, 4, 0)->dir == dir, "rig: set_dir did not reach the clip");
    return h;
}
static void step(hx_t *h) {
    au_warp_service((seq8_instance_t *)h->inst);
    hx_render(h, 1);
}
static void play(hx_t *h) {
    hx_set_param(h, "transport", "play_focus:4:0");
}
/* on until the clip is `n` passes in, and a few blocks more */
static void to_pass(hx_t *h, uint32_t n) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 20000 && inst->au_trk[4].pass < n; i++) step(h);
    HX_ASSERT(inst->au_trk[4].pass == n, "the clip never came round");
    for (i = 0; i < 40; i++) step(h);
}
static const au_voice_t *loop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}
/* the `pos` read's last field: which way it plays now */
static int pos_rev(hx_t *h) {
    char b[64];
    int on = 0, sl = 0, rev = -1;
    unsigned fr = 0;
    HX_ASSERT(hx_get_param(h, "t4_au_pos", b, (int)sizeof b) > 0, "no pos read");
    HX_ASSERT(sscanf(b, "%d %u %d %d", &on, &fr, &sl, &rev) == 4, "the pos read has no direction");
    return rev;
}
/* the way the Tempo Pitch loop plays: +1 / -1 (0: none) */
static int loop_way(hx_t *h) {
    const au_voice_t *v = loop_voice(&((seq8_instance_t *)h->inst)->au_trk[4]);
    return v ? (v->step < 0 ? -1 : 1) : 0;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400];
    au_warp_manual = 1;                          /* the stretcher by hand (step) */
    snprintf(g_root, sizeof g_root, "/tmp/hx_audio_dir_%d", (int)getpid());
    snprintf(p, sizeof p, "rm -rf '%s' && mkdir -p '%s/src' '%s/proj/dAVEBOx'", g_root, g_root, g_root);
    HX_ASSERT(system(p) == 0, "mkdir failed");
    snprintf(p, sizeof p, "%s/src/ramp.wav", g_root);
    write_ramp(p);

    /* ==== 1. Tempo Pitch: each pass its own way ==== */
    {
        static const struct { int dir; int way[3]; const char *name; } C[] = {
            { AU_DIR_FWD, { 1, 1, 1 },    "Fwd" },
            { AU_DIR_BWD, { -1, -1, -1 }, "Bwd" },
            { AU_DIR_PPF, { 1, -1, 1 },   "PPf" },
            { AU_DIR_PPB, { -1, 1, -1 },  "PPb" },
        };
        for (int k = 0; k < 4; k++) {
            h = rig(AU_SYNC_PITCH, C[k].dir);
            inst = (seq8_instance_t *)h->inst;
            play(h);
            for (uint32_t n = 0; n < 3; n++) {
                to_pass(h, n);
                if (loop_way(h) != C[k].way[n]) {
                    fprintf(stderr, "FAIL: Tempo Pitch %s pass %u played %d, wanted %d\n", C[k].name, n, loop_way(h), C[k].way[n]);
                    return 1;
                }
                HX_ASSERT(pos_rev(h) == (C[k].way[n] < 0), "the pos read does not say which way it plays");
            }
            hx_destroy(h);
        }
        printf("  ok   — Tempo Pitch: Fwd, Bwd, PPf, PPb pass by pass; `pos` says which way\n");
    }

    /* ==== 2. Vintage: the second pass's pieces go backwards ==== */
    {
        h = rig(AU_SYNC_VINTAGE, AU_DIR_PPF);
        inst = (seq8_instance_t *)h->inst;
        play(h);
        int fw = 0, bw = 0;
        for (uint32_t n = 0; n < 2; n++) {
            to_pass(h, n);
            for (int b = 0; b < 200; b++) {
                step(h);
                for (int i = 0; i < AU_VOICES; i++) {
                    const au_voice_t *v = &inst->au_trk[4].v[i];
                    if (!v->active || v->mode_loop || v->rel_len) continue;
                    if (n == 0) fw += v->step > 0 ? 1 : -1000;
                    else bw += v->step < 0 ? 1 : -1000;
                }
            }
        }
        HX_ASSERT(fw > 0 && bw > 0, "Vintage PPf: the first pass's pieces are not all forwards, or the second's not all backwards");
        hx_destroy(h);
        printf("  ok   — Vintage PPf: the second pass's pieces play backwards\n");
    }

    /* ==== 2b. REMIX on a PPf clip: the second pass's pieces read backwards ==== */
    {
        h = rig(AU_SYNC_VINTAGE, AU_DIR_PPF);
        inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t4_remix_type", "0");
        hx_set_param(h, "t4_remix_var", "0");
        hx_set_param(h, "t4_remix_on", "1");
        play(h);
        int fw = 0, bw = 0;
        for (uint32_t n = 0; n < 2; n++) {
            to_pass(h, n);
            for (int b = 0; b < 200; b++) {
                step(h);
                for (int i = 0; i < AU_VOICES; i++) {
                    const au_voice_t *v = &inst->au_trk[4].v[i];
                    if (!v->active || v->mode_loop || v->rel != v->rel_len || v->tail) continue;   /* a piece (a tail turns back) */
                    if (n == 0) fw += v->step > 0 ? 1 : -1000;
                    else bw += v->step < 0 ? 1 : -1000;
                }
            }
        }
        HX_ASSERT(inst->au_trk[4].rmx_on, "REMIX rig: not on");
        HX_ASSERT(fw > 0 && bw > 0, "REMIX PPf: the first pass's pieces are not forwards, or the second's not backwards");
        hx_destroy(h);
        printf("  ok   — REMIX on PPf: the second pass's pieces read backwards\n");
    }

    /* ==== 3. Warp: the cycle is both passes, the second read backwards ==== */
    {
        h = rig(AU_SYNC_WARP, AU_DIR_PPF);
        inst = (seq8_instance_t *)h->inst;
        play(h);
        to_pass(h, 0);
        au_warper_t *X = (au_warper_t *)inst->au_warper;
        HX_ASSERT(X && X->trk[4], "Warp: no stretcher");
        const au_warp_cmd_t *c = &X->trk[4]->cmd;
        HX_ASSERT(c->dir == AU_DIR_PPF && c->Lp > 0 && fabs(c->L - 2.0 * c->Lp) < 1e-9,
                  "Warp PPf: the stretcher was not told the cycle (both passes) and the pass");
        HX_ASSERT(pos_rev(h) == 0, "Warp PPf: the first pass reads as backwards");
        to_pass(h, 1);
        HX_ASSERT(pos_rev(h) == 1, "Warp PPf: the second pass reads as forwards");
        hx_destroy(h);
        /* the map itself: a frame of the second half is the first's mirrored,
         * so where the first ends the second begins */
        static au_warp_t W;
        memset(&W, 0, sizeof W);
        W.cur.rs = 1000; W.cur.re = 1100; W.cur.P = 100; W.cur.L = 200; W.cur.Lp = 100; W.cur.dir = AU_DIR_PPF;
        W.rpt = 1.0;
        double g; int rev;
        double x = au_warp_pos(&W, 30.0, &g, &rev);
        HX_ASSERT(fabs(x - 30.0) < 1e-9 && rev == 0, "Warp map: the first half is not forwards");
        x = au_warp_pos(&W, 130.0, &g, &rev);
        HX_ASSERT(fabs(x - 30.0) < 1e-9 && rev == 1, "Warp map: the second half is not the first backwards");
        W.cur.dir = AU_DIR_PPB;
        au_warp_pos(&W, 30.0, &g, &rev);
        HX_ASSERT(rev == 1, "Warp map: PPb's first half is not backwards");
        W.cur.dir = AU_DIR_FWD; W.cur.L = 100;
        au_warp_pos(&W, 130.0, &g, &rev);
        HX_ASSERT(rev == 0, "Warp map: Fwd turned round");
        printf("  ok   — Warp PPf: the stretcher's loop is both passes, the second backwards\n");
    }

    /* ==== 4. Free Tape: a ping-pong turns at End ==== */
    {
        for (int k = 0; k < 2; k++) {
            int dir = k ? AU_DIR_PPF : AU_DIR_FWD;
            h = rig(AU_SYNC_PITCH, dir);
            inst = (seq8_instance_t *)h->inst;
            hx_set_param(h, "t4_au_set_free", "0 1");
            play(h);
            int i, turned = 0, first = 0;
            for (i = 0; i < 400 && !inst->au_trk[4].free_on; i++) step(h);
            HX_ASSERT(inst->au_trk[4].free_on, "Free: never started");
            for (i = 0; i < 1400; i++) {            /* ~4 s: past End once */
                step(h);
                int w = loop_way(h);
                if (!first) first = w;
                if (w && first && w != first) turned = 1;
            }
            HX_ASSERT(first == 1, "Free Tape: does not start forwards");
            HX_ASSERT(turned == (dir == AU_DIR_PPF), dir == AU_DIR_PPF ? "Free Tape PPf: did not turn at End"
                                                                       : "Free Tape Fwd: turned round");
            hx_destroy(h);
        }
        printf("  ok   — Free Tape: PPf turns at End, Fwd wraps\n");
    }

    /* ==== 5. Shot: one pass, its first way ==== */
    {
        for (int k = 0; k < 2; k++) {
            h = rig(AU_SYNC_PITCH, k ? AU_DIR_PPB : AU_DIR_PPF);
            inst = (seq8_instance_t *)h->inst;
            hx_set_param(h, "t4_au_set_shot", "0 1");
            HX_ASSERT(au_dir(au_cl(inst, 4, 0)) == (k ? AU_DIR_BWD : AU_DIR_FWD), "Shot: a ping-pong does not play as its first way");
            play(h);
            for (int i = 0; i < 100; i++) step(h);
            HX_ASSERT(loop_way(h) == (k ? -1 : 1), "Shot: the wrong way");
            int i;
            for (i = 0; i < 2000 && inst->tracks[4].clip_playing; i++) step(h);
            HX_ASSERT(!inst->tracks[4].clip_playing, "Shot: the clip never stopped");
            HX_ASSERT(i < 900, "Shot PP: it played on past one pass");
            HX_ASSERT(au_cl(inst, 4, 0)->dir == (k ? AU_DIR_PPB : AU_DIR_PPF), "Shot: the clip's own Dir was changed");
            hx_destroy(h);
        }
        printf("  ok   — Shot: PPf plays forwards, PPb backwards, one pass; the Dir is kept\n");
    }

    /* ==== 6. saved; a Slicer takes none ==== */
    {
        char blob[1 << 16];
        h = rig(AU_SYNC_WARP, AU_DIR_PPB);
        inst = (seq8_instance_t *)h->inst;
        int n = hx_get_param(h, "state_full", blob, (int)sizeof blob);
        HX_ASSERT(n > 0 && strstr(blob, " dr=3 "), "the project file does not keep Dir");
        seq8_save_state(inst);
        hx_destroy(h);
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
        seq8_load_state(inst);
        HX_ASSERT(au_cl(inst, 4, 0)->dir == AU_DIR_PPB, "reloaded: Dir lost");
        hx_destroy(h);
        h = hx_create(NULL); inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t4_convert_to_slicer", "");
        hx_set_param(h, "t4_au_set_dir", "16 1");
        HX_ASSERT(au_cl(inst, 4, AU_SLC)->dir == 0, "a Slicer's slot took a Dir");
        hx_destroy(h);
        printf("  ok   — saved as dr=, reloaded; a Slicer's slot takes none\n");
    }

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_audio_dir\n");
    return 0;
}
