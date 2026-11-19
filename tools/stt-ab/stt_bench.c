/* stt_bench.c — compare speech recognizers on the same takes, on the Move.
 *
 *   stt_bench family=<f> [enc=..] [dec=..] [joiner=..] tokens=.. vad=<silero_vad.onnx>
 *             [decoding=greedy_search|modified_beam_search] [beam=4] [threads=1]
 *             [denoise=gtcrn:<model>|dpdfnet:<model>] -- <wav>...
 *
 *   family: moonshine (enc = encoder_model.ort, dec = decoder_model_merged.ort)
 *           whisper   (enc, dec)
 *           transducer / nemo_transducer (enc, dec, joiner)
 *
 * Every take goes through the SAME front end as the dictation helper
 * (src/stt/stt_helper.c): stt_wav_read_mono (downmix + normalise), the raw-peak
 * gate, the resample to 16 kHz, and the Silero voice detector's span ±0.3 s —
 * so the only thing that differs between two runs is the recognizer (and the
 * denoiser, when asked for). to_16k and voiced_span are copies of the helper's;
 * keep them in step.
 *
 * Output, one line each, tab-separated:
 *   LOAD <ms>                        recognizer (+ denoiser) load, once
 *   TAKE <wav> <audio_ms> <voiced_ms> <denoise_ms> <decode_ms> <text>
 *   SKIP <wav> <reason>
 *   RSS  <max resident kB>
 * Decode times are from a WARM process (the model is loaded once for all the
 * takes); the helper loads per take, overlapped with the talking. */
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>

#include "c-api.h"
#include "stt_core.h"

#define VAD_RATE 16000
#define VAD_WINDOW 512
#define VAD_MAX_SEGS 64

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
    return stt_span(st, ln, k, n, VAD_RATE * 3 / 10, from, to);
}

static const char *arg(int argc, char **argv, const char *key, const char *dflt) {
    size_t kl = strlen(key);
    for (int i = 1; i < argc && strcmp(argv[i], "--"); i++)
        if (!strncmp(argv[i], key, kl) && argv[i][kl] == '=') return argv[i] + kl + 1;
    return dflt;
}

static const char *base(const char *p) { const char *s = strrchr(p, '/'); return s ? s + 1 : p; }

int main(int argc, char **argv) {
    int first = 0;
    for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "--")) { first = i + 1; break; }
    const char *fam = arg(argc, argv, "family", NULL), *tokens = arg(argc, argv, "tokens", NULL);
    const char *vadm = arg(argc, argv, "vad", NULL);
    if (!first || !fam || !tokens || !vadm) {
        fprintf(stderr, "usage: see the head of stt_bench.c\n");
        return 2;
    }
    const char *enc = arg(argc, argv, "enc", ""), *dec = arg(argc, argv, "dec", "");
    const char *join = arg(argc, argv, "joiner", "");
    const char *decoding = arg(argc, argv, "decoding", "greedy_search");
    int threads = atoi(arg(argc, argv, "threads", "1"));
    const char *dn = arg(argc, argv, "denoise", NULL);

    /* the helper's own manners: cores 0-2, lowest priority */
    setpriority(PRIO_PROCESS, 0, 19);
#ifdef __linux__
    cpu_set_t set; CPU_ZERO(&set); CPU_SET(0, &set); CPU_SET(1, &set); CPU_SET(2, &set);
    sched_setaffinity(0, sizeof(set), &set);
#endif

    long t0 = stt_now_ms();
    SherpaOnnxOfflineRecognizerConfig cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.feat_config.sample_rate = 16000;
    cfg.feat_config.feature_dim = 80;
    cfg.model_config.tokens = tokens;
    cfg.model_config.num_threads = threads;
    cfg.model_config.provider = "cpu";
    cfg.decoding_method = decoding;
    cfg.max_active_paths = atoi(arg(argc, argv, "beam", "4"));
    if (!strcmp(fam, "moonshine")) {
        cfg.model_config.moonshine.encoder = enc;
        cfg.model_config.moonshine.merged_decoder = dec;
    } else if (!strcmp(fam, "whisper")) {
        cfg.model_config.whisper.encoder = enc;
        cfg.model_config.whisper.decoder = dec;
        cfg.model_config.whisper.language = "en";
        cfg.model_config.whisper.task = "transcribe";
        cfg.model_config.whisper.tail_paddings = -1;
    } else if (!strcmp(fam, "transducer") || !strcmp(fam, "nemo_transducer")) {
        cfg.model_config.transducer.encoder = enc;
        cfg.model_config.transducer.decoder = dec;
        cfg.model_config.transducer.joiner = join;
        if (!strcmp(fam, "nemo_transducer")) cfg.model_config.model_type = "nemo_transducer";
    } else {
        fprintf(stderr, "unknown family %s\n", fam);
        return 2;
    }
    const SherpaOnnxOfflineRecognizer *rec = SherpaOnnxCreateOfflineRecognizer(&cfg);
    if (!rec) { fprintf(stderr, "recognizer failed to load\n"); return 1; }

    const SherpaOnnxOfflineSpeechDenoiser *sd = NULL;
    if (dn) {
        SherpaOnnxOfflineSpeechDenoiserConfig dc;
        memset(&dc, 0, sizeof(dc));
        dc.model.num_threads = threads;
        dc.model.provider = "cpu";
        if (!strncmp(dn, "gtcrn:", 6)) dc.model.gtcrn.model = dn + 6;
        else if (!strncmp(dn, "dpdfnet:", 8)) dc.model.dpdfnet.model = dn + 8;
        else { fprintf(stderr, "denoise must be gtcrn:<model> or dpdfnet:<model>\n"); return 2; }
        sd = SherpaOnnxCreateOfflineSpeechDenoiser(&dc);
        if (!sd) { fprintf(stderr, "denoiser failed to load\n"); return 1; }
    }
    printf("LOAD\t%ld\n", stt_now_ms() - t0);
    fflush(stdout);

    for (int i = first; i < argc; i++) {
        const char *wav = argv[i];
        float *pcm = NULL, raw_peak = 0.0f; int frames = 0, rate = 0;
        char err[64] = "";
        if (stt_wav_read_mono(wav, &pcm, &frames, &rate, &raw_peak, err, sizeof(err)) != 0) {
            printf("SKIP\t%s\t%s\n", base(wav), err); continue;
        }
        long audio_ms = rate ? (long)frames * 1000L / rate : 0;
        const char *skip = stt_gate(audio_ms, raw_peak);
        int n16 = 0; float *x16 = NULL; long from = 0, to = 0;
        if (!skip) {
            x16 = to_16k(pcm, frames, rate, &n16);
            SherpaOnnxVadModelConfig vc;
            memset(&vc, 0, sizeof(vc));
            vc.silero_vad.model = vadm;
            vc.silero_vad.threshold = 0.5f;
            vc.silero_vad.min_silence_duration = 0.5f;
            vc.silero_vad.min_speech_duration = 0.25f;
            vc.silero_vad.max_speech_duration = 35.0f;
            vc.silero_vad.window_size = VAD_WINDOW;
            vc.sample_rate = VAD_RATE;
            vc.num_threads = 1;
            vc.provider = "cpu";
            const SherpaOnnxVoiceActivityDetector *vad = SherpaOnnxCreateVoiceActivityDetector(&vc, 35.0f);
            if (!x16 || !vad) skip = "oom";
            else if (voiced_span(vad, x16, n16, &from, &to) != 0) skip = "no_speech";
            if (vad) SherpaOnnxDestroyVoiceActivityDetector(vad);
        }
        free(pcm);
        if (skip) { printf("SKIP\t%s\t%s\n", base(wav), skip); free(x16); continue; }

        const float *x = x16 + from; int n = (int)(to - from);
        long dn_ms = 0;
        const SherpaOnnxDenoisedAudio *da = NULL;
        if (sd) {
            long td = stt_now_ms();
            da = SherpaOnnxOfflineSpeechDenoiserRun(sd, x, n, VAD_RATE);
            dn_ms = stt_now_ms() - td;
            if (da && da->n > 0 && da->sample_rate == VAD_RATE) { x = da->samples; n = da->n; }
        }
        long t1 = stt_now_ms();
        const SherpaOnnxOfflineStream *s = SherpaOnnxCreateOfflineStream(rec);
        SherpaOnnxAcceptWaveformOffline(s, VAD_RATE, x, n);
        SherpaOnnxDecodeOfflineStream(rec, s);
        const SherpaOnnxOfflineRecognizerResult *r = SherpaOnnxGetOfflineStreamResult(s);
        long dec_ms = stt_now_ms() - t1;
        char text[2048] = "";
        if (r && r->text) {
            snprintf(text, sizeof(text), "%s", r->text);
            for (char *p = text; *p; p++) if (*p == '\t' || *p == '\n') *p = ' ';
        }
        printf("TAKE\t%s\t%ld\t%ld\t%ld\t%ld\t%s\n", base(wav), audio_ms,
               (to - from) * 1000L / VAD_RATE, dn_ms, dec_ms, text);
        fflush(stdout);
        if (r) SherpaOnnxDestroyOfflineRecognizerResult(r);
        SherpaOnnxDestroyOfflineStream(s);
        if (da) SherpaOnnxDestroyDenoisedAudio(da);
        free(x16);
    }
    struct rusage ru;
    getrusage(RUSAGE_SELF, &ru);
    printf("RSS\t%ld\n", ru.ru_maxrss);
    if (sd) SherpaOnnxDestroyOfflineSpeechDenoiser(sd);
    SherpaOnnxDestroyOfflineRecognizer(rec);
    return 0;
}
