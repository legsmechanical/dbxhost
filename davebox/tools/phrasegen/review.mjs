#!/usr/bin/env node
/* review — builds the curation page: every candidate phrase with its sound,
 * a picture of its hits (height = velocity), and Keep / Drop buttons whose
 * answers land in the page's shared store, where they are read back into
 * curation.json.
 *
 *   node tools/phrasegen/review.mjs <outdir> [cat…]
 *
 * Writes <outdir>/index.html and <outdir>/audio/<id>.wav (copied from
 * out/<cat>/, so run `render` first).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeNotes, isDrumCat, pitchInC } from './lib/phrase.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const [outDir, ...cats] = process.argv.slice(2);
if (!outDir) { console.error('usage: review.mjs <outdir> [cat…]'); process.exit(2); }
const list = (cats.length ? cats : ['hat', 'bass']);
mkdirSync(join(outDir, 'audio'), { recursive: true });

const GENRE_BPM = { HOUSE: 124, FUNK: 100, DNB: 172, '': 120 };
const groups = [];
for (const cat of list) {
    const ph = JSON.parse(readFileSync(join(HERE, 'cache', 'candidates', cat + '.json'), 'utf8'));
    for (const p of ph) copyFileSync(join(HERE, 'out', cat, p.id + '.wav'), join(outDir, 'audio', p.id + '.wav'));
    const rows = ph.map(p => {
        const n = decodeNotes(cat, p.n);
        return {
            id: p.id, name: p.name, g: p.g || 'BASIC', bars: p.bars, feel: p.feel,
            live: p.lic !== 'dAVEBOx', bpm: GENRE_BPM[p.g || ''] || 120,
            /* [tick, vel, gate, pitch] — pitch null for drums */
            n: n.map(x => [x.t, x.v, x.g, isDrumCat(cat) ? null : pitchInC(cat, p.mode, x)]),
        };
    });
    groups.push({ cat, rows });
}
const DATA = JSON.stringify(groups);

const html = `<title>Phrase Library Sample</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
:root{--bg:#f2f1ee;--panel:#fbfaf7;--ink:#1c1d20;--mute:#61646c;--line:#d8d6d0;--acc:#d2541f;--keep:#2f7d4f;--drop:#a23b3b;--hit:#1c1d20;--open:#d2541f;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15161a;--panel:#1d1f24;--ink:#eceae4;--mute:#9a9ca3;--line:#30333a;--acc:#f07a3f;--keep:#5bbd82;--drop:#e07272;--hit:#eceae4;--open:#f07a3f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#15161a;--panel:#1d1f24;--ink:#eceae4;--mute:#9a9ca3;--line:#30333a;--acc:#f07a3f;--keep:#5bbd82;--drop:#e07272;--hit:#eceae4;--open:#f07a3f;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.5 "IBM Plex Mono",ui-monospace,monospace;padding-inline:16px;padding-block:24px 64px;margin:0}
main{max-width:980px;margin:0 auto;display:grid;gap:28px}
h1{font:700 34px/1.05 "Barlow Condensed",system-ui,sans-serif;letter-spacing:.02em;margin:0;text-transform:uppercase}
h2{font:700 22px "Barlow Condensed",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;margin:0;display:flex;gap:12px;align-items:baseline}
h3{font:600 12px "IBM Plex Mono",monospace;letter-spacing:.12em;color:var(--mute);margin:14px 0 6px;text-transform:uppercase}
p{margin:0;max-width:72ch;color:var(--mute)}
.tally{font:500 16px "Barlow Condensed",sans-serif;color:var(--mute)}
.rows{display:grid;gap:6px}
.row{display:grid;grid-template-columns:44px minmax(9ch,14ch) 1fr auto;gap:12px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
.row.keep{border-color:var(--keep);box-shadow:inset 3px 0 0 var(--keep)}
.row.drop{opacity:.45}
.name{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{font-size:11px;color:var(--mute)}
.live{color:var(--acc)}
canvas{width:100%;height:44px;display:block}
button{font:600 13px "IBM Plex Mono",monospace;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:5px;padding:6px 10px;cursor:pointer}
button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.play{width:44px;height:36px;padding:0;font-size:16px}
.play.on{background:var(--acc);border-color:var(--acc);color:#fff}
.picks{display:flex;gap:6px}
.picks .k[aria-pressed="true"]{background:var(--keep);border-color:var(--keep);color:#fff}
.picks .d[aria-pressed="true"]{background:var(--drop);border-color:var(--drop);color:#fff}
.status{font-size:12px;color:var(--mute)}
@media (max-width:620px){.row{grid-template-columns:40px 1fr auto}.row canvas{grid-column:1/-1;order:5}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<main>
<header style="display:grid;gap:10px">
<h1>Phrase library — first sample</h1>
<p>Hats and bass across House, Funk and Drum &amp; Bass, plus plain basics. <span class="live">LIVE</span> phrases are real drummers from the Groove MIDI Dataset (CC BY 4.0); the rest are generated from the research. Each plays twice, with a soft kick on the beat for time; bass is in C. The sounds are deliberately plain — judge the rhythm, the velocities and the notes. Long hat notes stand for open hats.</p>
<p>Mark each one <b>Keep</b> or <b>Drop</b> — your picks are saved as you go and I read them back.</p>
<div class="status" id="status">Connecting…</div>
</header>
<div id="app"></div>
</main>
<script>
const GROUPS = ${DATA};
const picks = {};
let db = null;
const app = document.getElementById('app');
const status = document.getElementById('status');
let playing = null;

function draw(cv, r) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const span = r.bars * 384, x = t => t / span * w;
  g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 1;
  for (let s = 0; s <= r.bars * 16; s++) { const xx = Math.round(x(s * 24)) + .5; g.globalAlpha = s % 4 === 0 ? 1 : .35; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, h); g.stroke(); }
  g.globalAlpha = 1;
  const pitches = r.n.map(n => n[3]).filter(p => p != null);
  const lo = Math.min(...pitches), hi = Math.max(...pitches);
  for (const [t, v, gate, p] of r.n) {
    const open = p == null && gate >= 16;
    g.fillStyle = css.getPropertyValue(open ? '--open' : '--hit');
    if (p == null) { const bh = (v / 127) * (h - 4); g.fillRect(x(t) + 1, h - bh, Math.max(3, x(gate) * (open ? 1 : .6)), bh); }
    else { const y = hi === lo ? h / 2 : (1 - (p - lo) / (hi - lo)) * (h - 8) + 2; g.globalAlpha = .35 + .65 * v / 127; g.fillRect(x(t) + 1, y, Math.max(3, x(gate) - 1), 5); g.globalAlpha = 1; }
  }
}
function tally() {
  let k = 0, d = 0; for (const v of Object.values(picks)) v === true ? k++ : v === false ? d++ : 0;
  const total = GROUPS.reduce((a, gr) => a + gr.rows.length, 0);
  document.querySelectorAll('.tally').forEach(el => el.textContent = k + ' keep · ' + d + ' drop · ' + (total - k - d) + ' to go');
}
function setRow(id) {
  const el = document.getElementById('r-' + CSS.escape(id)); if (!el) return;
  const v = picks[id];
  el.classList.toggle('keep', v === true); el.classList.toggle('drop', v === false);
  el.querySelector('.k').setAttribute('aria-pressed', v === true); el.querySelector('.d').setAttribute('aria-pressed', v === false);
}
async function pick(id, keep) {
  picks[id] = picks[id] === keep ? null : keep;
  setRow(id); tally();
  if (!db) { status.textContent = 'Not saved — this view cannot store picks.'; return; }
  try { await db.collection('picks').doc(id).set({ keep: picks[id] }); status.textContent = 'Saved.'; }
  catch (e) { status.textContent = 'Could not save (' + (e && e.code || 'error') + ').'; }
}
function play(btn, id) {
  if (playing) { playing.a.pause(); playing.btn.classList.remove('on'); playing.btn.textContent = '▶'; if (playing.id === id) { playing = null; return; } }
  const a = new Audio('audio/' + id + '.wav');
  a.onended = () => { btn.classList.remove('on'); btn.textContent = '▶'; playing = null; };
  a.play().catch(() => {}); btn.classList.add('on'); btn.textContent = '■'; playing = { a, btn, id };
}
for (const gr of GROUPS) {
  const sec = document.createElement('section'); sec.style.display = 'grid'; sec.style.gap = '6px';
  sec.innerHTML = '<h2>' + gr.cat + ' <span class="tally"></span></h2>';
  let lastG = null, rows;
  for (const r of gr.rows) {
    if (r.g !== lastG) { const h = document.createElement('h3'); h.textContent = r.g === 'BASIC' ? 'Basics (no genre)' : r.g; sec.appendChild(h); rows = document.createElement('div'); rows.className = 'rows'; sec.appendChild(rows); lastG = r.g; }
    const row = document.createElement('div'); row.className = 'row'; row.id = 'r-' + r.id;
    row.innerHTML = '<button class="play" aria-label="Play ' + r.name + '">▶</button>'
      + '<div><div class="name">' + r.name + '</div><div class="meta">' + r.bars + ' bar' + (r.bars > 1 ? 's' : '') + ' · ' + r.feel + ' · ' + r.bpm + ' bpm' + (r.live ? ' · <span class="live">LIVE</span>' : '') + '</div></div>'
      + '<canvas aria-hidden="true"></canvas>'
      + '<div class="picks"><button class="k" aria-pressed="false">Keep</button><button class="d" aria-pressed="false">Drop</button></div>';
    row.querySelector('.play').onclick = (e) => play(e.currentTarget, r.id);
    row.querySelector('.k').onclick = () => pick(r.id, true);
    row.querySelector('.d').onclick = () => pick(r.id, false);
    rows.appendChild(row);
    requestAnimationFrame(() => draw(row.querySelector('canvas'), r));
  }
  app.appendChild(sec);
}
tally();
window.addEventListener('resize', () => { for (const gr of GROUPS) for (const r of gr.rows) { const el = document.getElementById('r-' + CSS.escape(r.id)); if (el) draw(el.querySelector('canvas'), r); } });
(async () => {
  const cl = window.claude && window.claude.use ? window.claude : null;
  db = cl ? await cl.use('db') : null;
  if (!db) { status.textContent = 'Listening only — picks cannot be saved in this view.'; return; }
  status.textContent = 'Picks are saved as you go.';
  db.collection('picks').onSnapshot((snap) => {
    for (const d of snap.docs) { const v = d.data(); picks[d.id] = v ? v.keep : null; setRow(d.id); }
    tally();
  }, (e) => { status.textContent = 'Saved picks unavailable (' + (e && e.code || 'error') + ').'; });
})();
</script>`;
writeFileSync(join(outDir, 'index.html'), html);
console.log('review page: ' + join(outDir, 'index.html') + ' (' + groups.reduce((a, g) => a + g.rows.length, 0) + ' phrases)');
