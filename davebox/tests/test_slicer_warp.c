/* tests/test_slicer_warp.c — a Slicer's Sync WARP: the whole sample
 * pre-stretched to the project's tempo by the loader, the slices played from
 * that copy (seq8_audio.c, SLICER WARP). Pinned here:
 *   1. the copy is asked for at once and, until it lands, the slices keep the
 *      project's time varispeed (au_slc_speed's fallback);
 *   2. the copy: the sample's rate and channels, `speed` times shorter, the
 *      audio where the sample's frame f maps to f / speed and at its own
 *      pitch (a tone burst lands on time and keeps its frequency);
 *   3. a slice from it plays at speed 1 (its own pitch), starting at the
 *      slice's start / speed; `pos` and Lazy see FILE frames (au_vpos); Thru
 *      runs on to the range's End scaled;
 *   4. a tempo change is re-stretched only once the tempo has held for
 *      AU_SLC_WARP_SETTLE blocks; the old copy plays on meanwhile, then is
 *      retired, and freed once no voice reads it;
 *   5. Sync off / another sample / a track that stops being a Slicer let go
 *      of the copy; Warp is refused (Pitch) for a sample over a minute, and a
 *      long sample landing on Warp turns it to Pitch;
 *   6. an OFFLINE copy of the engine makes its copy before its first hit:
 *      the take hears Warp from the first slice. */
#include "harness.h"
#include <math.h>
#include <sys/stat.h>
#include <unistd.h>

#define AUS(t) (&inst->au_store[(t)][AU_SLC])
#define RATE 44100u
#define NFR  (2u * RATE)                /* 2 s */
#define BURST_EVERY 11025u              /* a 441 Hz burst every 0.25 s ... */
#define BURST_LEN   2205u               /* ... 50 ms long */

static char g_root[256];
static void put_le16(FILE *f, int v) { fputc(v & 255, f); fputc((v >> 8) & 255, f); }
static void put_le32(FILE *f, uint32_t v) { put_le16(f, (int)(v & 0xFFFF)); put_le16(f, (int)(v >> 16)); }

static void write_wav(const char *path, uint32_t n) {
    FILE *f = fopen(path, "wb");
    uint32_t i;
    fwrite("RIFF", 1, 4, f); put_le32(f, 36 + n * 2); fwrite("WAVEfmt ", 1, 8, f);
    put_le32(f, 16); put_le16(f, 1); put_le16(f, 1); put_le32(f, RATE); put_le32(f, RATE * 2);
    put_le16(f, 2); put_le16(f, 16);
    fwrite("data", 1, 4, f); put_le32(f, n * 2);
    for (i = 0; i < n; i++) {
        uint32_t k = i % BURST_EVERY;
        int v = k < BURST_LEN ? (int)lrint(12000.0 * sin(2.0 * M_PI * 441.0 * (double)k / RATE)) : 0;
        put_le16(f, v);
    }
    fclose(f);
}

static int wait_loaded(hx_t *h, int t) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 4000; i++) {
        hx_render(h, 1);
        if (au_cl(inst, t, AU_SLC)->state != 1) return au_cl(inst, t, AU_SLC)->state;
        usleep(1000);
    }
    return au_cl(inst, t, AU_SLC)->state;
}
/* render until the loader's copy is in (wpending clears), at most ~8 s */
static int wait_copy(hx_t *h, int t) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    int i;
    for (i = 0; i < 8000; i++) {
        hx_render(h, 1);
        if (!inst->au_trk[t].wpending) return inst->au_trk[t].wsmp != NULL;
        usleep(1000);
    }
    return 0;
}

static const au_voice_t *chop_voice(const au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}
static const au_voice_t *hit(hx_t *h, int k) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    au_note_event(4, k, 0x90, 100, 0);
    hx_render(h, 1);
    return chop_voice(&inst->au_trk[4]);
}
static void quiet(hx_t *h) {
    seq8_instance_t *inst = (seq8_instance_t *)h->inst;
    au_track_kill(inst, 4, NULL);
    hx_render(h, 2);
}

/* the first frame at or after `from` louder than a quarter of the burst */
static long onset(const au_sample_t *s, long from, long to) {
    long i;
    for (i = from < 0 ? 0 : from; i < to && i < (long)s->frames; i++)
        if (abs(s->pcm[(size_t)i * s->ch]) > 3000) return i;
    return -1;
}
/* the burst's pitch: the period (frames, 60..140) that best matches the
 * window to itself, as a frequency — a phase step inside the window (a
 * vocoder's) moves it far less than a crossing count */
static double freq_at(const au_sample_t *s, long at, long n) {
    int lag, best = 0;
    double bc = -1e300;
    for (lag = 60; lag <= 140; lag++) {
        double c = 0;
        long i;
        for (i = at; i < at + n && i + lag < (long)s->frames; i++)
            c += (double)s->pcm[(size_t)i * s->ch] * (double)s->pcm[(size_t)(i + lag) * s->ch];
        if (c > bc) { bc = c; best = lag; }
    }
    return best ? (double)RATE / (double)best : 0;
}

/* the copy against the sample at `speed`: length, bursts on time, pitch kept */
static void check_copy(const au_sample_t *w, double speed, const char *what) {
    uint32_t k, want = (uint32_t)((double)NFR / speed + 0.5);
    char m[200];
    snprintf(m, sizeof m, "%s: the copy is %u frames, not %u", what, w ? w->frames : 0, want);
    HX_ASSERT(w && w->frames == want && w->rate == RATE && w->ch == 1 && w->wowned, m);
    for (k = 1; k < NFR / BURST_EVERY; k++) {
        long exp = (long)((double)(k * BURST_EVERY) / speed + 0.5);
        long on = onset(w, exp - 1500, exp + 1500);
        double hz;
        snprintf(m, sizeof m, "%s: burst %u lands at %ld, not about %ld", what, k, on, exp);
        HX_ASSERT(on >= 0 && labs(on - exp) <= 300, m);
        hz = freq_at(w, exp + 200, 1000);
        snprintf(m, sizeof m, "%s: burst %u sounds at %.1f Hz, not 441", what, k, hz);
        HX_ASSERT(fabs(hz - 441.0) < 441.0 * 0.03, m);
    }
}

int main(void) {
    hx_t *h;
    seq8_instance_t *inst;
    au_track_t *at;
    char p[400], out[128];
    const au_voice_t *v;
    const au_sample_t *w1;
    unsigned pon, ppos;
    int i;

    snprintf(g_root, sizeof g_root, "/tmp/hx_slicer_warp_%d", (int)getpid());
    mkdir(g_root, 0775);
    snprintf(p, sizeof p, "%s/src", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/proj/dAVEBOx/samples", g_root); mkdir(p, 0775);
    snprintf(p, sizeof p, "%s/src/bursts.wav", g_root); write_wav(p, NFR);
    snprintf(p, sizeof p, "%s/src/long.wav", g_root); write_wav(p, 61u * RATE);

    h = hx_create(NULL); HX_NO_LEAD(h);
    inst = (seq8_instance_t *)h->inst;
    at = &inst->au_trk[4];
    snprintf(inst->state_path, sizeof inst->state_path, "%s/proj/dAVEBOx/seq8sa-state.json", g_root);
    hx_set_param(h, "bpm", "140");
    hx_set_param(h, "t4_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/bursts.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "the bursts did not load");
    hx_set_param(h, "t4_au_set_bpm", "16 1000");               /* the sample at 100: speed 1.4 */
    hx_render(h, 2);
    HX_ASSERT(!at->wsmp && !at->wpending, "a copy was made while Sync was Off");

    /* ==== 1. asked for at once; varispeed till it lands ==== */
    hx_set_param(h, "t4_au_set_sync", "16 3");
    HX_ASSERT(AUS(4)->sync == AU_SLC_SYNC_WARP, "Warp was not taken");
    au_note_event(4, 0, 0x90, 100, 0);                            /* before any block has ticked: no copy */
    v = chop_voice(at);
    HX_ASSERT(v && v->smp == AUS(4)->smp && fabs(v->step - 1.4) < 1e-6 && v->wk == 0,
              "before the copy, a slice did not play varispeed from the sample");
    hx_render(h, 1);
    HX_ASSERT(at->wpending || at->wsmp, "no copy was asked for on the first block");
    quiet(h);
    HX_ASSERT(wait_copy(h, 4), "the copy never landed");

    /* ==== 2. the copy ==== */
    HX_ASSERT(fabs(at->wspeed - 1.4) < 1e-9 && at->wsrc == AUS(4)->smp, "the copy's speed / source");
    check_copy(at->wsmp, 1.4, "140 over 100");

    /* ==== 3. a slice from it ==== */
    hx_set_param(h, "t4_au_mark_add", "16 22050");               /* slice 2 from 0.5 s */
    HX_ASSERT(AUS(4)->nslices == 2, "the split");
    v = hit(h, 1);
    HX_ASSERT(v && v->smp == at->wsmp && fabs(v->step - 1.0) < 1e-9 && fabs(v->wk - 1.4) < 1e-9,
              "a slice did not play from the copy at its own speed");
    HX_ASSERT((uint32_t)v->lo == 15750 && (uint32_t)v->hi == 63000, "the slice's frames in the copy");
    HX_ASSERT(hx_get_param(h, "t4_au_pos", out, (int)sizeof out) > 0 && sscanf(out, "%u %u", &pon, &ppos) == 2 &&
              pon == 1 && ppos >= 22050 && ppos <= 22050 + 2 * 128 * 1.4 + 2, "pos does not read the file's frame");
    quiet(h);
    hx_set_param(h, "t4_au_set_end", "16 77175");                /* the range's End: 1.75 s */
    hx_set_param(h, "t4_au_slice_play", "16 0 2");              /* slice 1 Thru */
    v = hit(h, 0);
    HX_ASSERT(v && v->smp == at->wsmp && (uint32_t)v->hi == 55125, "Thru did not run to the range's End scaled");
    quiet(h);
    hx_set_param(h, "t4_au_slice_play", "16 0 0");

    /* ==== 4. a tempo change: re-stretched once it holds ==== */
    w1 = at->wsmp;
    v = hit(h, 1);                                                /* a voice on the old copy */
    HX_ASSERT(v && v->smp == w1, "the voice before the change");
    hx_set_param(h, "bpm", "120");
    hx_render(h, AU_SLC_WARP_SETTLE - 10);
    HX_ASSERT(at->wsmp == w1 && !at->wpending, "re-stretched before the tempo had held");
    for (i = 0; i < 40 && !at->wpending && at->wsmp == w1; i++) hx_render(h, 1);
    HX_ASSERT(at->wpending || at->wsmp != w1, "not re-stretched once the tempo held");
    HX_ASSERT(wait_copy(h, 4) && at->wsmp != w1, "the new copy never landed");
    check_copy(at->wsmp, 1.2, "120 over 100");
    HX_ASSERT(at->wold == w1 || at->wold == NULL, "the old copy went somewhere else");
    {
        int before = __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED);
        quiet(h);
        hx_render(h, 2);
        HX_ASSERT(at->wold == NULL, "the old copy was kept after no voice read it");
        for (i = 0; i < 2000 && __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) == before; i++) { hx_render(h, 1); usleep(1000); }
        HX_ASSERT(__atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) > before, "the retired copy was never freed (a leak)");
    }
    /* a copy retired while the one before it still sounds: the older is cut and freed */
    {
        int before;
        au_sample_t *a1 = at->wsmp, *b1;
        int e = 0;
        v = hit(h, 1);                                            /* a voice on the current copy */
        HX_ASSERT(v && v->smp == a1, "the voice on the copy");
        au_slc_warp_retire(inst, 4);                              /* retired: kept while it sounds */
        HX_ASSERT(at->wold == a1 && !at->wsmp, "the sounding copy was not kept");
        b1 = au_wstretch_render(AUS(4)->smp, 1.2, &e);
        HX_ASSERT(b1, "a second copy");
        au_slc_warp_install(inst, 4, b1, 1.2, AUS(4));
        before = __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED);
        au_slc_warp_retire(inst, 4);                              /* again, the first still kept */
        HX_ASSERT(at->wold == b1 && !chop_voice(at), "the older copy's voice was not cut, or the newer not kept");
        for (i = 0; i < 2000 && __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) == before; i++) { hx_render(h, 1); usleep(1000); }
        HX_ASSERT(__atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) > before, "the older copy was never freed (a leak)");
        HX_ASSERT(wait_copy(h, 4) && at->wsmp, "no copy came back after the retires");
    }
    /* within 0.05 %: kept */
    hx_set_param(h, "bpm", "120.04");
    hx_render(h, AU_SLC_WARP_SETTLE + 20);
    HX_ASSERT(!at->wpending && fabs(at->wspeed - 1.2) < 1e-9, "a copy within the tolerance was redone");

    /* ==== 5. letting go ==== */
    hx_set_param(h, "t4_au_set_sync", "16 1");
    hx_render(h, 3);
    HX_ASSERT(!at->wsmp && !at->wold, "Sync Pitch kept the copy");
    v = hit(h, 0);
    HX_ASSERT(v && v->smp == AUS(4)->smp && v->wk == 0, "Pitch did not play the sample");
    quiet(h);
    hx_set_param(h, "t4_au_set_sync", "16 3");
    HX_ASSERT(wait_copy(h, 4), "the copy after Pitch -> Warp");
    hx_set_param(h, "bpm", "100");                               /* the tempos agree: the sample itself */
    hx_render(h, 3);
    HX_ASSERT(!at->wsmp, "a copy kept at speed 1");
    v = hit(h, 0);
    HX_ASSERT(v && v->smp == AUS(4)->smp && fabs(v->step - 1.0) < 1e-9, "speed 1 did not play the sample");
    quiet(h);
    hx_set_param(h, "bpm", "140");
    HX_ASSERT(wait_copy(h, 4), "the copy at 140 again");
    snprintf(p, sizeof p, "%d|%s/src/long.wav", AU_SLC, g_root);  /* another sample, over a minute */
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "the long sample did not load");
    hx_render(h, 2);
    HX_ASSERT(!at->wsmp && AUS(4)->sync == AU_SLC_SYNC_PITCH, "a long sample landing on Warp kept Warp / the copy");
    hx_set_param(h, "t4_au_set_sync", "16 3");
    HX_ASSERT(AUS(4)->sync == AU_SLC_SYNC_PITCH, "Warp was taken for a sample over a minute");
    snprintf(p, sizeof p, "%d|%s/src/bursts.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "the bursts again");
    hx_set_param(h, "t4_au_set_bpm", "16 1000");
    hx_set_param(h, "t4_au_set_sync", "16 3");
    HX_ASSERT(wait_copy(h, 4), "the copy for the bursts again");
    {
        int before = __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED);
        au_track_release(inst, 4);
        HX_ASSERT(!at->wsmp && !at->wold && !at->wpending, "a released track kept its copy");
        for (i = 0; i < 2000 && __atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) == before; i++) { hx_render(h, 1); usleep(1000); }
        HX_ASSERT(__atomic_load_n(&au_wowned_freed, __ATOMIC_RELAXED) > before, "a released track's copy was never freed (a leak)");
    }
    hx_destroy(h);

    /* ==== 6. an offline copy hears Warp from its first hit ==== */
    h = hx_create_raw("{\"offline\":1}");
    HX_ASSERT(h, "the offline copy");
    inst = (seq8_instance_t *)h->inst;
    at = &inst->au_trk[4];
    snprintf(inst->au_offline_dir, sizeof inst->au_offline_dir, "%s/proj/dAVEBOx/samples", g_root);
    hx_set_param(h, "bpm", "140");
    hx_set_param(h, "t4_convert_to_slicer", "");
    snprintf(p, sizeof p, "%d|%s/src/bursts.wav", AU_SLC, g_root);
    hx_set_param(h, "t4_au_pick", p);
    HX_ASSERT(wait_loaded(h, 4) == 2, "offline: the bursts did not load");
    hx_set_param(h, "t4_au_set_bpm", "16 1000");
    hx_set_param(h, "t4_au_set_sync", "16 3");
    au_track_kill(inst, 4, NULL);
    {
        /* the hit before any block has ticked: au_range_on makes the copy */
        au_sample_t *keep = at->wsmp;
        if (keep) { au_drop(inst, keep); at->wsmp = NULL; }
    }
    au_note_event(4, 0, 0x90, 100, 0);
    v = chop_voice(at);
    HX_ASSERT(v && at->wsmp && v->smp == at->wsmp && fabs(v->wk - 1.4) < 1e-9, "offline: the first hit did not play the copy");
    check_copy(at->wsmp, 1.4, "offline");
    hx_destroy(h);

    snprintf(p, sizeof p, "rm -rf '%s'", g_root);
    if (system(p)) {}
    printf("PASS: test_slicer_warp\n");
    return 0;
}
