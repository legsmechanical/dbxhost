/*
 * Host-side unit test for corun_back_top.h: a Back that Move answers with
 * silence (pressed at the top of its editor) ends the co-run; a Back that Move
 * answers with any announcement (it climbed a level) does not.
 */
#include <stdio.h>
#include "corun_back_top.h"

static int checks = 0;
#define OK(cond, msg) do { if (cond) { printf("  ok   %s\n", msg); checks++; } \
                           else { printf("  FAIL %s\n", msg); return 1; } } while (0)

int main(void) {
    corun_back_top_t p = {0, 0};
    OK(corun_back_top_poll(&p, 5000, 7, 1) == 0, "nothing pressed: never exits");

    corun_back_top_press(&p, 1000, 7);
    OK(corun_back_top_poll(&p, 1000 + CORUN_BACK_TOP_MS - 1, 7, 1) == 0, "silent, but inside the window: waits");
    OK(corun_back_top_poll(&p, 1000 + CORUN_BACK_TOP_MS, 7, 1) == 1, "silent for the whole window: EXIT (Back at the top)");
    OK(corun_back_top_poll(&p, 9000, 7, 1) == 0, "...exactly once");

    corun_back_top_press(&p, 2000, 7);
    OK(corun_back_top_poll(&p, 2050, 8, 1) == 0, "Move announced where it landed: no exit");
    OK(corun_back_top_poll(&p, 9000, 8, 1) == 0, "...and stays disarmed (Back climbed a level)");

    corun_back_top_press(&p, 3000, 8);
    OK(corun_back_top_poll(&p, 3100, 8, 0) == 0, "co-run already ended another way: no exit");
    OK(corun_back_top_poll(&p, 9000, 8, 1) == 0, "...and disarmed");

    corun_back_top_press(&p, 4000, 8);
    corun_back_top_press(&p, 4300, 8);              /* a second Back re-arms from its own press */
    OK(corun_back_top_poll(&p, 4000 + CORUN_BACK_TOP_MS, 8, 1) == 0, "a second Back restarts the window");
    OK(corun_back_top_poll(&p, 4300 + CORUN_BACK_TOP_MS, 8, 1) == 1, "...and exits from the second press");

    corun_back_top_press(&p, 0, 3);                 /* a clock at 0 must still arm */
    OK(corun_back_top_poll(&p, CORUN_BACK_TOP_MS + 1, 3, 1) == 1, "a press at time 0 still arms (from 1 ms)");

    printf("PASS: test_corun_back_top (%d checks)\n", checks);
    return 0;
}
