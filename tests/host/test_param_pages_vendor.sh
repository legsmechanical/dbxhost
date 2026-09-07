#!/usr/bin/env bash
# THE BINDING↔ctx CONTRACT, pinned against CODE on all three sides.
#
# ⚠⚠ WHY THIS EXISTS. davebox does not reimplement the module editor: it runs
# the shared binding (`src/shared/param_pages/binding_movy.mjs`) over its OWN
# ctx (`davebox/ui/pp_ctx.mjs`, filled by ui_sound.mjs's installPpCtx). Almost
# every read in that binding is `typeof === 'function'` guarded, so a member
# davebox stops answering is NOT an error — the editor silently drops whatever
# that member does, and the drop looks like a design choice. The failure is
# invisible on the device and invisible to every other test.
#
# ⚠ Four comments across two files cited this file as the pin for months while
# it did not exist (found 2026-09-06). A cited check that is not in the tree is
# worse than no check: it is a claim of coverage. Do not delete this without
# deleting those citations.
#
# It reads the binding's CODE (`ctx.<member>` occurrences), pp_ctx's DATA
# (PP_CTX_MEMBERS / PP_CTX_ABSENT — arrays, not prose), and ui_sound's ACTUAL
# installPpCtx object literal, and fails if any two disagree.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
import { PP_CTX_MEMBERS, PP_CTX_ABSENT, PP_CTX_DEFERRED } from "./davebox/ui/pp_ctx.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };
const set = (a) => new Set(a);
const missing = (want, have) => [...want].filter((x) => !have.has(x));

/* ---- 1. what the BINDING reads ---------------------------------------- */
const BINDING = "src/shared/param_pages/binding_movy.mjs";
const read = set((readFileSync(BINDING, "utf8").match(/\bctx\.[A-Za-z_][A-Za-z0-9_]*/g) || [])
                 .map((s) => s.slice(4)));
ok(read.size >= 12, "control: the binding reads a plausible number of ctx members (" + read.size + ")");

/* ---- 2. what pp_ctx DECLARES ------------------------------------------ */
/* ⚠ THREE categories: answered by installPpCtx, deliberately absent, and
 * supplied by the ENTRY POINT (the QuickJS reader, which ui_sound may not
 * import). All three are DECLARED — that is the point of the pin. */
const declared = set([...PP_CTX_MEMBERS, ...PP_CTX_ABSENT, ...PP_CTX_DEFERRED]);
ok(PP_CTX_MEMBERS.length > 0 && PP_CTX_ABSENT.length > 0,
   "control: both contract arrays are populated");

const undeclared = missing(read, declared);
ok(undeclared.length === 0,
   "every member the binding reads is declared in pp_ctx: " +
   (undeclared.length ? "UNDECLARED " + undeclared.join(", ") : "none missing"));

const phantom = missing(declared, read);
ok(phantom.length === 0,
   "pp_ctx declares nothing the binding does not read: " +
   (phantom.length ? "PHANTOM " + phantom.join(", ") : "none extra"));

/* ---- 3. what ui_sound actually INSTALLS -------------------------------- */
/* Read from the object literal, not from a comment beside it: a source pin
 * that matches its own prose has passed a broken tree here before. */
const UI = readFileSync("davebox/ui/ui_sound.mjs", "utf8");
const at = UI.indexOf("installPpCtx({");
if (at < 0) { console.log("FAIL: ui_sound.mjs does not call installPpCtx({"); process.exit(1); }
let depth = 0, i = at + "installPpCtx(".length, start = i;
for (;; i++) {
  const c = UI[i];
  if (c === undefined) { console.log("FAIL: unterminated installPpCtx call"); process.exit(1); }
  if (c === "(" || c === "{") depth++;
  else if (c === ")" || c === "}") { depth--; if (depth === 0) break; }
}
const block = UI.slice(start, i + 1);
/* Top-level keys only: four-space indent inside the literal. A nested key is
 * indented deeper and must not be counted as a ctx member. */
const installed = set((block.match(/^    [A-Za-z_][\w]*\s*:/gm) || [])
                      .map((s) => s.trim().replace(/\s*:$/, "")));
ok(installed.size > 0, "control: keys were extracted from the installPpCtx literal (" + installed.size + ")");

const unanswered = missing(set(PP_CTX_MEMBERS), installed);
ok(unanswered.length === 0,
   "every member pp_ctx claims davebox answers IS installed: " +
   (unanswered.length ? "NOT INSTALLED " + unanswered.join(", ") : "all installed"));

const surprise = [...installed].filter((k) => !PP_CTX_MEMBERS.includes(k));
ok(surprise.length === 0,
   "ui_sound installs nothing the contract does not list: " +
   (surprise.length ? "UNLISTED " + surprise.join(", ") : "none extra"));

/* ⭐⭐ The absent four are absent BECAUSE THE HOST OMITS THEM TOO. Supplying one
 * would make davebox differ from stock — in the nicer direction, which is still
 * a difference. This is the assertion that keeps that a decision. */
const wronglyAnswered = PP_CTX_ABSENT.filter((k) => installed.has(k));
ok(wronglyAnswered.length === 0,
   "the deliberately-absent members are still absent: " +
   (wronglyAnswered.length ? "NOW ANSWERED " + wronglyAnswered.join(", ") : "still absent"));

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the binding↔ctx contract agrees across binding, pp_ctx and ui_sound");
'
