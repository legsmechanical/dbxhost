/* Chord-layout pads: one pad press plays a chord, straight from the audio
 * engine.
 *
 * tN_padmap tokens may be "p+p+p" (a pad that plays several pitches); a plain
 * payload must parse exactly as before. Pinned here, against the MIDI the
 * engine actually emits:
 *   1. a plain padmap still maps one pitch per pad, and plays it
 *   2. a chord pad sounds every note on press and ends every note on release
 *   3. a pitch held by two pads (a chord and the strum row) re-strikes on
 *      the second press and lasts until the LAST pad lets go
 *   4. tN_chord_revoice re-voices a held pad in place: leaving notes end,
 *      new notes start, common notes are not touched
 *   5. the release ends what the PRESS started, even if the map changed
 *   6. a latched Track Arp keeps a re-pressed chord (no plucking notes out)
 *   7. a malformed chord token cannot write past PAD_CHORD_MAX
 */
#include "harness.h"

static int count_inject(int note, int on) {
    int n = 0;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if (e->bytes[2] != (uint8_t)note) continue;
        int is_on = (st == 0x90 && e->bytes[3] > 0);
        int is_off = (st == 0x80) || (st == 0x90 && e->bytes[3] == 0);
        if (on ? is_on : is_off) n++;
    }
    return n;
}

static void pad_on(hx_t *h, int padIdx, int vel) {
    uint8_t m[3] = { 0x90, (uint8_t)(68 + padIdx), (uint8_t)vel };
    hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
}
static void pad_off(hx_t *h, int padIdx) {
    uint8_t m[3] = { 0x80, (uint8_t)(68 + padIdx), 0 };
    hx_send_midi(h, m, 3, MOVE_MIDI_SOURCE_INTERNAL);
}

/* Pad 0 = C major (60 64 67), pad 1 = A minor (57 60 64), pad 8 = 67 alone
 * (the strum row), everything else chromatic from 70. */
#define CHORD_MAP \
    "60+64+67 57+60+64 72 73 74 75 76 77 " \
    "67 79 80 81 82 83 84 85 " \
    "86 87 88 89 90 91 92 93 " \
    "94 95 96 97 98 99 100 101"

#define PLAIN_MAP \
    "60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 " \
    "76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91"

static hx_t *fresh(const char *map) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->tracks[1].pad_mode != PAD_MODE_DRUM, "t1 expected melodic");
    hx_set_param(h, "t1_padmap", map);
    return h;
}

static void scn_plain(void) {
    hx_t *h = fresh(PLAIN_MAP);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    for (int i = 0; i < 32; i++) {
        HX_ASSERT(inst->pad_note_map[1][i] == 60 + i, "plain map pitch wrong");
        HX_ASSERT(inst->pad_chord_n[1][i] == 1, "plain pad must be one note");
    }
    pad_on(h, 4, 100); hx_render(h, 4);
    HX_ASSERT(count_inject(64, 1) == 1, "plain pad did not play its note");
    pad_off(h, 4); hx_render(h, 4);
    HX_ASSERT(count_inject(64, 0) >= 1, "plain pad release did not end its note");
    /* The trailing flag tokens still land after chord-capable parsing. */
    hx_set_param(h, "t1_padmap", PLAIN_MAP " 1 0 0");
    HX_ASSERT(inst->pad_dispatch_muted == 1, "33rd token lost after the pad tokens");
    hx_destroy(h);
    printf("PASS: chord_pads plain payload unchanged\n");
}

static void scn_chord_press_release(void) {
    hx_t *h = fresh(CHORD_MAP);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->pad_chord_n[1][0] == 3, "chord pad not parsed as 3 notes");
    HX_ASSERT(inst->pad_note_map[1][0] == 60, "chord pad's map entry must be its first note");
    HX_ASSERT(inst->pad_note_map[1][2] == 72, "pads after a chord token shifted");
    pad_on(h, 0, 100); hx_render(h, 4);
    HX_ASSERT(count_inject(60, 1) == 1 && count_inject(64, 1) == 1 && count_inject(67, 1) == 1,
              "chord press did not sound all three notes");
    hx_clear_capture(h);
    pad_off(h, 0); hx_render(h, 4);
    HX_ASSERT(count_inject(60, 0) >= 1 && count_inject(64, 0) >= 1 && count_inject(67, 0) >= 1,
              "chord release did not end all three notes");
    HX_ASSERT(inst->pad_live_n[1][0] == 0, "released pad still lists live notes");
    hx_destroy(h);
    printf("PASS: chord_pads press + release\n");
}

static void scn_shared_pitch(void) {
    hx_t *h = fresh(CHORD_MAP);
    pad_on(h, 0, 100); hx_render(h, 4);            /* C E G */
    hx_clear_capture(h);
    pad_on(h, 8, 90); hx_render(h, 4);             /* strum: G again */
    HX_ASSERT(count_inject(67, 1) == 1, "the strum pad must re-strike a note the chord holds");
    hx_clear_capture(h);
    pad_off(h, 8); hx_render(h, 4);                /* strum up: chord still holds G */
    HX_ASSERT(count_inject(67, 0) == 0, "G cut while the chord pad still holds it");
    pad_on(h, 1, 100); hx_render(h, 4);            /* A C E over C E G (re-strikes C, E) */
    hx_clear_capture(h);
    pad_off(h, 0); hx_render(h, 4);                /* C major up: C, E still held by Am */
    HX_ASSERT(count_inject(67, 0) >= 1, "G not ended when its last holder let go");
    HX_ASSERT(count_inject(60, 0) == 0 && count_inject(64, 0) == 0,
              "C/E cut while the A minor pad still holds them");
    hx_clear_capture(h);
    pad_off(h, 1); hx_render(h, 4);
    HX_ASSERT(count_inject(57, 0) >= 1 && count_inject(60, 0) >= 1 && count_inject(64, 0) >= 1,
              "the last pad's release did not end its notes");
    hx_destroy(h);
    printf("PASS: chord_pads shared pitch lasts until the last holder\n");
}

static void scn_revoice(void) {
    hx_t *h = fresh(CHORD_MAP);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    pad_on(h, 0, 100); hx_render(h, 4);            /* 60 64 67 */
    hx_clear_capture(h);
    hx_set_param(h, "t1_chord_revoice", "0 64+67+72");   /* first inversion */
    hx_render(h, 4);
    HX_ASSERT(count_inject(60, 0) >= 1, "revoice: the leaving note (60) did not end");
    HX_ASSERT(count_inject(72, 1) == 1, "revoice: the new note (72) did not start");
    HX_ASSERT(count_inject(64, 1) == 0 && count_inject(67, 1) == 0 &&
              count_inject(64, 0) == 0 && count_inject(67, 0) == 0,
              "revoice: common notes must carry on untouched");
    hx_clear_capture(h);
    pad_off(h, 0); hx_render(h, 4);
    HX_ASSERT(count_inject(64, 0) >= 1 && count_inject(67, 0) >= 1 && count_inject(72, 0) >= 1,
              "release after a revoice must end the RE-VOICED notes");
    HX_ASSERT(count_inject(60, 0) == 0, "release after a revoice re-ended an old note");
    /* A pad that is not held is left alone. */
    hx_clear_capture(h);
    hx_set_param(h, "t1_chord_revoice", "5 40+44");
    hx_render(h, 4);
    HX_ASSERT(count_inject(40, 1) == 0 && inst->pad_live_n[1][5] == 0,
              "revoice of an unheld pad must not sound anything");
    hx_destroy(h);
    printf("PASS: chord_pads revoice in place\n");
}

static void scn_release_follows_press(void) {
    hx_t *h = fresh(CHORD_MAP);
    pad_on(h, 0, 100); hx_render(h, 4);
    /* A modifier release or a key change re-pushes the map mid-hold. */
    hx_set_param(h, "t1_padmap", "62+65+69 57+60+64 72 73 74 75 76 77 67 79 80 81 82 83 84 85 "
                                 "86 87 88 89 90 91 92 93 94 95 96 97 98 99 100 101");
    hx_clear_capture(h);
    pad_off(h, 0); hx_render(h, 4);
    HX_ASSERT(count_inject(60, 0) >= 1 && count_inject(64, 0) >= 1 && count_inject(67, 0) >= 1,
              "release must end what the press started, not the new map's notes");
    hx_destroy(h);
    printf("PASS: chord_pads release follows the press\n");
}

static void scn_arp_latch_keeps_chord(void) {
    hx_t *h = fresh(CHORD_MAP);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[1];
    hx_set_param(h, "t1_tarp_style", "1");          /* Up; turns the arp on */
    hx_set_param(h, "t1_tarp_latch", "1");
    hx_set_param(h, "t1_tarp_retrigger", "0");
    HX_ASSERT(tr->tarp_on && tr->tarp_latch && !tr->tarp.retrigger, "arp setup failed");
    pad_on(h, 0, 100); hx_render(h, 4);
    pad_off(h, 0); hx_render(h, 4);
    HX_ASSERT(tr->tarp.held_count == 3, "latched arp should hold the chord's 3 notes");
    pad_on(h, 0, 100); hx_render(h, 4);            /* the same chord again */
    HX_ASSERT(tr->tarp.held_count == 3,
              "re-pressing a latched chord plucked notes out of it");
    pad_off(h, 0); hx_render(h, 4);
    /* CONTROL: a single-note pad still toggles its latched note, as before. */
    pad_on(h, 8, 100); hx_render(h, 4); pad_off(h, 8); hx_render(h, 4);   /* 67 already latched */
    HX_ASSERT(tr->tarp.held_count == 2, "a one-note re-press should still pluck (unchanged behaviour)");
    hx_destroy(h);
    printf("PASS: chord_pads latched arp keeps a re-pressed chord\n");
}

static void scn_overlong_token(void) {
    hx_t *h = fresh("60+61+62+63+64+65+66+67+68+69 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 "
                    "18 19 20 21 22 23 24 25 26 27 28 29 30 31");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_ASSERT(inst->pad_chord_n[1][0] == PAD_CHORD_MAX, "an over-long chord must clamp to PAD_CHORD_MAX");
    HX_ASSERT(inst->pad_note_map[1][1] == 1, "the pad after an over-long chord misparsed");
    HX_ASSERT(inst->pad_note_map[1][31] == 31, "the last pad after an over-long chord misparsed");
    hx_set_param(h, "t1_padmap", "255+60 61 " PLAIN_MAP);
    HX_ASSERT(inst->pad_note_map[1][0] == 0xFF && inst->pad_chord_n[1][0] == 1,
              "an unmapped pad must stay unmapped whatever follows its '+'");
    hx_destroy(h);
    printf("PASS: chord_pads malformed tokens stay in bounds\n");
}

int main(void) {
    scn_plain();
    scn_chord_press_release();
    scn_shared_pitch();
    scn_revoice();
    scn_release_follows_press();
    scn_arp_latch_keeps_chord();
    scn_overlong_token();
    return 0;
}
