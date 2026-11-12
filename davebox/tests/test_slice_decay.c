/* tests/test_slice_decay.c — a slice's Decay falls exponentially, as a drum
 * sampler's does (Josh, 2026-11-12: "Slice decay envelope - should they be
 * exponential like drum rack?"): a Move drum cell's curve, -83.87 dB over its
 * Decay, so a quarter of the way in it is already ~-21 dB (x0.09) and halfway
 * ~-42 dB (x0.008). A straight line would still be at 75 % and 50 %. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }
#define BAR 88200u
/* a steady square wave: every level change is the envelope's */
static void write_bar(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t n = BAR, i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, (i / 40) % 2 ? 12000 : -12000);
    fclose(f);
}

int main(void) {
    char p[400], msg[200];
    int i, k;
    snprintf(g_root, sizeof g_root, "/tmp/hx_slice_decay_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/bar.wav", g_root); write_bar(p);

    hx_t *h = hx_create(NULL); HX_NO_LEAD(h);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "t5_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/bar.wav", AU_SLC, g_root);
    hx_set_param(h, "t5_au_pick", p);
    for (i = 0; i < 4000 && au_cl(inst, 5, AU_SLC)->state != 2; i++) { hx_render(h, 1); usleep(1000); }
    HX_ASSERT(au_cl(inst, 5, AU_SLC)->state == 2, "the sample did not load");
    hx_set_param(h, "t5_au_set_even", "16 2");            /* two chops of a second each */
    au_cl(inst, 5, AU_SLC)->sl[0].decay_ms = 400;         /* 17,640 frames, inside the chop */

    /* one hit, then the level per block */
    int slot = inst->tracks[5].pfx.slot;
    double lv[160] = {0};
    au_note_event(5, 0, 0x90, 100, 0);
    for (k = 0; k < 160; k++) {
        hx_stub_feed_reset();
        hx_render(h, 1);
        const int16_t *b = hx_stub_feed_last(slot);
        double s = 0;
        if (hx_stub_feed(slot, NULL, NULL) > 0) for (i = 0; i < 128; i++) s += abs(b[i * 2]);
        lv[k] = s / 128.0;
    }
    /* blocks of 128: 400 ms = ~138 blocks. Start (block 1), a quarter (~34),
     * halfway (~69) */
    double l0 = lv[1], lq = lv[35], lh = lv[70];
    snprintf(msg, sizeof msg, "no sound at the hit (%.0f)", l0);
    HX_ASSERT(l0 > 1000, msg);
    snprintf(msg, sizeof msg, "a quarter into Decay the level is %.2f of the start (exponential ~0.09, a line 0.75)", lq / l0);
    HX_ASSERT(lq / l0 > 0.06 && lq / l0 < 0.13, msg);
    snprintf(msg, sizeof msg, "halfway into Decay the level is %.3f of the start (exponential ~0.008, a line 0.50)", lh / l0);
    HX_ASSERT(lh / l0 > 0.004 && lh / l0 < 0.016, msg);
    snprintf(msg, sizeof msg, "past Decay it still sounds (%.0f)", lv[150]);
    HX_ASSERT(lv[150] < 1.0, msg);
    hx_destroy(h);
    printf("PASS: test_slice_decay\n");
    return 0;
}
