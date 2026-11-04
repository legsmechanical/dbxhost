/* context.mjs — the Screen view's per-mode context band: what the OLED has no
 * room to keep on screen, for the mode you are in.
 *
 *   Track View (any track.* screen): the track's banks as its bank map groups
 *     them (the same table the pad map draws), the current one marked; and the
 *     visible page of the clip's steps — which have notes, the playing step,
 *     the held one — with the page out of how many.
 *
 * One small builder per mode; a mode with none sends nothing. */
import { S } from '../../ui_state.mjs';
import { bankPadMapForMode } from '../../ui_pure.mjs';
import { effectiveClip } from '../../ui_leds.mjs';
import { PAD_MODE_DRUM } from '../../ui_constants.mjs';

function banks(t) {
    return bankPadMapForMode(S.trackPadMode[t], t).map((col) => ({
        label: col.label,
        items: col.cells.filter(Boolean).map((c) => ({ name: c.name, cur: c.bank !== null && c.bank === S.activeBank })),
    })).filter((g) => g.items.length);
}

function steps(t) {
    const drum = S.trackPadMode[t] === PAD_MODE_DRUM;
    const ac = effectiveClip(t);
    const arr = drum ? S.drumLaneSteps[t][S.activeDrumLane[t]] : S.clipSteps[t][ac];
    const len = (drum ? S.drumLaneLength[t] : S.clipLength[t][ac]) | 0;
    if (!arr || len <= 0) return null;
    const ls = drum ? 0 : (S.clipLoopStart[t][ac] | 0);
    const pages = Math.max(1, Math.ceil(len / 16)), page = Math.max(0, Math.min(pages - 1, (S.trackCurrentPage[t] | 0) - (ls >> 4)));
    const base = ls + page * 16;
    let on = '';
    for (let s = 0; s < 16; s++) { const i = base + s, v = arr[i]; on += i < ls + len && v && v !== '0' ? '1' : i < ls + len ? '0' : '-'; }
    const cur = drum ? (S.drumCurrentStep[t] | 0) : (S.trackCurrentStep[t] | 0);
    return { on, page, pages, play: S.playing && cur >= base && cur < base + 16 ? cur - base : -1,
             held: S.heldStep >= base && S.heldStep < base + 16 ? S.heldStep - base : -1 };
}

export const context = {
    key: 'context',
    collect: (frame, doc) => {
        const sc = doc.where ? doc.where.screen : '';
        if (!/^track\./.test(sc)) return null;
        const t = S.activeTrack | 0, out = { banks: banks(t) };
        /* the overviews draw the clip's own position bar and tiles: no step strip there */
        const st = /overview$/.test(sc) ? null : steps(t);
        if (st) out.steps = st;
        return out;
    },
};
