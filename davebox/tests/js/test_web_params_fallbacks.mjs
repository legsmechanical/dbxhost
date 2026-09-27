/* tests/js/test_web_params_fallbacks.mjs — the remote UI's parameter editor
 * (davebox/web_ui_params.js) shows what the device's editor shows (Josh,
 * 2026-09-27: "Most instruments are showing 'no parameters' in remote UI").
 *
 * Most synths declare their ui_hierarchy only in module.json, and the synth
 * slot answers `synth:ui_hierarchy` from the plugin alone — so the editor gets
 * `{}` (measured on the device: dr32, 30 params, hierarchy `{}`). The device's
 * editor (page_plan.mjs) then pages through chain_params; a module with levels
 * but no "root" starts at its active mode's level, or the first. This mounts
 * the real editor over a small DOM stub and reads the text it draws.
 */
import fs from 'fs';
import path from 'path';

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

/* The least DOM the editor touches: elements, text, attributes, classes. */
class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.style = {};
        this.attrs = {}; this.dataset = {}; this._text = ''; this._html = ''; this.className = '';
        const self = this;
        this.classList = { add: (...c) => { for (const x of c) if (!self.cls().includes(x)) self.className = (self.className + ' ' + x).trim(); },
            remove: (...c) => { self.className = self.cls().filter((x) => !c.includes(x)).join(' '); },
            toggle: (c, on) => { const has = self.cls().includes(c); const want = on === undefined ? !has : !!on;
                if (want && !has) self.classList.add(c); if (!want && has) self.classList.remove(c); return want; },
            contains: (c) => self.cls().includes(c) }; }
    cls() { return this.className.split(/\s+/).filter(Boolean); }
    get children() { return this.childNodes; }
    get firstChild() { return this.childNodes[0] || null; }
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; }
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); if (i < 0) return this.appendChild(c);
        this.childNodes.splice(i, 0, c); c.parentNode = this; return c; }
    removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); return c; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceChildren(...c) { this.childNodes = []; c.forEach((x) => this.appendChild(x)); }
    set textContent(v) { this.childNodes = []; this._text = String(v); }
    get textContent() { return this._text + this._html.replace(/<[^>]*>/g, '') + this.childNodes.map((c) => c.textContent).join(' '); }
    set innerHTML(v) { this.childNodes = []; this._text = ''; this._html = String(v); }
    get innerHTML() { return this._html; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {} removeEventListener() {}
    querySelectorAll() { return []; } querySelector() { return null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
    focus() {} blur() {}
}
globalThis.window = globalThis;
globalThis.document = { createElement: (t) => new El(t), createElementNS: (_, t) => new El(t),
    createTextNode: (t) => { const e = new El('#text'); e.textContent = t; return e; },
    addEventListener() {}, removeEventListener() {}, body: new El('body') };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.performance = globalThis.performance || { now: () => Date.now() };

/* The runner works from davebox/ (tests/js/run.sh cds there); the bundle has no import.meta. */
const candidates = [path.join(process.cwd(), 'web_ui_params.js'), path.join(process.cwd(), 'davebox/web_ui_params.js')];
const src = candidates.find((p) => fs.existsSync(p));
if (!src) { console.log('FAIL: web_ui_params.js not found from ' + process.cwd()); process.exit(1); }
(0, eval)(fs.readFileSync(src, 'utf8'));
assert(window.chainParams && window.chainParams.mount, 'no window.chainParams.mount');

const DR32ISH = [
    { key: 'kit', name: 'Kit', type: 'enum', options: ['A', 'B'] },
    { key: 'tune', name: 'Tune', type: 'float', min: -1, max: 1 },
    { key: 'decay', name: 'Decay', type: 'float', min: 0, max: 1 },
];
const mount = (hierarchy, chainParams, values) => {
    const el = new El('div');
    const ed = window.chainParams.mount(el, { hierarchy, chainParams, values: values || {}, onSet() {}, title: 'T' });
    return { el, ed, text: () => el.textContent };
};

step('⭐⭐ an EMPTY hierarchy with chain_params lists the params (dr32 on the device: `{}` + 30 params)', () => {
    const m = mount({}, DR32ISH);
    assert(!/no parameters/.test(m.text()), 'says no parameters: ' + m.text());
    for (const p of DR32ISH) assert(m.text().includes(p.name), 'missing ' + p.name + ': ' + m.text());
});
step('⭐ ...and when chain_params arrives AFTER the empty hierarchy (the wire order), it re-renders into them', () => {
    const m = mount({}, []);
    assert(/no parameters/.test(m.text()), 'control: with nothing at all it should say so: ' + m.text());
    m.ed.updateValues({}, {}, DR32ISH);
    assert(!/no parameters/.test(m.text()) && m.text().includes('Decay'), 'did not re-render: ' + m.text());
});
step('⚠ CONTROL: no hierarchy and no chain_params still says "no parameters"', () => {
    assert(/no parameters/.test(mount({}, []).text()), 'lost the empty message');
    assert(/no parameters/.test(mount({ levels: {} }, []).text()), 'lost the empty message (empty levels)');
});
step('a hierarchy with levels but no "root" starts at the first level', () => {
    const m = mount({ levels: { main: { params: ['tune'] }, env: { params: ['decay'] } } }, DR32ISH);
    assert(m.text().includes('Tune'), 'first level not shown: ' + m.text());
});
step('⭐ a module with MODES starts at its active mode\'s level (case-insensitive), and a mode change re-roots', () => {
    const h = { modes: ['patch', 'performance'], levels: { patch: { params: ['tune'] }, performance: { params: ['decay'] } } };
    const m = mount(h, DR32ISH, { mode: 'Performance' });
    assert(m.text().includes('Decay') && !m.text().includes('Tune'), 'not the performance level: ' + m.text());
    m.ed.updateValues({ mode: 'patch' });
    assert(m.text().includes('Tune') && !m.text().includes('Decay'), 'did not re-root on the mode change: ' + m.text());
});
step('⚠ CONTROL: an ordinary hierarchy with a root renders its root, unchanged', () => {
    const m = mount({ levels: { root: { params: ['decay'] }, other: { params: ['tune'] } } }, DR32ISH);
    assert(m.text().includes('Decay') && !m.text().includes('Tune'), 'root not rendered as before: ' + m.text());
});

if (failed) { console.log('FAIL: web param editor fallbacks'); process.exit(1); }
console.log('PASS: the web param editor shows what the device editor shows');
