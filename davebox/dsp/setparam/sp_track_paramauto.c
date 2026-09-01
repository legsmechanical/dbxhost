/* FILE-SCOPE HANDLER for set_param()'s tN_pa_* per-parameter automation keys
 * — part of the seq8.c single translation unit; #included at FILE scope by
 * seq8_set_param.c immediately before set_param. NOT a standalone TU; never
 * compile or lint this file on its own.
 *
 * Covers: pa_set, pa_set2, pa_clear_key, pa_clear_step, pa_clear, pa_active,
 * pa_smooth, pa_rest, pa_loop, pa_live, pa_hold, pa_live_end.
 *
 * The dispatcher holds the writer lock and the seqlock around this handler.
 *
 * ⚠ Contract: this handler CONSUMES every key whose sub-op begins "pa_",
 * returning 1 even for one it does not recognise. sp_track_misc.c, dispatched
 * after it, ends in an unconditional pfx_set catch-all — so falling through on
 * an unknown pa_ key would not be ignored, it would be MIS-HANDLED as a play-
 * effects parameter. (sp_track_ccauto has this bug today: it returns 0 on
 * no-match and its header claims that is safe because nothing downstream has a
 * catch-all. Something downstream does. That code is deleted with the lane
 * system; do not copy its shape.)
 *
 * Values are 14-bit normalized (0..PA_VAL_MAX); JS owns the mapping to and
 * from a parameter's real wire units, because only JS has the chain_params
 * metadata that defines them. */
static int sp_track_paramauto(sp_ctx_t *cx) {
    seq8_instance_t *inst = cx->inst;
    seq8_track_t *tr = cx->tr;
    const char *val = cx->val;
    int tidx = cx->tidx;
    const char *sub = cx->sub;

    if (sub[0] != 'p' || sub[1] != 'a' || sub[2] != '_') return 0;

    /* Every key below addresses (clip, target); the clip is the track's active
     * clip unless the key carried one. Parsing helpers are hand-rolled to match
     * the file family's style — no sscanf. */
    #define PA_SKIP_SPACE(p) do { while (*(p) == ' ') (p)++; } while (0)
    /* Saturating: a long digit run must not overflow into a negative or
     * wrapped value that then passes the range checks below. Values arrive from
     * JS, but a set_param key is reachable from the remote UI too. */
    #define PA_UINT(p, out) do { \
        (out) = 0; \
        while (*(p) >= '0' && *(p) <= '9') { \
            if ((out) < 1000000) (out) = (out) * 10 + (*(p) - '0'); \
            (p)++; \
        } \
    } while (0)

    /* Read a target token: everything up to the next space. */
    #define PA_TARGET(p, buf) do { \
        int _i = 0; \
        PA_SKIP_SPACE(p); \
        while (*(p) && *(p) != ' ' && _i < PA_TARGET_LEN - 1) (buf)[_i++] = *(p)++; \
        (buf)[_i] = '\0'; \
    } while (0)

    char tgt[PA_TARGET_LEN];
    const char *p = val;

    /* pa_set: "<clip> <target> <tick> <value>" — write one point. This is both
     * the p-lock write and the live-recording write; they differ only in which
     * tick the caller names. */
    if (!strcmp(sub, "pa_set")) {
        int clip = 0, tick = 0, v = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, tick);
        PA_SKIP_SPACE(p); PA_UINT(p, v);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        int id = pa_target_id(inst, tgt);
        if (!pa_may_write(inst, tidx, id)) return 1;
        pa_entry_t *e = pa_get(inst, tidx, clip, id);
        if (!e) { inst->pa_store_full = 1; return 1; }
        if (!pa_set_point(e, (uint16_t)tick, (uint16_t)v)) inst->pa_store_full = 1;
        e->last_sent_valid = 0;   /* the knob that wrote this also moved the live value */
        pa_mark_dirty(inst);
        return 1;
    }

    /* pa_set2: "<clip> <target> <from> <to> <value>" — write a flat span,
     * replacing anything already in it. The multi-step p-lock (hold several
     * steps, turn once) and a held-value overwrite both land here. */
    if (!strcmp(sub, "pa_set2")) {
        int clip = 0, from = 0, to = 0, v = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, from);
        PA_SKIP_SPACE(p); PA_UINT(p, to);
        PA_SKIP_SPACE(p); PA_UINT(p, v);
        if (clip < 0 || clip >= NUM_CLIPS || to < from) return 1;
        int id = pa_target_id(inst, tgt);
        if (!pa_may_write(inst, tidx, id)) return 1;
        pa_entry_t *e = pa_get(inst, tidx, clip, id);
        if (!e) { inst->pa_store_full = 1; return 1; }
        pa_clear_range(e, (uint16_t)from, (uint16_t)to);
        if (!pa_set_point(e, (uint16_t)from, (uint16_t)v)) inst->pa_store_full = 1;
        e->last_sent_valid = 0;   /* see pa_set */
        pa_mark_dirty(inst);
        return 1;
    }

    /* pa_live: "<target> <value>" — a knob under a hand moved to <value>. The
     * store decides what that means from its own flags: recording, it is
     * written along the playhead until release; otherwise it overrides, and
     * playback resumes on release. Addresses the track's ACTIVE clip, because
     * the playhead is there. */
    if (!strcmp(sub, "pa_live")) {
        int v = 0;
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, v);
        int id = pa_target_id(inst, tgt);
        if (id < 0) { inst->pa_store_full = 1; return 1; }
        if (!pa_may_write(inst, tidx, id)) return 1;
        if (v > PA_VAL_MAX) v = PA_VAL_MAX;
        pa_live_set(inst, tr, tidx, id, (uint16_t)v, 0);
        return 1;
    }

    /* pa_hold: "<target>" — a hand is on the knob dialling a LOCK. Playback
     * leaves the target alone until pa_live_end, and nothing is recorded:
     * the lock write is the whole of what the gesture means. Without this
     * the playhead keeps re-asserting the automation value underneath the
     * hand — the value jumps away mid-dial. */
    if (!strcmp(sub, "pa_hold")) {
        PA_TARGET(p, tgt);
        int id = pa_target_id(inst, tgt);
        if (id < 0) { inst->pa_store_full = 1; return 1; }
        pa_live_set(inst, tr, tidx, id, 0, 1);
        return 1;
    }

    /* pa_live_end: "<target>" — the hand is off. */
    if (!strcmp(sub, "pa_live_end")) {
        PA_TARGET(p, tgt);
        int id = pa_target_id(inst, tgt);
        if (id >= 0) pa_live_end(inst, tidx, (int)tr->active_clip, id);
        return 1;
    }

    /* pa_rest: "<clip> <target> <value>" — the value the parameter held before
     * automation existed, restored on stop / deactivate / clear. Recorded once;
     * a second write does not move it, or stopping would restore whatever the
     * automation last happened to play. */
    if (!strcmp(sub, "pa_rest")) {
        int clip = 0, v = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, v);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_entry_t *e = pa_get(inst, tidx, clip, pa_target_id(inst, tgt));
        if (!e) { inst->pa_store_full = 1; return 1; }
        if (e->rest == PA_VAL_UNSET) { e->rest = (uint16_t)v; pa_mark_dirty(inst); }
        return 1;
    }

    /* pa_clear_key: "<clip> <target>" — Delete + knob touch. Removes ALL of
     * that parameter's automation in the clip, locks and recorded alike. */
    if (!strcmp(sub, "pa_clear_key")) {
        int clip = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_entry_t *e = pa_find(inst, tidx, clip, pa_target_id(inst, tgt));
        if (e) { pa_entry_free(e); pa_mark_dirty(inst); }
        return 1;
    }

    /* pa_clear_step: "<clip> <from> <to>" — Delete + step. Clears EVERY
     * parameter's points in that tick span, which is the one-gesture meaning of
     * "delete what is automated here". */
    if (!strcmp(sub, "pa_clear_step")) {
        int clip = 0, from = 0, to = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_SKIP_SPACE(p); PA_UINT(p, from);
        PA_SKIP_SPACE(p); PA_UINT(p, to);
        if (clip < 0 || clip >= NUM_CLIPS || to < from) return 1;
        for (int i = 0; i < PA_MAX_ENTRIES; i++) {
            pa_entry_t *e = &inst->pa_entries[i];
            if (!e->used || e->track != tidx || e->clip != clip) continue;
            pa_clear_range(e, (uint16_t)from, (uint16_t)to);
            if (!e->count) pa_entry_free(e);
        }
        pa_mark_dirty(inst);
        return 1;
    }

    /* pa_clear: "<clip>" — every parameter's automation in the clip. */
    if (!strcmp(sub, "pa_clear")) {
        int clip = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_clear_track_clip(inst, tidx, clip);
        pa_mark_dirty(inst);
        return 1;
    }

    /* pa_active: "<clip> <target> <0|1>" — Mute + knob touch. Deactivate keeps
     * the automation and stops playing it; the parameter returns to rest. */
    if (!strcmp(sub, "pa_active")) {
        int clip = 0, on = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, on);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_entry_t *e = pa_find(inst, tidx, clip, pa_target_id(inst, tgt));
        if (e) {
            if (on) e->flags |= PA_FLAG_ACTIVE; else e->flags &= (uint8_t)~PA_FLAG_ACTIVE;
            pa_mark_dirty(inst);
        }
        return 1;
    }

    /* pa_smooth: "<clip> <target> <0|1>" — stepped hold vs linear. */
    if (!strcmp(sub, "pa_smooth")) {
        int clip = 0, on = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, on);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_entry_t *e = pa_find(inst, tidx, clip, pa_target_id(inst, tgt));
        if (e) {
            if (on) e->flags |= PA_FLAG_SMOOTH; else e->flags &= (uint8_t)~PA_FLAG_SMOOTH;
            pa_mark_dirty(inst);
        }
        return 1;
    }

    /* pa_loop: "<clip> <target> <len> <off> <res>" — the independent loop
     * window and resolution. Nothing in v1's UI writes this; the key exists so
     * the store, its file format and its playback path all carry the feature
     * from the start, and restoring per-parameter polymetric automation later
     * is UI work rather than a storage change. */
    if (!strcmp(sub, "pa_loop")) {
        int clip = 0, len = 0, off = 0, res = 0;
        PA_SKIP_SPACE(p); PA_UINT(p, clip);
        PA_TARGET(p, tgt);
        PA_SKIP_SPACE(p); PA_UINT(p, len);
        PA_SKIP_SPACE(p); PA_UINT(p, off);
        PA_SKIP_SPACE(p); PA_UINT(p, res);
        if (clip < 0 || clip >= NUM_CLIPS) return 1;
        pa_entry_t *e = pa_find(inst, tidx, clip, pa_target_id(inst, tgt));
        if (e) {
            e->loop_len   = (uint16_t)len;
            e->loop_off   = (uint16_t)off;
            e->resolution = (uint16_t)res;
            pa_mark_dirty(inst);
        }
        return 1;
    }

    #undef PA_SKIP_SPACE
    #undef PA_UINT
    #undef PA_TARGET

    /* An unrecognised pa_ key is consumed, not passed on — see the header. */
    return 1;
}
