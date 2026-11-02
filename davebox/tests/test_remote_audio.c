/* tests/test_remote_audio.c — the remote editor and an Audio track.
 *
 *   - the snapshot's rui_clip carries the selected clip's Audio Mode and chop
 *     count (the Even count, else the hand set), "-1:0" on any other track, so
 *     the browser can draw a Slice clip as chops and a Loop clip as no roll;
 *   - a piano-roll add or move on an Audio clip keeps one slice per step, the
 *     one it lands (as a step tap does), single keys and the batch alike;
 *   - CONTROL: a melodic track keeps every note of a step. */
#include "harness.h"

static char g_buf[16384];

/* the rui_clip field's value, "len:tps:ls:dir:mode:n" */
static const char *rui_clip(hx_t *h) {
    static char v[64];
    v[0] = 0;
    if (hx_get_param(h, "state", g_buf, (int)sizeof g_buf) <= 0) return v;
    const char *p = strstr(g_buf, "\"rui_clip\":\"");
    if (!p) return v;
    p += 12;
    const char *q = strchr(p, '"');
    if (!q || q - p >= (int)sizeof v) return v;
    memcpy(v, p, (size_t)(q - p)); v[q - p] = 0;
    return v;
}
static const char *tail2(const char *v) {           /* the last two fields */
    const char *p = v + strlen(v); int k = 0;
    while (p > v) { if (*--p == ':' && ++k == 2) return p + 1; }
    return v;
}
static int notes_at(seq8_instance_t *inst, int t, int c, uint32_t tick, int *pitch) {
    clip_t *cl = &inst->tracks[t].clips[c];
    int n = 0;
    for (int i = 0; i < (int)cl->note_count; i++)
        if (cl->notes[i].active && cl->notes[i].tick == tick) { n++; if (pitch) *pitch = cl->notes[i].pitch; }
    return n;
}

int main(void) {
    hx_t *h = hx_create(NULL);
    HX_ASSERT(h, "hx_create");
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int pitch = -1;

    /* ---- the snapshot ---- */
    hx_set_param(h, "t4_c0_ruisel", "");
    HX_ASSERT(!strcmp(tail2(rui_clip(h)), "-1:0"), "CONTROL: a melodic track's rui_clip is not -1:0");
    hx_set_param(h, "t4_convert_to_audio", "");
    HX_ASSERT(inst->tracks[4].pad_mode == PAD_MODE_AUDIO, "t4 did not become Audio");
    au_clip_t *ac = &inst->au_clip[4][0];
    ac->mode = AU_MODE_SLICE; ac->even = 0; ac->nslices = 5;
    hx_set_param(h, "t4_c0_ruisel", "");
    HX_ASSERT(!strcmp(tail2(rui_clip(h)), "1:5"), "⭐ a Slice clip with 5 chops is not 1:5");
    ac->even = 8;
    hx_set_param(h, "t4_c0_ruisel", "");
    HX_ASSERT(!strcmp(tail2(rui_clip(h)), "1:8"), "⭐ an Even 8 clip does not report its 8 chops");
    ac->mode = AU_MODE_LOOP;
    hx_set_param(h, "t4_c0_ruisel", "");
    HX_ASSERT(!strncmp(tail2(rui_clip(h)), "0:", 2), "⭐ a Loop clip does not report Mode 0");
    { const char *v = rui_clip(h); int k = 0; for (const char *s = v; *s; s++) k += *s == ':';
      HX_ASSERT(k == 5, "rui_clip is not six fields"); }

    /* ---- one slice per step (24 ticks a step: tick 30 rounds to step 1) ---- */
    hx_set_param(h, "t4_c0_note_add", "0 3 100 24");
    hx_set_param(h, "t4_c0_note_add", "30 2 100 24");
    hx_set_param(h, "t4_c0_note_add", "0 5 100 24");
    HX_ASSERT(notes_at(inst, 4, 0, 0, &pitch) == 1 && pitch == 5, "⭐ an add left two slices on step 0");
    HX_ASSERT(notes_at(inst, 4, 0, 30, NULL) == 1, "an add on step 0 took step 1's slice");
    HX_ASSERT(inst->tracks[4].clips[0].step_note_count[0] == 1, "step 0's derived view holds two");

    hx_set_param(h, "t4_c0_note_add", "48 7 100 24");
    hx_set_param(h, "t4_c0_note_move", "48 7 26 7");            /* onto step 1, beside tick 30 */
    HX_ASSERT(notes_at(inst, 4, 0, 30, NULL) == 0 && notes_at(inst, 4, 0, 26, &pitch) == 1 && pitch == 7,
              "⭐ a move left two slices on step 1");

    hx_set_param(h, "t4_c0_notes_op", "a 72 1 100 24; a 72 9 100 24");
    HX_ASSERT(notes_at(inst, 4, 0, 72, &pitch) == 1 && pitch == 9, "⭐ the batch left two slices on step 3");
    /* a nudge of two neighbours a step later: each lands where the other was */
    hx_set_param(h, "t4_c0_notes_op", "a 120 1 100 24; a 144 2 100 24");
    hx_set_param(h, "t4_c0_notes_op", "m 120 1 144 1; m 144 2 168 2");
    HX_ASSERT(notes_at(inst, 4, 0, 144, &pitch) == 1 && pitch == 1 && notes_at(inst, 4, 0, 168, &pitch) == 1 && pitch == 2,
              "⭐ a batch nudge dropped a slice that was moving too");

    /* ---- CONTROL: a melodic track keeps a chord ---- */
    hx_set_param(h, "t2_c0_note_add", "0 60 100 24");
    hx_set_param(h, "t2_c0_note_add", "0 64 100 24");
    hx_set_param(h, "t2_c0_notes_op", "a 24 60 100 24; a 24 67 100 24");
    HX_ASSERT(notes_at(inst, 2, 0, 0, NULL) == 2 && notes_at(inst, 2, 0, 24, NULL) == 2,
              "CONTROL: a melodic step lost a chord note");

    hx_destroy(h);
    printf("PASS: remote editor and Audio tracks (rui_clip mode/chops, one slice per step)\n");
    return 0;
}
