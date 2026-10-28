/* seq8_stretch.h — WARP's stretcher, as the engine sees it: a C face on
 * Ableton's fork of Bungee (third_party/bungee, a phase vocoder). The only
 * C++ in dsp.so is behind this header, in seq8_stretch.cpp, compiled on its
 * own — Bungee's C header redefines `bool`, which seq8.c's single translation
 * unit cannot afford.
 *
 * One stretcher is one stereo stream. The loop, grain by grain:
 *   au_st_want(position, speed, pitch) → the input frames [begin, end) it needs;
 *   the caller fills a planar scratch (L at in[0..], R at in[stride..]) with
 *   them, zeros outside the sample; au_st_grain → the output frames.
 * Positions are input frames (the grain's centre); speed is input frames per
 * output frame, its sign the direction; pitch a frequency ratio (1 = as is).
 * create/destroy allocate — the stretcher thread only, never the audio thread.
 * Nothing else here allocates once created (measured: 0 after setup). */
#ifndef SEQ8_STRETCH_H
#define SEQ8_STRETCH_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct au_st au_st_t;

au_st_t *au_st_create(int in_rate, int out_rate);
void     au_st_destroy(au_st_t *st);
int      au_st_max_input(const au_st_t *st);      /* frames per channel the scratch must hold */
void     au_st_reset(au_st_t *st, double position, double speed, double pitch);
void     au_st_want(au_st_t *st, double position, double speed, double pitch, int *begin, int *end);
int      au_st_grain(au_st_t *st, const float *in, int stride, const float **out_l, const float **out_r);

#ifdef __cplusplus
}
#endif
#endif
