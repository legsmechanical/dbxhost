/*
 * Host-side unit test for shadow_param_lane_policy.h — WHICH parameter SETs
 * may take the fire-and-forget lane instead of the mailbox.
 *
 * ⚠ THE BUG THIS PINS is the 09-05 one, in its general form. The retired
 * param-write-ring branch routed writes to a second wire whose applier had no
 * `overtake_dsp:load` case: a module's DSP never loaded and a fresh project
 * came up dead. The lane closes that by applying every record through THE one
 * dispatcher — but the other half of the fix is this classifier, which keeps
 * the lifecycle keys off the fire-and-forget wire entirely, because their
 * caller reads a response the lane throws away.
 *
 * The CONTROL that makes the load/unload case meaningful is
 * `overtake_dsp:t0_route` — an ordinary overtake DSP parameter. If the
 * classifier excluded the whole `overtake_dsp:` prefix it would still pass
 * every load/unload assertion here while silently sending the writes the lane
 * exists for back to the mailbox.
 */
#include <stdio.h>
#include <string.h>
#include "shadow_param_lane_policy.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

int main(void) {
    /* --- the exclusions, one assertion each ------------------------------ */
    OK(spl_key_eligible("overtake_dsp:load") == 0,   "overtake_dsp:load is EXCLUDED (lifecycle, dlopen + instantiate)");
    OK(spl_key_eligible("overtake_dsp:unload") == 0, "overtake_dsp:unload is EXCLUDED (lifecycle, destroy)");
    OK(spl_key_eligible("jack:") == 0,               "a bare jack: key is EXCLUDED");
    OK(spl_key_eligible("jack:display") == 0,        "jack:display is EXCLUDED (takes the display, caller reads the result)");
    OK(spl_key_eligible("jack:restore_leds") == 0,   "jack:restore_leds is EXCLUDED");
    OK(spl_key_eligible("suspend_overtake") == 0,    "suspend_overtake is EXCLUDED (hands over the surface)");
    OK(spl_key_eligible("passthrough") == 0,         "passthrough is EXCLUDED (re-routes audio for the session)");
    OK(spl_key_eligible("state") == 0,               "the bare `state` blob is EXCLUDED");
    OK(spl_key_eligible("synth:state") == 0,         "a `<prefix>:state` blob is EXCLUDED");
    OK(spl_key_eligible("overtake_dsp:state") == 0,  "overtake_dsp:state is EXCLUDED as a blob, not as a prefix");
    OK(spl_key_eligible(NULL) == 0,                  "NULL is not eligible");
    OK(spl_key_eligible("") == 0,                    "the empty key is not eligible");

    /* --- THE CONTROL: the prefix must not be excluded wholesale ---------- */
    OK(spl_key_eligible("overtake_dsp:t0_route") == 1,
       "CONTROL: overtake_dsp:t0_route IS eligible — the exclusion is the two sub-keys, not the prefix");
    OK(spl_key_eligible("overtake_dsp:loaded") == 1,
       "CONTROL: overtake_dsp:loaded IS eligible — `load` is an exact match, not a prefix");
    OK(spl_key_eligible("overtake_dsp:unloader") == 1,
       "CONTROL: overtake_dsp:unloader IS eligible for the same reason");

    /* --- the ordinary traffic the lane exists to carry -------------------- */
    OK(spl_key_eligible("synth:cutoff") == 1,        "synth:cutoff is eligible");
    OK(spl_key_eligible("chain:") == 1,              "the chain: bulk marker is eligible");
    OK(spl_key_eligible("master_fx:fx1:mix") == 1,   "master_fx:fx1:mix is eligible");
    OK(spl_key_eligible("pa_live") == 1,             "pa_live is eligible");
    OK(spl_key_eligible("send_fx:a:return_level") == 1, "send_fx:a:return_level is eligible");
    OK(spl_key_eligible("move_fx:3:volume") == 1,    "move_fx:3:volume is eligible");
    /* Loaders are EXCLUDED: each dlopen()s or reads a capture inside the
     * dispatcher, and the mailbox paced them at one per frame; the lane would
     * run several per callback (adversarial review, 2026-09-14). */
    OK(spl_key_eligible("fx1:module") == 0,          "fx1:module is EXCLUDED (dlopen on the SPI thread - keep the mailbox's one-per-frame pacing)");
    OK(spl_key_eligible("synth:module") == 0,        "synth:module is EXCLUDED");
    OK(spl_key_eligible("fx4:module") == 0,          "fx4:module is EXCLUDED (this fork's 3rd/4th FX blocks too)");
    OK(spl_key_eligible("midi_fx2:module") == 0,     "midi_fx2:module is EXCLUDED");
    OK(spl_key_eligible("move_fx:2:fx1:module") == 0, "a Move-bus insert's :module is EXCLUDED (suffix rule, any depth)");
    OK(spl_key_eligible("load_patch") == 0,          "load_patch is EXCLUDED (capture read)");
    OK(spl_key_eligible("load_file") == 0,           "load_file is EXCLUDED");
    OK(spl_key_eligible("patch") == 0,               "patch is EXCLUDED");
    OK(spl_key_eligible("synth:load_patch") == 0,    "a component-scoped :load_patch is EXCLUDED");
    OK(spl_key_eligible("synth:module_x") == 1,      "CONTROL: `module_x` does not end in `:module`");
    OK(spl_key_eligible("modules") == 1,             "CONTROL: a bare `modules` is an ordinary key");
    OK(spl_key_eligible("synth:patchy") == 1,        "CONTROL: `:patchy` is not `:patch`");
    OK(spl_key_eligible("dispatch") == 1,            "CONTROL: `dispatch` ends in `patch` but not `:patch`");

    /* --- near misses that must NOT be caught by the suffix rule ---------- */
    OK(spl_key_eligible("stateful") == 1,            "`stateful` is not `state`");
    OK(spl_key_eligible("estate") == 1,              "`estate` does not end in `:state`");
    OK(spl_key_eligible("jackal") == 1,              "`jackal` is not the jack: namespace");
    OK(spl_key_eligible("suspend_overtake_x") == 1,  "suspend_overtake_x is a different key");

    printf("PASS: test_param_lane_policy (%d checks)\n", checks);
    return 0;
}
