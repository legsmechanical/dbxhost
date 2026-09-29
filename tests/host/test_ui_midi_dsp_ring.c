/*
 * The shadow_ui -> shim MIDI-to-DSP ring (ui_midi_dsp_ring.h).
 *
 * The bug it replaced: the drain snapshotted write_idx, copied, then reset
 * write_idx to 0 and memset the buffer while shadow_ui (another process) could
 * be appending — a frame the sender was told was delivered was erased. This
 * segment carries a module's notes to its instruments, so the loss is a note
 * that never sounds or a note-off that leaves one hanging.
 *
 * Before THAT, write_idx was a uint8_t byte offset that could not reach 512:
 * the 65th frame of a flush wrapped it to 0 (found 2026-09-15, a held note on
 * load). The width is now pinned by _Static_asserts in the headers; this checks
 * the behaviour: capacity, whole frames, order across both wraps, refusing
 * rather than overwriting, and releasing an impossible count unread.
 *
 * The ring is a deliberate copy of ui_midi_out_ring.h (upstream's, taken
 * whole). The last section drives BOTH through one random sequence and requires
 * identical answers, so the copy cannot drift from the reviewed original.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "shadow_constants.h"
#include "ui_midi_out_ring.h"
#include "ui_midi_dsp_ring.h"

static int failures = 0;
static void check(int cond, const char *what) {
    if (cond) printf("  ok   %s\n", what);
    else    { printf("  FAIL %s\n", what); failures++; }
}

static shadow_midi_dsp_t ring;
static void frame(uint8_t *f, int n) {          /* note-on, numbered, slot tag 1 */
    f[0] = 0x90; f[1] = (uint8_t)(n & 0x7F); f[2] = (uint8_t)((n >> 7) & 0x7F); f[3] = 1;
}
static int frame_is(const uint8_t *f, int n) {
    return f[0] == 0x90 && f[1] == (uint8_t)(n & 0x7F) &&
           f[2] == (uint8_t)((n >> 7) & 0x7F) && f[3] == 1;
}
static int push_one(int n) { uint8_t f[4]; frame(f, n); return ui_midi_dsp_push(&ring, f, 4); }

int main(void) {
    printf("test_ui_midi_dsp_ring\n");
    const int CAP = UI_MIDI_DSP_CAPACITY / 4;               /* 127 */
    uint8_t out[SHADOW_MIDI_DSP_BUFFER_SIZE];
    uint32_t disc = 0;

    printf("capacity, and a full ring refuses rather than overwrites\n");
    memset(&ring, 0, sizeof ring);
    int pushed = 0;
    while (pushed <= CAP && push_one(pushed)) pushed++;      /* bounded: never spins */
    check(pushed == CAP, "127 frames queued (one short of the buffer), the 128th refused");
    check(ui_midi_dsp_used(&ring) == UI_MIDI_DSP_CAPACITY, "a full ring reports itself full, not empty");
    uint16_t w_full = ring.write_idx;
    check(!push_one(999) && ring.write_idx == w_full, "a refused frame does not move write_idx");

    printf("the drain takes everything, in order, and releases it\n");
    int n = ui_midi_dsp_take(&ring, out, &disc);
    int ordered = (n == UI_MIDI_DSP_CAPACITY);
    for (int i = 0; ordered && i < CAP; i++) if (!frame_is(&out[i * 4], i)) ordered = 0;
    check(ordered, "all 127 frames come back, in the order they were written");
    check(ui_midi_dsp_used(&ring) == 0 && disc == 0, "and the ring is empty, nothing discarded");
    check(ui_midi_dsp_take(&ring, out, &disc) == 0, "an empty ring takes nothing");

    printf("a frame written after a take is not lost (the old reset erased it)\n");
    push_one(1000);
    n = ui_midi_dsp_take(&ring, out, &disc);
    push_one(1001);                              /* lands while the shim dispatches */
    int got = ui_midi_dsp_take(&ring, out + 4, &disc);
    check(n == 4 && got == 4 && frame_is(out, 1000) && frame_is(out + 4, 1001),
          "both frames arrive, one per take");

    printf("order holds across the buffer wrap and the uint16 wrap\n");
    memset(&ring, 0, sizeof ring);
    ring.write_idx = ring.read_idx = (uint16_t)(65536 - 40);
    int next = 0, expect = 0, ok_wrap = 1;
    for (int round = 0; round < 3000 && ok_wrap; round++) {
        int k = 1 + round % 5;
        for (int j = 0; j < k; j++) if (!push_one(next++)) ok_wrap = 0;
        n = ui_midi_dsp_take(&ring, out, &disc);
        if (n != 4 * k) ok_wrap = 0;
        for (int j = 0; j < n / 4 && ok_wrap; j++) if (!frame_is(&out[j * 4], expect++)) ok_wrap = 0;
    }
    check(ok_wrap && disc == 0, "3000 rounds of 1-5 frames, both indices wrapping many times, in order");

    printf("a count no producer can leave is released UNREAD\n");
    memset(&ring, 0, sizeof ring);
    ring.buffer[0] = 0x90;
    ring.write_idx = 6;                                       /* not whole frames */
    disc = 0;
    check(ui_midi_dsp_take(&ring, out, &disc) == 0 && disc == 1 &&
          ring.read_idx == 6 && ui_midi_dsp_used(&ring) == 0,
          "a partial frame: nothing dispatched, counted, ring usable again");
    memset(&ring, 0, sizeof ring);
    ring.write_idx = 0; ring.read_idx = 3;                    /* the old `ready` byte read as read_idx */
    disc = 0;
    check(ui_midi_dsp_take(&ring, out, &disc) == 0 && disc == 1 && ui_midi_dsp_used(&ring) == 0,
          "an old-layout segment (65533 'queued'): nothing dispatched, counted, ring usable again");
    check(push_one(7) && ui_midi_dsp_take(&ring, out, &disc) == 4 && frame_is(out, 7),
          "and the next frame goes through");

    printf("the struct did not grow\n");
    check(sizeof(shadow_midi_dsp_t) == 4 + SHADOW_MIDI_DSP_BUFFER_SIZE,
          "sizeof is two indices + buffer, as before");

    printf("the copy behaves exactly like upstream's ring\n");
    {
        static shadow_midi_out_t o;
        _Static_assert(SHADOW_MIDI_OUT_BUFFER_SIZE == SHADOW_MIDI_DSP_BUFFER_SIZE,
                       "the equivalence check needs equal buffers");
        memset(&o, 0, sizeof o); memset(&ring, 0, sizeof ring);
        o.write_idx = o.read_idx = ring.write_idx = ring.read_idx = (uint16_t)(65536 - 300);
        unsigned s = 12345;
        int same = 1, ops = 0, id = 0;
        uint8_t oo[SHADOW_MIDI_OUT_BUFFER_SIZE];
        for (ops = 0; ops < 200000 && same; ops++) {
            s = s * 1103515245u + 12345u;
            unsigned r = (s >> 16) & 0x7fff;
            if (r % 3) {                                          /* push 1-8 frames */
                int k = 1 + (int)(r % 8);
                uint8_t buf[32];
                for (int j = 0; j < k; j++) frame(&buf[j * 4], id + j);
                int a = ui_midi_out_push(&o, buf, (uint16_t)(4 * k));
                int b = ui_midi_dsp_push(&ring, buf, (uint16_t)(4 * k));
                if (a != b) same = 0;
                if (a) id += k;
            } else {                                              /* drain all */
                uint16_t len = ui_midi_out_used(&o);
                ui_midi_out_copy(&o, oo, len);
                ui_midi_out_commit(&o, len);
                uint16_t got2 = ui_midi_dsp_take(&ring, out, &disc);
                if (got2 != len || memcmp(oo, out, len)) same = 0;
            }
            if (o.write_idx != ring.write_idx || o.read_idx != ring.read_idx) same = 0;
        }
        check(same, "200000 random pushes and drains: same refusals, same bytes, same indices");
    }

    if (failures) { printf("FAILURES: %d\n", failures); return 1; }
    printf("PASS: test_ui_midi_dsp_ring\n");
    return 0;
}
