/* test_stt_core.c — the speech-to-text helper's recognizer-free core
 * (src/stt/stt_core.c): WAV reading + downmix, the go/cancel handshake, the
 * atomic result file. The recognizer itself only runs on a device. */
#define _POSIX_C_SOURCE 200809L
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "stt_core.h"

static int fails = 0;
#define CHECK(c, ...) do { if (!(c)) { fails++; printf("FAIL %s:%d ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static char dir[512];
static void path(char *out, const char *name) { snprintf(out, 1024, "%s/%s", dir, name); }

static void put32(FILE *f, uint32_t v) { unsigned char b[4] = { v, v >> 8, v >> 16, v >> 24 }; fwrite(b, 1, 4, f); }
static void put16(FILE *f, uint16_t v) { unsigned char b[2] = { v, v >> 8 }; fwrite(b, 1, 2, f); }

/* Writes a 16-bit WAV; l/r give per-channel amplitude of a 440 Hz sine.
 * junk = insert a LIST chunk before data; lie = data size field 0xFFFFFFFF. */
static float right_hz = 440.0f;   /* the right channel's tone (left is always 440 Hz) */
static void write_wav(const char *p, int chans, int rate, int frames, float l, float r, int junk, int lie) {
    FILE *f = fopen(p, "wb");
    uint32_t data = (uint32_t)frames * chans * 2;
    fwrite("RIFF", 1, 4, f); put32(f, 36 + data + (junk ? 12 : 0)); fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f); put32(f, 16); put16(f, 1); put16(f, chans); put32(f, rate);
    put32(f, rate * chans * 2); put16(f, chans * 2); put16(f, 16);
    if (junk) { fwrite("LIST", 1, 4, f); put32(f, 3); fwrite("abc", 1, 3, f); fputc(0, f); }
    fwrite("data", 1, 4, f); put32(f, lie ? 0xFFFFFFFFu : data);
    for (int i = 0; i < frames; i++) {
        float s = sinf(2.0f * 3.14159265f * 440.0f * i / rate);
        float sr = sinf(2.0f * 3.14159265f * right_hz * i / rate);
        put16(f, (uint16_t)(int16_t)(s * l * 32767.0f));
        if (chans == 2) put16(f, (uint16_t)(int16_t)(sr * r * 32767.0f));
    }
    fclose(f);
}

static double corr_sine(const float *x, int n, int rate) {
    double a = 0, b = 0, c = 0;
    for (int i = 0; i < n; i++) {
        double s = sin(2.0 * 3.14159265 * 440.0 * i / rate);
        a += x[i] * s; b += x[i] * x[i]; c += s * s;
    }
    return (b > 0 && c > 0) ? a / sqrt(b * c) : 0;
}

static char *slurp(const char *p) {
    FILE *f = fopen(p, "rb"); if (!f) return NULL;
    static char buf[4096]; size_t n = fread(buf, 1, sizeof(buf) - 1, f); buf[n] = 0; fclose(f); return buf;
}

int main(void) {
    snprintf(dir, sizeof(dir), "build/tests/stt_core_tmp");
    mkdir("build", 0755); mkdir("build/tests", 0755); mkdir(dir, 0755);
    char p[1024], q[1024], g[1024], c[1024];
    float *x; int n, rate; char err[64];

    /* stereo, both channels equal → averaged, normalised to 0.9, rate kept */
    path(p, "eq.wav"); write_wav(p, 2, 44100, 4410, 0.2f, 0.2f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0, "eq read: %s", err);
    CHECK(n == 4410 && rate == 44100, "eq n=%d rate=%d", n, rate);
    CHECK(fabsf(stt_peak(x, n) - 0.9f) < 0.01f, "eq peak %f", stt_peak(x, n));
    CHECK(corr_sine(x, n, rate) > 0.99, "eq not the sine");
    free(x);

    /* mic on ONE channel: the silent side must not dilute it. Normalisation
     * hides a 6 dB loss, so the CHOICE is pinned by the opposite-phase file
     * below: equal energy must be averaged (cancels to ~0), one-sided must not. */
    path(p, "oneside.wav"); write_wav(p, 2, 44100, 4410, 0.5f, 0.0f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0, "oneside read: %s", err);
    CHECK(fabsf(stt_peak(x, n) - 0.9f) < 0.01f && corr_sine(x, n, rate) > 0.99, "oneside lost");
    free(x);
    path(p, "anti.wav"); write_wav(p, 2, 44100, 4410, 0.5f, -0.5f, 0, 0);   /* equal energy, opposite phase */
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0, "anti read");
    CHECK(stt_peak(x, n) < 0.01f, "equal channels must be AVERAGED (peak %f)", stt_peak(x, n));
    free(x);
    /* the pick, not just the level: the quiet side carries a DIFFERENT tone
     * 14 dB down. Taking the loud side gives a clean 440 Hz; averaging would
     * mix the other tone in (correlation ~0.98). */
    right_hz = 1000.0f;
    path(p, "bleed.wav"); write_wav(p, 2, 44100, 4410, 0.5f, 0.1f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0, "bleed read");
    CHECK(corr_sine(x, n, rate) > 0.999, "one-sided mic was averaged with the other side (corr %f)", corr_sine(x, n, rate));
    free(x);
    right_hz = 440.0f;
    path(p, "rightonly.wav"); write_wav(p, 2, 44100, 4410, 0.0f, 0.5f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0 && corr_sine(x, n, rate) > 0.99, "right-only lost");
    free(x);

    /* mono, extra chunk before data, unpatched size field */
    path(p, "mono.wav"); write_wav(p, 1, 16000, 1600, 0.5f, 0, 1, 1);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0, "mono read: %s", err);
    CHECK(n == 1600 && rate == 16000, "mono n=%d rate=%d", n, rate);
    free(x);

    /* silence is not amplified into noise */
    path(p, "silent.wav"); write_wav(p, 2, 44100, 4410, 0.0f, 0.0f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) == 0 && stt_peak(x, n) == 0.0f, "silence changed");
    free(x);

    /* SILENCE IS JUDGED BEFORE NORMALISING. A quiet room (mic self-noise at
     * -50 dBFS) comes back at full scale like everything else, so a gate on
     * the returned buffer would pass it to the recognizer, which invents
     * words. The raw peak is what the gate sees. */
    float raw = -1.0f;
    path(p, "hiss.wav"); write_wav(p, 2, 44100, 44100, 0.003f, 0.003f, 0, 0);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, &raw, err, sizeof err) == 0, "hiss read");
    CHECK(fabsf(stt_peak(x, n) - 0.9f) < 0.01f, "hiss not normalised (peak %f)", stt_peak(x, n));
    CHECK(fabsf(raw - 0.003f) < 0.0005f, "raw peak %f, want 0.003", raw);
    CHECK(stt_gate(1000, raw) && !strcmp(stt_gate(1000, raw), "no_speech"), "hiss would be decoded");
    free(x);
    path(p, "talk.wav"); write_wav(p, 2, 44100, 44100, 0.05f, 0.05f, 0, 0);   /* -26 dBFS: speech */
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, &raw, err, sizeof err) == 0, "talk read");
    CHECK(stt_gate(1000, raw) == NULL, "speech refused (raw %f)", raw);
    free(x);
    CHECK(stt_gate(299, 0.5f) && !strcmp(stt_gate(299, 0.5f), "too_short"), "short take decoded");
    CHECK(stt_gate(300, 0.5f) == NULL, "300 ms refused");
    CHECK(stt_gate(1000, STT_SPEECH_PEAK) == NULL && stt_gate(1000, STT_SPEECH_PEAK * 0.9f) != NULL, "threshold moved");

    /* refusals */
    path(p, "nope.wav");
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) != 0 && !strcmp(err, "no_wav"), "missing: %s", err);
    path(p, "text.wav"); FILE *f = fopen(p, "w"); fputs("hello there, not a wave file", f); fclose(f);
    CHECK(stt_wav_read_mono(p, &x, &n, &rate, NULL, err, sizeof err) != 0 && !strcmp(err, "not_wav"), "text: %s", err);

    /* go / cancel / timeout */
    path(g, "1.go"); path(c, "1.cancel"); unlink(g); unlink(c);
    long t = stt_now_ms();
    CHECK(stt_wait_go(g, c, 120, 10) == -1, "no files: timeout");
    CHECK(stt_now_ms() - t >= 110, "timed out early");
    f = fopen(g, "w"); fclose(f);
    CHECK(stt_wait_go(g, c, 1000, 10) == 1, "go");
    f = fopen(c, "w"); fclose(f);
    CHECK(stt_wait_go(g, c, 1000, 10) == 0, "cancel wins over go");
    unlink(g);
    CHECK(stt_wait_go(g, c, 1000, 10) == 0, "cancel alone");
    unlink(c);

    /* result: escaped, atomic (no .tmp left), overwrites */
    path(q, "r.json");
    CHECK(stt_write_result(q, 1, "say \"hi\"\\\nnow", "", 120, 340, 2500) == 0, "write");
    char *s = slurp(q);
    CHECK(s && strstr(s, "\"ok\":true") && strstr(s, "\"text\":\"say \\\"hi\\\"\\\\\\nnow\"")
          && strstr(s, "\"load_ms\":120") && strstr(s, "\"decode_ms\":340") && strstr(s, "\"audio_ms\":2500"),
          "json: %s", s ? s : "(none)");
    char tmp[1100]; snprintf(tmp, sizeof tmp, "%s.tmp", q);
    CHECK(access(tmp, F_OK) != 0, ".tmp left behind");
    CHECK(stt_write_result(q, 0, NULL, "no_speech", 1, 0, 0) == 0, "rewrite");
    s = slurp(q);
    CHECK(s && strstr(s, "\"ok\":false") && strstr(s, "\"text\":\"\"") && strstr(s, "\"err\":\"no_speech\""), "json2: %s", s);

    printf("%s test_stt_core (%d failure%s)\n", fails ? "FAIL" : "PASS", fails, fails == 1 ? "" : "s");
    return fails ? 1 : 0;
}
