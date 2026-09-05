/* tests/js/test_track_switch_follows_editor.mjs — ITEM 20 (Josh, 2026-09-05:
 * "Yes, follow into the editor", then "tracks should switch under everything
 * except where it just doesn't make any sense"). A track switch made from ANY
 * sound-mode screen lands on the same KIND of screen on the new track where
 * it has one (editor → editor, menu → menu, CONFIG → CONFIG, LFO → LFO,
 * MACROS → MACROS, prompt → prompt), route-aware; a global bus and a Conduct
 * target still close; outside sound mode nothing opens.
 *
 * Drives `_switchActiveTrack` directly — it is the ONE dispatch every switch
 * site (Shift+jog, Shift+pad, launchers, remote UI) goes through — and reads
 * the outcome through sound mode's test accessors, never by rendering. */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

globalThis.host_system_cmd = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.shadow_restore_knob_leds = () => {};
globalThis.host_vol_block = () => {};
globalThis.host_edit_cc_block = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
/* Same host text subsystem as `print` above: proportional advance, so a
 * caller measuring before it draws needs both. 6px/char matches the
 * device atlas's widest cell + spacing — near enough for truncation. */
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = () => {};
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
/* ⚠⚠ These matter more than they look. `tick()` wraps _tickImpl in a
 * try/catch, so a MISSING host binding throws on the first line that touches it
 * and every later stage of the tick — including sound mode's track-follow —
 * silently never runs. The whole tick looks like it executed. A fourth version
 * of the one-shot step passed against its mutation purely because
 * host_ext_midi_remap_clear was undefined and the follow was unreachable. */
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
/* A loaded generator on every chain slot: engineLoadedModule() reads
 * `<comp>:module`, and the editor only opens on a block that has something in
 * it. The PARKED chain of a MIDI / NONE track answers the same — which is
 * exactly why those routes must NOT reopen an editor. */
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw' : '';
globalThis.host_ext_midi_remap_clear = () => {};
globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const { BANK_SOUND, ROUTE_NONE, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
const editops = await import('../../ui/ui_editops.mjs');

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_SLOTCFG = 8, VIEW_BUSES = 9, VIEW_LFO = 14,
      VIEW_ENUM = 17, VIEW_PROMPT = 18, VIEW_MACROS = 19, VIEW_NOEDITOR = 21;   /* ui_sound's own numbering */
const backTap = () => { globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 51, 127])); globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 51, 0])); };
const fs = () => snd.soundFollowStateForTest();
const view = () => snd.soundPickStateForTest().view;
const kinds = () => snd.soundPickStateForTest().kinds.join(',');

function step(label, fn) {
    if (fn && fn.constructor && fn.constructor.name === 'AsyncFunction')
        throw new Error('step("' + label + '") got an ASYNC function');
    try { fn(); ok(label); } catch (e) { bad(label, e); }
}

/* Open track t's editor on its synth: entry, then the `open` action the jog
 * click would queue, resolved by the tick like every sound-mode action. */
function enterEditor(t) {
    S.activeTrack = t;
    snd.soundEnter(t, t);
    snd.soundQueueActionForTest({ t: 'open', comp: 'synth' });
    globalThis.tick();
    if (!snd.soundOpen() || view() !== VIEW_EDIT)
        throw new Error('control failed: the editor did not open on track ' + t + ' (view ' + view() + ')');
}

step('setup: routes — 2,3 Schwung · 4 MIDI · 5 NONE · 6 Move · 7 Conduct', () => {
    S.sessionView = false; S.globalMenuOpen = false; S.ledInitComplete = true;
    for (let t = 0; t < 8; t++) { S.trackRoute[t] = 0; S.trackActiveBank[t] = t % 3; S.trackSoundOrigin[t] = -1; }
    S.trackRoute[4] = 2; S.trackRoute[5] = ROUTE_NONE; S.trackRoute[6] = 1;
    S.trackPadMode[7] = PAD_MODE_CONDUCT;
    S.playing = true;
    S.clipSteps[3][0][0] = 1;
});

step('⭑ Schwung → Schwung: the switch from an EDITOR lands in the new track\'s editor', () => {
    enterEditor(2);
    editops._switchActiveTrack(3);
    if (S.activeTrack !== 3) throw new Error('the track did not switch');
    if (!snd.soundOpen()) throw new Error('sound mode CLOSED — the 08-24 rule, not the 09-05 one');
    if (snd.soundTrack() !== 3) throw new Error('sound mode still points at track ' + snd.soundTrack());
    globalThis.tick();                              /* the retarget action resolves */
    if (view() !== VIEW_EDIT) throw new Error('landed on view ' + view() + ', not the editor');
    if (S.activeBank !== BANK_SOUND) throw new Error('the bank identity did not follow (' + S.activeBank + ')');
    if (S.trackActiveBank[3] === BANK_SOUND) throw new Error('the follow RECORDED the sound bank on track 3 — only the jog records a bank (Josh, 2026-09-05)');
});

step('...and the sequencer underneath is untouched', () => {
    if (S.playing !== true) throw new Error('transport changed');
    if (S.clipSteps[3][0][0] !== 1) throw new Error('a clip step changed');
});

step('⭑ Schwung → MIDI from the EDITOR: the NO INSTRUMENT EDITOR screen for a "MIDI track"; Back → its menu (Josh, 2026-09-05)', () => {
    editops._switchActiveTrack(4);
    if (!snd.soundOpen() || snd.soundTrack() !== 4) throw new Error('did not follow');
    settle();                                        /* the retarget lands, then the message view queued behind it */
    if (view() !== VIEW_NOEDITOR) throw new Error('view ' + view() + ' — a MIDI track has no editor: the message screen, not its menu');
    if (snd.noEditorWords(4) !== 'MIDI track') throw new Error('words: ' + snd.noEditorWords(4));
    backTap(); globalThis.tick();
    if (view() !== VIEW_BLOCKS) throw new Error('Back did not land on the menu: view ' + view());
    if (kinds() !== 'trackto,config') throw new Error('rows: ' + kinds());
});

step('⭑ from that MENU a further switch FOLLOWS to the new track\'s MENU (09-05: under everything)', () => {
    editops._switchActiveTrack(2);
    if (!snd.soundOpen() || snd.soundTrack() !== 2) throw new Error('the menu did not follow');
    globalThis.tick();
    if (view() !== VIEW_BLOCKS) throw new Error('view ' + view() + ' — a menu switch lands on the menu, not the editor');
    if (kinds().indexOf('trackto') !== 0) throw new Error('rows: ' + kinds());
    snd.soundExit();
});

/* Open a screen on track t through the same actions the jog would queue. */
/* soundEnter lands on the bank PROMPT (the bank is a door, 08-28); the click that
 * opens the menu is a view change, queued here the way the prompt's click does it. */
function enterMenu(t) { S.activeTrack = t; snd.soundEnter(t, t); globalThis.tick(); snd.soundQueueActionForTest({ t: 'view', view: VIEW_BLOCKS }); globalThis.tick(); if (view() !== VIEW_BLOCKS) throw new Error('control: menu did not open (view ' + view() + ')'); }
function enterConfig(t) { enterMenu(t); snd.soundQueueActionForTest({ t: 'slotcfg', which: 'config' }); globalThis.tick(); if (view() !== VIEW_SLOTCFG) throw new Error('control: CONFIG did not open (view ' + view() + ')'); }
function settle() { globalThis.tick(); globalThis.tick(); globalThis.tick(); }

step('⭑ CONFIG → CONFIG: Schwung to Schwung lands on the new track\'s CONFIG screen', () => {
    enterConfig(2);
    editops._switchActiveTrack(3);
    if (!snd.soundOpen() || snd.soundTrack() !== 3) throw new Error('did not follow');
    settle();
    if (view() !== VIEW_SLOTCFG || fs().cfgWhich !== 'config') throw new Error('view ' + view() + ' which ' + fs().cfgWhich);
});

step('⭑ CONFIG → CONFIG: Schwung to a MIDI track lands on ITS CONFIG (item 14 gave it one)', () => {
    editops._switchActiveTrack(4);
    if (!snd.soundOpen() || snd.soundTrack() !== 4) throw new Error('did not follow');
    settle();
    if (view() !== VIEW_SLOTCFG || fs().cfgWhich !== 'config') throw new Error('view ' + view() + ' which ' + fs().cfgWhich);
});

step('⭑ CONFIG → NONE: a NONE track has no config — its Instrument-only menu', () => {
    editops._switchActiveTrack(5);
    if (!snd.soundOpen() || snd.soundTrack() !== 5) throw new Error('did not follow');
    settle();
    if (view() !== VIEW_BLOCKS || kinds() !== 'trackto') throw new Error('view ' + view() + ' rows ' + kinds());
    snd.soundExit();
});

step('⭑ the LFOs screen → a MIDI track has no LFOs: its menu; → Schwung: the LFOs screen again', () => {
    enterMenu(2);
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); globalThis.tick();
    if (view() !== VIEW_SLOTCFG || fs().cfgWhich !== 'sound') throw new Error('control: LFOs screen did not open');
    editops._switchActiveTrack(4); settle();
    if (view() !== VIEW_BLOCKS) throw new Error('a MIDI track showed an LFOs screen (view ' + view() + ')');
    editops._switchActiveTrack(3); settle();
    if (view() !== VIEW_BLOCKS) throw new Error('from a menu the switch should land on the menu, view ' + view());
    snd.soundExit();
});

step('⭑ an LFO editor → the SAME LFO on the new Schwung track; its target picker collapses to it', () => {
    enterMenu(2);
    snd.soundQueueActionForTest({ t: 'slotcfg', which: 'sound' }); globalThis.tick();
    snd.soundQueueActionForTest({ t: 'lfo', lfo: 1 }); globalThis.tick();
    if (view() !== VIEW_LFO || fs().lfoNum !== 1) throw new Error('control: LFO 2 did not open (view ' + view() + ')');
    editops._switchActiveTrack(3); settle();
    if (view() !== VIEW_LFO || fs().lfoNum !== 1) throw new Error('view ' + view() + ' lfo ' + fs().lfoNum);
    snd.soundQueueActionForTest({ t: 'lfotarget' }); globalThis.tick();
    editops._switchActiveTrack(2); settle();
    if (view() !== VIEW_LFO || fs().lfoNum !== 1) throw new Error('the target picker did not collapse to LFO 2: view ' + view());
    snd.soundExit();
});

step('⭑ an open ENUM PICKER closes WITHOUT committing and the switch follows its parent (the menu)', () => {
    enterMenu(2);
    snd.soundQueueActionForTest({ t: 'instrpick' }); globalThis.tick();
    if (view() !== VIEW_ENUM || fs().enumPick !== 'Instrument') throw new Error('control: the picker did not open');
    const routeBefore = S.trackRoute[2];
    editops._switchActiveTrack(3); settle();
    if (S.trackRoute[2] !== routeBefore) throw new Error('the picker COMMITTED on a track switch');
    if (fs().enumPick !== null) throw new Error('the picker is still open on the new track');
    if (view() !== VIEW_BLOCKS) throw new Error('view ' + view());
    snd.soundExit();
});

step('⭑ MACROS → MACROS, prompt → prompt', () => {
    S.bankCardLatched = true;                       /* in BANK MODE these are screens you are IN; unlatched they REST (no follow) */
    enterMenu(2);
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_MACROS }); globalThis.tick();
    editops._switchActiveTrack(3); settle();
    if (view() !== VIEW_MACROS) throw new Error('MACROS did not follow: view ' + view());
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_PROMPT }); globalThis.tick();
    editops._switchActiveTrack(2); settle();
    if (view() !== VIEW_PROMPT) throw new Error('the prompt did not follow: view ' + view());
    snd.soundExit();
    S.bankCardLatched = false;
});
step('⚠ the Session FX gateway is GLOBAL: the switch keeps it open, unchanged', () => {
    enterMenu(2);
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_BUSES }); globalThis.tick();
    editops._switchActiveTrack(3); settle();
    if (view() !== VIEW_BUSES) throw new Error('the gateway was left: view ' + view());
    snd.soundExit();
});

step('⭑ Schwung → NONE from the EDITOR: the message says "no instrument"; Back → the Instrument-only menu', () => {
    enterEditor(2);
    editops._switchActiveTrack(5);
    if (!snd.soundOpen() || snd.soundTrack() !== 5) throw new Error('did not follow');
    settle();
    if (view() !== VIEW_NOEDITOR) throw new Error('view ' + view());
    if (snd.noEditorWords(5) !== 'no instrument') throw new Error('words: ' + snd.noEditorWords(5));
    backTap(); globalThis.tick();
    if (view() !== VIEW_BLOCKS || kinds() !== 'trackto') throw new Error('view ' + view() + ' rows ' + kinds());
    snd.soundExit();
});

step('⭑ Schwung → Move from the EDITOR: the message says "Move track"; Back → its bus MENU (not global)', () => {
    enterEditor(2);
    editops._switchActiveTrack(6);
    if (!snd.soundOpen() || snd.soundTrack() !== 6) throw new Error('did not follow');
    if (snd.soundIsGlobal()) throw new Error('landed on a GLOBAL bus');
    settle();
    if (view() !== VIEW_NOEDITOR) throw new Error('view ' + view());
    if (snd.noEditorWords(6) !== 'Move track') throw new Error('words: ' + snd.noEditorWords(6));
    backTap(); globalThis.tick();
    if (view() !== VIEW_BLOCKS) throw new Error('Back did not land on the bus menu: view ' + view());
    snd.soundExit();
});

step('⭑ the walk goes ON from the message: → another unsupported track shows it again; → a Schwung track opens its EDITOR', () => {
    enterEditor(2);
    editops._switchActiveTrack(4); settle();
    if (view() !== VIEW_NOEDITOR) throw new Error('control: message not shown for the MIDI track');
    editops._switchActiveTrack(5); settle();
    if (view() !== VIEW_NOEDITOR || snd.soundTrack() !== 5) throw new Error('walking on to NONE: view ' + view() + ' track ' + snd.soundTrack());
    editops._switchActiveTrack(6); settle();
    if (view() !== VIEW_NOEDITOR || snd.soundTrack() !== 6) throw new Error('walking on to Move: view ' + view());
    editops._switchActiveTrack(3); settle();
    if (view() !== VIEW_EDIT || snd.soundTrack() !== 3) throw new Error('walking on to a Schwung track did not open its editor: view ' + view());
    snd.soundExit();
});

step('⚠ from the MENU (not the editor) a switch onto a MIDI track still lands on its menu directly', () => {
    enterMenu(2);
    editops._switchActiveTrack(4); globalThis.tick();
    if (view() !== VIEW_BLOCKS || kinds() !== 'trackto,config') throw new Error('view ' + view() + ' rows ' + kinds());
    snd.soundExit();
});

step('⭑ prompt → Move: the bank PROMPT follows as the prompt; MACROS → MACROS on a Move track too', () => {
    enterMenu(2);
    /* In BANK MODE (the card latched): the prompt and MACROS are screens you are
     * IN. Unlatched they are the RESTING state, which a switch does not follow
     * (see the fast-scroll step below). */
    S.bankCardLatched = true;
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_PROMPT }); globalThis.tick();
    editops._switchActiveTrack(6); settle();
    if (view() !== VIEW_PROMPT) throw new Error('view ' + view() + ', expected the bus prompt');
    snd.soundQueueActionForTest({ t: 'view', view: VIEW_MACROS }); globalThis.tick();
    editops._switchActiveTrack(2); settle();
    if (view() !== VIEW_MACROS) throw new Error('MACROS did not follow off a Move bus: view ' + view());
    S.bankCardLatched = false;
    snd.soundExit();
});

step('⭑ Shift+JOG from inside the EDITOR steps the track and lands in the new track\'s editor (Josh, 2026-09-05)', () => {
    /* The device gesture, not a direct _switchActiveTrack call: the grid used
     * to swallow Shift+jog for its section jump, so the switch never happened
     * from the editor at all. */
    enterEditor(2);
    const v0 = view();
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 49, 127]));   /* Shift down */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 14, 1]));     /* jog +1 */
    globalThis.onMidiMessageInternal(new Uint8Array([0xB0, 49, 0]));     /* Shift up */
    settle();
    if (S.activeTrack !== 3) throw new Error('Shift+jog in the editor did not step the track: ' + S.activeTrack + ' shift=' + S.shiftHeld + ' view=' + view() + ' pick=' + JSON.stringify(snd.soundPickStateForTest().shift));
    if (!snd.soundOpen() || view() !== v0) throw new Error('the editor did not follow: open=' + snd.soundOpen() + ' view=' + view() + ' (was ' + v0 + ')');
    snd.soundExit();
});

step('⚠ a Conduct track has no sound to follow into: the switch closes', () => {
    enterEditor(2);
    editops._switchActiveTrack(7);
    if (snd.soundOpen()) throw new Error('followed onto a Conduct track');
});

step('⚠ outside sound mode a switch opens NOTHING (as before)', () => {
    /* Track 3 was RECORDED on the sound bank by the follow above — and a track
     * recorded there re-opens the screen on arrival by the 08-25 invariant,
     * which is correct and not what this step is about. Put it on a plain bank. */
    S.trackActiveBank[3] = 1;
    S.activeTrack = 2; S.activeBank = S.trackActiveBank[2];
    editops._switchActiveTrack(3);
    globalThis.tick();
    if (snd.soundOpen()) throw new Error('an editor opened from a plain switch');
    if (S.activeBank !== S.trackActiveBank[3]) throw new Error('bank ' + S.activeBank);
});

step('⚠⚠ a FAST Shift+scroll across a track recorded on SOUND + CONFIG does not drag the menu along (device, 2026-09-05)', () => {
    /* At rest on the overview. Track 4 was left on the sound bank: arriving
     * there opens its gateway SILENTLY (resting — the 09-03 law). The old
     * follow read that resting screen as "open" and, on the next detent,
     * followed into track 5's MENU — the "kicked into the sound menu" Josh saw
     * only when scrolling fast (slow: the resting screen stood down between
     * detents). Three switches in one tick, no tick between. */
    S.trackActiveBank[4] = 11;           /* BANK_SOUND */
    S.trackActiveBank[5] = 0; S.trackActiveBank[6] = 0;
    S.activeTrack = 3; S.activeBank = S.trackActiveBank[3] = 1;
    editops._switchActiveTrack(4);
    globalThis.tick();                                   /* the resting gateway lands */
    if (!snd.soundOpen() || snd.soundActive()) throw new Error('arrival on a sound-bank track must be a RESTING open, got open=' + snd.soundOpen() + ' active=' + snd.soundActive());
    editops._switchActiveTrack(5);
    editops._switchActiveTrack(6);
    globalThis.tick(); globalThis.tick();
    if (snd.soundActive()) throw new Error('the fast scroll landed in an ACTIVE sound screen — the menu was dragged along');
    if (S.activeTrack !== 6) throw new Error('track ' + S.activeTrack);
    if (S.activeBank !== 0) throw new Error('bank ' + S.activeBank + ' — track 6 was on bank 0');
});

step('⚠ the tick\'s own follow backstop is quiet after a synchronous follow (no double retarget)', () => {
    enterEditor(2);
    editops._switchActiveTrack(3);
    const pa = snd.soundPendingActionForTest();
    if (!pa || pa.t !== 'retarget') throw new Error('expected the retarget action queued once, got ' + JSON.stringify(pa));
    globalThis.tick();
    if (snd.soundPendingActionForTest()) throw new Error('a second action was queued: ' + JSON.stringify(snd.soundPendingActionForTest()));
    snd.soundExit();
});

process.exit(failed);
}
main().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
