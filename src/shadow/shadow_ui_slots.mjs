/*
 * Shadow UI - per-slot settings DATA layer (items + value formatting).
 *
 * The SLOT_SETTINGS *view* that lived here was deleted in P7 (2026-08-10,
 * Josh's ruling): it had zero live entry points since the P5 gesture walk —
 * the primary module's sound mode owns per-slot settings, and the host's
 * Chain Settings covers the host-native path. The SLOTS root list died in
 * P5 the same way. What remains is the item table and value formatter,
 * which Chain Settings' announce still reads.
 */
import { ctx } from './shadow_ui_ctx.mjs';

/* ---- Slot settings definition ------------------------------------------- */

export const SLOT_SETTINGS = [
    { key: "patch", label: "Patch", type: "action" },
    { key: "chain", label: "Edit Chain", type: "action" },
    { key: "slot:volume", label: "Volume", type: "float", min: 0, max: 4, step: 0.05 },
    { key: "slot:send_a", label: "Send A", type: "float", min: 0, max: 1, step: 0.05 },
    { key: "slot:send_b", label: "Send B", type: "float", min: 0, max: 1, step: 0.05 },
    { key: "slot:muted", label: "Muted", type: "int", min: 0, max: 1, step: 1 },
    { key: "slot:soloed", label: "Soloed", type: "int", min: 0, max: 1, step: 1 },
    { key: "slot:receive_channel", label: "Recv Ch", type: "int", min: 0, max: 16, step: 1 },
    { key: "slot:forward_channel", label: "Fwd Ch", type: "int", min: -2, max: 15, step: 1 },
    { key: "slot:transpose", label: "Transpose", type: "int", min: -12, max: 12, step: 1 },
    { key: "midi_fx_pre_mode", label: "MIDI FX", type: "int", min: 0, max: 1, step: 1 },
    { key: "mpe_mode", label: "MPE Mode", type: "int", min: 0, max: 1, step: 1 },
];

/* ---- Helpers ------------------------------------------------------------ */

/* Check if a slot is in MPE mode (Recv=All + Fwd=THRU) */
function isSlotMpe(slot) {
    const { getSlotParam } = ctx;
    const recv = parseInt(getSlotParam(slot, "slot:receive_channel")) || 0;
    const fwd = parseInt(getSlotParam(slot, "slot:forward_channel"));
    return recv === 0 && fwd === -2;
}

export function getSlotSettingValue(slot, setting) {
    const { slots, getSlotParam } = ctx;
    if (setting.key === "patch") {
        return slots[slot]?.name || "Unknown";
    }
    if (setting.key === "mpe_mode") {
        return isSlotMpe(slot) ? "On" : "Off";
    }
    const val = getSlotParam(slot, setting.key);
    if (val === null) return "-";

    if (setting.key === "slot:volume") {
        const num = parseFloat(val);
        const pct = isNaN(num) ? 0 : Math.round(num * 100);
        return `${pct}%`;
    }
    if (setting.key === "slot:send_a" || setting.key === "slot:send_b") {
        const num = parseFloat(val);
        const pct = isNaN(num) ? 0 : Math.round(num * 100);
        return `${pct}%`;
    }
    if (setting.key === "slot:muted") {
        return parseInt(val) ? "Yes" : "No";
    }
    if (setting.key === "slot:soloed") {
        return parseInt(val) ? "Yes" : "No";
    }
    if (setting.key === "slot:forward_channel") {
        const ch = parseInt(val);
        if (ch === -2) return "Thru";
        if (ch === -1) return "Auto";
        return `Ch ${ch + 1}`;
    }
    if (setting.key === "slot:receive_channel") {
        const ch = parseInt(val);
        return ch === 0 ? "All" : `Ch ${val}`;
    }
    if (setting.key === "slot:transpose") {
        const n = parseInt(val) || 0;
        if (n === 0) return "0 st";
        return `${n > 0 ? "+" : ""}${n} st`;
    }
    if (setting.key === "midi_fx_pre_mode") {
        return parseInt(val) ? "Schw+Move" : "Schw";
    }
    return val;
}
