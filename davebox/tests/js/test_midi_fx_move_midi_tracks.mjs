/* tests/js/test_midi_fx_move_midi_tracks.mjs — MIDI FX on a MOVE track and a
 * MIDI track, from the same Sound-menu row a Schwung track has.
 *
 * Such a track's own chain slot is parked (its instrument is Move's, or a
 * device on the port), so its MIDI FX block is borrowed: the engine plays the
 * track through the slot (tN_fxslot) and the slot hands the effect's output
 * back instead of playing it (chain key `midi_fx_host_route`). What can go
 * wrong is in the UI, so this drives the REAL gesture — the row on the menu,
 * a click, the picker, a pick, Back — and asserts what reached the engine:
 *
 *   - the row is there on Move and MIDI tracks (and not on None/Conductor);
 *   - on a MOVE track the screen is the Move BUS (slot 0, keys by prefix,
 *     modules by PATH), and the MIDI FX block is the CHAIN slot's: the pick
 *     must load by ID into the track's slot, never slot 0 or a path;
 *   - the slot's switch is written BEFORE the engine's (else a note would
 *     reach a slot still playing its effect on the parked instrument);
 *   - Back lands on the Move bus menu again, not a chain menu;
 *   - [ none ] switches both off; a Schwung track's pick writes neither;
 *   - a route change carries the effect across.
 */
import './_bulk_get_stub.mjs';
import * as os from 'os';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

/* The engine, per SLOT: a Move bus key ignores the slot (the UI sends 0), a
 * chain key is the slot's own. */
const HIER = JSON.stringify({ levels: { root: {
    name: 'Arp', params: [{ key: 'rate', name: 'Rate', type: 'int', min: 0, max: 8 }], knobs: ['rate'] } } });
const CP = JSON.stringify([{ key: 'rate', name: 'Rate', type: 'int', min: 0, max: 8, step: 1 }]);
const ENG = {};                                  /* `${slot}|${key}` -> value */
const sets = [];                                 /* [slot, key, value] in order */
const order = [];                                /* every write, chain and engine, in order */
const kk = (slot, key) => (/^move_fx:/.test(key) ? 0 : slot) + '|' + key;
globalThis.shadow_get_param = (slot, key) => {
    const v = ENG[kk(slot, key)];
    if (v !== undefined) return v;
    if (/^midi_fx1:(ui_hierarchy)$/.test(key) && ENG[kk(slot, 'midi_fx1:module')]) return HIER;
    if (/^midi_fx1:(chain_params)$/.test(key) && ENG[kk(slot, 'midi_fx1:module')]) return CP;
    return '';
};
globalThis.shadow_set_param = (slot, key, val) => {
    ENG[kk(slot, key)] = String(val);
    sets.push([slot, key, String(val)]);
    order.push('chain:' + slot + ':' + key + '=' + val);
    return 1;
};
const dsp = {};
globalThis.host_module_set_param = (k, v) => { dsp[k] = String(v); order.push('dsp:' + k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.shadow_save_state_now = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['fill_rect', 'draw_rect', 'stipple_rect', 'set_pixel', 'clear_screen', 'print', 'pixel_print', 'flush_display', 'draw_line'])
    globalThis[fn] = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.shadow_get_shift_held = () => 0;
let swallowed = null;
globalThis.host_write_file = (path, body) => {
    if (String(path).indexOf('jserr') >= 0 && swallowed === null) swallowed = String(body).slice(0, 900);
    return true;
};
for (const fn of ['host_ensure_dir', 'host_remove_dir', 'host_system_cmd', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 ? '' : 0);

/* The MIDI FX catalogue, as the scan reads it off disk. */
const MF = '/data/UserData/schwung/modules/midi_fx';
os.__setReaddir({ [MF]: ['arp'] });
globalThis.host_read_file = (p) => (String(p) === MF + '/arp/module.json'
    ? JSON.stringify({ id: 'arp', name: 'Arpeggiator', capabilities: { component_type: 'midi_fx' } }) : '');
globalThis.host_file_exists = (p) => String(p) === MF + '/arp/module.json';

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const bridge = await import('../../ui/ui_dsp_bridge.mjs');

const VIEW_BLOCKS = 0, VIEW_BROWSE = 2;
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const click = () => { cc(3, 127); cc(3, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const back  = () => { cc(51, 127); cc(51, 0); };

const T = 3;                                    /* a track whose slot is NOT 0 */
function reset() {
    for (const k of Object.keys(ENG)) delete ENG[k];
    for (const k of Object.keys(dsp)) delete dsp[k];
    sets.length = 0; order.length = 0;
}
/* The sound menu of track T, routed `route`. */
function enterMenu(route) {
    snd.soundExit(); ticks(2);
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) { GS.trackRoute[i] = 0; GS.trackPadMode[i] = 0; }
    GS.trackRoute[T] = route;
    GS.trackChannel[T] = 2;                     /* a Move instrument, so the track has a bus */
    GS.activeTrack = T;
    if (route === 1) snd.soundEnterMove(T); else snd.soundEnter(T, T);
    ticks(4);
    assert(snd.soundOpen(), 'rig: sound mode did not open');
    if (snd.soundViewForTest() !== VIEW_BLOCKS) { click(); ticks(3); }   /* the prompt -> the menu */
    assert(snd.soundViewForTest() === VIEW_BLOCKS, 'rig: not on the menu, view ' + snd.soundViewForTest());
}
function rowAt(comp) {
    const st = snd.soundPickStateForTest();
    return comp instanceof RegExp ? st.comps.findIndex((c) => comp.test(c || '')) : st.comps.indexOf(comp);
}
const BUS_FX1 = /^move_fx:\d+:fx1$/;
function goRow(comp) {
    const at = rowAt(comp);
    assert(at >= 0, 'no ' + comp + ' row: ' + JSON.stringify(snd.soundPickStateForTest().labels));
    snd.soundPickRowSetForTest(at);
}
/* Click the MIDI FX row on an empty block, and pick `Arpeggiator`. */
function pickArp() {
    goRow('midi_fx1');
    click(); ticks(4);
    const b = snd.soundBrowseStateForTest();
    assert(snd.soundViewForTest() === VIEW_BROWSE && b.browsing, 'the click did not open the picker (view ' + snd.soundViewForTest() + ')');
    const at = b.names.indexOf('Arpeggiator');
    assert(at >= 0, 'the picker does not list the MIDI effect: ' + JSON.stringify(b.names));
    for (let g = 0; snd.soundBrowseStateForTest().idx !== at && g < 10; g++) { jog(at > snd.soundBrowseStateForTest().idx ? 1 : -1); ticks(1); }
    assert(snd.soundBrowseStateForTest().idx === at, 'rig: could not reach the effect in the picker');
    click(); ticks(8);
}
function pickNone() {
    goRow('midi_fx1');
    cc(49, 127); click(); cc(49, 0); ticks(4);          /* Shift+click: change */
    if (snd.soundViewForTest() !== VIEW_BROWSE) { click(); ticks(4); }
    assert(snd.soundViewForTest() === VIEW_BROWSE, 'rig: the picker did not open for [ none ]');
    const at = snd.soundBrowseStateForTest().names.indexOf('[ none ]');
    for (let g = 0; snd.soundBrowseStateForTest().idx !== at && g < 10; g++) { jog(at > snd.soundBrowseStateForTest().idx ? 1 : -1); ticks(1); }
    const b = snd.soundBrowseStateForTest();
    assert(at >= 0 && b.idx === at, 'rig: could not reach [ none ]: ' + JSON.stringify(b));
    click(); ticks(8);
}

step('⭐⭐ a MOVE track\'s Sound menu has a MIDI FX row, ahead of its bus effects', () => {
    reset(); enterMenu(1);
    const st = snd.soundPickStateForTest();
    const m = st.comps.indexOf('midi_fx1'), f = rowAt(BUS_FX1);
    assert(m >= 0, 'no MIDI FX row on a Move track: ' + JSON.stringify(st.labels));
    assert(st.labels[m] === 'MIDI FX', 'the row is labelled ' + st.labels[m]);
    assert(f > m, 'the MIDI FX row is not ahead of the bus effects: ' + JSON.stringify(st.comps));
});

step('⭐⭐ THE GESTURE on a Move track: click, pick — the effect loads by ID into the track\'s OWN slot', () => {
    reset(); enterMenu(1);
    pickArp();
    if (swallowed) throw new Error('an exception was swallowed: ' + swallowed);
    const load = sets.find((s) => s[1] === 'midi_fx1:module');
    assert(load, 'nothing was loaded: ' + JSON.stringify(sets));
    assert(load[0] === T, 'loaded into slot ' + load[0] + ', not the track\'s slot ' + T + ' (the bus addresses slot 0)');
    assert(load[2] === 'arp', 'loaded "' + load[2] + '" — a bus loads by PATH, a chain slot by ID');
});

step('⭐⭐ ...and both halves are switched on, the SLOT\'s first', () => {
    const c = order.indexOf('chain:' + T + ':midi_fx_host_route=1');
    const d = order.indexOf('dsp:t' + T + '_fxslot=1');
    assert(c >= 0, 'the slot was not told to hand its output back: ' + JSON.stringify(order));
    assert(d >= 0, 'the engine was not told to play the track through its slot: ' + JSON.stringify(order));
    assert(c < d, 'the engine was switched before the slot: ' + JSON.stringify(order));
});

step('⭐ Back from the effect lands on the MOVE track\'s menu again, not a chain menu', () => {
    for (let g = 0; snd.soundViewForTest() !== VIEW_BLOCKS && g < 4; g++) { back(); ticks(4); }
    assert(snd.soundViewForTest() === VIEW_BLOCKS, 'never got back to the menu, view ' + snd.soundViewForTest());
    const bus = snd.soundBusForTest();
    assert(bus && bus.kind === 'move', 'the menu lost its Move bus: ' + JSON.stringify(bus));
    assert(snd.soundSlot() === 0, 'the Move bus menu is addressing slot ' + snd.soundSlot());
    assert(rowAt(BUS_FX1) >= 0 && rowAt('midi_fx1') >= 0, 'not the Move menu: ' + JSON.stringify(snd.soundPickStateForTest().comps));
});

step('⭐ [ none ] on a Move track switches both off', () => {
    order.length = 0;
    pickNone();
    assert(order.indexOf('chain:' + T + ':midi_fx_host_route=0') >= 0, 'the slot was not switched off: ' + JSON.stringify(order));
    assert(order.indexOf('dsp:t' + T + '_fxslot=0') >= 0, 'the engine was not switched off: ' + JSON.stringify(order));
});

step('⭐⭐ a MIDI track has the row too, and the same pick switches it on', () => {
    reset(); enterMenu(2);
    assert(rowAt('midi_fx1') >= 0, 'no MIDI FX row on a MIDI track: ' + JSON.stringify(snd.soundPickStateForTest().labels));
    pickArp();
    const load = sets.find((s) => s[1] === 'midi_fx1:module');
    assert(load && load[0] === T && load[2] === 'arp', 'wrong load on a MIDI track: ' + JSON.stringify(load));
    assert(dsp['t' + T + '_fxslot'] === '1' && ENG[T + '|midi_fx_host_route'] === '1', 'not switched on: ' + JSON.stringify(order));
});

step('CONTROL: a Schwung track\'s pick writes neither switch — its effect plays its own instrument', () => {
    reset(); enterMenu(0);
    pickArp();
    assert(sets.some((s) => s[1] === 'midi_fx1:module' && s[0] === T), 'rig: nothing loaded on the Schwung track');
    assert(!order.some((o) => /midi_fx_host_route|_fxslot/.test(o)), 'a Schwung track was switched: ' + JSON.stringify(order));
});

step('CONTROL: no MIDI FX row with no instrument, or on a Conductor', () => {
    reset(); enterMenu(3);
    assert(rowAt('midi_fx1') < 0, 'a track with no instrument offers MIDI FX');
    snd.soundExit(); ticks(2);
    GS.trackRoute[T] = 1; GS.trackPadMode[T] = 2;      /* Conductor, Move parked behind it */
    snd.soundEnterMove(T); ticks(4);
    if (snd.soundViewForTest() !== VIEW_BLOCKS) { click(); ticks(3); }
    assert(rowAt('midi_fx1') < 0, 'a Conductor offers MIDI FX');
    GS.trackPadMode[T] = 0;
});

step('⭐ a route change carries the effect: Schwung -> Move switches it on, Move -> Schwung off', () => {
    /* The engine's half is DEFERRED to the next tick here: the route write must
     * stand alone in its callback (test_instr_pick_sets_route). */
    const fxq = () => GS.pendingDefaultSetParams.filter((p) => p.key === 't' + T + '_fxslot').map((p) => p.val);
    reset();
    GS.pendingDefaultSetParams.length = 0;
    ENG[T + '|midi_fx1:module'] = 'arp';
    GS.trackRoute[T] = 0;
    bridge.applyTrackConfig(T, 'route', 1);
    assert(ENG[T + '|midi_fx_host_route'] === '1' && fxq().join() === '1', 'to Move: ' + JSON.stringify([order, fxq()]));
    assert(!('t' + T + '_fxslot' in dsp), 'the engine switch shared the route write\'s callback');
    bridge.applyTrackConfig(T, 'route', 0);
    assert(ENG[T + '|midi_fx_host_route'] === '0' && fxq().join() === '1,0', 'to Schwung: ' + JSON.stringify(fxq()));
    delete ENG[T + '|midi_fx1:module'];
    bridge.applyTrackConfig(T, 'route', 2);
    assert(ENG[T + '|midi_fx_host_route'] === '0' && fxq().join() === '1,0,0', 'with NO effect, a MIDI track was switched on');
    GS.pendingDefaultSetParams.length = 0;
});

os.__setReaddir(null);
process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
