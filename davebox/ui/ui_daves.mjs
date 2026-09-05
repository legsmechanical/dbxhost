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
/* No hold anywhere — a continuous slow bounce (Josh corrected the first
 * ruling: "the bounce SHOULDN'T hold at top/bottom"). Kept as a knob so a
 * future hold is one number, not machinery. */
const SCAN_HOLD_MS = 0;
const SCAN_STEP_MS = 128;                            /* per pixel, on the one clock */

const SEEN_PATH = '/data/UserData/dbx-host/daves-seen.txt';
/* The Daves switch, beside the collection: device-global like the album (a
 * preference of the user's, not a song's; the deploy merges file-by-file so it
 * survives updates). Absent file = OFF (Josh, 2026-09-05: "default is off"). */
const WINDOW_PREF_PATH = '/data/UserData/dbx-host/daves-window.txt';

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
    S.daveBox = { list: list, idx: 0, yOff: 0, dir: 1, holdUntil: 0, stepAt: S.clockMs };
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
    d.yOff = 0; d.dir = 1; d.holdUntil = 0; d.stepAt = S.clockMs;
    forceRedraw();
}

/* Advance the scan one tick. Called from the tick loop while the album is
 * open; redraws only when the offset actually moves. */
export function daveBoxTick() {
    const d = S.daveBox;
    if (!d) return;
    if (S.clockMs < d.holdUntil) return;
    if (S.clockMs - d.stepAt < SCAN_STEP_MS) return;
    d.stepAt = S.clockMs;
    d.yOff += d.dir;
    if (d.yOff >= DAVE_SCAN_MAX) { d.yOff = DAVE_SCAN_MAX; d.dir = -1; d.holdUntil = S.clockMs + SCAN_HOLD_MS; }
    else if (d.yOff <= 0)        { d.yOff = 0;            d.dir = 1;  d.holdUntil = S.clockMs + SCAN_HOLD_MS; }
    forceRedraw();
}

/* Run-length blit of `rows` rows of a 128x64 1-bit frame: screen row dstY0+i
 * shows image row srcY0+i. The same shape the host's drawCustomSplash uses —
 * far fewer host calls than per-pixel set_pixel. Lit bits only: the caller
 * owns the background.
 *
 * The runs are ENCODED ONCE per frame and cached (frameRuns): a redraw pays
 * only the fill_rect calls, never the 128-pixel bit scan per row. The banner
 * redraws ~23 times a second on the screen the user performs on, so the scan
 * was the one cost in the path that could be removed for free. */
const RUN_CACHE = new Map();     /* frame index -> [row][x0, w, x0, w, ...] */

function frameRuns(idx) {
    let rows = RUN_CACHE.get(idx);
    if (rows) return rows;
    const bits = SPLASH_FRAMES[idx];
    rows = new Array(64);
    for (let y = 0; y < 64; y++) {
        const runs = [];
        let runStart = -1;
        const rowOff = y * 16;
        for (let x = 0; x < 128; x++) {
            const bit = (bits[rowOff + (x >> 3)] >> (7 - (x & 7))) & 1;
            if (bit) {
                if (runStart < 0) runStart = x;
            } else if (runStart >= 0) {
                runs.push(runStart, x - runStart);
                runStart = -1;
            }
        }
        if (runStart >= 0) runs.push(runStart, 128 - runStart);
        rows[y] = runs;
    }
    RUN_CACHE.set(idx, rows);
    return rows;
}

/* Exposed for the tests' positive control: the cache must reproduce the bits. */
export function frameRowRuns(idx, y) { return frameRuns(idx)[y]; }

function blitFrameRows(idx, srcY0, dstY0, rows) {
    const enc = frameRuns(idx);
    for (let i = 0; i < rows; i++) {
        const runs = enc[srcY0 + i], y = dstY0 + i;
        for (let k = 0; k < runs.length; k += 2) fill_rect(runs[k], y, runs[k + 1], 1, 1);
    }
}

/* ── the BANNER WINDOW (Josh, 2026-09-05: "instead of that dance ... a random
 * collected dave scroll up and down within the header space ... like you're
 * peeking through a window where the header is") ──
 *
 * While the transport runs, the session banner's 12px bar shows a 12-row
 * slice of one collected Dave, and the slice travels the whole frame: top to
 * bottom over one bar, bottom to top over the next, bar after bar. Position
 * is DERIVED from the DSP's master tick, never accumulated: the tick resets
 * on Play (so the pass starts at the top and stays bar-aligned), the poll
 * rate gives roughly a pixel per redraw at ordinary tempos, and a pure
 * function of masterPos is what lets the offline renderers draw exactly what
 * the device draws. Full width, wordmark gone for the duration. A new Dave is
 * dealt on every Play. Behind the Daves switch (global menu, default OFF):
 * off keeps the static wordmark. */
export const BANNER_H = 12;                      /* ui_render's MARK_BAR_H imports this */
export const BANNER_TRAVEL = 64 - BANNER_H;      /* 52 rows of travel */
export const TICKS_PER_BAR = 96 * 4;             /* PPQN 96, 4/4 */

/* Image row shown at the top of the window for a master tick position. Even
 * bars (counting from Play) glide down, odd bars glide back up. */
export function bannerDaveYOff(masterPos) {
    const pos = (masterPos >>> 0);
    const phase = (pos % TICKS_PER_BAR) / TICKS_PER_BAR;
    const down = Math.floor(pos / TICKS_PER_BAR) % 2 === 0;
    const y = Math.floor(phase * BANNER_TRAVEL);
    return down ? y : BANNER_TRAVEL - y;
}

/* The Daves switch. Read once, lazily; written on every change. */
export function daveWindowOn() {
    if (S.daveWindowOn === null) {
        let on = false;
        try {
            on = host_file_exists(WINDOW_PREF_PATH) &&
                 String(host_read_file(WINDOW_PREF_PATH) || '').trim() === '1';
        } catch (e) { on = false; }
        S.daveWindowOn = on;
    }
    return S.daveWindowOn;
}
export function setDaveWindowOn(v) {
    S.daveWindowOn = !!v;
    /* A failed write is the one way the switch forgets itself at the next
     * launch while looking perfect in-session — say so (reaches debug.log). */
    let wrote = false;
    try { wrote = !!host_write_file(WINDOW_PREF_PATH, S.daveWindowOn ? '1\n' : '0\n'); } catch (e) { wrote = false; }
    if (!wrote) console.log('[daves] could not persist the Daves switch to ' + WINDOW_PREF_PATH);
    if (!S.daveWindowOn) S.bannerDave = -1;
    forceRedraw();
}

/* Keep S.bannerDave in step with the transport. Called on every DSP poll,
 * right after S.playing lands: a rising edge deals a random collected Dave
 * (one file read per Play), stopping clears it. Nothing collected leaves it
 * at -1 and the banner falls back to the wordmark. */
export function bannerDaveSync() {
    if (!S.playing || !daveWindowOn()) { S.bannerDave = -1; return; }
    if (S.bannerDave >= 0) return;
    const list = seenFrameIndices();
    if (!list.length) return;
    S.bannerDave = list[Math.floor(Math.random() * list.length)];
}

/* The banner as a window: black behind, then the 12-row slice. */
export function drawBannerDave() {
    const idx = S.bannerDave;
    if (idx < 0 || idx >= SPLASH_FRAMES.length) return;
    fill_rect(0, 0, 128, BANNER_H, 0);
    blitFrameRows(idx, bannerDaveYOff(S.masterPos), 0, BANNER_H);
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
    /* Screen row y shows image row y + yOff, so the scan slides the frame up
     * behind the footer and every row gets its turn in the window. */
    blitFrameRows(d.list[d.idx], d.yOff, 0, 64 - DAVE_FOOTER_H);
    /* The footer (mock variant D): cleared 18px band, name in the 6x6 header
     * caps, meta line in the small movy face beneath. */
    const name = daveBoxName(), meta = daveBoxMeta();
    fill_rect(0, 64 - DAVE_FOOTER_H, 128, DAVE_FOOTER_H, 0);
    hdrPrint(Math.max(0, Math.floor((128 - hdrWidth(name)) / 2)), 48, name, 1);
    mvPrint(Math.max(0, Math.floor((128 - mvWidth(meta)) / 2)), 57, meta, 1);
}
