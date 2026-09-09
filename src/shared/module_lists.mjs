/*
 * Module lists — named collections of module ids, with Favorites as the
 * seeded default. Used two ways: the knob grid's "Module" page files the
 * loaded module into lists, and the swap picker filters by one.
 *
 * PURE, over an injected { readFile, writeFile } pair, and it imports
 * nothing. That is deliberate on both counts: `tests/host` can import it
 * under node with no device and no host globals, and every rule below is
 * therefore reachable by a test. The alternative — these rules inline in
 * shadow_ui.js — puts them behind 21k lines that node cannot load.
 *
 * Mutators take and return plain state and DO NOT persist; the caller saves.
 * A UI that toggles three checkboxes should write once, and only the caller
 * knows when it is done.
 */

/*
 * FORK NOTE — the file is SHARED with the stock install, and there is
 * deliberately no default path.
 *
 * Where it lives. This fork keeps HOST STATE per-install (HOST_STATE_ROOT)
 * but leaves USER CONTENT shared, which is why user presets sit at the hard
 * literal /data/UserData/schwung/presets. A curated list of modules is user
 * content by that rule, and stock >= 1.1.0 writes this very file, so pointing
 * both hosts at one path means one Favorites list rather than two the user has
 * to maintain twice. Josh asked for exactly that carry-over (2026-09-09).
 * Safe because only one host runs at a time -- launching dAVEBOx relaunches
 * Move under this build -- so there is no concurrent writer, and because a
 * list KEEPS ids whose module is not installed, which is what makes two
 * different module sets share a file without either damaging the other.
 *
 * No default, though. The path is the one thing that differs between installs
 * and test rigs, and a wrong one cannot fail loudly: writing JSON into a tree
 * that exists always succeeds. So both entry points REQUIRE it and throw
 * without one, and the composition stays OUT of this file so tests/host can
 * import it under node with no device and no globals.
 */
export const LISTS_FILENAME = "module_lists.json";

export function listsPathFor(stateRoot) {
    const r = String(stateRoot == null ? "" : stateRoot).replace(/\/+$/, "");
    if (!r) throw new Error("module_lists: no state root");
    return r + "/" + LISTS_FILENAME;
}
export const FAVORITES = "Favorites";
export const LISTS_VERSION = 1;

export function emptyState() {
    return { version: LISTS_VERSION, lists: [{ name: FAVORITES, modules: [] }] };
}

function normName(s) { return String(s == null ? "" : s).trim(); }
function sameName(a, b) { return normName(a).toLowerCase() === normName(b).toLowerCase(); }

/* Names compare case-INSENSITIVELY throughout. "favorites" and "Favorites"
 * are one list; two lists a user cannot tell apart is a bug they cannot
 * diagnose. */
export function findList(state, name) {
    if (!state || !Array.isArray(state.lists)) return null;
    return state.lists.find(l => sameName(l.name, name)) || null;
}

export function isProtected(name) { return sameName(name, FAVORITES); }

/*
 * Read.
 *
 * Returns { state, corrupt }. A missing file is NOT corrupt — it is the
 * first run. An unparseable or structurally wrong one IS, and the caller
 * declines to write over it: a file this version cannot read may still be a
 * file some other version can, and silently replacing it destroys the only
 * copy. This is the same distinction the param channel draws between "" and
 * null, for the same reason.
 */
export function loadLists(io, path) {
    if (!path) throw new Error("module_lists: loadLists needs a path");
    let raw = null;
    try { raw = io.readFile(path); } catch (e) { raw = null; }
    if (!raw) return { state: emptyState(), corrupt: false, newer: false };

    let data = null;
    try { data = JSON.parse(raw); } catch (e) { return { state: emptyState(), corrupt: true, newer: false }; }
    if (!data || !Array.isArray(data.lists)) return { state: emptyState(), corrupt: true, newer: false };

    /*
     * A file written by a NEWER schema is readable but NOT ours to rewrite.
     *
     * This matters only because the file is shared with the stock install
     * (see the fork note): a future stock version that adds a field would
     * have it silently deleted the first time this build saved, because the
     * writer emits exactly {version, lists} and the reader keeps exactly
     * name+modules. Verified before the guard existed -- a v2 file with a
     * per-list `color` and a top-level key read back clean, and saving
     * rewrote it as v1 with both gone.
     *
     * So it is surfaced the same way `corrupt` is, and for the same reason:
     * the caller may USE what it understood, and must not write back. This
     * is not the same condition as corrupt -- the data is good and the user
     * should see their lists -- so it is a separate flag rather than a lie
     * about parsing.
     */
    const fileVersion = Number(data.version);
    const newer = Number.isFinite(fileVersion) && fileVersion > LISTS_VERSION;

    const lists = [];
    for (const l of data.lists) {
        if (!l || !normName(l.name)) continue;
        if (lists.some(x => sameName(x.name, l.name))) continue;
        /* A hand-editable file can carry a duplicate module id (or one typed
         * twice by an older buggy writer). `toggleMembership`'s "off" branch
         * does one indexOf + one splice, so a surviving duplicate means the
         * checkbox does not clear on the first click — dedupe here, on read,
         * same as list names a few lines up. */
        const seen = Object.create(null);
        const modules = [];
        if (Array.isArray(l.modules)) {
            for (const m of l.modules) {
                if (typeof m !== "string" || seen[m]) continue;
                seen[m] = true;
                modules.push(m);
            }
        }
        lists.push({ name: normName(l.name), modules });
    }

    /* Favorites is index 0 BY DEFINITION, so a file that lost it or moved it
     * comes back with it in place rather than with a second Favorites, or
     * with the default sitting somewhere down the list. */
    const at = lists.findIndex(l => sameName(l.name, FAVORITES));
    if (at < 0) lists.unshift({ name: FAVORITES, modules: [] });
    else if (at > 0) lists.unshift(lists.splice(at, 1)[0]);

    return { state: { version: LISTS_VERSION, lists }, corrupt: false, newer };
}

export function saveLists(io, state, path) {
    if (!path) throw new Error("module_lists: saveLists needs a path");
    try {
        const body = JSON.stringify({ version: LISTS_VERSION, lists: state.lists }, null, 2) + "\n";
        return !!io.writeFile(path, body);
    } catch (e) { return false; }
}

export function createList(state, name) {
    const n = normName(name);
    if (!n) return { ok: false, err: "Empty name" };
    if (findList(state, n)) return { ok: false, err: "Name in use" };
    state.lists.push({ name: n, modules: [] });
    return { ok: true };
}

export function renameList(state, oldName, newName) {
    if (isProtected(oldName)) return { ok: false, err: "Cannot rename Favorites" };
    const l = findList(state, oldName);
    if (!l) return { ok: false, err: "No such list" };
    const n = normName(newName);
    if (!n) return { ok: false, err: "Empty name" };
    /* A list colliding with ITSELF is a case change, not a collision. */
    const clash = findList(state, n);
    if (clash && clash !== l) return { ok: false, err: "Name in use" };
    l.name = n;
    return { ok: true };
}

export function deleteList(state, name) {
    if (isProtected(name)) return { ok: false, err: "Cannot delete Favorites" };
    const i = state.lists.findIndex(l => sameName(l.name, name));
    if (i < 0) return { ok: false, err: "No such list" };
    state.lists.splice(i, 1);
    return { ok: true };
}

/* Clear is allowed on Favorites: emptying the default is a thing a user may
 * reasonably want, and unlike deleting it leaves the list where it was. */
export function clearList(state, name) {
    const l = findList(state, name);
    if (!l) return { ok: false, err: "No such list" };
    l.modules = [];
    return { ok: true };
}

export function isMember(state, name, moduleId) {
    const l = findList(state, name);
    return !!(l && moduleId && l.modules.indexOf(moduleId) >= 0);
}

/* Returns the NEW membership, so the caller can announce it without asking
 * again — true/false only for a real toggle.
 *
 * A list that does not exist (or a falsy moduleId) answers NULL, never
 * false: false would read as "removed", and a caller that announces a
 * removal for a toggle that touched nothing has reported a result that did
 * not happen. */
export function toggleMembership(state, name, moduleId) {
    const l = findList(state, name);
    if (!l || !moduleId) return null;
    const i = l.modules.indexOf(moduleId);
    if (i >= 0) { l.modules.splice(i, 1); return false; }
    l.modules.push(moduleId);
    return true;
}

export function listsContaining(state, moduleId) {
    if (!moduleId || !state || !Array.isArray(state.lists)) return [];
    return state.lists.filter(l => l.modules.indexOf(moduleId) >= 0).map(l => l.name);
}

/*
 * Intersect a scan result with one list, preserving the SCAN order (which is
 * alphabetical and is what the picker already shows) rather than the order
 * modules were added.
 *
 * `listName` null/"" is the identity — that is the All filter.
 *
 * A list that does not exist answers NULL, never the identity: the identity
 * would show every module under a filter name that means nothing any more,
 * which reads as the filter being broken rather than as the list being gone.
 * The caller resets to All on null.
 */
export function filterIds(state, ids, listName) {
    if (!listName) return ids.slice();
    const l = findList(state, listName);
    if (!l) return null;
    return ids.filter(id => l.modules.indexOf(id) >= 0);
}

/*
 * Which lists hold at least one of `ids` — the only lists a picker for this
 * component type may offer. Lists are global, so a synth picker would
 * otherwise be able to land on an FX-only list and draw an empty screen.
 */
export function listsWithAnyOf(state, ids) {
    if (!state || !Array.isArray(state.lists)) return [];
    const set = Object.create(null);
    for (const id of ids) set[id] = true;
    return state.lists.filter(l => l.modules.some(m => set[m])).map(l => l.name);
}

/*
 * The filter cycle: All -> each eligible list in order -> All. `null` is All
 * at both ends.
 *
 * A current filter that is no longer eligible (its list was deleted, or this
 * picker has no member of it) falls to All rather than to the first list —
 * the user did not ask for that list, and landing on one they did not choose
 * is worse than landing on the state that shows everything.
 */
export function nextFilter(current, eligible) {
    if (!eligible.length) return null;
    if (!current) return eligible[0];
    /* Exact-match indexOf, not sameName: `current` is always a name this
     * function (or listsWithAnyOf) previously produced, never user-typed
     * text, so case-insensitive compare is not needed here. If a future
     * caller ever wires in arbitrary text, this silently falls to All
     * instead of matching case-insensitively. */
    const i = eligible.indexOf(current);
    if (i < 0 || i === eligible.length - 1) return null;
    return eligible[i + 1];
}
