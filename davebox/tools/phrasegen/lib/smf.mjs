/* A minimal Standard MIDI File writer (format 1, 96 PPQN) — to render
 * candidate phrases for audition in any DAW. */
function vlq(n) { const o = [n & 0x7f]; while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80); return o; }
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map(c => c.charCodeAt(0) & 0x7f);
const chunk = (id, b) => [...ascii(id), ...be32(b.length), ...b];

/* tracks: [{ name, ch, notes: [{ t, p, v, g }] }] */
export function writeSmf({ bpm = 120, tracks, loops = 1, loopTicks = 0 }) {
    const tempo = Math.round(60000000 / bpm);
    const conductor = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255,
                       0, 0xff, 0x58, 4, 4, 2, 24, 8, 0, 0xff, 0x2f, 0];
    const out = [...chunk('MThd', [0, 1, 0, tracks.length + 1, 0, 96]), ...chunk('MTrk', conductor)];
    for (const tr of tracks) {
        const ev = [];
        for (let k = 0; k < loops; k++) for (const n of tr.notes) {
            const t = n.t + k * loopTicks;
            ev.push([t, 1, 0x90 | tr.ch, n.p, n.v], [t + Math.max(1, n.g), 0, 0x80 | tr.ch, n.p, 0]);
        }
        ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const b = [0, 0xff, 0x03, ...vlq(tr.name.length), ...ascii(tr.name)];
        let last = 0;
        for (const [t, , ...x] of ev) { b.push(...vlq(t - last), ...x); last = t; }
        b.push(0, 0xff, 0x2f, 0);
        out.push(...chunk('MTrk', b));
    }
    return Uint8Array.from(out);
}
