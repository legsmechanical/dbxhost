/* tests/test_key_builder.c — kb() must produce EXACTLY what snprintf did.
 *
 * WHY: a mis-built state key does not crash and does not log. It reads as
 * ABSENT, so the setting it names silently keeps its default and the user's
 * project comes back subtly wrong. There is no runtime signal at all — which
 * is why this is exhaustive rather than a spot-check.
 *
 * Every shape the loader uses, over every index it can pass (deliberately
 * beyond the real bounds, so raising DRUM_LANES or NUM_CLIPS cannot quietly
 * outgrow the builder), plus the digit-width boundaries 9/10, 99/100. */
#include "harness.h"

static int checks = 0;

static void eq(const char *got, const char *want) {
    if (strcmp(got, want)) {
        fprintf(stderr, "FAIL: kb gave <%s>, snprintf gives <%s>\n", got, want);
        HX_ASSERT(0, "key builder disagreed with snprintf");
    }
    checks++;
}

int main(void) {
    char got[64], want[64];
    int i, j, k;

    /* Indices well past NUM_TRACKS / NUM_CLIPS / DRUM_LANES on purpose. */
    for (i = 0; i < 40; i++)
        for (j = 0; j < 40; j++)
            for (k = 0; k < 40; k++) {
                kb(got, "t", i, "l", j, "rvs", k, NULL);
                snprintf(want, sizeof(want), "t%dl%drvs%d", i, j, k);   eq(got, want);

                kb(got, "t", i, "l", j, "rn", k, NULL);
                snprintf(want, sizeof(want), "t%dl%drn%d", i, j, k);    eq(got, want);

                kb(got, "t", i, "c", j, "at", k, NULL);
                snprintf(want, sizeof(want), "t%dc%dat%d", i, j, k);    eq(got, want);

                kb(got, "t", i, "c", j, "_arsv", k, NULL);
                snprintf(want, sizeof(want), "t%dc%d_arsv%d", i, j, k); eq(got, want);

                kb(got, "t", i, "c", j, "_arsi", k, NULL);
                snprintf(want, sizeof(want), "t%dc%d_arsi%d", i, j, k); eq(got, want);

                kb(got, "t", i, "c", j, "l", k, "_n");
                snprintf(want, sizeof(want), "t%dc%dl%d_n", i, j, k);   eq(got, want);
            }

    /* Digit-width boundaries, including the 3-digit range kb_num supports. */
    {
        static const int edge[] = { 0, 1, 9, 10, 11, 99, 100, 101, 999 };
        size_t a, b;
        for (a = 0; a < sizeof(edge) / sizeof(*edge); a++)
            for (b = 0; b < sizeof(edge) / sizeof(*edge); b++) {
                kb(got, "t", edge[a], "c", edge[b], "l", edge[a], "_n");
                snprintf(want, sizeof(want), "t%dc%dl%d_n", edge[a], edge[b], edge[a]);
                eq(got, want);
                /* the i3-omitted form */
                kb(got, "t", edge[a], "c", edge[b], "_len", -1, NULL);
                snprintf(want, sizeof(want), "t%dc%d_len", edge[a], edge[b]);
                eq(got, want);

                /* ⚠ i3 OMITTED **and** a trailing literal. No caller uses this
                 * combination today, which is exactly why it needs pinning: a
                 * mutation making l4 conditional on i3 >= 0 SURVIVED the first
                 * version of this test. The builder's contract is the four
                 * parts being independent, not the subset in use this week. */
                kb(got, "t", edge[a], "c", edge[b], "_x", -1, "_n");
                snprintf(want, sizeof(want), "t%dc%d_x_n", edge[a], edge[b]);
                eq(got, want);
            }
    }

    printf("  ok   — kb == snprintf over %d keys\n", checks);
    printf("PASS: the key builder is byte-identical to the snprintf it replaced\n");
    return 0;
}
