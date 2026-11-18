/* stt_core.c — WAV reading, the go/cancel handshake and the result file for the
 * speech-to-text helper. No recognizer here; see stt_core.h. */
#define _POSIX_C_SOURCE 200809L
#include "stt_core.h"

#include <errno.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

long stt_now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long)ts.tv_sec * 1000L + ts.tv_nsec / 1000000L;
}

static void set_err(char *err, size_t errlen, const char *msg) {
    if (err && errlen) snprintf(err, errlen, "%s", msg);
}

static uint32_t rd32(const unsigned char *p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static uint16_t rd16(const unsigned char *p) { return (uint16_t)(p[0] | (p[1] << 8)); }

float stt_peak(const float *x, int n) {
    float p = 0.0f;
    for (int i = 0; i < n; i++) { float a = fabsf(x[i]); if (a > p) p = a; }
    return p;
}

int stt_wav_read_mono(const char *path, float **out, int *frames, int *rate,
                      float *raw_peak, char *err, size_t errlen) {
    *out = NULL; *frames = 0; *rate = 0;
    if (raw_peak) *raw_peak = 0.0f;
    FILE *f = fopen(path, "rb");
    if (!f) { set_err(err, errlen, "no_wav"); return -1; }
    unsigned char hdr[12];
    if (fread(hdr, 1, 12, f) != 12 || memcmp(hdr, "RIFF", 4) || memcmp(hdr + 8, "WAVE", 4)) {
        fclose(f); set_err(err, errlen, "not_wav"); return -1;
    }
    int fmt_seen = 0, chans = 0, bits = 0, format = 0;
    uint32_t sr = 0;
    unsigned char *data = NULL;
    uint32_t data_len = 0;
    /* Walk the chunks: the sampler's header is the plain 44-byte one, but a
     * reader that assumes so breaks on the first file with a LIST chunk. */
    for (;;) {
        unsigned char ch[8];
        if (fread(ch, 1, 8, f) != 8) break;
        uint32_t len = rd32(ch + 4);
        if (!memcmp(ch, "fmt ", 4)) {
            unsigned char fmt[40];
            if (len < 16 || len > sizeof(fmt) || fread(fmt, 1, len, f) != len) break;
            format = rd16(fmt); chans = rd16(fmt + 2); sr = rd32(fmt + 4); bits = rd16(fmt + 14);
            if (format == 0xFFFE && len >= 26) format = rd16(fmt + 24);   /* WAVE_FORMAT_EXTENSIBLE */
            fmt_seen = 1;
        } else if (!memcmp(ch, "data", 4)) {
            /* A writer that died before patching the header leaves 0 or
             * 0xFFFFFFFF here; take what is actually in the file. */
            long here = ftell(f);
            fseek(f, 0, SEEK_END);
            long end = ftell(f);
            fseek(f, here, SEEK_SET);
            uint32_t avail = (end > here) ? (uint32_t)(end - here) : 0;
            if (len == 0 || len > avail) len = avail;
            data = malloc(len ? len : 1);
            if (!data) { fclose(f); set_err(err, errlen, "oom"); return -1; }
            data_len = (uint32_t)fread(data, 1, len, f);
            break;
        } else {
            if (fseek(f, (long)len + (len & 1), SEEK_CUR) != 0) break;
        }
    }
    fclose(f);
    if (!fmt_seen || !data) { free(data); set_err(err, errlen, "bad_wav"); return -1; }
    int pcm16 = (format == 1 && bits == 16), f32 = (format == 3 && bits == 32);
    if ((!pcm16 && !f32) || chans < 1 || chans > 2 || sr < 8000 || sr > 192000) {
        free(data); set_err(err, errlen, "unsupported_wav"); return -1;
    }
    int bps = bits / 8;
    int n = (int)(data_len / (uint32_t)(bps * chans));
    float *mono = malloc(sizeof(float) * (size_t)(n > 0 ? n : 1));
    if (!mono) { free(data); set_err(err, errlen, "oom"); return -1; }

    double e0 = 0.0, e1 = 0.0;
    for (int i = 0; i < n; i++) {
        for (int c = 0; c < chans; c++) {
            const unsigned char *p = data + ((size_t)i * chans + c) * bps;
            float v;
            if (pcm16) v = (float)(int16_t)rd16(p) / 32768.0f;
            else { uint32_t u = rd32(p); memcpy(&v, &u, 4); }
            if (c == 0) e0 += (double)v * v; else e1 += (double)v * v;
        }
    }
    /* 0 = left only, 1 = right only, 2 = average */
    int pick = 2;
    if (chans == 2) {
        if (e1 < e0 * 0.0625) pick = 0;        /* right is >12 dB down */
        else if (e0 < e1 * 0.0625) pick = 1;
    } else pick = 0;
    for (int i = 0; i < n; i++) {
        float s[2] = {0.0f, 0.0f};
        for (int c = 0; c < chans; c++) {
            const unsigned char *p = data + ((size_t)i * chans + c) * bps;
            if (pcm16) s[c] = (float)(int16_t)rd16(p) / 32768.0f;
            else { uint32_t u = rd32(p); memcpy(&s[c], &u, 4); }
        }
        mono[i] = (pick == 2) ? 0.5f * (s[0] + s[1]) : s[pick];
    }
    free(data);
    float pk = stt_peak(mono, n);
    if (raw_peak) *raw_peak = pk;
    if (pk > 1e-4f && pk < 0.9f) {
        float g = 0.9f / pk;
        for (int i = 0; i < n; i++) mono[i] *= g;
    }
    *out = mono; *frames = n; *rate = (int)sr;
    return 0;
}

void stt_limits(int max_s, int *take_s, int *go_ms, int *hard_s) {
    int s = max_s <= 0 ? STT_DEFAULT_TAKE_S : max_s > STT_MAX_TAKE_S ? STT_MAX_TAKE_S : max_s;
    if (take_s) *take_s = s;
    if (go_ms) *go_ms = s * 1000 + 5000;
    if (hard_s) *hard_s = s + 60;
}

const char *stt_gate(long audio_ms, float raw_peak) {
    if (audio_ms < STT_MIN_AUDIO_MS) return "too_short";
    if (raw_peak < STT_SPEECH_PEAK) return "no_speech";
    return NULL;
}

static int exists(const char *p) { struct stat st; return p && p[0] && stat(p, &st) == 0; }

int stt_wait_go(const char *go, const char *cancel, int timeout_ms, int poll_ms) {
    long start = stt_now_ms();
    if (poll_ms < 1) poll_ms = 1;
    for (;;) {
        if (exists(cancel)) return 0;
        if (exists(go)) return exists(cancel) ? 0 : 1;
        if (stt_now_ms() - start >= timeout_ms) return -1;
        struct timespec ts = { poll_ms / 1000, (long)(poll_ms % 1000) * 1000000L };
        nanosleep(&ts, NULL);
    }
}

static void put_json_str(FILE *f, const char *s) {
    fputc('"', f);
    for (const unsigned char *p = (const unsigned char *)(s ? s : ""); *p; p++) {
        if (*p == '"' || *p == '\\') { fputc('\\', f); fputc(*p, f); }
        else if (*p == '\n') fputs("\\n", f);
        else if (*p == '\r') fputs("\\r", f);
        else if (*p == '\t') fputs("\\t", f);
        else if (*p < 0x20) fprintf(f, "\\u%04x", *p);
        else fputc(*p, f);
    }
    fputc('"', f);
}

int stt_write_result(const char *path, int ok, const char *text, const char *err,
                     long load_ms, long decode_ms, long audio_ms) {
    char tmp[1024];
    if (snprintf(tmp, sizeof(tmp), "%s.tmp", path) >= (int)sizeof(tmp)) return -1;
    FILE *f = fopen(tmp, "w");
    if (!f) return -1;
    fprintf(f, "{\"ok\":%s,\"text\":", ok ? "true" : "false");
    put_json_str(f, text);
    fputs(",\"err\":", f);
    put_json_str(f, err);
    fprintf(f, ",\"load_ms\":%ld,\"decode_ms\":%ld,\"audio_ms\":%ld}\n", load_ms, decode_ms, audio_ms);
    if (fclose(f) != 0) { unlink(tmp); return -1; }
    if (rename(tmp, path) != 0) { unlink(tmp); return -1; }
    return 0;
}
