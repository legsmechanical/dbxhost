/* tests/test_echo_fixed_gate.c — DELAY's fixed Gate is the echo's length even
 * while the note it echoes is held (ruled 2026-11-25: short means short). A
 * note held 4 steps, echoes every step, Gate 1/64 (6 ticks): each echo ends
 * 6 ticks after it starts, not when the note is released. Melodic and drum.
 * And the default Gate still gives an echo its note's own length (melodic). */
#include "pfx_rig.h"

static hx_t *rig(int drum, int fixed) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    clip_t *cl;
    drum_lane_t *ln = NULL;
    if (drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 6");
        ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        HX_ASSERT(ln, "control: the lane");
        cl = &ln->clip;
    } else {
        hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
        cl = &inst->tracks[1].clips[0];
    }
    cl->note_count = 0;
    cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, 0, 96, drum ? ln->midi_note : 40, 100);
    clip_build_steps_from_notes(cl);
    if (drum) {
        ln->pfx_params.delay_level = 127; ln->pfx_params.repeat_times = 2;
        ln->pfx_params.delay_time_idx = 5;           /* 1/16: 24 ticks */
        ln->pfx_params.delay_retrig = 0;
        ln->pfx_params.fb_gate_time = fixed;
        ln->pfx_params.gate_time = 800;              /* the hit itself rings 96 ticks */
    } else {
        char v[40];
        hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
        hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 2");
        hx_set_param(h, "t1_c0_pfx_set", "delay_time 5");
        hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 5");   /* echoes on their own pitch */
        hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
        snprintf(v, sizeof v, "delay_gate_fb %d", fixed);
        hx_set_param(h, "t1_c0_pfx_set", v);
    }
    rig_launch(h, drum ? 2 : 1, 0);
    return h;
}

/* the first on of pitch p at or after `from`, and the off that ends it */
static int len_of(uint8_t p, uint32_t from, uint32_t *on) {
    for (int i = 0; i < g_an; i++) {
        if (g_a[i].kind || g_a[i].a != p || g_a[i].tick < from) continue;
        *on = g_a[i].tick;
        for (int k = i + 1; k < g_an; k++)
            if (g_a[k].a == p && (g_a[k].kind == 3 || g_a[k].kind == 0)) return (int)(g_a[k].tick - g_a[i].tick);
        return -1;
    }
    return -2;
}


/* a melodic clip of one note, fixed echo Gate 1/64, for the review cases */
static hx_t *one(uint32_t at, uint16_t gate, const char *const *set) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
    clip_t *cl = &inst->tracks[1].clips[0];
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, at, gate, 40, 100);
    clip_build_steps_from_notes(cl);
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
    hx_set_param(h, "t1_c0_pfx_set", "delay_gate_fb 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
    /* "!key", "value" sets a global; anything else is a clip effect */
    for (; *set; set++) {
        if ((*set)[0] == '!') { hx_set_param(h, *set + 1, set[1]); set++; }
        else hx_set_param(h, "t1_c0_pfx_set", *set);
    }
    rig_launch(h, 1, 0);
    return h;
}
/* no pitch left sounding, no off before its on */
static int stuck_but(int skip) {
    int cnt[128] = { 0 }, bad = 0;
    for (int i = 0; i < g_an; i++) {
        if (g_a[i].a == skip) continue;
        if (g_a[i].kind == 0) cnt[g_a[i].a]++;
        else if (g_a[i].kind == 3 && cnt[g_a[i].a] > 0) cnt[g_a[i].a]--;
    }
    for (int p = 0; p < 128; p++) bad += cnt[p] != 0;
    return bad;
}
static int stuck(void) { return stuck_but(-1); }

int main(void) {
    /* melodic: echoes at 24 (45) and 48 (50), the note held to 96 */
    for (int fixed = 0; fixed <= 1; fixed++) {
        hx_t *h = rig(0, fixed);
        play(h, 16, g_a, &g_an);
        uint32_t on = 0;
        const int a = len_of(45, 0, &on), b = len_of(50, 0, &on);
        char m[128];
        snprintf(m, sizeof m, "melodic, Gate %s: echoes %d and %d ticks long (want %d)", fixed ? "1/64" : "--", a, b, fixed ? 6 : 96);
        printf("  %s\n", m);
        HX_ASSERT(a >= (fixed ? 5 : 95) && a <= (fixed ? 7 : 97) && b >= (fixed ? 5 : 95) && b <= (fixed ? 7 : 97), m);
        hx_destroy(h);
    }
    /* drum: a hit ringing 96 ticks, echoes of the same note at 24 and 48 —
     * a restrike ends what sounds, so look at the second echo's own length */
    {
        hx_t *h = rig(1, 1);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        const uint8_t p = RIG_LANE(inst->tracks[2].drum_clips[0], 1)->midi_note;
        play(h, 16, g_a, &g_an);
        uint32_t on = 0;
        const int b = len_of(p, 40, &on);
        char m[128];
        snprintf(m, sizeof m, "drum, Gate 1/64: the echo at %u is %d ticks long (want 6)", on, b);
        printf("  %s\n", m);
        HX_ASSERT(on >= 47 && on <= 49 && b >= 5 && b <= 7, m);
        hx_destroy(h);
    }
    /* swing at full: an echo late in an off-beat step with a Gate shorter
     * than the swing delay — its off is timed from its own swung on, so it
     * never goes out first (a held note and a short one) */
    for (int g = 0; g < 2; g++) {
        static const char *const set[] = { "delay_repeats 2", "delay_time 7", "delay_pitch_fb 5",
                                           "!groove_kind", "1", "!groove_amt", "100", NULL };
        hx_t *h = one(58, g ? 6 : 96, set);
        play(h, 16, g_a, &g_an);
        const int n = stuck();
        char m[96]; snprintf(m, sizeof m, "swing, note %s: %d pitches left sounding", g ? "short" : "held", n);
        printf("  %s\n", m);
        HX_ASSERT(n == 0, m);
        hx_destroy(h);
    }
    /* SEQ ARP over a held note whose echoes are on its own pitch: the echo
     * waits for the note's end, so the arp keeps the note and plays on */
    {
        static const char *const set[] = { "delay_repeats 2", "delay_time 5", "delay_pitch_fb 0",
                                           "seq_arp_style 1", "seq_arp_rate 1", NULL };
        hx_t *h = one(0, 192, set);
        play(h, 16, g_a, &g_an);
        uint32_t last = 0;
        for (int i = 0; i < g_an; i++) if (!g_a[i].kind && g_a[i].tick < 192 && g_a[i].tick > last) last = g_a[i].tick;
        char m[96]; snprintf(m, sizeof m, "SEQ ARP over a held note: last arp note at %u (want past 150)", last);
        printf("  %s\n", m);
        HX_ASSERT(last > 150, m);
        hx_destroy(h);
    }
    /* drum, swing at full: a hit late in an off-beat step, echoes 36 ticks
     * on, Gate 1/64 and the default — every echo ends after it starts (a
     * drum lane has no refcount: an off sent first leaves the echo ringing
     * to the next hit) */
    for (int fixed = 0; fixed <= 1; fixed++) {
        hx_t *h = rig(1, fixed);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        drum_lane_t *ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        clip_t *cl = &ln->clip;
        cl->note_count = 0;
        clip_insert_note(cl, 58, 6, ln->midi_note, 100);
        clip_build_steps_from_notes(cl);
        ln->pfx_params.delay_time_idx = 7;
        ln->pfx_params.gate_time = 50;
        hx_set_param(h, "groove_kind", "1");
        hx_set_param(h, "groove_amt", "100");
        rig_launch(h, 2, 0);
        const uint8_t p = ln->midi_note;
        play(h, 16, g_a, &g_an);
        int open = 0, bad = 0, ons = 0;
        for (int i = 0; i < g_an; i++) {
            if (g_a[i].a != p) continue;
            if (g_a[i].kind == 0) { if (open) bad++; open = 1; ons++; }
            else if (g_a[i].kind == 3) open = 0;
        }
        bad += open;
        char m[112]; snprintf(m, sizeof m, "drum, swing, Gate %s: %d of %d hits and echoes never ended on their own", fixed ? "1/64" : "--", bad, ons);
        printf("  %s\n", m);
        HX_ASSERT(ons >= 3 && bad == 0, m);
        hx_destroy(h);
    }
    /* swing at odd tempos: an echo's off at its note's end is clamped to
     * after the on AS IT WAS QUEUED (re-estimating that swing at the note's
     * end could disagree by a step and send the off first) — the default
     * Gate, and a waiting fixed one (pitch feedback 0) */
    {
        static const char *const bpms[] = { "174", "133", "77" };
        for (int b = 0; b < 3; b++) for (int fx = 0; fx <= 1; fx++) {
            const char *set[] = { fx ? "delay_pitch_fb 0" : "delay_pitch_fb 5", "delay_repeats 3", "delay_time 8",
                                  fx ? "delay_gate_fb 1" : "delay_gate_fb 0",
                                  "!groove_kind", "1", "!groove_amt", "80", "!bpm", bpms[b], NULL };
            int bad = 0;
            for (uint32_t at = 0; at < 96; at += 3) {
                hx_t *h = one(at, fx ? 96 : 6, set);
                play(h, 16, g_a, &g_an);
                /* echoes only: a 6-tick note swung across into an unswung
                 * step can end before it starts — the sequencer's own swing,
                 * not the delay's (a matter of its own) */
                if (stuck_but(fx ? -1 : 40)) { bad++; if (getenv("EFG_DUMP")) { printf("    at %u:", at); for (int i = 0; i < g_an; i++) if (g_a[i].kind == 0 || g_a[i].kind == 3) printf(" %s%u@%u", g_a[i].kind ? "off" : "ON", g_a[i].a, g_a[i].tick); printf("\n"); } }
                hx_destroy(h);
            }
            char m[112]; snprintf(m, sizeof m, "swing 80%% at %s bpm, Gate %s: %d of 32 placements left a note sounding", bpms[b], fx ? "1/64" : "--", bad);
            printf("  %s\n", m);
            HX_ASSERT(bad == 0, m);
        }
    }
    /* a chord into SEQ ARP: the echo of 40 lands on 45, which the chord still
     * holds — it waits, so the arp keeps 45 */
    {
        static const char *const set[] = { "delay_repeats 1", "delay_time 5", "delay_pitch_fb 5",
                                           "seq_arp_style 1", "seq_arp_rate 1", NULL };
        hx_t *h = one(0, 192, set);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        clip_t *cl = &inst->tracks[1].clips[0];
        clip_insert_note(cl, 0, 192, 45, 100);
        clip_build_steps_from_notes(cl);
        rig_launch(h, 1, 0);
        play(h, 16, g_a, &g_an);
        int late45 = 0;
        for (int i = 0; i < g_an; i++) late45 += !g_a[i].kind && g_a[i].a == 45 && g_a[i].tick > 100 && g_a[i].tick < 192;
        char m[96]; snprintf(m, sizeof m, "chord into SEQ ARP: 45 arped %d times after tick 100 (want some)", late45);
        printf("  %s\n", m);
        HX_ASSERT(late45 > 0, m);
        hx_destroy(h);
    }
    /* a Conductor "Now" retrigger re-pitches a held note (51 -> 55) while
     * its echo waits: the echo's off goes to the pitch it went out on, not
     * the note's new one — no pitch left held (default Gate and fixed, the
     * echo on the note's own pitch) */
    for (int fixed = 0; fixed <= 1; fixed++) {
        hx_t *h = hx_create(NULL);
        HX_NO_LEAD(h);
        seq8_instance_t *I = (seq8_instance_t *)h->inst;
        hx_set_param(h, "scale_aware", "0");
        hx_set_param(h, "key", "9");
        hx_set_param(h, "t3_convert_to_conduct", "1");
        hx_set_param(h, "t3_c0_cond_lock", "1");
        hx_set_param(h, "t3_c0_step_0_toggle", "60 100");
        hx_set_param(h, "t3_c0_step_4_toggle", "64 100");
        hx_set_param(h, "t3_c0_cond_resp", "1 1");
        hx_set_param(h, "t3_c0_cond_when", "1 1");
        hx_set_param(h, "t1_c0_step_1_toggle", "60 100");
        hx_set_param(h, "t1_c0_step_1_gate", "150");
        hx_set_param(h, "t1_c0_pfx_set", "delay_level 127");
        hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
        hx_set_param(h, "t1_c0_pfx_set", "delay_time 5");
        hx_set_param(h, "t1_c0_pfx_set", "delay_retrig 0");
        hx_set_param(h, "t1_c0_pfx_set", "delay_pitch_fb 0");
        hx_set_param(h, "t1_c0_pfx_set", fixed ? "delay_gate_fb 1" : "delay_gate_fb 0");
        hx_set_param(h, "t1_launch_clip", "0");
        hx_set_param(h, "t3_launch_clip", "0");
        hx_set_param(h, "transport", "play");
        for (int g = 0; I->tracks[3].current_step < 14 && g < 4000; g++) hx_render(h, 1);
        int held = 0;
        for (int p = 0; p < 128; p++) held += I->tracks[1].pfx.pitch_refcount[p] != 0;
        char m[96]; snprintf(m, sizeof m, "Conductor retrigger, Gate %s: %d pitches left held", fixed ? "1/64" : "--", held);
        printf("  %s\n", m);
        HX_ASSERT(held == 0, m);
        hx_destroy(h);
    }
    printf("PASS: echo fixed gate\n");
    return 0;
}
