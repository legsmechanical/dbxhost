/* seq8_param_auto.c — per-parameter automation store: operations.
 *
 * Types and sizes live in seq8_param_auto.h (the instance struct embeds the
 * pool). Included by seq8.c; NOT a translation unit — see dsp/CLAUDE.md.
 */

/* ------------------------------------------------------------------ */
/* Target interning                                                    */

static int pa_target_id(seq8_instance_t *inst, const char *target) {
    if (!target || !*target) return -1;
    for (int i = 0; i < PA_MAX_TARGETS; i++) {
        if (!inst->pa_targets[i][0]) continue;
        if (!strcmp(inst->pa_targets[i], target)) return i;
    }
    for (int i = 0; i < PA_MAX_TARGETS; i++) {
        if (inst->pa_targets[i][0]) continue;
        snprintf(inst->pa_targets[i], PA_TARGET_LEN, "%s", target);
        return i;
    }
    return -1;   /* target table full */
}

/* A target string the DSP can emit itself: "cc:<n>" or "at". Everything else
 * is staged for JS. Returns 1 and sets *cc (0..127, or -1 for aftertouch). */
static int pa_target_is_midi(const char *t, int *cc) {
    if (!t) return 0;
    if (t[0] == 'a' && t[1] == 't' && t[2] == '\0') { if (cc) *cc = -1; return 1; }
    if (t[0] == 'c' && t[1] == 'c' && t[2] == ':') {
        int n = 0, any = 0;
        for (const char *p = t + 3; *p >= '0' && *p <= '9'; p++) { n = n * 10 + (*p - '0'); any = 1; }
        if (!any || n > 127) return 0;
        if (cc) *cc = n;
        return 1;
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* Entry lookup / lifetime                                             */

static pa_entry_t *pa_find(seq8_instance_t *inst, int track, int clip, int target) {
    if (target < 0) return NULL;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (e->used && e->track == track && e->clip == clip && e->target == target) return e;
    }
    return NULL;
}

/* Find or create. Returns NULL when the store is full — the caller reports
 * that; it must never be silent, or a user records automation that is not
 * being kept. */
static pa_entry_t *pa_get(seq8_instance_t *inst, int track, int clip, int target) {
    pa_entry_t *e = pa_find(inst, track, clip, target);
    if (e) return e;
    if (target < 0) return NULL;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        e = &inst->pa_entries[i];
        if (e->used) continue;
        memset(e, 0, sizeof(*e));
        e->used   = 1;
        e->track  = (uint8_t)track;
        e->clip   = (uint8_t)clip;
        e->target = (uint16_t)target;
        e->flags  = PA_FLAG_ACTIVE;
        e->rest   = PA_VAL_UNSET;
        return e;
    }
    return NULL;
}

static void pa_entry_free(pa_entry_t *e) {
    if (e) memset(e, 0, sizeof(*e));
}

static void pa_clear_track_clip(seq8_instance_t *inst, int track, int clip) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (e->used && e->track == track && e->clip == clip) pa_entry_free(e);
    }
}

static void pa_reset_all(seq8_instance_t *inst) {
    memset(inst->pa_entries, 0, sizeof(inst->pa_entries));
    memset(inst->pa_targets, 0, sizeof(inst->pa_targets));
    inst->pa_dirty = 0;
}

/* ------------------------------------------------------------------ */
/* Point writes                                                        */

/* Insert or replace the point at `tick`, keeping points sorted. Returns 1 on
 * success, 0 when the entry is full. */
static int pa_set_point(pa_entry_t *e, uint16_t tick, uint16_t val) {
    if (!e) return 0;
    if (val > PA_VAL_MAX) val = PA_VAL_MAX;
    int lo = 0, hi = e->count;
    while (lo < hi) {                      /* first index with points[i].tick >= tick */
        int mid = (lo + hi) / 2;
        if (e->points[mid].tick < tick) lo = mid + 1; else hi = mid;
    }
    if (lo < e->count && e->points[lo].tick == tick) { e->points[lo].val = val; return 1; }
    if (e->count >= PA_ENTRY_POINTS) return 0;
    memmove(&e->points[lo + 1], &e->points[lo], (size_t)(e->count - lo) * sizeof(pa_point_t));
    e->points[lo].tick = tick;
    e->points[lo].val  = val;
    e->count++;
    return 1;
}

/* Remove every point in [from, to] inclusive. */
static void pa_clear_range(pa_entry_t *e, uint16_t from, uint16_t to) {
    if (!e || !e->count) return;
    int w = 0;
    for (int r = 0; r < e->count; r++) {
        if (e->points[r].tick >= from && e->points[r].tick <= to) continue;
        e->points[w++] = e->points[r];
    }
    e->count = (uint16_t)w;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */

/* Value of `e` at clip tick `ct`. Stepped-hold by default: a point holds until
 * the next one, which is also what makes a p-lock last until the next point.
 * With PA_FLAG_SMOOTH, interpolate linearly between neighbours instead.
 * Returns 0 when the entry defines nothing at all (no points). */
static int pa_eval(const pa_entry_t *e, uint32_t ct, uint16_t *out) {
    if (!e || !e->count) return 0;
    /* Before the first point, the first point's value holds — the parameter
     * has a defined automation value everywhere once it has any. */
    if (ct <= e->points[0].tick) { *out = e->points[0].val; return 1; }
    if (ct >= e->points[e->count - 1].tick) { *out = e->points[e->count - 1].val; return 1; }

    int lo = 0, hi = e->count - 1;
    while (lo + 1 < hi) {                  /* last index with tick <= ct */
        int mid = (lo + hi) / 2;
        if (e->points[mid].tick <= ct) lo = mid; else hi = mid;
    }
    const pa_point_t *a = &e->points[lo];
    const pa_point_t *b = &e->points[lo + 1];
    if (!(e->flags & PA_FLAG_SMOOTH) || b->tick == a->tick) { *out = a->val; return 1; }
    uint32_t span = (uint32_t)(b->tick - a->tick);
    uint32_t into = ct - a->tick;
    int32_t  diff = (int32_t)b->val - (int32_t)a->val;
    *out = (uint16_t)((int32_t)a->val + (diff * (int32_t)into) / (int32_t)span);
    return 1;
}

/* The clip tick an entry is evaluated at. Normally the clip's own playhead;
 * an entry carrying its own loop window wraps inside that window instead.
 * loop_len == 0 (every entry in v1) means "follow the clip" and returns ct
 * unchanged, so this costs one compare until the feature is surfaced. */
static uint32_t pa_entry_tick(const pa_entry_t *e, uint32_t ct, uint32_t clip_ticks) {
    if (!e || !e->loop_len) return ct;
    uint32_t win = (uint32_t)e->loop_len;
    if (win > clip_ticks && clip_ticks) win = clip_ticks;
    if (!win) return ct;
    return (uint32_t)e->loop_off + (ct % win);
}

/* ------------------------------------------------------------------ */
/* Persistence — automation lives in its OWN file beside the project    */
/*                                                                      */
/* Not inside state_full: that blob reaches JS through the shadow param  */
/* transport, whose value field is 64 KB, and a heavy project already    */
/* spends ~62 KB of it. Automation would have had a few hundred points   */
/* to share across the whole song. A second file in the project's own    */
/* directory costs nothing structurally — the storage model is one       */
/* directory per project, so a copy is still a copytree and a delete     */
/* still one rmtree.                                                     */
/*                                                                      */
/* Identity is the LOCATION, exactly as it is for the state file, which   */
/* records no uuid either. An earlier draft stamped the project uuid into */
/* the file and refused a mismatch — which would have discarded the       */
/* automation of every COPIED project, since a copy is a copytree and     */
/* carries the source's uuid. The two files must agree about what makes   */
/* a project, and the state file's answer is "the directory it is in".    */

#define PA_FILE_VERSION 1


/* Bounded JSON readers. The shared json_get_int searches from a pointer to the
 * end of the buffer, which is right for a flat document but wrong here: an
 * entry that omits a sparse key would find the NEXT entry's copy of it and
 * silently inherit another parameter's loop window. These stop at the object's
 * closing brace. */
static int pa_json_int(const char *obj, const char *end, const char *key, int def) {
    char pat[24];
    int n = snprintf(pat, sizeof(pat), "\"%s\":", key);
    if (n < 0 || (size_t)n >= sizeof(pat)) return def;
    for (const char *p = obj; p && p < end; p = strchr(p + 1, '"')) {
        if (strncmp(p, pat, (size_t)n)) continue;
        p += n;
        int neg = 0;
        if (*p == '-') { neg = 1; p++; }
        if (*p < '0' || *p > '9') return def;
        int v = 0;
        while (*p >= '0' && *p <= '9' && p < end) v = v * 10 + (*p++ - '0');
        return neg ? -v : v;
    }
    return def;
}

static void pa_json_str(const char *obj, const char *end, const char *key,
                        char *out, size_t out_len) {
    out[0] = '\0';
    char pat[24];
    int n = snprintf(pat, sizeof(pat), "\"%s\":\"", key);
    if (n < 0 || (size_t)n >= sizeof(pat)) return;
    for (const char *p = obj; p && p < end; p = strchr(p + 1, '"')) {
        if (strncmp(p, pat, (size_t)n)) continue;
        p += n;
        size_t i = 0;
        while (*p && *p != '"' && p < end && i + 1 < out_len) out[i++] = *p++;
        out[i] = '\0';
        return;
    }
}

static void pa_state_path(seq8_instance_t *inst, char *out, size_t out_len) {
    /* Sibling of the state file: same directory, same lifecycle. Derived from
     * state_path rather than rebuilt from the uuid, so the two can never point
     * at different projects. */
    const char *sp = inst->state_path;
    const char *suffix = "-state.json";
    size_t sl = strlen(sp), xl = strlen(suffix);
    if (sl > xl && !strcmp(sp + sl - xl, suffix)) {
        size_t stem = sl - xl;
        if (stem + strlen("-auto.json") < out_len) {
            memcpy(out, sp, stem);
            strcpy(out + stem, "-auto.json");
            return;
        }
    }
    snprintf(out, out_len, "%s.auto", sp);
}

static void pa_serialize(seq8_instance_t *inst, FILE *fp) {
    fprintf(fp, "{\"v\":%d,\"e\":[", PA_FILE_VERSION);
    int first = 1;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || !e->count) continue;
        if (!first) fputc(',', fp);
        first = 0;
        fprintf(fp, "{\"t\":%d,\"c\":%d,\"k\":\"%s\",\"f\":%d",
                (int)e->track, (int)e->clip, inst->pa_targets[e->target], (int)e->flags);
        if (e->rest != PA_VAL_UNSET) fprintf(fp, ",\"r\":%d", (int)e->rest);
        /* Sparse: the loop window is absent for every entry that follows the
         * clip, which in v1 is all of them. */
        if (e->loop_len)   fprintf(fp, ",\"ll\":%d", (int)e->loop_len);
        if (e->loop_off)   fprintf(fp, ",\"lo\":%d", (int)e->loop_off);
        if (e->resolution) fprintf(fp, ",\"rs\":%d", (int)e->resolution);
        fprintf(fp, ",\"p\":\"");
        for (int j = 0; j < e->count; j++)
            fprintf(fp, "%u:%u;", (unsigned)e->points[j].tick, (unsigned)e->points[j].val);
        fprintf(fp, "\"}");
    }
    fprintf(fp, "]}");
}

static void pa_save(seq8_instance_t *inst) {
    if (inst->awaiting_select) return;
    char path[sizeof(inst->state_path) + 16];
    pa_state_path(inst, path, sizeof(path));

    /* Nothing automated: remove the file rather than leaving an empty one, so
     * a project with no automation has no auto file at all — which is also
     * what every project that predates this feature looks like. */
    int any = 0;
    for (int i = 0; i < PA_MAX_ENTRIES && !any; i++)
        if (inst->pa_entries[i].used && inst->pa_entries[i].count) any = 1;
    if (!any) { remove(path); inst->pa_dirty = 0; return; }

    ensure_parent_dir(path);
    char tmp_path[sizeof(path) + 8];
    int _n = snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path);
    if (_n < 0 || (size_t)_n >= sizeof(tmp_path)) return;
    FILE *fp = fopen(tmp_path, "w");
    if (!fp) return;
    pa_serialize(inst, fp);
    int ok = (fflush(fp) == 0) && (fsync(fileno(fp)) == 0);
    if (fclose(fp) != 0) ok = 0;
    if (!ok || rename(tmp_path, path) != 0) { remove(tmp_path); return; }
    inst->pa_dirty = 0;
}

static void pa_load(seq8_instance_t *inst) {
    pa_reset_all(inst);
    char path[sizeof(inst->state_path) + 16];
    pa_state_path(inst, path, sizeof(path));
    FILE *fp = fopen(path, "r");
    if (!fp) return;                       /* no automation — a normal project */
    fseek(fp, 0, SEEK_END);
    long fsz = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    if (fsz <= 0) { fclose(fp); remove(path); return; }
    char *buf = (char *)malloc((size_t)fsz + 1);
    if (!buf) { fclose(fp); return; }
    size_t n = fread(buf, 1, (size_t)fsz, fp);
    fclose(fp);
    if (!n) { free(buf); remove(path); return; }
    buf[n] = '\0';

    if (json_get_int(buf, "v", -1) != PA_FILE_VERSION) { free(buf); remove(path); return; }

    /* Entries. Hand-parsed in the same style as the main loader: find each
     * object, read its fields, then walk the point string. */
    const char *p = strstr(buf, "\"e\":[");
    if (!p) { free(buf); return; }
    p += 5;
    while (*p) {
        const char *obj = strchr(p, '{');
        if (!obj) break;
        const char *end = strchr(obj, '}');
        if (!end) break;

        int track = pa_json_int(obj, end, "t", -1);
        int clip  = pa_json_int(obj, end, "c", -1);
        int flags = pa_json_int(obj, end, "f", PA_FLAG_ACTIVE);
        int rest  = pa_json_int(obj, end, "r", -1);
        char tgt[PA_TARGET_LEN] = {0};
        pa_json_str(obj, end, "k", tgt, sizeof(tgt));

        if (track >= 0 && track < NUM_TRACKS && clip >= 0 && clip < NUM_CLIPS && tgt[0]) {
            pa_entry_t *e = pa_get(inst, track, clip, pa_target_id(inst, tgt));
            if (e) {
                e->flags      = (uint8_t)flags;
                e->rest       = (rest >= 0) ? (uint16_t)rest : PA_VAL_UNSET;
                e->loop_len   = (uint16_t)pa_json_int(obj, end, "ll", 0);
                e->loop_off   = (uint16_t)pa_json_int(obj, end, "lo", 0);
                e->resolution = (uint16_t)pa_json_int(obj, end, "rs", 0);
                const char *pp = strstr(obj, "\"p\":\"");
                if (pp && pp < end) {
                    pp += 5;
                    while (*pp && *pp != '"') {
                        unsigned tick = 0, val = 0;
                        while (*pp >= '0' && *pp <= '9') tick = tick * 10 + (unsigned)(*pp++ - '0');
                        if (*pp != ':') break;
                        pp++;
                        while (*pp >= '0' && *pp <= '9') val = val * 10 + (unsigned)(*pp++ - '0');
                        /* Points are written in order, so append directly rather
                         * than paying pa_set_point's insertion search per point. */
                        if (e->count < PA_ENTRY_POINTS) {
                            e->points[e->count].tick = (uint16_t)tick;
                            e->points[e->count].val  = (uint16_t)(val > PA_VAL_MAX ? PA_VAL_MAX : val);
                            e->count++;
                        }
                        if (*pp == ';') pp++;
                    }
                }
                if (!e->count) pa_entry_free(e);
            }
        }
        p = end + 1;
        if (*p == ']' || !strchr(p, '{')) break;
    }
    free(buf);
    inst->pa_dirty = 0;
}
