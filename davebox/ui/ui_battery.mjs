/*
 * The battery level, at the right of Project Settings' header (Josh,
 * 2026-10-29: "project setting header - right side. little battery icon with a
 * percentage next to it"; on the charger a plug replaces the battery).
 *
 * The level comes from Move's own power report, the SysEx the power button
 * also uses: the host hands each one to globalThis.onPowerReport(flags, value)
 * (src/shadow/shadow_ui.js). value = percent; flag 0x20 = on the charger. A
 * report arrives only when the level moves by 1% (every 1.5-3 min on battery)
 * or the charger is plugged / unplugged — none at launch — so the last one is
 * kept in a file and shown until a new one comes. Never seen one: nothing.
 */
import { S } from './ui_state.mjs';

export const BATTERY_PATH = '/data/UserData/daveboxSA/battery.txt';
const CHARGING = 0x20;

/* S.battery: null = not read yet; else { pct, charging } or { pct: -1 }. */
function battery() {
    if (S.battery === null) {
        S.battery = { pct: -1, charging: false };
        try {
            if (host_file_exists(BATTERY_PATH)) {
                const f = String(host_read_file(BATTERY_PATH) || '').trim().split(/\s+/);
                const pct = parseInt(f[0], 10), flags = parseInt(f[1], 10);
                if (pct >= 0 && pct <= 100) S.battery = { pct, charging: !!((flags | 0) & CHARGING) };
            }
        } catch (e) { /* unknown until the next report */ }
    }
    return S.battery;
}

export function batteryReport(flags, value) {
    const pct = value | 0;
    if (pct < 0 || pct > 100) return;
    const b = battery(), charging = !!((flags | 0) & CHARGING);
    if (b.pct === pct && b.charging === charging) return;
    S.battery = { pct, charging };
    S.dirty = true;
    try { host_write_file(BATTERY_PATH, pct + ' ' + ((flags | 0) & 0xFF) + '\n'); } catch (e) { /* shown anyway */ }
}

/* 10x5, ink 0 on the header band: a battery filled by the charge, or a plug. */
const PLUG = ['...####..', '########.', '...######', '########.', '...####..'];
const ICON_W = 10;

/* How wide the battery is at the header's right end (0 = nothing to show). */
export function headerBatteryWidth(fontWidth) {
    const b = battery();
    return b.pct < 0 ? 0 : 2 + fontWidth(b.pct + '%') + 3 + ICON_W;
}

/* Draws at the right end of the filled header band, nothing when no report was
 * ever seen. */
export function drawHeaderBattery(fontWidth, fontPrint, screenW) {
    const b = battery();
    if (b.pct < 0) return;
    const txt = b.pct + '%';
    const tx = screenW - 2 - fontWidth(txt);
    fontPrint(tx, 1, txt, 0);
    const bx = tx - 3 - ICON_W, by = 1;
    if (b.charging) {
        PLUG.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') set_pixel(bx + 1 + x, by + y, 0); });
    } else {
        fill_rect(bx, by, 9, 1, 0); fill_rect(bx, by + 4, 9, 1, 0);
        fill_rect(bx, by, 1, 5, 0); fill_rect(bx + 8, by, 1, 5, 0);
        fill_rect(bx + 9, by + 1, 1, 3, 0);
        const n = Math.max(b.pct > 0 ? 1 : 0, Math.round(7 * b.pct / 100));
        if (n) fill_rect(bx + 1, by + 1, n, 3, 0);
    }
}
