/* seq8_param_auto.c — per-parameter automation store: operations.
 *
 * Types and sizes live in seq8_param_auto.h (the instance struct embeds the
 * pool). Included by seq8.c; NOT a translation unit — see dsp/CLAUDE.md.
 */

/* ------------------------------------------------------------------ */
/* Target interning                                                    */

/* A target is written verbatim into a JSON string in the state file and read
 * back by a scan that ends at the first '"' or '}'. So a target carrying either
 * does not merely corrupt its own entry — it truncates the object and the
 * PARSE OF THE WHOLE SECTION fails, losing every automation in the project.
 * Targets come from JS as arbitrary bytes, so they are validated here, at the
 * one door into the store, rather than trusted and escaped later. */
static int pa_target_valid(const char *t) {
    int n = 0;
    for (const char *p = t; *p; p++, n++) {
        if (n >= PA_TARGET_LEN - 1) return 0;          /* would be truncated */
        char c = *p;
        int ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                 (c >= '0' && c <= '9') ||
                 c == ':' || c == '_' || c == '.' || c == '-';
        if (!ok) return 0;
    }
    return n > 0;
}

static int pa_target_id(seq8_instance_t *inst, const char *target) {
    if (!target || !*target) return -1;
    if (!pa_target_valid(target)) return -1;
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

/* Automation is a section of the project state file, so an automation edit is
 * a STATE edit: it must set state_dirty or the deferred save never runs and the
 * work survives only a clean suspend. pa_dirty is kept as the finer-grained
 * signal for JS. */
static void pa_mark_dirty(seq8_instance_t *inst) {
    inst->pa_dirty    = 1;
    inst->state_dirty = 1;
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
/* Clip operations — automation travels with the clip it belongs to     */

/* Replace the destination clip's automation with a copy of the source's.
 * A clip's automation is part of the clip: copying one and leaving the
 * automation behind gives the copy someone else's parameter moves, and cutting
 * one and leaving it behind strands automation on a clip with no notes. */
static void pa_copy_clip(seq8_instance_t *inst, int st, int sc, int dt, int dc) {
    if (st == dt && sc == dc) return;
    pa_clear_track_clip(inst, dt, dc);
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != st || e->clip != sc) continue;
        pa_entry_t *n = pa_get(inst, dt, dc, e->target);
        if (!n) { inst->pa_store_full = 1; break; }   /* pool exhausted: say so */
        *n = *e;                                      /* points, flags, rest, window */
        n->track = (uint8_t)dt;
        n->clip  = (uint8_t)dc;
        /* A new entry allocated here carries track dt, so the loop's own filter
         * excludes it — the copy cannot feed on itself. */
    }
    pa_mark_dirty(inst);
}

static void pa_move_clip(seq8_instance_t *inst, int st, int sc, int dt, int dc) {
    if (st == dt && sc == dc) return;
    pa_copy_clip(inst, st, sc, dt, dc);
    pa_clear_track_clip(inst, st, sc);
    pa_mark_dirty(inst);
}

/* ------------------------------------------------------------------ */
/* Undo snapshots                                                       */
/*                                                                      */
/* Undo already snapshots a clip's notes and its old-style automation.   */
/* Without automation here, undoing a cut would restore the notes and    */
/* leave the automation destroyed — the destructive half of the          */
/* operation would be the half that could not be taken back.             */
/*                                                                      */
/* A slot holds up to PA_UNDO_ENTRIES automated parameters for one clip. */
/* A clip carrying more than that is not partially captured: the slot is */
/* marked as not covering automation, and the restore then leaves        */
/* automation alone rather than reinstating some of it and dropping the  */
/* rest. Restoring a subset is worse than restoring none, because it     */
/* looks like it worked.                                                 */

static void pa_undo_capture(seq8_instance_t *inst, pa_entry_t *dst, uint8_t *count,
                            uint8_t *partial, int t, int c) {
    int n = 0;
    *partial = 0;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != t || e->clip != c) continue;
        if (n >= PA_UNDO_ENTRIES) { *partial = 1; break; }
        dst[n++] = *e;
    }
    *count = (uint8_t)(*partial ? 0 : n);
}

/* True when any slot in this operation could not be captured whole. */
static int pa_undo_any_partial(const uint8_t *partial, int count) {
    for (int i = 0; i < count; i++) if (partial[i]) return 1;
    return 0;
}

static void pa_undo_restore(seq8_instance_t *inst, const pa_entry_t *src, uint8_t count,
                            uint8_t partial, int t, int c) {
    if (partial) return;                 /* see above: none, rather than some */
    pa_clear_track_clip(inst, t, c);
    for (int i = 0; i < count; i++) {
        pa_entry_t *n = pa_get(inst, t, c, src[i].target);
        if (!n) { inst->pa_store_full = 1; break; }
        *n = src[i];
        n->track = (uint8_t)t;
        n->clip  = (uint8_t)c;
    }
    pa_mark_dirty(inst);
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
/* Persistence — a SECTION of the project's one state file              */
/*                                                                      */
/* Automation is written inside seq8_do_serialize and read back inside   */
/* seq8_load_state, under the "pa" key. It is not a second file: a       */
/* project is one file, and two would have to be kept in lockstep across */
/* create, copy, delete, clear and load — five chances for a project's   */
/* notes and its automation to disagree about which project they belong  */
/* to.                                                                   */
/*                                                                      */
/* What made a second file tempting was the READBACK leg: the blob       */
/* reaches JS through the shadow parameter transport, whose value field  */
/* is 64 KB, and a heavy project already spends most of that. The answer  */
/* is to fix the leg rather than route around it — get_param serves the  */
/* state in chunks (see "state_chunk_" in seq8.c), so the ceiling is per  */
/* chunk instead of per project, for notes as much as automation.        */
/*                                                                      */
/* Format: "pa" maps to an array of entries, each                        */
/*   {"t":track,"c":clip,"k":target,"f":flags,"r":rest,"p":"tick:val;…"} */
/* with the loop window (ll/lo/rs) omitted while it is unset, which in   */
/* v1 is always. Absent "pa" means a project with no automation, which   */
/* is also every project written before this existed — that is the whole */
/* of the migration story, and it needs no version bump.                 */

#define PA_SECTION_VERSION 1

/* Bounded JSON readers. The shared json_get_int searches from a pointer to the
 * end of the document, which is right for a flat key but wrong inside an array
 * of objects: an entry that omits a sparse key would find the NEXT entry's copy
 * of it and silently inherit another parameter's loop window. These stop at the
 * object's closing brace. */
static int pa_json_int(const char *obj, const char *end, const char *key, int def) {
    char pat[24];
    int n = snprintf(pat, sizeof(pat), "\"%s\":", key);
    if (n < 0 || (size_t)n >= sizeof(pat)) return def;
    for (const char *p = obj; p && p < end; p = strchr(p + 1, '"')) {
        if (strncmp(p, pat, (size_t)n)) continue;
        p += n;
        int neg = 0;
        if (p < end && *p == '-') { neg = 1; p++; }
        if (p >= end || *p < '0' || *p > '9') return def;
        int v = 0;
        while (p < end && *p >= '0' && *p <= '9') {
            if (v < 1000000) v = v * 10 + (*p - '0');   /* saturate, never wrap */
            p++;
        }
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
        while (p < end && *p && *p != '"' && i + 1 < out_len) out[i++] = *p++;
        out[i] = '\0';
        return;
    }
}


static void pa_serialize(seq8_instance_t *inst, FILE *fp) {
    int any = 0;
    for (int i = 0; i < PA_MAX_ENTRIES && !any; i++)
        if (inst->pa_entries[i].used && inst->pa_entries[i].count) any = 1;
    if (!any) return;            /* sparse: no automation writes no key at all */

    fprintf(fp, ",\"pav\":%d,\"pa\":[", PA_SECTION_VERSION);
    int first = 1;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || !e->count) continue;
        if (!first) fputc(',', fp);
        first = 0;
        fprintf(fp, "{\"t\":%d,\"c\":%d,\"k\":\"%s\",\"f\":%d",
                (int)e->track, (int)e->clip, inst->pa_targets[e->target], (int)e->flags);
        if (e->rest != PA_VAL_UNSET) fprintf(fp, ",\"r\":%d", (int)e->rest);
        if (e->loop_len)   fprintf(fp, ",\"ll\":%d", (int)e->loop_len);
        if (e->loop_off)   fprintf(fp, ",\"lo\":%d", (int)e->loop_off);
        if (e->resolution) fprintf(fp, ",\"rs\":%d", (int)e->resolution);
        fprintf(fp, ",\"p\":\"");
        for (int j = 0; j < e->count; j++)
            fprintf(fp, "%u:%u;", (unsigned)e->points[j].tick, (unsigned)e->points[j].val);
        fprintf(fp, "\"}");
    }
    fprintf(fp, "]");
}

/* Parse the "pa" section out of a loaded state blob. `buf` is the whole
 * NUL-terminated document; `blen` its length. Always resets the store first, so
 * loading a project without automation clears the previous project's rather
 * than inheriting it. */
static void pa_parse(seq8_instance_t *inst, const char *buf, size_t blen) {
    pa_reset_all(inst);
    if (!buf) return;
    const char *sec = strstr(buf, "\"pa\":[");
    if (!sec) return;
    /* Section version. An unknown one is left alone rather than parsed as this
     * one: reading a newer format with older rules produces plausible-looking
     * garbage, which is worse than no automation. Nothing is deleted — the file
     * belongs to whoever wrote it. */
    { int sv = json_get_int(buf, "pav", 1);
      if (sv != PA_SECTION_VERSION) return; }
    const char *p = sec + 6;
    const char *doc_end = buf + blen;

    while (p < doc_end && *p) {
        const char *obj = strchr(p, '{');
        if (!obj || obj >= doc_end) break;
        const char *end = strchr(obj, '}');
        if (!end || end >= doc_end) break;

        int track = pa_json_int(obj, end, "t", -1);
        int clip  = pa_json_int(obj, end, "c", -1);
        int flags = pa_json_int(obj, end, "f", PA_FLAG_ACTIVE);
        int rest  = pa_json_int(obj, end, "r", -1);
        char tgt[PA_TARGET_LEN] = {0};
        pa_json_str(obj, end, "k", tgt, sizeof(tgt));

        if (track >= 0 && track < NUM_TRACKS && clip >= 0 && clip < NUM_CLIPS && tgt[0]) {
            pa_entry_t *e = pa_get(inst, track, clip, pa_target_id(inst, tgt));
            /* Out of entries or targets while LOADING: the project holds more
             * automation than this build can. Report it — dropping silently
             * would look like the automation was never there, and the next save
             * would make that permanent. */
            if (!e) inst->pa_store_full = 1;
            if (e) {
                e->flags      = (uint8_t)flags;
                e->rest       = (rest >= 0) ? (uint16_t)rest : PA_VAL_UNSET;
                e->loop_len   = (uint16_t)pa_json_int(obj, end, "ll", 0);
                e->loop_off   = (uint16_t)pa_json_int(obj, end, "lo", 0);
                e->resolution = (uint16_t)pa_json_int(obj, end, "rs", 0);
                const char *pp = strstr(obj, "\"p\":\"");
                if (pp && pp < end) {
                    pp += 5;
                    while (pp < end && *pp && *pp != '"') {
                        unsigned tick = 0, val = 0;
                        if (*pp < '0' || *pp > '9') break;
                        while (pp < end && *pp >= '0' && *pp <= '9') {
                            if (tick < 1000000u) tick = tick * 10 + (unsigned)(*pp - '0');
                            pp++;                       /* saturate, never wrap */
                        }
                        if (pp >= end || *pp != ':') break;
                        pp++;
                        if (pp >= end || *pp < '0' || *pp > '9') break;
                        while (pp < end && *pp >= '0' && *pp <= '9') {
                            if (val < 1000000u) val = val * 10 + (unsigned)(*pp - '0');
                            pp++;
                        }
                        /* Written in order, so append rather than pay the
                         * insertion search per point. */
                        if (e->count < PA_ENTRY_POINTS) {
                            e->points[e->count].tick = (uint16_t)(tick > 0xFFFF ? 0xFFFF : tick);
                            e->points[e->count].val  = (uint16_t)(val > PA_VAL_MAX ? PA_VAL_MAX : val);
                            e->count++;
                        }
                        if (pp < end && *pp == ';') pp++;
                    }
                }
                if (!e->count) pa_entry_free(e);
            }
        }
        p = end + 1;
        /* The array ends at the first ']' that follows an object. */
        while (p < doc_end && (*p == ' ' || *p == ',')) p++;
        if (p >= doc_end || *p != '{') break;
    }
    inst->pa_dirty = 0;
}
