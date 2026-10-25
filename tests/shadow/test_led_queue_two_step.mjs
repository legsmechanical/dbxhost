// The overtake LED queue: an ANIMATED write (status low nibble 1-15) must not
// cancel a still-pending PLAIN write for the same LED, and no key may starve.
//
// Move's LED controller animates FROM the colour the LED shows, so a module
// writes the start colour plainly and then the target on the animation
// channel. The queue is last-writer-wins per note / CC, so when both landed in
// one tick the start colour vanished and the hardware pulsed from whatever it
// showed — on the device: a pulse to a colour nobody asked for, or none at all
// when the LED already showed the target (2026-10-24). And the flush walked the
// keys from the lowest every tick, notes before CCs, so under a backlog the
// buttons at CC 50+ were never written at all while Shift was held.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const source = readFileSync(path.join(repoRoot, 'src/shadow/shadow_ui.js'), 'utf8');
function extractFn(name) {
    const re = new RegExp(`(^|\\n)function\\s+${name}\\s*\\(`);
    const m = re.exec(source);
    if (!m) throw new Error(`function ${name} not found`);
    const start = m.index + (m[1] ? 1 : 0);
    let i = source.indexOf('{', start);
    let depth = 1, pos = i + 1;
    while (depth > 0 && pos < source.length) {
        const c = source[pos++];
        if (c === '{') depth++;
        else if (c === '}') depth--;
    }
    return source.slice(start, pos);
}
const budgetM = /const LED_QUEUE_MAX_PER_TICK = (\d+);/.exec(source);
if (!budgetM) throw new Error('LED_QUEUE_MAX_PER_TICK not found');

let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e.message || e); } };
const assert = (c, m) => { if (!c) throw new Error(m); };

function rig() {
    const wire = [];
    const sandbox = { console, globalThis: null, wire };
    sandbox.globalThis = sandbox;
    sandbox.move_midi_internal_send = (arr) => { wire.push(Array.from(arr)); return true; };
    const prelude = `
        const LED_QUEUE_MAX_PER_TICK = ${budgetM[1]};
        let originalMidiInternalSend = null, ledQueueActive = false;
        let ledQueueNotes = {}, ledQueueCCs = {}, ledQueueNotesFollow = {}, ledQueueCCsFollow = {};
        let ledQueueCursor = 0, ledQueueCCsFirst = false;
        ${extractFn('queueLedWrite')}
        ${extractFn('activateLedQueue')}
        ${extractFn('deactivateLedQueue')}
        ${extractFn('flushLedMap')}
        ${extractFn('flushLedQueue')}
        activateLedQueue();
        globalThis.send = (a) => globalThis.move_midi_internal_send(a);
        globalThis.flush = () => flushLedQueue();
    `;
    vm.createContext(sandbox);
    vm.runInContext(prelude, sandbox);
    return { wire, send: sandbox.send, flush: sandbox.flush };
}
const note = (ch, n, c) => [0x09, 0x90 | ch, n, c];
const cc   = (ch, n, c) => [0x0B, 0xB0 | ch, n, c];
const J = JSON.stringify;

/* ---- the two-step survives one tick ---- */
step('a plain write then an animated write for the same pad in ONE tick: the plain goes out first, alone', () => {
    const r = rig();
    r.send(note(0, 92, 5)); r.send(note(9, 92, 20));
    r.flush();
    assert(J(r.wire) === J([note(0, 92, 5)]), J(r.wire));
});
step('…and the animated write goes out on the NEXT flush (a later frame)', () => {
    const r = rig();
    r.send(note(0, 92, 5)); r.send(note(9, 92, 20)); r.flush(); r.wire.length = 0;
    r.flush();
    assert(J(r.wire) === J([note(9, 92, 20)]), J(r.wire));
    r.wire.length = 0; r.flush();
    assert(r.wire.length === 0, 'sent again: ' + J(r.wire));
});
step('the same for a button (CC)', () => {
    const r = rig();
    r.send(cc(0, 56, 0)); r.send(cc(9, 56, 16)); r.flush();
    assert(J(r.wire) === J([cc(0, 56, 0)]), J(r.wire));
    r.wire.length = 0; r.flush();
    assert(J(r.wire) === J([cc(9, 56, 16)]), J(r.wire));
});
step('a plain write after a held animation cancels it (a plain write is what stops an animation)', () => {
    const r = rig();
    r.send(note(0, 92, 5)); r.send(note(9, 92, 20)); r.send(note(0, 92, 7)); r.flush();
    assert(J(r.wire) === J([note(0, 92, 7)]), J(r.wire));
    r.wire.length = 0; r.flush();
    assert(r.wire.length === 0, 'the cancelled animation was sent: ' + J(r.wire));
});
step('two plain writes still coalesce to the last (unchanged behaviour)', () => {
    const r = rig();
    r.send(note(0, 92, 5)); r.send(note(0, 92, 6)); r.flush();
    assert(J(r.wire) === J([note(0, 92, 6)]), J(r.wire));
});
step('two animated writes coalesce to the last; the start colour is kept', () => {
    const r = rig();
    r.send(note(0, 92, 5)); r.send(note(9, 92, 20)); r.send(note(13, 92, 21)); r.flush();
    assert(J(r.wire) === J([note(0, 92, 5)]), J(r.wire));
    r.wire.length = 0; r.flush();
    assert(J(r.wire) === J([note(13, 92, 21)]), J(r.wire));
});
step('an animated write with nothing pending is sent at once (the LED already shows its start colour)', () => {
    const r = rig();
    r.send(note(9, 92, 20)); r.flush();
    assert(J(r.wire) === J([note(9, 92, 20)]), J(r.wire));
});

/* ---- nothing starves ---- */
step('under a backlog, a high CC is reached: 16 low CCs re-queued every tick no longer hide CC 56 forever', () => {
    const r = rig();
    let seen56 = false;
    for (let tick = 0; tick < 6; tick++) {
        for (let i = 16; i < 32; i++) r.send(cc(0, i, 0));    /* the icon force-send */
        r.send(cc(0, 56, 16));
        r.flush();
        if (r.wire.some(w => w[2] === 56)) seen56 = true;
    }
    assert(seen56, 'CC 56 never flushed in 6 ticks');
});
step('under a note backlog, CCs are still served (the two maps take turns going first)', () => {
    const r = rig();
    let seenCC = false;
    for (let tick = 0; tick < 4; tick++) {
        for (let i = 68; i < 100; i++) r.send(note(0, i, 1));   /* 32 pads every tick */
        r.send(cc(0, 88, 124));
        r.flush();
        if (r.wire.some(w => w[0] === 0x0B)) seenCC = true;
    }
    assert(seenCC, 'no CC flushed in 4 ticks of pad repaints');
});
step('the budget is still honoured', () => {
    const r = rig();
    for (let i = 0; i < 40; i++) r.send(note(0, 60 + i, 1));
    r.flush();
    assert(r.wire.length === Number(budgetM[1]), `sent ${r.wire.length}`);
});

console.log(failed ? 'LED queue two-step: FAILED' : 'LED queue two-step: PASS');
process.exit(failed);
