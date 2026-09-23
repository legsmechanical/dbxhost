/* tests/js/test_fx_move_rows.mjs — Move Up / Move Down, reached the way a user
 * reaches them.
 *
 * Josh, 2026-09-22: reorder insert effects — "look at how upstream does it.
 * it's an option under the module in the module list." So this drives the
 * REAL gesture: Shift+Note to the track's sound menu, jog to an FX block,
 * Shift+click to its module list, jog onto Move Down, click — and reads what
 * is ON SCREEN before and after. A green move verb says nothing about whether
 * anyone can reach it; that is the lesson this repo paid for with #378.
 *
 * The engine here is MUTABLE and permutes on `fx:move` exactly as the chain
 * does (refusing a hole), so "the order changed" is read back through the same
 * `fxN:module` keys the block list reads.
 */
import './_bulk_get_stub.mjs';
import * as os from 'os';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

/* ---- a chain that holds modules and MOVES them ---- */
const loaded = {};                       /* comp -> module id (one slot is enough) */
const moves = [];
function seedChain(fx, prefix) {
    for (const k of Object.keys(loaded)) delete loaded[k];
    loaded.synth = 'nusaw';
    fx.forEach((id, i) => { if (id) loaded[(prefix || '') + 'fx' + (i + 1)] = id; });
    moves.length = 0;
}
globalThis.shadow_get_param = (slot, k) => {
    if (typeof k !== 'string') return '';
    const m = k.match(/^(.*):module$/);
    if (m) return loaded[m[1]] || '';
    /* This chain HAS four positions: the menu probes fx3/fx4 through this. */
    if (/fx[1-4]:bypassed$/.test(k)) return '0';
    return '';
};
globalThis.shadow_set_param = (slot, k, v) => {
    if (typeof k !== 'string') return 0;
    const mk = /^(.*)fx:move$/.exec(k);      /* "fx:move", or a bus's "<prefix>fx:move" */
    if (mk) {
        const p = mk[1];
        moves.push(k + '=' + String(v));
        const mm = /^(\d)>(\d)$/.exec(String(v));
        if (!mm) return 0;
        const from = +mm[1], to = +mm[2];
        const lo = Math.min(from, to), hi = Math.max(from, to);
        for (let i = lo; i <= hi; i++) if (!loaded[p + 'fx' + i]) return 0;   /* the host's hole refusal */
        const ids = [1, 2, 3, 4].map(i => loaded[p + 'fx' + i] || '');
        const [mod] = ids.splice(from - 1, 1);
        ids.splice(to - 1, 0, mod);
        ids.forEach((id, i) => { if (id) loaded[p + 'fx' + (i + 1)] = id; else delete loaded[p + 'fx' + (i + 1)]; });
        return 1;
    }
    const m = k.match(/^(.*):module$/);
    if (m) loaded[m[1]] = String(v);
    return 1;
};

/* ---- the audio-FX catalogue, as the scan reads it off disk ---- */
const FX_DIR = '/data/UserData/schwung/modules/audio_fx';
const CATALOGUE = { chorus: 'Chorus', delay: 'Delay', reverb: 'Reverb', crush: 'Crush' };
os.__setReaddir({ [FX_DIR]: Object.keys(CATALOGUE) });
globalThis.host_read_file = (p) => {
    const m = String(p).match(/audio_fx\/([^/]+)\/module\.json$/);
    return m && CATALOGUE[m[1]]
        ? JSON.stringify({ id: m[1], name: CATALOGUE[m[1]], component_type: 'audio_fx' }) : '';
};
for (const fn of ['host_system_cmd', 'host_module_set_param', 'host_vol_block', 'host_edit_cc_block',
                  'move_midi_internal_send', 'set_led', 'stipple_rect', 'draw_line', 'flush_display',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable'])
    globalThis[fn] = () => 0;
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_get_param = () => '';
globalThis.host_module_set_params = () => true;
globalThis.shadow_save_state_now = () => true;
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

/* ⭐ THE SCREEN, as text: every string drawn, in DRAW order — a list draws its
 * rows top to bottom, so this is the order a user reads them. Two doors: the
 * small font goes through print(); the header font (a list row's VALUE) is
 * pixel glyphs, reported through the kit's text trace. */
let printed = [];
globalThis.clear_screen = () => { printed = []; };
globalThis.print = (x, y, str) => { printed.push({ s: String(str), x: x | 0 }); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* A header-font label is pixel glyphs: its LEFT edge is its first ink. */
globalThis.set_pixel = (x) => {
    const last = printed[printed.length - 1];
    if (last && last.hdr && (last.x == null || x < last.x)) last.x = x | 0;
};

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const { MoveNoteSession } = await import('../../ui/ui_constants.mjs');
const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
const fonts = await import('../../ui/ui_fonts_pp.mjs');

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; tickmod._tickImpl(); } }
const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const JOG = 14, CLICK = 3;

function screen() {
    globalThis.clear_screen();
    fonts.setKitTextTrace((t) => printed.push({ s: String(t), hdr: true, x: null }));
    try { render.drawUI(); } finally { fonts.setKitTextTrace(null); }
    return printed.map(p => p.s.trim()).filter(Boolean);
}
/* The strings on screen that are among `names`, in screen order. */
function onScreen(names) { return screen().filter(s => names.includes(s)); }

function openMenu() {
    cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
    ticks(6);
    if (snd.soundPickStateForTest().view !== 0) throw new Error('the sound menu did not open');
}
function jogMenuTo(comp) {
    for (let g = 0; g < 40 && snd.soundPickStateForTest().comps[snd.soundPickStateForTest().row] !== comp; g++) {
        const st = snd.soundPickStateForTest();
        const want = st.comps.indexOf(comp);
        if (want < 0) throw new Error('no ' + comp + ' row on the menu: ' + JSON.stringify(st.comps));
        cc(JOG, st.row < want ? 1 : 127); ticks(1);
    }
    const st = snd.soundPickStateForTest();
    if (st.comps[st.row] !== comp) throw new Error('the jog never reached ' + comp);
}
function shiftClick() { cc(MoveShift, 127); cc(CLICK, 127); cc(CLICK, 0); cc(MoveShift, 0); ticks(4); }
function click() { cc(CLICK, 127); cc(CLICK, 0); ticks(4); }
function browseTo(name) {
    for (let g = 0; g < 40; g++) {
        const b = snd.soundBrowseStateForTest();
        const want = b.names.indexOf(name);
        if (want < 0) throw new Error('no "' + name + '" row: ' + JSON.stringify(b.names));
        if (b.idx === want) return;
        cc(JOG, b.idx < want ? 1 : 127); ticks(1);
    }
    throw new Error('the jog never reached "' + name + '"');
}
function browse(comp) {
    snd.soundExit(); ticks(2);
    openMenu(); jogMenuTo(comp); shiftClick();
    const b = snd.soundBrowseStateForTest();
    if (!b.browsing) throw new Error('Shift+click on ' + comp + ' did not open its module list');
    return b;
}
const MODULE_NAMES = Object.values(CATALOGUE);
/* The Move rows are in the movy SMALL font (the crumb bar's), which draws capitals. */
const UP = '<MOVE UP', DOWN = '>MOVE DOWN';
const ROWS = MODULE_NAMES.concat(MODULE_NAMES.map(n => '[' + n + ']'), [UP, DOWN, '[ none ]']);

step('setup: track 1 on a Schwung chain holding Delay, Chorus, Reverb', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    S.activeTrack = 0; S.trackRoute[0] = 0;
    seedChain(['delay', 'chorus', 'reverb', '']);
    ticks(8);
});

step('control: the block list reads DELAY, CHORUS, REVERB before any move (the screen read sees the order)', () => {
    snd.soundExit(); ticks(2);
    openMenu(); jogMenuTo('fx3');            /* scrolled so all three filled blocks show */
    const order = onScreen(['DELAY', 'CHORUS', 'REVERB']);
    if (JSON.stringify(order) !== JSON.stringify(['DELAY', 'CHORUS', 'REVERB']))
        throw new Error('the screen reads ' + JSON.stringify(order));
});

step('⭐ FX 2\'s module list shows Move Up and Move Down directly under the loaded module', () => {
    const b = browse('fx2');
    if (b.names[b.idx] !== 'Chorus')
        throw new Error('the cursor opens on ' + JSON.stringify(b.names[b.idx]) + ', not the loaded module');
    let rows = onScreen(ROWS);
    const at = rows.indexOf('[Chorus]');
    if (rows.includes('Chorus')) throw new Error('the loaded module is also drawn WITHOUT brackets: ' + JSON.stringify(rows));
    if (at < 0) throw new Error('the loaded module is not on screen: ' + JSON.stringify(rows));
    if (rows[at + 1] !== UP)
        throw new Error('Move Up is not under the loaded module: ' + JSON.stringify(rows));
    /* The list shows a few rows at a time: scroll to Move Down and read again. */
    browseTo('>Move down');
    rows = onScreen(ROWS);
    const i = rows.indexOf('[Chorus]');
    if (i < 0 || rows[i + 1] !== UP || rows[i + 2] !== DOWN)
        throw new Error('the Move rows are not under the loaded module: ' + JSON.stringify(rows));
});

step('the Move rows are INDENTED under the module, in the small font; other modules are not bracketed', () => {
    screen();
    const xOf = (t) => { const p = printed.find(q => q.s === t); return p ? p.x : null; };
    const mod = xOf('[Chorus]'), down = xOf(DOWN);
    if (!printed.find(q => q.s === DOWN && q.hdr)) throw new Error('>Move down is not in a kit (small) font');
    if (printed.find(q => q.s === '[Chorus]' && q.hdr)) throw new Error('the module name moved out of the list font too');
    if (mod == null || down == null) throw new Error('rows not printed: ' + JSON.stringify(printed.map(p => p.s)));
    if (!(down >= mod + 8)) throw new Error('Move down at x=' + down + ', module at x=' + mod + ' — not indented');
    const other = printed.map(p => p.s).filter(t => /^\[(Crush|Delay|Reverb)\]$/.test(t));
    if (other.length) throw new Error('a module that is NOT loaded is bracketed: ' + JSON.stringify(other));
});

step('⭐⭐ on Move Down, click: the block list shows the NEW order, the moved block selected', () => {
    browseTo('>Move down');
    click();
    if (JSON.stringify(moves) !== JSON.stringify(['fx:move=2>3']))
        throw new Error('the host was asked ' + JSON.stringify(moves) + ', want ["2>3"]');
    const st = snd.soundPickStateForTest();
    if (st.view !== 0) throw new Error('did not land on the block list: view ' + st.view);
    if (st.comps[st.row] !== 'fx3')
        throw new Error('the cursor is on ' + st.comps[st.row] + ', not the moved block (fx3)');
    const order = onScreen(['DELAY', 'CHORUS', 'REVERB']);
    if (JSON.stringify(order) !== JSON.stringify(['DELAY', 'REVERB', 'CHORUS']))
        throw new Error('the screen reads ' + JSON.stringify(order) + ' — want DELAY, REVERB, CHORUS\n' +
                        JSON.stringify(screen()));
});

step('FX 1 offers only Move Down; the last filled block only Move Up (never toward an empty block)', () => {
    seedChain(['delay', 'chorus', 'reverb', '']);
    let rows = browse('fx1').names;
    if (rows.includes('<Move up') || !rows.includes('>Move down'))
        throw new Error('FX 1 rows: ' + JSON.stringify(rows));
    rows = browse('fx3').names;
    if (!rows.includes('<Move up') || rows.includes('>Move down'))
        throw new Error('FX 3 (FX 4 empty) rows: ' + JSON.stringify(rows));
});

step('an EMPTY block offers no Move rows at all', () => {
    const rows = browse('fx4').names;
    if (rows.includes('<Move up') || rows.includes('>Move down'))
        throw new Error('an empty block offered a move: ' + JSON.stringify(rows));
});

step('Shift+click on a Move row MOVES (it is not a module to file in a list)', () => {
    seedChain(['delay', 'chorus', 'reverb', '']);
    browse('fx2');
    browseTo('<Move up');
    shiftClick();
    if (JSON.stringify(moves) !== JSON.stringify(['fx:move=2>1']))
        throw new Error('the host was asked ' + JSON.stringify(moves));
    if (loaded.fx1 !== 'chorus' || loaded.fx2 !== 'delay') throw new Error('order: ' + JSON.stringify(loaded));
});

step('⚠ CONTROL: a move the host REFUSES stays in the list, and nothing is loaded in its place', () => {
    seedChain(['delay', 'chorus', 'reverb', '']);
    browse('fx2');
    browseTo('>Move down');
    delete loaded.fx3;                      /* the neighbour emptied under us */
    click();
    if (!snd.soundBrowseStateForTest().browsing) throw new Error('a refused move left the list');
    if (loaded.fx2 !== 'chorus') throw new Error('fx2 now holds ' + JSON.stringify(loaded.fx2));
    if (Object.values(loaded).some(v => /__move/.test(v))) throw new Error('the control row was LOADED as a module');
});

step('⭐ a MASTER FX insert moves too: its own rows, the bus\'s move key, the bus\'s list reorders', () => {
    snd.soundExit(); ticks(2);
    seedChain(['delay', 'chorus', '', ''], 'master_fx:');
    S.sessionView = true;                    /* the bus list is Session view's */
    snd.soundEnterBuses(); ticks(2);
    click();                                 /* into MASTER FX */
    if (!snd.soundIsGlobal()) throw new Error('rig: not in the Master FX bus');
    jogMenuTo('master_fx:fx1'); shiftClick();
    const b = snd.soundBrowseStateForTest();
    if (!b.browsing) throw new Error('Shift+click did not open the bus insert\'s module list');
    if (b.names.includes('<Move up') || !b.names.includes('>Move down'))
        throw new Error('Master FX 1 rows: ' + JSON.stringify(b.names));
    browseTo('>Move down'); click();
    if (JSON.stringify(moves) !== JSON.stringify(['master_fx:fx:move=1>2']))
        throw new Error('the host was asked ' + JSON.stringify(moves));
    const st = snd.soundPickStateForTest();
    if (st.comps[st.row] !== 'master_fx:fx2') throw new Error('cursor on ' + st.comps[st.row]);
    const order = onScreen(['DELAY', 'CHORUS']);
    if (JSON.stringify(order) !== JSON.stringify(['CHORUS', 'DELAY']))
        throw new Error('the bus screen reads ' + JSON.stringify(order));
    snd.soundExit(); S.sessionView = false; ticks(2);
});

os.__setReaddir(null);
if (failed) { console.log('FAIL: fx move rows'); process.exit(1); }
console.log('PASS: Move Up / Move Down sit under the loaded module, and picking one reorders what the block list shows');
}
main().catch(e => { console.error(e); process.exit(1); });
