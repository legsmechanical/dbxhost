/* tests/test_audition_key.c — tN_audition, Import MIDI's preview.
 *
 *   tN_audition "on p v … off p … alloff"
 *
 * The preview sounds through the track's own chain like a pad, but it is not
 * playing: it must never land in the Retrospective Capture buffer, never feed
 * the TRACK ARP, stay silent while the track is armed or recording, and its
 * `alloff` releases exactly the pitches it started — a pad the user holds is
 * left alone. Tracks 1..3 default to melodic on channel = track index.
 */
#include "harness.h"

static int seen_off(int ch, int note) {
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0;
        if ((e->bytes[1] & 0x0F) == ch && e->bytes[2] == (uint8_t)note &&
            (st == 0x80 || (st == 0x90 && e->bytes[3] == 0)))
            return 1;
    }
    return 0;
}
static int count_on(int ch) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if ((e->bytes[1] & 0xF0) == 0x90 && (e->bytes[1] & 0x0F) == ch && e->bytes[3] > 0) n++;
    }
    return n;
}

static void test_sounds_and_releases(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    hx_clear_capture(h);
    hx_set_param(h, "t1_audition", "on 60 100 on 64 90");
    HX_ASSERT(hx_seen_note_on(h, 1, 60) && hx_seen_note_on(h, 1, 64), "audition notes did not sound");
    HX_ASSERT(inst->cap_count == 0, "an audition note reached the Retrospective Capture buffer");
    hx_set_param(h, "t1_audition", "off 64");
    HX_ASSERT(seen_off(1, 64), "off did not release");
    HX_ASSERT(!seen_off(1, 60), "off released a different pitch");
    hx_set_param(h, "t1_audition", "alloff");
    HX_ASSERT(seen_off(1, 60), "alloff left a pitch sounding");
    hx_destroy(h);
}

static void test_alloff_leaves_pads_alone(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_live_notes", "eon 50 100");        /* a held pad / key */
    hx_set_param(h, "t1_audition", "on 60 100");
    hx_clear_capture(h);
    hx_set_param(h, "t1_audition", "alloff");
    HX_ASSERT(seen_off(1, 60), "alloff missed the audition pitch");
    HX_ASSERT(!seen_off(1, 50), "alloff released a pitch the audition never started");
    hx_destroy(h);
}

static void test_silent_when_armed(void) {
    hx_t *h = hx_create(NULL);
    hx_set_param(h, "t1_route", "schwung");
    hx_set_param(h, "t1_recording", "1");
    hx_clear_capture(h);
    hx_set_param(h, "t1_audition", "on 60 100");
    HX_ASSERT(!hx_seen_note_on(h, 1, 60), "the preview sounded on a recording track");
    hx_destroy(h);
}

static void test_bypasses_track_arp(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_route", "schwung");
    inst->tracks[1].tarp_on = 1;
    hx_clear_capture(h);
    hx_set_param(h, "t1_audition", "on 60 100");
    HX_ASSERT(hx_seen_note_on(h, 1, 60), "with the arp on, the audition did not sound directly");
    HX_ASSERT(inst->tracks[1].tarp.held_count == 0, "the audition fed the TRACK ARP");
    hx_render(h, 200);
    HX_ASSERT(count_on(1) == 1, "the audition was arpeggiated");
    hx_destroy(h);
}

static void test_drum_lanes(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int ch = inst->tracks[0].channel;
    hx_set_param(h, "t0_route", "schwung");
    hx_clear_capture(h);
    hx_set_param(h, "t0_audition", "on 36 100 on 20 100");
    HX_ASSERT(hx_seen_note_on(h, ch, 36), "a drum pitch with a pad did not sound");
    HX_ASSERT(!hx_seen_note_on(h, ch, 20), "a drum pitch with no pad sounded");
    HX_ASSERT(inst->cap_count == 0, "a drum audition reached the capture buffer");
    hx_set_param(h, "t0_audition", "alloff");
    HX_ASSERT(seen_off(ch, 36), "drum alloff left the pad sounding");
    hx_destroy(h);
}

int main(void) {
    test_sounds_and_releases();
    test_alloff_leaves_pads_alone();
    test_silent_when_armed();
    test_bypasses_track_arp();
    test_drum_lanes();
    printf("PASS: audition key (sound, release, alloff scope, armed, arp bypass, drum)\n");
    return 0;
}
