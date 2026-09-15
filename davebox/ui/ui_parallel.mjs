/* ui_parallel.mjs — the per-module PARALLEL default and the slot pins that
 * carry it to the host's render pool.
 *
 * THE MODEL (Josh, ruled 2026-09-05): each track's CONFIG screen has a
 * `Parallel` row, and flipping it sets the DEVICE-WIDE default for the
 * module loaded in that track — not a per-track choice. A module is either
 * safe to render on a pool helper alongside the other slots, or it is not;
 * that is a property of the module's code, so the switch belongs to the
 * module and every slot holding it follows.
 *
 * The host side is `slot:parallel` (1 = the render pool may place the slot
 * on any lane; 0 = the slot renders on the SPI thread, serially, exactly as
 * it always did). This file OWNS the mapping from "which module is in slot
 * s" to that flag, and pushes it:
 *   - after the picker loads a module into a slot (applyModulePick),
 *   - after a project load (every slot),
 *   - and one slot per PARALLEL_SWEEP_TICKS from the tick, round-robin, so a
 *     module that arrived by another road (a snapshot recall replaying a
 *     chain blob loads modules inside the host) is corrected within a few
 *     seconds rather than never. One get_param per sweep step, never more.
 *
 * DEFAULTS: on, except the modules in BUILTIN_OFF — Dexed (`dexed`: its
 * msfa lookup tables are class-static and re-initialised on every instance
 * construction) and JE-8086 (`jp8000`: three forked processes with hard
 * core affinity and FIFO 20 of their own, not a workload a thread pool can
 * schedule). Both were named by Josh as "pre-set Off"; the user can flip
 * either from the row. ⚠ Under the pool's fork-join shape a module's
 * CONSTRUCTION never overlaps a render, so Dexed's race cannot actually
 * fire — the default is the ruling, and it is one row-flip to change.
 *
 * STORAGE: /data/UserData/dbx-host/parallel-modules.txt, one `id 0|1` per
 * line. Device-global like the Daves preference (a property of the user's
 * device, not a song's); the deploy merges file by file so it survives an
 * update. Absent file = built-in defaults. */

import { engineLoadedModule, engineSetSlotParam, CHAIN_SLOTS } from './ui_engine.mjs';

export const PARALLEL_PREF_PATH = '/data/UserData/dbx-host/parallel-modules.txt';
export const BUILTIN_OFF = ['dexed', 'jp8000'];
/* One slot per this many ticks; CHAIN_SLOTS × this = a full sweep (~8 s at
 * 40 ticks/s with 40). */
export const PARALLEL_SWEEP_TICKS = 40;

/* moduleId -> 0|1; null until first read. */
let prefs = null;
/* What this UI last pushed per slot (0|1), or -1 = unknown: a write only
 * happens on change, so a sweep over a stable set costs reads, not writes. */
const pushed = new Array(CHAIN_SLOTS).fill(-1);
let sweepSlot = 0;

function loadPrefs() {
    if (prefs) return prefs;
    prefs = Object.create(null);
    let raw = '';
    try {
        raw = host_file_exists(PARALLEL_PREF_PATH) ? (host_read_file(PARALLEL_PREF_PATH) || '') : '';
    } catch (e) { raw = ''; }
    const lines = String(raw).split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].trim().match(/^(\S+)\s+([01])$/);
        if (m) prefs[m[1]] = m[2] === '1' ? 1 : 0;
    }
    return prefs;
}

function savePrefs() {
    const p = loadPrefs();
    const ids = Object.keys(p).sort();
    let out = '';
    for (let i = 0; i < ids.length; i++) out += ids[i] + ' ' + p[ids[i]] + '\n';
    try { host_write_file(PARALLEL_PREF_PATH, out); } catch (e) { /* best effort */ }
}

/* The device-wide default for a module id: the user's setting if any, else
 * the built-in list, else on. An empty id (no module) is "on" — an empty
 * slot has nothing to pin. */
export function moduleParallelDefault(moduleId) {
    const id = String(moduleId || '').toLowerCase();
    if (!id) return 1;
    const p = loadPrefs();
    if (id in p) return p[id];
    return BUILTIN_OFF.indexOf(id) >= 0 ? 0 : 1;
}

/* Flip the device-wide default for a module and re-pin every slot that
 * holds it. Returns the number of slots re-pushed. */
export function setModuleParallelDefault(moduleId, on) {
    const id = String(moduleId || '').toLowerCase();
    if (!id) return 0;
    loadPrefs()[id] = on ? 1 : 0;
    savePrefs();
    let n = 0;
    for (let s = 0; s < CHAIN_SLOTS; s++) {
        const cur = String(engineLoadedModule(s, 'synth') || '').toLowerCase();
        if (cur === id) { pushSlot(s, on ? 1 : 0); n++; }
    }
    return n;
}

function pushSlot(s, on) {
    if (pushed[s] === on) return;
    pushed[s] = on;
    engineSetSlotParam(s, 'parallel', on);
}

/* Bring one slot's pin in line with the module it holds. */
export function reconcileParallelSlot(s) {
    s = s | 0;
    if (s < 0 || s >= CHAIN_SLOTS) return;
    const id = engineLoadedModule(s, 'synth');
    pushSlot(s, moduleParallelDefault(id));
}

export function reconcileParallelAll() {
    for (let s = 0; s < CHAIN_SLOTS; s++) reconcileParallelSlot(s);
}

/* The tick's share: one slot every PARALLEL_SWEEP_TICKS ticks. */
export function parallelSweepTick(tickCount) {
    if ((tickCount % PARALLEL_SWEEP_TICKS) !== 0) return;
    reconcileParallelSlot(sweepSlot);
    sweepSlot = (sweepSlot + 1) % CHAIN_SLOTS;
}

/* A project load or a relaunch: the host's slots are fresh, so what this UI
 * remembers pushing is no longer true. Forget it and push everything. */
export function parallelForgetPushed() {
    for (let s = 0; s < CHAIN_SLOTS; s++) pushed[s] = -1;
}

/* Test hooks. */
export function parallelResetForTest() { prefs = null; parallelForgetPushed(); sweepSlot = 0; }
export function parallelPushedForTest() { return pushed.slice(); }
