/* pads.mjs — the pads themselves, while they are a picture of something the
 * screen alone does not show: the BANK PAD MAP (jog held). All 32 pads in the
 * colours they are lit (palette indices, index = note - 68, bottom row first),
 * each with what it is: the left 4x4's bank names, the right 4x4's module
 * slots and the module loaded there. Cycled imports are read only inside
 * collect(), never at module init. */
import { S } from '../../ui_state.mjs';
import { bankMapPadColors } from '../../ui_leds.mjs';
import { bankMapItems } from '../../ui_render.mjs';
import { bankMapModuleName } from '../../ui_input_cc.mjs';
import { BANK_MAP_MODULE_PADS, bankMapModuleAt, bankPadMapForMode } from '../../ui_pure.mjs';

const idx = (col, row) => (3 - row) * 8 + col;   /* map cell (row 0 = top) -> pad index */

export const pads = {
    key: 'pads',
    collect: () => {
        if (!S.bankMapUp) return null;
        const colors = bankMapPadColors();
        const cells = new Array(32).fill(null);
        const m = bankMapItems();
        (m.cols || []).forEach((c, ci) => c && (c.cells || []).forEach((name, r) => { if (name) cells[idx(ci, r)] = { label: String(name) }; }));
        if (S.bankMapKind !== 'session') {
            const t = S.activeTrack;
            /* the left 4x4's INST pad names the instrument too, as the right
             * 4x4's Instrument slot does (Josh, 2026-11-09: "inst on left 4x4
             * should show name too") */
            let inst = null;
            const instName = () => { if (inst === null) { try { inst = String(bankMapModuleName(t, 'synth') || ''); } catch (e) { inst = ''; } } return inst; };
            bankPadMapForMode(S.trackPadMode[t], t).forEach((c, ci) => c && (c.cells || []).forEach((cell, r) => {
                const k = idx(ci, r);
                if (cell && cell.action === 'inst' && cells[k]) cells[k].sub = instName();
            }));
            for (const m0 of BANK_MAP_MODULE_PADS) {
                const mm = bankMapModuleAt(S.trackRoute[t], S.trackPadMode[t], m0.col, m0.row, t);
                if (!mm) continue;
                let sub = '';
                try { sub = mm.comp === 'synth' || mm.comp === 'slices' ? instName() : (bankMapModuleName(t, mm.comp) || ''); } catch (e) { /* a name is a nicety */ }
                cells[idx(mm.col, mm.row)] = { label: mm.label, sub: String(sub), module: true };
            }
        }
        return {
            kind: S.bankMapKind === 'session' ? 'session' : 'track',
            colors: colors.map((v) => v | 0),
            cells,
            heads: (m.cols || []).map((c) => (c && c.label) || ''),
            cur: m.cur || null,
            joins: (m.joins || []).map((j) => ({ c: j.c, r0: j.r0, r1: j.r1 })),
        };
    },
};
