/* tests/test_stop_ends_echoes.c — Stop ends DELAY's echoes still to come.
 * A track routed to Move had its whole echo queue moved to "now" on Stop,
 * note-ons included, so every echo still to come played at once as a chord;
 * a drum lane's echo queue was not touched at all, so its echoes went on
 * playing in time after Stop. Now the queued note-offs go out and the queued
 * note-ons are dropped, melodic and drum, on every route. A note sounding at
 * the Stop still gets its note-off. Restart and Panic end the drum lanes'
 * echoes too (they share the silencer with a direction change). */
#include "pfx_rig.h"

/* track 1 melodic (60, long) or track 2 drum (lane 0), DELAY 1/16 x 3 */
static hx_t *rig(int drum, const char *route) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    HX_NO_LEAD(h);
    hx_set_param(h, "bpm", "120");
    const int t = drum ? 2 : 1;
    char k[32];
    if (drum) {
        hx_set_param(h, "t2_l0_note_add", "0 100 60");
        snprintf(k, sizeof k, "t2_l0_pfx_set");
    } else {
        hx_set_param(h, "t1_c0_step_0_toggle", "40 100");
        clip_t *cl = &inst->tracks[1].clips[0];
        cl->note_count = 0; cl->ticks_per_step = 24; cl->length = 16; cl->loop_start = 0;
        clip_insert_note(cl, 0, 60, 60, 100);
        clip_build_steps_from_notes(cl);
        snprintf(k, sizeof k, "t1_c0_pfx_set");
    }
    hx_set_param(h, k, "delay_level 127");
    hx_set_param(h, k, "delay_repeats 3");
    hx_set_param(h, k, "delay_time 5");
    hx_set_param(h, k, "delay_retrig 0");
    if (!drum) hx_set_param(h, k, "delay_pitch_fb 3");   /* 63 66 69: three echoes, not one merged pitch */
    snprintf(k, sizeof k, "t%d_route", t); hx_set_param(h, k, route);
    rig_launch(h, t, 0);
    return h;
}

/* play to tick 12 (the note sounding, its echoes due at 24 48 72), Stop,
 * then render well past where the echoes were due */
static void run(int drum, const char *route, int *ons_after, int *offs_after) {
    hx_t *h = rig(drum, route);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_clear_capture(h);
    g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 400000;
    while (inst->playing && rig_now(h) < 12 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    const int before = g_an;
    int on_before = 0, pitch = -1;
    for (int i = 0; i < before; i++) if (g_a[i].kind == 0) { on_before++; pitch = g_a[i].a; }
    HX_ASSERT(on_before == 1, "control: the note played before the Stop, and no echo yet");
    const int first = hx_stub_event_count();
    hx_set_param(h, "transport", "stop");
    const int stop_block = first ? hx_stub_event(first - 1)->block : 0;
    for (int i = 0; i < 400; i++) hx_render(h, 1);
    /* Stop's sweep sends every pitch's note-off to the chain slots of all
     * tracks, so on a Move route only what reaches Move counts, and it must
     * come at once (the render after Stop), not at the note's end */
    const int move = !strcmp(route, "move");
    *ons_after = *offs_after = 0;
    for (int i = first; i < hx_stub_event_count(); i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind == HX_PARAM_SET) continue;
        const uint8_t st = e->bytes[1] & 0xF0;
        const int on = st == 0x90 && e->bytes[3] > 0, off = st == 0x80 || (st == 0x90 && !e->bytes[3]);
        *ons_after += on;
        if (off && e->bytes[2] == pitch && (!move || (e->kind == HX_MIDI_INJECT && e->block <= stop_block + 1)))
            (*offs_after)++;
    }
    hx_destroy(h);
}

/* play to tick 12, then Restart or Panic, then on for 90 ticks: a Restart
 * plays the hit and its echoes again from 0 (on 0 24 48 72) and none of the
 * old ones (due 12 36 60 after it); after a Panic nothing plays until the
 * clip comes round. *n = the note-ons after, *off_grid of them off the
 * 24-tick grid. */
static void run2(int drum, const char *route, const char *verb, int *n, int *off_grid) {
    hx_t *h = rig(drum, route);
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_clear_capture(h);
    g_seen = 0; g_an = 0;
    rig_play(h);
    int guard = 400000;
    while (inst->playing && rig_now(h) < 12 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    const int before = g_an;
    hx_set_param(h, "transport", verb);
    const uint32_t t0 = !strcmp(verb, "panic") ? rig_now(h) : 0;
    guard = 400000;
    while (inst->playing && rig_now(h) < t0 + 90 && guard-- > 0) { hx_render(h, 1); drain(g_a, &g_an, rig_now(h)); }
    *n = *off_grid = 0;
    for (int i = before; i < g_an; i++) if (g_a[i].kind == 0) { (*n)++; *off_grid += g_a[i].tick % 24 > 2; }
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
}

int main(void) {
    static const char *const routes[] = { "move", "schwung" };
    int bad = 0;
    for (int drum = 0; drum <= 1; drum++) for (int r = 0; r < 2; r++) {
        int ons, offs;
        run(drum, routes[r], &ons, &offs);
        printf("  %s, route %s: %d note-ons after Stop (want 0), note-off for the held note: %s\n",
               drum ? "drum lane" : "melodic", routes[r], ons, offs ? "yes" : "NO");
        bad += ons != 0 || offs == 0;
    }
    HX_ASSERT(bad == 0, "Stop: no echo plays after it, and the held note gets its note-off");
    int bad2 = 0;
    for (int drum = 0; drum <= 1; drum++) for (int r = 0; r < 2; r++) {
        int n, og;
        run2(drum, routes[r], "restart", &n, &og);
        printf("  %s, route %s, Restart: %d note-ons in the next 90 ticks (want 4), %d off the grid\n", drum ? "drum lane" : "melodic", routes[r], n, og);
        bad2 += n != 4 || og;
        run2(drum, routes[r], "panic", &n, &og);
        printf("  %s, route %s, Panic: %d note-ons in the next 90 ticks (want 0)\n", drum ? "drum lane" : "melodic", routes[r], n);
        bad2 += n != 0;
    }
    HX_ASSERT(bad2 == 0, "Restart and Panic end the echoes still to come");
    printf("PASS: stop ends echoes\n");
    return 0;
}
