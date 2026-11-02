/* tests/test_move_lead_stamps.c — under THE LEAD (test_move_lead.c), what is
 * played live is heard the lead BEHIND the sequencer, so everything that
 * stamps a live gesture with the sequencer's position steps it back.
 * test_move_lead pins notes and drum hits; this pins the other stamps, each by
 * the same moment taken with the lead on and off:
 *
 *   - Capture: the ring's clip tick and transport tick, exactly the lead
 *     earlier;
 *   - the live looper: a played note's loop position, exactly the lead earlier;
 *   - recorded aftertouch, channel (the automation store's `at` lane, melodic
 *     and drum) and poly (the clip's AT lanes): the cell the lead-earlier
 *     tick falls in;
 *   - the knob recorder, recording and capturing alike: the same.
 *
 * The cells are 12 ticks, so the moment is 1 tick past a cell line: with the
 * lead (2 ticks at 120) it lands in the cell before. */
#include "harness.h"
#include <stdio.h>
#include <string.h>

#define T 4                      /* a melodic Schwung track */
#define AT_VAL ((100 * 16383) / 127)

static int L;                    /* the lead in ticks, read off the engine */

/* track t playing clip 0, stopped at the moment its clip tick is `at` */
static hx_t *at_moment(int lead_off, int t, uint32_t at) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[t];
    char k[48];
    if (lead_off) HX_NO_LEAD(h);
    snprintf(k, sizeof k, "t%d_route", t); hx_set_param(h, k, "schwung");
    snprintf(k, sizeof k, "t%d_launch_clip", t); hx_set_param(h, k, "0");
    hx_set_param(h, "transport", "play");
    for (int i = 0; i < 400; i++) {
        uint32_t now = tr->pad_mode == PAD_MODE_DRUM
            ? (uint32_t)tr->drum_current_step[0] * TICKS_PER_STEP + tr->drum_tick_in_step[0]
            : tr->current_clip_tick;
        if (now == at) break;
        hx_render(h, 1);
    }
    if (!lead_off) L = (int)lead_ticks(inst);
    return h;
}

/* the latest tick of an automation-store point holding `val` on (t, clip 0, target) */
static int pa_point_at(hx_t *h, int t, const char *target, uint16_t val) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int id = pa_target_id(inst, target), best = -1;
    const pa_entry_t *e = id >= 0 ? pa_find(inst, t, 0, id) : NULL;
    for (int i = 0; e && i < e->count; i++)
        if (e->points[i].val == val && (int)e->points[i].tick > best) best = e->points[i].tick;
    return best;
}

/* ---- Capture: the ring's stamps ---- */
static void capture(int lead_off, int *ctick, int *abs_tick, int *abs_now) {
    hx_t *h = at_moment(lead_off, T, 25);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    *abs_now = (int)(inst->global_tick * TICKS_PER_STEP + inst->master_tick_in_step);
    live_note_on(inst, &inst->tracks[T], 61, 90);
    const cap_ev_t *ev = &inst->cap_ring[(inst->cap_head + inst->cap_count - 1) % CAP_MAX_EVENTS];
    HX_ASSERT(inst->cap_count >= 1 && ev->type == CAP_EV_NOTE_ON && ev->a == 61, "rig: the note was not captured");
    *ctick = (int)ev->ctick; *abs_tick = (int)ev->abs_tick;
    hx_destroy(h);
}

/* ---- the live looper: a played note's loop position ---- */
static int looper(int lead_off) {
    hx_t *h = at_moment(lead_off, T, 0);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "looper_sync", "0");
    hx_set_param(h, "looper_arm", "96");
    for (int i = 0; i < 400 && !(inst->looper_state == LOOPER_STATE_CAPTURING && inst->looper_pos == 25); i++)
        hx_render(h, 1);
    HX_ASSERT(inst->looper_state == LOOPER_STATE_CAPTURING && inst->looper_pos == 25, "rig: the looper never reached 25");
    uint32_t n0 = inst->looper_event_count;
    live_note_on(inst, &inst->tracks[T], 61, 90);
    HX_ASSERT(inst->looper_event_count == n0 + 1, "rig: the played note did not reach the looper");
    int got = inst->looper_events[n0].tick;
    hx_destroy(h);
    return got;
}

/* ---- recorded aftertouch: channel (the `at` lane) or poly (clip AT lanes) ---- */
static int aftertouch(int lead_off, int t, int poly) {
    hx_t *h = at_moment(lead_off, t, 25);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[t];
    char k[32];
    tr->recording = 1;
    snprintf(k, sizeof k, "t%d_live_at", t);
    hx_set_param(h, k, poly ? "60 100 1" : "60 100 2");
    int got = -1;
    if (poly) {
        const at_auto_t *a = &tr->clip_at_auto[tr->active_clip];
        for (int l = 0; l < AT_MAX_LANES; l++)
            if (a->pitch[l] == 60 && a->count[l]) got = a->ticks[l][a->count[l] - 1];
    } else {
        got = pa_point_at(h, t, "at", AT_VAL);
    }
    hx_destroy(h);
    return got;
}

/* ---- the knob recorder: recording, or held for Capture ---- */
static int knob(int lead_off, int rec) {
    hx_t *h = at_moment(lead_off, T, 25);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    seq8_track_t *tr = &inst->tracks[T];
    tr->recording = (uint8_t)rec;
    hx_set_param(h, "t4_pa_live", "1:fx1:cutoff 3000");
    pa_record_tick(inst, tr, T, 0, tr->current_clip_tick, 24, 384);
    int got = -1;
    if (rec) got = pa_point_at(h, T, "1:fx1:cutoff", 3000);
    else for (int i = 0; i < inst->pa_cap[0].count; i++)
        if (inst->pa_cap[0].points[i].val == 3000) got = inst->pa_cap[0].points[i].tick;
    hx_destroy(h);
    return got;
}

int main(void) {
    char m[200];

    {   /* Capture */
        int c1, a1, n1, c0, a0, n0;
        capture(0, &c1, &a1, &n1);
        HX_ASSERT(L == 2, "rig: the lead is not 2 ticks at 120");
        capture(1, &c0, &a0, &n0);
        HX_ASSERT(c0 == 25 && a0 == n0, "control: without the lead Capture stamps the sequencer's tick");
        snprintf(m, sizeof m, "Capture's clip tick is %d with the lead, not %d", c1, 25 - L);
        HX_ASSERT(c1 == 25 - L, m);
        snprintf(m, sizeof m, "Capture's transport tick is %d behind the sequencer, not %d", n1 - a1, L);
        HX_ASSERT(n1 - a1 == L, m);
        printf("  ok   — Capture stamps where it was heard\n");
    }
    {   /* the live looper */
        int on = looper(0), off = looper(1);
        HX_ASSERT(off == 25, "control: without the lead the looper stamps its position");
        snprintf(m, sizeof m, "the looper stamped %d with the lead, not %d", on, 25 - L);
        HX_ASSERT(on == 25 - L, m);
        printf("  ok   — the live looper stamps where it was heard\n");
    }
    {   /* aftertouch: channel melodic, channel drum, poly */
        static const struct { int t, poly; const char *what; } C[] = {
            { T, 0, "channel aftertouch" }, { 0, 0, "a drum track's channel aftertouch" },
            { T, 1, "poly aftertouch" } };
        for (int i = 0; i < 3; i++) {
            int on = aftertouch(0, C[i].t, C[i].poly), off = aftertouch(1, C[i].t, C[i].poly);
            snprintf(m, sizeof m, "control: without the lead %s lands in cell 24 (got %d)", C[i].what, off);
            HX_ASSERT(off == 24, m);
            snprintf(m, sizeof m, "%s lands in cell %d with the lead, not 12", C[i].what, on);
            HX_ASSERT(on == 12, m);
            printf("  ok   — %s records where it was heard\n", C[i].what);
        }
    }
    {   /* the knob recorder */
        for (int rec = 1; rec >= 0; rec--) {
            int on = knob(0, rec), off = knob(1, rec);
            snprintf(m, sizeof m, "control: without the lead a %s knob lands in cell 24 (got %d)",
                     rec ? "recorded" : "captured", off);
            HX_ASSERT(off == 24, m);
            snprintf(m, sizeof m, "a %s knob lands in cell %d with the lead, not 12", rec ? "recorded" : "captured", on);
            HX_ASSERT(on == 12, m);
            printf("  ok   — a %s knob lands where it was heard\n", rec ? "recorded" : "captured");
        }
    }
    printf("PASS: test_move_lead_stamps\n");
    return 0;
}
