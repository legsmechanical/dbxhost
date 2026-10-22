import { openTrackConfigViaMap } from './_map_config.mjs';
/* tests/js/test_chain_ui_screen.mjs — a module's own CHAIN SCREEN (ui_chain.js)
 * opens where stock opens it, and behaves as it does on stock.
 *
 * A SA user: 9W9's pads don't select drums. That lives in 9W9's ui_chain.js,
 * which stock runs for a module publishing no ui_hierarchy and dAVEBOx never
 * ran. Josh: "i just want to make sure what happens on schwung also happens on
 * davebox in terms of module editing and behavior". So the fixture is no
 * particular module: a component with an empty hierarchy and a ui_chain.js
 * that takes the pad block, follows a pad->page table, hands pads back with
 * move_midi_inject_to_move, writes a param from a knob, and climbs its own
 * Back once.
 *
 * The REAL gesture: TRACK CONFIG via the map -> FX 1 -> click.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }

/* ---- the module on disk ------------------------------------------------- */
const DIR = '/data/UserData/schwung/modules/audio_fx/chainy';
const MODJSON = { id: 'chainy', name: 'Chainy', abbrev: 'CHNY', version: '1.0.0',
                  capabilities: { chainable: true, component_type: 'audio_fx' } };
const CHAIN_JS = `(function () {
  var level = 'MAIN';
  var MAP = { 68: 'BD', 69: 'SD' };
  function init() {
    globalThis.__chain.push(['init', shadow_get_ui_slot(), host_module_get_param('vol')]);
    if (globalThis.__initWrite) host_module_set_param('vol', globalThis.__initWrite);
    host_pad_block(1);
  }
  function tick() {
    if (globalThis.__throwTick) throw new Error('boom');
    globalThis.__ticks = (globalThis.__ticks | 0) + 1;
    clear_screen();
    print(2, 2, 'CHAINY ' + level, 1);
  }
  function onMidiMessageInternal(d) {
    globalThis.__chain.push(['midi', d[0], d[1], d[2]]);
    var s = d[0] & 0xF0;
    if ((s === 0x90 || s === 0x80) && d[1] >= 68 && d[1] <= 99) {
      if (s === 0x90 && d[2] > 0 && MAP[d[1]]) level = MAP[d[1]];
      if (d[1] !== 87) move_midi_inject_to_move([s >> 4, d[0], d[1], d[2]]);
      return;
    }
    if (s === 0xB0 && d[1] === 71) host_module_set_param('vol', String(d[2]));
    if (s === 0xB0 && d[1] === 72) host_module_set_param('secret', String(d[2]));
    if (s === 0xB0 && d[1] === 73) {
      shadow_set_param(shadow_get_ui_slot(), 'fx1:vol', String(d[2]));
      shadow_set_param(3, 'fx1:vol', '77');
    }
  }
  function handleBack() { globalThis.__chain.push(['back']); return globalThis.__backStays-- > 0; }
  globalThis.chain_ui = { init: init, tick: tick, onMidiMessageInternal: onMidiMessageInternal, handleBack: handleBack };
})();`;
const disk = {};
disk[DIR + '/module.json'] = JSON.stringify(MODJSON);
disk[DIR + '/ui_chain.js'] = CHAIN_JS;
globalThis.__chain = []; globalThis.__backStays = 0; globalThis.__throwTick = false;

/* ---- host surface --------------------------------------------------------- */
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (disk[String(p)] !== undefined ? disk[String(p)] : null);
globalThis.host_file_exists = (p) => disk[String(p)] !== undefined;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
const played = [];                              /* everything a pad press sends */
const ORIG_HMSP = (k, v) => { played.push(['hmsp', String(k), String(v)]); };
const ORIG_HMGP = () => '';
globalThis.host_module_set_param = ORIG_HMSP;
globalThis.host_module_get_param = ORIG_HMGP;
/* The bulk write dAVEBOx's queue drains through (automation's keys ride it). */
function decBulk(blob) { const out = []; if (!blob) return out; const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = decBulk(blob); for (let i = 0; i + 1 < it.length; i += 2) played.push(['hmsp', it[i], it[i + 1]]); return true; };
globalThis.shadow_send_midi_to_dsp = (a) => { played.push(['dsp', Array.from(a || []).join(',')]); };
globalThis.move_midi_internal_send = (a) => { played.push(['int', Array.from(a || []).join(',')]); };
const ORIG_INJECT = (a) => { played.push(['move', Array.from(a || []).join(',')]); };
globalThis.move_midi_inject_to_move = ORIG_INJECT;
globalThis.shadow_save_state_now = () => true;
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
const loads = [];
globalThis.shadow_load_ui_module = (p) => {
    loads.push(String(p));
    const src = disk[String(p)];
    if (src === undefined) return false;
    (new Function('"use strict";\n' + src))();
    return true;
};

const engine = {};
let hierarchy = '';                             /* '' = published none, as 9W9 does */
const keyReads = [];                            /* reads of the module's own param keys */
globalThis.shadow_get_param = (slot, k) => {
    if (typeof slot !== 'number' || slot < 0 || slot > 3) return null;
    if (/^fx1:(vol|secret)$/.test(String(k))) keyReads.push(String(k));
    if (k === 'fx1:module') return 'chainy';
    if (k === 'fx1:ui_hierarchy') return hierarchy;
    if (k === 'fx1:chain_params') return JSON.stringify([{ key: 'vol', name: 'Vol', type: 'int', min: 0, max: 127 }]);
    const v = engine[slot + ':' + k];
    return v === undefined ? '' : v;
};
const slotWrites = [];
const ORIG_SSP = (slot, k, v) => { slotWrites.push([slot, k, String(v)]); engine[slot + ':' + k] = String(v); return 1; };
globalThis.shadow_set_param = ORIG_SSP;

const texts = [];
globalThis.clear_screen = () => { texts.length = 0; };
globalThis.print = (x, y, str) => { texts.push(String(str)); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
for (const fn of ['fill_rect', 'draw_rect', 'stipple_rect', 'set_pixel', 'draw_line', 'flush_display', 'set_led',
                  'host_open_service', 'host_close_service', 'host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set', 'host_ext_midi_remap_enable'])
    globalThis[fn] = () => {};
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.host_seed_module_defaults = () => [0, 0];
globalThis.shadow_get_shift_held = () => 0;

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const tickmod = await import('../../ui/ui_tick.mjs');
const render = await import('../../ui/ui_render.mjs');
const chainHost = await import('../../ui/ui_chain_host.mjs');
/* Every draw is a fresh frame unless a step says otherwise: the screen's frame
 * limit reads this clock (pinned on its own below). */
let fakeMs = 0;
const advancing = () => (fakeMs += 1000);
chainHost.chainUiClockForTest(advancing);

function ticks(n) { for (let i = 0; i < n; i++) { S.tickCount++; S.clockMs += 11; tickmod._tickImpl(); } }
const midi = (a, b, c) => globalThis.onMidiMessageInternal(new Uint8Array([a, b, c]));
const cc = (d1, d2) => midi(0xB0, d1, d2);
function screen() { render.drawUI(); return texts.join('|'); }
const onChain = () => snd.soundChainStateForTest().view && snd.soundChainStateForTest().active;

function openFx1() {
    openTrackConfigViaMap(); ticks(6);
    for (let g = 0; ; g++) {
        const st = snd.soundPickStateForTest();
        if (st.comps[st.row] === 'fx1') break;
        if (g > 30) throw new Error('rig: never reached FX 1 — ' + JSON.stringify(st.labels));
        cc(14, 1); ticks(1);
    }
    cc(3, 127); cc(3, 0); ticks(6);
}
function leaveSound() {
    for (let i = 0; i < 8 && snd.soundOpen(); i++) { cc(51, 127); cc(51, 0); ticks(2); }
    ticks(2);
}
/* What the press PLAYED: the live notes dAVEBOx sends its DSP (LED traffic is
 * not playing). */
function press(note) {
    played.length = 0; midi(0x90, note, 100); midi(0x80, note, 0); ticks(2);
    return played.filter(p => p[0] === 'hmsp' && /_live_notes$/.test(p[1])).map(p => p[1] + '=' + p[2]);
}

step('setup: track 2 a Schwung track with Chainy (no hierarchy, ships ui_chain.js) on FX 1', () => {
    globalThis.init();
    S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
    for (let t = 0; t < 8; t++) S.trackChannel[t] = t + 1;
    S.activeTrack = 1; S.trackRoute[1] = 0;
    ticks(8);
});

let plain69;
step('control first: with no module screen up, what a pad press plays', () => {
    plain69 = press(69);
    if (!plain69.length) throw new Error('rig: a pad press played nothing at all');
});

step('⭐ TRACK CONFIG -> FX 1 -> click opens the MODULE\'s own screen, on the track\'s slot, with its param shim live', () => {
    globalThis.__chain.length = 0;
    engine['1:fx1:vol'] = '42';
    openFx1();
    if (!onChain()) throw new Error('not on the chain screen: ' + JSON.stringify(snd.soundChainStateForTest()));
    if (!loads.some(p => p === DIR + '/ui_chain.js')) throw new Error('ui_chain.js was never loaded: ' + JSON.stringify(loads));
    const i = globalThis.__chain.find(e => e[0] === 'init');
    if (!i) throw new Error('init never ran');
    if (i[1] !== S.activeTrack) throw new Error('shadow_get_ui_slot read ' + i[1] + ', not the track slot ' + S.activeTrack);
    if (i[2] !== '42') throw new Error('host_module_get_param("vol") read ' + JSON.stringify(i[2]) + ' — not routed to fx1:vol');
    const s = screen();
    if (s.indexOf('CHAINY MAIN') < 0) throw new Error('the module did not draw the screen: ' + s);
});

step('⭐ the shims never outlive a hosted call: dAVEBOx\'s own host_module_* and inject are its own between calls', () => {
    if (globalThis.host_module_set_param !== ORIG_HMSP) throw new Error('host_module_set_param left shimmed');
    if (globalThis.host_module_get_param !== ORIG_HMGP) throw new Error('host_module_get_param left shimmed');
    if (globalThis.move_midi_inject_to_move !== ORIG_INJECT) throw new Error('move_midi_inject_to_move left shimmed');
    if (typeof globalThis.host_pad_block !== 'undefined' || typeof globalThis.shadow_get_ui_slot !== 'undefined')
        throw new Error('a scoped binding was left on globalThis');
    if (globalThis.chain_ui !== undefined) throw new Error('chain_ui left on globalThis');
});

step('⭐⭐ a pad goes to the MODULE first (it holds the pad block): the page follows, and the pad it hands back plays exactly as an unintercepted press', () => {
    globalThis.__chain.length = 0;
    slotWrites.length = 0;
    const got = press(69);
    /* ⚠ The replay runs dAVEBOx's own pad path, which writes dAVEBOx's DSP
     * through host_module_set_param. Inside the module's call that name is the
     * module's shim — a replay there would land dAVEBOx's keys on the module. */
    const leaked = slotWrites.filter(([, k]) => /^fx1:t\d/.test(k));
    if (leaked.length) throw new Error('dAVEBOx writes landed on the module: ' + JSON.stringify(leaked));
    if (!globalThis.__chain.some(e => e[0] === 'midi' && e[1] === 0x90 && e[2] === 69)) throw new Error('the module never saw the pad: ' + JSON.stringify(globalThis.__chain));
    if (screen().indexOf('CHAINY SD') < 0) throw new Error('the page did not follow the pad: ' + texts.join('|'));
    if (JSON.stringify(got) !== JSON.stringify(plain69))
        throw new Error('the handed-back pad played differently from a plain press:\n  module ' + JSON.stringify(got) + '\n  plain  ' + JSON.stringify(plain69));
});

step('⭐ the module\'s tick runs at most once per CHAIN_TICK_MS, and a skipped frame leaves the last one up (a slow script tick must not hold up the pads)', () => {
    const T = fakeMs + 100000;
    let now = T;
    chainHost.chainUiClockForTest(() => now);
    try {
        const t0 = globalThis.__ticks | 0;
        screen(); screen(); screen();
        if ((globalThis.__ticks | 0) - t0 !== 1) throw new Error('three draws in one instant ran the module tick ' + ((globalThis.__ticks | 0) - t0) + ' times, not once');
        now = T + chainHost.CHAIN_TICK_MS - 1;
        const s = screen();
        if ((globalThis.__ticks | 0) - t0 !== 1) throw new Error('ticked again before CHAIN_TICK_MS had passed');
        if (s.indexOf('CHAINY') < 0) throw new Error('a skipped frame lost the screen: ' + s);
        now = T + chainHost.CHAIN_TICK_MS;
        screen();
        if ((globalThis.__ticks | 0) - t0 !== 2) throw new Error('did not tick once CHAIN_TICK_MS had passed');
    } finally { fakeMs = now; chainHost.chainUiClockForTest(advancing); }
});

step('a pad the module keeps (does not hand back) plays nothing', () => {
    const got = press(87);
    if (got.length) throw new Error('a swallowed pad played: ' + JSON.stringify(got));
});

step('a knob turn reaches the module, and its write lands on THIS slot\'s component', () => {
    slotWrites.length = 0;
    cc(71, 5); ticks(1);
    if (!slotWrites.some(([s, k, v]) => s === S.activeTrack && k === 'fx1:vol' && v === '5'))
        throw new Error('writes: ' + JSON.stringify(slotWrites));
});

/* A knob on the module's own screen is an EDIT, as in dAVEBOx's editor: with a
 * step held, the module's write becomes a lock (the same tN_pa_hold_write an
 * editor knob sends, test_sound_bank_knobs). */
function holdStep(on) {
    if (on) { S.heldStep = 3; S.heldStepBtn = 3; S.heldStepNotes = [60]; S.playing = false; }
    else { S.heldStep = -1; S.heldStepBtn = -1; S.heldStepNotes = []; }
}
const lockWrites = () => played.filter(p => p[0] === 'hmsp' && /_pa_hold_write$/.test(p[1])).map(p => p[2]);

step('⭐⭐ a step held + a knob on the module\'s screen = a LOCK on <slot>:fx1:vol, sent to dAVEBOx (never to the module)', () => {
    holdStep(true); played.length = 0; slotWrites.length = 0;
    cc(71, 9); ticks(2);
    holdStep(false); ticks(2);
    if (!slotWrites.some(([s, k, v]) => s === S.activeTrack && k === 'fx1:vol' && v === '9'))
        throw new Error('the module\'s write did not land: ' + JSON.stringify(slotWrites));
    const locks = lockWrites();
    if (!locks.some(v => v.includes(' ' + S.activeTrack + ':fx1:vol ')))
        throw new Error('no lock for ' + S.activeTrack + ':fx1:vol — dAVEBOx got ' + JSON.stringify(played.filter(p => /_pa_/.test(p[1]))));
    const leaked = slotWrites.filter(([, k]) => /^fx1:t\d/.test(k));
    if (leaked.length) throw new Error('automation writes landed on the module: ' + JSON.stringify(leaked));
});

step('a module\'s PRIVATE key (not in chain_params) is written but never becomes automation', () => {
    holdStep(true); played.length = 0; slotWrites.length = 0;
    cc(72, 4); ticks(2);
    holdStep(false); ticks(2);
    if (!slotWrites.some(([s, k]) => s === S.activeTrack && k === 'fx1:secret')) throw new Error('private write did not land: ' + JSON.stringify(slotWrites));
    if (lockWrites().some(v => v.includes('secret'))) throw new Error('a private key became a lock: ' + JSON.stringify(lockWrites()));
});

step('⭐ a write straight through shadow_set_param(this slot, "fx1:…") is an edit too (9W9\'s route); another slot passes through untouched', () => {
    const sspBefore = globalThis.shadow_set_param;   /* dAVEBOx wraps the binding at init */
    holdStep(true); played.length = 0; slotWrites.length = 0;
    cc(73, 11); ticks(2);
    holdStep(false); ticks(2);
    if (!slotWrites.some(([s, k, v]) => s === S.activeTrack && k === 'fx1:vol' && v === '11')) throw new Error('own-slot write missing: ' + JSON.stringify(slotWrites));
    if (!slotWrites.some(([s, k, v]) => s === 3 && k === 'fx1:vol' && v === '77')) throw new Error('other-slot write did not pass through: ' + JSON.stringify(slotWrites));
    const locks = lockWrites();
    if (!locks.some(v => v.includes(' ' + S.activeTrack + ':fx1:vol '))) throw new Error('no lock from the shadow_set_param route: ' + JSON.stringify(locks));
    if (locks.some(v => v.includes(' 3:fx1:vol '))) throw new Error('another slot\'s write became this track\'s automation: ' + JSON.stringify(locks));
    if (globalThis.shadow_set_param !== sspBefore) throw new Error('shadow_set_param left shimmed');
});

step('⭐ a write reads the old value only when automation will use it (a blocking round trip each)', () => {
    holdStep(false); S.playing = false; ticks(40);
    keyReads.length = 0; slotWrites.length = 0;
    cc(71, 20); cc(71, 21); ticks(1);
    if (!slotWrites.some(([, k, v]) => k === 'fx1:vol' && v === '21')) throw new Error('rig: the writes did not land: ' + JSON.stringify(slotWrites));
    if (keyReads.length) throw new Error('stopped, no step held: read ' + JSON.stringify(keyReads));
    holdStep(true); keyReads.length = 0;
    cc(72, 3); ticks(1);
    if (keyReads.length) throw new Error('a PRIVATE key read its old value: ' + JSON.stringify(keyReads));
    cc(71, 30); cc(71, 31); cc(71, 32); ticks(1);
    if (keyReads.length !== 1) throw new Error('a held-step gesture of three writes read ' + keyReads.length + ' times, not once (its first): ' + JSON.stringify(keyReads));
    holdStep(false); ticks(40);
});

step('⭐ Back: the module climbs first (handleBack true = stay), then Back leaves to TRACK CONFIG', () => {
    globalThis.__backStays = 1; globalThis.__chain.length = 0;
    cc(51, 127); cc(51, 0); ticks(2);
    if (!onChain()) throw new Error('left although handleBack said it climbed');
    cc(51, 127); cc(51, 0); ticks(2);
    if (onChain()) throw new Error('Back at the top did not leave');
    if (globalThis.__chain.filter(e => e[0] === 'back').length !== 2) throw new Error('handleBack calls: ' + JSON.stringify(globalThis.__chain));
    if (!snd.soundOpen()) throw new Error('Back left sound mode entirely');
    globalThis.__chain.length = 0;
    const after = press(69);
    if (globalThis.__chain.some(e => e[0] === 'midi')) throw new Error('the module still sees pads after leaving');
    if (JSON.stringify(after) !== JSON.stringify(plain69)) throw new Error('pads play differently after leaving: ' + JSON.stringify(after));
});

step('a write the module makes while it OPENS (load, init) is the module setting itself up, never a lock or take', () => {
    leaveSound();
    globalThis.__initWrite = '64';
    try {
        /* openFx1's way there, with the step held only for the click that opens
         * the screen (a held step changes what the menu's own keys do). */
        openTrackConfigViaMap(); ticks(6);
        for (let g = 0; ; g++) {
            const st = snd.soundPickStateForTest();
            if (st.comps[st.row] === 'fx1') break;
            if (g > 30) throw new Error('rig: never reached FX 1');
            cc(14, 1); ticks(1);
        }
        holdStep(true); played.length = 0; slotWrites.length = 0;
        cc(3, 127); cc(3, 0); ticks(6);
        if (!onChain()) throw new Error('rig: did not reopen');
        ticks(2);
        if (!slotWrites.some(([s, k, v]) => s === S.activeTrack && k === 'fx1:vol' && v === '64'))
            throw new Error('rig: the init write did not land: ' + JSON.stringify(slotWrites));
        if (lockWrites().some(v => v.includes('fx1:vol'))) throw new Error('an init write became a lock: ' + JSON.stringify(lockWrites()));
    } finally { globalThis.__initWrite = ''; holdStep(false); ticks(2); }
});

step('the frame limit: a clock that steps BACK ticks at once instead of freezing the screen', () => {
    const T = fakeMs + 100000;
    let now = T;
    chainHost.chainUiClockForTest(() => now);
    try {
        screen();
        const t0 = globalThis.__ticks | 0;
        now = T - 60000;
        screen();
        if ((globalThis.__ticks | 0) - t0 !== 1) throw new Error('the clock stepped back and the module stopped ticking');
    } finally { fakeMs = T + 100000; chainHost.chainUiClockForTest(advancing); }
});

step('a throwing tick: the screen says which hook died, Back still leaves, dAVEBOx keeps ticking', () => {
    leaveSound();
    openFx1();
    if (!onChain()) throw new Error('rig: did not reopen');
    globalThis.__throwTick = true;
    const s = screen();
    if (s.indexOf('tick error') < 0) throw new Error('no error on screen: ' + s);
    ticks(5);
    if (screen().indexOf('tick error') < 0) throw new Error('the error did not stay on screen');
    const p = press(69);
    if (!p.length) throw new Error('a dead module still swallowed the pads');
    cc(51, 127); cc(51, 0); ticks(2);
    if (onChain()) throw new Error('Back did not leave a dead screen');
    globalThis.__throwTick = false;
});

step('⭐ CONTROL: the same module PUBLISHING a hierarchy gets the grid, and its ui_chain.js is never loaded (stock\'s precedence)', () => {
    leaveSound();
    hierarchy = JSON.stringify({ levels: { root: { name: 'Chainy', knobs: ['vol'], params: ['vol'] } } });
    loads.length = 0;
    openFx1();
    if (onChain()) throw new Error('opened the chain screen although a hierarchy was published');
    if (loads.some(p => p.endsWith('/ui_chain.js'))) throw new Error('ui_chain.js was loaded: ' + JSON.stringify(loads));
    hierarchy = '';
});

if (failed) { console.log('FAIL: test_chain_ui_screen'); process.exit(1); }
console.log('PASS: test_chain_ui_screen');
}
main().catch(e => { console.error(e); process.exit(1); });
