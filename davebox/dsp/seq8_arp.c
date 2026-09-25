/* seq8_arp.c — SEQ ARP engine (chain-stage arpeggiator on captured held notes).
 * Contents: arp_add_note, arp_remove_note, arp_silence, arp_build_pool,
 * arp_pick_next_pos, arp_compute_step, arp_fire_step, arp_tick. #include'd into
 * seq8.c's single TU at the original position; never compiled standalone.
 * NOTE: the TRACK ARP engine (tarp_ functions) stays in core — those functions
 * are interleaved with the drum_repeat, live_note, and effective_vel functions
 * and are not a contiguous block, so they cannot be moved verbatim without
 * dragging in unrelated code. */
/* ------------------------------------------------------------------ */
/* SEQ ARP engine                                                       */
/* ------------------------------------------------------------------ */

static void arp_add_note(arp_engine_t *a, uint8_t pitch, uint8_t vel) {
    int i;
    for (i = 0; i < a->held_count; i++)
        if (a->held_pitch[i] == pitch) { a->held_vel[i] = vel; return; }
    if (a->held_count >= ARP_MAX_HELD) return;
    int was_empty = (a->held_count == 0);
    a->held_pitch[a->held_count] = pitch;
    a->held_vel[a->held_count]   = vel;
    a->held_order[a->held_count] = a->next_order++;
    a->held_count++;
    if (was_empty) {
        /* Buffer 0→1: arm a fire on next rate boundary. cyc_pos / step_pos
         * persist across step boundaries so consecutive sequenced steps
         * progress through the cycle (only arp_silence fully resets). */
        a->pending_first_note = 1;
        a->ticks_until_next   = 0;
    }
    /* Retrigger=1: any new note (not just first) restarts the pattern.
     * Deferred to arp_tick so we can use the current arp_master_tick as anchor. */
    if (a->retrigger) a->pending_retrigger = 1;
}

static void arp_remove_note(arp_engine_t *a, uint8_t pitch) {
    int i, found = -1;
    for (i = 0; i < a->held_count; i++)
        if (a->held_pitch[i] == pitch) { found = i; break; }
    if (found < 0) return;
    for (i = found; i + 1 < a->held_count; i++) {
        a->held_pitch[i]    = a->held_pitch[i + 1];
        a->held_vel[i]      = a->held_vel[i + 1];
        a->held_order[i]    = a->held_order[i + 1];
        a->held_physical[i] = a->held_physical[i + 1];
    }
    a->held_count--;
    a->held_physical[a->held_count] = 0;
    if (a->held_count == 0) {
        /* Buffer empty — let the sounding note play out its own gate via
         * arp_tick countdown. Don't reset cycle position; consecutive
         * sequenced steps continue the pattern across the empty gap. */
        a->pending_first_note = 0;
        a->next_order         = 0;
    }
}

/* Drop all held notes, silence sounding, and reset cycle state.
 * Sounding silence is emitted raw (arp_emitting=1) so it bypasses the
 * arp gate in pfx_send. */
static void arp_silence(seq8_instance_t *inst, seq8_track_t *tr) {
    (void)inst;
    play_fx_t *fx = &tr->pfx;
    arp_engine_t *a = &fx->arp;
    if (a->sounding_active) {
        fx->arp_emitting = 1;
        pfx_send(fx, (uint8_t)(0x80 | tr->channel), a->sounding_pitch, 0);
        fx->arp_emitting = 0;
    }
    arp_clear_runtime(a);
}

/* Build the style-ordered NOTE POOL: every held note in every octave copy,
 * ordered by the style as ONE list (Josh, 2026-09-24: "the octave notes don't
 * factor into how the style sorts notes" — they used to be the styled phrase
 * repeated per octave, so Down +1 played G E C G' E' C').
 *
 * pool_pitch[p] is the (unclamped) pitch at cycle position p, pool_held[p] the
 * held-buffer index it came from (its velocity). Returns the pool length P.
 *  - Negative octaves extend the pool DOWNWARD.
 *  - Play Order (7) is the played phrase, then the phrase transposed one octave
 *    at a time in the octave's direction — the fill order below, unsorted.
 *  - No de-duplication: a chord already spanning an octave keeps both copies.
 *  - N*(K+1) can exceed ARP_MAX_CYCLE (16 notes at +/-4 = 80), so the octave
 *    count K is trimmed BEFORE the pool is built — clamping a styled pool would
 *    drop whichever end the style put last, i.e. possibly the notes held.
 * Rebuilt on every step from held_*[], exactly as the old per-octave order
 * was: no cached pool, no new state. */
static int arp_build_pool(const arp_engine_t *a, int16_t *pool_pitch, uint8_t *pool_held) {
    int N = a->held_count;
    if (N == 0) return 0;
    int i, j, k;
    int sign = a->octaves < 0 ? -1 : 1;
    int K = a->octaves < 0 ? -(int)a->octaves : (int)a->octaves;
    while (K > 0 && N * (K + 1) > ARP_MAX_CYCLE) K--;

    /* Held indices in PLAY order (held_order ascending). */
    uint8_t order_val[ARP_MAX_HELD];
    uint8_t order_idx[ARP_MAX_HELD];
    for (i = 0; i < N; i++) { order_val[i] = a->held_order[i]; order_idx[i] = (uint8_t)i; }
    for (i = 1; i < N; i++) {
        uint8_t ov = order_val[i], oi = order_idx[i];
        for (j = i; j > 0 && order_val[j - 1] > ov; j--) {
            order_val[j] = order_val[j - 1]; order_idx[j] = order_idx[j - 1];
        }
        order_val[j] = ov; order_idx[j] = oi;
    }
    /* Fill: the played phrase, octave by octave. */
    int P = 0;
    for (k = 0; k <= K; k++)
        for (j = 0; j < N; j++) {
            uint8_t hi = order_idx[j];
            pool_pitch[P] = (int16_t)((int)a->held_pitch[hi] + 12 * sign * k);
            pool_held[P]  = hi;
            P++;
        }

    /* Style values: 0=Off (callers gate before reaching here), 1=Up, 2=Dn,
     * 3=U/D, 4=D/U, 5=Cnv, 6=Div, 7=Ord, 8=Rnd, 9=RnO. */
    if (a->style == 7) return P;                       /* Play Order: the fill order */

    /* Everything else starts from the pool sorted ascending. STABLE (strict >),
     * so equal pitches keep the lower-octave copy first. */
    for (i = 1; i < P; i++) {
        int16_t pv = pool_pitch[i]; uint8_t hv = pool_held[i];
        for (j = i; j > 0 && pool_pitch[j - 1] > pv; j--) {
            pool_pitch[j] = pool_pitch[j - 1]; pool_held[j] = pool_held[j - 1];
        }
        pool_pitch[j] = pv; pool_held[j] = hv;
    }
    if (a->style == 2 || a->style == 4) {              /* Down; DownUp derives from Down */
        for (i = 0, j = P - 1; i < j; i++, j--) {
            int16_t tp = pool_pitch[i]; pool_pitch[i] = pool_pitch[j]; pool_pitch[j] = tp;
            uint8_t th = pool_held[i];  pool_held[i]  = pool_held[j];  pool_held[j]  = th;
        }
    } else if (a->style == 5 || a->style == 6) {       /* Converge / Diverge, by rank */
        int16_t sp[ARP_MAX_CYCLE]; uint8_t sh[ARP_MAX_CYCLE];
        for (i = 0; i < P; i++) { sp[i] = pool_pitch[i]; sh[i] = pool_held[i]; }
        for (i = 0; i < P; i++) {
            int r = (a->style == 5) ? i : (P - 1 - i);
            int rank = (r % 2 == 0) ? (P - 1 - r / 2) : (r / 2);
            if (rank < 0) rank = 0; if (rank >= P) rank = P - 1;
            pool_pitch[i] = sp[rank]; pool_held[i] = sh[rank];
        }
    }
    /* 1 Up, 3 UpDown, 8 Random, 9 Random Other: ascending (randomness is applied
     * to the position later). */
    return P;
}

/* Pick the next logical position 0..(span-1) and update random_used / ud_dir / cyc_pos.
 * Returns the chosen logical position; returns -1 if span==0. */
static int arp_pick_next_pos(arp_engine_t *a, play_fx_t *fx, int span) {
    if (span <= 0) return -1;
    int chosen = 0;
    if (a->style == 8) {
        /* Random — uniform pick */
        chosen = pfx_rand(fx, 0, span - 1);
    } else if (a->style == 9) {
        /* Random Other — pick uniformly from indices not yet used. */
        uint64_t mask = a->random_used;
        int max_span = span > 64 ? 64 : span;
        uint64_t all = (max_span >= 64) ? ~(uint64_t)0
                                        : (((uint64_t)1 << max_span) - 1);
        if ((mask & all) == all) { mask = 0; a->random_used = 0; }
        int remaining = 0, k;
        for (k = 0; k < max_span; k++)
            if (!(mask & ((uint64_t)1 << k))) remaining++;
        if (remaining <= 0) { chosen = 0; }
        else {
            int pick = pfx_rand(fx, 0, remaining - 1);
            for (k = 0; k < max_span; k++) {
                if (mask & ((uint64_t)1 << k)) continue;
                if (pick == 0) { chosen = k; break; }
                pick--;
            }
        }
        a->random_used |= ((uint64_t)1 << (chosen < 64 ? chosen : 0));
    } else if (a->style == 3 || a->style == 4) {
        /* UpDown / DownUp — bidirectional triangle */
        int p = ((a->cyc_pos % span) + span) % span;
        chosen = p;
        if (span > 1) {
            int next = p + a->ud_dir;
            if (next >= span)      { next = span - 2; a->ud_dir = -1; }
            else if (next < 0)     { next = 1;        a->ud_dir =  1; }
            a->cyc_pos = next;
        }
        /* For DownUp, start position is span-1; mapped via ordered[] which already encodes Down. */
    } else {
        /* Up / Down / Converge / Diverge / Play Order — linear cycle */
        chosen = ((a->cyc_pos % span) + span) % span;
        a->cyc_pos = (a->cyc_pos + 1) % span;
        if (a->cyc_pos == 0) {
            a->cycle_step_count = 0;
            a->random_used = 0;
        }
    }
    return chosen;
}

/* Compute pitch+vel for cycle position. Returns 0 if no notes available. */
static int arp_compute_step(arp_engine_t *a, play_fx_t *fx,
                             uint8_t *out_pitch, uint8_t *out_vel) {
    if (a->held_count == 0) return 0;
    int16_t pool_pitch[ARP_MAX_CYCLE];
    uint8_t pool_held[ARP_MAX_CYCLE];
    int span = arp_build_pool(a, pool_pitch, pool_held);   /* <= ARP_MAX_CYCLE by construction */
    if (span <= 0) return 0;

    int pos = arp_pick_next_pos(a, fx, span);
    if (pos < 0) return 0;
    int pitch = pool_pitch[pos];
    if (pitch < 0) pitch = 0; if (pitch > 127) pitch = 127;   /* clamp at emit, never before sorting */
    *out_pitch = (uint8_t)pitch;
    *out_vel   = a->held_vel[pool_held[pos]];
    return 1;
}

/* Fire one arp step: silence prior, emit next note (with step pattern + decay).
 *
 * Steps modes:
 *   0 = Off   — step_vel array ignored, every step fires at incoming vel.
 *   1 = Mute  — level 0 step rests (no note); cycle advances underneath so
 *               the next active step plays what would have played anyway.
 *   2 = Step  — level 0 step skips entirely (no note, no cycle advance).
 *
 * step_vel[i] is an ABSOLUTE velocity 0..127 (2026-07-18 rework): 0 = step
 * off; an active step fires at exactly its stored velocity, independent of
 * the incoming note's velocity. Off mode bypasses the array entirely (live
 * dynamics pass through).
 *
 * Column = beat division of the arp rate (rate=1/16 → cols are 1/16 notes,
 * rate=1/4 → cols are 1/4 notes). step_pos is derived from absolute master
 * tick position so the editor pattern is musically anchored. */
static void arp_fire_step(seq8_instance_t *inst, seq8_track_t *tr) {
    play_fx_t    *fx = &tr->pfx;
    arp_engine_t *a  = &fx->arp;
    if (a->held_count == 0) return;

    uint16_t rate = ARP_RATE_TICKS[a->rate_idx];
    if (rate == 0) rate = 24;

    /* Editor column from absolute master clock — matches musical divisions.
     * arp_master_tick free-runs (advances when stopped too) so live input
     * arpeggiates even when transport is off. master_anchor is the tick at
     * which retrigger was last fired (0 by default); column 0 sits at anchor. */
    uint32_t master_pos = inst->arp_master_tick - a->master_anchor;
    uint8_t loop_len = a->step_loop_len ? a->step_loop_len : 8;
    if (loop_len > 8) loop_len = 8;
    int step_idx = (int)((master_pos / rate) % loop_len);
    a->step_pos = (uint8_t)step_idx;

    uint8_t level = a->step_vel[step_idx];
    if (a->steps_mode == 0) level = 255;   /* Off mode: treat as Thru */
    int step_off = (a->steps_mode != 0) && (level == 0);

    /* Step mode + step off: skip — no fire, no cycle advance, leave sounding alone.
     * Reset interval so we land on the next rate boundary, not the next render tick. */
    if (step_off && a->steps_mode == 2) {
        a->ticks_until_next = (int32_t)rate;
        return;
    }

    /* Silence prior sounding note before firing next (or before resting in Mute).
     * Raw emit (arp_emitting=1) so it bypasses the pfx_send arp gate. */
    if (a->sounding_active) {
        fx->arp_emitting = 1;
        pfx_send(fx, (uint8_t)(0x80 | tr->channel), a->sounding_pitch, 0);
        fx->arp_emitting = 0;
        a->sounding_active = 0;
    }

    if (step_off) {
        /* Mute mode + step off: rest this slot but advance cycle so the next
         * active step plays the note that would have played anyway. */
        uint8_t pitch_unused, vel_unused;
        (void)arp_compute_step(a, fx, &pitch_unused, &vel_unused);
        a->cycle_step_count++;
        a->ticks_until_next = (int32_t)rate;
        return;
    }

    uint8_t pitch, base_vel;
    if (!arp_compute_step(a, fx, &pitch, &base_vel)) {
        a->ticks_until_next = (int32_t)rate;
        return;
    }

    /* Per-step scale-degree offset (Arp Steps interval bank). */
    if (a->step_int[step_idx])
        pitch = (uint8_t)scale_transpose(inst, (int)pitch, (int)a->step_int[step_idx]);

    /* Velocity: a locked step (1..127) fires at exactly its stored value;
     * Thru (255) — and Off mode — pass the incoming velocity through. */
    int v = (int)base_vel;
    if (a->steps_mode != 0 && level >= 1 && level <= 127)
        v = (int)level;
    if (v < 1)   v = 1;
    if (v > 127) v = 127;

    /* Emit raw — arp is the LAST chain stage. The pitch already came out of
     * NOTE FX → HARMZ → MIDI DLY upstream, so no further processing here.
     * arp_emitting=1 bypasses the pfx_send arp gate. */
    fx->arp_emitting = 1;
    pfx_send(fx, (uint8_t)(0x90 | tr->channel), pitch, (uint8_t)v);
    /* Replay the last poly-AT pressure onto the new voice so a held finger
     * keeps modulating across step transitions (Move's native arp does this
     * implicitly; without it, the AT stream stalls between knuckle motions
     * and each new arp voice is born at AT=0). */
    if (tr->last_poly_at_press > 0) {
        pfx_send(fx, (uint8_t)(0xA0 | tr->channel),
                 pitch, tr->last_poly_at_press);
    }
    fx->arp_emitting = 0;

    a->sounding_pitch  = pitch;
    a->sounding_active = 1;

    /* Set next-step interval and gate countdown. */
    a->ticks_until_next = (int32_t)rate;
    uint32_t gate = ((uint32_t)rate * (uint32_t)a->gate_pct) / 100U;
    if (gate < 1)        gate = 1;
    if (gate >= rate)    gate = (uint32_t)rate - 1; /* note-off before next on */
    a->gate_remaining = gate;

    a->cycle_step_count++;
    a->fire_count++;
}

/* Per master tick — called once per render-tick per track from render_block. */
static void arp_tick(seq8_instance_t *inst, seq8_track_t *tr) {
    play_fx_t    *fx = &tr->pfx;
    arp_engine_t *a  = &fx->arp;
    if (a->style == 0) return;

    /* Drain deferred retrigger (set by arp_add_note when retrigger=1, or by
     * render_block on active-clip wrap). Anchors step_pos to current tick. */
    if (a->pending_retrigger) {
        a->pending_retrigger = 0;
        arp_retrigger(a, inst->arp_master_tick);
    }

    /* Gate countdown for sounding note (raw emit, bypasses arp gate). */
    if (a->sounding_active && a->gate_remaining > 0) {
        a->gate_remaining--;
        if (a->gate_remaining == 0) {
            fx->arp_emitting = 1;
            pfx_send(fx, (uint8_t)(0x80 | tr->channel), a->sounding_pitch, 0);
            fx->arp_emitting = 0;
            a->sounding_active = 0;
        }
    }

    if (a->held_count == 0) return;

    if (a->pending_first_note) {
        uint16_t rate = ARP_RATE_TICKS[a->rate_idx];
        if (rate == 0) rate = 24;
        if (fx->seq_arp_sync) {
            if ((inst->arp_master_tick % rate) == 0) {
                a->master_anchor      = inst->arp_master_tick;
                a->pending_first_note = 0;
                arp_fire_step(inst, tr);
            }
        } else {
            uint32_t total = inst->arp_master_tick - a->master_anchor;
            if ((total % rate) == 0) {
                a->pending_first_note = 0;
                arp_fire_step(inst, tr);
            }
        }
        return;
    }

    if (a->ticks_until_next > 0) a->ticks_until_next--;
    if (a->ticks_until_next <= 0) arp_fire_step(inst, tr);
}
