/*
 * What MIDI is allowed to reach an audio FX.
 *
 * Pure and header-only — no allocation, no I/O, no locks — because every call
 * site is the SCHED_FIFO 90 SPI callback, and so that tests/host can compile
 * and RUN it natively (tests/host/test_fx_midi_filter.c). The translation
 * units that call it (schwung_shim.c) cannot be built on the dev machine,
 * which is exactly how filtering like this ends up shipped untested.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * Audio FX are fed from several places, and none of them filtered anything
 * beyond "is it a note, and is d1 >= 10". The `d1 >= 10` guard exists only to
 * drop the capacitive knob-touch notes 0-9. It was never a statement about
 * what is musical input. So on Move's own surface, STEP buttons (notes 16-31)
 * and TRACK buttons (notes 40-43) reached every loaded audio FX and Master FX
 * as if they were played notes — spurious retriggers on any note-driven FX,
 * and davebox uses the step row constantly.
 *
 * Do NOT apply this to the external (cable-2) sites. There a note number IS a
 * pitch, and range-filtering an external keyboard down to 68-99 would silence
 * five octaves of it.
 * ---------------------------------------------------------------------------
 */
#ifndef FX_MIDI_FILTER_H
#define FX_MIDI_FILTER_H

#include <stdint.h>

/* Move's cable-0 surface note map (CLAUDE.md, "Move Hardware MIDI"):
 *   0-9    capacitive knob touch
 *   16-31  step buttons
 *   40-43  track buttons
 *   68-99  pads
 * Only the pads are musical input. */
#define MOVE_SURFACE_PAD_LOW  68
#define MOVE_SURFACE_PAD_HIGH 99

/*
 * Is this cable-0 note number a pad?
 *
 * Callers use this in place of the old `d1 >= 10`. Note that a MIDI channel
 * CANNOT substitute for this: pads and step buttons arrive on the same
 * hardware surface, so no channel value separates them.
 */
static inline int move_surface_note_is_pad(uint8_t note)
{
    return note >= MOVE_SURFACE_PAD_LOW && note <= MOVE_SURFACE_PAD_HIGH;
}

#endif /* FX_MIDI_FILTER_H */
