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
 * Model: Moonshine v2 (encoder + merged decoder + tokens) through the
 * sherpa-onnx C API. Output is plain text; the UI sanitises it for the
 * keyboard. */
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

    char enc[1024], dec[1024], tok[1024];
    snprintf(enc, sizeof(enc), "%s/encoder_model.ort", dir);
    snprintf(dec, sizeof(dec), "%s/decoder_model_merged.ort", dir);
    snprintf(tok, sizeof(tok), "%s/tokens.txt", dir);

    long t0 = stt_now_ms();
    SherpaOnnxOfflineRecognizerConfig cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.feat_config.sample_rate = 16000;
    cfg.feat_config.feature_dim = 80;
    cfg.model_config.moonshine.encoder = enc;
    cfg.model_config.moonshine.merged_decoder = dec;
    cfg.model_config.tokens = tok;
    cfg.model_config.num_threads = threads;
    cfg.model_config.provider = "cpu";
    cfg.decoding_method = "greedy_search";
    const SherpaOnnxOfflineRecognizer *rec = SherpaOnnxCreateOfflineRecognizer(&cfg);
    long load_ms = stt_now_ms() - t0;
    if (!rec) {
        if (!cancelled(cancel)) stt_write_result(result, 0, "", "load_failed", load_ms, 0, 0);
        return 1;
    }

    int w = stt_wait_go(go, cancel, go_ms, 20);
    if (w == 0) { SherpaOnnxDestroyOfflineRecognizer(rec); return 0; }
    if (w < 0) {
        stt_write_result(result, 0, "", "timeout", load_ms, 0, 0);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return 1;
    }

    float *pcm = NULL, raw_peak = 0.0f; int frames = 0, rate = 0;
    char err[64] = "";
    if (stt_wav_read_mono(wav, &pcm, &frames, &rate, &raw_peak, err, sizeof(err)) != 0) {
        if (!cancelled(cancel)) stt_write_result(result, 0, "", err, load_ms, 0, 0);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return 1;
    }
    long audio_ms = rate ? (long)frames * 1000L / rate : 0;
    const char *skip = stt_gate(audio_ms, raw_peak);     /* the level BEFORE normalising */
    if (skip) {
        if (!cancelled(cancel))
            stt_write_result(result, 0, "", skip, load_ms, 0, audio_ms);
        free(pcm);
        SherpaOnnxDestroyOfflineRecognizer(rec);
        return 0;
    }
    if (cancelled(cancel)) { free(pcm); SherpaOnnxDestroyOfflineRecognizer(rec); return 0; }

    long t1 = stt_now_ms();
    const SherpaOnnxOfflineStream *st = SherpaOnnxCreateOfflineStream(rec);
    SherpaOnnxAcceptWaveformOffline(st, rate, pcm, frames);
    SherpaOnnxDecodeOfflineStream(rec, st);
    const SherpaOnnxOfflineRecognizerResult *r = SherpaOnnxGetOfflineStreamResult(st);
    long decode_ms = stt_now_ms() - t1;
    free(pcm);

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
