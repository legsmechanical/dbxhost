#!/usr/bin/env bash
# A sample marker, resolved from REAL module declarations.
#
# ⚠⚠ WHY THIS EXISTS, and why every assertion below reads a captured contract
# rather than an object written here. Three suites, a six-pass review and 20
# mutation tests all passed while `filepath_param` was being dropped on the
# floor for half the fleet, because every fixture in them was written by the
# person writing the code — and so every fixture declared its extras at the top
# level, the way the code already read them. The user hit it in a minute.
#
# So: DR32 comes verbatim from schwung-dr32's own module.json, and mrdrums and
# mrsample from the 100-module device capture. If a shape is not in one of
# those files it is not tested here.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import fs from "fs";
import { buildMetaIndex } from "./src/shared/param_pages/param_meta.mjs";
import { isWavPosition, wavPositionMode, wavSiblingKey, resolveWavSourcePath }
    from "./src/shared/param_pages/wav_position.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

const dr32 = JSON.parse(fs.readFileSync("tests/fixtures/dr32-contract.json", "utf8"));
const fleet = JSON.parse(fs.readFileSync("tests/fixtures/module-contracts.json", "utf8"));
const modOf = (id) => {
    const m = (fleet.modules || []).find((x) => x && x.id === id);
    if (!m) throw new Error(`fixture module ${id} is not in the capture`);
    return m;
};
const indexOf = (m) => buildMetaIndex({ hierarchy: m.ui_hierarchy,
                                        chainParams: m.chain_params || [] });

/* ================================================== the two declaration sites */
/* ⚠ DR32 declares its markers INLINE on the `pads` level and publishes only
 * `kit` and `master` in chain_params. A lookup that reads chain_params alone
 * sees no marker at all on this module. */
{
    const cp = (dr32.chain_params || []).map((p) => p.key);
    ok(!cp.includes("start") && !cp.includes("sample_move"),
       "control: DR32 publishes NEITHER its marker nor its file in chain_params");
    const idx = indexOf(dr32);
    for (const k of ["start", "end"]) {
        const m = idx.get(k);
        ok(isWavPosition(m), `DR32 \`${k}\` resolves as a marker`);
        ok(m.filepath_param === "sample_move",
           `...and keeps its file link (\`${k}\` -> sample_move)`);
    }
    ok(wavPositionMode(idx.get("start")) === "start", "DR32 `start` is a START marker");
    /* ⚠⚠ THE ONE THAT WAS SILENTLY WRONG. `mode` is declared, `wav_mode` is
     * what every consumer reads, and nothing was copying one to the other — so
     * an END marker read as a plain position and `wavEndDefault` seeded the
     * wrong end of the file. */
    ok(wavPositionMode(idx.get("end")) === "end", "DR32 `end` is an END marker, not a position");
}

/* mrdrums is the OTHER live spelling — `type: float` + `ui_type` on its per-pad
 * declarations, and a generic `pad_start` alias beside them.
 *
 * ⚠ CORRECTED 2026-09-07: an earlier version of this said mrdrums declares its
 * extras inside `options` and that reading only the top level lost them. It
 * does not — that shape came from a DUMP TOOL`s serialisation, not from the
 * module, whose captured contract carries `filepath_param` at the top level.
 * These two assertions are CONTROLS: they hold with or without the expansion.
 * Only the `mode` -> `wav_mode` join below actually needs it. Said plainly
 * because a control dressed as a proof is how a test starts lying. */
{
    const idx = indexOf(modOf("mrdrums"));
    const m = idx.get("pad_start");
    ok(isWavPosition(m), "control: mrdrums `pad_start` resolves as a marker");
    ok(m.filepath_param === "pad_sample_path", "control: ...with its file link intact");
    ok(wavPositionMode(m) === "start", "⭑ ...and its mode reaches `wav_mode` — this needs the expansion");
}
/* ⭑ THE WHOLE MEASURED EFFECT, stated as a number rather than implied. Old and
 * new resolution differ on ONE derived field across the fleet. */
{
    const lost = [];
    for (const mod of (fleet.modules || [])) {
        const idx = buildMetaIndex({ hierarchy: mod.ui_hierarchy,
                                     chainParams: mod.chain_params || [] });
        for (const k of idx.keys) {
            const meta = idx.get(k);
            if (!meta || !isWavPosition(meta)) continue;
            /* `mode` is what modules declare; `wav_mode` is what consumers read.
             * Nothing joined them before, on either host. */
            if (meta.mode && !meta.wav_mode) lost.push(mod.id + ":" + k);
        }
    }
    ok(lost.length === 0, "no marker in the fleet still has a `mode` its consumers cannot read");
}

/* mrsample is the third shape: the host dialect, everything at the top level. */
{
    const idx = indexOf(modOf("mrsample"));
    for (const k of ["sample_start", "loop_start", "loop_end"]) {
        const m = idx.get(k);
        ok(isWavPosition(m), `mrsample \`${k}\` resolves as a marker (type float + ui_type)`);
        ok(m.filepath_param === "sample_path", `...linked to sample_path`);
    }
    ok(idx.get("sample_start").view_group === idx.get("loop_end").view_group &&
       !!idx.get("sample_start").view_group,
       "...and all three share one view_group — the only group in the fleet");
}

/* ============================================ the sibling key on a child level */
/* DR32: a BARE declaration on a repeated element means THIS PAD`S. */
ok(wavSiblingKey("synth:pad05_start", "start", "sample_move", "synth")
   === "synth:pad05_sample_move",
   "a bare file link on a child level is scoped to the marker`s own instance");
/* mrdrums declares each pad separately, so the link is ALREADY concrete —
 * re-scoping it asked for `p05_p05_sample_path`, which no module serves. */
ok(wavSiblingKey("synth:p05_start", "start", "p05_sample_path", "synth")
   === "synth:p05_sample_path",
   "an ALREADY-concrete file link is not prefixed a second time");
ok(wavSiblingKey("synth:pad_start", "pad_start", "pad_sample_path", "synth")
   === "synth:pad_sample_path",
   "mrdrums` generic alias pair needs no instance at all");
ok(wavSiblingKey("synth:sample_start", "sample_start", "sample_path", "synth")
   === "synth:sample_path",
   "control: a flat module is untouched by any of this");
ok(wavSiblingKey("synth:pad05_start", "start", "other:path", "synth") === "other:path",
   "control: a link that names its own component is taken as written");

/* ⚠⚠ THE GENERALISATION THAT WAS SHIPPED AND REVERTED (2026-09-07). These are
 * the cases whose absence let it through: a commit message said "six cases
 * exercised" for cases run in a shell and never written down, and deleting the
 * whole branch left all 161 host tests and the davebox suite GREEN.
 *
 * The tempting extension is "any index of the same prefix", so `pad4_start`
 * naming `pad7_end` is left alone. It cannot be done from the instance string:
 * `<prefix><index>_` is AMBIGUOUS once a prefix ends in a digit — `osc12_` is
 * `osc`+12 or `osc1`+2 — so every regex shape recovers `osc` and STRIPS the
 * scoping from a legitimately bare `osc1_freq`. Pinned as behaviour, so the
 * next person to try it fails here instead of on a device. */
ok(wavSiblingKey("synth:osc12_start", "start", "osc1_freq", "synth")
   === "synth:osc12_osc1_freq",
   "⚠ a bare sibling is scoped even when it LOOKS instance-shaped — the prefix " +
   "is not recoverable from the instance string");
ok(wavSiblingKey("synth:pad4_start", "start", "pad7_end", "synth")
   === "synth:pad4_pad7_end",
   "⚠ ...and the known cost of that: ANOTHER instance`s key is still prefixed. " +
   "Doing it right needs the level`s own child_prefix, which this pure " +
   "function deliberately does not take");
/* A prefix carrying a regex metacharacter — the second defect in the reverted
 * version, which interpolated a recovered head into `new RegExp` unescaped:
 * `p+` mis-matched silently and `(` threw out of the resolve path. */
{
    let threw = null;
    let out = null;
    try { out = wavSiblingKey("synth:p(1_start", "start", "p1_sample", "synth"); }
    catch (e) { threw = e; }
    ok(!threw, "a child prefix containing a regex metacharacter does not THROW");
    ok(out === "synth:p(1_p1_sample",
       "...and is not mis-matched into stripping the scoping");
}

/* ================================================= it reaches an actual read */
/* The resolver, driven by DR32`s real meta, with the reads it would make. */
{
    const idx = indexOf(dr32);
    const asked = [];
    const path = resolveWavSourcePath(idx.get("start"), {
        getParam: (k) => { asked.push(k); return k === "synth:pad05_sample_move" ? "kick.wav" : ""; },
        metaOf: (bare) => idx.get(bare),
        buildKey: (bare) => `synth:${bare}`,
        siblingKey: (bare) => wavSiblingKey("synth:pad05_start", "start", bare, "synth"),
        exists: (p) => p === "/data/CoreLibrary/Samples/kick.wav",
    });
    ok(asked.includes("synth:pad05_sample_move"),
       "the resolver asks for the FOCUSED PAD`s file key");
    ok(!asked.includes("synth:sample_move"),
       "control: it does NOT ask the component — that read is the empty one");
    /* The relative value resolves against the browser`s own roots, which live
     * on the filepath declaration — inline on the level, for DR32. */
    ok(path === "/data/CoreLibrary/Samples/kick.wav",
       "a relative path resolves against the filepath param`s start_path");
}

console.log(fail ? `FAIL: ${fail} failure(s)` : "PASS: sample markers resolve from real module declarations");
process.exit(fail ? 1 : 0);
'
