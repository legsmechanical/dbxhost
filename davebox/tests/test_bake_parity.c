/* Bake<->live parity pins (2026-07-18 audit). Guards the four re-implemented
 * bake stages against drift:
 *   D1  SEQ ARP retrigger param honored (was forced ON in bake)
 *   D3  CC-automation lane cadence pinned on loop-unroll bake
 *   D5  scale-aware delay feedback: degree delta from the group PRIMARY,
 *       applied to harmony copies (was per-note re-transpose)
 *   D6  gate_time==0 echoes bake as instant-off (1 tick), not 100% gate —
 *       now only where playback has no note gate (drum lanes, POST)
 *   D7  a sequenced note's echoes are as long as the note (as playback)
 *   D8  an echo on the next note's tick drops (Retrig)
 *   D9  under SEQ ARP a fixed-Gate echo rings to its note's end
 *   D10 a wrapped multi-loop bake wraps its last loop's tail to the start
 *   D11 the same key struck again while sounding restrikes (no merge)
 * Sequential hx instances only — the stub host is process-global. */
#include "harness.h"

static int find_note(clip_t *cl, uint32_t tick, int pitch) {
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].tick == tick && (pitch < 0 || cl->notes[i].pitch == pitch))
            return i;
    return -1;
}

static int has_pitch(clip_t *cl, int pitch) {
    for (int i = 0; i < cl->note_count; i++)
        if (cl->notes[i].pitch == pitch) return 1;
    return 0;
}

int main(void) {
    /* ---- D1: retrigger OFF — a legato second onset must NOT re-anchor the
     * arp step pattern. Note A (60) holds 8 steps; note B (64) lands at step
     * 3 while A is held (buffer non-empty -> no was_empty anchor). With
     * retrigger honored, the fire at tick 72 sits on pattern step 3 and gets
     * step_int[3] = +7 degrees (= +1 octave in major); the old forced-ON
     * bake re-anchored at B's onset -> pattern step 0, no offset. */
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    inst->pad_key = 0; inst->pad_scale = 0;   /* C major */
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_0_gate", "192");        /* hold 8 steps */
    hx_set_param(h, "t1_c0_step_3_toggle", "64 100");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_retrigger 0");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_steps_mode 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_step_int 3 7");
    hx_set_param(h, "bake", "1 0 0 1 0 0");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        int ni = find_note(cl, 72, -1);
        HX_ASSERT(ni >= 0, "D1: no baked note at tick 72");
        HX_ASSERT(cl->notes[ni].pitch > 64,
                  "D1: retrigger OFF ignored — tick-72 fire has no step-3 offset");
    }
    hx_destroy(h);

    /* ---- D3 (P7): the store's automation SURVIVES a loop-unroll bake, pinned
     * to the pre-bake length (16 steps x 24 = 384 lane ticks) so it keeps
     * looping in step with the notes the user heard; an entry that already had
     * its own window is left alone. */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_pa_set", "0 1:synth:cutoff 0 8000");
    hx_set_param(h, "t1_pa_set", "0 1:synth:reso 0 8000");
    hx_set_param(h, "t1_pa_loop", "0 1:synth:reso 96 0 0");
    hx_set_param(h, "bake", "1 0 0 2 0 0");   /* loops=2 -> 32 steps */
    {
        char _pl[4096];
        hx_get_param(h, "pa_list", _pl, sizeof(_pl));
        HX_ASSERT(strstr(_pl, "1 0 9 1 1:synth:cutoff 384 0"), "P7: a clip-following entry is pinned to the pre-bake length (384)");
        HX_ASSERT(strstr(_pl, "1 0 9 1 1:synth:reso 96 0"), "P7: an entry with its own window keeps it");
    }
    HX_ASSERT(inst->tracks[1].clips[0].length == 32, "D3: bake did not unroll to 32 steps");
    hx_destroy(h);

    /* ---- D3b: the same, for a clip whose loop is PAGE 2 (steps 17-32). The
     * bake moves the notes to the start of the clip and resets the loop start,
     * but the automation's points stay where they were written — at the old
     * window's ticks (384..767). Pinned with offset 0 the lane then looked in
     * [0, 384), found nothing, and held one value for the whole clip. The pin
     * carries the old window's START as well as its length. */
    for (int loops = 1; loops <= 2; loops++) {
        char bake[32];
        h = hx_create(NULL);
        inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_c0_step_16_toggle", "60 100");
        hx_set_param(h, "t1_c0_loop_set", "1048592");            /* (16 << 16) | 16 */
        HX_ASSERT(inst->tracks[1].clips[0].loop_start == 16 && inst->tracks[1].clips[0].length == 16,
                  "D3b rig: the loop window was not set");
        hx_set_param(h, "t1_pa_set", "0 1:synth:cutoff 384 8000");
        snprintf(bake, sizeof bake, "1 0 0 %d 0 0", loops);
        hx_set_param(h, "bake", bake);
        HX_ASSERT(inst->tracks[1].clips[0].loop_start == 0, "D3b rig: the bake did not reset the loop start");
        HX_ASSERT(find_note(&inst->tracks[1].clips[0], 0, -1) >= 0, "D3b rig: the note was not moved to the clip start");
        {
            char _pl[4096];
            hx_get_param(h, "pa_list", _pl, sizeof(_pl));
            /* pa_list: … target, loop length, rate, scale %, loop START, step */
            if (!strstr(_pl, "1 0 9 1 1:synth:cutoff 384 0 100 384 ")) {
                fprintf(stderr, "FAIL: D3b (loops=%d): the automation was not pinned to the old window (384 ticks from 384): %s\n", loops, _pl);
                return 1;
            }
        }
        hx_destroy(h);
    }

    /* ---- D5 + echo-gate parity: scale-aware delay feedback.
     * C major, primary 60 (C), HARMZ +2 degrees -> copy 64 (E), fb_note +1
     * degree. Live: delta = st(60,+1)-60 = +2 semitones applied to BOTH
     * copies -> echoes 62 and 66. Old bake re-transposed the copy itself:
     * st(64,+1) = 65 — must NOT appear. D7: echoes are as long as the note
     * they echo (192 ticks here), as playback sends them — not the track's
     * default gate (GATE_TICKS * gate%/100 = 12). */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    inst->scale_aware = 1; inst->pad_key = 0; inst->pad_scale = 0;
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    hx_set_param(h, "t1_c0_step_0_gate", "192");
    hx_set_param(h, "t1_c0_pfx_set", "harm_interval1 2");
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 3");
    hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 1");
    hx_set_param(h, "bake", "1 0 0 1 0 0");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        HX_ASSERT(has_pitch(cl, 62), "D5: primary echo (62) missing");
        HX_ASSERT(has_pitch(cl, 66), "D5: harmony echo must carry the PRIMARY delta (66)");
        HX_ASSERT(!has_pitch(cl, 65), "D5: per-note re-transpose (65) resurfaced");
        int found_echo = 0;
        for (int i = 0; i < cl->note_count; i++) {
            if (cl->notes[i].tick > 0) {
                HX_ASSERT(cl->notes[i].gate == 192, "D7: an echo must be as long as its note (192)");
                found_echo = 1;
            }
        }
        HX_ASSERT(found_echo, "D5: no echoes baked at all");
    }
    hx_destroy(h);

    /* ---- D8: an echo due on the very tick of the next note drops (Retrig
     * on), as playback mostly does: 40@0+12, 60@24+12, delay 24 ticks, pitch
     * feedback +3 -> no 43 at tick 24; 60's own echo 63 at 48 stays. */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    hx_set_param(h, "t1_c0_step_1_toggle", "60 100");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        for (int i = 0; i < cl->note_count; i++) cl->notes[i].gate = 12;
        clip_build_steps_from_notes(cl);
    }
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 5");
    hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 3");
    hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 1");
    hx_set_param(h, "bake", "1 0 0 1 0 1");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        HX_ASSERT(!has_pitch(cl, 43), "D8: the echo on the next note's tick must drop");
        HX_ASSERT(has_pitch(cl, 63), "D8 control: the second note's echo is there");
    }
    hx_destroy(h);

    /* ---- D9: under SEQ ARP a fixed-Gate echo waits for its note's end, as
     * playback's does (the arp holds notes by pitch): 40@0 held 96 ticks, its
     * echo 45 at 24 with Gate 1/64 stays in the arp till 96 — baked, the arp
     * still plays 45 after the echo's own 6 ticks. */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        cl->notes[0].gate = 96;
        clip_build_steps_from_notes(cl);
    }
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 5");
    hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 5");
    hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
    hx_set_param(h, "t1_c0_pfx_set", "delay_gate_fb 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 0");
    hx_set_param(h, "bake", "1 0 0 1 0 0");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        int late = 0;
        for (int i = 0; i < cl->note_count; i++) late += cl->notes[i].active && cl->notes[i].pitch == 45 && cl->notes[i].tick > 36 && cl->notes[i].tick < 96;
        char m[96]; snprintf(m, sizeof m, "D9: the arp plays 45 %d times after its echo's own Gate (want some)", late);
        HX_ASSERT(late > 0, m);
    }
    hx_destroy(h);

    /* ---- D10: a wrapped bake over 2 loops keeps the last loop's echo tail
     * and wraps it to the clip's start (once): one note at 60 (gate 12), echoes
     * every 48 ticks at +7, clip 96 ticks -> 6@60 13@108 20@156 | 6@156 and
     * the tail 13@204 -> 12, 20@252 -> 60. */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 4; cl->loop_start = 0;
        clip_insert_note(cl, 60, 12, 6, 90);
        clip_build_steps_from_notes(cl);
    }
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 2");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 8");
    hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 7");
    hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
    hx_set_param(h, "bake", "1 0 0 2 0 1");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        HX_ASSERT(cl->note_count == 6, "D10: six notes (no tail doubled, none lost)");
        HX_ASSERT(find_note(cl, 12, 13) >= 0 && find_note(cl, 60, 20) >= 0, "D10: the last loop's tail wraps to the start");
    }
    hx_destroy(h);

    /* ---- D11: the same key struck again while sounding ends there and
     * strikes again (playback's retrigger guard), never merging: 60 at 0, 24
     * and 48, each 30 long, echoes on +7 -> 60@0+24, 60@24+24, 60@48+30. */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 8; cl->loop_start = 0;
        for (int k = 0; k < 3; k++) clip_insert_note(cl, (uint32_t)(24 * k), 30, 60, 90);
        clip_build_steps_from_notes(cl);
    }
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 8");
    hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 7");
    hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
    hx_set_param(h, "bake", "1 0 0 1 0 1");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        const int a = find_note(cl, 0, 60), b = find_note(cl, 24, 60), c = find_note(cl, 48, 60);
        HX_ASSERT(a >= 0 && b >= 0 && c >= 0, "D11: three strikes of 60, not one merged note");
        HX_ASSERT(cl->notes[a].gate == 24 && cl->notes[b].gate == 24 && cl->notes[c].gate == 30, "D11: each ends where the key strikes again");
    }
    hx_destroy(h);

    /* ---- A3: a phrase starts as playback starts it (arp_tick): Sync off
     * fires on the note (ruled 2026-11-21), Sync on waits for the rate
     * boundary; either way the Arp Steps column re-anchors there. A note at
     * tick 6 (rate 1/16 = 24 ticks): free fires at 6, synced at 24. */
    for (int sync = 0; sync <= 1; sync++) {
        h = hx_create(NULL);
        inst = (seq8_instance_t *)h->inst;
        hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
        {
            clip_t *cl = &inst->tracks[1].clips[0];
            cl->notes[0].tick = 6; cl->notes[0].gate = 40;
            clip_build_steps_from_notes(cl);
        }
        hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
        hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 1");
        hx_set_param(h, "t1_c0_pfx_set", sync ? "seq_arp_sync 1" : "seq_arp_sync 0");
        hx_set_param(h, "bake", "1 0 0 1 0 0");
        {
            clip_t *cl = &inst->tracks[1].clips[0];
            uint32_t first = UINT32_MAX;
            for (int i = 0; i < cl->note_count; i++) if (cl->notes[i].active && cl->notes[i].tick < first) first = cl->notes[i].tick;
            char m[96]; snprintf(m, sizeof m, "A3: Sync %s, the first arp note at %u (want %u)", sync ? "on" : "off", first, sync ? 24u : 6u);
            HX_ASSERT(first == (sync ? 24u : 6u), m);
        }
        hx_destroy(h);
    }

    /* ...and its Arp Steps column starts there: a phrase at tick 102 plays
     * pattern step 1 first (an interval on it: +7 degrees), not the step the
     * clip's count would give (4) */
    h = hx_create(NULL);
    inst = (seq8_instance_t *)h->inst;
    inst->pad_key = 0; inst->pad_scale = 0;
    hx_set_param(h, "t1_c0_step_0_toggle", "60 100");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        cl->notes[0].tick = 102; cl->notes[0].gate = 30;
        clip_build_steps_from_notes(cl);
    }
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_style 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_rate 1");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_sync 0");
    hx_set_param(h, "t1_c0_pfx_set", "seq_arp_step_int 0 7");
    hx_set_param(h, "bake", "1 0 0 1 0 0");
    {
        clip_t *cl = &inst->tracks[1].clips[0];
        const int ni = find_note(cl, 102, -1);
        HX_ASSERT(ni >= 0 && cl->notes[ni].pitch > 60, "A3: the phrase's first note is pattern step 1 (its interval)");
    }
    hx_destroy(h);

    printf("PASS: bake_parity (D1 retrigger, D5 primary-delta, D7 echo length, D8 same-tick echo, D9 arp echo, D10 multi-loop tail, D11 restrike, A3 phrase start)\n");
    return 0;
}
