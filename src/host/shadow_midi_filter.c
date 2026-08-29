#include <string.h>

#include "shadow_midi_filter.h"

/* ============================================================================
 * MIDI_IN gap compaction
 * ============================================================================ */

int shadow_midi_in_slot_empty(const uint8_t *slot)
{
    if (!slot) return 1;
    return (slot[0] == 0 && slot[1] == 0 && slot[2] == 0 && slot[3] == 0) ? 1 : 0;
}

int shadow_midi_in_compact(uint8_t *midi_in)
{
    if (!midi_in) return 0;

    int w = 0;
    for (int r = 0; r < SHADOW_MIDI_IN_BYTES; r += SHADOW_MIDI_IN_STRIDE) {
        if (shadow_midi_in_slot_empty(&midi_in[r])) continue;
        if (w != r) memcpy(&midi_in[w], &midi_in[r], SHADOW_MIDI_IN_STRIDE);
        w += SHADOW_MIDI_IN_STRIDE;
    }
    if (w < SHADOW_MIDI_IN_BYTES)
        memset(&midi_in[w], 0, (size_t)(SHADOW_MIDI_IN_BYTES - w));

    return w / SHADOW_MIDI_IN_STRIDE;
}
