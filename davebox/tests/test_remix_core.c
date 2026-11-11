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
    /* a gate percentage: BREAK's table value scales the gate */
    for (k = 0; k < RMX_VARS; k++) {
        int step, pct = 0;
        for (step = 0; step < 64; step += 4) if (rmx_break_pct[k][step] > 0 && rmx_break_pct[k][step] < 100) { pct = rmx_break_pct[k][step]; break; }
        if (!pct) continue;
        memset(in, 0, sizeof in);
        in[0].tick = step * 6; in[0].gate = 100; in[0].vel = 100; in[0].key = 1;
        /* TYPE 16 + this variation's first source: find where slot step/4 lands */
        n = rmx_bar(&W, 15, setting(RMX_BREAK, k + 1), L, in, 1, out, RMX_MAX);
        for (i = 0; i < n; i++) {
            int st = (out[i].tick + 2) / 6;
            int want = rmx_break_pct[k][st];
            HX_ASSERT(out[i].gate == (100 * want / 100 < 1 ? 1 : 100 * want / 100), "BREAK: gate not scaled by the step's percentage");
        }
        break;
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

    /* ==== 7. out of range settings play nothing, never crash ==== */
    HX_ASSERT(rmx_bar(&W, 16, 0, L, in, 1, out, RMX_MAX) == 0, "TYPE 17 played");
    HX_ASSERT(rmx_bar(&W, 0, RMX_SETTINGS, L, in, 1, out, RMX_MAX) == 0, "setting 80 played");

    printf("PASS: test_remix_core\n");
    return 0;
}
