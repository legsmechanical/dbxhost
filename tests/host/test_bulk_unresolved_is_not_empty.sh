#!/usr/bin/env bash
# An UNRESOLVED bulk key must not look like an EMPTY value.
#
# ⚠⚠ THE FAILURE THIS ENDS. The bulk and single resolvers do not cover the same
# key prefixes — `shadow_direct_get_param` (the bulk path) knows `slot:` and the
# `move_fx:` mixer keys and then falls through to the chain plugin; the single
# path also knows `master_fx:` and `send_fx:`. A key the bulk path could not
# resolve used to come back as a ZERO-LENGTH VALUE with the item count still
# correct, so a well-formed reply full of "" was indistinguishable from a chunk
# of genuinely empty values. davebox's per-key fallback therefore never fired,
# and every Move-bus level went missing from every snapshot for a day (device,
# Josh 2026-09-06) — silent by construction.
#
# The old guard was a heuristic: "if EVERY key came back blank the host did not
# understand the prefix". That cannot see a chunk which MIXES resolvable and
# unresolvable keys — which is exactly what a bus component is. The host now
# marks an unresolved item `?`, and the caller falls back for that key alone.
#
# ⚠ `?` and not a negative length: the reader's length parser already returns -1
# as its own parse-error value, and giving that channel a second meaning is how
# an error becomes a datum.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
import { bulkDecodeForTest } from "./davebox/ui/ui_engine.mjs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };

/* ---- the decoder ------------------------------------------------------- */
/* Built the way the HOST writes it: `<count>\n` then per item either
 * `<byteLen>\n<bytes>` or the unresolved marker. */
const item = (v) => (v === null ? "?\n" : `${Buffer.byteLength(v, "utf8")}\n${v}`);
const blob = (vals) => vals.length + "\n" + vals.map(item).join("");

ok(JSON.stringify(bulkDecodeForTest(blob(["0.500", "", "abc"]))) === JSON.stringify(["0.500", "", "abc"]),
   "control: ordinary values still decode, empty string included");
{
    const got = bulkDecodeForTest(blob(["0.500", null, "abc"]));
    ok(got !== null, "a reply containing an unresolved item still parses");
    ok(got && got.length === 3, "...with the item count intact");
    ok(got && got[1] === null, "⭐ the unresolved item decodes as NULL, not as \"\"");
    ok(got && got[0] === "0.500" && got[2] === "abc", "...and its neighbours are untouched");
}
ok(bulkDecodeForTest(blob([null, null])) !== null, "an all-unresolved reply parses too");
/* ⚠ The distinction is the whole point — assert the two are not the same. */
ok(JSON.stringify(bulkDecodeForTest(blob([""]))) !== JSON.stringify(bulkDecodeForTest(blob([null]))),
   "⚠ an EMPTY value and an UNRESOLVED key no longer decode alike");

/* ---- the C side writes what the decoder reads --------------------------- */
/* ⚠ Read off the shim rather than restated here: the two halves ship together,
 * so the marker must be ONE literal, not two that agree today. */
const shim = readFileSync("src/schwung_shim.c", "utf8");
ok(/static int bulk_put_unresolved\(/.test(shim), "the shim has an unresolved writer");
ok(shim.indexOf(String.fromCharCode(34, 63, 92, 110, 34)) >= 0,
   "...and it writes exactly the `?` the decoder reads");
/* ⚠⚠ r == 0 IS AN ANSWER — the empty string. Folding r==0 in with r<0 is the
 * original bug, so pin that only a NEGATIVE return counts as unresolved. */
ok(/if \(r >= 0\) \{/.test(shim),
   "⚠ a zero-length answer counts as RESOLVED — only a negative return is unknown");
/* ⚠ BOTH bulk handlers — the chain one and the overtake one. Writing this as a
 * whole-file check rather than one function is what caught the second copy: the
 * overtake handler had the identical fold and I had only fixed the chain one. */
ok(!/if \(r > 0\) vlen =/.test(shim),
   "control: the form that folded \"empty\" into \"unknown\" is gone — from BOTH handlers");
ok((shim.match(/bulk_put_unresolved\(out, off, SHADOW_PARAM_VALUE_LEN\)/g) || []).length === 2,
   "both bulk GET handlers signal unresolved, not just the chain one");

/* ---- the caller falls back for the ONE key, not the whole chunk --------- */
const eng = readFileSync("davebox/ui/ui_engine.mjs", "utf8");
ok(/unresolved > 0 && unresolved < chunk\.length/.test(eng),
   "a MIXED chunk falls back per unresolved key");
ok(/out\[chunk\[j\]\] = \(vals\[j\] === null\) \? engineGet\(slot, comp, chunk\[j\]\) : vals\[j\]/.test(eng),
   "...through the single-request path, which resolves more prefixes");
ok(/const allEmpty = /.test(eng),
   "control: the all-empty heuristic is KEPT — it still covers a host that resolves nothing");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: an unresolved bulk key is distinguishable from an empty value");
'
