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
        OK("the staged queue drops the newest under pressure, and says so");

        int n = pending(h, buf, sizeof(buf));
        HX_ASSERT(n == 0 || buf[n - 1] == '\n', "the drain never ends mid-line");
        OK("a drain never ends mid-line");
        hx_destroy(h);
    }

    /* ---- a stop from the SPI thread does not touch the ring ----------- */
    {
        /* The transport stops from whichever thread saw the gesture, but the
         * ring has ONE producer: the audio thread. A stop REQUESTS the release
         * and the next render block performs it. Two producers would race on
         * the head and lose or tear an entry — exactly under the stop, when
         * the values being staged are the ones that put parameters back. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 1:fx1:cutoff 2000");
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 9000);
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));

        pa_release_request(in, 0, 0);             /* what ext_transport_stop does */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a request alone stages nothing — the SPI thread never produces");
        pa_release_service(in);                   /* what the next render block does */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "the audio thread serves it: rest staged");
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "and a served request is spent");
        OK("⚠ a transport stop REQUESTS the release; only the audio thread feeds the ring");

        /* A deactivated entry was not driving its parameter, so Stop must not
         * move it: the value there is the user's own. */
        hx_set_param(h, "t0_pa_active", "0 1:fx1:cutoff 0");
        pa_release_service(in);                   /* the deactivate itself rests it, once */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "deactivating rests the parameter");
        pa_release_request(in, 0, 0);
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a DEACTIVATED entry is not re-asserted to rest on stop");
        OK("stop leaves a deactivated parameter where the user put it");
        hx_destroy(h);
    }

    /* ---- the per-tick cap rotates: nothing is starved ------------------ */
    {
        /* Under Smooth every ramping entry changes EVERY tick. If the scan
         * always started at index 0 and stopped at its cap, the entries past
         * the cap would never be reached while the first ones kept moving —
         * silently, forever. The scan resumes where it was cut off. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        char tgt[32], key[32], v[64];
        const int N = PA_TICK_MAX_STAGE + 4;
        for (int i = 0; i < N; i++) {
            snprintf(tgt, sizeof(tgt), "1:fx1:s%d", i);
            pa_set(h, 0, 0, tgt, 0, 0);
            pa_set(h, 0, 0, tgt, 6000, 16383);
            snprintf(key, sizeof(key), "t0_pa_smooth");
            snprintf(v, sizeof(v), "0 %s 1", tgt);
            hx_set_param(h, key, v);
        }
        int seen[PA_TICK_MAX_STAGE + 4] = {0};
        for (uint32_t ct = 1; ct <= 4; ct++) {          /* every entry moves every tick */
            pa_playback_scan(in, &in->tracks[0], 0, 0, ct, 6144, NULL);
            pending(h, buf, sizeof(buf));
            for (int i = 0; i < N; i++) {
                snprintf(tgt, sizeof(tgt), "1:fx1:s%d ", i);
                if (strstr(buf, tgt)) seen[i] = 1;
            }
        }
        int all = 1;
        for (int i = 0; i < N; i++) if (!seen[i]) all = 0;
        HX_ASSERT(all, "with more ramping entries than the cap, EVERY one is staged within a few ticks");
        OK("⚠ the capped scan rotates — a 17th Smooth entry is not starved forever");
        hx_destroy(h);
    }

    /* ---- a drain that runs out of room leaves the rest IN ORDER -------- */
    {
        /* The reader keeps the LAST value it sees per target. So an entry that
         * did not fit must stay at the front of the queue, not be pushed back
         * behind newer values for the same target — that would hand the reader
         * the older value last. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 1000);          /* interns the target */
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        int tgt_id = in->pa_entries[0].target;
        pa_ring_push(in, (uint16_t)tgt_id, 1);
        pa_ring_push(in, (uint16_t)tgt_id, 2);
        pa_ring_push(in, (uint16_t)tgt_id, 3);
        char small[20];                                   /* room for ONE "1:fx1:cutoff N\n" */
        int n = pending(h, small, sizeof(small));
        HX_ASSERT(n > 0 && strstr(small, "cutoff 1\n") && !strstr(small, "cutoff 2"), "a small drain takes the first only");
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "cutoff 2\n1:fx1:cutoff 3\n"), "the next drain gets the rest, still in order");
        OK("⚠ what does not fit stays at the FRONT — the newest value still arrives last");
        hx_destroy(h);
    }

    /* ---- deactivate / clear put the parameter back to REST, now --------- */
    {
        /* Mute+knob (deactivate) and Delete+knob (clear) both leave a
         * parameter that automation was driving; it must go back to where it
         * was before automation touched it — whether or not the transport is
         * running, and staged by the audio thread, the ring's one producer. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_pa_rest", "0 1:fx1:cutoff 2000");
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 9000);
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));

        hx_set_param(h, "t0_pa_active", "0 1:fx1:cutoff 0");   /* deactivate, transport irrelevant */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "the SPI thread stages nothing itself");
        pa_release_service(in);                                 /* the next render block */
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "deactivating puts the parameter back to REST");
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "once");
        hx_set_param(h, "t0_pa_active", "0 1:fx1:cutoff 1");
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 9000"), "re-activating: playback re-asserts the automation value");
        OK("⚠ Mute+knob: back to rest at once; on again: playback re-asserts");

        hx_set_param(h, "t0_pa_clear_key", "0 1:fx1:cutoff");  /* Delete+knob */
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "clearing puts the parameter back to REST too");
        hx_get_param(h, "pa_list", buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "and the automation is gone from the list");
        pa_playback_scan(in, &in->tracks[0], 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "and playback has nothing to play");
        /* The rest survives the clear: automating the same target again
         * knows where "back" is without being told. */
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 5000);
        hx_set_param(h, "t0_pa_clear_key", "0 1:fx1:cutoff");
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "the rest outlives a clear");
        OK("⚠ Delete+knob: gone from playback and the list, parameter back to rest, rest remembered");

        /* Delete+step emptying an entry retires it the same way. */
        pa_set(h, 0, 0, "1:fx1:cutoff", 24, 7000);
        pa_playback_scan(in, &in->tracks[0], 0, 0, 24, 384, NULL);
        pending(h, buf, sizeof(buf));
        hx_set_param(h, "t0_pa_clear_step", "0 24 47");
        pa_release_service(in);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 2000"), "Delete+step that empties an entry: back to rest");
        OK("Delete+step on the last point behaves like a clear");
        hx_destroy(h);
    }

    /* ---- a knob under a hand: recorded, or overriding ------------------ */
    {
        /* tN_pa_live is the live value of a touched knob. With Record on and
         * the transport running the DSP writes it along the playhead, one cell
         * per half step, replacing what the cell held; otherwise it is an
         * override: playback leaves the target alone until the hand comes off,
         * then re-asserts. The DSP's own flags decide which — JS only reports. */
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        seq8_track_t *tr = &in->tracks[0];

        /* OVERRIDE: not recording. */
        pa_set(h, 0, 0, "1:fx1:cutoff", 0, 9000);
        in->playing = 1;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 3000");
        pa_playback_scan(in, tr, 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a live target is NOT staged by playback — touch wins");
        pa_record_tick(in, 0, 0, 0, 24);
        HX_ASSERT(in->pa_entries[0].count == 1 && in->pa_entries[0].points[0].val == 9000,
                  "and with Record off, nothing is written");
        hx_set_param(h, "t0_pa_live_end", "1:fx1:cutoff");
        pa_playback_scan(in, tr, 0, 0, 0, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:fx1:cutoff 9000"), "on release playback RE-ASSERTS the automation value");
        OK("⚠ override: playback yields to the hand and resumes on release");

        /* RECORD: Record on, transport running. */
        tr->recording = 1;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 5000");
        pa_record_tick(in, 0, 0, 30, 24);                 /* cell 24..35 */
        pa_record_tick(in, 0, 0, 33, 24);                 /* same cell: no second point */
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 5500");
        pa_record_tick(in, 0, 0, 40, 24);                 /* cell 36..47 */
        pa_entry_t *e = &in->pa_entries[0];
        HX_ASSERT(e->count == 3, "one point per cell along the playhead (the original + two cells)");
        HX_ASSERT(e->flags & PA_FLAG_SMOOTH, "⚠ a RECORDED entry plays back smooth — half-step holds are an audible staircase");
        HX_ASSERT(e->points[1].tick == 24 && e->points[1].val == 5000, "the first cell holds the value at its start");
        HX_ASSERT(e->points[2].tick == 36 && e->points[2].val == 5500, "the next cell the newer value");
        pa_record_tick(in, 0, 0, 26, 24);                 /* loop wrapped: overwrite cell 24 */
        HX_ASSERT(e->count == 3 && e->points[1].val == 5500, "coming round again OVERWRITES the cell");
        pa_playback_scan(in, tr, 0, 0, 30, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "while recording, playback does not fight the hand");
        hx_set_param(h, "t0_pa_live_end", "1:fx1:cutoff");
        pa_record_tick(in, 0, 0, 60, 24);
        HX_ASSERT(e->count == 3, "after release nothing more is written");
        OK("⚠ record: the live value is written one cell at a time, overwriting, until release");

        /* HOLD: a lock being dialled. Playback leaves the target alone and
         * nothing is recorded — even with Record on and the transport running. */
        tr->recording = 1; in->playing = 1;
        hx_set_param(h, "t0_pa_hold", "1:fx1:cutoff");
        pa_playback_scan(in, tr, 0, 0, 30, 384, NULL);
        pending(h, buf, sizeof(buf));
        HX_ASSERT(lines(buf) == 0, "a HELD target is not staged by playback");
        int before_hold = e->count;
        pa_record_tick(in, 0, 0, 100, 24);
        HX_ASSERT(e->count == before_hold, "⚠ and a hold records NOTHING even while Record is on");
        hx_set_param(h, "t0_pa_live_end", "1:fx1:cutoff");
        OK("⚠ hold: playback and the recorder both keep their hands off a lock being dialled");
        tr->recording = 0;

        /* The writer lock: the SPI thread mid-edit means the cell waits. */
        tr->recording = 1;
        hx_set_param(h, "t0_pa_live", "1:fx1:cutoff 100");
        pa_lock(in);
        pa_record_tick(in, 0, 0, 72, 24);
        HX_ASSERT(e->count == 3, "with the SPI thread holding the store, the audio thread writes NOTHING");
        pa_unlock(in);
        pa_record_tick(in, 0, 0, 74, 24);
        HX_ASSERT(e->count == 4 && e->points[3].tick == 72, "and the same cell is written on the next tick — not lost");
        OK("⚠ two writers, one store: the audio thread tries the lock and never spins");
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
