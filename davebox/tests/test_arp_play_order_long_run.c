/* tests/test_arp_play_order_long_run.c — SEQ ARP's Play Order stays in the
 * order notes came after a long unbroken run. Each held note takes the next
 * number of a counter that restarts only when the arp is empty; it was 8 bits,
 * so after 256 notes with something always held (echoes feeding the arp) it
 * wrapped and the newest notes played first. Through the engine directly: one
 * note held throughout, 300 others coming and going (one of them held from
 * late in the run, before the count wraps), then two more after it. */
#include "harness.h"

int main(void) {
    static arp_engine_t a;
    int bad = 0;
    memset(&a, 0, sizeof a);
    a.style = 7; a.octaves = 0;                    /* Play Order, no copies */
    arp_add_note(&a, 50, 100);                     /* held throughout */
    for (int i = 0; i < 300; i++) {                /* a long run: past where the count wraps */
        if (i == 250) arp_add_note(&a, 90, 100);   /* held from late in the run */
        arp_add_note(&a, (uint8_t)(60 + i % 20), 100);
        {   /* at every note: the order they came (50, then 90 once held, then this one) */
            int16_t q[ARP_MAX_CYCLE]; uint8_t qh[ARP_MAX_CYCLE];
            const int n = arp_build_pool(&a, q, qh);
            const int ok = i >= 250 ? n == 3 && q[0] == 50 && q[1] == 90 && q[2] == 60 + i % 20
                                    : n == 2 && q[0] == 50 && q[1] == 60 + i % 20;
            if (!ok && !bad++) printf("  note %d of the run: out of order\n", i);
        }
        arp_release_note(&a, (uint8_t)(60 + i % 20));
    }
    HX_ASSERT(bad == 0, "Play Order: in the order they came at every note of a long run");
    arp_add_note(&a, 70, 100);                     /* then two more */
    arp_add_note(&a, 80, 100);
    int16_t pp[ARP_MAX_CYCLE]; uint8_t ph[ARP_MAX_CYCLE];
    const int P = arp_build_pool(&a, pp, ph);
    printf("  Play Order after 300 notes:");
    for (int i = 0; i < P; i++) printf(" %d", pp[i]);
    printf(" (want 50 90 70 80)\n");
    HX_ASSERT(P == 4 && pp[0] == 50 && pp[1] == 90 && pp[2] == 70 && pp[3] == 80,
              "Play Order: the notes in the order they came, across the count's wrap");
    printf("PASS: arp play order long run\n");
    return 0;
}
