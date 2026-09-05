/*
 * Snapshot / recall — the PURE half.
 *
 * Ported from upstream #385 (2026-09-01 design) for dAVEBOx's host bindings
 * (host_snapshot_take / host_snapshot_recall, shadow_ui.js). The capture side
 * is not here: it reuses the autosave writers verbatim and copies the files
 * they write into the snapshot directory, so there is no second serializer
 * to keep in step with the first. What IS here is everything the recall has
 * to decide, because deciding is the part that can be wrong silently — plus
 * the bulk-SET packing the fork uses to put the state back (one mailbox
 * round trip per slot, never N fire-and-forget writes).
 *
 * Nothing in this file does I/O or touches a global. It is imported by
 * shadow_ui.js and run directly by tests/host/test_snapshot_plan.sh.
 */

/*
 * The shapes on disk. `slot_N.json` is the autosave wrapper —
 * `{ name, version, modified, chain: { synth, audio_fx[], midi_fx[] } }` —
 * and each bus position (`master_fx_N.json`, `send_fx_<a|b>_N.json`,
 * `move_fx_<sl>_<b>.json`) is one file, `{ id, path, state?, params?,
 * bypassed? }`.
 *
 * All are read for exactly two things per position: which module was there,
 * and its opaque `state` blob. Everything else (paths, knob mappings,
 * channels, LFOs) describes the SHAPE of the rig, and a recall deliberately
 * does not restore shape — see planRestore.
 */

/* A component's `config` is either `{ state: <blob> }` or the older loose
 * params object. Only the first can be handed back as `<prefix>:state`. */
function stateOf(config) {
    if (!config || typeof config !== "object") return null;
    if (!("state" in config)) return null;
    const st = config.state;
    if (st === null || st === undefined) return null;
    /* Written as an object when it parsed as JSON, as a string when it did
     * not (key=value pairs). set_param wants the wire form of either. */
    return (typeof st === "string") ? st : JSON.stringify(st);
}

/* One position, in the form planRestore consumes. */
function record(prefix, moduleId, config, bypassed) {
    return {
        prefix,
        moduleId: moduleId || "",
        state: stateOf(config),
        bypassed: (bypassed === 1 || bypassed === "1" || bypassed === true) ? 1 : 0,
    };
}

/*
 * Parse one `slot_N.json` into positions.
 *
 * Returns [] for anything unparseable or empty — an absent or malformed file
 * is "this slot contributes nothing", which is exactly what a slot that was
 * empty at snapshot time should contribute.
 */
export function parseSlotSnapshot(json) {
    let doc;
    try { doc = JSON.parse(json); } catch (e) { return []; }
    const chain = doc && doc.chain;
    if (!chain || typeof chain !== "object") return [];

    const out = [];
    if (chain.synth && chain.synth.module) {
        out.push(record("synth", chain.synth.module, chain.synth.config, chain.synth.bypassed));
    }
    /* MIDI FX and audio FX both spell their module id `type` and their state
     * `params`, where the synth uses `module` and `config` — an asymmetry in
     * the patch format that predates this. The fork's chain carries up to
     * four audio FX (fx1..fx4) and two MIDI FX. */
    const midi = Array.isArray(chain.midi_fx) ? chain.midi_fx : [];
    for (let i = 0; i < midi.length; i++) {
        const m = midi[i];
        if (!m || !m.type) continue;
        out.push(record(`midi_fx${i + 1}`, m.type, m.params, m.bypassed));
    }
    const fx = Array.isArray(chain.audio_fx) ? chain.audio_fx : [];
    for (let i = 0; i < fx.length; i++) {
        const f = fx[i];
        if (!f || !f.type) continue;
        out.push(record(`fx${i + 1}`, f.type, f.params, f.bypassed));
    }
    return out;
}

/* Parse one bus position file. `prefix` is the position's full param prefix
 * ("master_fx:fx3", "send_fx:a:fx1", "move_fx:2:fx4"). The bus files store
 * `state` at the TOP level, not under a `config` key like a slot component
 * does; wrap it so stateOf sees the shape it expects. */
export function parseBusSnapshot(json, prefix) {
    let doc;
    try { doc = JSON.parse(json); } catch (e) { return []; }
    /* ⚠ THE SPELLING DIFFERS BY WRITER (device, 2026-09-05): the send / Move
     * savers write `id` AND `module_id`; the MASTER saver writes the shim's
     * shape — `module_path` + `module_id`, no `id`, and `bypassed` only when
     * it is 1. Requiring `id` made every master position parse as EMPTY, so a
     * recall found "nothing at the save" there and bypassed the effect —
     * including from a snapshot taken with it live. Josh caught it on the
     * device; the fixture had used a shape no saver writes. */
    const id = (doc && (doc.id || doc.module_id)) || "";
    if (!id) return [];
    return [record(prefix, id, { state: doc.state }, doc.bypassed)];
}

/* Parse one `master_fx_N.json`. `slotIdx` is 0-based; the param key is 1-based. */
export function parseMasterFxSnapshot(json, slotIdx) {
    return parseBusSnapshot(json, `master_fx:fx${slotIdx + 1}`);
}

/*
 * Decide what a recall writes.
 *
 * `records`  positions from the snapshot files, in write order.
 * `liveIds`  prefix -> module id loaded there RIGHT NOW ("" or absent when
 *            the position is empty).
 *
 * Returns `{ writes, skipped, reasons }`.
 *
 * A recall restores STATE, never SHAPE. It deliberately does not reload a
 * module that was swapped since the snapshot: `load_file` is what restores
 * identity, and it reinstantiates — cutting reverb tails and resetting arp
 * phase, which is the opposite of what an A/B gesture is for. A position
 * whose module changed is skipped and COUNTED.
 *
 * The count is the whole point. A partial restore that reports nothing is
 * indistinguishable from a working one until you notice by ear. Two things
 * get counted and both matter:
 *
 *   swapped   the module at this position is not the one snapshotted
 *   nostate   the module is right but the snapshot holds no state for it,
 *             because it implements no `state` key at all
 *   empty     the position held a module in the snapshot and holds nothing
 *             now — the user removed it (separated from "swapped" only so
 *             the log can say which)
 *
 * An EMPTY position in the snapshot is not a miss.
 *
 * ADDED SINCE THE SAVE (Josh, 2026-09-05): an FX position that holds a module
 * now and held nothing when the snapshot was taken has no record, so a plain
 * recall would leave it exactly as it is — a master reverb added after the
 * save stays ON in every older snapshot, forever. Such a position is written
 * BYPASSED (its state untouched) and listed in `added`, so the UI can say so.
 * Only FX positions: a synth that appeared since is the track's business (the
 * module mutes that track itself). Bypass is ordinary state, so a later
 * snapshot saves it and restores it like anything else.
 */
export function isFxPosition(prefix) {
    return /(^|:)(midi_)?fx\d+$/.test(String(prefix || ""));
}
export function splitPrefix(prefix) {
    const m = /^(\d+):(.+)$/.exec(String(prefix || ""));
    return m ? { slot: parseInt(m[1], 10), key: m[2] } : { slot: 0, key: String(prefix || "") };
}
export function planRestore(records, liveIds) {
    const writes = [];
    const reasons = [];
    const added = [];
    const live = liveIds || {};
    const have = new Set();
    for (const r of records) if (r && r.moduleId) have.add(r.prefix);

    for (const r of records) {
        if (!r || !r.moduleId) continue;            /* empty in snapshot */
        const now = live[r.prefix] || "";
        if (!now) { reasons.push({ prefix: r.prefix, reason: "empty" }); continue; }
        if (now !== r.moduleId) {
            reasons.push({ prefix: r.prefix, reason: "swapped",
                           was: r.moduleId, now });
            continue;
        }
        if (r.state === null) {
            /* No state to restore — but the BYPASS is still ours to set (Josh,
             * 2026-09-05: "fx bypass state for all slots needs to be saved
             * too", so a snapshot taken with the effect live un-bypasses what
             * an older one bypassed). Counted as nostate, written bypass-only. */
            reasons.push({ prefix: r.prefix, reason: "nostate", was: r.moduleId });
            writes.push({ prefix: r.prefix, state: null, bypassed: r.bypassed, slot: r.slot, key: r.key });
            continue;
        }
        writes.push({ prefix: r.prefix, state: r.state, bypassed: r.bypassed,
                      slot: r.slot, key: r.key });
    }
    for (const pfx of Object.keys(live)) {
        const now = live[pfx];
        if (!now || have.has(pfx) || !isFxPosition(pfx)) continue;
        const { slot, key } = splitPrefix(pfx);
        writes.push({ prefix: pfx, state: null, bypassed: 1, slot, key });
        added.push({ prefix: pfx, now });
    }
    const skipped = reasons.length;
    return { writes, skipped, reasons, added };
}

/* The wire form of a BULK request (request_type 3/4, see shim_handle_param_bulk):
 * "<count>\n" then count × ("<len>\n" <bytes>). Lengths are BYTES — a state
 * blob may carry non-ASCII, so measure it as UTF-8, not as JS characters. */
function utf8Len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
        else n += 3;
    }
    return n;
}
export function bulkEncodeItems(items) {
    let s = items.length + "\n";
    for (const it of items) s += utf8Len(it) + "\n" + it;
    return s;
}

/*
 * Pack the plan's writes into bulk SETs: one request per slot per batch,
 * each `<key>:state` + `<key>:bypassed` pair kept together, batches split so
 * the blob stays under `maxBytes` (the mailbox value is 64 KB; a single
 * state blob can be most of it, so one position per batch is the floor —
 * a position that does not fit alone still goes, alone).
 *
 * Returns [{ slot, items, positions }] in write order. The caller sends one
 * batch per host tick so a full rig never stalls the UI in one frame.
 */
export function batchWrites(writes, maxBytes) {
    const cap = (typeof maxBytes === "number" && maxBytes > 0) ? maxBytes : 60000;
    const out = [];
    let cur = null;
    for (const w of writes) {
        const slot = w.slot | 0;
        /* A write with no state is a bypass-only write (a position added since
         * the save): the module's own state must not be touched. */
        const items = (w.state === null || w.state === undefined)
            ? [w.key + ":bypassed", String(w.bypassed)]
            : [w.key + ":state", w.state, w.key + ":bypassed", String(w.bypassed)];
        const bytes = items.reduce((n, it) => n + utf8Len(it) + 8, 0);
        if (cur && (cur.slot !== slot || cur.bytes + bytes > cap)) { out.push(cur); cur = null; }
        if (!cur) cur = { slot, items: [], positions: [], bytes: 0 };
        cur.items.push(...items);
        cur.positions.push(w.prefix);
        cur.bytes += bytes;
    }
    if (cur) out.push(cur);
    return out;
}

/* The words a UI shows for a recall. A perfect recall reports no number. */
export function recallMessage(skipped, added, muted) {
    const out = ["restored"];
    if (skipped > 0) out.push(`${skipped} skipped`);
    if (added > 0) out.push(`${added} new fx bypassed`);
    if (muted > 0) out.push(`${muted} track${muted === 1 ? "" : "s"} muted`);
    return out;
}
