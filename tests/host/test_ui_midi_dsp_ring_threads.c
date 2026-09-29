/*
 * The shadow_ui -> shim MIDI-to-DSP ring under two real threads.
 *
 * A producer thread (shadow_ui's role, js_shadow_send_midi_to_dsp) pushes
 * numbered frames one at a time, retrying on refusal; a consumer thread (the
 * shim's role) calls ui_midi_dsp_take — the exact call shadow_drain_ui_midi_dsp
 * makes — in a loop. Every frame must arrive once, in order. The old drain
 * (reset write_idx, memset) loses frames here within milliseconds.
 *
 * ⚠ What this does NOT prove: the ARM64 barriers. The build host orders these
 * accesses more strongly than the Move's CPU, so a deleted __sync_synchronize()
 * can still pass here. Only the device proves them.
 */
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include "shadow_constants.h"
#include "ui_midi_dsp_ring.h"

#define FRAMES 300000
static shadow_midi_dsp_t ring;
static volatile int producer_done = 0;
static int bad = 0;
static uint32_t discarded = 0;

static void *producer(void *arg) {
    (void)arg;
    for (uint32_t id = 0; id < FRAMES; id++) {
        /* [status | high bits, id b0, id b1, tag]: every byte of the frame
         * carries the id, so a torn or stale frame cannot pass for the next */
        uint8_t f[4] = { (uint8_t)(0x80 | ((id >> 14) & 0x0F)), (uint8_t)(id & 0x7F),
                         (uint8_t)((id >> 7) & 0x7F), (uint8_t)(1 + id % 8) };
        while (!ui_midi_dsp_push(&ring, f, 4)) { /* full: retry */ }
    }
    producer_done = 1;
    return NULL;
}

static void *consumer(void *arg) {
    (void)arg;
    uint32_t expect = 0;
    uint8_t buf[SHADOW_MIDI_DSP_BUFFER_SIZE];
    while (expect < FRAMES) {
        int done = producer_done;
        uint16_t n = ui_midi_dsp_take(&ring, buf, &discarded);
        if (n == 0) {
            if (done && ui_midi_dsp_used(&ring) == 0) { bad = 1; break; }   /* frames lost */
            continue;
        }
        for (int i = 0; i < n; i += 4) {
            const uint8_t *p = &buf[i];
            uint32_t id = expect;
            if (p[0] != (uint8_t)(0x80 | ((id >> 14) & 0x0F)) || p[1] != (id & 0x7F) ||
                p[2] != ((id >> 7) & 0x7F) || p[3] != (uint8_t)(1 + id % 8)) { bad = 2; return NULL; }
            expect++;
        }
    }
    return NULL;
}

/* A broken ring can leave either side spinning forever. That is a FAILURE,
 * not a hang: a test that can hang cannot be mutation-tested. */
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
    if (bad || discarded) {
        printf("FAIL: frames lost or reordered (code %d, discarded %u)\n", bad, discarded);
        return 1;
    }
    printf("ok   %d frames, two threads: every one, in order, once\n", FRAMES);
    printf("PASS: test_ui_midi_dsp_ring_threads (logic; barriers pinned by source)\n");
    return 0;
}
