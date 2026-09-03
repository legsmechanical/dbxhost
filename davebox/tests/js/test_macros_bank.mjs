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
const ticks = (n) => { for (let i = 0; i < n; i++) { GS.clockMs = (GS.clockMs || 0) + 10.6; snd.soundTick(); bridge.tickPrefetch(); auto.automationTick(); } };   /* the clock advances as ui_tick's would */

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
const ledsMod = await import('../../ui/ui_leds.mjs');
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

/* ⭑ A store slot is a MAPPING — `{v, legs:[leg,…]}` (2026-09-05). These two
 * read its FIRST LEG, which is the target. Only the shape assertions below go
 * through them; every BEHAVIOURAL assertion in this file (writes, views,
 * cells, `drawn`, automation, reads) is untouched by the reshape — that is
 * what makes this file the one-leg parity control. */
const leg0 = (mp) => (mp && mp.legs && mp.legs[0]) || null;
const legsOf = (mp) => (mp && mp.legs) || [];

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
    const l0 = leg0(st[0]);
    assert(l0 && l0.kind === 'chain' && l0.comp === 'synth' && l0.key === 'cutoff', 'K1 = synth:cutoff, got ' + JSON.stringify(st[0]));
    assert(l0.lo === 0 && l0.hi === 1 && legsOf(st[0]).length === 1, 'migrated as ONE whole-range leg, got ' + JSON.stringify(st[0]));
    assert(st[1] === null, 'K2 unassigned');
    assert(leg0(st[2]) && leg0(st[2]).comp === 'fx2' && leg0(st[2]).key === 'room_size', 'K3 = fx2:room_size');
    const mac = lastMac();
    assert(mac && mac[2] && leg0(mac[2][0]) && leg0(mac[2][0]).key === 'cutoff', 'sidecar carries mac[2][0], got ' + JSON.stringify(mac && mac[2]));
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
    const st = leg0(GS.trackMacros[2][3]);
    assert(st && st.kind === 'chain' && st.comp === 'synth' && st.key === 'voices', 'K4 = synth:voices, got ' + JSON.stringify(GS.trackMacros[2][3]));
    const mac = lastMac();
    assert(mac && leg0(mac[2][3]) && leg0(mac[2][3]).key === 'voices', 'persisted');
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

/* ---- the retired quick-assign gesture, the levels as targets ------------ */
step('⭑ Shift + touch a macro knob does NOTHING (the quick-assign gesture is RETIRED, Josh 2026-09-05)', () => {
    snd.soundSetViewForTest(VIEW_MACROS);
    shift(true); touch(5, true); ticks(1); touch(5, false); shift(false); ticks(1);
    assert(snd.soundViewForTest() === VIEW_MACROS,
           'stays on the page, no picker — view ' + snd.soundViewForTest());
    assert(GS.trackMacros[2][5] === null, 'and nothing was assigned, got ' + JSON.stringify(GS.trackMacros[2][5]));
});
step('the LIST route is the one way in: K6 → Levels → Volume, and the commit lands on the K-LIST', () => {
    assignVia(5, 'Levels', 'Volume');
    assert(snd.soundViewForTest() === VIEW_KNOBS,
           'a commit always returns to the list now, view ' + snd.soundViewForTest());
    const st = leg0(GS.trackMacros[2][5]);
    assert(st && st.kind === 'level' && st.key === 'volume', 'K6 = level volume, got ' + JSON.stringify(GS.trackMacros[2][5]));
    ticks(1);
    assert(lastWrite('knob_6_clear') === '1', 'a level macro has no chain form: mirrored as CLEAR');
    back(); assert(snd.soundViewForTest() === VIEW_MACROS, 'Back returns to the page');
});
step('⭑ a PATCH LOAD merges the chain store back: chain slots win, an empty chain slot keeps a level macro', () => {
    /* The patch brought knob 1 → fx2:room_size and cleared knob 4; knob 6 (a
     * level macro) has no chain form and must survive. */
    ASSIGN['knob_1_target'] = 'fx2'; ASSIGN['knob_1_param'] = 'room_size';
    ASSIGN['knob_4_target'] = ''; ASSIGN['knob_4_param'] = '';
    snd.soundMacroMergeForTest();
    ticks(6);
    const st = GS.trackMacros[2];
    assert(leg0(st[0]) && leg0(st[0]).comp === 'fx2' && leg0(st[0]).key === 'room_size', 'K1 follows the patch, got ' + JSON.stringify(st[0]));
    assert(st[3] === null, 'K4 cleared by the patch, got ' + JSON.stringify(st[3]));
    assert(leg0(st[5]) && leg0(st[5]).kind === 'level' && leg0(st[5]).key === 'volume', 'K6 level macro kept, got ' + JSON.stringify(st[5]));
    ASSIGN['knob_1_target'] = 'synth'; ASSIGN['knob_1_param'] = 'cutoff';
});
step('⭑ a PATCH LOAD against a MULTI-LEG mapping re-points the FIRST CHAIN LEG and keeps its RANGE + the other legs', () => {
    /* Nothing on the surface builds a second leg yet, so the mapping is seeded
     * here — this pins the RULING (2026-09-05) that the chain store, which has
     * one target per knob, may only ever re-point the leg it can express. If
     * it instead replaced the mapping, a patch load would silently delete
     * every leg and every range the user set. */
    GS.trackMacros[2][1] = { v: 0.4, legs: [
        { kind: 'level', key: 'volume', lo: 0, hi: 1 },                   /* no chain form */
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 },
        { kind: 'midi', target: 'at', lo: 0, hi: 1 },
    ]};
    ASSIGN['knob_2_target'] = 'fx2'; ASSIGN['knob_2_param'] = 'room_size';
    snd.soundMacroMergeForTest();
    ticks(6);
    const L = legsOf(GS.trackMacros[2][1]);
    assert(L.length === 3, 'all three legs survive a patch load, got ' + JSON.stringify(L));
    assert(L[0].kind === 'level' && L[2].kind === 'midi', 'the non-chain legs are untouched, in place');
    assert(L[1].kind === 'chain' && L[1].comp === 'fx2' && L[1].key === 'room_size',
           'the FIRST chain leg follows the patch, got ' + JSON.stringify(L[1]));
    assert(L[1].lo === 0.2 && L[1].hi === 0.8, '⭑ and KEEPS its range — a patch carries a target, never a range');
    assert(GS.trackMacros[2][1].v === 0.4, 'the knob position survives too');
});
step('⭑ …and an EMPTY chain slot drops only the chain leg; a mapping with no chain leg GAINS one at the front', () => {
    ASSIGN['knob_2_target'] = ''; ASSIGN['knob_2_param'] = '';
    snd.soundMacroMergeForTest();
    ticks(6);
    const L = legsOf(GS.trackMacros[2][1]);
    assert(L.length === 2 && L[0].kind === 'level' && L[1].kind === 'midi',
           'the chain leg went, the rest stayed, got ' + JSON.stringify(L));
    /* Now the reverse: the same mapping has no chain leg, and the patch has one. */
    ASSIGN['knob_2_target'] = 'synth'; ASSIGN['knob_2_param'] = 'voices';
    snd.soundMacroMergeForTest();
    ticks(6);
    const M2 = legsOf(GS.trackMacros[2][1]);
    assert(M2.length === 3 && M2[0].kind === 'chain' && M2[0].key === 'voices',
           'the patch target is PREPENDED as a whole-range leg, got ' + JSON.stringify(M2));
    assert(M2[0].lo === 0 && M2[0].hi === 1, '…at whole range');
    assert(M2[1].kind === 'level' && M2[2].kind === 'midi', 'and the old legs follow it');
    GS.trackMacros[2][1] = null;
    ASSIGN['knob_2_target'] = ''; ASSIGN['knob_2_param'] = '';
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
    const st = leg0(GS.trackMacros[2][6]);
    assert(st && st.kind === 'bank' && st.bank === 1 && st.k === 5, 'K7 = bank 1 k5, got ' + JSON.stringify(GS.trackMacros[2][6]));
    const d = M().drawn[6];
    assert(d.kind === 'arc' && d.label === 'Gate' && d.name === 'Gate Time', 'drawn as the bank knob, got ' + JSON.stringify(d));
    assert(!d.auto, 'no automation circle');
    hostSets.length = 0; modSets.length = 0;
    GS.heldStep = 3; GS.heldStepBtn = 3; GS.heldStepNotes = [60];
    touch(6, true); turnBy(6, 4); ticks(2); touch(6, false);
    GS.heldStep = -1; GS.heldStepBtn = -1; GS.heldStepNotes = [];
    assert(GS.bankParams[2][1][5] > 100, 'the bank value moved, got ' + GS.bankParams[2][1][5]);
    assert(hostSets.some(x => x.startsWith('t2_noteFX_gate=')), 'written by the bank\'s own path, got ' + JSON.stringify(hostSets));
    /* ⭑ A bank param IS an automation target (2026-09-03, `seq:<track>:<key>`):
     * the held step takes a LOCK on it, like a chain knob. */
    const lock = modSets.find(x => x.startsWith('t2_pa_set2=') && x.includes(' seq:2:noteFX_gate '));
    assert(lock, 'a lock on seq:2:noteFX_gate, got ' + JSON.stringify(modSets.slice(0, 6)));
    ticks(1);
    assert(lastWrite('knob_7_clear') === '1', 'no chain form: mirrored as CLEAR');
});
step('⭑ PLAYBACK of a seq: target lands through the bank\'s own write path — the DSP stages, JS applies, the mirror follows', () => {
    hostSets.length = 0;
    const prevGet = globalThis.host_module_get_param;
    /* Gate Time 0..400: 8191/16383 ≈ 0.5 → 200. */
    globalThis.host_module_get_param = (k) => (k === 'pa_pending' ? 'seq:2:noteFX_gate 8191\n' : k === 'pa_list' ? '2 0 1 4 seq:2:noteFX_gate 0 0\n' : prevGet(k));
    auto.automationRefreshPresence();
    GS.playing = true;
    ticks(4);
    GS.playing = false;
    globalThis.host_module_get_param = prevGet;
    assert(hostSets.some(x => x === 't2_noteFX_gate=200'), 'applied as t2_noteFX_gate=200, got ' + JSON.stringify(hostSets));
    assert(GS.bankParams[2][1][5] === 200, 'the JS mirror followed, got ' + GS.bankParams[2][1][5]);
    assert(M().drawn[6].auto === 'auto', 'the macro cell shows the automation circle');
    auto.automationRefreshPresence();
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

/* ---- THE MIDI KIND (spec §2b, 2026-09-03): cc on a MIDI track, at/pb everywhere -- */
step('⭑ on a MIDI track the picker offers MIDI CC and MIDI (Aftertouch / Pitch Bend), no modules, no Levels; a Schwung track gets MIDI too', () => {
    snd.soundExit(); GS.trackRoute[6] = 2; GS.trackChannel[6] = 3; GS.activeTrack = 6; GS.trackMacros[6] = null;
    snd.soundEnter(6, 6); ticks(3); snd.soundSetBank(BANK_MACROS); ticks(3);
    const names = snd.soundKnobTargetsForTest().map(t => t.name);
    assert(names.indexOf('MIDI CC') >= 0 && names.indexOf('MIDI') >= 0, 'MIDI targets, got ' + JSON.stringify(names));
    assert(names.indexOf('Levels') < 0 && names.indexOf('nusaw') < 0, 'no chain rows on a MIDI track');
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'midicc' }); ticks(1);
    const rows = snd.soundKnobParamsForTest();
    assert(rows.length === 128 && rows[74].label === 'CC 74 Cutoff' && rows[7].label === 'CC 7 Volume', 'the 128 CCs with their names, got ' + JSON.stringify(rows.slice(73, 76)));
    snd.soundQueueActionForTest({ t: 'knobparam', target: 'midi' }); ticks(1);
    assert(snd.soundKnobParamsForTest().map(p => p.label).join(',') === 'Aftertouch,Pitch Bend', 'MIDI: at, pb');
    snd.soundSetViewForTest(VIEW_MACROS);
});
step('⭑ a CC macro: the turn sends NOW through the DSP (tN_pa_midi_out, 14 bits) and the owner hears a raw cc:74 target; the value persists', () => {
    hostSets.length = 0; modSets.length = 0; sidecars = [];
    GS.trackMidiVals[6] = {};
    assignVia(0, 'MIDI CC', 'CC 74 Cutoff');
    back(); ticks(2);
    assert(leg0(GS.trackMacros[6][0]).kind === 'midi' && leg0(GS.trackMacros[6][0]).target === 'cc:74', 'K1 = cc:74');
    const d = M().drawn[0];
    assert(d.kind === 'arc' && d.label === 'Cutf' && d.text === '0', 'drawn as a CC dial, got ' + JSON.stringify(d));
    GS.playing = true; auto.automationNoteWrite();
    touch(0, true); turnBy(0, 20); ticks(2);           /* 10 units */
    assert(hostSets.some(x => x === 't6_pa_midi_out=cc:74 ' + Math.round(10 * 16383 / 127)), 'sent 10 as 14 bits, got ' + JSON.stringify(hostSets.filter(x => x.indexOf('midi_out') >= 0)));
    assert(modSets.some(x => x.startsWith('t6_pa_live=cc:74 ')), 'the owner heard the raw target (pa_live), got ' + JSON.stringify(modSets.slice(0, 6)));
    touch(0, false); ticks(3); GS.playing = false;
    assert(GS.trackMidiVals[6]['cc:74'] === 10, 'value kept');
    const mac = lastMac();
    assert(sidecars.length && JSON.parse(sidecars[sidecars.length - 1].body).mcv[6]['cc:74'] === 10, 'persisted in the sidecar on release');
});
step('⭑ PITCH BEND springs back to centre on release (ease-out, sent at tick rate); Shift + turn LATCHES', () => {
    hostSets.length = 0;
    assignVia(1, 'MIDI', 'Pitch Bend');
    back(); ticks(2);
    assert(M().drawn[1].kind === 'arcbip' && M().drawn[1].text === '0%', 'a bipolar dial at centre, got ' + JSON.stringify(M().drawn[1]));
    touch(1, true); turnBy(1, 20); ticks(2);           /* +10 steps of 64 */
    assert(GS.trackMidiVals[6]['pb'] === 8192 + 640, 'bent, got ' + GS.trackMidiVals[6]['pb']);
    touch(1, false);
    assert(GS.pbSpring && GS.pbSpring.from === 8192 + 640, 'the spring is armed on release');
    ticks(30);                                          /* > 200 ms at the test cadence */
    assert(GS.trackMidiVals[6]['pb'] === 8192 && !GS.pbSpring, 'back at centre, got ' + GS.trackMidiVals[6]['pb']);
    assert(hostSets.filter(x => x.startsWith('t6_pa_midi_out=pb ')).length >= 3, 'the return was sent along a curve, not jumped');
    /* Shift + turn: latched */
    shift(true); touch(1, true); turnBy(1, 20); ticks(2); touch(1, false); shift(false); ticks(30);
    assert(GS.trackMidiVals[6]['pb'] === 8192 + 640 && GS.pbLatched[6] === true, 'latched, no spring: ' + GS.trackMidiVals[6]['pb']);
    /* the next plain touch-release springs it */
    touch(1, true); touch(1, false); ticks(30);
    assert(GS.trackMidiVals[6]['pb'] === 8192 && GS.pbLatched[6] === false, 'released by a plain touch');
});
step('⭑ the MIDI track\'s SOUND + CONFIG card: Expr / Pan / Mod / Sustain (a switch) and the clip\'s Program / Bank; Program writes tN_cC_program', () => {
    snd.soundSetBank(BANK_SOUND); ticks(2);
    const cells = snd.soundLevelCellsForTest();
    assert(cells[0].label === 'Expr' && cells[1].kind === 'arcbip' && cells[3].kind === 'pill' && cells[4].label === 'Prog' && cells[4].text === '--', 'the card, got ' + JSON.stringify(cells.map(c => c.label + ':' + c.kind + ':' + c.text)));
    hostSets.length = 0;
    turnBy(3, 1); ticks(1);
    assert(GS.trackMidiVals[6]['cc:64'] === 127 && hostSets.some(x => x === 't6_pa_midi_out=cc:64 16383'), 'Sustain switched ON');
    turnBy(4, 6); ticks(1);
    assert(GS.clipProgram[6][GS.trackActiveClip[6]][0] === 5 && hostSets.some(x => x === 't6_c' + GS.trackActiveClip[6] + '_program=5'), 'Program 5 written to the clip, got ' + JSON.stringify(hostSets));
    turnBy(1, -10); ticks(1);
    assert(GS.trackMidiVals[6]['cc:10'] === 54, 'Pan CC 10 from its 64 default');
    snd.soundExit(); GS.trackRoute[6] = 0; GS.activeTrack = 2;
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

/* ⚠ This rig has no DSP, so a freshly-recorded lane is NOT in the owner's
 * state map (that is fed by `pa_list` from the DSP). What IS observable is
 * the write the owner emits — `t2_pa_live=<slot>:<fullKey> …` — so that is
 * what these steps read, the way the p-lock step above reads `pa_set2`. */
const liveTargets = () => modSets.filter(x => /^t2_pa_live=/.test(x))
                                 .map(x => x.slice('t2_pa_live='.length).split(' ')[0]);
/* Seed the owner's state map the way the DSP would, so a CLEAR has something
 * to clear (automationClearKey is a no-op on an unknown target). */
const seedLanes = (...targets) => {
    const prevGet = globalThis.host_module_get_param;
    const clip = ledsMod.effectiveClip(2);
    /* A target may be given as `'<target>'` (active) or `['<target>', 0]`. */
    const line = (t) => {
        const [tg, act] = Array.isArray(t) ? t : [t, 1];
        return '2 ' + clip + ' ' + (act ? 1 : 0) + ' 4 ' + tg + ' 0 0';
    };
    globalThis.host_module_get_param = (k) => (k === 'pa_list'
        ? targets.map(line).join('\n') + '\n' : prevGet(k));
    auto.automationRefreshPresence();
    globalThis.host_module_get_param = prevGet;
};

/* ---- THE MAPPED KNOB: several legs on one macro, each with a range -------- */
/* Nothing on the surface builds these yet (the list gets legs next), so each
 * mapping is seeded directly. What is pinned here is the TURN LAW and Josh's
 * ruling A: a mapped turn writes every leg through its own range and records
 * every leg on its OWN lane — there is no macro lane. */
step('⭑ a RANGED one-leg macro: the knob sweeps only lo..hi of the target, not its whole range', () => {
    enterTrack(2);
    snd.soundSetBank(BANK_MACROS); ticks(4);
    /* cutoff is 0..1; this leg is 0.2..0.6, so a knob at the top must land on
     * 0.6 and at the bottom on 0.2 — never 1.0 or 0. */
    GS.trackMacros[2][0] = { v: null, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.6 }] };
    writes = []; ticks(4);
    assert(GS.trackMacros[2][0].v != null, 'v seeded from the target, got ' + GS.trackMacros[2][0].v);
    turnBy(0, 900); ticks(2);                                  /* far past the top */
    assert(GS.trackMacros[2][0].v === 1, 'the knob pins at the top, got ' + GS.trackMacros[2][0].v);
    assert(Math.abs(parseFloat(lastWrite('synth:cutoff')) - 0.6) < 0.01,
           'the TARGET stops at hi=0.6, got ' + lastWrite('synth:cutoff'));
    turnBy(0, -900); ticks(2);
    assert(Math.abs(parseFloat(lastWrite('synth:cutoff')) - 0.2) < 0.01,
           'and at lo=0.2, got ' + lastWrite('synth:cutoff'));
});
step('⭑ an INVERTED leg (lo > hi): turning the knob UP moves the target DOWN (Josh §6.4)', () => {
    GS.trackMacros[2][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.9, hi: 0.1 }] };
    writes = []; ticks(3);
    turnBy(0, 900); ticks(2);
    const top = parseFloat(lastWrite('synth:cutoff'));
    assert(Math.abs(top - 0.1) < 0.01, 'knob at the TOP = hi = 0.1, got ' + top);
    writes = [];
    turnBy(0, -900); ticks(2);
    const bot = parseFloat(lastWrite('synth:cutoff'));
    assert(Math.abs(bot - 0.9) < 0.01, 'knob at the BOTTOM = lo = 0.9, got ' + bot);
});
step('⭑⭑ THREE legs on one knob: ONE turn writes all three through their own ranges', () => {
    GS.trackMacros[2][0] = { v: 0, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff',    lo: 0,   hi: 1 },
        { kind: 'chain', comp: 'fx2',   key: 'room_size', lo: 0.5, hi: 1 },   /* 10.25 .. 20 */
        { kind: 'level', key: 'volume',                   lo: 0,   hi: 1 },
    ]};
    writes = []; ticks(4);
    turnBy(0, 900); ticks(3);
    assert(Math.abs(parseFloat(lastWrite('synth:cutoff')) - 1) < 0.02, 'leg 1 at its top, got ' + lastWrite('synth:cutoff'));
    assert(Math.abs(parseFloat(lastWrite('fx2:room_size')) - 20) < 0.2, 'leg 2 at ITS top (20), got ' + lastWrite('fx2:room_size'));
    assert(Math.abs(parseFloat(lastWrite('slot:volume')) - SLOT_LEVEL_MAX) < 0.01, 'leg 3 (the level) at its top, got ' + lastWrite('slot:volume'));
    /* ⭑ And PART way, which is where a range either works or is ignored.
     * ⚠ One CC event carries at most 63 detents here (the relative decoder
     * folds 64..127 to negatives), so a quarter turn is 63 detents = 31 steps
     * — v ≈ 0.247. Leg 2's range is 0.5..1 OF 0.5..20, so it must land at
     * 0.5 + (0.5 + 0.247·0.5)·19.5 ≈ 12.7. If the range were IGNORED it would
     * be at 0.247 of 0.5..20 ≈ 5.3 — that is the discrimination. */
    GS.trackMacros[2][0].v = 0; writes = [];
    turnBy(0, 63); ticks(3);
    const v = GS.trackMacros[2][0].v, rs = parseFloat(lastWrite('fx2:room_size'));
    const want = 0.5 + (0.5 + v * 0.5) * 19.5;
    assert(Math.abs(rs - want) < 0.3, 'leg 2 lands inside ITS range (' + want.toFixed(1) + '), got ' + rs);
    assert(rs > 10, '…and nowhere near where an ignored range would put it (~5.3), got ' + rs);
});
step('⭑⭑ RULING A: a mapped turn records EVERY leg on its own lane — there is no macro lane', () => {
    GS.playing = true; auto.automationNoteWrite();
    GS.trackMacros[2][0] = { v: 0.1, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff',    lo: 0, hi: 1 },
        { kind: 'chain', comp: 'fx2',   key: 'room_size', lo: 0, hi: 1 },
    ]};
    ticks(4);
    modSets.length = 0;
    touch(0, true); turnBy(0, 40); ticks(3); touch(0, false); ticks(2);
    const tgs = liveTargets();
    assert(tgs.some(k => /synth:cutoff$/.test(k)), 'leg 1 records on its own lane, got ' + JSON.stringify(tgs));
    assert(tgs.some(k => /fx2:room_size$/.test(k)), 'leg 2 records on its own lane, got ' + JSON.stringify(tgs));
    assert(!tgs.some(k => /^mac:/.test(k)), '⭑ and there is NO mac: lane — ruling A');
    GS.playing = false;
});
step('⚠ the POLL SKIPS a mapped knob: automation moving a leg does NOT move the knob (design §3.2)', () => {
    GS.trackMacros[2][0] = { v: 0.25, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 },
        { kind: 'level', key: 'volume', lo: 0, hi: 1 },
    ]};
    ticks(4);
    const before = GS.trackMacros[2][0].v;
    ASSIGN['synth:cutoff'] = '0.95';                 /* as automation or a module UI would */
    GS.playing = true; ticks(12); GS.playing = false;
    assert(GS.trackMacros[2][0].v === before,
           '⭑ v is the AUTHORITY and did not follow the target, got ' + GS.trackMacros[2][0].v + ' was ' + before);
    /* ⚠ Positive control: a PLAIN macro on the same page still follows, so the
     * skip above is the mapped rule and not a dead poll. */
    GS.trackMacros[2][2] = { v: null, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] };
    ticks(6);
    ASSIGN['synth:cutoff'] = '0.10';
    GS.playing = true; ticks(16); GS.playing = false;
    assert(Math.abs(M().vals[2] - 0.10) < 0.001, 'control: a PLAIN macro DOES follow, got ' + M().vals[2]);
});
step('⭑ a mapped knob draws as its own arc, labelled by its first leg + the count', () => {
    GS.trackMacros[2][0] = { v: 0.5, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 },
        { kind: 'level', key: 'volume', lo: 0, hi: 1 },
    ]};
    ticks(4);
    const d = M().drawn[0];
    assert(d.kind === 'arc', 'an arc, not the target\'s own widget — got ' + d.kind);
    assert(Math.abs(d.norm - 0.5) < 0.001, 'drawn at v, got ' + d.norm);
    assert(d.text === '50%', 'reads as a percentage of the KNOB, got ' + d.text);
    assert(/\+1$/.test(d.label), 'labelled with the leg count, got ' + d.label);
});
step('⭑ Delete + touch a mapped knob clears EVERY leg\'s lane, not just the first', () => {
    GS.playing = true; auto.automationNoteWrite();
    GS.trackMacros[2][0] = { v: 0.2, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff',    lo: 0, hi: 1 },
        { kind: 'chain', comp: 'fx2',   key: 'room_size', lo: 0, hi: 1 },
    ]};
    ticks(4);
    GS.playing = false;
    seedLanes('2:synth:cutoff', '2:fx2:room_size');
    const clip = ledsMod.effectiveClip(2);
    assert(auto.automationStateFor(2, clip, '2:synth:cutoff'), 'precondition: leg 1 has a lane');
    assert(auto.automationStateFor(2, clip, '2:fx2:room_size'), 'precondition: leg 2 has a lane');
    modSets.length = 0;
    cc(119, 127);                                      /* Delete held (sound mode tracks CC 119) */
    touch(0, true); ticks(1); touch(0, false); cc(119, 0); ticks(1);
    const cleared = modSets.filter(x => /^t2_pa_clear_key=/.test(x));
    assert(cleared.some(x => /synth:cutoff$/.test(x)), 'leg 1 cleared, got ' + JSON.stringify(cleared));
    assert(cleared.some(x => /fx2:room_size$/.test(x)), '⭑ leg 2 cleared TOO — one gesture, every lane, got ' + JSON.stringify(cleared));
    assert(!auto.automationStateFor(2, clip, '2:fx2:room_size'), 'and the owner forgot the second lane too');
    GS.trackMacros[2][0] = null; GS.trackMacros[2][2] = null;
});

step('⚠⚠ a leg\'s FIRST turn reports a REAL previous value, never `\'\'` (which normValue reads as the parameter MINIMUM)', () => {
    /* The bug this pins: only leg 0 was seeded, so legs 1..n went to the
     * automation owner with prevWire `''` on their first turn. normValue does
     * not reject that — it parses NaN, falls back to 0, and writes the lane's
     * REST at the parameter's minimum. A 0.5..20 reverb would rest at 0.5.
     * Silent, and only visible as a wrong override-resume much later. */
    GS.playing = true; auto.automationNoteWrite();
    GS.trackMacros[2][0] = { v: null, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff',    lo: 0, hi: 1 },
        { kind: 'chain', comp: 'fx2',   key: 'room_size', lo: 0, hi: 1 },
    ]};
    ticks(8);                                          /* the seed: BOTH legs' values */
    modSets.length = 0;
    touch(0, true); turnBy(0, 30); ticks(3); touch(0, false); ticks(2);
    GS.playing = false;
    const rests = modSets.filter(x => /^t2_pa_rest=/.test(x));
    const lives = modSets.filter(x => /^t2_pa_live=/.test(x));
    assert(lives.length >= 2, 'both legs wrote, got ' + JSON.stringify(modSets.slice(0, 8)));
    /* Whatever carries the rest point, no leg may carry an EMPTY value. */
    for (const w of rests.concat(lives)) {
        const parts = w.split('=')[1].split(' ');
        assert(parts.length >= 2 && parts[1] !== '' && !isNaN(parseFloat(parts[1])),
               'a numeric value, got ' + JSON.stringify(w));
    }
    /* ⭑ The discriminating one: room_size rests where it WAS (0.75 of 0.5..20
     * ≈ 0.013 normalised is nowhere near 0), not at its minimum. */
    const rs = rests.find(x => /room_size/.test(x));
    if (rs) assert(parseFloat(rs.split(' ').pop()) > 0,
                   'the rest is where the parameter WAS, not its minimum — got ' + rs);
});
step('⭑ MIDI and BANK legs ride a mapped turn too (Josh §6.6: every kind can be a leg)', () => {
    if (!GS.bankParams) GS.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
    GS.bankParams[2][1][5] = 100;
    GS.trackMacros[2][0] = { v: 0, legs: [
        { kind: 'bank', bank: 1, k: 5, lo: 0, hi: 1 },
        { kind: 'midi', target: 'at', lo: 0, hi: 1 },
    ]};
    hostSets.length = 0; ticks(5);
    turnBy(0, 60); ticks(3);
    assert(hostSets.some(x => /^t2_pa_midi_out=at /.test(x)),
           'the MIDI leg sent, got ' + JSON.stringify(hostSets.filter(x => /midi_out/.test(x))));
    assert(GS.bankParams[2][1][5] !== 100, 'the BANK leg moved, still ' + GS.bankParams[2][1][5]);
});
step('⭑ an ENUM leg takes a SUB-RANGE of its option list (Josh §6.5) — the sweep never reaches Saw', () => {
    /* shape = Saw/Square/Tri (indices 0..2). lo 0.5 hi 1 is the top half of
     * the list, so a full sweep must only ever write 1 or 2. */
    ASSIGN['synth:shape'] = 'Tri';
    GS.trackMacros[2][0] = { v: null, legs: [{ kind: 'chain', comp: 'synth', key: 'shape', lo: 0.5, hi: 1 }] };
    ticks(6); writes = [];
    for (let n = 0; n < 8; n++) { turnBy(0, -60); ticks(2); }      /* all the way down */
    for (let n = 0; n < 8; n++) { turnBy(0, 60); ticks(2); }       /* and back up */
    const vals = wrote('synth:shape').map(w => parseInt(w.val, 10));
    assert(vals.length > 0, 'the enum leg was written, got none');
    assert(vals.every(v => v >= 1 && v <= 2),
           '⭑ only the top half of the option list is reachable, got ' + JSON.stringify([...new Set(vals)]));
});
step('⭑⭑ ADDING A RANGE MOVES NOTHING: v is seeded by inverting the leg\'s current value through it', () => {
    /* The whole reason legNormToV exists. cutoff sits at 0.4830; wrapping it
     * in a 0.2..0.8 range must NOT snap it — the first turn continues from
     * where the parameter already was, one step at a time. */
    ASSIGN['synth:cutoff'] = '0.4830';
    GS.trackMacros[2][0] = { v: null, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 }] };
    ticks(8);
    const v = GS.trackMacros[2][0].v;
    const seeded = 0.2 + v * 0.6;
    assert(Math.abs(seeded - 0.4830) < 0.01,
           'v inverts back to where the parameter already is (' + seeded.toFixed(3) + '), got v=' + v);
    writes = [];
    turnBy(0, 2); ticks(2);                                        /* ONE step */
    const first = parseFloat(lastWrite('synth:cutoff'));
    assert(Math.abs(first - 0.4830) < 0.02,
           '⭑ the first turn CONTINUES from 0.483, it does not jump — got ' + first);
});
step('⭑ Mute + touch a mapped knob RECOUNTS: legs that disagree all end up the same way', () => {
    GS.trackMacros[2][0] = { v: 0.3, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff',    lo: 0, hi: 1 },
        { kind: 'chain', comp: 'fx2',   key: 'room_size', lo: 0, hi: 1 },
    ]};
    ticks(6);
    /* Seed the owner with the two legs DISAGREEING: leg 1 active, leg 2 off. */
    const clip = ledsMod.effectiveClip(2);
    seedLanes('2:synth:cutoff', ['2:fx2:room_size', 0]);
    assert(auto.automationStateFor(2, clip, '2:synth:cutoff'),
           'precondition: leg 1 has a lane at clip ' + clip);
    assert(auto.automationStateFor(2, clip, '2:synth:cutoff').active, 'precondition: leg 1 ACTIVE');
    assert(!auto.automationStateFor(2, clip, '2:fx2:room_size').active, 'precondition: leg 2 OFF');
    /* ⚠ Read the DSP WRITES, not the state map: a tick refreshes presence from
     * `pa_list`, which this rig answers empty, so the map is gone by then. */
    modSets.length = 0;
    cc(88, 127); touch(0, true); ticks(1); touch(0, false); cc(88, 0); ticks(1);
    const acts = modSets.filter(x => /^t2_pa_active=/.test(x));
    /* One leg was active, so the gesture means OFF for the whole knob: leg 1
     * is switched off and leg 2 — already off — is LEFT ALONE. A per-leg
     * toggle would have written a `1` for leg 2 and swapped them. */
    assert(acts.some(x => /2:synth:cutoff 0$/.test(x)), 'leg 1 switched OFF, got ' + JSON.stringify(acts));
    assert(!acts.some(x => / 1$/.test(x)),
           '⭑ nothing was switched ON — the gesture RECOUNTS, it does not toggle each leg, got ' + JSON.stringify(acts));
    assert(!acts.some(x => /room_size/.test(x)), 'the already-off leg was left alone, got ' + JSON.stringify(acts));
    GS.trackMacros[2][0] = null;
});

/* ---- THE LEG LIST: where a mapping is actually built --------------------- */
/* Josh retired Shift+touch on the grounds that "we can handle anything we need
 * from the assignment menu" (2026-09-05), so this list is the ONLY way a macro
 * gains a second target or a range. Everything below drives it by hand. */
const VIEW_KNOBLEGS = 20;
const legRows = () => snd.soundKnobLegRowsForTest();
const S_setLegRow = (n) => snd.soundSetLegRowForTest(n);
const legRowLabels = () => legRows().map(r => r.label + '=' + r.value);

step('⭑ THE DOOR RULE on the K-list: an EMPTY knob goes straight to choosing, an ASSIGNED one is ENTERED', () => {
    enterTrack(2);
    snd.soundSetBank(BANK_MACROS); ticks(5);
    GS.trackMacros[2][4] = null;                       /* K5: empty */
    GS.trackMacros[2][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] };
    click();                                            /* page -> K-list */
    assert(snd.soundViewForTest() === VIEW_KNOBS, 'K-list, view ' + snd.soundViewForTest());
    for (let i = 0; i < 4; i++) jog(1);                 /* to K5, the empty one */
    click(); ticks(1);
    assert(snd.soundViewForTest() === 12, 'an EMPTY knob opens the target picker directly, view ' + snd.soundViewForTest());
    back(); ticks(1);
    for (let i = 0; i < 4; i++) jog(-1);                /* back to K1, the assigned one */
    click(); ticks(1);
    assert(snd.soundViewForTest() === VIEW_KNOBLEGS, 'an ASSIGNED knob ENTERS its legs, view ' + snd.soundViewForTest());
});
step('⭑ the leg list shows each leg with its Lo and Hi, then `+ Add target`', () => {
    const rows = legRows();
    assert(rows.length === 4, 'one leg = 3 rows + add, got ' + JSON.stringify(legRowLabels()));
    assert(rows[0].kind === 'leg' && /Syn>cutoff/.test(rows[0].value), 'the leg names its target, got ' + rows[0].value);
    assert(rows[1].kind === 'lo' && rows[1].value === '0%', 'Lo, got ' + rows[1].value);
    assert(rows[2].kind === 'hi' && rows[2].value === '100%', 'Hi, got ' + rows[2].value);
    assert(rows[3].kind === 'add' && rows[3].label === '+ Add target', 'the add row, got ' + rows[3].label);
});
step('⭑⭑ `+ Add target` ADDS a leg — it does not replace the first (the thing Shift+touch could never do)', () => {
    for (let i = 0; i < 3; i++) jog(1);                 /* onto + Add target */
    click(); ticks(1);
    assert(snd.soundViewForTest() === 12, 'the target picker, view ' + snd.soundViewForTest());
    const targets = snd.soundKnobTargetsForTest();
    const ti = targets.findIndex(t => t.name === 'Levels');
    for (let i = 0; i < ti; i++) jog(1);
    click(); ticks(1);
    const rows = snd.soundKnobParamsForTest();
    const pi = rows.findIndex(p => p.label === 'Volume');
    for (let i = 0; i < pi; i++) jog(1);
    click(); ticks(1);
    const legs = legsOf(GS.trackMacros[2][0]);
    assert(legs.length === 2, '⭑ TWO legs now, got ' + JSON.stringify(legs));
    assert(legs[0].kind === 'chain' && legs[0].key === 'cutoff', 'the first leg is untouched');
    assert(legs[1].kind === 'level' && legs[1].key === 'volume', 'the second is the one just picked');
    assert(legs[1].lo === 0 && legs[1].hi === 1, 'a new leg starts at whole range');
    assert(snd.soundViewForTest() === VIEW_KNOBLEGS, 'and the commit lands back on the LEG list, view ' + snd.soundViewForTest());
    assert(legRows().length === 7, 'two legs = 6 rows + add, got ' + JSON.stringify(legRowLabels()));
});
step('⭑ a Lo row: click to edit, jog to move — and the TARGET does not move (Josh §6.2)', () => {
    /* Cursor to leg 2's Lo (rows: leg,lo,hi, leg,lo,hi, add -> index 4). */
    S_setLegRow(4);
    assert(legRows()[4].kind === 'lo', 'on leg 2 Lo, got ' + legRows()[4].kind);
    writes = [];
    click();                                            /* enter the edit */
    for (let i = 0; i < 20; i++) jog(1);                /* +20% */
    const legs = legsOf(GS.trackMacros[2][0]);
    assert(Math.abs(legs[1].lo - 0.20) < 0.001, 'Lo moved to 20%, got ' + legs[1].lo);
    assert(legRows()[4].value === '20%', 'and the row says so, got ' + legRows()[4].value);
    ticks(2);
    assert(!writes.some(w => w.key === 'slot:volume'),
           '⭑ the TARGET did not move — a range takes effect on the NEXT turn, got ' + JSON.stringify(writes));
    back();                                             /* leave the edit */
    for (let i = 0; i < 10; i++) jog(1);
    assert(Math.abs(legsOf(GS.trackMacros[2][0])[1].lo - 0.20) < 0.001, 'Back left the edit: the jog is the cursor again');
});
step('⭑ an INVERTED range can be dialled in: Hi below Lo is allowed, the two bounds are independent (§6.4)', () => {
    S_setLegRow(5);                                     /* leg 2's Hi */
    assert(legRows()[5].kind === 'hi', 'on Hi, got ' + legRows()[5].kind);
    click();
    for (let i = 0; i < 95; i++) jog(-1);               /* 100% -> 5%, well under Lo's 20% */
    const legs = legsOf(GS.trackMacros[2][0]);
    assert(Math.abs(legs[1].hi - 0.05) < 0.001, 'Hi went to 5%, got ' + legs[1].hi);
    assert(legs[1].lo > legs[1].hi, '⭑ lo > hi is ACCEPTED, not clamped away — got ' + legs[1].lo + '..' + legs[1].hi);
    back();
});
step('⭑ a plain click on a leg RE-POINTS it and KEEPS its range', () => {
    S_setLegRow(3);                                     /* leg 2 */
    assert(legRows()[3].kind === 'leg', 'on the leg row, got ' + legRows()[3].kind);
    click(); ticks(1);
    const targets = snd.soundKnobTargetsForTest();
    const ti = targets.findIndex(t => t.name === 'nusaw');
    assert(ti >= 0, 'the synth offered, got ' + JSON.stringify(targets.map(t => t.name)));
    /* ⚠ The picker opens ON THE LEG'S OWN target, so walk from where the
     * cursor actually is — a fixed count from the top lands somewhere else. */
    assert(targets[snd.soundKnobTargetIdxForTest()].name === 'Levels',
           'the picker opened on LEG 2\'s target, not leg 1\'s — got ' + targets[snd.soundKnobTargetIdxForTest()].name);
    for (let i = snd.soundKnobTargetIdxForTest(); i > ti; i--) jog(-1);
    click(); ticks(1);
    const ps = snd.soundKnobParamsForTest();
    const pi = ps.findIndex(p => p.label === 'Voices');
    assert(pi >= 0, 'Voices offered, got ' + JSON.stringify(ps.map(p => p.label)));
    for (let i = snd.soundKnobParamIdxForTest(); i < pi; i++) jog(1);
    click(); ticks(1);
    const legs = legsOf(GS.trackMacros[2][0]);
    assert(legs.length === 2, 'still two legs, got ' + legs.length);
    assert(legs[1].kind === 'chain' && legs[1].key === 'voices', 'leg 2 re-pointed, got ' + JSON.stringify(legs[1]));
    assert(Math.abs(legs[1].lo - 0.20) < 0.001 && Math.abs(legs[1].hi - 0.05) < 0.001,
           '⭑ and KEPT its 20..5% range — a range belongs to the KNOB, got ' + legs[1].lo + '..' + legs[1].hi);
});
step('⭑ Shift + click a leg REMOVES it; removing the last leg leaves the knob UNASSIGNED', () => {
    S_setLegRow(3);
    shift(true); click(); shift(false); ticks(1);
    const legs = legsOf(GS.trackMacros[2][0]);
    assert(legs.length === 1 && legs[0].key === 'cutoff', 'leg 2 gone, leg 1 kept, got ' + JSON.stringify(legs));
    assert(legRows().length === 4, 'the list shrank, got ' + JSON.stringify(legRowLabels()));
    S_setLegRow(0);
    shift(true); click(); shift(false); ticks(1);
    assert(GS.trackMacros[2][0] === null, 'the last leg removed leaves the slot null, got ' + JSON.stringify(GS.trackMacros[2][0]));
    ticks(2);
    assert(M().drawn[0].text === '--', 'and the page reads `--` again, got ' + JSON.stringify(M().drawn[0]));
});
step('⭑ the leg list RENDERS — three legs is 10 rows and the screen still draws (structure is not pixels)', () => {
    /* ⚠ Every other assertion here reads knobLegRows(), which is a description
     * of the screen, not the screen. Ten rows is more than the list shows at
     * once, so this is the one that would catch a list that silently draws
     * nothing (or throws) once the mapping outgrows a page. */
    GS.trackMacros[2][0] = { v: 0.5, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 },
        { kind: 'level', key: 'volume', lo: 0, hi: 1 },
        { kind: 'midi', target: 'at', lo: 1, hi: 0 },
    ]};
    snd.soundSetViewForTest(VIEW_MACROS);
    click();                                            /* K-list */
    snd.soundSetLegRowForTest(0);
    for (let i = 0; i < 0; i++) jog(1);
    click(); ticks(1);                                  /* the assigned knob ENTERS */
    assert(snd.soundViewForTest() === VIEW_KNOBLEGS, 'on the leg list, view ' + snd.soundViewForTest());
    assert(legRows().length === 10, 'three legs = 9 rows + add, got ' + legRows().length);
    px.length = 0; fills.length = 0;
    draw();
    assert(px.length + fills.length > 40, 'the leg list drew something, got ' + (px.length + fills.length));
    /* And scrolled to the bottom, where a naive list would run off the box. */
    snd.soundSetLegRowForTest(9);
    px.length = 0; fills.length = 0;
    draw();
    assert(px.length + fills.length > 40, 'the LAST row draws too, got ' + (px.length + fills.length));
    GS.trackMacros[2][0] = null;
});
step('⭑ the K-list row says what a mapped knob DRIVES, and a plain one still names its target', () => {
    GS.trackMacros[2][0] = { v: 0.5, legs: [{ kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0, hi: 1 }] };
    GS.trackMacros[2][1] = { v: 0.5, legs: [
        { kind: 'chain', comp: 'synth', key: 'cutoff', lo: 0.2, hi: 0.8 },
        { kind: 'level', key: 'volume', lo: 0, hi: 1 },
    ]};
    ticks(3);
    /* Through the real path: the K-list rebuilds knobAsn when it opens, which
     * is where the row's fallback label comes from. */
    snd.soundSetViewForTest(VIEW_MACROS);
    click();
    assert(snd.soundViewForTest() === VIEW_KNOBS, 'on the K-list, view ' + snd.soundViewForTest());
    const src = readFileSync('ui/ui_sound.mjs', 'utf8');
    assert(/function knobRowLabel/.test(src), 'knobRowLabel exists');
    /* Read it through the function the screen uses, not by drawing pixels. */
    assert(snd.soundKnobRowLabelForTest(0) === 'Syn>cutoff',
           'a PLAIN knob still names its target, got ' + snd.soundKnobRowLabelForTest(0));
    const mapped = snd.soundKnobRowLabelForTest(1);
    assert(/\+1/.test(mapped) && /~$/.test(mapped),
           'a MAPPED knob says the count and that a range is set, got ' + mapped);
    GS.trackMacros[2][0] = null; GS.trackMacros[2][1] = null;
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
