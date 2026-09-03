// tools/audit_screens.mjs — render the REAL dAVEBOx OLED screens to PNGs for a
// visual-cohesion audit.
//
// Unlike tools/render_screens.mjs (which replicates draw blocks for the manual),
// this drives the actual exported render functions — soundRender(),
// drawGlobalMenu(), drawProjectPadPicker() — against the real state objects, so
// what comes out is what the device draws, including whichever chassis each
// screen happens to sit on. That is the subject of the audit, so replicating a
// draw block here would beg the question.
//
//   node --import ./tools/audit_loader.mjs tools/audit_screens.mjs [outdir]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 128, H = 64;
const SCALE = 4, PAD = 8;
const ON = [235, 238, 245], BG = [14, 16, 22], MAT = [30, 33, 42];

let fb = new Uint8Array(W * H);
globalThis.set_pixel = (x, y, v) => {
    x |= 0; y |= 0;
    if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = v ? 1 : 0;
};
globalThis.fill_rect = (x, y, w, h, v) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) globalThis.set_pixel(x + i, y + j, v);
};
globalThis.draw_rect = (x, y, w, h, v) => {
    globalThis.fill_rect(x, y, w, 1, v); globalThis.fill_rect(x, y + h - 1, w, 1, v);
    globalThis.fill_rect(x, y, 1, h, v); globalThis.fill_rect(x + w - 1, y, 1, h, v);
};
globalThis.draw_line = (x0, y0, x1, y1, v) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) { globalThis.set_pixel(x, y, v); if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; } }
};
globalThis.clear_screen = () => { fb.fill(0); };
globalThis.flush_display = () => {};

/* The device's own 5x7 atlas, so host print() renders pixel-accurately — the
 * host chassis is half of what is being compared, and a guessed font would make
 * every host screen look wrong for the wrong reason. Proportional: the atlas
 * trims each glyph to its ink width (matches js_display.c). */
const HFONT = JSON.parse(readFileSync(new URL('./host_font_5x7.json', import.meta.url)));
const CHAR_SPACING = 1, CELL_W = 5;
const _inkBounds = (rows) => {
    let mn = 5, mx = -1;
    for (const b of rows) for (let x = 0; x < 5; x++) if (b & (1 << (4 - x))) { if (x < mn) mn = x; if (x > mx) mx = x; }
    return mx < 0 ? null : { mn, mx };
};
function _drawHostChar(ch, x, y, col) {
    const rows = HFONT[ch] ?? HFONT[ch.toUpperCase?.()] ?? null;
    if (!rows) return CELL_W + CHAR_SPACING;
    const b = _inkBounds(rows);
    if (!b) return CELL_W + CHAR_SPACING;
    for (let r = 0; r < 7; r++) for (let cx = b.mn; cx <= b.mx; cx++)
        if (rows[r] & (1 << (4 - cx))) globalThis.set_pixel(x + (cx - b.mn), y + r, col);
    return (b.mx - b.mn + 1) + CHAR_SPACING;
}
globalThis.print = (x, y, str, col) => {
    let cx = x | 0; for (const ch of String(str)) cx += _drawHostChar(ch, cx, y | 0, col ? 1 : 0);
};
globalThis.text_width = (str) => {
    let w = 0;
    for (const ch of String(str)) {
        const rows = HFONT[ch] ?? null; const b = rows && _inkBounds(rows);
        w += (b ? (b.mx - b.mn + 1) : CELL_W) + CHAR_SPACING;
    }
    return w;
};

/* Host bindings the ui modules touch at load or draw time. */
let PARAMS = {};
globalThis.shadow_get_param = (slot, key) => PARAMS[key] ?? '';
globalThis.shadow_set_param = () => 1;
globalThis.shadow_send_midi_to_dsp = () => {};
for (const fn of ['host_write_file', 'host_read_file', 'host_file_exists', 'host_ensure_dir',
                  'host_remove_dir', 'host_system_cmd', 'host_module_set_param',
                  'host_module_get_param', 'host_send_midi', 'move_midi_inject_to_move',
                  'host_set_led', 'set_led', 'host_get_setting', 'host_set_setting',
                  'move_midi_internal_send', 'host_vol_block', 'host_edit_cc_block',
                  'host_ext_midi_remap_clear', 'host_ext_midi_remap_set',
                  'host_ext_midi_remap_enable', 'host_get_volume', 'host_set_volume'])
    globalThis[fn] = () => (fn.indexOf('read') >= 0 || fn.indexOf('get') >= 0 ? '' : 0);
/* Chain-patch store: a couple of entries, so the Slot Presets list renders with
 * content rather than as its empty state. */
globalThis.host_patch_list = () => ['Fat Brass', 'Glass Pad', 'Sub Bass'];
globalThis.host_patch_current = () => 'Fat Brass';
globalThis.host_patch_load = () => 1;
globalThis.host_patch_save = () => 1;
globalThis.host_patch_delete = () => 1;

const shots = [];
function shoot(group, name, note) {
    shots.push({ group, name, note: note || '', fb: fb.slice() });
}

/* ─────────────────────────── the screens ─────────────────────────── */

const { S: GS } = await import('../ui/ui_state.mjs');
const snd = await import('../ui/ui_sound.mjs');
const dlg = await import('../ui/ui_dialogs.mjs');

/* A slot with a synth and two FX loaded, so the block picker has real rows. */
PARAMS = {
    'synth:module': 'nusaw', 'synth:name': 'NuSaw',
    'fx1:module': 'freeverb', 'fx1:name': 'Freeverb',
    'fx2:module': 'rrverb10', 'fx2:name': 'RRVerb-10',
    'knob_1_target': 'synth', 'knob_1_param': 'cutoff',
    'knob_2_target': 'fx1', 'knob_2_param': 'room_size',
    'knob_5_target': 'synth', 'knob_5_param': 'shape',
    'synth:chain_params': JSON.stringify([
        { key: 'cutoff', name: 'Cutoff', type: 'float', min: 0, max: 1, step: 0.01 },
        { key: 'shape', name: 'Shape', type: 'enum', options: ['Saw', 'Square', 'Tri'] },
    ]),
    'fx1:chain_params': JSON.stringify([
        { key: 'room_size', name: 'Room Size', type: 'float', min: 0.5, max: 20, step: 0.01 },
    ]),
    'slot:volume': '1.0', 'slot:send_a': '0.25', 'slot:send_b': '0',
};

GS.sessionView = false;
for (let i = 0; i < 8; i++) GS.trackRoute[i] = 0;
GS.activeTrack = 4;
GS.stateLoading = false; GS.bootSplashTicks = 0; GS.awaitingProjectSelect = false;

const tick = (n) => { for (let i = 0; i < n; i++) snd.soundTick(); };
const cc = (d1, d2) => snd.soundOnCC(d1, d2, (v) => (v < 64 ? v : v - 128));
const jog = (d) => cc(14, d > 0 ? 1 : 127);
const click = () => cc(3, 127);
const draw = () => { globalThis.clear_screen(); snd.soundRender(); };

function enterSound() { snd.soundEnter(4, 4); tick(4); }

/* Walk the picker cursor to the first row of a given kind and click it. */
function openRow(kind) {
    const st = snd.soundPickStateForTest();
    const target = st.kinds.indexOf(kind, st.row) >= 0
        ? st.kinds.indexOf(kind, st.row) : st.kinds.indexOf(kind);
    if (target < 0) throw new Error('no row of kind ' + kind);
    for (let g = 0; g <= st.kinds.length * 2; g++) {
        const now = snd.soundPickStateForTest().row;
        if (now === target) break;
        jog(now < target ? 1 : -1);
    }
    click(); tick(4);
}

/* ---- A. TRACK SETTINGS: the reference, then its submenus ---- */
enterSound();
draw(); shoot('track', 'Track settings — TOP LEVEL', 'the reference Josh approves');

enterSound(); openRow('settings');
draw(); shoot('track', 'Sound Control (submenu)', 'reached from the top level');

enterSound(); openRow('config');
draw(); shoot('track', 'Config (submenu)', '');

/* Knobs… lives inside Sound Control; find its sub row. */
enterSound(); openRow('settings');
for (let g = 0; g < 12; g++) { jog(1); }
draw(); shoot('track', 'Sound Control, scrolled', 'sub-rows + chevrons');

enterSound(); openRow('patches');
draw(); shoot('track', 'Slot Presets (submenu)', '');

enterSound(); openRow('block');
draw(); shoot('track', 'Block editor (param page)', 'the movy cell grid — not a list');

/* ---- B. GLOBAL SETTINGS ---- */
/* ⚠ Built with the REAL menu-item factories, not plain {label,value} objects.
 * formatItemValue switches on item.type, so untyped fixtures render every value
 * as empty — which made the first pass of this audit look like the rewrite had
 * dropped the values. The fixture has to speak the same contract as the screen. */
const MI = await import('../../src/shared/menu_items.mjs');
GS.globalMenuOpen = true;
GS.globalMenuItems = [
    MI.createValue('BPM', { get: () => 120, min: 20, max: 300 }),
    MI.createEnum('Key', { get: () => 'C', options: ['C', 'C#', 'D'] }),
    MI.createEnum('Scale', { get: () => 'Minor', options: ['Major', 'Minor'] }),
    MI.createEnum('Clock Follow', { get: () => 'Off', options: ['Off', 'Move'] }),
    MI.createToggle('Clock Out', { get: () => true }),
    MI.createSubmenu('Projects...', () => []),
    MI.createSubmenu('Host Settings...', () => []),
];
GS.globalMenuState = { selectedIndex: 2, editing: false, editValue: null };
globalThis.clear_screen(); dlg.drawGlobalMenu();
shoot('global', 'Global settings menu', '');

GS.globalMenuState = { selectedIndex: 2, editing: true, editValue: 'Minor' };
globalThis.clear_screen(); dlg.drawGlobalMenu();
shoot('global', 'Global settings editing', 'the [brackets] edit grammar');
GS.globalMenuState = { selectedIndex: 2, editing: false, editValue: null };

/* ---- C. PROJECT MANAGEMENT ---- */
GS.globalMenuOpen = false;
const mkPPP = (over) => Object.assign({
    byIndex: { 0: { name: 'Sketchbook', color: 1 }, 1: { name: 'Live Set A', color: 0 },
               3: { name: 'Drums Only', color: 2 } },
    current: 0, touchedIdx: -1, deleteIdx: -1, copySrcIdx: -1,
    menu: null, colorPick: null, confirmNew: null, restarting: false, renameActive: false,
}, over || {});

/* Selected but NOT loaded — every fresh launch, and any other project's pad. */
GS.awaitingProjectSelect = true;
GS.projectPadPicker = mkPPP({ menu: { k: 0, sel: 0 } });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Selected, not loaded', 'the ordinary screen — Load first');

/* Selected AND loaded: Load is replaced by the centred status line. */
GS.awaitingProjectSelect = false;
GS.projectPadPicker = mkPPP({ menu: { k: 0, sel: 1 } });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Selected and loaded', '(CURRENT) + Resume, cursor opens on Resume');

/* Nothing selected: the prior project is gone. */
GS.projectPadPicker = mkPPP({ current: -1 });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Nothing selected', 'prior project no longer exists');

GS.projectPadPicker = mkPPP({ colorPick: { k: 0, sel: 2 } });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Colour picker', '');

GS.projectPadPicker = mkPPP({ deleteIdx: 1 });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Delete arm', '');

GS.projectPadPicker = mkPPP({ copySrcIdx: 1 });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Copy arm', '');

GS.projectPadPicker = mkPPP({ restarting: true });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'Renaming / restarting', '');

GS.projectPadPicker = mkPPP({ confirmNew: { k: 5, sel: 0 } });
globalThis.clear_screen(); dlg.drawProjectPadPicker();
shoot('project', 'New project confirm', 'stays on the shared dialog family');

/* ---- D. THE PRE-SA SWEEP ---- */
GS.snapshotPicker = { mode: 'load', sel: 1, confirm: null, snaps: [
    { id: 1, label: 'Before the bridge', sv: 36 },
    { id: 2, label: 'Take 4 verse', sv: 36 },
    { id: 3, label: 'Old idea', sv: 35 },
    { id: 4, label: 'Warmup jam', sv: 36 },
    { id: 5, label: 'Soundcheck', sv: 36 },
] };
globalThis.clear_screen(); dlg.drawSnapshotPicker();
shoot('sweep', 'Snapshot picker', 'was the last hand-rolled list in the tree');

S_EXPORT: {
    GS.exportDonePath = 'UserLibrary/Samples/dAVEBOx/2026-08-15/bounce-take-04.wav';
    GS.exportDoneMissing = 0;
    globalThis.clear_screen(); dlg.drawExportDoneDialog && dlg.drawExportDoneDialog();
}

/* ---- E. DIALOG FAMILY (correct already, for comparison) ---- */
GS.globalMenuOpen = false;
globalThis.clear_screen(); dlg.drawStateWipeConfirm();
shoot('dialog', 'State wipe confirm', 'shared dialog chassis — deliberately unchanged');

/* ─────────────────────────── output ─────────────────────────── */

function writePng(fbuf, outPath) {
    const iw = W * SCALE + 2 * PAD, ih = H * SCALE + 2 * PAD;
    const img = Buffer.alloc(iw * ih * 4);
    for (let i = 0; i < iw * ih; i++) { img[i*4]=MAT[0]; img[i*4+1]=MAT[1]; img[i*4+2]=MAT[2]; img[i*4+3]=255; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = fbuf[y * W + x] ? ON : BG;
        for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
            const p = ((PAD + y*SCALE + sy) * iw + PAD + x*SCALE + sx) * 4;
            img[p]=c[0]; img[p+1]=c[1]; img[p+2]=c[2]; img[p+3]=255;
        }
    }
    const crc32 = (buf) => { let c = ~0; for (let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));} return ~c>>>0; };
    const chunk = (type, data) => { const t=Buffer.from(type,'ascii'); const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const body=Buffer.concat([t,data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len,body,crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(iw,0); ihdr.writeUInt32BE(ih,4); ihdr[8]=8; ihdr[9]=6;
    const raw = Buffer.alloc(ih * (1 + iw*4));
    for (let y=0;y<ih;y++){ raw[y*(1+iw*4)]=0; img.copy(raw, y*(1+iw*4)+1, y*iw*4, (y+1)*iw*4); }
    writeFileSync(outPath, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
        chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}

const outDir = process.argv[2] || '/tmp/davebox-audit';
mkdirSync(outDir, { recursive: true });
const index = [];
for (const s of shots) {
    const slug = (s.group + '-' + s.name).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    writePng(s.fb, outDir + '/' + slug + '.png');
    const ink = s.fb.reduce((a, b) => a + b, 0);
    index.push({ slug, group: s.group, name: s.name, note: s.note, ink });
    console.log(`${String(ink).padStart(5)} px  ${slug}`);
}
writeFileSync(outDir + '/index.json', JSON.stringify(index, null, 2));
console.log('\n' + shots.length + ' screens -> ' + outDir);
