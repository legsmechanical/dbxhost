/*
 * shadow_param_lane_policy.h — WHICH parameter SETs may ride the lane.
 *
 * The lane (host/shadow_param_lane.h) is fire-and-forget: the producer pushes
 * bytes and returns 1 immediately, and the shim applies the record at the top
 * of some later SPI frame. Everything the caller used to learn from the
 * mailbox round-trip — did it land, what did it answer, is the DSP now loaded
 * — is gone. That is fine for a knob value and wrong for a lifecycle command,
 * so the classifier below is the one place that decides.
 *
 * Pure: no SHM, no globals, no allocation. Unit-tested standalone by
 * tests/host/test_param_lane_policy.c.
 *
 * ⚠ The exclusions are NOT a performance judgement. Each one is a key whose
 * SET has a consequence the caller reads, or a payload the lane cannot carry.
 * A key that is merely "important" still belongs on the lane — importance is
 * not the criterion, an observed RESPONSE is.
 */
#ifndef SHADOW_PARAM_LANE_POLICY_H
#define SHADOW_PARAM_LANE_POLICY_H

#include <string.h>

/* spl_key_eligible — 1 if a SET of `key` may be pushed to the lane, 0 if it
 * must stay on the mailbox (or the pending queue behind it).
 *
 * Excluded, and why:
 *
 *   "overtake_dsp:load"    LIFECYCLE. The SET dlopen()s a module's DSP and
 *   "overtake_dsp:unload"  instantiates/destroys it, on the SPI thread. The
 *                          caller's very next act is normally a get_param
 *                          against the instance it just asked for, and on the
 *                          lane that read can be served a frame BEFORE the
 *                          load runs — the module then reads as absent. This
 *                          is the exact shape of the bug the retired
 *                          param-write-ring branch shipped: its apply function
 *                          had no `overtake_dsp:load` case at all, a module's
 *                          DSP never loaded, and a fresh project came up dead.
 *                          Keeping the pair off the lane means the ONE
 *                          dispatcher stays the only thing that runs them, on
 *                          the wire that reports back.
 *                          ⚠ Only these two sub-keys. `overtake_dsp:<param>`
 *                          is an ordinary DSP parameter and IS eligible —
 *                          those are the writes the lane exists for.
 *
 *   "jack:" (any)          SIDE EFFECTS WITH A RESPONSE. The shim's jack:
 *                          specials restore LEDs, take over the display and
 *                          reconfigure routing, and the caller reads the
 *                          result_len/error the mailbox publishes.
 *
 *   "suspend_overtake"     LIFECYCLE. Hands the surface between the overtake
 *                          module and the host; a caller that continues
 *                          drawing before it has taken effect draws onto a
 *                          surface it no longer owns.
 *
 *   "passthrough"          LIFECYCLE, same reasoning: it re-routes audio for
 *                          the whole session, and it is set exactly at the
 *                          moments where ordering against the next request
 *                          is the entire point.
 *
 *   "state", "<x>:state"   BLOBS. A whole serialized instrument, routinely far
 *                          past SHADOW_PARAM_LANE_VALUE_MAX (4095) — the push
 *                          would refuse anyway, so this is a fast reject
 *                          rather than a new rule — and a state restore is a
 *                          thing the caller waits on before reading back.
 *
 *   "<comp>:module", "load_file", "load_patch", "patch"
 *                          LOADERS. Each dlopen()s a plugin or reads a capture
 *                          file inside shadow_param_apply_set — on the SPI
 *                          thread, as the mailbox always did, but the mailbox
 *                          paced them at ONE per frame. The lane drains up to
 *                          256 records a frame, so a preset or snapshot recall
 *                          could run several loads back to back in one ~900 µs
 *                          callback (adversarial review, 2026-09-14). They keep
 *                          the mailbox's pacing by staying on it; the writes
 *                          behind them queue in order (the producer gate also
 *                          requires the mailbox idle).
 */
static inline int spl_key_eligible(const char *key)
{
    if (key == NULL || key[0] == '\0') return 0;

    /* Loaders: any "<...>:module" (synth/fxN/midi_fxN/master_fx/send_fx/
     * move_fx alike — the suffix is the contract), and the capture/patch
     * loaders in every spelling the dispatcher accepts. */
    {
        size_t n = strlen(key);
        if (n >= 7 && strcmp(key + n - 7, ":module") == 0) return 0;
        if (strcmp(key, "load_file") == 0 || strcmp(key, "load_patch") == 0 ||
            strcmp(key, "patch") == 0) return 0;
        if ((n >= 10 && strcmp(key + n - 10, ":load_file") == 0) ||
            (n >= 11 && strcmp(key + n - 11, ":load_patch") == 0) ||
            (n >= 6 && strcmp(key + n - 6, ":patch") == 0)) return 0;
    }

    /* Serialized blobs: "state" and any "<prefix>:state". Checked FIRST, so
     * that `overtake_dsp:state` — a whole serialized instrument — is caught
     * here rather than falling into the "ordinary overtake parameter" arm
     * below on the strength of its prefix. */
    if (strcmp(key, "state") == 0) return 0;
    {
        size_t n = strlen(key);
        if (n >= 6 && strcmp(key + n - 6, ":state") == 0) return 0;
    }

    /* Lifecycle: overtake DSP load/unload. Sub-key match, not prefix — every
     * other overtake_dsp: key is an ordinary parameter and stays eligible. */
    if (strncmp(key, "overtake_dsp:", 13) == 0) {
        const char *sub = key + 13;
        if (strcmp(sub, "load") == 0 || strcmp(sub, "unload") == 0) return 0;
        return 1;
    }

    /* Shim specials whose SET has a side effect the caller reads back. */
    if (strncmp(key, "jack:", 5) == 0) return 0;
    if (strcmp(key, "suspend_overtake") == 0) return 0;
    if (strcmp(key, "passthrough") == 0) return 0;

    return 1;
}

#endif /* SHADOW_PARAM_LANE_POLICY_H */
