/* Arp octave range joins the note POOL the style orders (Josh, 2026-09-24:
 * "the octave is a repeated phrase and the octave notes don't factor into how
 * the style sorts notes").
 *
 * The live arp, the sequencer arp and Print all go through arp_compute_step,
 * so pinning it here covers all three. Held notes are added in the order
 * E C G (64 60 67) so Play Order is distinguishable from Up.
 *
 * Decisions pinned (Fable review, 2026-09-24):
 *  - negative octaves extend the pool DOWNWARD;
 *  - Play Order is the played phrase, then the phrase transposed one octave
 *    at a time in the octave's direction;
 *  - no de-duplication when a chord already spans an octave;
 *  - when N*(octaves+1) exceeds ARP_MAX_CYCLE the octave count is trimmed
 *    BEFORE the pool is built, so the notes actually held are never dropped. */
#include "harness.h"

static int failed = 0;

static void run(int style, int oct, const uint8_t *held, const uint8_t *vels, int nheld,
                int steps, uint8_t *out_p, uint8_t *out_v) {
    arp_engine_t a;
    play_fx_t fx;
    memset(&a, 0, sizeof a);
    memset(&fx, 0, sizeof fx);
    fx.rng = 12345;
    arp_init_defaults(&a);
    a.style = (uint8_t)style;
    a.octaves = (int8_t)oct;
    for (int i = 0; i < nheld; i++) arp_add_note(&a, held[i], vels ? vels[i] : 100);
    arp_retrigger(&a, 0);
    for (int i = 0; i < steps; i++) {
        uint8_t p = 0, v = 0;
        arp_compute_step(&a, &fx, &p, &v);
        out_p[i] = p;
        if (out_v) out_v[i] = v;
    }
}

static void expect(const char *name, int style, int oct, const int *want, int n) {
    static const uint8_t held[3] = { 64, 60, 67 };   /* played E, C, G */
    uint8_t got[64];
    run(style, oct, held, NULL, 3, n, got, NULL);
    for (int i = 0; i < n; i++) {
        if (got[i] != want[i]) {
            fprintf(stderr, "FAIL: %s: step %d got %d want %d  [got:", name, i, got[i], want[i]);
            for (int k = 0; k < n; k++) fprintf(stderr, " %d", got[k]);
            fprintf(stderr, "]\n");
            failed = 1;
            return;
        }
    }
    printf("  ok   — %s\n", name);
}

#define EXPECT(name, style, oct, ...) do { \
    static const int w_[] = { __VA_ARGS__ }; \
    expect(name, style, oct, w_, (int)(sizeof w_ / sizeof w_[0])); \
} while (0)

int main(void) {
    /* Styles: 1 Up, 2 Down, 3 UpDown, 4 DownUp, 5 Converge, 6 Diverge, 7 Play Order. */
    EXPECT("Up +1",        1,  1, 60, 64, 67, 72, 76, 79, 60);
    EXPECT("Up -1",        1, -1, 48, 52, 55, 60, 64, 67, 48);
    EXPECT("Down +1",      2,  1, 79, 76, 72, 67, 64, 60, 79);
    EXPECT("Down -1",      2, -1, 67, 64, 60, 55, 52, 48, 67);
    EXPECT("UpDown +1",    3,  1, 60, 64, 67, 72, 76, 79, 76, 72, 67, 64, 60, 64);
    EXPECT("UpDown -1",    3, -1, 48, 52, 55, 60, 64, 67, 64, 60, 55, 52, 48);
    EXPECT("DownUp +1",    4,  1, 79, 76, 72, 67, 64, 60, 64, 67, 72, 76, 79);
    EXPECT("DownUp -1",    4, -1, 67, 64, 60, 55, 52, 48, 52, 55, 60, 64, 67);
    EXPECT("Converge +1",  5,  1, 79, 60, 76, 64, 72, 67);
    EXPECT("Converge -1",  5, -1, 67, 48, 64, 52, 60, 55);
    EXPECT("Diverge +1",   6,  1, 67, 72, 64, 76, 60, 79);
    EXPECT("Diverge -1",   6, -1, 55, 60, 52, 64, 48, 67);
    EXPECT("Play Order +1", 7,  1, 64, 60, 67, 76, 72, 79, 64);
    EXPECT("Play Order -1", 7, -1, 64, 60, 67, 52, 48, 55, 64);
    /* Octaves 0: unchanged from before the pool. */
    EXPECT("Up 0",         1,  0, 60, 64, 67, 60);
    EXPECT("Down 0",       2,  0, 67, 64, 60, 67);
    EXPECT("Converge 0",   5,  0, 67, 60, 64, 67);
    EXPECT("Play Order 0", 7,  0, 64, 60, 67, 64);

    /* Random / Random Other stay inside the pool; Random Other is a permutation. */
    {
        static const uint8_t held[3] = { 64, 60, 67 };
        uint8_t got[12];
        const int pool[6] = { 60, 64, 67, 72, 76, 79 };
        run(8, 1, held, NULL, 3, 12, got, NULL);
        int ok = 1;
        for (int i = 0; i < 12; i++) {
            int in = 0;
            for (int k = 0; k < 6; k++) if (got[i] == pool[k]) in = 1;
            if (!in) ok = 0;
        }
        if (ok) printf("  ok   — Random +1 stays in the pool\n");
        else { fprintf(stderr, "FAIL: Random +1 left the pool\n"); failed = 1; }
        run(9, 1, held, NULL, 3, 6, got, NULL);
        int seen[128] = { 0 }, perm = 1;
        for (int i = 0; i < 6; i++) { if (seen[got[i]]) perm = 0; seen[got[i]] = 1; }
        for (int k = 0; k < 6; k++) if (!seen[pool[k]]) perm = 0;
        if (perm) printf("  ok   — Random Other +1 is a permutation of the pool\n");
        else { fprintf(stderr, "FAIL: Random Other +1 is not a permutation of the pool\n"); failed = 1; }
    }

    /* Octave copies inherit their source note's velocity. */
    {
        static const uint8_t held[3] = { 64, 60, 67 };
        static const uint8_t vel[3]  = { 90, 100, 80 };
        uint8_t p[6], v[6];
        run(1, 1, held, vel, 3, 6, p, v);
        if (p[3] == 72 && v[3] == 100 && p[5] == 79 && v[5] == 80)
            printf("  ok   — octave copies keep their note's velocity\n");
        else { fprintf(stderr, "FAIL: octave velocity: %d/%d %d/%d\n", p[3], v[3], p[5], v[5]); failed = 1; }
    }

    /* No de-duplication: a chord already spanning an octave keeps both copies. */
    {
        static const uint8_t held[3] = { 60, 67, 72 };
        uint8_t p[6];
        const int want[6] = { 60, 67, 72, 72, 79, 84 };
        run(1, 1, held, NULL, 3, 6, p, NULL);
        int ok = 1;
        for (int i = 0; i < 6; i++) if (p[i] != want[i]) ok = 0;
        if (ok) printf("  ok   — no de-duplication across octaves\n");
        else { fprintf(stderr, "FAIL: duplicates: %d %d %d %d %d %d\n", p[0], p[1], p[2], p[3], p[4], p[5]); failed = 1; }
    }

    /* The clamp: 16 held notes at +/-4 would be 80 entries. The octave count is
     * trimmed to fit 64 BEFORE styling, so Down still reaches the lowest note
     * actually held and Up never goes past the top held note + 36. */
    {
        uint8_t held[16];
        for (int i = 0; i < 16; i++) held[i] = (uint8_t)(40 + i);
        uint8_t p[64];
        run(1, 4, held, NULL, 16, 64, p, NULL);
        int mx = 0;
        for (int i = 0; i < 64; i++) if (p[i] > mx) mx = p[i];
        int ok_up = (mx == 55 + 36) && p[0] == 40;
        run(2, 4, held, NULL, 16, 64, p, NULL);
        int mn = 127;
        for (int i = 0; i < 64; i++) if (p[i] < mn) mn = p[i];
        int ok_down = (mn == 40) && p[0] == 55 + 36;
        if (ok_up && ok_down) printf("  ok   — an over-long pool trims the octaves, never the held notes\n");
        else { fprintf(stderr, "FAIL: clamp: up max %d (want %d), down min %d (want 40)\n", mx, 55 + 36, mn); failed = 1; }
    }

    if (failed) { fprintf(stderr, "FAIL: arp_octave_pool\n"); return 1; }
    printf("PASS: arp_octave_pool\n");
    return 0;
}
