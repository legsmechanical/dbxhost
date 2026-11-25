/* tests/test_swing_short_note.c — under swing, a sequenced note never ends
 * before it starts. A short note late in a swung step has its note-on held
 * back; its note-off, due in the next (on-time) step, went out first and the
 * note rang for ever. Now the off keeps the note's length from where the
 * note-on sounds. Swept: swing kinds (swing, table groove), amounts, tempos,
 * positions across a step, lengths; melodic and drum. Each note must start,
 * end after it starts, and nothing be left sounding. */
#include "pfx_rig.h"

static int g_bad, g_runs, g_short;

static void one(int drum, const char *bpm, int kind, int amt, uint32_t at, uint16_t gate) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", bpm);
    clip_t *cl;
    uint8_t p;
    if (drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 6");
        drum_lane_t *ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        HX_ASSERT(ln, "control: the lane");
        cl = &ln->clip; p = ln->midi_note;
        ln->pfx_params.gate_time = 20;                 /* a short lane gate: the hit is short */
    } else {
        hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
        cl = &inst->tracks[1].clips[0]; p = 40;
    }
    cl->note_count = 0;
    cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, at, gate, p, 100);
    clip_build_steps_from_notes(cl);
    char v[16];
    snprintf(v, sizeof v, "%d", kind); hx_set_param(h, "groove_kind", v);
    snprintf(v, sizeof v, "%d", amt);  hx_set_param(h, "groove_amt", v);
    rig_launch(h, drum ? 2 : 1, 0);   /* two passes */
    play(h, 32, g_a, &g_an);
    int open = 0, bad = 0, ons = 0;
    uint32_t on_at = 0;
    for (int i = 0; i < g_an; i++) {
        if (g_a[i].a != p) continue;
        if (g_a[i].kind == 0) { if (open) bad++; open = 1; on_at = g_a[i].tick; ons++; }
        else if (g_a[i].kind == 3 && open) { open = 0; g_short += g_a[i].tick == on_at; }
        else if (g_a[i].kind == 3) bad += 0;          /* a stray off: harmless */
    }
    bad += open || ons < 2;
    if (bad) {
        g_bad++;
        if (g_bad <= 6) {
            printf("  %s bpm %s kind %d amt %d note @%u+%u:", drum ? "drum" : "melodic", bpm, kind, amt, at, gate);
            for (int i = 0; i < g_an && i < 40; i++) if (g_a[i].a == p && (g_a[i].kind == 0 || g_a[i].kind == 3)) printf(" %s@%u", g_a[i].kind ? "off" : "ON", g_a[i].tick);
            printf("\n");
        }
    }
    g_runs++;
    hx_destroy(h);
}

/* Live Merge capturing: a short swung note's off — moved past its parked
 * note-on — must reach the capture, or the note is written lasting to the end
 * of it. 1 = the captured note was closed by its off. */
static int merged_closed(int drum, int amt, uint32_t at, uint16_t gate) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    clip_t *cl; uint8_t p; const int t = drum ? 2 : 1;
    if (drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 6");
        drum_lane_t *ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
        cl = &ln->clip; p = ln->midi_note; ln->pfx_params.gate_time = 20;
    } else { hx_set_param(h, "t1_c0_step_0_toggle", "40 100"); cl = &inst->tracks[1].clips[0]; p = 40; }
    cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
    clip_insert_note(cl, at, gate, p, 100);
    clip_build_steps_from_notes(cl);
    char v[16];
    hx_set_param(h, "groove_kind", "1");
    snprintf(v, sizeof v, "%d", amt); hx_set_param(h, "groove_amt", v);
    rig_launch(h, t, 0);
    rig_play(h);
    hx_render(h, 1);
    inst->merge_state = MERGE_STATE_CAPTURING; inst->merge_solo_track = 0xFF; inst->merge_tps = 24;
    inst->merge_start_abs = inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step;
    memset(inst->merge_pending_count, 0, sizeof inst->merge_pending_count);
    for (int g = 0; inst->playing && rig_now(h) < ST(14) && g < 4000000; g++) hx_render(h, 1);
    int closed = -1;
    for (int i = 0; i < inst->merge_pending_count[t]; i++) if (inst->merge_pending[t][i].pitch == p) closed = inst->merge_pending[t][i].gate != 0;
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
    return closed;
}

int main(void) {
    static const char *const bpms[] = { "77", "120", "133", "174" };
    static const int amts[] = { 30, 60, 80, 100 };
    static const uint16_t gates[] = { 1, 3, 6, 12 };
    for (int drum = 0; drum <= 1; drum++)
    for (int b = 0; b < 4; b++) for (int kind = 1; kind <= 2; kind++) for (int a = 0; a < 4; a++)
    for (int g = 0; g < 4; g++) for (uint32_t at = 24; at < 72; at += 5)
        one(drum, bpms[b], kind, amts[a], at, gates[g]);
    printf("  %d runs, %d with a note ending before it starts or left sounding, %d zero-length\n", g_runs, g_bad, g_short);
    /* the next note of the pitch, on the on-time step: the swung note before
     * it kept its length, so its off is brought forward — and goes out ahead
     * of the new note, never just after it (which would cut it to nothing) */
    {
        int cut = 0, n = 0;
        for (int drum = 0; drum <= 1; drum++) for (int a = 0; a < 4; a++) for (uint32_t at = 30; at < 48; at += 3) {
            hx_t *h = hx_create(NULL);
            seq8_instance_t *inst = (seq8_instance_t *)h->inst;
            HX_NO_LEAD(h);
            hx_set_param(h, "bpm", "120");
            clip_t *cl; uint8_t p;
            if (drum) {
                hx_set_param(h, "t2_l0_note_add", "0 100 6");
                drum_lane_t *ln = RIG_LANE(inst->tracks[2].drum_clips[0], 1);
                cl = &ln->clip; p = ln->midi_note; ln->pfx_params.gate_time = 100;
            } else {
                hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
                cl = &inst->tracks[1].clips[0]; p = 40;
            }
            cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
            clip_insert_note(cl, at, 12, p, 100);
            clip_insert_note(cl, 48, 12, p, 100);
            clip_build_steps_from_notes(cl);
            char v[16];
            hx_set_param(h, "groove_kind", "1");
            snprintf(v, sizeof v, "%d", amts[a]); hx_set_param(h, "groove_amt", v);
            rig_launch(h, drum ? 2 : 1, 0);
            play(h, 32, g_a, &g_an);
            /* the note at 48 (and 432): its length */
            for (int i = 0; i < g_an; i++) {
                if (g_a[i].a != p || g_a[i].kind || (g_a[i].tick != 48 && g_a[i].tick != 432)) continue;
                /* the LAST note-on of the pitch on that tick is the new note
                 * (an older one swung onto it sounds first, for no time) */
                int later = 0;
                for (int k = i + 1; k < g_an && !later; k++) later = g_a[k].a == p && !g_a[k].kind && g_a[k].tick == g_a[i].tick;
                if (later) continue;
                n++;
                for (int k = i + 1; k < g_an; k++)
                    if (g_a[k].a == p && (g_a[k].kind == 3 || g_a[k].kind == 0)) { if (g_a[k].tick - g_a[i].tick < 3) cut++; break; }
            }
            hx_destroy(h);
        }
        char m[96]; snprintf(m, sizeof m, "the next note of the pitch: %d of %d cut short", cut, n);
        printf("  %s\n", m);
        HX_ASSERT(n > 0 && cut == 0, m);
    }
    HX_ASSERT(g_bad == 0, "under swing a note never ends before it starts");
    {
        int open = 0, n = 0;
        for (int drum = 0; drum <= 1; drum++) for (int a = 0; a < 4; a++) for (uint32_t at = 24; at < 48; at += 5)
            for (int g = 0; g < 4; g++) { const int c = merged_closed(drum, amts[a], at, gates[g]); n++; open += c != 1; }
        char m[96]; snprintf(m, sizeof m, "Live Merge: %d of %d short swung notes captured without their off", open, n);
        printf("  %s\n", m);
        HX_ASSERT(open == 0, m);
    }
    printf("PASS: swing short note\n");
    return 0;
}
