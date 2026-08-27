/* tests/host/test_stipple.c — the checkerboard parity rule.
 *
 * `stipple_rect` knocks out every other pixel to say "this is behind
 * something", and the rule that decides WHICH pixel is arithmetic I got
 * backwards on the first write: `^ phase ? 0 : 1` starts a row at x when the
 * parities DIFFER, which is the opposite of what is wanted. It looked right.
 *
 * The properties that matter, none of which an eyeball on one render can see:
 *   - it is a true 50% pattern (never 0%, never 100%, never a stripe)
 *   - the two phases are EXACTLY complementary — together they cover every
 *     pixel, and they never both write the same one
 *   - the pattern is continuous across a call boundary, so two adjacent rects
 *     do not show a seam where they meet
 */
#include <stdio.h>
#include <string.h>
#include "stipple.h"

static int failed = 0;
static void ok(const char *l) { printf("  ok   — %s\n", l); }
static void bad(const char *l, const char *why) {
    printf("  FAIL — %s: %s\n", l, why); failed = 1;
}

#define W 32
#define H 16
static unsigned char fb[H][W];

/* The same loop both real callers run, over a local framebuffer. */
static void stipple(int x, int y, int w, int h, int value, int phase) {
    for (int yi = y; yi < y + h; yi++) {
        if (yi < 0 || yi >= H) continue;
        for (int xi = stipple_row_start(x, yi, phase); xi < x + w; xi += 2) {
            if (xi < 0 || xi >= W) continue;
            fb[yi][xi] = (unsigned char)value;
        }
    }
}
static int count(void) {
    int n = 0;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) n += fb[y][x] ? 1 : 0;
    return n;
}

int main(void) {
    /* 1. exactly half, both phases */
    for (int phase = 0; phase <= 1; phase++) {
        memset(fb, 0, sizeof fb);
        stipple(0, 0, W, H, 1, phase);
        int n = count();
        if (n != W * H / 2) {
            char m[96]; snprintf(m, sizeof m, "phase %d wrote %d px, expected %d", phase, n, W * H / 2);
            bad("a full-area stipple covers exactly half", m);
        } else ok(phase ? "phase 1 covers exactly half" : "phase 0 covers exactly half");
    }

    /* 2. the phases are complementary — together everything, never the same px */
    memset(fb, 0, sizeof fb);
    stipple(0, 0, W, H, 1, 0);
    unsigned char first[H][W];
    memcpy(first, fb, sizeof fb);
    memset(fb, 0, sizeof fb);
    stipple(0, 0, W, H, 1, 1);
    int overlap = 0, uncovered = 0;
    for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
        if (first[y][x] && fb[y][x]) overlap++;
        if (!first[y][x] && !fb[y][x]) uncovered++;
    }
    if (overlap) bad("the two phases are complementary", "they overlap");
    else if (uncovered) bad("the two phases are complementary", "they leave gaps");
    else ok("the two phases are exactly complementary");

    /* 3. it is a CHECKERBOARD, not stripes — every neighbour differs.
     * ⚠ A row-parity bug still passes tests 1 and 2: whole-row stripes are also
     * 50% and also complementary. This is the assertion that tells them apart. */
    memset(fb, 0, sizeof fb);
    stipple(0, 0, W, H, 1, 0);
    int bad_neighbour = 0;
    for (int y = 0; y < H - 1; y++) for (int x = 0; x < W - 1; x++) {
        if (fb[y][x] == fb[y][x + 1]) bad_neighbour++;
        if (fb[y][x] == fb[y + 1][x]) bad_neighbour++;
    }
    if (bad_neighbour) bad("adjacent pixels always differ (a checkerboard, not stripes)", "found equal neighbours");
    else ok("adjacent pixels always differ — a checkerboard, not stripes");

    /* 4. continuous across a call boundary: two adjacent rects, no seam */
    memset(fb, 0, sizeof fb);
    stipple(0, 0, 7, H, 1, 0);        /* an ODD width, so a naive */
    stipple(7, 0, W - 7, H, 1, 0);    /* per-rect parity would flip here */
    int seam = 0;
    for (int y = 0; y < H; y++) if (fb[y][6] == fb[y][7]) seam++;
    if (seam) bad("the pattern is continuous across a call boundary", "there is a seam at x=7");
    else ok("no seam where two adjacent rects meet");

    /* 5. degenerate rects write nothing */
    memset(fb, 0, sizeof fb);
    stipple(4, 4, 0, 5, 1, 0);
    stipple(4, 4, 5, 0, 1, 0);
    if (count()) bad("a zero-sized rect writes nothing", "it wrote pixels");
    else ok("a zero-sized rect writes nothing");

    /* 6. CONTROL: the fixture can see a wrong rule at all.
     * Without this every assertion above could be passing on a stipple that
     * never wrote anything. */
    memset(fb, 0, sizeof fb);
    stipple(0, 0, W, H, 1, 0);
    if (count() == 0) bad("CONTROL: the stipple writes at all", "nothing was written");
    else ok("CONTROL: the stipple does write");

    printf(failed ? "\nFAILED\n" : "\nOK\n");
    return failed;
}
