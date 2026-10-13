/* tests/js/test_groove_menu_gesture.mjs — the global groove, through the real
 * gestures.
 *
 * Project Settings has a Groove row (a picker: Off, the two swings, then the
 * user's own grooves), a Groove Amt row, and Make Groove..., which opens the
 * file list on MIDI files and Ableton grooves; a click on one makes a groove of
 * it, keeps it in the grooves folder and plays it. Asserted on what the engine
 * is sent, in what order, and on what lands in the folder.
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
};
globalThis.__stubStdBinFiles = { '/data/UserData/hat.mid': HAT, '/data/UserData/Hand.agr': AGR,
                                 '/data/UserData/broken.agr': Uint8Array.from(ascii('this is not a groove file at all......')) };
FILES[GDIR + '/Lazy.json'] = JSON.stringify({ v: 1, name: 'x', base: 24, n: 2, timing: 90, quantize: 0, random: 5,
                                              velocity: 40, off: [0, 48], vel: [0, 80] });
FILES[GDIR + '/Torn.json'] = '{"base":24,';

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    const osStub = await import('os');
    const listing = { '/data/UserData': ['UserLibrary', 'hat.mid', 'Hand.agr', 'broken.agr', 'notes.txt'],
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

    step('Project Settings: Groove and Groove Amt stand where Swing Amt and Swing Res stood', () => {
        openOn('Groove');
        const labels = S.globalMenuItems.map(i => i && (i.type === 'divider' ? '---' : i.label));
        const at = labels.indexOf('BPM');
        assert(JSON.stringify(labels.slice(at, at + 5)) === JSON.stringify(['BPM', 'Groove', 'Groove Amt', 'Make Groove...', '---']),
               'the tempo group reads: ' + labels.slice(at, at + 6).join(' | '));
        assert(labels.indexOf('Swing Amt') < 0 && labels.indexOf('Swing Res') < 0, 'a Swing row is still in the menu');
    });

    step('⭐ the Groove picker: Off, the swings, then the grooves in the folder — and a swing is one write', () => {
        S.grooveKind = 1;
        const labels = pickGroove('Swing 1/8');
        assert(JSON.stringify(labels) === JSON.stringify(['Off', 'Swing 1/16', 'Swing 1/8', 'Lazy', 'Torn']),
               'the picker lists: ' + labels.join(' | '));
        assert(JSON.stringify(sets) === JSON.stringify([['groove_kind', '2']]), 'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 2, 'the mirror did not follow');
        assert(S.globalMenuItems.find(i => i && i.label === 'Groove').format(
               S.globalMenuItems.find(i => i && i.label === 'Groove').get()) === 'Swing 1/8', 'the row does not show the choice');
    });

    step('⭐ picking a groove of your own sends its table: begin, slots, commit — in that order', () => {
        pickGroove('Lazy');
        assert(JSON.stringify(sets) === JSON.stringify([
            ['groove_begin', '24 2 90 0 5 40 Lazy'], ['groove_slots_0', '0 0 48 80'], ['groove_commit', '1']]),
            'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 3 && S.grooveName === 'Lazy', 'the mirror: ' + S.grooveKind + ' ' + S.grooveName);
        const row = openOn('Groove');
        assert(row.format(row.get()) === 'Lazy', 'the row shows ' + row.format(row.get()));
    });

    step('a damaged groove file says so, and the groove that was playing stays', () => {
        pickGroove('Torn');
        assert(sets.length === 0, 'something was sent for a file that could not be read: ' + JSON.stringify(sets));
        assert(S.grooveKind === 3 && S.grooveName === 'Lazy', 'the groove changed');
    });

    step('Groove Amt: a plain percentage for a groove, the old swing read-out for a swing', () => {
        const row = openOn('Groove Amt');
        assert(row.format(40) === '40%', 'a table reads ' + row.format(40));
        S.grooveKind = 1;
        assert(row.format(64) === '66%' && row.format(0) === '50%', 'a swing reads ' + row.format(64));
        row.set(64);
        assert(JSON.stringify(sets) === JSON.stringify([['groove_amt', '64']]), 'the engine was sent: ' + JSON.stringify(sets));
        S.grooveKind = 3;
    });

    step('a project that plays a groove whose file is gone still shows it, and can go back to it', () => {
        S.grooveKind = 3; S.grooveName = 'From Elsewhere';
        const labels = pickGroove('Swing 1/16');
        assert(labels[labels.length - 1] === 'From Elsewhere', 'the project\'s own groove is not offered: ' + labels.join(' | '));
        S.grooveName = 'From Elsewhere';                 /* the engine keeps the table while a swing plays */
        const again = pickGroove('From Elsewhere');
        assert(again.indexOf('From Elsewhere') >= 0, 'gone once a swing was chosen');
        assert(JSON.stringify(sets) === JSON.stringify([['groove_kind', '3']]),
               'going back to it needs no file: ' + JSON.stringify(sets));
    });

    step('⭐ Make Groove...: the click leaves the menu and the tick opens the file list, MIDI and .agr together', () => {
        openOn('Make Groove...');
        click();
        assert(!S.globalMenuOpen, 'the menu stayed up');
        assert(!MI.miActive(), 'the list opened from the click, not the tick (it lists a folder)');
        ticks(2);
        assert(MI.miActive() && MI.miStateForTest().groove, 'the list did not open');
        const st = MI.miStateForTest();
        const names = st.items.map(i => i.kind + ':' + i.label);
        assert(JSON.stringify(names) === JSON.stringify(['dir:UserLibrary', 'file:broken', 'file:Hand', 'file:hat']),
               'the list shows: ' + names.join(' | '));
        assert(MI.miHintsForTest(false).footer[0][1] === 'OPEN', 'on a folder the click opens');
    });

    step('nothing is heard or read while the jog moves through the list', () => {
        const st = MI.miStateForTest();
        jog(1); ticks(40);
        assert(st.idx === 1 && !st.pending && !st.cur, 'the list is previewing: ' + JSON.stringify({ p: !!st.pending, c: !!st.cur }));
        assert(MI.miHintsForTest(false).footer[0][1] === 'MAKE', 'on a file the click makes');
        assert(sets.length === 0, 'the engine was sent something by a list: ' + JSON.stringify(sets));
    });

    step('a file that is no groove says so and the list stays', () => {
        click();
        assert(MI.miActive(), 'the list closed on a file it could not read');
        assert(sets.length === 0 && !FILES[GDIR + '/broken.json'], 'something was made of it');
    });

    step('⭐ a click on an .agr makes a groove of it: kept in the folder under its own name, and sent', () => {
        jog(1);
        assert(MI.miStateForTest().items[MI.miStateForTest().idx].label === 'Hand', 'rig: not on Hand.agr');
        click();
        assert(!MI.miActive(), 'the list did not close');
        const kept = JSON.parse(FILES[GDIR + '/Hand Made.json'] || 'null');
        assert(kept, 'nothing was kept: ' + Object.keys(FILES).join(' | '));
        assert(kept.base === 24 && kept.n === 4 && kept.timing === 80 && kept.velocity === 30,
               'kept as: ' + JSON.stringify(kept));
        assert(JSON.stringify(kept.off) === JSON.stringify([0, 0, 0, 48]) && JSON.stringify(kept.vel) === JSON.stringify([100, 0, 90, 60]),
               'its slots: ' + JSON.stringify([kept.off, kept.vel]));
        assert(DIRS.indexOf(GDIR) >= 0, 'the grooves folder was never made');
        assert(JSON.stringify(keys()) === JSON.stringify(['groove_begin', 'groove_slots_0', 'groove_commit']),
               'the engine was sent: ' + JSON.stringify(keys()));
        assert(sets[0][1] === '24 4 80 0 0 30 Hand Made', 'begin: ' + sets[0][1]);
        assert(S.grooveKind === 3 && S.grooveName === 'Hand Made', 'the mirror: ' + S.grooveName);
    });

    step('⭐ a click on a MIDI file makes a groove from its notes, a slot a 1/16', () => {
        listing[GDIR] = ['Lazy.json', 'Torn.json', 'Hand Made.json'];
        openOn('Make Groove...'); click(); ticks(2);
        const st = MI.miStateForTest();
        st.idx = st.items.findIndex(i => i.label === 'hat');
        assert(st.idx >= 0, 'rig: hat.mid is not listed');
        click();
        assert(!MI.miActive(), 'the list did not close');
        const kept = JSON.parse(FILES[GDIR + '/hat.json'] || 'null');
        assert(kept && kept.base === 24 && kept.n === 16, 'kept as: ' + JSON.stringify(kept));
        assert(kept.off.every((o, i) => o === (i % 2 ? 48 : 0)), 'every other 1/16 three ticks late: ' + JSON.stringify(kept.off));
        assert(kept.vel.every((v, i) => v === (i % 2 ? 70 : 100)), 'velocities: ' + JSON.stringify(kept.vel));
        assert(JSON.stringify(keys()) === JSON.stringify(['groove_begin', 'groove_slots_0', 'groove_slots_8', 'groove_commit']),
               'the engine was sent: ' + JSON.stringify(keys()));
    });

    step('a second groove of the same name is kept beside the first, never over it', () => {
        listing[GDIR] = ['Lazy.json', 'Torn.json', 'Hand Made.json', 'hat.json'];
        const first = FILES[GDIR + '/hat.json'];
        openOn('Make Groove...'); click(); ticks(2);
        const st = MI.miStateForTest();
        st.idx = st.items.findIndex(i => i.label === 'hat');
        click();
        assert(FILES[GDIR + '/hat.json'] === first, 'the first was overwritten');
        assert(FILES[GDIR + '/hat 2.json'], 'no "hat 2": ' + Object.keys(FILES).join(' | '));
        assert(S.grooveName === 'hat 2', 'playing ' + S.grooveName);
    });

    step('Back leaves the list without making anything', () => {
        openOn('Make Groove...'); click(); ticks(2);
        assert(MI.miActive(), 'rig: the list is not open');
        back(); ticks(1);
        assert(!MI.miActive(), 'Back did not leave');
        assert(sets.length === 0, 'something was sent: ' + JSON.stringify(sets));
    });

    step('⚠ CONTROL: the ordinary MIDI import list still does not show groove files', () => {
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
