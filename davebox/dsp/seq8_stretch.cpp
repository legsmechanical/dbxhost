/* seq8_stretch.cpp — see seq8_stretch.h. Mirrors how the bench drove Bungee
 * on the Move (specifyGrain → analyseGrain → synthesiseGrain → next), at the
 * default hop, resampling on the output side. */
#include "seq8_stretch.h"
#include "bungee/Bungee.h"

#include <cmath>
#include <new>
#include <stdint.h>
#include <unistd.h>

#if defined(__linux__)
/* The static libstdc++ (-static-libstdc++, scripts/build_sound.sh) drags in
 * std::random_device through its string instantiations, and bookworm's builds
 * it on glibc 2.36's arc4random — newer than the Move's 2.35, so dsp.so would
 * not load. Nothing here ever asks for a random device; this local definition
 * satisfies the link with getentropy (glibc 2.25), and the GLIBC gate in
 * build_sound.sh is what notices if another such symbol appears. */
extern "C" __attribute__((visibility("hidden"))) uint32_t arc4random(void)
{
    uint32_t v = 0;
    (void)getentropy(&v, sizeof v);
    return v;
}
#endif

struct au_st {
    Bungee::Stretcher<Bungee::Basic> s;
    Bungee::Request req;
    au_st(int in_rate, int out_rate) : s({in_rate, out_rate}, 2, 0), req{} {}
};

static void au_st_set(Bungee::Request &r, double position, double speed, double pitch)
{
    r.position = position;
    r.speed = speed;
    r.pitch = pitch;
    r.resampleMode = resampleMode_autoOut;
}

extern "C" au_st_t *au_st_create(int in_rate, int out_rate)
{
    return new (std::nothrow) au_st(in_rate, out_rate);
}

extern "C" void au_st_destroy(au_st_t *st) { delete st; }

extern "C" int au_st_max_input(const au_st_t *st) { return st->s.maxInputFrameCount(); }

extern "C" void au_st_reset(au_st_t *st, double position, double speed, double pitch)
{
    au_st_set(st->req, position, speed, pitch);
    st->s.preroll(st->req);
}

extern "C" void au_st_want(au_st_t *st, double speed, double pitch, int *begin, int *end)
{
    st->req.speed = speed;
    st->req.pitch = pitch;
    Bungee::InputChunk c = st->s.specifyGrain(st->req);
    *begin = c.begin;
    *end = c.end;
}

extern "C" int au_st_grain(au_st_t *st, const float *in, int stride, const float **out_l, const float **out_r,
                           double *p0, double *p1)
{
    st->s.analyseGrain(in, stride);
    Bungee::OutputChunk o{};
    st->s.synthesiseGrain(o);
    *out_l = o.data;
    *out_r = o.data + o.channelStride;
    *p0 = o.request[Bungee::OutputChunk::begin] ? o.request[Bungee::OutputChunk::begin]->position : NAN;
    *p1 = o.request[Bungee::OutputChunk::end] ? o.request[Bungee::OutputChunk::end]->position : NAN;
    st->s.next(st->req);   /* clears reset; moves the position on by speed */
    return o.frameCount;
}
