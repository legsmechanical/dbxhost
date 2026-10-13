/* tests/js/test_groove_menu_gesture.mjs — the global groove, through the real
 * gestures.
 *
 * Project Settings has a Groove row — a picker: Off, Browse..., the two
 * swings, and the project's own loaded groove — and a Groove Amt row. Browse...
 * opens the file list on MIDI files and Ableton grooves; a groove is heard
 * when the jog rests on it (a trial), a click keeps it and leaves the list,
 * Back without a click puts the old groove back. The list opens on the file
 * the project's groove came from, or at the top. Asserted on what the engine
 * is sent, in what order.
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

    step('Project Settings: Groove and Groove Amt are a group of their own between Clock Out and Key', () => {
        openOn('Groove');
        const labels = S.globalMenuItems.map(i => i && (i.type === 'divider' ? '---' : i.label));
        /* a group of its own, between the clock and the key (Josh, 2026-10-13) */
        const at = labels.indexOf('Clock Out');
        assert(JSON.stringify(labels.slice(at, at + 6)) === JSON.stringify(['Clock Out', '---', 'Groove', 'Groove Amt', '---', 'Key']),
               'the groove group reads: ' + labels.slice(at, at + 7).join(' | '));
        assert(labels[labels.indexOf('BPM') + 1] === '---', 'BPM no longer stands alone: ' + labels.slice(0, 4).join(' | '));
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

    step('⭐ a groove is HEARD when the jog rests on it: sent as a trial, and not before the rest', () => {
        const st = MI.miStateForTest();
        onRow(st, 'broken');
        jog(1);                                        /* onto Hand.agr */
        assert(st.items[st.idx].label === 'Hand', 'rig: not on Hand');
        ticks(3);
        assert(sets.length === 0, 'it was sent before the jog rested: ' + JSON.stringify(sets));
        ticks(30);
        assert(JSON.stringify(sets) === JSON.stringify([
            ['groove_begin', '24 4 80 0 0 30 Hand'], ['groove_slots_0', '0 100 0 0 0 90 48 60'], ['groove_commit', 'a']]),
            'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 3 && S.grooveName === 'Hand', 'the mirror: ' + S.grooveKind + ' ' + S.grooveName);
        ticks(60);
        assert(sets.length === 3, 'it was sent again while the jog sat still: ' + sets.length);
        assert(MI.miHintsForTest(false).footer[0][1] === 'KEEP', 'on a groove the click keeps');
    });

    step('⭐ moving on hears the next one; a file that is no groove is passed over in silence', () => {
        sets.length = 0;
        jog(1); ticks(30);                             /* hat.mid */
        assert(JSON.stringify(keys()) === JSON.stringify(['groove_begin', 'groove_slots_0', 'groove_slots_8', 'groove_commit']),
               'the engine was sent: ' + JSON.stringify(keys()));
        assert(sets[0][1] === '24 16 100 0 0 0 hat' && sets[3][1] === 'a', 'a trial of hat: ' + sets[0][1] + ' / ' + sets[3][1]);
        assert(sets[1][1] === '0 100 48 70 0 100 48 70 0 100 48 70 0 100 48 70', 'every other 1/16 three ticks late: ' + sets[1][1]);
        sets.length = 0;
        const st = MI.miStateForTest();
        onRow(st, 'Hand'); jog(-1); ticks(30);         /* broken.agr */
        assert(st.items[st.idx].label === 'broken', 'rig: not on broken');
        assert(sets.length === 0, 'something was sent for a file that is no groove: ' + JSON.stringify(sets));
        assert(S.grooveName === 'hat', 'the groove being heard changed');
    });

    step('⭐ Back without a click: the groove from before the browse comes back', () => {
        sets.length = 0;
        back(); ticks(1);
        assert(!MI.miActive(), 'Back did not leave');
        assert(JSON.stringify(sets) === JSON.stringify([['groove_revert', '1']]), 'the engine was sent: ' + JSON.stringify(sets));
        assert(S.grooveKind === 2 && S.grooveName === '', 'the mirror was not put back: ' + S.grooveKind + ' "' + S.grooveName + '"');
    });

    step('⭐ a click KEEPS the groove playing — one write, no resend — and leaves the list', () => {
        const st = browse();
        onRow(st, 'broken'); jog(1); ticks(30);        /* hear Hand */
        sets.length = 0;
        click();
        assert(JSON.stringify(sets) === JSON.stringify([['groove_keep', '1']]), 'the engine was sent: ' + JSON.stringify(sets));
        assert(!MI.miActive(), 'the list stayed up after a groove was chosen');
        ticks(3);
        assert(sets.length === 1, 'leaving after a keep sent more: ' + JSON.stringify(sets));
        assert(S.grooveKind === 3 && S.grooveName === 'Hand', 'the kept groove did not stay');
        assert(S.grooveFile === '/data/UserData/Hand.agr', 'the file it came from was not kept: ' + S.grooveFile);
    });

    step('a click before the jog has rested still chooses the groove, outright', () => {
        const st = browse();
        onRow(st, 'Hand'); jog(1);                     /* hat, no rest */
        click();
        assert(sets[sets.length - 1][0] === 'groove_commit' && sets[sets.length - 1][1] === '1',
               'not chosen outright: ' + JSON.stringify(sets[sets.length - 1]));
        assert(S.grooveName === 'hat', 'playing ' + S.grooveName);
        assert(!MI.miActive(), 'the list stayed up');
        sets.length = 0;
        ticks(40);
        assert(sets.length === 0, 'something more was sent after the choice: ' + JSON.stringify(sets));
    });

    step('a click on a file that is no groove says so: nothing sent, the list stays, the groove stays', () => {
        const st = browse();
        onRow(st, 'broken'); sets.length = 0; click();
        assert(MI.miActive() && sets.length === 0, 'a file that is no groove was sent or closed the list');
        back(); ticks(1);
        assert(!MI.miActive() && S.grooveName === 'hat' && S.grooveFile === '/data/UserData/hat.mid', 'the chosen groove did not stay');
    });

    step('⭐ two tables are never sent back to back: a click right after a trial went out waits its turn, then goes whole', () => {
        const st = browse();
        onRow(st, 'broken'); jog(1);                   /* Hand */
        let n = 0;
        while (sets.length === 0 && n++ < 40) ticks(1);
        assert(sets.length === 3 && sets[2][1] === 'a', 'rig: the trial of Hand did not go out: ' + JSON.stringify(keys()));
        sets.length = 0;
        jog(1); click();                               /* hat, chosen at once */
        assert(sets.length === 0, 'the second table was sent on top of the first: ' + JSON.stringify(keys()));
        assert(MI.miActive(), 'the list left before the choice had gone');
        jog(-1); click();                              /* and nothing more is taken meanwhile */
        ticks(14);
        assert(!MI.miActive(), 'the list did not leave once the choice had gone');
        assert(JSON.stringify(keys()) === JSON.stringify(['groove_begin', 'groove_slots_0', 'groove_slots_8', 'groove_commit']),
               'it never went: ' + JSON.stringify(keys()));
        assert(sets[0][1].endsWith(' hat') && sets[3][1] === '1', 'not hat, chosen: ' + sets[0][1] + ' / ' + sets[3][1]);
        sets.length = 0;
        back(); ticks(1);
        assert(sets.length === 0 && S.grooveName === 'hat', 'leaving undid the choice: ' + JSON.stringify(sets));
    });

    step('a choice still waiting its turn when the list is left goes out on the way', () => {
        const st = browse();
        onRow(st, 'broken'); jog(1);
        let n = 0;
        while (sets.length === 0 && n++ < 40) ticks(1);
        sets.length = 0;
        jog(1); click(); back();                       /* hat chosen, and out, inside the gap */
        assert(sets.length === 4 && sets[3][0] === 'groove_commit' && sets[3][1] === '1',
               'the choice was lost: ' + JSON.stringify(keys()));
        assert(!keys().includes('groove_revert'), 'and then reverted');
        ticks(1);
    });

    step('the row shows the loaded groove, and it is offered again while a swing plays', () => {
        const row = openOn('Groove');
        assert(row.format(row.get()) === 'hat', 'the row shows ' + row.format(row.get()));
        const labels = pickGroove('Swing 1/16');
        assert(JSON.stringify(labels) === JSON.stringify(['Off', 'Browse...', 'Swing 1/16', 'Swing 1/8', 'hat']),
               'the picker lists: ' + labels.join(' | '));
        pickGroove('hat');
        assert(JSON.stringify(sets) === JSON.stringify([['groove_kind', '3']]),
               'going back to the project\'s groove needs no file: ' + JSON.stringify(sets));
    });

    step('⭐ a loaded groove shows its own Timing, Velocity and Random rows; a swing does not', () => {
        S.grooveKind = 3; S.grooveName = 'hat'; S.grooveTiming = 80; S.grooveVelocity = 30; S.grooveRandom = 0;
        openOn('Groove');
        let labels = S.globalMenuItems.map(i => i && (i.type === 'divider' ? '---' : i.label));
        const at = labels.indexOf('Clock Out');
        assert(JSON.stringify(labels.slice(at, at + 9)) === JSON.stringify(
            ['Clock Out', '---', 'Groove', 'Groove Amt', 'Grv Timing', 'Grv Velocity', 'Grv Random', '---', 'Key']),
            'the groove group reads: ' + labels.slice(at, at + 10).join(' | '));
        const row = openOn('Grv Velocity');
        assert(row.get() === 30 && row.format(30) === '30%', 'Grv Velocity reads ' + row.format(row.get()));
        row.set(55);
        assert(JSON.stringify(sets) === JSON.stringify([['groove_velocity', '55']]), 'the engine was sent: ' + JSON.stringify(sets));
        openOn('Grv Timing').set(70); openOn('Grv Random').set(15);
        assert(S.grooveTiming === 70 && S.grooveRandom === 15, 'the mirrors did not follow');
        /* picking a swing takes the rows away without leaving the menu */
        pickGroove('Swing 1/16');
        menu.ensureGlobalMenuFresh();
        labels = S.globalMenuItems.map(i => i && i.label);
        assert(labels.indexOf('Grv Timing') < 0 && labels.indexOf('Grv Random') < 0, 'a swing still shows the groove\'s rows');
        pickGroove('hat');
        menu.ensureGlobalMenuFresh();
        assert(S.globalMenuItems.some(i => i && i.label === 'Grv Timing'), 'the rows did not come back with the groove');
    });

    step('a groove heard in the list brings its amounts; Back puts the old ones back', () => {
        S.grooveKind = 2; S.grooveName = ''; S.grooveTiming = 100; S.grooveVelocity = 0;
        const st = browse();
        onRow(st, 'broken'); jog(1); ticks(30);        /* hear Hand: Timing 80, Velocity 30 */
        assert(S.grooveTiming === 80 && S.grooveVelocity === 30, 'the trial\'s amounts: ' + S.grooveTiming + ' ' + S.grooveVelocity);
        back(); ticks(1);
        assert(S.grooveTiming === 100 && S.grooveVelocity === 0 && S.grooveKind === 2, 'Back left the trial\'s amounts in the mirrors');
    });

    step('⭐ the browser opens on the file the project\'s groove came from — and at the top for a project with none', () => {
        let st = browse();
        onRow(st, 'Grooves');
        click();
        assert(st.B.currentDir === '/data/UserData/Grooves', 'rig: did not enter the folder');
        onRow(st, 'Deep');
        click();
        assert(S.grooveName === 'Deep' && !MI.miActive(), 'rig: Deep was not loaded');
        assert(S.grooveFile === '/data/UserData/Grooves/Deep.agr', 'the file was not kept: ' + S.grooveFile);
        st = browse();
        assert(st.B.currentDir === '/data/UserData/Grooves', 'reopened in ' + st.B.currentDir);
        assert(st.items[st.idx].label === 'Deep', 'not on the groove\'s own row: ' + st.items[st.idx].label);
        back(); back(); ticks(1);
        assert(!MI.miActive(), 'rig: the list did not close');
        /* a file that has since gone: the top */
        S.grooveFile = '/data/UserData/Gone/x.agr';
        st = browse();
        assert(st.B.currentDir === '/data/UserData', 'a folder that is gone opened ' + st.B.currentDir);
        back(); ticks(1);
        /* another project, with no loaded groove: the top, wherever this one was */
        S.grooveFile = '';
        st = browse();
        assert(st.B.currentDir === '/data/UserData', 'a project with no groove opened in ' + st.B.currentDir);
        back(); ticks(1);
        S.grooveFile = '/data/UserData/Grooves/Deep.agr';
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
