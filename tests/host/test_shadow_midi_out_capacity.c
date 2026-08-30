/*
 * Can shadow_midi_out_t.write_idx address its own buffer?
 *
 * It could not. The buffer is 512 bytes and write_idx was a uint8_t, so:
 *
 *   - only the first 63 packets were reachable; the back half of the buffer
 *     was never written and never read;
 *   - `write_idx = write_offset + 4` wrapped 252 -> 0, silently rewinding the
 *     buffer mid-flush so later packets overwrote earlier ones;
 *   - the `write_offset + 4 <= SHADOW_MIDI_OUT_BUFFER_SIZE` bounds check in
 *     js_shadow_midi_send could never fire, because a uint8_t cannot reach
 *     512. It read as a working overflow check and was dead code.
 *
 * Symptom on hardware: an overtake module playing heavily loses LED updates,
 * permanently, because input_filter's setLED caches the colour it believes it
 * sent and suppresses the next identical repaint.
 *
 * This is the "~64 packets, >60/frame overflows" limit CLAUDE.md recorded as a
 * property of the buffer. It was a property of the FIELD.
 *
 * The test drives the real write loop against the real struct, so it fails if
 * the field is ever narrowed back — which is the only way this returns.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "shadow_constants.h"
#include "shadow_midi_spill.h"

static int failures = 0;

static void check(int cond, const char *what) {
    if (cond) {
        printf("  ok   %s\n", what);
    } else {
        printf("  FAIL %s\n", what);
        failures++;
    }
}

/* Byte-for-byte the write step of js_shadow_midi_send. Returns 1 if queued. */
static int push_packet(shadow_midi_out_t *m, const uint8_t pkt[4]) {
    int write_offset = m->write_idx;
    if (write_offset + 4 <= SHADOW_MIDI_OUT_BUFFER_SIZE) {
        memcpy(&m->buffer[write_offset], pkt, 4);
        m->write_idx = (uint16_t)(write_offset + 4);
        return 1;
    }
    return 0;
}

int main(void) {
    static shadow_midi_out_t m;
    const int CAPACITY = SHADOW_MIDI_OUT_BUFFER_SIZE / 4;

    /* 1. THE WHOLE BUFFER IS REACHABLE. */
    printf("every packet the buffer has room for is accepted\n");
    memset(&m, 0, sizeof(m));
    int queued = 0;
    for (int i = 0; i < CAPACITY; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)i, 100 };
        queued += push_packet(&m, pkt);
    }
    check(queued == CAPACITY, "all 128 packets queued, not 63");
    check(m.write_idx == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "write_idx reaches the end of the buffer");

    /* 2. NOTHING REWOUND. The wrap overwrote packet 0 with packet 64; the
     * note number in each slot is what proves it did not happen here. */
    printf("no packet was overwritten by a later one\n");
    int intact = 1;
    for (int i = 0; i < CAPACITY; i++)
        if (m.buffer[i * 4 + 2] != (uint8_t)i) { intact = 0; break; }
    check(intact, "every slot still holds the packet written to it");

    /* 3. THE GUARD ACTUALLY FIRES. It could not before: a uint8_t
     * write_offset cannot reach 512, so the bounds check was unreachable and
     * a full buffer was indistinguishable from a successful write. */
    printf("a full buffer refuses, and says so\n");
    uint8_t extra[4] = { 0x09, 0x90, 127, 100 };
    check(push_packet(&m, extra) == 0, "the packet past the end is refused");
    check(m.write_idx == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "and a refused write does not advance the cursor");

    /* 4. THE SHIM READS WHAT WAS WRITTEN. shadow_inject_ui_midi_out does
     * `int snapshot_len = midi_out_shm->write_idx`, so a field that cannot
     * express the length silently truncates the drain as well as the fill. */
    printf("the length the shim reads covers everything written\n");
    int snapshot_len = m.write_idx;
    check(snapshot_len == SHADOW_MIDI_OUT_BUFFER_SIZE,
          "the drain sees all 512 bytes, not the low 8 bits of the count");

    /* 5. THE STRUCT DID NOT GROW. Both processes map by sizeof and are built
     * together, but a size change is still an ABI change and this one was
     * meant to be free — it takes a reserved byte. */
    printf("widening the field cost no memory\n");
    check(sizeof(shadow_midi_out_t) == 4 + SHADOW_MIDI_OUT_BUFFER_SIZE,
          "sizeof is unchanged at header + buffer");

    /* ====================================================================
     * 6. A BURST BIGGER THAN THE WINDOW SURVIVES, IN ORDER, EXACTLY ONCE.
     *
     * Widening write_idx made the bounds check real for the first time, and
     * that inverted a behaviour nobody knew was load-bearing: the old uint8_t
     * WRAP silently overwrote the head of an oversized burst, so the TAIL --
     * the actual pad colours -- reached the hardware. Refusing instead keeps
     * the head (the clears) and drops the tail. Pads dark at project
     * management; device-confirmed by layer bisect against this commit alone.
     *
     * davebox's launch burst is 470 packets (see shadow_midi_spill.c for the
     * breakdown), ~3.7x this window, and it cannot be batched: the module
     * imports input_filter from the STOCK tree, which caches unconditionally
     * and ignores the return value, so a refused write is never retried.
     *
     * This drives the REAL functions, not a replica of them -- that is why
     * the ring is its own translation unit. Three windows' worth is written
     * in one go, drained the way the shim drains (whole window, write_idx to
     * 0), and every packet must come out exactly once and in order.
     * ==================================================================== */
    printf("a burst larger than the window survives in order\n");
    memset(&m, 0, sizeof(m));
    shadow_midi_spill_reset();

    const int BURST = CAPACITY * 3;
    static uint8_t seen[3 * (SHADOW_MIDI_OUT_BUFFER_SIZE / 4)];
    memset(seen, 0, sizeof(seen));

    int accepted = 0;
    for (int i = 0; i < BURST; i++) {
        /* Two bytes of sequence so the ordering assertion can tell 300 apart
         * from 44 -- a single note byte wraps at 128 and the check would pass
         * on a buffer that had silently rewound, which is the exact failure
         * being tested for. */
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)(i & 0x7F), (uint8_t)(i >> 7) };
        accepted += shadow_midi_send_packet(&m, pkt);
    }
    check(accepted == BURST, "every packet of a 3x-window burst is accepted");
    check(shadow_midi_spill_drops() == 0, "nothing was dropped");
    check(shadow_midi_spill_pending() == (BURST - CAPACITY) * 4,
          "the window holds one window's worth and the rest is queued");

    /* Drain the way the shim does: take the whole window, reset write_idx to
     * 0, then let the host refill from the ring. */
    int received = 0;
    int out_of_order = -1;
    for (int pass = 0; pass < 16 && received < BURST; pass++) {
        int len = m.write_idx;
        for (int off = 0; off + 4 <= len; off += 4) {
            int seq = m.buffer[off + 2] | (m.buffer[off + 3] << 7);
            if (seq != received && out_of_order < 0) out_of_order = received;
            if (seq >= 0 && seq < BURST) seen[seq]++;
            received++;
        }
        m.write_idx = 0;
        memset(m.buffer, 0, sizeof(m.buffer));
        shadow_midi_spill_drain(&m);
    }
    check(received == BURST, "every packet came out of the window");
    check(out_of_order < 0, "packets arrived in the order they were sent");

    int duplicated = 0, missing = 0;
    for (int i = 0; i < BURST; i++) {
        if (seen[i] > 1) duplicated++;
        if (seen[i] == 0) missing++;
    }
    check(duplicated == 0, "no packet arrived twice");
    check(missing == 0, "no packet went missing");
    check(shadow_midi_spill_pending() == 0, "the ring is empty afterwards");

    /* ====================================================================
     * 6b. A SEND AFTER A PARTIAL DRAIN MUST NOT JUMP THE QUEUE.
     *
     * ⚠ THIS CASE WAS MISSING AND MUTATION TESTING FOUND IT. §6 above fills
     * the window and then spills, but the window never regains room DURING a
     * send, so `busy = 0` -- i.e. deleting the FIFO rule entirely -- passed
     * every assertion in it. The rule only bites in the sequence that
     * actually happens on device: the shim drains a window, and the module
     * sends again while packets are still queued behind it.
     *
     * If a new packet takes the freed window slot, it overtakes the queued
     * ones. For LEDs that is a stale colour arriving after a fresh one, which
     * is the whole failure class this path exists to end.
     * ==================================================================== */
    printf("a send after a partial drain does not overtake the queue\n");
    memset(&m, 0, sizeof(m));
    shadow_midi_spill_reset();

    const int FIRST = CAPACITY + 10;      /* fills the window, 10 spill */
    for (int i = 0; i < FIRST; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)(i & 0x7F), (uint8_t)(i >> 7) };
        shadow_midi_send_packet(&m, pkt);
    }
    check(shadow_midi_spill_pending() == 10 * 4, "ten packets are queued behind a full window");

    /* The shim takes the window. Room is now free, and 10 packets are still
     * queued -- this is the moment the rule is about. */
    m.write_idx = 0;
    memset(m.buffer, 0, sizeof(m.buffer));

    for (int i = FIRST; i < FIRST + 5; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)(i & 0x7F), (uint8_t)(i >> 7) };
        shadow_midi_send_packet(&m, pkt);
    }
    check(shadow_midi_spill_pending() == 15 * 4,
          "the new packets queue BEHIND the backlog, they do not take the free window");

    int seq_expect = CAPACITY;   /* the window's 0..CAPACITY-1 were consumed */
    int order_ok = 1;
    for (int pass = 0; pass < 8 && seq_expect < FIRST + 5; pass++) {
        shadow_midi_spill_drain(&m);
        int len = m.write_idx;
        for (int off = 0; off + 4 <= len; off += 4) {
            int seq = m.buffer[off + 2] | (m.buffer[off + 3] << 7);
            if (seq != seq_expect) order_ok = 0;
            seq_expect++;
        }
        m.write_idx = 0;
        memset(m.buffer, 0, sizeof(m.buffer));
    }
    check(order_ok && seq_expect == FIRST + 5,
          "the backlog and the later packets come out in one unbroken sequence");

    /* ====================================================================
     * 6c. COMPACTION. The ring is linear, not circular — it reclaims its
     * consumed prefix only when it has to. Drive it there: fill the ring,
     * drain part of it, then push more so the tail would run off the end.
     * Without the memmove the pushes are refused and the stream breaks; with
     * a WRONG memmove the order breaks. Also mutation-found: nothing above
     * pushed the ring far enough to need compacting.
     * ==================================================================== */
    printf("the ring reclaims its consumed prefix without losing order\n");
    memset(&m, 0, sizeof(m));
    shadow_midi_spill_reset();

    const int RING_PKTS = SHADOW_MIDI_SPILL_SIZE / 4;
    /* Fill the window plus the whole ring. */
    for (int i = 0; i < CAPACITY + RING_PKTS; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)(i & 0x7F), (uint8_t)(i >> 7) };
        shadow_midi_send_packet(&m, pkt);
    }
    /* Drain two windows' worth, leaving a large consumed prefix in the ring. */
    for (int pass = 0; pass < 2; pass++) {
        m.write_idx = 0;
        memset(m.buffer, 0, sizeof(m.buffer));
        shadow_midi_spill_drain(&m);
    }
    m.write_idx = 0;
    memset(m.buffer, 0, sizeof(m.buffer));

    /* Now push more. The tail is at the far end, so this can only succeed if
     * the consumed prefix is reclaimed. */
    int base_seq = CAPACITY + RING_PKTS;
    int late_ok = 1;
    for (int i = 0; i < 32; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)((base_seq + i) & 0x7F),
                           (uint8_t)((base_seq + i) >> 7) };
        if (!shadow_midi_send_packet(&m, pkt)) late_ok = 0;
    }
    check(late_ok, "the ring reclaims space rather than refusing");

    /* And everything still comes out in order, with nothing lost. */
    int expect = CAPACITY * 3;   /* window + two drained passes consumed */
    int compact_order_ok = 1, got = 0;
    for (int pass = 0; pass < 64; pass++) {
        shadow_midi_spill_drain(&m);
        int len = m.write_idx;
        if (len == 0) break;
        for (int off = 0; off + 4 <= len; off += 4) {
            int seq = m.buffer[off + 2] | (m.buffer[off + 3] << 7);
            if (seq != expect) compact_order_ok = 0;
            expect++; got++;
        }
        m.write_idx = 0;
        memset(m.buffer, 0, sizeof(m.buffer));
    }
    check(compact_order_ok, "order survives compaction");
    check(expect == base_seq + 32, "every packet after compaction arrived");
    check(got > 0, "CONTROL: the compaction drain actually moved packets");

    /* 7. THE REFUSAL SEMANTICS SURVIVE, for the one case that is still a real
     * failure: the RING itself exhausted. That is what the caller is told
     * about, and what keeps input_filter from caching a colour it never sent.
     * A full WINDOW is no longer a failure and must not report as one. */
    printf("only a full spill ring is a refusal\n");
    memset(&m, 0, sizeof(m));
    shadow_midi_spill_reset();
    const int RING_CAPACITY = SHADOW_MIDI_SPILL_SIZE / 4;
    int refused_at = -1;
    for (int i = 0; i < RING_CAPACITY + CAPACITY + 16; i++) {
        uint8_t pkt[4] = { 0x09, 0x90, (uint8_t)(i & 0x7F), (uint8_t)(i >> 7) };
        if (!shadow_midi_send_packet(&m, pkt)) { refused_at = i; break; }
    }
    check(refused_at == RING_CAPACITY + CAPACITY,
          "refusal begins only after the window AND the whole ring are full");
    check(shadow_midi_spill_drops() > 0, "a genuine refusal is counted");
    check(shadow_midi_spill_peak() == SHADOW_MIDI_SPILL_SIZE,
          "the high-water mark reports the full ring");

    /* 8. THE RING IS BIG ENOUGH FOR THE BURST IT WAS SIZED FOR. A number that
     * drifts below the measurement it came from is the regression returning
     * quietly. 470 packets is davebox's measured launch burst. */
    printf("the ring is sized from the measurement\n");
    check(SHADOW_MIDI_SPILL_SIZE / 4 >= 470 * 2,
          "the ring holds at least 2x davebox's measured 470-packet launch burst");

    if (failures) {
        printf("FAILURES: %d\n", failures);
        return 1;
    }
    printf("PASS: shadow MIDI out buffer is fully addressable and absorbs bursts\n");
    return 0;
}
