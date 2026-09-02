import './_bulk_get_stub.mjs';
/* tests/js/test_macros_bank.mjs — THE MACROS BANK (spec §2, Josh 2026-09-02):
 * eight assignable parameters from anywhere on the track's sound, each an
 * ordinary automatable parameter — a macro IS its target. Sound mode's second
 * bank identity: it follows SOUND + CONFIG on the walk, records itself, and
 * the walk between the two is a screen switch inside one open mode.
 *
 * Also carries THE KNOB TRAVEL LAW pins (range sets the step, int floor, enum
 * 4 detents per step, reversal resets, a sweep costs zero reads) that
 * test_sound_knob_hud.mjs held on the old list-screen knobs until the levels
 * took those knobs (2026-09-02) — the plan owed them on this surface.
 *
 * Harness: sound mode driven directly (soundOnCC / soundOnNote / soundTick)
 * against a shadow_get_param stub, as test_sound_bank_knobs.mjs does. */

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
const { BANKS, BANK_SOUND, BANK_STEP, BANK_MACROS, isSoundBank, PAD_MODE_DRUM, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const { bankCycleForMode } = await import('../../ui/ui_pure.mjs');
const { readFileSync } = await import('node:fs');
const VIEW_MACROS = 19, VIEW_KNOBS = 11, VIEW_PROMPT = 18;
const M = () => snd.soundMacrosForTest();
const jog = (dir) => snd.soundOnCC(14, dir > 0 ? 1 : 127, (v) => (v < 64 ? v : v - 128));
/* Jog click is CC 3; Back is CC 51 (press + release = tap). */
const click = () => { cc(3, 127); cc(3, 0); };
const back = () => { cc(51, 127); cc(51, 0); };
let sidecars = [];
globalThis.host_write_file = (p, body) => { sidecars.push({ p, body }); return true; };
GS.pendingDspSync = 0; GS.pendingSetLoad = false; GS.currentSetUuid = 'test-uuid';
const lastMac = () => { for (let i = sidecars.length - 1; i >= 0; i--) { try { const j = JSON.parse(sidecars[i].body); if (j && j.mac) return j.mac; } catch (e) {} } return null; };

/* ---- registration ------------------------------------------------------ */
step('MACROS is bank 13, isSoundBank covers both identities, and it follows SOUND + CONFIG on the melodic and drum walks; a Conductor has neither', () => {
    assert(BANKS[BANK_MACROS] && BANKS[BANK_MACROS].name === 'MACROS', 'BANKS[13] is MACROS');
    assert(isSoundBank(BANK_SOUND) && isSoundBank(BANK_MACROS) && !isSoundBank(BANK_STEP) && !isSoundBank(0), 'isSoundBank');
    const mel = bankCycleForMode(0), drum = bankCycleForMode(PAD_MODE_DRUM), con = bankCycleForMode(PAD_MODE_CONDUCT);
    assert(mel.indexOf(BANK_MACROS) === mel.indexOf(BANK_SOUND) + 1, 'melodic: … SOUND, MACROS');
    assert(drum.indexOf(BANK_MACROS) === drum.indexOf(BANK_SOUND) + 1, 'drum: … SOUND, MACROS');
    assert(con.indexOf(BANK_MACROS) < 0 && con.indexOf(BANK_SOUND) < 0, 'conductor: no sound banks');
});

/* ---- entry, identity, migration ------------------------------------------ */
step('setup: sound mode on a Schwung track; soundSetBank(MACROS) lands the page and RECORDS the bank', () => {
    reads = []; writes = []; sidecars = [];
    GS.trackMacros[2] = null;                        /* never seeded: the chain store migrates */
    enterTrack(2);
    snd.soundSetBank(BANK_MACROS);
    assert(snd.soundViewForTest() === VIEW_MACROS, 'view MACROS, got ' + snd.soundViewForTest());
    assert(M().active, 'the knobs are the macros');
    assert(GS.activeBank === BANK_MACROS && GS.trackActiveBank[2] === BANK_MACROS, 'recorded: ' + GS.activeBank + '/' + GS.trackActiveBank[2]);
    assert(M().bankHome === BANK_MACROS, 'bankHome');
});
step('⚠ MIGRATION: the chain\'s knob_N store is read ONCE (spread over ticks) into davebox\'s store, then persisted in the sidecar as `mac`', () => {
    reads = []; sidecars = [];
    ticks(1);
    assert(reads.filter(k => k === 'knob_1_target').length === 1, 'read knob 1 on the first tick');
    assert(!GS.trackMacros[2], 'store not committed mid-walk');
    ticks(4);
    const st = GS.trackMacros[2];
    assert(Array.isArray(st) && st.length === 8, 'store committed');
    assert(st[0] && st[0].kind === 'chain' && st[0].comp === 'synth' && st[0].key === 'cutoff', 'K1 = synth:cutoff, got ' + JSON.stringify(st[0]));
    assert(st[1] === null, 'K2 unassigned');
    assert(st[2] && st[2].comp === 'fx2' && st[2].key === 'room_size', 'K3 = fx2:room_size');
    const mac = lastMac();
    assert(mac && mac[2] && mac[2][0] && mac[2][0].key === 'cutoff', 'sidecar carries mac[2][0], got ' + JSON.stringify(mac && mac[2]));
    ticks(5);
    assert(reads.filter(k => k === 'knob_1_target').length === 1, 'and never read again');
});
step('⚠ SEED: chain_params once per component, one value per macro; the page draws an arc for K1, `--` UNASSIGNED for K2', () => {
    ticks(6);
    assert(reads.filter(k => k === 'synth:chain_params').length === 1, 'synth metadata once, got ' + reads.filter(k => k === 'synth:chain_params').length);
    assert(reads.filter(k => k === 'fx2:chain_params').length === 1, 'fx2 metadata once');
    assert(reads.filter(k => k === 'synth:cutoff').length >= 1, 'cutoff value read');
    const d = M().drawn;
    assert(d[0].kind === 'arc' && d[0].label === 'CUTF' || d[0].label === 'CTOF' || d[0].kind === 'arc', 'K1 is an arc, got ' + JSON.stringify(d[0]));
    assert(d[0].text && d[0].text !== '--', 'K1 shows a value, got ' + d[0].text);
    assert(d[1].text === '--' && /UNASSIGNED/.test(d[1].name), 'K2 reads UNASSIGNED, got ' + JSON.stringify(d[1]));
    assert(d[2].kind === 'arc', 'K3 (room size) is an arc');
});

/* ---- THE KNOB TRAVEL LAW ------------------------------------------------- */
const STEP_CUTOFF = 1 / 255, STEP_ROOM = 19.5 / 255;
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-3);
step('⭑⭑ RANGE NORMALISATION: cutoff declares step 0.5 over 0..1, yet 2 detents move it by 1/255 — the declared step is NOT the resolution', () => {
    writes = [];
    touch(0, true); turnBy(0, 2); ticks(1);
    const w = wrote('synth:cutoff');
    assert(w.length === 1, 'one write, got ' + JSON.stringify(writes));
    assert(near(parseFloat(w[0].val), 0.483 + STEP_CUTOFF), 'moved by one range step, got ' + w[0].val);
    assert(!near(parseFloat(w[0].val), 0.983), 'not by the declared 0.5');
    touch(0, false); ticks(1);
});
step('⭑⭑ a WIDE range (room_size 0.5..20, declared step 0.01) does not crawl: 2 detents = 19.5/255', () => {
    writes = [];
    touch(2, true); turnBy(2, 2); ticks(1);
    const w = wrote('fx2:room_size');
    assert(w.length === 1, 'one write, got ' + JSON.stringify(writes));
    assert(near(parseFloat(w[0].val), 0.75 + STEP_ROOM, 0.01), 'moved by a range step, got ' + w[0].val);
    touch(2, false); ticks(1);
});
step('⭑⭑ a SWEEP costs ZERO reads and the delta MAGNITUDE is kept: one event of 20 detents = 10 steps, one coalesced write', () => {
    const before = reads.length;
    const base = parseFloat(ASSIGN['synth:cutoff']);   /* the stub records every write back: the live value */
    writes = [];
    touch(0, true);
    turnBy(0, 20); ticks(1);
    const w = wrote('synth:cutoff');
    assert(w.length === 1, 'one coalesced write per tick, got ' + w.length);
    assert(near(parseFloat(w[0].val), base + 10 * STEP_CUTOFF, 0.002), '10 steps, got ' + w[0].val + ' from ' + base);
    assert(reads.slice(before).filter(k => k === 'synth:cutoff').length === 0, 'no read-back during the sweep (touched knob is never polled)');
    touch(0, false); ticks(1);
});
step('⭑⭑ REVERSAL RESETS the accumulator: +1 then -1 writes nothing; a second -1 steps down once', () => {
    const base = parseFloat(ASSIGN['synth:cutoff']);
    writes = [];
    touch(0, true);
    turnBy(0, 1); ticks(1); assert(wrote('synth:cutoff').length === 0, 'one detent: sub-step, no write');
    turnBy(0, -1); ticks(1); assert(wrote('synth:cutoff').length === 0, 'reversal: reset, no write');
    turnBy(0, -1); ticks(1);
    const w = wrote('synth:cutoff');
    assert(w.length === 1 && near(parseFloat(w[0].val), base - STEP_CUTOFF), 'one step down, got ' + JSON.stringify(w));
    touch(0, false); ticks(1);
});

/* ---- the assign flow (jog-click), an INT and an ENUM ------------------------ */
function assignVia(knob, targetName, paramLabel) {
    /* click on the page → the K-list; jog to the knob; click → targets (tick);
     * pick; click → params (tick); pick; click → commit. */
    assert(snd.soundViewForTest() === VIEW_MACROS, 'start on MACROS');
    click(); assert(snd.soundViewForTest() === VIEW_KNOBS, 'K-list opened, view ' + snd.soundViewForTest());
    for (let i = 0; i < knob; i++) jog(1);
    assert(M().cursor === knob, 'cursor on K' + (knob + 1));
    click(); ticks(1);
    assert(snd.soundViewForTest() === 12, 'targets, view ' + snd.soundViewForTest());
    const targets = snd.soundKnobTargetsForTest();
    const ti = targets.findIndex(t => t.name === targetName);
    assert(ti >= 0, 'target ' + targetName + ' offered, got ' + JSON.stringify(targets.map(t => t.name)));
    for (let i = 0; i < ti; i++) jog(1);
    click(); ticks(1);
    assert(snd.soundViewForTest() === 13, 'params, view ' + snd.soundViewForTest());
    const ps = snd.soundPickStateForTest();
    const rows = snd.soundKnobParamsForTest();
    const pi = rows.findIndex(p => p.label === paramLabel);
    assert(pi >= 0, 'param ' + paramLabel + ' offered, got ' + JSON.stringify(rows.map(p => p.label)));
    for (let i = 0; i < pi; i++) jog(1);
    click(); ticks(1);
}
step('the jog-click assign flow: K4 → Synth → Voices; the commit lands on the K-list, persists `mac`, Back returns to the page', () => {
    sidecars = [];
    assignVia(3, 'nusaw', 'Voices');
    assert(snd.soundViewForTest() === VIEW_KNOBS, 'commit lands on the list, view ' + snd.soundViewForTest());
    const st = GS.trackMacros[2][3];
    assert(st && st.kind === 'chain' && st.comp === 'synth' && st.key === 'voices', 'K4 = synth:voices, got ' + JSON.stringify(st));
    const mac = lastMac();
    assert(mac && mac[2][3] && mac[2][3].key === 'voices', 'persisted');
    /* ⭑ MIRRORED into the chain's knob store (Josh, 2026-09-03: a whole-chain
     * patch carries the assignments). */
    ticks(1);
    assert(lastWrite('knob_4_set') === 'synth:voices', 'knob_4_set mirrored, got ' + lastWrite('knob_4_set'));
    back();
    assert(snd.soundViewForTest() === VIEW_MACROS, 'Back from the list returns to MACROS, view ' + snd.soundViewForTest());
    ticks(3);
    assert(M().drawn[3].kind === 'valsq', 'an 8-value int draws as the big number, got ' + M().drawn[3].kind);
});
step('⭑⭑ INT FLOOR: voices 1..8 moves ONE voice per 2 detents — never 0.03 — and 1 detent moves nothing', () => {
    writes = [];
    touch(3, true);
    turnBy(3, 1); ticks(1); assert(wrote('synth:voices').length === 0, 'one detent: nothing');
    turnBy(3, 1); ticks(1);
    assert(lastWrite('synth:voices') === '5', 'two detents: 4 → 5, got ' + lastWrite('synth:voices'));
    touch(3, false); ticks(1);
});
step('⭑⭑ ENUM: shape takes 4 detents per option; 3 do nothing, the 4th steps Saw → Square; it draws as the enum square', () => {
    snd.soundSetViewForTest(VIEW_MACROS);
    assignVia(4, 'nusaw', 'Shape');
    back(); ticks(4);
    assert(M().drawn[4].kind === 'enumsq', 'enum square, got ' + M().drawn[4].kind);
    writes = [];
    touch(4, true);
    turnBy(4, 3); ticks(1); assert(wrote('synth:shape').length === 0, 'three detents: nothing');
    turnBy(4, 1); ticks(1);
    const w = wrote('synth:shape');
    assert(w.length === 1, 'the fourth commits, got ' + JSON.stringify(writes));
    assert(w[0].val !== 'Saw', 'moved off Saw, got ' + w[0].val);
    touch(4, false); ticks(1);
});

/* ---- the automation owner, the gestures ----------------------------------- */
step('⚠ a macro turn goes through the AUTOMATION OWNER: with a step held it is a p-lock on <slot>:synth:cutoff', () => {
    modSets.length = 0;
    auto.automationNoteWrite();
    GS.heldStep = 3; GS.heldStepBtn = 3; GS.heldStepNotes = [60]; GS.playing = false;
    GS.clipTPS[2][GS.trackActiveClip[2]] = 24;
    touch(0, true); turnBy(0, 2); ticks(2);
    const lock = modSets.find(x => x.startsWith('t2_pa_set2=') && x.includes(':synth:cutoff'));
    assert(lock, 'a lock on synth:cutoff was written, got ' + JSON.stringify(modSets.slice(0, 6)));
    touch(0, false);
    GS.heldStep = -1; GS.heldStepBtn = -1; GS.heldStepNotes = [];
    ticks(3);
});
step('Mute+touch on a macro marks the Mute a MODIFIER; the touch opens a gesture and the release closes it', () => {
    GS.muteUsedAsModifier = false;
    cc(88, 127); touch(0, true); ticks(1);
    assert(GS.muteUsedAsModifier === true, 'muteUsedAsModifier set');
    assert(auto.automationGestureCountForTest() >= 1, 'a gesture is open');
    touch(0, false); cc(88, 0); ticks(2);
    assert(auto.automationGestureCountForTest() === 0, 'and closed on release');
});
step('holding Mute paints the eight knob rings on MACROS (the paint runs outside the editor)', () => {
    leds.length = 0;
    cc(88, 127); ticks(1);
    const knobLeds = leds.filter(m => (m.length === 4 ? m[2] : m[1]) >= 71 && (m.length === 4 ? m[2] : m[1]) <= 78);
    assert(knobLeds.length >= 8, 'painted the rings, got ' + knobLeds.length);
    cc(88, 0); ticks(1);
});

/* ---- quick assign, the levels as targets, unassigned knobs --------------- */
step('⭑ QUICK ASSIGN: Shift + touch K6 opens ITS target picker; Levels → Volume; the commit lands back on the PAGE', () => {
    snd.soundSetViewForTest(VIEW_MACROS);
    shift(true); touch(5, true); ticks(1); touch(5, false); shift(false);
    assert(snd.soundViewForTest() === 12 && M().cursor === 5, 'K6 target picker, view ' + snd.soundViewForTest() + ' cursor ' + M().cursor);
    assert(M().quick, 'flagged quick');
    const targets = snd.soundKnobTargetsForTest();
    const ti = targets.findIndex(t => t.name === 'Levels');
    assert(ti >= 0, 'Levels offered as a target');
    for (let i = 0; i < ti; i++) jog(1);
    click(); ticks(1);
    const rows = snd.soundKnobParamsForTest();
    assert(rows.some(p => p.label === 'Module Level') && rows[0].label === 'Volume', 'the five levels, got ' + JSON.stringify(rows.map(p => p.label)));
    click(); ticks(1);
    assert(snd.soundViewForTest() === VIEW_MACROS, 'quick assign returns to the page, view ' + snd.soundViewForTest());
    const st = GS.trackMacros[2][5];
    assert(st && st.kind === 'level' && st.key === 'volume', 'K6 = level volume, got ' + JSON.stringify(st));
    ticks(1);
    assert(lastWrite('knob_6_clear') === '1', 'a level macro has no chain form: mirrored as CLEAR');
});
step('⭑ a PATCH LOAD merges the chain store back: chain slots win, an empty chain slot keeps a level macro', () => {
    /* The patch brought knob 1 → fx2:room_size and cleared knob 4; knob 6 (a
     * level macro) has no chain form and must survive. */
    ASSIGN['knob_1_target'] = 'fx2'; ASSIGN['knob_1_param'] = 'room_size';
    ASSIGN['knob_4_target'] = ''; ASSIGN['knob_4_param'] = '';
    snd.soundMacroMergeForTest();
    ticks(6);
    const st = GS.trackMacros[2];
    assert(st[0] && st[0].comp === 'fx2' && st[0].key === 'room_size', 'K1 follows the patch, got ' + JSON.stringify(st[0]));
    assert(st[3] === null, 'K4 cleared by the patch, got ' + JSON.stringify(st[3]));
    assert(st[5] && st[5].kind === 'level' && st[5].key === 'volume', 'K6 level macro kept, got ' + JSON.stringify(st[5]));
    ASSIGN['knob_1_target'] = 'synth'; ASSIGN['knob_1_param'] = 'cutoff';
});
step('a LEVEL macro is the level\'s own knob: K6 writes slot:volume by the levels\' step and draws the fader', () => {
    ticks(3);
    writes = [];
    turnBy(5, 10); ticks(1);
    assert(lastWrite('slot:volume') === (1 + 10 * STEP_VOL).toFixed(3), 'slot:volume, got ' + lastWrite('slot:volume'));
    assert(M().drawn[5].kind === 'vbar' && M().drawn[5].label === 'Vol', 'fader cell, got ' + JSON.stringify(M().drawn[5]));
});
step('⭑ a LEVEL macro FOLLOWS the engine under playback (a bus-pan macro "never moved"): the poll re-reads the level', () => {
    GS.playing = true;
    ASSIGN['slot:volume'] = '0.250';
    ticks(12);
    GS.playing = false;
    assert(M().drawn[5].text !== undefined && M().drawn[5].norm < 0.2, 'K6 followed the engine to 0.25, got ' + JSON.stringify(M().drawn[5]));
});
step('⚠ on MACROS the knobs are NOT the levels: an unassigned K2 turn writes nothing (no slot:pan)', () => {
    writes = [];
    turnBy(1, 10); ticks(2);
    assert(writes.length === 0, 'nothing written, got ' + JSON.stringify(writes));
});
step('⚠ a VANISHED target (module swapped: the param is gone from chain_params) reads UNASSIGNED, never a blank knob', () => {
    const saved = ASSIGN['fx2:chain_params'];
    ASSIGN['fx2:chain_params'] = JSON.stringify([{ key: 'damping', name: 'Damping', type: 'float', min: 0, max: 1 }]);
    snd.soundExit(); GS.activeTrack = 2; snd.soundEnter(2, 2); ticks(3); snd.soundSetBank(BANK_MACROS); ticks(8);
    const d = M().drawn;
    assert(/UNASSIGNED/.test(d[2].name) && d[2].text === '--', 'K3 reads UNASSIGNED, got ' + JSON.stringify(d[2]));
    writes = [];
    turnBy(2, 10); ticks(2);
    assert(!wrote('fx2:room_size').length, 'and a turn writes nothing');
    ASSIGN['fx2:chain_params'] = saved;
});

/* ---- BANK-KNOB targets (Josh's numbered keep-list, 2026-09-03) ------------- */
const hostSets = [];
globalThis.host_module_set_param = (k, v) => { hostSets.push(k + '=' + v); return 0; };
step('⭑ a davebox BANK KNOB as a target: K7 → NOTE FX → Gate Time; the turn takes the bank\'s own write path, no automation', () => {
    snd.soundSetViewForTest(VIEW_MACROS);
    /* ui.js builds this at boot; this rig drives sound mode directly. */
    if (!GS.bankParams) GS.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
    GS.bankParams[2][1][5] = 100;
    assignVia(6, 'NOTE FX', 'Gate Time');
    back(); ticks(3);
    const st = GS.trackMacros[2][6];
    assert(st && st.kind === 'bank' && st.bank === 1 && st.k === 5, 'K7 = bank 1 k5, got ' + JSON.stringify(st));
    const d = M().drawn[6];
    assert(d.kind === 'arc' && d.label === 'Gate' && d.name === 'Gate Time', 'drawn as the bank knob, got ' + JSON.stringify(d));
    assert(!d.auto, 'no automation circle');
    hostSets.length = 0; modSets.length = 0;
    GS.heldStep = 3; GS.heldStepBtn = 3; GS.heldStepNotes = [60];
    touch(6, true); turnBy(6, 4); ticks(2); touch(6, false);
    GS.heldStep = -1; GS.heldStepBtn = -1; GS.heldStepNotes = [];
    assert(GS.bankParams[2][1][5] > 100, 'the bank value moved, got ' + GS.bankParams[2][1][5]);
    assert(hostSets.some(x => x.startsWith('t2_noteFX_gate=')), 'written by the bank\'s own path, got ' + JSON.stringify(hostSets));
    assert(!modSets.some(x => x.includes('pa_set2')), 'a held step takes NO lock from a bank macro (not a store target)');
    ticks(1);
    assert(lastWrite('knob_7_clear') === '1', 'no chain form: mirrored as CLEAR');
});
step('⭑ the allow-list is the ruling: NOTE FX offers Gate Time but not Note Length (mode); CLIP offers only Playback Dir', () => {
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'bank:1' }); ticks(1);
    const nfx = snd.soundKnobParamsForTest().map(p => p.label);
    assert(nfx.indexOf('Gate Time') >= 0 && nfx.indexOf('Note Length') < 0, 'NOTE FX rows, got ' + JSON.stringify(nfx));
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'bank:0' }); ticks(1);
    const clip = snd.soundKnobParamsForTest().map(p => p.label);
    assert(clip.length === 1 && clip[0] === 'Playback Dir', 'CLIP rows, got ' + JSON.stringify(clip));
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'bank:3' }); ticks(1);
    assert(snd.soundKnobParamsForTest().some(p => p.label === 'Clock Feedback'), 'DELAY offers the Shift+K1 Clock Feedback');
    snd.soundSetViewForTest(VIEW_MACROS);
});
step('⭑ a bank target belongs to a PAD MODE: on a drum track NOTE FX is not offered, ALL LANES is, and the NOTE FX macro reads UNASSIGNED', () => {
    GS.trackPadMode[2] = PAD_MODE_DRUM;
    const names = snd.soundKnobTargetsForTest().map(t => t.name);
    assert(names.indexOf('NOTE FX') < 0 && names.indexOf('ALL LANES') >= 0 && names.indexOf('LIVE ARP') >= 0, 'drum targets, got ' + JSON.stringify(names));
    const d = M().drawn[6];
    assert(/UNASSIGNED/.test(d.name) && d.text === '--', 'off-mode bank macro reads UNASSIGNED, got ' + JSON.stringify(d));
    GS.trackPadMode[2] = 0;
});

/* ---- the walk, Back, the rest peek --------------------------------------- */
step('the jog is DECLINED on MACROS (the walk owns it); the click opens the list; Back from the page leaves bank mode and KEEPS the bank', () => {
    snd.soundExit(); GS.activeTrack = 2; GS.activeBank = BANK_STEP; GS.trackActiveBank[2] = BANK_STEP;
    snd.soundEnter(2, 2); ticks(3); snd.soundSetBank(BANK_MACROS); ticks(2);
    assert(jog(1) === false && jog(-1) === false, 'jog declined');
    click(); assert(snd.soundViewForTest() === VIEW_KNOBS, 'click opened the list');
    back(); assert(snd.soundViewForTest() === VIEW_MACROS, 'Back to the page');
    GS.bankCardLatched = true;
    back();
    assert(!GS.bankCardLatched, 'leaves bank mode');
    assert(snd.soundOpen() && snd.soundResting() && !snd.soundActive(), 'the mode stays open, resting');
    assert(GS.activeBank === BANK_MACROS && GS.trackActiveBank[2] === BANK_MACROS, 'Back never changes the bank, got ' + GS.activeBank);
});
step('soundSetBank walks MACROS ↔ SOUND + CONFIG in place: the mode stays open, the screen and the record switch', () => {
    snd.soundEnter(2, 2); ticks(3);
    assert(snd.soundViewForTest() === VIEW_PROMPT && GS.activeBank === BANK_SOUND, 'on the prompt');
    snd.soundSetBank(BANK_MACROS);
    assert(snd.soundOpen() && snd.soundViewForTest() === VIEW_MACROS && GS.activeBank === BANK_MACROS, 'to MACROS');
    /* ⭑ REST: on MACROS with bank mode unlatched the mode is OPEN but not
     * ACTIVE — davebox's gates read it as "no sound screen is up". */
    GS.bankCardLatched = false;
    assert(snd.soundResting() && !snd.soundActive(), 'resting: open, not active');
    GS.bankCardLatched = true;
    assert(!snd.soundResting() && snd.soundActive(), 'latched: active');
    snd.soundSetBank(BANK_SOUND);
    assert(snd.soundActive() && snd.soundViewForTest() === VIEW_PROMPT && GS.activeBank === BANK_SOUND && GS.trackActiveBank[2] === BANK_SOUND, 'back to the door');
});
step('the rest peek (sound mode closed) draws the MACROS layout from the store — labels, `--`, no reads', () => {
    snd.soundExit();
    const before = reads.length;
    globalThis.clear_screen();
    snd.renderMacrosPeek(2);
    assert(px.length + fills.length > 50, 'drew a page');
    assert(reads.length === before, 'no engine reads');
});

/* ---- a MOVE track: no chain store, the bus FX and the levels are the targets --- */
step('a Move-routed track: the store seeds EMPTY at once (no knob_N reads), Levels offered without Module Level', () => {
    reads = [];
    GS.trackMacros[3] = null;
    GS.trackChannel[3] = 1; GS.trackRoute[3] = 1; GS.activeTrack = 3;
    snd.soundEnterMove(3); ticks(2);
    snd.soundSetBank(BANK_MACROS); ticks(3);
    assert(Array.isArray(GS.trackMacros[3]) && GS.trackMacros[3].every(m => m === null), 'seeded empty');
    assert(!reads.some(k => /^knob_\d_target$/.test(k)), 'no chain store reads on a Move bus');
    const targets = snd.soundKnobTargetsForTest();
    assert(targets[targets.length - 1].name === 'Levels', 'Levels is a target, got ' + JSON.stringify(targets.map(t => t.name)));
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'level' }); ticks(1);
    const rows = snd.soundKnobParamsForTest();
    assert(rows.length === 4 && !rows.some(p => p.label === 'Module Level'), 'four bus levels, got ' + JSON.stringify(rows.map(p => p.label)));
    snd.soundExit();
});

/* ---- retirements ----------------------------------------------------------- */
step('⚠ RETIRED: Sound Control has no Knobs row; the old HUD/forwarding machinery and the chain-store knob writes are gone', () => {
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    const sc = src.slice(src.indexOf('const SOUND_CONTROL = ['), src.indexOf('];', src.indexOf('const SOUND_CONTROL = [')));
    assert(!/knobs/.test(sc), 'no Knobs row in SOUND_CONTROL');
    for (const name of ['knobDrivesSlot', 'armKnobValue', 'tickKnobAsn', 'knobHudContext', 'drawKnobAsnHud'])
        assert(src.indexOf(name) < 0, name + ' is gone');
    assert(/function macroTick\(/.test(src) && /const KNOB_TRAVEL = \{/.test(src), 'the macro tick and the travel law exist');
});

if (failed) { console.log('FAIL: macros bank'); process.exit(1); }
console.log('PASS: the MACROS bank — eight assignable parameters through the automation owner, the knob travel law pinned');
}
main().catch(e => { console.error(e); process.exit(1); });
