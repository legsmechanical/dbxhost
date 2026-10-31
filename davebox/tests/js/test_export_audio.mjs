import './_bulk_get_stub.mjs';
/* tests/js/test_export_audio.mjs — an Audio track exports as a Live audio
 * track, in the shape Move writes itself (captured from a set made on the Move
 * with an audio track): `kind: "audio"`, clips naming their sample, region and
 * loop in BEATS, and `warping.tempoAfterLastMarker` = the sample's own tempo.
 *   Loop clip  → its sample, bundled; the window from Start at the clip's
 *                Tempo; Pitch / Detune / Gain; Shift as the start marker.
 *   Slice clip → the DSP's render, bundled under a readable name, warped at
 *                the tempo it was rendered at.
 * Built on the real path (buildTrack), the engine's `_au_export` stubbed.
 * CONTROL: an empty slot stays empty; a non-Audio track is still MIDI. */
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
const PROJ = '/data/UserData/daveboxSA/projects/p1/dAVEBOx/samples';
const STAGE = '/data/UserData/daveboxSA/davebox-exports/staging';
/* clip 0: a Loop clip, 1 bar of a 2 s sample at 120 (bpm10 1200), Start at
 * 0.5 s, Pitch -6, Detune +12, Gain -3, Shift a beat (96 ticks).
 * clip 1: a Slice clip rendered, 384 ticks over 80000 frames (132.3 BPM:
 *         the engine's exact tempo, which the rounded `bpm` read is not).
 * clip 2: nothing. */
const AU = {
    t4_c0_au_export: 'L 44100 88200 22050 1200 -6 12 -3 0 0 96 0 384|' + PROJ + '/Break 120.wav',
    t4_c1_au_export: 'S 80000 384|' + STAGE + '/au_4_1.wav',
    /* clip 3: a Loop clip on Vintage, rendered (88200 frames, 384 ticks: 120) */
    t4_c3_au_export: 'R 88200 384|' + STAGE + '/au_4_3.wav',
    /* clip 4: a Warp clip on Revrs: the DSP's reversed copy, its window at 0;
     * Nudge -250 ms: the sample half a beat earlier, so the window starts in */
    t4_c4_au_export: 'L 44100 88200 0 1200 0 0 0 1 0 0 -250 384|' + STAGE + '/au_4_4_rev.wav',
    /* clip 5: Nudge +250 ms from Start 0: it cannot lead with silence */
    t4_c5_au_export: 'L 44100 88200 0 1200 0 0 0 0 0 0 250 384|' + PROJ + '/Break 120.wav',
};
globalThis.host_module_get_param = (k) => (k in AU ? AU[k] : /_export/.test(k) ? '0 0 0' : '');
globalThis.host_read_file = () => '';

async function main() {
const xp = await import('../../ui/ui_export.mjs');
const { S } = await import('../../ui/ui_state.mjs');
const { PAD_MODE_AUDIO } = await import('../../ui/ui_constants.mjs');
for (let t = 0; t < 8; t++) { S.trackPadMode[t] = 0; S.trackRoute[t] = 0; S.trackChannel[t] = t + 1; }
S.trackPadMode[4] = PAD_MODE_AUDIO;
const mk = () => ({ drift: { name: 'Drift', parameters: { Enabled: true } }, moveSong: null,
                    paEnvelopes: [], paLanes: [], paMixerIds: {}, paBendSemis: {}, nextPaId: 2,
                    samples: [], sampleBySrc: {}, usedDest: {} });
const ctx = mk();
let tr = null;

step('an Audio track is a Live audio track with no instrument', () => {
    tr = xp.exportTrackForTest(4, ctx);
    assert(tr.kind === 'audio', 'kind ' + tr.kind);
    assert(Array.isArray(tr.devices) && tr.devices.length === 0, 'devices ' + JSON.stringify(tr.devices));
    assert(tr.clipSlots.length === 16 && tr.mixer && tr.mixer.sends.length === 2, 'slots / mixer');
    assert(!('midiInputMode' in tr) && !('notes' in (tr.clipSlots[0].clip || {})), 'MIDI fields on an audio track');
});
step('⭐ a Loop clip: its sample bundled, warped at the clip\'s Tempo', () => {
    const c = tr.clipSlots[0].clip;
    assert(c, 'no clip');
    assert(c.sampleUri === 'Samples/' + encodeURIComponent('Break 120.wav'), 'uri ' + c.sampleUri);
    assert(ctx.samples.some((s) => s.src === PROJ + '/Break 120.wav' && s.dest === 'Break 120.wav'), 'not in the pack manifest');
    assert(c.warping.tempoAfterLastMarker === 120 && c.warping.markers.length === 0, 'warping ' + JSON.stringify(c.warping));
});
step('⭐ a Loop clip: the window from Start, the clip\'s length, Shift as the start marker', () => {
    const c = tr.clipSlots[0].clip;
    /* Start 0.5 s at 120 = 1 beat; 384 ticks = 4 beats; Shift a beat later
     * = the clip starts 3 beats into its loop */
    assert(near(c.region.loop.start, 1) && near(c.region.loop.end, 5) && c.region.loop.isEnabled, 'loop ' + JSON.stringify(c.region));
    assert(near(c.region.end, 5) && near(c.region.start, 4), 'region ' + JSON.stringify(c.region));
});
step('a Loop clip: Pitch / Detune / Gain', () => {
    const c = tr.clipSlots[0].clip;
    assert(c.transpose === -6 && c.detune === 12 && c.gain === -3, JSON.stringify([c.transpose, c.detune, c.gain]));
});
step('⭐ a Slice clip: the render bundled under a readable name, at its own tempo', () => {
    const c = tr.clipSlots[1].clip;
    assert(c, 'no clip');
    assert(c.sampleUri === 'Samples/' + encodeURIComponent('T5 B slices.wav'), 'uri ' + c.sampleUri);
    assert(ctx.samples.some((s) => s.src === STAGE + '/au_4_1.wav' && s.dest === 'T5 B slices.wav'), 'not in the pack manifest');
    assert(near(c.warping.tempoAfterLastMarker, 132.3), 'tempo ' + c.warping.tempoAfterLastMarker);
    assert(c.region.start === 0 && near(c.region.end, 4) && near(c.region.loop.end, 4), 'region ' + JSON.stringify(c.region));
    assert(c.transpose === 0 && c.gain === 0 && c.detune === 0, 'a render carries its sound already');
});
step('⭐ a rendered Loop clip (Pitch / Vintage) goes as its render, at its tempo', () => {
    const c = tr.clipSlots[3].clip;
    assert(c && c.sampleUri === 'Samples/' + encodeURIComponent('T5 D loop.wav'), 'uri ' + (c && c.sampleUri));
    assert(ctx.samples.some((s) => s.src === STAGE + '/au_4_3.wav'), 'not in the pack manifest');
    assert(near(c.warping.tempoAfterLastMarker, 120) && near(c.region.loop.end, 4) && c.transpose === 0, JSON.stringify(c));
});
step('⭐ a Warp clip on Revrs goes as the reversed copy; Nudge moves its window', () => {
    const c = tr.clipSlots[4].clip;
    assert(c && c.sampleUri === 'Samples/' + encodeURIComponent('T5 E reversed.wav'), 'uri ' + (c && c.sampleUri));
    assert(ctx.samples.some((s) => s.src === STAGE + '/au_4_4_rev.wav' && s.dest === 'T5 E reversed.wav'), 'not in the pack manifest');
    /* -250 ms at 120 = half a beat further in */
    assert(near(c.region.loop.start, 0.5) && near(c.region.loop.end, 4.5), 'loop ' + JSON.stringify(c.region));
});
step('a Nudge later than the sample\'s start cannot lead with silence: it starts at 0', () => {
    const c = tr.clipSlots[5].clip;
    assert(near(c.region.loop.start, 0) && near(c.region.loop.end, 4), 'loop ' + JSON.stringify(c.region));
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
step('CONTROL: an empty slot stays empty; a MIDI track is still MIDI', () => {
    assert(tr.clipSlots[2].clip === null, 'slot 2 ' + JSON.stringify(tr.clipSlots[2].clip));
    const m = xp.exportTrackForTest(3, mk());
    assert(m.kind === 'midi', 'track 4 is ' + m.kind);
});
step('parseAuExport refuses a line it cannot read', () => {
    assert(xp.parseAuExport('') === null && xp.parseAuExport('L 1 2|') === null && xp.parseAuExport('X|y') === null, 'accepted junk');
});
if (failed) { console.log('FAIL: export audio'); process.exit(1); }
console.log('PASS: Audio tracks export as Live audio tracks');
}
main().catch((e) => { console.error(e); process.exit(1); });
