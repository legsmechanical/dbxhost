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
 * Included into seq8.c's single translation unit after seq8_drum.c. The keys
 * and everything that needs the clip primitives live in
 * setparam/sp_track_audio.c. */

#include <pthread.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>

#define AU_POOL_MAX 256

typedef struct {
    char         path[256];
    au_sample_t *smp;
} au_pool_ent_t;

typedef struct {
    pthread_t      th;
    volatile int   run;
    int            started;
    seq8_instance_t *inst;
    au_pool_ent_t  pool[AU_POOL_MAX];
} au_loader_t;

/* ---------------- rings (SPSC, power-of-two size) ---------------- */

static int au_req_push(seq8_instance_t *inst, const au_req_t *r) {
    uint32_t h = inst->au_req_head, t = __atomic_load_n(&inst->au_req_tail, __ATOMIC_ACQUIRE);
    if (h - t >= AU_RING) { inst->au_req_dropped++; return 0; }
    inst->au_req[h & (AU_RING - 1)] = *r;
    __atomic_store_n(&inst->au_req_head, h + 1, __ATOMIC_RELEASE);
    return 1;
}

static void au_drop(seq8_instance_t *inst, au_sample_t *smp) {
    au_req_t r;
    if (!smp) return;
    memset(&r, 0, sizeof r);
    r.kind = AU_REQ_DROP;
    r.smp = smp;
    au_req_push(inst, &r);
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

static void au_make_peaks(au_sample_t *s) {
    int c;
    for (c = 0; c < AU_PEAKS; c++) {
        uint32_t a = (uint32_t)((uint64_t)s->frames * c / AU_PEAKS);
        uint32_t b = (uint32_t)((uint64_t)s->frames * (c + 1) / AU_PEAKS);
        int lo = 0, hi = 0;
        uint32_t i, st = (b - a) > 2048 ? (b - a) / 2048 : 1;   /* enough points, bounded work */
        for (i = a; i < b; i += st) {
            int v = s->pcm[(size_t)i * s->ch];
            if (s->ch > 1) v = (v + s->pcm[(size_t)i * s->ch + 1]) / 2;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        s->peaks[c][0] = (int8_t)(lo / 256);
        s->peaks[c][1] = (int8_t)(hi / 256);
    }
}

/* Read a WAV / AIFF into memory as int16 (1 or 2 channels; more are folded to
 * the first two). The sample can be no longer than AU_LOOP_MAX_SEC. */
static au_sample_t *au_read_file(const char *path, int *err) {
    FILE *f = fopen(path, "rb");
    au_fmt_t fm;
    au_sample_t *s = NULL;
    uint8_t *buf = NULL;
    *err = AU_ERR_OPEN;
    if (!f) return NULL;
    *err = au_probe(f, &fm);
    if (*err) goto out;
    if ((uint64_t)fm.frames > (uint64_t)fm.rate * AU_LOOP_MAX_SEC) { *err = AU_ERR_LONG; goto out; }
    s = (au_sample_t *)calloc(1, sizeof *s);
    if (!s) { *err = AU_ERR_MEM; goto out; }
    s->ch = (uint8_t)(fm.ch >= 2 ? 2 : 1);
    s->rate = fm.rate;
    s->frames = fm.frames;
    s->pcm = (int16_t *)malloc((size_t)fm.frames * s->ch * sizeof(int16_t));
    if (!s->pcm) { free(s); s = NULL; *err = AU_ERR_MEM; goto out; }
    {
        const uint32_t fb = (uint32_t)fm.ch * (fm.bits / 8), bs = fm.bits / 8;
        const uint32_t chunk = 4096;
        uint32_t done = 0;
        buf = (uint8_t *)malloc((size_t)chunk * fb);
        if (!buf || fseek(f, fm.data_off, SEEK_SET)) { *err = AU_ERR_MEM; goto fail; }
        while (done < fm.frames) {
            uint32_t want = fm.frames - done < chunk ? fm.frames - done : chunk, i;
            size_t got = fread(buf, fb, want, f);
            if (got == 0) break;
            for (i = 0; i < got; i++) {
                const uint8_t *fr = buf + (size_t)i * fb;
                int16_t *o = s->pcm + (size_t)(done + i) * s->ch;
                o[0] = au_conv(fr, &fm);
                if (s->ch == 2) o[1] = au_conv(fr + bs, &fm);
            }
            done += (uint32_t)got;
        }
        if (done == 0) { *err = AU_ERR_FORMAT; goto fail; }
        s->frames = done;                      /* a short file plays what it has */
    }
    au_make_peaks(s);
    *err = AU_ERR_NONE;
    goto out;
fail:
    free(s->pcm);
    free(s);
    s = NULL;
out:
    free(buf);
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
        while ((r = read(in, buf, sizeof buf)) > 0)
            if (write(out, buf, (size_t)r) != r) { ok = 0; break; }
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

/* Copy `src` into `dir` (the project's samples/) unless it is already there.
 * The same name and size there IS this file (reused); the same name with a
 * different size gets "~2", "~3"... Writes the name it ends up with. */
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
        if (have == sz) return AU_ERR_NONE;            /* already copied */
        if (have < 0) return au_copy_file(src, dst) ? AU_ERR_NONE : AU_ERR_COPY;
    }
    return AU_ERR_COPY;
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
    au_sample_t *s = au_read_file(path, err);
    if (!s) return NULL;
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
        free(s->pcm);
        free(s);
        return;
    }
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
        usleep(2000);
    }
}

static void au_loader_do(au_loader_t *L, const au_req_t *q) {
    seq8_instance_t *inst = L->inst;
    au_res_t r;
    char path[512];
    int err = AU_ERR_NONE;
    if (q->kind == AU_REQ_DROP) { au_pool_release(L, q->smp); return; }
    memset(&r, 0, sizeof r);
    r.track = q->track; r.clip = q->clip; r.gen = q->gen;
    if (q->kind == AU_REQ_PICK) {
        err = au_import(q->path, q->dir, r.name, sizeof r.name);
    } else {
        snprintf(r.name, sizeof r.name, "%s", q->path);
    }
    if (!err) {
        snprintf(path, sizeof path, "%s/%s", q->dir, r.name);
        r.smp = au_pool_get(L, path, &err);
        if (r.smp && !r.smp->name[0]) snprintf(r.smp->name, sizeof r.smp->name, "%s", r.name);
    }
    r.err = (uint8_t)err;
    au_res_push(inst, &r);
}

static void *au_loader_main(void *arg) {
    au_loader_t *L = (au_loader_t *)arg;
    seq8_instance_t *inst = L->inst;
    {
        /* Off the realtime class, whoever created it: the audio thread (FIFO)
         * always preempts it. (No core pinning: the CPU_* macros need
         * _GNU_SOURCE, which this translation unit does not define.) */
        struct sched_param sp;
        memset(&sp, 0, sizeof sp);
        pthread_setschedparam(pthread_self(), SCHED_OTHER, &sp);
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

static void au_init(seq8_instance_t *inst) {
    int t, c;
    au_loader_t *L = (au_loader_t *)calloc(1, sizeof *L);
    for (t = 0; t < NUM_TRACKS; t++) {
        for (c = 0; c < NUM_CLIPS; c++) {
            au_clip_t *cl = &inst->au_clip[t][c];
            int l;
            memset(cl, 0, sizeof *cl);
            cl->mode = AU_MODE_LOOP;
            cl->nslices = 8;
            cl->jump = 16;
            cl->rend = 1000;
            for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].len_pct = 100;
        }
        memset(&inst->au_trk[t], 0, sizeof inst->au_trk[t]);
        inst->au_trk[t].last_tick = -1;
        inst->au_trk[t].held_lane = 0xFF;
    }
    inst->au_lazy_track = inst->au_lazy_clip = -1;
    inst->au_loader = L;
    if (!L) return;
    L->inst = inst;
    L->run = 1;
    if (pthread_create(&L->th, NULL, au_loader_main, L) == 0) L->started = 1;
}

static void au_shutdown(seq8_instance_t *inst) {
    au_loader_t *L = (au_loader_t *)inst->au_loader;
    int i;
    if (!L) return;
    L->run = 0;
    if (L->started) pthread_join(L->th, NULL);
    for (i = 0; i < AU_POOL_MAX; i++)
        if (L->pool[i].smp) { free(L->pool[i].smp->pcm); free(L->pool[i].smp); }
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

static void au_voice_release(au_voice_t *v, uint32_t frames) {
    if (!v->active) return;
    if (v->rel_len && v->rel <= frames) return;    /* already ending sooner */
    v->rel_len = frames ? frames : 1;
    v->rel = v->rel_len;
}

/* Stop every voice of track t reading `smp` (NULL = all) at once — the sample
 * is about to go. */
static void au_track_kill(seq8_instance_t *inst, int t, const au_sample_t *smp) {
    int i;
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

/* The frame range of slice k of clip cl (before the slice's own nudge / len). */
static int au_slice_range(const au_clip_t *cl, const au_sample_t *s, int k, uint32_t *a, uint32_t *b) {
    uint32_t rs = (uint32_t)((uint64_t)s->frames * cl->rstart / 1000);
    uint32_t re = (uint32_t)((uint64_t)s->frames * cl->rend / 1000);
    int n = cl->nslices ? cl->nslices : 1;
    if (re <= rs || k >= n) return 0;
    if (cl->method == AU_METH_EVEN) {
        *a = rs + (uint32_t)((uint64_t)(re - rs) * k / n);
        *b = rs + (uint32_t)((uint64_t)(re - rs) * (k + 1) / n);
    } else {
        *a = cl->sl[k].start;
        *b = (k + 1 < n) ? cl->sl[k + 1].start : re;
        if (*a >= s->frames) return 0;
        if (*b > s->frames) *b = s->frames;
        if (*b <= *a) return 0;
    }
    return 1;
}

static void au_slice_on(seq8_instance_t *inst, int t, int lane) {
    seq8_track_t *tr = &inst->tracks[t];
    au_clip_t *cl = &inst->au_clip[t][tr->active_clip];
    const au_sample_t *s = cl->smp;
    au_track_t *at = &inst->au_trk[t];
    uint32_t a, b;
    int i;
    if (!s || cl->mode != AU_MODE_SLICE) return;
    if ((uint64_t)s->frames > (uint64_t)s->rate * AU_SLICE_MAX_SEC) return;
    if (!au_slice_range(cl, s, lane, &a, &b)) return;
    const au_slice_t *sl = &cl->sl[lane];
    {
        int64_t na = (int64_t)a + (int64_t)sl->nudge_ms * (int64_t)s->rate / 1000;
        if (na < 0) na = 0;
        if (na >= (int64_t)s->frames) return;
        uint32_t len = (b > a ? b - a : 0);
        a = (uint32_t)na;
        len = (uint32_t)((uint64_t)len * (sl->len_pct ? sl->len_pct : 100) / 100);
        if (len < 32) len = 32;
        b = a + len;
        if (b > s->frames) b = s->frames;
    }
    /* Always monophonic: the slice sounding now is cut (a short fade, no click). */
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && !at->v[i].mode_loop) au_voice_release(&at->v[i], 64);
    au_voice_t *v = au_voice_alloc(at);
    double ratio = au_semi(cl->pitch + sl->pitch) * (double)s->rate / 44100.0;
    memset(v, 0, sizeof *v);
    v->smp = s;
    v->lo = a; v->hi = b;
    v->step = sl->rev ? -ratio : ratio;
    v->pos = sl->rev ? (double)b - 1.0 : (double)a;
    v->gain = au_db(cl->gain_db + sl->gain_db);
    v->atk = (uint32_t)sl->attack_ms * 441 / 10;
    v->dec = (uint32_t)sl->decay_ms * 441 / 10;
    v->loop = (sl->play == AU_PLAY_LOOP);
    v->gated = (sl->play != AU_PLAY_ONE);
    v->lane = (uint8_t)lane;
    v->active = 1;
}

static void au_slice_off(seq8_instance_t *inst, int t, int lane) {
    au_track_t *at = &inst->au_trk[t];
    int i;
    for (i = 0; i < AU_VOICES; i++) {
        au_voice_t *v = &at->v[i];
        if (v->active && !v->mode_loop && v->gated && v->lane == lane && !v->rel_len)
            au_voice_release(v, 220);                 /* 5 ms */
    }
}

/* A lane hit on an Audio track (drum_pfx_emit's divert): velocity ignored. */
static void au_lane_event(int t, int lane, uint8_t status, uint8_t vel) {
    seq8_instance_t *inst = g_inst;
    if (!inst || t < 0 || t >= NUM_TRACKS || lane < 0 || lane >= DRUM_LANES) return;
    if ((status & 0xF0) == 0x90 && vel) au_slice_on(inst, t, lane);
    else if ((status & 0xF0) == 0x80 || (status & 0xF0) == 0x90) au_slice_off(inst, t, lane);
}

/* Loop mode: start (or restart) the clip's loop voice `off` sample frames into
 * Start..End. */
static void au_loop_start(seq8_instance_t *inst, int t, int c, double off) {
    au_clip_t *cl = &inst->au_clip[t][c];
    const au_sample_t *s = cl->smp;
    au_track_t *at = &inst->au_trk[t];
    int i;
    if (!s) return;
    uint32_t rs = (uint32_t)((uint64_t)s->frames * cl->rstart / 1000);
    uint32_t re = (uint32_t)((uint64_t)s->frames * cl->rend / 1000);
    if (re <= rs + 32) return;
    for (i = 0; i < AU_VOICES; i++) if (at->v[i].active) au_voice_release(&at->v[i], 64);
    au_voice_t *v = au_voice_alloc(at);
    memset(v, 0, sizeof *v);
    v->smp = s;
    v->lo = rs; v->hi = re;
    v->step = au_semi(cl->pitch) * (double)s->rate / 44100.0;
    v->pos = (double)rs + off;
    if (v->pos >= re) return;                      /* past the sample's end: silence till the wrap */
    v->gain = au_db(cl->gain_db);
    v->mode_loop = 1;
    v->active = 1;
    at->loop_clip = (uint8_t)c;
}

static au_voice_t *au_loop_voice(au_track_t *at) {
    int i;
    for (i = 0; i < AU_VOICES; i++)
        if (at->v[i].active && at->v[i].mode_loop && !at->v[i].rel_len) return &at->v[i];
    return NULL;
}

/* Render one voice, adding into acc (stereo int32). Ends it when done. */
static void au_voice_render(au_voice_t *v, int32_t *acc, int frames) {
    const au_sample_t *s = v->smp;
    int f;
    if (!s) { v->active = 0; return; }
    for (f = 0; f < frames; f++) {
        if (v->pos < v->lo || v->pos >= v->hi) {
            if (v->loop) {
                double span = v->hi - v->lo;
                if (span < 1) { v->active = 0; return; }
                while (v->pos >= v->hi) v->pos -= span;
                while (v->pos < v->lo) v->pos += span;
            } else { v->active = 0; return; }
        }
        float e = 1.0f;
        if (v->atk && v->age < v->atk) e = (float)v->age / (float)v->atk;
        if (v->dec) {
            uint32_t d = v->age > v->atk ? v->age - v->atk : 0;
            if (d >= v->dec) { v->active = 0; return; }
            e *= 1.0f - (float)d / (float)v->dec;
        }
        if (v->rel_len) {
            if (v->rel == 0) { v->active = 0; return; }
            e *= (float)v->rel / (float)v->rel_len;
            v->rel--;
        }
        uint32_t i0 = (uint32_t)v->pos;
        float fr = (float)(v->pos - (double)i0);
        uint32_t i1 = i0 + 1 < s->frames ? i0 + 1 : i0;
        float l, r;
        if (s->ch == 2) {
            l = s->pcm[i0 * 2] + (s->pcm[i1 * 2] - s->pcm[i0 * 2]) * fr;
            r = s->pcm[i0 * 2 + 1] + (s->pcm[i1 * 2 + 1] - s->pcm[i0 * 2 + 1]) * fr;
        } else {
            l = r = s->pcm[i0] + (s->pcm[i1] - s->pcm[i0]) * fr;
        }
        float g = v->gain * e;
        acc[f * 2]     += (int32_t)(l * g);
        acc[f * 2 + 1] += (int32_t)(r * g);
        v->pos += v->step;
        v->age++;
    }
}

/* ---------------- Lazy chop ---------------- */

static void au_lazy_finish(seq8_instance_t *inst) {
    int t = inst->au_lazy_track, c = inst->au_lazy_clip;
    if (t < 0 || c < 0) return;
    au_clip_t *cl = &inst->au_clip[t][c];
    if (inst->au_lazy_n > 0) {
        cl->nslices = inst->au_lazy_n;
        cl->method = AU_METH_LAZY;
        inst->state_dirty = 1;
    }
    au_track_kill(inst, t, NULL);
    inst->au_lazy_track = inst->au_lazy_clip = -1;
}

/* ---------------- state (SPI thread: state_load / the save serializer) ----------------
 *
 * Sparse: a track's flag `t%d_au`; a clip with a sample or non-default
 * settings `t%dc%d_au` = "mode method nslices jump rstart rend pitch gain|name";
 * a slice that differs from the default `t%dc%ds%d_au` = "start nudge len pitch
 * gain rev play attack decay". The name is the file inside samples/,
 * JSON-escaped. */

static int au_slice_default(const au_slice_t *sl) {
    return !sl->start && !sl->nudge_ms && sl->len_pct == 100 && !sl->pitch && !sl->gain_db &&
           !sl->rev && !sl->play && !sl->attack_ms && !sl->decay_ms;
}

static int au_clip_default(const au_clip_t *cl) {
    int l;
    if (cl->name[0] || cl->mode != AU_MODE_LOOP || cl->method || cl->nslices != 8 || cl->jump != 16 ||
        cl->rstart || cl->rend != 1000 || cl->pitch || cl->gain_db) return 0;
    for (l = 0; l < AU_MAX_SLICES; l++) if (!au_slice_default(&cl->sl[l])) return 0;
    return 1;
}

static void au_save_state(void *vinst, FILE *fp) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    int t, c, l;
    for (t = 0; t < NUM_TRACKS; t++) {
        if (inst->tracks[t].audio) fprintf(fp, ",\"t%d_au\":1", t);
        for (c = 0; c < NUM_CLIPS; c++) {
            const au_clip_t *cl = &inst->au_clip[t][c];
            const char *q;
            if (au_clip_default(cl)) continue;
            fprintf(fp, ",\"t%dc%d_au\":\"%d %d %d %d %d %d %d %d|", t, c, cl->mode, cl->method,
                    cl->nslices, cl->jump, cl->rstart, cl->rend, cl->pitch, cl->gain_db);
            for (q = cl->name; *q; q++) {
                if (*q == '"' || *q == '\\') fputc('\\', fp);
                if ((unsigned char)*q >= 0x20) fputc(*q, fp);
            }
            fputc('"', fp);
            for (l = 0; l < AU_MAX_SLICES; l++) {
                const au_slice_t *sl = &cl->sl[l];
                if (au_slice_default(sl)) continue;
                fprintf(fp, ",\"t%dc%ds%d_au\":\"%u %d %d %d %d %d %d %d %d\"", t, c, l,
                        (unsigned)sl->start, sl->nudge_ms, sl->len_pct, sl->pitch, sl->gain_db,
                        sl->rev, sl->play, sl->attack_ms, sl->decay_ms);
            }
        }
    }
}

/* Every sample goes; every clip back to its defaults; no voice left. */
static void au_reset_all(void *vinst) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    int t, c, l;
    for (t = 0; t < NUM_TRACKS; t++) {
        au_track_kill(inst, t, NULL);
        inst->tracks[t].audio = 0;
        inst->au_trk[t].last_tick = -1;
        inst->au_trk[t].held_lane = 0xFF;
        for (c = 0; c < NUM_CLIPS; c++) {
            au_clip_t *cl = &inst->au_clip[t][c];
            uint32_t gen = cl->gen;
            au_drop(inst, cl->smp);
            memset(cl, 0, sizeof *cl);
            cl->gen = gen + 1;                     /* a load still in flight lands nowhere */
            cl->mode = AU_MODE_LOOP;
            cl->nslices = 8;
            cl->jump = 16;
            cl->rend = 1000;
            for (l = 0; l < AU_MAX_SLICES; l++) cl->sl[l].len_pct = 100;
        }
    }
    inst->au_lazy_track = inst->au_lazy_clip = -1;
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

static void au_load_state(void *vinst, const char *buf) {
    seq8_instance_t *inst = (seq8_instance_t *)vinst;
    char key[40];
    int t, c, l;
    for (t = 0; t < NUM_TRACKS; t++) {
        snprintf(key, sizeof key, "t%d_au", t);
        inst->tracks[t].audio = json_get_int(buf, key, 0) ? 1 : 0;
        if (inst->tracks[t].audio && inst->tracks[t].pad_mode != PAD_MODE_DRUM) inst->tracks[t].audio = 0;
        for (c = 0; c < NUM_CLIPS; c++) {
            au_clip_t *cl = &inst->au_clip[t][c];
            const char *p;
            int v[8] = { 0, 0, 8, 16, 0, 1000, 0, 0 }, k = 0;
            snprintf(key, sizeof key, "t%dc%d_au", t, c);
            if (!json_str_value(buf, key, &p)) continue;
            while (k < 8 && *p && *p != '|' && *p != '"') {
                while (*p == ' ') p++;
                v[k++] = my_atoi(p);
                while (*p && *p != ' ' && *p != '|' && *p != '"') p++;
            }
            cl->mode = (uint8_t)clamp_i(v[0], 0, 1);
            cl->method = (uint8_t)clamp_i(v[1], 0, 2);
            cl->nslices = (uint8_t)clamp_i(v[2], 1, AU_MAX_SLICES);
            cl->jump = (uint8_t)clamp_i(v[3], 2, 32);
            cl->rstart = (uint16_t)clamp_i(v[4], 0, 999);
            cl->rend = (uint16_t)clamp_i(v[5], cl->rstart + 1, 1000);
            cl->pitch = (int8_t)clamp_i(v[6], -24, 24);
            cl->gain_db = (int8_t)clamp_i(v[7], -40, 12);
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
                int w[9] = { 0, 0, 100, 0, 0, 0, 0, 0, 0 }, j = 0;
                snprintf(key, sizeof key, "t%dc%ds%d_au", t, c, l);
                if (!json_str_value(buf, key, &p)) continue;
                while (j < 9 && *p && *p != '"') {
                    while (*p == ' ') p++;
                    w[j++] = my_atoi(p);
                    while (*p && *p != ' ' && *p != '"') p++;
                }
                sl->start = (uint32_t)(w[0] < 0 ? 0 : w[0]);
                sl->nudge_ms = (int16_t)clamp_i(w[1], -500, 500);
                sl->len_pct = (uint8_t)clamp_i(w[2], 1, 100);
                sl->pitch = (int8_t)clamp_i(w[3], -24, 24);
                sl->gain_db = (int8_t)clamp_i(w[4], -40, 12);
                sl->rev = (uint8_t)(w[5] ? 1 : 0);
                sl->play = (uint8_t)clamp_i(w[6], 0, 2);
                sl->attack_ms = (uint16_t)clamp_i(w[7], 0, 2000);
                sl->decay_ms = (uint16_t)clamp_i(w[8], 0, 5000);
            }
            au_request_load(inst, t, c);
        }
    }
}
