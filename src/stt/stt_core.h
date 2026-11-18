/* stt_core.h — the parts of the speech-to-text helper that do not touch the
 * recognizer, kept apart so the host suite can compile and test them natively
 * (tests/host/test_stt_core.sh). The helper itself is src/stt/stt_helper.c. */
#ifndef STT_CORE_H
#define STT_CORE_H

#include <stddef.h>

/* Read a PCM WAV (16-bit or 32-bit float, 1 or 2 channels) as mono float.
 * Stereo: if one channel carries much less energy than the other (a mic wired
 * to one side), the louder channel is taken; otherwise the two are averaged.
 * The result is peak-normalised to 0.9 unless it is effectively silent, so
 * judge silence by *raw_peak (the mono signal's peak BEFORE normalising; NULL
 * if not wanted), never by the returned buffer.
 * Returns 0 and fills *out (malloc'd, caller frees), *frames, *rate; or -1 with
 * a short reason in err. */
int stt_wav_read_mono(const char *path, float **out, int *frames, int *rate,
                      float *raw_peak, char *err, size_t errlen);

/* Whether a take is worth decoding. A recognizer fed silence or a click
 * invents words, and on an untouched name those words would replace it.
 * Returns "too_short" (under STT_MIN_AUDIO_MS), "no_speech" (raw peak under
 * STT_SPEECH_PEAK, i.e. -40 dBFS), or NULL to decode. */
#define STT_MIN_AUDIO_MS 300
#define STT_SPEECH_PEAK  0.01f
const char *stt_gate(long audio_ms, float raw_peak);

/* How long a take may be, and what follows from it. Every keyboard's take
 * runs up to 30 s (a name or a sung line: you talk until you let go); the
 * helper waits for the take to end and then decodes it, so its limits grow
 * with the length it is given.
 *   max_s   clamped to 1..STT_MAX_TAKE_S (0 or less: STT_DEFAULT_TAKE_S)
 *   go_ms   how long to wait for the go: the take plus 5 s
 *   hard_s  the process's hard limit: the take plus 60 s to decode */
#define STT_DEFAULT_TAKE_S 30
#define STT_MAX_TAKE_S     30
void stt_limits(int max_s, int *take_s, int *go_ms, int *hard_s);

/* The stretch of a take to decode, from the voice detector's segments (sample
 * indices: segment i covers [start[i], start[i] + len[i])). The span runs from
 * the first segment's start to the last one's end, widened by pad on each side
 * and clamped to [0, total). Hum or rustle around the words is left out: fed
 * to the recognizer, it comes back as invented words.
 * Returns 0 and fills *from / *to; -1 when there is no segment (no speech). */
int stt_span(const long *start, const long *len, int nseg, long total, long pad,
             long *from, long *to);

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
