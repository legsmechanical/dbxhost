// tools/build_manual_html.mjs — build the dAVEBOx SA user manual as ONE self-contained HTML page.
//
// The page is GENERATED from the manual draft (docs/working/MANUAL-SA.draft.md), the same source
// the browser Help site is generated from, so it cannot drift from the manual. Never hand-edit the
// output: edit the draft and rebuild.
//
// Screens come from tools/render_manual_screens.mjs, which drives the REAL draw code off-device.
// Each screen names the manual heading it illustrates and is placed under that heading.
//
//   node --import ./tools/audit_loader.mjs tools/render_manual_screens.mjs /tmp/screens
//   node tools/build_manual_html.mjs --screens /tmp/screens/screens.json --out docs/manual/index.html
//
// No dependencies: the markdown renderer below is a deliberate SUBSET sized to this manual
// (headings, paragraphs, nested lists, tables, blockquotes, fences, inline bold/italic/code/links,
// inline <img>). Widen it rather than de-formatting the manual.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const SRC = resolve(ROOT, opt('--src', 'docs/working/MANUAL-SA.draft.md'));
const OUT = resolve(ROOT, opt('--out', 'docs/manual/index.html'));
const SCREENS = opt('--screens', null);

/* The manual's chapters, grouped into the parts the sidebar shows. Chapter numbers are the
 * manual's own; a chapter missing from this table lands in the last part rather than vanishing. */
const PARTS = [
    { title: 'Getting started', chapters: [1, 2, 3] },
    { title: 'Making clips', chapters: [4, 5, 6, 7, 8] },
    { title: 'Shaping clips', chapters: [9, 10, 11] },
    { title: 'Playing live', chapters: [12, 13] },
    { title: 'Sound & routing', chapters: [14, 15] },
    { title: 'Getting it out', chapters: [16] },
    { title: 'Setup', chapters: [17, 18] },
    { title: 'Reference', chapters: [19] },
];

/* Hardware BUTTONS are drawn as keycaps — the labelled ones on the panel, plus the step buttons,
 * the jog and the Volume knob. One rule everywhere: inside a bold gesture and in a table's control
 * column, each button name becomes a keycap and every other word stays plain text, so "Shift" looks
 * the same alone as it does in "Shift + Step 2" or "Mute + touch knob 1–8".
 * ⚠ The same words also name things that are NOT buttons: automation operations (Delete, Mute,
 * Loop), menu rows (Delete, Copy), a CLIP knob (Shift). A bold run in a list of other bold names
 * (a sentence or bullet that also bolds a non-button word) or in a knob table stays bold. */
const BUTTON_WORDS = ['Note/Session', 'Shift', 'Back', 'Play', 'Record', 'Loop', 'Capture', 'Sample',
    'Mute', 'Delete', 'Copy', 'Undo', 'Volume', 'Menu'];
const BUTTON_RE = new RegExp('(^|[^\\w/])(' + [
    'Note/Session', 'Steps? \\d+(?:\\s?[–-]\\s?\\d+)?', '[Jj]og(?: wheel)?', '\\+ ?/ ?[−-]', 'Left ?/ ?Right',
    ...BUTTON_WORDS.filter((w) => w !== 'Note/Session'),
].join('|') + ')(?![\\w/])', 'g');
const LONE_SIGN = /^[+−]$/;
const isButtonWord = (w) => { BUTTON_RE.lastIndex = 0; const m = BUTTON_RE.exec(' ' + w); return !!m && m[2].length === w.length; };

/* Mark the buttons in an ESCAPED run of text; returns null when there are none. */
function markButtons(escText) {
    let hit = false;
    const parts = escText.split(/(\s\+\s)/);
    const out = parts.map((part, i) => {
        if (i % 2) return ' <span class="kjoin">+</span> ';
        if (LONE_SIGN.test(part.trim())) { hit = true; return `<kbd>${part.trim()}</kbd>`; }
        BUTTON_RE.lastIndex = 0;
        return part.replace(BUTTON_RE, (m, pre, w) => { hit = true; return `${pre}<kbd>${w}</kbd>`; });
    }).join('');
    return hit ? out : null;
}

/* ───────────────────────── markdown subset ───────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

function slugify(text, used) {
    // GitHub's anchor rule, so the manual's own #links keep working.
    let s = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
    if (used) {
        const base = s; let n = 0;
        while (used.has(s)) s = base + '-' + (++n);
        used.add(s);
    }
    return s;
}

function inline(src, opts = { gestures: true }) {
    // Code spans first, stashed so nothing inside them is reinterpreted.
    const stash = [];
    const put = (html) => { stash.push(html); return `\u0000${stash.length - 1}\u0000`; };
    let s = src.replace(/`([^`]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`));
    s = s.replace(/<img\s[^>]*>/g, (m) => put(m));
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
        const ext = /^https?:/.test(href);
        let h = href;
        if (/^(MANUAL|QUICKSTART)\.md$/.test(href))
            h = 'https://github.com/legsmechanical/dbxhost/blob/main/davebox/' + href;
        return `<a href="${escAttr(h)}"${ext || h !== href ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    });
    // A bold run beside other bold NAMES that aren't buttons is a list of names (operations, menu
    // rows), not a gesture — those keep plain bold.
    const bolds = [...s.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);
    const nameList = bolds.filter((b) => !markButtons(b)).length >= 2;
    s = s.replace(/\*\*([^*]+)\*\*/g, (m, b, at, whole) => {
        // …and within such a block, a lone button word is a NAME only when it sits in the list itself:
        // right beside another bold run, or after a comma ("…), **Loop** (its own loop length)").
        const before = whole.slice(Math.max(0, at - 10), at), after = whole.slice(at + m.length, at + m.length + 10);
        const inList = /(,|\/|\band)\s*$/.test(before) && /(\*\*|\))\s*(,|\/|\band)\s*$/.test(before)
            || /^\s*(,|\/|and\b)\s*\*\*/.test(after);
        const k = !opts.gestures || (nameList && isButtonWord(b) && inList) ? null : markButtons(b);
        return k ? `<span class="keys">${k}</span>` : `<strong>${b}</strong>`;
    });
    s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

/* Parse the draft into blocks: {type:'h',level,text} · {type:'p',text} · {type:'list',ordered,items}
 * · {type:'table',head,rows} · {type:'quote',blocks} · {type:'code',text} · {type:'hr'} · {type:'img',html} */
function parseBlocks(lines) {
    const out = [];
    let i = 0;
    const isBlank = (l) => /^\s*$/.test(l);
    const startsBlock = (l) => /^(#{1,6} |> ?|```|\||---+\s*$|<img\s|<\/?(details|summary)|\s*[-*] |\s*\d+\. )/.test(l);
    while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) { i++; continue; }
        let m;
        if ((m = /^(#{1,6}) (.*)$/.exec(l))) { out.push({ type: 'h', level: m[1].length, text: m[2].trim() }); i++; continue; }
        if (/^---+\s*$/.test(l)) { out.push({ type: 'hr' }); i++; continue; }
        if (l.startsWith('```')) {
            const buf = []; i++;
            while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
            i++; out.push({ type: 'code', text: buf.join('\n') }); continue;
        }
        if (/^<img\s/.test(l)) { out.push({ type: 'img', html: l.trim() }); i++; continue; }
        if (/^<\/?(details|summary)[\s>]/.test(l)) {
            // A collapsible block: pass the tags through; the summary's inline text is rendered.
            const sm = /^<summary>(.*)<\/summary>\s*$/.exec(l.trim());
            out.push({ type: 'raw', html: sm ? `<summary>${inline(sm[1].replace(/<\/?b>/g, '**'))}</summary>` : l.trim() });
            i++; continue;
        }
        if (/^> ?/.test(l)) {
            const buf = [];
            while (i < lines.length && /^> ?/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ''));
            out.push({ type: 'quote', blocks: parseBlocks(buf) }); continue;
        }
        if (l.startsWith('|')) {
            const rows = [];
            while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
            const cells = (r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
            const head = cells(rows[0]);
            const body = rows.slice(2).map(cells);
            out.push({ type: 'table', head, rows: body }); continue;
        }
        if ((m = /^(\s*)([-*]|\d+\.) /.exec(l))) {
            const r = parseList(lines, i, m[1].length); out.push(r.block); i = r.next; continue;
        }
        const buf = [l.trim()]; i++;
        while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) buf.push(lines[i++].trim());
        out.push({ type: 'p', text: buf.join(' ') });
    }
    return out;
}

function parseList(lines, i, indent) {
    const ordered = /^\s*\d+\. /.test(lines[i]);
    const items = [];
    while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.) (.*)$/.exec(lines[i]);
        if (!m || m[1].length !== indent) break;
        const text = [m[3].trim()];
        const children = [];
        i++;
        while (i < lines.length) {
            const l = lines[i];
            if (/^\s*$/.test(l)) {
                // A blank line ends the list unless the next line continues it at this indent or deeper.
                const n = lines[i + 1];
                if (n && (/^\s*([-*]|\d+\.) /.test(n) ? /^(\s*)/.exec(n)[1].length >= indent : /^\s+/.test(n) && /^(\s*)/.exec(n)[1].length > indent)) { i++; continue; }
                break;
            }
            const sub = /^(\s*)([-*]|\d+\.) /.exec(l);
            if (sub && sub[1].length > indent) { const r = parseList(lines, i, sub[1].length); children.push(r.block); i = r.next; continue; }
            if (sub) break;
            if (/^\s+/.test(l) || !/^(#|>|\||```)/.test(l)) { text.push(l.trim()); i++; continue; }
            break;
        }
        items.push({ text: text.join(' '), children });
    }
    return { block: { type: 'list', ordered, items }, next: i };
}

/* ───────────────────────── screens ───────────────────────── */

const OLED_ON = [226, 236, 255];
function pngFromFb(fbBytes) {
    // 1x RGBA, off-pixels transparent: the page's bezel shows through, CSS scales it pixelated.
    const W = 128, H = 64;
    const raw = Buffer.alloc(H * (1 + W * 4));
    for (let y = 0; y < H; y++) {
        raw[y * (1 + W * 4)] = 0;
        for (let x = 0; x < W; x++) {
            const on = (fbBytes[y * 16 + (x >> 3)] >> (7 - (x & 7))) & 1;
            const p = y * (1 + W * 4) + 1 + x * 4;
            if (on) { raw[p] = OLED_ON[0]; raw[p + 1] = OLED_ON[1]; raw[p + 2] = OLED_ON[2]; raw[p + 3] = 255; }
        }
    }
    const crc32 = (buf) => { let c = ~0; for (let k = 0; k < buf.length; k++) { c ^= buf[k]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (type, data) => { const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([t, data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
    return 'data:image/png;base64,' + png.toString('base64');
}

const normHeading = (t) => t.toLowerCase().replace(/^[\d.]+\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* ⭐ THE SCREENS THE MANUAL SHOWS — chosen one by one, not "everything the renderer makes".
 * A screen earns a place only if it shows the reader something the text can't: a screen's layout
 * the first time they meet it, or a picture (bars, a grid, a chooser strip, bracketed notes).
 * Left out on purpose: confirm and warning dialogs, notices and pop-ups (they explain themselves),
 * near-duplicates (a second overview with another bank name), and bank pages whose knobs the table
 * beside them already lists (Josh, 2026-09-26: "give careful consideration to each screen shot used
 * and ask whether it serves a clear purpose"). The renderer still draws them all, for audits. */
const MANUAL_SCREENS = new Set([
    'projects-other',          // the project picker
    'menu-project-settings',   // the first list the reader meets
    'track-melodic-playing',   // Track View
    'bank-chord-slot',         // editing a held chord
    'step-editor-melodic',     // the note editor
    'capture-tempo',           // the tempo chooser and its take strip
    'track-drum',              // the drum overview
    'bank-cond-responder',     // which tracks follow
    'bank-cond-octave',        // per-track octaves
    'bank-clip',               // a bank page: eight knobs, eight cells
    'bank-repeat-groove',      // the groove bars
    'bank-automation',         // the list of what's automated
    'session-overview',        // Session View
    'session-mixer-volume',    // the session mixer
    'perf-mode-mods',          // Performance Mode with mods engaged
    'sound-card',              // the SOUND + CONFIG door
    'track-config',            // the TRACK CONFIG menu
    'instrument-picker',       // the Instmt/Dest picker
    'block-editor',            // a module's own editor
    'macros-card',             // the MACROS bank
    'macros-multi',            // one knob, several targets
    'snapmorph-slots',         // the order snapshots are picked in
    'import-options',          // the import knobs and the part's picture
]);
let screens = [];
if (SCREENS) {
    screens = JSON.parse(readFileSync(resolve(SCREENS), 'utf8')).filter((s) => MANUAL_SCREENS.has(s.slug));
    const missing = [...MANUAL_SCREENS].filter((slug) => !screens.some((s) => s.slug === slug));
    if (missing.length) { console.error('[manual] the renderer no longer makes: ' + missing.join(', ')); process.exit(1); }
    for (const s of screens) s.src = pngFromFb(Buffer.from(s.fb, 'base64'));
}
const screensBySection = new Map();
for (const s of screens) {
    const k = normHeading(s.section || '');
    if (!screensBySection.has(k)) screensBySection.set(k, []);
    screensBySection.get(k).push(s);
}
const placedScreens = new Set();

function figureHtml(list) {
    const figs = list.map((s) => `<figure class="oled"><div class="bezel"><img src="${s.src}" width="128" height="64" alt="${escAttr(s.title + (s.caption ? ': ' + s.caption : ''))}"></div>` +
        `<figcaption><span class="ftitle">${esc(s.title)}</span>${s.caption ? ' ' + inline(s.caption) : ''}</figcaption></figure>`).join('');
    return `<div class="figs${list.length > 1 ? ' multi' : ''}">${figs}</div>`;
}

/* An <img> in the draft. Three kinds:
 *  - an SVG diagram — inlined, so its currentColor strokes follow the page's theme;
 *  - a browser screenshot (img/web-*.png) — framed as a photo;
 *  - an old OLED screenshot — dropped: every OLED picture comes from the renderer, drawn by the
 *    real UI, and a committed PNG is exactly the kind of copy that goes stale. */
function draftImgHtml(tag) {
    const src = /src="([^"]+)"/.exec(tag)?.[1];
    const alt = /alt="([^"]*)"/.exec(tag)?.[1] || '';
    const path = src && resolve(dirname(SRC), src);
    if (!path || !existsSync(path)) { console.warn('[manual] missing image: ' + src); return ''; }
    const cap = alt ? `<figcaption>${esc(alt)}</figcaption>` : '';
    if (/\.svg$/i.test(src)) {
        const svg = readFileSync(path, 'utf8').replace(/<\?xml[^>]*>\s*/, '').replace(/<svg\b/, `<svg role="img" aria-label="${escAttr(alt)}"`);
        return `<div class="figs"><figure class="diagram">${svg}${cap}</figure></div>`;
    }
    if (/(^|\/)web-[^/]*\.png$/i.test(src)) {
        const data = 'data:image/png;base64,' + readFileSync(path).toString('base64');
        return `<div class="figs"><figure class="shot"><img src="${data}" alt="${escAttr(alt)}" loading="lazy">${cap}</figure></div>`;
    }
    return '';
}

/* ───────────────────────── render ───────────────────────── */

const draft = readFileSync(SRC, 'utf8')
    .replace(/<!-- DRAFT-BANNER-START -->[\s\S]*?<!-- DRAFT-BANNER-END -->\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '');
const blocks = parseBlocks(draft.split('\n'));

function renderList(b) {
    const tag = b.ordered ? 'ol' : 'ul';
    return `<${tag}>` + b.items.map((it) => `<li>${inline(it.text)}${it.children.map(renderList).join('')}</li>`).join('') + `</${tag}>`;
}

function renderTable(b) {
    const head = b.head.map((h) => h.replace(/\*/g, ''));
    const ctrlCols = head.map((h) => /^(control|gesture|press|step)\b/i.test(h));
    const knobTable = head.some((h) => /^on screen$/i.test(h));   // a bank's knob table: bold names are parameters
    const cell = (c, j) => {
        if (ctrlCols[j]) { const k = markButtons(esc(c)); if (k) return `<span class="keys">${k}</span>`; }
        return inline(c, { gestures: !knobTable });
    };
    return `<div class="tablewrap"><table><thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>` +
        b.rows.map((r) => `<tr>${r.map((c, j) => `<td>${cell(c, j)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>';
}

function renderQuote(b) {
    const first = b.blocks[0];
    const t = first && first.type === 'p' ? first.text : '';
    let kind = 'note', label = 'Note';
    if (/^\*\*Like Move:?\*\*/i.test(t)) { kind = 'likemove'; label = 'Like Move'; first.text = t.replace(/^\*\*Like Move:?\*\*:?\s*/i, ''); }
    else if (/^(⚠️?|\*\*⚠)/.test(t)) { kind = 'warn'; label = 'Careful'; first.text = t.replace(/^⚠️?\s*/, ''); }
    else if (/^🚀/.test(t)) { kind = 'tip'; label = 'New here?'; first.text = t.replace(/^🚀\s*(\*\*New here\?\*\*)?\s*/, ''); }
    else if (/^\*\*Tip:?\*\*/i.test(t)) { kind = 'tip'; label = 'Tip'; first.text = t.replace(/^\*\*Tip:?\*\*:?\s*/i, ''); }
    return `<aside class="callout ${kind}"><div class="clabel">${label}</div>${renderBlocks(b.blocks)}</aside>`;
}

function renderBlocks(bs) {
    return bs.map((b) => {
        switch (b.type) {
        case 'p': {
            if (/^⚠/.test(b.text)) return `<aside class="callout warn"><div class="clabel">Careful</div><p>${inline(b.text.replace(/^⚠️?\s*/, ''))}</p></aside>`;
            return `<p>${inline(b.text)}</p>`;
        }
        case 'list': return renderList(b);
        case 'table': return renderTable(b);
        case 'quote': return renderQuote(b);
        case 'code': return `<pre class="diagram">${esc(b.text)}</pre>`;
        case 'img': return draftImgHtml(b.html);
        case 'hr': return '';
        case 'raw': return b.html.replace(/^<details>$/, '<details class="fold">');
        default: return '';
        }
    }).join('\n');
}

/* Walk the blocks into chapters (h1 "N. Title") and sections (h2/h3), placing screens under the
 * heading they name — after the heading's first paragraph, so the picture follows its introduction. */
const used = new Set();
const intro = [];
const chapters = [];
let cur = null;
for (const b of blocks) {
    if (b.type === 'h' && b.level === 1) {
        const m = /^(\d+)\.\s+(.*)$/.exec(b.text);
        if (!m) { intro.push(b); continue; }  // the document title
        cur = { num: +m[1], title: m[2], id: slugify(b.text, used), body: [], sections: [] };
        chapters.push(cur); continue;
    }
    (cur ? cur.body : intro).push(b);
}

function renderChapterBody(ch) {
    let html = '';
    let pending = screensBySection.get(normHeading(ch.title)) ? [...screensBySection.get(normHeading(ch.title))] : null;
    if (pending) pending.forEach((s) => placedScreens.add(s));
    let seenPara = false;
    /* Up to two screens follow the section's opening paragraph; the rest close the section, after
     * the text they illustrate, rather than stacking up ahead of it. */
    let tail = [];
    const flushPending = () => {
        if (pending && pending.length) { html += figureHtml(pending.slice(0, 2)); tail = tail.concat(pending.slice(2)); }
        pending = null;
    };
    const flushTail = () => { if (tail.length) html += figureHtml(tail); tail = []; };
    for (const b of ch.body) {
        if (b.type === 'h') {
            flushPending();
            flushTail();
            const id = slugify(b.text, used);
            const lvl = Math.min(b.level, 4);
            if (b.level === 2) ch.sections.push({ id, title: b.text });
            html += `<h${lvl} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inline(b.text)}</h${lvl}>\n`;
            const hit = screensBySection.get(normHeading(b.text));
            if (hit) { pending = hit.filter((s) => !placedScreens.has(s)); pending.forEach((s) => placedScreens.add(s)); }
            seenPara = false;
            continue;
        }
        html += renderBlocks([b]);
        if (!seenPara && (b.type === 'p' || b.type === 'table' || b.type === 'list')) { seenPara = true; flushPending(); }
    }
    flushPending();
    flushTail();
    return html;
}

const chapterHtml = chapters.map((ch, idx) => {
    const body = renderChapterBody(ch);
    const prev = chapters[idx - 1], next = chapters[idx + 1];
    const pager = `<nav class="pager">${prev ? `<a class="prev" href="#${prev.id}"><span>Previous</span>${prev.num}. ${esc(prev.title)}</a>` : '<span></span>'}` +
        `${next ? `<a class="next" href="#${next.id}"><span>Next</span>${next.num}. ${esc(next.title)}</a>` : '<span></span>'}</nav>`;
    return `<section class="chapter" id="${ch.id}" data-num="${ch.num}">` +
        `<header class="chhead"><div class="chnum">Chapter ${ch.num}</div><h1>${inline(ch.title)}</h1></header>\n${body}\n${pager}</section>`;
}).join('\n');

const unplaced = screens.filter((s) => !placedScreens.has(s));
if (unplaced.length) console.warn('[manual] screens with no matching heading:\n  ' + unplaced.map((s) => `${s.slug} → "${s.section}"`).join('\n  '));

// The intro: title, lede and "Which manual is this?" — the Contents list is replaced by the sidebar.
const introBlocks = [];
let skip = false;
for (const b of intro) {
    if (b.type === 'h' && b.level === 1) continue;
    if (b.type === 'h') skip = /^contents$/i.test(b.text);
    if (!skip) introBlocks.push(b);
}
const introHtml = introBlocks.map((b) => b.type === 'h'
    ? `<h2 id="${slugify(b.text, used)}">${inline(b.text)}</h2>` : renderBlocks([b])).join('\n');

const byNum = new Map(chapters.map((c) => [c.num, c]));
const partOf = new Map(); PARTS.forEach((p) => p.chapters.forEach((n) => partOf.set(n, p)));
const orphans = chapters.filter((c) => !partOf.has(c.num)).map((c) => c.num);
if (orphans.length) PARTS[PARTS.length - 1].chapters.push(...orphans);

const navHtml = PARTS.map((p) => `<div class="part"><div class="ptitle">${esc(p.title)}</div><ol>` +
    p.chapters.filter((n) => byNum.has(n)).map((n) => {
        const c = byNum.get(n);
        return `<li data-ch="${c.id}"><a href="#${c.id}"><span class="n">${c.num}</span>${esc(c.title)}</a>` +
            (c.sections.length ? `<ol class="subs">${c.sections.map((s) => `<li><a href="#${s.id}">${inline(s.title.replace(/^\d+\.\d+\s+/, ''))}</a></li>`).join('')}</ol>` : '') + '</li>';
    }).join('') + '</ol></div>').join('');

const partCards = PARTS.map((p) => `<div class="pcard"><div class="ptitle">${esc(p.title)}</div><ul>` +
    p.chapters.filter((n) => byNum.has(n)).map((n) => `<li><a href="#${byNum.get(n).id}">${esc(byNum.get(n).title)}</a></li>`).join('') + '</ul></div>').join('');

const version = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8')).version || ''; } catch { return ''; } })();

const html = readFileSync(join(ROOT, 'tools/manual_template.html'), 'utf8')
    .replace(/\{\{(\w+)\}\}/g, (m, k) => ({  // a function, so '$' in the content is never a pattern
        VERSION: esc(version), NAV: navHtml, INTRO: introHtml, PARTS: partCards, CHAPTERS: chapterHtml,
        SCREENCOUNT: String(placedScreens.size),
    })[k] ?? m);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`[manual] ${chapters.length} chapters, ${placedScreens.size} screens placed, ${(html.length / 1024).toFixed(0)} KB -> ${OUT}`);
