/* tests/js/test_phrase_pack.mjs — phrase packs (ui_phrase_pack.mjs).
 *
 * ChaCha20 against RFC 8439 §2.4.2's test vector; base64 both ways; a pack
 * written by packChunk reads back only with its key; plain packs; bad input.
 */
import {
    chacha20Xor, hexToBytes, b64ToBytes, bytesToB64, parsePack, packCats, packCategory, packChunk, packCategoryJob,
} from '../../ui/ui_phrase_pack.mjs';

let failed = 0;
function step(l, fn) {
    try { fn(); console.log(`  ok   — ${l}`); }
    catch (e) { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
const hex = (b) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

step('ChaCha20 matches RFC 8439 §2.4.2 (key 00..1f, nonce …4a…, counter 1)', () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const nonce = hexToBytes('000000000000004a00000000');
    const pt = "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
    const data = Uint8Array.from(pt, c => c.charCodeAt(0));
    const ct = hex(chacha20Xor(key, nonce, data));
    assert(ct.startsWith('6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0b'), 'first block: ' + ct.slice(0, 64));
    assert(ct.endsWith('5af90bbf74a35be6b40b8eedf2785e42874d'), 'tail: ' + ct.slice(-36));
    chacha20Xor(key, nonce, data);
    assert(String.fromCharCode(...data) === pt, 'XOR twice is not the identity');
});

step('base64 round trips every length and rejects stray characters', () => {
    for (let n = 0; n < 70; n++) {
        const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
        const back = b64ToBytes(bytesToB64(b));
        assert(back && hex(back) === hex(b), 'length ' + n);
    }
    assert(bytesToB64(Uint8Array.from([77, 97, 110])) === 'TWFu', 'known value');
    assert(b64ToBytes('TW*u') === null, 'stray character accepted');
});

const KEY = 'a1'.repeat(32), OTHER = 'b2'.repeat(32);
const LIB = JSON.stringify({ v: 1, cat: 'kick', phrases: [{ id: 'k1', name: 'BASIC 01', g: '', bars: 1, n: '0 100 12;96 90 12' }] });

step('an encrypted pack reads back with its key, and not without it', () => {
    const pack = parsePack(JSON.stringify({ v: 1, enc: true, chunks: { kick: packChunk(LIB, KEY, '00112233445566778899aabb') } }));
    assert(packCats(pack).join() === 'kick', 'cats');
    assert(packCategory(pack, 'kick', KEY) === LIB, 'round trip');
    assert(packCategory(pack, 'kick', OTHER) === null, 'a wrong key read something');
    assert(packCategory(pack, 'kick', '') === null, 'no key read something');
    assert(packCategory(pack, 'hat', KEY) === null, 'a missing category read something');
    assert(!JSON.stringify(pack.chunks).includes('BASIC'), 'plaintext visible in the pack');
});

step('decoding in slices gives exactly what one go gives, at any slice size, and 8 rounds round-trip', () => {
    const big = JSON.stringify({ v: 1, cat: 'kick', phrases: Array.from({ length: 200 }, (_, i) => ({ id: 'k' + i, name: 'BASIC ' + i, n: '0 100 12;96 ' + (i % 127) + ' 12' })) });
    for (const r of [20, 8]) {
        const pack = parsePack(JSON.stringify({ v: 1, enc: true, r, chunks: { kick: packChunk(big, KEY, '0a0b0c0d0e0f101112131415', r) } }));
        assert(packCategory(pack, 'kick', KEY) === big, r + ' rounds: one go');
        for (const slice of [64, 100, 4096, 1 << 20]) {
            const job = packCategoryJob(pack, 'kick', KEY);
            let guard = 0; while (!job.step(slice) && guard++ < 100000) {}
            assert(job.text() === big, r + ' rounds, slice ' + slice + ': differs');
        }
        const wrong = packCategoryJob(pack, 'kick', OTHER); while (!wrong.step(4096)) {}
        assert(wrong.text() === null, 'a wrong key decoded in slices');
    }
});

step('a plain pack reads without a key; bad files are refused', () => {
    const pack = parsePack(JSON.stringify({ v: 1, enc: false, chunks: { kick: LIB } }));
    assert(packCategory(pack, 'kick', '') === LIB, 'plain read');
    assert(parsePack('nope') === null && parsePack('{"v":2,"chunks":{}}') === null, 'bad file accepted');
    let threw = false; try { packChunk('é', KEY, '00'.repeat(12)); } catch (e) { threw = true; }
    assert(threw, 'non-ASCII chunk accepted');
});

if (failed) { console.error('FAIL: phrase pack'); process.exit(1); }
console.log('PASS: phrase pack');
