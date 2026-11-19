/* stt_helper.c — schwung-stt: transcribe one push-to-talk take.
 *
 *   schwung-stt <model-dir> <wav> <go-file> <cancel-file> <result-file> [threads] [take-seconds]
 *
 * One process per dictation. It is started the moment the user starts talking,
 * so loading the recognizer overlaps the speech; then it waits for <go-file>
 * (written by the UI once the sampler has closed the WAV), transcribes, writes
 * <result-file> atomically (JSON, see stt_core.h) and exits. <cancel-file>
 * at any point means: write nothing, exit.
 *
 * It must never compete with the audio path: before the recognizer creates its
 * worker threads (which inherit all of this) it drops to SCHED_OTHER, nice 19,
 * and pins itself to cores 0-2 — core 3 runs the SPI/audio callback.
 *
 * Model: NVIDIA Parakeet TDT 110M (int8 encoder + decoder + joiner + tokens),
 * a NeMo transducer, through the sherpa-onnx C API. Chosen over Moonshine Tiny
 * on 22 real takes on the Move's own input (2026-11-19, tools/stt-ab): 12% vs
 * 19% word errors, 15 vs 12 takes exact, and the gap is in names and music
 * words; the same speed. Output is plain text; the UI sanitises it for the
 * keyboard.
 *
 * <model-dir> is the dictation add-on's model folder (installed from the
 * menu, not shipped in the release: see stt-run.sh).
 *
 * Only the VOICED part of a take is decoded. A Silero voice detector
 * (<model-dir>/silero_vad.onnx) finds it; a take where it finds none is
 * "no_speech" and never reaches the recognizer. A level gate cannot do this:
 * an ordinary room hums at -50 dBFS, louder than any fixed threshold that
 * still lets quiet speech through, and the recognizer turns hum into words. */
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <unistd.h>

#include "c-api.h"
#include "stt_core.h"


/* stt-run.sh already starts this under `taskset 0x7 nice -n 19`; this makes
 * sure of it (and says so in helper.log if the system refused). */
static void make_polite(void) {
    if (setpriority(PRIO_PROCESS, 0, 19) != 0) perror("schwung-stt: nice 19");
#ifdef __linux__
    struct sched_param sp = { .sched_priority = 0 };
    if (sched_setscheduler(0, SCHED_OTHER, &sp) != 0) perror("schwung-stt: SCHED_OTHER");
    cpu_set_t set;
    CPU_ZERO(&set);
    CPU_SET(0, &set); CPU_SET(1, &set); CPU_SET(2, &set);
    if (sched_setaffinity(0, sizeof(set), &set) != 0) perror("schwung-stt: cores 0-2");
#endif
}

static int cancelled(const char *cancel) { return access(cancel, F_OK) == 0; }

#define VAD_RATE 16000
#define VAD_WINDOW 512
#define VAD_MAX_SEGS 64

/* Resample to the detector's / recognizer's rate. Returns a malloc'd buffer
 * (or NULL) and its length in *n. */
static float *to_16k(const float *x, int frames, int rate, int *n) {
    *n = 0;
    if (rate == VAD_RATE) {
        float *y = malloc(sizeof(float) * (size_t)(frames > 0 ? frames : 1));
        if (y) { memcpy(y, x, sizeof(float) * (size_t)frames); *n = frames; }
        return y;
    }
    const SherpaOnnxLinearResampler *rs =
        SherpaOnnxCreateLinearResampler(rate, VAD_RATE, 0.99f * VAD_RATE / 2, 6);
    if (!rs) return NULL;
    const SherpaOnnxResampleOut *o = SherpaOnnxLinearResamplerResample(rs, x, frames, 1);
    float *y = NULL;
    if (o && o->n > 0 && (y = malloc(sizeof(float) * (size_t)o->n))) {
        memcpy(y, o->samples, sizeof(float) * (size_t)o->n);
        *n = o->n;
    }
    if (o) SherpaOnnxLinearResamplerResampleFree(o);
    SherpaOnnxDestroyLinearResampler(rs);
    return y;
}

/* Where the voice is. Returns 0 with the span to decode (16 kHz indices), or
 * -1 when the detector heard no voice. */
static int voiced_span(const SherpaOnnxVoiceActivityDetector *vad, const float *x, int n,
                       long *from, long *to) {
    long st[VAD_MAX_SEGS], ln[VAD_MAX_SEGS];
    int k = 0;
    for (int i = 0; i < n; i += VAD_WINDOW) {
        int m = n - i < VAD_WINDOW ? n - i : VAD_WINDOW;
        SherpaOnnxVoiceActivityDetectorAcceptWaveform(vad, x + i, m);
    }
    SherpaOnnxVoiceActivityDetectorFlush(vad);
    while (!SherpaOnnxVoiceActivityDetectorEmpty(vad)) {
        const SherpaOnnxSpeechSegment *sg = SherpaOnnxVoiceActivityDetectorFront(vad);
        if (sg && k < VAD_MAX_SEGS) { st[k] = (long)sg->start; ln[k] = sg->n; k++; }
        if (sg) SherpaOnnxDestroySpeechSegment(sg);
        SherpaOnnxVoiceActivityDetectorPop(vad);
    }
    /* 0.3 s each side: the detector's edges are tight, and a clipped first
     * consonant changes the word */
    int r = stt_span(st, ln, k, n, VAD_RATE * 3 / 10, from, to);
    fprintf(stderr, "schwung-stt: voice: %d segment%s", k, k == 1 ? "" : "s");
    if (r == 0) fprintf(stderr, ", %.2f-%.2f s of %.2f s", *from / 16000.0, *to / 16000.0, n / 16000.0);
    fputc('\n', stderr);
    return r;
}

int main(int argc, char **argv) {
    if (argc < 6) {
        fprintf(stderr, "usage: %s <model-dir> <wav> <go> <cancel> <result> [threads] [take-seconds]\n", argv[0]);
        return 2;
    }
    const char *dir = argv[1], *wav = argv[2], *go = argv[3], *cancel = argv[4], *result = argv[5];
    int threads = (argc > 6) ? atoi(argv[6]) : 1;   /* 1: see stt-run.sh */
    if (threads < 1 || threads > 3) threads = 1;
    /* the take's length (the keyboard's), and the waits that follow from it */
    int take_s, go_ms, hard_s;
    stt_limits((argc > 7) ? atoi(argv[7]) : 0, &take_s, &go_ms, &hard_s);

    make_polite();
    alarm((unsigned)hard_s);     /* whatever happens, this process is gone by then */

    char enc[1024], dec[1024], join[1024], tok[1024];
    snprintf(enc, sizeof(enc), "%s/encoder.int8.onnx", dir);
    snprintf(dec, sizeof(dec), "%s/decoder.int8.onnx", dir);
    snprintf(join, sizeof(join), "%s/joiner.int8.onnx", dir);
    snprintf(tok, sizeof(tok), "%s/tokens.txt", dir);

    long t0 = stt_now_ms();
    SherpaOnnxOfflineRecognizerConfig cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.feat_config.sample_rate = 16000;
    cfg.feat_config.feature_dim = 80;
    cfg.model_config.transducer.encoder = enc;
    cfg.model_config.transducer.decoder = dec;
    cfg.model_config.transducer.joiner = join;
    cfg.model_config.model_type = "nemo_transducer";
    cfg.model_config.tokens = tok;
    cfg.model_config.num_threads = threads;
    cfg.model_config.provider = "cpu";
    cfg.decoding_method = "greedy_search";
    const SherpaOnnxOfflineRecognizer *rec = SherpaOnnxCreateOfflineRecognizer(&cfg);

    char vadm[1024];
    snprintf(vadm, sizeof(vadm), "%s/silero_vad.onnx", dir);
    SherpaOnnxVadModelConfig vc;
    memset(&vc, 0, sizeof(vc));
    vc.silero_vad.model = vadm;
    vc.silero_vad.threshold = 0.5f;
    vc.silero_vad.min_silence_duration = 0.5f;
    vc.silero_vad.min_speech_duration = 0.25f;
    vc.silero_vad.max_speech_duration = (float)take_s + 5.0f;   /* one take: never split */
    vc.silero_vad.window_size = VAD_WINDOW;
    vc.sample_rate = VAD_RATE;
    vc.num_threads = 1;
    vc.provider = "cpu";
    const SherpaOnnxVoiceActivityDetector *vad =
        rec ? SherpaOnnxCreateVoiceActivityDetector(&vc, (float)take_s + 5.0f) : NULL;
    long load_ms = stt_now_ms() - t0;
    if (!rec || !vad) {
        if (!cancelled(cancel)) stt_write_result(result, 0, "", "load_failed", load_ms, 0, 0);
        if (vad) SherpaOnnxDestroyVoiceActivityDetector(vad);
        if (rec) SherpaOnnxDestroyOfflineRecognizer(rec);
        return 1;
    }

    int w = stt_wait_go(go, cancel, go_ms, 20);
    if (w <= 0) {
        if (w < 0) stt_write_result(result, 0, "", "timeout", load_ms, 0, 0);
        SherpaOnnxDestroyVoiceActivityDetector(vad);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return w < 0 ? 1 : 0;
    }

    float *pcm = NULL, raw_peak = 0.0f; int frames = 0, rate = 0;
    char err[64] = "";
    if (stt_wav_read_mono(wav, &pcm, &frames, &rate, &raw_peak, err, sizeof(err)) != 0) {
        if (!cancelled(cancel)) stt_write_result(result, 0, "", err, load_ms, 0, 0);
        SherpaOnnxDestroyVoiceActivityDetector(vad);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return 1;
    }
    long audio_ms = rate ? (long)frames * 1000L / rate : 0;
    /* cheap refusals first (the level BEFORE normalising), then the voice */
    const char *skip = stt_gate(audio_ms, raw_peak);
    long t1 = stt_now_ms();
    int n16 = 0;
    float *x16 = NULL;
    long from = 0, to = 0;
    if (!skip) {
        x16 = to_16k(pcm, frames, rate, &n16);
        if (!x16) skip = "oom";
        else if (voiced_span(vad, x16, n16, &from, &to) != 0) skip = "no_speech";
    }
    free(pcm);
    SherpaOnnxDestroyVoiceActivityDetector(vad);
    if (skip || cancelled(cancel)) {
        if (skip && !cancelled(cancel))
            stt_write_result(result, 0, "", skip, load_ms, stt_now_ms() - t1, audio_ms);
        free(x16);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return 0;
    }

    const SherpaOnnxOfflineStream *st = SherpaOnnxCreateOfflineStream(rec);
    SherpaOnnxAcceptWaveformOffline(st, VAD_RATE, x16 + from, (int32_t)(to - from));
    SherpaOnnxDecodeOfflineStream(rec, st);
    const SherpaOnnxOfflineRecognizerResult *r = SherpaOnnxGetOfflineStreamResult(st);
    long decode_ms = stt_now_ms() - t1;
    free(x16);

    const char *text = (r && r->text) ? r->text : "";
    while (*text == ' ') text++;
    if (!cancelled(cancel)) {
        if (*text) stt_write_result(result, 1, text, "", load_ms, decode_ms, audio_ms);
        else stt_write_result(result, 0, "", "no_speech", load_ms, decode_ms, audio_ms);
    }
    if (r) SherpaOnnxDestroyOfflineRecognizerResult(r);
    SherpaOnnxDestroyOfflineStream(st);
    SherpaOnnxDestroyOfflineRecognizer(rec);
    return 0;
}
