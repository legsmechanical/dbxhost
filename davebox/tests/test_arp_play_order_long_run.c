/* tests/test_arp_play_order_long_run.c — SEQ ARP's Play Order stays in the
 * order notes came after a long unbroken run. Each held note takes the next
 * number of a counter that restarts only when the arp is empty; it was 8 bits,
 * so after 256 notes with something always held (echoes feeding the arp) it
 * wrapped and the newest notes played first. Through the engine directly: one
 * note held throughout, 300 others coming and going, then three more. */
#include "harness.h"

int main(void) {
    static arp_engine_t a;
    memset(&a, 0, sizeof a);
    a.style = 7; a.octaves = 0;                    /* Play Order, no copies */
    arp_add_note(&a, 50, 100);                     /* held throughout */
    for (int i = 0; i < 300; i++) {
        arp_add_note(&a, (uint8_t)(60 + i % 20), 100);
        arp_release_note(&a, (uint8_t)(60 + i % 20));
    }
    arp_add_note(&a, 90, 100);
    arp_add_note(&a, 70, 100);
    arp_add_note(&a, 80, 100);
    int16_t pp[ARP_MAX_CYCLE]; uint8_t ph[ARP_MAX_CYCLE];
    const int P = arp_build_pool(&a, pp, ph);
    printf("  Play Order after 300 notes:");
    for (int i = 0; i < P; i++) printf(" %d", pp[i]);
    printf("\n");
    HX_ASSERT(P == 4 && pp[0] == 50 && pp[1] == 90 && pp[2] == 70 && pp[3] == 80,
              "Play Order: the note held throughout, then the three in the order they came");
    printf("PASS: arp play order long run\n");
    return 0;
}
