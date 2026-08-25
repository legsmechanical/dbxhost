/*
 * surface_trace.h — latency marks for the surface ROUND TRIP.
 *
 * Shared by the shim (shadow_midi.c) and the tool process (shadow_ui.c) so the
 * two ends of the trip agree on what counts as a pad event and how an instant
 * is stamped. Header rather than a copy in each: the marks are only comparable
 * if both sides classify identically, and a second definition is exactly how
 * two sides drift.
 */
#ifndef SURFACE_TRACE_H
#define SURFACE_TRACE_H

#include <stdint.h>
#include "host/schwung_trace.h"

/* ── Pad-inject latency marks (docs/tracing.md, "surface round trip") ────────
 *
 * A control-surface event a tool re-injects to Move firmware does NOT take the
 * short road: it leaves the hardware, is forwarded to the tool process, comes
 * back through the inject ring, and only then reaches MIDI_IN. That round trip
 * is invisible in the existing spans — `spi.pre` and `js.tick` each see one end
 * of it and neither sees the gap. These four instants close it:
 *
 *   surface.fwd     the shim hands the hardware event to the tool process
 *   surface.rx      the tool process dispatches it into JS   (shadow_ui.c)
 *   surface.push    the tool pushes its reply into the inject ring (shadow_ui.c)
 *   surface.defer   a frame in which the reply COULD have been placed but the
 *                   hardware-quiet gate held it back — one mark per frame held
 *   surface.place   the reply lands in Move's MIDI_IN
 *
 * The three gaps are the three legs, and `surface.defer` counts how much of the
 * last one is the gate rather than frame quantisation. Notes only, and only the
 * pad range: this exists to answer a question about pads, and marking every
 * event would bury the four that matter.
 *
 * ⚠ RT path. Everything below is inside `schwung_trace_on`, so when tracing is
 * off (the default) the cost is one atomic load — the same gate TRACE_SCOPE
 * uses. Do NOT hoist the packet inspection above that check. */
#define SURFACE_PAD_LO 68
#define SURFACE_PAD_HI 99

static inline int surface_is_pad_note(const uint8_t *pkt) {
    uint8_t cable = (pkt[0] >> 4) & 0x0F;
    uint8_t type  = pkt[1] & 0xF0;
    return cable == 0x00 && (type == 0x90 || type == 0x80) &&
           pkt[2] >= SURFACE_PAD_LO && pkt[2] <= SURFACE_PAD_HI;
}

/* An INSTANT: a zero-width span at `now`. The legs are the gaps BETWEEN marks,
 * which no single begin/end pair could span — they cross two processes. */
static inline void surface_mark(const char *name) {
    uint32_t nid = schwung_trace_intern(name);
    uint64_t t = schwung_trace_now_ns();
    schwung_trace_span_explicit(nid, t, t, 0, 0);
}

static void shadow_chain_transpose_reset(void);


#endif /* SURFACE_TRACE_H */
