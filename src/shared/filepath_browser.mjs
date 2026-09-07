/*
 * Reusable filepath parameter browser helpers for Schwung Shadow UI.
 *
 * This file is designed to be copied into schwung/shared and imported
 * from shadow_ui.js with minimal glue code.
 */

import { pathHiddenFromBrowsers } from './session_state.mjs';
/* ⚠⚠ RELATIVE, and every sibling import in the shared library must be. An
 * absolute `/data/UserData/schwung/...` is an address in the OTHER install —
 * the device carries two complete trees by design — and two specifiers for one
 * file give you two module INSTANCES. That is not theory: it is what made every
 * sample cell draw a flat line while the pump logged success (e744b404). */
import { parseMetaBool } from './param_pages/visibility.mjs';

const DEFAULT_ROOT = '/data/UserData';

function normalizePath(path) {
    if (!path || typeof path !== 'string') return '/';

    const isAbsolute = path.startsWith('/');
    const parts = path.split('/');
    const stack = [];

    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (stack.length > 0) stack.pop();
            continue;
        }
        stack.push(part);
    }

    if (isAbsolute) {
        return stack.length > 0 ? `/${stack.join('/')}` : '/';
    }
    return stack.join('/');
}

function dirname(path) {
    const normalized = normalizePath(path);
    if (normalized === '/' || normalized === '') return '/';
    const idx = normalized.lastIndexOf('/');
    if (idx <= 0) return '/';
    return normalized.slice(0, idx);
}

function joinPath(base, name) {
    if (!name) return normalizePath(base);
    if (name.startsWith('/')) return normalizePath(name);
    const cleanBase = normalizePath(base);
    if (cleanBase === '/') return normalizePath(`/${name}`);
    return normalizePath(`${cleanBase}/${name}`);
}

function basename(path) {
    const normalized = normalizePath(path);
    if (normalized === '/' || normalized === '') return normalized;
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function isWithinRoot(path, root) {
    const p = normalizePath(path);
    const r = normalizePath(root);
    if (r === '/') return true;
    return p === r || p.startsWith(`${r}/`);
}

function parseFilter(filter) {
    if (!filter) return [];

    const values = Array.isArray(filter) ? filter : [filter];
    return values
        .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
        .filter((v) => v.length > 0);
}

function hasAllowedExtension(name, extensions) {
    if (extensions.length === 0) return true;
    const lower = String(name || '').toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
}

function isLikelySelectedFile(path, extensions) {
    const name = basename(path);
    if (!name || name === '/' || name === '.' || name === '..') return false;
    if (extensions.length > 0) return hasAllowedExtension(name, extensions);
    return name.includes('.');
}

function isDirectoryStat(rawStat) {
    if (Array.isArray(rawStat)) {
        const statObj = rawStat[0];
        const err = rawStat[1];
        if (err && err !== 0) return false;
        return isDirectoryStat(statObj);
    }

    if (!rawStat || typeof rawStat !== 'object') return false;

    if (typeof rawStat.isDirectory === 'function') {
        return !!rawStat.isDirectory();
    }

    if (typeof rawStat.mode === 'number') {
        return (rawStat.mode & 0o170000) === 0o040000;
    }

    if (rawStat.type === 'directory') return true;
    if (rawStat.type === 'dir') return true;

    return false;
}

function defaultFsAdapter(osModule) {
    return {
        readdir(path) {
            const out = osModule.readdir(path) || [];
            if (Array.isArray(out[0])) return out[0];
            if (Array.isArray(out)) return out;
            return [];
        },
        stat(path) {
            return osModule.stat(path);
        }
    };
}

export function buildFilepathBrowserState(paramMeta, currentValue) {
    const meta = paramMeta || {};
    const root = normalizePath(meta.root || DEFAULT_ROOT);
    const filter = parseFilter(meta.filter);

    /* Priority: current value -> optional start_path -> root */
    const rawCandidate = currentValue && currentValue.length > 0
        ? currentValue
        : (meta.start_path || root);
    const startCandidate = normalizePath(rawCandidate);

    let currentDir = root;
    let selectedPath = '';

    if (isWithinRoot(startCandidate, root)) {
        if (isLikelySelectedFile(startCandidate, filter)) {
            currentDir = dirname(startCandidate);
            selectedPath = startCandidate;
        } else {
            currentDir = startCandidate;
        }
    }

    return {
        title: meta.name || meta.key || 'File',
        key: meta.key || '',
        root,
        currentDir,
        selectedIndex: 0,
        filter,
        selectedPath,
        items: [],
        error: ''
    };
}

export function refreshFilepathBrowser(state, fsLike) {
    if (!state) return;
    const fs = fsLike || defaultFsAdapter(globalThis.os);

    const currentDir = isWithinRoot(state.currentDir, state.root)
        ? state.currentDir
        : state.root;

    const dirs = [];
    const files = [];

    state.items = [];
    state.error = '';

    if (currentDir !== state.root) {
        const parent = dirname(currentDir);
        if (isWithinRoot(parent, state.root)) {
            state.items.push({
                kind: 'up',
                label: '..',
                path: parent
            });
        }
    }

    try {
        const names = fs.readdir(currentDir) || [];
        for (const name of names) {
            if (!name || name === '.' || name === '..') continue;
            if (name.startsWith('.')) continue;  /* Skip dotfiles */
            const fullPath = joinPath(currentDir, name);
            /* The set library belongs to a live standalone session, which owns
             * its projects through its own UI and has them open. Every consumer
             * of this browser is a generic file surface with no idea what a
             * project is, so the entry is hidden here — at the ONE place all of
             * them list through — rather than in each of them. Outside a
             * session it is the user's own set list and stays visible. */
            if (pathHiddenFromBrowsers(fullPath)) continue;
            const stat = fs.stat(fullPath);
            const isDir = isDirectoryStat(stat);

            if (isDir) {
                dirs.push({
                    kind: 'dir',
                    label: `[${name}]`,
                    path: fullPath
                });
                continue;
            }

            if (hasAllowedExtension(name, state.filter)) {
                files.push({
                    kind: 'file',
                    label: name,
                    path: fullPath
                });
            }
        }
    } catch (e) {
        state.error = 'Unable to read folder';
    }

    dirs.sort((a, b) => a.label.localeCompare(b.label));
    files.sort((a, b) => a.label.localeCompare(b.label));
    state.items.push(...dirs, ...files);

    if (state.selectedPath) {
        const idx = state.items.findIndex((item) => item.path === state.selectedPath);
        if (idx >= 0) {
            state.selectedIndex = idx;
            state.selectedPath = '';
        } else if (currentDir !== state.root) {
            state.currentDir = state.root;
            state.selectedIndex = 0;
            state.selectedPath = '';
            refreshFilepathBrowser(state, fsLike);
            return;
        } else {
            state.selectedIndex = 0;
            state.selectedPath = '';
        }
    }

    if (state.selectedIndex >= state.items.length) {
        state.selectedIndex = Math.max(0, state.items.length - 1);
    }

    state.currentDir = currentDir;
}

export function moveFilepathBrowserSelection(state, delta) {
    if (!state || !state.items || state.items.length === 0) return;
    state.selectedIndex = Math.max(
        0,
        Math.min(state.items.length - 1, state.selectedIndex + delta)
    );
}

export function activateFilepathBrowserItem(state) {
    if (!state || !state.items || state.items.length === 0) {
        return { action: 'noop' };
    }

    const item = state.items[state.selectedIndex];
    if (!item) return { action: 'noop' };

    if (item.kind === 'up' || item.kind === 'dir') {
        state.currentDir = item.path;
        state.selectedIndex = 0;
        state.selectedPath = '';
        return { action: 'open', path: item.path };
    }

    if (item.kind === 'file') {
        return {
            action: 'select',
            key: state.key,
            value: item.path,
            filename: basename(item.path)
        };
    }

    return { action: 'noop' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * LIVE PREVIEW AND BROWSER HOOKS — the browser's BEHAVIOUR, not just its list.
 *
 * ⭐ WHY THIS IS HERE AND NOT IN A SCREEN. Everything above this line is DATA:
 * the entries, the cursor, what a click means. That was the whole of the shared
 * part, and it is why the split kept costing us — the host's browser screen also
 * auditions the highlighted file, runs the module's `browser_hooks`, and puts
 * back what it borrowed when you cancel, and NONE of that was reachable by a
 * second consumer. dAVEBOx draws its own browser, so for months it silently had
 * a browser that could not audition, on a host that could (upstream `9c48f4d3`,
 * 2026-03-04). Nobody finds that out except on hardware.
 *
 * So the behaviour lives with the state it mutates, and a screen supplies only
 * what is genuinely its own: how to read and write a parameter.
 *
 * ⚠ THE IO CONTRACT IS TWO MEMBERS, and both are load-bearing:
 *
 *     io.getParam(key)        -> current value, or null/undefined if unset
 *     io.setParam(key, value) -> TRUTHY when the write actually took
 *
 * `setParam`'s return is not decoration: a live preview that could not write
 * must not record that it did, or the cancel path restores the wrong value.
 * ⚠⚠ An io missing a member does not fail loudly — it takes the other branch
 * and PASSES (see test_io_missing_a_member_takes_the_fallback). A test io must
 * be built from this list, not from whatever the test happens to touch.
 *
 * The caller keeps its own slot/component addressing inside those two closures,
 * and — as the host does — reads the slot AT CALL TIME, never captured at open:
 * a browser can outlive the track it was opened on.
 * ────────────────────────────────────────────────────────────────────────── */

/* How long the highlight must rest before an audition is worth the write.
 * A jog through a folder would otherwise set the parameter once per entry. */
export const FILEPATH_PREVIEW_DEBOUNCE_MS = 150;

/* `$path` and friends: the module writes a hook value it cannot know yet, and
 * the browser fills it in from whatever entry the action is about. */
function resolveFilepathHookValue(rawValue, context) {
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    if (value === '$path' || value === '$selected_path') {
        return context && context.path ? String(context.path) : '';
    }
    if (value === '$filename' || value === '$selected_filename') {
        if (context && context.path) {
            const path = String(context.path);
            const idx = path.lastIndexOf('/');
            return idx >= 0 ? path.slice(idx + 1) : path;
        }
        return '';
    }
    return value;
}

export function normalizeFilepathHookActions(rawActions, prefix) {
    if (!Array.isArray(rawActions)) return [];
    const out = [];
    for (const action of rawActions) {
        if (!action || typeof action !== 'object') continue;
        const rawKey = typeof action.key === 'string' ? action.key.trim() : '';
        if (!rawKey) continue;
        const fullKey = rawKey.includes(':') ? rawKey : (prefix ? `${prefix}:${rawKey}` : rawKey);
        const value = action.value === undefined || action.value === null ? '' : String(action.value);
        out.push({
            key: fullKey,
            value,
            restore: parseMetaBool(action.restore)
        });
    }
    return out;
}

export function buildFilepathBrowserHooks(meta, prefix) {
    const hooksRaw = (meta && meta.browser_hooks && typeof meta.browser_hooks === 'object')
        ? meta.browser_hooks
        : {};
    return {
        onOpen: normalizeFilepathHookActions(hooksRaw.on_open, prefix),
        onPreview: normalizeFilepathHookActions(hooksRaw.on_preview, prefix),
        onCancel: normalizeFilepathHookActions(hooksRaw.on_cancel, prefix),
        onCommit: normalizeFilepathHookActions(hooksRaw.on_commit, prefix)
    };
}

export function applyFilepathHookActions(state, actions, context, io) {
    if (!state || !io || !Array.isArray(actions) || actions.length === 0) return;
    for (const action of actions) {
        if (!action || !action.key) continue;

        /* Borrow once. A second pass through the same hook must not overwrite
         * the ORIGINAL value with one this browser itself wrote. */
        if (action.restore && state.hookRestoreValues &&
            !Object.prototype.hasOwnProperty.call(state.hookRestoreValues, action.key)) {
            const prev = io.getParam(action.key);
            if (prev !== null && prev !== undefined) {
                state.hookRestoreValues[action.key] = String(prev);
            }
        }

        io.setParam(action.key, resolveFilepathHookValue(action.value, context));
    }
}

export function restoreFilepathHookActions(state, io) {
    if (!state || !io || !state.hookRestoreValues) return;
    for (const [key, prevValue] of Object.entries(state.hookRestoreValues)) {
        io.setParam(key, prevValue);
    }
}

/* Arm the preview fields on a freshly built browser state, and run the module's
 * `on_open` hook. Call after buildFilepathBrowserState and before the first
 * refresh, which is the order the hook's own contract implies: it may set the
 * very parameters (`start_path`) the listing is about to be read from. */
export function initFilepathPreview(state, meta, fullKey, currentValue, prefix, io) {
    if (!state) return state;
    const effectiveMeta = meta || {};
    state.livePreviewEnabled = parseMetaBool(effectiveMeta.live_preview);
    state.previewOriginalValue = currentValue;
    state.previewCurrentValue = currentValue;
    state.previewCommitted = false;
    state.previewParamFullKey = fullKey;
    state.previewPendingPath = '';
    state.previewPendingTime = 0;
    state.previewSelectedPath = '';
    const hooks = buildFilepathBrowserHooks(effectiveMeta, prefix);
    state.hooksOnOpen = hooks.onOpen;
    state.hooksOnPreview = hooks.onPreview;
    state.hooksOnCancel = hooks.onCancel;
    state.hooksOnCommit = hooks.onCommit;
    state.hookRestoreValues = {};
    applyFilepathHookActions(state, state.hooksOnOpen, { path: currentValue }, io);
    return state;
}

/* Audition `selected` NOW. Writes the parameter itself, so the sound follows
 * the highlight; the original is remembered for the cancel path. */
export function applyLivePreview(state, selected, io) {
    if (!state || !io || !state.livePreviewEnabled) return;
    if (!selected || selected.kind !== 'file' || !selected.path) return;
    if (selected.path === state.previewCurrentValue || !state.previewParamFullKey) return;
    if (io.setParam(state.previewParamFullKey, selected.path)) {
        state.previewCurrentValue = selected.path;
        applyFilepathHookActions(state, state.hooksOnPreview, { path: selected.path }, io);
    }
}

/* The highlight moved: schedule an audition rather than firing one per entry.
 * ⭑ Call this from EVERY input that moves the cursor. A browser that auditions
 * on the jog and not on the knob is the same bug wearing one of two hats. */
export function armFilepathPreview(state) {
    if (!state || !state.livePreviewEnabled) return;
    const selected = state.items ? state.items[state.selectedIndex] : null;
    if (selected && selected.kind === 'file' && selected.path) {
        state.previewPendingPath = selected.path;
        state.previewPendingTime = Date.now();
    } else {
        state.previewPendingPath = '';
        state.previewPendingTime = 0;
    }
}

/* Per-frame: fire an armed audition once the highlight has rested. */
export function tickFilepathPreview(state, io, now) {
    if (!state || !state.livePreviewEnabled) return;
    if (!state.previewPendingPath) return;
    const at = now === undefined ? Date.now() : now;
    if (at - state.previewPendingTime < FILEPATH_PREVIEW_DEBOUNCE_MS) return;
    applyLivePreview(state, { kind: 'file', path: state.previewPendingPath }, io);
    state.previewPendingPath = '';
    state.previewPendingTime = 0;
}

/* The listing changed under the cursor (a folder was entered, or the browser
 * just opened): drop anything armed for the OLD listing and audition what is
 * highlighted in the new one. */
export function syncFilepathPreviewToSelection(state, io) {
    if (!state || !state.livePreviewEnabled) return;
    state.previewPendingPath = '';
    state.previewPendingTime = 0;
    applyLivePreview(state, state.items ? state.items[state.selectedIndex] : null, io);
}

/* The user chose this file. Records the choice so the close below commits it
 * instead of putting the original back. The caller still writes the parameter:
 * only it knows the key it addresses the parameter by. */
export function commitFilepathSelection(state, value) {
    if (!state) return;
    const path = value || '';
    if (state.livePreviewEnabled) {
        state.previewCommitted = true;
        state.previewCurrentValue = path;
        state.previewPendingPath = '';
        state.previewPendingTime = 0;
    }
    state.previewSelectedPath = path;
}

/* Closing the browser. Either the choice stands, or every write the preview
 * made — the parameter and anything a hook borrowed — is put back.
 *
 * ⚠ The restore is unconditional on the CANCEL path and must stay that way: a
 * preview that wrote and a preview that did not are indistinguishable to the
 * user, so leaving a changed sound behind after Back is the worst outcome. */
export function finishFilepathPreview(state, io) {
    if (!state || !io) return;
    const committed = !!state.previewCommitted;

    if (state.livePreviewEnabled &&
        !committed &&
        state.previewParamFullKey &&
        state.previewCurrentValue !== state.previewOriginalValue) {
        io.setParam(state.previewParamFullKey, state.previewOriginalValue || '');
    }

    if (committed) {
        applyFilepathHookActions(
            state, state.hooksOnCommit,
            { path: state.previewSelectedPath || state.previewCurrentValue || '' }, io);
    } else {
        applyFilepathHookActions(
            state, state.hooksOnCancel,
            { path: state.previewOriginalValue || '' }, io);
    }

    restoreFilepathHookActions(state, io);
}
