/* tests/test_groove_early.c — a table groove plays sequenced notes AHEAD of
 * their tick.
 *
 * A slot marked early is played by firing its notes a few ticks before their
 * own tick and parking them for the remainder. Everything here compares the
 * render block a note left in against the same pattern played straight — the
 * block is the capture's only clock (hx_midi_event.block).
 *
 * At 120 BPM a tick is 229.7 samples = 1.79 blocks, so six ticks early is
 * 10.8 blocks: a note six ticks early leaves 10, 11 or 12 blocks sooner.
 *
 * There is no way to load a table yet, so each test sets one directly. */
#include "harness.h"

#define EARLY_LO 10
#define EARLY_HI 12

typedef struct { int block; uint8_t on; uint8_t pitch; } nev_t;
typedef struct { int n; nev_t ev[6000]; } cap_t;

static void collect(cap_t *c) {
    c->n = 0;
    int total = hx_stub_event_count();
    for (int i = 0; i < total && c->n < 6000; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        /* a track on its default route plays into Move: the notes are the
         * injected packets (the internal ones are the stop sweep) */
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if (st != 0x90 && st != 0x80) continue;
        c->ev[c->n].block = e->block;
        c->ev[c->n].on    = (uint8_t)(st == 0x90 && e->bytes[3] > 0);
        c->ev[c->n].pitch = e->bytes[2];
        c->n++;
    }
}
/* Block of the `occ`th (0-based) note-on (on=1) or note-off of `pitch`
 * (pitch < 0: any pitch). -1 when there is none. */
static int nth(const cap_t *c, int on, int pitch, int occ) {
    for (int i = 0; i < c->n; i++) {
        if (c->ev[i].on != on) continue;
        if (pitch >= 0 && c->ev[i].pitch != pitch) continue;
        if (occ-- == 0) return c->ev[i].block;
    }
    return -1;
}
static int count(const cap_t *c, int on, int pitch) {
    int k = 0;
    for (int i = 0; i < c->n; i++)
        if (c->ev[i].on == on && (pitch < 0 || c->ev[i].pitch == pitch)) k++;
    return k;
}

/* Two 1/16 slots; `which` is `fine` early (negative) or late. */
static void table(hx_t *h, int which, int fine) {
    groove_t *g = &((seq8_instance_t *)h->inst)->groove;
    g->kind = GROOVE_TABLE; g->base = 24; g->n_slots = 2;
    g->off[0] = g->off[1] = 0;
    g->off[which] = (int16_t)fine;
    g->amt = 100;
}

typedef void (*setup_fn)(hx_t *h);
static int g_which, g_fine;          /* the table the next run uses; fine 0 = straight */

/* `n` bars less a little: short of the next bar's first step even when that
 * step is played twelve blocks early. */
static int bars(int n) { return (int)(n * 4 * 60.0 / 120.0 * 44100.0 / 128.0) - 20; }

static hx_t *begin(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    return h;
}
static void melodic16(hx_t *h, int gate) {
    char k[48], v[48];
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        snprintf(v, sizeof(v), "%d", gate);
        hx_set_param(h, k, v);
    }
}
/* Build with `setup`, apply the current table, play track 1 for `nbars`, stop,
 * let the tail out, and collect. */
static void run(setup_fn setup, int nbars, cap_t *out) {
    hx_t *h = begin();
    setup(h);
    if (g_fine) table(h, g_which, g_fine);
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, bars(nbars));
    hx_set_param(h, "transport", "stop");
    hx_render(h, 200);
    collect(out);
    hx_destroy(h);
}
static void both(setup_fn setup, int nbars, int which, int fine, cap_t *straight, cap_t *groove) {
    g_fine = 0;                         run(setup, nbars, straight);
    g_which = which; g_fine = fine;     run(setup, nbars, groove);
    g_fine = 0;
}

static void s_melodic(hx_t *h)  { melodic16(h, 12); }
static void s_long(hx_t *h)     { melodic16(h, 30); }
static void s_backward(hx_t *h) { melodic16(h, 12); hx_set_param(h, "t1_clip_playback_dir", "1"); }
static void s_iter(hx_t *h) {
    melodic16(h, 12);
    hx_set_param(h, "t1_c0_step_0_iter", "33");          /* 1 of 2: every other pass */
}
static void s_same_pitch(hx_t *h) {
    char k[48];
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        hx_set_param(h, k, "60 100");
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        hx_set_param(h, k, "36");                        /* longer than a step: each note cuts the last */
    }
}
static void arm(hx_t *h, int t) {
    seq8_track_t *tr = &((seq8_instance_t *)h->inst)->tracks[t];
    tr->active_clip = 0; tr->queued_clip = -1; tr->will_relaunch = 1;
    pfx_sync_from_clip(tr);
}
static void s_drum(hx_t *h) {
    char k[48];
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t0_l0_step_%d_toggle", s);
        hx_set_param(h, k, "100");
    }
    arm(h, 0);
}

static cap_t A, B;

int main(void) {
    /* ---- an early slot plays early; the others do not move ---- */
    both(s_melodic, 3, 1, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(count(&A, 1, -1) == 48, "rig: three bars of sixteen notes");
    HX_ASSERT(count(&B, 1, -1) == count(&A, 1, -1), "an early slot adds or loses no notes");
    HX_ASSERT(count(&B, 0, -1) == count(&B, 1, -1), "every early note gets its note-off");
    for (int s = 0; s < 16; s++) for (int o = 0; o < 3; o++) {
        int d = nth(&A, 1, 48 + s, o) - nth(&B, 1, 48 + s, o);
        if (s % 2) HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "a note in the early slot is six ticks early");
        else       HX_ASSERT(d == 0, "a note in the other slot does not move");
        /* the groove moves a note; it does not resize it */
        int la = nth(&A, 0, 48 + s, o) - nth(&A, 1, 48 + s, o);
        int lb = nth(&B, 0, 48 + s, o) - nth(&B, 1, 48 + s, o);
        HX_ASSERT(lb - la >= -1 && lb - la <= 1, "an early note keeps its length");
    }
    printf("  ok   — an early slot plays six ticks early, at its own length; the rest stay put\n");

    /* ---- a LATE table slot keeps its length too (the swings do not) ---- */
    both(s_long, 2, 1, 6 * GROOVE_FINE, &A, &B);
    for (int s = 0; s < 16; s++) {
        int d  = nth(&B, 1, 48 + s, 0) - nth(&A, 1, 48 + s, 0);
        int la = nth(&A, 0, 48 + s, 0) - nth(&A, 1, 48 + s, 0);
        int lb = nth(&B, 0, 48 + s, 0) - nth(&B, 1, 48 + s, 0);
        if (s % 2) HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "a note in the late slot is six ticks late");
        else       HX_ASSERT(d == 0, "a note in the other slot does not move");
        /* gate 30: an on-beat note ends in the late slot, a late one in an
         * on-time slot. Under the swings' rule both would change length. */
        HX_ASSERT(lb - la >= -1 && lb - la <= 1, "a table groove never resizes a note");
    }
    printf("  ok   — a table groove moves note-ons and note-offs together\n");

    /* ---- step 1 early: on time at the launch, before the wrap after ---- */
    both(s_melodic, 3, 0, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(count(&B, 1, -1) == count(&A, 1, -1), "an early first step adds or loses no notes");
    HX_ASSERT(nth(&A, 1, 48, 0) == nth(&B, 1, 48, 0),
              "at the launch nothing can come before the first step: it plays on time");
    for (int o = 1; o < 3; o++) {
        int d = nth(&A, 1, 48, o) - nth(&B, 1, 48, o);
        HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "the first step plays BEFORE the loop wraps");
    }
    for (int s = 2; s < 16; s += 2) {
        int d = nth(&A, 1, 48 + s, 0) - nth(&B, 1, 48 + s, 0);
        HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "the other on-beat steps are early from the first bar");
    }
    printf("  ok   — the first step: on time at the launch, ahead of the wrap from then on\n");

    /* ---- sub-tick: between two whole ticks ---- */
    {
        static cap_t C;
        long s6 = 0, s65 = 0, s7 = 0;
        both(s_melodic, 2, 1, -6 * GROOVE_FINE, &A, &B);
        for (int s = 1; s < 16; s += 2) s6 += nth(&B, 1, 48 + s, 0);
        both(s_melodic, 2, 1, -6 * GROOVE_FINE - 8, &A, &B);
        for (int s = 1; s < 16; s += 2) s65 += nth(&B, 1, 48 + s, 0);
        both(s_melodic, 2, 1, -7 * GROOVE_FINE, &A, &C);
        for (int s = 1; s < 16; s += 2) s7 += nth(&C, 1, 48 + s, 0);
        HX_ASSERT(s7 < s65 && s65 < s6, "six and a half ticks early lands between six and seven");
        printf("  ok   — an offset finer than a tick is honoured\n");
    }

    /* ---- a note held back until the wrap is back for the pass after it ---- */
    for (int drum = 0; drum < 2; drum++) {
        cap_t *caps[2] = { &A, &B };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            if (drum) s_drum(h); else melodic16(h, 12);
            if (g) table(h, 0, -6 * GROOVE_FINE);
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, bars(1) / 2);
            {   /* what recording over a step does to it */
                seq8_track_t *tr = &((seq8_instance_t *)h->inst)->tracks[drum ? 0 : 1];
                clip_t *cl = drum ? &tr->drum_clips[0]->lanes[0].clip : &tr->clips[0];
                int hit = 0;
                for (int i = 0; i < cl->note_count; i++)
                    if (cl->notes[i].tick == 0) { cl->notes[i].suppress_until_wrap = 1; hit = 1; }
                HX_ASSERT(hit, "rig: the first step's note was not found");
            }
            hx_render(h, bars(2) - bars(1) / 2);
            hx_set_param(h, "transport", "stop");
            hx_render(h, 200);
            collect(caps[g]);
            hx_destroy(h);
        }
        /* the 17th note-on is the first step's second pass */
        HX_ASSERT(count(&A, 1, -1) == 32 && count(&B, 1, -1) == 32, "rig: two bars, the held-back step included");
        int d = nth(&A, 1, -1, 16) - nth(&B, 1, -1, 16);
        HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI,
                  "a step held back until the wrap is played ahead of the wrap, like any other");
    }
    printf("  ok   — a step held back until the wrap is early again on the next pass (melodic, drum)\n");

    /* ---- claims nobody took do not pile up ---- */
    {
        cap_t *caps[2] = { &A, &B };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            melodic16(h, 12);
            if (g) {
                table(h, 1, -6 * GROOVE_FINE);
                /* a full list of claims for ticks long gone (a muted track
                 * leaves these: it never reaches the tick to take them) */
                seq8_track_t *tr = &((seq8_instance_t *)h->inst)->tracks[1];
                for (int i = 0; i < GROOVE_TOK_MAX; i++) {
                    tr->early_tok[i].due = 0xFFFFF000u + (uint32_t)i;
                    tr->early_tok[i].ni = (uint16_t)i; tr->early_tok[i].lane = 0xFF;
                }
                tr->early_tok_n = GROOVE_TOK_MAX;
            }
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, bars(1));
            hx_set_param(h, "transport", "stop");
            hx_render(h, 200);
            collect(caps[g]);
            hx_destroy(h);
        }
        int d = nth(&A, 1, 49, 0) - nth(&B, 1, 49, 0);
        HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "stale claims filled the list and early notes stopped being early");
    }
    printf("  ok   — claims that were never taken are dropped\n");

    /* ---- the groove changing under a note that was already played ahead ---- */
    for (int at = 100; at < 190; at += 2) {
        hx_t *h = begin();
        melodic16(h, 12);
        table(h, 1, -6 * GROOVE_FINE);
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, at);
        hx_set_param(h, "groove_amt", "50");             /* six ticks early becomes three */
        hx_render(h, bars(3) - at);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        for (int sidx = 0; sidx < 16; sidx++)
            HX_ASSERT(count(&B, 1, 48 + sidx) == 3, "changing the amount played a note twice, or not at all");
    }
    printf("  ok   — changing the amount mid-bar plays every note exactly once\n");

    /* ---- an early pass does not leak its park into the rest of the tick ---- */
    {
        /* Step 1 is six ticks LATE and ratchets x4 (hits at ticks 0, 6, 12,
         * 18); step 2 is six and a half ticks EARLY, so it fires at tick 17
         * with half a tick of park. The fourth ratchet hit, one tick later,
         * must still get step 1's six ticks. */
        hx_t *h = begin();
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        hx_set_param(h, "t1_c0_step_0_ratch", "4");
        hx_set_param(h, "t1_c0_step_1_toggle", "72 100");
        table(h, 1, -6 * GROOVE_FINE - 8);
        ((seq8_instance_t *)h->inst)->groove.off[0] = 6 * GROOVE_FINE;
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 120);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        HX_ASSERT(count(&B, 1, 60) == 4, "rig: the step ratchets four times");
        int gap23 = nth(&B, 1, 60, 2) - nth(&B, 1, 60, 1);
        int gap34 = nth(&B, 1, 60, 3) - nth(&B, 1, 60, 2);
        HX_ASSERT(gap23 >= 10 && gap23 <= 12, "rig: ratchet hits are six ticks apart");
        HX_ASSERT(gap34 >= gap23 - 1 && gap34 <= gap23 + 1,
                  "an early note's park was left behind and moved the notes after it");
    }
    {   /* the same on a drum lane: one pitch, so read it off the last hit.
         * Sounding order: ratchet hits at 6, 12 ticks, the early step at
         * 17.5, then ratchet hits at 18 and 24. */
        hx_t *h = begin();
        hx_set_param(h, "t0_l0_step_0_toggle", "100");
        hx_set_param(h, "t0_l0_step_0_ratch", "4");
        hx_set_param(h, "t0_l0_step_1_toggle", "100");
        arm(h, 0);
        table(h, 1, -6 * GROOVE_FINE - 8);
        ((seq8_instance_t *)h->inst)->groove.off[0] = 6 * GROOVE_FINE;
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 120);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        HX_ASSERT(count(&B, 1, -1) == 5, "rig: four ratchet hits and the next step");
        int span = nth(&B, 1, -1, 4) - nth(&B, 1, -1, 0);
        HX_ASSERT(span >= 31 && span <= 34,
                  "on a drum lane an early hit's park was left behind and moved the hit after it");
    }
    printf("  ok   — an early pass puts the tick's own park back\n");

    /* ---- a drum lane ---- */
    both(s_drum, 3, 1, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(count(&A, 1, -1) == 48, "rig: three bars of a drum lane");
    HX_ASSERT(count(&B, 1, -1) == 48 && count(&B, 0, -1) == 48, "the drum lane adds or loses no hits");
    for (int i = 0; i < 48; i++) {
        int d = nth(&A, 1, -1, i) - nth(&B, 1, -1, i);
        if (i % 2) HX_ASSERT(d >= EARLY_LO && d <= EARLY_HI, "a drum hit in the early slot is six ticks early");
        else       HX_ASSERT(d == 0, "a drum hit in the other slot does not move");
    }
    both(s_drum, 2, 1, 6 * GROOVE_FINE, &A, &B);
    for (int i = 0; i < 31; i++) {
        int la = nth(&A, 0, -1, i) - nth(&A, 1, -1, i);
        int lb = nth(&B, 0, -1, i) - nth(&B, 1, -1, i);
        HX_ASSERT(la > 0, "rig: a drum hit has a length");
        HX_ASSERT(lb - la >= -1 && lb - la <= 1, "a drum hit in a table groove keeps its length");
    }
    printf("  ok   — drum lanes play early slots early, and keep each hit's length\n");

    /* ---- Iter: the pass a note belongs to decides, not the pass it fires in ---- */
    both(s_iter, 4, 0, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(count(&A, 1, 48) == 2, "rig: a 1-of-2 step plays twice in four bars");
    HX_ASSERT(count(&B, 1, 48) == 2, "an early Iter step plays as often as it does straight");
    for (int o = 0; o < 2; o++) {
        int d = nth(&A, 1, 48, o) - nth(&B, 1, 48, o);
        HX_ASSERT(d >= 0 && d <= EARLY_HI, "an early Iter step plays in the same bars as it does straight");
    }
    printf("  ok   — an Iter step fired ahead of the wrap is judged for the pass it belongs to\n");

    /* ---- Backward: late only ---- */
    both(s_backward, 2, 1, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(A.n == B.n && A.n > 40, "rig: backward plays");
    for (int i = 0; i < A.n; i++)
        HX_ASSERT(A.ev[i].block == B.ev[i].block && A.ev[i].pitch == B.ev[i].pitch,
                  "a clip playing Backward plays its early slots on time");
    printf("  ok   — Backward playback is not read ahead\n");

    /* ---- the same pitch on every step, each note cutting the last ---- */
    both(s_same_pitch, 3, 1, -6 * GROOVE_FINE, &A, &B);
    HX_ASSERT(count(&B, 1, 60) == count(&A, 1, 60), "retriggered early notes: none added or lost");
    {
        /* never two note-offs running, and it ends silent */
        int sounding = 0, worst = 0;
        for (int i = 0; i < B.n; i++) {
            sounding += B.ev[i].on ? 1 : -1;
            if (sounding < worst) worst = sounding;
        }
        HX_ASSERT(count(&B, 0, 60) >= count(&B, 1, 60), "a retriggered early note was left hanging");
        HX_ASSERT(worst >= -1, "note-offs ran ahead of their note-ons");
    }
    printf("  ok   — retriggering the same pitch through early slots leaves nothing hanging\n");

    /* ---- a queued launch: the pass that is about to be replaced is not played ahead ---- */
    {
        cap_t *caps[2] = { &A, &B };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            melodic16(h, 12);
            hx_set_param(h, "t1_c1_step_0_toggle", "90 100");
            hx_set_param(h, "launch_quant", "5");                 /* one bar */
            if (g) table(h, 0, -6 * GROOVE_FINE);
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, bars(1) / 2);
            hx_set_param(h, "t1_launch_clip", "1");               /* queued for the bar line */
            hx_render(h, bars(1));
            hx_set_param(h, "transport", "stop");
            hx_render(h, 200);
            collect(caps[g]);
            hx_destroy(h);
        }
        HX_ASSERT(count(&A, 1, 90) == 1 && count(&A, 1, 48) == 1, "rig: clip 2 takes over at the bar line");
        HX_ASSERT(count(&B, 1, 48) == 1,
                  "the old clip's first step was played ahead of a bar line it never reached");
        HX_ASSERT(count(&B, 1, 90) == 1 && nth(&B, 1, 90, 0) == nth(&A, 1, 90, 0),
                  "the launched clip's first step plays on time");
    }
    printf("  ok   — a queued launch: nothing of the outgoing pass is played ahead\n");

    /* ---- a launch queued AFTER the outgoing clip's first step was played ahead ---- */
    {
        /* The bar line is at block 692; the old clip's first step goes out
         * six ticks (11 blocks) before it, at 681. Queue the new clip in between: its
         * own first step — the same note index, on the same tick — must play. */
        hx_t *h = begin();
        melodic16(h, 12);
        hx_set_param(h, "t1_c1_step_0_toggle", "90 100");
        hx_set_param(h, "launch_quant", "5");
        table(h, 0, -6 * GROOVE_FINE);
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 685);
        hx_set_param(h, "t1_launch_clip", "1");
        hx_render(h, 300);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        HX_ASSERT(count(&B, 1, 48) == 2, "rig: the old clip's first step had already gone out ahead of the bar line");
        HX_ASSERT(count(&B, 1, 90) == 1, "the launched clip's first step was swallowed by the old clip's claim");
    }
    printf("  ok   — a clip launched over an early note still plays its own first step\n");

    /* ---- stop and play again at once: nothing of the last run is remembered ---- */
    {
        hx_t *h = begin();
        melodic16(h, 12);
        table(h, 0, -6 * GROOVE_FINE);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 77);                        /* the third step has just gone out ahead of its tick */
        hx_set_param(h, "transport", "stop");
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, bars(1));
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        for (int sidx = 0; sidx < 16; sidx++)
            HX_ASSERT(count(&B, 1, 48 + sidx) == 1, "a claim from before the stop swallowed a note after it");
    }
    printf("  ok   — a restart forgets the claims of the run before\n");

    /* ---- an early step that ratchets: the sub-hits keep the step's timing ---- */
    {
        /* Step 2 is ten ticks early and ratchets x4 (six ticks apart), so its
         * second hit fires inside step 1 — which is six ticks LATE. */
        hx_t *h = begin();
        hx_set_param(h, "t1_c0_step_1_toggle", "72 100");
        hx_set_param(h, "t1_c0_step_1_ratch", "4");
        table(h, 1, -10 * GROOVE_FINE);
        ((seq8_instance_t *)h->inst)->groove.off[0] = 6 * GROOVE_FINE;
        hx_clear_capture(h);
        hx_set_param(h, "transport", "play_focus:1:0");
        hx_render(h, 140);
        hx_set_param(h, "transport", "stop");
        hx_render(h, 200);
        collect(&B);
        hx_destroy(h);
        HX_ASSERT(count(&B, 1, 72) == 4, "rig: the early step ratchets four times");
        for (int i = 0; i < 3; i++) {
            int gap = nth(&B, 1, 72, i + 1) - nth(&B, 1, 72, i);
            HX_ASSERT(gap >= 10 && gap <= 12, "an early step's ratchet hits are not evenly spaced");
        }
    }
    printf("  ok   — an early step's ratchet keeps its spacing\n");

    /* ---- Backward: a lock is not read ahead of a note that plays on time ---- */
    {
        int blk[2] = { -1, -1 }, sets[2] = { 0, 0 };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            hx_set_param(h, "t1_route", "schwung");
            hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
            hx_set_param(h, "t1_c0_step_15_toggle", "64 100");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 359 0");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 360 383 16383");   /* step 16: an early slot */
            hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
            hx_set_param(h, "t1_clip_playback_dir", "1");
            if (g) table(h, 1, -6 * GROOVE_FINE);
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, 150);
            for (int i = 0; i < hx_stub_event_count(); i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind != HX_PARAM_SET || strcmp(e->key, "synth:cutoff")) continue;
                sets[g]++;
                if (!strcmp(e->value, "0") && blk[g] < 0) blk[g] = e->block;
            }
            hx_destroy(h);
        }
        HX_ASSERT(sets[0] >= 2 && blk[0] >= 0, "rig: backward, the value goes high then low");
        HX_ASSERT(sets[1] == sets[0] && blk[1] == blk[0],
                  "on a Backward clip a lock was read ahead of its on-time note");
    }
    printf("  ok   — Backward: locks stay with their on-time notes\n");

    /* ---- a step's lock is written with its early note ---- */
    {
        int blk_note[2] = { -1, -1 }, blk_set[2] = { -1, -1 }, sets[2] = { 0, 0 };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            hx_set_param(h, "t1_route", "schwung");
            hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
            hx_set_param(h, "t1_c0_step_1_toggle", "64 100");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 23 0");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 24 47 16383");
            hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
            if (g) table(h, 1, -6 * GROOVE_FINE);
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, 150);                                   /* well into step 3, short of the wrap */
            for (int i = 0; i < hx_stub_event_count(); i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind == HX_PARAM_SET && !strcmp(e->key, "synth:cutoff")) {
                    sets[g]++;
                    if (!strcmp(e->value, "1") && blk_set[g] < 0) blk_set[g] = e->block;
                }
                if (e->kind == HX_MIDI_INTERNAL && (e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == 64
                        && e->bytes[3] > 0 && blk_note[g] < 0) blk_note[g] = e->block;
            }
            hx_destroy(h);
        }
        HX_ASSERT(blk_note[0] >= 0 && blk_set[0] >= 0 && blk_note[1] >= 0 && blk_set[1] >= 0,
                  "rig: the step's note or its lock never appeared");
        HX_ASSERT(blk_set[0] == blk_note[0], "rig: straight, the lock is written with its note");
        HX_ASSERT(blk_note[0] - blk_note[1] >= EARLY_LO && blk_note[0] - blk_note[1] <= EARLY_HI,
                  "rig: the step's note is early");
        HX_ASSERT(blk_set[1] == blk_note[1], "an early step's lock is written with its early note");
        HX_ASSERT(sets[1] == sets[0], "the lock was written, taken back and written again");
    }
    printf("  ok   — an early step's lock arrives with its note, once\n");

    /* ---- a lock late INSIDE an early step is not taken back before its tick ---- */
    {
        int sets[2] = { 0, 0 };
        for (int g = 0; g < 2; g++) {
            hx_t *h = begin();
            hx_set_param(h, "t1_route", "schwung");
            hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 0 43 0");
            hx_set_param(h, "t1_pa_set2", "0 1:synth:cutoff 44 95 16383");   /* 4 ticks before step 3 */
            hx_set_param(h, "pa_resolve", "1:synth:cutoff 1 synth:cutoff 0 0 1 0.01");
            if (g) table(h, 1, -6 * GROOVE_FINE);
            hx_clear_capture(h);
            hx_set_param(h, "transport", "play_focus:1:0");
            hx_render(h, 150);
            for (int i = 0; i < hx_stub_event_count(); i++) {
                const hx_midi_event *e = hx_stub_event(i);
                if (e->kind == HX_PARAM_SET && !strcmp(e->key, "synth:cutoff")) sets[g]++;
            }
            hx_destroy(h);
        }
        HX_ASSERT(sets[0] == 2, "rig: straight, the value is written low then high");
        HX_ASSERT(sets[1] == 2, "a lock inside an early step was written, taken back and written again");
    }
    printf("  ok   — a lock inside an early step is written once\n");

    printf("PASS: test_groove_early\n");
    return 0;
}
