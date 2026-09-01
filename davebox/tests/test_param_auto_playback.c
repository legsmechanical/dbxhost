/* tests/test_param_auto_playback.c — automation playing back (Front 3, P2).
 *
 * Two destinations, because the DSP can only reach one of them itself: a
 * module DSP is given MIDI callbacks and nothing else, so "cc:"/"at" targets
 * are emitted here while every chain or bus parameter is STAGED for JS to
 * push. This pins the staging half — what lands in the queue, what does not,
 * and that a parameter is released back to rest rather than abandoned. */
#include "harness.h"
#include <string.h>
#include <stdio.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

static void pa_set(hx_t *h, int t, int c, const char *tgt, int tick, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, tick, val);
    hx_set_param(h, k, v);
}

/* Drain the staged queue the way JS does. */
static int pending(hx_t *h, char *buf, int len) {
    return hx_get_param(h, "pa_pending", buf, len);
}

/* Runs as if another thread had completed a store edit during the pass. */
static void pa_midscan_write(seq8_instance_t *inst) {
    pa_write_begin(inst);
    pa_write_end(inst);
}

static int lines(const char *s) {
    int n = 0;
    for (const char *p = s; *p; p++) if (*p == '\n') n++;
    return n;
}

int main(void) {
    char buf[4096];

    /* ---- what the DSP stages, and what it keeps for itself ---------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;

        /* A chain parameter and a MIDI parameter, both automated. */
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 8000);
        pa_set(h, 0, 0, "cc:74", 0, 8000);

        /* Drive one tick of playback directly — render_block's own driver needs
         * a clock, and the question here is what the scan produces. */
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);

        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 8000"), "the chain parameter is staged for JS, with its value");
        HX_ASSERT(!strstr(buf, "cc:74"), "the MIDI one is NOT staged — the DSP emits that itself");
        HX_ASSERT(lines(buf) == 1, "exactly one staged change");
        OK("⚠ staging is split by what the DSP can reach: chain params queued, MIDI emitted");

        /* Draining is destructive: what JS took is gone. */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a second drain returns nothing");
        OK("the queue drains destructively — no value is pushed twice");
        hx_destroy(h);
    }

    /* ---- an unchanged value must not be re-pushed ------------------- */
    {
        /* At ~2.9 ms a push, re-sending a parameter that has not moved is the
         * difference between a working feature and a stalled tick. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 5000);

        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 1, "first pass stages it");

        for (int i = 0; i < 10; i++)
            pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "ten more ticks at the same value stage NOTHING");
        OK("⚠ an unchanged parameter is never re-pushed");

        /* Moving the playhead to a different value does stage again. */
        pa_set(h, 0, 0, "1:fx1:cutoff", 96, 9000);
        pa_playback_scan(in, &in->tracks[0], 0, 0, 96, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 9000"), "a moved value is staged");
        OK("a value that changes is staged");
        hx_destroy(h);
    }

    /* ---- deactivated automation does not play ----------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 5000);
        hx_set_param(h, "t0_pa_active", "0 1:fx1:cutoff 0");
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a deactivated entry plays nothing");
        OK("Mute+knob stops it playing while keeping the data");
        hx_destroy(h);
    }

    /* ---- release to rest -------------------------------------------- */
    {
        /* Playback WRITES real parameters, and for a chain parameter the slot
         * persists what it was left holding. So stopping must put the
         * parameter back where it was before automation touched it. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 1:fx1:cutoff 2000");
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 9000);

        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "9000"), "played the automation value");

        pa_release_track(in, 0, 0);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "release stages the RESTING value");
        OK("⚠ stopping returns the parameter to rest, not wherever the playhead left it");

        /* And after a release, playback must re-send rather than believing its
         * cached last-sent value still holds. */
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "9000"), "playback re-asserts after a release");
        OK("playback re-sends after a release — the cache does not outlive it");
        hx_destroy(h);
    }

    /* ---- one tick cannot flood the queue ---------------------------- */
    {
        /* A tick stages at most PA_TICK_MAX_STAGE changes. That is the budget
         * that matters: each staged change costs JS a parameter push, measured
         * at 2852 us against a ~10.6 ms tick. What does not fit is not lost —
         * it is simply still "changed" next tick, so the scan picks it up then. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char tgt[32];
        const int N = PA_TICK_MAX_STAGE * 3;
        for (int i = 0; i < N; i++) {
            snprintf(tgt, sizeof(tgt), "1:fx1:p%d", i);
            pa_set(h, 0, 0, tgt, 0, 1000 + i);
        }

        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == PA_TICK_MAX_STAGE, "one tick stages no more than its budget");
        OK("⚠ a tick stages at most its budget — automation cannot flood the push path");

        int total = PA_TICK_MAX_STAGE;
        for (int pass = 0; pass < 6 && total < N; pass++) {
            pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
            pending(h, buf, sizeof(buf));
            total += lines(buf);
        }
        HX_ASSERT(total == N, "every parameter is reached within a few ticks");
        OK("what does not fit this tick is picked up by the next — nothing is dropped");
        hx_destroy(h);
    }

    /* ---- but if it ever does overflow, it says so -------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        /* Straight at the ring: the scan's own budget makes this unreachable in
         * normal play, which is exactly why the condition needs to be visible
         * if it ever does happen rather than inferred from missing automation. */
        for (int i = 0; i < PA_RING_SLOTS + 8; i++) pa_ring_push(in, 0, (uint16_t)i);
        char dropped[8];
        hx_get_param(h, "pa_ring_dropped", dropped, sizeof(dropped));
        HX_ASSERT(dropped[0] == '1', "overflow is REPORTED");
        hx_get_param(h, "pa_ring_dropped", dropped, sizeof(dropped));
        HX_ASSERT(dropped[0] == '0', "and the flag clears on read");
        OK("the staged queue drops oldest under pressure, and says so");

        int n = pending(h, buf, sizeof(buf));
        HX_ASSERT(n == 0 || buf[n - 1] == '\n', "the drain never ends mid-line");
        OK("a drain never ends mid-line");
        hx_destroy(h);
    }

    /* ---- a write in flight is never read torn ------------------------ */
    {
        /* The store is written on the SPI thread and read here on the audio
         * thread. A pass that overlapped a write is thrown away whole rather
         * than acted on: half of one edit and half of another is a value that
         * was never written to anything. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 7000);

        pa_write_begin(in);                       /* a writer is mid-edit */
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a scan during a write stages NOTHING");
        pa_write_end(in);

        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 7000"), "and the next tick works normally");
        OK("⚠ a pass overlapping a write is discarded, not acted on");
        hx_destroy(h);
    }

    /* ---- a write that lands MID-PASS is caught too ------------------ */
    {
        /* The check at the top of the scan catches a write still in flight.
         * This one catches a write that starts AND finishes while the pass is
         * reading — the pass then holds a mixture of before and after, which is
         * a store state that never existed. Only reachable through the test
         * hook: single-threaded code cannot otherwise produce the race. */
        extern void (*pa_test_midscan_hook)(seq8_instance_t *inst);
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 7000);

        pa_test_midscan_hook = pa_midscan_write;
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pa_test_midscan_hook = 0;
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a pass with a completed write inside it stages NOTHING");
        OK("⚠ a write that begins and ends mid-pass invalidates the pass");

        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 7000"), "the next pass is clean");
        OK("and the following pass proceeds normally");
        hx_destroy(h);
    }

    printf("PASS: test_param_auto_playback (%d checks)\n", ok_count);
    return 0;
}
