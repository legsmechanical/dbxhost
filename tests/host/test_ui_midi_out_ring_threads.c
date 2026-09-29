/*
 * The shadow_ui -> shim MIDI-out ring under two real threads.
 *
 * A producer thread (shadow_ui's role) pushes numbered messages of 1..4 packets
 * all-or-nothing, retrying on refusal; a consumer thread (the shim's role)
 * snapshots, sometimes DEFERS (does not commit, takes the same bytes again
 * later), otherwise copies and commits. Every message must arrive whole, in
 * order, exactly once — the three things the old reset+memset drain broke.
 *
 * ⚠ What this does NOT prove: the ARM64 barriers. On the build host (x86 /
 * Apple) the hardware orders these accesses more strongly than the Move's CPU,
 * so a deleted __sync_synchronize() can still pass here. The barriers are
 * pinned by source (test_ui_midi_out_shm_ownership.sh and the ingest's own
 * comment) and only the device proves them.
 */
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>

#include "shadow_constants.h"
#include "ui_midi_out_ring.h"

#define MSGS 200000
static shadow_midi_out_t ring;
static volatile int producer_done = 0;
static int bad = 0;

static unsigned rnd(unsigned *s) { *s = *s * 1103515245u + 12345u; return (*s >> 16) & 0x7fff; }

static void *producer(void *arg) {
    (void)arg;
    unsigned seed = 1;
    for (uint32_t id = 0; id < MSGS; id++) {
        int pk = 1 + (int)(rnd(&seed) % 4);
        uint8_t msg[16];
        for (int k = 0; k < pk; k++) {       /* packet: [npk<<4|k, id b0, id b1, id b2] */
            msg[4*k] = (uint8_t)((pk << 4) | k);
            msg[4*k+1] = (uint8_t)id; msg[4*k+2] = (uint8_t)(id >> 8); msg[4*k+3] = (uint8_t)(id >> 16);
        }
        while (!ui_midi_out_push(&ring, msg, (uint16_t)(4 * pk))) { /* full: retry */ }
    }
    producer_done = 1;
    return NULL;
}

static void *consumer(void *arg) {
    (void)arg;
    unsigned seed = 7;
    uint32_t expect = 0;
    uint8_t buf[SHADOW_MIDI_OUT_BUFFER_SIZE];
    while (expect < MSGS) {
        uint16_t n = ui_midi_out_used(&ring);
        __sync_synchronize();                       /* as the shim's ingest */
        if (n == 0) { if (producer_done && ui_midi_out_used(&ring) == 0 && expect < MSGS) { bad = 1; break; } continue; }
        ui_midi_out_copy(&ring, buf, n);
        if (rnd(&seed) % 5 == 0) continue;          /* DEFER: no commit, same bytes next time */
        ui_midi_out_commit(&ring, n);
        int i = 0;
        while (i < n) {
            int pk = buf[i] >> 4;
            if (pk < 1 || pk > 4 || i + 4 * pk > n) { bad = 2; return NULL; }   /* a message split across snapshots */
            for (int k = 0; k < pk; k++) {
                const uint8_t *p = &buf[i + 4*k];
                uint32_t id = p[1] | (p[2] << 8) | ((uint32_t)p[3] << 16);
                if ((p[0] & 0x0F) != k || (p[0] >> 4) != pk || id != (expect & 0xFFFFFF)) { bad = 3; return NULL; }
            }
            expect++;
            i += 4 * pk;
        }
    }
    return NULL;
}

/* A broken ring can leave either side spinning forever (a producer waiting
 * for room that is never released, a consumer waiting for bytes that never
 * come). That is a FAILURE, not a hang: a test that can hang cannot be
 * mutation-tested. */
static void on_alarm(int sig) {
    (void)sig;
    static const char m[] = "FAIL: ring stalled (watchdog, 20 s)\n";
    (void)!write(1, m, sizeof m - 1);
    _exit(1);
}

int main(void) {
    signal(SIGALRM, on_alarm);
    alarm(20);
    memset(&ring, 0, sizeof ring);
    pthread_t a, b;
    pthread_create(&b, NULL, consumer, NULL);
    pthread_create(&a, NULL, producer, NULL);
    pthread_join(a, NULL);
    pthread_join(b, NULL);
    if (bad) { printf("FAIL: ring order/whole-ness broke (code %d)\n", bad); return 1; }
    printf("ok   %d messages of 1-4 packets, two threads, deferred snapshots: whole, in order, once\n", MSGS);
    printf("PASS: test_ui_midi_out_ring_threads (logic; barriers pinned elsewhere)\n");
    return 0;
}
