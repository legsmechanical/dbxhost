/* tests/test_arp_gate_over_100.c — an arp gate above 100 % lengthens the note
 * (gate % of the arp rate), and a same-pitch note that would overlap ends at
 * the new note-on: a legato hand-over, never after it and never cutting the
 * new note. SEQ ARP and LIVE ARP alike (ruled 2026-11-21).
 *
 * Before: each arp had one sounding slot, cut at every fire, and the gate was
 * capped at rate - 1 — so 150 % played exactly like 100 %.
 *
 * For each arp, Up at 1/16 (24 ticks), gate 150 %:
 *  1. C+E held: every fire sets a 36-tick gate; when E fires, C is still
 *     sounding (both output refcounts 1); after release every note-on has its
 *     note-off and nothing is left sounding.
 *  2. C alone: the C never stacks (refcount never above 1) and on the wire
 *     each off comes immediately before the next on (on/off alternate).
 *     LIVE ARP's single C runs once more with the lead on.
 *  3. CONTROL: gate 100 % keeps today's 23 ticks (rate - 1).
 *  4. the bake agrees: a chord bakes 36-tick gates, a lone C hands over at
 *     each next note (24). */
#include "harness.h"

enum { SEQ, LIVE };

static int ch_of(seq8_instance_t *I) { return I->tracks[1].channel & 0x0F; }

static hx_t *rig(int which, int gate, int chord, int lead) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    if (!lead) HX_NO_LEAD(h);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &I->tracks[1];
    char v[40];
    I->active_track = 1;
    if (which == SEQ) {
        hx_set_param(h, "t1_c0_step_0_add", chord ? "60 0 100 64 0 100" : "60 0 100");
        hx_set_param(h, "t1_c0_step_0_gate", "200");
        hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
        hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 1");
        hx_set_param(h, "t1_c0_pfx_set", "seq_arp_sync 0");
        snprintf(v, sizeof v, "seq_arp_gate %d", gate);
        hx_set_param(h, "t1_c0_pfx_set", v);
        HX_ASSERT(tr->pfx.arp.gate_pct == gate && ARP_RATE_TICKS[tr->pfx.arp.rate_idx] == 24,
                  "rig: SEQ ARP 1/16 at the asked gate");
        hx_set_param(h, "transport", "play_focus:1:0");
    } else {
        hx_set_param(h, "t1_tarp_style", "1");
        hx_set_param(h, "t1_tarp_sync", "0");
        snprintf(v, sizeof v, "%d", gate);
        hx_set_param(h, "t1_tarp_gate", v);
        HX_ASSERT(tr->tarp_on && tr->tarp.gate_pct == gate && ARP_RATE_TICKS[tr->tarp.rate_idx] == 24,
                  "rig: LIVE ARP 1/16 at the asked gate");
        hx_render(h, 4);
        hx_clear_capture(h);
        live_note_on(I, tr, 60, 100);
        if (chord) live_note_on(I, tr, 64, 100);
    }
    return h;
}

static void release(hx_t *h, int which, int chord) {
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    if (which == LIVE) {
        live_note_off(I, &I->tracks[1], 60);
        if (chord) live_note_off(I, &I->tracks[1], 64);
    } else {
        hx_set_param(h, "transport", "stop");
    }
    hx_render(h, 300);
}

static arp_engine_t *eng(seq8_instance_t *I, int which) {
    return which == SEQ ? &I->tracks[1].pfx.arp : &I->tracks[1].tarp;
}

/* note-ons minus note-offs on the track's channel, and whether 60's events
 * alternate on/off starting with an on. */
static void wire(int ch, int *ons, int *offs, int *alternate60) {
    int last60 = 0;   /* 0 none, 1 on, 2 off */
    *ons = *offs = 0; *alternate60 = 1;
    for (int i = 0; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        int st = e->bytes[1] & 0xF0, c = e->bytes[1] & 0x0F, p = e->bytes[2];
        if (c != ch || (st != 0x90 && st != 0x80)) continue;
        int on = (st == 0x90 && e->bytes[3] > 0);
        if (on) (*ons)++; else (*offs)++;
        if (p == 60) {
            if (on && last60 == 1) *alternate60 = 0;     /* a second on with no off between */
            if (!on && last60 != 1) *alternate60 = 0;    /* an off with nothing sounding */
            last60 = on ? 1 : 2;
        }
    }
}

static void chord_case(int which) {
    const char *nm = which == SEQ ? "SEQ ARP" : "LIVE ARP";
    hx_t *h = rig(which, 150, 1, 0);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    arp_engine_t *a = eng(I, which);
    uint8_t *rc = I->tracks[1].pfx.pitch_refcount;
    uint16_t fc = a->fire_count;
    int fires = 0, e_fires_overlapping = 0;
    uint32_t fired_at = 0;
    for (int b = 0; b < 300 && fires < 6; b++) {
        hx_render(h, 1);
        if (a->fire_count == fc) {
            /* Between fires: the tail rings for the rest of its 36-tick gate
             * (12 ticks past the fire), then only the new note sounds. */
            uint32_t d = I->arp_master_tick - fired_at;
            int n = (rc[60] > 0) + (rc[64] > 0);
            if (fires >= 2 && d >= 1 && d <= 10 && n != 2) {
                fprintf(stderr, "FAIL: %s gate 150 %%: %u ticks after a fire the previous note no longer rings\n", nm, (unsigned)d);
                exit(1);
            }
            if (fires >= 2 && d >= 13 && n != 1) {
                fprintf(stderr, "FAIL: %s gate 150 %%: %u ticks after a fire %d notes sound — the tail outlived its gate\n", nm, (unsigned)d, n);
                exit(1);
            }
            continue;
        }
        fc = a->fire_count;
        fired_at = I->arp_master_tick;
        fires++;
        if (a->gate_remaining != 36) {
            fprintf(stderr, "FAIL: %s gate 150 %%: a fire set %u ticks, want 36\n", nm, (unsigned)a->gate_remaining);
            exit(1);
        }
        if (a->sounding_pitch == 64 && rc[60] == 1 && rc[64] == 1) e_fires_overlapping++;
    }
    HX_ASSERT(fires >= 4, "rig: the arp fired too few times");
    if (!e_fires_overlapping) {
        fprintf(stderr, "FAIL: %s gate 150 %%: C did not ring on when E fired\n", nm);
        exit(1);
    }
    release(h, which, 1);
    int ons, offs, alt;
    wire(ch_of(I), &ons, &offs, &alt);
    HX_ASSERT(ons > 0 && ons == offs, "every arp note-on has its note-off");
    for (int p = 0; p < 128; p++) HX_ASSERT(rc[p] == 0, "nothing left sounding after the release");
    hx_destroy(h);
}

static void single_case(int which, int lead) {
    const char *nm = which == SEQ ? "SEQ ARP" : "LIVE ARP";
    hx_t *h = rig(which, 150, 0, lead);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    arp_engine_t *a = eng(I, which);
    uint8_t *rc = I->tracks[1].pfx.pitch_refcount;
    uint16_t fc0 = a->fire_count;
    for (int b = 0; b < 200; b++) {
        hx_render(h, 1);
        /* Once it has started, the C sounds without a gap: each note lasts
         * until the next one takes over, and nothing cuts the new note. */
        if (a->fire_count != fc0 && rc[60] != 1) {
            fprintf(stderr, "FAIL: %s gate 150 %%, single C: a gap or a cut note (refcount %d)\n", nm, rc[60]);
            exit(1);
        }
        if (rc[60] > 1) {
            fprintf(stderr, "FAIL: %s gate 150 %%, single C: the C stacked (refcount %d)\n", nm, rc[60]);
            exit(1);
        }
    }
    HX_ASSERT((uint16_t)(a->fire_count - fc0) >= 4, "rig: the single-note arp fired too few times");
    release(h, which, 0);
    int ons, offs, alt;
    wire(ch_of(I), &ons, &offs, &alt);
    HX_ASSERT(ons >= 4, "rig: the single C played");
    if (!alt || ons != offs) {
        fprintf(stderr, "FAIL: %s gate 150 %%, single C: on/off do not alternate (%d on, %d off)\n", nm, ons, offs);
        exit(1);
    }
    hx_destroy(h);
}

static void control_case(int which) {
    hx_t *h = rig(which, 100, 1, 0);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    arp_engine_t *a = eng(I, which);
    uint16_t fc = a->fire_count;
    int fires = 0;
    for (int b = 0; b < 300 && fires < 4; b++) {
        hx_render(h, 1);
        if (a->fire_count == fc) continue;
        fc = a->fire_count;
        fires++;
        HX_ASSERT(a->gate_remaining == 23, "control: gate 100 %% keeps rate - 1 = 23 ticks");
        HX_ASSERT(!a->tail_active, "control: gate 100 %% never overlaps");
    }
    HX_ASSERT(fires >= 4, "control: the arp fired too few times");
    hx_destroy(h);
}

/* 5. switching the arp off while a tail rings ends both notes. */
static void silence_case(int which) {
    hx_t *h = rig(which, 150, 1, 0);
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    arp_engine_t *a = eng(I, which);
    uint8_t *rc = I->tracks[1].pfx.pitch_refcount;
    int g = 0;
    while (!(a->tail_active && a->sounding_active) && g++ < 400) hx_render(h, 1);
    HX_ASSERT(a->tail_active && a->sounding_active, "silence rig: never caught a tail ringing");
    if (which == LIVE) hx_set_param(h, "t1_tarp_style", "0");
    else               hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 0");
    hx_render(h, 4);
    for (int p = 0; p < 128; p++)
        if (rc[p]) {
            fprintf(stderr, "FAIL: %s off while a tail rang: pitch %d left sounding\n",
                    which == SEQ ? "SEQ ARP" : "LIVE ARP", p);
            exit(1);
        }
    hx_destroy(h);
}

/* 4. the bake agrees: 36-tick gates on a chord; a lone C hands over (24). */
static void bake_case(int chord) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *I = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_add", chord ? "60 0 100 64 0 100" : "60 0 100");
    hx_set_param(h, "t1_c0_step_0_gate", "192");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_gate 150");
    hx_set_param(h, "bake", "1 0 0 1 0 0");
    clip_t *cl = &I->tracks[1].clips[0];
    HX_ASSERT(cl->note_count >= 6, "bake rig: too few baked arp notes");
    uint32_t last = 0;
    for (int i = 0; i < cl->note_count; i++) if (cl->notes[i].tick > last) last = cl->notes[i].tick;
    for (int i = 0; i < cl->note_count; i++) {
        if (cl->notes[i].tick == last) continue;
        int want = chord ? 36 : 24;
        if (cl->notes[i].gate != want) {
            fprintf(stderr, "FAIL: bake, gate 150 %% (%s): note at %u has gate %u, want %d\n",
                    chord ? "chord" : "single C", (unsigned)cl->notes[i].tick, (unsigned)cl->notes[i].gate, want);
            exit(1);
        }
    }
    hx_destroy(h);
}

int main(void) {
    bake_case(1);
    bake_case(0);
    for (int w = SEQ; w <= LIVE; w++) {
        chord_case(w);
        single_case(w, 0);
        control_case(w);
        silence_case(w);
    }
    single_case(LIVE, 1);
    printf("PASS: arp_gate_over_100 (SEQ ARP and LIVE ARP: 150 %% lengthens, same pitch hands over legato)\n");
    return 0;
}
