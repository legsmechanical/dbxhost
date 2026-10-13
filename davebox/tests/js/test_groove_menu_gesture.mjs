/* tests/js/test_groove_menu_gesture.mjs — the global groove, through the real
 * gestures.
 *
 * Project Settings has a Groove row — a picker: Off, Browse..., the two
 * swings, and the project's own loaded groove — and a Groove Amt row. Browse...
 * opens the file list on MIDI files and Ableton grooves; a click on one loads
 * it as the project's groove, straight from the file, and the list stays for
 * the next. The list reopens in the folder the last groove came from. Asserted on what
 * the engine is sent, in what order.
 * → a green pin says "wired", only the gesture says "reachable".
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction') throw new Error('async step');
    try { fn(); ok(l); } catch (e) { bad(l, e); }
}
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display',
    'move_midi_internal_send', 'set_led', 'host_open_service', 'host_close_service',
    'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_inject_to_move', 'clear_screen', 'print', 'fill_rect', 'draw_rect', 'set_pixel'])
    globalThis[fn] = () => 0;
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
const GDIR = '/data/UserData/dAVEBOx Grooves';
const FILES = {};
const DIRS = [];
let swallowed = null;
globalThis.host_read_file = (p) => FILES[p] ?? '';
globalThis.host_file_exists = (p) => p in FILES;
globalThis.host_ensure_dir = (p) => { DIRS.push(String(p)); return true; };
globalThis.host_write_file = (p, body) => {
    /* the entry points SWALLOW errors into this log: a write here is a crash */
    if (String(p).indexOf('jserr') >= 0) { if (swallowed === null) swallowed = String(body).slice(0, 900); return true; }
    FILES[p] = String(body);
    return true;
};
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];
const sets = [];
globalThis.host_module_set_param = (k, v) => { sets.push([String(k), String(v)]); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';

/* ---- fixtures, written by hand ---- */
function vlq(n) { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; }
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];
function track(ev) { const b = []; for (const [dt, ...x] of ev) b.push(...vlq(dt), ...x); b.push(0, 0xff, 0x2f, 0); return chunk('MTrk', b); }
/* one bar of 1/16ths, every other one three ticks late */
const hat = [];
for (let i = 0; i < 16; i++) {
    const late = i % 2 ? 3 : 0, prevLate = i % 2 ? 0 : (i ? 3 : 0);
    hat.push([i === 0 ? 0 : 24 - 12 - prevLate + late, 0x90, 42, i % 2 ? 70 : 100], [12, 0x80, 42, 0]);
}
const HAT = Uint8Array.from([...chunk('MThd', [0, 0, 0, 1, 0, 96]), ...track(hat)]);
const AGR = Uint8Array.from(ascii(`<?xml version="1.0" encoding="UTF-8"?>
<Ableton><Groove><Name Value="Hand Made" />
<Clip><Value><MidiClip><Loop><LoopStart Value="0" /><LoopEnd Value="1" /></Loop>
<Notes><KeyTracks><KeyTrack><Notes>
<MidiNoteEvent Time="0" Duration="0.1" Velocity="100" IsEnabled="true" />
<MidiNoteEvent Time="0.5" Duration="0.1" Velocity="90" IsEnabled="true" />
<MidiNoteEvent Time="0.78125" Duration="0.1" Velocity="60" IsEnabled="true" />
</Notes></KeyTrack></KeyTracks></Notes></MidiClip></Value></Clip>
<Grid Value="3" /><QuantizationAmount Value="0" /><TimingAmount Value="80" /><RandomAmount Value="0" /><VelocityAmount Value="30" />
</Groove></Ableton>`));
const DIR = 0o040000, REG = 0o100000;
globalThis.__stubStat = {
    '/data/UserData/UserLibrary': { mode: DIR, size: 0 },
    '/data/UserData/hat.mid': { mode: REG, size: HAT.length },
    '/data/UserData/Hand.agr': { mode: REG, size: AGR.length },
    '/data/UserData/broken.agr': { mode: REG, size: 40 },
    '/data/UserData/Grooves': { mode: DIR, size: 0 },
    '/data/UserData/Grooves/Deep.agr': { mode: REG, size: AGR.length },
};
globalThis.__stubStdBinFiles = { '/data/UserData/hat.mid': HAT, '/data/UserData/Hand.agr': AGR, '/data/UserData/Grooves/Deep.agr': AGR,
                                 '/data/UserData/broken.agr': Uint8Array.from(ascii('this is not a groove file at all......')) };
FILES[GDIR + '/Lazy.json'] = JSON.stringify({ v: 1, name: 'x', base: 24, n: 2, timing: 90, quantize: 0, random: 5,
                                              velocity: 40, off: [0, 48], vel: [0, 80] });
FILES[GDIR + '/Torn.json'] = '{"base":24,';

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    const osStub = await import('os');
    const listing = { '/data/UserData': ['UserLibrary', 'Grooves', 'hat.mid', 'Hand.agr', 'broken.agr', 'notes.txt'],
                      '/data/UserData/Grooves': ['Deep.agr'],
                      '/data/UserData/UserLibrary': [], [GDIR]: ['Lazy.json', 'Torn.json', '.hidden.json', 'readme.txt'] };
    osStub.__setReaddir(listing);
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const menu = await import('../../ui/ui_menu.mjs');
    const MI = await import('../../ui/ui_midi_import.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const HC = await import('/data/UserData/schwung/shared/constants.mjs');

    const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
    const click = () => { cc(3, 127); cc(3, 0); };
    const jog = (d) => cc(14, d > 0 ? 1 : 127);
    const back = () => { cc(HC.MoveBack, 127); cc(HC.MoveBack, 0); };
    const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } };
    const keys = () => sets.map(x => x[0]);

    function openOn(label) {
        if (!S.bankParams)
            S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => new Array(16).fill(0)));
        S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
        S.awaitingProjectSelect = false; S.sessionView = false; S.shiftHeld = false;
        S.globalEnumPick = null;
        S.pendingDefaultSetParams.length = 0; sets.length = 0;
        menu.openGlobalMenu();
        const idx = S.globalMenuItems.findIndex(i => i && i.label === label);
        if (idx < 0) throw new Error('no "' + label + '" row in the global menu: '
            + S.globalMenuItems.map(i => i && i.label).join(' | '));
        S.globalMenuState.selectedIndex = idx;
        return S.globalMenuItems[idx];
    }
    /* Open the Groove picker and move to the row labelled `want`. */
    function pickGroove(want) {
        const row = openOn('Groove');
        click();
        assert(S.globalEnumPick, 'the click did not open the Groove picker');
        const labels = S.globalEnumPick.raw.map(v => row.format(v));
        const at = labels.indexOf(want);
        assert(at >= 0, 'no "' + want + '" in the picker: ' + labels.join(' | '));
        for (let g = 0; g < 40 && S.globalEnumPick.sel !== at; g++) jog(S.globalEnumPick.sel < at ? 1 : -1);
        assert(S.globalEnumPick.sel === at, 'the jog never reached "' + want + '"');
        click();
        assert(!S.globalEnumPick, 'the picker did not close');
        return labels;
    }

    const PREF = '/data/UserData/dbx-host/groove-browse-dir.txt';
    /* Pick Browse... in the Groove picker and let the tick open the list. */
    function browse() {
        pickGroove('Browse...');
        assert(!S.globalMenuOpen, 'the menu stayed up');
        assert(!MI.miActive(), 'the list opened from the click, not the tick (it lists a folder)');
        ticks(2);
        assert(MI.miActive() && MI.miStateForTest().groove, 'the list did not open');
        return MI.miStateForTest();
    }
    const onRow = (st, label) => { st.idx = st.items.findIndex(i => i.label === label); assert(st.idx >= 0, 'rig: no "' + label + '" row'); };

    step('Project Settings: Groove and Groove Amt stand where Swing Amt and Swing Res stood', () => {
        openOn('Groove');
        const labels = S.globalMenuItems.map(i => i && (i.type === 'divider' ? '---' : i.label));
        const at = labels.indexOf('BPM');
        assert(JSON.stringify(labels.slice(at, at + 4)) === JSON.stringify(['BPM', 'Groove', 'Groove Amt', '---']),
               'the tempo group reads: ' + labels.slice(at, at + 5).join(' | '));
        assert(labels.indexOf('Swing Amt') < 0 && labels.indexOf('Swing Res') < 0 && labels.indexOf('Make Groove...') < 0,
               'a row that should be gone is in the menu');
    });

    step('⭐ the Groove picker: Off, Browse..., the two swings — and a swing is one write', () => {
        S.grooveKind = 1; S.grooveName = '';
        const labels = pickGroove('Swing 1/8');
        assert(JSON.stringify(labels) === JSON.stringify(['Off', 'Browse...', 'Swing 1/16', 'Swing 1/8']),
               'the picker lists: ' + labels.join(' | '));
        assert(JSON.stringify(sets) === JSON.stringify([['groove_kind', '2']]), 'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 2, 'the mirror did not follow');
        const row = S.globalMenuItems.find(i => i && i.label === 'Groove');
        assert(row.format(row.get()) === 'Swing 1/8', 'the row does not show the choice');
        pickGroove('Off');
        assert(S.grooveKind === 0 && sets[0][1] === '0', 'Off was not sent');
    });

    step('Groove Amt: a plain percentage for a groove, the old swing read-out for a swing', () => {
        const row = openOn('Groove Amt');
        S.grooveKind = 3;
        assert(row.format(40) === '40%', 'a table reads ' + row.format(40));
        S.grooveKind = 1;
        assert(row.format(64) === '66%' && row.format(0) === '50%', 'a swing reads ' + row.format(64));
        row.set(64);
        assert(JSON.stringify(sets) === JSON.stringify([['groove_amt', '64']]), 'the engine was sent: ' + JSON.stringify(sets));
    });

    step('⭐ Browse... leaves the menu, changes nothing, and the tick opens the file list — MIDI and .agr together', () => {
        S.grooveKind = 2;
        const st = browse();
        assert(sets.length === 0 && S.grooveKind === 2, 'picking Browse... changed the groove: ' + JSON.stringify(sets));
        const names = st.items.map(i => i.kind + ':' + i.label);
        assert(JSON.stringify(names) === JSON.stringify(['dir:Grooves', 'dir:UserLibrary', 'file:broken', 'file:Hand', 'file:hat']),
               'the list shows: ' + names.join(' | '));
        assert(MI.miHintsForTest(false).footer[0][1] === 'OPEN', 'on a folder the click opens');
    });

    step('nothing is heard or read while the jog moves through the list', () => {
        const st = MI.miStateForTest();
        onRow(st, 'UserLibrary');
        jog(1); ticks(40);
        assert(st.items[st.idx].label === 'broken' && !st.pending && !st.cur, 'the list is previewing');
        assert(MI.miHintsForTest(false).footer[0][1] === 'LOAD', 'on a file the click loads');
        assert(sets.length === 0, 'the engine was sent something by a list: ' + JSON.stringify(sets));
    });

    step('a file that is no groove says so; nothing is sent and the list stays', () => {
        click();
        assert(MI.miActive(), 'the list closed on a file it could not read');
        assert(sets.length === 0, 'something was sent: ' + JSON.stringify(sets));
    });

    step('⭐ a click on an .agr LOADS it: sent to the engine under the name on the list, and the list stays for the next', () => {
        const st = MI.miStateForTest();
        onRow(st, 'Hand');
        click();
        assert(JSON.stringify(sets) === JSON.stringify([
            ['groove_begin', '24 4 80 0 0 30 Hand'], ['groove_slots_0', '0 100 0 0 0 90 48 60'], ['groove_commit', '1']]),
            'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 3 && S.grooveName === 'Hand', 'the mirror: ' + S.grooveKind + ' ' + S.grooveName);
        assert(MI.miActive(), 'the list closed: the next groove should be a jog and a click away');
        assert(!Object.keys(FILES).some(k => /\.json$/.test(k) && k !== GDIR + '/Lazy.json' && k !== GDIR + '/Torn.json'),
               'a copy was written somewhere: ' + Object.keys(FILES).join(' | '));
    });

    step('⭐ ...and the next one: a MIDI file, read a slot a 1/16', () => {
        sets.length = 0;
        const st = MI.miStateForTest();
        onRow(st, 'hat');
        click();
        assert(JSON.stringify(keys()) === JSON.stringify(['groove_begin', 'groove_slots_0', 'groove_slots_8', 'groove_commit']),
               'the engine was sent: ' + JSON.stringify(keys()));
        assert(sets[0][1] === '24 16 100 0 0 0 hat', 'begin: ' + sets[0][1]);
        assert(sets[1][1] === '0 100 48 70 0 100 48 70 0 100 48 70 0 100 48 70', 'every other 1/16 three ticks late: ' + sets[1][1]);
        assert(S.grooveName === 'hat', 'playing ' + S.grooveName);
    });

    step('Back leaves the list; the row shows the loaded groove, and it is offered again while a swing plays', () => {
        back(); ticks(1);
        assert(!MI.miActive(), 'Back did not leave');
        const row = openOn('Groove');
        assert(row.format(row.get()) === 'hat', 'the row shows ' + row.format(row.get()));
        const labels = pickGroove('Swing 1/16');
        assert(JSON.stringify(labels) === JSON.stringify(['Off', 'Browse...', 'Swing 1/16', 'Swing 1/8', 'hat']),
               'the picker lists: ' + labels.join(' | '));
        pickGroove('hat');
        assert(JSON.stringify(sets) === JSON.stringify([['groove_kind', '3']]),
               'going back to the project\'s groove needs no file: ' + JSON.stringify(sets));
    });

    step('⭐ the browser reopens in the folder the last groove was loaded from — kept on the device, and not undone by backing out', () => {
        let st = browse();
        onRow(st, 'Grooves');
        click();
        assert(st.B.currentDir === '/data/UserData/Grooves', 'rig: did not enter the folder');
        onRow(st, 'Deep');
        click();
        assert(S.grooveName === 'Deep', 'rig: Deep was not loaded');
        back(); back(); back(); ticks(1);
        assert(!MI.miActive(), 'rig: the list did not close');
        assert((FILES[PREF] || '').trim() === '/data/UserData/Grooves', 'the folder was not kept: ' + FILES[PREF]);
        st = browse();
        assert(st.B.currentDir === '/data/UserData/Grooves', 'reopened in ' + st.B.currentDir);
        assert(st.items.some(i => i.label === 'Deep'), 'the folder\'s files are not listed');
        back(); back(); ticks(1);
    });

    step('⚠ CONTROL: the ordinary MIDI import list still does not show groove files', () => {
        if (MI.miActive()) MI.miClose();
        MI.miOpen(0);
        const st = MI.miStateForTest();
        assert(st && !st.groove, 'rig: the import list did not open');
        assert(!st.items.some(i => i.label === 'Hand' || i.label === 'broken'), 'an .agr is offered to Import MIDI');
        MI.miClose();
    });

    if (swallowed) { console.error('  FAIL — an entry point swallowed an exception:\n' + swallowed); failed = 1; }
    if (failed) { console.error('FAIL: test_groove_menu_gesture.mjs'); process.exit(1); }
    console.log('PASS: test_groove_menu_gesture.mjs');
}
main().catch(e => { console.error(e); process.exit(1); });
