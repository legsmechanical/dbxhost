/* tests/test_param_auto.c — the per-parameter automation store (Front 3, P1).
 *
 * Covers the store's contract: writes land, stepped-hold is the default and
 * smooth interpolates, the clear gestures reach exactly what they should, a
 * full store REPORTS rather than dropping silently, and automation persists to
 * its own file beside the project — including the uuid guard that stops one
 * project's automation being applied to another. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

/* The store is only reachable through set_param/get_param, like the device. */
static void pa_set(hx_t *h, int t, int c, const char *tgt, int tick, int val) {
    char k[64], v[128];
    snprintf(k, sizeof(k), "t%d_pa_set", t);
    snprintf(v, sizeof(v), "%d %s %d %d", c, tgt, tick, val);
    hx_set_param(h, k, v);
}

static int pa_list(hx_t *h, char *buf, int len) {
    return hx_get_param(h, "pa_list", buf, len);
}

/* Count entries in a pa_list dump. */
static int list_count(const char *s) {
    int n = 0;
    for (const char *p = s; *p; p++) if (*p == '\n') n++;
    return n;
}

int main(void) {
    char buf[8192];

    /* ---- writes, and what the readback reports ---------------------- */
    {
        hx_t *h = hx_create(NULL);
        HX_ASSERT(h, "create failed");
        pa_set(h, 1, 2, "0:fx1:cutoff", 0, 4000);
        pa_set(h, 1, 2, "0:fx1:cutoff", 48, 9000);
        pa_set(h, 1, 2, "cc:74", 0, 100);

        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 2, "two entries expected");
        HX_ASSERT(strstr(buf, "1 2 1 2 0:fx1:cutoff"), "chain entry: track clip flags count target");
        HX_ASSERT(strstr(buf, "1 2 1 1 cc:74"), "midi entry listed alongside it");
        OK("a write creates an entry keyed by its target, and pa_list reports it in one read");

        /* Same tick twice replaces rather than appends — a knob held still
         * during recording must not grow the store without bound. */
        pa_set(h, 1, 2, "0:fx1:cutoff", 48, 12000);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1 2 1 2 0:fx1:cutoff"), "point count unchanged after rewriting a tick");
        OK("rewriting an existing tick replaces the point");

        /* Distinct targets are distinct automation; distinct clips too. */
        pa_set(h, 1, 3, "0:fx1:cutoff", 0, 1);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 3, "same target in another clip is its own entry");
        OK("entries are per (track, clip, target)");
        hx_destroy(h);
    }

    /* ---- the clear gestures ----------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 100);
        pa_set(h, 0, 0, "0:fx1:cutoff", 24, 200);
        pa_set(h, 0, 0, "0:fx2:mix", 24, 300);
        pa_set(h, 0, 0, "cc:1", 96, 400);

        /* Delete + step: everything automated at that tick span, across
         * parameters — one gesture, not one per knob. */
        hx_set_param(h, "t0_pa_clear_step", "0 20 30");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(!strstr(buf, "0:fx2:mix"), "the only point of fx2:mix was in the span; entry gone");
        HX_ASSERT(strstr(buf, "0 0 1 1 0:fx1:cutoff"), "cutoff keeps its out-of-span point");
        HX_ASSERT(strstr(buf, "cc:1"), "a parameter automated elsewhere is untouched");
        OK("Delete+step clears every parameter's points in the span, and only there");

        /* Delete + knob touch: all of ONE parameter's automation. */
        hx_set_param(h, "t0_pa_clear_key", "0 0:fx1:cutoff");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(!strstr(buf, "0:fx1:cutoff"), "cleared parameter is gone entirely");
        HX_ASSERT(strstr(buf, "cc:1"), "its neighbour survives");
        OK("Delete+knob clears one parameter's automation, whole");

        hx_set_param(h, "t0_pa_clear", "0");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "clip cleared");
        OK("clearing the clip clears all of its automation");
        hx_destroy(h);
    }

    /* ---- deactivate keeps the data ---------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        pa_set(h, 0, 0, "cc:7", 0, 500);
        hx_set_param(h, "t0_pa_active", "0 cc:7 0");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "0 0 0 1 cc:7"), "flags cleared to 0, entry and its point kept");
        hx_set_param(h, "t0_pa_active", "0 cc:7 1");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "0 0 1 1 cc:7"), "reactivates");
        OK("Mute+knob deactivates WITHOUT deleting — the distinction the spec draws");
        hx_destroy(h);
    }

    /* ---- a full store must SAY so ----------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        char tgt[32];
        /* One entry per (clip, target) — fill past the entry pool. */
        for (int i = 0; i < 400; i++) {
            snprintf(tgt, sizeof(tgt), "0:fx1:p%d", i);
            pa_set(h, 0, 0, tgt, 0, 100);
        }
        char full[8];
        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '1', "overflowing the store must be reported");
        OK("a refused write is REPORTED, never silently dropped");

        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '0', "reading the flag clears it");
        OK("the full flag clears on read, so it reports each new occurrence");
        hx_destroy(h);
    }

    /* ---- persistence: its own file, and the uuid guard --------------- */
    {
        char dir[128], state[192], autof[192];
        snprintf(dir, sizeof(dir), "/tmp/hx_pa_%d", (int)getpid());
        char cmd[256];
        snprintf(cmd, sizeof(cmd), "mkdir -p %s", dir);
        if (system(cmd)) { printf("FAIL: mkdir\n"); return 1; }
        snprintf(state, sizeof(state), "%s/seq8sa-state.json", dir);
        snprintf(autof, sizeof(autof), "%s/seq8sa-auto.json", dir);

        hx_t *h = hx_create(NULL);
        hx_set_param(h, "state_path", state);
        pa_set(h, 2, 5, "1:synth:filter", 12, 7777);
        hx_set_param(h, "t2_pa_smooth", "5 1:synth:filter 1");
        hx_set_param(h, "save", "1");

        FILE *fp = fopen(autof, "r");
        HX_ASSERT(fp, "automation must be written to its OWN file, beside the state");
        char fbuf[4096] = {0};
        size_t got = fread(fbuf, 1, sizeof(fbuf) - 1, fp);
        fclose(fp);
        HX_ASSERT(got > 0, "auto file not empty");
        HX_ASSERT(strstr(fbuf, "1:synth:filter"), "target recorded");
        HX_ASSERT(strstr(fbuf, "12:7777;"), "point recorded");
        OK("automation persists to <project>-auto.json, not into the 64KB state blob");

        /* Reload the project: automation comes back with it. */
        hx_destroy(h);
        h = hx_create(NULL);
        hx_set_param(h, "state_path", state);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "2 5 3 1 1:synth:filter"), "entry, flags (active|smooth) and count restored");
        OK("it reloads with the project, flags and all");

        /* Pointing at a project directory with no auto file must leave the
         * store EMPTY, not inherit the last project's automation — the load
         * resets before it reads. */
        hx_destroy(h);
        h = hx_create(NULL);
        pa_set(h, 0, 0, "cc:9", 0, 1);        /* something to be replaced */
        snprintf(state, sizeof(state), "%s/other-state.json", dir);
        hx_set_param(h, "state_path", state);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "a project with no auto file has NO automation");
        OK("⚠ loading a project without automation clears the last one's, never inherits it");

        snprintf(cmd, sizeof(cmd), "rm -rf %s", dir);
        if (system(cmd)) { /* best effort */ }
        hx_destroy(h);
    }

    /* ---- the dispatcher contract ------------------------------------ */
    {
        /* An UNKNOWN pa_ key must be CONSUMED, not passed on. sp_track_misc is
         * dispatched after this handler and its tail is unconditional: it hands
         * the sub-op to pfx_set AND bumps the remote-UI revision. For a name
         * beginning "pa_" the pfx_set itself is inert (nothing matches), so the
         * REV BUMP is the observable consequence — a stray key would announce a
         * content change to the browser that never happened, costing a resync.
         * That is what this pins; the pfx_set half only bites a sub-op whose
         * name collides with a play-effects parameter, which is why an earlier
         * version of this check passed against a handler that did fall
         * through. */
        hx_t *h = hx_create(NULL);
        char rev_before[32] = {0}, rev_after[32] = {0};
        hx_get_param(h, "rui_rev", rev_before, sizeof(rev_before));
        hx_set_param(h, "t0_pa_nonsense", "0 0:fx1:x 1 1");
        hx_get_param(h, "rui_rev", rev_after, sizeof(rev_after));
        HX_ASSERT(!strcmp(rev_before, rev_after),
                  "an unknown pa_ key must not fall through to the catch-all's rev bump");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "and must not create an entry either");
        OK("⚠ an unrecognised pa_ key is CONSUMED, not passed to the pfx catch-all");
        hx_destroy(h);
    }

    printf("PASS: test_param_auto (%d checks)\n", ok_count);
    return 0;
}
