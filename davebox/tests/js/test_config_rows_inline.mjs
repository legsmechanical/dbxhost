/* tests/js/test_config_rows_inline.mjs — THE TRACK'S CONFIG ROWS, INLINE.
 *
 * Josh, 2026-09-19: "Move track “config” submenu items to the bottom of the
 * [sound] menu itself with a divider between them and what's now the bottom of
 * the list."
 *
 * They were behind a `Config` door with its own screen, its own row model and
 * its own jog handling. This dissolves the door — so the rows have to keep
 * behaving the way they did on that screen while living in a list that is
 * rebuilt under the cursor.
 *
 * ⚠⚠ DRIVEN BY THE REAL GESTURES (jog, click, Back through soundOnCC), because
 * "the rows are in the array" is exactly the kind of green that says nothing
 * about whether you can edit them. → [[wired-is-not-reachable]]
 *
 * The two that would be silent failures:
 *  · `Mode` PREVIEWS on the jog and only applies on the click. It converts the
 *    track behind a confirm, so a jog passing over Drums must not convert.
 *  · an edit is remembered by ROW KEY, not cursor index. This list rebuilds
 *    (route changes, `names` refreshes) and the row COUNT changes with it, so an
 *    edit held as "row 11" would commit into whatever row 11 became.
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

const ENGINE = {};
globalThis.shadow_get_param = (slot, k) =>
    (typeof k === 'string' && k.indexOf('synth:module') >= 0) ? 'nusaw'
        : (ENGINE[k] !== undefined ? ENGINE[k] : '');
globalThis.shadow_set_param = (slot, k, v) => { ENGINE[k] = String(v); return 1; };
globalThis.shadow_send_midi_to_dsp = () => {};
const SENT = [];
globalThis.host_module_set_param = (k, v) => { SENT.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
for (const fn of ['host_system_cmd', 'host_read_file', 'host_file_exists', 'host_write_file',
                  'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now', 'host_vol_block',
                  'host_edit_cc_block', 'clear_screen', 'print', 'draw_rect', 'fill_rect',
                  'draw_line', 'set_pixel', 'flush_display', 'move_midi_internal_send', 'set_led',
                  'shadow_get_ui_flags', 'host_register_primary', 'host_open_service',
                  'host_close_service', 'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'stipple_rect', 'shadow_get_shift_held'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);

async function main() {
const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
stubParamPagesDevice();
await import('../../ui/ui.js');
const { S: GS } = await import('../../ui/ui_state.mjs');
const snd = await import('../../ui/ui_sound.mjs');
const C = await import('../../ui/ui_constants.mjs');
const B = await import('../../ui/ui_dsp_bridge.mjs');

const VIEW_BLOCKS = 0;
const cc    = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const ticks = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const click = () => { cc(3, 127); cc(3, 0); };
const back  = () => { cc(51, 127); cc(51, 0); };
const jog   = (d) => cc(14, d > 0 ? d : 128 + d);
const kinds = () => snd.soundPickStateForTest().kinds;
const cfgKeys = () => snd.soundCfgRowsForTest();
const edit  = () => snd.soundCfgEditForTest();

/* Open track t's sound MENU and park the cursor on the named config row, by
 * jogging to it exactly as a user would. */
function gotoRow(t, key) {
    snd.soundExit();
    GS.activeTrack = t;
    snd.soundEnter(t, t);
    ticks(3);
    snd.soundShowMenu();
    ticks(2);
    assert(snd.soundPickStateForTest().view === VIEW_BLOCKS, 'the menu did not open');
    /* Jog down until the cursor sits on the wanted row — bounded, and it must
     * actually arrive rather than run out of list. */
    for (let guard = 0; guard < 60; guard++) {
        const st = snd.soundPickStateForTest();
        const row = snd.soundPickRowSpecForTest();
        if (row && row.key === key) return;
        jog(1); ticks(1);
        if (snd.soundPickStateForTest().row === st.row) break;   /* clamped at the end */
    }
    throw new Error('never reached the "' + key + '" row (rows: ' + kinds().join(',') + ')');
}

step('setup: three Schwung tracks and a MIDI one', () => {
    globalThis.init();
    GS.awaitingProjectSelect = false; GS.ledInitComplete = true; GS.sessionView = false;
    for (let i = 0; i < 8; i++) B.applyInstrChoice(i, C.INSTR_SCHWUNG);
    B.applyInstrChoice(4, C.INSTR_MIDI_CH + 2);
    GS.activeTrack = 0;
    /* ⚠ STOPPED. `init()` leaves the transport running in this rig, and a type
     * change is REFUSED while playing — which is correct behaviour that looked
     * exactly like "the commit was dropped" when this test first ran. */
    GS.playing = false;
});

step('⭐ the config rows are the LAST thing in the menu, behind a rule', () => {
    snd.soundExit(); snd.soundEnter(0, 0); ticks(3); snd.soundShowMenu(); ticks(2);
    const k = kinds();
    const firstCfg = k.indexOf('cfg');
    assert(firstCfg > 0, 'no config rows in the menu: ' + k.join(','));
    assert(k[firstCfg - 1] === 'div', 'no rule above the config rows: ' + k.join(','));
    assert(k.slice(firstCfg).every((x) => x === 'cfg'),
           'something sits BELOW the config rows: ' + k.join(','));
    assert(!k.includes('config'), 'the CONFIG door is still there: ' + k.join(','));
    /* The doors it used to sit with are still above it, in their old order. */
    assert(k.indexOf('settings') < firstCfg && k.indexOf('patches') < firstCfg,
           'the rows landed above LFOs/Presets: ' + k.join(','));
});

step('⭐ THE GESTURE: click takes the jog, jogging edits, click gives it back', () => {
    gotoRow(0, 'transpose');
    const spec = snd.soundCfgRowForTest('transpose');
    const before = spec.get();
    assert(!edit().editing, 'the row was already taking the jog');
    click(); ticks(1);
    assert(edit().editing && edit().key === 'transpose', 'the click did not start an edit');
    jog(1); ticks(1);
    assert(spec.get() === before + 1, 'the jog did not change the value: ' + spec.get());
    jog(1); ticks(1);
    assert(spec.get() === before + 2, 'the second detent was lost: ' + spec.get());
    click(); ticks(1);
    assert(!edit().editing, 'the click did not end the edit');
    /* And the cursor moves again rather than the value. */
    const v = spec.get();
    jog(1); ticks(1);
    assert(spec.get() === v, 'the jog still edited after the edit closed');
});

step('⚠ the value CLAMPS at its ends — it must never wrap to the far extreme', () => {
    gotoRow(0, 'transpose');
    const spec = snd.soundCfgRowForTest('transpose');
    click(); ticks(1);
    for (let i = 0; i < 80; i++) { jog(-1); ticks(1); }
    assert(spec.get() === -24, 'did not clamp at the bottom: ' + spec.get());
    jog(-1); ticks(1);
    assert(spec.get() === -24, 'wrapped past the bottom: ' + spec.get());
    click(); ticks(1);
    spec.set(0);
});

step('Back backs out of the VALUE, not out of the menu', () => {
    gotoRow(0, 'transpose');
    click(); ticks(1);
    assert(edit().editing, 'setup: no edit in flight');
    back(); ticks(1);
    assert(!edit().editing, 'Back did not end the edit');
    assert(snd.soundPickStateForTest().view === VIEW_BLOCKS, 'Back left the menu as well');
});

/* ⭐⭐ Mode CONVERTS the track, behind a confirm. Scrolling past a value must
 * not apply it — with the rows inline, a jog through the list passes over them. */
step('⭐⭐ Mode PREVIEWS on the jog and converts nothing until the click', () => {
    gotoRow(0, 'mode');
    const spec = snd.soundCfgRowForTest('mode');
    const was = spec.get();
    SENT.length = 0;
    click(); ticks(1);
    assert(edit().editing && edit().key === 'mode', 'no edit started');
    jog(1); ticks(1);
    assert(spec.get() === was, 'the JOG converted the track — it must only preview');
    assert(edit().preview !== was && edit().preview !== null,
           'nothing was previewed: ' + JSON.stringify(edit()));
    assert(!SENT.some((w) => /convert/.test(w)),
           'a conversion was written on the jog: ' + SENT.filter((w) => /convert/.test(w)).join(','));
    /* Backing out DISCARDS the preview — that is what previewing is for. */
    back(); ticks(1);
    assert(spec.get() === was, 'Back applied the preview anyway: ' + spec.get());
    assert(!edit().editing, 'Back left the edit open');
});

step('⭐⭐ ...and the CLICK is what asks: the conversion confirm comes up', () => {
    gotoRow(0, 'mode');
    const spec = snd.soundCfgRowForTest('mode');
    const was = spec.get();
    click(); ticks(1);
    jog(1); ticks(1);
    const previewed = edit().preview;
    assert(previewed !== was, 'setup: nothing previewed');
    assert(!GS.playing, 'setup: a type change is refused while playing — stop first');
    click(); ticks(2);
    /* ⚠ requestTrackModeChange owns what happens NEXT, and which of its outcomes
     * fires depends on the track: Keys->Drums CONFIRMS when the track holds clip
     * data and otherwise arms a deferred conversion; ->Conductor always confirms;
     * anything refuses while playing. So this pins the one thing that is the
     * click's own job — that the preview was handed ON rather than dropped — and
     * accepts any of those as evidence. Never "nothing happened". */
    const armed = GS.pendingTrackConvert;
    const asked = !!(GS.confirmConvertToDrum || GS.confirmConvertToConduct ||
                     GS.confirmTypeChange || armed || spec.get() !== was);
    assert(asked, 'the click neither asked nor converted — the preview was dropped');
    if (armed) assert(armed.t === 0, 'the conversion was aimed at track ' + armed.t);
    GS.confirmConvertToDrum = null; GS.confirmConvertToConduct = null;
    GS.pendingTrackConvert = null;
    assert(!edit().editing, 'the edit is still open after committing');

    /* ⚠ CONTROL: clicking a row whose value you scrolled BACK to where it
     * started must ask nothing at all — a confirm for a no-op edit is worse than
     * no confirm, because it teaches people to dismiss them. */
    gotoRow(0, 'mode');
    const m2 = snd.soundCfgRowForTest('mode');
    const start = m2.get();
    click(); ticks(1);
    jog(1); ticks(1); jog(-1); ticks(1);
    assert(edit().preview === start, 'the preview did not return to its start: ' + edit().preview);
    click(); ticks(2);
    assert(!GS.confirmConvertToDrum && !GS.confirmConvertToConduct && !GS.pendingTrackConvert,
           'a no-op edit still asked to convert the track');
    assert(m2.get() === start, 'a no-op edit changed the mode');
});

step('⚠ CONTROL: while PLAYING the commit is REFUSED, and nothing is converted', () => {
    GS.playing = true;
    gotoRow(0, 'mode');
    const spec = snd.soundCfgRowForTest('mode');
    const was = spec.get();
    click(); ticks(1); jog(1); ticks(1);
    click(); ticks(2);
    assert(spec.get() === was, 'the track was converted mid-playback: ' + spec.get());
    assert(!GS.pendingTrackConvert, 'a conversion was armed mid-playback');
    assert(!GS.confirmConvertToDrum && !GS.confirmConvertToConduct,
           'a conversion confirm came up mid-playback');
    GS.playing = false;
});

/* ⭐⭐ THE STALE-EDIT HAZARD. The list is rebuilt under the cursor and the row
 * COUNT changes with the route, so an edit remembered as an INDEX would commit
 * into a different row entirely. */
step('⭐⭐ an edit is dropped when its row is no longer under the cursor', () => {
    gotoRow(0, 'velin');
    const velin = snd.soundCfgRowForTest('velin');
    const before = velin.get();
    click(); ticks(1);
    assert(edit().editing && edit().key === 'velin', 'setup: no edit on velin');
    /* Move the cursor off the row WITHOUT closing the edit, the way a rebuild
     * that changes the row count would. */
    snd.soundPickRowSetForTest(0);
    jog(1); ticks(1);
    assert(!edit().editing, 'the edit survived onto another row');
    assert(velin.get() === before, 'VelIn was changed by a jog aimed elsewhere: ' + velin.get());
});

step('a MIDI track carries its own shorter set, and no Parallel row', () => {
    snd.soundExit(); GS.activeTrack = 4; snd.soundEnter(4, 4); ticks(3);
    snd.soundShowMenu(); ticks(2);
    const keys = cfgKeys();
    for (const want of ['mode', 'transpose', 'velin', 'looper'])
        assert(keys.includes(want), 'MIDI track is missing ' + want + ': ' + keys.join(','));
    assert(!keys.includes('parallel'), 'a MIDI track has no chain to parallelise: ' + keys.join(','));
});

step('⚠ CONTROL: a NONE track has no config rows at all, and no stray rule', () => {
    B.applyInstrChoice(5, C.INSTR_NONE);
    snd.soundExit(); GS.activeTrack = 5; snd.soundEnter(5, 5); ticks(3);
    snd.soundShowMenu(); ticks(2);
    const k = kinds();
    /* NONE: the instrument row and Import MIDI (Josh, 2026-09-23: every melodic track imports). */
    assert(k.join(',') === 'trackto,midiimport', 'a NONE track grew rows: ' + k.join(','));
});

if (failed) process.exit(1);
console.log('PASS: test_config_rows_inline.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
