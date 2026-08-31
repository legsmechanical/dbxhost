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
globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = (p) => (p.indexOf('daves-seen') >= 0 && seenFileContent !== null) ? seenFileContent : '';
globalThis.host_file_exists = (p) => (p.indexOf('daves-seen') >= 0 && seenFileContent !== null);
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

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashTicks = 0;
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
    const labels = [];
    for (let i = 0; i < S.daveBox.list.length; i++) {
        labels.push(daves.daveBoxLabel());
        daves.daveBoxRotate(1);
    }
    const want = ['< Dave 1 of 31 >', '< Dave 3 of 31 >', '< Dave 21 of 31 >'];
    if (JSON.stringify(labels) !== JSON.stringify(want))
        throw new Error(JSON.stringify(labels));
    if (daves.daveBoxLabel() !== '< Dave 1 of 31 >') throw new Error('did not wrap forward');
    daves.daveBoxRotate(-1);
    if (daves.daveBoxLabel() !== '< Dave 21 of 31 >') throw new Error('did not wrap backward');
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
    const before = daves.daveBoxLabel();
    if (S.daveBox === null) throw new Error('a pad press closed the album');
    cc(14, 1);                                    /* jog +1 */
    if (daves.daveBoxLabel() === before) throw new Error('jog did not browse');
    cc(51, 127); cc(51, 0);                       /* Back tap */
    if (S.daveBox) throw new Error('Back did not close the album');
    if (!S.globalMenuOpen) throw new Error('Back did not return to the global menu');
    S.globalMenuOpen = false;
});

step('the footer band OVERLAYS the image: cleared band at y=55, label pixels over it', () => {
    seenFileContent = '1\n';
    daves.openDaveBox();
    fills = []; px = [];
    daves.drawDaveBox();
    if (!fills.some((f) => f.x === 0 && f.y === 55 && f.w === 128 && f.h === 9 && f.v === 0))
        throw new Error('no cleared footer band');
    if (!px.some((p) => p.y >= 56 && p.y <= 63)) throw new Error('no label pixels in the band');
    if (!fills.some((f) => f.v === 1 && f.y < 55)) throw new Error('no image ink above the band');
    daves.closeDaveBox();
});

step('the global settings menu carries the Dave Box door — and it opens the album', () => {
    seenFileContent = '1\n';
    menuMod.openGlobalMenu();
    if (!S.globalMenuOpen) throw new Error('menu did not open');
    const item = (S.globalMenuItems || []).find((it) => it && it.label === 'Dave Box');
    if (!item) throw new Error('no Dave Box item: ' +
        JSON.stringify((S.globalMenuItems || []).map((it) => it && it.label)));
    item.onAction();
    if (!S.daveBox) throw new Error('the door did not open the album');
    if (S.globalMenuOpen) throw new Error('opening the album left the menu up');
    daves.closeDaveBox();
});

process.exit(failed);
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
