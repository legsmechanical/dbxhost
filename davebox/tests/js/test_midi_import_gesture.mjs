/* tests/js/test_midi_import_gesture.mjs — Import MIDI, through the real gestures.
 *
 * Shift+Note opens the sound menu; the jog walks to "Import MIDI"; a click
 * opens it. From there: the file browser (MIDI files and folders only, the
 * install's own folders hidden), a part, the options page on K1-K4, the
 * preview, the confirm when one is due, and the ONE engine write. Asserted on
 * what the engine receives, from which callback, and on what is drawn.
 * → [[wired-is-not-reachable]]: a green pin says "wired", only the gesture
 * says "reachable".
 */
import './_bulk_get_stub.mjs';

let failed = 0;
function ok(l) { console.log(`  ok   — ${l}`); }
function bad(l, e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(l, fn) { try { fn(); ok(l); } catch (e) { bad(l, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

for (const fn of ['host_system_cmd', 'host_ensure_dir', 'host_remove_dir', 'shadow_save_state_now',
    'host_vol_block', 'host_edit_cc_block', 'stipple_rect', 'draw_line', 'flush_display',
    'move_midi_internal_send', 'set_led', 'host_open_service', 'host_close_service',
    'host_ext_midi_remap_clear', 'host_ext_midi_remap_set', 'host_ext_midi_remap_enable', 'host_send_midi',
    'move_midi_inject_to_move'])
    globalThis[fn] = () => 0;
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => 1;
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

/* ---- a MIDI file, byte by byte: format 1, a tempo track, Lead and Bass ---- */
function vlq(n) { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; }
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];
function track(ev) { const b = []; for (const [dt, ...x] of ev) b.push(...vlq(dt), ...x); b.push(0, 0xff, 0x2f, 0); return chunk('MTrk', b); }
const nameEv = (s) => [0, 0xff, 0x03, s.length, ...ascii(s)];
/* Lead: a quarter note on every beat for 8 bars (32 notes); Bass: one per bar. */
const lead = [nameEv('Lead')];
for (let i = 0; i < 32; i++) lead.push([0, 0x90, 60 + (i % 12), 100], [96, 0x80, 60 + (i % 12), 0]);
const bass = [nameEv('Bass')];
for (let i = 0; i < 8; i++) bass.push([0, 0x91, 36, 90], [384, 0x81, 36, 0]);
const SONG = Uint8Array.from([...chunk('MThd', [0, 1, 0, 3, 0, 96]),
    ...track([[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]), ...track(lead), ...track(bass)]);
/* Drums: pitch 36 (a pad) and 20 (no pad) */
const DRUMS = Uint8Array.from([...chunk('MThd', [0, 0, 0, 1, 0, 96]),
    ...track([[0, 0x99, 36, 100], [24, 0x89, 36, 0], [0, 0x99, 20, 100], [24, 0x89, 20, 0]])]);

const DIR = 0o040000, REG = 0o100000;
globalThis.__stubStat = {
    '/data/UserData/UserLibrary': { mode: DIR, size: 0 },
    '/data/UserData/schwung': { mode: DIR, size: 0 },
    '/data/UserData/dbx-host': { mode: DIR, size: 0 },
    '/data/UserData/song.mid': { mode: REG, size: SONG.length },
    '/data/UserData/beat.mid': { mode: REG, size: DRUMS.length },
    '/data/UserData/notes.txt': { mode: REG, size: 10 },
};
globalThis.__stubStdBinFiles = { '/data/UserData/song.mid': SONG, '/data/UserData/beat.mid': DRUMS };

/* The engine: records every write and answers the clip reads the import's
 * settle step makes, once the import key has arrived. */
const writes = [];
let ctxTag = 'init';
const landed = new Set();
globalThis.host_module_set_param = (k, v) => {
    writes.push([ctxTag, String(k), String(v)]);
    const m = /^t(\d)_c(\d+)_import$/.exec(String(k));
    if (m) landed.add(m[1] + ':' + m[2]);
};
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = (k) => {
    const m = /^t(\d)_c(\d+)_(steps|drum_has_content)$/.exec(String(k));
    if (m && landed.has(m[1] + ':' + m[2])) return m[3] === 'steps' ? '1' + '0'.repeat(255) : '1';
    return '';
};

async function main() {
    const { stubParamPagesDevice } = await import('./stubs/param_pages_device.mjs');
    stubParamPagesDevice();
    const osStub = await import('os');
    osStub.__setReaddir({ '/data/UserData': ['UserLibrary', 'schwung', 'dbx-host', 'song.mid', 'beat.mid', 'notes.txt', '.hidden'],
                          '/data/UserData/UserLibrary': [] });
    await import('../../ui/ui.js');
    const { S } = await import('../../ui/ui_state.mjs');
    const snd = await import('../../ui/ui_sound.mjs');
    const MI = await import('../../ui/ui_midi_import.mjs');
    const tickmod = await import('../../ui/ui_tick.mjs');
    const render = await import('../../ui/ui_render.mjs');
    const { MoveNoteSession, PAD_MODE_CONDUCT } = await import('../../ui/ui_constants.mjs');
    const { MoveShift } = await import('/data/UserData/schwung/shared/constants.mjs');

    function ticks(n) {
        for (let i = 0; i < n; i++) {
            S.tickCount++; S.clockMs += 11;
            ctxTag = 'tick#' + S.tickCount; tickmod._tickImpl(); ctxTag = 'between';
        }
    }
    const cc = (d1, d2) => { const p = ctxTag; ctxTag = 'cc(' + d1 + ',' + d2 + ')'; globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2])); ctxTag = p; };
    const click = () => { cc(3, 127); cc(3, 0); ticks(2); };
    const shiftClick = () => { cc(MoveShift, 127); cc(3, 127); cc(3, 0); cc(MoveShift, 0); ticks(2); };
    const back = () => { cc(51, 127); cc(51, 0); ticks(2); };
    const turn = (k, detents) => { for (let i = 0; i < Math.abs(detents); i++) cc(71 + k, detents > 0 ? 1 : 127); ticks(1); };
    const ink = (y0, y1) => { globalThis.clear_screen(); render.drawUI(); let n = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < 128; x++) n += FB[y * 128 + x]; return n; };
    const mi = () => MI.miStateForTest();

    function openMenuOn(track) {
        /* Setup, not the gesture under test: leave any menu still open on the
         * previous track before choosing the next one. */
        snd.soundExit(); ticks(2);
        S.activeTrack = track;
        cc(MoveShift, 127); cc(MoveNoteSession, 127); cc(MoveNoteSession, 0); cc(MoveShift, 0);
        ticks(6);
        /* A track remembered on the sound BANK lands on its door (the prompt);
         * the click there opens the menu, as on the device. */
        if (process.env.MI_DEBUG) console.log('   [menu] view after open', snd.soundPickStateForTest().view, 'bank', S.activeBank);
        if (snd.soundPickStateForTest().view === 18) click();
        if (process.env.MI_DEBUG) console.log('   [menu] view after click', snd.soundPickStateForTest().view);
    }
    function jogToImport() {
        for (let g = 0; g < 40; g++) {
            const st = snd.soundPickStateForTest();
            if (st.kinds[st.row] === 'midiimport') return;
            cc(14, 1); ticks(1);
        }
        throw new Error('no Import MIDI row: ' + JSON.stringify(snd.soundPickStateForTest().kinds));
    }
    function openImport(track) {
        openMenuOn(track);
        jogToImport();
        click(); ticks(2);
        assert(mi() && snd.soundPickStateForTest().view === 40, 'the click did not open Import MIDI');
    }
    function pickFile(name) {
        const b = mi().browser;
        const i = b.items.findIndex(it => it.label === name);
        assert(i >= 0, name + ' not listed: ' + JSON.stringify(b.items.map(x => x.label)));
        while (mi().browser.selectedIndex < i) cc(14, 1);
        while (mi().browser.selectedIndex > i) cc(14, 127);
        click(); ticks(3);
    }

    step('setup: track 2 melodic, routed to Move', () => {
        globalThis.init();
        S.awaitingProjectSelect = false; S.ledInitComplete = true; S.sessionView = false;
        S.trackRoute[1] = 1; S.trackPadMode[1] = 0; S.trackChannel[1] = 2;
        ticks(8);
    });

    step('the sound menu offers Import MIDI, and the click opens it — stopping playback first', () => {
        S.playing = true;
        const before = writes.length;
        openImport(1);
        const stop = writes.slice(before).find(w => w[1] === 'transport');
        assert(stop && stop[2] === 'stop', 'no transport stop was sent');
        assert(/^tick#/.test(stop[0]), 'the stop was not sent from a tick: ' + stop[0]);
        S.playing = false;
    });

    step('the browser lists folders and MIDI files only, with the install hidden', () => {
        const labels = mi().browser.items.map(it => it.label);
        assert(labels.includes('[UserLibrary]') && labels.includes('song.mid') && labels.includes('beat.mid'),
               'missing entries: ' + JSON.stringify(labels));
        for (const h of ['[schwung]', '[dbx-host]', 'notes.txt', '.hidden'])
            assert(!labels.includes(h), h + ' is listed');
        assert(ink(12, 55) > 0, 'the file list drew nothing');
    });

    step('picking a two-part file lists its parts, with a miniature of the selected one', () => {
        pickFile('song.mid');
        assert(mi().stage === 'tracks', 'stage is ' + mi().stage);
        assert(mi().result.parts.map(p => p.name).join(',') === 'Lead,Bass', 'parts: ' + mi().result.parts.map(p => p.name));
        assert(ink(42, 53) > 0, 'no note roll in the band under the list');
    });

    step('Shift+click previews through tN_audition — never live_notes — and again stops it', () => {
        const before = writes.length;
        shiftClick(); S.clockMs += 700; ticks(4);
        const aud = writes.slice(before).filter(w => w[1] === 't1_audition');
        assert(aud.some(w => /\bon \d+ \d+/.test(w[2])), 'no audition note-on: ' + JSON.stringify(writes.slice(before)));
        assert(!writes.slice(before).some(w => w[1] === 't1_live_notes'), 'the preview went through live_notes');
        const mid = writes.length;
        shiftClick(); ticks(2);
        assert(writes.slice(mid).some(w => w[1] === 't1_audition' && /alloff/.test(w[2])), 'stopping sent no alloff');
    });

    step('the options page: K1-K4 on Start / Bars / Grid / To; the destination is the empty current clip', () => {
        click();
        assert(mi().stage === 'opts', 'stage is ' + mi().stage);
        assert(mi().choices[mi().toIdx] === S.trackActiveClip[1], 'default destination is not the current clip');
        assert(mi().bars === 8 && mi().startBar === 1 && mi().grid === 1, 'defaults: ' + [mi().bars, mi().startBar, mi().grid]);
        assert(ink(34, 53) > 0, 'no roll on the options page');
        turn(0, 6);
        assert(mi().startBar === 2, 'K1 did not step the start bar after 6 detents: ' + mi().startBar);
        turn(0, -6);
        turn(2, 11);
        assert(mi().grid === 1, 'K3 moved before 12 detents');
        turn(2, 1);
        assert(mi().grid === 2, 'K3 did not step the grid at 12 detents');
        turn(2, -12);
    });

    step('K5-K8 are claimed: turning them changes nothing and writes nothing', () => {
        const before = writes.length;
        const snap = JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().toIdx]);
        turn(4, 20); turn(7, -20);
        assert(JSON.stringify([mi().startBar, mi().bars, mi().grid, mi().toIdx]) === snap, 'K5/K8 changed an option');
        assert(snd.soundPickStateForTest().view === 40, 'the screen changed');
        assert(!writes.slice(before).some(w => w[0].startsWith('cc(7')), 'a knob wrote to the engine');
    });

    step('fewer bars than the part → notes CUT, and the click asks first; Back declines', () => {
        turn(1, -36);                                  /* 8 → 2 bars */
        assert(mi().bars === 2 && mi().plan.cut > 0, 'no cut: ' + mi().bars + ' ' + mi().plan.cut);
        click();
        assert(mi().stage === 'confirm', 'no confirm with notes cut');
        back();
        assert(mi().stage === 'opts', 'Back did not return to the options');
        turn(1, 36);
    });

    step('nothing cut, empty clip → the click imports at once: ONE write, from a tick', () => {
        const before = writes.length;
        click(); ticks(8);
        const imp = writes.slice(before).filter(w => /_import$/.test(w[1]));
        assert(imp.length === 1, 'import writes: ' + imp.length);
        const [ctx, key, val] = imp[0];
        assert(/^tick#/.test(ctx), 'written from ' + ctx);
        assert(key === 't1_c' + S.trackActiveClip[1] + '_import', 'key ' + key);
        const [head, body] = val.split('|');
        assert(head === '0 1 128', 'header ' + head + ' (want: no replace, 1/16, 8 bars = 128 steps)');
        assert(body.split(';').length === 32, 'notes sent: ' + body.split(';').length);
        assert(/^a 0 60 100 96$/.test(body.split(';')[0]), 'first note ' + body.split(';')[0]);
        assert(!mi() && snd.soundPickStateForTest().view === 0, 'the screen did not close back to the menu');
    });

    step('a current clip with notes is offered as a REPLACE, behind a confirm', () => {
        const cur = S.trackActiveClip[1];
        S.clipNonEmpty[1][cur] = true;
        openImport(1);
        pickFile('song.mid');
        click();                                        /* Lead → options */
        assert(mi().choices[mi().toIdx] !== cur, 'a non-empty current clip was the default');
        while (mi().choices[mi().toIdx] !== cur) turn(3, mi().toIdx > mi().choices.indexOf(cur) ? -12 : 12);
        click();
        assert(mi().stage === 'confirm', 'replacing did not ask');
        globalThis.clear_screen(); render.drawUI();
        const before = writes.length;
        click(); ticks(8);
        const imp = writes.slice(before).find(w => /_import$/.test(w[1]));
        assert(imp && imp[2].startsWith('1 '), 'the replace flag is not set: ' + (imp && imp[2].slice(0, 12)));
    });

    step('a drum track: pitches with no pad are counted, the write goes to the drum track', () => {
        S.trackRoute[0] = 1; S.trackPadMode[0] = 1;
        openImport(0);
        pickFile('beat.mid');
        assert(mi().stage === 'opts', 'a one-part file should go straight to the options: ' + mi().stage);
        assert(mi().plan.noPad === 1, 'no-pad count ' + mi().plan.noPad);
        const before = writes.length;
        click(); ticks(8);
        const imp = writes.slice(before).find(w => /^t0_c\d+_import$/.test(w[1]));
        assert(imp, 'no drum import write');
    });

    step('Back walks out a stage at a time, and closing releases the preview', () => {
        openImport(1);
        pickFile('song.mid');
        shiftClick(); S.clockMs += 300; ticks(3);
        const before = writes.length;
        back();                                         /* tracks → files */
        assert(mi().stage === 'files', 'stage ' + mi().stage);
        assert(writes.slice(before).some(w => w[1] === 't1_audition' && /alloff/.test(w[2])), 'Back left the preview sounding');
        back();                                         /* files → menu */
        assert(!mi() && snd.soundPickStateForTest().view === 0, 'Back from the files did not close');
    });

    step('a Conductor track has no Import MIDI row', () => {
        S.trackPadMode[2] = PAD_MODE_CONDUCT; S.trackRoute[2] = 1;
        openMenuOn(2);
        assert(!snd.soundPickStateForTest().kinds.includes('midiimport'), 'Conductor offers Import MIDI');
    });

    if (failed) { console.error('test_midi_import_gesture: FAIL'); process.exit(1); }
    console.log('test_midi_import_gesture: PASS');
}
main().catch(e => { console.error(e); process.exit(1); });
