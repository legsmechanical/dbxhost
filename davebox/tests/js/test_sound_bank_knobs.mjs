import './_bulk_get_stub.mjs';
/* tests/js/test_sound_bank_knobs.mjs — THE SOUND + CONFIG BANK'S KNOBS
 * (spec §2, Josh 2026-09-02): on the bank card and on every non-editor sound
 * screen of a track, K1 Volume / K2 Pan / K3 Send A / K4 Send B / K5 Module
 * Level are the track's mixer levels — ordinary automatable parameters that
 * go through the automation owner like an editor knob — and K6-K8 are
 * unassigned. The chain's knob-ASSIGNMENT forwarding that owned these knobs
 * here (test_sound_knob_hud.mjs, retired with this) moves to MACROS.
 *
 * Harness: sound mode driven directly (soundOnCC / soundOnNote / soundTick)
 * against a shadow_get_param stub, as the retired file did. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

let reads = [];
const ASSIGN = {
    'knob_1_target': 'synth', 'knob_1_param': 'cutoff',
    'knob_3_target': 'fx2',   'knob_3_param': 'room_size',
    /* knob 5 is deliberately unassigned: both keys answer empty. */
    'synth:cutoff': '0.4830',
    'fx2:room_size': '0.75',
    /* A loaded synth, so a block can actually be opened and the VIEW_EDIT
     * exclusion tested against the real view rather than a forced one. */
    'synth:module': 'nusaw',
    /* ⭑ The metadata is the point of the movy law, so the fixtures are chosen
     * to break a naive implementation:
     *   cutoff    — declares a COARSE step (0.5 over a 0..1 range = two
     *               positions). Normalising outright is what recovers it.
     *   room_size — a WIDE range (0.5..20) with a fine step. Using the declared
     *               step here is what makes a knob crawl.
     *   voices    — an INT whose 1% of range is 0.07; the declared step must
     *               act as a FLOOR or it would never move.
     *   shape     — an ENUM, exempt from normalisation, fixed detents per step.
     */
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.5 },
        { key: 'voices', name: 'Voices', type: 'int', min: 1, max: 8, step: 1 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
        { key: 'preset', name: 'Preset', type: 'int', min: 0, max: 99, step: 1 },
    ]),
    'fx2:chain_params': JSON.stringify([
        { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 },
    ]),
    'synth:voices': '4',
    'synth:shape': 'Saw',
};

/* Sound mode's view enum (ui_sound.mjs) — not exported, and not worth
 * exporting for a test; pinned here so a renumbering shows up as a failure. */
const VIEW_EDIT = 1, VIEW_KNOB_TARGET = 12, VIEW_KNOB_PARAM = 13;
globalThis.shadow_get_param = (slot, key) => { reads.push(key); return ASSIGN[key] || ''; };
/* Writes are the observable now that the value is owned in JS and written
 * absolutely. The stub also RECORDS the write back into ASSIGN, so a re-seed
 * reads what was actually set — a stub that always answers the original value
 * would make every re-touch look like a revert. */
let writes = [];
globalThis.shadow_set_param = (slot, key, val) => {
    writes.push({ key, val }); ASSIGN[key] = String(val); return 1;
};
let dspMidi = [];
globalThis.shadow_send_midi_to_dsp = (slot, msg) => { dspMidi.push(msg.slice()); };

/* Drawing surface. mvPrint/hdrPrint emit set_pixel per glyph pixel — the host
 * `print` stub never sees them (the mixer work paid for that lesson three
 * times), so text is measured as pixel bands, never as captured strings. */
let fills = [], px = [], seq = 0;
globalThis.fill_rect = (x, y, w, h, v) => { fills.push({ x, y, w, h, v, seq: seq++ }); };
globalThis.draw_rect = () => {};
/* ⚠ The REAL semantics, not a no-op: `stipple_rect` REMOVES half the ink of
 * whatever is already drawn, so a rig that counts pixels must see that happen
 * or its thresholds mean something different here than on the device. */
globalThis.stipple_rect = (x, y, w, h, value, phase) => {
    for (let yi = y; yi < y + h; yi++)
        for (let xi = (((x + yi) & 1) === ((phase || 0) & 1)) ? x : x + 1; xi < x + w; xi += 2)
            globalThis.set_pixel(xi, yi, value);
};
globalThis.set_pixel = (x, y) => { px.push({ x, y, seq: seq++ }); };
globalThis.clear_screen = () => { fills = []; px = []; seq = 0; };
globalThis.print = () => {};
globalThis.pixel_print = () => {};
globalThis.flush_display = () => {};
globalThis.text_width = (t) => String(t).length * 6;

for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);

async function main() {
/* ⚠ davebox's module editor is the HOST'S OWN binding (ui/vendor/), so sound
 * mode's exit path now reaches host bindings this rig never needed —
 * shadow_restore_knob_leds among them, on the LED teardown. Declared here
 * rather than injected into every bundle: tests/js/build.mjs refuses blanket
 * stubbing on purpose, because a missing binding throws inside tick() and the
 * rig would then pass against a tick that stopped on line one. */
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();

const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');

/* hudCard's own frame: the one fill of the full card width at its top-left.
 * Nothing else on these screens has that signature. */
const CARD_X = 6, CARD_Y = 11, CARD_W = 116, CARD_H = 42;
const cardFill = () => fills.find((f) =>
    f.x === CARD_X && f.y === CARD_Y && f.w === CARD_W && f.h === CARD_H);
const cardDrawn = () => !!cardFill();
/* ⚠⚠ Count only pixels laid down AFTER the card's own blanking fill. The card
 * opens by filling its rectangle with 0, which on the device ERASES the list
 * underneath — but the stub keeps every set_pixel ever made, so an unfiltered
 * band counts the block picker's rows showing through and reports a body line
 * the card never printed. (It did: "UNASSIGNED" measured as two lines.) The
 * sequence number is what makes the observable match the mechanism. */
const after = (lo, hi, minX) => {
    const c = cardFill();
    if (!c) return 0;
    return px.filter((p) => p.seq > c.seq && p.y >= lo && p.y <= hi &&
                            (minX == null || p.x >= minX)).length;
};
/* Body lines (line 0 at y=22, line 1 at y=33 — see drawKnobAsnHud). */
const line0 = () => after(22, 31);
const line1 = () => after(33, 42);
/* The value rides the card HEADER, right-aligned, in the 6-row header font. */
const headerRight = () => after(13, 18, 70);

const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const touch = (k, on) => snd.soundOnNote(on ? 0x90 : 0x80, k, on ? 127 : 0);
const turn  = (k, dir) => cc(71 + k, dir > 0 ? 1 : 127);
/* ⚠ ONE event carrying n detents — the shadow framework batches, and dropping
 * that magnitude is exactly the resolution bug this law replaced. */
const turnBy = (k, n) => cc(71 + k, n > 0 ? n : 128 + n);
const wrote = (key) => writes.filter((w) => w.key === key);
const lastWrite = (key) => { const w = wrote(key); return w.length ? w[w.length - 1].val : null; };
const shift = (on) => cc(49, on ? 127 : 0);
const draw  = () => { globalThis.clear_screen(); snd.soundRender(); };
/* Ticks are where every engine read happens — nothing about this feature is
 * observable without running them. */
const ticks = (n) => { for (let i = 0; i < n; i++) { snd.soundTick(); bridge.tickPrefetch(); auto.automationTick(); } };

function enterTrack(t) {
    GS.sessionView = false;
    for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;   /* all Schwung */
    GS.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(3);                                           /* land the entry action */
    /* ⚠ Sound mode ENTERS ON THE BANK'S PROMPT now, not the menu (Josh,
     * 2026-08-28: the bank is a door — "click to enter"). Every step below acts
     * on the MENU, so the setup opens it.
     * ⚠ AFTER the ticks, not before: the entry action is still in flight during
     * them and lands on the prompt, so opening the menu first is undone by the
     * very next tick. */
    snd.soundShowMenu();
}


const modSets = [];
function dec(blob) { const out = []; if (!blob) return out; let nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1; for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; } return out; }
globalThis.host_module_set_params = (blob) => { const it = dec(blob); for (let i = 0; i + 1 < it.length; i += 2) modSets.push(it[i] + '=' + it[i + 1]); return true; };
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_autosave_hold = () => {};
const leds = [];
globalThis.move_midi_internal_send = (m) => { leds.push(Array.from(m)); return true; };
globalThis.set_led = (cc, v) => { leds.push([0xB0, cc, v]); };
globalThis.shadow_save_state_now = () => 1;
const bridge = await import('../../ui/ui_dsp_bridge.mjs');
const { SLOT_LEVEL_MAX } = await import('../../ui/ui_engine.mjs');
const auto = await import('../../ui/ui_automation.mjs');
const STEP_VOL = SLOT_LEVEL_MAX / 200, STEP_PAN = 1 / 200, STEP_SEND = 1 / 100;

step('setup: sound mode on a Schwung track, at its menu (a non-EDIT screen); the levels seed ONCE', () => {
    reads = []; writes = [];
    enterTrack(2);
    ticks(2);
    assert(snd.soundPickStateForTest().view !== VIEW_EDIT, 'not in the editor');
    const ml = reads.filter(k => k === 'slot:synth_volume').length;
    assert(ml === 1, 'the seed read Module Level exactly once, got ' + ml);
    ticks(5);
    assert(reads.filter(k => k === 'slot:synth_volume').length === 1, 'and never again on later ticks');
});
step('⚠ K1 Volume: n detents = n steps of SLOT_LEVEL_MAX/200, written ONCE per tick, absolutely', () => {
    writes = [];
    turnBy(0, 10); ticks(1);
    const w = wrote('slot:volume');
    assert(w.length === 1, 'one coalesced write, got ' + w.length);
    assert(w[0].val === (1 + 10 * STEP_VOL).toFixed(3), 'value 1 + 10 steps, got ' + w[0].val);
    turnBy(0, -10); ticks(1);
    assert(lastWrite('slot:volume') === '1.000', 'back to 1.000');
});
step('K2 Pan (1/200 per detent), K3/K4 sends (1/100), K5 Module Level: each to its own slot: key', () => {
    writes = [];
    turnBy(1, -20); turnBy(2, 50); turnBy(3, 25); turnBy(4, 10); ticks(1);
    assert(lastWrite('slot:pan') === (0.5 - 20 * STEP_PAN).toFixed(3), 'pan, got ' + lastWrite('slot:pan'));
    assert(lastWrite('slot:send_a') === (50 * STEP_SEND).toFixed(3), 'send a, got ' + lastWrite('slot:send_a'));
    assert(lastWrite('slot:send_b') === (25 * STEP_SEND).toFixed(3), 'send b, got ' + lastWrite('slot:send_b'));
    assert(lastWrite('slot:synth_volume') === (1 + 10 * STEP_VOL).toFixed(3), 'module level, got ' + lastWrite('slot:synth_volume'));
});
step('⚠ K6-K8 are unassigned: swallowed, nothing written, nothing forwarded to a knob assignment', () => {
    writes = []; dspMidi = [];
    turnBy(5, 10); turnBy(6, 10); turnBy(7, 10); ticks(2);
    assert(writes.length === 0, 'no writes, got ' + JSON.stringify(writes));
    assert(dspMidi.length === 0, 'no forwarded MIDI');
});
step('⚠ the knob-assignment forwarding is RETIRED here: K1 never writes synth:cutoff, and touch raises no HUD card', () => {
    writes = [];
    touch(0, true); ticks(2); turnBy(0, 4); ticks(1); touch(0, false); ticks(1);
    assert(!wrote('synth:cutoff').length, 'no synth:cutoff write');
    assert(!snd.soundKnobHudForTest().shown, 'no HUD card');
});
step('⚠ a level turn goes through the AUTOMATION OWNER: with a step held it is a p-lock on <slot>:slot:volume', () => {
    modSets.length = 0;
    auto.automationNoteWrite();
    GS.heldStep = 3; GS.heldStepBtn = 3; GS.heldStepNotes = [60]; GS.playing = false;
    GS.clipTPS[2][GS.trackActiveClip[2]] = 24;
    turnBy(0, 2); ticks(2);
    const lock = modSets.find(x => x.startsWith('t2_pa_set2=') && x.includes(':slot:volume'));
    assert(lock, 'a lock on slot:volume was written, got ' + JSON.stringify(modSets.slice(0, 6)));
    GS.heldStep = -1; GS.heldStepBtn = -1; GS.heldStepNotes = [];
    ticks(3);
});
step('Mute+touch on a level knob marks the Mute a MODIFIER (the release must not mute the track)', () => {
    GS.muteUsedAsModifier = false;
    cc(88, 127); touch(0, true); ticks(1); touch(0, false); cc(88, 0); ticks(1);
    assert(GS.muteUsedAsModifier === true, 'muteUsedAsModifier set');
});
step('holding Mute paints the eight knob rings (five levels, three unlit) — the paint fires here, not only in the editor', () => {
    leds.length = 0;
    cc(88, 127); ticks(1);
    /* setButtonLED sends a 4-byte USB-MIDI packet: [cable/CIN, 0xB0, cc, colour]. */
    const knobLeds = leds.filter(m => (m.length === 4 ? m[2] : m[1]) >= 71 && (m.length === 4 ? m[2] : m[1]) <= 78);
    assert(knobLeds.length >= 8, 'painted the rings, got ' + knobLeds.length);
    cc(88, 0); ticks(1);
});
step('the bank card renders the level page (cells + footer), not the old gateway text', () => {
    snd.soundExit(); GS.activeTrack = 2; snd.soundEnter(2, 2); ticks(3);   /* the entry lands on the CARD */
    assert(snd.soundPickStateForTest().view === 18, 'on the prompt card, view ' + snd.soundPickStateForTest().view);
    GS.bankCardLatched = true;                  /* the bank-display law: the card shows while the bank view is open */
    draw();
    assert(px.length > 200, 'the card drew a page, ' + px.length + ' px');
    assert(fills.some(f => f.y >= 56), 'and a footer row');
});

if (failed) { console.log('FAIL: sound bank knobs'); process.exit(1); }
console.log('PASS: the SOUND + CONFIG bank\'s knobs are the levels, through the automation owner');
}
main().catch(e => { console.error(e); process.exit(1); });
