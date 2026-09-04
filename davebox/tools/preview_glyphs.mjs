// tools/preview_glyphs.mjs — bank-header GLYPH options, on the REAL bank card.
//
// Josh, 2026-09-05: a glyph on the left of every bank header saying whether the
// bank controls SEQUENCER elements (music note?), AUDIO elements (sound wave?)
// or PERFORMANCE elements (knob or fader?); the alt chevron goes; the track
// number moves to the far right. He asked for 4-5 options per category.
//
// The CARD is drawn by the shipping drawUI() (same harness as
// preview_overviews.mjs); only the header band is then re-laid out with the
// candidate glyph — the glyph is the variable under test, the chrome is real.
//
//   node --import ./tools/audit_loader.mjs tools/preview_glyphs.mjs [outdir]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 128, H = 64, SCALE = 4, PAD = 8;
const ON = [235,238,245], BG = [14,16,22], MAT = [30,33,42];
let fb = new Uint8Array(W*H);
globalThis.set_pixel = (x,y,v)=>{x|=0;y|=0;if(x>=0&&x<W&&y>=0&&y<H)fb[y*W+x]=v?1:0;};
globalThis.fill_rect = (x,y,w,h,v)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)globalThis.set_pixel(x+i,y+j,v);};
globalThis.draw_rect = (x,y,w,h,v)=>{globalThis.fill_rect(x,y,w,1,v);globalThis.fill_rect(x,y+h-1,w,1,v);globalThis.fill_rect(x,y,1,h,v);globalThis.fill_rect(x+w-1,y,1,h,v);};
globalThis.clear_screen = ()=>{fb.fill(0);};
const HFONT = JSON.parse(readFileSync(new URL('./host_font_5x7.json', import.meta.url)));
const CS = 1, CELL = 5;
const ink = (rows)=>{let mn=5,mx=-1;for(const b of rows)for(let x=0;x<5;x++)if(b&(1<<(4-x))){if(x<mn)mn=x;if(x>mx)mx=x;}return mx<0?null:{mn,mx};};
function hostChar(ch,x,y,col,put){const rows=HFONT[ch]??HFONT[ch.toUpperCase?.()]??null;if(!rows)return CELL+CS;const b=ink(rows);if(!b)return CELL+CS;
  for(let r=0;r<7;r++)for(let c=b.mn;c<=b.mx;c++)if(rows[r]&(1<<(4-c)))put(x+(c-b.mn),y+r,col);return (b.mx-b.mn+1)+CS;}
globalThis.print=(x,y,s,col)=>{let cx=x|0;for(const ch of String(s))cx+=hostChar(ch,cx,y|0,col?1:0,globalThis.set_pixel);};
globalThis.text_width=(s)=>{let w=0;for(const ch of String(s)){const rows=HFONT[ch]??null;const b=rows&&ink(rows);w+=(b?(b.mx-b.mn+1):CELL)+CS;}return w;};
let PARAMS = {};
globalThis.shadow_get_param = (slot,key)=>PARAMS[key]??'';
globalThis.shadow_set_param = ()=>1;
globalThis.shadow_send_midi_to_dsp = ()=>{};
for (const fn of ['host_write_file','host_read_file','host_file_exists','host_ensure_dir',
  'host_remove_dir','host_system_cmd','host_module_set_param','host_module_get_param',
  'host_send_midi','move_midi_inject_to_move','set_led','move_midi_internal_send',
  'host_vol_block','host_edit_cc_block','host_ext_midi_remap_clear','host_ext_midi_remap_set',
  'host_ext_midi_remap_enable','host_register_primary','flush_display','host_exit_module'])
  globalThis[fn] = () => 0;
globalThis.host_module_get_param = () => '';
globalThis.host_read_file = () => '';

const { S } = await import('../ui/ui_state.mjs');
const render = await import('../ui/ui_render.mjs');
const { fontPrint4x5, fontWidth4x5 } = await import('../ui/ui_fonts_pp.mjs');

S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
S.ledInitComplete = true; S.activeTrack = 2; S.tickCount = 100;
S.bankParams = Array.from({length:8},()=>Array.from({length:12},()=>new Array(8).fill(0)));
S.sessionView = false; S.activeBank = 1; S.bankSelectTick = S.tickCount; S.jogTouched = false;

/* ---- the candidates: 5 rows tall (the band is 7, glyphs sit at y=1), ≤7 wide ---- */
const G = {
  seq: {
    'note':      ['...#.', '...##', '...#.', '.###.', '.###.'],                 /* eighth note */
    'notes':     ['..####', '..#..#', '..#..#', '##..##', '##..##'],           /* beamed pair */
    'steps':     ['.......', '#.#.#.#', '.......', '#.###.#', '.......'],      /* a step row, one lit */
    'grid':      ['##.##', '##.##', '.....', '##.##', '##.##'],                 /* 2×2 pad block */
    'play':      ['#....', '###..', '#####', '###..', '#....'],                 /* transport triangle */
  },
  audio: {
    'sine':      ['.#.....', '#.#....', '#.#.#.#', '....#.#', '.....#.'],       /* one cycle */
    'speaker':   ['..#..#', '.##.#.', '###..#', '.##.#.', '..#..#'],            /* cone + waves */
    'bars':      ['....#', '..#.#', '..#.#', '#.#.#', '#.#.#'],                 /* rising EQ bars */
    'wave':      ['..#....', '.###.#.', '#######', '.###.#.', '..#....'],       /* waveform mirror */
    'meter':     ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#####'],                 /* level meter */
  },
  perf: {
    'knob':      ['.###.', '#..##', '#.#.#', '#...#', '.###.'],                 /* dial with pointer */
    'fader':     ['..#..', '.###.', '..#..', '..#..', '..#..'],                 /* vertical fader */
    'slider':    ['.....', '.....', '##.##', '#####', '.....'],                 /* horizontal fader */
    'faders':    ['#.#..', '#.###', '###.#', '#.#.#', '#.#.#'],                 /* two faders */
    'arc':       ['.###.', '#...#', '.....', '..#..', '..#..'],                 /* arc + pointer */
  },
};
function glyphW(rows) { return Math.max(...rows.map(r => r.length)); }
function drawGlyph(rows, x, y, col) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') globalThis.set_pixel(x + i, y + j, col); });
}
/* The proposed header: [glyph] NAME ................ TRn — filled band, 4x5 face,
 * no chevron. Mirrors drawKitHeader's geometry (band 7 rows, text at y=1). */
function layoutHeader(rows, name, trackLabel) {
  globalThis.fill_rect(0, 0, W, 7, 1);
  const gw = glyphW(rows);
  drawGlyph(rows, 2, 1, 0);
  fontPrint4x5(2 + gw + 3, 1, name, 0);
  const tw = fontWidth4x5(trackLabel);
  fontPrint4x5(W - 2 - tw, 1, trackLabel, 0);
}

const shots = [];
function card(cat, key, rows, bank, name) {
  S.activeBank = bank; globalThis.clear_screen(); render.drawUI();
  layoutHeader(rows, name, 'TR3');
  shots.push({ slug: `${cat}-${key}`, fb: fb.slice() });
}
/* one real card per category so the glyph is seen against its own bank */
for (const [k, rows] of Object.entries(G.seq))   card('seq',   k, rows, 1,  'NOTE FX');
for (const [k, rows] of Object.entries(G.audio)) card('audio', k, rows, 11, 'SOUND + CONFIG');
for (const [k, rows] of Object.entries(G.perf))  card('perf',  k, rows, 13, 'MACROS');

/* the CONTACT SHEET: every candidate's header band, labelled, one glance */
const ROWH = 11, LABW = 56, SW = LABW + W + 4;
const cats = [['seq', 'NOTE FX'], ['audio', 'SOUND + CONFIG'], ['perf', 'MACROS']];
const n = Object.values(G).reduce((a, g) => a + Object.keys(g).length, 0) + cats.length;
const SH = n * ROWH + 4;
const sheet = new Uint8Array(SW * SH);
const sput = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < SW && y >= 0 && y < SH) sheet[y * SW + x] = v ? 1 : 0; };
let ry = 2;
for (const [cat, name] of cats) {
  let cx = 2; for (const ch of cat.toUpperCase() + ':') cx += hostChar(ch, cx, ry + 1, 1, sput);
  ry += ROWH;
  for (const [k, rows] of Object.entries(G[cat])) {
    let lx = 6; for (const ch of k) lx += hostChar(ch, lx, ry + 1, 1, sput);
    globalThis.clear_screen(); layoutHeader(rows, name, 'TR3');
    for (let y = 0; y < 9; y++) for (let x = 0; x < W; x++) sput(LABW + x, ry + y, fb[y * W + x]);
    ry += ROWH;
  }
}

function writePng(fbuf, w, h, outPath) {
  const iw = w * SCALE + 2 * PAD, ih = h * SCALE + 2 * PAD; const img = Buffer.alloc(iw * ih * 4);
  for (let i = 0; i < iw * ih; i++) { img[i*4] = MAT[0]; img[i*4+1] = MAT[1]; img[i*4+2] = MAT[2]; img[i*4+3] = 255; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fbuf[y*w+x] ? ON : BG;
    for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) { const p = ((PAD+y*SCALE+sy)*iw+PAD+x*SCALE+sx)*4; img[p]=c[0]; img[p+1]=c[1]; img[p+2]=c[2]; img[p+3]=255; } }
  const crc32=(b)=>{let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;};
  const chunk=(t,d)=>{const ty=Buffer.from(t,'ascii');const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const body=Buffer.concat([ty,d]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(iw,0);ihdr.writeUInt32BE(ih,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(ih*(1+iw*4));
  for(let y=0;y<ih;y++){raw[y*(1+iw*4)]=0;img.copy(raw,y*(1+iw*4)+1,y*iw*4,(y+1)*iw*4);}
  writeFileSync(outPath,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
const outDir = process.argv[2] || '/tmp/dbx-glyphs';
mkdirSync(outDir, { recursive: true });
for (const s of shots) writePng(s.fb, W, H, outDir + '/' + s.slug + '.png');
writePng(sheet, SW, SH, outDir + '/SHEET.png');
console.log(shots.length + ' cards + SHEET → ' + outDir);
