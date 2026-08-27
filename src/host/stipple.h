/* stipple.h — the parity rule for a 50% checkerboard fill.
 *
 * A 1-bit display has no tint and no dim, so "knocked back" is said with a
 * screen-door: write every other pixel and leave the rest. The display API has
 * no pattern fill, so doing it from JS costs one host call per pixel — 4096 for
 * a full 128x64 screen, against roughly 2400 for all the text on a busy one.
 * Hence a primitive (`stipple_rect`), bound in both JS contexts.
 *
 * ⭑⭑ THIS HEADER OWNS ONE THING: which x a row starts on. The two callers
 * (src/host/js_display.c and src/schwung_host.c) each have their own set_pixel
 * and so must each run their own loop, but the ARITHMETIC lives here once.
 * Written as two copies first, which is the same second-source bug this tree
 * keeps producing: the copies agree until one is fixed.
 *
 * ⚠ Parity is computed from ABSOLUTE coordinates, never from loop counters, so
 * the pattern is continuous across separate calls — stippling two adjacent
 * rects must not show a seam where they meet.
 */
#ifndef SCHWUNG_STIPPLE_H
#define SCHWUNG_STIPPLE_H

/* First x at or after `x` on row `y` whose parity matches `phase` (0 or 1).
 * Step by 2 from there to walk the row.
 *
 * `phase` selects which half of the checkerboard is written, so two calls with
 * opposite phases cover a rect completely — that is what lets a caller knock
 * back a region and then paint the complementary half a different value.
 *
 * ⚠ WHICH half phase 0 means is ARBITRARY, and deliberately not pinned. The
 * first draft of this expression computed the opposite parity and I called it a
 * bug; it was not — both are 50% checkerboards, complementary and seam-free,
 * differing only by a one-pixel offset nobody can see. What MUST hold is that
 * the two phases differ from each other, which is what the unit test asserts.
 * Do not add a test that fixes phase 0 to a particular corner: it would pin a
 * convention no caller can depend on and fail the next equivalent rewrite. */
static inline int stipple_row_start(int x, int y, int phase) {
    return (((x + y) & 1) == (phase & 1)) ? x : x + 1;
}

#endif /* SCHWUNG_STIPPLE_H */
