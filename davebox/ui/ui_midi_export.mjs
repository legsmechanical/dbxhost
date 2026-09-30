/* ui_midi_export.mjs — Export to MIDI: one clip, as it plays, as a .mid file.
 *
 * The TRACK CONFIG row "Export to MIDI" (ui_sound.mjs configRows) calls
 * requestClipMidiExport from the click — inside soundOnCC, where get_param
 * answers null — so the click only ARMS; pollPendingMidiExport does the work
 * from the tick, across two ticks so EXPORTING is on the screen first.
 *
 * RULED (Josh, 2026-09-30): the row is on TRACK CONFIG; the file is the clip AS
 * IT PLAYS — the Ableton export's own render (NOTE FX, harmony, arp and delay
 * baked in, random settings as 8 cycles, a responder folded by the Conductor);
 * and it goes to a "dAVEBOx MIDI" folder in user data, where the MIDI browser
 * can re-import it and Schwung Manager's Files page can download it.
 *
 * The clip is the one on screen (effectiveClip). A drum clip is one file,
 * every lane on its own note, on channel 10. Names never overwrite:
 * "<Project> <track><letter>.mid", then " 2", " 3"… Refused while the
 * transport plays, as Export to Ableton is: the render is a bake that runs
 * inside get_param, on the audio thread.
 */
import * as std from 'std';
import * as os from 'os';
import { S, conductorTrackIdx } from './ui_state.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { effectiveClip } from './ui_leds.mjs';
import { SCENE_LETTERS, PAD_MODE_DRUM } from './ui_constants.mjs';
import { renderClipNotes, sanitizeName, showStopTransportNotice, EXPORT_STAGING } from './ui_export.mjs';
import { smfWrite, smfLegalize } from './ui_midifile.mjs';

export const MIDI_EXPORT_DIR = '/data/UserData/dAVEBOx MIDI';
const MAX_SUFFIX = 99;

/* The click (MIDI-handler context): arm, or say why not. */
export function requestClipMidiExport(t) {
    if (S.playing) { showStopTransportNotice(); return; }
    if (S.pendingExport || S.pendingExportRun || S.pendingMidiExport) return;   /* one export at a time */
    S.pendingMidiExport = { t, c: effectiveClip(t), run: false };
    showActionPopup('EXPORTING', '...');
    S.screenDirty = true;
}

/* A free name in the folder: the base, then " 2" … " 99". */
function freePath(base) {
    for (let n = 1; n <= MAX_SUFFIX; n++) {
        const p = MIDI_EXPORT_DIR + '/' + base + (n > 1 ? ' ' + n : '') + '.mid';
        const [st] = os.stat(p);
        if (!st) return p;
    }
    return null;
}

/* bytes → path, via a dotfile beside it (the browser skips dotfiles) and a
 * rename, so a half-written file is never listed. Every step's answer is
 * checked: a short write or a failing close is a full disk. */
function writeBytes(path, bytes) {
    const tmp = MIDI_EXPORT_DIR + '/.' + path.slice(MIDI_EXPORT_DIR.length + 1) + '.part';
    let f = null, ok = false;
    try {
        f = std.open(tmp, 'wb');
        if (f) {
            const n = f.write(bytes.buffer, bytes.byteOffset, bytes.length);
            const c = f.close(); f = null;
            ok = n === bytes.length && c === 0 && os.rename(tmp, path) === 0;
        }
    } catch (e) { ok = false; }
    if (f) { try { f.close(); } catch (e) { /* already failing */ } }
    if (!ok) { try { os.remove(tmp); } catch (e) { /* nothing to clean */ } }
    return ok;
}

/* The tick: the first pass lets EXPORTING reach the screen, the second works. */
export function pollPendingMidiExport() {
    const job = S.pendingMidiExport;
    if (!job) return;
    if (!job.run) { job.run = true; return; }
    S.pendingMidiExport = null;
    if (S.playing) { showStopTransportNotice(); return; }   /* started since the click */
    const { t, c } = job;
    const drum = S.trackPadMode[t] === PAD_MODE_DRUM;
    host_ensure_dir(EXPORT_STAGING);                          /* the DSP writes its render here */
    const r = renderClipNotes(t, c, drum, !drum && t !== conductorTrackIdx());
    try { os.remove(EXPORT_STAGING + '/render.txt'); } catch (e) { /* gone already */ }
    if (!r || r.count < 0) { showActionPopup('EXPORT FAILED'); return; }
    const notes = smfLegalize(r.notes, r.span);
    if (!notes.length) { showActionPopup('CLIP EMPTY'); return; }

    const base = sanitizeName(S.currentSetName) + ' ' + (t + 1) + SCENE_LETTERS[c];
    const bpm = parseFloat(host_module_get_param('bpm'));
    const bytes = smfWrite({ name: base, bpm: bpm > 0 && isFinite(bpm) ? bpm : 120,
                             timeSig: { num: 4, den: 4 }, channel: drum ? 9 : 0,
                             notes, lengthTicks: r.span });
    host_ensure_dir(MIDI_EXPORT_DIR);
    const path = freePath(base);
    if (!path || !writeBytes(path, bytes)) { showActionPopup('EXPORT FAILED'); return; }
    const file = path.slice(MIDI_EXPORT_DIR.length + 1);
    showActionPopup('EXPORTED', file.length > 18 ? file.slice(0, 17) + '~' : file);
}
