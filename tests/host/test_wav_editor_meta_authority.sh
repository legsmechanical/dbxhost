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
ok(/scoped \? wavSiblingKey\(fullKey, ownBare, k, S\.comp\) : `\$\{S\.comp\}:\$\{k\}`/.test(op),
   "a member`s fullKey is instance-scoped through wavSiblingKey");
/* ⚠⚠ ...ONLY FOR A REPEATED ELEMENT. Once the instance was genuinely non-empty
 * (it had been "" — see below), scoping EVERY declaration prefixed
 * component-wide chain_params too: DR32`s `kit` became `synth:pad4_kit`, a key
 * no module serves. A chain_param is component-wide by definition; only a level
 * that declares children lists TEMPLATES. The no-op was masking this, so the
 * fix and the bug armed on the same trigger. */
ok(/pushDecl\(k, cp\[k\], false\)/.test(op),
   "⚠ chain_params are NOT instance-scoped — they are component-wide");
ok(/const repeated = !!childSpec\(lvl\);/.test(op) &&
   /pushDecl\(prm\.key, prm, repeated\)/.test(op),
   "...and a level`s params are scoped only where the level declares children");
/* ⚠⚠ ...AND THE ARGUMENT, which is where it was wrong. `wavSiblingKey` derives
 * the instance by subtracting the marker`s own bare NAME from its resolved key.
 * `ownBare` was `ppBare(fullKey)` — the resolved key itself — so the
 * subtraction had nothing to remove, `instance` was always "", and every member
 * came out component-scoped: byte-identical to the code this replaced. The call
 * above was spelled correctly throughout. */
ok(/const ownBare = \(meta && meta\.key\) \|\|/.test(op),
   "⚠ ownBare is the marker`s DECLARED name, not its resolved key");
ok(!/const ownBare = ppBare\(fullKey\) \|\| fullKey;/.test(op),
   "control: the form that made the scoping a no-op is gone");
/* ⚠ The component-scoped form is IN the code, deliberately — it is the `false`
 * arm of the ternary above. This passes only because `fullKey:` is now followed
 * by `scoped ?`, so what it blocks is an UNCONDITIONAL revert. Labelled for what
 * it does: an earlier label said the form was "gone", which is false in a file a
 * reader consults to learn what the pin means. */
ok(!/fullKey:\s*`\$\{S\.comp\}:\$\{k\}`,/.test(op),
   "control: the component-scoped form is only the unscoped ARM, never unconditional");

/* ---- the screen must be able to say WHICH INSTANCE ---------------------- */
/* ⚠⚠ "START" IS THE SAME HEADER ON ALL THIRTY-TWO OF DR32`S PADS. The editor
 * has the parameter and nothing else, so the instance has to be handed to it —
 * and it is taken from the page the dive came FROM, which was already
 * displaying exactly that, resolved (a declared child name where the module
 * gave one, "Pad 7" where it did not). Re-deriving it from the key would be a
 * second implementation of a convention the grid already resolved.
 * ⚠⚠ THE CONTROLLER DOES *NOT* SURVIVE THE EXIT — this comment used to say it
 * did, which is the sentence that produced the bug the block below now pins.
 * `exitParamPages()` ends with `controller = null`, so the read has to happen
 * before the teardown, not after it. Left standing here for one commit after
 * the code was corrected: the last copy of a false claim is still a false
 * claim, and this file is where a reader comes to learn what the pin means. */
ok(/crumbs: \[modLabel\(\), divedFrom\]\.filter\(Boolean\)/.test(op),
   "the editor is told which page it was dived from");
ok(/paramPagesPageLabel/.test(strip(src).slice(0, strip(src).indexOf("} = PP;"))),
   "control: paramPagesPageLabel is taken off the binding, not invented here");
/* ⚠⚠ THE ORDER IS THE BUG, and a pin on the CALL cannot see it.
 * `exitParamPages()` sets the binding`s `controller` to null, so every accessor
 * on it answers "" afterwards. The first cut of this read the label INSIDE
 * openWavEditor — three lines after the exit — with a comment asserting the
 * controller survives. It does not: the header said the module name where it
 * should have said the pad, the call was spelled perfectly, and this pin was
 * green. */
{
    const dive = body("openParamEditor: (slot, fullKey, meta) =>");
    const readAt = dive.indexOf("paramPagesPageLabel()");
    const exitAt = dive.indexOf("exitParamPages()");
    ok(readAt >= 0 && exitAt >= 0 && readAt < exitAt,
       "⚠ the page label is read BEFORE exitParamPages() nulls the controller (" +
       readAt + " < " + exitAt + ")");
    ok(op.indexOf("paramPagesPageLabel") < 0,
       "...and openWavEditor does NOT ask for it itself — by then it is always empty");
}

/* The Shift+click browse route. It lives in the click handler, so pin the one
 * statement rather than a whole function. */
ok(/const decl = bare \? authoritativeMeta\(bare, S\.cpMap, S\.levels\) : null;/.test(strip(src)),
   "Shift+click resolves the file declaration through authoritativeMeta");
ok(!/const decl = bare \? \(S\.cpMap && S\.cpMap\[bare\]\) : null;/.test(strip(src)),
   "...and not through cpMap alone — the lookup that made the gesture a no-op");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the wave editor resolves metadata the way the menu does");
'
