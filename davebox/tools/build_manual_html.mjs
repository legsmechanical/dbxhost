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

/* Hardware controls, drawn as keycaps where a bold run or a quick-reference cell names ONLY
 * controls ("Shift + Step 2", "Delete + jog click"). A bold run with any other word stays bold. */
const CONTROL_RE = new RegExp('^(?:' + [
    'Shift', 'Back', 'Play', 'Record', 'Rec', 'Loop', 'Capture', 'Sample', 'Mute', 'Delete', 'Copy',
    'Undo', 'Redo', 'Note/Session', 'Menu', 'Metro', 'Step \\d+', 'Steps? \\d+[–-]\\d+', 'Step',
    'jog(?: (?:click|turn|wheel))?', 'Jog(?: (?:click|turn|wheel))?', '(?:[Cc]lick|[Tt]urn) the jog(?: wheel)?',
    '(?:bottom |top |lane |side |a |the )?pads?', '(?:top |bottom )?side button', 'Side buttons?',
    '\\+ ?\\/ ?[−-]', '[+−-]', 'Left', 'Right', 'Up', 'Down', 'Left-Right', 'Up/Down', 'Volume knob',
    '[Cc]lick', '[Tt]urn', 'K\\d', 'knob \\d', 'Knob \\d', 'Loop \\(hold\\)', 'Mute \\(hold\\)', 'tap', 'hold',
].join('|') + ')$');

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

function keycaps(text) {
    // "Shift + Step 2" → <kbd>Shift</kbd> + <kbd>Step 2</kbd>, only if every part is a control.
    const parts = text.split(/\s+(\+|\/|·|or)\s+/);
    const words = parts.filter((_, i) => i % 2 === 0).map((p) => p.trim());
    if (!words.length || !words.every((w) => CONTROL_RE.test(w))) return null;
    return parts.map((p, i) => (i % 2 ? ` <span class="kjoin">${esc(p)}</span> ` : `<kbd>${esc(p.trim())}</kbd>`)).join('');
}

function inline(src) {
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
    s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => {
        const k = keycaps(b.replace(/&amp;/g, '&'));
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

let screens = [];
if (SCREENS) {
    screens = JSON.parse(readFileSync(resolve(SCREENS), 'utf8'));
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

/* A legacy <img src="img/x.png"> in the draft: embed the committed PNG, framed like the rest. */
function legacyImgHtml(tag) {
    const src = /src="([^"]+)"/.exec(tag)?.[1];
    const alt = /alt="([^"]*)"/.exec(tag)?.[1] || '';
    const path = src && resolve(dirname(SRC), src);
    if (!path || !existsSync(path)) return '';
    const data = 'data:image/png;base64,' + readFileSync(path).toString('base64');
    return `<div class="figs"><figure class="oled legacy"><img src="${data}" alt="${escAttr(alt)}"><figcaption>${esc(alt)}</figcaption></figure></div>`;
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
    const ctrlCols = b.head.map((h) => /^(control|gesture|press|step)$/i.test(h.replace(/\*/g, '')));
    const cell = (c, j) => {
        if (ctrlCols[j]) { const k = keycaps(c); if (k) return `<span class="keys">${k}</span>`; }
        return inline(c);
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
        case 'img': return legacyImgHtml(b.html);
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
    let sectionHasScreens = !!pending;  // the old committed PNGs step aside where real screens exist
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
            if (b.level <= 2) sectionHasScreens = !!hit;
            else if (hit) sectionHasScreens = true;
            seenPara = false;
            continue;
        }
        if (b.type === 'img' && sectionHasScreens) continue;
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
