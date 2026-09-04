// tools/preview_overviews.mjs — the TRACK OVERVIEW and SESSION VIEW as the
// device draws them, to PNG.
//
// ⚠ Drives the REAL drawUI(), not a replica of it. A preview that re-implements
// the screen answers a question about the preview: the fonts, the alignment and
// the truncation you see here are the shipping ones because they came out of
// the shipping code. Reuses audit_screens' host-font model of print() (the 5x7
// atlas, proportional, glyph-trimmed) for the same reason.
//
//   node --import ./tools/audit_loader.mjs tools/preview_overviews.mjs [outdir]
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

S.stateLoading = false; S.bootSplashMs = 0; S.awaitingProjectSelect = false;
S.ledInitComplete = true; S.activeTrack = 3; S.tickCount = 100;
S.bankParams = Array.from({length:8},()=>Array.from({length:12},()=>new Array(8).fill(0)));
S.bankParams[3][5][0] = 1;          /* Arp available, so the chip shows */
S.metronomeOn = 2;                  /* 'Play' */
S.instrAbbrev = 'OBXD';              /* the header's [instrument] cache, as the tick would fill it */
S.trackVelOverride[3] = 0;
S.scaleAware = true;
for (let t=0;t<8;t++){ S.trackActiveClip[t] = t % 4; S.clipNonEmpty[t][t%4] = true; }
S.trackClipPlaying[2] = true;
S.trackMuted[5] = true; S.trackSoloed[6] = true;

const shots = [];
function shoot(slug){ shots.push({slug, fb: fb.slice()}); }
function draw(slug){ globalThis.clear_screen(); render.drawUI(); shoot(slug); }

/* TRACK VIEW, idle on a clip bank — the overview with Oct / Arp / key+scale on
 * the info row and metro / velocity / Fix-Adap on the indicator row. */
S.sessionView = false; S.activeBank = 0; S.bankSelectTick = -1; S.jogTouched = false;
draw('track-overview');

/* TRACK VIEW with SHIFT held — the footer names the Shift chords. */
S.shiftHeld = true; draw('track-overview-shift'); S.shiftHeld = false;

/* BANK CARD, LATCHED — the flashing frame, both phases. */
S.sessionView = false; S.activeBank = 1; S.bankSelectTick = S.tickCount;
S.bankCardLatched = true;
S.tickCount = 0;  draw('latch-solid');
S.tickCount = 24; draw('latch-dashed');
S.bankCardLatched = false; S.tickCount = 100; S.bankSelectTick = -1;

/* BANK PICKER — Shift+jog in track view, over the track overview. */
S.sessionView = false; S.activeBank = 0; S.bankPickerSel = 6;
draw('bank-picker');
S.bankPickerSel = -1;

/* SESSION VIEW — the banner, the mixer-mode label, track row, scene letters. */
S.sessionView = true; S.sessKnobMode = 2;   /* SndA */
draw('session-overview');

/* SESSION VIEW while the transport runs — a collected Dave scrolls through the
 * banner window. The pick is random on device; pin it here so the render is
 * reproducible (frame 0, a quarter of the way down the first bar). */
S.playing = true; S.masterPos = 96; S.bannerDave = 0;
draw('session-overview-playing');

/* SESSION MIXER PAGES, latched (jog click from the overview): the fader row
 * and the pan arcs — bank-card chassis (glyph header, footer canon). */
S.playing = false; S.sessMixerLatched = true;
for (let t = 0; t < 8; t++) { S.sessVolSlots[t] = 1 << t; S.sessVolBus[t] = 0; S.sessVolLevel[t] = [1.0, 0.8, 1.2, 0.5, 1.0, 0.0, 1.5, 0.9][t]; }
S.trackRoute[6] = 2; S.trackMidiTo[6] = 3;      /* a routed track: the X box */
S.sessKnobMode = 0; draw('session-mixer-volume');
S.sessKnobMode = 1; for (let t = 0; t < 8; t++) S.sessVolLevel[t] = [0.5, 0.2, 0.8, 0.5, 0.65, 0.5, 0.5, 0.35][t];
draw('session-mixer-pan');
S.sessMixerLatched = false;

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
const outDir = process.argv[2] || '/tmp/dbx-overviews';
mkdirSync(outDir,{recursive:true});
for(const s of shots){ writePng(s.fb, outDir+'/'+s.slug+'.png'); console.log(s.slug); }
