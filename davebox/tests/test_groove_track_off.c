/* tests/test_groove_track_off.c — a track with its Groove switched off plays
 * straight, beside a neighbour that still grooves.
 *
 * Track 1 (melodic) and track 0 (a drum lane) both play a note on every 1/16.
 * Each is captured three ways — no groove, groove on, groove on with that
 * track switched off — for a swing and for a table with an early slot. "Off"
 * must equal "no groove" event for event, block for block, and the neighbour
 * must not notice. Tracks are told apart by MIDI channel. */
#include "harness.h"

typedef struct { int n; struct { int block; uint8_t st, d1, d2; } ev[4000]; } cap_t;

/* Note packets on `ch` (0-based), any route. */
static void collect(cap_t *c, int ch) {
    c->n = 0;
    int total = hx_stub_event_count();
    for (int i = 0; i < total && c->n < 4000; i++) {
        const hx_midi_event *e = hx_stub_event(i);
        if (e->kind != HX_MIDI_INJECT) continue;
        uint8_t st = e->bytes[1] & 0xF0;
        if ((st != 0x90 && st != 0x80) || (e->bytes[1] & 0x0F) != ch) continue;
        c->ev[c->n].block = e->block; c->ev[c->n].st = e->bytes[1];
        c->ev[c->n].d1 = e->bytes[2]; c->ev[c->n].d2 = e->bytes[3];
        c->n++;
    }
}
static int same(const cap_t *a, const cap_t *b) {
    if (a->n != b->n) return 0;
    for (int i = 0; i < a->n; i++)
        if (a->ev[i].block != b->ev[i].block || a->ev[i].st != b->ev[i].st
                || a->ev[i].d1 != b->ev[i].d1) return 0;
    return 1;
}

/* groove: 0 none, 1 swing 1/16 at 80, 2 a table (slot 2 six ticks early).
 * off_track: -1 none, else the track whose Groove is switched off.
 * Also adds an echo on track 1, which is scheduled by fire time. */
static void run(int groove, int off_track, cap_t *mel, cap_t *drum) {
    char k[48], v[48];
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "create failed");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    hx_set_param(h, "bpm", "120");
    hx_set_bpm(h, 120.0f);
    for (int s = 0; s < 16; s++) {
        snprintf(k, sizeof(k), "t1_c0_step_%d_toggle", s);
        snprintf(v, sizeof(v), "%d 100", 48 + s);
        hx_set_param(h, k, v);
        snprintf(k, sizeof(k), "t1_c0_step_%d_gate", s);
        hx_set_param(h, k, "30");
        snprintf(k, sizeof(k), "t0_l0_step_%d_toggle", s);
        hx_set_param(h, k, "100");
    }
    hx_set_param(h, "t1_c0_pfx_set", "delay_level 100");
    hx_set_param(h, "t1_c0_pfx_set", "delay_repeats 1");
    hx_set_param(h, "t1_c0_pfx_set", "delay_time 3");
    {
        seq8_track_t *tr = &inst->tracks[0];
        tr->active_clip = 0; tr->queued_clip = -1; tr->will_relaunch = 1;
        pfx_sync_from_clip(tr);
    }
    if (groove == 1) hx_set_param(h, "swing_amt", "80");
    if (groove == 2) {
        groove_t *g = &inst->groove;
        g->kind = GROOVE_TABLE; g->base = 24; g->n_slots = 2;
        g->off[0] = 4 * GROOVE_FINE; g->off[1] = -6 * GROOVE_FINE; g->amt = 100;
    }
    if (off_track >= 0) {
        snprintf(k, sizeof(k), "t%d_groove_on", off_track);
        hx_set_param(h, k, "0");
        char b[8];
        HX_ASSERT(hx_get_param(h, k, b, sizeof(b)) > 0 && atoi(b) == 0, "groove_on reads back 0");
    }
    hx_clear_capture(h);
    hx_set_param(h, "transport", "play_focus:1:0");
    hx_render(h, 1400);
    collect(mel,  inst->tracks[1].channel);
    collect(drum, inst->tracks[0].channel);
    hx_set_param(h, "transport", "stop");
    hx_destroy(h);
}

static cap_t M0, D0, M1, D1, Mx, Dx;

int main(void) {
    {
        hx_t *h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        HX_ASSERT(inst->tracks[0].channel != inst->tracks[1].channel, "rig: the two tracks share a channel");
        char b[8];
        HX_ASSERT(hx_get_param(h, "t3_groove_on", b, sizeof(b)) > 0 && atoi(b) == 1, "Groove is on by default");
        hx_destroy(h);
    }
    static const char *name[3] = { "", "swing", "table" };
    for (int g = 1; g <= 2; g++) {
        run(0, -1, &M0, &D0);
        run(g, -1, &M1, &D1);
        HX_ASSERT(M0.n > 60 && D0.n > 60, "rig: both tracks play");
        HX_ASSERT(!same(&M0, &M1) && !same(&D0, &D1), "rig: the groove moves both tracks");

        run(g, 1, &Mx, &Dx);
        HX_ASSERT(same(&Mx, &M0), "a melodic track with Groove off plays exactly as with no groove");
        HX_ASSERT(same(&Dx, &D1), "…and the drum track beside it grooves as before");

        run(g, 0, &Mx, &Dx);
        HX_ASSERT(same(&Dx, &D0), "a drum track with Groove off plays exactly as with no groove");
        HX_ASSERT(same(&Mx, &M1), "…and the melodic track beside it grooves as before");
        printf("  ok   — %s: a track with Groove off plays straight, its neighbour does not notice\n", name[g]);
    }

    /* ---- it is saved, sparsely ---- */
    {
        hx_t *h = hx_create(NULL);
        static char blob[65536];
        hx_set_param(h, "bpm", "120");          /* something to save */
        int n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0, "state_full"); blob[n] = '\0';
        HX_ASSERT(!strstr(blob, "_gon"), "Groove on is the default and is not written");
        hx_set_param(h, "t2_groove_on", "0");
        n = hx_get_param(h, "state_full", blob, (int)sizeof(blob));
        HX_ASSERT(n > 0, "state_full"); blob[n] = '\0';
        HX_ASSERT(strstr(blob, "\"t2_gon\":0"), "Groove off is written");
        hx_destroy(h);

        char tmp[256];
        snprintf(tmp, sizeof(tmp), "/tmp/hx_groove_off_%d.json", (int)getpid());
        FILE *wf = fopen(tmp, "w");
        HX_ASSERT(wf && fwrite(blob, 1, (size_t)n, wf) == (size_t)n, "tmp write failed");
        fclose(wf);
        h = hx_create(NULL);
        seq8_instance_t *inst = (seq8_instance_t *)h->inst;
        strncpy(inst->state_path, tmp, sizeof(inst->state_path) - 1);
        seq8_load_state(inst);
        remove(tmp);
        char b[8];
        HX_ASSERT(hx_get_param(h, "t2_groove_on", b, sizeof(b)) > 0 && atoi(b) == 0, "Groove off survives a save and load");
        HX_ASSERT(hx_get_param(h, "t1_groove_on", b, sizeof(b)) > 0 && atoi(b) == 1, "…and the other tracks stay on");
        hx_destroy(h);
        printf("  ok   — the switch is saved only when off, and loads back\n");
    }

    printf("PASS: test_groove_track_off\n");
    return 0;
}
