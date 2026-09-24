/* ui_phrase_pack.mjs — reading a phrase pack. Pure: no host calls.
 *
 * A pack is one JSON file holding a library chunk per category:
 *
 *   {"v":1,"enc":false,"chunks":{"kick":"<library JSON text>", …}}
 *   {"v":1,"enc":true, "chunks":{"kick":{"n":"<24 hex nonce>","d":"<base64>"}, …}}
 *
 * An encrypted chunk is the library JSON text (ASCII) under ChaCha20 (RFC 8439,
 * block counter from 1) with the pack key. Only the category being browsed is
 * decoded. tools/phrasegen writes packs with the same code (packChunk).
 */

/* ---- ChaCha20 ---- */

function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function qr(s, a, b, c, d) {
    s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 16);
    s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 8);
    s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 7);
}
function words(bytes, off, n) {
    const w = new Array(n);
    for (let i = 0; i < n; i++) {
        const o = off + i * 4;
        w[i] = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
    }
    return w;
}
/* XOR `data` (Uint8Array) in place with the ChaCha20 stream for key (32
 * bytes) / nonce (12 bytes), counter starting at 1. */
export function chacha20Xor(key, nonce, data) {
    const k = words(key, 0, 8), nn = words(nonce, 0, 3);
    const init = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...k, 1, ...nn];
    const s = new Array(16), out = new Uint8Array(64);
    for (let pos = 0, ctr = 1; pos < data.length; pos += 64, ctr++) {
        init[12] = ctr >>> 0;
        for (let i = 0; i < 16; i++) s[i] = init[i];
        for (let r = 0; r < 10; r++) {
            qr(s, 0, 4, 8, 12); qr(s, 1, 5, 9, 13); qr(s, 2, 6, 10, 14); qr(s, 3, 7, 11, 15);
            qr(s, 0, 5, 10, 15); qr(s, 1, 6, 11, 12); qr(s, 2, 7, 8, 13); qr(s, 3, 4, 9, 14);
        }
        for (let i = 0; i < 16; i++) {
            const v = (s[i] + init[i]) >>> 0;
            out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255; out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = v >>> 24;
        }
        const n = Math.min(64, data.length - pos);
        for (let i = 0; i < n; i++) data[pos + i] ^= out[i];
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
    const str = String(s || '').replace(/=+$/, '');
    const out = new Uint8Array(Math.floor(str.length * 3 / 4));
    let o = 0, acc = 0, bits = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i), v = c < 128 ? B64_REV[c] : -1;
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
    return { enc: !!doc.enc, chunks: doc.chunks };
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
    const text = bytesAscii(chacha20Xor(key, nonce, data));
    return text.charCodeAt(0) === 123 ? text : null;       /* '{' — a wrong key reads as garbage */
}

/* The writer's half (tools/phrasegen): one category's library text → chunk. */
export function packChunk(text, keyHex, nonceHex) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 126) throw new Error('pack chunk is not ASCII at ' + i);
    const key = hexToBytes(keyHex), nonce = hexToBytes(nonceHex);
    if (!key || key.length !== 32) throw new Error('pack key must be 64 hex characters');
    if (!nonce || nonce.length !== 12) throw new Error('nonce must be 24 hex characters');
    return { n: nonceHex, d: bytesToB64(chacha20Xor(key, nonce, asciiBytes(text))) };
}
