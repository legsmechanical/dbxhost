/*
 * The two SHM segments that used to be sized `==` to their struct: the bump
 * to 256 / 512 (2026-09-05, from upstream #385) is a LAYOUT change, and the
 * point of this unit is to say so in numbers — the struct's real size and
 * the headroom — so a future field lands in the slack instead of in a bit.
 */
#include <stdio.h>
#include "shadow_constants.h"

int main(void) {
    int fails = 0;
    if (sizeof(shadow_control_t) > CONTROL_BUFFER_SIZE) { printf("  FAIL control struct %zu > %d\n", sizeof(shadow_control_t), CONTROL_BUFFER_SIZE); fails++; }
    else printf("  ok   shadow_control_t is %zu B in a %d B segment (%zu B headroom)\n", sizeof(shadow_control_t), CONTROL_BUFFER_SIZE, CONTROL_BUFFER_SIZE - sizeof(shadow_control_t));
    if (sizeof(shadow_overlay_state_t) > SHADOW_OVERLAY_BUFFER_SIZE) { printf("  FAIL overlay struct %zu > %d\n", sizeof(shadow_overlay_state_t), SHADOW_OVERLAY_BUFFER_SIZE); fails++; }
    else printf("  ok   shadow_overlay_state_t is %zu B in a %d B segment\n", sizeof(shadow_overlay_state_t), SHADOW_OVERLAY_BUFFER_SIZE);
    /* The bump itself: a segment smaller than a page costs the same page. */
    if (CONTROL_BUFFER_SIZE != 256 || SHADOW_OVERLAY_BUFFER_SIZE != 512) { printf("  FAIL sizes are not the 256 / 512 the layout change chose\n"); fails++; }
    else printf("  ok   CONTROL 256, OVERLAY 512 (both under one 4096 B page)\n");
    if (fails) { printf("FAIL: test_control_layout\n"); return 1; }
    printf("PASS: test_control_layout\n"); return 0;
}
