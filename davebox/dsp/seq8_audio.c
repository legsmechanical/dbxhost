/* seq8_audio.c — AUDIO TRACKS: the engine (types in seq8_audio.h).
 *
 * THREADS. Everything here but the loader runs on the SPI thread (set_param,
 * get_param and render_block are serialized there). The loader thread is the
 * ONLY one that reads or copies files, allocates sample memory or frees it:
 *   - requests go to it through au_req[] (one producer: the SPI thread),
 *   - loaded samples come back through au_res[] (one producer: the loader),
 *   - a sample is swapped into its clip by the SPI thread, which in the same
 *     breath stops every voice reading the old one and hands the old one back
 *     (AU_REQ_DROP) — so once dropped, nothing on the SPI thread can reach it,
 *     and the loader frees it when no clip holds it.
 * The loader keeps a pool keyed by absolute path, so a sample used by several
 * clips is in memory once.
 *
 * A file longer than Slice mode allows STREAMS (only a Loop clip can play
 * it): see STREAMING below — a third thread, the streamer, fills its chunks.
 *
 * Included into seq8.c's single translation unit after seq8_drum.c. The keys
 * and everything that needs the clip primitives live in
 * setparam/sp_track_audio.c. */

#include <pthread.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>
#if defined(__linux__)
#include <sys/prctl.h>
#endif

#define AU_POOL_MAX 256

static void clip_compact_notes(clip_t *cl);   /* seq8.c, further down the TU */

typedef struct {
    char         path[256];
    au_sample_t *smp;
} au_pool_ent_t;

/* Set by au_shutdown: a copy or a read in progress gives up at its next
 * chunk. destroy_instance runs on the SPI thread and joins the loader, so the
 * join must not wait out a whole multi-hundred-MB copy or decode. */
static volatile int au_abort = 0;
/* What the loader is reading now, for "Loading 42%" (review: a long file read
 * with no sign of progress): the clip (t*16+c, -1 none) and frames read of
 * how many. One loader thread writes; get_param reads (a torn pair only
 * misreports one percentage). */
static volatile int      au_ld_key = -1;
static volatile uint32_t au_ld_done, au_ld_total;

typedef struct {
    pthread_t      th;
    volatile int   run;
    int            started;
    seq8_instance_t *inst;
    au_pool_ent_t  pool[AU_POOL_MAX];
} au_loader_t;

/* A worker created from the audio thread inherits its realtime class: step
 * down to the ordinary one — only then. Elsewhere (a Mac running the tests)
 * SCHED_OTHER priority 0 is the very LOWEST, and a loaded machine starved
 * the loader past a test's wait (the suite's intermittent failure) and the
 * stretcher's ring. On the Move nothing changes: it does inherit FIFO. */
static void au_thread_unrealtime(void) {
    struct sched_param sp;
    int pol = SCHED_OTHER;
    memset(&sp, 0, sizeof sp);
    if (pthread_getschedparam(pthread_self(), &pol, &sp) == 0 && pol != SCHED_OTHER) {
        memset(&sp, 0, sizeof sp);
        pthread_setschedparam(pthread_self(), SCHED_OTHER, &sp);
    }
}

/* ---------------- rings (SPSC, power-of-two size) ---------------- */

static int au_req_push(seq8_instance_t *inst, const au_req_t *r) {
    uint32_t h = inst->au_req_head, t = __atomic_load_n(&inst->au_req_tail, __ATOMIC_ACQUIRE);
    if (h - t >= AU_RING) { inst->au_req_dropped++; return 0; }
    inst->au_req[h & (AU_RING - 1)] = *r;
    __atomic_store_n(&inst->au_req_head, h + 1, __ATOMIC_RELEASE);
    return 1;
}

static void au_warp_forget(seq8_instance_t *inst, const au_sample_t *smp);   /* STRETCHING */

static int au_drop_push(seq8_instance_t *inst, au_sample_t *smp) {
    au_req_t r;
    memset(&r, 0, sizeof r);
    r.kind = AU_REQ_DROP;
    r.smp = smp;
    return au_req_push(inst, &r);
}

/* A release that found the ring full waits here and is sent again once the
 * loader has made room (au_drop_retry, every block) — or the loader never
 * counts the clip off and the sample is never freed (found by review: a
 * project switch drops up to 128 at once while the loader may be deep in a
 * long read). */
static void au_drop_retry(seq8_instance_t *inst) {
    while (inst->au_drop_npend && au_drop_push(inst, (au_sample_t *)inst->au_drop_pend[inst->au_drop_npend - 1]))
        inst->au_drop_npend--;
}

static void au_drop(seq8_instance_t *inst, au_sample_t *smp) {
    if (!smp) return;
    au_warp_forget(inst, smp);          /* the stretcher reads it too */
    au_drop_retry(inst);                /* the older ones first */
    if (inst->au_drop_npend || !au_drop_push(inst, smp)) {
        if (inst->au_drop_npend < (uint8_t)(sizeof inst->au_drop_pend / sizeof inst->au_drop_pend[0]))
            inst->au_drop_pend[inst->au_drop_npend++] = smp;
        /* else: 16 waiting already — the ring has been full for a long while */
    }
}

/* ---------------- file reading (loader thread) ---------------- */

static uint32_t au_le32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
static uint16_t au_le16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static uint32_t au_be32(const uint8_t *p) { return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3]; }
static uint16_t au_be16(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }

/* IEEE 754 80-bit extended (AIFF's sample rate), as a whole number of Hz.
 * No libm here: the C tests link without it on glibc. */
static uint32_t au_ext80_hz(const uint8_t *p) {
    int expo = ((p[0] & 0x7F) << 8) | p[1];
    uint64_t mant = 0;
    int i, shift;
    for (i = 0; i < 8; i++) mant = (mant << 8) | p[2 + i];
    if ((p[0] & 0x80) || !mant) return 0;
    shift = 16383 + 63 - expo;
    if (shift < 1 || shift > 63) return 0;
    return (uint32_t)((mant + (1ull << (shift - 1))) >> shift);
}

/* 2^(n/12) and 10^(db/20) for whole numbers, without libm. */
static double au_semi(int n) {
    double r = 1.0, b = n >= 0 ? 1.0594630943592953 : 0.9438743126816935;
    if (n < 0) n = -n;
    while (n--) r *= b;
    return r;
}
/* 2^(cents/1200) for |cents| <= 100, without libm: e^x to x^5 (x <= 0.07,
 * an error below 1e-9). */
static double au_cents(int cents) {
    double x = (double)cents * 0.00057762265046662105, r = 1.0, term = 1.0;   /* ln 2 / 1200 */
    int k;
    for (k = 1; k <= 5; k++) { term *= x / k; r += term; }
    return r;
}
/* A clip's (or slice's) playback ratio from semitones and cents. */
static double au_tune(int semis, int cents) { return au_semi(semis) * au_cents(cents); }

/* THE CONDUCTOR on an Audio track (Josh, 2026-10-30: "conductor needs to work
 * on audio tracks" · asked whether it repitches the clips or moves which chop
 * plays: "repitch"). A responding Audio track plays its audio that many
 * semitones up or down — its notes are chops, so they are never transposed.
 * Scale-aware, the key's root moved by the Conductor's degrees, in semitones;
 * else its semitones; each with the track's octave on top. 0 when it does not
 * respond, or the Conductor is silent. */
static int au_cond_now(seq8_instance_t *inst, int t) {
    if (inst->conductor_track < 0 || !inst->conductor_sounding || t == inst->conductor_track) return 0;
    seq8_track_t *cnd = &inst->tracks[inst->conductor_track];
    const clip_t *cc = &cnd->clips[cnd->active_clip];
    if (!cc->cond_resp[t]) return 0;
    int oct = cc->cond_oct[t], v;
    if (inst->scale_aware) {
        int R = eff_pad_key(inst) + 60, n = (int)SCALE_SIZES[eff_pad_scale(inst)];
        v = scale_transpose(inst, R, inst->conductor_off_deg + oct * n) - R;
    } else {
        v = inst->conductor_off_semi + oct * 12;
    }
    return clamp_i(v, -48, 48);
}
/* "Now": what sounds moves at once; "Next" (the default) waits for the next
 * chop, or for a Loop clip the next time round. */
static int au_cond_at_once(const seq8_instance_t *inst, int t) {
    if (inst->conductor_track < 0) return 0;
    const seq8_track_t *cnd = &inst->tracks[inst->conductor_track];
    return cnd->clips[cnd->active_clip].cond_when[t] == 1;
}

/* x into [0, L). It runs on the audio thread, so it must end for ANY x: a
 * far-out x is reduced in one step (a subtraction loop at x ~ 1e19 never
 * moves, the step being below the double's precision there — an
 * underflowed tick count hung the render: found by review, 2026-10-29). */
static double au_wrap(double x, double L) {
    if (!(L > 0) || !(x > -1e12 && x < 1e12)) return 0.0;      /* NaN, huge, or no length */
    if (x >= L || x < 0) x -= L * (double)(long long)(x / L);
    while (x >= L) x -= L;
    while (x < 0) x += L;
    return x;
}

static float au_db(int db) {
    double r = 1.0, b = db >= 0 ? 1.1220184543019633 : 0.8912509381337456;
    if (db < 0) db = -db;
    while (db--) r *= b;
    return (float)r;
}

/* Sample encodings the converter knows. */
#define AU_ENC_PCM  0     /* signed integer (8-bit WAV is unsigned: flagged) */
#define AU_ENC_FLT  1

typedef struct {
    uint32_t rate, frames;
    uint16_t ch, bits;
    uint8_t  enc, big, u8;
    long     data_off;
    uint32_t data_len;
} au_fmt_t;

static int au_probe(FILE *f, au_fmt_t *fm) {
    uint8_t h[12], ck[8], b[40];
    memset(fm, 0, sizeof *fm);
    if (fread(h, 1, 12, f) != 12) return AU_ERR_FORMAT;
    if (!memcmp(h, "RIFF", 4) && !memcmp(h + 8, "WAVE", 4)) {
        int have_fmt = 0;
        while (fread(ck, 1, 8, f) == 8) {
            uint32_t sz = au_le32(ck + 4);
            long next = ftell(f) + (long)sz + (sz & 1);
            if (!memcmp(ck, "fmt ", 4)) {
                uint32_t n = sz < sizeof b ? sz : (uint32_t)sizeof b;
                if (fread(b, 1, n, f) != n || n < 16) return AU_ERR_FORMAT;
                uint16_t tag = au_le16(b);
                fm->ch = au_le16(b + 2);
                fm->rate = au_le32(b + 4);
                fm->bits = au_le16(b + 14);
                if (tag == 0xFFFE && n >= 26) tag = au_le16(b + 24);   /* extensible: the subformat */
                if (tag == 1) fm->enc = AU_ENC_PCM;
                else if (tag == 3) fm->enc = AU_ENC_FLT;
                else return AU_ERR_FORMAT;
                fm->u8 = (fm->enc == AU_ENC_PCM && fm->bits == 8);
                have_fmt = 1;
            } else if (!memcmp(ck, "data", 4)) {
                if (!have_fmt) return AU_ERR_FORMAT;
                fm->data_off = ftell(f);
                fm->data_len = sz;
                break;
            }
            if (fseek(f, next, SEEK_SET)) return AU_ERR_FORMAT;
        }
        if (!fm->data_off) return AU_ERR_FORMAT;
    } else if (!memcmp(h, "FORM", 4) && (!memcmp(h + 8, "AIFF", 4) || !memcmp(h + 8, "AIFC", 4))) {
        int aifc = !memcmp(h + 8, "AIFC", 4), have_comm = 0;
        fm->big = 1;
        while (fread(ck, 1, 8, f) == 8) {
            uint32_t sz = au_be32(ck + 4);
            long next = ftell(f) + (long)sz + (sz & 1);
            if (!memcmp(ck, "COMM", 4)) {
                uint32_t n = sz < sizeof b ? sz : (uint32_t)sizeof b;
                if (fread(b, 1, n, f) != n || n < 18) return AU_ERR_FORMAT;
                fm->ch = au_be16(b);
                fm->frames = au_be32(b + 2);
                fm->bits = au_be16(b + 6);
                fm->rate = au_ext80_hz(b + 8);
                fm->enc = AU_ENC_PCM;
                if (aifc && n >= 22) {
                    if (!memcmp(b + 18, "sowt", 4)) fm->big = 0;
                    else if (!memcmp(b + 18, "fl32", 4) || !memcmp(b + 18, "FL32", 4)) fm->enc = AU_ENC_FLT;
                    else if (memcmp(b + 18, "NONE", 4) && memcmp(b + 18, "twos", 4)) return AU_ERR_FORMAT;
                }
                have_comm = 1;
            } else if (!memcmp(ck, "SSND", 4)) {
                uint8_t ob[8];
                if (!have_comm || fread(ob, 1, 8, f) != 8) return AU_ERR_FORMAT;
                fm->data_off = ftell(f) + (long)au_be32(ob);
                fm->data_len = sz - 8 - au_be32(ob);
                break;
            }
            if (fseek(f, next, SEEK_SET)) return AU_ERR_FORMAT;
        }
        if (!fm->data_off) return AU_ERR_FORMAT;
    } else {
        return AU_ERR_FORMAT;
    }
    if (fm->ch < 1 || fm->rate < 8000 || fm->rate > 192000) return AU_ERR_FORMAT;
    if (fm->enc == AU_ENC_FLT ? (fm->bits != 32 && fm->bits != 64)
                              : (fm->bits != 8 && fm->bits != 16 && fm->bits != 24 && fm->bits != 32))
        return AU_ERR_FORMAT;
    {
        uint32_t fb = (uint32_t)fm->ch * (fm->bits / 8);
        uint32_t fr = fm->data_len / fb;
        if (!fm->frames || fm->frames > fr) fm->frames = fr;   /* WAV: from the data size */
    }
    return fm->frames ? AU_ERR_NONE : AU_ERR_FORMAT;
}

static int16_t au_conv(const uint8_t *p, const au_fmt_t *fm) {
    int32_t v = 0;
    switch (fm->bits) {
    case 8:  v = fm->u8 ? ((int32_t)p[0] - 128) << 8 : (int32_t)(int8_t)p[0] << 8; break;
    case 16: v = (int16_t)(fm->big ? au_be16(p) : au_le16(p)); break;
    case 24: {
        int32_t x = fm->big ? ((p[0] << 16) | (p[1] << 8) | p[2]) : ((p[2] << 16) | (p[1] << 8) | p[0]);
        if (x & 0x800000) x -= 0x1000000;
        v = x >> 8;
        break;
    }
    case 32:
        if (fm->enc == AU_ENC_FLT) {
            uint32_t u = fm->big ? au_be32(p) : au_le32(p);
            float f;
            memcpy(&f, &u, 4);
            v = (int32_t)(f * 32767.0f + (f >= 0 ? 0.5f : -0.5f));
        } else {
            v = (int32_t)(fm->big ? au_be32(p) : au_le32(p)) >> 16;
        }
        break;
    case 64: {
        uint64_t u = 0;
        double d;
        int i;
        for (i = 0; i < 8; i++) u |= (uint64_t)p[fm->big ? i : 7 - i] << (8 * (7 - i));
        memcpy(&d, &u, 8);
        v = (int32_t)(d * 32767.0 + (d >= 0 ? 0.5 : -0.5));
        break;
    }
    }
    if (v > 32767) v = 32767;
    if (v < -32768) v = -32768;
    return (int16_t)v;
}

/* Frame i of s, or NULL when s streams and that chunk is not in. SPI thread
 * only (render and get_param): a chunk it sees stays until two more blocks
 * have rendered, so the pointer is good for the rest of this call. */
static inline const int16_t *au_at(const au_sample_t *s, uint32_t i) {
    const int16_t *c;
    uint32_t k;
    if (s->pcm) return s->pcm + (size_t)i * s->ch;
    k = i >> AU_CHUNK_SHIFT;
    if (k >= s->nchunks) return NULL;
    c = __atomic_load_n(&s->chunk[k], __ATOMIC_ACQUIRE);
    return c ? c + (size_t)(i & (AU_CHUNK - 1)) * s->ch : NULL;
}

/* One frame as the waveform sees it: the channels mixed (0 for a streamed
 * frame that is not in). */
static int au_mono_fr(const int16_t *fr, int ch) {
    return ch > 1 ? (fr[0] + fr[1]) / 2 : fr[0];
}
static int au_mono(const au_sample_t *s, uint32_t i) {
    const int16_t *fr = au_at(s, i);
    return fr ? au_mono_fr(fr, s->ch) : 0;
}

/* The waveform's summaries: min / max per AU_MIP frames (so a zoomed view
 * reads a few thousand entries, never the whole sample), and the 128 columns
 * of the whole sample. Loader thread. */
static void au_peaks_from_mip(au_sample_t *s);
static void au_make_peaks(au_sample_t *s) {
    uint32_t m, i;
    s->nmip = (s->frames + AU_MIP - 1) / AU_MIP;
    s->mip = s->nmip ? (int8_t (*)[2])malloc((size_t)s->nmip * 2) : NULL;
    if (s->mip) {
        for (m = 0; m < s->nmip; m++) {
            uint32_t a = m * AU_MIP, b = a + AU_MIP < s->frames ? a + AU_MIP : s->frames;
            int lo = 0, hi = 0;
            for (i = a; i < b; i++) {
                int v = au_mono(s, i);
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            s->mip[m][0] = (int8_t)(lo / 256);
            s->mip[m][1] = (int8_t)(hi / 256);
        }
    } else s->nmip = 0;
    au_peaks_from_mip(s);
}

/* The 128 columns of the whole sample: from the summary, else (no memory
 * for one) sampled from the frames. */
static void au_peaks_from_mip(au_sample_t *s) {
    uint32_t m, i;
    int c;
    for (c = 0; c < AU_PEAKS; c++) {
        uint32_t a = (uint32_t)((uint64_t)s->frames * c / AU_PEAKS);
        uint32_t b = (uint32_t)((uint64_t)s->frames * (c + 1) / AU_PEAKS);
        int lo = 0, hi = 0;
        if (s->mip) {
            for (m = a / AU_MIP; m * AU_MIP < b && m < s->nmip; m++) {
                if (s->mip[m][0] < lo) lo = s->mip[m][0];
                if (s->mip[m][1] > hi) hi = s->mip[m][1];
            }
            s->peaks[c][0] = (int8_t)lo;
            s->peaks[c][1] = (int8_t)hi;
        } else {
            uint32_t st = (b - a) > 2048 ? (b - a) / 2048 : 1;
            for (i = a; i < b; i += st) {
                int v = au_mono(s, i);
                if (v < lo) lo = v;
                if (v > hi) hi = v;
            }
            s->peaks[c][0] = (int8_t)(lo / 256);
            s->peaks[c][1] = (int8_t)(hi / 256);
        }
    }
}

/* ---------------- hits (Transient chops) ----------------
 * Transient chops a Slice clip at its hits (Josh, 2026-10-29: "no - only
 * transients. but there should be a way to adjust transient detection
 * sensitivity"; it began as Loop's Tempo Beats, which left Loop once he could
 * not see where it cut: "i need to be able to see the points its creating on
 * the wave"). The
 * loader finds every CANDIDATE once, from the waveform summary: a block whose
 * level (au_lvl: ~log, so a quiet hit counts as a loud one does) rises over
 * the one before, most in the blocks around it, kept with how much it rose
 * (hit_d) and how much against the ~100 ms around it (hit_r). Sens then picks
 * which count at play time (au_hit_kept), so turning it needs no new pass. A
 * hit is placed at its block's START: up to 5.8 ms before the attack, in the
 * quiet, the right place for a cut; and a streamed file, whose frames are not
 * all in at load, finds exactly the hits a whole one does. No libm. */
#define AU_HIT_W      17                 /* blocks each side of the local mean (~100 ms) */
#define AU_HIT_IOI    9                  /* blocks: the least gap between two kept hits (52 ms) */
#define AU_HIT_MAX    32768

/* ~8 x log2(a + 1) for a level 0..127: 0..56 */
static int au_lvl(int a) {
    unsigned v = (unsigned)(a < 0 ? 0 : a) + 1u;
    int b = 0;
    while ((v >> b) > 1u) b++;
    return 8 * b + (int)(((v << 3) >> b) & 7u);
}
static int au_mip_amp(const au_sample_t *s, uint32_t m) {
    int lo = -s->mip[m][0], hi = s->mip[m][1];
    return hi > lo ? hi : lo;
}

static void au_find_hits(au_sample_t *s) {
    uint32_t n = s->nmip, m, k, cnt = 0, w = 2 * AU_HIT_W + 1;
    uint8_t *d;
    uint32_t *sum;
    if (!s->mip || n < 3) return;
    d = (uint8_t *)calloc(n, 1);
    sum = (uint32_t *)malloc(((size_t)n + 1) * sizeof *sum);
    if (!d || !sum) { free(d); free(sum); return; }
    for (m = 1; m < n; m++) {
        int r = au_lvl(au_mip_amp(s, m)) - au_lvl(au_mip_amp(s, m - 1));
        d[m] = (uint8_t)(r > 0 ? r : 0);
    }
    sum[0] = 0;
    for (m = 0; m < n; m++) sum[m + 1] = sum[m] + d[m];
    for (int pass = 0; pass < 2; pass++) {
        k = 0;
        for (m = 1; m < n && k < AU_HIT_MAX; m++) {
            uint32_t j, a0, a1, tot;
            int peak = d[m] >= 2 && au_mip_amp(s, m) >= 2;
            /* the biggest rise of the blocks around it (the first of a tie) */
            for (j = m > 2 ? m - 2 : 0; peak && j <= m + 2 && j < n; j++)
                if ((j < m && d[j] >= d[m]) || (j > m && d[j] > d[m])) peak = 0;
            if (!peak) continue;
            if (pass) {
                a0 = m > AU_HIT_W ? m - AU_HIT_W : 0;
                a1 = m + AU_HIT_W + 1 < n ? m + AU_HIT_W + 1 : n;
                tot = sum[a1] - sum[a0];
                if (tot < w / 2) tot = w / 2;                /* a mean under 0.5 is silence */
                uint32_t r = (uint32_t)d[m] * 16u * w / tot;
                s->hits[k] = m * AU_MIP;
                s->hit_d[k] = d[m];
                s->hit_r[k] = (uint8_t)(r > 255 ? 255 : r);
            }
            k++;
        }
        if (!pass) {
            cnt = k;
            if (!cnt) break;
            s->hits = (uint32_t *)malloc((size_t)cnt * sizeof *s->hits);
            s->hit_d = (uint8_t *)malloc(cnt);
            s->hit_r = (uint8_t *)malloc(cnt);
            if (!s->hits || !s->hit_d || !s->hit_r) {
                free(s->hits); free(s->hit_d); free(s->hit_r);
                s->hits = NULL; s->hit_d = s->hit_r = NULL;
                cnt = 0;
                break;
            }
        }
    }
    s->nhits = cnt;
    free(d);
    free(sum);
}

/* What Sens 0..100 asks of a candidate: its rise against the ~100 ms around
 * it (x16: 0 = four times, 50 = twice, 100 = any) and its own rise. */
static void au_sens_min(int sens, int *rmin, int *dmin) {
    static const uint8_t r[5] = { 64, 45, 32, 23, 16 };
    int i, f;
    if (sens < 0) sens = 0;
    if (sens > 100) sens = 100;
    i = sens / 25; f = sens % 25;
    *rmin = i < 4 ? r[i] + (r[i + 1] - r[i]) * f / 25 : r[4];
    *dmin = 2 + (100 - sens) * 6 / 100;
}
static int au_hit_ok(const au_sample_t *s, uint32_t k, int rmin, int dmin) {
    return s->hit_r[k] >= rmin && s->hit_d[k] >= dmin;
}
/* Candidate k counts: it passes, and no passing one lies in the AU_HIT_IOI
 * blocks before it (a roll is one hit, its first). Audio-thread safe: at most
 * a few candidates are looked back at (they are >= 3 blocks apart). */
static int au_hit_kept(const au_sample_t *s, uint32_t k, int rmin, int dmin) {
    uint32_t j;
    if (!au_hit_ok(s, k, rmin, dmin)) return 0;
    for (j = k; j-- > 0 && s->hits[k] - s->hits[j] < AU_HIT_IOI * AU_MIP; )
        if (au_hit_ok(s, j, rmin, dmin)) return 0;
    return 1;
}
/* The first candidate at or after frame f. */
static uint32_t au_hit_from(const au_sample_t *s, uint32_t f) {
    uint32_t lo = 0, hi = s->nhits;
    while (lo < hi) { uint32_t mid = (lo + hi) / 2; if (s->hits[mid] < f) lo = mid + 1; else hi = mid; }
    return lo;
}
/* Transient's chops in a..b at `sens`: Start, and every kept hit after it. */
static uint32_t au_hit_count(const au_sample_t *s, uint32_t a, uint32_t b, int sens) {
    int rmin, dmin;
    uint32_t k, n = 1;
    if (!s || b <= a) return 0;
    au_sens_min(sens, &rmin, &dmin);
    for (k = au_hit_from(s, a + 1); k < s->nhits && s->hits[k] < b; k++) if (au_hit_kept(s, k, rmin, dmin)) n++;
    return n;
}

/* A file longer than this streams (seconds), in either mode: a slice's
 * start and end are pinned as a jump point is. Josh, 2026-10-28:
 * "threshold should be 60 seconds b/c memory is only 2gb on stock move and
 * ram is already used by other modules and move instruments". The tests
 * lower it. */
static uint32_t au_stream_sec = 60;

/* The streamer's state for one streamed sample (STREAMING, below). */
typedef struct au_stream {
    char      path[512];
    au_fmt_t  fm;
    int       fd;          /* streamer: open once it first reads; -1 = not yet */
    uint32_t *keep;        /* streamer: per chunk, the pass that last wanted it */
} au_stream_t;

/* A Loop over rs..re must never wait for these chunks: around each of the
 * 33 points k/32 of the range — every jump point of every division (2..32)
 * is one of them, and Revrs mirrors point k onto point 32-k — the 2 chunks
 * after (forward play) and the 2 before (reverse). The start's "after" and
 * the end's "before" reach half a second further, for Nudge -500 ms.
 * Calls fn(arg, k) for each chunk k (a chunk may come more than once). */
static void au_pins(uint32_t nchunks, uint32_t frames, uint32_t rate, uint32_t rs, uint32_t re,
                    void (*fn)(void *, uint32_t), void *arg) {
    uint32_t j, k, ext = (rate / 2 + AU_CHUNK - 1) / AU_CHUNK;
    if (re > frames) re = frames;
    if (re <= rs || !nchunks) return;
    for (j = 0; j <= 32; j++) {
        uint32_t p = rs + (uint32_t)((uint64_t)(re - rs) * j / 32);
        uint32_t c = p >> AU_CHUNK_SHIFT;
        uint32_t after = 2 + (j == 0 ? ext : 0), before = 2 + (j == 32 ? ext : 0);
        for (k = 0; k < after && c + k < nchunks; k++) fn(arg, c + k);
        for (k = 1; k <= before && k <= c; k++) fn(arg, c - k);
    }
}
static void au_pin_flag(void *arg, uint32_t k) { ((uint8_t *)arg)[k] = 1; }

/* One chunk of a streamed file converted to int16, from raw frames. */
static void au_conv_frames(const uint8_t *buf, uint32_t n, const au_fmt_t *fm, int ch, int16_t *o) {
    const uint32_t fb = (uint32_t)fm->ch * (fm->bits / 8), bs = fm->bits / 8;
    uint32_t i;
    for (i = 0; i < n; i++) {
        const uint8_t *fr = buf + (size_t)i * fb;
        o[(size_t)i * ch] = au_conv(fr, fm);
        if (ch == 2) o[(size_t)i * ch + 1] = au_conv(fr + bs, fm);
    }
}

static void au_sample_free(au_sample_t *s) {
    uint32_t k;
    if (!s) return;
    if (s->chunk) for (k = 0; k < s->nchunks; k++) free(s->chunk[k]);
    free(s->chunk);
    if (s->st) {
        if (s->st->fd >= 0) close(s->st->fd);
        free(s->st->keep);
        free(s->st);
    }
    free(s->mip);
    free(s->hits);
    free(s->hit_d);
    free(s->hit_r);
    free(s->pcm);
    free(s);
}

/* Read a WAV / AIFF as int16 (1 or 2 channels; more are folded to the first
 * two). The sample can be no longer than AU_LOOP_MAX_SEC. One pass: with
 * `may_stream` (the tests read a file both ways), a file longer than
 * au_stream_sec keeps only its waveform summary and the chunks a Loop over
 * the whole file pins (the streamer does the rest); otherwise it is read
 * whole. */
/* THE WAVEFORM SUMMARY OF A STREAMED FILE, kept (review, 2026-10-31: every
 * project load read a long file whole — ~475 MB for 30 minutes — only to
 * rebuild its summary). `<project>/dAVEBOx/.peaks/<name>.mip`, beside
 * samples/ (never in it: the chooser and Purge list samples/). Its header
 * names the file it summarises — size, mtime, frames, rate, channels — so an
 * Overwrite (or any change) makes it stale and it is rebuilt. The transient
 * candidates come from the summary, so they need no keeping. Loader thread. */
static int au_mkdirs(const char *dir);   /* below */
#define AU_MIP_MAGIC 0x3150494Du   /* "MIP1" */
typedef struct {
    uint32_t magic, frames, rate, nmip;
    uint64_t size;
    int64_t  mtime;
    uint16_t ch, pad[3];
} au_mip_hdr_t;

static int au_mip_path(const char *path, char *out, size_t sz, char *dir, size_t dsz) {
    const char *base = strrchr(path, '/');
    int dl;
    if (!base) return 0;
    dl = (int)(base - path);
    /* samples/<name> -> .peaks/<name>.mip, one level up */
    if (dl < 8 || strncmp(base - 7, "samples", 7)) return 0;
    snprintf(dir, dsz, "%.*s.peaks", dl - 7, path);
    snprintf(out, sz, "%s/%s.mip", dir, base + 1);
    return 1;
}

static void au_mip_hdr_for(au_mip_hdr_t *h, const struct stat *st, const au_sample_t *s) {
    memset(h, 0, sizeof *h);
    h->magic = AU_MIP_MAGIC;
    h->frames = s->frames; h->rate = s->rate; h->nmip = s->nmip; h->ch = s->ch;
    h->size = (uint64_t)st->st_size; h->mtime = (int64_t)st->st_mtime;
}

/* The summary for `path` into s->mip (s->frames/nmip set from it), or 0. */
static int au_mip_load(const char *path, au_sample_t *s, const au_fmt_t *fm) {
    char mp[600], md[600];
    struct stat st;
    au_mip_hdr_t h;
    FILE *f;
    int ok = 0;
    if (!au_mip_path(path, mp, sizeof mp, md, sizeof md) || stat(path, &st)) return 0;
    f = fopen(mp, "rb");
    if (!f) return 0;
    if (fread(&h, sizeof h, 1, f) == 1 && h.magic == AU_MIP_MAGIC && h.size == (uint64_t)st.st_size &&
        h.mtime == (int64_t)st.st_mtime && h.rate == fm->rate && h.frames && h.frames <= fm->frames &&
        h.ch == s->ch && h.nmip == (h.frames + AU_MIP - 1) / AU_MIP && h.nmip <= s->nmip &&
        fread(s->mip, 2, h.nmip, f) == h.nmip) {
        s->frames = h.frames;
        s->nmip = h.nmip;
        s->nchunks = (h.frames + AU_CHUNK - 1) / AU_CHUNK;
        ok = 1;
    }
    fclose(f);
    return ok;
}

static void au_mip_save(const char *path, const au_sample_t *s) {
    char mp[600], md[600], tmp[640];
    struct stat st;
    au_mip_hdr_t h;
    FILE *f;
    if (!au_mip_path(path, mp, sizeof mp, md, sizeof md) || stat(path, &st) || au_mkdirs(md)) return;
    au_mip_hdr_for(&h, &st, s);
    snprintf(tmp, sizeof tmp, "%s.tmp", mp);
    f = fopen(tmp, "wb");
    if (!f) return;
    if (fwrite(&h, sizeof h, 1, f) == 1 && fwrite(s->mip, 2, s->nmip, f) == s->nmip && !fflush(f)) {
        fclose(f);
        if (rename(tmp, mp)) unlink(tmp);
        else if (stat(md, &st) == 0 && chown(mp, st.st_uid, st.st_gid)) { /* best effort */ }
    } else {
        fclose(f);
        unlink(tmp);
    }
}

/* A streamed file whose summary was kept: only the pinned chunks are read. */
static int au_read_pinned(FILE *f, const au_fmt_t *fm, au_sample_t *s, const uint8_t *pins, uint8_t *buf) {
    const uint32_t fb = (uint32_t)fm->ch * (fm->bits / 8);
    uint32_t k;
    for (k = 0; k < s->nchunks; k++) {
        uint32_t a = k * AU_CHUNK, want = s->frames - a < AU_CHUNK ? s->frames - a : AU_CHUNK;
        int16_t *c;
        if (!pins[k]) continue;
        if (au_abort || fseek(f, fm->data_off + (long)a * (long)fb, SEEK_SET)) return 0;
        c = (int16_t *)calloc((size_t)AU_CHUNK * s->ch, sizeof(int16_t));
        if (!c) return 0;
        if (fread(buf, fb, want, f) != want) { free(c); return 0; }
        au_conv_frames(buf, want, fm, s->ch, c);
        s->chunk[k] = c;
    }
    return 1;
}

static au_sample_t *au_read_file(const char *path, int may_stream, int *err) {
    FILE *f = fopen(path, "rb");
    au_fmt_t fm;
    au_sample_t *s = NULL;
    uint8_t *buf = NULL;
    int16_t *tmp = NULL;
    uint8_t *pins = NULL;
    int streamed;
    *err = AU_ERR_OPEN;
    if (!f) return NULL;
    *err = au_probe(f, &fm);
    if (*err) goto out;
    if ((uint64_t)fm.frames > (uint64_t)fm.rate * AU_LOOP_MAX_SEC) { *err = AU_ERR_LONG; goto out; }
    streamed = may_stream && (uint64_t)fm.frames > (uint64_t)fm.rate * au_stream_sec;
    s = (au_sample_t *)calloc(1, sizeof *s);
    if (!s) { *err = AU_ERR_MEM; goto out; }
    s->ch = (uint8_t)(fm.ch >= 2 ? 2 : 1);
    s->rate = fm.rate;
    s->frames = fm.frames;
    *err = AU_ERR_MEM;
    if (!streamed) {
        s->pcm = (int16_t *)malloc((size_t)fm.frames * s->ch * sizeof(int16_t));
        if (!s->pcm) goto fail;
    } else {
        s->nchunks = (fm.frames + AU_CHUNK - 1) / AU_CHUNK;
        s->nmip = (fm.frames + AU_MIP - 1) / AU_MIP;
        s->chunk = (int16_t **)calloc(s->nchunks, sizeof *s->chunk);
        s->mip = (int8_t (*)[2])malloc((size_t)s->nmip * 2);
        s->st = (au_stream_t *)calloc(1, sizeof *s->st);
        pins = (uint8_t *)calloc(s->nchunks, 1);
        tmp = (int16_t *)malloc((size_t)AU_CHUNK * s->ch * sizeof(int16_t));
        if (!s->chunk || !s->mip || !s->st || !pins || !tmp) goto fail;
        s->st->fd = -1;
        s->st->fm = fm;
        snprintf(s->st->path, sizeof s->st->path, "%s", path);
        s->st->keep = (uint32_t *)calloc(s->nchunks, sizeof *s->st->keep);
        if (!s->st->keep) goto fail;
        au_pins(s->nchunks, fm.frames, fm.rate, 0, fm.frames, au_pin_flag, pins);
    }
    if (streamed && au_mip_load(path, s, &fm)) {
        /* its summary was kept: read only what stays in memory */
        buf = (uint8_t *)malloc((size_t)AU_CHUNK * fm.ch * (fm.bits / 8));
        if (!buf || !au_read_pinned(f, &fm, s, pins, buf)) goto fail;
        au_peaks_from_mip(s);
        au_find_hits(s);
        *err = AU_ERR_NONE;
        goto out;
    }
    {
        /* Whole: straight into pcm. Streamed: a chunk at a time into tmp,
         * summarised, and kept when pinned. */
        const uint32_t fb = (uint32_t)fm.ch * (fm.bits / 8);
        const uint32_t step = AU_CHUNK;
        uint32_t done = 0;
        buf = (uint8_t *)malloc((size_t)step * fb);
        if (!buf || fseek(f, fm.data_off, SEEK_SET)) goto fail;
        au_ld_total = fm.frames;
        while (done < fm.frames) {
            if (au_abort) { *err = AU_ERR_OPEN; goto fail; }
            au_ld_done = done;
            uint32_t want = fm.frames - done < step ? fm.frames - done : step;
            size_t got = fread(buf, fb, want, f);
            if (got == 0) break;
            if (!streamed) {
                au_conv_frames(buf, (uint32_t)got, &fm, s->ch, s->pcm + (size_t)done * s->ch);
            } else {
                uint32_t k = done >> AU_CHUNK_SHIFT, m, i;
                memset(tmp, 0, (size_t)AU_CHUNK * s->ch * sizeof(int16_t));
                au_conv_frames(buf, (uint32_t)got, &fm, s->ch, tmp);
                for (m = 0; m * AU_MIP < got; m++) {
                    int lo = 0, hi = 0;
                    for (i = m * AU_MIP; i < (m + 1) * AU_MIP && i < got; i++) {
                        int v = au_mono_fr(tmp + (size_t)i * s->ch, s->ch);
                        if (v < lo) lo = v;
                        if (v > hi) hi = v;
                    }
                    s->mip[(done / AU_MIP) + m][0] = (int8_t)(lo / 256);
                    s->mip[(done / AU_MIP) + m][1] = (int8_t)(hi / 256);
                }
                if (pins[k]) {
                    s->chunk[k] = tmp;
                    tmp = (int16_t *)malloc((size_t)AU_CHUNK * s->ch * sizeof(int16_t));
                    if (!tmp) goto fail;
                }
            }
            done += (uint32_t)got;
            if (got < want) break;
        }
        if (done == 0) { *err = AU_ERR_FORMAT; goto fail; }
        s->frames = done;                      /* a short file plays what it has */
        if (streamed) {
            s->nchunks = (done + AU_CHUNK - 1) / AU_CHUNK;
            s->nmip = (done + AU_MIP - 1) / AU_MIP;
        }
    }
    if (streamed) { au_peaks_from_mip(s); au_mip_save(path, s); }
    else au_make_peaks(s);
    au_find_hits(s);
    *err = AU_ERR_NONE;
    goto out;
fail:
    au_sample_free(s);
    s = NULL;
out:
    free(buf);
    free(tmp);
    free(pins);
    fclose(f);
    return s;
}

/* mkdir -p, giving each directory it makes the owner of the first one that
 * existed (the Move's files belong to its user, not to whoever runs this). */
static int au_mkdirs(const char *dir) {
    char tmp[256];
    struct stat st;
    size_t i, n = strlen(dir);
    uid_t uid = (uid_t)-1;
    gid_t gid = (gid_t)-1;
    if (n == 0 || n >= sizeof tmp) return -1;
    memcpy(tmp, dir, n + 1);
    for (i = 1; i <= n; i++) {
        if (tmp[i] != '/' && tmp[i] != '\0') continue;
        char c = tmp[i];
        tmp[i] = '\0';
        if (stat(tmp, &st) == 0) { uid = st.st_uid; gid = st.st_gid; }
        else {
            if (mkdir(tmp, 0775) != 0 && errno != EEXIST) return -1;
            if (uid != (uid_t)-1 && chown(tmp, uid, gid)) { /* best effort */ }
        }
        tmp[i] = c;
    }
    return 0;
}

static long au_file_size(const char *p) {
    struct stat st;
    return stat(p, &st) == 0 ? (long)st.st_size : -1;
}

static int au_copy_file(const char *src, const char *dst) {
    char tmp[300];
    int in = -1, out = -1, ok = 0;
    char buf[65536];
    struct stat st;
    snprintf(tmp, sizeof tmp, "%s.tmp", dst);
    in = open(src, O_RDONLY);
    if (in < 0) return 0;
    out = open(tmp, O_WRONLY | O_CREAT | O_TRUNC, 0664);
    if (out >= 0) {
        ssize_t r;
        ok = 1;
        while ((r = read(in, buf, sizeof buf)) > 0) {
            if (au_abort || write(out, buf, (size_t)r) != r) { ok = 0; break; }
        }
        if (r < 0) ok = 0;
        if (ok && fsync(out)) ok = 0;
        close(out);
        if (ok && rename(tmp, dst)) ok = 0;
        if (!ok) unlink(tmp);
    }
    close(in);
    /* owned like the folder it lands in */
    if (ok) {
        char d[256];
        snprintf(d, sizeof d, "%s", dst);
        char *sl = strrchr(d, '/');
        if (sl) { *sl = '\0'; if (stat(d, &st) == 0 && chown(dst, st.st_uid, st.st_gid)) { /* best effort */ } }
    }
    return ok;
}

/* Whether two files of the same size hold the same bytes (loader thread). */
static int au_same_bytes(const char *a, const char *b) {
    int fa = open(a, O_RDONLY), fb = open(b, O_RDONLY), same = fa >= 0 && fb >= 0;
    static char ba[16384], bb[16384];
    while (same) {
        ssize_t ra = read(fa, ba, sizeof ba), rb = read(fb, bb, sizeof bb);
        if (ra != rb || ra < 0) same = 0;
        else if (ra == 0) break;
        else if (memcmp(ba, bb, (size_t)ra)) same = 0;
        if (au_abort) same = 0;
    }
    if (fa >= 0) close(fa);
    if (fb >= 0) close(fb);
    return same;
}

/* Copy `src` into `dir` (the project's samples/) unless it is already there.
 * The same name, size AND bytes there IS this file (reused); otherwise the
 * name gets "~2", "~3"... (the same name and size alone was taken as the same
 * audio: two fixed-length bounces of one name played the first — review).
 * Writes the name it ends up with. */
static int au_import(const char *src, const char *dir, char *name, size_t name_sz) {
    const char *base = strrchr(src, '/');
    char dst[300], stem[AU_PATH_MAX], ext[16] = "";
    long sz = au_file_size(src);
    size_t dl = strlen(dir);
    int k;
    base = base ? base + 1 : src;
    if (sz < 0) return AU_ERR_OPEN;
    if (!strncmp(src, dir, dl) && src[dl] == '/' && !strchr(src + dl + 1, '/')) {
        snprintf(name, name_sz, "%s", base);           /* already the project's */
        return AU_ERR_NONE;
    }
    if (au_mkdirs(dir)) return AU_ERR_COPY;
    snprintf(stem, sizeof stem, "%s", base);
    {
        char *dot = strrchr(stem, '.');
        if (dot && strlen(dot) < sizeof ext) { snprintf(ext, sizeof ext, "%s", dot); *dot = '\0'; }
    }
    for (k = 1; k < 1000; k++) {
        if (k == 1) snprintf(name, name_sz, "%s", base);
        else snprintf(name, name_sz, "%s~%d%s", stem, k, ext);
        snprintf(dst, sizeof dst, "%s/%s", dir, name);
        long have = au_file_size(dst);
        if (have == sz && au_same_bytes(src, dst)) return AU_ERR_NONE;   /* already copied */
        if (have < 0) return au_copy_file(src, dst) ? AU_ERR_NONE : AU_ERR_COPY;
    }
    return AU_ERR_COPY;
}

/* ---------------- STREAMING (the streamer thread) ----------------
 *
 * Any file over au_stream_sec streams, in Loop or Slice mode. A streamed
 * sample's frames live in chunks (AU_CHUNK frames each). The
 * streamer is the only thread that fills a chunk slot or empties one; the
 * audio thread only reads them (au_at). Each pass the streamer:
 *   1. wants the chunks each sounding streamed voice reaches in the next
 *      AU_STREAM_AHEAD_MS (in its direction, across the loop's wrap), and
 *      the same from where a waiting JmpQ jump will land (au_watch, written
 *      by the audio thread every block) — nearest first;
 *   2. wants every clip's pins — a Loop clip's points (au_pins), a Slice
 *      clip's slice starts and ends — so a jump, a wrap or a slice never
 *      waits;
 *   3. reads up to AU_STREAM_READS missing chunks, in that order;
 *   4. empties a chunk nobody has wanted for AU_STREAM_GRACE passes. Its
 *      memory is freed only once the audio thread has finished two more
 *      blocks (au_block): a render that loaded the pointer before the slot
 *      was emptied has ended by then. The audio thread never frees, never
 *      locks, never waits.
 * A chunk not in when a voice reaches it plays silence and the voice keeps
 * moving (it stays in time), fading out before the gap and back in after.
 * Samples come and go through au_stream_add / au_stream_remove (the loader,
 * under the mutex the streamer holds for a whole pass): the streamer never
 * touches a sample it does not hold, whatever a stale clip or watch points at. */

#define AU_STREAM_AHEAD_MS  1500
#define AU_STREAM_READS     8
#define AU_STREAM_GRACE     250
#define AU_STREAM_NEED      1024

typedef struct { void *p; uint32_t at, wp; } au_grave_t;   /* wp: the stretcher's pass (au_warp_mark) */
typedef struct { uint16_t si; uint32_t k; } au_need_t;

typedef struct {
    pthread_t        th;
    volatile int     run;
    int              started;
    pthread_mutex_t  mu;
    seq8_instance_t *inst;
    au_sample_t     *smp[AU_POOL_MAX];   /* the streamed samples it holds */
    uint32_t         pass;
    au_grave_t      *grave;
    uint32_t         ngrave, cgrave;
    uint8_t         *raw;                /* one chunk of file frames */
    size_t           raw_sz;
    au_need_t        need[AU_STREAM_NEED];
    uint32_t         nneed;
    int              pin_si;             /* the sample au_stream_pin is marking */
    uint32_t         reads, loaded;      /* chunks read ever / in memory now */
} au_streamer_t;

#ifdef SEQ8_TESTING
static int au_stream_manual = 0;         /* tests: no thread; they call au_stream_service */
#endif

static uint32_t au_warp_mark(seq8_instance_t *inst);          /* STRETCHING, below */
static int au_warp_passed(seq8_instance_t *inst, uint32_t mark);

static int au_stream_add(seq8_instance_t *inst, au_sample_t *s) {
    au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
    uint32_t k;
    int i, ok = 0;
    if (!S) return 0;
    pthread_mutex_lock(&S->mu);
    for (i = 0; i < AU_POOL_MAX; i++)
        if (!S->smp[i]) { __atomic_store_n(&S->smp[i], s, __ATOMIC_RELAXED); ok = 1; break; }
    if (ok) for (k = 0; k < s->nchunks; k++) if (s->chunk[k]) __atomic_add_fetch(&S->loaded, 1, __ATOMIC_RELAXED);
    pthread_mutex_unlock(&S->mu);
    return ok;
}

/* The loader, before it frees s: by then no clip or voice holds it (the
 * audio thread dropped it), so its chunks can go at once. */
static void au_stream_remove(seq8_instance_t *inst, au_sample_t *s) {
    au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
    uint32_t k;
    int i;
    if (!S) return;
    pthread_mutex_lock(&S->mu);
    for (i = 0; i < AU_POOL_MAX; i++) if (S->smp[i] == s) __atomic_store_n(&S->smp[i], (au_sample_t *)NULL, __ATOMIC_RELAXED);
    for (k = 0; k < s->nchunks; k++) if (s->chunk[k]) __atomic_sub_fetch(&S->loaded, 1, __ATOMIC_RELAXED);
    pthread_mutex_unlock(&S->mu);
}

static int au_stream_find(au_streamer_t *S, const void *p) {
    int i;
    if (!p) return -1;
    for (i = 0; i < AU_POOL_MAX; i++) if (S->smp[i] && (const void *)S->smp[i] == p) return i;
    return -1;
}

/* Chunk k of sample si is wanted this pass; missing, it joins the reads. */
static void au_stream_want(au_streamer_t *S, int si, uint32_t k) {
    au_sample_t *s = S->smp[si];
    if (k >= s->nchunks || s->st->keep[k] == S->pass) return;
    s->st->keep[k] = S->pass;
    if (!s->chunk[k] && S->nneed < AU_STREAM_NEED) {
        S->need[S->nneed].si = (uint16_t)si;
        S->need[S->nneed].k = k;
        S->nneed++;
    }
}

static void au_stream_pin(void *arg, uint32_t k) {
    au_streamer_t *S = (au_streamer_t *)arg;
    au_stream_want(S, S->pin_si, k);
}

/* A slice a..b: the 2 chunks from its start and the 2 that end at its end. */
static void au_stream_pin_slice(au_streamer_t *S, int si, uint32_t a, uint32_t b, int full) {
    uint32_t ca, cb;
    if (b <= a) return;
    ca = a >> AU_CHUNK_SHIFT;
    cb = (b - 1) >> AU_CHUNK_SHIFT;
    au_stream_want(S, si, ca);
    au_stream_want(S, si, cb);
    if (!full) return;                     /* past AU_PIN_FULL chops: one chunk each end */
    au_stream_want(S, si, ca + 1);
    if (cb) au_stream_want(S, si, cb - 1);
}

/* What a voice (or a waiting jump) at w reaches next: its chunk and the
 * neighbour it interpolates from, then AU_STREAM_AHEAD_MS further on. */
static void au_stream_watch(au_streamer_t *S, int si, const au_watch_t *w) {
    au_sample_t *s = S->smp[si];
    uint32_t lo = w->lo, hi = w->hi, n, j;
    int64_t f = w->pos, sp = w->speed < 0 ? -(int64_t)w->speed : w->speed;
    int dir = w->speed < 0 ? -1 : 1;
    if (hi > s->frames) hi = s->frames;
    if (hi <= lo || f < lo || f >= hi) return;
    au_stream_want(S, si, (uint32_t)f >> AU_CHUNK_SHIFT);
    if (f + 1 < hi) au_stream_want(S, si, (uint32_t)(f + 1) >> AU_CHUNK_SHIFT);
    n = (uint32_t)((uint64_t)AU_STREAM_AHEAD_MS * 441 / 10 * (uint64_t)(sp ? sp : 256) / 256 / AU_CHUNK) + 2;
    for (j = 0; j < n; j++) {
        f += dir * (int64_t)AU_CHUNK;
        if (f >= hi || f < lo) {
            if (!w->loop) return;
            f = dir > 0 ? lo + (f - hi) : hi - (lo - f);
            if (f < lo || f >= hi) f = dir > 0 ? lo : hi - 1;
            /* the other end of the loop is where it goes on from */
            au_stream_want(S, si, (uint32_t)(dir > 0 ? hi - 1 : lo) >> AU_CHUNK_SHIFT);
        }
        au_stream_want(S, si, (uint32_t)f >> AU_CHUNK_SHIFT);
    }
}

/* Read chunk k of s from its file (the streamer, outside nothing: the mutex
 * is held, so s cannot go meanwhile). */
static int au_stream_read(au_streamer_t *S, au_sample_t *s, uint32_t k) {
    au_stream_t *st = s->st;
    const uint32_t fb = (uint32_t)st->fm.ch * (st->fm.bits / 8);
    uint32_t first = k * AU_CHUNK, n = s->frames - first < AU_CHUNK ? s->frames - first : AU_CHUNK;
    size_t want = (size_t)n * fb;
    ssize_t got;
    int16_t *c;
    if (st->fd < 0) st->fd = open(st->path, O_RDONLY);
    if (st->fd < 0) return 0;
    if (S->raw_sz < (size_t)AU_CHUNK * fb) {
        free(S->raw);
        S->raw_sz = (size_t)AU_CHUNK * fb;
        S->raw = (uint8_t *)malloc(S->raw_sz);
        if (!S->raw) { S->raw_sz = 0; return 0; }
    }
    c = (int16_t *)calloc((size_t)AU_CHUNK * s->ch, sizeof(int16_t));
    if (!c) return 0;
    got = pread(st->fd, S->raw, want, (off_t)st->fm.data_off + (off_t)first * fb);
    if (got > 0) au_conv_frames(S->raw, (uint32_t)((size_t)got / fb), &st->fm, s->ch, c);
    __atomic_store_n(&s->chunk[k], c, __ATOMIC_RELEASE);
    __atomic_add_fetch(&S->reads, 1, __ATOMIC_RELAXED);
    __atomic_add_fetch(&S->loaded, 1, __ATOMIC_RELAXED);
    return 1;
}

static void au_stream_bury(au_streamer_t *S, void *p) {
    if (S->ngrave == S->cgrave) {
        uint32_t nc = S->cgrave ? S->cgrave * 2 : 64;
        au_grave_t *g = (au_grave_t *)realloc(S->grave, nc * sizeof *g);
        if (!g) return;                     /* leak one chunk rather than free it early */
        S->grave = g;
        S->cgrave = nc;
    }
    S->grave[S->ngrave].p = p;
    S->grave[S->ngrave].at = __atomic_load_n(&S->inst->au_block, __ATOMIC_ACQUIRE) + 2;
    S->grave[S->ngrave].wp = au_warp_mark(S->inst);   /* and the stretcher's pass under way */
    S->ngrave++;
}

/* One pass. Returns the chunks it read. */
static unsigned au_stream_service(seq8_instance_t *inst) {
    au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
    uint32_t i, k, now;
    unsigned got = 0;
    int t, c, si;
    if (!S) return 0;
    pthread_mutex_lock(&S->mu);
    S->pass++;
    S->nneed = 0;
    /* 1. where the voices and the waiting jumps are going */
    for (t = 0; t < NUM_TRACKS; t++)
        for (i = 0; i <= AU_VOICES; i++) {
            au_watch_t w;
            w.smp = __atomic_load_n(&inst->au_watch[t][i].smp, __ATOMIC_ACQUIRE);
            if ((si = au_stream_find(S, w.smp)) < 0) continue;
            w.pos   = __atomic_load_n(&inst->au_watch[t][i].pos, __ATOMIC_RELAXED);
            w.lo    = __atomic_load_n(&inst->au_watch[t][i].lo, __ATOMIC_RELAXED);
            w.hi    = __atomic_load_n(&inst->au_watch[t][i].hi, __ATOMIC_RELAXED);
            w.speed = __atomic_load_n(&inst->au_watch[t][i].speed, __ATOMIC_RELAXED);
            w.loop  = __atomic_load_n(&inst->au_watch[t][i].loop, __ATOMIC_RELAXED);
            au_stream_watch(S, si, &w);
        }
    /* 2. every clip's pins */
    for (t = 0; t < NUM_TRACKS; t++)
        for (c = 0; c < NUM_CLIPS; c++) {
            const au_clipw_t *cw = &inst->au_clipw[t][c];
            const void *p = __atomic_load_n(&cw->smp, __ATOMIC_ACQUIRE);
            uint32_t rs, re;
            au_sample_t *s;
            if ((si = au_stream_find(S, p)) < 0) continue;
            s = S->smp[si];
            rs = __atomic_load_n(&cw->rs, __ATOMIC_RELAXED);
            re = __atomic_load_n(&cw->re, __ATOMIC_RELAXED);
            S->pin_si = si;
            if (__atomic_load_n(&cw->mode, __ATOMIC_RELAXED) != AU_MODE_SLICE) {
                au_pins(s->nchunks, s->frames, s->rate, rs, re, au_stream_pin, S);
            } else {
                /* Slice: each slice starts where it is pinned, as a jump does —
                 * its start (forwards) and its end (Rev) — and Start too (Lazy
                 * chop plays from there) */
                int l, n = __atomic_load_n(&cw->n, __ATOMIC_RELAXED);
                au_stream_pin_slice(S, si, rs, re, 1);
                for (l = 0; l < n && l < AU_MAX_SLICES; l++)
                    au_stream_pin_slice(S, si, __atomic_load_n(&cw->sa[l], __ATOMIC_RELAXED),
                                        __atomic_load_n(&cw->sb[l], __ATOMIC_RELAXED), l < AU_PIN_FULL);
            }
        }
    /* 3. read, nearest need first */
    for (i = 0; i < S->nneed && got < AU_STREAM_READS; i++) {
        au_sample_t *s = S->smp[S->need[i].si];
        if (s && !s->chunk[S->need[i].k] && au_stream_read(S, s, S->need[i].k)) got++;
    }
    /* 4. let go of what nobody wants */
    for (si = 0; si < AU_POOL_MAX; si++) {
        au_sample_t *s = S->smp[si];
        if (!s) continue;
        for (k = 0; k < s->nchunks; k++) {
            if (!s->chunk[k] || S->pass - s->st->keep[k] <= AU_STREAM_GRACE) continue;
            void *p = s->chunk[k];
            __atomic_store_n(&s->chunk[k], (int16_t *)NULL, __ATOMIC_RELEASE);
            au_stream_bury(S, p);
            __atomic_sub_fetch(&S->loaded, 1, __ATOMIC_RELAXED);
        }
    }
    now = __atomic_load_n(&inst->au_block, __ATOMIC_ACQUIRE);
    for (i = 0; i < S->ngrave; ) {
        if ((int32_t)(now - S->grave[i].at) >= 0 && au_warp_passed(inst, S->grave[i].wp)) {
            free(S->grave[i].p);
            S->grave[i] = S->grave[--S->ngrave];
        }
        else i++;
    }
    pthread_mutex_unlock(&S->mu);
    return got;
}

static void *au_streamer_main(void *arg) {
    au_streamer_t *S = (au_streamer_t *)arg;
    au_thread_unrealtime();             /* off the realtime class, as the loader */
    while (S->run)
        if (!au_stream_service(S->inst)) usleep(2000);
    return NULL;
}

static void au_streamer_init(seq8_instance_t *inst) {
    au_streamer_t *S = (au_streamer_t *)calloc(1, sizeof *S);
    inst->au_streamer = S;
    if (!S) return;
    S->inst = inst;
    pthread_mutex_init(&S->mu, NULL);
    S->run = 1;
#ifdef SEQ8_TESTING
    if (au_stream_manual) return;
#endif
    if (pthread_create(&S->th, NULL, au_streamer_main, S) == 0) S->started = 1;
}

/* After the loader has stopped (it is the one that adds and removes). The
 * samples themselves, chunks and all, are the pool's to free. */
static void au_streamer_shutdown(seq8_instance_t *inst) {
    au_streamer_t *S = (au_streamer_t *)inst->au_streamer;
    uint32_t i;
    if (!S) return;
    S->run = 0;
    if (S->started) pthread_join(S->th, NULL);
    for (i = 0; i < S->ngrave; i++) free(S->grave[i].p);
    free(S->grave);
    free(S->raw);
    pthread_mutex_destroy(&S->mu);
    free(S);
    inst->au_streamer = NULL;
}

#include "seq8_stretch.h"

/* ---------------- STRETCHING (WARP: the stretcher thread) ----------------
 *
 * Tempo Warp plays a Loop clip at its own pitch, stretched so Start..End
 * fills its own Bars at the tempo (Bungee, behind seq8_stretch.h). Bungee is
 * far too heavy for the audio thread's budget in bursts (a grain is ~0.3 ms
 * on a CM5, more on a CM4), so a fourth thread, the stretcher, renders ahead
 * into a ring per track and the audio thread only reads it (Josh, 2026-10-28:
 * "render ahead on background").
 *
 * What Bungee reads is a VIRTUAL input: the clip's passes one after another,
 * L ticks each, the sample on each from its Nudge for P ticks (its own Bars)
 * and silence where it does not reach — at `rpt` input frames a tick, so the
 * stretcher's position is a clip tick (unwrapped) x rpt. The loop's wrap is
 * then just more input: no reset, no seam of ours. Revrs reads the sample
 * backwards on each pass, Bungee still going forwards.
 *
 * Every frame in the ring carries its clip TICK (from the input positions
 * Bungee reports for each output chunk) and the ANCHOR it was rendered for.
 * The audio thread knows which tick each of its frames should sound (the
 * clock), so it:
 *   - plays frames whose tag matches, measuring the drift between the two,
 *     which the stretcher trims away by nudging its speed (AU_WARP_TRIM_*);
 *   - re-anchors when it cannot follow (a launch, a transport start part-way
 *     in, a jump in the clock, a drift past AU_WARP_SNAP): a new anchor
 *     number and a tick AU_WARP_LEAD ahead. While the transport runs it keeps
 *     playing the old anchor's frames (the ring holds ~46 ms of them) until
 *     the new one's first frame is due, then crossfades, as Pitch hands a
 *     launch from voice to voice; stopping, it fades them out.
 * At the loop's own tempo with no Pitch or Detune, Bungee would only hand the
 * sample back as it is: the stretcher BYPASSES it and copies the virtual input
 * straight into the ring, tagged the same (the drift trim then varispeeds it
 * by at most 0.1 %: there it moves the pitch too, so the bypass takes over
 * only once the drift is under AU_WARP_BYP_IN and hands back above
 * AU_WARP_BYP_OUT), at almost no cost; it crossfades into Bungee and back as the
 * tempo or pitch moves off and onto that point (AU_WARP_FADE frames, both
 * renderings at the same input positions). A mono sample runs a mono
 * stretcher: half the cost of a stereo one.
 * A tempo, Pitch or Detune change is only a new speed or pitch: no restart.
 * A change to the map (Start, End, Bars, Nudge, Revrs, the clip's length)
 * restarts Bungee at the same tick. Bungee crossfades a restart itself: its
 * output runs two grains behind its input, so the two chunks after a reset
 * are the old stream's tail and the blend into the new one (measured: no
 * gap, a dip of ~2 dB on unrelated tones). Those chunks report the OLD
 * stream's positions, so they carry the time on (a map change) or no tag at
 * all (a new anchor: the audio thread drops them).
 * While the transport is stopped the clip's ring is kept filled from tick 0,
 * so the downbeat is there the moment it starts.
 *
 * The command (audio thread → stretcher) is one struct under a sequence
 * number (odd while it is written; the stretcher reads it again if it moved).
 * The ring is SPSC: head is the stretcher's, tail the audio thread's.
 * The stretcher is a SECOND READER of a streamed sample's chunks and of the
 * samples themselves, so freeing waits for it too: it marks each pass
 * (`busy`, `pass`), a chunk the streamer empties is freed only once a pass in
 * progress at that moment has ended (au_stream_bury), and the loader frees a
 * sample only after the same (au_warp_wait) — by then au_drop has taken it
 * out of every command, so no later pass can reach it. */

#define AU_WARP_RING     8192         /* frames per track (a power of two) */
#define AU_WARP_AHEAD    2048         /* frames the stretcher keeps ready (46 ms) */
#define AU_WARP_ROOM     4096         /* frames free before a grain may be rendered (its output's most) */
#define AU_WARP_LEAD     640.0        /* frames: a new anchor is this far ahead of the clock — Bungee's
                                       * first output lands a hop (512) before it, so the new sound is due
                                       * ~3 ms after the launch; later, its late frames are skipped */
#define AU_WARP_SNAP     1024.0       /* frames off the clock: re-anchor instead of trimming */
#define AU_WARP_TRIM_TC  11025.0      /* frames: the trim's time constant (0.25 s) */
#define AU_WARP_TRIM_MAX 0.03         /* the most the trim moves the speed */
#define AU_WARP_BYP_TRIM 0.001        /* ...bypassing, where it moves the pitch too (1.7 cents) */
#define AU_WARP_BYP_IN   16.0         /* frames of drift: the bypass takes over only below it */
#define AU_WARP_BYP_OUT  128.0        /* ...and hands back to Bungee (which trims at full rate) above it */
#define AU_WARP_FADE     64           /* frames: the audio thread's fade in / out */
#define AU_WARP_FAR      1e9          /* input frames: past this the position is rebased (hours in) */

#define AU_WARP_WAIT     0
#define AU_WARP_PLAY     1

typedef struct {
    uint32_t           seq;           /* odd while the audio thread writes */
    const au_sample_t *smp;
    uint32_t           rs, re;
    double             P, L;          /* the sample's own span and the clip's length, ticks */
    double             fpt;           /* output frames per tick (the tempo) */
    double             nud;           /* Nudge, ticks */
    double             rot;           /* Shift, ticks (0..L): the clip's time rotated, after Nudge */
    double             pitch;         /* frequency ratio (Pitch, Detune) */
    double             drift;         /* output frames the heard tag is ahead of the clock */
    double             anchor_tick;
    uint32_t           anchor_gen;
    uint8_t            revrs, run;
} au_warp_cmd_t;

typedef struct {
    au_warp_cmd_t cmd;                         /* audio thread -> stretcher */
    float         l[AU_WARP_RING], r[AU_WARP_RING];
    float         tag[AU_WARP_RING];           /* the clip tick each frame sounds (-1: none) */
    uint32_t      gen[AU_WARP_RING];           /* the anchor it was rendered for */
    uint32_t      head, tail;                  /* stretcher / audio thread */
    uint32_t      read_pos;                    /* the sample frame Bungee reads now (the streamer's watch) */
    /* the stretcher's own */
    au_st_t      *st;
    uint32_t      st_rate;
    au_warp_cmd_t cur;                         /* the command it renders */
    double        rpt;                         /* input frames per tick on the current map */
    double        vend;                        /* the unwrapped tick the ring ends at */
    double        rpos;                        /* the input position of the last reset */
    float         tnext;                       /* the tag the next frame carries on with (-1: none) */
    uint8_t       carry;                       /* that reset kept time (a map change): tags carry on */
    uint8_t       fresh;                       /* no chunk of the new stream seen since the reset */
    uint32_t      gstart;                      /* the ring index the current anchor's frames start at */
    uint8_t       st_ch;                       /* the stretcher's channels (a mono sample: 1) */
    uint8_t       byp;                         /* bypassing Bungee: the loop's own tempo, no pitch */
    uint8_t       to_byp;                      /* ...going there: the next grain crossfades into it */
    uint8_t       bstart_on;                   /* ...coming back: Bungee's frames before bstart are dropped */
    int           xin;                         /* frames of the crossfade into Bungee left */
    double        bpos;                        /* bypassing: the virtual input position of the next frame */
    double        bstart;                      /* coming back: where the bypass left off */
    float        *ibuf;                        /* Bungee's last input window, planar (L, then R at +icap) */
    int           icap;                        /* its frames per channel (au_st_max_input) */
    int           ib_b, ib_e;                  /* the virtual frames it holds; consecutive grains' windows
                                                * overlap ~7/8, so only the new part is fetched */
    uint8_t       ib_ok;                       /* it may be reused (no reset since, no chunk missing in it) */
    double        sp_base;                     /* the untrimmed speed the ring's newest frames were made at */
    uint32_t      settle;                      /* the ring index from which they were: the drift read
                                                * before it is played is of the old speed's frames */
    const void   *held;                        /* published: the sample it renders from (NULL: idle) */
} au_warp_t;

typedef struct {
    pthread_t        th;
    int              run;                      /* atomic */
    int              started;
    seq8_instance_t *inst;
    au_warp_t       *trk[NUM_TRACKS];
    float           *in;                       /* the planar scratch, 2 x in_max */
    int              in_max;
    uint32_t         pass, busy;               /* passes ended / one is under way */
    uint32_t         underruns;                /* input frames a streamed chunk was missing for */
} au_warper_t;

#ifdef SEQ8_TESTING
static int au_warp_manual = 0;                 /* tests: no thread; they call au_warp_service */
static int au_warp_nocache = 0;                /* tests: fetch every grain's whole input window */
#endif

/* ---- the audio thread's side of the command ---- */
/* Every field is copied with relaxed atomics: a seqlock's reader may overlap
 * a write (it then retries), which plain accesses would make undefined. */
#define AU_WCP(d, s, f) __atomic_store(&(d)->f, &(s)->f, __ATOMIC_RELAXED)
#define AU_WCL(d, s, f) __atomic_load(&(s)->f, &(d)->f, __ATOMIC_RELAXED)
#define AU_WARP_FIELDS(OP, d, s) \
    OP(d, s, smp); OP(d, s, rs); OP(d, s, re); OP(d, s, P); OP(d, s, L); OP(d, s, fpt); OP(d, s, nud); \
    OP(d, s, rot); OP(d, s, pitch); OP(d, s, drift); OP(d, s, anchor_tick); OP(d, s, anchor_gen); OP(d, s, revrs); OP(d, s, run)
static void au_warp_cmd_write(au_warp_t *W, const au_warp_cmd_t *c) {
    uint32_t q = W->cmd.seq;
    __atomic_store_n(&W->cmd.seq, q + 1, __ATOMIC_RELAXED);
    __atomic_thread_fence(__ATOMIC_RELEASE);
    AU_WARP_FIELDS(AU_WCP, &W->cmd, c);
    __atomic_store_n(&W->cmd.seq, q + 2, __ATOMIC_RELEASE);
}

/* A sample going back to the loader leaves every command first (au_drop:
 * the loader then waits out the stretcher's pass before freeing it). */
static void au_warp_forget(seq8_instance_t *inst, const au_sample_t *smp) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    int t;
    if (!X || !smp) return;
    for (t = 0; t < NUM_TRACKS; t++) {
        au_warp_t *W = X->trk[t];
        if (!W || W->cmd.smp != smp) continue;
        au_warp_cmd_t c = W->cmd;
        c.smp = NULL;
        c.run = 0;
        au_warp_cmd_write(W, &c);
        inst->au_trk[t].w.on = 0;
    }
}

/* ---- the stretcher ---- */
static int au_warp_cmd_read(au_warp_t *W, au_warp_cmd_t *c) {
    int tries;
    for (tries = 0; tries < 8; tries++) {
        uint32_t a = __atomic_load_n(&W->cmd.seq, __ATOMIC_ACQUIRE);
        if (a & 1) continue;
        AU_WARP_FIELDS(AU_WCL, c, &W->cmd);
        __atomic_thread_fence(__ATOMIC_ACQUIRE);
        if (__atomic_load_n(&W->cmd.seq, __ATOMIC_RELAXED) == a) return 1;
    }
    return 0;
}

/* the map: what the stretcher reads, and how fast */
static int au_warp_map_same(const au_warp_cmd_t *a, const au_warp_cmd_t *b) {
    return a->smp == b->smp && a->rs == b->rs && a->re == b->re && a->P == b->P && a->L == b->L &&
           a->nud == b->nud && a->rot == b->rot && a->revrs == b->revrs;
}
static double au_warp_speed(const au_warp_t *W) {
    const au_warp_cmd_t *c = &W->cur;
    double sp = W->rpt * 44100.0 / ((double)c->smp->rate * c->fpt), trim = -c->drift / AU_WARP_TRIM_TC;
    /* bypassing, a trim is a pitch change too (varispeed): a hair at most */
    double mx = W->byp ? AU_WARP_BYP_TRIM : AU_WARP_TRIM_MAX;
    if (trim > mx) trim = mx;
    if (trim < -mx) trim = -mx;
    return sp * (1.0 + trim);
}

/* The loop's own tempo, no Pitch / Detune: Bungee would hand it back as is.
 * (No libm in this unit: the bounds by hand. 1e-4 of speed is 0.2 cents.) */
static int au_warp_native(const au_warp_t *W) {
    const au_warp_cmd_t *c = &W->cur;
    double sp = W->rpt * 44100.0 / ((double)c->smp->rate * c->fpt) - 1.0, pd = c->pitch - 1.0;
    return sp < 1e-4 && sp > -1e-4 && pd < 1e-9 && pd > -1e-9;
}

/* the sample frame virtual position v reads (the streamer's watch) */
static void au_warp_watch_at(au_warp_t *W, double v) {
    const au_warp_cmd_t *c = &W->cur;
    double x = (au_wrap(au_wrap(v / W->rpt, c->L) - c->rot, c->L) - c->nud) * W->rpt;
    uint32_t f = 0;
    if (x >= 0 && x < (double)(c->re - c->rs)) f = c->revrs ? c->re - 1 - (uint32_t)x : c->rs + (uint32_t)x;
    __atomic_store_n(&W->read_pos, f, __ATOMIC_RELAXED);
}

/* virtual input frame v -> one sample frame (L, R), 0 where the sample does
 * not reach; v is a position on the unwrapped clip ticks x rpt */
static void au_warp_frame(au_warper_t *X, const au_warp_t *W, double v, float *l, float *r) {
    const au_warp_cmd_t *c = &W->cur;
    const au_sample_t *s = c->smp;
    double R = (double)(c->re - c->rs), x = (au_wrap(au_wrap(v / W->rpt, c->L) - c->rot, c->L) - c->nud) * W->rpt, fr;
    uint32_t i;
    const int16_t *a, *b;
    *l = *r = 0.f;
    if (!(x >= 0) || x >= R) return;
    if (c->revrs) x = R - 1.0 - x;
    if (x < 0) x = 0;
    i = (uint32_t)x;
    fr = x - (double)i;
    a = au_at(s, c->rs + i);
    b = (c->rs + i + 1 < c->re) ? au_at(s, c->rs + i + 1) : a;
    if (!a || !b) { X->underruns++; return; }
    {
        float la = a[0], lb = b[0], ra = s->ch > 1 ? a[1] : la, rb = s->ch > 1 ? b[1] : lb;
        *l = (float)((la + (lb - la) * fr) / 32768.0);
        *r = (float)((ra + (rb - ra) * fr) / 32768.0);
    }
}

/* Bypassing: one chunk copied straight from the virtual input (at the
 * trimmed speed, ~1), tagged as Bungee's frames are. Returns its frames. */
#define AU_WARP_BYP_CHUNK 512
static int au_warp_bypass(au_warper_t *X, au_warp_t *W) {
    const au_warp_cmd_t *c = &W->cur;
    double sp = au_warp_speed(W);
    uint32_t h = W->head;
    int i;
    for (i = 0; i < AU_WARP_BYP_CHUNK; i++) {
        uint32_t s = (h + (uint32_t)i) & (AU_WARP_RING - 1);
        double v = W->bpos + sp * i;
        au_warp_frame(X, W, v, &W->l[s], &W->r[s]);
        W->tag[s] = (float)au_wrap(v / W->rpt, c->L);
        W->gen[s] = c->anchor_gen;
    }
    au_warp_watch_at(W, W->bpos);
    W->bpos += sp * AU_WARP_BYP_CHUNK;
    if (W->bpos > AU_WARP_FAR) W->bpos = au_wrap(W->bpos / W->rpt, c->L) * W->rpt;   /* the map wraps: no seam */
    W->vend = W->bpos / W->rpt;
    W->tnext = (float)au_wrap(W->vend, c->L);
    __atomic_store_n(&W->head, h + AU_WARP_BYP_CHUNK, __ATOMIC_RELEASE);
    return AU_WARP_BYP_CHUNK;
}

/* one grain into the ring; returns the frames it wrote */
static int au_warp_grain(au_warper_t *X, au_warp_t *W) {
    const au_warp_cmd_t *c = &W->cur;
    const float *ol, *or_;
    double p0, p1, sp;
    int b, e, i, n, j = 0;
    uint32_t h = W->head;
    if (W->byp) return au_warp_bypass(X, W);
    sp = au_warp_speed(W);
    au_st_want(W->st, sp, c->pitch, &b, &e);
    {
        /* Bungee's input window: the overlap with the last grain's is kept
         * (shifted down), only the frames past it fetched — that fetch, not
         * Bungee, was most of the stretcher's cost (measured on the Move:
         * ~3 % of a core of the 5 %, the same for a mono sample) */
        float *in = W->ibuf ? W->ibuf : X->in;
        int cap = W->ibuf ? W->icap : X->in_max, from = b;
        uint32_t u0 = X->underruns;
        if (e - b > cap) e = b + cap;
        if (W->ibuf && W->ib_ok && b >= W->ib_b && b < W->ib_e && e >= W->ib_e
#ifdef SEQ8_TESTING
            && !au_warp_nocache
#endif
        ) {
            int keep = W->ib_e - b, shift = b - W->ib_b;
            if (shift) {
                memmove(in, in + shift, (size_t)keep * sizeof(float));
                memmove(in + cap, in + cap + shift, (size_t)keep * sizeof(float));
            }
            from = W->ib_e;
        }
        for (i = from - b; i < e - b; i++) au_warp_frame(X, W, (double)(b + i), &in[i], &in[cap + i]);
        W->ib_b = b;
        W->ib_e = e;
        W->ib_ok = W->ibuf && X->underruns == u0;    /* a chunk missing: fetch it all again next time */
        n = au_st_grain(W->st, in, cap, &ol, &or_, &p0, &p1);
    }
    /* A chunk's frames run from p0 to p1, once it is the new stream's (see
     * above: not while Bungee still plays out the old one, nor while filling) */
    int ok = n > 0 && p0 == p0 && p1 == p1 && p1 >= p0 && p1 - p0 <= 4.0 * sp * n + 1.0;
    if (ok && W->fresh) {
        /* the new stream's first chunk starts a hop before the reset (preroll) */
        if (p0 >= W->rpos - 2.0 * sp * n - 1.0 && p0 <= W->rpos + 1.0) W->fresh = 0;
        else ok = 0;
    }
    au_warp_watch_at(W, (b + e) * 0.5);
    for (i = 0; i < n; i++) {
        uint32_t s = (h + (uint32_t)j) & (AU_WARP_RING - 1);
        double v = ok ? p0 + (p1 - p0) * i / n : 0;
        float l = ol[i], r = or_[i];
        if (W->bstart_on) {
            /* back from the bypass: it already wrote up to bstart; Bungee
             * takes over from there, blending in from the bypass's frames at
             * the same positions */
            float bl, br, g;
            if (!ok || v < W->bstart) continue;
            au_warp_frame(X, W, v, &bl, &br);
            g = (float)(AU_WARP_FADE - W->xin + 1) / (float)(AU_WARP_FADE + 1);
            l = l * g + bl * (1.f - g);
            r = r * g + br * (1.f - g);
            if (--W->xin <= 0) W->bstart_on = 0;
        } else if (W->to_byp && ok) {
            /* into the bypass: Bungee blends out over this chunk's first frames */
            float bl, br, g = i < AU_WARP_FADE ? (float)(i + 1) / (float)(AU_WARP_FADE + 1) : 1.f;
            au_warp_frame(X, W, v, &bl, &br);
            l = l * (1.f - g) + bl * g;
            r = r * (1.f - g) + br * g;
        }
        W->l[s] = l;
        W->r[s] = r;
        if (ok) W->tag[s] = (float)au_wrap(v / W->rpt, c->L);
        else if (W->carry && W->tnext >= 0) W->tag[s] = (float)au_wrap(W->tnext + (double)i / c->fpt, c->L);
        else W->tag[s] = -1.f;
        W->gen[s] = c->anchor_gen;
        j++;
    }
    if (ok) {
        W->vend = p1 / W->rpt;
        W->tnext = (float)au_wrap(W->vend, c->L);
        W->carry = 0;
        if (W->to_byp) { W->to_byp = 0; W->byp = 1; W->bpos = p1; }
    } else if (n > 0 && W->carry && W->tnext >= 0) {
        W->tnext = (float)au_wrap(W->tnext + (double)n / c->fpt, c->L);
    }
    __atomic_store_n(&W->head, h + (uint32_t)j, __ATOMIC_RELEASE);
    return j;
}

/* (re)start Bungee at unwrapped tick `vt` on the current map; carry: the
 * time goes on (a map change), else it is a new anchor */
static void au_warp_reset(au_warp_t *W, double vt, int carry) {
    const au_warp_cmd_t *c = &W->cur;
    W->rpt = (double)(c->re - c->rs) / c->P;
    W->vend = vt;
    W->rpos = vt * W->rpt;
    W->carry = (uint8_t)carry;
    W->fresh = 1;
    W->byp = W->to_byp = W->bstart_on = 0;
    W->ib_ok = 0;
    if (!carry) { W->tnext = -1.f; W->gstart = W->head; }
    au_st_reset(W->st, W->rpos, au_warp_speed(W), c->pitch);
}

/* start bypassing at unwrapped tick `vt` (carry: the time goes on) */
static void au_warp_byp_start(au_warp_t *W, double vt, int carry) {
    const au_warp_cmd_t *c = &W->cur;
    W->rpt = (double)(c->re - c->rs) / c->P;
    W->vend = vt;
    W->bpos = vt * W->rpt;
    W->byp = 1;
    W->to_byp = W->bstart_on = 0;
    W->ib_ok = 0;
    W->tnext = (float)au_wrap(vt, c->L);
    if (!carry) W->gstart = W->head;
}

static void au_warp_idle(au_warp_t *W) {
    if (W->st) { au_st_destroy(W->st); W->st = NULL; }
    free(W->ibuf);
    W->ibuf = NULL;
    W->icap = 0;
    W->ib_ok = 0;
    W->cur.smp = NULL;
    W->cur.run = 0;
    __atomic_store_n(&W->read_pos, 0, __ATOMIC_RELAXED);
}

/* One track. Returns the frames it rendered. */
static int au_warp_track(au_warper_t *X, au_warp_t *W) {
    au_warp_cmd_t c;
    int got = 0, fresh = 0;
    if (!au_warp_cmd_read(W, &c)) return 0;
    if (!c.run || !c.smp || c.re <= c.rs + 32 || !(c.P > 0) || !(c.L > 0) || !(c.fpt > 0) || !(c.pitch > 0)) {
        au_warp_idle(W);
        return 0;
    }
    if (!W->st || W->cur.smp != c.smp || W->st_rate != c.smp->rate || W->st_ch != (c.smp->ch > 1 ? 2 : 1)) {
        if (W->st) au_st_destroy(W->st);
        W->st_ch = (uint8_t)(c.smp->ch > 1 ? 2 : 1);
        W->st = au_st_create((int)c.smp->rate, 44100, W->st_ch);
        W->st_rate = c.smp->rate;
        W->cur.smp = NULL;
        if (!W->st) return 0;
        if (au_st_max_input(W->st) > X->in_max) { au_st_destroy(W->st); W->st = NULL; return 0; }
        if (!W->ibuf || W->icap < au_st_max_input(W->st)) {
            free(W->ibuf);
            W->icap = au_st_max_input(W->st);
            W->ibuf = (float *)calloc(2 * (size_t)W->icap, sizeof(float));   /* NULL: the shared scratch, uncached */
        }
        W->ib_ok = 0;
        fresh = 1;
    }
    if (fresh || c.anchor_gen != W->cur.anchor_gen) {
        /* a new anchor: start there; the audio thread drops the old frames */
        W->cur = c;
        W->rpt = (double)(c.re - c.rs) / c.P;
        if (au_warp_native(W)) au_warp_byp_start(W, c.anchor_tick, 0);
        else au_warp_reset(W, c.anchor_tick, 0);
    } else if (!au_warp_map_same(&W->cur, &c) || (!W->byp && W->vend * W->rpt > AU_WARP_FAR)) {
        /* the map changed (or hours have run): restart where the ring ends
         * (Bungee blends the two streams; the bypass needs no blend) */
        double vt = W->vend;
        if (vt * W->rpt > AU_WARP_FAR) vt = au_wrap(vt, c.L);
        W->cur = c;
        W->rpt = (double)(c.re - c.rs) / c.P;
        if (au_warp_native(W)) au_warp_byp_start(W, vt, 1);
        else au_warp_reset(W, vt, 1);
    } else {
        W->cur = c;                     /* tempo, pitch, the drift: the next grain takes them */
        double dr = c.drift < 0 ? -c.drift : c.drift;
        double spb = W->rpt * 44100.0 / ((double)c.smp->rate * c.fpt), dsp = spb - W->sp_base;
        /* the drift the audio thread reads is of frames rendered ~AU_WARP_AHEAD
         * ago: after a tempo change it means nothing for the bypass until the
         * old speed's frames have played (it switched early, then the drift
         * grew and it handed back) */
        int settled = (int32_t)(__atomic_load_n(&W->tail, __ATOMIC_ACQUIRE) - W->settle) >= 0;
        if (dsp > 1e-9 || dsp < -1e-9) { W->sp_base = spb; W->settle = W->head; settled = 0; }
        if (W->byp && (!au_warp_native(W) || dr > AU_WARP_BYP_OUT)) {
            /* off the loop's own tempo / pitch: Bungee again, from where the
             * bypass left off, blending in */
            double bp = W->bpos;
            au_warp_reset(W, W->vend, 1);
            W->bstart_on = 1;
            W->bstart = bp;
            W->xin = AU_WARP_FADE;
        } else if (!W->byp && !W->to_byp && !W->bstart_on && au_warp_native(W) && dr < AU_WARP_BYP_IN && settled) {
            W->to_byp = 1;              /* onto it, the drift trimmed: the next grain blends out */
        } else if (W->to_byp && (!au_warp_native(W) || dr >= AU_WARP_BYP_IN)) {
            W->to_byp = 0;
        }
    }
    {
        int empty = 0;                   /* grains with no output: Bungee filling after a reset */
        uint32_t tl, from;
        /* ahead of what is read, or of the anchor's start: the last anchor's
         * frames still playing out do not hold the new one back. (A stretcher
         * later than this look-ahead renders only frames already late: the
         * audio thread skips them and frees them as it goes — it moves tail
         * with them once nothing old is left to play — so it renders on.) */
        while ((tl = __atomic_load_n(&W->tail, __ATOMIC_ACQUIRE), from = (int32_t)(tl - W->gstart) > 0 ? tl : W->gstart,
                W->head - from < AU_WARP_AHEAD) &&
               AU_WARP_RING - (W->head - tl) >= AU_WARP_ROOM && empty < 8) {
            int n = au_warp_grain(X, W);
            got += n;
            if (n <= 0) empty++;
        }
    }
    return got;
}

/* One pass over every track. Returns the frames rendered. */
static unsigned au_warp_service(seq8_instance_t *inst) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    unsigned got = 0;
    int t;
    if (!X) return 0;
    __atomic_store_n(&X->busy, 1, __ATOMIC_RELAXED);
    __atomic_thread_fence(__ATOMIC_SEQ_CST);          /* before any sample or chunk is read */
    for (t = 0; t < NUM_TRACKS; t++) {
        if (!X->trk[t]) continue;
        got += (unsigned)au_warp_track(X, X->trk[t]);
        __atomic_store_n(&X->trk[t]->held, (const void *)X->trk[t]->cur.smp, __ATOMIC_RELAXED);
    }
    __atomic_store_n(&X->pass, X->pass + 1, __ATOMIC_RELEASE);
    __atomic_store_n(&X->busy, 0, __ATOMIC_RELEASE);
    return got;
}

/* The streamer, about to free a chunk it emptied, or the loader a sample:
 * the pass under way now (if any) may still hold it; one that starts later
 * cannot reach it. Returns the pass number that must have ENDED (pass > it). */
static uint32_t au_warp_mark(seq8_instance_t *inst) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    if (!X) return 0;
    __atomic_thread_fence(__ATOMIC_SEQ_CST);          /* after the pointer was taken away */
    if (!__atomic_load_n(&X->busy, __ATOMIC_RELAXED)) return __atomic_load_n(&X->pass, __ATOMIC_ACQUIRE) - 1;
    return __atomic_load_n(&X->pass, __ATOMIC_ACQUIRE);
}
static int au_warp_passed(seq8_instance_t *inst, uint32_t mark) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    if (!X) return 1;
    return (int32_t)(__atomic_load_n(&X->pass, __ATOMIC_ACQUIRE) - mark) > 0;
}
/* The loader, before freeing a sample (au_drop already took it out of every
 * command). Blocks: the loader may. */
static void au_warp_wait(seq8_instance_t *inst) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    uint32_t m;
    if (!X) return;
    m = au_warp_mark(inst);
#ifdef SEQ8_TESTING
    if (au_warp_manual) return;                   /* a test's pass ends before it returns */
#endif
    while (X->started && __atomic_load_n(&X->run, __ATOMIC_ACQUIRE) && !au_warp_passed(inst, m)) usleep(500);
}

static void *au_warper_main(void *arg) {
    au_warper_t *X = (au_warper_t *)arg;
    au_thread_unrealtime();             /* off the realtime class, as the streamer */
    /* its own name: a thread inherits its creator's, and the stretcher read
     * as "Audio Main/SPI" in the Move's thread list (prctl: no _GNU_SOURCE
     * here, which pthread_setname_np needs on Linux) */
#if defined(__linux__)
    prctl(PR_SET_NAME, "dbx-warp", 0, 0, 0);
#elif defined(__APPLE__)
    pthread_setname_np("dbx-warp");
#endif
    while (__atomic_load_n(&X->run, __ATOMIC_ACQUIRE))
        if (!au_warp_service(X->inst)) usleep(1000);
    return NULL;
}

static void au_warper_init(seq8_instance_t *inst) {
    au_warper_t *X = (au_warper_t *)calloc(1, sizeof *X);
    int t;
    inst->au_warper = X;
    if (!X) return;
    X->inst = inst;
    X->in_max = 32768;                  /* Bungee asks for 16385 at 44.1 kHz; more for a faster rate */
    X->in = (float *)calloc(2 * (size_t)X->in_max, sizeof(float));
    for (t = 0; t < NUM_TRACKS; t++) X->trk[t] = (au_warp_t *)calloc(1, sizeof(au_warp_t));
    X->run = 1;
#ifdef SEQ8_TESTING
    if (au_warp_manual) return;
#endif
    if (pthread_create(&X->th, NULL, au_warper_main, X) == 0) X->started = 1;
}

/* Before the streamer and the pool (it reads their chunks and samples). */
static void au_warper_shutdown(seq8_instance_t *inst) {
    au_warper_t *X = (au_warper_t *)inst->au_warper;
    int t;
    if (!X) return;
    __atomic_store_n(&X->run, 0, __ATOMIC_RELEASE);
    if (X->started) pthread_join(X->th, NULL);
    for (t = 0; t < NUM_TRACKS; t++) {
        if (!X->trk[t]) continue;
        if (X->trk[t]->st) au_st_destroy(X->trk[t]->st);
        free(X->trk[t]->ibuf);
        free(X->trk[t]);
    }
    free(X->in);
    free(X);
    inst->au_warper = NULL;
}

/* ---------------- the loader thread ---------------- */

static au_sample_t *au_pool_get(au_loader_t *L, const char *path, int *err) {
    int i, free_i = -1;
    for (i = 0; i < AU_POOL_MAX; i++) {
        if (L->pool[i].smp && !strcmp(L->pool[i].path, path)) {
            L->pool[i].smp->refs++;
            *err = AU_ERR_NONE;
            return L->pool[i].smp;
        }
        if (!L->pool[i].smp && free_i < 0) free_i = i;
    }
    if (free_i < 0) { *err = AU_ERR_MEM; return NULL; }
    au_sample_t *s = au_read_file(path, 1, err);
    if (!s) return NULL;
    if (s->st && !au_stream_add(L->inst, s)) { au_sample_free(s); *err = AU_ERR_MEM; return NULL; }
    s->refs = 1;
    snprintf(L->pool[free_i].path, sizeof L->pool[free_i].path, "%s", path);
    L->pool[free_i].smp = s;
    return s;
}

static void au_pool_release(au_loader_t *L, au_sample_t *s) {
    int i;
    for (i = 0; i < AU_POOL_MAX; i++) {
        if (L->pool[i].smp != s) continue;
        if (s->refs > 1) { s->refs--; return; }
        L->pool[i].smp = NULL;
        L->pool[i].path[0] = '\0';
        if (s->st) au_stream_remove(L->inst, s);   /* the streamer lets go first */
        au_warp_wait(L->inst);                     /* and the stretcher's pass ends */
        au_sample_free(s);
        return;
    }
}

/* ---------------- a sample's own length in bars (loader thread) ----------------
 *
 * Josh, 2026-10-28: "we dont have any way telling how long a loop, as
 * recorded, is" -> a Bars value per clip, guessed when the sample lands and
 * set by hand on the CLIP bank. A loop is a whole number of bars, so the guess
 * only chooses between a few candidates. In order of trust:
 *   1. the file's name: "4bar", "4 bars", or "84 bpm" (the length at it);
 *   2. its beats: each of 1..32 bars implies a tempo; of those in 70..180 bpm,
 *      the one whose beat grid the onsets (rises in the per-256-frame
 *      waveform summary) land on best, the nearest the project's tempo among
 *      near-ties (half / double time);
 *   3. the length at the project's tempo, in whole bars. */

static int au_bars_clamp(double b) {
    int n = (int)(b + 0.5);
    return n < 1 ? 1 : n > AU_BARS_MAX ? AU_BARS_MAX : n;
}

/* The number right before `at` in name (digits and one '.'), or -1. */
static double au_num_before(const char *name, const char *at) {
    const char *e = at, *b;
    double v = 0, f = 0, d = 1;
    int dot = 0;
    while (e > name && (e[-1] == ' ' || e[-1] == '_' || e[-1] == '-')) e--;
    b = e;
    while (b > name && ((b[-1] >= '0' && b[-1] <= '9') || (b[-1] == '.' && !dot))) { if (b[-1] == '.') dot = 1; b--; }
    if (b == e || *b == '.') return -1;
    for (dot = 0; b < e; b++) {
        if (*b == '.') { dot = 1; continue; }
        if (dot) { d *= 10; f = f * 10 + (*b - '0'); } else v = v * 10 + (*b - '0');
    }
    return v + f / d;
}

static int au_bars_from_name(const char *name, double secs) {
    char lc[AU_PATH_MAX];
    size_t i;
    const char *q;
    for (i = 0; name[i] && i + 1 < sizeof lc; i++) lc[i] = (char)((name[i] >= 'A' && name[i] <= 'Z') ? name[i] + 32 : name[i]);
    lc[i] = '\0';
    for (q = strstr(lc, "bar"); q; q = strstr(q + 1, "bar")) {
        double n = au_num_before(lc, q);
        if (n >= 1 && n <= AU_BARS_MAX && n == (int)n) return (int)n;
    }
    for (q = strstr(lc, "bpm"); q; q = strstr(q + 1, "bpm")) {
        double bpm = au_num_before(lc, q);
        if (bpm >= 40 && bpm <= 300 && secs > 0) {
            double b = secs * bpm / 240.0;
            int n = au_bars_clamp(b);
            if (b > (double)n * 0.97 && b < (double)n * 1.03) return n;   /* a whole number of bars, or the name means something else */
        }
    }
    return 0;
}

static int au_bars_from_beats(const au_sample_t *s, double bpm_proj) {
    static const int cand[] = { 1, 2, 4, 8, 16, 32 };
    double secs = (double)s->frames / (double)s->rate, score[6], mean = 0, best = 0;
    uint32_t n = s->nmip, i;
    int k, pick = 0;
    if (!s->mip || n < 16 || secs <= 0) return 0;
    for (i = 1; i < n; i++) {
        int a0 = s->mip[i - 1][1] > -s->mip[i - 1][0] ? s->mip[i - 1][1] : -s->mip[i - 1][0];
        int a1 = s->mip[i][1] > -s->mip[i][0] ? s->mip[i][1] : -s->mip[i][0];
        mean += a1 > a0 ? a1 - a0 : 0;
    }
    mean /= (double)(n - 1);
    if (mean <= 0) return 0;
    for (k = 0; k < 6; k++) {
        double bpm = cand[k] * 240.0 / secs, sum = 0;
        int beats = cand[k] * 4, j;
        score[k] = -1;
        if (bpm < 70 || bpm > 180 || beats > (int)n / 4) continue;
        for (j = 0; j < beats; j++) {
            /* the strongest rise within ~12 ms of the beat */
            long c = (long)((double)j * (double)n / beats + 0.5), x;
            int hi = 0;
            for (x = c - 2; x <= c + 2; x++) {
                if (x < 1 || x >= (long)n) continue;
                int a0 = s->mip[x - 1][1] > -s->mip[x - 1][0] ? s->mip[x - 1][1] : -s->mip[x - 1][0];
                int a1 = s->mip[x][1] > -s->mip[x][0] ? s->mip[x][1] : -s->mip[x][0];
                if (a1 - a0 > hi) hi = a1 - a0;
            }
            sum += (j % 4 == 0) ? 1.5 * hi : hi;        /* a downbeat counts for more */
        }
        score[k] = sum / (beats * 1.125) / mean;
        if (score[k] > best) best = score[k];
    }
    if (best <= 0) return 0;
    {
        double far = 1e9;
        for (k = 0; k < 6; k++) {
            if (score[k] < best * 0.85) continue;
            double bpm = cand[k] * 240.0 / secs, r = bpm > bpm_proj ? bpm / bpm_proj : bpm_proj / bpm;
            if (r < far) { far = r; pick = cand[k]; }
        }
    }
    return pick;
}

/* The sample's own Tempo x10, the stored fact since Bars left (Josh,
 * 2026-10-29: Move "calculates loop length on load" and has "a tempo knob to
 * set the original tempo"). A tempo in the name is taken as it is — a tail or
 * a lead-in makes the file no whole number of bars, and the name is still
 * right; then a number of bars in the name, the beats, and last the project's
 * tempo (the sample then plays as it was recorded). */
static int au_bpm10_clamp(double bpm) {
    int v = (int)(bpm * 10.0 + 0.5);
    return v < AU_BPM10_MIN ? AU_BPM10_MIN : v > AU_BPM10_MAX ? AU_BPM10_MAX : v;
}

static int au_guess_bpm10(const au_sample_t *s, const char *name, double bpm_proj) {
    char lc[AU_PATH_MAX];
    const char *q;
    double secs;
    size_t i;
    int b;
    if (bpm_proj <= 0) bpm_proj = 120.0;
    if (!s || !s->rate || !s->frames) return au_bpm10_clamp(bpm_proj);
    secs = (double)s->frames / (double)s->rate;
    for (i = 0; name[i] && i + 1 < sizeof lc; i++) lc[i] = (char)((name[i] >= 'A' && name[i] <= 'Z') ? name[i] + 32 : name[i]);
    lc[i] = '\0';
    for (q = strstr(lc, "bpm"); q; q = strstr(q + 1, "bpm")) {
        double bpm = au_num_before(lc, q);
        if (bpm >= 20 && bpm <= 300) return au_bpm10_clamp(bpm);
    }
    if ((b = au_bars_from_name(name, secs)) > 0) return au_bpm10_clamp(b * 240.0 / secs);
    if ((b = au_bars_from_beats(s, bpm_proj)) > 0) return au_bpm10_clamp(b * 240.0 / secs);
    return au_bpm10_clamp(bpm_proj);
}

static void au_res_push(seq8_instance_t *inst, const au_res_t *r) {
    /* The audio thread drains every block; wait rather than lose a result. */
    for (;;) {
        uint32_t h = inst->au_res_head, t = __atomic_load_n(&inst->au_res_tail, __ATOMIC_ACQUIRE);
        if (h - t < AU_RING) {
            inst->au_res[h & (AU_RING - 1)] = *r;
            __atomic_store_n(&inst->au_res_head, h + 1, __ATOMIC_RELEASE);
            return;
        }
        if (au_abort) return;                       /* shutting down: nobody will drain it */
        usleep(2000);
    }
}

/* ---- Trim / Normalize (Josh, 2026-10-30: "trim and normalize options" on
 * SAMPLE's menu; "dialog: overwrite or new sample"; "new copy is default").
 * The loader thread reads samples/<path> a chunk at a time and writes a 16-bit
 * WAV — Trim: frames a..b, what the clip plays; Normalize: the whole file, its
 * peak raised to full scale — through a temp file and a rename, so a reader
 * never sees half of it. A new sample is "<stem> trim.wav" / "<stem> norm.wav"
 * ("~2"... when taken); overwriting keeps the name. ---- */
static void au_wav_header(uint8_t h[44], uint32_t frames, uint32_t rate, uint32_t ch) {
    uint32_t data = frames * ch * 2, v;
    memcpy(h, "RIFF", 4); v = 36 + data; memcpy(h + 4, &v, 4);
    memcpy(h + 8, "WAVEfmt ", 8); v = 16; memcpy(h + 16, &v, 4);
    { uint16_t f = 1, c = (uint16_t)ch, ba = (uint16_t)(ch * 2), bits = 16;
      memcpy(h + 20, &f, 2); memcpy(h + 22, &c, 2); memcpy(h + 24, &rate, 4);
      v = rate * ch * 2; memcpy(h + 28, &v, 4); memcpy(h + 32, &ba, 2); memcpy(h + 34, &bits, 2); }
    memcpy(h + 36, "data", 4); memcpy(h + 40, &data, 4);
}
static int au_edit_name(const char *dir, const char *src, const char *tag, char *name, size_t name_sz) {
    char stem[AU_PATH_MAX], dst[600];
    int k;
    snprintf(stem, sizeof stem, "%s", src);
    { char *dot = strrchr(stem, '.'); if (dot) *dot = '\0'; }
    for (k = 1; k < 1000; k++) {
        if (k == 1) snprintf(name, name_sz, "%s %s.wav", stem, tag);
        else snprintf(name, name_sz, "%s %s~%d.wav", stem, tag, k);
        snprintf(dst, sizeof dst, "%s/%s", dir, name);
        if (au_file_size(dst) < 0) return 0;
    }
    return 1;
}
static int au_edit_file(const au_req_t *q, char *name, size_t name_sz, uint32_t *cut) {
    char src[600], dst[600], tmp[610];
    FILE *f, *o = NULL;
    au_fmt_t fm;
    uint8_t *buf = NULL;
    int16_t *pcm = NULL;
    uint32_t a, b, ch, fb, done, peak = 0;
    double gain = 1.0;
    int err, pass, ok = 1;
    *cut = 0;
    snprintf(src, sizeof src, "%s/%s", q->dir, q->path);
    f = fopen(src, "rb");
    if (!f) return AU_ERR_OPEN;
    err = au_probe(f, &fm);
    if (err) { fclose(f); return err; }
    ch = fm.ch >= 2 ? 2 : 1;
    fb = (uint32_t)fm.ch * (fm.bits / 8);
    a = q->op == AU_EDIT_TRIM ? q->a : 0;
    b = q->op == AU_EDIT_TRIM ? q->b : fm.frames;
    if (b > fm.frames) b = fm.frames;
    if (a >= b) { fclose(f); return AU_ERR_FORMAT; }
    if (q->ow) snprintf(name, name_sz, "%s", q->path);
    else if (au_edit_name(q->dir, q->path, q->op == AU_EDIT_TRIM ? "trim" : "norm", name, name_sz)) { fclose(f); return AU_ERR_COPY; }
    snprintf(dst, sizeof dst, "%s/%s", q->dir, name);
    snprintf(tmp, sizeof tmp, "%s.tmp", dst);
    buf = (uint8_t *)malloc((size_t)AU_CHUNK * fb);
    pcm = (int16_t *)malloc((size_t)AU_CHUNK * ch * sizeof(int16_t));
    if (!buf || !pcm) { err = AU_ERR_MEM; goto out; }
    /* Normalize: the peak first; Trim: one pass */
    for (pass = q->op == AU_EDIT_NORM ? 0 : 1; pass < 2; pass++) {
        if (pass == 1) {
            uint8_t h[44];
            if (q->op == AU_EDIT_NORM) {
                if (!peak) { err = AU_ERR_SILENT; goto out; }            /* silence: nothing to raise */
                gain = 32767.0 / (double)peak;
            }
            o = fopen(tmp, "wb");
            if (!o) { err = AU_ERR_COPY; goto out; }
            au_wav_header(h, b - a, fm.rate, ch);
            if (fwrite(h, 1, 44, o) != 44) { ok = 0; break; }
        }
        if (fseek(f, (long)fm.data_off + (long)a * (long)fb, SEEK_SET)) { err = AU_ERR_OPEN; goto out; }
        for (done = a; done < b; ) {
            uint32_t want = b - done < AU_CHUNK ? b - done : AU_CHUNK, i;
            size_t got;
            if (au_abort) { err = AU_ERR_OPEN; goto out; }
            got = fread(buf, fb, want, f);
            if (!got) { ok = 0; break; }
            au_conv_frames(buf, (uint32_t)got, &fm, (uint8_t)ch, pcm);
            if (pass == 0) {
                for (i = 0; i < (uint32_t)got * ch; i++) { uint32_t m = (uint32_t)(pcm[i] < 0 ? -(int)pcm[i] : pcm[i]); if (m > peak) peak = m; }
            } else {
                if (gain != 1.0)
                    for (i = 0; i < (uint32_t)got * ch; i++) {
                        double v = (double)pcm[i] * gain;
                        pcm[i] = (int16_t)(v > 32767.0 ? 32767 : v < -32768.0 ? -32768 : (int)(v < 0 ? v - 0.5 : v + 0.5));
                    }
                if (fwrite(pcm, sizeof(int16_t) * ch, got, o) != got) { ok = 0; break; }
            }
            done += (uint32_t)got;
        }
    }
    if (!ok) { err = AU_ERR_COPY; goto out; }
    if (fflush(o) || fsync(fileno(o))) { err = AU_ERR_COPY; goto out; }
    fclose(o); o = NULL;
    if (rename(tmp, dst)) { err = AU_ERR_COPY; goto out; }
    {
        /* owned like the folder it lands in, as an imported sample is */
        struct stat st;
        if (stat(q->dir, &st) == 0 && chown(dst, st.st_uid, st.st_gid)) { /* best effort */ }
    }
    *cut = a;
    err = AU_ERR_NONE;
out:
    if (o) { fclose(o); unlink(tmp); }
    fclose(f);
    free(buf);
    free(pcm);
    return err;
}

static void au_loader_do(au_loader_t *L, const au_req_t *q) {
    seq8_instance_t *inst = L->inst;
    au_res_t r;
    char path[512];
    int err = AU_ERR_NONE;
    if (q->kind == AU_REQ_DROP) { au_pool_release(L, q->smp); return; }
    memset(&r, 0, sizeof r);
    r.track = q->track; r.clip = q->clip; r.gen = q->gen;
    au_ld_done = au_ld_total = 0;
    au_ld_key = (int)q->track * NUM_CLIPS + (int)q->clip;
    if (q->kind == AU_REQ_PICK) {
        err = au_import(q->path, q->dir, r.name, sizeof r.name);
    } else if (q->kind == AU_REQ_EDIT) {
        r.edit = 1; r.ow = q->ow;
        err = au_edit_file(q, r.name, sizeof r.name, &r.cut);
        if (!err && q->ow) {
            /* the old audio under that name is gone: the next get reads the
             * new file (clips still holding the old sample keep it until
             * they reload — the audio thread reloads them at once) */
            int i;
            snprintf(path, sizeof path, "%s/%s", q->dir, r.name);
            for (i = 0; i < AU_POOL_MAX; i++)
                if (L->pool[i].smp && !strcmp(L->pool[i].path, path)) L->pool[i].path[0] = '\0';
        }
    } else {
        snprintf(r.name, sizeof r.name, "%s", q->path);
    }
    if (!err) {
        snprintf(path, sizeof path, "%s/%s", q->dir, r.name);
        r.smp = au_pool_get(L, path, &err);
        if (r.smp && !r.smp->name[0]) snprintf(r.smp->name, sizeof r.smp->name, "%s", r.name);
        if (r.smp) {
            double bpm = inst->tracks[q->track].pfx.cached_bpm;
            r.bpm10 = (uint16_t)au_guess_bpm10(r.smp, r.name, bpm > 0 ? bpm : 120.0);
        }
    }
    r.err = (uint8_t)err;
    au_ld_key = -1;
    au_res_push(inst, &r);
}

static void *au_loader_main(void *arg) {
    au_loader_t *L = (au_loader_t *)arg;
    seq8_instance_t *inst = L->inst;
    {
        /* Off the realtime class it inherits from the audio thread, so the
         * audio thread (FIFO) always preempts it. (No core pinning: the CPU_* macros need
         * _GNU_SOURCE, which this translation unit does not define.) */
        au_thread_unrealtime();
    }
    while (L->run) {
        uint32_t t = inst->au_req_tail, h = __atomic_load_n(&inst->au_req_head, __ATOMIC_ACQUIRE);
        if (t == h) { usleep(4000); continue; }
        au_req_t q = inst->au_req[t & (AU_RING - 1)];
        __atomic_store_n(&inst->au_req_tail, t + 1, __ATOMIC_RELEASE);
        au_loader_do(L, &q);
    }
    return NULL;
}

/* A clip's audio as a new clip has it: no sample, Loop, Even 16 over a hand
 * set of one slice (Josh, 2026-10-28: "even 16."), the whole sample. Keeps
 * nothing (the caller bumps gen). `jump` keeps its old default only so a
 * default clip still reads as one in the file. */
static void au_clip_defaults(au_clip_t *cl) {
    memset(cl, 0, sizeof *cl);
    cl->mode = AU_MODE_LOOP;
    cl->even = 16;
    cl->nslices = 1;
    cl->jump = 16;
    cl->sens = AU_SENS_DEFAULT;
}

static void au_init(seq8_instance_t *inst) {
    int t, c;
    au_loader_t *L = (au_loader_t *)calloc(1, sizeof *L);
    au_abort = 0;
    for (t = 0; t < NUM_TRACKS; t++) {
        for (c = 0; c < NUM_CLIPS; c++) au_clip_defaults(&inst->au_clip[t][c]);
        memset(&inst->au_trk[t], 0, sizeof inst->au_trk[t]);
        inst->au_trk[t].last_tick = -1;
        inst->au_trk[t].mgain = 64;
    }
    inst->au_lazy_track = inst->au_lazy_clip = -1;
    au_streamer_init(inst);
    au_warper_init(inst);
    inst->au_loader = L;
    if (!L) return;
    L->inst = inst;
    L->run = 1;
    if (pthread_create(&L->th, NULL, au_loader_main, L) == 0) L->started = 1;
}

static void au_shutdown(seq8_instance_t *inst) {
    au_loader_t *L = (au_loader_t *)inst->au_loader;
    int i;
    if (!L) { au_warper_shutdown(inst); au_streamer_shutdown(inst); return; }
    L->run = 0;
    au_abort = 1;
    if (L->started) pthread_join(L->th, NULL);
    au_warper_shutdown(inst);          /* it reads the streamer's chunks and the pool's samples */
    au_streamer_shutdown(inst);
    for (i = 0; i < AU_POOL_MAX; i++)
        if (L->pool[i].smp) au_sample_free(L->pool[i].smp);
    free(L);
    inst->au_loader = NULL;
}

/* The project's samples/ directory: beside its state file. "" = no project. */
static void au_samples_dir(const seq8_instance_t *inst, char *out, size_t sz) {
    const char *sl = strrchr(inst->state_path, '/');
    if (!inst->state_path[0] || !sl) { out[0] = '\0'; return; }
    snprintf(out, sz, "%.*s/samples", (int)(sl - inst->state_path), inst->state_path);
}

/* ---------------- voices (SPI thread) ---------------- */

/* Fade voice v out over `frames`, starting `after` frames into the block. */
static void au_voice_release_at(au_voice_t *v, uint32_t frames, uint32_t after) {
    if (!v->active) return;
    if (v->rel_len && v->rel_wait + v->rel <= after + frames) return;    /* already ending sooner */
    v->rel_len = frames ? frames : 1;
    v->rel = v->rel_len;
    v->rel_wait = after;
}
static void au_voice_release(au_voice_t *v, uint32_t frames) { au_voice_release_at(v, frames, 0); }

/* Stop every voice of track t reading `smp` (NULL = all) at once — the sample
 * is about to go. */
static void au_track_kill(seq8_instance_t *inst, int t, const au_sample_t *smp) {
    int i;
    inst->au_trk[t].w.on = 0;          /* Warp: anchors afresh */
    for (i = 0; i < AU_VOICES; i++) {
        au_voice_t *v = &inst->au_trk[t].v[i];
        if (v->active && (!smp || v->smp == smp)) v->active = 0;
    }
}

static au_voice_t *au_voice_alloc(au_track_t *at) {
    int i, best = 0;
    for (i = 0; i < AU_VOICES; i++) if (!at->v[i].active) return &at->v[i];
    for (i = 1; i < AU_VOICES; i++)
        if (at->v[i].rel_len && (!at->v[best].rel_len || at->v[i].rel < at->v[best].rel)) best = i;
    return &at->v[best];
}

/* Frames of sample s per tick at the clip's own Tempo (Josh, 2026-10-29: a
 * Tempo knob "to set the original tempo"; 120 until it is known). */
static double au_fpt_s(const au_clip_t *cl, const au_sample_t *s) {
    double bpm = cl->bpm10 ? cl->bpm10 / 10.0 : 120.0;
    return (double)s->rate * 60.0 / (bpm * PPQN);
}

/* The sequencer clip an audio clip belongs to (the same [t][c]). */
static const clip_t *au_lclip(const au_clip_t *cl) {
    if (!g_inst) return NULL;
    ptrdiff_t k = cl - &g_inst->au_clip[0][0];
    if (k < 0 || k >= (ptrdiff_t)NUM_TRACKS * NUM_CLIPS) return NULL;
    return &g_inst->tracks[k / NUM_CLIPS].clips[k % NUM_CLIPS];
}

/* What of sample s the clip reads from, in frames: no End anywhere (Josh,
 * 2026-10-29: "having end available in one mode but not the other feels like
 * it's going to be confusing"), Start + Length at the sample's Tempo.
 * Loop: the clip's own loop window laid over the sample from Start — rs is
 * where the window begins (so Loop + steps picks the part under it), and the
 * sample runs on to its end: the clip comes round at its length by itself,
 * and a Nudge earlier reads on into what follows rather than into silence.
 * How much sounds is the clip's length (`reach`). Slice: `slen` ticks from
 * Start (0 = to the end) — the chopped region, a hard end. Past the file
 * there is nothing: re stops there, and a window wholly past it is empty
 * (rs == re). */
static void au_range(const au_clip_t *cl, const au_sample_t *s, uint32_t *rs, uint32_t *re) {
    double fpt = au_fpt_s(cl, s), a = cl->rstart, e;
    if (a + AU_GAP > s->frames) a = s->frames > AU_GAP ? s->frames - AU_GAP : 0;
    if (cl->mode == AU_MODE_SLICE) {
        e = cl->slen ? a + (double)cl->slen * fpt : (double)s->frames;
    } else {
        const clip_t *lc = au_lclip(cl);
        double tps = lc && lc->ticks_per_step ? lc->ticks_per_step : TICKS_PER_STEP;
        a += (lc ? (double)lc->loop_start * tps : 0) * fpt;
        e = (double)s->frames;
    }
    if (a > (double)s->frames) a = (double)s->frames;
    if (e > (double)s->frames) e = (double)s->frames;
    if (e < a) e = a;
    *rs = (uint32_t)(a + 0.5);
    *re = (uint32_t)(e + 0.5);
}

/* Start..End in ticks at the sample's Tempo (Vintage, Pitch, Warp, >Seq):
 * every one of them maps frames to ticks through this, so they agree. */
static double au_span_ticks(const au_clip_t *cl, const au_sample_t *s, uint32_t rs, uint32_t re) {
    if (!s || !s->frames || re <= rs) return 0;
    return (double)(re - rs) / au_fpt_s(cl, s);
}

static void au_trans_calc(au_clip_t *cl);

/* Transient's chops (Josh, 2026-10-28: "keep the first 128. and only make
 * them within the current sample start end points"): Start, then every hit
 * kept at the clip's Sens inside Start..End, the first AU_MAX_SLICES. On the
 * SPI thread, from the handlers and a sample landing; render reads tr_at. */
static void au_trans_calc(au_clip_t *cl) {
    const au_sample_t *s = cl->smp;
    uint32_t rs, re, k;
    int rmin, dmin, n = 1;
    if (!cl->trans || !s) return;
    au_range(cl, s, &rs, &re);
    au_sens_min(cl->sens, &rmin, &dmin);
    cl->tr_at[0] = rs;
    for (k = au_hit_from(s, rs + 1); k < s->nhits && s->hits[k] < re && n < AU_MAX_SLICES; k++)
        if (au_hit_kept(s, k, rmin, dmin)) cl->tr_at[n++] = s->hits[k];
    cl->tr_n = (uint8_t)n;
}

/* Transient's chops, worked out if a change marked them due: the knob
 * handlers mark (each detent would walk every candidate), and this runs once
 * a block (au_render), before a read (au_get_param) and before a chop plays. */
static void au_trans_settle(au_clip_t *cl) {
    if (!cl->tr_due) return;
    cl->tr_due = 0;
    au_trans_calc(cl);
}

/* The info read's Transient count, recounted only when what it counts changed. */
static uint32_t au_hit_count_cached(au_clip_t *cl, uint32_t rs, uint32_t re) {
    const au_sample_t *s = cl->smp;
    if (!s) return 0;
    if (cl->hc_smp != (const void *)s || cl->hc_gen != cl->gen || cl->hc_rs != rs || cl->hc_re != re ||
        cl->hc_sens != (int16_t)cl->sens) {
        cl->hc_n = au_hit_count(s, rs, re, cl->sens);
        cl->hc_smp = s; cl->hc_gen = cl->gen; cl->hc_rs = rs; cl->hc_re = re; cl->hc_sens = (int16_t)cl->sens;
    }
    return cl->hc_n;
}

/* How many slices the clip plays: Transient's or Even's, else the hand set's. */
static int au_count(const au_clip_t *cl) {
    if (cl->trans) return cl->tr_n ? cl->tr_n : 1;
    if (cl->even) return cl->even;
    return cl->nslices ? cl->nslices : 1;
}

/* Hand-set slice k's end at HOME: the next slice's start, the clip's End for
 * the last (the sample's end when the slice starts past End). */
static uint32_t au_home_end(const au_clip_t *cl, const au_sample_t *s, int k) {
    uint32_t rs, re;
    if (k + 1 < cl->nslices) return cl->sl[k + 1].start;
    au_range(cl, s, &rs, &re);
    return re > cl->sl[k].start ? re : s->frames;
}

/* The frame range of slice k of clip cl. */
static int au_slice_range(const au_clip_t *cl, const au_sample_t *s, int k, uint32_t *a, uint32_t *b) {
    uint32_t rs, re;
    int n = au_count(cl);
    if (k < 0 || k >= n) return 0;
    if (cl->trans) {
        if (k >= cl->tr_n) return 0;
        au_range(cl, s, &rs, &re);
        *a = cl->tr_at[k];
        *b = k + 1 < cl->tr_n ? cl->tr_at[k + 1] : re;
        if (*b <= *a) return 0;
    } else if (cl->even) {
        au_range(cl, s, &rs, &re);
        if (re <= rs) return 0;
        *a = rs + (uint32_t)((uint64_t)(re - rs) * k / n);
        *b = rs + (uint32_t)((uint64_t)(re - rs) * (k + 1) / n);
    } else {
        *a = cl->sl[k].start;
        *b = cl->sl[k].end ? cl->sl[k].end : au_home_end(cl, s, k);
        if (*a >= s->frames) return 0;
        if (*b > s->frames) *b = s->frames;
        if (*b <= *a) return 0;
    }
    return 1;
}

/* Chop `slice` of clip (t,c) starts `off` frames into the block: a Slice
 * clip's note. (sync: a chop played as a Loop's would be — to its end, the
 * clip's Revrs, past Slice mode's cap; Vintage itself goes straight to
 * au_range_on with its own pieces, never the chops.) */
static au_voice_t *au_range_on(seq8_instance_t *inst, int t, int c, int slice, uint32_t a, uint32_t b,
                               float vgain, uint32_t off, int sync);
static void au_chop_on(seq8_instance_t *inst, int t, int c, int slice, float vgain, uint32_t off, int sync) {
    au_clip_t *cl = &inst->au_clip[t][c];
    au_trans_settle(cl);
    const au_sample_t *s = cl->smp;
    uint32_t a, b;
    if (!s || (!sync && cl->mode != AU_MODE_SLICE)) return;
    if (!sync && (uint64_t)s->frames > (uint64_t)s->rate * AU_SLICE_MAX_SEC) return;
    if (!au_slice_range(cl, s, slice, &a, &b)) return;
    au_range_on(inst, t, c, slice, a, b, vgain, off, sync);
}

/* Frames a..b of clip (t,c)'s sample as chop `slice` (AU_SLICE_NONE: Loop
 * mode's hidden chop at Start), `off` frames into the block. */
/* Returns the voice it started or carried on (NULL: none). */
static au_voice_t *au_range_on(seq8_instance_t *inst, int t, int c, int slice, uint32_t a, uint32_t b,
                               float vgain, uint32_t off, int sync) {
    au_clip_t *cl = &inst->au_clip[t][c];
    const au_sample_t *s = cl->smp;
    au_track_t *at = &inst->au_trk[t];
    int i;
    if (!s || b <= a) return NULL;
    /* A Loop clip's Vintage pieces (sync) play as recorded: the clip's pitch,
     * gain and Revrs, never a chop's own sound — no envelope, pitch, gain,
     * reverse or play mode (Josh, 2026-10-28: "the whole point of loop is
     * that it just plays back as recorded, so attack/decay shouldn't play
     * into it"). Those belong to Slice. */
    static const au_slice_t plain;
    const au_slice_t *sl = (sync || slice < 0 || slice >= AU_MAX_SLICES) ? &plain : &cl->sl[slice];
    uint8_t play = sl->play, rev = sync ? cl->revrs : sl->rev;
    /* the Conductor: a chop takes it as it starts; a Vintage piece takes the
     * loop's, held till the wrap on Next */
    int cs = sync ? (int)at->cond : au_cond_now(inst, t);
    double ratio = au_tune(cl->pitch + sl->pitch + cs, cl->detune + sl->detune) * (double)s->rate / 44100.0;
    float gain = au_db(cl->gain_db + sl->gain_db) * vgain;
    au_voice_t *v;
    /* A slice that carries straight on from the one sounding — the next chop
     * of the sample, reached where that voice has got to, at the same rate,
     * direction and level, with no envelope of its own — is that voice
     * playing on: no cut, no fade. So the chops laid on the steps in order
     * play the sample exactly as the Loop does (Josh, 2026-10-28: a Loop clip
     * switched to Slice must not change the sound). AU_JOIN covers a slice
     * starting on its block rather than its frame. */
    if (play == AU_PLAY_ONE && !sl->attack_ms && !sl->decay_ms) {
        for (i = 0; i < AU_VOICES; i++) {
            v = &at->v[i];
            /* (a Vintage piece past its fade-in carries on like any) */
            if (!v->active || v->mode_loop || v->rel_len || v->gated || (v->atk && !(sync && v->age >= v->atk)) || v->dec || v->wait ||
                v->smp != s || v->gain != gain || v->step != (rev ? -ratio : ratio)) continue;
            double edge = rev ? (double)b - 1.0 : (double)a, at_off = v->pos + v->step * off;
            if (at_off - edge > AU_JOIN || edge - at_off > AU_JOIN) continue;
            if (rev) { if (a < v->lo) v->lo = a; }
            else if (b > v->hi) v->hi = b;
            v->slice = (uint8_t)slice;
            v->loop = 0;
            return v;
        }
    }
    /* Always monophonic: the slice sounding now is cut (a short fade, no click). */
    int cut = 0;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop && !at->v[i].rel_len) {
            au_voice_release_at(&at->v[i], sync ? AU_VINTAGE_XF : 64, off);   /* Vintage: the crossfade's fade-out */
            cut = 1;
        }
    v = au_voice_alloc(at);
    memset(v, 0, sizeof *v);
    v->wait = off;
    v->smp = s;
    v->lo = a; v->hi = b;
    v->step = rev ? -ratio : ratio;
    v->pos = rev ? (double)b - 1.0 : (double)a;
    v->gain = gain;
    /* Vintage: the crossfade's fade-in — only over a piece it cut; from
     * silence (the downbeat at Play) it starts at once, its attack whole */
    v->atk = sync ? (cut ? AU_VINTAGE_XF : 0) : (uint32_t)sl->attack_ms * 441 / 10;
    v->dec = (uint32_t)sl->decay_ms * 441 / 10;
    v->loop = (play == AU_PLAY_LOOP);
    v->gated = (play != AU_PLAY_ONE);
    v->slice = (uint8_t)slice;
    v->cond = (int8_t)cs;
    v->starve = 64;
    /* a Vintage piece is a moment of a loop that plays on through Start..End:
     * the streamer must read ahead through all of it, not to the piece's end
     * (a device-free test found Vintage on a streamed file starving) */
    if (sync) { uint32_t rs, re; au_range(cl, s, &rs, &re); v->wlo = rs; v->whi = re; }
    v->active = 1;
    return v;
}

static void au_slice_on(seq8_instance_t *inst, int t, int slice, float vgain) {
    au_chop_on(inst, t, inst->tracks[t].active_clip, slice, vgain, inst->au_tick_off, 0);
}

static void au_slice_off(seq8_instance_t *inst, int t, int slice) {
    au_track_t *at = &inst->au_trk[t];
    int i;
    for (i = 0; i < AU_VOICES; i++) {
        au_voice_t *v = &at->v[i];
        if (v->active && !v->mode_loop && v->gated && v->slice == slice && !v->rel_len)
            au_voice_release_at(v, 220, inst->au_tick_off);   /* 5 ms, from its tick's frame */
    }
}

/* A note on an Audio track (pfx_emit's divert): its pitch is the slice. A
 * played or sequenced slice ignores velocity; a DELAY echo's velocity is its
 * volume, so LEVEL / VELFB fade the echoes (Josh, 2026-10-27, Q1: "yes"). */
static void au_note_event(int t, int slice, uint8_t status, uint8_t vel, int echo) {
    seq8_instance_t *inst = g_inst;
    if (!inst || t < 0 || t >= NUM_TRACKS || slice < 0 || slice >= AU_MAX_SLICES) return;
    if ((status & 0xF0) == 0x90 && vel) au_slice_on(inst, t, slice, echo ? (float)vel / 127.0f : 1.0f);
    else if ((status & 0xF0) == 0x80 || (status & 0xF0) == 0x90) au_slice_off(inst, t, slice);
}

/* Audio, recording: step sidx of cl is emptied for the slice about to land
 * on it (a step holds one slice). */
static void au_step_take(clip_t *cl, uint16_t sidx, uint32_t tps) {
    int i, took = 0;
    if (sidx >= SEQ_STEPS) return;
    for (i = 0; i < cl->note_count; i++)
        if (cl->notes[i].active && note_step(cl->notes[i].tick, cl->length, tps) == sidx) {
            cl->notes[i].active = 0;
            cl->occ_dirty = 1;
            took = 1;
        }
    /* clip_insert_note appends: reclaim the slot, or overdubbing a short loop
     * fills the clip and recording stops. */
    if (took) clip_compact_notes(cl);
    cl->step_note_count[sidx] = 0;
    cl->steps[sidx] = 0;
}

/* Loop mode: start (or restart) the clip's loop voice `off` sample frames into
 * Start..End. */
/* `rate`: sample frames per output frame, 0 = the clip's own (pitch and the
 * sample's rate); Tempo Pitch passes the one that fills the clip. */
static void au_loop_start(seq8_instance_t *inst, int t, int c, double off, double rate) {
    au_clip_t *cl = &inst->au_clip[t][c];
    const au_sample_t *s = cl->smp;
    au_track_t *at = &inst->au_trk[t];
    int i;
    uint32_t rs, re;
    if (!s) return;
    au_range(cl, s, &rs, &re);
    if (re <= rs + 32) return;
    if (off >= (double)(re - rs)) return;          /* past the sample's end: silence till the wrap */
    for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) au_voice_release(&at->v[i], 64);
    au_voice_t *v = au_voice_alloc(at);
    memset(v, 0, sizeof *v);
    v->smp = s;
    v->lo = rs; v->hi = re;
    v->step = rate > 0 ? rate : au_tune(cl->pitch + at->cond, cl->detune) * (double)s->rate / 44100.0;
    v->cond = rate > 0 ? 0 : at->cond;             /* Tempo Pitch: the tempo sets the speed, the Conductor gives way */
    if (off < 0) {                                 /* Nudge later: silence first */
        v->wait = (uint32_t)(-off / v->step + 0.5);
        off = 0;
    }
    if (cl->revrs) { v->pos = (double)re - 1.0 - off; v->step = -v->step; }
    else v->pos = (double)rs + off;
    if (v->pos >= re || v->pos < rs) return;       /* past the sample's end: silence till the wrap */
    v->gain = au_db(cl->gain_db);
    v->mode_loop = 1;
    v->starve = 64;
    v->active = 1;
    at->loop_clip = (uint8_t)c;
}

static au_voice_t *au_loop_voice(au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}

/* Render one voice, adding into acc (stereo int32). Ends it when done.
 * Returns the frames it found no chunk for (a streamed sample). */
static uint32_t au_voice_render(au_voice_t *v, int32_t *acc, int frames) {
    const au_sample_t *s = v->smp;
    uint32_t missed = 0;
    int f;
    if (!s) { v->active = 0; return 0; }
    for (f = 0; f < frames; f++) {
        if (v->wait) { v->wait--; continue; }
        if (v->pos < v->lo || v->pos >= v->hi) {
            if (v->loop) {
                double span = v->hi - v->lo;
                if (span < 1) { v->active = 0; return missed; }
                while (v->pos >= v->hi) v->pos -= span;
                while (v->pos < v->lo) v->pos += span;
            } else if (!v->tail) {
                /* The end: a short tail back the way it came, fading out, so
                 * the cut does not click (Josh, 2026-10-28: "a very short fade
                 * out on slice end so it doesn't click? (maybe even a really
                 * short added tail loop with a really short fade out that does
                 * a ping pong reverse")). Mirrored at the edge, so the wave
                 * carries straight on. */
                v->pos = v->pos >= v->hi ? 2.0 * v->hi - v->pos - 1.0 : 2.0 * v->lo - v->pos;
                v->step = -v->step;
                v->tail = 1;
                au_voice_release(v, AU_TAIL);
                if (v->pos < v->lo || v->pos >= v->hi) { v->active = 0; return missed; }
            } else { v->active = 0; return missed; }
        }
        float e = 1.0f;
        if (v->atk && v->age < v->atk) e = (float)v->age / (float)v->atk;
        if (v->dec) {
            uint32_t d = v->age > v->atk ? v->age - v->atk : 0;
            if (d >= v->dec) { v->active = 0; return missed; }
            e *= 1.0f - (float)d / (float)v->dec;
        }
        if (v->rel_len) {
            if (v->rel_wait) v->rel_wait--;
            else {
                if (v->rel == 0) { v->active = 0; return missed; }
                e *= (float)v->rel / (float)v->rel_len;
                v->rel--;
            }
        }
        uint32_t i0 = (uint32_t)v->pos;
        float fr = (float)(v->pos - (double)i0);
        uint32_t i1 = i0 + 1 < s->frames ? i0 + 1 : i0;
        const int16_t *a = au_at(s, i0), *b = au_at(s, i1);
        float l = 0.0f, r = 0.0f;
        if (!s->pcm) {
            /* Streamed: fade out over the 64 frames before a chunk that is
             * not in, back in once it is (the position keeps moving). */
            double ahead = v->pos + v->step * 64.0;
            int ok = a && b && (ahead < v->lo || ahead >= v->hi || au_at(s, (uint32_t)ahead));
            if (ok) { if (v->starve < 64) v->starve++; }
            else if (v->starve) v->starve--;
            e *= (float)v->starve / 64.0f;
        }
        if (a && b) {
            if (s->ch == 2) {
                l = a[0] + (b[0] - a[0]) * fr;
                r = a[1] + (b[1] - a[1]) * fr;
            } else {
                l = r = a[0] + (b[0] - a[0]) * fr;
            }
        } else missed++;
        float g = v->gain * e;
        acc[f * 2]     += (int32_t)(l * g);
        acc[f * 2 + 1] += (int32_t)(r * g);
        v->pos += v->step;
        v->age++;
    }
    return missed;
}

/* ---------------- Lazy chop ---------------- */

/* Lazy chop (Josh, 2026-10-27: "always starts with just one pad lit and
 * always re-chops the whole sample (ask for commit before leaving after
 * chopping so nothing existing is overwritten). tapping the first pad starts
 * the sample playing, touchign the next pad inserts a slice marker at the
 * playback head. chopping stops after user has either pressed back button or
 * the sample has played through entirely.")
 *   au_lazy_begin  the hand set is put aside; ARMED (nothing plays)
 *   first tap      one slice at Start, the sample plays Start..End; RUN
 *   each tap       a marker at the playhead
 *   end / Back     ENDED: the UI asks to keep them (au_lazy_keep); Back while
 *                  ARMED puts the old hand set straight back */

/* The old hand set back (or not: keep), and the chop is over. */
static void au_lazy_keep(seq8_instance_t *inst, int keep) {
    int t = inst->au_lazy_track, c = inst->au_lazy_clip;
    if (t < 0 || c < 0) return;
    au_clip_t *cl = &inst->au_clip[t][c];
    au_track_kill(inst, t, NULL);
    if (!keep) {
        memcpy(cl->sl, inst->au_lazy_bak, sizeof cl->sl);
        cl->nslices = inst->au_lazy_bak_n;
        cl->even = inst->au_lazy_bak_even;
    }
    inst->state_dirty = 1;
    inst->au_lazy_track = inst->au_lazy_clip = -1;
    inst->au_lazy_state = AU_LAZY_NONE;
    inst->au_lazy_n = 0;
}

/* The chop stops (played out, or Back): ENDED, waiting for keep — or, never
 * started, straight back to how it was. */
static void au_lazy_finish(seq8_instance_t *inst) {
    int t = inst->au_lazy_track;
    if (t < 0) return;
    if (inst->au_lazy_state != AU_LAZY_RUN) {
        if (inst->au_lazy_state == AU_LAZY_ARMED) au_lazy_keep(inst, 0);
        return;
    }
    au_track_kill(inst, t, NULL);
    inst->au_lazy_state = AU_LAZY_ENDED;
}

/* ---------------- state (SPI thread: state_load / the save serializer) ----------------
 *
 * Sparse: a clip with a sample or non-default settings `t%dc%d_au3` = "mode
 * even nslices jump rstart slen pitch gain revrs nudge jmpq detune sync bpm10
 * sens rot|name" (rstart in frames, slen in ticks; bpm10 0 = guess again when the
 * sample loads; the track is Audio by its `t%d_pm`); a slice that differs from
 * the default `t%dc%ds%d_au2` = "start end pitch gain rev play attack decay
 * detune". The name is the file inside samples/, JSON-escaped.
 * Audio tracks are unreleased: an older `_au2` / `_au` clip (Bars and End) is
 * not read (Josh, 2026-10-28: "preserving backward compatibility with pre
 * release projects/clips/etc is unecessary"). */

static int au_slice_default(const au_slice_t *sl) {
    return !sl->start && !sl->end && !sl->pitch && !sl->gain_db &&
           !sl->rev && !sl->play && !sl->attack_ms && !sl->decay_ms && !sl->detune;
}

static int au_clip_default(const au_clip_t *cl) {
    int l;
    if (cl->name[0] || cl->mode != AU_MODE_LOOP || cl->even != 16 || cl->nslices != 1 || cl->jump != 16 ||
        cl->rstart || cl->slen || cl->pitch || cl->detune || cl->gain_db || cl->revrs || cl->nudge_ms ||
        cl->jmpq || cl->sync || cl->bpm10 || cl->sens != AU_SENS_DEFAULT || cl->rot) return 0;
    for (l = 0; l < AU_MAX_SLICES; l++) if (!au_slice_default(&cl->sl[l])) return 0;
    return 1;
}

static void au_save_state(void *vinst, FILE *fp) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    int t, c, l;
    for (t = 0; t < NUM_TRACKS; t++) {
        if (inst->tracks[t].pad_mode == PAD_MODE_AUDIO && inst->au_trk[t].layout)
            fprintf(fp, ",\"t%d_aul\":%d", t, (int)inst->au_trk[t].layout);
        for (c = 0; c < NUM_CLIPS; c++) {
            const au_clip_t *cl = &inst->au_clip[t][c];
            const char *q;
            if (au_clip_default(cl)) continue;
            fprintf(fp, ",\"t%dc%d_au3\":\"%d %d %d %d %u %u %d %d %d %d %d %d %d %d %d %u|", t, c, cl->mode, cl->even,
                    cl->nslices, cl->jump, (unsigned)cl->rstart, (unsigned)cl->slen, cl->pitch, cl->gain_db,
                    cl->revrs, cl->nudge_ms, cl->jmpq, cl->detune, cl->sync, cl->bpm10,
                    cl->sens, (unsigned)cl->rot);
            for (q = cl->name; *q; q++) {
                if (*q == '"' || *q == '\\') fputc('\\', fp);
                if ((unsigned char)*q >= 0x20) fputc(*q, fp);
            }
            fputc('"', fp);
            for (l = 0; l < AU_MAX_SLICES; l++) {
                const au_slice_t *sl = &cl->sl[l];
                if (au_slice_default(sl)) continue;
                fprintf(fp, ",\"t%dc%ds%d_au2\":\"%u %u %d %d %d %d %d %d %d\"", t, c, l,
                        (unsigned)sl->start, (unsigned)sl->end, sl->pitch, sl->gain_db,
                        sl->rev, sl->play, sl->attack_ms, sl->decay_ms, sl->detune);
            }
        }
    }
}

/* Track t lets its samples go: every clip back to its defaults, no voice
 * left (the files stay in the project until a Purge). */
static void au_track_release(seq8_instance_t *inst, int t) {
    int c;
    au_track_kill(inst, t, NULL);
    inst->au_trk[t].last_tick = -1;
    inst->au_trk[t].layout = 0;
    if (inst->au_lazy_track == t) { inst->au_lazy_track = inst->au_lazy_clip = -1; inst->au_lazy_state = AU_LAZY_NONE; }
    for (c = 0; c < NUM_CLIPS; c++) {
        au_clip_t *cl = &inst->au_clip[t][c];
        uint32_t gen = cl->gen;
        au_drop(inst, cl->smp);
        au_clip_defaults(cl);
        cl->gen = gen + 1;                         /* a load still in flight lands nowhere */
    }
}

/* Every sample goes; every clip back to its defaults; no voice left. */
static void au_reset_all(void *vinst) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    int t;
    for (t = 0; t < NUM_TRACKS; t++) au_track_release(inst, t);
    inst->au_lazy_track = inst->au_lazy_clip = -1;
    inst->au_lazy_state = AU_LAZY_NONE;
}

/* Ask the loader for clip (t,c)'s sample by its name in samples/. */
static void au_request_load(seq8_instance_t *inst, int t, int c) {
    au_clip_t *cl = &inst->au_clip[t][c];
    au_req_t r;
    if (!cl->name[0]) return;
    memset(&r, 0, sizeof r);
    r.kind = AU_REQ_LOAD;
    r.track = (uint8_t)t; r.clip = (uint8_t)c;
    r.gen = ++cl->gen;
    snprintf(r.path, sizeof r.path, "%s", cl->name);
    au_samples_dir(inst, r.dir, sizeof r.dir);
    if (!r.dir[0]) return;
    cl->state = 1;
    au_req_push(inst, &r);
}

/* Up to `max` space-separated numbers of a state value, stopping at '|' or
 * the closing quote; *pp is left there. Returns how many. */
static int au_read_nums(const char **pp, long *v, int max) {
    const char *p = *pp;
    int k = 0;
    while (k < max && *p && *p != '|' && *p != '"') {
        while (*p == ' ') p++;
        v[k++] = strtol(p, NULL, 10);
        while (*p && *p != ' ' && *p != '|' && *p != '"') p++;
    }
    *pp = p;
    return k;
}

static void au_load_state(void *vinst, const char *buf) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    char key[40];
    int t, c, l;
    for (t = 0; t < NUM_TRACKS; t++) {
        if (inst->tracks[t].pad_mode != PAD_MODE_AUDIO) continue;
        snprintf(key, sizeof key, "t%d_aul", t);
        inst->au_trk[t].layout = (uint8_t)(json_get_int(buf, key, 0) ? 1 : 0);
        for (c = 0; c < NUM_CLIPS; c++) {
            au_clip_t *cl = &inst->au_clip[t][c];
            const char *p;
            long v[16] = { 0, 16, 1, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, AU_SENS_DEFAULT, 0 };
            snprintf(key, sizeof key, "t%dc%d_au3", t, c);
            if (!json_str_value(buf, key, &p)) continue;
            au_read_nums(&p, v, 16);                 /* a line saved before Shift has 15: rot stays 0 */
            cl->mode = (uint8_t)clamp_i((int)v[0], 0, 1);
            cl->even = (uint8_t)(v[1] < 2 ? 0 : clamp_i((int)v[1], 2, AU_MAX_SLICES));
            cl->nslices = (uint8_t)clamp_i((int)v[2], 1, AU_MAX_SLICES);
            cl->rstart = (uint32_t)(v[4] < 0 ? 0 : v[4]);
            cl->slen = (uint32_t)(v[5] < 0 ? 0 : v[5]);
            cl->jump = (uint8_t)clamp_i((int)v[3], 2, 32);
            cl->pitch = (int8_t)clamp_i((int)v[6], -24, 24);
            cl->gain_db = (int8_t)clamp_i((int)v[7], -40, 12);
            cl->revrs = (uint8_t)(v[8] ? 1 : 0);
            cl->nudge_ms = (int16_t)clamp_i((int)v[9], -500, 500);
            cl->jmpq = (uint8_t)clamp_i((int)v[10], 0, 3);
            cl->detune = (int8_t)clamp_i((int)v[11], -50, 50);
            cl->sync = (uint8_t)clamp_i((int)v[12], 0, AU_SYNC_MAX);
            cl->bpm10 = (uint16_t)(v[13] ? clamp_i((int)v[13], AU_BPM10_MIN, AU_BPM10_MAX) : 0);
            cl->sens = (uint8_t)clamp_i((int)v[14], 0, 100);
            cl->rot = (uint32_t)(v[15] < 0 ? 0 : v[15]);
            if (*p == '|') {
                size_t n = 0;
                for (p++; *p && *p != '"' && n + 1 < sizeof cl->name; p++) {
                    if (*p == '\\' && p[1]) p++;
                    cl->name[n++] = *p;
                }
                cl->name[n] = '\0';
            }
            for (l = 0; l < AU_MAX_SLICES; l++) {
                au_slice_t *sl = &cl->sl[l];
                long w[10] = { 0 };
                snprintf(key, sizeof key, "t%dc%ds%d_au2", t, c, l);
                if (!json_str_value(buf, key, &p)) continue;
                au_read_nums(&p, w, 9);
                sl->start = (uint32_t)(w[0] < 0 ? 0 : w[0]);
                sl->end = (uint32_t)(w[1] < 0 ? 0 : w[1]);
                sl->pitch = (int8_t)clamp_i((int)w[2], -24, 24);
                sl->gain_db = (int8_t)clamp_i((int)w[3], -40, 12);
                sl->rev = (uint8_t)(w[4] ? 1 : 0);
                sl->play = (uint8_t)clamp_i((int)w[5], 0, 2);
                sl->attack_ms = (uint16_t)clamp_i((int)w[6], 0, 2000);
                sl->decay_ms = (uint16_t)clamp_i((int)w[7], 0, 5000);
                sl->detune = (int8_t)clamp_i((int)w[8], -50, 50);
            }
            /* hand-set starts must rise; a bad file keeps what rises */
            for (l = 1; l < cl->nslices; l++)
                if (cl->sl[l].start < cl->sl[l - 1].start + AU_GAP) { cl->nslices = (uint8_t)l; break; }
            au_request_load(inst, t, c);
        }
    }
}

/* ---------------- clip copy / cut / clear (SPI thread) ---------------- */

/* Clip (t,c) back to a fresh Audio clip: its sample let go (the file stays
 * in the project until a Purge). */
static void au_clip_reset(seq8_instance_t *inst, int t, int c) {
    au_clip_t *cl = &inst->au_clip[t][c];
    uint32_t gen = cl->gen;
    if (cl->smp) au_track_kill(inst, t, cl->smp);
    au_drop(inst, cl->smp);
    au_clip_defaults(cl);
    cl->gen = gen + 1;
}

/* A clip copied (or moved: `move`) carries its sample and its settings (v1
 * default, Josh 2026-10-27: "all sounds good"). The destination loads the
 * same file from the project — the loader's pool keeps it in memory once. */
static void au_copy_clip(seq8_instance_t *inst, int st, int sc, int dt, int dc, int move) {
    au_clip_t tmp;
    uint32_t gen;
    if (st == dt && sc == dc) return;
    tmp = inst->au_clip[st][sc];
    au_clip_reset(inst, dt, dc);
    gen = inst->au_clip[dt][dc].gen;
    tmp.smp = NULL;
    tmp.state = 0;
    tmp.err = 0;
    tmp.gen = gen;
    inst->au_clip[dt][dc] = tmp;
    if (tmp.name[0]) au_request_load(inst, dt, dc);
    if (move) au_clip_reset(inst, st, sc);
    inst->state_dirty = 1;
}
