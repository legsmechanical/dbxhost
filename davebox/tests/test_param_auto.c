/* tests/test_param_auto.c — the per-parameter automation store (Front 3, P1).
 *
 * Covers the store's contract: writes land, the clear gestures reach exactly
 * what they should, a full store REPORTS rather than dropping silently, and
 * automation persists as a section of the project's one state file — surviving
 * a reload, and absent when the project has none. (The curve model is
 * test_param_auto_eval.c.) */
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

    /* ---- every limit must SAY so, not drop silently ------------------ */
    {
        char full[8];
        /* The TARGET table (distinct parameters project-wide) fills first at
         * PA_MAX_TARGETS — which is why an earlier version of this test, that
         * only wrote distinct targets, never reached the other two limits. */
        hx_t *h = hx_create(NULL);
        char tgt[32];
        for (int i = 0; i < PA_MAX_TARGETS + 8; i++) {
            snprintf(tgt, sizeof(tgt), "0:fx1:p%d", i);
            pa_set(h, 0, 0, tgt, 0, 100);
        }
        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '1', "running out of distinct targets must be reported");
        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '0', "reading the flag clears it");
        OK("the target table reports when it is full, and the flag clears on read");
        hx_destroy(h);

        /* The ENTRY pool: ONE target per track automated in every clip, so
         * the target table stays small and the pool is what runs out. (One
         * target across tracks is not allowed — see ownership below.) */
        h = hx_create(NULL);
        for (int t = 0; t < NUM_TRACKS; t++)
            for (int c = 0; c < NUM_CLIPS; c++) {
                snprintf(tgt, sizeof(tgt), "%d:fx1:cutoff", t);
                pa_set(h, t, c, tgt, 0, 100);              /* 8 x 16 = 128 entries */
            }
        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '0', "128 entries must FIT — the pool is 160");
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == NUM_TRACKS * NUM_CLIPS, "all of them present");
        OK("one parameter automated in every clip of every track fits");
        hx_destroy(h);

        /* OWNERSHIP: a target belongs to the first track that automates it.
         * Two tracks driving one parameter would fight every tick and spend
         * the push budget doing it. The store refuses and names the owner. */
        h = hx_create(NULL);
        pa_set(h, 2, 0, "1:fx1:cutoff", 0, 100);
        hx_get_param(h, "pa_owner 1:fx1:cutoff", buf, sizeof(buf));
        HX_ASSERT(!strcmp(buf, "2"), "pa_owner names the track that automated it first");
        hx_get_param(h, "pa_owner 1:fx1:nothing", buf, sizeof(buf));
        HX_ASSERT(!strcmp(buf, "-1"), "an unautomated target has no owner");
        pa_set(h, 5, 3, "1:fx1:cutoff", 0, 200);            /* another track tries */
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 1 && strstr(buf, "2 0 "), "the second track's write is REFUSED");
        hx_get_param(h, "pa_owner_conflict", buf, sizeof(buf));
        HX_ASSERT(!strcmp(buf, "3"), "and reported as owner+1 (track 2 -> 3)");
        hx_get_param(h, "pa_owner_conflict", buf, sizeof(buf));
        HX_ASSERT(!strcmp(buf, "0"), "the report clears on read");
        pa_set(h, 2, 7, "1:fx1:cutoff", 0, 300);            /* the owner, another clip */
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 2, "the owner may automate it in any clip");
        OK("⚠ one target, one track: a second track's write is refused and the owner named");
        hx_destroy(h);

        /* The POINT cap within one entry. */
        h = hx_create(NULL);
        for (int i = 0; i < PA_ENTRY_POINTS + 16; i++)
            pa_set(h, 0, 0, "cc:74", i, 1000 + i);
        hx_get_param(h, "pa_store_full", full, sizeof(full));
        HX_ASSERT(full[0] == '1', "running past an entry's point cap must be reported");
        OK("a recording that outgrows one parameter's point cap is REPORTED");
        hx_destroy(h);
    }

    /* ---- a target that would break the file is refused at the door ---- */
    {
        /* A target is written verbatim into a JSON string. One containing a
         * quote or a brace truncates the object, and the parse of the WHOLE
         * section then fails — losing every automation in the project, not just
         * this entry. Demonstrated before the fix: two such entries stored fine
         * and the reload came back completely empty. */
        hx_t *h = hx_create(NULL);
        pa_set(h, 0, 0, "0:fx1:cu}t", 0, 100);
        pa_set(h, 0, 0, "a\"b", 0, 100);
        pa_set(h, 0, 0, "back\\slash", 0, 100);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "a target that cannot survive the file is not stored");
        pa_set(h, 0, 0, "0:fx1:cutoff", 0, 100);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 1, "an ordinary target still works");
        /* A space is NOT in that class: the key format is space-separated, so
         * the parser ends the target there and "has space" arrives as "has" —
         * a legal target, stored as one. */
        pa_set(h, 0, 0, "has space", 0, 100);
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 2 && strstr(buf, " has 0 0\n"), "a space ends the target, it does not poison it (loop_len and the rate code follow it)");
        OK("⚠ a target carrying JSON metacharacters is REFUSED, not stored and later lost");
        hx_destroy(h);
    }

    /* ---- an automation edit is a STATE edit -------------------------- */
    {
        /* Automation lives in the state file, so a write must mark the state
         * dirty or the deferred save never runs and the work survives only a
         * clean suspend — lost on a crash or a kill. */
        hx_t *h = hx_create(NULL);
        char dirty[8], sink[4096];
        hx_get_param(h, "state_full", sink, sizeof(sink));      /* consume dirty */
        hx_get_param(h, "state_dirty", dirty, sizeof(dirty));
        HX_ASSERT(dirty[0] == '0', "clean to start");
        pa_set(h, 0, 0, "cc:74", 0, 5000);
        hx_get_param(h, "state_dirty", dirty, sizeof(dirty));
        HX_ASSERT(dirty[0] == '1', "an automation write must dirty the state");
        OK("⚠ an automation edit marks the state dirty — otherwise it never autosaves");
        hx_destroy(h);
    }

    /* ---- the project lifecycle --------------------------------------- */
    {
        char dir[128], state[192], cmd[256];
        snprintf(dir, sizeof(dir), "/tmp/hx_pl_%d", (int)getpid());
        snprintf(cmd, sizeof(cmd), "mkdir -p %s", dir);
        if (system(cmd)) { printf("FAIL: mkdir\n"); return 1; }
        snprintf(state, sizeof(state), "%s/seq8sa-state.json", dir);

        /* Clear Session writes the {"v":0} sentinel. Automation must go with
         * the notes — it used to survive, because it lived in a second file
         * that the sentinel knew nothing about. */
        FILE *f = fopen(state, "w"); HX_ASSERT(f, "fixture"); fprintf(f, "{\"v\":0}"); fclose(f);
        hx_t *h = hx_create(NULL);
        pa_set(h, 0, 0, "cc:74", 0, 5000);
        { seq8_instance_t *in = (seq8_instance_t *)h->inst;
          strncpy(in->state_path, state, sizeof(in->state_path) - 1);
          seq8_load_state(in); }
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "Clear Session clears automation too");
        OK("⚠ Clear Session takes the automation with it");
        hx_destroy(h);

        /* An incompatible state version: the notes are not loaded, so the
         * automation must not be either. */
        f = fopen(state, "w"); HX_ASSERT(f, "fixture");
        fprintf(f, "{\"v\":30,\"pa\":[{\"t\":0,\"c\":0,\"k\":\"cc:9\",\"f\":1,\"p\":\"0:99;\"}]}");
        fclose(f);
        h = hx_create(NULL);
        { seq8_instance_t *in = (seq8_instance_t *)h->inst;
          strncpy(in->state_path, state, sizeof(in->state_path) - 1);
          seq8_load_state(in); }
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "no automation from a state we refused to load");
        OK("⚠ an incompatible project brings no automation with it");
        hx_destroy(h);

        /* An unknown SECTION version is left alone rather than parsed by this
         * version's rules, which would produce plausible garbage. */
        f = fopen(state, "w"); HX_ASSERT(f, "fixture");
        fprintf(f, "{\"v\":36,\"pav\":99,\"pa\":[{\"t\":0,\"c\":0,\"k\":\"cc:9\",\"f\":1,\"p\":\"0:99;\"}]}");
        fclose(f);
        h = hx_create(NULL);
        { seq8_instance_t *in = (seq8_instance_t *)h->inst;
          strncpy(in->state_path, state, sizeof(in->state_path) - 1);
          seq8_load_state(in); }
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "a newer automation format is skipped, not misread");
        OK("an unknown automation section version is skipped rather than misparsed");
        hx_destroy(h);

        snprintf(cmd, sizeof(cmd), "rm -rf %s", dir);
        if (system(cmd)) { /* best effort */ }
    }

    /* ---- persistence: a section of the ONE project file -------------- */
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

        FILE *fp = fopen(state, "r");
        HX_ASSERT(fp, "state file written");
        char fbuf[65536] = {0};
        size_t got = fread(fbuf, 1, sizeof(fbuf) - 1, fp);
        fclose(fp);
        HX_ASSERT(got > 0, "state file not empty");
        HX_ASSERT(strstr(fbuf, "1:synth:filter"), "automation is IN the project state file");
        HX_ASSERT(strstr(fbuf, "12:7777;"), "point recorded");
        HX_ASSERT(!fopen(autof, "r"), "and NOT in a second file beside it");
        OK("automation is a section of the one project file, not a sidecar");

        /* Reload: it comes back with the project, in one load. */
        hx_destroy(h);
        h = hx_create(NULL);
        {   /* Load the way test_state_roundtrip does: point the instance at the
             * file and load. (The state_load KEY rebuilds the path from a uuid
             * under the device's own root, which a test cannot write to.) */
            seq8_instance_t *in2 = (seq8_instance_t *)h->inst;
            strncpy(in2->state_path, state, sizeof(in2->state_path) - 1);
            seq8_load_state(in2);
        }
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "2 5 3 1 1:synth:filter"), "entry, flags (active|smooth) and count restored");
        OK("it reloads with the project, flags and all");

        /* A project with no automation must leave the store EMPTY rather than
         * inheriting the previous project's. */
        hx_destroy(h);
        h = hx_create(NULL);
        pa_set(h, 0, 0, "cc:9", 0, 1);
        char plain[192];
        snprintf(plain, sizeof(plain), "%s/other-state.json", dir);
        FILE *pf = fopen(plain, "w");
        HX_ASSERT(pf, "fixture");
        fprintf(pf, "{\"v\":36,\"playing\":0}");
        fclose(pf);
        {   seq8_instance_t *in3 = (seq8_instance_t *)h->inst;
            strncpy(in3->state_path, plain, sizeof(in3->state_path) - 1);
            seq8_load_state(in3);
        }
        pa_list(h, buf, sizeof(buf));
        HX_ASSERT(list_count(buf) == 0, "a project with no automation has NONE");
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
