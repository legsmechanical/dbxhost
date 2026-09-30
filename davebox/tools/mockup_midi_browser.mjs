// tools/mockup_midi_browser.mjs — PROPOSED screens for the one MIDI browser
// (Import MIDI and the phrase browser as one feature), drawn with the real kit
// primitives so what you see is what the build would draw. A proposal for
// review, not the implementation: every value here is hand-written.
//
//   node --import ./tools/audit_loader.mjs tools/mockup_midi_browser.mjs [outdir]
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
function hostChar(ch,x,y,col){const rows=HFONT[ch]??HFONT[ch.toUpperCase?.()]??null;if(!rows)return CELL+CS;const b=ink(rows);if(!b)return CELL+CS;
  for(let r=0;r<7;r++)for(let c=b.mn;c<=b.mx;c++)if(rows[r]&(1<<(4-c)))globalThis.set_pixel(x+(c-b.mn),y+r,col);return (b.mx-b.mn+1)+CS;}
globalThis.print=(x,y,s,col)=>{let cx=x|0;for(const ch of String(s))cx+=hostChar(ch,cx,y|0,col?1:0);};
globalThis.text_width=(s)=>{let w=0;for(const ch of String(s)){const rows=HFONT[ch]??null;const b=rows&&ink(rows);w+=(b?(b.mx-b.mn+1):CELL)+CS;}return w;};
for (const fn of ['host_write_file','host_read_file','host_file_exists','host_ensure_dir','host_state_subdir',
  'host_remove_dir','host_system_cmd','host_module_set_param','host_module_get_param','shadow_get_param','shadow_set_param',
  'host_send_midi','move_midi_inject_to_move','set_led','move_midi_internal_send','flush_display'])
  globalThis[fn] = () => 0;

const K = await import('../ui/ui_movy.mjs');
const shots = [];
const shoot = (slug) => shots.push({ slug, fb: fb.slice() });

/* ---- hand-made parts ---- */
function melodic(seed, bars) {
    const n = []; let s = seed;
    const r = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < bars * 384; t += 48) if (r() > 0.3) n.push({ t, g: 36 + Math.floor(r() * 3) * 24, row: Math.floor(r() * 9) });
    return { notes: n, rows: 9, ticks: bars * 384 };
}
function drums(bars) {
    const n = [];
    for (let t = 0; t < bars * 384; t += 48) {
        if (t % 192 === 0) n.push({ t, g: 24, row: 0 });            /* kick */
        if (t % 384 === 192) n.push({ t, g: 24, row: 1 });          /* snare */
        n.push({ t, g: 12, row: 2 });                               /* hat */
        if (t % 384 === 336) n.push({ t, g: 24, row: 3 });          /* open hat */
    }
    return { notes: n, rows: 4, ticks: bars * 384 };
}

/* ---- the proposed page ---- */
const STR = (t) => ({ kind: 'enumsq', label: 'Strch', name: 'Stretch', text: t || 'x1', options: ['/8','/4','/2','x1','x2','x4','x8'], sel: 3 });
const cellsMelodic = (o = {}) => [
    { kind: 'valsq', label: 'Start', name: 'Start Bar', text: o.start || '1', norm: 0 },
    { kind: 'valsq', label: 'Bars', name: 'Length', text: o.bars || '4', norm: 0.1 },
    { kind: 'enumsq', label: 'Grid', name: 'Grid', text: '1/16', options: ['1/32','1/16','1/8','1/4','1/2','1'], sel: 1 },
    STR(o.stretch),
    { kind: 'valsq', label: 'Oct', name: 'Octave', text: o.oct || '+0', strip: (o.oct || '+0'), norm: 0.5 },
    { kind: 'valsq', label: 'Semi', name: 'Semitones', text: o.semi || '+0', strip: (o.semi || '+0'), norm: 0.5 },
    { kind: 'pill', label: 'Scale', name: 'Fit to Scale', text: o.scale === false ? 'OFF' : 'ON', strip: o.scale === false ? 'OFF' : 'ON', norm: o.scale === false ? 0 : 1 },
    { kind: 'blank', label: '' },
];
const cellsDrum = () => [
    { kind: 'valsq', label: 'Start', name: 'Start Bar', text: '1', norm: 0 },
    { kind: 'valsq', label: 'Bars', name: 'Length', text: '2', norm: 0.05 },
    { kind: 'enumsq', label: 'Grid', name: 'Grid', text: '1/16', options: ['1/32','1/16','1/8','1/4','1/2','1'], sel: 1 },
    STR(),
    { kind: 'enumsq', label: 'Map', name: 'Drum Map', text: 'GM', strip: 'GM', options: ['Off','GM','Move'], sel: 1 },
    { kind: 'blank', label: '' },
    { kind: 'blank', label: '' },
    { kind: 'blank', label: '' },
];

/* THE LAYOUT (rev 2, Josh 2026-09-29): the FILE's name in the header, the
 * index on the right; K1-K4 as the bank page's own top row; one LANE showing
 * where the notes fall; and K5-K8 as small two-line cells (label over value),
 * one column per knob, over the knob it belongs to. Touching one inverts its
 * cell and names it in the header, with the value, as a touched cell does. */
function page({ header, right, sub, roll, cells, touched = -1, footer, playhead, blinkOff }) {
    globalThis.clear_screen();
    K.kitUseLayout('bank');
    const top = cells.slice(0, 4).concat([{ kind: 'blank', label: '' }, { kind: 'blank', label: '' },
                                          { kind: 'blank', label: '' }, { kind: 'blank', label: '' }]);
    const lower = touched >= 4 ? cells[touched] : null;
    const topTouched = touched >= 0 && touched < 4 ? touched : -1;
    if (!K.enumOverlayWouldDraw(top, topTouched)) {
        if (sub) K.mvPrint(Math.floor((128 - K.mvWidth(sub)) / 2), 34, sub, 1);
        else if (roll) {
            /* one lane: each note a 2px-tall mark where it falls, its length as its width */
            const px = (t) => 4 + Math.floor(t * 120 / roll.ticks);
            /* the window that will land (Start .. Start+Bars), bracketed as today;
             * notes outside it dotted */
            const win = roll.win || { from: 0, to: roll.ticks };
            for (const n of (blinkOff ? [] : roll.notes)) {
                const x0 = px(n.t), w = Math.max(2, px(n.t + n.g) - x0 - 1);
                const inside = n.t >= win.from && n.t < win.to;
                for (let x = x0; x < x0 + w; x++) for (let y = 35; y < 37; y++)
                    if (inside || ((x + y) & 1) === 0) set_pixel(x, y, 1);
            }
            for (const [cx, dir] of [[px(win.from), 1], [Math.min(123, px(win.to)), -1]]) {
                fill_rect(cx, 33, 1, 7, 1);
                fill_rect(dir > 0 ? cx : cx - 2, 33, 3, 1, 1);
                fill_rect(dir > 0 ? cx : cx - 2, 39, 3, 1, 1);
            }
            if (playhead != null) fill_rect(px(playhead), 34, 1, 5, 1);
        }
        for (let k = 4; k < 8; k++) {
            const c = cells[k]; if (!c || c.kind === 'blank') continue;
            const x0 = (k - 4) * 32, on = k === touched;
            if (on) fill_rect(x0 + 1, 41, 30, 15, 1);
            const lab = c.label.toUpperCase(), val = c.strip;
            K.mvPrint(x0 + Math.floor((32 - K.mvWidth(lab)) / 2), 43, lab, on ? 0 : 1);
            K.mvPrint(x0 + Math.floor((32 - K.mvWidth(val)) / 2), 50, val, on ? 0 : 1);
        }
    }
    K.drawKitBankPage(top, { headerText: lower ? lower.name.toUpperCase() : header,
                             headerRight: lower ? lower.text : right, touchedIdx: topTouched, footer });
}
function picker(rows, sel) {
    const X = 2, Y = 9, Wd = 124, h = K.MV_FOOTER_Y - 1 - Y;
    fill_rect(X, Y, Wd, h, 0); draw_rect(X, Y, Wd, h, 1);
    K.drawKitList(rows.map(r => ({ labelFont: 'small', ...r })), sel, { x: X + 1, w: Wd - 2, topY: Y + 3, h: h - 3, rowH: 7 });
}
const FOOT = [['JOG', 'FILE'], ['CLK', 'LOAD'], ['SHFT', 'MUTE']];

/* 1 — the page: a single-part file in the remembered folder, heard as you land on it */
page({ header: '(2) ACID LINE 2', right: '3/12', roll: melodic(7, 4), playhead: 520,
       cells: cellsMelodic(), footer: FOOT });
shoot('01-page-file');

/* 1a — Shift held: the click now mutes (the hint says what the click does) */
page({ header: '(2) ACID LINE 2', right: '3/12', roll: melodic(7, 4), playhead: 520,
       cells: cellsMelodic(), footer: [['CLK', 'MUTE']] });
shoot('01a-shift-held');

/* 1b — muted: nothing plays as you scroll; the header says so, the hint offers it back */
page({ header: '(2) ACID LINE 2', right: '3/12', roll: melodic(7, 4), blinkOff: true,
       cells: cellsMelodic(), footer: [['JOG', 'FILE'], ['CLK', 'LOAD'], ['SHFT', 'HEAR']] });
shoot('01b-muted');

/* 2 — turning the jog: the folder's list floats up (small font, six at a time) */
page({ header: '(2) BASS LINES/', right: '3/12', roll: melodic(7, 4),
       cells: cellsMelodic(), footer: FOOT });
picker([
    { label: '..' },
    { label: 'ACID LINE 1', value: '4Br' },
    { label: 'ACID LINE 2', value: '4Br' },
    { label: 'DUB SUB', value: '8Br' },
    { label: 'FUNK SONG', value: '3 PT >' },
    { label: 'OCTAVES', value: '2Br' },
], 2);
shoot('02-jog-list');

/* 4 — inside it: the SAME page, a part where a file would be, heard as you land on it */
page({ header: '(2) BASS', right: '2/3', roll: melodic(3, 8), playhead: 900,
       cells: cellsMelodic({ bars: '8' }), footer: FOOT });
shoot('04-inside-multipart');

/* 4a — the jog inside it: the SAME list, the parts where the files would be */
page({ header: '(2) FUNK SONG >', right: '2/3', roll: melodic(3, 8),
       cells: cellsMelodic({ bars: '8' }), footer: FOOT });
picker([
    { label: '..' },
    { label: 'LEAD', value: '8Br' },
    { label: 'BASS', value: '8Br' },
    { label: 'DRUMS', value: 'DRM 8Br' },
], 2);
shoot('04a-inside-list');

/* 4b — Bars touched: the brackets mark what will land; the rest is dotted */
{
    const r = melodic(7, 4); r.win = { from: 384, to: 384 * 3 };
    const c = cellsMelodic({ bars: '2', start: '2' });
    page({ header: '(2) ACID LINE 2', right: '2 CUT', roll: r, cells: c, touched: 1, footer: FOOT });
    shoot('04b-window');
}

/* 5 — Semi touched: the value large, the name in the header (the bank page's own touch) */
page({ header: '(2) ACID LINE 2', right: '3/12', roll: melodic(7, 4),
       cells: cellsMelodic({ semi: '-3' }), touched: 5, footer: FOOT });
shoot('05-touch-semi');

/* 6 — Scale OFF: the notes as written (Oct and Semi still apply) */
page({ header: '(2) ACID LINE 2', right: '3/12', roll: melodic(7, 4),
       cells: cellsMelodic({ scale: false }), touched: 6, footer: FOOT });
shoot('06-scale-off');

/* 7 — a drum track: K6 is the drum map; K7-K8 have nothing to do */
page({ header: '(1) AMEN 1', right: '2/9', roll: drums(2), playhead: 300,
       cells: cellsDrum(), footer: [['RTPAD', 'SOUND'], ['SHFT', 'MUTE']] });
shoot('07-drum-page');

/* 8 — a drum track, holding a sound on the right-hand pads: where each sound goes */
page({ header: '(1) AMEN 1', right: '2/9', roll: drums(2),
       cells: cellsDrum(), footer: [['TAP', 'LANE'], ['CLK', 'LOAD']] });
{
    const X = 2, Y = 9, Wd = 124, h = K.MV_FOOTER_Y - 1 - Y;
    fill_rect(X, Y, Wd, h, 0); draw_rect(X, Y, Wd, h, 1);
    const rows = [['KICK', 'PAD 1'], ['SNARE', 'PAD 2'], ['CL HAT', 'PAD 3'], ['OP HAT', '--']];
    const d = drums(2);
    rows.forEach(([nm, dest], i) => {
        const y = Y + 3 + i * 7, on = i === 1, c = on ? 0 : 1;
        if (on) fill_rect(X + 2, y - 1, Wd - 4, 7, 1);
        K.mvPrint(X + 5, y, nm, c); K.mvPrint(X + 38, y, dest, c);
        const rx = X + 66, rw = Wd - 70;
        for (const n of d.notes) if (n.row === i) fill_rect(rx + Math.floor(n.t * rw / d.ticks), y + 1, 1, 3, c);
    });
}
shoot('08-drum-sounds');

/* 9 — the current clip has notes: the header warns before the click (no confirm; Undo brings them back) */
page({ header: '(2) ACID LINE 2', right: 'REPLACES', roll: melodic(7, 4), cells: cellsMelodic(), footer: FOOT });
shoot('09-replace');

/* 10 — first time (no folder chosen yet): the user data folder, folders to walk into */
globalThis.clear_screen();
K.drawKitHeader('IMPORT MIDI', false);
K.drawKitList([{ label: 'Downloads/' }, { label: 'MIDI/' }, { label: 'UserLibrary/' }], 1, {});
K.drawKitHintRow(K.MV_FOOTER_Y, [['JOG', 'FOLDER'], ['CLK', 'OPEN']]);
shoot('10-first-open');

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
const outDir = process.argv[2] || 'mockups-midi-browser';
mkdirSync(outDir, { recursive: true });
for (const s of shots) { writePng(s.fb, outDir + '/' + s.slug + '.png'); console.log(s.slug); }
