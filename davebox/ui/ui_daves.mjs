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
import { pixelPrint } from './ui_constants.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { forceRedraw } from './ui_leds.mjs';

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
    S.daveBox = { list: list, idx: 0 };
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
    forceRedraw();
}

/* The footer hint, as data — the draw path prints pixels no test can read. */
export function daveBoxLabel() {
    const d = S.daveBox;
    if (!d) return '';
    const dave = DAVES[d.list[d.idx]];
    return '< Dave ' + dave.n + ' of ' + SPLASH_COUNT + ' >';
}

export function drawDaveBox() {
    const d = S.daveBox;
    if (!d) return;
    clear_screen();
    /* Run-length blit, the same shape the host's drawCustomSplash uses —
     * far fewer host calls than per-pixel set_pixel. */
    const bits = SPLASH_FRAMES[d.list[d.idx]];
    for (let y = 0; y < 64; y++) {
        let runStart = -1;
        const rowOff = y * 16;
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
    /* The hint OVERLAYS the image (Josh's spec): a cleared band along the
     * bottom, the same idiom as the host splash caption. */
    const label = daveBoxLabel();
    fill_rect(0, 55, 128, 9, 0);
    pixelPrint(Math.max(0, Math.floor((128 - label.length * 6) / 2)), 57, label, 1);
}
