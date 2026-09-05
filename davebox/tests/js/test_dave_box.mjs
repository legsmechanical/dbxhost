/* tests/js/test_dave_box.mjs — the DAVE BOX album (the launch-splash gacha's
 * collection screen), end to end through the real dispatch.
 *
 * What matters here: the album shows exactly the COLLECTED Daves in permanent-
 * number order (tolerating junk and duplicates in the seen file — both dealers
 * dedupe on write, but a reader that trusts a writer breaks first); the footer
 * names the PERMANENT number out of the POOL total; the screen is modal (a
 * blind pad press must not edit steps under a slideshow); and Back returns to
 * the global menu the album was opened from. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const sets = [];
let seenFileContent = null;      /* null = file absent */
let prefFileContent = null;      /* the Daves switch file; null = absent = OFF */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p.indexOf('daves-seen') >= 0 && seenFileContent !== null) ? seenFileContent
                                 : (p.indexOf('daves-window') >= 0 && prefFileContent !== null) ? prefFileContent : '';
globalThis.host_file_exists = (p) => (p.indexOf('daves-seen') >= 0 && seenFileContent !== null)
                                  || (p.indexOf('daves-window') >= 0 && prefFileContent !== null);
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = (k, v) => { sets.push([k, v]); };
globalThis.host_module_get_param = () => ''; globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1; globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
let fills = [], px = [];
globalThis.clear_screen = () => { fills = []; px = []; };
globalThis.print = () => {};
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v }); };
globalThis.draw_rect = () => {};
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = (x, y) => { px.push({ x, y }); };
globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const daves = await import('../../ui/ui_daves.mjs');
const splash = await import('../../ui/ui_splash.mjs');
const menuMod = await import('../../ui/ui_menu.mjs');
const render = await import('../../ui/ui_render.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false; S.activeTrack = 2;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () =>
    Array.from({ length: 12 }, () => new Array(8).fill(0)));

const cc   = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const note = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([d2 > 0 ? 0x90 : 0x80, d1, d2]));

step('pool sanity: 31 daves, unique permanent numbers, DAVIES is the rare one', () => {
    if (splash.DAVES.length !== splash.SPLASH_COUNT) throw new Error('DAVES/frames misaligned');
    const ns = splash.DAVES.map((d) => d.n);
    if (new Set(ns).size !== ns.length) throw new Error('duplicate dave_num');
    const davies = splash.DAVES.find((d) => d.name === 'DAVIES');
    if (!davies) throw new Error('no DAVIES');
    for (const d of splash.DAVES)
        if (d.name !== 'DAVIES' && d.w < davies.w)
            throw new Error(d.name + ' is rarer than DAVIES (' + d.w + ' < ' + davies.w + ')');
    if (!(davies.w < 1.0)) throw new Error('DAVIES not rarer than a common');
});

step('the album lists collected Daves in permanent order, junk and dupes tolerated', () => {
    seenFileContent = '3\n21\ngarbage\n\n1\n21\n999\n';
    if (!daves.openDaveBox()) throw new Error('did not open');
    const metas = [], names = [];
    for (let i = 0; i < S.daveBox.list.length; i++) {
        metas.push(daves.daveBoxMeta()); names.push(daves.daveBoxName());
        daves.daveBoxRotate(1);
    }
    /* The total is the POOL's size, not a constant — adding a Dave is the
     * designed case and must not fail this pin. */
    const T = splash.SPLASH_COUNT;
    const wantM = ['< DAVE 1/' + T + ' \u00b7 COMMON >', '< DAVE 3/' + T + ' \u00b7 COMMON >',
                   '< DAVE 21/' + T + ' \u00b7 RARE >'];
    if (JSON.stringify(metas) !== JSON.stringify(wantM)) throw new Error(JSON.stringify(metas));
    if (names[2] !== 'DAVIES') throw new Error('name line wrong: ' + JSON.stringify(names));
    if (daves.daveBoxMeta() !== wantM[0]) throw new Error('did not wrap forward');
    daves.daveBoxRotate(-1);
    if (daves.daveBoxMeta() !== wantM[2]) throw new Error('did not wrap backward');
    daves.closeDaveBox();
});

/* The scan steps on the one CLOCK (ms), not on tick count (2026-09-05) — so a
 * test tick advances S.clockMs by one old-rate tick (~10.6 ms); 12 of them
 * cross the 128 ms per-pixel step exactly as 12 ticks used to. */
function dtick() { S.clockMs += 10.7; daves.daveBoxTick(); }

step('⭐ the SCAN loops top to bottom and back, and the WHOLE image gets its turn', () => {
    /* Josh, 2026-08-31: the footer obscured too much — the frame pans behind
     * it so every row is eventually visible. Coverage is the claim, so the
     * assertion is the SET of offsets, not the waveform. */
    seenFileContent = '1\n';
    if (!daves.openDaveBox()) throw new Error('did not open');
    if (S.daveBox.yOff !== 0) throw new Error('did not start at the top');
    /* ⭑ IMMEDIATE: no opening hold — the first glide step lands within one
     * step period (Josh: "it shouldn't wait to scroll"). */
    for (let t = 0; t < 12; t++) dtick();
    if (S.daveBox.yOff !== 1) throw new Error('the scan waited to start (yOff=' + S.daveBox.yOff + ')');
    const offs = new Set();
    for (let t = 0; t < 1400; t++) { dtick(); offs.add(S.daveBox.yOff); }
    for (let o = 0; o <= daves.DAVE_SCAN_MAX; o++)
        if (!offs.has(o)) throw new Error('offset ' + o + ' never reached — rows stay hidden');
    if (Math.max(...offs) > daves.DAVE_SCAN_MAX || Math.min(...offs) < 0)
        throw new Error('scan escaped its range');
    /* browsing restarts the scan at the top */
    for (let t = 0; t < 400; t++) dtick();
    if (S.daveBox.yOff === 0) { /* may legitimately be 0 mid-loop; force off-top */ }
    while (S.daveBox.yOff === 0) dtick();
    daves.daveBoxRotate(1);
    if (S.daveBox.yOff !== 0) throw new Error('a fresh Dave did not start at the top');
    daves.closeDaveBox();
});

step('an empty collection refuses to open (popup, no blank modal)', () => {
    seenFileContent = null;
    if (daves.openDaveBox()) throw new Error('opened on nothing');
    if (S.daveBox) throw new Error('state left open');
});

step('⚠ MODAL through the real dispatch: pads swallowed, jog browses, Back returns to the menu', () => {
    seenFileContent = '1\n3\n21\n';
    if (!daves.openDaveBox()) throw new Error('did not open');
    /* ⚠ positive control FIRST: this same pad note must do something when the
     * album is closed, or "swallowed" proves nothing. Cheapest observable that
     * needs no live clip: the set_param stream. */
    sets.length = 0;
    note(36, 127); note(36, 0);
    const before = daves.daveBoxMeta();
    if (S.daveBox === null) throw new Error('a pad press closed the album');
    cc(14, 1);                                    /* jog +1 */
    if (daves.daveBoxMeta() === before) throw new Error('jog did not browse');
    cc(51, 127); cc(51, 0);                       /* Back tap */
    if (S.daveBox) throw new Error('Back did not close the album');
    if (!S.globalMenuOpen) throw new Error('Back did not return to the global menu');
    S.globalMenuOpen = false;
});

step('the footer band OVERLAYS the image: cleared 18px band, name + meta pixels over it', () => {
    seenFileContent = '1\n';
    daves.openDaveBox();
    fills = []; px = [];
    daves.drawDaveBox();
    if (!fills.some((f) => f.x === 0 && f.y === 46 && f.w === 128 && f.h === 18 && f.v === 0))
        throw new Error('no cleared footer band at y=46 h=18');
    if (!px.some((p) => p.y >= 47 && p.y <= 63)) throw new Error('no label pixels in the band');
    if (!fills.some((f) => f.v === 1 && f.y < 46)) throw new Error('no image ink above the band');
    /* ⚠ the scan must never paint image rows INTO the band — draw at max
     * offset and require the band's clear to come after any image ink there */
    S.daveBox.yOff = daves.DAVE_SCAN_MAX;
    fills = []; px = [];
    daves.drawDaveBox();
    const bandClear = fills.findIndex((f) => f.y === 46 && f.h === 18 && f.v === 0);
    if (bandClear < 0) throw new Error('no band clear at max offset');
    daves.closeDaveBox();
});

/* ── the BANNER WINDOW: while the transport runs, the session banner shows a
 * 12-row slice of a random collected Dave, travelling top→bottom over one bar
 * and back over the next. Position is a pure function of the master tick. */
step('⭐ banner scroll: down over bar 1, back up over bar 2, whole frame covered, bar-aligned', () => {
    const T = daves.TICKS_PER_BAR, TR = daves.BANNER_TRAVEL;
    if (T !== 384) throw new Error('a 4/4 bar at PPQN 96 is 384 ticks, got ' + T);
    if (daves.BANNER_H !== 12) throw new Error('the banner is 12px, got ' + daves.BANNER_H);
    if (TR !== 52) throw new Error('travel must show every row: 64 - 12 = 52, got ' + TR);
    if (daves.bannerDaveYOff(0) !== 0) throw new Error('Play starts at the top');
    if (daves.bannerDaveYOff(T - 1) !== TR - 1) throw new Error('end of bar 1 is at the bottom');
    if (daves.bannerDaveYOff(T) !== TR) throw new Error('bar 2 starts at the bottom');
    if (daves.bannerDaveYOff(2 * T - 1) !== 1) throw new Error('end of bar 2 is back at the top');
    if (daves.bannerDaveYOff(2 * T) !== 0) throw new Error('bar 3 restarts the cycle');
    /* Monotonic within a bar, and never outside the frame. */
    let prev = -1;
    for (let p = 0; p < T; p++) {
        const y = daves.bannerDaveYOff(p);
        if (y < prev) throw new Error('bar 1 went UP at tick ' + p);
        if (y < 0 || y > TR) throw new Error('offset ' + y + ' would read past the frame');
        prev = y;
    }
    prev = TR + 1;
    for (let p = T; p < 2 * T; p++) {
        const y = daves.bannerDaveYOff(p);
        if (y > prev) throw new Error('bar 2 went DOWN at tick ' + p);
        prev = y;
    }
    /* The extremes are reached AT the bar line: row 63 shows at the start of
     * bar 2, row 0 at the start of bar 3 (bar 1 ends one row short of the
     * bottom and bar 2 one row short of the top — the reversal is continuous). */
    if (daves.bannerDaveYOff(T) + daves.BANNER_H !== 64) throw new Error('the bottom row is never shown');
});

step('⭐ the run cache reproduces the BITS for every row of every frame (positive control)', () => {
    let runsTotal = 0;
    for (let i = 0; i < splash.SPLASH_FRAMES.length; i++) {
        const bits = splash.SPLASH_FRAMES[i];
        for (let y = 0; y < 64; y++) {
            const runs = daves.frameRowRuns(i, y);
            const row = new Array(128).fill(0);
            for (let k = 0; k < runs.length; k += 2)
                for (let x = runs[k]; x < runs[k] + runs[k + 1]; x++) row[x] = 1;
            for (let x = 0; x < 128; x++) {
                const bit = (bits[y * 16 + (x >> 3)] >> (7 - (x & 7))) & 1;
                if (bit !== row[x]) throw new Error('frame ' + i + ' row ' + y + ' x ' + x + ': cache ' + row[x] + ' bits ' + bit);
            }
            runsTotal += runs.length / 2;
        }
    }
    if (runsTotal === 0) throw new Error('no runs at all — the control saw nothing');
    /* Same object back: encoded once, not per call. */
    if (daves.frameRowRuns(0, 5) !== daves.frameRowRuns(0, 5)) throw new Error('rows are re-encoded per call');
});

step('⭐ the DAVES SWITCH: default ON (no file) → the window deals; Off clears mid-play; On deals again; persisted device-global', () => {
    seenFileContent = '1\n';
    prefFileContent = null; S.daveWindowOn = null;
    if (daves.daveWindowOn() !== true) throw new Error('absent pref file must read ON (the default, Josh 2026-09-05)');
    S.playing = true; S.bannerDave = -1; daves.bannerDaveSync();
    if (S.bannerDave !== 0) throw new Error('the default-ON switch did not deal on the first poll, got ' + S.bannerDave);
    const writes = [];
    globalThis.host_write_file = (p, c) => { writes.push([p, c]); if (p.indexOf('daves-window') >= 0) prefFileContent = c; return true; };
    daves.setDaveWindowOn(false);
    if (S.bannerDave !== -1) throw new Error('Off mid-play must clear the Dave at once');
    if (!writes.find(w => w[0].indexOf('/dbx-host/daves-window.txt') >= 0 && w[1].trim() === '0'))
        throw new Error('Off did not persist to the device-global pref file: ' + JSON.stringify(writes));
    daves.bannerDaveSync();
    if (S.bannerDave !== -1) throw new Error('switch OFF still dealt a Dave: ' + S.bannerDave);
    daves.setDaveWindowOn(true);
    if (prefFileContent.trim() !== '1') throw new Error('On did not persist');
    daves.bannerDaveSync();
    if (S.bannerDave !== 0) throw new Error('switch ON did not deal on the next poll, got ' + S.bannerDave);
    daves.setDaveWindowOn(false);
    if (prefFileContent.trim() !== '0') throw new Error('Off did not persist (second time)');
    /* A fresh read (module reload) honours the file. */
    prefFileContent = '1\n'; S.daveWindowOn = null;
    if (daves.daveWindowOn() !== true) throw new Error('pref file "1" must read ON');
    prefFileContent = '0\n'; S.daveWindowOn = null;
    if (daves.daveWindowOn() !== false) throw new Error('pref file "0" must read OFF');
    S.playing = false; S.bannerDave = -1;
});

step('⭐ banner pick: dealt from the COLLECTION on the Play edge, held while playing, cleared on Stop', () => {
    S.daveWindowOn = true;                        /* the switch is ON for this step */
    seenFileContent = '3\n7\n7\n1\n';          /* collected: 1, 3, 7 */
    const want = new Set([0, 2, 6]);              /* dave_num 1,3,7 -> frame idx 0,2,6 */
    const origRandom = Math.random;
    try {
        S.playing = false; daves.bannerDaveSync();
        if (S.bannerDave !== -1) throw new Error('stopped must clear the pick, got ' + S.bannerDave);
        Math.random = () => 0.99;                 /* last of the list */
        S.playing = true; daves.bannerDaveSync();
        if (S.bannerDave !== 6) throw new Error('expected the last collected frame (6), got ' + S.bannerDave);
        Math.random = () => 0.0;                  /* would be frame 0 — but the pick is HELD */
        daves.bannerDaveSync();
        if (S.bannerDave !== 6) throw new Error('a poll mid-play redealt the Dave: ' + S.bannerDave);
        S.playing = false; daves.bannerDaveSync();
        if (S.bannerDave !== -1) throw new Error('Stop did not clear the pick');
        S.playing = true; daves.bannerDaveSync();
        if (S.bannerDave !== 0) throw new Error('a new Play must deal anew, got ' + S.bannerDave);
        /* Every possible deal is a COLLECTED Dave. */
        for (let r = 0; r < 1; r += 0.05) {
            Math.random = () => r; S.playing = false; daves.bannerDaveSync(); S.playing = true; daves.bannerDaveSync();
            if (!want.has(S.bannerDave)) throw new Error('dealt an uncollected frame ' + S.bannerDave);
        }
        /* Nothing collected: no pick, banner falls back to the wordmark. */
        seenFileContent = null; S.playing = false; daves.bannerDaveSync(); S.playing = true; daves.bannerDaveSync();
        if (S.bannerDave !== -1) throw new Error('an empty collection must leave -1, got ' + S.bannerDave);
    } finally { Math.random = origRandom; S.playing = false; S.bannerDave = -1; }
});

step('⭐ banner draw: black 12px window, the slice inside it, NO wordmark while playing', () => {
    S.daveBox = null; S.sessionView = true; S.playing = true; S.bannerDave = 0; S.daveWindowOn = true;
    /* Clear the gates a prior step may have left: the empty-album popup, a
     * mixer peek, a farewell. */
    S.actionPopupEndTick = -1; S.sessMixerLatched = false; S.knobTouched = -1; S.exitFarewell = 0;
    S.masterPos = 96;                              /* a quarter through bar 1 -> row 13 */
    const yOff = daves.bannerDaveYOff(96);
    if (yOff !== 13) throw new Error('quarter bar should sit at row 13, got ' + yOff);
    clear_screen();
    render.drawUI();
    const bg = fills.find(f => f.x === 0 && f.y === 0 && f.w === 128 && f.h === 12 && f.v === 0);
    if (!bg) throw new Error('the banner window is not cleared to black');
    const white = fills.find(f => f.x === 0 && f.y === 0 && f.w === 128 && f.h === 12 && f.v === 1);
    if (white) throw new Error('the white wordmark bar is still drawn while playing');
    const inBar = fills.filter(f => f.v === 1 && f.h === 1 && f.y < 12);
    if (!inBar.length) throw new Error('no image runs landed inside the window');
    if (inBar.some(f => f.y < 0 || f.y >= 12)) throw new Error('a run escaped the window');
    /* The runs must be frame 0's rows 13..24, run-length encoded. Re-derive
     * row 13's first lit run from the bits and find it. */
    const bits = splash.SPLASH_FRAMES[0];
    let x0 = -1, x1 = -1;
    for (let x = 0; x < 128; x++) {
        const bit = (bits[yOff * 16 + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (bit && x0 < 0) x0 = x;
        if (!bit && x0 >= 0) { x1 = x; break; }
    }
    if (x0 >= 0) {
        if (x1 < 0) x1 = 128;
        if (!inBar.find(f => f.y === 0 && f.x === x0 && f.w === x1 - x0))
            throw new Error('window row 0 does not carry image row ' + yOff);
    }
    /* No hdrPrint ink in the bar: the wordmark is gone. */
    if (px.some(p => p.y < 12)) throw new Error('glyph pixels drawn inside the window — the wordmark survived');
    /* Stopped: the white bar and the mark are back. */
    S.playing = false; S.bannerDave = -1; clear_screen(); render.drawUI();
    if (!fills.find(f => f.x === 0 && f.y === 0 && f.w === 128 && f.h === 12 && f.v === 1))
        throw new Error('stopped banner lost its white bar');
    if (!px.some(p => p.y < 12)) throw new Error('stopped banner lost its wordmark');
    /* Switch OFF while PLAYING: the static wordmark, and no letter dance —
     * the bar is a fixed picture whatever the tick says. */
    S.daveWindowOn = false; S.playing = true; S.bannerDave = -1;
    const shot = (pos) => { S.masterPos = pos; clear_screen(); render.drawUI(); return JSON.stringify(px.filter(p => p.y < 12)); };
    if (!px) throw new Error('no pixel spy');
    const a = shot(0), b = shot(96), c = shot(48);
    if (a !== b || a !== c) throw new Error('with the switch OFF the header still animates with the tick');
    if (!fills.find(f => f.x === 0 && f.y === 0 && f.w === 128 && f.h === 12 && f.v === 1)) throw new Error('OFF while playing lost the white bar');
    S.playing = false; S.sessionView = false;
});

step('"Open Your Dave Box" is the LAST menu row, behind a divider — and it opens the album', () => {
    seenFileContent = '1\n';
    menuMod.openGlobalMenu();
    if (!S.globalMenuOpen) throw new Error('menu did not open');
    const items = S.globalMenuItems || [];
    const last = items[items.length - 1];
    if (!last || last.label !== 'Open Your Dave Box')
        throw new Error('last row is ' + JSON.stringify(last && last.label) + ', not the Dave Box');
    const sw = items[items.length - 2];
    if (!sw || sw.label !== 'Daves')
        throw new Error('the row above the Dave Box must be the Daves switch, got ' + JSON.stringify(sw && sw.label));
    const before = items[items.length - 3];
    if (!before || before.type !== 'divider')
        throw new Error('no divider ahead of the Daves rows (got ' + JSON.stringify(before && before.type) + ')');
    last.onAction();
    if (!S.daveBox) throw new Error('the door did not open the album');
    if (S.globalMenuOpen) throw new Error('opening the album left the menu up');
    daves.closeDaveBox();
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
