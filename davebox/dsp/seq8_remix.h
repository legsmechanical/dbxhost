/* seq8_remix.h — Loop Remix: one bar of notes rearranged by TYPE x VARIATION,
 * after the RS7000's Real Time Loop Remix (the patterns: seq8_remix_data.h).
 *
 * A pure function on one bar, no allocation (the caller owns the scratch):
 * the Slicer remixes a clip's notes bar by bar, a Loop clip remixes sixteen
 * slot-notes (one per 1/16, key = the slot) and plays each event's slot of
 * the sample.
 *
 * The bar: L ticks, 16 slots of L/16, 64 steps of L/64. TYPE cuts it into
 * pieces (rmx_type_start); each piece plays from a source slot
 * (rmx_source[family][variation][piece]) slot by slot, wrapping within the
 * bar. A note keeps its offset in its slot, its gate (it may sound on past the
 * piece) and its velocity. Then the family adds:
 *   NORMAL   nothing;
 *   REVERSE  a flagged source slot's notes play reversed, gate doubled;
 *   ROLL     64 steps: the plain remix, or a run that replays the start of a
 *            slot of the piece-moved remix at the step's velocity;
 *   BREAK    each step's gate scaled by a percentage, 0 = silent;
 *   PITCH    a source slot's notes repitched (semitones), timing untouched.
 * REVERSE's and PITCH's sound changes travel with the SOURCE slot, wherever
 * the remix puts it (rev, pitch on each event, for the sample voice).
 *
 * Timing as the original machine: each slot's window opens `off` ticks before
 * its grid line (10 at 480 ppqn: a note played a little early belongs to the
 * slot it aimed at), so notes in the bar's last `off` ticks are dropped; a
 * first slot filled from another slot plays `off` ticks late.
 */
#ifndef SEQ8_REMIX_H
#define SEQ8_REMIX_H
#include <stdint.h>
#include <string.h>
#include "seq8_remix_data.h"

enum { RMX_NORMAL, RMX_REVERSE, RMX_ROLL, RMX_BREAK, RMX_PITCH, RMX_FAMILIES };
#define RMX_TYPES      16
#define RMX_VARS       16              /* per family */
#define RMX_SETTINGS   (RMX_FAMILIES * RMX_VARS)   /* the Variation knob's 80 steps */
#define RMX_MAX        512             /* events per bar, in and out */

typedef struct {
    int32_t tick;       /* in the bar, 0..L-1 */
    int32_t gate;       /* ticks, >= 1 */
    uint8_t vel;
    uint8_t key;        /* the caller's: a slice, a note, a Loop clip's slot */
    uint8_t src;        /* the source slot it came from (set by rmx_bar) */
    uint8_t rev;        /* REVERSE: play it backwards */
    int8_t  pitch;      /* PITCH: semitones */
    uint16_t id;        /* the caller's (carried through: a Slicer's source note) */
} rmx_ev_t;

/* A track under construction, the way the remix builds one: notes appended at
 * a write position P. STOP POINTS are where a trim may take hold: every note
 * start, every P after a pad or a copy, and a source's own stop points carried
 * through a copy. A trim (rmx_fix) never lengthens, and does nothing when a
 * stop point sits exactly on its target — which is how a late first slot can
 * keep the rest of its piece late. */
#define RMX_STOPS (RMX_MAX * 3)
typedef struct {
    rmx_ev_t ev[RMX_MAX];
    int      n;
    int32_t  P;
    int32_t  stop[RMX_STOPS];
    int      ns;
} rmx_trk_t;

typedef struct { rmx_trk_t S, A, B, R, F, snap; } rmx_work_t;

/* the window offset at bar length L: 10 ticks of a 1920-tick bar */
static inline int32_t rmx_off(int32_t L) { return (L * 10 + 960) / 1920; }

/* TYPE's pieces: start slots and lengths; returns the count */
static int rmx_pieces(int type, int *start, int *len) {
    int n = 0, i;
    if (type < 0 || type >= RMX_TYPES) return 0;
    while (n < 16 && rmx_type_start[type][n] != 255) { start[n] = rmx_type_start[type][n]; n++; }
    for (i = 0; i < n; i++) len[i] = (i + 1 < n ? start[i + 1] : 16) - start[i];
    return n;
}

static void rmx_t_init(rmx_trk_t *T) { T->n = 0; T->P = 0; T->ns = 0; }
static int rmx_t_isstop(const rmx_trk_t *T, int32_t x) {
    int i;
    for (i = 0; i < T->ns; i++) if (T->stop[i] == x) return 1;
    return 0;
}
static void rmx_t_stop(rmx_trk_t *T, int32_t x) { if (!rmx_t_isstop(T, x) && T->ns < RMX_STOPS) T->stop[T->ns++] = x; }
static void rmx_t_put(rmx_trk_t *T, const rmx_ev_t *e) { if (T->n < RMX_MAX) T->ev[T->n++] = *e; rmx_t_stop(T, e->tick); }
static void rmx_pad(rmx_trk_t *T, int32_t d) { T->P += d; rmx_t_stop(T, T->P); }

/* ---- The dials (Josh, 2026-11-11: "rs7k presets as a starting point and our
 * own direct controls to dial things in" · "I do still want to be able to do
 * what the 7k does through those effects"): a preset (setting) sets them;
 * at the preset's own values the result is the RS7000's exactly. ---- */
typedef struct {
    uint8_t shuffle;    /* 0..100: % of the pieces that take the preset's source (the rest: their own slot) */
    uint8_t reverse;    /* 0..100: % of the 16 source slots reversed (gate x2) */
    uint8_t roll;       /* 0..100: % of the variation's roll runs played */
    uint8_t brk;        /* 0..100: depth of the variation's break shape */
    int8_t  pitch;      /* -24..24: semitone range of the variation's pitch shape;
                         * negative mirrors it (what went up goes down) */
    uint8_t rate;       /* roll repeats: 0 the table's runs, 1 1/32, 2 1/64 */
    uint8_t vel;        /* roll repeats at the table's velocity (1) or as they were (0) */
} rmx_dials_t;

static int rmx_pitch_max(int var) {
    int k, m = 0;
    for (k = 0; k < 16; k++) { int a = rmx_pitch[var][k] < 0 ? -rmx_pitch[var][k] : rmx_pitch[var][k]; if (a > m) m = a; }
    return m;
}
static int rmx_rev_count(int var) { int k, n = 0; for (k = 0; k < 16; k++) n += rmx_rev_flag[var][k] ? 1 : 0; return n; }

/* the dials a preset (setting 0..79) sets */
static void rmx_dials_of(int setting, rmx_dials_t *d) {
    int fam = setting / RMX_VARS, var = setting % RMX_VARS;
    d->shuffle = 100;
    d->reverse = (uint8_t)(fam == RMX_REVERSE ? (rmx_rev_count(var) * 100 + 8) / 16 : 0);
    d->roll    = (uint8_t)(fam == RMX_ROLL ? 100 : 0);
    d->brk     = (uint8_t)(fam == RMX_BREAK ? 100 : 0);
    d->pitch   = (int8_t)(fam == RMX_PITCH ? rmx_pitch_max(var) : 0);
    d->rate    = 0;
    d->vel     = 1;
}
static int rmx_dials_same(const rmx_dials_t *a, const rmx_dials_t *b) {
    return a->shuffle == b->shuffle && a->reverse == b->reverse && a->roll == b->roll && a->brk == b->brk
        && a->pitch == b->pitch && a->rate == b->rate && a->vel == b->vel;
}

/* what one pass does to the notes it copies: reverse / pitch by source slot,
 * a velocity, a gate percentage (0 drops the note) */
typedef struct { const uint8_t *rev; const int8_t *semi; int vel; int pct; } rmx_xf_t;

static int32_t rmx_gate_scale(int32_t g, int pct) {
    int64_t v = (int64_t)g * pct / 100;
    return (int32_t)(v < 1 ? 1 : v > 0x1FFFFFF ? 0x1FFFFFF : v);
}

/* copy X's notes starting in [w0, w0+len) to P (wrapping at `wrap`, 0 = none),
 * P += len. Returns whether a note was placed. */
static int rmx_copy(rmx_trk_t *T, const rmx_trk_t *X, int32_t w0, int32_t len, int32_t wrap, const rmx_xf_t *xf) {
    int i, had = 0;
    for (i = 0; i < X->n; i++) {
        int32_t o = X->ev[i].tick - w0;
        if (wrap > 0 && o < 0) o += wrap;
        if (o < 0 || o >= len) continue;
        rmx_ev_t e = X->ev[i];
        e.tick = T->P + o;
        if (xf) {
            if (xf->rev) {
                if (xf->rev[e.src & 15]) { e.gate = rmx_gate_scale(e.gate, 200); e.rev = 1; }
                else e.gate = rmx_gate_scale(e.gate, 100);
            }
            if (xf->semi) e.pitch = xf->semi[e.src & 15];
            if (xf->vel >= 0) e.vel = (uint8_t)xf->vel;
            if (xf->pct >= 0) { if (!xf->pct) continue; e.gate = rmx_gate_scale(e.gate, xf->pct); }
        }
        rmx_t_put(T, &e);
        had = 1;
    }
    for (i = 0; i < X->ns; i++) {
        int32_t o = X->stop[i] - w0;
        if (wrap > 0 && o < 0) o += wrap;
        if (o > 0 && o < len) rmx_t_stop(T, T->P + o);
    }
    rmx_pad(T, len);
    return had;
}

/* trim back to `target`: never lengthens; a stop point there holds it */
static void rmx_fix(rmx_trk_t *T, int32_t target) {
    int i, k;
    if (T->P <= target || rmx_t_isstop(T, target)) return;
    for (i = k = 0; i < T->n; i++) if (T->ev[i].tick <= target) T->ev[k++] = T->ev[i];
    T->n = k;
    for (i = k = 0; i < T->ns; i++) if (T->stop[i] <= target) T->stop[k++] = T->stop[i];
    T->ns = k;
    T->P = target;
}

/* the source slot of piece p: the preset's when Shuffle takes it, else its own */
static int rmx_src(const uint8_t *take, int fam, int var, int p, int d) { return take[p] ? rmx_source[fam][var][p] : d; }

/* the slot-by-slot remix into T: each slot of each piece copied from its
 * source slot, a first slot from elsewhere `off` late */
static void rmx_slots(rmx_trk_t *T, const rmx_trk_t *S, int type, int fam, int var, const uint8_t *take,
                      const rmx_xf_t *xf, int32_t s, int32_t off) {
    int st[16], ln[16], np = rmx_pieces(type, st, ln), p, i;
    rmx_t_init(T);
    for (p = 0; p < np; p++) {
        int b = rmx_src(take, fam, var, p, st[p]);
        for (i = 0; i < ln[p]; i++) {
            int from = (b + i) & 15, to = st[p] + i;
            if (to == 0 && from != 0) rmx_pad(T, off);
            rmx_copy(T, S, from * s, s, 0, xf);
            rmx_fix(T, (to + 1) * s);
        }
    }
}

/* ROLL's piece-moved remix: each piece one block; a piece whose copy found
 * nothing is cleared and takes the next note after its window instead */
static void rmx_blocks(rmx_work_t *w, int type, int fam, int var, const uint8_t *take, const rmx_xf_t *xf,
                       int32_t s, int32_t off, int32_t L) {
    rmx_trk_t *A = &w->A;
    const rmx_trk_t *S = &w->S;
    int st[16], ln[16], np = rmx_pieces(type, st, ln), p, i;
    rmx_t_init(A);
    for (p = 0; p < np; p++) {
        int d = st[p], n = ln[p], b = rmx_src(take, fam, var, p, d), had, first_had = 1;
        int32_t cw0, clen;
        w->snap = *A;
        if (!(d == 0 && b != 0)) {
            cw0 = b * s; clen = n * s;
            had = rmx_copy(A, S, cw0, clen, L, xf);
            rmx_fix(A, d * s + n * s);
        } else {
            rmx_pad(A, off);
            w->snap = *A;
            first_had = rmx_copy(A, S, b * s, s, L, xf);
            rmx_fix(A, s);
            if (n == 1) continue;                       /* no checked copy: never filled */
            cw0 = (b + 1 == 16 ? 0 : b + 1) * s; clen = (n - 1) * s;
            had = rmx_copy(A, S, cw0, clen, L, xf);
            rmx_fix(A, n * s);
        }
        if (had) continue;
        *A = w->snap;
        {
            int32_t end = (cw0 + clen) % L, bd = 0x7FFFFFFF;
            int best = -1;
            for (i = 0; i < S->n; i++) {
                int32_t dd = S->ev[i].tick - end;
                if (dd < 0) dd += L;
                if (dd < bd) { bd = dd; best = i; }
            }
            if (best >= 0) {
                rmx_ev_t e = S->ev[best];
                e.tick = A->P;
                if (xf && xf->rev && xf->rev[e.src & 15]) { e.gate = rmx_gate_scale(e.gate, 200); e.rev = 1; }
                if (xf && xf->semi) e.pitch = xf->semi[e.src & 15];
                rmx_t_put(A, &e);
            }
        }
        rmx_pad(A, (d == 0 && b != 0 && !first_had) ? n * s : clen);
    }
}

/* One bar through the preset `setting` and the dials: `in` (ticks 0..L-1) ->
 * `out`, sorted by tick. Returns the count. */
static int rmx_bar_ex(rmx_work_t *w, int type, int setting, const rmx_dials_t *dl, int32_t L,
                      const rmx_ev_t *in, int nin, rmx_ev_t *out, int maxout) {
    int fam = setting / RMX_VARS, var = setting % RMX_VARS, i, j, k, n = 0;
    rmx_trk_t *res;
    uint8_t take[16], rev[16];
    int8_t semi[16];
    int st[16], ln[16], np;
    if (type < 0 || type >= RMX_TYPES || fam < 0 || fam >= RMX_FAMILIES || L < 64 || !dl) return 0;
    int32_t s = L / 16, q = L / 64, off = rmx_off(L);
    np = rmx_pieces(type, st, ln);
    /* Shuffle: the pieces taking the preset's source, in a fixed order (piece
     * p's turn: p*7 + var*5 mod 16, distinct) so turning up adds one at a time */
    {
        int want = (dl->shuffle * np + 50) / 100;
        memset(take, 0, sizeof take);
        for (k = 0; k < 16 && want > 0; k++)
            for (i = 0; i < np; i++) if (((i * 7 + var * 5) & 15) == k) { take[i] = 1; want--; break; }
    }
    /* Reverse: the variation's REVERSE slots first, then the rest (k*5 + var*3 mod 16) */
    {
        int want = (dl->reverse * 16 + 50) / 100, ord[16], no = 0;
        for (k = 0; k < 16; k++) if (rmx_rev_flag[var][k]) ord[no++] = k;
        for (k = 0; k < 16; k++) { int sl = (k * 5 + var * 3) & 15; if (!rmx_rev_flag[var][sl]) ord[no++] = sl; }
        memset(rev, 0, sizeof rev);
        for (k = 0; k < want && k < 16; k++) rev[ord[k]] = 1;
    }
    /* Pitch: the variation's shape scaled to the range */
    {
        int m = rmx_pitch_max(var);
        for (k = 0; k < 16; k++) {
            int t2 = rmx_pitch[var][k] * (int)dl->pitch;
            semi[k] = (int8_t)(m ? (t2 >= 0 ? (t2 * 2 + m) / (2 * m) : -((-t2 * 2 + m) / (2 * m))) : 0);
        }
    }
    int any_rev = 0, any_semi = 0;
    for (k = 0; k < 16; k++) { any_rev |= rev[k]; any_semi |= semi[k] != 0; }
    /* REVERSE's gate rule applies whenever reversing is in play (as the
     * RS7000's REVERSE does on every note it moves) */
    rmx_xf_t xf = { (any_rev || fam == RMX_REVERSE) ? rev : NULL, any_semi || fam == RMX_PITCH ? semi : NULL, -1, -1 };
    /* the scratch bar: `off` of lead-in, then the bar, cut at L */
    rmx_t_init(&w->S);
    rmx_t_stop(&w->S, off);
    for (i = 0; i < nin; i++) {
        if (in[i].tick < 0 || in[i].tick >= L - off) continue;
        rmx_ev_t e = in[i];
        e.tick += off;
        e.src = (uint8_t)(e.tick / s > 15 ? 15 : e.tick / s);
        e.rev = 0; e.pitch = 0;
        if (e.gate < 1) e.gate = 1;
        rmx_t_put(&w->S, &e);
    }
    w->S.P = L;
    /* rearrange (B: slot by slot) */
    rmx_slots(&w->B, &w->S, type, fam, var, take, &xf, s, off);
    res = &w->B;
    /* BREAK: each step's gate by the shape's depth */
    if (dl->brk) {
        rmx_t_init(&w->R);
        for (j = 0; j < 64; j++) {
            int pct = rmx_break_pct[var][j];
            rmx_xf_t xg = { NULL, NULL, -1, 100 - (100 - pct) * (int)dl->brk / 100 };
            rmx_copy(&w->R, res, j * q, q, 0, &xg);
            rmx_fix(&w->R, (j + 1) * q);
        }
        w->B = w->R;
        res = &w->B;
    }
    /* ROLL: runs of the variation's table (Roll % of them, in a fixed order),
     * replaying the piece-moved remix (A), at the table's velocity */
    if (dl->roll) {
        int rs[64], rv[64], rm[64], nr = 0, keep[64], want;
        for (j = 0; j < 64; ) {
            int v = rmx_roll_step[var][j], m = 1;
            while (j + m < 64 && rmx_roll_step[var][j + m] == 254) m++;
            if (v < 16) { rs[nr] = j; rv[nr] = v; rm[nr] = m; nr++; j += m; } else j++;
        }
        want = (dl->roll * nr + 50) / 100;
        memset(keep, 0, sizeof keep);
        for (k = 0; k < 64 && want > 0; k++)
            for (i = 0; i < nr; i++) if (((i * 7 + var) & 63) == k) { keep[i] = 1; want--; break; }
        rmx_blocks(w, type, fam, var, take, &xf, s, off, L);
        rmx_t_init(&w->R);
        if (nr && keep[0] && rs[0] == 0 && rv[0] != 0) rmx_pad(&w->R, off);
        for (j = 0; j < 64; ) {
            int r = -1;
            for (i = 0; i < nr; i++) if (keep[i] && rs[i] == j) { r = i; break; }
            if (r < 0) {
                /* the plain remix till the next kept run */
                int m = 1;
                for (;;) {
                    int hit = 0;
                    if (j + m >= 64) break;
                    for (i = 0; i < nr; i++) if (keep[i] && rs[i] == j + m) hit = 1;
                    if (hit) break;
                    /* (a keep run in the table stops at a dropped run's start too, as before) */
                    if (rmx_roll_step[var][j + m] != 255 && rmx_roll_step[var][j + m] != 254 && dl->roll >= 100) break;
                    m++;
                }
                rmx_copy(&w->R, res, j * q, m * q, w->B.P, NULL);
                rmx_fix(&w->R, j * q + m * q);
                j += m;
            } else {
                /* a run: the table's, or re-split into 1/32 / 1/64 repeats */
                int m = rm[r], rep = dl->rate == 1 ? 2 : dl->rate == 2 ? 1 : m, x;
                for (x = 0; x < m; x += rep) {
                    int len = (x + rep <= m) ? rep : m - x;
                    rmx_xf_t xv = { NULL, NULL, dl->vel ? rmx_roll_vel[var][j + x] : -1, -1 };
                    rmx_copy(&w->R, &w->A, rv[r] * s, len * q, w->A.P, &xv);
                    rmx_fix(&w->R, (j + x) * q + len * q);
                }
                j += m;
            }
        }
        res = &w->R;
    }
    /* the bar back: [0, L) of it, trimmed at L, the lead-in dropped */
    rmx_t_init(&w->F);
    rmx_copy(&w->F, res, 0, L, 0, NULL);
    rmx_fix(&w->F, L);
    for (i = 0; i < w->F.n && n < maxout; i++) {
        if (w->F.ev[i].tick < off) continue;
        rmx_ev_t e = w->F.ev[i];
        e.tick -= off;
        for (j = n; j > 0 && out[j - 1].tick > e.tick; j--) out[j] = out[j - 1];
        out[j] = e; n++;
    }
    return n;
}

/* One bar at the preset's own dials: the RS7000's remix. */
static int rmx_bar(rmx_work_t *w, int type, int setting, int32_t L,
                   const rmx_ev_t *in, int nin, rmx_ev_t *out, int maxout) {
    rmx_dials_t d;
    if (setting < 0 || setting >= RMX_SETTINGS) return 0;
    rmx_dials_of(setting, &d);
    return rmx_bar_ex(w, type, setting, &d, L, in, nin, out, maxout);
}
#endif
