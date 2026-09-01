/* FILE-SCOPE GLOBALS HANDLER for set_param()'s global state keys -- part of
 * the seq8.c single translation unit; #included at FILE scope by
 * seq8_set_param.c (before set_param), NOT a standalone TU; never compile or
 * lint this file on its own. First GLOBALS handler (phase 4B group 10):
 * dispatched BEFORE the tN_ block, so it uses only inst/key/val (never
 * tidx/tr/sub -- they aren't in scope at the globals dispatch point).
 * Covers GLOBAL-key branches: debug_log, save, state_path, state_load.
 * Each is a top-level `strcmp(key,...)` branch.
 * Returns 1 when it handled the key (caller returns from set_param), 0 to
 * fall through to the remaining globals segments / the tN_ block. */
/* ⚠ The orphan pruner (`prune_orphan_states`) and its liveness helper
 * (`seq8_set_uuid_alive`) are GONE (Phase B, 2026-08-12). They existed because
 * state lived in a tree PARALLEL to the projects, keyed by uuid, where a
 * deleted set left its state behind. State now lives INSIDE the set dir
 * (SEQ8_SET_STATE_FMT), so an orphan cannot exist: no set, no state. The whole
 * class — liveness tests, four alive-roots, the "unverifiable counts as ALIVE"
 * asymmetry — retires with the parallel tree.
 * (Leftover seq8sa-* files from the old location remain in the stock host's
 * set_state/ tree on devices that ran earlier builds; they are inert KB-scale
 * history, in a SHARED tree we no longer touch. Do not write a cleaner for
 * them there — that tree holds stock's own state.) */

static int sp_globals_state(sp_ctx_t *cx) {
    seq8_instance_t *inst = cx->inst;
    const char *key = cx->key;
    const char *val = cx->val;

    if (!strcmp(key, "debug_log")) {
        seq8_ilog(inst, val);
        return 1;
    }

    if (!strcmp(key, "save")) {
        inst->xpose_preview_active = 0;  /* defensive: never persist/leave a preview stuck on suspend */
        if (!inst->state_version_mismatch) {
            seq8_save_state(inst);
            /* Automation is a second file in the project directory and must
             * travel with the first through every save path, or a suspend
             * persists the notes and loses the automation. */
            pa_save(inst);
        }
        return 1;
    }

    /* Walk /data/UserData/schwung/set_state/ and remove seq8-state.json +
     * seq8-ui-state.json for any UUID-named subdir whose corresponding Move
     * set folder no longer exists. Leaves Schwung core's master_fx_*.json,
     * shadow_chain_config.json, slot_*.json untouched. */

    if (!strcmp(key, "state_path")) {
        strncpy(inst->state_path, val, sizeof(inst->state_path) - 1);
        inst->state_path[sizeof(inst->state_path) - 1] = '\0';
        /* A raw path carries no set identity — clear rather than leave the
         * previous set's uuid answering for a file it does not describe. */
        inst->state_uuid[0] = '\0';
        /* The project we point at just changed, so its automation follows.
         * pa_load resets the store before reading, so pointing at a project
         * with no auto file leaves no automation rather than the previous
         * project's. */
        pa_load(inst);
        seq8_ilog(inst, inst->state_path);
        return 1;
    }

    if (!strcmp(key, "state_load")) {
        /* val is the UUID from JS (36 chars); construct path from it. Fallback if empty.
         * state_uuid tracks every assignment — it is what get_param "state_uuid"
         * serves, and the fallback path genuinely has no set, so it clears. */
        if (val && val[0]) {
            snprintf(inst->state_path, sizeof(inst->state_path),
                     SEQ8_SET_STATE_FMT, val);
            snprintf(inst->state_uuid, sizeof(inst->state_uuid), "%s", val);
        } else {
            strncpy(inst->state_path, SEQ8_STATE_PATH_FALLBACK,
                    sizeof(inst->state_path) - 1);
            inst->state_uuid[0] = '\0';
        }
        seq8_ilog(inst, inst->state_path);
        /* Reset internal state without MIDI panic to avoid flooding the MIDI buffer. */
        {
            int t2, c2;
            inst->merge_state      = MERGE_STATE_IDLE;
            inst->merge_solo_track = 0xFF;
            for (t2 = 0; t2 < NUM_TRACKS; t2++) inst->merge_pending_count[t2] = 0;
            capture_clear(inst);
            inst->cap_select_active = 0;
            inst->playing        = 0;
            inst->count_in_ticks = 0;
            for (t2 = 0; t2 < NUM_TRACKS; t2++) {
                seq8_track_t *tr2 = &inst->tracks[t2];
                tr2->note_active         = 0;
                tr2->pending_note_count  = 0;
                tr2->pfx.event_count     = 0;
                memset(tr2->pfx.active_notes, 0, sizeof(tr2->pfx.active_notes));
                tr2->clip_playing        = 0;
                tr2->will_relaunch       = 0;
                tr2->pending_page_stop   = 0;
                tr2->record_armed        = 0;
                tr2->recording           = 0;
                tr2->queued_clip         = -1;
                tr2->active_clip         = 0;
                tr2->current_step        = 0;
                tr2->step_dispatch_mask  = 0;
                tr2->next_early_mask     = 0;
                tr2->drum_repeat_active  = 0;
                tr2->drum_repeat2_active = 0;
                /* Reset pad_mode to the create_instance default so Clear Session
                 * (v=0 state file → seq8_load_state deletes file, leaves in-memory
                 * track state untouched) doesn't leave previously-drum tracks
                 * stuck in drum mode. JS re-pushes t0_pad_mode=DRUM after the
                 * pendingDspSync drain via restoreUiSidecar's first-run defaults
                 * branch, so t0 still ends up in DRUM as expected; t1-7 stay
                 * MELODIC. For valid v=28 files, seq8_load_state below overwrites
                 * this with the saved value. */
                tr2->pad_mode            = PAD_MODE_MELODIC_SCALE;
                tr2->active_drum_lane    = 0;
                tr2->drum_perform_mode   = 0;
                /* Additional track-config fields that also drift after Clear
                 * Session if not reset here. JS doClearSession resets the JS
                 * mirrors but never pushes them to DSP; for v=0 (cleared) state
                 * files seq8_load_state leaves in-memory values untouched. */
                /* track N → ch N (tracks 1-4 → ch 1-4 for Move, tracks 5-8 →
                 * ch 5-8 for Schwung). */
                tr2->channel             = (uint8_t)t2;
                tr2->pad_octave          = 3;
                tr2->pfx.looper_on       = 1;
                tr2->pfx.route           = (t2 < 4) ? ROUTE_MOVE : ROUTE_SCHWUNG;
                /* The track's OWN instrument, 1:1 — the same default a fresh
                 * instance gets. Neither was reset here before: a cleared
                 * session inherited the previous set's slot and, once
                 * `MIDI to Track N` existed, its follow target too — so Clear
                 * Session could leave a track playing another track's
                 * instrument with nothing on screen having asked for it. */
                tr2->pfx.slot            = (uint8_t)(t2 % SEQ8_CHAIN_SLOTS);  /* own chain; modulo is a bound */
                tr2->pfx.midi_to         = 0;
                { int _rl; for (_rl = 0; _rl < DRUM_LANES; _rl++) {
                    tr2->drum_lane_pfx[_rl].route   = tr2->pfx.route;
                    tr2->drum_lane_pfx[_rl].slot    = tr2->pfx.slot;
                    tr2->drum_lane_pfx[_rl].midi_to = 0;
                } }
                for (c2 = 0; c2 < NUM_CLIPS; c2++)
                    clip_init(&tr2->clips[c2]);
                /* CC automation isn't part of clip_t — reset it explicitly so
                 * points don't accumulate (loader appends) and rest_val
                 * defaults back to "—" across set switches. */
                for (c2 = 0; c2 < NUM_CLIPS; c2++)
                    cc_auto_reset(&tr2->clip_cc_auto[c2]);
                for (c2 = 0; c2 < NUM_CLIPS; c2++)
                    at_auto_reset(&tr2->clip_at_auto[c2]);
                memset(tr2->cc_type, 0, 8);
                memset(tr2->cc_auto_last_sent, 0xFF, 8);
                memset(tr2->cc_auto_cur_val, 0xFF, 8);
                memset(tr2->at_last_sent, 0xFF, AT_MAX_LANES);
                drum_clips_reset(tr2);  /* clear-and-keep: snapshot may read concurrently */
                drum_track_init(tr2, t2);
                { int _rl; for (_rl = 0; _rl < DRUM_LANES; _rl++) {
                    tr2->drum_lane_pfx[_rl].route   = tr2->pfx.route;
                    tr2->drum_lane_pfx[_rl].slot    = tr2->pfx.slot;
                    tr2->drum_lane_pfx[_rl].midi_to = 0;
                } }
                drum_repeat_init_defaults(tr2);
                /* TRACK ARP (TARP) per-track state — wasn't reset, so latched
                 * TARP, held chord, and style/rate would carry across Clear
                 * Session. tarp_init_defaults zeroes tarp_on, tarp_latch,
                 * tarp_sync, style, retrigger, and clears the held buffer +
                 * runtime via arp_clear_runtime. tarp_physical is a runtime
                 * flag not touched by tarp_init_defaults; clear explicitly. */
                tarp_init_defaults(tr2);
                tr2->tarp_physical = 0;
                memcpy(tr2->cc_assign, CC_ASSIGN_DEFAULT, 8);
                tr2->track_vel_override = 0;
                tr2->drum_inp_quant     = 0;
                tr2->drum_repeat_sync   = 1;
            }
        }
        inst->pad_key         = 9;
        inst->pad_scale       = 1;
        inst->launch_quant    = 0;
        inst->scale_aware     = 0;
        inst->inp_quant       = 0;
        inst->midi_in_channel = 0;
        inst->metro_on        = 1;
        inst->metro_vol       = 80;
        inst->swing_amt       = 0;
        inst->swing_res       = 0;
        memset(inst->mute, 0, NUM_TRACKS);
        memset(inst->solo, 0, NUM_TRACKS);
        inst->conductor_track = -1;
        inst->conductor_sounding = 0;
        inst->conductor_off_deg  = 0;
        inst->conductor_off_semi = 0;
        inst->conductor_held     = 0;
        { int _sn;
          for (_sn = 0; _sn < 16; _sn++) {
              inst->snap_valid[_sn] = 0;
              memset(inst->snap_mute[_sn], 0, NUM_TRACKS);
              memset(inst->snap_solo[_sn], 0, NUM_TRACKS);
              memset(inst->snap_drum_eff_mute[_sn], 0, NUM_TRACKS * sizeof(uint32_t));
          }
        }
        /* Fields the LOADER defaults but this reset block did not. A missing or
         * empty state file makes seq8_load_state return before its default
         * assignments run, so anything defaulted only in there survives the
         * switch and lands in the brand-new project — the "not a clean slate"
         * class. Reset here, where the file's existence cannot matter; a valid
         * file still overwrites these below. */
        inst->clock_follow_on      = 0;
        inst->clock_send_on        = 0;
        inst->xpose_preview_active = 0;
        {
            /* Same derivation as create_instance: prefer the host's live tempo,
             * fall back to the compiled default. */
            double init_bpm = (g_host && g_host->get_bpm)
                ? (double)g_host->get_bpm() : (double)BPM_DEFAULT;
            int _t3, _bl3;
            if (init_bpm < 20.0 || init_bpm > 300.0) init_bpm = (double)BPM_DEFAULT;
            inst->tick_delta = (uint32_t)((double)MOVE_FRAMES_PER_BLOCK * init_bpm * (double)PPQN);
            for (_t3 = 0; _t3 < NUM_TRACKS; _t3++) {
                inst->tracks[_t3].pfx.cached_bpm = init_bpm;
                for (_bl3 = 0; _bl3 < DRUM_LANES; _bl3++)
                    inst->tracks[_t3].drum_lane_pfx[_bl3].cached_bpm = init_bpm;
            }
        }
        seq8_load_state(inst);
        /* Same file, same moment: a project's automation is loaded with it.
         * pa_load resets the store first, so a project with no auto file
         * (every project predating this, and every one without automation)
         * correctly ends up with none rather than inheriting the last one's. */
        pa_load(inst);
        /* Whole-set content swap (incl. Clear Session via v=0 file): the
         * BROWSER must re-pull or it keeps showing the old set. CONTENT-ONLY
         * bump — the device JS initiated this load and runs its own
         * pendingDspSync; an rui_rev bump here would trigger a second,
         * redundant full resync (the 4.3s frozen-tick class). */
        rui_content(inst);
        return 1;
    }

    return 0;
}
