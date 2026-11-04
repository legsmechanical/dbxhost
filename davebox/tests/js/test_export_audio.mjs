import './_bulk_get_stub.mjs';
/* tests/js/test_export_audio.mjs — an Audio track exports as a Live audio
 * track, in the shape Move writes itself (captured from a set made on the Move
 * with an audio track): `kind: "audio"`, clips naming their sample, region and
 * loop in BEATS, and `warping.tempoAfterLastMarker` = the sample's own tempo.
 * Each clip is its export take (ui_export pollExportFlatten): bundled under a
 * readable name, warped at the tempo it was recorded at (its ticks over its
 * frames — exact), its sound already in it. Its volume / pan automation is in
 * the take, so it is not written again; its sends are.
 * Built on the real path (buildTrack). CONTROL: a clip with no take is an
 * empty slot; a non-Audio track is still MIDI and keeps its volume lane. */
let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }
const near = (a, b) => Math.abs(a - b) < 1e-4;

for (const fn of ['host_system_cmd','host_file_exists','host_write_file',
                  'host_ensure_dir','host_remove_dir','host_module_set_param',
                  'shadow_get_param','shadow_set_param','host_vol_block','host_edit_cc_block',
                  'clear_screen','print','fill_rect','stipple_rect','set_pixel','text_width',
                  'move_midi_internal_send','set_led','host_ext_midi_remap_clear',
                  'host_ext_midi_remap_set','host_ext_midi_remap_enable'])
    globalThis[fn] = () => (fn.indexOf('get') >= 0 || fn.indexOf('width') >= 0 ? '' : 0);
globalThis.host_module_get_param = (k) => (/_export/.test(k) ? '0 0 0' : '');
globalThis.host_ui_publish = () => false;   /* the Screen view: nobody watching */
globalThis.host_read_file = () => '';
const TAKES = '/data/UserData/daveboxSA/davebox-exports/takes';

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const { S } = await import('../../ui/ui_state.mjs');
const { PAD_MODE_AUDIO } = await import('../../ui/ui_constants.mjs');
for (let t = 0; t < 8; t++) { S.trackPadMode[t] = 0; S.trackRoute[t] = 0; S.trackChannel[t] = t + 1; }
S.trackPadMode[4] = PAD_MODE_AUDIO;
/* clip 0: 1 bar recorded at 120 (88200 frames); clip 1: 1.5 bars at 132.3
 * (576 ticks over 120000 frames — not a round tempo); clip 2: no take. */
const takes = {
    '4_0': { t: 4, c: 0, ticks: 384, nframes: 88200, path: TAKES + '/t4_c0.wav' },
    '4_1': { t: 4, c: 1, ticks: 576, nframes: 120000, path: TAKES + '/t4_c1.wav' },
};
/* a volume lane and a send lane on track 4, a volume lane on track 3 */
const lanes = [
    { track: 4, clip: 0, target: '4:slot:volume', points: [{ tick: 0, val: 0 }, { tick: 96, val: 16383 }], clock: null },
    { track: 4, clip: 0, target: '4:slot:send_a', points: [{ tick: 0, val: 0 }, { tick: 96, val: 16383 }], clock: null },
    { track: 3, clip: 0, target: '3:slot:volume', points: [{ tick: 0, val: 0 }, { tick: 96, val: 16383 }], clock: null },
];
const mk = () => ({ drift: { name: 'Drift', parameters: { Enabled: true } }, moveSong: null,
                    paEnvelopes: [], paLanes: lanes, paMixerIds: {}, paBendSemis: {}, nextPaId: 2,
                    samples: [], sampleBySrc: {}, usedDest: {}, auTakes: takes });
const ctx = mk();
let tr = null;

step('an Audio track is a Live audio track with no instrument', () => {
    tr = xp.exportTrackForTest(4, ctx);
    assert(tr.kind === 'audio', 'kind ' + tr.kind);
    assert(Array.isArray(tr.devices) && tr.devices.length === 0, 'devices ' + JSON.stringify(tr.devices));
    assert(tr.clipSlots.length === 16 && tr.mixer && tr.mixer.sends.length === 2, 'slots / mixer');
    assert(!('midiInputMode' in tr) && !('notes' in (tr.clipSlots[0].clip || {})), 'MIDI fields on an audio track');
});
step('⭐ a clip is its take, bundled under a readable name', () => {
    const c = tr.clipSlots[0].clip;
    assert(c && c.sampleUri === 'Samples/' + encodeURIComponent('T5 A.wav'), 'uri ' + (c && c.sampleUri));
    assert(ctx.samples.some((s) => s.src === TAKES + '/t4_c0.wav' && s.dest === 'T5 A.wav'), 'not in the pack manifest');
    assert(c.transpose === 0 && c.gain === 0 && c.detune === 0, 'a take carries its sound already');
});
step('⭐ warped at the tempo it was recorded at, exactly as long as it loops', () => {
    const a = tr.clipSlots[0].clip, b = tr.clipSlots[1].clip;
    assert(near(a.warping.tempoAfterLastMarker, 120) && a.warping.markers.length === 0, 'A ' + JSON.stringify(a.warping));
    assert(a.region.start === 0 && near(a.region.end, 4) && near(a.region.loop.end, 4) && a.region.loop.isEnabled, 'A ' + JSON.stringify(a.region));
    /* 576 ticks = 6 beats over 120000 frames: 6 / (120000 / 44100) * 60 */
    assert(near(b.warping.tempoAfterLastMarker, 132.3), 'B tempo ' + b.warping.tempoAfterLastMarker);
    assert(near(b.region.end, 6) && near(b.region.loop.end, 6), 'B ' + JSON.stringify(b.region));
});
step('⭐ its volume lane is in the take, not written again; its send lane is', () => {
    const a = tr.clipSlots[0].clip;
    assert(typeof tr.mixer.volume === 'number', 'volume stamped with an id: ' + JSON.stringify(tr.mixer.volume));
    const sid = tr.mixer.sends[0].amount && tr.mixer.sends[0].amount.id;
    assert(sid && a.envelopes.length === 1 && a.envelopes[0].parameterId === sid, 'envelopes ' + JSON.stringify(a.envelopes));
});
step('every clip wears the track colour, and the shape matches Move\'s', () => {
    for (const k of [0, 1]) {
        const c = tr.clipSlots[k].clip;
        assert(c.color === tr.color, 'colour');
        for (const f of ['isPlaying', 'name', 'isEnabled', 'timeSignature', 'region', 'stepEditorScrollPosition',
                         'sampleUri', 'warping', 'gain', 'transpose', 'detune', 'envelopes'])
            assert(f in c, 'clip ' + k + ' lacks ' + f);
    }
});
step('CONTROL: a clip with no take is empty; a MIDI track is still MIDI and keeps its volume lane', () => {
    assert(tr.clipSlots[2].clip === null, 'slot 2 ' + JSON.stringify(tr.clipSlots[2].clip));
    const m = xp.exportTrackForTest(3, mk());
    assert(m.kind === 'midi', 'track 4 is ' + m.kind);
    assert(m.mixer.volume && typeof m.mixer.volume === 'object' && m.mixer.volume.id, 'the MIDI track lost its volume lane');
});
if (failed) { console.log('FAIL: export audio'); process.exit(1); }
console.log('PASS: Audio tracks export as Live audio tracks');
}
main().catch((e) => { console.error(e); process.exit(1); });
