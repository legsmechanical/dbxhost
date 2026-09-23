/* tests/js/test_phrase_browser_gesture.mjs — the phrase library, through the
 * real gestures.
 *
 * Touch K6 on the CLIP / DRUM LANE bank and click the jog: the browser opens.
 * From there: K1 type, K2 style, K3 time, the jog, Shift+click for the
 * preview, pads to place a drum phrase's instruments (on lanes of a drum track,
 * on notes of a melodic one), the load (one engine write), the replace
 * confirm, Back, and the memory of where it was. Asserted on what the engine
 * receives and on what is drawn. → [[wired-is-not-reachable]]
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display',
    'move_midi_internal_send', 'set_led', 'host_open_service', 'host_close_service',
    'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
globalThis.host_write_file = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_get_ui_flags = () => 0;
globalThis.host_register_primary = () => true;
globalThis.shadow_get_shift_held = () => 0;
globalThis.host_seed_module_defaults = () => [0, 0];

const FB = new Uint8Array(128 * 64);
const _px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < 128 && y >= 0 && y < 64) FB[y * 128 + x] = c ? 1 : 0; };
globalThis.clear_screen = () => { FB.fill(0); };
globalThis.print = (x, y, str) => { for (let i = 0; i < String(str).length; i++) _px((x | 0) + i * 6, (y | 0) + 3, 1); };
globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.fill_rect = (x, y, w, h, c) => { for (let j = 0; j < (h | 0); j++) for (let i = 0; i < (w | 0); i++) _px((x | 0) + i, (y | 0) + j, c); };
globalThis.draw_rect = (x, y, w, h, c) => {
    for (let i = 0; i < (w | 0); i++) { _px((x | 0) + i, y | 0, c); _px((x | 0) + i, (y | 0) + (h | 0) - 1, c); }
    for (let j = 0; j < (h | 0); j++) { _px(x | 0, (y | 0) + j, c); _px((x | 0) + (w | 0) - 1, (y | 0) + j, c); }
};
globalThis.set_pixel = _px;

/* ---- a small library: two bass phrases, two hat phrases (one of them with
 * three instruments), served where the module keeps it ---- */
const LIBS = {
    bass: { v: 1, cat: 'bass', phrases: [
        { id: 'bass.a', name: 'ITALO ROOT', g: 'ITALO', bars: 1, mode: 'min', n: '0 0 0 0 100 40;48 0 0 0 90 40;96 4 0 0 90 40' },
        { id: 'bass.b', name: 'OCTAVES', g: '', bars: 1, mode: 'min', n: '0 0 0 0 100 20;24 0 1 0 90 20' },
        { id: 'bass.c', name: 'ITALO OCT', g: 'ITALO', bars: 1, mode: 'min', n: '0 0 0 0 100 20;24 0 1 0 90 20' },
    ] },
    hat: { v: 1, cat: 'hat', phrases: [
        { id: 'hat.a', name: 'HOUSE OFF', g: 'HOUSE', bars: 1, n: '48 100 12;144 100 12;240 100 12;336 100 12' },
        { id: 'hat.b', name: 'HATS 3', g: 'HOUSE', bars: 1, pads: [42, 46, 44],
          n: '0 90 12 42;48 100 24 46;96 80 12 42;144 70 12 44;192 90 12 42' },
    ] },
};
let files = {};
globalThis.host_file_exists = (p) => Object.prototype.hasOwnProperty.call(files, p);
globalThis.host_read_file = (p) => files[p] || '';

const writes = [];
let ctxTag = 'init';
globalThis.host_module_set_param = (k, v) => { writes.push([ctxTag, String(k), String(v)]); };
globalThis.host_module_set_params = () => true;
globalThis.shadow_set_param = (slot, k, v) => { writes.push([ctxTag, 'slot' + slot + ':' + String(k), String(v)]); return 1; };
globalThis.host_module_get_param = () => '';

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const PB = await import('../../ui/ui_phrase_browser.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');
    for (const [cat, doc] of Object.entries(LIBS)) files[PB.PB_SHIPPED_DIR + '/' + cat + '.json'] = JSON.stringify(doc);

    function ticks(n) {
        for (let i = 0; i < n; i++) {
            S.tickCount++; S.clockMs += 11;
            ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
        }
    }
    const midi = (a, b, c) => { const p = ctxTag; ctxTag = 'midi(' + a + ',' + b + ')'; globalThis.onMidiMessageInternal(new Uint8Array([a, b, c])); ctxTag = p; };
    const cc = (d1, d2) => midi(0xB0, d1, d2);
    const touch = (k, on) => midi(on ? 0x90 : 0x80, k, on ? 127 : 0);
    const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
    const shiftClick = () => { cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0); ticks(2); };
    const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
    const turn = (k, detents) => { for (let i = 0; i < Math.abs(detents); i++) cc(71 + k, detents > 0 ? 1 : 127); ticks(1); };
    const jog = (n) => { for (let i = 0; i < Math.abs(n); i++) cc(14, n > 0 ? 1 : 127); ticks(1); };
    const pad = (i) => { midi(0x90, 68 + i, 100); midi(0x80, 68 + i, 0); ticks(1); };
    const ink = (y0, y1) => { globalThis.clear_screen(); render.drawUI(); let n = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) n += FB[y * 128 + x]; return n; };
    const pb = () => PB.pbStateForTest();
    const since = (n, re) => writes.slice(n).filter(w => re.test(w[1]));
    function openOn(track) {
        S.activeTrack = track; S.activeBank = 0; S.sessionView = false;
        ticks(2);
        touch(5, true); click(); touch(5, false); ticks(2);
    }

    step('setup: track 2 melodic, track 1 drums', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.trackPadMode[1] = 0; S.trackPadMode[0] = 1;   /* PAD_MODE_DRUM = 1 */
        S.padKey = 0; S.padScale = 1;                     /* C minor: the phrases' own key */
        ticks(8);
    });

    step('a click alone, or with K4 (Legato) touched, does not open it; K6 touched + click does', () => {
        S.activeTrack = 1; S.activeBank = 0; ticks(2);
        click();
        assert(!PB.pbActive(), 'a bare click opened the browser');
        touch(3, true); click(); touch(3, false); ticks(1);
        assert(!PB.pbActive(), 'K4 + click opened the browser');
        openOn(1);
        assert(PB.pbActive(), 'K6 touch + click did not open the browser');
        assert(pb().cats.join(',') === 'bass,hat', 'categories on a melodic track: ' + pb().cats);
        assert(ink(30, 55) > 0, 'the browser drew no phrase name or roll');
    });

    step('K6 on the CLIP bank shows the Phrases trigger, and the footer says CLK PHRASES while touched', () => {
        back(); ticks(2);
        assert(!PB.pbActive(), 'Back did not close');
        S.activeTrack = 1; S.activeBank = 0; ticks(1);
        touch(5, true); ticks(1);
        const hints = render.bankPageHints(0);
        touch(5, false); ticks(1);
        assert(JSON.stringify(hints) === '[["CLK","PHRASES"]]', 'hints: ' + JSON.stringify(hints));
    });

    step('stopped: the preview plays the phrase alone, through the track (audition)', () => {
        S.playing = false;
        const n = writes.length;
        openOn(1);
        ticks(30);
        const au = since(n, /^t1_audition$/);
        assert(au.length && au.some(w => /on 36 100/.test(w[2])), 'no audition of the root: ' + JSON.stringify(au.slice(0, 3)));
        assert(au.every(w => /^tick#/.test(w[0])), 'an audition was sent outside a tick');
        assert(!since(n, /_import$/).length, 'something was written');
    });

    step('playing: the preview goes into the clip in time (audclip), and follows the jog and K3', () => {
        S.playing = true; S.trackClipPlaying[1] = true;
        let n = writes.length;
        ticks(3);
        let ac = since(n, /^t1_audclip$/);
        assert(ac.length === 1 && /^1 16 -1\|a 0 36 100 40;a 48 36 90 40;a 96 43 90 40$/.test(ac[0][2]),
               'audclip: ' + JSON.stringify(ac));
        n = writes.length;
        jog(1); ticks(2);
        ac = since(n, /^t1_audclip$/);
        assert(ac.length === 1 && /-1\|a 0 36 100 20;a 24 48 90 20$/.test(ac[0][2]), 'jog: ' + JSON.stringify(ac));
        n = writes.length;
        turn(2, 12); ticks(2);
        ac = since(n, /^t1_audclip$/);
        assert(pb().time === 4 && ac.length === 1 && /^2 16 -1\|a 0 36 100 40;a 48 48 90 40$/.test(ac[0][2]),
               'K3 x2: ' + JSON.stringify(ac));
    });

    step('the jog opens the phrase picker over the page; it moves the phrase, click picks, Back closes it', () => {
        jog(-1); ticks(1);
        assert(pb().picker && pb().idx === 0, 'the jog did not open the picker at the phrase before');
        assert(ink(12, 54) > 0, 'the picker drew nothing');
        const n = writes.length;
        jog(1); ticks(2);
        assert(pb().picker && pb().idx === 1, 'jog in the picker did not move');
        assert(since(n, /^t1_audclip$/).length === 1, 'the preview did not follow the picker');
        click();
        assert(!pb().picker && PB.pbActive() && !since(n, /_import$/).length, 'click in the picker loaded or closed the browser');
        jog(1); back();
        assert(!pb().picker && PB.pbActive(), 'Back in the picker left the browser');
    });

    step('the picker stays while the jog is touched and goes half a second after it is let go', () => {
        midi(0x90, 9, 127); jog(1); ticks(1);
        assert(pb().picker, 'the jog did not open the picker');
        ticks(80);
        assert(pb().picker, 'the picker closed while the jog was still touched');
        midi(0x80, 9, 0); ticks(20);
        assert(pb().picker, 'the picker closed before half a second');
        ticks(40);
        assert(!pb().picker && PB.pbActive(), 'the picker did not go ~0.5 s after the jog was let go');
    });

    step('the picker lists every phrase of the type; K2 Style jumps to where a style starts', () => {
        assert(pb().list.map(p => p.id).join(',') === 'bass.a,bass.c,bass.b' && pb().styles.join(',') === 'ITALO,BASIC',
               'list/styles: ' + pb().list.map(p => p.id) + ' / ' + pb().styles);
        turn(1, -12); ticks(1);
        assert(pb().idx === 0, 'K2 left did not jump to ITALO');
        turn(1, 12); ticks(1);
        assert(pb().idx === 2 && pb().list[2].id === 'bass.b', 'K2 right did not jump to where BASIC starts: ' + pb().idx);
        turn(1, -12); ticks(2);
    });

    step('K4 Octave on a melodic track: the preview and the load move by octaves', () => {
        const n = writes.length;
        turn(3, 12); ticks(2);
        assert(pb().octave === 1, 'octave ' + pb().octave);
        const ac = since(n, /^t1_audclip$/);
        assert(ac.length && /\|a 0 48 100 /.test(ac[ac.length - 1][2]), 'preview not an octave up: ' + JSON.stringify(ac.slice(-1)));
        turn(3, -12); ticks(2);
        assert(pb().octave === 0, 'octave back ' + pb().octave);
    });

    step('Shift+click stops the preview (the clip is put back) and starts it again', () => {
        let n = writes.length;
        shiftClick(); ticks(2);
        assert(since(n, /^t1_audclip$/).some(w => w[2] === 'off'), 'no audclip off');
        n = writes.length;
        shiftClick(); ticks(2);
        assert(since(n, /^t1_audclip$/).some(w => /-1\|/.test(w[2])), 'the preview did not come back');
    });

    step('K5-K8 and the step buttons do nothing under the browser', () => {
        const n = writes.length, idx = pb().idx;
        const bp = JSON.stringify(S.bankParams[1][0]), dq = S.drumInpQuant[1], sf = JSON.stringify(S.clipSeqFollow[1]);
        for (const k of [4, 5, 6, 7]) { touch(k, true); turn(k, 20); touch(k, false); ticks(1); }   /* a real turn is touched */
        assert(JSON.stringify(S.bankParams[1][0]) === bp && S.drumInpQuant[1] === dq &&
               JSON.stringify(S.clipSeqFollow[1]) === sf, 'a K5-K8 turn reached the CLIP bank underneath');
        midi(0x90, 16, 127); midi(0x80, 16, 0); ticks(2);
        /* The tick's pad-map re-check writes t1_padmap whenever the (stubbed)
         * engine's answer disagrees — a sync, not an edit. */
        const stray = writes.slice(n).filter(w => !/^t1_audclip$|^t1_audition$|^t1_padmap$|^slot\d:slot:parallel$/.test(w[1]));
        assert(!stray.length, 'writes: ' + JSON.stringify(stray.slice(0, 4)));
        assert(pb().idx === idx && PB.pbActive(), 'the selection moved or the browser closed');
    });

    step('a drum phrase on a melodic track: pads set each instrument\'s NOTE, heard at once', () => {
        turn(0, 12); ticks(2);
        assert(pb().cats[pb().catIdx] === 'hat', 'K1 did not reach HAT');
        jog(1); click(); ticks(2);
        assert(pb().voices.length === 3 && pb().assign.join(',') === '42,46,44', 'defaults: ' + pb().assign);
        turn(4, 6); ticks(1);
        assert(pb().voiceSel === 1, 'K5 did not pick the voice on a melodic track');
        turn(4, -6); ticks(1);
        assert(pb().voiceSel === 0 && pb().octave === 0, 'K5 back');
        /* the pad's own note, as the track's pad map lays it out */
        const pi = 9, note = S.padNoteMap[pi] + (S.trackOctave[1] | 0) * 12;
        assert(S.padNoteMap[pi] !== 0xFF && !pb().assign.includes(note), 'precondition: pad ' + pi + ' plays ' + note);
        const n = writes.length;
        pad(pi); ticks(2);
        assert(pb().assign[0] === note && pb().voiceSel === 1, 'tap did not assign + advance: ' + pb().assign + ' sel ' + pb().voiceSel);
        const ac = since(n, /^t1_audclip$/);
        assert(ac.length && new RegExp(' ' + note + ' 90 ').test(ac[ac.length - 1][2]), 'the preview did not follow the tap: ' + JSON.stringify(ac));
        const colors = PB.pbPadColors();
        assert(colors && colors[pi] !== 0, 'the assigned pad is dark');
        globalThis.__pbNote = note;
    });

    step('load into an empty clip: one import, the automation clear behind it, and the browser closes', () => {
        S.clipNonEmpty[1][S.trackActiveClip[1]] = false;
        const n = writes.length;
        click(); ticks(4);
        const imp = since(n, /^t1_c\d+_import$/);
        assert(imp.length === 1 && /^0 2 16\|/.test(imp[0][2]), 'import: ' + JSON.stringify(imp));
        assert(new RegExp('a 0 ' + globalThis.__pbNote + ' 90 24').test(imp[0][2]), 'the tapped note was not written');
        const later = writes.slice(writes.indexOf(imp[0]));
        assert(later.some(w => w[1] === 't1_pa_clear'), 'no automation clear after the load');
        assert(!PB.pbActive(), 'the browser stayed open');
        assert(S.actionPopupLines && S.actionPopupLines[0] === 'LOADED', 'no LOADED popup');
    });

    step('it reopens where it was (same category, style, time and phrase)', () => {
        openOn(1);
        assert(pb().cats[pb().catIdx] === 'hat' && pb().list[pb().idx].id === 'hat.b' && pb().time === 4,
               'memory: ' + JSON.stringify({ cat: pb().cats[pb().catIdx], id: pb().list[pb().idx].id, time: pb().time }));
    });

    step('replacing a clip with notes asks first: Back says no, click says yes', () => {
        S.clipNonEmpty[1][S.trackActiveClip[1]] = true;
        let n = writes.length;
        click(); ticks(2);
        assert(pb().confirm && !since(n, /_import$/).length, 'no confirm, or it wrote');
        back();
        assert(PB.pbActive() && !pb().confirm, 'Back left the browser instead of the confirm');
        click(); click(); ticks(3);
        const imp = since(n, /^t1_c\d+_import$/);
        assert(imp.length === 1 && /^1 /.test(imp[0][2]), 'replace import: ' + JSON.stringify(imp));
    });

    step('Back leaves without writing, and the clip is put back', () => {
        openOn(1);
        ticks(3);
        const n = writes.length;
        back(); ticks(2);
        assert(!PB.pbActive(), 'still open');
        assert(since(n, /^t1_audclip$/).some(w => w[2] === 'off'), 'no audclip off');
        assert(!since(n, /_import$/).length, 'Back wrote');
        /* and it remembers where it was when left by Back */
        openOn(1); jog(-1); click(); ticks(2);
        const id = pb().list[pb().idx].id;
        back(); openOn(1);
        assert(pb().list[pb().idx].id === id, 'Back forgot the phrase: ' + pb().list[pb().idx].id + ' vs ' + id);
        back();
    });

    step('a drum track: drum types only; several instruments on several lanes, taps move them, ONE load', () => {
        S.trackClipPlaying[0] = true;
        S.activeDrumLane[0] = 3; S.drumLanePage[0] = 0;
        for (let l = 0; l < 32; l++) { S.drumLaneNote[0][l] = 36 + l; S.drumLaneHasNotes[0][l] = false; }
        openOn(0);
        assert(pb().cats.join(',') === 'hat', 'drum categories: ' + pb().cats);
        jog(1); click(); ticks(3);
        /* 42 → the lane opened on (3); 46 → lane 10 plays 46; 44 → lane 8 plays 44 */
        assert(pb().assign.join(',') === '3,10,8', 'default lanes: ' + pb().assign);
        let ac = since(0, /^t0_audclip$/);
        assert(ac.length && /^1 16 -2\|L3;.*;L8;.*;L10;/.test(ac[ac.length - 1][2]), 'lanes preview: ' + JSON.stringify(ac.slice(-1)));
        /* pad 5 = row 0, col 5 → a velocity pad: ignored; pad 1 → lane 1 */
        pad(5);
        assert(pb().assign[0] === 3, 'a right-hand pad assigned');
        pad(1); ticks(3);
        assert(pb().assign[0] === 1 && pb().voiceSel === 1, 'pad 1 did not take the first instrument');
        ac = since(0, /^t0_audclip$/);
        assert(/-2\|L1;/.test(ac[ac.length - 1][2]), 'the preview did not move to lane 1');
        const n = writes.length;
        click(); ticks(4);
        const imp = since(n, /import$/);
        assert(imp.length === 1 && imp[0][1] === 't0_lanes_import' && /^0 1 16\|L1;.*L8;.*L10;/.test(imp[0][2]),
               'drum load: ' + JSON.stringify(imp));
    });

    step('a Conductor track refuses, and says why', () => {
        S.trackPadMode[2] = 2;   /* PAD_MODE_CONDUCT */
        openOn(2);
        assert(!PB.pbActive(), 'opened on a Conductor');
        assert(S.actionPopupLines && S.actionPopupLines[1] === 'NOT ON CONDUCTOR', 'popup: ' + JSON.stringify(S.actionPopupLines));
    });

    if (failed) { console.error('FAIL: phrase browser gestures'); process.exit(1); }
    console.log('PASS: phrase browser gestures');
}
main().catch(e => { console.error(e); process.exit(1); });
