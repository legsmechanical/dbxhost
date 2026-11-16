/* ui_strip_render.mjs — the EQ CURVE CARD: while an EQ knob is in hand (MIX
 * page 2, the Session mixer's EQ pages), a pop-up over the page draws the
 * track's EQ response — Josh, 2026-11-15: "a pop-up visual EQ curve display
 * show when any of those are adjusted (same with adjustments from track view
 * mix page)".
 *
 * The box is the stacked-list card's (kitStackBox), over the dimmed page: the
 * knob and its value on the title bar, then 20 Hz .. 20 kHz across (log, ticks
 * at 100 Hz, 1 kHz and 10 kHz), ±15 dB up and down with the 0 dB line dotted,
 * and the band in hand marked where it acts. The Screen view gets the same
 * curve (the `Curve` family) as a pop-up. */
import { fontPrint4x5, fontWidth4x5, fit4x5 } from './ui_fonts_pp.mjs';
import { kitStackBox, drawKitBackdropDim, rectOutline, plotLine, kitHudTap } from './ui_movy.mjs';
import { stripEqCurve, stripMidHz, STRIP_EQ_DB_MAX, STRIP_LOW_HZ, STRIP_HIGH_HZ } from './ui_strip.mjs';

const xOfHz = (hz, x0, w) => x0 + Math.round(Math.log10(hz / 20) / 3 * (w - 1));

/* `vals` {eq_low, eq_mid, eq_mid_freq, eq_high}; `cell` {name, text} for the
 * title; `key` the knob in hand (its band is marked). */
export function drawStripEqCard(vals, cell, key) {
    const B = kitStackBox(1);
    drawKitBackdropDim();
    fill_rect(B.x, B.y, B.w, B.h, 0);
    rectOutline(B.x, B.y, B.w, B.h, 1);
    fill_rect(B.x + 1, B.y + 1, B.w - 2, 8, 1);
    const name = String((cell && (cell.name || cell.label)) || 'EQ').toUpperCase();
    const val = String((cell && cell.text) || '').toUpperCase();
    const vw = fontWidth4x5(val);
    fontPrint4x5(B.x + 4, B.y + 3, fit4x5(name, B.w - vw - 14), 0);
    fontPrint4x5(B.x + B.w - 4 - vw, B.y + 3, val, 0);

    const gx = B.x + 3, gw = B.w - 6, gy = B.y + 12, gh = B.h - 15;
    const yOfDb = (db) => gy + Math.round((1 - (Math.max(-STRIP_EQ_DB_MAX, Math.min(STRIP_EQ_DB_MAX, db)) + STRIP_EQ_DB_MAX) / (2 * STRIP_EQ_DB_MAX)) * (gh - 1));
    const y0 = yOfDb(0);
    for (let x = gx; x < gx + gw; x += 2) set_pixel(x, y0, 1);                 /* 0 dB, dotted */
    for (const hz of [100, 1000, 10000]) {                                       /* decade ticks */
        const x = xOfHz(hz, gx, gw);
        set_pixel(x, gy + gh - 1, 1); set_pixel(x, gy + gh - 2, 1); set_pixel(x, gy, 1);
    }
    const pts = stripEqCurve(vals, gw);
    let py = yOfDb(pts[0]);
    for (let i = 1; i < gw; i++) {
        const y = yOfDb(pts[i]);
        plotLine(gx + i - 1, py, gx + i, y, 1);
        py = y;
    }
    /* the band in hand: a small marker where it acts */
    const hz = key === 'eq_low' ? STRIP_LOW_HZ : key === 'eq_high' ? STRIP_HIGH_HZ
             : (key === 'eq_mid' || key === 'eq_mid_freq') ? stripMidHz(vals.eq_mid_freq ?? 0.5) : 0;
    if (hz) {
        const x = xOfHz(hz, gx, gw);
        const i = Math.max(0, Math.min(gw - 1, x - gx));
        const y = yOfDb(pts[i]);
        fill_rect(x - 1, y - 1, 3, 3, 1);
        set_pixel(x, y, 0);
    }
    kitHudTap('Curve', { values: pts.map((db) => Math.round((Math.max(-STRIP_EQ_DB_MAX, Math.min(STRIP_EQ_DB_MAX, db)) + STRIP_EQ_DB_MAX) / (2 * STRIP_EQ_DB_MAX) * 1000) / 1000),
                         name: name + ' ' + val });
}
