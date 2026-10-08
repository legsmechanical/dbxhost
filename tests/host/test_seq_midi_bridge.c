/*
 * Host-side unit tests for seq_midi_bridge.h — the pure half of
 * seq-midi-bridge: USB-MIDI packet <-> MIDI byte conversion and the
 * MIDI_OUT stream reader.
 *
 * Runs on the dev machine, not on Move. The sequencer I/O in
 * seq_midi_bridge.c is Linux-only and is NOT covered here.
 */

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "seq_midi_bridge.h"

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { \
    printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } } while (0)

static void test_packet_to_bytes(void)
{
    uint8_t out[3];

    /* Note-on, external cable. */
    uint8_t on[4] = { 0x29, 0x93, 60, 100 };
    CHECK(seq_bridge_packet_to_bytes(on, out) == 3);
    CHECK(out[0] == 0x93 && out[1] == 60 && out[2] == 100);

    /* Same message on cable 0 is the device's own surface (LEDs) — never bridged. */
    uint8_t led[4] = { 0x09, 0x93, 60, 100 };
    CHECK(seq_bridge_packet_to_bytes(led, out) == 0);
    uint8_t cc0[4] = { 0x0B, 0xB0, 10, 127 };
    CHECK(seq_bridge_packet_to_bytes(cc0, out) == 0);

    /* Two-byte messages. */
    uint8_t pc[4] = { 0x2C, 0xC5, 12, 0 };
    CHECK(seq_bridge_packet_to_bytes(pc, out) == 2);
    CHECK(out[0] == 0xC5 && out[1] == 12);
    uint8_t cp[4] = { 0x2D, 0xD0, 99, 0 };
    CHECK(seq_bridge_packet_to_bytes(cp, out) == 2);

    /* Pitch bend keeps both data bytes. */
    uint8_t pb[4] = { 0x2E, 0xE1, 0x01, 0x40 };
    CHECK(seq_bridge_packet_to_bytes(pb, out) == 3);
    CHECK(out[1] == 0x01 && out[2] == 0x40);

    /* Transport bytes go out; other single bytes do not. */
    uint8_t clk[4] = { 0x2F, 0xF8, 0, 0 };
    CHECK(seq_bridge_packet_to_bytes(clk, out) == 1 && out[0] == 0xF8);
    uint8_t start[4] = { 0x2F, 0xFA, 0, 0 };
    CHECK(seq_bridge_packet_to_bytes(start, out) == 1 && out[0] == 0xFA);
    uint8_t sense[4] = { 0x2F, 0xFE, 0, 0 };
    CHECK(seq_bridge_packet_to_bytes(sense, out) == 0);

    /* SysEx (CIN 4..7) stays on the device. */
    uint8_t sx[4] = { 0x24, 0xF0, 0x00, 0x21 };
    CHECK(seq_bridge_packet_to_bytes(sx, out) == 0);
    uint8_t sx_end[4] = { 0x27, 0x01, 0x02, 0xF7 };
    CHECK(seq_bridge_packet_to_bytes(sx_end, out) == 0);

    /* A CIN that disagrees with its status byte is not trusted. */
    uint8_t bad[4] = { 0x29, 0xB0, 1, 2 };
    CHECK(seq_bridge_packet_to_bytes(bad, out) == 0);
}

static void test_bytes_to_packet(void)
{
    uint8_t pkt[4];

    uint8_t on[3] = { 0x92, 64, 90 };
    CHECK(seq_bridge_bytes_to_packet(on, 3, pkt) == 1);
    CHECK(pkt[0] == 0x29 && pkt[1] == 0x92 && pkt[2] == 64 && pkt[3] == 90);

    uint8_t off[3] = { 0x82, 64, 0 };
    CHECK(seq_bridge_bytes_to_packet(off, 3, pkt) == 1);
    CHECK(pkt[0] == 0x28);

    uint8_t pc[2] = { 0xC0, 7 };
    CHECK(seq_bridge_bytes_to_packet(pc, 2, pkt) == 1);
    CHECK(pkt[0] == 0x2C && pkt[2] == 7 && pkt[3] == 0);

    /* The inject ring's consumer aborts Move on a zero header byte: every
     * accepted message must produce a non-zero one. */
    for (int status = 0x80; status <= 0xEF; status++) {
        uint8_t m[3] = { (uint8_t)status, 1, 2 };
        memset(pkt, 0, sizeof(pkt));
        CHECK(seq_bridge_bytes_to_packet(m, 3, pkt) == 1);
        CHECK(pkt[0] != 0 && (pkt[0] >> 4) == SEQ_BRIDGE_CABLE_EXTERNAL);
    }

    /* Not channel voice: refused, so nothing reaches the ring. */
    uint8_t clk[1] = { 0xF8 };
    CHECK(seq_bridge_bytes_to_packet(clk, 1, pkt) == 0);
    uint8_t sx[3] = { 0xF0, 1, 2 };
    CHECK(seq_bridge_bytes_to_packet(sx, 3, pkt) == 0);
    uint8_t data[3] = { 0x40, 1, 2 };
    CHECK(seq_bridge_bytes_to_packet(data, 3, pkt) == 0);
    /* Truncated. */
    CHECK(seq_bridge_bytes_to_packet(on, 2, pkt) == 0);
    CHECK(seq_bridge_bytes_to_packet(NULL, 3, pkt) == 0);

    /* Data bytes are masked to 7 bits. */
    uint8_t hi[3] = { 0x90, 0xFF, 0xFF };
    CHECK(seq_bridge_bytes_to_packet(hi, 3, pkt) == 1);
    CHECK(pkt[2] == 0x7F && pkt[3] == 0x7F);
}

static void publish(test_stream_shm_t *shm, uint8_t id)
{
    uint32_t seq = shm->write_seq;
    test_stream_event_t *ev = &shm->buffer[seq % TEST_STREAM_CAPACITY];
    ev->frame = seq;
    ev->pkt[0] = 0x29; ev->pkt[1] = 0x90; ev->pkt[2] = id; ev->pkt[3] = 1;
    shm->write_seq = seq + 1;
}

static void test_stream_read(void)
{
    test_stream_shm_t *shm = calloc(1, sizeof(*shm));
    test_stream_event_t out[8];
    uint32_t cursor = 0;

    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 0);

    for (int i = 0; i < 3; i++) publish(shm, (uint8_t)i);
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 3);
    CHECK(out[0].pkt[2] == 0 && out[2].pkt[2] == 2);
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 0);   /* nothing replayed */

    /* More pending than the caller's buffer: delivered across calls, in order. */
    for (int i = 0; i < 12; i++) publish(shm, (uint8_t)(10 + i));
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 8);
    CHECK(out[0].pkt[2] == 10 && out[7].pkt[2] == 17);
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 4);
    CHECK(out[3].pkt[2] == 21);

    /* A second reader with its own cursor sees the same events: reading
     * consumes nothing from the ring. */
    uint32_t other = 3;
    CHECK(seq_bridge_stream_read(shm, &other, out, 8) == 8);
    CHECK(out[0].pkt[2] == 10);

    /* Lapped reader skips to the oldest event still in the ring. */
    uint32_t before = shm->write_seq;
    for (uint32_t i = 0; i < TEST_STREAM_CAPACITY + 5; i++) publish(shm, (uint8_t)(i & 0x7F));
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 1) == 1);
    CHECK(out[0].frame == before + 5);

    /* The cursor survives the sequence counter wrapping. */
    shm->write_seq = 0xFFFFFFFEu;
    cursor = 0xFFFFFFFEu;
    for (int i = 0; i < 4; i++) publish(shm, (uint8_t)(40 + i));
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 4);
    CHECK(out[0].pkt[2] == 40 && out[3].pkt[2] == 43);

    /* The writer restarted and its counter is behind the reader's: resync
     * to the head, deliver nothing stale, then follow normally. */
    for (int i = 0; i < 100; i++) publish(shm, 1);
    while (seq_bridge_stream_read(shm, &cursor, out, 8) > 0) {}
    CHECK(cursor == 102);
    shm->write_seq = 2;
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 0);
    CHECK(cursor == 2);
    publish(shm, 77);
    CHECK(seq_bridge_stream_read(shm, &cursor, out, 8) == 1);
    CHECK(out[0].pkt[2] == 77);

    free(shm);
}

int main(void)
{
    test_packet_to_bytes();
    test_bytes_to_packet();
    test_stream_read();
    if (failures) { printf("test_seq_midi_bridge: %d FAILED\n", failures); return 1; }
    printf("test_seq_midi_bridge: OK\n");
    return 0;
}
