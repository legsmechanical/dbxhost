/* FILE-SCOPE HANDLER for set_param()'s tN_ misc keys -- part of the seq8.c
 * single translation unit; #included at FILE scope by seq8_set_param.c
 * (immediately before set_param), NOT a standalone TU; never compile or lint
 * this file on its own. Ninth (final tN_) Stage B handler (phase 4B group 9):
 * the former mid-function segment is now a real static int
 * sp_track_misc(sp_ctx_t *).
 * Covers the melodic-clip transforms tN_ clip_length ... lgto_apply plus the
 * pfx_set catch-all tail. See also sp_track_clip.c (the per-clip tN_cC_* data
 * block incl. the nested step parser).
 * TERMINAL tN_ handler: the unconditional pfx_set catch-all at the tail
 * consumes EVERY tN_ key that reaches this far, so this handler ALWAYS
 * returns 1 -- there is no fall-through path and no `return 0`. The two
 * closing braces that used to live at this segment's tail (the tN_ block's
 * `}` and set_param's `}`) now live in the parent dispatcher
 * (seq8_set_param.c) at the dispatch site. */
static int sp_track_misc(sp_ctx_t *cx) {
    seq8_instance_t *inst = cx->inst;
    const char *val = cx->val;
    int tidx = cx->tidx;
    seq8_track_t *tr = cx->tr;
    const char *sub = cx->sub;

    if (!strcmp(sub, "clip_length")) {
        clip_t *cl = &tr->clips[tr->active_clip];
        int max_len = SEQ_STEPS - (int)cl->loop_start;
        if (max_len < 1) max_len = 1;
        cl->length = (uint16_t)clamp_i(my_atoi(val), 1, max_len);
        {
            uint16_t _le = (uint16_t)(cl->loop_start + cl->length);
            if (tr->current_step < cl->loop_start || tr->current_step >= _le)
                tr->current_step = cl->loop_start;
        }
        inst->state_dirty = 1;   /* persisted; the drum twin marks it too */
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    /* Playback direction for active melodic clip (v=35).
     * 0=Forward, 1=Backward, 2=Pingpong-Forward, 3=Pingpong-Backward.
     * Mid-flight change keeps the current playhead position; pp_dir_state
     * resets so PP modes pick up a sane direction on the next advance. */
    if (!strcmp(sub, "clip_playback_dir")) {
        clip_t *cl = &tr->clips[tr->active_clip];
        cl->playback_dir = (uint8_t)clamp_i(my_atoi(val), 0, 3);
        cl->pp_dir_state = initial_pp_dir(cl->playback_dir);
        silence_track_from_set_param(inst, tr);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }
    /* Playback style for active melodic clip: 0=Step, 1=Audio (note-on at
     * note's end when playhead is in reverse motion). */
    if (!strcmp(sub, "clip_playback_audio_reverse")) {
        clip_t *cl = &tr->clips[tr->active_clip];
        cl->playback_audio_reverse = (uint8_t)clamp_i(my_atoi(val), 0, 1);
        inst->state_dirty = 1;
        return 1;
    }

    if (!strcmp(sub, "clock_shift")) {
        int dir = my_atoi(val);
        clip_t *cl = &tr->clips[tr->active_clip];
        int len = (int)cl->length;
        if (len < 2) return 1;
        /* Needs the loop at step 1 — the UI says CROP FIRST. */
        if (cl->loop_start) return 1;
        clip_rotate_window(cl, dir);
        /* Note link: the same rotation, one step, inside the loop window. */
        pa_link_rotate(inst, tidx, (int)tr->active_clip, 0,
                       (uint32_t)cl->loop_start * cl->ticks_per_step,
                       dir == 1 ? (int32_t)cl->ticks_per_step : -(int32_t)cl->ticks_per_step,
                       (uint32_t)len * cl->ticks_per_step);
        clip_migrate_to_notes(cl);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    if (!strcmp(sub, "nudge")) {
        int dir = my_atoi(val);
        if (dir == 0) { tr->clips[tr->active_clip].nudge_pos = 0; return 1; }
        if (dir != 1 && dir != -1) return 1;
        clip_t *cl = &tr->clips[tr->active_clip];
        if (cl->loop_start) return 1;   /* needs the loop at step 1 (CROP FIRST) */
        int len = (int)cl->length;
        if (len < 1) return 1;
        /* Melodic crosses a step only PAST its midpoint — the step overlay's
         * threshold (a drum lane crosses AT it). */
        clip_nudge_window(cl, dir, 0);
        /* Note link: a note moved by `dir` ticks, wrapping round the loop window. */
        pa_link_rotate(inst, tidx, (int)tr->active_clip, 0,
                       (uint32_t)cl->loop_start * cl->ticks_per_step, dir,
                       (uint32_t)len * cl->ticks_per_step);
        clip_migrate_to_notes(cl);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    if (!strcmp(sub, "beat_stretch")) {
        int dir = my_atoi(val);
        clip_t *cl = &tr->clips[tr->active_clip];
        /* x2 / /2 inside the loop window, anchored at its start. x2 is refused
         * when the doubled window would pass the last step; /2 is BLOCKED
         * (stretch_blocked, which JS reads) when two active steps would land
         * on one — then nothing moves at all. Needs the loop at step 1 (CROP
         * FIRST), both ways. */
        if (cl->loop_start) return 1;
        int can = clip_stretch_check(cl, dir == 1 ? 1 : -1);
        if (can == 0) return 1;
        if (can < 0) { tr->stretch_blocked = (can == -2) ? 2 : 1; return 1; }
        tr->stretch_blocked = 0;
        clip_stretch_window(cl, dir == 1 ? 1 : -1);
        /* Note link — only past the check: a blocked compress moved no notes,
         * so it moves no automation. Scaled from the window's start. */
        pa_link_scale(inst, tidx, (int)tr->active_clip, 0,
                      (uint32_t)cl->loop_start * cl->ticks_per_step,
                      dir == 1 ? 2 : 1, dir == 1 ? 1 : 2);

        {
            uint16_t _le = (uint16_t)(cl->loop_start + cl->length);
            if (tr->current_step < cl->loop_start || tr->current_step >= _le)
                tr->current_step = cl->loop_start;
            /* Beat Stretch changes cl->length; re-anchor the playhead to the
             * master clock during playback so the resized clip's loop wrap stays
             * in phase with the master bar and the other tracks (same fix as the
             * _length / _loop_set handlers). Without this the clip drifts out of
             * sync after a mid-play stretch. Direction-aware via the helper. */
            if (inst->playing)
                melodic_anchor_playhead(inst, tr, cl);
        }

        clip_migrate_to_notes(cl);

        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    if (!strcmp(sub, "loop_double_fill")) {
        clip_t *cl = &tr->clips[tr->active_clip];
        int len = (int)cl->length;
        int ls  = (int)cl->loop_start;
        int i;
        /* Doubling the loop window must fit inside storage from loop_start.
         * Old check `len*2 > SEQ_STEPS` ignored loop_start; with ls>0 it
         * would accept doublings that overflow the storage extent. */
        if (ls + len * 2 > SEQ_STEPS) return 1;
        undo_begin_single(inst, tidx, (int)tr->active_clip);
        /* Copy the loop window forward by `len` steps so the doubled window
         * [ls, ls+len*2) holds two copies of the original content. Old
         * code wrote steps[len..2len-1] from steps[0..len-1] — only
         * correct when loop_start == 0. */
        for (i = 0; i < len; i++) {
            int src = ls + i;
            int dst = ls + len + i;
            cl->steps[dst]           = cl->steps[src];
            memcpy(cl->step_notes[dst], cl->step_notes[src], 8);
            cl->step_note_count[dst] = cl->step_note_count[src];
            cl->step_vel[dst]        = cl->step_vel[src];
            cl->step_gate[dst]       = cl->step_gate[src];
            memcpy(cl->note_tick_offset[dst], cl->note_tick_offset[src], 8 * sizeof(int16_t));
        }
        /* Note link: the window's automation copied forward with its notes. */
        pa_link_copy(inst, tidx, (int)tr->active_clip, 0,
                     (uint32_t)ls * cl->ticks_per_step, (uint32_t)(ls + len) * cl->ticks_per_step,
                     (uint32_t)len * cl->ticks_per_step);
        cl->length = (uint16_t)(len * 2);
        {
            uint16_t _le = (uint16_t)(cl->loop_start + cl->length);
            if (tr->current_step < cl->loop_start || tr->current_step >= _le)
                tr->current_step = cl->loop_start;
        }
        clip_migrate_to_notes(cl);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    /* tN_crop: the loop window becomes the whole clip (clip_crop_window) —
     * its steps move to step 1, everything outside is removed, the length
     * stays — and linked automation follows the notes. Undoable. Nothing to
     * crop: no snapshot, nothing changes. */
    if (!strcmp(sub, "crop")) {
        clip_t *cl = &tr->clips[tr->active_clip];
        if (!clip_crop_needed(cl)) return 1;
        undo_begin_single(inst, tidx, (int)tr->active_clip);
        const uint32_t tps = cl->ticks_per_step;
        const uint16_t ls  = cl->loop_start;
        /* the window, read before the crop resets loop_start */
        pa_link_crop(inst, tidx, (int)tr->active_clip, 0,
                     (uint32_t)ls * tps, (uint32_t)cl->length * tps);
        clip_crop_window(cl);
        if (tr->current_step >= ls && tr->current_step < ls + cl->length)
            tr->current_step = (uint16_t)(tr->current_step - ls);
        else
            tr->current_step = 0;
        if (inst->playing)
            melodic_anchor_playhead(inst, tr, cl);
        clip_migrate_to_notes(cl);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    /* tN_lgto_apply: destructive legato on the active clip. Each note's
     * gate becomes (next-active-tick − this-tick); last-active note's
     * gate fills to clip_end. Undoable. */
    if (!strcmp(sub, "lgto_apply")) {
        if (tr->clips[tr->active_clip].loop_start) return 1;   /* CROP FIRST */
        undo_begin_single(inst, tidx, (int)tr->active_clip);
        apply_legato_to_clip(&tr->clips[tr->active_clip]);
        pfx_sync_from_clip(tr);
        inst->state_dirty = 1;
        rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
        return 1;
    }

    /* Snapshot before pfx reset commands.
     * ⚠⚠ `pfx_seq_arp_reset` WAS MISSING HERE, so resetting the SEQ ARP bank took
     * no snapshot and Undo reverted whatever older edit still sat in the slot.
     * Its parameters live in `clip_pfx_params_t` like the other three, so one
     * strcmp makes the whole bank undoable — values AND automation. */
    if (!strcmp(sub, "pfx_reset") || !strcmp(sub, "pfx_noteFx_reset") ||
        !strcmp(sub, "pfx_harm_reset") || !strcmp(sub, "pfx_delay_reset") ||
        !strcmp(sub, "pfx_seq_arp_reset"))
        undo_begin_single(inst, tidx, (int)tr->active_clip);
    /* All play effects params */
    pfx_set(inst, tr, &tr->clips[tr->active_clip].pfx_params, sub, val);
    /* Persisted in the clip, so the deferred save must see it. Its remote
     * (tN_cC_pfx_set) and lane (tN_lL_pfx_set) twins already marked it; this,
     * the path every device bank knob takes, did not — the edit survived only
     * a suspend or a project switch. */
    inst->state_dirty = 1;
    /* pfx values are snapshot-visible (rui_pfx) — every catch-all edit must
     * notify the remote UI (this whole handler previously never bumped:
     * clip_length/dir/clock_shift/nudge/beat_stretch/legato/pfx edits were
     * invisible to the browser until an unrelated rev bump — the 2026-07-19
     * "remote UI lags far behind the device" root cause). */
    rui_mark_rec(inst, tr, tidx, (int)tr->active_clip);
    return 1;
}
