/* stt_core.h — the parts of the speech-to-text helper that do not touch the
 * recognizer, kept apart so the host suite can compile and test them natively
 * (tests/host/test_stt_core.sh). The helper itself is src/stt/stt_helper.c. */
#ifndef STT_CORE_H
#define STT_CORE_H

#include <stddef.h>

/* Read a PCM WAV (16-bit or 32-bit float, 1 or 2 channels) as mono float.
 * Stereo: if one channel carries much less energy than the other (a mic wired
 * to one side), the louder channel is taken; otherwise the two are averaged.
 * The result is peak-normalised to 0.9 unless it is effectively silent.
 * Returns 0 and fills *out (malloc'd, caller frees), *frames, *rate; or -1 with
 * a short reason in err. */
int stt_wav_read_mono(const char *path, float **out, int *frames, int *rate,
                      char *err, size_t errlen);

/* Peak absolute sample value of a buffer. */
float stt_peak(const float *x, int n);

/* Wait for <go> or <cancel> to exist, polling every poll_ms.
 * Returns 1 = go, 0 = cancel (also when both exist: cancel wins), -1 = timeout. */
int stt_wait_go(const char *go, const char *cancel, int timeout_ms, int poll_ms);

/* Write the result JSON atomically (<path>.tmp, then rename):
 *   {"ok":true|false,"text":"...","err":"...","load_ms":N,"decode_ms":N,"audio_ms":N}
 * text/err are JSON-escaped; NULL is written as "". Returns 0 or -1. */
int stt_write_result(const char *path, int ok, const char *text, const char *err,
                     long load_ms, long decode_ms, long audio_ms);

/* Monotonic milliseconds. */
long stt_now_ms(void);

#endif
