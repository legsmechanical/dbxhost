/* tests/test_param_auto_note_link.c — NOTE LINK: automation follows the notes (plan 6c).
 *
 * Josh, 2026-09-11: "we should have the automation move with the resolution
 * changes, etc. maybe a 'Note link' toggle or similar to toggle that on or off?
 * on by default?" Before this, nothing that moved notes inside a clip moved its
 * automation: a lock on a note's step stayed at that step's TICK while the note
 * went elsewhere.
 *
 * Every op is driven through the set_param key the UI sends, and every block
 * carries three lanes side by side:
 *   LINK  — linked, following the clip (the default): must move with the notes;
 *   OFF   — Link: Off: must stay exactly where it was (the control);
 *   OWN   — linked, with its own Loop window: rescaled by the GRID ops
 *           (Resolution, Beat Stretch), left alone by the TIME ops.
 * Zoom and the held-step re-file (_reassign) keep notes where they are in time,
 * so they move nothing. A real-playback check closes it: after a Clock Shift
 * the lock still arrives on the step its note plays. */
#include "harness.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

static int ok_count = 0;
#define OK(msg) do { printf("  ok   — %s\n", msg); ok_count++; } while (0)

#define LINK "1:synth:cutoff"
#define OFF  "1:synth:reso"
#define OWN  "1:fx1:mix"

static void pa_set(hx_t *h, const char *tgt, int tick, int v) {
    char val[128];
    snprintf(val, sizeof val, "0 %s %d %d", tgt, tick, v);
    hx_set_param(h, "t1_pa_set", val);
}

/* The lane's points as "tick:val tick:val ..." — compared whole, so a stray
 * or missing point fails as loudly as a moved one. */
static const char *pts(hx_t *h, const char *tgt) {
    static char buf[4][512];
    static int k = 0;
    char *b = buf[k++ & 3];
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    pa_entry_t *e = pa_find(in, 1, 0, pa_target_lookup(in, tgt));
    b[0] = '\0';
    if (!e) return b;
    for (int i = 0; i < e->count; i++) {
        char one[32];
        snprintf(one, sizeof one, "%s%u:%u", i ? " " : "", e->points[i].tick, e->points[i].val);
        strcat(b, one);
    }
    return b;
}

/* The same, for track 1 (a drum track by default). */
static const char *dpts(hx_t *h, const char *tgt) {
    static char buf[2][512];
    static int k = 0;
    char *b = buf[k++ & 1];
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    pa_entry_t *e = pa_find(in, 0, 0, pa_target_lookup(in, tgt));
    b[0] = '\0';
    if (!e) return b;
    for (int i = 0; i < e->count; i++) {
        char one[32];
        snprintf(one, sizeof one, "%s%u:%u", i ? " " : "", e->points[i].tick, e->points[i].val);
        strcat(b, one);
    }
    return b;
}

static pa_entry_t *entry(hx_t *h, const char *tgt) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    return pa_find(in, 1, 0, pa_target_lookup(in, tgt));
}

#define PTS_EQ(tgt, want, msg) do { \
    const char *_g = pts(h, tgt); \
    if (strcmp(_g, want)) { printf("  FAIL — %s\n    got  \"%s\"\n    want \"%s\"\n", msg, _g, want); exit(1); } \
} while (0)

/* A 16-step clip at 1/16 with a note on step 4, the same lock (step 4 = tick
 * 96) on all three lanes, and a second LINK point on step 15 (tick 360) so the
 * wrap of the rotating ops is visible. OFF is unlinked; OWN has a 4-step Loop. */
static hx_t *setup(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_c0_step_4_toggle", "60 100");
    pa_set(h, LINK, 96, 5000);
    pa_set(h, LINK, 360, 7000);
    pa_set(h, OFF, 96, 5000);
    pa_set(h, OWN, 96, 5000);
    hx_set_param(h, "t1_pa_link", "0 " OFF " 0");
    hx_set_param(h, "t1_pa_loop", "0 " OWN " 96 0 0");
    return h;
}

static uint32_t note_tick(hx_t *h) {
    const clip_t *cl = &((seq8_instance_t *)h->inst)->tracks[1].clips[0];
    return cl->note_count ? cl->notes[0].tick : 0xFFFFFFFFu;
}

/* The step each distinct staged value of `tgt` first appeared on, over
 * `blocks` of playback. Pairs (value, step), in order. */
static int changes(hx_t *h, const char *tgt, int *val, int *stp, int max, int blocks) {
    seq8_instance_t *in = (seq8_instance_t *)h->inst;
    char buf[8192], pat[80];
    int n = 0;
    snprintf(pat, sizeof pat, "%s ", tgt);
    for (int i = 0; i < blocks; i++) {
        hx_render(h, 1);
        hx_get_param(h, "pa_pending", buf, sizeof buf);
        for (char *p = strstr(buf, pat); p; p = strstr(p + 1, pat)) {
            int v = 0;
            sscanf(p + strlen(pat), "%d", &v);
            if (n < max && (n == 0 || val[n - 1] != v)) { val[n] = v; stp[n] = in->tracks[1].current_step; n++; }
        }
    }
    return n;
}

int main(void) {
    char buf[4096];

    /* ---- the flag ---------------------------------------------------- */
    {
        hx_t *h = setup();
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        HX_ASSERT(!(entry(h, LINK)->flags & PA_FLAG_UNLINKED), "a new lane is LINKED — the default");
        hx_get_param(h, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "1 0 5 1 " OFF), "pa_list reports Link: Off as ACTIVE | UNLINKED = 5");
        char *mem = NULL; size_t len = 0;
        FILE *fp = open_memstream(&mem, &len);
        pa_serialize(in, fp); fclose(fp);
        hx_destroy(h);
        hx_t *h2 = hx_create(NULL);
        pa_parse((seq8_instance_t *)h2->inst, mem, len);
        hx_get_param(h2, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "1 0 5 1 " OFF), "Link: Off survives save + load");
        hx_set_param(h2, "t1_pa_link", "0 " OFF " 1");
        hx_get_param(h2, "pa_list", buf, sizeof buf);
        HX_ASSERT(strstr(buf, "1 0 1 1 " OFF), "back On clears only that bit");
        free(mem); hx_destroy(h2);
        OK("Link: On by default; Off is one flag bit, persisted, and toggles back");
    }

    /* ---- Resolution: a grid op — every linked lane rescales ---------- */
    {
        hx_t *h = setup();
        hx_set_param(h, "t1_clip_resolution", "2");                 /* 1/16 -> 1/8: 24 -> 48 tps */
        HX_ASSERT(note_tick(h) == 192, "setup: the note rescaled to step 4 at 48 tps");
        PTS_EQ(LINK, "192:5000 720:7000", "Resolution: the lock follows its note to step 4 of the new grid");
        PTS_EQ(OFF,  "96:5000",           "Resolution: Link: Off stays put");
        PTS_EQ(OWN,  "192:5000",          "Resolution: an own-Loop lane rescales too");
        HX_ASSERT(entry(h, OWN)->loop_len == 192, "and its Loop keeps its length in STEPS (4 steps = 192)");
        hx_set_param(h, "t1_clip_resolution", "1");                 /* and back */
        PTS_EQ(LINK, "96:5000 360:7000", "back to 1/16 restores the original ticks");
        HX_ASSERT(entry(h, OWN)->loop_len == 96, "and the Loop");
        hx_destroy(h);
        OK("⭐ Resolution: locks stay on their notes' steps; the Loop window scales with them; Off stays");
    }

    /* ---- Zoom keeps every note's absolute tick: nothing to follow --- */
    {
        hx_t *h = setup();
        hx_set_param(h, "t1_clip_resolution_zoom", "2");
        HX_ASSERT(note_tick(h) == 96, "setup: zoom kept the note's absolute tick (the premise)");
        PTS_EQ(LINK, "96:5000 360:7000", "Zoom moves no automation");
        PTS_EQ(OWN,  "96:5000", "Zoom leaves an own-Loop lane alone");
        hx_destroy(h);
        OK("Zoom keeps absolute time, so automation stays exactly where it is");
    }

    /* ---- Clock Shift: a time op — rotates by one step, wrapping ------ */
    {
        hx_t *h = setup();
        hx_set_param(h, "t1_clock_shift", "1");
        HX_ASSERT(note_tick(h) == 120, "setup: the note shifted to step 5");
        PTS_EQ(LINK, "0:7000 120:5000", "Clock Shift +1: step 4 -> 5, and step 15 wraps to step 0");
        PTS_EQ(OFF,  "96:5000", "Clock Shift: Link: Off stays put");
        PTS_EQ(OWN,  "96:5000", "Clock Shift: an own-Loop lane runs on its own clock and stays put");
        hx_set_param(h, "t1_clock_shift", "-1");
        PTS_EQ(LINK, "96:5000 360:7000", "Clock Shift -1 undoes it exactly");
        hx_destroy(h);
        OK("⭐ Clock Shift rotates a linked lane with its notes, wrapping; own-clock and Off lanes stay");
    }

    /* ---- Nudge: one tick, wrapping ---------------------------------- */
    {
        hx_t *h = setup();
        pa_set(h, LINK, 383, 9000);                                  /* the clip's last tick */
        hx_set_param(h, "t1_nudge", "1");
        HX_ASSERT(note_tick(h) == 97, "setup: the note nudged one tick later");
        PTS_EQ(LINK, "0:9000 97:5000 361:7000", "Nudge +1: every point one tick later, the last one wrapping to 0");
        PTS_EQ(OFF,  "96:5000", "Nudge: Off stays");
        PTS_EQ(OWN,  "96:5000", "Nudge: own-clock stays");
        hx_set_param(h, "t1_nudge", "-1");
        PTS_EQ(LINK, "96:5000 360:7000 383:9000", "Nudge -1 undoes it exactly");
        hx_destroy(h);
        OK("Nudge moves a linked lane one tick with its notes, wrapping at the clip's end");
    }

    /* ---- Beat Stretch: a grid op — x2 and /2, blocked compress moves nothing */
    {
        hx_t *h = setup();
        hx_set_param(h, "t1_beat_stretch", "1");
        HX_ASSERT(note_tick(h) == 192, "setup: x2 took the note to step 8");
        PTS_EQ(LINK, "192:5000 720:7000", "Stretch x2: the lock goes to step 8 with its note");
        PTS_EQ(OFF,  "96:5000", "Stretch: Off stays");
        HX_ASSERT(entry(h, OWN)->loop_len == 192 && !strcmp(pts(h, OWN), "192:5000"),
                  "Stretch: an own-Loop lane stretches with its window");
        hx_set_param(h, "t1_beat_stretch", "-1");
        PTS_EQ(LINK, "96:5000 360:7000", "Stretch /2 brings it back");
        hx_destroy(h);

        hx_t *h2 = setup();
        h = h2;
        hx_set_param(h, "t1_c0_step_5_toggle", "62 100");            /* steps 4 and 5 collide at /2 */
        hx_set_param(h, "t1_beat_stretch", "-1");
        HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[1].stretch_blocked, "setup: the compress was BLOCKED");
        PTS_EQ(LINK, "96:5000 360:7000", "a blocked compress moved no notes, so it moves no automation");
        hx_destroy(h);

        h = hx_create(NULL);                                          /* a dense sweep folding at /2 */
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        pa_set(h, LINK, 10, 1000);
        pa_set(h, LINK, 11, 2000);
        hx_set_param(h, "t1_beat_stretch", "-1");
        PTS_EQ(LINK, "5:2000", "two points on one tick after /2: the LATER one wins");
        hx_destroy(h);
        OK("⭐ Beat Stretch scales linked lanes x2 and /2 — only when the notes moved; a fold keeps the later value");
    }

    /* ---- Double loop: the window's automation copied forward -------- */
    {
        hx_t *h = setup();
        pa_set(h, LINK, 18 * 24, 3000);          /* sits in the half about to be written over */
        hx_set_param(h, "t1_loop_double_fill", "1");
        PTS_EQ(LINK, "96:5000 360:7000 480:5000 744:7000",
               "Double: steps 0-15 copied to 16-31, REPLACING what was there (step 18's point is gone)");
        PTS_EQ(OFF,  "96:5000", "Double: Off stays");
        PTS_EQ(OWN,  "96:5000", "Double: an own-Loop lane just keeps looping — untouched");
        hx_destroy(h);
        OK("⭐ Double loop copies a linked lane's automation forward with its notes");
    }

    /* ---- A STEP is not a transformation: copying one carries no locks ----
     * RULED (Josh, 2026-09-11): Link means the automation is transformed the
     * way the whole SEQUENCE is — scaled, stretched, shifted — not that locks
     * ride along with individual notes. An earlier cut carried the step's locks
     * to the destination step; he called it note-pinning, and it is gone. */
    {
        hx_t *h = setup();
        pa_set(h, LINK, 9 * 24, 1111);           /* the destination's own lock: untouched */
        hx_set_param(h, "t1_c0_step_4_copy_to", "9");
        HX_ASSERT(((seq8_instance_t *)h->inst)->tracks[1].clips[0].step_note_count[9] > 0,
                  "setup: the NOTES really were copied to step 9");
        PTS_EQ(LINK, "96:5000 216:1111 360:7000",
               "copying a step moves no automation — step 9 keeps its own lock, step 4's stays put");
        hx_destroy(h);

        h = setup();
        hx_set_param(h, "t1_c0_step_4_reassign", "5");
        PTS_EQ(LINK, "96:5000 360:7000", "the held-step re-file keeps notes in time, so automation stays");
        hx_destroy(h);
        OK("⭐ copying a step carries NO locks, and the held-step re-file moves nothing");
    }

    /* ---- A drum track's automation is on the DRUM window: a melodic op there moves nothing */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM, "setup: track 1 is a drum track by default");
        hx_set_param(h, "t0_pa_set", "0 0:synth:cutoff 96 5000");
        hx_set_param(h, "t0_clock_shift", "1");
        hx_set_param(h, "t0_clip_resolution", "2");
        pa_entry_t *e = pa_find(in, 0, 0, pa_target_lookup(in, "0:synth:cutoff"));
        HX_ASSERT(e && e->count == 1 && e->points[0].tick == 96,
                  "a melodic clip op on a drum track moved no playing note, so no automation");
        hx_destroy(h);
        OK("a melodic op reaching a drum track leaves its automation alone (drums follow ALL LANES only)");
    }

    /* ---- DRUM TRACKS: ALL LANES ops only (RULED 2026-09-11) ---------- *
     * Track 1 is a drum track. Its automation is timed on the drum window —
     * the longest lane — so an ALL LANES op moves it the way that lane's notes
     * move; a single-lane op leaves it where it is. */
    {
        #define DL  "0:synth:cutoff"
        #define DOFF "0:synth:reso"
        #define DPTS(want, msg) do { \
            const char *_g = dpts(h, DL); \
            if (strcmp(_g, want)) { printf("  FAIL — %s\n    got  \"%s\"\n    want \"%s\"\n", msg, _g, want); exit(1); } \
        } while (0)
        struct { const char *key, *val, *want, *msg; } ops[] = {
            { "t0_all_lanes_clip_resolution", "2", "192:5000 720:7000", "ALL LANES Resolution 1/16 -> 1/8: the lock follows its lane's note" },
            { "t0_all_lanes_clock_shift", "1",     "0:7000 120:5000",   "ALL LANES Clock Shift +1: one step later, the last step wrapping" },
            { "t0_all_lanes_nudge", "1",           "97:5000 361:7000",  "ALL LANES Nudge +1: one tick later" },
            { "t0_all_lanes_beat_stretch", "1",    "192:5000 720:7000", "ALL LANES Stretch x2" },
            { "t0_all_lanes_double_fill", "1",     "96:5000 360:7000 480:5000 744:7000", "ALL LANES Double: copied forward" },
            /* single-lane ops: the clip's automation stays put */
            { "t0_l0_clip_resolution", "2",        "96:5000 360:7000",  "a SINGLE lane's Resolution moves no automation" },
            { "t0_l0_clock_shift", "1",            "96:5000 360:7000",  "a SINGLE lane's Clock Shift moves no automation" },
        };
        for (unsigned i = 0; i < sizeof ops / sizeof ops[0]; i++) {
            hx_t *h = hx_create(NULL);
            seq8_instance_t *in = (seq8_instance_t *)h->inst;
            hx_set_param(h, "t0_l0_note_add", "96 100 12");            /* lane 1, step 4: allocates the drum clip */
            HX_ASSERT(in->tracks[0].pad_mode == PAD_MODE_DRUM && in->tracks[0].drum_clips[0], "setup: a drum clip");
            hx_set_param(h, "t0_pa_set", "0 " DL " 96 5000");
            hx_set_param(h, "t0_pa_set", "0 " DL " 360 7000");
            hx_set_param(h, "t0_pa_set", "0 " DOFF " 96 5000");
            hx_set_param(h, "t0_pa_link", "0 " DOFF " 0");
            hx_set_param(h, ops[i].key, ops[i].val);
            DPTS(ops[i].want, ops[i].msg);
            HX_ASSERT(!strcmp(dpts(h, DOFF), "96:5000"), "and Link: Off stays put");
            hx_destroy(h);
        }
        OK("⭐ drum: every ALL LANES op carries linked automation with the notes; single-lane ops and Off leave it");

        /* A blocked ALL LANES compress moved no notes — so no automation. */
        hx_t *h = hx_create(NULL);
        hx_set_param(h, "t0_l0_note_add", "96 100 12");
        hx_set_param(h, "t0_l0_note_add", "120 100 12");               /* steps 4 and 5 collide at /2 */
        hx_set_param(h, "t0_pa_set", "0 " DL " 96 5000");
        hx_set_param(h, "t0_all_lanes_beat_stretch", "-1");
        HX_ASSERT(((seq8_instance_t *)h->inst)->all_lanes_stretch_result == -1, "setup: the compress was refused");
        DPTS("96:5000", "a refused ALL LANES compress moves no automation");
        hx_destroy(h);

        /* The window is the LONGEST lane: lane 4 at 32 steps makes a point on
         * step 29 part of the rotation (a 16-step window would not reach it). */
        h = hx_create(NULL);
        hx_set_param(h, "t0_l0_note_add", "96 100 12");
        hx_set_param(h, "t0_l3_clip_length", "32");
        hx_set_param(h, "t0_pa_set", "0 " DL " 696 5000");              /* step 29 */
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        DPTS("720:5000", "Clock Shift rotates inside the LONGEST lane's window (step 29 -> 30)");
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        hx_set_param(h, "t0_all_lanes_clock_shift", "1");
        DPTS("0:5000", "and wraps at ITS end (step 31 -> 0), not at 16");
        hx_destroy(h);
        OK("drum: a refused compress moves nothing; the rotation wraps at the longest lane's end");

        /* UNDO takes the automation back WITH the notes. The drum clip snapshot
         * used to hold notes only, so an undone ALL LANES Double left the copied
         * automation behind. Melodic Double is the control: its snapshot always
         * carried automation. */
        h = hx_create(NULL);
        seq8_instance_t *in = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t0_l0_note_add", "96 100 12");
        hx_set_param(h, "t0_pa_set", "0 " DL " 96 5000");
        hx_set_param(h, "t0_all_lanes_double_fill", "1");
        DPTS("96:5000 480:5000", "setup: doubled");
        hx_set_param(h, "undo_restore", "1");
        HX_ASSERT(in->tracks[0].drum_clips[0]->lanes[0].clip.length == 16, "setup: undo restored the lane to 16 steps");
        DPTS("96:5000", "⭐ undo takes the copied automation back with the notes");
        hx_set_param(h, "redo_restore", "1");
        DPTS("96:5000 480:5000", "and redo brings it back");
        hx_destroy(h);

        h = hx_create(NULL);
        hx_set_param(h, "t1_c0_step_4_toggle", "60 100");
        pa_set(h, LINK, 96, 5000);
        hx_set_param(h, "t1_loop_double_fill", "1");
        PTS_EQ(LINK, "96:5000 480:5000", "CONTROL setup: melodic doubled");
        hx_set_param(h, "undo_restore", "1");
        PTS_EQ(LINK, "96:5000", "CONTROL: melodic undo takes it back too");
        hx_destroy(h);
        OK("⭐ undo and redo of an ALL LANES Double carry the automation with the notes (melodic as the control)");
    }

    /* ---- Real playback: the lock arrives on the step its note plays -- */
    {
        int val[16], stp[16];
        for (int linked = 1; linked >= 0; linked--) {
            hx_t *h = hx_create(NULL);
            hx_set_param(h, "t1_c0_step_4_toggle", "60 100");
            pa_set(h, LINK, 0, 0);
            pa_set(h, LINK, 96, 8192);                               /* the note's lock */
            if (!linked) hx_set_param(h, "t1_pa_link", "0 " LINK " 0");
            hx_set_param(h, "t1_clock_shift", "1");                  /* the note -> step 5 */
            hx_set_param(h, "transport", "play_focus:1:0");
            int n = changes(h, LINK, val, stp, 16, 800);
            int at = -1;
            /* The lock ARRIVING: the first 8192 after a 0. (From Play the lane may
             * start at 8192 carried round the loop from its last point — 6b2.) */
            for (int i = 1; i < n; i++) if (val[i] == 8192 && val[i - 1] == 0) { at = stp[i]; break; }
            if (linked) HX_ASSERT(at == 5, "linked: the lock plays on step 5, with its note");
            else        HX_ASSERT(at == 4, "CONTROL, Link: Off: the lock still plays on step 4, a step before the note");
            hx_destroy(h);
        }
        OK("⭐ under real playback, a linked lock plays on its note's new step; an unlinked one where it was");
    }

    printf("test_param_auto_note_link: %d ok\n", ok_count);
    return 0;
}
