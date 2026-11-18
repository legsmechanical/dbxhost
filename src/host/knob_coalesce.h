/* knob_coalesce.h — fold a knob's detents together and hand them to Move in
 * one CC every few frames, instead of one CC per detent.
 *
 * Why: the inject drain (shadow_drain_midi_inject) holds back everything a
 * module sends to Move's own tracks while ANY MIDI_IN slot is occupied, and
 * drains only after the slots have been empty for a few frames. A knob spun
 * fast puts a detent in MIDI_IN nearly every frame, so those notes wait and
 * the track stutters, catching up once the knob stops. Passing the knob as
 * one summed CC every KNOB_COALESCE_PERIOD frames leaves the frames between
 * empty, so the drain gets its window. No motion is lost: whatever does not
 * fit in one CC (±63) carries into the next.
 *
 * Used for the track knobs (CC 71-78) under Move-native co-run, and for the
 * volume knob (CC 79) whenever an overtake module lets it through to Move —
 * a fast volume spin stuttered dAVEBOx's Move-routed tracks the same way.
 *
 * Header-only, allocation-free: runs on the SPI callback, and
 * tests/host/test_knob_coalesce.c drives it directly.
 */
#ifndef KNOB_COALESCE_H
#define KNOB_COALESCE_H
#include <stdint.h>

#define KNOB_COALESCE_KNOBS  9   /* 0-7 = CC 71-78, 8 = the volume knob (CC 79) */
#define KNOB_COALESCE_VOLUME 8
#define KNOB_COALESCE_PERIOD 4   /* 1 emit frame + 3 empty frames per cycle */

typedef struct {
    int16_t  accum[KNOB_COALESCE_KNOBS];
    uint32_t phase;
} knob_coalesce_t;

/* The CC number a knob index is sent to Move as. */
static inline uint8_t knob_coalesce_cc(int k)
{
    return (uint8_t)(k == KNOB_COALESCE_VOLUME ? 79 : 71 + k);
}

/* A relative-encoder value as a signed delta: 1..63 up, 65..127 down. */
static inline int16_t knob_coalesce_delta(uint8_t d2)
{
    if (d2 >= 1 && d2 <= 63) return (int16_t)d2;
    if (d2 >= 65 && d2 <= 127) return (int16_t)((int)d2 - 128);
    return 0;
}

static inline void knob_coalesce_add(knob_coalesce_t *c, int k, uint8_t d2)
{
    c->accum[k] += knob_coalesce_delta(d2);
}

/* Throws away what a knob has gathered (it was claimed mid-spin: nothing more
 * of it may reach Move). */
static inline void knob_coalesce_drop(knob_coalesce_t *c, int k)
{
    c->accum[k] = 0;
}

/* Once per frame. 1 = this is an emit frame. */
static inline int knob_coalesce_tick(knob_coalesce_t *c)
{
    return (++c->phase % (uint32_t)KNOB_COALESCE_PERIOD) == 0;
}

/* On an emit frame: takes up to ±63 of knob k's gathered motion and returns it
 * as the CC value to send, leaving the rest for the next emit. 0 = nothing. */
static inline uint8_t knob_coalesce_take(knob_coalesce_t *c, int k)
{
    int16_t delta = c->accum[k];
    if (delta == 0) return 0;
    if (delta > 63) delta = 63;
    else if (delta < -63) delta = -63;
    c->accum[k] -= delta;
    return (delta >= 0) ? (uint8_t)delta : (uint8_t)(delta + 128);
}

/* Writes one CC into the first empty 8-byte MIDI_IN event (timestamp zeroed,
 * as a synthetic event). 0 = placed, -1 = MIDI_IN full. */
static inline int knob_coalesce_place(uint8_t *midi_in, int bytes, uint8_t cc, uint8_t d2)
{
    for (int j = 0; j + 8 <= bytes; j += 8) {
        if (midi_in[j] == 0 && midi_in[j + 1] == 0 &&
            midi_in[j + 2] == 0 && midi_in[j + 3] == 0) {
            midi_in[j]     = 0x0B;   /* cable 0, CIN 0x0B = CC */
            midi_in[j + 1] = 0xB0;   /* CC, channel 1 */
            midi_in[j + 2] = cc;
            midi_in[j + 3] = d2;
            midi_in[j + 4] = 0;
            midi_in[j + 5] = 0;
            midi_in[j + 6] = 0;
            midi_in[j + 7] = 0;
            return 0;
        }
    }
    return -1;
}

#endif /* KNOB_COALESCE_H */
