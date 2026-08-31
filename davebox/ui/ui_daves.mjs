/* ui_daves.mjs — the DAVE BOX: the collection album for the launch-splash
 * gacha (Josh, 2026-08-31: "like opening a pokemon pack and having an album
 * to see the ones you've gotten").
 *
 * Every launch deals ONE weighted-random Dave as the splash (pick-splash.py
 * on the quiesce branch, ensureCustomSplash on the pre-kill branch — never
 * both). The dealer appends the dealt Dave's PERMANENT number to the
 * device-global collection file; this screen shows every Dave ever dealt,
 * jog-driven, with a footer naming its permanent number out of the pool
 * total. A Dave you have not been dealt yet simply is not here — that gap in
 * the numbering IS the album's tell that there is more to collect.
 *
 * The collection is DEVICE-global on purpose (not per-project state): it is
 * the user's, not a song's, and the host deploy merges file-by-file so the
 * file survives updates. Duplicate/junk lines are tolerated on read — both
 * dealers dedupe on write, but a reader that trusts a writer is a reader
 * that breaks first. */

import { S } from './ui_state.mjs';
import { SPLASH_FRAMES, SPLASH_COUNT, DAVES } from './ui_splash.mjs';
import { hdrPrint, hdrWidth, mvPrint, mvWidth } from './ui_movy.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { forceRedraw } from './ui_leds.mjs';

/* ── the scan (Josh, 2026-08-31: the footer obscured too much — "have daves
 * automatically and in a loop scan from top to bottom vertically behind the
 * footer so the whole image can be seen") ──
 *
 * The frame is 64px, the window above the footer is 46px, so 18px of travel
 * shows every row. The loop: glide down a pixel at a time, hold at the
 * bottom, glide back, hold at the top — a return glide rather than a snap,
 * because a 1-bit panel makes a snap read as a glitch. It starts moving THE
 * MOMENT the card shows (Josh, device pass 2026-08-31: "it shouldn't wait
 * to scroll... just slow immediate up and down bounce" — the holds belong at
 * the extremes it REACHES, not at the start). Browsing to another Dave
 * restarts at the top, also already moving. Timings in ticks (~94 Hz). */
export const DAVE_FOOTER_H = 18;
export const DAVE_SCAN_MAX = DAVE_FOOTER_H;          /* 64 - (64 - 18) */
const SCAN_HOLD_TICKS = 90;                          /* ~1 s at each end */
const SCAN_STEP_TICKS = 12;                          /* ~128 ms per pixel */

const SEEN_PATH = '/data/UserData/dbx-host/daves-seen.txt';

/* dave_num -> frame index, from the pool's own statement. A number in the
 * seen file that no longer maps (a Dave removed from the pool) is skipped —
 * the record keeps it for the day the Dave returns. */
function seenFrameIndices() {
    let raw = '';
    try {
        raw = host_file_exists(SEEN_PATH) ? (host_read_file(SEEN_PATH) || '') : '';
    } catch (e) { raw = ''; }
    const have = new Set();
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const n = parseInt(lines[i], 10);
        if (isFinite(n) && n > 0) have.add(n);
    }
    const idxs = [];
    for (let i = 0; i < DAVES.length; i++)
        if (have.has(DAVES[i].n)) idxs.push(i);
    /* DAVES is emitted dave_num-ascending, so index order IS album order. */
    return idxs;
}

export function openDaveBox() {
    const list = seenFrameIndices();
    if (!list.length) {
        /* Cannot happen on device (a launch deals before the module runs),
         * but an empty album must say so rather than open on nothing. */
        showActionPopup('DAVE BOX', 'No Daves yet');
        return false;
    }
    S.daveBox = { list: list, idx: 0, yOff: 0, dir: 1, holdT: 0, stepT: 0 };
    S.globalMenuOpen = false;
    forceRedraw();
    return true;
}

export function closeDaveBox() {
    S.daveBox = null;
    forceRedraw();
}

export function daveBoxRotate(delta) {
    const d = S.daveBox;
    if (!d || !delta) return;
    const n = d.list.length;
    d.idx = ((d.idx + (delta > 0 ? 1 : -1)) % n + n) % n;
    /* A fresh Dave scans from the top — and is already moving. */
    d.yOff = 0; d.dir = 1; d.holdT = 0; d.stepT = 0;
    forceRedraw();
}

/* Advance the scan one tick. Called from the tick loop while the album is
 * open; redraws only when the offset actually moves. */
export function daveBoxTick() {
    const d = S.daveBox;
    if (!d) return;
    if (d.holdT > 0) { d.holdT--; return; }
    if (++d.stepT < SCAN_STEP_TICKS) return;
    d.stepT = 0;
    d.yOff += d.dir;
    if (d.yOff >= DAVE_SCAN_MAX) { d.yOff = DAVE_SCAN_MAX; d.dir = -1; d.holdT = SCAN_HOLD_TICKS; }
    else if (d.yOff <= 0)        { d.yOff = 0;            d.dir = 1;  d.holdT = SCAN_HOLD_TICKS; }
    forceRedraw();
}

/* The footer, as data — the draw path prints pixels no test can read.
 * Two lines (mock variant D, Josh's pick): the NAME in header caps, and the
 * meta line with number-of-total and rarity. */
export function daveBoxName() {
    const d = S.daveBox;
    return d ? DAVES[d.list[d.idx]].name : '';
}
export function daveBoxMeta() {
    const d = S.daveBox;
    if (!d) return '';
    const dave = DAVES[d.list[d.idx]];
    return '< DAVE ' + dave.n + '/' + SPLASH_COUNT + ' \u00b7 ' + dave.r + ' >';
}

export function drawDaveBox() {
    const d = S.daveBox;
    if (!d) return;
    clear_screen();
    /* Run-length blit, the same shape the host's drawCustomSplash uses —
     * far fewer host calls than per-pixel set_pixel. Screen row y shows image
     * row y + yOff, so the scan slides the frame up behind the footer and
     * every row gets its turn in the window. */
    const bits = SPLASH_FRAMES[d.list[d.idx]];
    for (let y = 0; y < 64 - DAVE_FOOTER_H; y++) {
        let runStart = -1;
        const rowOff = (y + d.yOff) * 16;
        for (let x = 0; x < 128; x++) {
            const bit = (bits[rowOff + (x >> 3)] >> (7 - (x & 7))) & 1;
            if (bit) {
                if (runStart < 0) runStart = x;
            } else if (runStart >= 0) {
                fill_rect(runStart, y, x - runStart, 1, 1);
                runStart = -1;
            }
        }
        if (runStart >= 0) fill_rect(runStart, y, 128 - runStart, 1, 1);
    }
    /* The footer (mock variant D): cleared 18px band, name in the 6x6 header
     * caps, meta line in the small movy face beneath. */
    const name = daveBoxName(), meta = daveBoxMeta();
    fill_rect(0, 64 - DAVE_FOOTER_H, 128, DAVE_FOOTER_H, 0);
    hdrPrint(Math.max(0, Math.floor((128 - hdrWidth(name)) / 2)), 48, name, 1);
    mvPrint(Math.max(0, Math.floor((128 - mvWidth(meta)) / 2)), 57, meta, 1);
}
