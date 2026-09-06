/* tests/js/test_bulk_decode.mjs — the host's bulk-GET framing, decoded by BYTES
 * without TextEncoder/TextDecoder (QuickJS has neither; 2026-09-06). */
let failed = 0;
const ok = (l) => console.log('  ok   — ' + l);
const bad = (l, e) => { console.error('  FAIL — ' + l + ': ' + (e && e.stack ? e.stack : e)); failed = 1; };
async function main() {
    const E = await import('../../ui/ui_engine.mjs');
    const frame = (vals) => { let out = vals.length + '\n'; for (const v of vals) out += Buffer.byteLength(v, 'utf8') + '\n' + v; return out; };
    try {
        const r = E.bulkDecodeForTest(frame(['0.42', '', 'héllo', '日本', 'a\nb']));
        if (JSON.stringify(r) !== JSON.stringify(['0.42', '', 'héllo', '日本', 'a\nb'])) throw new Error(JSON.stringify(r));
        ok('ASCII, empty, 2-byte, 3-byte and embedded-newline values decode by their BYTE lengths');
    } catch (e) { bad('decode', e); }
    try {
        const r = E.bulkDecodeForTest(frame(['x'.repeat(3000), '😀']));
        if (!r || r[0].length !== 3000 || r[1] !== '😀') throw new Error(JSON.stringify(r && r.map(v => v.length)));
        ok('a long value and a 4-byte surrogate pair');
    } catch (e) { bad('long/surrogate', e); }
    try {
        if (E.bulkDecodeForTest('2\n3\nabc') !== null || E.bulkDecodeForTest('x') !== null) throw new Error('malformed frames did not read as null');
        ok('a short or malformed frame reads as null (the caller falls back)');
    } catch (e) { bad('malformed', e); }
    if (failed) process.exit(1);
    console.log('PASS: test_bulk_decode.mjs');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
