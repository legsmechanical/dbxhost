/* tests/js/test_web_device_rules.mjs — THE BROWSER EDITOR OBEYS THE DEVICE'S
 * RULES for Key/Scale and a track's instrument.
 *
 * Every sequencer write from the browser is a raw engine parameter, so the
 * device UI's guards never ran for it: a Key/Scale change wrote `key`/`scale`
 * straight through (the notes stayed where they were, no "Transpose clips?"),
 * and the track menu could put a second track on a Move instrument another
 * track owns. On the device:
 *   - Key/Scale with melodic content raises TRANSPOSE CLIPS? (Yes/No, opens on
 *     Yes). Yes commits through the engine's transpose (t0_xpose_apply ... 1);
 *     No changes nothing. With no melodic content it commits at once, through
 *     the same transpose.
 *   - A Move instrument has one owner (moveInstrOwner): a second claimant is
 *     REFUSED ("MOVE n / Track m has it"), nothing is written, the owner keeps
 *     it.
 *   - A Conductor / Audio / Slicer track's destination is not a route write
 *     (the device converts the track); the browser refuses instead.
 *
 * This runs the REAL renderGlobals / openTrackGear / requestKeyScale /
 * requestTrackRoute from web_ui_seq.js, with the REAL helpers from
 * web_ui_core.js, against a minimal fake DOM, and performs the user's gesture:
 * a change on the Key / Scale / Instrument / Channel select. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());   /* run.sh / run-one.sh cd to davebox/ */
const seq = readFileSync(path.join(ROOT, 'web_ui_seq.js'), 'utf8');
const core = readFileSync(path.join(ROOT, 'web_ui_core.js'), 'utf8');

let ok = 0, bad = 0;
const check = (cond, msg) => {
    if (cond) { console.log('  ok   — ' + msg); ok++; }
    else { console.log('  FAIL — ' + msg); bad++; }
};

/* `function name(` .. the closing brace at column 0 */
function fn(src, name) {
    const a = src.indexOf('\nfunction ' + name + '(');
    if (a < 0) return null;
    const b = src.indexOf('\n}\n', a);
    return b < 0 ? null : src.slice(a + 1, b + 2);
}
const need = [
    [core, 'escMix'], [core, 'moveBusForChannel'], [core, 'anyMelodicContent'], [core, 'moveOwner'],
    [seq, 'trackInstName'], [seq, 'renderGlobals'], [seq, 'requestKeyScale'], [seq, 'requestTrackRoute'],
    [seq, 'openTrackGear'], [seq, 'closeTrackGear'],
];
const parts = [];
for (const [src, n] of need) {
    let f = fn(src, n);
    /* a one-liner (escMix) ends on its own line */
    if (!f) { const m = src.match(new RegExp('^function ' + n + '\\(.*$', 'm')); f = m && m[0]; }
    /* closeTrackGear spans two lines; take it with trackGearOutside after it */
    if (n === 'closeTrackGear') {
        const a = src.indexOf('function closeTrackGear('), b = src.indexOf('\nfunction openTrackGear(', a);
        f = a >= 0 && b > a ? src.slice(a, b) : null;
    }
    check(!!f, 'found ' + n + ' in the web UI source');
    if (f) parts.push(f);
}
if (bad) { console.log('test_web_device_rules: the functions moved — update this test'); process.exit(1); }

/* ---- a minimal DOM: elements remember onchange/onclick/value by selector ---- */
function makeEl() {
    const kids = {};
    return {
        innerHTML: '', className: '', dataset: {}, style: {}, textContent: '',
        querySelector(sel) { return kids[sel] || (kids[sel] = { value: '', onchange: null, onclick: null,
            classList: { toggle() {} }, focus() {} }); },
        remove() {}, contains() { return false },
        getBoundingClientRect() { return { left: 0, bottom: 0 }; },
    };
}
const env = new Function('KEY_NAMES', 'SCALE_NAMES', `
  const P = "overtake_dsp:"; const PM_AUDIO = 3, PM_SLICER = 4; var MIX_MOVE_BUSES = 4;
  const mixKV = {}; let M = null; let trackGearEl = null;
  const writes = [], confirms = [], notices = [];
  const R = { setParam: (k, v) => writes.push(k.replace(P, '') + '=' + v) };
  const afterEdit = () => {}, pullSoon = () => {}, layout = () => {}, draw = () => {}, renderSession = () => {};
  const sliderRow = () => '', bindSlider = () => {}, jumpTo = () => {};
  const showConfirm = (title, lines, onYes, onNo) => confirms.push({ title, lines, onYes, onNo });
  const showNotice = (t) => notices.push(t);
  const els = {};
  const document = {
    getElementById: id => els[id] || (els[id] = (${makeEl.toString()})()),
    createElement: () => (${makeEl.toString()})(),
    body: { appendChild() {} }, activeElement: null,
    addEventListener() {}, removeEventListener() {},
  };
  const window = { innerWidth: 1000 };
  const setTimeout = () => 0;
  ${parts.join('\n')}
  return {
    load(m) { M = m; writes.length = 0; confirms.length = 0; notices.length = 0; },
    get M() { return M; }, writes, confirms, notices,
    globals() { renderGlobals(); return document.getElementById('globalpanel'); },
    gear(t) { closeTrackGear(); openTrackGear(t, (${makeEl.toString()})()); return trackGearEl; },
  };`)(
    ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
    ['Major','Minor','Dorian','Phrygian','Lydian','Mixolydian','Locrian','Harm Min','Mel Min','Pent Maj','Pent Min','Blues','Whole Tone','Dim']);

const empty16 = () => Array(16).fill(false);
const track = (pm, route, chan, has) => ({ pm, route, chan, has: has || empty16(), mute: 0, solo: 0 });
function model({ melodic }) {
    const tracks = [
        track(1, 0, 1, melodic ? empty16() : [true, ...Array(15).fill(false)]),   /* a drum track with hits: never counts */
        track(0, 1, 2, melodic ? [true, ...Array(15).fill(false)] : empty16()),   /* T2 owns Move 2 */
        track(0, 0, 3), track(0, 2, 4), track(2, 0, 5), track(3, 0, 6), track(4, 0, 7), track(0, 0, 8),
    ];
    return { glob: { key: 9, scale: 1, swing: 0, swingRes: 0, quant: 0, scaleAware: false }, tracks,
             play: { bpm: 120 } };
}
const pick = (root, sel, value) => { const s = root.querySelector(sel); s.value = String(value); s.onchange({ target: s }); return s; };

/* ---- Key/Scale with melodic content: the confirm, then the transpose ---- */
{
    env.load(model({ melodic: true }));
    pick(env.globals(), '#gKey', 2);                       /* A minor -> D minor */
    check(env.writes.length === 0, '⚠ nothing is written before the confirm is answered (' + env.writes.join(',') + ')');
    check(env.confirms.length === 1, 'a Key change on a project with melodic clips asks first');
    const c = env.confirms[0] || { lines: [] };
    check(/transpose clips\?/i.test(c.title || ''), 'the confirm is the device\'s TRANSPOSE CLIPS? (' + c.title + ')');
    check(c.lines[0] === 'To D Minor' && c.lines[1] === 'All melodic clips', 'it names the new key and scope: ' + JSON.stringify(c.lines));
    c.onYes && c.onYes();
    check(env.writes.length === 1 && env.writes[0] === 't0_xpose_apply=9 1 2 1 1 1',
          'Yes commits through the transpose, from the old key to the new, marked remote: ' + env.writes.join(','));
    check(!env.writes.some(w => /^(key|scale)=/.test(w)), '⚠ never a raw key/scale write');
    check(env.M.glob.key === 2 && env.M.glob.scale === 1, 'the page adopts the new key');
}
{
    env.load(model({ melodic: true }));
    pick(env.globals(), '#gScale', 0);                     /* A minor -> A major, then No */
    const c = env.confirms[0];
    check(!!c && c.lines[0] === 'To A Major', 'a Scale change asks too');
    c && c.onNo && c.onNo();
    check(env.writes.length === 0, 'No writes nothing');
    check(env.M.glob.key === 9 && env.M.glob.scale === 1, 'No leaves the key and scale as they were');
}
/* ---- no melodic content (a drum track's hits do not count): commit at once ---- */
{
    env.load(model({ melodic: false }));
    pick(env.globals(), '#gKey', 0);
    check(env.confirms.length === 0, 'with no melodic clips there is nothing to ask');
    check(env.writes.join(',') === 't0_xpose_apply=9 1 0 1 1 1', 'and the change still goes through the transpose: ' + env.writes.join(','));
}
/* ---- the same key again: nothing ---- */
{
    env.load(model({ melodic: true }));
    pick(env.globals(), '#gKey', 9);
    check(env.writes.length === 0 && env.confirms.length === 0, 'picking the current key does nothing');
}

/* ---- one owner per Move instrument ---- */
{
    env.load(model({ melodic: false }));
    let g = env.gear(2);                                    /* T3, Schwung, channel 3 */
    pick(g, '#tgChan', 2);                                  /* channel 2 while Schwung: fine */
    check(env.writes.join(',') === 't2_channel=2', 'a channel change on a Schwung track is written: ' + env.writes.join(','));
    env.writes.length = 0;
    const sel = pick(g, '#tgRoute', 'move');                /* now Move on channel 2 = Move 2, T2's */
    check(env.writes.length === 0, '⚠ a second track asking for a Move instrument writes nothing (' + env.writes.join(',') + ')');
    check(env.notices.some(n => /Move 2: Track 2 has it/.test(n)), 'and is told who has it: ' + JSON.stringify(env.notices));
    check(sel.value === 'schwung', 'the Instrument row snaps back');
    check(env.M.tracks[1].route === 1 && env.M.tracks[1].chan === 2, 'the owner keeps it');
    check(env.M.tracks[2].route === 0, 'the claimant keeps its own route');

    env.load(env.M);
    g = env.gear(1);                                        /* T2, the owner, moves to Move 3: free */
    pick(g, '#tgChan', 3);
    check(env.writes.join(',') === 't1_channel=3', 'the owner may move to a free Move instrument: ' + env.writes.join(','));

    env.load(env.M);
    g = env.gear(7);                                        /* T8 Schwung -> Move on ch 8 = Move 4 (clamped): free */
    pick(g, '#tgRoute', 'move');
    check(env.writes.join(',') === 't7_route=move', 'a free Move instrument is taken: ' + env.writes.join(','));

    env.load(env.M);
    g = env.gear(2);                                        /* T3 -> Move 3, which T2 now owns */
    pick(g, '#tgChan', 3); env.writes.length = 0;           /* channel 3 while Schwung */
    pick(g, '#tgRoute', 'move');
    check(env.writes.length === 0 && env.notices.some(n => /Move 3: Track 2 has it/.test(n)),
          'the rule follows the owner to its new instrument');

    env.load(env.M);
    g = env.gear(7);                                        /* T8, on Move 4, changes channel onto Move 3 */
    const ch = pick(g, '#tgChan', 3);
    check(env.writes.length === 0 && ch.value === '8', '⚠ a channel change onto a taken Move instrument is refused too');
}
/* ---- Conductor / Audio / Slicer: no route write from here ---- */
for (const [t, kind] of [[4, 'Conductor'], [5, 'Audio'], [6, 'Slicer']]) {
    env.load(model({ melodic: false }));
    const g = env.gear(t);
    pick(g, '#tgRoute', 'external');
    pick(g, '#tgChan', 9);
    check(env.writes.length === 0 && env.notices.some(n => n.includes(kind)),
          (kind === 'Audio' ? 'an ' : 'a ') + kind + ' track\'s destination is not written from the browser: ' + env.writes.join(','));
}

/* ---- nothing else in the web UI writes key/scale or a route raw ---- */
{
    const files = ['web_ui_seq.js', 'web_ui_core.js', 'web_ui_mix.js', 'web_ui_sound.js', 'web_ui_params.js'];
    const raw = [];
    for (const f of files) {
        const s = readFileSync(path.join(ROOT, f), 'utf8');
        if (/P\+"(key|scale)"/.test(s) || /setG\("(key|scale)"/.test(s)) raw.push(f + ': key/scale');
        const routes = s.match(/_route`/g) || [];
        if (f === 'web_ui_seq.js' ? routes.length !== 1 : routes.length) raw.push(f + ': ' + routes.length + ' route writes');
    }
    check(raw.length === 0, 'no raw key/scale or route write outside the guarded paths ' + JSON.stringify(raw));
}

console.log(bad ? 'test_web_device_rules: ' + bad + ' FAILED' : 'test_web_device_rules: all ' + ok + ' ok');
process.exit(bad ? 1 : 0);
