/* display_unpack.mjs — the shadow display segment's 1-bpp packing, as ONE
 * function both the grab-screen tool and its test use.
 *
 * Layout (src/host/js_display.c js_display_pack): PAGE-major. Byte i covers
 * page = i / 128, x = i % 128; bit j (LSB first) is the pixel at
 * (x, page*8 + j). 8 pages x 128 bytes = DISPLAY_BUFFER_SIZE 1024. */
export const DISPLAY_W = 128, DISPLAY_H = 64, DISPLAY_BYTES = 1024;

export function unpackDisplay(buf) {
    if (!buf || buf.length < DISPLAY_BYTES) throw new Error('display buffer is ' + (buf ? buf.length : 0) + ' bytes, need ' + DISPLAY_BYTES);
    const fb = new Uint8Array(DISPLAY_W * DISPLAY_H);
    for (let page = 0; page < DISPLAY_H / 8; page++)
        for (let x = 0; x < DISPLAY_W; x++) {
            const b = buf[page * DISPLAY_W + x];
            for (let j = 0; j < 8; j++) if (b & (1 << j)) fb[(page * 8 + j) * DISPLAY_W + x] = 1;
        }
    return fb;
}

/* The inverse, for tests and for feeding a synthetic frame back. */
export function packDisplay(fb) {
    const out = new Uint8Array(DISPLAY_BYTES);
    for (let page = 0; page < DISPLAY_H / 8; page++)
        for (let x = 0; x < DISPLAY_W; x++) {
            let b = 0;
            for (let j = 0; j < 8; j++) if (fb[(page * 8 + j) * DISPLAY_W + x]) b |= (1 << j);
            out[page * DISPLAY_W + x] = b;
        }
    return out;
}
