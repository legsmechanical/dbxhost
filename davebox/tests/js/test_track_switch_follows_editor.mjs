/* tests/js/test_track_switch_follows_editor.mjs — ITEM 20 (Josh, 2026-09-05:
 * "Yes, follow into the editor"). A track switch made from INSIDE a module
 * editor lands in the NEW track's editor, route-aware; from every other sound
 * screen the 08-24 close still applies; outside sound mode nothing opens.
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

const VIEW_BLOCKS = 0, VIEW_EDIT = 1, VIEW_PROMPT = 18;   /* ui_sound's own numbering */
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
    if (S.trackActiveBank[3] !== BANK_SOUND) throw new Error('the new track is not RECORDED on the sound bank');
});

step('...and the sequencer underneath is untouched', () => {
    if (S.playing !== true) throw new Error('transport changed');
    if (S.clipSteps[3][0][0] !== 1) throw new Error('a clip step changed');
});

step('⭑ Schwung → MIDI: lands on the MIDI track\'s MENU (Instrument + Config), never the parked chain\'s editor', () => {
    editops._switchActiveTrack(4);
    if (!snd.soundOpen() || snd.soundTrack() !== 4) throw new Error('did not follow');
    globalThis.tick();
    if (view() !== VIEW_BLOCKS) throw new Error('view ' + view() + ' — a MIDI track has no editor to be in');
    if (kinds() !== 'trackto,config') throw new Error('rows: ' + kinds());
});

step('⚠ from that MENU a further switch CLOSES (the 08-24 rule stands off the editor)', () => {
    editops._switchActiveTrack(2);
    if (snd.soundOpen()) throw new Error('followed from a menu — every track scrolled onto would report SOUND + CONFIG');
    if (S.activeBank !== S.trackActiveBank[2]) throw new Error('the new track did not land on its own bank');
});

step('⭑ Schwung → NONE: lands on the Instrument-only menu', () => {
    enterEditor(2);
    editops._switchActiveTrack(5);
    if (!snd.soundOpen() || snd.soundTrack() !== 5) throw new Error('did not follow');
    globalThis.tick();
    if (view() !== VIEW_BLOCKS || kinds() !== 'trackto') throw new Error('view ' + view() + ' rows ' + kinds());
    snd.soundExit();
});

step('⭑ Schwung → Move: lands on the Move track\'s bus (its prompt), not the sequencer', () => {
    enterEditor(2);
    editops._switchActiveTrack(6);
    if (!snd.soundOpen() || snd.soundTrack() !== 6) throw new Error('did not follow');
    if (snd.soundIsGlobal()) throw new Error('landed on a GLOBAL bus');
    if (view() !== VIEW_PROMPT) throw new Error('view ' + view() + ', expected the bus prompt');
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
