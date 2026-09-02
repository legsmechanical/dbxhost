/* seq8_param_auto.c — per-parameter automation store: operations.
 *
 * Types and sizes live in seq8_param_auto.h (the instance struct embeds the
 * pool). Included by seq8.c; NOT a translation unit — see dsp/CLAUDE.md.
 */

/* ------------------------------------------------------------------ */
/* Crossing the thread boundary                                         */
/*                                                                      */
/* The store is written on the SPI thread (set_param) and read on the    */
/* AUDIO thread (the playback scan below). Nothing else in this file is  */
/* synchronized, so a write that moves points — pa_set_point's insert,   */
/* pa_clear_range's compaction, freeing an entry — can be in progress    */
/* while the reader is walking the same arrays.                          */
/*                                                                      */
/* A store-wide seqlock covers it. A writer marks the store busy, edits, */
/* then marks it settled; the reader samples the counter before and      */
/* after its pass and THROWS ITS WHOLE PASS AWAY if the two disagree.    */
/* Skipping automation for one tick is inaudible — a tick is about 5 ms  */
/* at 192 Hz and edits happen at the rate a person turns a knob — while  */
/* acting on a torn read would send a parameter to a value that was      */
/* never written.                                                        */
/*                                                                      */
/* The reader must also survive reading garbage, since it may read       */
/* mid-write and only discover that afterwards: every count and index it */
/* takes from the store is clamped before use, so a torn value can waste */
/* a pass but can never read out of bounds.                              */

static void pa_write_begin(seq8_instance_t *inst) {
    /* ACQ_REL, not RELEASE: release alone lets the data stores that follow
     * become visible BEFORE the counter goes odd, and a reader that samples
     * an even count, reads half-written points and samples the same even
     * count again has been handed a torn store with a clean receipt. The
     * acquire half pins the data stores after the increment. */
    __atomic_add_fetch(&inst->pa_seq, 1, __ATOMIC_ACQ_REL);   /* odd: busy */
}

static void pa_write_end(seq8_instance_t *inst) {
    __atomic_add_fetch(&inst->pa_seq, 1, __ATOMIC_RELEASE);   /* even: settled */
}

static uint32_t pa_read_seq(const seq8_instance_t *inst) {
    return __atomic_load_n(&inst->pa_seq, __ATOMIC_ACQUIRE);
}

/* The WRITER lock. The seqlock above protects the audio-thread READER from
 * the SPI-thread writer; it does nothing between two writers, and recording
 * makes the audio thread one (the latch writes a point per cell along the
 * playhead — it is the only thread that knows the tick). So:
 *   - the SPI thread takes pa_lock for every store access, reads included
 *     (a serialize walking points while the latch memmoves them is a torn
 *     file), and spins for it — the audio thread holds it for microseconds;
 *   - the audio thread TRIES it and, refused, leaves the cell for the next
 *     tick (its last_snap does not advance, so the cell is not lost). It never
 *     spins: this is the SPI callback path. */
static void pa_lock(seq8_instance_t *inst) {
    uint8_t z = 0;
    while (!__atomic_compare_exchange_n(&inst->pa_wlock, &z, 1, 0,
                                        __ATOMIC_ACQUIRE, __ATOMIC_RELAXED)) z = 0;
}
static int pa_trylock(seq8_instance_t *inst) {
    uint8_t z = 0;
    return __atomic_compare_exchange_n(&inst->pa_wlock, &z, 1, 0,
                                       __ATOMIC_ACQUIRE, __ATOMIC_RELAXED);
}
static void pa_unlock(seq8_instance_t *inst) {
    __atomic_store_n(&inst->pa_wlock, 0, __ATOMIC_RELEASE);
}

/* The reader's closing sample. An acquire LOAD only orders what follows it;
 * the data loads before it may still be in flight on ARM when it completes,
 * so the fence is what makes "same count after" mean "same data". */
static uint32_t pa_read_seq_after(const seq8_instance_t *inst) {
    __atomic_thread_fence(__ATOMIC_ACQUIRE);
    return __atomic_load_n(&inst->pa_seq, __ATOMIC_ACQUIRE);
}

/* ------------------------------------------------------------------ */
/* The staged-change ring (audio thread -> SPI thread)                  */
/*                                                                      */
/* A module DSP cannot set another chain slot's parameters — the host    */
/* API it is given carries MIDI and nothing else. So for every target    */
/* except the MIDI ones, playback computes the value and leaves it here  */
/* for JS to push. Single producer, single consumer, no locks.           */
/*                                                                      */
/* ⚠ ONE producer: the audio thread. Only it may call pa_ring_push — not    */
/* the SPI thread's transport-stop (that asks via pa_release_request and  */
/* the audio thread does the pushing on its next block), and not the      */
/* consumer (it PEEKS and pops only what it has room for). A second       */
/* producer races on head; a producer touching tail races the consumer.  */
/*                                                                        */
/* Overflow drops the NEWEST. Dropping the oldest would mean the producer */
/* writing the consumer's index, which is the race above; and with the    */
/* ring sized for several ticks of the scan's own budget, overflow means  */
/* JS has not drained for a long time, at which point the fresh value is  */
/* no better than the stale one. It is recorded so the condition is       */
/* visible rather than guessed at.                                        */

static void pa_ring_push(seq8_instance_t *inst, uint16_t target, uint16_t val) {
    uint32_t head = __atomic_load_n(&inst->pa_ring_head, __ATOMIC_RELAXED);
    uint32_t tail = __atomic_load_n(&inst->pa_ring_tail, __ATOMIC_ACQUIRE);
    if (head - tail >= PA_RING_SLOTS) { inst->pa_ring_dropped = 1; return; }
    inst->pa_ring[head % PA_RING_SLOTS].target = target;
    inst->pa_ring[head % PA_RING_SLOTS].val    = val;
    __atomic_store_n(&inst->pa_ring_head, head + 1, __ATOMIC_RELEASE);
}

/* Consumer side. Peek returns 1 and fills *out while anything is queued;
 * pop then retires it. Split so a consumer that turns out to have no room
 * for the entry can leave it where it is, in order — pushing it back would
 * put an OLDER value behind the newer ones for the same target, and the
 * reader that coalesces by target would keep the wrong one. */
static int pa_ring_peek(seq8_instance_t *inst, pa_change_t *out) {
    uint32_t tail = __atomic_load_n(&inst->pa_ring_tail, __ATOMIC_RELAXED);
    uint32_t head = __atomic_load_n(&inst->pa_ring_head, __ATOMIC_ACQUIRE);
    if (tail == head) return 0;
    *out = inst->pa_ring[tail % PA_RING_SLOTS];
    return 1;
}

static void pa_ring_pop(seq8_instance_t *inst) {
    uint32_t tail = __atomic_load_n(&inst->pa_ring_tail, __ATOMIC_RELAXED);
    __atomic_store_n(&inst->pa_ring_tail, tail + 1, __ATOMIC_RELEASE);
}

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

/* Find only — never allocates a target slot. For a write that must not create
 * anything (a knob turned while stopped, which is automation only if it
 * already was). */
static int pa_target_lookup(const seq8_instance_t *inst, const char *target) {
    if (!target || !*target) return -1;
    for (int i = 0; i < PA_MAX_TARGETS; i++) {
        if (inst->pa_targets[i][0] && !strcmp(inst->pa_targets[i], target)) return i;
    }
    return -1;
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

/* Empty an entry's points but keep it — as a "zombie" that holds the rest
 * value and asks the audio thread to put the parameter back there. Nothing
 * lists, plays or serializes an entry with no points, so the only trace it
 * leaves is that a later automation of the same target already knows its
 * rest. Freeing it outright would strand the parameter wherever the last
 * automation value left it, with no record of where "back" is. */
static void pa_entry_retire(pa_entry_t *e) {
    if (!e) return;
    e->count = 0;
    e->loop_len = e->loop_off = e->resolution = 0;
    e->last_sent_valid = 0;
    __atomic_store_n(&e->release, 1, __ATOMIC_RELEASE);
}

static void pa_clear_track_clip(seq8_instance_t *inst, int track, int clip) {
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (e->used && e->track == track && e->clip == clip) pa_entry_free(e);
    }
}

/* Caller holds the seqlock. */
static void pa_reset_all_locked(seq8_instance_t *inst) {
    memset(inst->pa_entries, 0, sizeof(inst->pa_entries));
    memset(inst->pa_targets, 0, sizeof(inst->pa_targets));
    inst->pa_dirty = 0;
}

static void pa_reset_all(seq8_instance_t *inst) {
    pa_lock(inst);
    pa_write_begin(inst);
    pa_reset_all_locked(inst);
    memset(inst->pa_live, 0, sizeof(inst->pa_live));
    pa_write_end(inst);
    pa_unlock(inst);
}

/* ------------------------------------------------------------------ */
/* Clip operations — automation travels with the clip it belongs to     */

/* Replace the destination clip's automation with a copy of the source's.
 * A clip's automation is part of the clip: copying one and leaving the
 * automation behind gives the copy someone else's parameter moves, and cutting
 * one and leaving it behind strands automation on a clip with no notes. */
static void pa_copy_clip(seq8_instance_t *inst, int st, int sc, int dt, int dc) {
    if (st == dt && sc == dc) return;
    pa_lock(inst);
    pa_write_begin(inst);
    pa_clear_track_clip(inst, dt, dc);
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != st || e->clip != sc) continue;
        pa_entry_t *n = pa_get(inst, dt, dc, e->target);
        if (!n) { inst->pa_store_full = 1; break; }   /* pool exhausted: say so */
        *n = *e;                                      /* points, flags, rest, window */
        n->track = (uint8_t)dt;
        n->clip  = (uint8_t)dc;
        n->last_sent_valid = 0;   /* the SOURCE was sent; this copy's target may sit anywhere */
        /* A new entry allocated here carries track dt, so the loop's own filter
         * excludes it — the copy cannot feed on itself. */
    }
    pa_write_end(inst);
    pa_unlock(inst);
    pa_mark_dirty(inst);
}

static void pa_move_clip(seq8_instance_t *inst, int st, int sc, int dt, int dc) {
    if (st == dt && sc == dc) return;
    pa_copy_clip(inst, st, sc, dt, dc);
    pa_lock(inst);
    pa_write_begin(inst);
    pa_clear_track_clip(inst, st, sc);
    pa_write_end(inst);
    pa_unlock(inst);
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
    pa_lock(inst);                       /* a reader, but the latch may be writing */
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != t || e->clip != c) continue;
        if (n >= PA_UNDO_ENTRIES) { *partial = 1; break; }
        dst[n++] = *e;
    }
    pa_unlock(inst);
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
    pa_lock(inst);
    pa_write_begin(inst);
    pa_clear_track_clip(inst, t, c);
    for (int i = 0; i < count; i++) {
        pa_entry_t *n = pa_get(inst, t, c, src[i].target);
        if (!n) { inst->pa_store_full = 1; break; }
        *n = src[i];
        n->track = (uint8_t)t;
        n->clip  = (uint8_t)c;
        n->last_sent_valid = 0;   /* snapshot-time "sent" says nothing about now */
    }
    pa_write_end(inst);
    pa_unlock(inst);
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

static void pa_parse_locked(seq8_instance_t *inst, const char *buf, size_t blen);

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


static void pa_serialize_locked(seq8_instance_t *inst, FILE *fp);
static void pa_serialize(seq8_instance_t *inst, FILE *fp) {
    pa_lock(inst);                       /* the latch may be moving points */
    pa_serialize_locked(inst, fp);
    pa_unlock(inst);
}
static void pa_serialize_locked(seq8_instance_t *inst, FILE *fp) {
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
    /* The whole parse runs under the seqlock: a project can load while the
     * transport is running, and the audio thread would otherwise scan entries
     * as they are being filled in. */
    pa_lock(inst);
    pa_write_begin(inst);
    pa_parse_locked(inst, buf, blen);
    memset(inst->pa_live, 0, sizeof(inst->pa_live));
    pa_write_end(inst);
    pa_unlock(inst);
}

static void pa_parse_locked(seq8_instance_t *inst, const char *buf, size_t blen) {
    pa_reset_all_locked(inst);
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

/* ------------------------------------------------------------------ */
/* Ownership                                                            */
/*                                                                      */
/* One target, one track. Two tracks automating the same parameter      */
/* would fight over it every tick and spend the push budget doing it,   */
/* so the first track to automate a target owns it until that           */
/* automation is gone from every clip. The UI asks before it writes;    */
/* the store refuses anyway and says who owns it.                       */

/* Track owning `target` (any clip), or -1. */
static int pa_owner_of(const seq8_instance_t *inst, int target) {
    if (target < 0) return -1;
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        const pa_entry_t *e = &inst->pa_entries[i];
        if (e->used && e->target == target) return (int)e->track;
    }
    return -1;
}

/* 1 if `track` may write `target`; 0 (and the conflict flagged) otherwise. */
static int pa_may_write(seq8_instance_t *inst, int track, int target) {
    int o = pa_owner_of(inst, target);
    if (o < 0 || o == track) return 1;
    inst->pa_owner_conflict = (uint8_t)(o + 1);
    return 0;
}

/* ------------------------------------------------------------------ */
/* Live targets — a knob under a hand                                   */

static pa_live_t *pa_live_find(seq8_instance_t *inst, int track, int target) {
    for (int k = 0; k < PA_LIVE_MAX; k++) {
        pa_live_t *l = &inst->pa_live[track][k];
        if (l->used && l->target == target) return l;
    }
    return NULL;
}

/* Is `target` under a hand on `track`? Audio-thread read; a torn read here
 * costs at most one tick of the wrong answer. */
static int pa_live_has(const seq8_instance_t *inst, int track, int target) {
    for (int k = 0; k < PA_LIVE_MAX; k++) {
        const pa_live_t *l = &inst->pa_live[track][k];
        if (l->used && l->target == target) return 1;
    }
    return 0;
}

/* SPI thread. A knob turned while touched: the value it now holds, and
 * whether that is being RECORDED (Record on, transport running — the DSP's
 * own flags, which are the authority) or merely overriding. The mode is
 * decided on the first turn of a touch and kept until release. */
static void pa_live_set(seq8_instance_t *inst, seq8_track_t *tr, int track,
                        int target, uint16_t val, int hold_only) {
    if (target < 0) return;
    pa_live_t *l = pa_live_find(inst, track, target);
    if (!l) {
        for (int k = 0; k < PA_LIVE_MAX; k++) {
            if (inst->pa_live[track][k].used) continue;
            l = &inst->pa_live[track][k];
            memset(l, 0, sizeof(*l));
            l->target    = (uint16_t)target;
            l->last_snap = 0xFFFFFFFFu;
            /* A HOLD (a step held while the knob turns: a lock being dialled)
             * is never a recording, whatever Record says — the lock is the
             * write. It only keeps playback's hands off the target. */
            l->mode      = (!hold_only && tr->recording && inst->playing)
                           ? PA_LIVE_RECORD : PA_LIVE_OVERRIDE;
            /* Publish the target before `used`, so the audio thread never
             * sees a used slot with a stale target. */
            __atomic_store_n(&l->used, 1, __ATOMIC_RELEASE);
            break;
        }
        if (!l) return;                       /* more than PA_LIVE_MAX hands */
    } else if (!hold_only) {
        /* An existing hand: Record may have been PUNCHED in or out under it
         * (Josh, 2026-09-03: "live recording seems flakey when punching in
         * and out during playback"). The mode was decided once, at the first
         * turn, so a sweep that began before Record went on never recorded,
         * and one that began before Record went off kept writing. Re-decide
         * per write; a flip to RECORD restarts the snap so the first cell is
         * written where the hand is now, not back-filled from the old one. */
        uint8_t want = (tr->recording && inst->playing) ? PA_LIVE_RECORD : PA_LIVE_OVERRIDE;
        if (want != l->mode) { l->mode = want; l->last_snap = 0xFFFFFFFFu; }
    }
    l->val = val;
}

/* SPI thread. The hand is off: the target goes back to playback, and playback
 * must re-assert rather than trust what it last sent — that is the
 * override-resume rule, and for a recording it re-syncs to what was written. */
static void pa_live_end(seq8_instance_t *inst, int track, int clip, int target) {
    pa_live_t *l = pa_live_find(inst, track, target);
    if (l) __atomic_store_n(&l->used, 0, __ATOMIC_RELEASE);
    pa_entry_t *e = pa_find(inst, track, clip, target);
    if (e) e->last_sent_valid = 0;
}

/* AUDIO THREAD, once per tick per playing track. Every RECORD-mode live
 * target writes its value at the current cell of the clip's playhead,
 * replacing whatever the cell held — overwrite recording, the way the CC
 * lanes did it. A cell is half a step (12 ticks at the default 24), which is
 * the store's density budget: 256 steps of cells fit an entry exactly.
 *
 * Takes the writer lock with TRYLOCK: refused (the SPI thread is mid-edit),
 * the cell is simply tried again next tick — last_snap only advances on a
 * write. Nothing here allocates or blocks. */
static void pa_record_tick(seq8_instance_t *inst, int track, int clip,
                           uint32_t ct, uint32_t tps) {
    uint32_t cell = tps / 2; if (cell < 6) cell = 6;
    uint32_t snap = (ct / cell) * cell;
    for (int k = 0; k < PA_LIVE_MAX; k++) {
        pa_live_t *l = &inst->pa_live[track][k];
        if (!__atomic_load_n(&l->used, __ATOMIC_ACQUIRE) || l->mode != PA_LIVE_RECORD) continue;
        if (l->last_snap == snap) continue;
        uint16_t tgt = l->target;
        if (tgt >= PA_MAX_TARGETS) continue;
        if (!pa_trylock(inst)) return;            /* next tick */
        pa_write_begin(inst);
        pa_entry_t *e = pa_get(inst, track, clip, (int)tgt);
        if (!e) inst->pa_store_full = 1;
        else {
            uint16_t s = (uint16_t)(snap > 0xFFFFu - cell ? 0xFFFFu - cell : snap);
            pa_clear_range(e, s, (uint16_t)(s + cell - 1));
            if (!pa_set_point(e, s, l->val)) inst->pa_store_full = 1;
            /* A recording is a sweep, and a sweep sampled every half step and
             * held is a 16-steps-a-second staircase on a filter. So what the
             * hand recorded plays back SMOOTH: interpolated between the cells
             * at tick rate. Locks stay stepped — that is their meaning. */
            e->flags |= PA_FLAG_SMOOTH;
            /* The parameter IS at the live value — the editor set it — so
             * playback need not re-send it when the hand comes off. */
            e->last_sent = l->val; e->last_sent_valid = 1;
            l->last_snap = snap;
            inst->pa_dirty = 1; inst->state_dirty = 1;
        }
        pa_write_end(inst);
        pa_unlock(inst);
    }
}

/* ------------------------------------------------------------------ */
/* Playback (AUDIO THREAD)                                              */
/*                                                                      */
/* Called once per tick per playing track. Evaluates every active entry */
/* for that (track, clip) and, where the value has moved, either emits   */
/* it directly — the MIDI targets, which the DSP can send itself — or    */
/* stages it for JS to push.                                            */
/*                                                                      */
/* ⚠ Nothing here may allocate, log, or block: this is the SPI callback  */
/* path. The whole pass is written into locals and only committed once   */
/* the seqlock confirms no write overlapped it.                          */

/* Emit callback for the MIDI targets. Supplied by the caller so this file
 * stays independent of the pfx runtime's internals. */
typedef void (*pa_midi_emit_fn)(seq8_track_t *tr, int cc, uint8_t val);

#ifdef SEQ8_TESTING
/* Test seam. The end-of-pass seqlock check catches a write that STARTS AND
 * FINISHES while the pass is reading — which single-threaded code cannot
 * produce, so without this hook that check is unreachable from a test and a
 * mutation removing it survives. Set by a test to run a write mid-pass; NULL
 * and absent from the shipped build. */
void (*pa_test_midscan_hook)(seq8_instance_t *inst) = 0;
#endif

static void pa_playback_scan(seq8_instance_t *inst, seq8_track_t *tr, int track,
                             int clip, uint32_t ct, uint32_t clip_ticks,
                             pa_midi_emit_fn emit) {
    uint32_t seq0 = pa_read_seq(inst);
    if (seq0 & 1u) return;                   /* a write is in flight; next tick */

    /* Staged into locals first — see the note above. */
    struct { uint16_t target; uint16_t val; uint8_t midi; int cc; } out[PA_TICK_MAX_STAGE];
    int nout = 0;

    /* Round-robin start. The per-tick cap must not always favour the low
     * indices: under Smooth every ramping entry changes EVERY tick, so a
     * (track, clip) with more of them than the cap would otherwise never reach
     * the ones past it. Each pass starts where the last one was cut off. */
    int start = (int)(inst->pa_scan_rot % PA_MAX_ENTRIES);
    int cut = -1;
    for (int k = 0; k < PA_MAX_ENTRIES; k++) {
        int i = (start + k) % PA_MAX_ENTRIES;
        if (nout >= PA_TICK_MAX_STAGE) { cut = i; break; }
        const pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != track || e->clip != clip) continue;
        if (!(e->flags & PA_FLAG_ACTIVE)) continue;

        /* Clamp everything taken from the store: this may be a torn read that
         * only the seqlock check at the end will reveal. */
        uint16_t count = e->count;
        if (count > PA_ENTRY_POINTS) continue;
        uint16_t tgt = e->target;
        if (tgt >= PA_MAX_TARGETS) continue;
        if (pa_live_has(inst, track, tgt)) continue;          /* touch wins */

        uint16_t v;
        if (!pa_eval(e, pa_entry_tick(e, ct, clip_ticks), &v)) continue;
        if (e->last_sent_valid && e->last_sent == v) continue;   /* unchanged */

        int cc = 0;
        int midi = pa_target_is_midi(inst->pa_targets[tgt], &cc);
        /* A MIDI target leaves as 7 bits: a 14-bit change that lands on the
         * same 7-bit value is not a change on the wire. Under Smooth that is
         * most of them. */
        if (midi && e->last_sent_valid &&
            (e->last_sent * 127u) / PA_VAL_MAX == (v * 127u) / PA_VAL_MAX) continue;
        out[nout].target = tgt;
        out[nout].val    = v;
        out[nout].midi   = (uint8_t)midi;
        out[nout].cc     = cc;
        nout++;
    }
    if (cut >= 0) inst->pa_scan_rot = (uint16_t)cut;

#ifdef SEQ8_TESTING
    if (pa_test_midscan_hook) pa_test_midscan_hook(inst);
#endif

    /* Did anything move underneath us? Then this pass saw a store that never
     * existed as a whole — drop it rather than act on it. ⚠ This catches a
     * write that both started and finished during the pass; the check at the
     * top only catches one still in flight. */
    if (pa_read_seq_after(inst) != seq0) return;

    for (int i = 0; i < nout; i++) {
        /* last_sent is written from the audio thread only, and read by it;
         * a concurrent store write can only reset it to zero on a fresh entry,
         * which costs one redundant resend. */
        for (int j = 0; j < PA_MAX_ENTRIES; j++) {
            pa_entry_t *e = &inst->pa_entries[j];
            if (!e->used || e->track != track || e->clip != clip) continue;
            if (e->target != out[i].target) continue;
            e->last_sent       = out[i].val;
            e->last_sent_valid = 1;
            break;
        }
        if (out[i].midi) {
            /* 14-bit normalized down to the 7 bits MIDI carries. */
            if (emit) emit(tr, out[i].cc, (uint8_t)((out[i].val * 127u) / PA_VAL_MAX));
        } else {
            pa_ring_push(inst, out[i].target, out[i].val);
        }
    }
}

/* Transport stopped, or the clip changed: every parameter automation was
 * driving goes back to the value it held before automation touched it.
 * Without this a parameter is simply abandoned wherever the playhead left it —
 * and for a chain parameter that value is what the slot then persists. */
/* AUDIO THREAD ONLY — it pushes on the ring. Anyone else asks with
 * pa_release_request and the next render block does it. */
static void pa_release_track(seq8_instance_t *inst, int track, int clip) {
    uint32_t seq0 = pa_read_seq(inst);
    if (seq0 & 1u) {                        /* a write is in flight: retry next block */
        inst->pa_release_clip[track] = (uint8_t)clip;
        __atomic_or_fetch(&inst->pa_release_mask, (uint8_t)(1u << track), __ATOMIC_RELEASE);
        return;
    }
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!e->used || e->track != track || e->clip != clip) continue;
        e->last_sent_valid = 0;
        if (!e->count) continue;                 /* a retired entry drives nothing */
        /* A deactivated entry was not driving the parameter, so it has nothing
         * to give back — the value there is whatever the user set by hand, and
         * Stop must not undo that. */
        if (!(e->flags & PA_FLAG_ACTIVE)) continue;
        if (e->rest == PA_VAL_UNSET) continue;
        uint16_t tgt = e->target;
        if (tgt >= PA_MAX_TARGETS) continue;
        if (!pa_target_is_midi(inst->pa_targets[tgt], NULL))
            pa_ring_push(inst, tgt, e->rest);
    }
}

/* The transport stops from either thread (a button on the SPI thread, a stale
 * clock on the audio thread). Both leave a request here and the audio thread
 * serves it at the top of its next block, so the ring keeps its one producer. */
static void pa_release_request(seq8_instance_t *inst, int track, int clip) {
    inst->pa_release_clip[track] = (uint8_t)clip;
    __atomic_or_fetch(&inst->pa_release_mask, (uint8_t)(1u << track), __ATOMIC_RELEASE);
}

static void pa_release_service(seq8_instance_t *inst) {
    /* Per-entry releases: a deactivated or cleared parameter goes back to
     * rest now, whether or not the transport runs. */
    for (int i = 0; i < PA_MAX_ENTRIES; i++) {
        pa_entry_t *e = &inst->pa_entries[i];
        if (!__atomic_load_n(&e->release, __ATOMIC_ACQUIRE)) continue;
        __atomic_exchange_n(&e->release, 0, __ATOMIC_ACQ_REL);
        if (!e->used) continue;
        uint16_t tgt = e->target;
        if (tgt >= PA_MAX_TARGETS || e->rest == PA_VAL_UNSET) continue;
        e->last_sent_valid = 0;
        if (!pa_target_is_midi(inst->pa_targets[tgt], NULL))
            pa_ring_push(inst, tgt, e->rest);
    }
    uint8_t mask = __atomic_exchange_n(&inst->pa_release_mask, 0, __ATOMIC_ACQ_REL);
    if (!mask) return;
    for (int t = 0; t < NUM_TRACKS; t++)
        if (mask & (1u << t)) pa_release_track(inst, t, (int)inst->pa_release_clip[t]);
}
