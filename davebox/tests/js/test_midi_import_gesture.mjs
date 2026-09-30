/* tests/js/test_midi_import_gesture.mjs — the MIDI browser, through the real
 * gestures (Import MIDI and the phrase browser as one screen, 2026-09-29;
 * dAVEBOx's feel, round 2, 2026-09-30).
 *
 * Touch K8 on the CLIP (or DRUM LANE) card and click the jog: the tick opens
 * it over the card. Three layers, one Back each: the LIST (folders and MIDI
 * files, the install hidden; a multi-part file entered like a folder; each
 * file HEARD as the jog rests on it; a click PICKS), the CARD (the picked
 * file; knobs that name on touch and raise a list only on a turn; click =
 * Load), and dAVEBOx's Yes/No CONFIRM (nothing reaches a clip without a Yes;
 * Back = No). Per-track memory, the step buttons blocked, the transport and
 * the rest passing through, and a drum track's sound placement. Asserted on what
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
    const forget = () => { MI.miResetForTest(); };
    const layer = () => mi() && mi().layer;
    const imports = (from) => writes.slice(from).filter(w => /_import$/.test(w[1]));
    /* from the list: land on a file and pick it (a click) — the card */
    const pickFile = (label) => { jogTo(label); click(); assert(layer() === 'card', 'no card after picking ' + label + ': ' + layer()); };
    const answer = (yes) => { if (yes) jog(1); else jog(-1); click(); ticks(2); };

    step('setup: track 2 melodic, routed to Move, C major', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.trackRoute[1] = 1; S.trackPadMode[1] = 0; S.trackChannel[1] = 2;
        S.padKey = 0; S.padScale = 0;
        ticks(8);
    });

    step('⭐⭐ THE DOOR: touch K8 + click opens it on the LIST (a track\'s first open) — the transport is NOT stopped', () => {
        S.playing = true;
        const before = writes.length;
        openImport(1);
        ticks(4);
        assert(layer() === 'list', 'layer ' + layer());
        assert(!writes.slice(before).some(w => w[1] === 'transport'), 'a transport write');
        S.playing = false;
    });

    step('the list: the user data folder — folders and MIDI files, the install hidden', () => {
        const l = labels();
        assert(l.includes('UserLibrary') && l.includes('song') && l.includes('beat'), 'missing: ' + JSON.stringify(l));
        for (const h of ['schwung', 'dbx-host', 'notes', '.hidden']) assert(!l.includes(h), h + ' is listed');
        assert(JSON.stringify(MI.miHintsForTest(false).footer[0]) === '["CLK","PICK"]' ||
               JSON.stringify(MI.miHintsForTest(false).footer[0]) === '["CLK","OPEN"]', 'footer ' + JSON.stringify(MI.miHintsForTest(false).footer));
        assert(ink(12, 55) > 0, 'the list drew nothing');
    });

    step('a multi-part file: click goes IN like a folder; its parts are the list', () => {
        jogTo('song');
        click();
        assert(layer() === 'list' && mi().file && mi().file.path === '/data/UserData/song.mid', 'not inside the file');
        assert(JSON.stringify(labels()) === '["..","Lead","Bass"]', 'parts ' + JSON.stringify(labels()));
    });

    step('⭐ landing on a part PLAYS it: a note-on from a tick, through tN_audition', () => {
        const b = writes.length;
        for (let i = 0; i < 40 && !auditions(b).some(w => /\bon /.test(w[2])); i++) ticks(1);
        const a = auditions(b).find(w => /\bon /.test(w[2]));
        assert(a && /^tick#/.test(a[0]), 'no audition note-on from a tick');
        assert(!writes.slice(b).some(w => /live_notes/.test(w[1])), 'a live_notes write');
    });

    step('the next part: the last one released, the new one playing — and still the LIST (no timer)', () => {
        const b = writes.length;
        jog(1); ticks(80);
        assert(mi().cur && mi().cur.name === 'Bass', 'cur ' + (mi().cur && mi().cur.name));
        const a = auditions(b).map(w => w[2]).join(' | ');
        assert(/alloff/.test(a) && /on 36 /.test(a), 'auditions: ' + a);
        assert(layer() === 'list', 'the list went away on its own');
        jog(-1); ticks(4);
    });

    step('⭐ a click PICKS the part: the card, with the lane and the card\'s footer', () => {
        click();
        assert(layer() === 'card' && mi().sel && mi().sel.name === 'Lead', 'layer ' + layer());
        assert(ink(33, 39) > 20, 'no lane drawn');
        assert(JSON.stringify(MI.miHintsForTest(false).footer) === '[["CLK","LOAD"],["JOG","FILE"],["SHFT","MUTE"]]',
               'footer ' + JSON.stringify(MI.miHintsForTest(false).footer));
    });

    step('a new file starts at Start 1, Grid 1/16, Stretch x1, Bars = its length', () => {
        assert(mi().startBar === 1 && mi().grid === 1 && mi().stretch === 3 && mi().bars === 8,
               'start ' + mi().startBar + ' grid ' + mi().grid + ' stretch ' + mi().stretch + ' bars ' + mi().bars);
    });

    step('⭐ a knob TOUCH names it; its list comes up only on a TURN', () => {
        touch(3, true); ticks(1);
        assert(S.knobTouched === 3 && S.knobTurnedTick[3] === -1, 'touch: ' + S.knobTouched + ' / ' + S.knobTurnedTick[3]);
        const bare = ink(9, 57);
        turn(3, 12);
        assert(S.knobTurnedTick[3] >= 0, 'the turn was not seen');
        const listed = ink(9, 57);
        assert(bare !== listed, 'the turn did not raise the list');
        turn(3, -12);
        touch(3, false); ticks(1);
        assert(S.knobTouched === -1, 'touch not released');
    });

    step('K1 Start / K2 Bars: the window, and what will not land said in the header', () => {
        turn(1, -40);                                                 /* fewer bars */
        assert(mi().bars < 8 && /CUT$/.test(MI.miHintsForTest(false).warning), 'bars ' + mi().bars + ' warning ' + MI.miHintsForTest(false).warning);
        turn(1, 200);
        assert(mi().bars === 8, 'Bars went past the file: ' + mi().bars);
        turn(0, 20);                                                  /* start later: Bars follows the file's end */
        assert(mi().startBar > 1 && mi().bars === 8 - mi().startBar + 1, 'start ' + mi().startBar + ' bars ' + mi().bars);
        turn(0, -200); turn(1, 200);
    });

    step('⭐ Bars and Grid stay linked by the clip\'s steps: 1/32 at x2 holds 4 bars', () => {
        turn(2, -12);                                                 /* 1/32 */
        turn(3, 12);                                                  /* x2 */
        assert(mi().grid === 0 && mi().stretch === 4, 'grid ' + mi().grid + ' stretch ' + mi().stretch);
        assert(mi().bars === 4, 'bars ' + mi().bars);
        turn(3, -12); turn(2, 12); turn(1, 200);
        assert(mi().bars === 8 && mi().grid === 1, 'back: bars ' + mi().bars + ' grid ' + mi().grid);
    });

    step('K5 Oct / K6 Semi / K7 Scale: Semi +1 on C is C#, which Scale folds up to D; Scale off keeps C#', () => {
        const first = () => mi().plan.notes[0].p;
        assert(first() === 60, 'setup ' + first());
        turn(5, 1);
        assert(mi().semi === 1 && first() === 62, 'semi ' + mi().semi + ' → ' + first());
        turn(6, -20);
        assert(!mi().scaleOn && first() === 61, 'scale off → ' + first());
        turn(4, -10);
        assert(mi().oct === -1 && first() === 49, 'oct -1 → ' + first());
        turn(4, 10); turn(5, -1); turn(6, 20);
        assert(first() === 60 && mi().scaleOn, 'back ' + first());
    });

    step('K8 is the file\'s BPM: shown, and a turn does nothing', () => {
        const snap = JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().stretch, mi().oct, mi().semi, mi().scaleOn]);
        turn(7, 30); ticks(2);
        assert(JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().stretch, mi().oct, mi().semi, mi().scaleOn]) === snap, 'K8 changed a setting');
        assert(mi().cur.bpm === 120, 'bpm ' + mi().cur.bpm);
        const ring = MI.miRingCells();
        assert(ring[7].kind === 'blank', 'K8\'s ring is not dark');
    });

    step('⭐ Shift+click mutes: nothing plays, the footer offers HEAR, and it is remembered', () => {
        shiftClick();
        assert(!mi().hear && PREFS[prefs.MIDI_MUTE_PATH] === '1\n', 'mute');
        const b = writes.length; ticks(40);
        assert(!auditions(b).some(w => /\bon /.test(w[2])), 'a note played while muted');
        assert(MI.miHintsForTest(false).footer[2][1] === 'HEAR', 'footer');
        shiftClick();
        assert(mi().hear && PREFS[prefs.MIDI_MUTE_PATH] === '0\n', 'unmute');
    });

    step('⭐ the step buttons are blocked while it is open', () => {
        const c = S.trackActiveClip[1], before = JSON.stringify(S.clipSteps[1][c].slice(0, 16)), b = writes.length;
        note(0x90, 16, 100);
        assert(S.heldStep === -1, 'the step press reached the step editor: heldStep ' + S.heldStep);
        note(0x80, 16, 0); ticks(4);
        assert(JSON.stringify(S.clipSteps[1][c].slice(0, 16)) === before, 'a step changed');
        assert(!writes.slice(b).some(w => /_toggle|_set_notes|_step/.test(w[1])), 'a step write: ' + JSON.stringify(writes.slice(b).filter(w => /step/.test(w[1]))));
        assert(layer() === 'card', 'the press changed the screen');
    });

    step('⭐⭐ THE LOAD asks first: click → LOAD INTO CLIP, No selected; Back = No writes nothing', () => {
        const b = writes.length;
        click();
        assert(layer() === 'confirm' && mi().confirm.kind === 'load' && !mi().confirm.yes, 'no confirm');
        back();
        assert(layer() === 'card' && !imports(b).length, 'Back wrote or left: ' + layer());
        click(); answer(false);
        assert(layer() === 'card' && !imports(b).length, 'No wrote or left');
    });

    step('⭐⭐ ... and Yes loads: ONE import into the CURRENT clip, from a tick; the automation clear behind it; closed', () => {
        const c = S.trackActiveClip[1];
        S.clipNonEmpty[1][c] = false;
        const b = writes.length;
        click(); answer(true); ticks(8);
        assert(!mi(), 'the screen stayed open');
        const imp = imports(b);
        assert(imp.length === 1 && /^tick#/.test(imp[0][0]) && imp[0][1] === 't1_c' + c + '_import', 'imports ' + JSON.stringify(imp.map(w => w[1])));
        const [head, notes] = imp[0][2].split('|');
        assert(head === '0 1 128', 'header ' + head + ' (no replace, 1/16, 8 bars)');
        assert(notes.split(';').length === 32 && /^a 0 60 100 96$/.test(notes.split(';')[0]), 'notes ' + notes.slice(0, 40));
        const ki = writes.findIndex((w, i) => i >= b && /_import$/.test(w[1]));
        assert(writes.slice(ki).some(w => w[1] === 't1_pa_clear'), 'no automation clear behind the load');
        assert(S.undoAvailable && !S.undoJs, 'Undo does not reach the load');
        assert(closedToCard(), 'not back on the card');
        ticks(60);
        assert(!/FAILED/.test(JSON.stringify(S.actionPopupLines)), 'it said it failed');
    });

    step('⭐ switching files puts Start, Grid and Stretch back (1, 1/16, x1) and Bars to the file\'s length', () => {
        openImport(1);
        turn(0, 20); turn(2, 12); turn(3, 12);
        assert(mi().startBar > 1 && mi().grid === 2 && mi().stretch === 4, 'setup: start ' + mi().startBar + ' grid ' + mi().grid + ' stretch ' + mi().stretch);
        jog(1); jog(1); ticks(4);                                   /* the list, on to Bass */
        click();
        assert(layer() === 'card' && mi().cur.name === 'Bass', 'picked ' + (mi().cur && mi().cur.name));
        assert(mi().startBar === 1 && mi().grid === 1 && mi().stretch === 3 && mi().bars === 8,
               'start ' + mi().startBar + ' grid ' + mi().grid + ' stretch ' + mi().stretch + ' bars ' + mi().bars);
        jog(1); jog(-1); ticks(4); click();                         /* back to Lead, for what follows */
        assert(mi().cur.name === 'Lead', 'back on ' + mi().cur.name);
        back(); back();                                             /* LEAVE IMPORT → No */
        assert(!mi(), 'still open');
    });

    step('⭐ per track: it reopens on the file this track picked, on the CARD', () => {
        openImport(1);
        assert(layer() === 'card' && mi().sel && mi().sel.path === '/data/UserData/song.mid' && mi().sel.name === 'Lead',
               'reopened on ' + layer() + ' ' + JSON.stringify(mi().sel && mi().sel.name));
    });

    step('the jog raises the list; Back closes it and puts back the file you had', () => {
        jog(1);
        assert(layer() === 'list', 'layer ' + layer());
        jog(1); ticks(20);
        back();
        assert(layer() === 'card' && mi().cur && mi().cur.name === 'Lead', 'back on ' + (mi().cur && mi().cur.name));
    });

    step('⭐ Back on the card with a file picked asks LEAVE IMPORT; No leaves without loading', () => {
        const b = writes.length;
        back();
        assert(layer() === 'confirm' && mi().confirm.kind === 'leave', 'layer ' + layer());
        back();
        assert(closedToCard() && !imports(b).length, 'did not leave cleanly');
    });

    step('LEAVE IMPORT, Yes: loads, then leaves', () => {
        openImport(1);
        S.clipNonEmpty[1][S.trackActiveClip[1]] = true;
        assert(MI.miHintsForTest(false).warning === 'REPLACES', 'warning ' + MI.miHintsForTest(false).warning);
        const b = writes.length;
        back(); answer(true); ticks(4);
        const imp = imports(b);
        assert(imp.length === 1 && imp[0][2].startsWith('1 '), 'imports ' + JSON.stringify(imp.map(w => w[2].slice(0, 8))));
        assert(closedToCard(), 'not back on the card');
    });

    step('another track has its own memory: it opens on the list', () => {
        S.trackPadMode[3] = 0; S.trackRoute[3] = 1;
        openImport(3);
        assert(layer() === 'list', 'layer ' + layer());
        MI.miClose();
    });

    step('⭐ parsing waits for the jog to REST: scrolling past a file reads none of it; resting reads it once', () => {
        forget();
        const was = globalThis.__stubStat['/data/UserData/song.mid'].size;
        globalThis.__stubStat['/data/UserData/song.mid'].size = 100 * 1024;   /* too big for the background fill */
        openImport(1);
        const at = labels().indexOf('song');
        while (mi().idx < at) { jog(1); ticks(1); }
        READS.length = 0;
        for (let i = 0; i < 10; i++) { jog(i % 2 ? 1 : -1); ticks(1); }
        const song = () => READS.filter(p => p === '/data/UserData/song.mid').length;
        assert(mi().items[mi().idx].label === 'song', 'ended on ' + mi().items[mi().idx].label);
        assert(song() === 0, 'read while scrolling: ' + song());
        ticks(20);
        assert(song() === 1, 'reads after resting: ' + song());
        globalThis.__stubStat['/data/UserData/song.mid'].size = was;
        MI.miClose(); forget();
    });

    step('`..` goes up out of a multi-part file onto its row; Back on the list (nothing picked) leaves', () => {
        openImport(1);
        jogTo('song'); click(); ticks(2);
        jogTo('..'); click();
        assert(layer() === 'list' && !mi().file && mi().items[mi().idx].label === 'song', 'not back on the file row');
        back();
        assert(closedToCard(), 'Back did not close onto the card');
    });

    step('a file that reads short says so', () => {
        forget(); openImport(1);
        jogTo('cut');
        assert(/FILE CUT SHORT/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        MI.miClose(); forget();
    });

    step('a load the engine never confirms: ONE write, never re-sent, and it says LOAD FAILED', () => {
        neverLands = true;
        openImport(1);
        jogTo('song'); click(); ticks(2); click();
        S.clipNonEmpty[1][S.trackActiveClip[1]] = false;
        const b = writes.length;
        click(); answer(true); ticks(60);
        neverLands = false;
        assert(imports(b).length === 1, 'import writes: ' + imports(b).length);
        assert(/LOAD FAILED/.test(JSON.stringify(S.actionPopupLines)), 'popup ' + JSON.stringify(S.actionPopupLines));
        forget();
    });

    step('Play and the rest pass through: Play reaches the transport, and nothing stops it', () => {
        openImport(1);
        const b = writes.length;
        cc(MovePlay, 127); cc(MovePlay, 0); ticks(4);
        const tr = writes.slice(b).filter(w => w[1] === 'transport');
        assert(tr.length === 1 && tr[0][2] !== 'stop', 'transport writes: ' + JSON.stringify(tr));
        assert(mi(), 'Play closed it');
        MI.miClose(); forget();
    });

    step('⭐ a DRUM track: the sounds land by the Map (GM), each on a lane', () => {
        S.trackPadMode[0] = PAD_MODE_DRUM; S.trackRoute[0] = 1;
        S.drumLaneNote[0] = Array.from({ length: 32 }, (_, l) => 36 + l);
        S.drumLaneHasNotes[0] = new Array(32).fill(false);
        S.activeDrumLane[0] = 0;
        openImport(0);
        pickFile('beat');
        assert(mi().drum, 'not a drum card');
        assert(JSON.stringify(mi().voices.map(v => v.pitch)) === '[20,36]', 'sounds ' + JSON.stringify(mi().voices));
        assert(mi().assign[1] === 0, 'the kick (36) is not on the lane playing 36: ' + JSON.stringify(mi().assign));
        assert(JSON.stringify(MI.miHintsForTest(false).footer) === '[["RTPAD","SOUND"],["SHFT","MUTE"]]', 'footer');
    });

    step('hold a sound pad (right-hand) and tap a lane pad: the sound moves there', () => {
        note(0x90, TRACK_PAD_BASE + 4, 100);
        assert(mi().held === 0, 'held ' + mi().held);
        note(0x90, TRACK_PAD_BASE + 2, 100); note(0x80, TRACK_PAD_BASE + 2, 0);
        assert(mi().assign[0] === 2, 'assign ' + JSON.stringify(mi().assign));
        note(0x80, TRACK_PAD_BASE + 4, 0);
        assert(mi().held === -1, 'still held');
    });

    step('⭐ the drum load: confirmed, then ONE tN_lanes_import naming only the lanes a sound goes to; no automation clear', () => {
        S.drumLaneHasNotes[0][2] = true;
        assert(MI.miHintsForTest(false).warning === 'REPLACES', 'warning ' + MI.miHintsForTest(false).warning);
        S.drumClipNonEmpty[0][S.trackActiveClip[0]] = true;
        const b = writes.length;
        click();
        assert(layer() === 'confirm', 'no confirm');
        answer(true); ticks(4);
        const imp = imports(b);
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
