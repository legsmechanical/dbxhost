/* slot_feed.h — audio an overtake DSP hands a chain slot
 * (move_host_ext_v1_t.slot_audio_feed), kept apart from the shim so the rules
 * are testable on their own (tests/host/test_slot_feed.c).
 *
 * The overtake DSP renders AFTER the slots in a frame, so audio it hands over
 * in render k is mixed by the slot in frame k+1 — the frame a note it sent in
 * k is voiced in. A block is stamped with the overtake render's sequence
 * number; the slot task of the next frame runs before that number is bumped,
 * so "stamp == current sequence" means "handed over in the previous render".
 *
 * A fed slot must render even when it holds no instrument (an empty slot is
 * inactive and never rendered) and even when its own output went idle, and it
 * must stay rendered while its FX ring out after the feed stops: `live` counts
 * that down, and only while the slot's FX are idle. */
#ifndef SLOT_FEED_H
#define SLOT_FEED_H

#include <stdint.h>
#include <string.h>

#define SLOT_FEED_SAMPLES   (128 * 2)
/* Blocks a slot stays live after its last feed once its FX have gone quiet. */
#define SLOT_FEED_HOLD      64

typedef struct {
    int16_t  lr[SLOT_FEED_SAMPLES];
    uint32_t seq;      /* the overtake render that filled lr (0 = never) */
    uint16_t live;     /* > 0: render and mix this slot */
} slot_feed_t;

/* Add one block in render `seq`. The first call of a render replaces what an
 * earlier render left; later calls of the same render add (saturating). */
static inline void slot_feed_put(slot_feed_t *f, uint32_t seq,
                                 const int16_t *lr, uint32_t frames) {
    if (frames > SLOT_FEED_SAMPLES / 2) frames = SLOT_FEED_SAMPLES / 2;
    if (f->seq != seq) {
        memset(f->lr, 0, sizeof f->lr);
        f->seq = seq;
    }
    for (uint32_t i = 0; i < frames * 2; i++) {
        int32_t v = (int32_t)f->lr[i] + lr[i];
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        f->lr[i] = (int16_t)v;
    }
}

/* The block for THIS frame's slot render, or NULL. `seq` is the overtake
 * sequence as the slots see it: not yet bumped for this frame. */
static inline const int16_t *slot_feed_current(const slot_feed_t *f, uint32_t seq) {
    return (seq != 0 && f->seq == seq) ? f->lr : 0;
}

/* Once per frame, before the slots render. Returns 1 when the slot must
 * render and mix this frame. */
static inline int slot_feed_tick(slot_feed_t *f, uint32_t seq, int fx_idle) {
    if (slot_feed_current(f, seq)) f->live = SLOT_FEED_HOLD;
    else if (f->live && fx_idle) f->live--;
    return f->live != 0;
}

/* Sum the block into a slot's instrument output (saturating). */
static inline void slot_feed_mix(int16_t *dst, const int16_t *lr) {
    for (int i = 0; i < SLOT_FEED_SAMPLES; i++) {
        int32_t v = (int32_t)dst[i] + lr[i];
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        dst[i] = (int16_t)v;
    }
}

#endif
