/* tests/test_drum_right_inert.c — the 36th padmap token, drum_right_inert.
 *
 * While the phrase library's browser is open on a drum track it owns the
 * right-hand pads (they are the phrase's sounds): the engine must give them no
 * velocity-zone hit, Note Repeat or anything else, while the lane pads on the
 * left keep playing — the user auditions lanes by tapping them. The general
 * pad mute (33rd token) is NOT that: it silences the lane pads too.
 */
#include "harness.h"

static int ons(int note) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && e->bytes[2] == note && e->bytes[3] > 0) n++;
    }
    return n;
}
static void padmap(hx_t *h, int inert) {
    char pm[512] = "";
    for (int i = 0; i < 32; i++) {
        int col = i % 8, row = i / 8;
        char b[8]; snprintf(b, sizeof b, "%s%d", i ? " " : "", col < 4 ? 36 + row * 4 + col : 255);
        strcat(pm, b);
    }
    char tail[32]; snprintf(tail, sizeof tail, " 0 0 0 %d", inert);
    strcat(pm, tail);
    hx_set_param(h, "t0_padmap", pm);
}
static void press(hx_t *h, int pad) {
    uint8_t on[3] = { 0x90, (uint8_t)(68 + pad), 100 }, off[3] = { 0x80, (uint8_t)(68 + pad), 0 };
    hx_send_midi(h, on, 3, 0); hx_render(h, 4); hx_send_midi(h, off, 3, 0); hx_render(h, 4);
}

int main(void) {
    hx_t *h = hx_create(NULL);
    padmap(h, 0);
    hx_clear_capture(h); press(h, 4);
    HX_ASSERT(ons(36) > 0, "control: a right-hand pad plays the lane (velocity zone) without the flag");
    padmap(h, 1);
    hx_clear_capture(h); press(h, 4); press(h, 5); press(h, 12);
    HX_ASSERT(hx_stub_event_count() == 0 || (ons(36) == 0 && ons(37) == 0), "a right-hand pad still sounded with the flag");
    hx_clear_capture(h); press(h, 1);
    HX_ASSERT(ons(37) > 0, "a lane pad went silent with the flag");
    padmap(h, 0);
    hx_clear_capture(h); press(h, 4);
    HX_ASSERT(ons(36) > 0, "clearing the flag did not give the right-hand pads back");
    /* an old payload with no 36th token clears it */
    padmap(h, 1);
    hx_set_param(h, "t0_padmap", "36 37 38 39 255 255 255 255 40 41 42 43 255 255 255 255 44 45 46 47 255 255 255 255 48 49 50 51 255 255 255 255 0 0 0");
    hx_clear_capture(h); press(h, 4);
    HX_ASSERT(ons(36) > 0, "a payload without the token left the flag set");
    hx_destroy(h);
    printf("PASS: drum right-hand pads inert (right silent, lanes play, control, clear)\n");
    return 0;
}
