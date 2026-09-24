/* ui_phrase_pack.mjs — reading a phrase pack. Pure: no host calls.
 *
 * A pack is one JSON file holding a library chunk per category:
 *
 *   {"v":1,"enc":false,"chunks":{"kick":"<library JSON text>", …}}
 *   {"v":1,"enc":true, "chunks":{"kick":{"n":"<24 hex nonce>","d":"<base64>"}, …}}
 *
 * An encrypted chunk is the library JSON text (ASCII) under ChaCha (RFC 8439's
 * construction, block counter from 1) with the pack key; the pack's "r" is the
 * number of rounds (20 when absent — packs use 8, which is several times
 * cheaper in an interpreter). Only the category being browsed is
 * decoded. The phrase generator writes packs with the same code (packChunk).
 */

/* ---- ChaCha20 ---- */

/* XOR `data` (Uint8Array) in place with the ChaCha20 stream for key (32
 * bytes) / nonce (12 bytes), counter starting at 1.
 * ⚠ Written for an INTERPRETER (QuickJS): the 16 state words are locals and
 * the rounds are inlined — array access and calls in the inner loop made a
 * 300 KB category take 170 ms on a Mac and several times that on the Move. */
export function chacha20Xor(key, nonce, data, rounds) { return chacha20XorFrom(key, nonce, data, rounds, 1); }
function chacha20XorFrom(key, nonce, data, rounds, ctr0) {
    const halves = (rounds || 20) >> 1;
    const w = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
    const k0 = w(key, 0), k1 = w(key, 4), k2 = w(key, 8), k3 = w(key, 12),
          k4 = w(key, 16), k5 = w(key, 20), k6 = w(key, 24), k7 = w(key, 28);
    const n0 = w(nonce, 0), n1 = w(nonce, 4), n2 = w(nonce, 8);
    const ks = new Uint32Array(16), kb = new Uint8Array(ks.buffer);
    const len = data.length;
    /* whole 32-bit words at a time when the data is aligned (it is, from
     * b64ToBytes); bytes for the tail */
    const aligned = (data.byteOffset & 3) === 0;
    const dw = aligned ? new Uint32Array(data.buffer, data.byteOffset, len >> 2) : null;
    for (let pos = 0, ctr = ctr0; pos < len; pos += 64, ctr++) {
        let x0 = 0x61707865, x1 = 0x3320646e, x2 = 0x79622d32, x3 = 0x6b206574,
            x4 = k0, x5 = k1, x6 = k2, x7 = k3, x8 = k4, x9 = k5, x10 = k6, x11 = k7,
            x12 = ctr >>> 0, x13 = n0, x14 = n1, x15 = n2, t;
        for (let r = 0; r < halves; r++) {
            x0 = (x0 + x4) | 0; t = x12 ^ x0; x12 = (t << 16) | (t >>> 16);
            x8 = (x8 + x12) | 0; t = x4 ^ x8; x4 = (t << 12) | (t >>> 20);
            x0 = (x0 + x4) | 0; t = x12 ^ x0; x12 = (t << 8) | (t >>> 24);
            x8 = (x8 + x12) | 0; t = x4 ^ x8; x4 = (t << 7) | (t >>> 25);
            x1 = (x1 + x5) | 0; t = x13 ^ x1; x13 = (t << 16) | (t >>> 16);
            x9 = (x9 + x13) | 0; t = x5 ^ x9; x5 = (t << 12) | (t >>> 20);
            x1 = (x1 + x5) | 0; t = x13 ^ x1; x13 = (t << 8) | (t >>> 24);
            x9 = (x9 + x13) | 0; t = x5 ^ x9; x5 = (t << 7) | (t >>> 25);
            x2 = (x2 + x6) | 0; t = x14 ^ x2; x14 = (t << 16) | (t >>> 16);
            x10 = (x10 + x14) | 0; t = x6 ^ x10; x6 = (t << 12) | (t >>> 20);
            x2 = (x2 + x6) | 0; t = x14 ^ x2; x14 = (t << 8) | (t >>> 24);
            x10 = (x10 + x14) | 0; t = x6 ^ x10; x6 = (t << 7) | (t >>> 25);
            x3 = (x3 + x7) | 0; t = x15 ^ x3; x15 = (t << 16) | (t >>> 16);
            x11 = (x11 + x15) | 0; t = x7 ^ x11; x7 = (t << 12) | (t >>> 20);
            x3 = (x3 + x7) | 0; t = x15 ^ x3; x15 = (t << 8) | (t >>> 24);
            x11 = (x11 + x15) | 0; t = x7 ^ x11; x7 = (t << 7) | (t >>> 25);
            x0 = (x0 + x5) | 0; t = x15 ^ x0; x15 = (t << 16) | (t >>> 16);
            x10 = (x10 + x15) | 0; t = x5 ^ x10; x5 = (t << 12) | (t >>> 20);
            x0 = (x0 + x5) | 0; t = x15 ^ x0; x15 = (t << 8) | (t >>> 24);
            x10 = (x10 + x15) | 0; t = x5 ^ x10; x5 = (t << 7) | (t >>> 25);
            x1 = (x1 + x6) | 0; t = x12 ^ x1; x12 = (t << 16) | (t >>> 16);
            x11 = (x11 + x12) | 0; t = x6 ^ x11; x6 = (t << 12) | (t >>> 20);
            x1 = (x1 + x6) | 0; t = x12 ^ x1; x12 = (t << 8) | (t >>> 24);
            x11 = (x11 + x12) | 0; t = x6 ^ x11; x6 = (t << 7) | (t >>> 25);
            x2 = (x2 + x7) | 0; t = x13 ^ x2; x13 = (t << 16) | (t >>> 16);
            x8 = (x8 + x13) | 0; t = x7 ^ x8; x7 = (t << 12) | (t >>> 20);
            x2 = (x2 + x7) | 0; t = x13 ^ x2; x13 = (t << 8) | (t >>> 24);
            x8 = (x8 + x13) | 0; t = x7 ^ x8; x7 = (t << 7) | (t >>> 25);
            x3 = (x3 + x4) | 0; t = x14 ^ x3; x14 = (t << 16) | (t >>> 16);
            x9 = (x9 + x14) | 0; t = x4 ^ x9; x4 = (t << 12) | (t >>> 20);
            x3 = (x3 + x4) | 0; t = x14 ^ x3; x14 = (t << 8) | (t >>> 24);
            x9 = (x9 + x14) | 0; t = x4 ^ x9; x4 = (t << 7) | (t >>> 25);
        }
        ks[0] = x0 + 0x61707865; ks[1] = x1 + 0x3320646e; ks[2] = x2 + 0x79622d32; ks[3] = x3 + 0x6b206574;
        ks[4] = x4 + k0; ks[5] = x5 + k1; ks[6] = x6 + k2; ks[7] = x7 + k3;
        ks[8] = x8 + k4; ks[9] = x9 + k5; ks[10] = x10 + k6; ks[11] = x11 + k7;
        ks[12] = x12 + ctr; ks[13] = x13 + n0; ks[14] = x14 + n1; ks[15] = x15 + n2;
        /* keystream bytes are little-endian words; the Move and every build
         * host are little-endian, so the byte view reads them in order */
        const n = len - pos < 64 ? len - pos : 64;
        if (dw && n === 64) {
            const q = pos >> 2;
            dw[q] ^= ks[0]; dw[q + 1] ^= ks[1]; dw[q + 2] ^= ks[2]; dw[q + 3] ^= ks[3];
            dw[q + 4] ^= ks[4]; dw[q + 5] ^= ks[5]; dw[q + 6] ^= ks[6]; dw[q + 7] ^= ks[7];
            dw[q + 8] ^= ks[8]; dw[q + 9] ^= ks[9]; dw[q + 10] ^= ks[10]; dw[q + 11] ^= ks[11];
            dw[q + 12] ^= ks[12]; dw[q + 13] ^= ks[13]; dw[q + 14] ^= ks[14]; dw[q + 15] ^= ks[15];
        } else for (let i = 0; i < n; i++) data[pos + i] ^= kb[i];
    }
    return data;
}

/* ---- encodings ---- */

export function hexToBytes(h) {
    const s = String(h || '');
    if (s.length % 2 || /[^0-9a-f]/i.test(s)) return null;
    const b = new Uint8Array(s.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16);
    return b;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => { const r = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) r[B64.charCodeAt(i)] = i; return r; })();
export function b64ToBytes(s) {
    const str = String(s || '');
    let end = str.length;
    while (end > 0 && str.charCodeAt(end - 1) === 61) end--;          /* '=' */
    const out = new Uint8Array(Math.floor(end * 3 / 4));
    const R = B64_REV;
    let o = 0, i = 0;
    /* four characters → three bytes, straight from the table */
    for (; i + 4 <= end; i += 4) {
        const c0 = str.charCodeAt(i), c1 = str.charCodeAt(i + 1), c2 = str.charCodeAt(i + 2), c3 = str.charCodeAt(i + 3);
        if ((c0 | c1 | c2 | c3) > 127) return null;
        const a = R[c0], b = R[c1], c = R[c2], d = R[c3];
        if ((a | b | c | d) < 0) return null;
        const n = (a << 18) | (b << 12) | (c << 6) | d;
        out[o++] = n >> 16; out[o++] = (n >> 8) & 255; out[o++] = n & 255;
    }
    let acc = 0, bits = 0;
    for (; i < end; i++) {
        const c = str.charCodeAt(i), v = c < 128 ? R[c] : -1;
        if (v < 0) return null;
        acc = (acc << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
    }
    return out.subarray(0, o);
}
export function bytesToB64(b) {
    let s = '';
    for (let i = 0; i < b.length; i += 3) {
        const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
        s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    }
    return s;
}
function asciiBytes(str) { const b = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 255; return b; }
function bytesAscii(b) { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192))); return s; }

/* ---- packs ---- */

/* A pack file's text → { enc, chunks } or null. */
export function parsePack(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return null; }
    if (!doc || doc.v !== 1 || typeof doc.chunks !== 'object' || !doc.chunks) return null;
    return { enc: !!doc.enc, rounds: doc.r | 0 || 20, chunks: doc.chunks };
}
export function packCats(pack) { return pack ? Object.keys(pack.chunks) : []; }

/* One category's library JSON text, or null (absent, no key, wrong key). */
export function packCategory(pack, cat, keyHex) {
    if (!pack || !(cat in pack.chunks)) return null;
    const c = pack.chunks[cat];
    if (!pack.enc) return typeof c === 'string' ? c : null;
    const key = hexToBytes(keyHex);
    if (!key || key.length !== 32 || !c || typeof c.d !== 'string') return null;
    const nonce = hexToBytes(c.n);
    const data = b64ToBytes(c.d);
    if (!nonce || nonce.length !== 12 || !data) return null;
    const text = bytesAscii(chacha20Xor(key, nonce, data, pack.rounds));
    return text.charCodeAt(0) === 123 ? text : null;       /* '{' — a wrong key reads as garbage */
}

/* The writer's half (the phrase generator's): one category's library text → chunk. */
export function packChunk(text, keyHex, nonceHex, rounds) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 126) throw new Error('pack chunk is not ASCII at ' + i);
    const key = hexToBytes(keyHex), nonce = hexToBytes(nonceHex);
    if (!key || key.length !== 32) throw new Error('pack key must be 64 hex characters');
    if (!nonce || nonce.length !== 12) throw new Error('nonce must be 24 hex characters');
    return { n: nonceHex, d: bytesToB64(chacha20Xor(key, nonce, asciiBytes(text), rounds || 20)) };
}

/* ---- decoding in slices ----
 * The same result as packCategory, spread over calls: step(bytes) decodes up
 * to about that many bytes of the chunk and returns true when done; text()
 * is then the library text (or null). For decoding in the background, a few
 * kilobytes per UI tick, instead of in one go when the category is opened. */
export function packCategoryJob(pack, cat, keyHex) {
    if (!pack || !(cat in pack.chunks)) return null;
    const c = pack.chunks[cat];
    if (!pack.enc) { const t = typeof c === 'string' ? c : null; return { step: () => true, text: () => t }; }
    const key = hexToBytes(keyHex), nonce = c && hexToBytes(c.n);
    if (!key || key.length !== 32 || !nonce || nonce.length !== 12 || typeof c.d !== 'string') return { step: () => true, text: () => null };
    const str = c.d;
    let end = str.length;
    while (end > 0 && str.charCodeAt(end - 1) === 61) end--;
    const whole = end - (end % 4);                       /* 4-char groups; the tail at the end */
    const buf = new Uint8Array(Math.floor(end * 3 / 4));
    let ci = 0, o = 0, bytes = null, pos = 0, out = null, failed = false;
    const parts = [];
    return {
        step(budget) {
            if (out !== null || failed) return true;
            if (!bytes) {                                 /* base64, a slice at a time */
                const R = B64_REV, stop = Math.min(whole, ci + Math.max(4, ((budget * 4 / 3) >> 2) << 2));
                for (; ci < stop; ci += 4) {
                    const c0 = str.charCodeAt(ci), c1 = str.charCodeAt(ci + 1), c2 = str.charCodeAt(ci + 2), c3 = str.charCodeAt(ci + 3);
                    if ((c0 | c1 | c2 | c3) > 127) { failed = true; return true; }
                    const a = R[c0], b = R[c1], cc = R[c2], d = R[c3];
                    if ((a | b | cc | d) < 0) { failed = true; return true; }
                    const n = (a << 18) | (b << 12) | (cc << 6) | d;
                    buf[o++] = n >> 16; buf[o++] = (n >> 8) & 255; buf[o++] = n & 255;
                }
                if (ci < whole) return false;
                const tail = b64ToBytes(str.slice(whole, end));
                if (!tail) { failed = true; return true; }
                buf.set(tail, o); o += tail.length;
                bytes = buf.subarray(0, o);
                return false;
            }
            /* whole 64-byte blocks from `pos`; the counter follows the position */
            const n = Math.max(64, (budget >> 6) << 6);
            const upTo = Math.min(bytes.length, pos + n);
            chacha20XorAt(key, nonce, bytes, pos, upTo, pack.rounds);
            parts.push(bytesAscii(bytes.subarray(pos, upTo)));      /* text a slice at a time too */
            pos = upTo;
            if (pos < bytes.length) return false;
            const t = parts.join('');
            out = t.charCodeAt(0) === 123 ? t : null;
            if (out === null) failed = true;
            return true;
        },
        text() { return out; },
    };
}
/* chacha20Xor over bytes [from, to) of `data`, from = a multiple of 64. */
function chacha20XorAt(key, nonce, data, from, to, rounds) {
    const view = data.subarray(from, to);
    /* a fresh aligned copy keeps the word-at-a-time path, then back in place */
    const tmp = new Uint8Array(view.length); tmp.set(view);
    chacha20XorFrom(key, nonce, tmp, rounds, 1 + (from >> 6));
    view.set(tmp);
}
