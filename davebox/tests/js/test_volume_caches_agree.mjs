
import './_bulk_get_stub.mjs';   /* the bulk read, derived from this test's single-read stub *//* tests/js/test_volume_caches_agree.mjs — ONE TRACK VOLUME, HOWEVER YOU TURN IT.
 *
 * In sound mode the track's volume is reachable two ways — K1 on the level
 * card and Shift + Volume — and each kept its own copy of the value, seeded
 * once and never told about the other's writes. K1 down to a quiet level, then
 * one Shift+Volume detent, and the level jumped back to where the OTHER copy
 * still was (unity), plus one detent. The level copy also outlived leaving
 * sound mode, so a re-entry showed and wrote stale levels. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) {
    /* ⚠⚠ An ASYNC fn returns a promise this runner never awaits: the body would
     * not run, nothing would throw, and the step would report ok. A test that
     * passes because it did NOTHING is worse than one that fails. Caught
     * 2026-08-24 — an async step "passed" against a mutation it could not have
     * seen. Hoist awaits to module scope; keep step bodies synchronous. */
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function — it would pass ' +
                        'without running. Hoist the awaits to module scope.');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

const ENGINE = { };
let setCalls = [], volBlockCalls = [], saveCalls = 0;
globalThis.shadow_get_param = (slot, key) => (ENGINE[slot + '|' + key] != null ? ENGINE[slot + '|' + key] : '');
globalThis.shadow_set_param = (slot, key, val) => { setCalls.push([slot, key, val]); ENGINE[slot + '|' + key] = String(val); return 1; };
globalThis.host_vol_block = (on) => { volBlockCalls.push(on); };
globalThis.shadow_save_state_now = () => { saveCalls++; return 1; };
let extSends = [];
globalThis.move_midi_external_send = (pkt) => { extSends.push(pkt.slice ? pkt.slice() : pkt); };

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
let modSets = [];
globalThis.host_module_set_param = (k, v) => { modSets.push(k + '=' + v); };
globalThis.host_module_get_param = () => '';
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};
globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
const { faderStep } = await import('../../ui/ui_engine.mjs');
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

const cc    = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const shift = (on) => cc(49, on ? 127 : 0);
const vol   = (d) => cc(79, d > 0 ? d : 128 + d);
const k1    = (d) => cc(71, d > 0 ? d : 128 + d);
const ticks = (n) => { for (let i = 0; i < n; i++) { S.tickCount++; globalThis.tick(); snd.soundTick(); } };

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
S.sessionView = false; S.activeTrack = 2; S.clockFollowTicks = true; S.tickCount = 1000;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => new Array(8).fill(0)));
ENGINE['2|slot:volume'] = '1.000';
const lastVol = () => { const w = setCalls.filter(([sl, k]) => sl === 2 && k === 'slot:volume'); return w.length ? parseFloat(w[w.length - 1][2]) : null; };

snd.soundOpenMenu ? null : null;
snd.soundEnter(2, 2);
ticks(6);

let quiet = null;
step('rig: K1 on the sound screen lowers the track volume', () => {
    if (!snd.soundOpen()) throw new Error('sound mode did not open');
    setCalls = [];
    for (let i = 0; i < 40; i++) { k1(-1); }
    ticks(3);
    quiet = lastVol();
    if (quiet === null || !(quiet < 0.8)) throw new Error('K1 did not lower the volume (last write ' + quiet + ')');
});

step('Shift + Volume continues from where K1 left it', () => {
    setCalls = [];
    shift(true); vol(1); ticks(2); shift(false); ticks(1);
    const v = lastVol();
    if (v === null) throw new Error('Shift+Volume wrote nothing');
    const want = faderStep(quiet, 1, 130), stale = faderStep(1, 1, 130);
    if (Math.abs(v - want) > 5e-3)
        throw new Error('wrote ' + v + ', expected ' + want.toFixed(3) + ' (from the stale copy it would be ' + stale.toFixed(3) + ')');
});

step('K1 continues from where Shift + Volume left it', () => {
    setCalls = [];
    shift(true); for (let i = 0; i < 20; i++) vol(1); ticks(2); shift(false); ticks(1);
    const up = lastVol();
    setCalls = [];
    k1(1); ticks(3);
    const v = lastVol();
    if (v === null) throw new Error('K1 wrote nothing');
    if (!(v > up - 1e-6)) throw new Error('K1 +1 after Shift+Volume went DOWN: ' + up + ' -> ' + v);
});

step('re-entering sound mode reads the level again', () => {
    snd.soundExit(); ticks(2);
    ENGINE['2|slot:volume'] = '0.250';          /* changed while away (automation, the web UI) */
    snd.soundEnter(2, 2); ticks(6);
    setCalls = [];
    k1(1); ticks(3);
    const v = lastVol();
    if (v === null) throw new Error('K1 wrote nothing');
    if (Math.abs(v - 0.25) > 0.1) throw new Error('K1 stepped from a stale level: wrote ' + v + ' with the engine at 0.25');
});

process.exit(failed);
}
main();
