/* tests/test_param_auto_host_write.c — a step's parameter lock reaches the
 * instrument BEFORE that step's note.
 *
 * THE BUG THIS PINS (tester report, 2026-10-05: "the knob animation activating
 * at the right step but the real automation actually occurs one step late"):
 * the engine worked a lock out on time but could not write a chain parameter
 * itself — it staged the value for JS, which wrote it a UI tick and an audio
 * frame later, after the note had been sent. Anything a sound latches when it
 * is triggered was heard on the NEXT hit. And inside the engine the automation
 * was evaluated after the tick's notes anyway.
 *
 * Now: a target JS has RESOLVED (pa_resolve) is written by the engine through
 * the host extension, in the render call, ahead of the note. The stub host
 * records parameter writes in the same ordered list as MIDI, so the order is
 * what is asserted. Everything unresolved still takes the ring — also pinned. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

static int find_set(const char *key, const char *value, int from) {
    for (int i = from; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_PARAM_SET && !strcmp(e->key, key) && (!value || !strcmp(e->value, value))) return i;
    }
    return -1;
}
static int find_note_on(int pitch, int from) {
    for (int i = from; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == pitch && e->bytes[3] > 0) return i;
    }
    return -1;
}
static int count_sets(void) { return hx_stub_count_kind(HX_PARAM_SET); }

/* t1: a note on step 1 (60) and step 5 (64); cutoff locked low on step 1 and
 * high on step 5. */
static hx_t *rig(int resolve) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_4_toggle", "64 100");
    hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 23 0");
    hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 96 119 16383");
    if (resolve) hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    return h;
}

int main(void) {
    char buf[4096];

    /* ---- the order: lock first, then its note */
    {
        hx_t *h = rig(1);
        hx_render(h, 400);                               /* well past step 5 */
        int n64 = find_note_on(64, 0);
        HX_ASSERT(n64 >= 0, "rig: the step-5 note never played");
        int s_hi = find_set("synth:cutoff", "1", 0);
        HX_ASSERT(s_hi >= 0, "the engine never wrote the step-5 lock through the host");
        if (!(s_hi < n64)) {
            fprintf(stderr, "FAIL: the step-5 lock (event %d) was written AFTER its note (event %d)\n", s_hi, n64);
            return 1;
        }
        int n60 = find_note_on(60, 0), s_lo = find_set("synth:cutoff", "0", 0);
        HX_ASSERT(n60 >= 0 && s_lo >= 0 && s_lo < n60, "the step-1 lock did not precede the step-1 note");
        HX_ASSERT(hx_stub_event(s_hi)->slot == 1, "the lock was written to the wrong slot");
        /* ...and not ALSO staged for JS: one writer per value. */
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '\0', "a value the engine wrote itself was also staged for JS");
        hx_get_param(h, "pa_host_writes", buf, sizeof(buf));
        HX_ASSERT(atoi(buf) >= 2, "pa_host_writes did not count the direct writes");
        hx_destroy(h);
        printf("  ok   — a resolved lock is written before its step's note, and only once\n");
    }

    /* ---- control: unresolved, nothing is written directly; JS gets it */
    {
        hx_t *h = rig(0);
        hx_render(h, 400);
        HX_ASSERT(count_sets() == 0, "an UNRESOLVED target was written directly — the engine guessed");
        hx_get_param(h, "pa_ring_any", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '1', "control: pa_ring_any says nothing is waiting for JS");
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:synth:cutoff ") != NULL, "an unresolved lock was not staged for JS");
        hx_get_param(h, "pa_ring_any", buf, sizeof(buf));
        HX_ASSERT(buf[0] == '0', "pa_ring_any still set after the drain");
        hx_destroy(h);
        printf("  ok   — an unresolved target still goes to JS\n");
    }

    /* ---- pa_unresolve hands the slot back to JS; a refusal falls back too */
    {
        hx_t *h = rig(1);
        hx_set_param(h, "pa_unresolve", "3");            /* another slot: no effect */
        hx_render(h, 150);
        HX_ASSERT(count_sets() > 0, "control: unresolving ANOTHER slot stopped the direct writes");
        hx_set_param(h, "pa_unresolve", "1");
        hx_clear_capture(h);
        hx_render(h, 800);
        HX_ASSERT(count_sets() == 0, "direct writes continued after pa_unresolve for that slot");
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:synth:cutoff ") != NULL, "after pa_unresolve the lock was not staged for JS");
        hx_destroy(h);

        h = rig(1);
        hx_stub_ext_refuse(1);
        hx_render(h, 400);
        hx_get_param(h, "pa_pending", buf, sizeof(buf));
        HX_ASSERT(strstr(buf, "1:synth:cutoff ") != NULL, "a write the host REFUSED was lost instead of staged for JS");
        hx_stub_ext_refuse(0);
        hx_destroy(h);
        printf("  ok   — pa_unresolve and a refused write both fall back to JS\n");
    }

    /* ---- a hand on the knob still wins */
    {
        hx_t *h = rig(1);
        hx_set_param(h, "t1_pa_hold", "1:synth:cutoff");
        hx_render(h, 400);
        HX_ASSERT(count_sets() == 0, "automation wrote under a held knob");
        hx_destroy(h);
        printf("  ok   — a held parameter is not written\n");
    }

    /* ---- stopping gives the parameter back through the same door */
    {
        hx_t *h = rig(1);
        hx_set_param(h, "t1_pa_rest", "0 1:synth:cutoff 8192");
        hx_render(h, 150);
        hx_clear_capture(h);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 20);
        HX_ASSERT(find_set("synth:cutoff", "0.5", 0) >= 0, "the resting value was not written back on stop");
        hx_destroy(h);
        printf("  ok   — Stop writes the resting value back directly\n");
    }

    /* ---- the per-block cap: the overflow is staged, never dropped */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 23 0");
        hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
        int id = pa_target_lookup(I, "1:synth:cutoff");
        HX_ASSERT(id >= 0, "rig: target not interned");
        hx_clear_capture(h);
        I->pa_host_writes = 0;
        for (int i = 0; i < PA_HOST_WRITES_PER_BLOCK + 5; i++) pa_emit_chain(I, (uint16_t)id, (uint16_t)(i * 100));
        HX_ASSERT(count_sets() == PA_HOST_WRITES_PER_BLOCK, "the per-block cap on direct writes is not applied");
        int staged = 0; pa_change_t ch;
        while (pa_ring_peek(I, &ch)) { staged++; pa_ring_pop(I); }
        HX_ASSERT(staged == 5, "values past the cap were not staged for JS");
        hx_destroy(h);
        printf("  ok   — past the per-block cap, values are staged, not dropped\n");
    }

    /* ---- the value string is the one JS's wireValue sends */
    {
        struct { int kind; double mn, mx, st; int val; const char *want; } T[] = {
            { PA_RES_FLOAT, 0, 1, 0.01,       0, "0"     },
            { PA_RES_FLOAT, 0, 1, 0.01,   16383, "1"     },
            { PA_RES_FLOAT, 0, 1, 0.01,    8192, "0.5"   },
            { PA_RES_FLOAT, 0, 1, 0.01,    6062, "0.37"  },
            { PA_RES_FLOAT, 0, 4, 0.01,    4096, "1"     },   /* a level at unity */
            { PA_RES_FLOAT, -1, 1, 0.01,      0, "-1"    },
            { PA_RES_FLOAT, -1, 1, 0.01,   4096, "-0.5"  },
            { PA_RES_FLOAT, 20, 20000, 1,  8192, "10011" },
            { PA_RES_FLOAT, 0, 1, 0.0001,  1234, "0.0753" }, /* a bus level: four decimals */
            { PA_RES_FLOAT, 0, 1, 0,       8192, "0.5"   },   /* no step declared: 0.01 */
            { PA_RES_INT,  -48, 48, 1,        0, "-48"   },
            { PA_RES_INT,  -48, 48, 1,    16383, "48"    },
            { PA_RES_INT,  -48, 48, 1,     8192, "0"     },
            { PA_RES_INT,    0, 127, 1,    8127, "63"    },
            { PA_RES_ENUM,   0, 3, 0,         0, "0"     },
            { PA_RES_ENUM,   0, 3, 0,     16383, "3"     },
            { PA_RES_ENUM,   0, 3, 0,      8192, "2"     },   /* 1.5003 rounds up */
            { PA_RES_ENUM,   0, 3, 0,      2730, "0"     },
            { PA_RES_ENUM,   0, 3, 0,      2731, "1"     },
        };
        for (unsigned i = 0; i < sizeof(T) / sizeof(T[0]); i++) {
            pa_res_t r; memset(&r, 0, sizeof(r));
            r.kind = (uint8_t)T[i].kind; r.min = T[i].mn; r.max = T[i].mx; r.step = T[i].st;
            char out[32];
            int n = pa_format_value(&r, (uint16_t)T[i].val, out, (int)sizeof(out));
            if (!n || strcmp(out, T[i].want)) {
                fprintf(stderr, "FAIL: kind %d [%g..%g step %g] value %d formatted \"%s\", JS sends \"%s\"\n",
                        T[i].kind, T[i].mn, T[i].mx, T[i].st, T[i].val, out, T[i].want);
                return 1;
            }
        }
        printf("  ok   — the value strings match the ones JS sends\n");
    }

    /* ---- a malformed pa_resolve resolves nothing */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 23 0");
        int id = pa_target_lookup(I, "1:synth:cutoff");
        const char *bad[] = { "", "1:synth:cutoff", "1:synth:cutoff 1 synth:cutoff", "1:synth:cutoff 1 synth:cutoff 9 0 1 0.01",
                              "1:synth:cutoff 1 synth:cutoff 0 1 0 0.01", "1:synth:cutoff x synth:cutoff 0 0 1 0.01",
                              "9:synth:nothing 1 synth:nothing 0 0 1 0.01" };
        for (unsigned i = 0; i < sizeof(bad) / sizeof(bad[0]); i++) {
            hx_set_param(h, "pa_resolve", bad[i]);
            HX_ASSERT(!I->pa_res[id].valid, "a malformed pa_resolve produced a resolution");
        }
        hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
        HX_ASSERT(I->pa_res[id].valid, "control: a well-formed pa_resolve was refused");
        hx_destroy(h);
        printf("  ok   — malformed resolutions are ignored\n");
    }

    printf("PASS: param_auto_host_write\n");
    return 0;
}
