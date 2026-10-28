/* tests/test_audio_beats.c — Tempo Beats (seq8_audio.c, sp_track_audio.c).
 *
 * The hits: found once by the loader from the waveform summary, each at the
 * start of its rising block (<= 256 frames before the attack), the same for a
 * streamed file as for a whole one; Sens picks which count, live. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `n` frames of gen(i) */
static void write_gen(const char *path, uint32_t n, int (*gen)(uint32_t)) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, gen(i));
    fclose(f);
}
#define BEAT 22050u                                 /* a quarter note at 120 bpm */
/* a 10 ms decaying burst on every quarter note */
static int g_clicks(uint32_t i) {
    uint32_t ph = i % BEAT;
    return ph < 441 ? (int)((ph & 1 ? 1 : -1) * (20000 - (int)ph * 40)) : 0;
}
static int g_ramp(uint32_t i) { return (int)(i % 30000); }
static int g_silence(uint32_t i) { (void)i; return 0; }
/* a steady +-3000 bed; a loud burst on each quarter, a soft one (5000) on each off-beat */
static int g_soft(uint32_t i) {
    uint32_t ph = i % BEAT, sign = i & 1;
    int a = 3000;
    if (ph < 441) a = 20000 - (int)ph * 40;
    else if (ph >= BEAT / 2 && ph < BEAT / 2 + 441) a = 5000;
    return sign ? a : -a;
}

/* a buzz: the level jumps up every other block — rises everywhere, none
 * standing out from the ~100 ms around it */
static int g_buzz(uint32_t i) { int a = (i / 256) & 1 ? 20000 : 3000; return i & 1 ? a : -a; }
/* a flam on each beat: a click, and a louder one 1024 frames (4 blocks) later */
static int g_flam(uint32_t i) {
    uint32_t ph = i % BEAT;
    int a = 0;
    if (ph >= 2048 && ph < 2489) a = 12000;
    else if (ph >= 3072 && ph < 3513) a = 20000;
    return i & 1 ? a : -a;
}
/* a slow attack on each beat: 6000 for 256 frames, then 20000 — a rise in two
 * blocks next to each other, which is one hit */
static int g_slow(uint32_t i) {
    uint32_t ph = i % BEAT;
    int a = 0;
    if (ph >= 2048 && ph < 2304) a = 6000;
    else if (ph >= 2304 && ph < 2745) a = 20000;
    return i & 1 ? a : -a;
}

static au_sample_t *load(const char *name, int stream) {
    char p[300];
    int err = -1;
    snprintf(p, sizeof p, "%s/%s", g_root, name);
    au_sample_t *s = au_read_file(p, stream, &err);
    HX_ASSERT(s && err == AU_ERR_NONE, "a test file did not load");
    return s;
}

int main(void) {
    char p[300];
    au_sample_t *s, *t;
    uint32_t k;

    snprintf(g_root, sizeof g_root, "/tmp/hx_beats_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/clicks.wav", g_root); write_gen(p, 4 * BEAT, g_clicks);
    snprintf(p, sizeof p, "%s/ramp.wav", g_root);   write_gen(p, 44100, g_ramp);
    snprintf(p, sizeof p, "%s/silent.wav", g_root); write_gen(p, 44100, g_silence);
    snprintf(p, sizeof p, "%s/soft.wav", g_root);   write_gen(p, 4 * BEAT, g_soft);
    snprintf(p, sizeof p, "%s/long.wav", g_root);   write_gen(p, 40 * BEAT, g_clicks);
    snprintf(p, sizeof p, "%s/buzz.wav", g_root);   write_gen(p, 44100, g_buzz);
    snprintf(p, sizeof p, "%s/flam.wav", g_root);   write_gen(p, 4 * BEAT, g_flam);
    snprintf(p, sizeof p, "%s/slow.wav", g_root);   write_gen(p, 4 * BEAT, g_slow);

    /* ---- clicks: Start + one hit per later click, each just before it ---- */
    s = load("clicks.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, AU_SENS_DEFAULT) == 4, "4 clicks are not 4 pieces at the default Sens");
    {
        int rmin, dmin, kept = 0;
        au_sens_min(AU_SENS_DEFAULT, &rmin, &dmin);
        for (k = 0; k < s->nhits; k++) {
            if (!au_hit_kept(s, k, rmin, dmin)) continue;
            uint32_t click = (uint32_t)(kept + 1) * BEAT;
            HX_ASSERT(s->hits[k] <= click && click - s->hits[k] < AU_MIP,
                      "a hit is not in the 256 frames before its click");
            kept++;
        }
        HX_ASSERT(kept == 3, "the clicks after the first are not 3 kept hits");
    }
    /* Start..End: only the hits inside count (Start itself is one) */
    HX_ASSERT(au_hit_count(s, BEAT + 100, 3 * BEAT + 100, AU_SENS_DEFAULT) == 3,                      /* Start, clicks 2 and 3 */ "Start..End did not bound the hits");
    au_sample_free(s);

    /* ---- a ramp and silence have no hits: one piece, from Start ---- */
    s = load("ramp.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, AU_SENS_DEFAULT) == 1, "a ramp found hits at the default Sens");
    au_sample_free(s);
    s = load("silent.wav", 0);
    HX_ASSERT(s->nhits == 0 && au_hit_count(s, 0, s->frames, 100) == 1, "silence found hits");
    au_sample_free(s);

    /* ---- Sens: low keeps the loud hits, high the soft ones too ---- */
    s = load("soft.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, 0) == 4, "Sens 0 did not keep only the 4 loud hits (Start + 3)");
    HX_ASSERT(au_hit_count(s, 0, s->frames, 100) == 8, "Sens 100 did not keep the soft off-beats too");
    au_sample_free(s);

    /* ---- a rise only counts against what is around it: a buzz has none
     * at Sens 0, however big each step ---- */
    s = load("buzz.wav", 0);
    HX_ASSERT(au_hit_count(s, 0, s->frames, 0) == 1, "a buzz's steady rises counted as hits at Sens 0");
    au_sample_free(s);
    /* ---- a rise over two blocks is one candidate (the bigger) ---- */
    s = load("slow.wav", 0);
    HX_ASSERT(s->nhits == 4, "a slow attack gave more than one candidate");
    au_sample_free(s);
    /* ---- a flam (two hits 23 ms apart) is one hit, its first ---- */
    s = load("flam.wav", 0);
    HX_ASSERT(s->nhits == 8, "a flam's two clicks are not two candidates");
    HX_ASSERT(au_hit_count(s, 0, s->frames, 100) == 5, "a flam counted as two hits (Start + 4 beats)");
    au_sample_free(s);

    /* ---- a streamed file finds exactly the hits a whole one does ---- */
    au_stream_sec = 1;
    s = load("long.wav", 0);
    t = load("long.wav", 1);
    HX_ASSERT(!s->st && t->st, "the long file did not load once whole and once streamed");
    HX_ASSERT(s->nhits == t->nhits && s->nhits >= 39, "streamed and whole found a different number of hits");
    for (k = 0; k < s->nhits; k++)
        HX_ASSERT(s->hits[k] == t->hits[k] && s->hit_d[k] == t->hit_d[k] && s->hit_r[k] == t->hit_r[k],
                  "a streamed hit differs from the whole file's");
    au_sample_free(s);
    au_sample_free(t);

    printf("PASS: Beats hits (clicks, ramp, silence, Sens, streamed = whole)\n");
    return 0;
}
