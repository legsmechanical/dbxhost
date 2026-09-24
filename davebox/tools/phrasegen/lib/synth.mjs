/* A tiny offline synth — renders a phrase to a WAV so the owner can audition
 * candidates in a browser page, no DAW needed. Deliberately plain sounds: the
 * point is the RHYTHM, the VELOCITY and the NOTES, not the tone.
 *
 *   hat   — high-passed noise, decay from the note length (short = closed)
 *   kick/snare/tom/perc — simple drum voices
 *   bass  — a filtered saw
 *   click — a soft kick on every beat for time (optional)
 */
const SR = 22050;

function noise(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x / 2147483648) - 1; }; }

function addHat(buf, at, vel, gateSec, rnd) {
    const dec = Math.min(0.45, Math.max(0.03, gateSec * 0.9));
    const n = Math.floor(dec * 4 * SR);
    let prev = 0, prevOut = 0;
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const w = rnd();
        const hp = 0.85 * (prevOut + w - prev); prev = w; prevOut = hp;
        buf[at + i] += hp * Math.exp(-i / (dec * SR)) * (vel / 127) * 0.5;
    }
}
function addKick(buf, at, vel, amp = 0.9) {
    const n = Math.floor(0.35 * SR);
    let ph = 0;
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const t = i / SR, f = 45 + 110 * Math.exp(-t * 30);
        ph += 2 * Math.PI * f / SR;
        buf[at + i] += Math.sin(ph) * Math.exp(-t * 9) * (vel / 127) * amp;
    }
}
function addSnare(buf, at, vel, rnd) {
    const n = Math.floor(0.25 * SR);
    let ph = 0;
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const t = i / SR; ph += 2 * Math.PI * 190 / SR;
        buf[at + i] += (rnd() * 0.6 * Math.exp(-t * 18) + Math.sin(ph) * 0.4 * Math.exp(-t * 25)) * (vel / 127) * 0.7;
    }
}
function addTom(buf, at, vel, pitch) {
    const n = Math.floor(0.4 * SR); let ph = 0;
    const f0 = 440 * Math.pow(2, (pitch - 69) / 12);
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const t = i / SR; ph += 2 * Math.PI * f0 * (1 + 0.5 * Math.exp(-t * 20)) / SR;
        buf[at + i] += Math.sin(ph) * Math.exp(-t * 8) * (vel / 127) * 0.6;
    }
}
function addPerc(buf, at, vel, rnd) {
    const n = Math.floor(0.12 * SR); let ph = 0;
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const t = i / SR; ph += 2 * Math.PI * 800 / SR;
        buf[at + i] += (Math.sin(ph) * 0.5 + rnd() * 0.2) * Math.exp(-t * 35) * (vel / 127) * 0.6;
    }
}
function addBass(buf, at, vel, pitch, gateSec) {
    const f = 440 * Math.pow(2, (pitch - 69) / 12);
    const n = Math.floor((gateSec + 0.03) * SR);
    let ph = 0, lp = 0;
    for (let i = 0; i < n && at + i < buf.length; i++) {
        const t = i / SR;
        ph += f / SR; if (ph >= 1) ph -= 1;
        const saw = 2 * ph - 1;
        const cut = 0.04 + 0.25 * Math.exp(-t * 12) * (vel / 127);
        lp += cut * (saw - lp);
        const env = Math.min(1, t * 400) * (t < gateSec ? 1 : Math.exp(-(t - gateSec) * 120));
        buf[at + i] += lp * env * (vel / 127) * 0.8;
    }
}

/* events: [{ t (ticks), v, g (ticks), p (pitch), voice }] ; bars; bpm */
export function renderWav({ events, bars, bpm, loops = 2, click = true }) {
    const secPerTick = 60 / bpm / 96;
    const loopTicks = bars * 384;
    const total = Math.ceil((loops * loopTicks * secPerTick + 0.6) * SR);
    const buf = new Float32Array(total);
    const rnd = noise(12345);
    for (let k = 0; k < loops; k++) {
        const base = k * loopTicks;
        if (click) for (let b = 0; b < bars * 4; b++) addKick(buf, Math.round((base + b * 96) * secPerTick * SR), 70, 0.45);
        for (const e of events) {
            const at = Math.round((base + e.t) * secPerTick * SR), gs = e.g * secPerTick;
            if (e.voice === 'hat') addHat(buf, at, e.v, gs, rnd);
            else if (e.voice === 'kick') addKick(buf, at, e.v);
            else if (e.voice === 'snare') addSnare(buf, at, e.v, rnd);
            else if (e.voice === 'tom') addTom(buf, at, e.v, e.p || 45);
            else if (e.voice === 'perc') addPerc(buf, at, e.v, rnd);
            else addBass(buf, at, e.v, e.p, gs);
        }
    }
    let peak = 0; for (const s of buf) peak = Math.max(peak, Math.abs(s));
    const g = peak > 0.95 ? 0.95 / peak : 1;
    const pcm = Buffer.alloc(44 + total * 2);
    pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + total * 2, 4); pcm.write('WAVE', 8);
    pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36); pcm.writeUInt32LE(total * 2, 40);
    for (let i = 0; i < total; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * g * 32767))), 44 + i * 2);
    return pcm;
}
