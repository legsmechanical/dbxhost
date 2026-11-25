/* seq8_pfx.c — pfx-chain note generation + scheduling (direct port from
 * NoteTwist) + playback-direction helpers.
 * Contents: conductor_transpose_gen, pfx_apply_notefx, pfx_build_harmz_copies,
 * pfx_build_gen_notes, pfx_sched_delay_ons/offs (NOTE FX / HARMZ / MIDI-DLY),
 * advance_clip_step, initial_clip_step, initial_pp_dir, clip_in_reverse_motion.
 * #include'd into seq8.c's single TU at the original position; never compiled
 * standalone. LEFT IN CORE (not contiguous with this block): pfx_send/pfx_emit,
 * the pfx event queue (pfx_spc/gate_smp/ticks_to_smp/q_insert/swing_offset/
 * q_fire), pfx_reset, pfx_note_on/off/off_imm — all interleaved with the
 * looper / conductor-offset / arp / must-stay playback-geometry functions. */
/* Transpose gen[] in place by the conductor offset for responder track t.
 * No-op if t isn't a responding melodic track or the conductor isn't sounding.
 * Mirrors the inline transpose currently in pfx_note_on. */
static void conductor_transpose_gen(seq8_instance_t *inst, int t,
                                    uint8_t *gen, int gc) {
    if (inst->conductor_track < 0 || !inst->conductor_sounding) return;
    if (t == inst->conductor_track) return;
    if (inst->tracks[t].pad_mode != PAD_MODE_MELODIC_SCALE) return;
    seq8_track_t *cnd = &inst->tracks[inst->conductor_track];
    clip_t *cc = &cnd->clips[cnd->active_clip];
    if (!cc->cond_resp[t]) return;
    int oct = cc->cond_oct[t];
    int i;
    for (i = 0; i < gc; i++) {
        if (inst->scale_aware) {
            int n = (int)SCALE_SIZES[eff_pad_scale(inst)];
            gen[i] = (uint8_t)scale_transpose(inst, gen[i],
                          inst->conductor_off_deg + oct * n);
        } else {
            gen[i] = (uint8_t)clamp_i((int)gen[i] +
                          inst->conductor_off_semi + oct * 12, 0, 127);
        }
    }
}

/* ------------------------------------------------------------------ */
/* Generated-note list (direct port from NoteTwist)                    */
/* ------------------------------------------------------------------ */

/* Pure NOTE FX pitch transform: track transpose + octave_shift + note_offset,
 * with scale awareness. Returns the post-NOTE-FX primary pitch (0..127).
 *
 * `transpose` is the TRACK's own semitone offset, applied FIRST and in raw
 * semitones. First because everything downstream — harmonies, arp, delay
 * repeats — should derive from the transposed note, so the track moves as one
 * rather than the offset landing on top of generated material. Raw because a
 * transpose that snapped to the scale would stop being a transpose.
 *
 * ⭑ Applying it here rather than at the emit point is also what makes it safe
 * against a change mid-note: the held-note tracker stores the pitch this
 * function returned, so a note-off replays the value its note-on used. Offset
 * the note on the way out instead and changing transpose while a key is held
 * sends a note-off that matches nothing — a stuck note.
 *
 * Bake passes 0: baking prints the NOTE FX chain into clip notes, and the track
 * transpose is not part of that chain — it stays applied at play time, so
 * baking it in would double it. */
static int pfx_apply_notefx(seq8_instance_t *inst, int scale_aware,
                             play_fx_t *fx, int orig_note, int transpose) {
    int base = orig_note + transpose + fx->octave_shift * 12;
    int n = scale_aware ? scale_transpose(inst, clamp_i(base, 0, 127), fx->note_offset)
                        : clamp_i(base + fx->note_offset, 0, 127);
    if (fx->note_random > 0) {
        int rng = fx->note_random;
        int lim = rng;
        if (scale_aware) {
            int sc = (int)SCALE_SIZES[eff_pad_scale(inst)];
            if (lim > sc) lim = sc;
        }
        switch (fx->note_random_mode) {
        default:
        case 0: /* Uniform */
            if (scale_aware) n = scale_transpose(inst, n, pfx_rand(fx, -lim, lim));
            else             n = clamp_i(n + pfx_rand(fx, -rng, rng), 0, 127);
            break;
        case 1: /* Gaussian — average of 3 uniform draws, stays in range */
            {
                int s = pfx_rand(fx, -lim, lim) + pfx_rand(fx, -lim, lim) + pfx_rand(fx, -lim, lim);
                int g = (s < 0 ? s - 1 : s + 1) / 3;
                if (scale_aware) n = scale_transpose(inst, n, g);
                else             n = clamp_i(n + g, 0, 127);
            }
            break;
        case 2: /* Walk — bounded random walk ±2 per step, clamped to ±lim */
            {
                int step = pfx_rand(fx, -2, 2);
                fx->note_random_walk = clamp_i(fx->note_random_walk + step, -lim, lim);
                if (scale_aware) n = scale_transpose(inst, n, fx->note_random_walk);
                else             n = clamp_i(n + fx->note_random_walk, 0, 127);
            }
            break;
        }
    }
    return n;
}

/* Build harmonize copies (octaver + h1 + h2) of a primary note already past NOTE FX.
 * out[0] = primary; subsequent slots are octaver/h1/h2 if set. Returns count. */
static int pfx_build_harmz_copies(seq8_instance_t *inst, int scale_aware,
                                   play_fx_t *fx, int primary, uint8_t *out) {
    int cnt = 0;
    out[cnt++] = (uint8_t)primary;

    if (fx->octaver != 0) {
        int o = primary + fx->octaver * 12;
        if (o >= 0 && o <= 127 && cnt < MAX_GEN_NOTES) out[cnt++] = (uint8_t)o;
    }
    if (fx->harmonize_1 != 0) {
        int h = scale_aware ? scale_transpose(inst, primary, fx->harmonize_1)
                            : primary + fx->harmonize_1;
        if (h >= 0 && h <= 127 && cnt < MAX_GEN_NOTES) out[cnt++] = (uint8_t)h;
    }
    if (fx->harmonize_2 != 0) {
        int h = scale_aware ? scale_transpose(inst, primary, fx->harmonize_2)
                            : primary + fx->harmonize_2;
        if (h >= 0 && h <= 127 && cnt < MAX_GEN_NOTES) out[cnt++] = (uint8_t)h;
    }
    if (fx->harmonize_3 != 0) {
        int h = scale_aware ? scale_transpose(inst, primary, fx->harmonize_3)
                            : primary + fx->harmonize_3;
        if (h >= 0 && h <= 127 && cnt < MAX_GEN_NOTES) out[cnt++] = (uint8_t)h;
    }
    return cnt;
}

static int pfx_build_gen_notes(seq8_instance_t *inst, int scale_aware,
                               play_fx_t *fx, int orig_note, int transpose,
                               uint8_t *out) {
    /* Audio: the pitch is a slice — nothing moves it, nothing doubles it. */
    if (fx->track_idx < NUM_TRACKS && pad_mode_sampled(inst->tracks[fx->track_idx].pad_mode)) {
        out[0] = (uint8_t)clamp_i(orig_note, 0, 127);
        return 1;
    }
    int primary = pfx_apply_notefx(inst, scale_aware, fx, orig_note, transpose);
    return pfx_build_harmz_copies(inst, scale_aware, fx, primary, out);
}

/* ------------------------------------------------------------------ */
/* Delay repeat scheduling (direct port from NoteTwist)                */
/* ------------------------------------------------------------------ */

/* A fixed-Gate echo waits for its note's end to send its off, as every echo
 * did before (see pfx_sched_delay_ons), when it is on a pitch its own note
 * sounds (pitch feedback 0, a harmony copy's pitch, any Audio echo), or while
 * SEQ ARP takes the track's notes: the arp holds notes by pitch, uncounted,
 * so an echo's early off would drop that pitch even while another note of
 * the track still holds it. */
static int pfx_echo_waits(const play_fx_t *fx, const pfx_active_t *an, int note) {
    int j;
    if (fx->arp.style != 0 && !(g_inst && fx->track_idx < NUM_TRACKS &&
                                pad_mode_sampled(g_inst->tracks[fx->track_idx].pad_mode))) return 1;
    for (j = 0; j < an->gen_count; j++) if ((int)an->gen_notes[j] == note) return 1;
    return 0;
}

static void pfx_sched_delay_ons(seq8_instance_t *inst, int scale_aware,
                                play_fx_t *fx, pfx_active_t *an,
                                uint64_t base_time, double sp) {
    if (fx->repeat_times == 0 || fx->delay_level == 0) return;
    int dclk = CLOCK_VALUES[fx->delay_time_idx];
    if (dclk == 0) return;

    an->spc = sp;
    int reps = clamp_i(fx->repeat_times, 0, MAX_REPEATS);
    an->stored_repeat_count = reps;

    double cumul     = 0.0;
    double cur_delay = (double)dclk * sp;
    int    cumul_pitch = 0;
    int    cumul_deg   = 0;
    int    rep_vel   = (int)an->orig_velocity * fx->delay_level / 127;
    int    fb_walk   = 0;

    int i;
    for (i = 0; i < reps; i++) {
        cumul += cur_delay;
        if ((uint64_t)(cumul + 0.5) > MAX_DELAY_SAMPLES) {
            an->stored_repeat_count = i;
            break;
        }

        {
            if (fx->fb_note_random > 0) {
                int rng = fx->fb_note_random;
                int lim = rng;
                if (scale_aware) {
                    int sc = (int)SCALE_SIZES[eff_pad_scale(inst)];
                    if (lim > sc) lim = sc;
                }
                switch (fx->fb_note_random_mode) {
                default:
                case 0: /* Uniform */
                    if (scale_aware) cumul_deg   = pfx_rand(fx, -lim, lim);
                    else             cumul_pitch = pfx_rand(fx, -rng, rng);
                    break;
                case 1: /* Gaussian — average of 3 uniform draws */
                    {
                        int s = pfx_rand(fx, -lim, lim) + pfx_rand(fx, -lim, lim) + pfx_rand(fx, -lim, lim);
                        int g = (s < 0 ? s - 1 : s + 1) / 3;
                        if (scale_aware) cumul_deg   = g;
                        else             cumul_pitch = g;
                    }
                    break;
                case 2: /* Walk — drift ±2 per repeat, clamped to ±lim */
                    fb_walk = clamp_i(fb_walk + pfx_rand(fx, -2, 2), -lim, lim);
                    if (scale_aware) cumul_deg   = fb_walk;
                    else             cumul_pitch = fb_walk;
                    break;
                }
            } else {
                if (scale_aware) cumul_deg   += fx->fb_note;
                else             cumul_pitch += fx->fb_note;
            }
        }
        if (fx->track_idx < NUM_TRACKS && pad_mode_sampled(inst->tracks[fx->track_idx].pad_mode)) {
            an->reps[i].pitch_offset = 0;      /* an echo replays its slice */
        } else {
            int pitch = (scale_aware && an->gen_count > 0)
                ? scale_transpose(inst, (int)an->gen_notes[0], cumul_deg) - (int)an->gen_notes[0]
                : cumul_pitch;
            an->reps[i].pitch_offset = (int8_t)clamp_i(pitch, -127, 127);
        }

        if (i > 0) rep_vel += fx->fb_velocity;
        rep_vel = clamp_i(rep_vel, 1, 127);
        an->reps[i].velocity = (uint8_t)rep_vel;

        if (fx->fb_gate_time > 0)
            an->reps[i].gate_factor = -(double)GATE_FIXED_TICKS[fx->fb_gate_time - 1] * (double)TICKS_TO_480PPQN * sp;
        else
            an->reps[i].gate_factor = 1.0;

        an->reps[i].cumul_delay = (uint64_t)(cumul + 0.5);

        uint64_t ft   = base_time + an->reps[i].cumul_delay;
        ft += swing_offset_for_fire_at(g_inst, (int)fx->track_idx, fx->sample_counter, ft);

        uint8_t  on_s = (uint8_t)(0x90 | an->channel);
        /* A fixed echo Gate ends the echo on its own, now: its note-off is
         * queued with its note-on — both or neither, so a full queue cannot
         * keep the one without the other. (It used to wait for the note it
         * echoes to end, like a note-gate echo's, so a short Gate rang until
         * the note was released — ruled a bug 2026-11-25: short means short.) */
        /* Its off is timed from its own (swung) on, so it can never go out
         * first. An echo on a pitch its note still holds keeps the old
         * timing (pfx_sched_delay_offs, at the note's end): the held pitch
         * sounds on anyway, and an early off would take that pitch out of
         * SEQ ARP's held notes, or cut an Audio slice (an Audio echo is
         * silent and on its note's own pitch) — pfx_echo_waits. */
        const int fixed = an->reps[i].gate_factor < 0.0;
        uint64_t off = 0;
        if (fixed) {
            double rg = -an->reps[i].gate_factor;
            if (rg < 1.0) rg = 1.0;
            off = ft + (uint64_t)(rg + 0.5);
        }
        int j;
        an->reps[i].fire_at = ft;
        an->reps[i].qn = (uint8_t)an->gen_count;
        an->reps[i].waits = 0;
        for (j = 0; j < an->gen_count; j++) {
            int note = clamp_i((int)an->gen_notes[j] + an->reps[i].pitch_offset, 0, 127);
            const int pair = fixed && !pfx_echo_waits(fx, an, note);
            an->reps[i].qpitch[j] = (uint8_t)note;
            /* both or neither: a pair needs two slots now; a waiting echo
             * needs one now and keeps one free for its off (a dropped off
             * would leave it ringing) */
            if (fx->event_count + 2 > MAX_PFX_EVENTS) continue;   /* neither: nothing waits */
            if (!pair) an->reps[i].waits |= (uint8_t)(1u << j);
            pfx_q_insert(fx, ft, on_s, (uint8_t)note, an->reps[i].velocity, pair ? PFX_EV_ECHO : PFX_EV_ECHO | PFX_EV_WAITS);
            if (pair) pfx_q_insert(fx, off, (uint8_t)(0x80 | an->channel), (uint8_t)note, 0, 0);
        }

        cur_delay *= (1.0 + fx->fb_clock / 100.0);
        if (cur_delay < 1.0) cur_delay = 1.0;
    }
}

/* Schedule note-offs for all delay repeats. Called when original note-off
 * arrives. base_time is the note-on time. */
static void pfx_sched_delay_offs(play_fx_t *fx, pfx_active_t *an,
                                 uint64_t base_time, uint64_t gate_smp) {
    uint8_t off_s = (uint8_t)(0x80 | an->channel);
    int i;
    for (i = 0; i < an->stored_repeat_count; i++) {
        const int fixed = an->reps[i].gate_factor < 0.0;   /* queued with its note-on, unless it waits */
        double rg = fixed ? -an->reps[i].gate_factor : (double)gate_smp * an->reps[i].gate_factor;
        if (rg < 1.0) rg = 1.0;
        uint64_t on_t = base_time + an->reps[i].cumul_delay;
        uint64_t off  = on_t + (uint64_t)(rg + 0.5);
        /* a table groove: the echo's note-off is as late as its note-on was,
         * not as late as the slot it lands in — or it could come out first */
        off += swing_offset_for_fire_at(g_inst, (int)fx->track_idx, fx->sample_counter,
                   (g_inst && g_inst->groove.kind == GROOVE_TABLE) ? on_t : off);
        /* and never before its own on, as it was queued at the strike (a
         * short echo late in an off-beat step would land its off in the
         * next, unswung one; re-estimating that swing now can disagree) */
        if (off <= an->reps[i].fire_at) off = an->reps[i].fire_at + (uint64_t)(rg + 0.5);   /* its own length, from there */
        int j;
        for (j = 0; j < an->reps[i].qn; j++) {          /* the pitches it went out on */
            if (!(an->reps[i].waits & (1u << j))) continue;   /* its off went with its on */
            if (fx->event_count >= MAX_PFX_EVENTS) {
                /* no room for its off: drop its on if still queued, else
                 * end it now — never an echo with no end */
                const uint8_t q = an->reps[i].qpitch[j];
                int e, gone = 0;
                for (e = 0; e < fx->event_count && !gone; e++) {
                    pfx_event_t *ev = &fx->events[e];
                    if ((ev->flags & PFX_EV_WAITS) && (ev->msg[0] & 0xF0) == 0x90 && ev->msg[1] == q
                        && ev->fire_at == an->reps[i].fire_at) {   /* this echo's own, not another note's */
                        memmove(ev, ev + 1, (size_t)(fx->event_count - e - 1) * sizeof *ev);
                        fx->event_count--;
                        gone = 1;
                    }
                }
                if (!gone) pfx_send(fx, off_s, q, 0);
                continue;
            }
            pfx_q_insert(fx, off, off_s, an->reps[i].qpitch[j], 0, 0);
        }
    }
}

/* ------------------------------------------------------------------ */
/* Clip playback direction                                              */
/* ------------------------------------------------------------------ */
/* Per-clip / per-lane playback_dir modes:
 *   0 = Forward                 — playhead ls → le-1 → ls → ...
 *   1 = Backward                — playhead le-1 → ls → le-1 → ...
 *   2 = Pingpong Forward        — ls → le-1, reverses (endpoint plays ONCE),
 *                                 ls+1 → ls, reverses, back up. Full cycle =
 *                                 2L-2 steps; every step gets equal time so
 *                                 a steady rhythm pattern stays steady.
 *   3 = Pingpong Backward       — mirror of 2 starting at le-1.
 *
 * pp_dir_state is +1 ascending, -1 descending; only meaningful in modes 2/3.
 * Reset on clip launch / transport start; not persisted.
 *
 * "Wrap" (out_wrapped=1) means the playhead has just completed one full cycle
 * and is back at its initial position — used to clear suppress_until_wrap
 * flags, reset live_recorded_steps, and increment loop_cycle for Iter trigs. */
static void advance_clip_step(uint16_t cur, uint16_t ls, uint16_t length,
                              uint8_t mode, uint8_t audio_reverse, int8_t pp_dir,
                              uint16_t *out_ns, int8_t *out_pp_dir,
                              uint8_t *out_wrapped) {
    uint16_t le = (uint16_t)(ls + length);
    *out_wrapped = 0;
    if (length <= 1) { *out_ns = ls; *out_pp_dir = pp_dir; *out_wrapped = 1; return; }

    int32_t next;
    switch (mode) {
    case 1: /* Backward */
        next = (int32_t)cur - 1;
        if (next < ls || next >= le) { next = le - 1; *out_wrapped = 1; }
        break;
    case 2: /* Pingpong Forward.
             *   Step:  endpoint plays ONCE per direction change (cycle = 2L-2).
             *   Audio: endpoint plays TWICE — repeats at the bounce (cycle = 2L)
             *          so each note gets one forward + one reverse playthrough. */
        if (pp_dir != +1 && pp_dir != -1) pp_dir = +1;
        next = (int32_t)cur + pp_dir;
        if (audio_reverse) {
            if (next >= le)      { next = le - 1; pp_dir = -1; }   /* endpoint repeats at top */
            else if (next < ls)  { next = ls;     pp_dir = +1; }   /* endpoint repeats at bottom */
            /* Wrap: landed at ls heading up (we've completed the full 2L cycle). */
            if ((uint16_t)next == ls && pp_dir == +1) *out_wrapped = 1;
        } else {
            if (next >= le)      { next = le - 2; pp_dir = -1; }   /* skip repeat at top */
            else if (next < ls)  { next = ls + 1; pp_dir = +1; }   /* skip repeat at bottom */
            if ((uint16_t)next == ls && pp_dir == -1) *out_wrapped = 1;
        }
        break;
    case 3: /* Pingpong Backward — mirror of case 2. */
        if (pp_dir != +1 && pp_dir != -1) pp_dir = -1;
        next = (int32_t)cur + pp_dir;
        if (audio_reverse) {
            if (next >= le)      { next = le - 1; pp_dir = -1; }
            else if (next < ls)  { next = ls;     pp_dir = +1; }
            /* Wrap: landed at le-1 heading down (full 2L cycle complete). */
            if ((uint16_t)next == (uint16_t)(le - 1) && pp_dir == -1) *out_wrapped = 1;
        } else {
            if (next >= le)      { next = le - 2; pp_dir = -1; }
            else if (next < ls)  { next = ls + 1; pp_dir = +1; }
            if ((uint16_t)next == (uint16_t)(le - 1) && pp_dir == +1) *out_wrapped = 1;
        }
        break;
    case 0:
    default: /* Forward */
        next = (int32_t)cur + 1;
        if (next >= le || next < ls) { next = ls; *out_wrapped = 1; }
        break;
    }
    *out_pp_dir = pp_dir;
    *out_ns = (uint16_t)next;
}

/* Initial playhead step for `dir` when launching a clip / starting transport.
 * Forward / PPFwd start at loop_start; Backward / PPBwd start at last step. */
static uint16_t initial_clip_step(uint16_t ls, uint16_t length, uint8_t dir) {
    if (length == 0) return ls;
    return (dir == 1 || dir == 3) ? (uint16_t)(ls + length - 1) : ls;
}

/* Initial pp_dir_state for `dir`. -1 for PPBwd; +1 for everything else. */
static int8_t initial_pp_dir(uint8_t dir) {
    return (dir == 3) ? (int8_t)-1 : (int8_t)+1;
}

/* True when the playhead is currently traversing the clip in reverse motion:
 *   - Backward direction: always.
 *   - Pingpong (either start): only while pp_dir_state == -1 (descending half).
 * Used by note firing to swap note-on / note-off positions when the clip's
 * playback_audio_reverse flag is set. */
static inline int clip_in_reverse_motion(const clip_t *cl) {
    if (cl->playback_dir == 1) return 1;
    if ((cl->playback_dir == 2 || cl->playback_dir == 3) && cl->pp_dir_state == -1) return 1;
    return 0;
}
