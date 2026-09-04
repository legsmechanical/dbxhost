/* dAVEBOx → Ableton (.ablbundle) export — orchestration (Phase 1 skeleton).
 *
 * Architecture (see notes/ableton-export-plan.md, Phase 0 RESULT):
 *  - JS builds Song.abl (text JSON — host_write_file is safe for text) + a small
 *    args manifest, then fires a one-shot on-device packager.
 *  - export/pack.py (shipped in the module dir) does the binary work: copy sample
 *    files + build the store-mode .ablbundle ZIP. Invoked via host_system_cmd
 *    (stock Schwung) running /usr/bin/python3 (stock on Move). Fully offline.
 *
 * Phase 1 scope: menu entry + transport guard + a minimal valid 8x16 bundle
 * (every track gets a Dummy Drift instrument — Live rejects a track with no
 * device; 16 empty scenes; tempo from dAVEBOx). No instrument mapping / no baked
 * MIDI / no samples yet (Phases 2-5).
 *
 * The menu action runs in MIDI-handler context where get_param returns null, so
 * exportSession() only sets a pending flag; pollPendingExport() does the work
 * from tick() (get_param-safe), matching the codebase's defer-to-tick idiom.
 */

import { S, conductorTrackIdx } from './ui_state.mjs';
import { nowMs } from './ui_clock.mjs';
import { slotIndex, DAVEBOX_HOST_DIR, SLOT_LEVEL_MAX, engineGet } from './ui_engine.mjs';
import { showActionPopup } from './ui_persistence.mjs';
import { NUM_TRACKS, NUM_CLIPS, ACTION_POPUP_MS, PAD_MODE_CONDUCT } from './ui_constants.mjs';

/* Our own module directory — where build.sh/build_sound.sh put pack.py and the
 * JSON templates. It MUST follow the build's module id: SA ships as
 * `davebox-sound`, Legacy as `davebox`, and a test build gets its own id again.
 * Hardcoding `davebox` made every asset read and the pack.py invocation below
 * point at a directory that does not exist under SA. Injected by esbuild the
 * same way SEQ8_STATE_PREFIX is; the fallback is Legacy's id, which is the one
 * build path that does not inject it. */
const MODULE_ID = (typeof DAVEBOX_MODULE_ID === 'string') ? DAVEBOX_MODULE_ID : 'davebox';
const EXPORT_MODULE_DIR = '/data/UserData/schwung/modules/tools/' + MODULE_ID;
const EXPORT_OUT_DIR    = '/data/UserData/schwung/davebox-exports';
/* Scratch workspace nested under the exports dir (keeps the schwung folder
 * uncluttered); created per export and removed afterward. */
const EXPORT_STAGING    = EXPORT_OUT_DIR + '/staging';
const EXPORT_SCENES     = NUM_CLIPS;   /* dAVEBOx clip N -> scene N */
/* DSP writes per-clip rendered notes here; JS reads them (must match
 * EXPORT_RENDER_PATH in dsp/seq8.c). Inside staging → cleaned with it.
 * Sidesteps the 16KB get_param cap. */
const EXPORT_RENDER_PATH = EXPORT_STAGING + '/render.txt';
/* Companion to the render: every automation lane's POINTS, written by the DSP's
 * `pa_export` (must match EXPORT_PA_PATH in dsp/seq8_bake.c). Same reason for a
 * file rather than a get_param answer — the worst case is 160 lanes x 512
 * points, far past the 16KB cap. */
const EXPORT_PA_PATH = EXPORT_STAGING + '/automation.txt';

/* Source-side reads for route-aware instrument mapping (Phase 2). */
const EXPORT_SETS_BASE_DIR    = '/data/UserData/UserLibrary/Sets';
/* ⚠ The RUNNING host's chain config, not the stock install's. shadow_chain_config.json
 * is per-install private state (standalone/config.sh DBX_PRIVATE_STATE), so the
 * stock copy belongs to native Schwung sessions and drifts independently — on
 * hardware the two differed by 500 bytes and half an hour. Reading the stock one
 * mapped instruments from a chain configuration this session never had. */
const CHAIN_CONFIG_PATH = DAVEBOX_HOST_DIR + '/shadow_chain_config.json';

/* Track route values (see fmtRoute in ui_constants). */
const ROUTE_SCHWUNG = 0;
const ROUTE_MOVE    = 1;
const ROUTE_EXT     = 2;

/* dAVEBOx per-track colors → Ableton clip-color palette index, picked by the
 * user (2026-05-24) to match the device track colors. Applied to EVERY exported
 * track by index (Move/Schwung/Ext alike) so the grid always matches the device. */
const DB_TRACK_COLORS = [1, 17, 7, 10, 25, 15, 6, 12];

/* ---- asset loading ------------------------------------------------------- */

function readJsonAsset(name) {
    const raw = host_read_file(EXPORT_MODULE_DIR + '/' + name);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

/* Remove the staging workspace. NOT host_remove_dir — that host API rejects any
 * path outside the modules dir (schwung_host.c validate), and staging lives under
 * davebox-exports/. host_system_cmd's `rm ` prefix is allowlisted; the path is a
 * fixed constant (no spaces / no user input). rm -rf is a no-op if absent. */
function removeStagingDir() {
    host_system_cmd("rm -rf '" + EXPORT_STAGING + "'");
}

/* ---- source-side reads (loaded Move set + Schwung chain config) ----------- */

/* The loaded Move set's Song.abl. The inner folder name equals the active set
 * name (active_set.txt line 2 == S.currentSetName, verified on device). Returns
 * the parsed object, or null if absent/unreadable/too large (4MB host cap;
 * largest real Song.abl observed ~217KB, so plain host_read_file is safe). */
function loadMoveSong() {
    if (!S.currentSetUuid || !S.currentSetName) return null;
    const path = EXPORT_SETS_BASE_DIR + '/' + S.currentSetUuid + '/' + S.currentSetName + '/Song.abl';
    if (!host_file_exists(path)) return null;
    const raw = host_read_file(path);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

function loadChainConfig() {
    if (!host_file_exists(CHAIN_CONFIG_PATH)) return null;
    const raw = host_read_file(CHAIN_CONFIG_PATH);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

/* Map 0-based MIDI listen-channel -> Move track, from each track's
 * midiInputMode. Move sets store [N]; Note sets store "auto" (skipped). */
function buildMoveChannelMap(moveSong) {
    const map = {};
    if (!moveSong || !Array.isArray(moveSong.tracks)) return map;
    for (const mt of moveSong.tracks) {
        const mim = mt && mt.midiInputMode;
        if (Array.isArray(mim) && mim.length >= 1 && typeof mim[0] === 'number')
            map[mim[0]] = mt;
    }
    return map;
}

/* ---- sample resolution (Phase 5: portable bundling) ---------------------- */

/* Resolve a Move instrument `sampleUri` to its on-disk file, or null if it
 * isn't a bundle-able local pack/user-library reference (presetUri/spriteUri
 * and device-resource URIs are Live-resolved — not passed here, this only sees
 * sampleUri values). URL-decode (%20→space etc.). */
function resolveSampleUri(uri) {
    const CORE = 'ableton:/packs/abl-core-library/';
    const USER = 'ableton:/user-library/';
    let root, rest;
    if (uri.indexOf(CORE) === 0)      { root = '/data/CoreLibrary/';            rest = uri.slice(CORE.length); }
    else if (uri.indexOf(USER) === 0) { root = '/data/UserData/UserLibrary/';   rest = uri.slice(USER.length); }
    else return null;
    let dec;
    try { dec = decodeURIComponent(rest); } catch (e) { dec = rest; }
    return root + dec;
}

/* Assign the bundle-relative dest basename for a source file, deduping so two
 * different sources never collide on one name (and the same source reused
 * across tracks shares one copy). Records {src,dest} in ctx.samples once. */
function assignSampleDest(ctx, src) {
    if (ctx.sampleBySrc[src]) return ctx.sampleBySrc[src];
    const base = src.split('/').pop();
    let dest = base;
    if (ctx.usedDest[dest]) {
        const dot  = base.lastIndexOf('.');
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext  = dot > 0 ? base.slice(dot) : '';
        let i = 2;
        while (ctx.usedDest[stem + ' ' + i + ext]) i++;
        dest = stem + ' ' + i + ext;
    }
    ctx.usedDest[dest] = true;
    ctx.sampleBySrc[src] = dest;
    ctx.samples.push({ src: src, dest: dest });
    return dest;
}

/* Walk a (cloned) Move device subtree; for every resolvable `sampleUri`, copy
 * the file into the bundle (via the manifest) and rewrite the ref to the
 * bundle-relative, URL-encoded `Samples/<name>`. Zip entry = decoded name;
 * Live URL-decodes the ref to find it (verified against a real Note bundle).
 * Every reference site is rewritten, even when the source dedupes. */
function collectSamples(node, ctx) {
    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) collectSamples(node[i], ctx);
        return;
    }
    if (node && typeof node === 'object') {
        for (const k in node) {
            const v = node[k];
            if (k === 'sampleUri' && typeof v === 'string') {
                /* Resolve every bundle-able ref and rewrite optimistically. We do
                 * NOT host_file_exists() it: the host sandboxes paths to BASE_DIR
                 * (validate_path), so /data/CoreLibrary + /data/UserData/UserLibrary
                 * always read as "missing" from JS. pack.py (unsandboxed python) is
                 * authoritative — it copies what exists and reports the rest in
                 * status.missing. */
                const abs = resolveSampleUri(v);
                if (abs) node[k] = 'Samples/' + encodeURIComponent(assignSampleDest(ctx, abs));
            } else {
                collectSamples(v, ctx);
            }
        }
    }
}

/* ---- per-track instrument + name + color resolution ---------------------- */

/* Resolve a dAVEBOx track to an export instrument subtree, display name, color,
 * and mixer, by its route (+ channel for Move/Ext, + slot for Schwung).
 * Falls back to the Dummy Drift (name
 * "dB N") whenever no concrete source is found. trackChannel is 1-based; Move
 * tracks listen on the 0-based channel (channel-1). */
/* What an exported Schwung track is CALLED: the module, and the user preset on
 * it — "Nusaw - Big Lead". A Schwung track exports as a Drift placeholder, so
 * the name is the only record of what the track actually was.
 *
 * ⚠ The preset name is dropped when the record was made against a DIFFERENT
 * module — the same guard ui_sound's presetRecord() applies, because a stale
 * record would otherwise label this module with another one's preset. */
function schwungTrackName(mod, rec, patchName, dbName) {
    const preset = (rec && rec.name && (!rec.mod || !mod || rec.mod === mod))
        ? String(rec.name).trim() : '';
    if (mod && preset) return mod + ' - ' + preset;
    if (mod) return mod;
    if (patchName) return 'SCH-' + patchName;       /* no module: the old fallback */
    return dbName;
}

function resolveTrack(t, ctx) {
    const route = (S.trackRoute && S.trackRoute[t] !== undefined) ? S.trackRoute[t] : ROUTE_SCHWUNG;
    const ch    = (S.trackChannel && S.trackChannel[t]) ? S.trackChannel[t] : (t + 1);  /* 1-based */
    const dbName       = 'dB ' + (t + 1);
    const defaultColor = DB_TRACK_COLORS[t % DB_TRACK_COLORS.length];

    function dummy(name, color) {
        const dev = deepClone(ctx.drift);
        dev.name = name;
        return {
            devices: [dev],
            name: name,
            color: (typeof color === 'number') ? color : defaultColor,
            mixer: null   /* use default track mixer */
        };
    }

    /* Conductor track: silent placeholder, named "Conductor". */
    if (S.trackPadMode && S.trackPadMode[t] === PAD_MODE_CONDUCT) {
        return dummy('Conductor', defaultColor);
    }

    if (route === ROUTE_MOVE) {
        const mt = ctx.moveMap[ch - 1];
        if (mt && Array.isArray(mt.devices) && mt.devices.length >= 1 && mt.devices[0] && mt.devices[0].kind) {
            const preset = mt.devices[0].name || dbName;
            let mixer = null;
            /* ⭑ The Move set's own sends are meaningless here — a Move set has
             * no return tracks, so its array is empty. Ours must match OUR two
             * returns or Live refuses the set. */
            if (mt.mixer) { mixer = deepClone(mt.mixer); mixer.sends = defaultSends(null); }
            const movDevices = deepClone(mt.devices);
            collectSamples(movDevices, ctx);   /* bundle + rewrite sampleUris (Move instruments only) */
            return {
                devices: movDevices,
                name: preset,
                color: defaultColor,   /* dB track color (not the Move track's own color) */
                mixer: mixer,
                isMove: true           /* pitch bend exports on Move tracks only */
            };
        }
        return dummy(dbName, defaultColor);   /* Move-routed but no matching Move track */
    }

    if (route === ROUTE_SCHWUNG) {
        /* ⭑ NAME IT AFTER WHAT IT PLAYS (Josh, 2026-09-05): the module, and the
         * user preset on it — "Nusaw - Big Lead". A Schwung track exports as a
         * Drift placeholder, so the NAME is the only record of what the track
         * actually was, and `SCH-` + the chain patch name was usually just
         * `SCH-`: that config carries only {name, channel, forward_channel} and
         * the name is empty unless somebody set one.
         *
         * The module is READ LIVE rather than taken from the preset record —
         * the record is davebox's note of which preset file is loaded, and its
         * `mod` can be stale. Same guard ui_sound's presetRecord() applies: a
         * record made against a different module is not this module's preset,
         * so its name is dropped rather than shown against the wrong thing. */
        const ts = slotIndex(t);
        const cfg = (ctx.chainCfg && Array.isArray(ctx.chainCfg.patches))
            ? ctx.chainCfg.patches[ts] : null;
        const name = schwungTrackName(
            String(engineGet(ts, 'synth', 'module') || '').trim(),
            S.presetRec && S.presetRec[ts + ':synth'],
            cfg && cfg.name, dbName);
        return dummy(name, defaultColor);
    }

    if (route === ROUTE_EXT) {
        return dummy('Ext ch ' + ch, defaultColor);
    }

    return dummy(dbName, defaultColor);
}

/* Stop-transport notice — held for 2x the normal popup duration so it's easy to
 * read (it's the one popup users hit by accident mid-jam). */
function showStopTransportNotice() {
    showActionPopup('STOP TRANSPORT', 'FOR EXPORT');
    S.actionPopupEndTick = nowMs() + ACTION_POPUP_MS * 2;
}

/* ---- Song.abl authoring -------------------------------------------------- */

/* ── THE MIXER'S VALUES ARE ENGINEERING UNITS, NOT NORMALISED ──────────────
 * Measured, not guessed (2026-09-05) — Josh set track 1 to minimum and track 2
 * to maximum on the Move and we read the resulting Song.abl:
 *
 *   volume : DECIBELS over -70 … +6, with 0.0 UNITY (-70 stands in for -inf).
 *            Corroborated three ways: his untouched tracks, Charles's example
 *            sets, and the master track all read 0.0.
 *   pan    : -50 … +50, confirmed by probe (±50 reads hard over, ±1 near
 *            centre). Left is NEGATIVE.
 *
 * ⚠ davebox's own levels are a LINEAR GAIN (`SLOT_LEVEL_MAX` = 2, 1.0 unity),
 * and its pan is 0…1 with 0.5 centre, so both need converting on the way out —
 * see gainToDb / panToAbl. The gain range maps almost exactly: 2.0 = +6.02 dB
 * against Move's +6.0.
 *
 * 🐞 This is also where a real bug lived until 2026-09-05: the default was
 * `0.6137250661849976`, which in a DECIBEL field is +0.61 dB — so every export
 * came out fractionally loud. It looks like a normalised 0…1 fader position
 * written into a field that wanted dB. Unity is 0.0. */
const ABL_VOL_MIN_DB = -70.0, ABL_VOL_MAX_DB = 6.0, ABL_PAN_FULL = 50.0;

/* davebox linear gain (0 … SLOT_LEVEL_MAX) -> Ableton dB. Gain 0 is silence,
 * which the format spells -70 rather than -Infinity. */
function gainToDb(gain) {
    const g = Number(gain);
    if (!isFinite(g) || g <= 0) return ABL_VOL_MIN_DB;
    const db = 20 * Math.log10(g);
    return Math.max(ABL_VOL_MIN_DB, Math.min(ABL_VOL_MAX_DB, Math.round(db * 1e4) / 1e4));
}
/* davebox pan (0 … 1, 0.5 centre) -> Ableton -50 … +50, left negative. */
function panToAbl(pan) {
    const p = Number(pan);
    if (!isFinite(p)) return 0.0;
    const v = (Math.max(0, Math.min(1, p)) - 0.5) * 2 * ABL_PAN_FULL;
    return Math.round(v * 1e4) / 1e4;
}
export function exportMixerConvForTest() { return { gainToDb, panToAbl, ABL_VOL_MIN_DB, ABL_VOL_MAX_DB, ABL_PAN_FULL }; }

/* ── TWO RETURN TRACKS, AND WHY THEY ARE NOT OPTIONAL ──────────────────────
 * ⭑ RULED (Josh, 2026-09-05): *"an exported set needs to carry to empty return
 * tracks so that the 2 sends populate in each track."* davebox has Send A and
 * Send B, and a send has nowhere to go without a return — Live asserts the two
 * agree (`sends().size() == numReturnTracks`), so a track's `sends` array was
 * previously written EMPTY and no send level could round-trip at all, static or
 * automated.
 *
 * EMPTY is deliberate: the returns carry no devices, so a send lands in silence
 * until the user drops an effect on it. The point is that the send LEVELS and
 * their automation survive the trip. ⭑ Verified by probe (P10a): Live opens a
 * set whose return tracks have `devices: []` — despite rejecting an ordinary
 * TRACK with no device, which is why the export carries a Dummy Drift on those.
 *
 * ⚠ A send `amount` is DECIBELS, like `volume` — measured, not assumed. P10a
 * wrote 0.0/0.5/1.0/50.0 and Live read ALL FOUR as maximum (everything >= 0 dB
 * clamps); P11 then wrote -70/-12/-6/0 and they read off / low / half / full.
 * So sends reuse gainToDb and need no constant of their own: davebox's send
 * range is a gain of 0..1, i.e. -inf..0 dB, which never reaches the top. */
const EXPORT_RETURNS = ['A Reverb', 'B Delay'];

function emptyReturnTrack(name, color) {
    return {
        name: name, color: color, isSelected: false,
        devices: [],                                  /* empty by ruling — see above */
        mixer: { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: 0.0, sends: [] },
    };
}
/* One send entry per return track. Silent (-70 dB) unless a caller supplies
 * levels — davebox's own Send A/B live in its level store, which this module
 * cannot reach yet; the automation lanes write them regardless. */
function defaultSends(levels) {
    return EXPORT_RETURNS.map(function(_, i) {
        const g = levels && levels.length > i ? levels[i] : 0;
        return { isEnabled: true, amount: gainToDb(g) };
    });
}

/* ── READING davebox's AUTOMATION FOR EXPORT ───────────────────────────────
 * The DSP stores every lane as `{tick, val}` pairs where `tick` is a CLIP TICK
 * (96 per beat, as the note render uses) and `val` is 14-bit normalized
 * 0..PA_VAL_MAX for EVERY target kind — the store has no per-target metadata,
 * so only JS can turn a point back into wire units. That is what this does.
 *
 * ⭑ Which targets survive the trip is a ruling, not a limitation to apologise
 * for (docs/working/export-automation-schema.md §5c/§8): the test is whether
 * the target EXISTS in Live.
 *   mixer volume / pan / send A / send B -> clip envelopes on the track mixer
 *   aftertouch, pitch bend               -> per-note automation (channel-level
 *                                           on davebox, so written to EVERY note)
 *   everything else                      -> dropped: a chain param has no
 *                                           Schwung module in Live to land on,
 *                                           a bank param has no equivalent at
 *                                           all, and a CC has no clip-level
 *                                           MIDI target in the format. */
const PA_VAL_MAX = 16383;          /* mirrors dsp/seq8_param_auto.h */
const PA_TICKS_PER_BEAT = 96;      /* mirrors the note render's ÷96 */

/* A lane's target string, as ui_automation writes it:
 *   "<slot>:slot:<key>" / "<slot>:move_fx:<n>:<key>"  a mixer level
 *   "at" | "pb" | "cc:<n>"                            a raw MIDI target
 *   "seq:<track>:<key>"                               a davebox bank param
 * Returns what the export should DO with it, or null to drop it. */
function classifyPaTarget(target) {
    if (target === 'at') return { kind: 'note', key: 'Pressure', max: 127 };
    if (target === 'pb') return { kind: 'note', key: 'PitchBend', max: PA_VAL_MAX };
    if (target.indexOf('cc:') === 0) return null;      /* no clip-level MIDI target exists */
    if (target.indexOf('seq:') === 0) return null;     /* davebox's own sequencer params */
    const m = /:(?:slot|move_fx:\d+):(volume|pan|send_a|send_b)$/.exec(target);
    if (m) return { kind: 'mixer', field: m[1] };
    return null;                                       /* a chain param: no module in Live */
}

/* 14-bit normalized -> the value Ableton wants, per field. The normalization is
 * a fraction of the PARAMETER's own range (ui_automation's normValue), so each
 * case restores its range first and then converts. */
function paValueFor(what, norm) {
    const f = Math.max(0, Math.min(1, Number(norm) / PA_VAL_MAX));
    if (what.kind === 'note') {
        /* pb: davebox stores 0..16383 with 8192 centre; Live wants SEMITONES,
         * signed, over a fixed ±48 — the instrument's own bend range is
         * IGNORED for per-note expression (probes P9a/P9b). The caller supplies
         * `semis` (a Move track's own Global_PitchBendRange); a Schwung track
         * does not export bend at all, because no instrument survives to define
         * what it should sound like. */
        if (what.key === 'PitchBend') return (f * PA_VAL_MAX) - 8192;
        return Math.round(f * what.max);               /* Pressure: 0..127, 1:1 */
    }
    if (what.field === 'pan') return panToAbl(f);      /* davebox pan is 0..1 */
    if (what.field === 'volume') return gainToDb(f * SLOT_LEVEL_MAX);
    return gainToDb(f);                                /* sends: gain 0..1 */
}

/* Parse the DSP's dump. One lane per line:
 *   "<track> <clip> <target> <flags> <loop_len> <resolution>|<tick>:<val> ..."
 * Tolerant by design — a torn last line is dropped rather than throwing, since
 * the alternative is losing a whole export to one bad byte. */
function parsePaDump(body) {
    const lanes = [];
    if (!body) return lanes;
    const lines = String(body).split('\n');
    for (let i = 0; i < lines.length; i++) {
        const bar = lines[i].indexOf('|');
        if (bar < 0) continue;
        const head = lines[i].slice(0, bar).split(' ');
        if (head.length < 3) continue;
        const track = parseInt(head[0], 10), clip = parseInt(head[1], 10), target = head[2];
        if (!isFinite(track) || !isFinite(clip) || !target) continue;
        const points = [];
        const toks = lines[i].slice(bar + 1).split(' ');
        for (let k = 0; k < toks.length; k++) {
            if (!toks[k]) continue;
            const c = toks[k].indexOf(':');
            if (c < 0) continue;
            const tick = parseInt(toks[k].slice(0, c), 10);
            const val  = parseInt(toks[k].slice(c + 1), 10);
            if (isFinite(tick) && isFinite(val)) points.push({ tick: tick, val: val });
        }
        if (points.length) lanes.push({ track: track, clip: clip, target: target, points: points });
    }
    return lanes;
}

/* ── EMITTING IT ───────────────────────────────────────────────────────────
 * Two shapes, because Ableton has two containers and they are not
 * interchangeable (docs §5d/§5g):
 *
 *   a MIXER lane -> a CLIP ENVELOPE. The automated field on the track's mixer
 *     becomes `{value, id}` and the clip carries
 *     `{parameterId, breakpoints, region: null}`. ⚠ Ids are DOCUMENT-WIDE and
 *     sequential from 2 (1 is taken by grooveId), so the counter lives on the
 *     song, not the track — Charles's example sets run 2..9 straight across
 *     track boundaries.
 *
 *   AT / PB -> PER-NOTE automation, written to EVERY note. Josh: both are
 *     CHANNEL-level on davebox, so stamping one curve on all notes reproduces
 *     channel behaviour — and the usual objection (automation between notes is
 *     lost) costs nothing here, because neither is audible with no note
 *     sounding. Probe P8a confirmed it renders as ONE continuous curve.
 */

/* Sample a lane at a clip tick, linearly between its points. */
function paSampleAt(points, tick) {
    if (!points.length) return 0;
    if (tick <= points[0].tick) return points[0].val;
    const last = points[points.length - 1];
    if (tick >= last.tick) return last.val;
    for (let i = 1; i < points.length; i++) {
        const a2 = points[i - 1], b2 = points[i];
        if (tick <= b2.tick) {
            if (b2.tick === a2.tick) return b2.val;
            return a2.val + (b2.val - a2.val) * (tick - a2.tick) / (b2.tick - a2.tick);
        }
    }
    return last.val;
}

/* A mixer lane -> Ableton breakpoints, times in CLIP-RELATIVE BEATS. */
function paBreakpoints(lane, what) {
    return lane.points.map(function(pt) {
        return { time: Math.round((pt.tick / PA_TICKS_PER_BEAT) * 1e6) / 1e6,
                 value: paValueFor(what, pt.val) };
    });
}

/* A channel lane -> per-note automation, sliced to each note's extent and
 * re-based to its own start, so a note beginning mid-sweep starts at the right
 * value. Sample points are the lane's own breakpoints inside the note plus the
 * note's two edges. `notes` are the RENDERED notes (post-pfx, legalized), in
 * BEATS — the automation must ride the notes that are actually exported. */
function paAttachPerNote(notes, lane, what, semis) {
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const st = n.startTime * PA_TICKS_PER_BEAT, du = n.duration * PA_TICKS_PER_BEAT;
        const times = { 0: 1 };
        times[n.duration] = 1;
        for (let k = 0; k < lane.points.length; k++) {
            const rel = (lane.points[k].tick - st) / PA_TICKS_PER_BEAT;
            if (rel > 0 && rel < n.duration) times[rel] = 1;
        }
        const bps = Object.keys(times).map(Number).sort(function(x, y) { return x - y; })
            .map(function(rel) {
                let v = paValueFor(what, paSampleAt(lane.points, st + rel * PA_TICKS_PER_BEAT));
                if (what.key === 'PitchBend') v = v * semis / 48;   /* ±48 is Live's fixed MPE span */
                return { time: Math.round(rel * 1e6) / 1e6, value: Math.round(v * 1e4) / 1e4 };
            });
        if (!bps.length) continue;
        if (!n.automations) n.automations = {};
        n.automations[what.key] = bps;
    }
}

export function exportPaForTest() {
    return { parsePaDump, classifyPaTarget, paValueFor, paSampleAt, paBreakpoints,
             paAttachPerNote, PA_VAL_MAX, PA_TICKS_PER_BEAT };
}

function defaultMixer() {
    return { pan: 0.0, 'solo-cue': false, speakerOn: true, volume: 0.0, sends: defaultSends(null) };
}
export function exportDefaultMixerForTest() { return defaultMixer(); }
export function exportReturnsForTest() {
    return { names: EXPORT_RETURNS.slice(),
             tracks: EXPORT_RETURNS.map((n, i) => emptyReturnTrack(n, i + 1)),
             sends: defaultSends(null), sendsFor: (l) => defaultSends(l) };
}

/* Ableton clips forbid two same-pitch notes overlapping (or starting at the
 * same time) — illegal there, though fine as live MIDI. The baked "what you
 * hear" routinely produces these (long gates re-triggered, delay echoes, arp).
 * Legalize: dedupe same-pitch notes at the same start, then clamp each note's
 * duration so it ends just before the next same-pitch onset. Re-attacks (the
 * actual rhythm) are preserved; only the held tail is shortened. */
function legalizeNotes(notes) {
    const EPS = 1e-4;
    const byPitch = {};
    for (let i = 0; i < notes.length; i++) {
        const p = notes[i].noteNumber;
        (byPitch[p] || (byPitch[p] = [])).push(notes[i]);
    }
    const out = [];
    for (const p in byPitch) {
        const ns = byPitch[p].sort(function(a, b) { return a.startTime - b.startTime; });
        for (let i = 0; i < ns.length; i++) {
            const cur = ns[i];
            if (i > 0 && Math.abs(ns[i - 1].startTime - cur.startTime) < EPS) continue;  /* dup onset */
            let nextStart = Infinity;
            for (let j = i + 1; j < ns.length; j++) {
                if (ns[j].startTime > cur.startTime + EPS) { nextStart = ns[j].startTime; break; }
            }
            if (cur.startTime + cur.duration > nextStart - EPS)
                cur.duration = nextStart - cur.startTime - EPS;
            if (cur.duration > 0) out.push(cur);
        }
    }
    out.sort(function(a, b) { return a.startTime - b.startTime; });
    return out;
}

/* Baked notes for one melodic clip via the DSP non-destructive render
 * (tN_cC_export). The DSP writes notes to EXPORT_RENDER_PATH and returns the
 * "<total_ticks> <note_count>" header (no 16KB get_param cap); JS reads the
 * file for the notes. Returns an Ableton clip object, or null for an
 * empty/drum clip (caller makes it an empty slot) or a render/read error. DSP
 * is authoritative — empty clips return count 0. Ticks→beats = ÷96 (1 bar =
 * 384 ticks, 4 beats/bar). Header is "<total_ticks> <count> <cycle_ticks>":
 * total = content extent (region.end), cycle = default loop brace (region.loop.end)
 * — Phase 4b bakes several cycles (random/delay) and parks the brace on cycle 1
 * so the extra content is revealed by dragging the brace open in Live. */
function buildClip(t, c, isDrum, ctx) {
    /* Apply-Conductor variant: for melodic responder tracks (not drum, not the
     * Conductor track itself) when the user opted in. DSP folds per-scene only
     * where the conductor clip has notes + the responder is on; otherwise it
     * renders written pitch — so calling _export_cond for every responder clip
     * is safe. */
    const useCond = S.exportApplyConductor && !isDrum && t !== conductorTrackIdx();
    const key = 't' + t + '_c' + c +
        (isDrum ? '_export_drum' : (useCond ? '_export_cond' : '_export'));
    const hdr = host_module_get_param(key);
    if (!hdr) return null;
    const parts = hdr.split(' ');
    const span  = parseInt(parts[0], 10) || 0;
    const count = parseInt(parts[1], 10);
    let   cycle = parseInt(parts[2], 10);
    if (!isFinite(cycle) || cycle <= 0) cycle = span;   /* fallback: brace = whole clip */
    if (!isFinite(count) || count <= 0) return null;    /* 0 = empty, -1 = render error */

    const body = host_read_file(EXPORT_RENDER_PATH);
    if (!body) return null;

    const notes = [];
    const toks = body.split(';');
    for (let i = 0; i < toks.length; i++) {
        if (!toks[i]) continue;
        const f = toks[i].split(':');
        if (f.length < 4) continue;
        const tick = parseInt(f[0], 10), pitch = parseInt(f[1], 10),
              vel  = parseInt(f[2], 10), gate  = parseInt(f[3], 10);
        if (!isFinite(tick) || !isFinite(pitch)) continue;
        notes.push({
            noteNumber: pitch,
            startTime: tick / 96,
            duration: Math.max(1, isFinite(gate) ? gate : 1) / 96,
            velocity: isFinite(vel) ? vel : 100,
            offVelocity: 0
        });
    }
    if (notes.length < count)
        showActionPopup('EXPORT WARN', 'CLIP TRUNCATED');   /* should not happen via file */

    const legal = legalizeNotes(notes);   /* remove illegal same-pitch overlaps */
    if (legal.length === 0) return null;

    /* ⭑ Automation rides the RENDERED notes, not the written ones — `legal`
     * is post-pfx and legalized, and is what actually ships. */
    paDecorateClip(t, c, legal, ctx);
    const endBeats  = (span > 0 ? span : 96) / 96;     /* content extent (N cycles) */
    const loopBeats = (cycle > 0 ? cycle : span) / 96; /* default brace = one cycle */
    return {
        isPlaying: false,
        name: '',
        color: null,
        isEnabled: true,
        timeSignature: { upper: 4, lower: 4 },
        region: { start: 0.0, end: endBeats, loop: { start: 0.0, end: loopBeats, isEnabled: true } },
        grooveId: null,
        stepEditorScrollPosition: 0,
        notes: legal,
        envelopes: []
    };
}

/* Attach this clip's automation: per-note for AT/PB, and a clip envelope for
 * every automated mixer field (whose id was allocated on the track). Mutates
 * `notes` and stashes the envelopes for buildClip to hang on the clip. */
function paDecorateClip(t, c, notes, ctx) {
    ctx.paEnvelopes = [];
    if (!ctx || !ctx.paLanes) return;
    for (let i = 0; i < ctx.paLanes.length; i++) {
        const lane = ctx.paLanes[i];
        if (lane.track !== t || lane.clip !== c) continue;
        const what = classifyPaTarget(lane.target);
        if (!what) continue;
        if (what.kind === 'note') {
            /* ⭑ Pitch bend is MOVE TRACKS ONLY (Josh): a Schwung track exports
             * as a Drift dummy, so its real synth — and therefore the bend
             * range that gave the gesture its size — is not in the set at all,
             * and there is no honest number to scale to. */
            if (what.key === 'PitchBend' && !ctx.paBendSemis[t]) continue;
            paAttachPerNote(notes, lane, what, ctx.paBendSemis[t] || 2);
        } else {
            const id = ctx.paMixerIds[t] && ctx.paMixerIds[t][what.field];
            if (!id) continue;
            ctx.paEnvelopes.push({ parameterId: id,
                                   breakpoints: paBreakpoints(lane, what),
                                   region: null });
        }
    }
}

/* Which mixer fields this track automates anywhere, and the bend range its
 * instrument declares. Called once per track BEFORE its clips are built,
 * because the id must exist on the mixer before a clip can point at it. */
function paPrepareTrack(t, r, ctx) {
    ctx.paMixerIds[t] = {};
    ctx.paBendSemis[t] = 0;
    if (!ctx.paLanes) return;
    /* A Move track's own instrument says what a full bend SOUNDED like on the
     * Move; Live ignores the parameter for per-note expression, so we read it
     * and scale the values instead (probes P9a/P9b). */
    if (r.isMove) {
        let semis = 0;
        (function walk(o) {
            if (!o || typeof o !== 'object') return;
            if (Array.isArray(o)) { for (const v of o) walk(v); return; }
            for (const k in o) {
                if (k === 'Global_PitchBendRange') {
                    const v = o[k];
                    const n = (v && typeof v === 'object') ? Number(v.value) : Number(v);
                    if (isFinite(n) && n > 0) semis = n;
                } else walk(o[k]);
            }
        })(r.devices);
        ctx.paBendSemis[t] = semis || 2;
    }
    for (let i = 0; i < ctx.paLanes.length; i++) {
        const lane = ctx.paLanes[i];
        if (lane.track !== t) continue;
        const what = classifyPaTarget(lane.target);
        if (!what || what.kind !== 'mixer') continue;
        if (!ctx.paMixerIds[t][what.field]) ctx.paMixerIds[t][what.field] = ctx.nextPaId++;
    }
}

/* Stamp `{value, id}` on each automated mixer field, keeping the value the
 * mixer already carried — automation does not replace the resting value.
 *
 * ⭑⭑ THE RULE, learned the hard way (2026-09-05): the id goes on THE THING
 * THAT HOLDS THE VALUE, never on the container around it. Volume and pan are
 * plain numbers, so the number becomes `{value, id}`. A send is
 * `{isEnabled, amount}` — so it is `amount` that becomes `{value, id}`, and the
 * send entry keeps its own shape.
 *
 * ⚠ The first version hung the id on the send ENTRY (`{isEnabled, amount, id}`)
 * by analogy with the mixer fields, and Live rejected the whole document with
 * "Error loading document: Unknown id" — the one error it gives for an envelope
 * pointing at nothing. Everything else in the export was correct; one wrong
 * placement killed the entire set, with no partial load and nothing in the log.
 * Bisected against a real export (V1/V2 loaded, V3 did not) and settled by
 * probe V4. */
function paStampMixer(mixer, ids) {
    for (const field in ids) {
        if (field === 'send_a' || field === 'send_b') {
            const idx = field === 'send_a' ? 0 : 1;
            const cur = (mixer.sends && mixer.sends[idx]) || { isEnabled: true, amount: -70 };
            const amt = (cur.amount && typeof cur.amount === 'object') ? cur.amount.value : cur.amount;
            mixer.sends[idx] = { isEnabled: cur.isEnabled !== false,
                                 amount: { value: amt, id: ids[field] } };
        } else {
            const cur = mixer[field];
            mixer[field] = { value: (cur && typeof cur === 'object') ? cur.value : cur, id: ids[field] };
        }
    }
    return mixer;
}
export function exportStampForTest(mixer, ids) { return paStampMixer(mixer, ids); }
/* The test hook is the SAME function the export calls — not a copy of it. A
 * second implementation would pass its pins while the real path drifted. */
export function exportSchwungNameForTest(mod, rec, patchName, dbName) {
    return schwungTrackName(mod, rec, patchName, dbName);
}

function buildTrack(t, ctx) {
    const r = resolveTrack(t, ctx);
    /* Ids must exist on the mixer before any clip can point at one. */
    paPrepareTrack(t, r, ctx);
    /* Melodic tracks bake clip notes via _export; drum tracks flatten their
     * polymetric lanes via _export_drum. DSP is authoritative — empty clips
     * return count 0 → empty slot. The Conductor track emits no MIDI of its
     * own → exported as a dummy with empty clip slots (preserving the 8-track
     * layout); its own clips are never exported as notes. */
    const isConductor = (S.trackPadMode && S.trackPadMode[t] === PAD_MODE_CONDUCT);
    const isDrum = !isConductor && !!(S.trackPadMode && S.trackPadMode[t] !== 0);
    const clipSlots = [];
    for (let i = 0; i < EXPORT_SCENES; i++) {
        const clip = isConductor ? null : buildClip(t, i, isDrum, ctx);
        if (clip && ctx.paEnvelopes && ctx.paEnvelopes.length) clip.envelopes = ctx.paEnvelopes;
        clipSlots.push({ hasStop: true, clip: clip });
    }
    return {
        kind: 'midi',
        name: r.name,
        color: r.color,
        isSelected: t === 0,
        clipSlots: clipSlots,
        isNoteRepeatOn: false,
        noteRepeatRate: '1/16',
        noteRepeatArpeggio: { style: 'chordRepeat' },
        uiOctaveIndex: 4,
        midiInputMode: 'auto',
        midiOutputEndpoint: null,
        devices: r.devices,
        mixer: paStampMixer(r.mixer || defaultMixer(), ctx.paMixerIds[t] || {})
    };
}

function buildSong(bpm, ctx) {
    /* ⭑ ONE read for the whole project (see the DSP's `pa_export`), before any
     * track is built — the id counter runs document-wide, so it cannot be
     * per-track. Starts at 2: `grooveId` uses 1, and real Move files number
     * from 2 upward. */
    ctx.paLanes = [];
    ctx.paMixerIds = {};
    ctx.paBendSemis = {};
    ctx.nextPaId = 2;
    const lanes = parseInt(host_module_get_param('pa_export'), 10);
    if (isFinite(lanes) && lanes > 0) {
        const body = host_read_file(EXPORT_PA_PATH);
        if (body) ctx.paLanes = parsePaDump(body);
    }
    const tracks = [];
    for (let t = 0; t < NUM_TRACKS; t++) tracks.push(buildTrack(t, ctx));
    const scenes = [];
    for (let i = 0; i < EXPORT_SCENES; i++) scenes.push({ name: '', color: null });
    return {
        '$schema': 'http://tech.ableton.com/schema/song/1.8.2/song.json',
        stepEditorResolution: '1/16',
        tempo: bpm,
        globalGrooveAmount: 0.0,
        rootNote: (S.padKey | 0),
        scale: 'Major',           /* TODO Phase 3: map S.padScale -> Ableton scale-name vocab */
        melodicLayout: 'inKey',
        tracks: tracks,
        returnTracks: EXPORT_RETURNS.map((n, i) => emptyReturnTrack(n, i + 1)),
        masterTrack: ctx.master,
        scenes: scenes,
        grooves: [],
        metadata: { usedFeatures: [] }
    };
}

/* ---- filename helpers ---------------------------------------------------- */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function dateStamp() {
    const d = new Date();
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

/* Filesystem-safe set name; spaces collapsed, exotic chars dropped. */
function sanitizeName(name) {
    const s = (name || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim();
    return s || 'davebox';
}

/* <set>-YYYYMMDD.ablbundle, appending -2/-3/... on same-day collisions. */
function uniqueOutPath(base) {
    let p = EXPORT_OUT_DIR + '/' + base + '.ablbundle';
    if (!host_file_exists(p)) return p;
    for (let i = 2; i < 1000; i++) {
        p = EXPORT_OUT_DIR + '/' + base + '-' + i + '.ablbundle';
        if (!host_file_exists(p)) return p;
    }
    return p;
}

/* ---- public: menu action + confirm + tick drain -------------------------- */

/* Menu action (MIDI-handler context). If transport is running, show the
 * stop-transport notice and bail; otherwise open the Yes/No confirm dialog
 * (rendered inside the open global menu, like Clear Session). */
function requestExport() {
    if (S.playing) {
        S.globalMenuOpen = false;
        showStopTransportNotice();
        return;
    }
    S.confirmExport    = true;
    S.confirmExportSel = 1;     /* default No */
    S.screenDirty      = true;
}

/* Confirm-dialog "Yes" commit (MIDI-handler context). Re-checks transport in
 * case it started while the dialog was open. If a Conductor exists, advance to
 * the "Apply Conductor?" stage instead of arming the export; otherwise arm. */
function confirmExportStart() {
    S.confirmExport = false;
    if (S.playing) {
        S.globalMenuOpen = false;
        showStopTransportNotice();
        return;
    }
    if (conductorTrackIdx() >= 0) {
        S.confirmExportCondPhase = true;
        S.confirmExportCondSel   = 1;   /* default NO */
        S.screenDirty            = true;
        return;
    }
    S.exportApplyConductor = false;
    armExport();
}

/* Arm the deferred export (drained in tick()). Caller has already resolved
 * S.exportApplyConductor and confirmed transport is stopped. */
function armExport() {
    S.pendingExport          = true;
    S.confirmExportCondPhase = false;
    S.globalMenuOpen         = false;
    showActionPopup('EXPORTING', '...');
}

/* "Apply Conductor?" stage commit (jog click). sel: 0=YES, 1=NO, 2=CANCEL.
 * Exported: ui.js calls it from the jog-click handler (unexported it was
 * tree-shaken out of the esbuild bundle — audit js-modules-2). */
export function confirmExportCondClick() {
    if (S.confirmExportCondSel === 2) {       /* CANCEL: abort the whole export */
        S.confirmExportCondPhase = false;
        S.screenDirty            = true;
        return;
    }
    if (S.playing) {                          /* transport started while dialog open */
        S.confirmExportCondPhase = false;
        S.globalMenuOpen         = false;
        showStopTransportNotice();
        return;
    }
    S.exportApplyConductor = (S.confirmExportCondSel === 0);
    armExport();
}

/* tick() drain. Two-phase so the "EXPORTING…" popup renders BEFORE the blocking
 * packager call (host_system_cmd waitpid's the python run): phase 1 just shows
 * the popup and arms phase 2 for the next tick; the render between ticks paints
 * EXPORTING; phase 2 does the (blocking) build + pack + report. */
function pollPendingExport() {
    if (S.pendingExport) {
        S.pendingExport    = false;
        S.pendingExportRun = true;
        showActionPopup('EXPORTING', '...');
        S.screenDirty = true;
        return;
    }
    if (!S.pendingExportRun) return;
    S.pendingExportRun = false;
    /* Push the EXPORTING frame to the screen before we block on the packager. */
    host_flush_display();

    /* Tempo: get_param is valid here (tick context). */
    let bpm = 120.0;
    const v = parseFloat(host_module_get_param('bpm'));
    if (v > 0 && isFinite(v)) bpm = v;

    const drift  = readJsonAsset('drift-dummy.json');
    const master = readJsonAsset('ableton-master.json');
    if (!drift || !master) {
        showActionPopup('EXPORT FAIL', 'NO TEMPLATE');
        return;
    }

    /* Route-aware instrument/name/color sources (Phase 2). Missing sources
     * degrade gracefully — every track still gets the Dummy Drift + dB N. */
    const ctx = {
        drift: drift,
        master: master,
        moveMap: buildMoveChannelMap(loadMoveSong()),
        chainCfg: loadChainConfig(),
        samples: [],          /* {src,dest} manifest → pack.py copies into Samples/ */
        sampleBySrc: {},      /* src → dest (dedupe shared samples) */
        usedDest: {}          /* dest names taken (avoid basename collisions) */
    };

    /* Fresh staging dir FIRST — buildSong's render writes EXPORT_RENDER_PATH
     * (inside staging) via the DSP, so the dir must exist before the render. */
    host_ensure_dir(EXPORT_OUT_DIR);
    removeStagingDir();
    host_ensure_dir(EXPORT_STAGING);

    let songJson;
    try {
        songJson = JSON.stringify(buildSong(bpm, ctx));
    } catch (e) {
        showActionPopup('EXPORT FAIL', 'BUILD');
        return;
    }

    if (!host_write_file(EXPORT_STAGING + '/Song.abl', songJson)) {
        showActionPopup('EXPORT FAIL', 'WRITE SONG');
        return;
    }

    const base    = sanitizeName(S.currentSetName) + '-' + dateStamp();
    const outPath = uniqueOutPath(base);
    const statusP = EXPORT_STAGING + '/pack-status.json';

    const args = {
        staging: EXPORT_STAGING,
        out: outPath,
        samples: ctx.samples,   /* {src,dest} resolved from Move instrument sampleUris */
        status: statusP
    };
    host_write_file(EXPORT_STAGING + '/pack-args.json', JSON.stringify(args));

    /* Only fixed, space-free paths appear on the shell command line; the set
     * name (which may contain spaces) lives inside pack-args.json. */
    const cmd = "sh -c '/usr/bin/python3 " + EXPORT_MODULE_DIR +
                "/pack.py " + EXPORT_STAGING + "/pack-args.json'";
    const rc = host_system_cmd(cmd);

    let okStatus = null, errMsg = null;
    const st = host_read_file(statusP);
    if (st) {
        try {
            const s = JSON.parse(st);
            if (s && s.ok) okStatus = s;
            else errMsg = (s && s.error) ? String(s.error) : 'PACK ERR';
        } catch (e) { errMsg = 'BAD STATUS'; }
    } else {
        errMsg = 'NO STATUS rc=' + rc;
    }

    /* Clean up the scratch workspace (Song.abl + manifest + copied Samples/) —
     * the finished bundle lives in EXPORT_OUT_DIR; staging is no longer needed. */
    removeStagingDir();

    if (okStatus) {
        /* Persistent "Exported to <path>" dialog — stays up until the user OKs it
         * (reuses the global-menu dialog machinery: re-open the menu in dialog mode). */
        S.exportDonePath    = String(okStatus.out || outPath);
        S.exportDoneMissing = (okStatus.missing && okStatus.missing.length) ? okStatus.missing.length : 0;
        S.exportDoneDialog  = true;
        S.globalMenuOpen    = true;
        S.screenDirty       = true;
    } else {
        showActionPopup('EXPORT FAIL', String(errMsg).slice(0, 18));
    }
}

export { requestExport, confirmExportStart, pollPendingExport };
