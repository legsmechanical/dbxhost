/* tests/test_drum_bake_keeps_lanes.c — A DRUM BAKE KEEPS EVERY HIT ON ITS LANE.
 *
 * Found on the Move 2026-10-05: copy a drum clip, bake the copy, and the hits
 * came out on 12 lanes from 5, at pitches the source never had. The bakes
 * build their play_fx_t on the STACK and pfx_reset (inside pfx_init_defaults)
 * set only the fields it named — note_random was not one, so it held whatever
 * the stack held. Non-zero, every baked hit got a random pitch, and the bake
 * routes a note back to the lane whose pad note matches its pitch. The same
 * saved project baked correctly in this harness, where that stack happened to
 * be zero — so the test poisons the stack itself.
 *
 * Cases: (1) pfx_init_defaults over junk leaves note random, its walk and the
 * event state zero; (2) pfx_reset alone zeroes the note-random fields (a
 * track's PFX reset left a stale random behind); (3) the track's pfx_reset key
 * clears a note random that was set; (4) a drum-clip bake run on a poisoned
 * stack keeps each lane's hits on that lane at that lane's pitch — with a
 * CONTROL that the unpoisoned bake does too. */
#include "harness.h"

/* Fill a large region of stack below the caller with a non-zero byte, so the
 * next call's locals start out as junk rather than the zero a fresh test
 * process usually leaves. */
static __attribute__((noinline)) void poison_stack(unsigned char b) {
    volatile unsigned char junk[256 * 1024];
    for (size_t i = 0; i < sizeof(junk); i++) junk[i] = b;
}

static int lanes_with_notes(seq8_instance_t *inst, int c, int *pitch_ok) {
    int n = 0; *pitch_ok = 1;
    drum_clip_t *dc = inst->tracks[0].drum_clips[c];
    for (int l = 0; l < DRUM_LANES; l++) {
        clip_t *cl = &dc->lanes[l].clip;
        if (!cl->note_count) continue;
        n++;
        for (int i = 0; i < cl->note_count; i++)
            if (cl->notes[i].pitch != dc->lanes[l].midi_note) *pitch_ok = 0;
    }
    return n;
}

static void setup_drum(hx_t *h, seq8_instance_t *inst, int c) {
    hx_set_param(h, "t0_pad_mode", "1");
    for (int l = 0; l < 5; l++) {
        int lane = l * 3;
        clip_t *cl = &inst->tracks[0].drum_clips[c]->lanes[lane].clip;
        for (int s = 0; s < 16; s += 4)
            clip_insert_note(cl, (uint32_t)(s * 24 + l * 24), 12,
                             inst->tracks[0].drum_clips[c]->lanes[lane].midi_note, 100);
        clip_build_steps_from_notes(cl);
    }
}

int main(void) {
    /* ---- 1. pfx_init_defaults over junk --------------------------------- */
    {
        play_fx_t fx;
        memset(&fx, 0xAB, sizeof(fx));
        pfx_init_defaults(&fx);
        HX_ASSERT(fx.note_random == 0, "pfx_init_defaults left note_random as junk");
        HX_ASSERT(fx.note_random_walk == 0, "pfx_init_defaults left note_random_walk as junk");
        HX_ASSERT(fx.event_count == 0, "pfx_init_defaults left event_count as junk");
        HX_ASSERT(fx.arp_emitting == 0, "pfx_init_defaults left arp_emitting as junk");
        puts("  ok   — (1) pfx_init_defaults over junk zeroes note random, its walk and the event state");
    }
    /* ---- 2. pfx_reset alone ----------------------------------------------- */
    {
        play_fx_t fx;
        memset(&fx, 0xAB, sizeof(fx));
        pfx_reset(&fx);
        HX_ASSERT(fx.note_random == 0 && fx.note_random_walk == 0,
                  "pfx_reset does not zero the note-random stage");
        puts("  ok   — (2) pfx_reset zeroes the note-random stage");
    }
    /* ---- 3. a track's PFX reset clears a note random that was set -------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_noteFX_random", "7");
        HX_ASSERT(inst->tracks[1].pfx.note_random == 7, "setup: note random did not take");
        hx_set_param(h, "t1_pfx_reset", "1");
        HX_ASSERT(inst->tracks[1].pfx.note_random == 0, "the track's PFX reset left note random set");
        hx_destroy(h);
        puts("  ok   — (3) a track's PFX reset clears note random");
    }
    /* ---- 4. drum-clip bake on a poisoned stack ---------------------------- */
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        setup_drum(h, inst, 0);
        setup_drum(h, inst, 1);
        int ok;
        /* CONTROL: unpoisoned. */
        hx_set_param(h, "bake", "0 0 2 1 0 0");
        int n0 = lanes_with_notes(inst, 0, &ok);
        HX_ASSERT(n0 == 5 && ok, "control: an unpoisoned bake moved hits off their lanes");
        /* The case: the stack the bake's locals land on is junk. */
        poison_stack(0x05);
        hx_set_param(h, "bake", "0 1 2 1 0 0");
        int n1 = lanes_with_notes(inst, 1, &ok);
        printf("         poisoned bake: hits on %d lanes (expected 5), pitches %s\n", n1, ok ? "kept" : "CHANGED");
        HX_ASSERT(n1 == 5 && ok, "a drum bake on a junk stack moved hits off their lanes");
        hx_destroy(h);
        puts("  ok   — (4) a drum-clip bake keeps every hit on its lane, stack junk or not");
    }
    puts("PASS: test_drum_bake_keeps_lanes");
    return 0;
}
