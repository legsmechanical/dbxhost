/* ui_audio_chooser.mjs — an Audio clip's SAMPLE CHOOSER (the AUDIO editor's
 * Smpl: touch + click). A list of places, then the shared file browser
 * (filepath_browser.mjs) in that place, WAV and AIFF only. The highlighted
 * file plays through the host's preview (host_preview_play) once the cursor
 * rests; a click on a file picks it (the engine copies it into the project);
 * Back walks up, and out at the top. "None" clears the clip's sample. */

import * as os from 'os';
import { S } from './ui_state.mjs';
import { buildFilepathBrowserState, refreshFilepathBrowser, moveFilepathBrowserSelection,
         activateFilepathBrowserItem, FILEPATH_PREVIEW_DEBOUNCE_MS } from '/data/UserData/schwung/shared/filepath_browser.mjs';
import { drawKitHeader, drawKitList, drawKitHintRow, MV_FOOTER_Y } from './ui_movy.mjs';
import { auPick, auClear, auInfo } from './ui_audio.mjs';

const FS = {
    readdir(path) {
        const out = os.readdir(path) || [];
        if (Array.isArray(out[0])) return out[0];
        if (Array.isArray(out)) return out;
        return [];
    },
    stat(path) { return os.stat(path); },
};

const FILTER = ['.wav', '.aif', '.aiff'];
const CLIP_LETTERS = 'ABCDEFGHIJKLMNOP';

function places(t) {
    const out = [];
    const dir = String(host_module_get_param('t' + t + '_au_dir') || '');
    if (dir) out.push({ label: 'This project', path: dir });
    out.push({ label: 'dAVEBOx Resample', path: '/data/UserData/UserLibrary/Samples/dAVEBOx/Resample' });
    out.push({ label: 'Recordings', path: '/data/UserData/UserLibrary/Recordings' });
    out.push({ label: 'Samples', path: '/data/UserData/UserLibrary/Samples' });
    out.push({ label: 'Core Library', path: '/data/CoreLibrary/Samples' });
    out.push({ label: 'None', none: true });
    return out;
}

export function audioChooserOpen() { return !!S.auChooser; }

/* Tick context (it lists the project's folder through a get_param). */
export function openAudioChooser(t, c) {
    S.auChooser = { t, c, places: places(t), sel: 0, B: null, restAt: 0, playing: '' };
    S.screenDirty = true;
}

function stopPreview() {
    const ch = S.auChooser;
    if (ch && ch.playing) { host_preview_stop(); ch.playing = ''; }
}

export function closeAudioChooser() {
    stopPreview();
    S.auChooser = null;
    S.screenDirty = true;
}

function selectedFile() {
    const ch = S.auChooser;
    if (!ch || !ch.B) return '';
    const it = ch.B.items[ch.B.selectedIndex];
    return it && it.kind === 'file' ? it.path : '';
}

export function audioChooserRotate(delta) {
    const ch = S.auChooser;
    if (!ch) return;
    const d = delta > 0 ? 1 : -1;
    if (!ch.B) ch.sel = Math.max(0, Math.min(ch.places.length - 1, ch.sel + d));
    else moveFilepathBrowserSelection(ch.B, d);
    ch.restAt = S.clockMs + FILEPATH_PREVIEW_DEBOUNCE_MS;
    S.screenDirty = true;
}

export function audioChooserClick() {
    const ch = S.auChooser;
    if (!ch) return;
    if (!ch.B) {
        const p = ch.places[ch.sel];
        if (p.none) { auClear(ch.t, ch.c); closeAudioChooser(); return; }
        ch.B = buildFilepathBrowserState({ name: p.label, root: p.path, filter: FILTER }, '');
        ch.placeLabel = p.label;
        refreshFilepathBrowser(ch.B, FS);
        ch.restAt = S.clockMs + FILEPATH_PREVIEW_DEBOUNCE_MS;
        S.screenDirty = true;
        return;
    }
    const r = activateFilepathBrowserItem(ch.B);
    if (r.action === 'open') { refreshFilepathBrowser(ch.B, FS); stopPreview(); S.screenDirty = true; return; }
    if (r.action === 'select') {
        auPick(ch.t, ch.c, r.value);
        closeAudioChooser();
    }
}

/* Back: up a folder, to the places at a place's top, out from the places. */
export function audioChooserBack() {
    const ch = S.auChooser;
    if (!ch) return;
    stopPreview();
    if (!ch.B) { closeAudioChooser(); return; }
    if (ch.B.currentDir !== ch.B.root) {
        const up = ch.B.items.find((it) => it.kind === 'up');
        if (up) { ch.B.currentDir = up.path; ch.B.selectedIndex = 0; refreshFilepathBrowser(ch.B, FS); S.screenDirty = true; return; }
    }
    ch.B = null;
    S.screenDirty = true;
}

/* Audition the file the cursor rests on. */
export function audioChooserTick() {
    const ch = S.auChooser;
    if (!ch || !ch.restAt || S.clockMs < ch.restAt) return;
    ch.restAt = 0;
    const f = selectedFile();
    if (f === ch.playing) return;
    if (!f) { stopPreview(); return; }
    host_preview_play(f);
    ch.playing = f;
}

export function drawAudioChooser() {
    const ch = S.auChooser;
    clear_screen();
    drawKitHeader('SAMPLE  CLIP ' + CLIP_LETTERS[ch.c] + '  T' + (ch.t + 1), false);
    if (!ch.B) {
        const cur = auInfo(ch.t, ch.c).name;
        drawKitList(ch.places.map((p) => ({ label: p.none ? (cur ? 'None (clear)' : 'None') : p.label, chevron: !p.none })), ch.sel,
                    { h: MV_FOOTER_Y - 11 });          /* above the hint row */
    } else {
        const rows = ch.B.items.map((it) => ({ label: it.kind === 'dir' ? it.label.replace(/^\[|\]$/g, '') : it.kind === 'up' ? '..' : it.label.replace(/\.(wav|aif|aiff)$/i, ''),
                                               chevron: it.kind === 'dir' }));
        drawKitList(rows, ch.B.selectedIndex, { emptyMsg: ch.B.error || 'No samples here', h: MV_FOOTER_Y - 11 });
    }
    drawKitHintRow(MV_FOOTER_Y, ch.B ? [['clk', 'pick'], ['back', 'up']] : [['clk', 'open'], ['back', 'exit']]);
}

/* ── PURGE UNUSED SAMPLES (Project menu) ──────────────────────────────────
 * Josh, 2026-10-26: samples "stay project, but don't come back ... we need a
 * mechanism to purge unused samples from the project." A file in the
 * project's samples/ is in use when a clip holds it now (the engine's
 * au_use list) OR any state file in the project's folder names it — a saved
 * state (Load state) must still load whole. Runs on the UI thread, never the
 * audio one. Returns { dir, files: [path], bytes } (files empty: nothing to
 * purge). */
function unescJson(s) { return s.replace(/\\(.)/g, '$1'); }
export function auPurgeScan() {
    const dir = String(host_module_get_param('t0_au_dir') || '');
    const out = { dir, files: [], bytes: 0 };
    if (!dir) return out;
    const used = new Set(String(host_module_get_param('au_used') || '').split('\n').filter((x) => x));
    const stateDir = dir.replace(/\/samples$/, '');
    const re = /"t\d+c\d+_au":"[^|"]*\|((?:[^"\\]|\\.)*)"/g;
    for (const f of FS.readdir(stateDir)) {
        if (!/\.json$/.test(f)) continue;
        const body = String(host_read_file(stateDir + '/' + f) || '');
        let m;
        while ((m = re.exec(body)) !== null) used.add(unescJson(m[1]));
    }
    for (const f of FS.readdir(dir)) {
        if (!f || f[0] === '.' || used.has(f)) continue;
        const [st, err] = (() => { const r = os.stat(dir + '/' + f); return Array.isArray(r) ? r : [r, 0]; })();
        if (err || !st || (st.mode & 0o170000) === 0o040000) continue;
        out.files.push(dir + '/' + f);
        out.bytes += st.size | 0;
    }
    return out;
}
export function auPurgeRun(files) {
    let n = 0;
    for (const p of files) if (os.remove(p) === 0) n++;
    return n;
}
