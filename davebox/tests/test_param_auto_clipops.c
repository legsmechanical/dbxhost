/* tests/test_param_auto_clipops.c — automation travels with its clip.
 *
 * A clip's automation is part of the clip. Copy one and leave the automation
 * behind and the copy plays someone else's parameter moves; cut one and leave
 * it behind and the automation is stranded on a clip with no notes. And undo
 * must cover it, or the destructive half of an operation is the half that
 * cannot be taken back. */
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

static int has(hx_t *h, int t, int c, const char *tgt) {
    char buf[8192], want[128];
    hx_get_param(h, "pa_list", buf, sizeof(buf));
    snprintf(want, sizeof(want), "%d %d ", t, c);
    for (char *line = strtok(buf, "\n"); line; line = strtok(NULL, "\n")) {
        if (strncmp(line, want, strlen(want))) continue;
        if (strstr(line, tgt)) return 1;
    }
    return 0;
}

int main(void) {
    /* ---- copy carries it ------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c0_step_0_toggle", "60 100");
        pa_set(h, 0, 0, "0:fx1:cutoff", 24, 8000);
        hx_set_param(h, "clip_copy", "0 0 0 3");
        HX_ASSERT(has(h, 0, 3, "0:fx1:cutoff"), "the copy has the automation");
        HX_ASSERT(has(h, 0, 0, "0:fx1:cutoff"), "and the original still does");
        OK("copying a clip copies its automation");

        /* Copying ONTO a clip replaces what was there — it must not merge. */
        pa_set(h, 0, 5, "0:fx2:mix", 0, 100);
        hx_set_param(h, "clip_copy", "0 0 0 5");
        HX_ASSERT(has(h, 0, 5, "0:fx1:cutoff"), "destination took the source's automation");
        HX_ASSERT(!has(h, 0, 5, "0:fx2:mix"), "and lost its own — a copy is a replacement");
        OK("copying over a clip replaces its automation rather than merging");
        hx_destroy(h);
    }

    /* ---- cut moves it ----------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t1_c2_step_0_toggle", "60 100");
        pa_set(h, 1, 2, "1:synth:filter", 12, 4000);
        hx_set_param(h, "clip_cut", "1 2 1 7");
        HX_ASSERT(has(h, 1, 7, "1:synth:filter"), "the destination has it");
        HX_ASSERT(!has(h, 1, 2, "1:synth:filter"), "and the source no longer does");
        OK("cutting a clip moves its automation with it");
        hx_destroy(h);
    }

    /* ---- undo covers it --------------------------------------------- */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t2_c1_step_0_toggle", "60 100");
        pa_set(h, 2, 1, "2:fx1:res", 0, 1234);

        /* A cut is the case that matters: without automation in the undo
         * snapshot, undoing it would restore the notes and leave the
         * automation destroyed. */
        hx_set_param(h, "clip_cut", "2 1 2 4");
        HX_ASSERT(!has(h, 2, 1, "2:fx1:res"), "cut moved it away");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(has(h, 2, 1, "2:fx1:res"), "undo brought the automation back");
        OK("⚠ undoing a cut restores the automation, not just the notes");

        hx_set_param(h, "redo_restore", "1");
        HX_ASSERT(!has(h, 2, 1, "2:fx1:res"), "redo re-applies the cut");
        OK("redo re-applies it");
        hx_destroy(h);
    }

    /* ---- a clip with more automation than a snapshot holds ----------- */
    {
        /* Restoring a SUBSET would be worse than restoring none: it looks like
         * undo worked. Such a slot is marked and the restore leaves automation
         * untouched. */
        hx_t *h = hx_create(NULL);
        char tgt[32];
        for (int i = 0; i < PA_UNDO_ENTRIES + 4; i++) {
            snprintf(tgt, sizeof(tgt), "0:fx1:p%d", i);
            pa_set(h, 0, 0, tgt, 0, 100 + i);
        }
        hx_set_param(h, "clip_cut", "0 0 0 9");
        hx_set_param(h, "undo_restore", "1");

        /* The undo does not restore this clip's automation — but it must not
         * destroy it either. The cut moved every entry to clip 9; leaving all
         * of them there loses nothing. ⚠ Skipping only the oversized SOURCE
         * while restoring the destination to empty would undo the arrival and
         * not the departure, which is how a safety measure ate the data it was
         * protecting. */
        int at_dest = 0, at_src = 0;
        for (int i = 0; i < PA_UNDO_ENTRIES + 4; i++) {
            snprintf(tgt, sizeof(tgt), "0:fx1:p%d", i);
            if (has(h, 0, 9, tgt)) at_dest++;
            if (has(h, 0, 0, tgt)) at_src++;
        }
        HX_ASSERT(at_dest + at_src == PA_UNDO_ENTRIES + 4,
                  "every entry still exists somewhere — the undo destroyed nothing");
        HX_ASSERT(at_dest == 0 || at_src == 0, "and they are all in one place, not split");
        OK("⚠ a clip too big for an undo slot leaves automation ALONE — never half-undone");
        hx_destroy(h);
    }

    /* A copy ACROSS TRACKS re-points chain, level and seq: targets at the
     * destination track (its slot IS its index); MIDI targets pass through.
     * (2026-09-03: a clip copied 5 -> 6 kept driving track 5's cutoff.) */
    {
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_c1_step_0_toggle", "60 100");
        pa_set(h, 0, 1, "0:synth:cutoff", 24, 100);
        pa_set(h, 0, 1, "0:slot:pan", 24, 100);
        pa_set(h, 0, 1, "seq:0:noteFX_gate", 24, 100);
        pa_set(h, 0, 1, "cc:74", 24, 100);
        hx_set_param(h, "clip_copy", "0 1 3 2");
        HX_ASSERT(has(h, 3, 2, " 3:synth:cutoff"), "chain target re-pointed at track 3's slot");
        HX_ASSERT(has(h, 3, 2, " 3:slot:pan"), "level target re-pointed");
        HX_ASSERT(has(h, 3, 2, "seq:3:noteFX_gate"), "seq: target re-pointed");
        HX_ASSERT(has(h, 3, 2, "cc:74"), "a MIDI target names no track and passes through");
        HX_ASSERT(!has(h, 3, 2, " 0:synth:cutoff"), "the destination holds no stranger");
        HX_ASSERT(has(h, 0, 1, " 0:synth:cutoff"), "the source is untouched");
        OK("a cross-track clip copy re-points its automation at the destination track");
        hx_destroy(h);
    }

    printf("PASS: test_param_auto_clipops (%d checks)\n", ok_count);
    return 0;
}
