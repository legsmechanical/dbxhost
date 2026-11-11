/* tests/test_remix_core.c — Loop Remix's bar function (dsp/seq8_remix.h).
 *
 * One bar of dAVEBOx ticks (384: slots of 24, steps of 6, a window offset of
 * 2) through rmx_bar, on the phrase a Loop clip uses (one note per slot, key =
 * the slot) and on a few hand-made ones. Each family's own effect is pinned:
 * the pieces and their sources, the late first slot, REVERSE's flag (gate x2,
 * rev), PITCH's semitones by source slot, BREAK's silence and gate scaling,
 * ROLL's runs and their velocity, and the bar's last ticks dropping out. */
#include "harness.h"

#define L 384
static rmx_work_t W;
static rmx_ev_t in[64], out[RMX_MAX];

/* the Loop clip's phrase: slot k -> key k, a slot long */
static int loop_phrase(void) {
    int k;
    memset(in, 0, sizeof in);
    for (k = 0; k < 16; k++) { in[k].tick = k * 24; in[k].gate = 24; in[k].vel = 100; in[k].key = (uint8_t)k; }
    return 16;
}
static int setting(int fam, int var1) { return fam * RMX_VARS + (var1 - 1); }

int main(void) {
    int n, i, k;

    HX_ASSERT(rmx_off(L) == 2, "the window offset at 384 is not 2");

    /* ==== 1. NORMAL: TYPE 1 VARIATION 1 = slots 0..9 then 0..5, on the grid ==== */
    n = rmx_bar(&W, 0, setting(RMX_NORMAL, 1), L, in, loop_phrase(), out, RMX_MAX);
    HX_ASSERT(n == 16, "T1 NORMAL 1: not 16 events");
    for (i = 0; i < 16; i++) {
        int want = i < 10 ? i : i - 10;
        HX_ASSERT(out[i].tick == i * 24, "T1 NORMAL 1: off the grid");
        HX_ASSERT(out[i].key == want && out[i].src == want, "T1 NORMAL 1: wrong source slot");
        HX_ASSERT(out[i].gate == 24 && out[i].vel == 100 && !out[i].rev && !out[i].pitch, "T1 NORMAL 1: changed a note");
    }

    /* ==== 2. REVERSE 9 on TYPE 1: sources 4.. and 14.., the first slot late ==== */
    n = rmx_bar(&W, 0, setting(RMX_REVERSE, 9), L, in, loop_phrase(), out, RMX_MAX);
    HX_ASSERT(n == 16, "T1 REVERSE 9: not 16 events");
    HX_ASSERT(out[0].tick == 2 && out[0].key == 4, "T1 REVERSE 9: slot 0 is not source 4, 2 ticks late");
    for (i = 1; i < 16; i++) {
        int want = i < 10 ? 4 + i : (14 + i - 10) & 15;
        HX_ASSERT(out[i].tick == i * 24 && out[i].key == want, "T1 REVERSE 9: wrong piece layout");
    }
    for (i = 0; i < 16; i++) {
        int f = rmx_rev_flag[8][out[i].src];
        HX_ASSERT(out[i].rev == f, "REVERSE: rev does not follow the source slot's flag");
        HX_ASSERT(out[i].gate == (f ? 48 : 24), "REVERSE: a flagged slot's gate is not doubled");
    }
    for (k = 0, i = 0; i < 16; i++) k += out[i].rev;
    HX_ASSERT(k > 0 && k < 16, "REVERSE 9: no slot (or every slot) reversed — the flag was not read");

    /* ==== 3. PITCH 1: semitones by SOURCE slot, timing as NORMAL's ==== */
    n = rmx_bar(&W, 15, setting(RMX_PITCH, 1), L, in, loop_phrase(), out, RMX_MAX);
    for (i = 0, k = 0; i < n; i++) {
        HX_ASSERT(out[i].pitch == rmx_pitch[0][out[i].src], "PITCH: semitones not the source slot's");
        k |= out[i].pitch != 0;
        HX_ASSERT(out[i].gate == 24 && !out[i].rev, "PITCH: changed the gate or reversed");
    }
    HX_ASSERT(k, "PITCH 1: nothing pitched");

    /* ==== 4. BREAK 1: step 56 on is silent (0 %), the rest at 100 % ==== */
    HX_ASSERT(rmx_break_pct[0][56] == 0 && rmx_break_pct[0][0] == 100, "data: BREAK 1 changed");
    n = rmx_bar(&W, 15, setting(RMX_BREAK, 1), L, in, loop_phrase(), out, RMX_MAX);
    for (i = 0; i < n; i++) {
        int step = (out[i].tick + 2) / 6;     /* back on the scratch grid */
        HX_ASSERT(rmx_break_pct[0][step], "BREAK 1: a note in a silent step");
    }
    HX_ASSERT(n > 0 && n < 16, "BREAK 1: nothing (or nothing) silenced");
    /* a gate percentage: every BREAK variation, on the Loop phrase — each
     * note's gate is its step's percentage of 24 */
    {
        int scaled = 0;
        for (k = 0; k < RMX_VARS; k++) {
            n = rmx_bar(&W, 15, setting(RMX_BREAK, k + 1), L, in, loop_phrase(), out, RMX_MAX);
            for (i = 0; i < n; i++) {
                int pct = rmx_break_pct[k][(out[i].tick + 2) / 6];
                int want = 24 * pct / 100 < 1 ? 1 : 24 * pct / 100;
                HX_ASSERT(out[i].gate == want, "BREAK: gate not scaled by the step's percentage");
                scaled += pct > 0 && pct < 100;
            }
        }
        HX_ASSERT(scaled > 0, "BREAK: no note landed on a partial step — the check pinned nothing");
    }

    /* ==== 5. ROLL 1: the last 16 steps are 32nd runs of slot 12, at the table's velocities ==== */
    HX_ASSERT(rmx_roll_step[0][56] == 12 && rmx_roll_step[0][57] == 254, "data: ROLL 1 changed");
    n = rmx_bar(&W, 15, setting(RMX_ROLL, 1), L, in, loop_phrase(), out, RMX_MAX);
    {
        int runs = 0;
        for (i = 0; i < n; i++) {
            int st = (out[i].tick + 2) / 6;
            if (st >= 56) {
                HX_ASSERT(st % 2 == 0, "ROLL 1: a run off its 32nd");
                HX_ASSERT(out[i].vel == rmx_roll_vel[0][st], "ROLL 1: velocity not the run's");
                runs++;
            } else HX_ASSERT(out[i].vel == 100, "ROLL 1: the plain remix's velocity changed");
        }
        HX_ASSERT(runs == 4, "ROLL 1: not four roll runs in the last slot");
    }

    /* ==== 6. the bar's last `off` ticks drop out; a little-early note keeps its slot ==== */
    memset(in, 0, sizeof in);
    in[0].tick = 383; in[0].gate = 10; in[0].vel = 100; in[0].key = 7;
    n = rmx_bar(&W, 15, setting(RMX_NORMAL, 1), L, in, 1, out, RMX_MAX);
    HX_ASSERT(n == 0, "a note in the bar's last 2 ticks survived");
    memset(in, 0, sizeof in);
    in[0].tick = 23; in[0].gate = 10; in[0].vel = 100; in[0].key = 7;    /* aimed at slot 1 */
    n = rmx_bar(&W, 0, setting(RMX_NORMAL, 1), L, in, 1, out, RMX_MAX);
    HX_ASSERT(n >= 1 && out[0].src == 1 && out[0].tick == 23, "a note 1 tick early left its slot");

    /* ==== 8. THE DIALS (Josh, 2026-11-11: "rs7k presets as a starting point
     * and our own direct controls to dial things in" · "I do still want to be
     * able to do what the 7k does") ==== */
    {
        rmx_dials_t d, d0;
        static rmx_ev_t o2[RMX_MAX];
        int n2, set;
        /* a preset's own dials ARE rmx_bar (the RS7000), every TYPE x preset */
        for (set = 0; set < RMX_SETTINGS; set++) {
            int ty;
            rmx_dials_of(set, &d);
            for (ty = 0; ty < RMX_TYPES; ty++) {
                n = rmx_bar(&W, ty, set, L, in, loop_phrase(), out, RMX_MAX);
                n2 = rmx_bar_ex(&W, ty, set, &d, L, in, loop_phrase(), o2, RMX_MAX);
                HX_ASSERT(n == n2 && !memcmp(out, o2, sizeof out[0] * (size_t)n), "a preset's own dials differ from the RS7000 remix");
            }
        }
        /* the preset's values */
        rmx_dials_of(RMX_REVERSE * RMX_VARS + 8, &d0);
        HX_ASSERT(d0.shuffle == 100 && d0.reverse == 50 && !d0.roll && !d0.brk && !d0.pitch, "REVERSE 9's dials are not 100/50/0/0/0");
        rmx_dials_of(RMX_PITCH * RMX_VARS + 0, &d0);
        HX_ASSERT(d0.pitch == 1, "PITCH 1's range is not its table's 1 st");

        /* Shuffle 0: every piece its own slot (on a preset that moves them) */
        rmx_dials_of(RMX_NORMAL * RMX_VARS + 0, &d); d.shuffle = 0;
        n = rmx_bar_ex(&W, 0, RMX_NORMAL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        HX_ASSERT(n == 16, "Shuffle 0: not 16");
        for (i = 0; i < 16; i++) HX_ASSERT(out[i].key == i && out[i].tick == i * 24, "Shuffle 0 moved a piece");
        /* ...and turned up, one more piece takes the preset's source at a time (never fewer) */
        {
            int last = 0, sh;
            for (sh = 0; sh <= 100; sh += 5) {
                int moved = 0;
                rmx_dials_of(RMX_NORMAL * RMX_VARS + 1, &d); d.shuffle = (uint8_t)sh;
                n = rmx_bar_ex(&W, 15, RMX_NORMAL * RMX_VARS + 1, &d, L, in, loop_phrase(), out, RMX_MAX);
                for (i = 0; i < n; i++) moved += out[i].key != (out[i].tick + 2) / 24;
                HX_ASSERT(moved >= last, "Shuffle up moved fewer pieces");
                last = moved;
            }
            HX_ASSERT(last > 0, "Shuffle 100 moved nothing (NORMAL 2 on TYPE 16)");
        }
        /* Reverse 0 on a Reverse preset: nothing reversed; 100: every slot */
        rmx_dials_of(RMX_REVERSE * RMX_VARS + 8, &d); d.reverse = 0;
        n = rmx_bar_ex(&W, 15, RMX_REVERSE * RMX_VARS + 8, &d, L, in, loop_phrase(), out, RMX_MAX);
        for (i = 0; i < n; i++) HX_ASSERT(!out[i].rev && out[i].gate == 24, "Reverse 0 still reversed a slot");
        d.reverse = 100;
        n = rmx_bar_ex(&W, 15, RMX_REVERSE * RMX_VARS + 8, &d, L, in, loop_phrase(), out, RMX_MAX);
        for (i = 0; i < n; i++) HX_ASSERT(out[i].rev && out[i].gate == 48, "Reverse 100 left a slot forwards");
        /* ...and on a NORMAL preset (families combine): Reverse 25 % = 4 slots */
        rmx_dials_of(RMX_NORMAL * RMX_VARS + 0, &d); d.reverse = 25; d.shuffle = 0;   /* every slot heard once */
        n = rmx_bar_ex(&W, 15, RMX_NORMAL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        { int src[16] = {0}, nr = 0; for (i = 0; i < n; i++) if (out[i].rev) src[out[i].src] = 1; for (i = 0; i < 16; i++) nr += src[i];
          HX_ASSERT(nr == 4, "Reverse 25 % on NORMAL is not 4 source slots"); }
        /* Roll on a NORMAL preset: the variation's runs, at its velocities */
        rmx_dials_of(RMX_NORMAL * RMX_VARS + 0, &d); d.roll = 100;
        n = rmx_bar_ex(&W, 15, RMX_NORMAL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        { int runs = 0; for (i = 0; i < n; i++) if ((out[i].tick + 2) / 6 >= 56) { HX_ASSERT(out[i].vel == rmx_roll_vel[0][(out[i].tick + 2) / 6], "Roll on NORMAL: not the run's velocity"); runs++; }
          HX_ASSERT(runs == 4, "Roll 100 % on NORMAL 1: not ROLL 1's four runs"); }
        /* ...Rate 1/64: the 32nd runs re-split into 64ths (twice the repeats) */
        d.rate = 2;
        n = rmx_bar_ex(&W, 15, RMX_NORMAL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        { int runs = 0; for (i = 0; i < n; i++) if ((out[i].tick + 2) / 6 >= 56) runs++;
          HX_ASSERT(runs == 8, "Rate 1/64: not eight repeats in ROLL 1's last slot"); }
        /* ...Vel off: the repeats keep the note's own velocity */
        d.rate = 0; d.vel = 0;
        n = rmx_bar_ex(&W, 15, RMX_NORMAL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        for (i = 0; i < n; i++) HX_ASSERT(out[i].vel == 100, "Vel off: a repeat took the table's velocity");
        /* ...Roll 0 on a ROLL preset: just its rearrangement */
        rmx_dials_of(RMX_ROLL * RMX_VARS + 0, &d); d.roll = 0;
        n = rmx_bar_ex(&W, 15, RMX_ROLL * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        HX_ASSERT(n == 16, "Roll 0 on ROLL 1: not the 16 plain pieces");
        for (i = 0; i < 16; i++) HX_ASSERT(out[i].vel == 100, "Roll 0 still rolled");
        /* Break 50 % on BREAK 1: no step silent, the cut steps' gates between */
        rmx_dials_of(RMX_BREAK * RMX_VARS + 0, &d); d.brk = 50;
        n = rmx_bar_ex(&W, 15, RMX_BREAK * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        HX_ASSERT(n == 16, "Break 50 % silenced a step");
        for (i = 0; i < n; i++) {
            int pct = rmx_break_pct[0][(out[i].tick + 2) / 6], want = 24 * (100 - (100 - pct) / 2) / 100;
            HX_ASSERT(out[i].gate == (want < 1 ? 1 : want), "Break 50 %: a gate not half way to the shape");
        }
        /* Pitch on a PITCH preset: the range scales its shape (1 st -> 12) */
        rmx_dials_of(RMX_PITCH * RMX_VARS + 0, &d); d.pitch = 12;
        n = rmx_bar_ex(&W, 15, RMX_PITCH * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        for (i = 0; i < n; i++) HX_ASSERT(out[i].pitch == rmx_pitch[0][out[i].src] * 12, "Pitch 12 on PITCH 1: the shape not scaled");
        /* ...and bipolar (Josh, 2026-11-11: "shouldn't pitch on remix be
         * bipolar?"): a negative range mirrors the shape, slot for slot */
        d.pitch = -12;
        n = rmx_bar_ex(&W, 15, RMX_PITCH * RMX_VARS + 0, &d, L, in, loop_phrase(), out, RMX_MAX);
        k = 0;
        for (i = 0; i < n; i++) { HX_ASSERT(out[i].pitch == -rmx_pitch[0][out[i].src] * 12, "Pitch -12 on PITCH 1: not the shape mirrored"); k |= out[i].pitch != 0; }
        HX_ASSERT(k, "Pitch -12 on PITCH 1: nothing pitched");
        /* a scaled range rounds the same way either side of 0 (PITCH 12's shape) */
        {
            int up[RMX_MAX], nu, j;
            rmx_dials_of(RMX_PITCH * RMX_VARS + 11, &d); d.pitch = 7;
            nu = rmx_bar_ex(&W, 15, RMX_PITCH * RMX_VARS + 11, &d, L, in, loop_phrase(), out, RMX_MAX);
            for (j = 0; j < nu; j++) up[j] = out[j].pitch;
            d.pitch = -7;
            n = rmx_bar_ex(&W, 15, RMX_PITCH * RMX_VARS + 11, &d, L, in, loop_phrase(), out, RMX_MAX);
            HX_ASSERT(n == nu, "Pitch -7: a different bar from +7");
            for (j = 0; j < n; j++) HX_ASSERT(out[j].pitch == -up[j], "Pitch -7 is not +7 mirrored note for note");
        }
    }

    /* ==== 7. out of range settings play nothing, never crash ==== */
    HX_ASSERT(rmx_bar(&W, 16, 0, L, in, 1, out, RMX_MAX) == 0, "TYPE 17 played");
    HX_ASSERT(rmx_bar(&W, 0, RMX_SETTINGS, L, in, 1, out, RMX_MAX) == 0, "setting 80 played");

    printf("PASS: test_remix_core\n");
    return 0;
}
