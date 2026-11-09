/* held.mjs — the modifiers held right now, and a held step's notes. */
import { S } from '../../ui_state.mjs';
export const held = {
    key: 'held',
    collect: () => {
        const h = {};
        if (S.shiftHeld) h.shift = true;
        if (S.deleteHeld) h.delete = true;
        if (S.muteHeld) h.mute = true;
        if (S.copyHeld) h.copy = true;
        if (S.loopHeld) h.loop = true;
        if (S.heldStep >= 0) h.step = { idx: S.heldStep | 0, notes: (S.heldStepNotes || []).slice(0, 16) };
        return Object.keys(h).length ? h : null;
    },
};
