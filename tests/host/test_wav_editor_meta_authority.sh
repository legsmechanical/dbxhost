#!/usr/bin/env bash
# Every metadata lookup the wave editor makes must know the LEVELS, not just
# chain_params.
#
# ⚠⚠ THE MODULE THE SCREEN WAS WRITTEN FOR IS THE ONE cpMap CANNOT SEE. `S.cpMap`
# is built from chain_params alone (ui_discover: "chain_params is the AUTHORITY
# for value metadata"), and DR32 publishes only `kit` and `master` there — its
# pads` `sample_move`, `start` and `end` are declared inline on the `pads`
# level. So `S.cpMap[bare]` was null for every one of them:
#   · Shift+click fell through to the silent "no linked file" return, which is
#     the device report "no way to browse kits or samples";
#   · the resolver had no filepath declaration to take `root`/`start_path` from,
#     so a relative sample path could not be found and the screen said so.
# Neither failure logs anything, and both look exactly like a module that has
# no sample loaded.
#
# `authoritativeMeta(key, cpMap, levels)` is the lookup the MENU has always used
# — cpMap first, then the levels, then the repeated-element template. The pin is
# on the CALL SITES, because the unit is green either way: it is the callers
# that stopped passing the levels.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = readFileSync("davebox/ui/ui_sound.mjs", "utf8");
/* Brace-match a named function so the window is STRUCTURAL — a slice() window
 * fails a correct tree the day someone adds a comment above it. */
const body = (needle) => {
    const at = src.indexOf(needle);
    if (at < 0) throw new Error("anchor not found: " + needle);
    let d = 0, i = src.indexOf("{", at);
    for (;; i++) { const c = src[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) break; } }
    return strip(src.slice(at, i + 1));
};

ok(/authoritativeMeta[^;]*from .\.\/ui_discover\.mjs./.test(strip(src)),
   "authoritativeMeta is imported from ui_discover");

const op = body("function openWavEditor(");
ok(op.length > 400, "control: openWavEditor`s body was extracted (" + op.length + " chars)");
ok(/metaOf:\s*\(bare\)\s*=>\s*authoritativeMeta\(bare,\s*cp,\s*S\.levels\)/.test(op),
   "metaOf() asks authoritativeMeta with the LEVELS");
ok(!/metaOf:\s*\(bare\)\s*=>\s*cp\[bare\]/.test(op),
   "...and not cp[bare], which is null for every DR32 marker");
/* The member list decides the marker/knob roles, so it has to see the same
 * declarations the metaOf lookup does. */
ok(/for \(const lvl of Object\.values\(S\.levels \|\| \{\}\)\)/.test(op) &&
   /lvl && lvl\.params/.test(op),
   "the member list walks the LEVELS as well as cpMap");
ok(/for \(const k of Object\.keys\(cp\)\)/.test(op),
   "control: chain_params is still walked FIRST — it keeps precedence");
/* ⚠ A member`s address is its INSTANCE`s, not the component`s — the same rule
 * as the file link. Building it as `${S.comp}:${k}` wrote a key no module
 * serves for every child-level sibling. */
ok(/wavSiblingKey\(fullKey, ownBare, k, S\.comp\)/.test(op),
   "a member`s fullKey is scoped through wavSiblingKey, not `${S.comp}:${k}`");
ok(!/fullKey:\s*`\$\{S\.comp\}:\$\{k\}`/.test(op),
   "control: the component-scoped form is gone");

/* The Shift+click browse route. It lives in the click handler, so pin the one
 * statement rather than a whole function. */
ok(/const decl = bare \? authoritativeMeta\(bare, S\.cpMap, S\.levels\) : null;/.test(strip(src)),
   "Shift+click resolves the file declaration through authoritativeMeta");
ok(!/const decl = bare \? \(S\.cpMap && S\.cpMap\[bare\]\) : null;/.test(strip(src)),
   "...and not through cpMap alone — the lookup that made the gesture a no-op");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor resolves metadata the way the menu does");
'
