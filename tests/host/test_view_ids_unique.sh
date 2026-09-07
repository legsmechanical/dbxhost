#!/usr/bin/env bash
# No two davebox screens may share a view id.
#
# ⚠⚠ WHY THIS IS A TEST AND NOT A CONVENTION. The ids are declared across a
# dozen lines of one `const` block in READING order, not numeric order, with
# comment paragraphs between them — so "the next free number" is not the one
# under the cursor. Adding VIEW_WAV, I took 19, which is already VIEW_MACROS:
# two unrelated screens would have become the same screen. Every `S.view === X`
# test would have been true for both, the render dispatch would have drawn
# whichever branch came first, and there is no error anywhere in that.
#
# It reads the CONSTANT BLOCK, not a list kept beside it.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
const src = readFileSync("davebox/ui/ui_sound.mjs", "utf8");
/* VIEW_DELAY_MS is a duration, not a screen — it lives elsewhere and is the one
 * VIEW_-prefixed name that is not an id. */
const ids = [...src.matchAll(/\b(VIEW_[A-Z_0-9]+)\s*=\s*(\d+)\b/g)]
    .filter((m) => m[1] !== "VIEW_DELAY_MS")
    .map((m) => ({ name: m[1], id: Number(m[2]) }));

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

/* ⚠ CONTROL: a regex that matched nothing would pass every check below. */
ok(ids.length > 15, "control: the view constants were found (" + ids.length + " ids)");

const byId = new Map();
const clashes = [];
for (const { name, id } of ids) {
  if (byId.has(id) && byId.get(id) !== name) clashes.push(`${id}: ${byId.get(id)} and ${name}`);
  else byId.set(id, name);
}
ok(clashes.length === 0,
   clashes.length ? "TWO SCREENS SHARE AN ID — " + clashes.join("; ")
                  : "every view id is unique");

/* Declared once each, too: a name assigned twice is the same defect wearing a
 * different hat, and `const` would not catch it across two blocks. */
const names = ids.map((v) => v.name);
const dupNames = names.filter((n, i) => names.indexOf(n) !== i);
ok(dupNames.length === 0,
   dupNames.length ? "a view NAME is declared twice: " + [...new Set(dupNames)].join(", ")
                   : "every view name is declared once");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: " + ids.length + " view ids, all distinct");
'
