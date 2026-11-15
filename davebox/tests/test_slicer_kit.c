/* tests/test_slicer_kit.c — CONVERT TO KIT's bake (tN_au_kit, seq8_audio.c
 * au_kit_bake): the Slicer's sample as it sounds, sample-wide, written by the
 * loader. Pinned here:
 *   1. the file is the RANGE only, at the sample's rate and channels, retuned
 *      by Pitch / Detune (varispeed: +12 is half as long, frame i the
 *      sample's rs + 2i) and set to its Gain;
 *   2. a Gain past full scale is held to a 0 dBFS peak; get tN_au_kit says
 *      what is left over, for the pads;
 *   3. R 1 writes the reverse beside it (" rev"), frame for frame;
 *   4. Sync Pitch retunes by the tempo ratio; Sync Warp stretches to the
 *      tempo first (the length by the ratio, the pitch kept), Off neither;
 *   5. no Slicer / no sample: failed at once, nothing written; a failed write
 *      leaves no file behind;
 *   6. the read echoes the request's number (a read can overtake the write);
 *   7. a streamed sample (chunks only) is read whole from the project for it. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define AUS(t) (&inst->au_store[(t)][AU_SLC])
#define RATE 44100u
#define NFR  (2u * RATE)

static char g_root[256];
static int g_seq = 0;
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* stereo: L a 441 Hz tone at 12000, R its negative half as loud */
static int16_t src_l(uint32_t i) { return (int16_t)lrint(12000.0 * sin(2.0 * M_PI * 441.0 * (double)i / RATE)); }
static void write_wav(const char *path) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + NFR * 4); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 2); put_le32(f, RATE); put_le32(f, RATE * 4);
    put_le16(f, 4); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, NFR * 4);
    for (i = 0; i < NFR; i++) { put_le16(f, src_l(i)); put_le16(f, -src_l(i) / 2); }
    fclose(f);
}

/* a 16-bit WAV as this bake writes it: frames, channels, rate; pcm malloc'd */
static int16_t *read_wav(const char *path, uint32_t *frames, int *ch, uint32_t *rate) {
    FILE *f = fopen(path, "rb");
    unsigned char h[44];
    uint32_t data;
    uint16_t c;
    int16_t *pcm;
    if (!f) return NULL;
    if (fread(h, 1, 44, f) != 44 || memcmp(h, "RIFF", 4) || memcmp(h + 36, "data", 4)) { fclose(f); return NULL; }
    memcpy(&c, h + 22, 2); memcpy(rate, h + 24, 4); memcpy(&data, h + 40, 4);
    *ch = c; *frames = data / (2u * c);
    pcm = (int16_t *)malloc(data ? data : 2);
    if (fread(pcm, 1, data, f) != data) { free(pcm); fclose(f); return NULL; }
    fclose(f);
    return pcm;
}

static int wait_loaded(hx_t *h, int t) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        if (au_cl(inst, t, AU_SLC)->state != 1) return au_cl(inst, t, AU_SLC)->state;
        usleep(1000);
    }
    return au_cl(inst, t, AU_SLC)->state;
}
/* ask for the bake, wait for it: the state read back, *db the Gain baked */
static int bake(hx_t *h, const char *val, double *db) {
    char out[64];
    int st = 0, err = 0, i, sq = -1;
    hx_set_param(h, "t4_au_kit", val);
    for (i = 0; i < 8000; i++) {
        hx_render(h, 1);
        if (hx_get_param(h, "t4_au_kit", out, (int)sizeof out) > 0 && sscanf(out, "%d %d %lf %d", &st, &err, db, &sq) == 4 &&
            sq == g_seq && st != 1) break;
        usleep(1000);
    }
    return st;
}
static int exists(const char *p) { struct stat sb; return stat(p, &sb) == 0; }

/* the bake's pitch on L over 2000 frames from `at`: the best period, as Hz */
static double freq_at(const int16_t *pcm, int ch, uint32_t frames, long at) {
    /* the shortest lag correlating within 10 % of the best (a period that
     * is not a whole number of frames matches twice it a little better) */
    double c[241], bc = -1e300;
    int lag;
    for (lag = 40; lag <= 240; lag++) {
        long i;
        c[lag] = 0;
        for (i = at; i < at + 2000 && i + lag < (long)frames; i++) c[lag] += (double)pcm[i * ch] * pcm[(i + lag) * ch];
        if (c[lag] > bc) bc = c[lag];
    }
    for (lag = 41; lag < 240; lag++)
        if (c[lag] >= 0.9 * bc && c[lag] >= c[lag - 1] && c[lag] >= c[lag + 1]) {
            /* the peak between whole lags (parabolic) */
            double d = c[lag - 1] - 2 * c[lag] + c[lag + 1];
            double off = d != 0 ? 0.5 * (c[lag - 1] - c[lag + 1]) / d : 0;
            return (double)RATE / ((double)lag + off);
        }
    return 0;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    char p[400], k1[400], k1r[400], v[600];
    uint32_t n, rate, i, nr;
    int ch, chr, bad;
    int16_t *pcm, *rev;
    double db = -99;

    snprintf(g_root, sizeof g_root, "/tmp/hx_slicer_kit_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/kits", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/tone.wav", g_root); write_wav(p);

    h = hx_create(NULL); HX_NO_LEAD(h);
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "bpm", "140");

    /* ==== 5a. not a Slicer: failed at once ==== */
    snprintf(k1, sizeof k1, "%s/kits/k1.wav", g_root);
    snprintf(k1r, sizeof k1r, "%s/kits/k1 rev.wav", g_root);
    snprintf(v, sizeof v, "1 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 3 && !exists(k1), "a track with no Slicer was baked");

    hx_set_param(h, "t4_convert_to_slicer", "");
    HX_ASSERT(bake(h, v, &db) == 3 && !exists(k1), "a Slicer with no sample was baked");
    snprintf(p, sizeof p, "%d|%s/src/tone.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "the tone did not load");
    hx_set_param(h, "t4_au_set_bpm", "16 1000");                 /* the sample at 100 */

    /* ==== 1 + 3. the range, +12, Gain +6, and its reverse ==== */
    hx_set_param(h, "t4_au_set_start", "16 11025");
    hx_set_param(h, "t4_au_set_end", "16 77175");
    hx_set_param(h, "t4_au_set_pitch", "16 12");
    hx_set_param(h, "t4_au_set_gain", "16 6");
    HX_ASSERT(bake(h, v, &db) == 2, "the bake failed");
    HX_ASSERT(fabs(db) < 0.01, "a Gain within full scale was not baked whole (some left to the pads)");
    pcm = read_wav(k1, &n, &ch, &rate);
    HX_ASSERT(pcm && ch == 2 && rate == RATE && n == 33075, "the bake is not the range, half as long, stereo at the rate");
    bad = 0;
    for (i = 0; i < n - 1; i++) {
        double g = pow(10.0, 6.0 / 20.0);
        long l = lrint(src_l(11025 + 2 * i) * g), r = lrint((-src_l(11025 + 2 * i) / 2) * g);
        if (labs(pcm[i * 2] - l) > 1 || labs(pcm[i * 2 + 1] - r) > 1) bad++;
    }
    HX_ASSERT(!bad, "the bake's frames are not the sample's rs + 2i at the Gain");
    rev = read_wav(k1r, &nr, &chr, &rate);
    HX_ASSERT(rev && nr == n && chr == 2, "no reverse beside it");
    for (i = 0, bad = 0; i < n; i++)
        if (rev[i * 2] != pcm[(n - 1 - i) * 2] || rev[i * 2 + 1] != pcm[(n - 1 - i) * 2 + 1]) bad++;
    HX_ASSERT(!bad, "the reverse is not the bake backwards");
    snprintf(p, sizeof p, "%s.tmp", k1);
    HX_ASSERT(!exists(p), "a temp file was left");
    free(pcm); free(rev);

    /* ==== 2. a Gain past full scale ==== */
    hx_set_param(h, "t4_au_set_gain", "16 12");
    snprintf(k1, sizeof k1, "%s/kits/k2.wav", g_root);
    snprintf(v, sizeof v, "0 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 2, "the loud bake failed");
    HX_ASSERT(fabs(db - (12.0 - 20.0 * log10(32767.0 / 12000.0))) < 0.05, "the Gain past a 0 dBFS peak was not left to the pads");
    pcm = read_wav(k1, &n, &ch, &rate);
    {
        int pk = 0;
        for (i = 0; i < n * 2; i++) if (abs(pcm[i]) > pk) pk = abs(pcm[i]);
        HX_ASSERT(pk >= 32700 && pk <= 32767, "the peak is not at full scale");
    }
    snprintf(p, sizeof p, "%s/kits/k2 rev.wav", g_root);
    HX_ASSERT(!exists(p), "R 0 wrote a reverse");
    free(pcm);
    hx_set_param(h, "t4_au_set_gain", "16 0");
    hx_set_param(h, "t4_au_set_pitch", "16 0");

    /* ==== 4. Sync: Pitch retunes by the tempo, Warp stretches, Off neither ==== */
    snprintf(k1, sizeof k1, "%s/kits/off.wav", g_root);
    snprintf(v, sizeof v, "0 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 2, "Off");
    pcm = read_wav(k1, &n, &ch, &rate);
    HX_ASSERT(n == 66150 && fabs(freq_at(pcm, 2, n, 20000) - 441.0) < 5, "Off is not the range as it is");
    free(pcm);
    hx_set_param(h, "t4_au_set_sync", "16 1");
    snprintf(k1, sizeof k1, "%s/kits/pitch.wav", g_root);
    snprintf(v, sizeof v, "0 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 2, "Pitch");
    pcm = read_wav(k1, &n, &ch, &rate);
    HX_ASSERT(n == (uint32_t)(66150 / 1.4 + 0.5) && fabs(freq_at(pcm, 2, n, 15000) - 441.0 * 1.4) < 10,
              "Pitch did not retune by the tempo ratio");
    free(pcm);
    hx_set_param(h, "t4_au_set_sync", "16 3");
    snprintf(k1, sizeof k1, "%s/kits/warp.wav", g_root);
    snprintf(v, sizeof v, "0 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 2, "Warp");
    pcm = read_wav(k1, &n, &ch, &rate);
    HX_ASSERT(n == (uint32_t)((66150 / 1.4 + 0.5)) && fabs(freq_at(pcm, 2, n, 15000) - 441.0) < 5,
              "Warp did not stretch to the tempo at the sample's pitch");
    free(pcm);

    /* ==== 7. a streamed sample (over au_stream_sec: chunks only) is read whole for the bake ==== */
    hx_set_param(h, "t4_au_set_sync", "16 0");
    au_stream_sec = 1;                                            /* the 2 s tone now streams */
    snprintf(p, sizeof p, "%d|%s/src/tone.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_clear", "16");
    hx_render(h, 2);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2 && AUS(4)->smp && !AUS(4)->smp->pcm, "setup: the tone did not load streamed");
    au_stream_sec = 60;
    hx_set_param(h, "t4_au_set_start", "16 11025");
    hx_set_param(h, "t4_au_set_end", "16 77175");
    hx_set_param(h, "t4_au_set_pitch", "16 12");
    hx_set_param(h, "t4_au_set_gain", "16 0");
    snprintf(k1, sizeof k1, "%s/kits/streamed.wav", g_root);
    snprintf(v, sizeof v, "0 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 2, "a streamed sample was not baked");
    pcm = read_wav(k1, &n, &ch, &rate);
    HX_ASSERT(pcm && n == 33075 && ch == 2, "the streamed bake is not the range at +12");
    for (i = 0, bad = 0; i < n - 1; i++)
        if (abs(pcm[i * 2] - src_l(11025 + 2 * i)) > 1) bad++;
    HX_ASSERT(!bad, "the streamed bake's frames are not the sample's");
    free(pcm);

    /* ==== 5b. a write that cannot happen leaves nothing ==== */
    snprintf(k1, sizeof k1, "%s/nodir/x.wav", g_root);
    snprintf(v, sizeof v, "1 %d|%s", ++g_seq, k1);
    HX_ASSERT(bake(h, v, &db) == 3 && !exists(k1), "a failed write reported done or left a file");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_slicer_kit\n");
    return 0;
}
