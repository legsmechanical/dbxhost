/* tests/js/test_midi_import_gesture.mjs — the MIDI browser, through the real
 * gestures (Import MIDI and the phrase browser as one screen, 2026-09-29).
 *
 * Touch K8 on the CLIP (or DRUM LANE) card and click the jog: the tick opens
 * it over the card. From there: the first-open list (folders and MIDI files,
 * the install hidden), a multi-part file entered like a folder, each part
 * HEARD as the jog lands on it, the jog list dropping away, the eight knobs,
 * Shift+click mute, the load into the CURRENT clip (one write, no confirm),
 * the remembered folder, and a drum track's sound placement. Asserted on what
 * the engine receives, from which callback, and on what is drawn.
 * → [[wired-is-not-reachable]]: a green pin says "wired", only the gesture
 * says "reachable".
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display',
    'move_midi_internal_send', 'set_led', 'host_open_service', 'host_close_service',
    'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
/* The device-wide prefs (ui_prefs): kept, so a reopen reads what a close wrote. */
const PREFS = {};
globalThis.host_read_file = (p) => PREFS[p] ?? '';
globalThis.host_file_exists = (p) => p in PREFS;
globalThis.host_write_file = (p, body) => { PREFS[p] = String(body); return true; };
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.set_pixel = _px;

/* ---- a MIDI file, byte by byte: format 1, a tempo track, Lead and Bass ---- */
function vlq(n) { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; }
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];
function track(ev) { const b = []; for (const [dt, ...x] of ev) b.push(...vlq(dt), ...x); b.push(0, 0xff, 0x2f, 0); return chunk('MTrk', b); }
const nameEv = (s) => [0, 0xff, 0x03, s.length, ...ascii(s)];
/* Lead: a quarter note on every beat for 8 bars (32 notes); Bass: one per bar. */
const lead = [nameEv('Lead')];
for (let i = 0; i < 32; i++) lead.push([0, 0x90, 60 + (i % 12), 100], [96, 0x80, 60 + (i % 12), 0]);
const bass = [nameEv('Bass')];
for (let i = 0; i < 8; i++) bass.push([0, 0x91, 36, 90], [384, 0x81, 36, 0]);
const SONG = Uint8Array.from([...chunk('MThd', [0, 1, 0, 3, 0, 96]),
    ...track([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]), ...track(lead), ...track(bass)]);
/* Drums: pitch 36 (a pad) and 20 (no pad) */
const DRUMS = Uint8Array.from([...chunk('MThd', [0, 0, 0, 1, 0, 96]),
    ...track([[0, 0x99, 36, 100], [24, 0x89, 36, 0], [0, 0x99, 20, 100], [24, 0x89, 20, 0]])]);

const DIR = 0o040000, REG = 0o100000;
globalThis.__stubStat = {
    '/data/UserData/UserLibrary': { mode: DIR, size: 0 },
    '/data/UserData/schwung': { mode: DIR, size: 0 },
    '/data/UserData/dbx-host': { mode: DIR, size: 0 },
    '/data/UserData/song.mid': { mode: REG, size: SONG.length },
    '/data/UserData/beat.mid': { mode: REG, size: DRUMS.length },
    '/data/UserData/notes.txt': { mode: REG, size: 10 },
};
const CUTSHORT = SONG.slice(0, SONG.length - 20);
/* Every file read is counted: the browser reads a file when the jog RESTS on it. */
const READS = [];
const BIN = { '/data/UserData/song.mid': SONG, '/data/UserData/beat.mid': DRUMS,
              '/data/UserData/cut.mid': CUTSHORT };
globalThis.__stubStdBinFiles = new Proxy(BIN, { get(o, k) { if (typeof k === 'string' && k in o) READS.push(k); return o[k]; } });
globalThis.__stubStat['/data/UserData/cut.mid'] = { mode: REG, size: CUTSHORT.length };

/* The engine: records every write and answers the clip reads the import's
 * settle step makes, once the import key has arrived. */
const writes = [];
let ctxTag = 'init';
const landed = new Set();
globalThis.host_module_set_param = (k, v) => {
    writes.push([ctxTag, String(k), String(v)]);
    const m = /^t(\d)_c(\d+)_import$/.exec(String(k));
    if (m) landed.add(m[1] + ':' + m[2]);
    const d = /^t(\d)_lanes_import$/.exec(String(k));
    if (d) landed.add(d[1] + ':0');
};
globalThis.host_module_set_params = () => true;
/* Slot and bus writes (levels, sends) go this way — recorded too, so a knob
 * that fell through to the track's levels would show here. */
globalThis.shadow_set_param = (slot, k, v) => { writes.push([ctxTag, 'slot' + slot + ':' + String(k), String(v)]); return 1; };
let laneNotesFor = {};              /* 't:c' -> '36 37 …' */
let neverLands = false;
globalThis.host_module_get_param = (k) => {
    const ln = /^t(\d)_c(\d+)_lane_notes$/.exec(String(k));
    if (ln) return laneNotesFor[ln[1] + ':' + ln[2]] || Array.from({ length: 32 }, (_, l) => 36 + l).join(' ');
    if (neverLands) return '';
    const m = /^t(\d)_c(\d+)_(steps|drum_has_content)$/.exec(String(k));
    if (m && landed.has(m[1] + ':' + m[2])) return m[3] === 'steps' ? '1' + '0'.repeat(255) : '1';
    return '';
};

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    const osStub = await import('os');
    osStub.__setReaddir({ '/data/UserData': ['UserLibrary', 'schwung', 'dbx-host', 'song.mid', 'beat.mid', 'cut.mid', 'notes.txt', '.hidden'],
                          '/data/UserData/UserLibrary': [] });
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const snd = await import('../../ui/ui_sound.mjs');
    const MI = await import('../../ui/ui_midi_import.mjs');
    const prefs = await import('../../ui/ui_prefs.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const { MoveNoteSession, PAD_MODE_CONDUCT, PAD_MODE_DRUM, TRACK_PAD_BASE, BANKS: BANKS_ } = await import('../../ui/ui_constants.mjs');
    const { MoveShift, MovePlay } = await import('/data/UserData/schwung/shared/constants.mjs');

    S.clockFollowTicks = true;              /* nowMs() follows the ticks: the rest and linger timers are exact */
    function ticks(n) {
        for (let i = 0; i < n; i++) {
            S.tickCount++; S.clockMs += 11;
            ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
        }
    }
    const cc = (d1, d2) => { const p = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')'; globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2])); ctxTag = p; };
    const note = (st, d1, d2) => { const p = ctxTag; ctxTag = 'note(' + d1 + ')'; globalThis.onMidiMessageInternal(new Uint8Array([st, d1, d2])); ctxTag = p; };
    const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
    const shiftClick = () => { cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0); ticks(2); };
    const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
    const turn = (k, detents) => { for (let i = 0; i < Math.abs(detents); i++) cc(71 + k, detents > 0 ? 1 : 127); ticks(1); };
    const touch = (k, on) => note(on ? 0x90 : 0x80, k, on ? 127 : 0);
    const jog = (d) => cc(14, d > 0 ? 1 : 127);
    const letGo = () => { note(0x80, 9, 0); ticks(60); };          /* past the list's half second */
    const ink = (y0, y1) => { globalThis.clear_screen(); render.drawUI(); let n = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) n += FB[y * 128 + x]; return n; };
    const mi = () => MI.miStateForTest();
    const labels = () => mi().items.map(it => it.label);
    const jogTo = (label) => {
        const i = labels().indexOf(label);
        assert(i >= 0, label + ' not listed: ' + JSON.stringify(labels()));
        for (let g = 0; g < 20 && mi().idx !== i; g++) jog(mi().idx < i ? 1 : -1);
        ticks(20);                                                  /* past the parse rest */
    };
    const auditions = (from) => writes.slice(from).filter(w => /_audition$/.test(w[1]));

    /* THE DOOR: the CLIP / DRUM LANE card, K8 touched, the jog clicked. */
    function tryOpenImport(track) {
        /* Setup: a browser a previous step left open is closed first. */
        MI.miClose(); snd.soundExit(); ticks(2);
        S.activeTrack = track; S.activeBank = 0; S.trackActiveBank[track] = 0;
        ticks(2);
        touch(7, true);
        cc(3, 127); cc(3, 0);
        touch(7, false);
        ticks(2);
    }
    function openImport(track) {
        tryOpenImport(track);
        assert(mi() && !snd.soundOpen(), 'touch K8 + click did not open the MIDI browser over the card');
    }
    const closedToCard = () => !mi() && !snd.soundOpen() && S.activeBank === 0;
    const forget = () => { delete PREFS[prefs.MIDI_PLACE_PATH]; S.midiPlace = null; };

    step('setup: track 2 melodic, routed to Move, C major', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.trackRoute[1] = 1; S.trackPadMode[1] = 0; S.trackChannel[1] = 2;
        S.padKey = 0; S.padScale = 0;
        ticks(8);
    });

    step('⭐⭐ THE DOOR: touch K8 + click opens it — and the transport is NOT stopped', () => {
        S.playing = true;
        const before = writes.length;
        openImport(1);
        ticks(4);
        assert(!writes.slice(before).some(w => w[1] === 'transport'), 'a transport write: ' +
               JSON.stringify(writes.slice(before).filter(w => w[1] === 'transport')));
        S.playing = false;
    });

    step('first open: the user data folder — folders and MIDI files, the install hidden', () => {
        assert(mi().root, 'not the first-open list');
        const l = labels();
        assert(l.includes('UserLibrary') && l.includes('song') && l.includes('beat'), 'missing: ' + JSON.stringify(l));
        for (const h of ['schwung', 'dbx-host', 'notes', '.hidden']) assert(!l.includes(h), h + ' is listed');
        assert(JSON.stringify(MI.miHintsForTest(false).footer) === '[["JOG","FOLDER"],["CLK","OPEN"]]', 'footer');
        assert(ink(12, 55) > 0, 'the list drew nothing');
    });

    step('a multi-part file reads as one (NAME> and its part count), and click goes IN like a folder', () => {
        jogTo('song'); ticks(4);
        clickNoop();
        function clickNoop() {}
        click();
        assert(!mi().root && mi().file && mi().file.path === '/data/UserData/song.mid', 'not inside the file');
        assert(JSON.stringify(labels()) === '["..","Lead","Bass"]', 'parts ' + JSON.stringify(labels()));
        assert(mi().list.up, 'the list is not up');
    });

    step('⭐ landing on a part PLAYS it: a note-on from a tick, through tN_audition', () => {
        const b = writes.length;
        for (let i = 0; i < 40 && !auditions(b).some(w => /\bon /.test(w[2])); i++) ticks(1);
        const a = auditions(b).find(w => /\bon /.test(w[2]));
        assert(a && /^tick#/.test(a[0]), 'no audition note-on from a tick: ' + JSON.stringify(auditions(b).slice(0, 3)));
        assert(!writes.slice(b).some(w => /live_notes/.test(w[1])), 'a live_notes write');
    });

    step('the next part: the last one is released and the new one plays', () => {
        const b = writes.length;
        jog(1); ticks(40);
        assert(mi().cur && mi().cur.name === 'Bass', 'cur ' + (mi().cur && mi().cur.name));
        const a = auditions(b).map(w => w[2]).join(' | ');
        assert(/alloff/.test(a) && /on 36 /.test(a), 'auditions: ' + a);
        jog(-1); ticks(4);
    });

    step('the list drops half a second after the jog stops, and the page shows the lane', () => {
        letGo();
        assert(!mi().list.up, 'the list is still up');
        assert(ink(33, 39) > 20, 'no lane drawn');
        assert(JSON.stringify(MI.miHintsForTest(false).footer) === '[["JOG","FILE"],["CLK","LOAD"],["SHFT","MUTE"]]',
               'footer ' + JSON.stringify(MI.miHintsForTest(false).footer));
        assert(JSON.stringify(MI.miHintsForTest(true).footer) === '[["CLK","MUTE"]]', 'Shift-held footer');
    });

    step('K1 Start / K2 Bars: the window, and what will not land is said in the header', () => {
        assert(mi().bars === 8 && mi().startBar === 1, 'defaults ' + mi().startBar + '/' + mi().bars);
        turn(1, -6 * 4);                                            /* 8 → 4 bars */
        assert(mi().bars === 4, 'bars ' + mi().bars);
        assert(MI.miHintsForTest(false).warning === '16 CUT', 'warning ' + MI.miHintsForTest(false).warning);
        turn(0, 6);                                                 /* start at bar 2 */
        assert(mi().startBar === 2 && mi().plan.before === 4, 'start ' + mi().startBar + ' before ' + mi().plan.before);
        turn(0, -6); turn(1, 6 * 4);
        assert(MI.miHintsForTest(false).warning === null, 'warning ' + MI.miHintsForTest(false).warning);
    });

    step('K4 Stretch x2: the grid moves with it and the clip doubles', () => {
        const len1 = mi().plan.lengthSteps, g1 = mi().grid;
        turn(3, 12);
        assert(mi().stretch === 4, 'stretch ' + mi().stretch);
        assert(mi().grid === g1 + 1, 'grid ' + g1 + ' → ' + mi().grid);
        assert(mi().plan.span === 2 * 8 * 384 && mi().plan.lengthSteps === len1, 'span ' + mi().plan.span + ' steps ' + mi().plan.lengthSteps);
        turn(3, -12);
    });

    step('K5 Oct / K6 Semi / K7 Scale: Semi +1 on C is C#, which Scale folds up to D; Scale off keeps C#', () => {
        const first = () => mi().plan.notes[0].p;
        assert(first() === 60, 'setup ' + first());
        turn(5, 6);
        assert(mi().semi === 1 && first() === 62, 'semi ' + mi().semi + ' → ' + first());
        turn(6, -12);
        assert(!mi().scaleOn && first() === 61, 'scale off → ' + first());
        turn(4, -12);
        assert(mi().oct === -1 && first() === 49, 'oct -1 → ' + first());
        turn(4, 12); turn(5, -6); turn(6, 12);
        assert(first() === 60 && mi().scaleOn, 'back ' + first());
    });

    step('touching K6 names it in the header, with its value', () => {
        touch(5, true); ticks(1);
        assert(S.knobTouched === 5, 'touch not seen: ' + S.knobTouched);
        touch(5, false); ticks(1);
        assert(S.knobTouched === -1, 'touch not released');
    });

    step('K8 does nothing, and no knob reaches the track underneath', () => {
        const q0 = writes.length; ticks(16);
        const background = new Set(writes.slice(q0).map(w => w[1]));
        const b = writes.length, snap = JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().stretch, mi().oct, mi().semi, mi().scaleOn]);
        turn(7, 20); turn(7, -20); ticks(12);
        assert(JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().stretch, mi().oct, mi().semi, mi().scaleOn]) === snap, 'K8 changed a setting');
        const extra = writes.slice(b).filter(w => !background.has(w[1]) && !/_padmap$|:slot:parallel$|_audition$/.test(w[1]));
        assert(!extra.length, 'K8 wrote: ' + JSON.stringify(extra.slice(0, 3)));
    });

    step('⭐ Shift+click mutes: nothing plays, the footer offers HEAR, and it is remembered', () => {
        shiftClick();
        assert(!mi().hear && PREFS[prefs.MIDI_MUTE_PATH] === '1\n', 'mute ' + mi().hear + ' ' + PREFS[prefs.MIDI_MUTE_PATH]);
        const b = writes.length;
        jog(1); ticks(40); jog(-1); ticks(40);
        assert(!auditions(b).some(w => /\bon /.test(w[2])), 'a note played while muted');
        assert(MI.miHintsForTest(false).footer[2][1] === 'HEAR', 'footer ' + JSON.stringify(MI.miHintsForTest(false).footer));
        shiftClick();
        assert(mi().hear && PREFS[prefs.MIDI_MUTE_PATH] === '0\n', 'unmute');
        letGo();
    });

    step('⭐⭐ THE LOAD: click → ONE import into the CURRENT clip, from a tick; the automation clear behind it; closed at once', () => {
        const c = S.trackActiveClip[1];
        S.clipNonEmpty[1][c] = false;
        const b = writes.length;
        click(); ticks(8);
        assert(!mi(), 'the screen stayed open');
        const imp = writes.slice(b).filter(w => /_import$/.test(w[1]));
        assert(imp.length === 1, 'import writes: ' + imp.length);
        assert(/^tick#/.test(imp[0][0]) && imp[0][1] === 't1_c' + c + '_import', 'written ' + imp[0][0] + ' ' + imp[0][1]);
        const [head, notes] = imp[0][2].split('|');
        assert(head === '0 1 128', 'header ' + head + ' (no replace, 1/16, 8 bars)');
        assert(notes.split(';').length === 32 && /^a 0 60 100 96$/.test(notes.split(';')[0]), 'notes ' + notes.slice(0, 40));
        const ki = writes.findIndex((w, i) => i >= b && /_import$/.test(w[1]));
        assert(writes.slice(ki).some(w => w[1] === 't1_pa_clear'), 'no automation clear behind the load');
        assert(S.undoAvailable && !S.undoJs, 'Undo does not reach the load');
        assert(/LOADED/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        ticks(60);
        assert(!/FAILED/.test(JSON.stringify(S.actionPopupLines)), 'it said it failed');
    });

    step('⭐ it reopens where it was: the folder and the file (remembered device-wide)', () => {
        assert(/\/data\/UserData\n\/data\/UserData\/song\.mid\n/.test(PREFS[prefs.MIDI_PLACE_PATH] || ''), 'place ' + JSON.stringify(PREFS[prefs.MIDI_PLACE_PATH]));
        openImport(1);
        assert(!mi().root && mi().items[mi().idx].label === 'song', 'reopened on ' + JSON.stringify(mi().items[mi().idx]));
        /* a multi-part file has nothing to hear: its list does not drop away */
        letGo();
        assert(mi().list.up, 'the list dropped on a row with nothing to hear');
    });

    step('⭐ the current clip has notes: REPLACES in the header, and the click loads with no confirm', () => {
        click(); ticks(2);                                          /* into song */
        letGo();
        S.clipNonEmpty[1][S.trackActiveClip[1]] = true;
        assert(MI.miHintsForTest(false).warning === 'REPLACES', 'warning ' + MI.miHintsForTest(false).warning);
        const b = writes.length;
        click(); ticks(4);
        const imp = writes.slice(b).filter(w => /_import$/.test(w[1]));
        assert(imp.length === 1 && imp[0][2].startsWith('1 '), 'replace flag: ' + (imp[0] && imp[0][2].slice(0, 12)));
        assert(!mi(), 'a confirm came up');
    });

    step('⭐ parsing waits for the jog to REST: scrolling past a file reads none of it; resting reads it once', () => {
        MI.miClose(); MI.miResetForTest(); forget();
        /* A file too big for the background fill (it would read small files anyway). */
        const was = globalThis.__stubStat['/data/UserData/song.mid'].size;
        globalThis.__stubStat['/data/UserData/song.mid'].size = 100 * 1024;
        openImport(1);
        const at = labels().indexOf('song');
        while (mi().idx < at) { jog(1); ticks(1); }
        READS.length = 0;
        for (let i = 0; i < 10; i++) { jog(i % 2 ? 1 : -1); ticks(1); }   /* back and forth across it, fast */
        const song = () => READS.filter(p => p === '/data/UserData/song.mid').length;
        assert(mi().items[mi().idx].label === 'song', 'ended on ' + mi().items[mi().idx].label);
        assert(song() === 0, 'read while scrolling: ' + song());
        ticks(20);
        assert(song() === 1, 'reads after resting: ' + song());
        globalThis.__stubStat['/data/UserData/song.mid'].size = was;
        MI.miClose(); forget();
    });

    step('Back: out of a multi-part file onto its row; then Back closes onto the card', () => {
        MI.miClose(); forget(); openImport(1);
        jogTo('song'); click(); ticks(2);
        back();
        assert(mi() && !mi().file && mi().items[mi().idx].label === 'song', 'not back on the file row');
        back();
        assert(closedToCard(), 'Back did not close onto the card');
    });

    step('a folder that has gone: the first-open list, and it says so', () => {
        PREFS[prefs.MIDI_PLACE_PATH] = '/data/UserData/Gone\n\n'; S.midiPlace = null;
        openImport(1);
        assert(mi().root, 'not the first-open list');
        assert(/FOLDER GONE/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        MI.miClose(); forget();
    });

    step('a file that reads short says so', () => {
        openImport(1);
        jogTo('cut');
        assert(/FILE CUT SHORT/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        MI.miClose(); forget();
    });

    step('a load the engine never confirms: ONE write, never re-sent, and it says LOAD FAILED', () => {
        neverLands = true;
        openImport(1);
        jogTo('song'); click(); ticks(2); letGo();
        S.clipNonEmpty[1][S.trackActiveClip[1]] = false;
        const b = writes.length;
        click(); ticks(60);
        neverLands = false;
        const imp = writes.slice(b).filter(w => /_import$/.test(w[1]));
        assert(imp.length === 1, 'import writes: ' + imp.length);
        assert(/LOAD FAILED/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        forget();
    });

    step('Play under the browser is Play: it reaches the transport, and nothing stops it', () => {
        openImport(1);
        const b = writes.length;
        cc(MovePlay, 127); cc(MovePlay, 0); ticks(4);
        const tr = writes.slice(b).filter(w => w[1] === 'transport');
        assert(tr.length === 1 && tr[0][2] !== 'stop', 'transport writes: ' + JSON.stringify(tr));
        MI.miClose(); forget();
    });

    step('⭐ a DRUM track: the sounds land by the Map (GM), each on a lane; the load names only those lanes', () => {
        S.trackPadMode[0] = PAD_MODE_DRUM; S.trackRoute[0] = 1;
        S.drumLaneNote[0] = Array.from({ length: 32 }, (_, l) => 36 + l);
        S.drumLaneHasNotes[0] = new Array(32).fill(false);
        S.activeDrumLane[0] = 0;
        openImport(0);
        jogTo('beat'); click(); ticks(2);                           /* the first-open list: click opens the file */
        assert(mi().cur && mi().drum, 'no drum page');
        assert(JSON.stringify(mi().voices.map(v => v.pitch)) === '[20,36]', 'sounds ' + JSON.stringify(mi().voices));
        const lanes = mi().assign;
        assert(lanes[1] === 0, 'the kick (36) is not on the lane playing 36: ' + JSON.stringify(lanes));
        assert(JSON.stringify(MI.miHintsForTest(false).footer) === '[["RTPAD","SOUND"],["SHFT","MUTE"]]', 'footer');
    });

    step('hold a sound pad (right-hand) and tap a lane pad: the sound moves there', () => {
        note(0x90, TRACK_PAD_BASE + 4, 100);                        /* sound 0 (pitch 20) */
        assert(mi().held === 0, 'held ' + mi().held);
        note(0x90, TRACK_PAD_BASE + 2, 100); note(0x80, TRACK_PAD_BASE + 2, 0);
        assert(mi().assign[0] === 2, 'assign ' + JSON.stringify(mi().assign));
        note(0x80, TRACK_PAD_BASE + 4, 0);
        assert(mi().held === -1, 'still held');
    });

    step('⭐ the drum load: ONE tN_lanes_import naming only the lanes a sound goes to; no automation clear', () => {
        S.drumLaneHasNotes[0][2] = true;
        assert(MI.miHintsForTest(false).warning === 'REPLACES', 'warning ' + MI.miHintsForTest(false).warning);
        S.drumClipNonEmpty[0][S.trackActiveClip[0]] = true;
        const b = writes.length;
        click(); ticks(4);
        const imp = writes.slice(b).filter(w => /_import$/.test(w[1]));
        assert(imp.length === 1 && imp[0][1] === 't0_lanes_import', 'writes ' + JSON.stringify(imp.map(w => w[1])));
        const named = (imp[0][2].split('|')[1].match(/L\d+/g) || []).join(',');
        assert(named === 'L0,L2', 'lanes named: ' + named);
        assert(imp[0][2].startsWith('1 '), 'replace flag');
        assert(!writes.slice(b).some(w => w[1] === 't0_pa_clear'), 'a drum load cleared the clip automation');
        S.trackPadMode[0] = 0; S.drumLaneHasNotes[0][2] = false; forget();
    });

    step('a track with NO instrument opens it too; a Conductor does not', () => {
        S.trackPadMode[4] = 0; S.trackRoute[4] = 3;
        openImport(4); MI.miClose();
        S.trackPadMode[2] = PAD_MODE_CONDUCT; S.trackRoute[2] = 1;
        tryOpenImport(2);
        assert(!mi(), 'a Conductor opened it');
    });

    step('K8 on the CLIP card: the Import action, CLK IMPORT while touched, a turn does nothing', () => {
        MI.miClose(); snd.soundExit(); ticks(2);
        S.trackPadMode[1] = 0; S.trackRoute[1] = 1;
        S.activeTrack = 1; S.activeBank = 0; S.trackActiveBank[1] = 0; ticks(2);
        const K8 = BANKS_[0].knobs[7];
        assert(K8.abbrev === 'Imprt' && K8.full === 'Import MIDI' && K8.scope === 'action', 'K8 is ' + K8.abbrev);
        touch(7, true); ticks(1);
        assert(JSON.stringify(render.bankPageHints(0)) === '[["CLK","IMPORT"]]', 'hints ' + JSON.stringify(render.bankPageHints(0)));
        const before = writes.length;
        turn(7, 20); turn(7, -20); ticks(4);
        const extra = writes.slice(before).filter(w => !/_padmap$|:slot:parallel$/.test(w[1]));
        assert(!extra.length && !mi(), 'a K8 turn did something: ' + JSON.stringify(extra.slice(0, 3)));
        touch(7, false); ticks(1);
    });

    step('the track menu has no Import MIDI row', () => {
        snd.soundExit(); ticks(2); S.activeTrack = 1;
        cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
        ticks(6);
        if (snd.soundPickStateForTest().view === 18) click();
        const k = snd.soundPickStateForTest().kinds;
        assert(k.length > 0 && !k.includes('midiimport'), 'rows: ' + k.join(','));
        snd.soundExit(); ticks(2);
    });

    step('Note/Session closes it (the escape law)', () => {
        openImport(1);
        cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); ticks(2);
        assert(!mi(), 'still open after Note/Session');
        S.sessionView = false; ticks(2);
    });

    if (failed) { console.error('test_midi_import_gesture: FAIL'); process.exit(1); }
    console.log('test_midi_import_gesture: PASS');
    process.exit(0);
}
main().catch((e) => { bad('main', e); process.exit(1); });
