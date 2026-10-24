/* ui_led_clock.mjs — MIDI clock for the LED controller, and nothing else.
 *
 * Move's LED controller animates on MIDI clock: each 0xF8 it receives on
 * cable 0 advances every fade / pulse / blink by a 24th of a beat, Start resets
 * the phase so blinks line up, and after Stop it keeps the last tempo. Move's
 * own firmware feeds it (measured 2026-10-24: FA, then 0xF8 at 24 per beat,
 * then FC, all on cable 0, while its transport runs). In a dAVEBOx session
 * Move's transport is stopped, so the controller would otherwise run at
 * whatever tempo it last saw — the set's, before the session started — and a
 * pulse or a fade on these pads would not follow dAVEBOx's tempo.
 *
 * This module sends what Move would: Start at the play edge, one clock per 4
 * master ticks (the sequencer runs at 96 PPQN; MIDI clock is 24), Stop at the
 * stop edge. It reads the DSP's own position (S.masterPos, polled), so the
 * clock cannot drift from the music it decorates; it is the same source the
 * step playhead is drawn from.
 *
 * ⚠ These packets are cable 0, the Move's internal surface. The host's own
 * transport tap reads Move's MIDI_OUT BEFORE the UI's packets are merged into
 * the frame, and the hardware clears the region every frame, so a clock the
 * UI writes is never read back as Move's (schwung_shim.c, pre-transfer order:
 * shadow_inprocess_process_midi before shadow_flush_pending_leds). Nothing
 * else on cable 0 listens to realtime.
 *
 * ⚠ Not when dAVEBOx FOLLOWS Move's clock (S.clockFollowOn): Move's transport
 * is the one running then, and it already clocks the controller; a second
 * clock would double the animation speed.
 *
 * The step is PURE so it can be tested without a device: it takes what it
 * needs and returns the packets to send.
 */

const CLOCK_DIV = 4;                  /* master ticks (96 PPQN) per MIDI clock (24 PPQN) */
const MAX_CLOCKS_PER_TICK = 12;       /* a stalled UI resumes without a burst that would skew the phase */

const PKT_START = [0x0F, 0xFA, 0, 0];
const PKT_STOP  = [0x0F, 0xFC, 0, 0];
const PKT_CLOCK = [0x0F, 0xF8, 0, 0];

/* The emitter's memory between ticks. */
export function ledClockState() {
    return { running: false, sentClocks: 0 };
}

/* One tick. `playing` is the sequencer's transport, `follow` whether dAVEBOx
 * follows Move's clock, `masterPos` the DSP position in master ticks. Returns
 * the packets to send, in order, and updates `st`. */
export function ledClockStep(st, playing, follow, masterPos) {
    const out = [];
    if (follow) {
        /* Move clocks the controller; if we were the clock a moment ago, say
         * so once so the controller's phase is Move's again at its next Start. */
        if (st.running) { out.push(PKT_STOP); st.running = false; }
        return out;
    }
    if (!playing) {
        if (st.running) { out.push(PKT_STOP); st.running = false; }
        return out;
    }
    const pos = Math.max(0, masterPos | 0);
    const due = Math.floor(pos / CLOCK_DIV);
    if (!st.running) {
        out.push(PKT_START);
        st.running = true;
        st.sentClocks = due;         /* Start IS beat zero; clocks begin after it */
        return out;
    }
    /* A position that moved BACK (a loop, a relocate) gives a negative count:
     * nothing is sent and the memory resumes from the new position. */
    let n = due - st.sentClocks;
    if (n > MAX_CLOCKS_PER_TICK) n = MAX_CLOCKS_PER_TICK;
    for (let i = 0; i < n; i++) out.push(PKT_CLOCK);
    st.sentClocks += n;
    return out;
}

/* Send what the step returns. A refused packet (the ring was full) is dropped,
 * not retried: a late clock would skew the phase more than a missing one. */
export function ledClockSend(packets) {
    for (const p of packets) move_midi_internal_send(p);
}
