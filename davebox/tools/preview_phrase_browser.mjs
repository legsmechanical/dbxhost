// tools/preview_phrase_browser.mjs — the phrase library's screen as the device
// draws it, to PNG (the real pbRender, the real kit), plus one contact sheet.
//
//   node --import ./tools/audit_loader.mjs tools/preview_phrase_browser.mjs <library dir> [outdir]
//
// <library dir> holds <cat>.json library files; they are served as the
// shipped library.
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


const LIBDIR = process.argv[2];
const { S } = await import('../ui/ui_state.mjs');
const PB = await import('../ui/ui_phrase_browser.mjs');
const { readdirSync } = await import('node:fs');
const served = {};
for (const f of readdirSync(LIBDIR)) if (f.endsWith('.json')) served[PB.PB_SHIPPED_DIR + '/' + f] = readFileSync(LIBDIR + '/' + f, 'utf8');
globalThis.host_file_exists = (p) => p in served;
globalThis.host_read_file = (p) => served[p] || '';
S.stateLoading = false; S.ledInitComplete = true; S.tickCount = 100; S.padKey = 0; S.padScale = 1;

const shots = [];
const shoot = (slug) => shots.push({ slug, fb: fb.slice() });
const draw = (slug, touched, shift) => { globalThis.clear_screen(); PB.pbRender(touched ?? -1, !!shift); shoot(slug); };

S.trackPadMode[2] = 0; S.trackActiveClip[2] = 0; S.clipNonEmpty[2][0] = false; S.activeTrack = 2;
S.knobTouched = -1;
PB.pbOpen(2);
for (let i = 0; i < 4; i++) PB.pbOnJog(1);
PB.pbOnClick(false);
draw('1-bass-page');
PB.pbOnJog(1);
draw('2-bass-picker');
PB.pbOnClick(false);
draw('3-touch-type', 0);
draw('4-touch-style', 1);
S.clipNonEmpty[2][0] = true; PB.pbOnClick(false);
draw('5-replace-confirm');
PB.pbClose();

S.trackPadMode[1] = 1; S.trackActiveClip[1] = 0; S.activeTrack = 1; S.activeDrumLane[1] = 2;
S.drumLaneNote[1] = Array.from({ length: 32 }, (_, l) => 36 + l);
PB.pbOpen(1);
while (PB.pbStateForTest().cats[PB.pbStateForTest().catIdx] !== 'hat') PB.pbOnKnob(0, 12);
const st = PB.pbStateForTest();
const multi = st.list.findIndex(p => p.pads && p.pads.length >= 3);
while (st.idx < multi) PB.pbOnJog(1);
if (st.picker) PB.pbOnClick(false);   /* close the picker, if the jog opened it */
draw('6-hat-multi-page');
PB.pbPadTap(4); draw('7-holding-sound');
PB.pbPadTap(1); draw('7b-holding-placed'); PB.pbPadRelease(4);
PB.pbOnJog(1);
draw('8-hat-picker');
PB.pbClose();

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

const outDir = process.argv[3] || '/tmp/dbx-phrase-browser';
mkdirSync(outDir, { recursive: true });
for (const s of shots) { writePng(s.fb, outDir + '/' + s.slug + '.png'); console.log(s.slug); }
