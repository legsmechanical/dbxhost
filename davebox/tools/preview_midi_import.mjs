// tools/preview_midi_import.mjs — IMPORT MIDI's four stages as the
// device draws them, to PNG (the real miRender, the real kit).
//
// ⚠ Drives the REAL drawUI(), not a replica of it. A preview that re-implements
// the screen answers a question about the preview: the fonts, the alignment and
// the truncation you see here are the shipping ones because they came out of
// the shipping code. Reuses audit_screens' host-font model of print() (the 5x7
// atlas, proportional, glyph-trimmed) for the same reason.
//
//   node --import ./tools/audit_loader.mjs tools/preview_midi_import.mjs [outdir]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 128, H = 64, SCALE = 4, PAD = 8;
const ON = [235,238,245], BG = [14,16,22], MAT = [30,33,42];
let fb = new Uint8Array(W*H);
globalThis.set_pixel = (x,y,v)=>{x|=0;y|=0;if(x>=0&&x<W&&y>=0&&y<H)fb[y*W+x]=v?1:0;};
globalThis.fill_rect = (x,y,w,h,v)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)globalThis.set_pixel(x+i,y+j,v);};
globalThis.draw_rect = (x,y,w,h,v)=>{globalThis.fill_rect(x,y,w,1,v);globalThis.fill_rect(x,y+h-1,w,1,v);globalThis.fill_rect(x,y,1,h,v);globalThis.fill_rect(x+w-1,y,1,h,v);};
globalThis.clear_screen = ()=>{fb.fill(0);};

/* the device 5x7 host font, exactly as audit_screens models it */
const HFONT = JSON.parse(readFileSync(new URL('./host_font_5x7.json', import.meta.url)));
const CS = 1, CELL = 5;
const ink = (rows)=>{let mn=5,mx=-1;for(const b of rows)for(let x=0;x<5;x++)if(b&(1<<(4-x))){if(x<mn)mn=x;if(x>mx)mx=x;}return mx<0?null:{mn,mx};};
function hostChar(ch,x,y,col){const rows=HFONT[ch]??HFONT[ch.toUpperCase?.()]??null;if(!rows)return CELL+CS;const b=ink(rows);if(!b)return CELL+CS;
  for(let r=0;r<7;r++)for(let c=b.mn;c<=b.mx;c++)if(rows[r]&(1<<(4-c)))globalThis.set_pixel(x+(c-b.mn),y+r,col);return (b.mx-b.mn+1)+CS;}
globalThis.print=(x,y,s,col)=>{let cx=x|0;for(const ch of String(s))cx+=hostChar(ch,cx,y|0,col?1:0);};
globalThis.text_width=(s)=>{let w=0;for(const ch of String(s)){const rows=HFONT[ch]??null;const b=rows&&ink(rows);w+=(b?(b.mx-b.mn+1):CELL)+CS;}return w;};

let PARAMS = {};
globalThis.shadow_get_param = (slot,key)=>PARAMS[key]??'';
globalThis.shadow_set_param = ()=>1;
globalThis.shadow_send_midi_to_dsp = ()=>{};
for (const fn of ['host_write_file','host_read_file','host_file_exists','host_ensure_dir','host_state_subdir',
  'host_remove_dir','host_system_cmd','host_module_set_param','host_module_get_param',
  'host_send_midi','move_midi_inject_to_move','set_led','move_midi_internal_send',
  'host_vol_block','host_edit_cc_block','host_ext_midi_remap_clear','host_ext_midi_remap_set',
  'host_ext_midi_remap_enable','host_register_primary','flush_display','host_exit_module'])
  globalThis[fn] = () => 0;
globalThis.host_module_get_param = () => '';
globalThis.host_read_file = () => '';

const { S } = await import('../ui/ui_state.mjs');
const MI = await import('../ui/ui_midi_import.mjs');
S.stateLoading = false; S.ledInitComplete = true; S.tickCount = 100;

/* ---- a file: format 1 — a tempo track, a melody, a bass line (12 bars) ---- */
function vlq(n) { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; }
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];
function trackOf(notes, name, ch) {
  const ev = []; for (const n of notes) { ev.push([n.t, 0x90 | ch, n.p, n.v], [n.t + n.g, 0x80 | ch, n.p, 0]); }
  ev.sort((a, b) => a[0] - b[0]);
  const b = [0, 0xff, 0x03, name.length, ...ascii(name)]; let last = 0;
  for (const [t, ...x] of ev) { b.push(...vlq(t - last), ...x); last = t; }
  b.push(0, 0xff, 0x2f, 0); return chunk('MTrk', b);
}
function walk(seed, bars, lo, hi, density, step) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = []; let p = (lo + hi) >> 1;
  for (let t = 0; t < bars * 384; t += step) if (rnd() < density) {
    p = Math.max(lo, Math.min(hi, p + Math.round((rnd() - 0.5) * 7)));
    out.push({ t, g: step * (1 + (rnd() * 2 | 0)), p, v: 90 + (rnd() * 30 | 0) }); }
  return out;
}
const SONG = Uint8Array.from([...chunk('MThd', [0, 1, 0, 3, 0, 96]),
  ...chunk('MTrk', [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0]),
  ...trackOf(walk(7, 12, 60, 79, 0.7, 48), 'Right Hand', 0),
  ...trackOf(walk(3, 12, 36, 48, 0.5, 96), 'Left Hand', 1)]);
const D = []; for (let b = 0; b < 4; b++) { for (let q = 0; q < 4; q++) D.push({ t: b*384+q*96, g: 24, p: 36, v: 110 });
  D.push({ t: b*384+96, g: 24, p: 38, v: 100 }, { t: b*384+288, g: 24, p: 38, v: 100 });
  for (let e = 0; e < 8; e++) D.push({ t: b*384+e*48, g: 24, p: 42, v: 80 }); }
D.push({ t: 0, g: 24, p: 20, v: 90 }, { t: 768, g: 24, p: 20, v: 90 });   /* a pitch no pad plays */
const BEAT = Uint8Array.from([...chunk('MThd', [0, 0, 0, 1, 0, 96]), ...trackOf(D, 'Groove', 9)]);

const FILES = { '/data/UserData/Bach Invention 8.mid': SONG, '/data/UserData/Groove 3.mid': BEAT };
const DIRS = new Set(['/data/UserData/Downloads', '/data/UserData/UserLibrary']);
globalThis.__auditReaddir = (p) => p === '/data/UserData'
  ? ['Downloads', 'UserLibrary', 'schwung', 'dbx-host', 'Bach Invention 8.mid', 'Groove 3.mid', 'readme.txt'] : [];
globalThis.__auditStat = (p) => DIRS.has(p) || p.endsWith('/schwung') || p.endsWith('/dbx-host') ? { mode: 0o040000, size: 0 }
  : FILES[p] ? { mode: 0o100000, size: FILES[p].length } : p.endsWith('.txt') ? { mode: 0o100000, size: 90 } : null;
globalThis.__auditOpen = (p) => { const b = FILES[p]; if (!b) return null; let pos = 0;
  return { read(buf, off, len) { const n = Math.min(len, b.length - pos); new Uint8Array(buf, off, n).set(b.subarray(pos, pos + n)); pos += n; return n; }, close() {} }; };

const shots = [];
const shoot = (slug) => shots.push({ slug, fb: fb.slice() });
const draw = (slug, touched, shift) => { globalThis.clear_screen(); MI.miRender(touched ?? -1, !!shift); shoot(slug); };
const tick = (n) => { for (let i = 0; i < (n || 1); i++) MI.miTick(true, MI.miStateForTest().track); };
const pick = (label) => { const b = MI.miStateForTest().browser; b.selectedIndex = b.items.findIndex(i => i.label === label); MI.miOnClick(false); tick(3); };
const knob = (k, steps) => MI.miOnKnob(k, steps * (k < 2 ? 6 : 12));

S.trackPadMode[2] = 0; S.trackActiveClip[2] = 0; S.clipNonEmpty[2][0] = false;
MI.miOpen(2);
draw('1-files');
pick('Bach Invention 8.mid');
draw('2-tracks');
MI.miOnClick(false);                         /* Right Hand → options */
draw('3-options-fits');
knob(0, 2); knob(1, -4);                     /* start bar 3, 8 bars */
draw('4-options-cut');
draw('5-options-touch-start', 0);
draw('5b-options-shift-held', -1, true);
S.clipNonEmpty[2][0] = true; MI.miOnBack(); MI.miOnClick(false); knob(0, 2); knob(1, -4);
while (MI.miStateForTest().choices[MI.miStateForTest().toIdx] !== 0) knob(3, -1);
draw('6-options-replace');
draw('7-options-touch-to', 3);
MI.miOnClick(false);
draw('8-confirm');
MI.miClose();

S.trackPadMode[1] = 1; S.trackActiveClip[1] = 0; S.drumClipNonEmpty[1][0] = false;
S.drumLaneNote[1] = Array.from({ length: 32 }, (_, l) => 36 + l);
MI.miOpen(1); pick('Groove 3.mid');
draw('9-drums-no-pad');
MI.miClose();
function writePng(fbuf,outPath){
  const iw=W*SCALE+2*PAD, ih=H*SCALE+2*PAD; const img=Buffer.alloc(iw*ih*4);
  for(let i=0;i<iw*ih;i++){img[i*4]=MAT[0];img[i*4+1]=MAT[1];img[i*4+2]=MAT[2];img[i*4+3]=255;}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const c=fbuf[y*W+x]?ON:BG;
    for(let sy=0;sy<SCALE;sy++)for(let sx=0;sx<SCALE;sx++){const p=((PAD+y*SCALE+sy)*iw+PAD+x*SCALE+sx)*4;img[p]=c[0];img[p+1]=c[1];img[p+2]=c[2];img[p+3]=255;}}
  const crc32=(b)=>{let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;};
  const chunk=(t,d)=>{const ty=Buffer.from(t,'ascii');const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const body=Buffer.concat([ty,d]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(iw,0);ihdr.writeUInt32BE(ih,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(ih*(1+iw*4));
  for(let y=0;y<ih;y++){raw[y*(1+iw*4)]=0;img.copy(raw,y*(1+iw*4)+1,y*iw*4,(y+1)*iw*4);}
  writeFileSync(outPath,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
const outDir = process.argv[2] || '/tmp/dbx-midi-import';
mkdirSync(outDir,{recursive:true});
for(const s of shots){ writePng(s.fb, outDir+'/'+s.slug+'.png'); console.log(s.slug); }
