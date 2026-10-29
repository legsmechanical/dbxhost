/* tests/test_audio_transient.c — Slice's Transient chops (sp_track_audio.c
 * set_trans / trans_bake, seq8_audio.c au_trans_calc).
 *
 * Transient is an override over the hand set, as Even is: Start, then every
 * hit kept at the clip's Sens inside Start..End (the first 128). It follows
 * Sens, Start and End as they move; pads, >Seq and the streamer's pins use
 * its chops; Back bakes them into the hand set or cancels, leaving the hand
 * set as it was; a hand edit bakes it first; it is never saved. */
#include "harness.h"
#include <sys/stat.h>
#include <unistd.h>

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

/* mono 16-bit 44.1 kHz, `n` frames of gen(i) */
static void write_gen(const char *path, uint32_t n, int (*gen)(uint32_t)) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, 44100); put_le32(f, 88200);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) put_le16(f, gen(i));
    fclose(f);
}
#define BEAT 22050u                                 /* a quarter note at 120 bpm */
/* a 10 ms decaying burst on every quarter note */
static int g_clicks(uint32_t i) {
    uint32_t ph = i % BEAT;
    return ph < 441 ? (int)((ph & 1 ? 1 : -1) * (20000 - (int)ph * 40)) : 0;
}
/* a steady +-3000 bed; a loud burst on each quarter, a soft one (5000) on each off-beat */
static int g_soft(uint32_t i) {
    uint32_t ph = i % BEAT, sign = i & 1;
    int a = 3000;
    if (ph < 441) a = 20000 - (int)ph * 40;
    else if (ph >= BEAT / 2 && ph < BEAT / 2 + 441) a = 5000;
    return sign ? a : -a;
}
/* a click every 8192 frames (186 ms), 160 of them: more hits than 128 */
#define DENSE 8192u
static int g_dense(uint32_t i) {
    uint32_t ph = i % DENSE;
    return ph < 441 ? (int)((ph & 1 ? 1 : -1) * (20000 - (int)ph * 40)) : 0;
}

static int info_field(hx_t *h, int t, int c, int idx) {
    char k[32], b[512], *q = b;
    int i;
    snprintf(k, sizeof k, "t%d_au_info_%d", t, c);
    if (hx_get_param(h, k, b, sizeof b) <= 0) return -1;
    for (i = 0; i < idx; i++) { q = strchr(q, ' '); if (!q) return -1; q++; }
    return atoi(q);
}

static int wait_loaded(hx_t *h, int t, int c) {
    int i, st = 1;
    for (i = 0; i < 2000; i++) {
        hx_render(h, 1);
        st = info_field(h, t, c, 0);
        if (st != 1) return st;
        usleep(1000);
    }
    return st;
}

static hx_t *rig(void) {
    hx_t *h = hx_create(NULL);
    seq8_instance_t *inst;
    char p[300];
    HX_ASSERT(h, "create failed");
    inst = (seq8_instance_t *)h->inst;
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root);
    mkdir(p, 0775);
    hx_set_param(h, "t4_convert_to_audio", "");
    return h;
}

/* pick `name` into clip 0 of track 4, Slice mode, its steps wiped */
static void pick(hx_t *h, const char *name) {
    char p[400];
    snprintf(p, sizeof p, "0|%s/src/%s", g_root, name);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4, 0) == 2, "the test sample did not load");
    hx_set_param(h, "t4_au_set_mode", "0 1");
    hx_set_param(h, "t4_au_wipe", "0");
}

/* how many "a b" pairs t4_au_marks_0 holds, and the first `max` of them */
static int marks(hx_t *h, unsigned *ab, int max) {
    char mk[4096], *q = mk;
    int n = 0;
    hx_get_param(h, "t4_au_marks_0", mk, sizeof mk);
    while (*q) {
        unsigned a, b;
        int used;
        if (sscanf(q, "%u %u%n", &a, &b, &used) != 2) break;
        if (n < max) { ab[2 * n] = a; ab[2 * n + 1] = b; }
        n++;
        q += used;
    }
    return n;
}

static int clip_notes(seq8_instance_t *inst, int t, int c) {
    clip_t *cl = &inst->tracks[t].clips[c];
    int i, n = 0;
    for (i = 0; i < cl->note_count; i++) if (cl->notes[i].active) n++;
    return n;
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    au_clip_t *ac;
    char p[300];
    static char blob[262144];
    unsigned ab[2 * 8];
    int k, n;

    snprintf(g_root, sizeof g_root, "/tmp/hx_trans_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/clicks.wav", g_root); write_gen(p, 4 * BEAT, g_clicks);
    snprintf(p, sizeof p, "%s/src/soft.wav", g_root);   write_gen(p, 4 * BEAT, g_soft);
    snprintf(p, sizeof p, "%s/src/dense.wav", g_root);  write_gen(p, 160 * DENSE, g_dense);
    snprintf(p, sizeof p, "%s/src/long.wav", g_root);   write_gen(p, 40 * BEAT, g_clicks);

    h = rig(); inst = (seq8_instance_t *)h->inst; ac = &inst->au_clip[4][0];

    /* ---- no sample: refused ---- */
    hx_set_param(h, "t4_au_set_trans", "0 1");
    HX_ASSERT(ac->trans == 0, "Transient came on for a clip with no sample");

    /* ---- clicks: Start and one chop per later click, each just before it ---- */
    pick(h, "clicks.wav");
    hx_set_param(h, "t4_au_manual", "0");
    hx_set_param(h, "t4_au_mark_add", "0 30000");         /* a hand set of two, to come back to */
    HX_ASSERT(ac->nslices == 2, "the hand set");
    hx_set_param(h, "t4_au_set_even", "0 8");
    hx_set_param(h, "t4_au_set_trans", "0 1");
    HX_ASSERT(ac->trans == 1 && ac->even == 0, "Transient did not take over from Even");
    n = marks(h, ab, 8);
    HX_ASSERT(n == 4, "4 clicks are not 4 chops");
    HX_ASSERT(ab[0] == 0, "chop 1 does not start at Start");
    for (k = 1; k < 4; k++)
        HX_ASSERT(ab[2 * k] <= k * BEAT && k * BEAT - ab[2 * k] < 256 && ab[2 * k - 1] == ab[2 * k],
                  "a chop does not start in the 256 frames before its click, or the one before does not end there");
    HX_ASSERT(ab[7] == 4 * BEAT, "the last chop does not end at End");
    HX_ASSERT(info_field(h, 4, 0, 16) == 4 && info_field(h, 4, 0, 21) == 4 && info_field(h, 4, 0, 23) == 1,
              "info: count, hits or trans disagrees");

    /* ---- a pad plays its chop ---- */
    {
        uint32_t a2 = ac->tr_at[2], b2 = ac->tr_at[3];
        int found = 0, i;
        au_note_event(4, 2, 0x90, 100, 0);
        hx_render(h, 1);
        for (i = 0; i < AU_VOICES; i++) {
            const au_voice_t *v = &inst->au_trk[4].v[i];
            if (v->active && (uint32_t)v->lo == a2 && (uint32_t)v->hi == b2) found = 1;
        }
        HX_ASSERT(found, "pad 3 did not play chop 3's frames");
        au_note_event(4, 2, 0x80, 0, 0);
        hx_render(h, 60);
    }

    /* ---- Start moves past click 1: worked out again, chop 1 at Start ---- */
    hx_set_param(h, "t4_au_set_start", "0 30000");
    HX_ASSERT(ac->tr_n == 3 && ac->tr_at[0] == 30000, "Transient did not follow Start");
    hx_set_param(h, "t4_au_set_start", "0 0");
    HX_ASSERT(ac->tr_n == 4, "Transient did not follow Start back");
    hx_set_param(h, "t4_au_set_end", "0 50000");
    HX_ASSERT(ac->tr_n == 3, "Transient did not follow End");
    hx_set_param(h, "t4_au_set_end", "0 0");

    /* ---- cancel: the hand set as it was, Even stays Off ---- */
    hx_set_param(h, "t4_au_set_trans", "0 0");
    HX_ASSERT(ac->trans == 0 && ac->even == 0 && ac->nslices == 2 && ac->sl[0].start == 0 && ac->sl[1].start == 30000,
              "cancelling Transient changed the hand set");

    /* ---- >Seq: a step per chop ---- */
    hx_set_param(h, "t4_au_set_trans", "0 1");
    hx_set_param(h, "t4_au_chop", "0");
    HX_ASSERT(clip_notes(inst, 4, 0) == 4, ">Seq did not lay one step per Transient chop");
    hx_set_param(h, "t4_au_wipe", "0");

    /* ---- never saved: the file holds the hand set ---- */
    inst->state_dirty = 1;
    HX_ASSERT(hx_get_param(h, "state_full", blob, (int)sizeof blob) > 0, "state_full");
    HX_ASSERT(strstr(blob, "\"t4c0_au2\":\"1 0 2 ") && strstr(blob, "\"t4c0s1_au2\":\"30000 ") && !strstr(blob, "\"t4c0s2_au2\""),
              "a save while Transient is on did not write the untouched hand set");

    /* ---- bake: Transient's chops become the hand set ---- */
    {
        uint32_t at[4];
        for (k = 0; k < 4; k++) at[k] = ac->tr_at[k];
        hx_set_param(h, "t4_au_trans_bake", "0");
        HX_ASSERT(ac->trans == 0 && ac->even == 0 && ac->nslices == 4, "trans_bake did not make 4 hand-set chops");
        for (k = 0; k < 4; k++) HX_ASSERT(ac->sl[k].start == at[k] && ac->sl[k].end == 0, "a baked chop moved, or its end is not home");
        n = marks(h, ab, 8);
        HX_ASSERT(n == 4 && ab[7] == 4 * BEAT, "the baked chops do not play as Transient's did");
    }

    /* ---- Even turns Transient off; a hand edit bakes it first ---- */
    hx_set_param(h, "t4_au_set_trans", "0 1");
    hx_set_param(h, "t4_au_set_even", "0 8");
    HX_ASSERT(ac->trans == 0 && ac->even == 8, "Even did not turn Transient off");
    hx_set_param(h, "t4_au_manual", "0");
    hx_set_param(h, "t4_au_set_trans", "0 1");
    hx_set_param(h, "t4_au_mark_add", "0 33000");
    HX_ASSERT(ac->trans == 0 && ac->nslices == 5 && ac->sl[2].start == 33000, "a marker added while Transient was on did not bake it first");

    /* ---- Sens: low keeps the loud hits, high the soft ones too ---- */
    pick(h, "soft.wav");
    hx_set_param(h, "t4_au_set_trans", "0 1");
    hx_set_param(h, "t4_au_set_sens", "0 0");
    HX_ASSERT(ac->tr_n == 4 && info_field(h, 4, 0, 21) == 4, "Sens 0: not 4 chops, or info's hits disagrees");
    hx_set_param(h, "t4_au_set_sens", "0 100");
    HX_ASSERT(ac->tr_n == 8 && info_field(h, 4, 0, 21) == 8 && marks(h, ab, 8) == 8, "Sens 100: not 8 chops");
    hx_set_param(h, "t4_au_set_trans", "0 0");

    /* ---- more hits than 128: the first 128 from Start ---- */
    pick(h, "dense.wav");
    hx_set_param(h, "t4_au_set_sens", "0 100");
    hx_set_param(h, "t4_au_set_trans", "0 1");
    HX_ASSERT(info_field(h, 4, 0, 21) > AU_MAX_SLICES, "the dense file has too few hits for the test");
    HX_ASSERT(ac->tr_n == AU_MAX_SLICES && ac->tr_at[0] == 0 && ac->tr_at[1] <= DENSE && ac->tr_at[127] <= 127 * DENSE, "the cap did not keep the first 128 from Start");
    hx_set_param(h, "t4_au_set_trans", "0 0");
    hx_destroy(h);

    /* ---- streamed: each Transient chop is pinned ---- */
    au_stream_sec = 1;
    h = rig(); inst = (seq8_instance_t *)h->inst; ac = &inst->au_clip[4][0];
    pick(h, "long.wav");
    HX_ASSERT(ac->smp && !ac->smp->pcm, "long.wav did not stream");
    hx_set_param(h, "t4_au_set_trans", "0 1");
    HX_ASSERT(ac->tr_n == 40, "a streamed file's Transient chops are not one per click");
    hx_render(h, 1);
    {
        const au_clipw_t *w = &inst->au_clipw[4][0];
        int ok = w->n == 40;
        for (k = 0; ok && k < 40; k++)
            if (w->sa[k] != ac->tr_at[k] || w->sb[k] != (k + 1 < 40 ? ac->tr_at[k + 1] : ac->smp->frames)) ok = 0;
        HX_ASSERT(ok, "the streamer was not told each Transient chop");
    }
    hx_destroy(h);

    printf("PASS: test_audio_transient\n");
    return 0;
}
