#!/usr/bin/env bash
# The filepath browser's LIVE PREVIEW moved out of the host's screen and into
# the shared library — and this proves the move changed NOTHING.
#
# ⭐ WHY THE MOVE. Everything the shared browser carried was DATA: the entries,
# the cursor, what a click means. The BEHAVIOUR — auditioning the highlighted
# file, running the module's `browser_hooks`, putting back what a cancel
# borrowed — stayed inside shadow_ui.js, where a second consumer cannot reach
# it. dAVEBOx draws its own browser, so it silently had no audition at all
# (upstream shipped live_preview in 9c48f4d3, 2026-03-04). One design decision,
# and it surfaced as four separate "bugs" in a day.
#
# ⚠⚠ WHY A DIFFERENTIAL TEST AND NOT ASSERTIONS. Reading a refactor twice is
# not proof it is one — that has already let a real regression through here. So
# this file carries the OLD host implementation VERBATIM, drives it and the new
# shared one through the same scripted sessions over the same io, and compares
# the WRITE LOG. Any divergence in what reached the parameters is a failure,
# whether or not anyone thought to assert it.
#
# The matrix is the whole product of what the paths branch on: live preview on
# and off, hooks present and absent, `restore` set and clear, a setParam that
# takes and one that refuses, files and directories, commit and cancel.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

/* ---- load the SHIPPING shared module ----------------------------------- *
 * It cannot be imported by path: session_state.mjs names the QuickJS `std`
 * module, which node has no idea about. So the file is loaded as TEXT with
 * exactly two lines rewritten, and each rewrite is COUNTED — a replace that
 * matched nothing would leave a passing test measuring nothing. */
const shared = "src/shared/filepath_browser.mjs";
let src = readFileSync(shared, "utf8");
const visUrl = pathToFileURL("src/shared/param_pages/visibility.mjs").href;
const swaps = [
    ["import { pathHiddenFromBrowsers } from \x27./session_state.mjs\x27;",
     "const pathHiddenFromBrowsers = () => false; /* not exercised here */"],
    ["import { parseMetaBool } from \x27./param_pages/visibility.mjs\x27;",
     "import { parseMetaBool } from \x27" + visUrl + "\x27;"]
];
for (const [from, to] of swaps) {
    if (src.split(from).length - 1 !== 1) {
        console.log("FAIL  — the loader could not find, exactly once: " + from);
        process.exit(1);
    }
    src = src.replace(from, to);
}
const NEW = await import("data:text/javascript," + encodeURIComponent(src));
const { parseMetaBool } = await import(visUrl);

/* ---- the OLD host implementation, verbatim from shadow_ui.js ------------ *
 * Only the two host globals are swapped for the io the new code takes. */
function makeOld(io) {
    function normalizeFilepathHookActions(rawActions, prefix) {
        if (!Array.isArray(rawActions)) return [];
        const out = [];
        for (const action of rawActions) {
            if (!action || typeof action !== "object") continue;
            const rawKey = typeof action.key === "string" ? action.key.trim() : "";
            if (!rawKey) continue;
            const fullKey = rawKey.includes(":") ? rawKey : (prefix ? `${prefix}:${rawKey}` : rawKey);
            const value = action.value === undefined || action.value === null ? "" : String(action.value);
            out.push({ key: fullKey, value, restore: parseMetaBool(action.restore) });
        }
        return out;
    }
    function buildFilepathBrowserHooks(meta, prefix) {
        const hooksRaw = (meta && meta.browser_hooks && typeof meta.browser_hooks === "object")
            ? meta.browser_hooks : {};
        return {
            onOpen: normalizeFilepathHookActions(hooksRaw.on_open, prefix),
            onPreview: normalizeFilepathHookActions(hooksRaw.on_preview, prefix),
            onCancel: normalizeFilepathHookActions(hooksRaw.on_cancel, prefix),
            onCommit: normalizeFilepathHookActions(hooksRaw.on_commit, prefix)
        };
    }
    function resolveFilepathHookValue(rawValue, context) {
        const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
        if (value === "$path" || value === "$selected_path") {
            return context && context.path ? String(context.path) : "";
        }
        if (value === "$filename" || value === "$selected_filename") {
            if (context && context.path) {
                const path = String(context.path);
                const idx = path.lastIndexOf("/");
                return idx >= 0 ? path.slice(idx + 1) : path;
            }
            return "";
        }
        return value;
    }
    function applyFilepathHookActions(state, actions, context) {
        if (!state || !Array.isArray(actions) || actions.length === 0) return;
        for (const action of actions) {
            if (!action || !action.key) continue;
            if (action.restore && state.hookRestoreValues &&
                !Object.prototype.hasOwnProperty.call(state.hookRestoreValues, action.key)) {
                const prev = io.getParam(action.key);
                if (prev !== null && prev !== undefined) {
                    state.hookRestoreValues[action.key] = String(prev);
                }
            }
            const nextVal = resolveFilepathHookValue(action.value, context);
            io.setParam(action.key, nextVal);
        }
    }
    function restoreFilepathHookActions(state) {
        if (!state || !state.hookRestoreValues) return;
        for (const [key, prevValue] of Object.entries(state.hookRestoreValues)) {
            io.setParam(key, prevValue);
        }
    }
    function applyLivePreview(state, selected) {
        if (!state || !state.livePreviewEnabled || !selected || selected.kind !== "file" || !selected.path) return;
        if (selected.path === state.previewCurrentValue || !state.previewParamFullKey) return;
        if (io.setParam(state.previewParamFullKey, selected.path)) {
            state.previewCurrentValue = selected.path;
            applyFilepathHookActions(state, state.hooksOnPreview, { path: selected.path });
        }
    }

    /* the call sites, also verbatim */
    return {
        open(state, meta, fullKey, currentVal, prefix) {
            state.livePreviewEnabled = parseMetaBool(meta.live_preview);
            state.previewOriginalValue = currentVal;
            state.previewCurrentValue = currentVal;
            state.previewCommitted = false;
            state.previewParamFullKey = fullKey;
            state.previewPendingPath = "";
            state.previewPendingTime = 0;
            state.previewSelectedPath = "";
            const hooks = buildFilepathBrowserHooks(meta, prefix);
            state.hooksOnOpen = hooks.onOpen;
            state.hooksOnPreview = hooks.onPreview;
            state.hooksOnCancel = hooks.onCancel;
            state.hooksOnCommit = hooks.onCommit;
            state.hookRestoreValues = {};
            applyFilepathHookActions(state, state.hooksOnOpen, { path: currentVal });
        },
        afterFirstRefresh(state) {
            if (state.livePreviewEnabled) {
                applyLivePreview(state, state.items[state.selectedIndex]);
            }
        },
        jog(state) {
            const selected = state.items[state.selectedIndex];
            if (state.livePreviewEnabled && selected && selected.kind === "file" && selected.path) {
                state.previewPendingPath = selected.path;
                state.previewPendingTime = Date.now();
            } else if (state.livePreviewEnabled) {
                state.previewPendingPath = "";
                state.previewPendingTime = 0;
            }
        },
        tick(state, now) {
            if (state && state.livePreviewEnabled && state.previewPendingPath &&
                now - state.previewPendingTime >= 150) {
                applyLivePreview(state, { kind: "file", path: state.previewPendingPath });
                state.previewPendingPath = "";
                state.previewPendingTime = 0;
            }
        },
        dirOpened(state) {
            if (state.livePreviewEnabled) {
                const selected = state.items[state.selectedIndex];
                state.previewPendingPath = "";
                state.previewPendingTime = 0;
                applyLivePreview(state, selected);
            }
        },
        selected(state, value) {
            if (state.livePreviewEnabled) {
                state.previewCommitted = true;
                state.previewCurrentValue = value || "";
                state.previewPendingPath = "";
                state.previewPendingTime = 0;
            }
            state.previewSelectedPath = value || "";
        },
        close(state) {
            if (state) {
                const committed = !!state.previewCommitted;
                if (state.livePreviewEnabled && !committed && state.previewParamFullKey &&
                    state.previewCurrentValue !== state.previewOriginalValue) {
                    io.setParam(state.previewParamFullKey, state.previewOriginalValue || "");
                }
                if (committed) {
                    applyFilepathHookActions(state, state.hooksOnCommit,
                        { path: state.previewSelectedPath || state.previewCurrentValue || "" });
                } else {
                    applyFilepathHookActions(state, state.hooksOnCancel,
                        { path: state.previewOriginalValue || "" });
                }
                restoreFilepathHookActions(state);
            }
        }
    };
}

/* the new side, driven through its exported names */
function makeNew(io) {
    return {
        open(state, meta, fullKey, currentVal, prefix) {
            NEW.initFilepathPreview(state, meta, fullKey, currentVal, prefix, io);
        },
        afterFirstRefresh(state) { NEW.syncFilepathPreviewToSelection(state, io); },
        jog(state)               { NEW.armFilepathPreview(state); },
        tick(state, now)         { NEW.tickFilepathPreview(state, io, now); },
        dirOpened(state)         { NEW.syncFilepathPreviewToSelection(state, io); },
        selected(state, value)   { NEW.commitFilepathSelection(state, value); },
        close(state)             { NEW.finishFilepathPreview(state, io); }
    };
}

/* Date.now() is the only unmockable input either side reads (the arm). Both
 * sides are driven through the same reference so the debounce is comparable. */
const NOWREF = { t: 0 };
const realNow = Date.now;
Date.now = () => NOWREF.t;

function makeIo(writesTake, initial) {
    const store = Object.assign({}, initial);
    const log = [];
    return {
        log,
        getParam(key) {
            log.push(["get", key]);
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        setParam(key, value) {
            log.push(["set", key, value, writesTake]);
            if (writesTake) store[key] = value;
            return writesTake;
        }
    };
}

/* ---- the scripted session ---------------------------------------------- */
const FILES = [
    { kind: "up",   label: "..",   path: "/root" },
    { kind: "dir",  label: "kits", path: "/root/kits" },
    { kind: "file", label: "a.wav", path: "/root/a.wav" },
    { kind: "file", label: "b.wav", path: "/root/b.wav" }
];

function runSession(driver, io, meta, script) {
    /* a hand-built state: this test is about the PREVIEW half, so the listing
     * is fixed rather than read off a filesystem. */
    const state = { items: FILES.slice(), selectedIndex: 2, key: "sample", title: "Sample" };
    driver.open(state, meta, "synth:sample", "/root/a.wav", "synth");
    driver.afterFirstRefresh(state);
    for (const step of script) {
        if (step[0] === "move")  { state.selectedIndex = step[1]; driver.jog(state); }
        if (step[0] === "wait")  { NOWREF.t += step[1]; driver.tick(state, NOWREF.t); }
        if (step[0] === "enter") { state.selectedIndex = step[1]; driver.dirOpened(state); }
        if (step[0] === "pick")  { driver.selected(state, step[1]); }
        if (step[0] === "close") { driver.close(state); }
    }
    return state;
}

const SCRIPTS = {
    "cancel after browsing":       [["move",3],["wait",200],["move",2],["wait",50],["close"]],
    "commit the highlighted file": [["move",3],["wait",200],["pick","/root/b.wav"],["close"]],
    "into a folder, then out":     [["move",1],["wait",200],["enter",2],["wait",200],["close"]],
    "flick past without resting":  [["move",3],["wait",20],["move",2],["wait",20],["close"]],
    "close on a directory":        [["move",1],["wait",300],["close"]],
    "pick without ever resting":   [["pick","/root/a.wav"],["close"]]
};

const HOOKS = {
    "no hooks": {},
    "preview + commit hooks": { browser_hooks: {
        on_open:    [{ key: "gate", value: "1" }],
        on_preview: [{ key: "name", value: "$filename" }],
        on_commit:  [{ key: "loaded", value: "$path" }],
        on_cancel:  [{ key: "loaded", value: "" }]
    }},
    "borrowing hooks (restore)": { browser_hooks: {
        on_open:    [{ key: "mode", value: "browse", restore: true },
                     { key: "fx:mix", value: "0", restore: "yes" }],
        on_preview: [{ key: "mode", value: "browse", restore: true }],
        on_cancel:  [{ key: "note", value: "$selected_filename" }]
    }},
    "bare-key hooks (prefixed)": { browser_hooks: {
        on_open: [{ key: " trim ", value: "$path" }, { key: "", value: "x" }, { key: "other:k", value: "1" }]
    }}
};

let compared = 0;
for (const preview of [true, false]) {
    for (const [hookName, hookMeta] of Object.entries(HOOKS)) {
        for (const writesTake of [true, false]) {
            for (const [scriptName, script] of Object.entries(SCRIPTS)) {
                const meta = Object.assign({ type: "filepath", live_preview: preview }, hookMeta);
                const initial = { "synth:sample": "/root/a.wav", "synth:mode": "play", "synth:fx:mix": "0.7" };

                NOWREF.t = 1000;
                const ioOld = makeIo(writesTake, initial);
                const sOld = runSession(makeOld(ioOld), ioOld, meta, script);

                NOWREF.t = 1000;
                const ioNew = makeIo(writesTake, initial);
                const sNew = runSession(makeNew(ioNew), ioNew, meta, script);

                const label = `preview=${preview} · ${hookName} · writes=${writesTake ? "take" : "refuse"} · ${scriptName}`;
                const sameIo = JSON.stringify(ioOld.log) === JSON.stringify(ioNew.log);
                if (!sameIo) {
                    console.log("      old: " + JSON.stringify(ioOld.log));
                    console.log("      new: " + JSON.stringify(ioNew.log));
                }
                ok(sameIo, "same parameter traffic — " + label);
                const pick = (s) => JSON.stringify({
                    e: s.livePreviewEnabled, o: s.previewOriginalValue, c: s.previewCurrentValue,
                    k: s.previewCommitted, s: s.previewSelectedPath,
                    p: s.previewPendingPath, r: s.hookRestoreValues
                });
                ok(pick(sOld) === pick(sNew), "same resulting state   — " + label);
                compared++;
            }
        }
    }
}
ok(compared === 2 * Object.keys(HOOKS).length * 2 * Object.keys(SCRIPTS).length,
   `⭐ the whole matrix ran: ${compared} sessions compared old-vs-new`);

/* A control. If the harness could not tell the two apart, every line above is
 * worthless — so drive a DELIBERATELY wrong "new" side and require a failure. */
{
    NOWREF.t = 1000;
    const meta = { type: "filepath", live_preview: true, browser_hooks: { on_preview: [{ key: "name", value: "$filename" }] } };
    const ioA = makeIo(true, {}); const a = makeOld(ioA);
    const ioB = makeIo(true, {});
    const bent = makeNew(ioB);
    const realTick = bent.tick;
    bent.tick = (s, now) => realTick(s, now + 10000);   /* a debounce that never waits */
    const script = [["move", 3], ["wait", 20], ["close"]];
    NOWREF.t = 1000; runSession(a, ioA, meta, script);
    NOWREF.t = 1000; runSession(bent, ioB, meta, script);
    if (JSON.stringify(ioA.log) === JSON.stringify(ioB.log)) {
        console.log("      A: " + JSON.stringify(ioA.log));
        console.log("      B: " + JSON.stringify(ioB.log));
    }
    ok(JSON.stringify(ioA.log) !== JSON.stringify(ioB.log),
       "⭐ CONTROL: the comparison FAILS on a deliberately bent implementation");
}

Date.now = realNow;

console.log(fail === 0 ? "PASS" : `FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
'
