/*
 * shadow_midi_spill.c — the host absorbs LED bursts the SHM window cannot hold.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * The shadow-UI MIDI-out SHM window is 512 bytes = 128 packets, and davebox's
 * launch path bursts far more than that in a single tick:
 *
 *     stock clearAllLEDs()   (shared/input_filter.mjs: 128 setLED +
 *                             128 setButtonLED force-clears)     256 packets
 *     davebox clearAllLEDs() (davebox/ui/ui_leds.mjs: notes 68-99
 *                             and 16-31, cc 16-31/40-43/71-78,
 *                             plus 16 named ccs)                  92 packets
 *     palette: 3 gradient entries + idx 60, a 17-byte sysex
 *              packetised 6 packets each                          24 packets
 *     reapplyPalette() x2, an 8-byte sysex = 3 packets each         6 packets
 *     full repaint (buildLedInitQueue — the same 92 ids)           92 packets
 *     -------------------------------------------------------------------
 *     measured worst case                     470 packets / 1880 bytes
 *
 * i.e. ~3.7x the window, in one tick.
 *
 * ⚠⚠ THE OLD uint8_t write_idx WRAP WAS LOAD-BEARING, AND NOBODY KNEW.
 *
 * It saturated at 255 and silently rewound, so a burst overwrote its own HEAD
 * and the TAIL — the actual pad colours — is what reached the hardware.
 * Widening the field to uint16_t (ec601054, upstream 2ca9f871) made the bounds
 * check real for the first time, and that INVERTED the behaviour: the head
 * (the clears) now lands and the tail is refused. Pads dark at project
 * management; stale patterns after transitions. Device-confirmed by layer
 * bisect — that commit alone, against a byte-identical module, reproduces it.
 *
 * The widening was still correct. What was missing is that a 128-packet window
 * was never big enough, and the wrap had been hiding it.
 *
 * WHY THE HOST HAS TO BE THE ONE TO FIX IT
 * ----------------------------------------
 * The module cannot be asked to batch. It imports input_filter at RUNTIME from
 * the STOCK tree (/data/UserData/schwung/shared/input_filter.mjs) — old code
 * that caches unconditionally and ignores the return value — so a refused
 * write is recorded as sent and is never retried. Returning JS_FALSE is
 * information nobody reads. The packets have to be kept.
 *
 * WHY A RING IS ALLOWED HERE
 * --------------------------
 * shadow_ui is a separate SCHED_OTHER process, not the SPI callback. This is
 * not the realtime path and a static 8 KB buffer costs nothing — the same
 * reasoning the drop logging in shadow_ui.c already relies on.
 */

#include <string.h>

#include "shadow_midi_spill.h"

static uint8_t spill[SHADOW_MIDI_SPILL_SIZE];
static int head = 0;    /* next byte to drain out */
static int tail = 0;    /* next byte to append at */
static int peak = 0;
static long drops = 0;

void shadow_midi_spill_reset(void) {
    head = 0;
    tail = 0;
    peak = 0;
    drops = 0;
}

int shadow_midi_spill_pending(void) { return tail - head; }
int shadow_midi_spill_peak(void)    { return peak; }
long shadow_midi_spill_drops(void)  { return drops; }

/*
 * Reclaim the consumed prefix. Compaction ONLY, never a wrap: this stays a
 * plain linear buffer, so the FIFO order the LED stream depends on cannot be
 * got wrong by an index calculation. The memmove is bounded by the ring size
 * and happens at most once per full ring, off the realtime path.
 */
static void compact(void) {
    if (head == 0) return;
    int used = tail - head;
    if (used > 0) memmove(spill, spill + head, (size_t)used);
    head = 0;
    tail = used;
}

static int spill_push(const uint8_t pkt[4]) {
    if (tail + 4 > SHADOW_MIDI_SPILL_SIZE) {
        compact();
        if (tail + 4 > SHADOW_MIDI_SPILL_SIZE) return 0;
    }
    memcpy(spill + tail, pkt, 4);
    tail += 4;
    if (tail - head > peak) peak = tail - head;
    return 1;
}

int shadow_midi_spill_drain(shadow_midi_out_t *out) {
    if (!out) return 0;
    int moved = 0;
    while (head < tail) {
        int write_offset = out->write_idx;
        if (write_offset + 4 > SHADOW_MIDI_OUT_BUFFER_SIZE) break;
        memcpy(&out->buffer[write_offset], spill + head, 4);
        out->write_idx = (uint16_t)(write_offset + 4);
        head += 4;
        moved++;
    }
    if (head == tail) { head = 0; tail = 0; }
    return moved;
}

int shadow_midi_send_packet(shadow_midi_out_t *out, const uint8_t pkt[4]) {
    if (!out) return 0;
    /*
     * The ORDER of these two tests is the contract, not an optimisation.
     * `pending` first: a packet must never jump the queue just because the
     * window happens to have room again.
     */
    int busy = (head < tail);
    int write_offset = out->write_idx;
    if (!busy && write_offset + 4 <= SHADOW_MIDI_OUT_BUFFER_SIZE) {
        memcpy(&out->buffer[write_offset], pkt, 4);
        out->write_idx = (uint16_t)(write_offset + 4);
        return 1;
    }
    if (spill_push(pkt)) return 1;
    drops++;
    return 0;
}
