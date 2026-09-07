#!/usr/bin/env bash
# A component that failed to load is refused by BOTH consumers, from one rule.
#
# ⚠⚠ WHAT WAS SILENT. The chain DSP publishes a load failure as a readable param
# (`synth_error` on the slot, `<component>:error` elsewhere) and the host has
# always checked it before opening an editor. dAVEBOx draws its own screens and
# never asked: a generator that could not find its assets handed you a full
# editor whose knobs moved and whose sound never arrived, with no message
# anywhere. Same shape as live_preview and #427 — a rule only the first consumer
# had.
#
# ⚠ THE FAIL-OPEN DIRECTION IS THE LOAD-BEARING PART. "" and an unserved key are
# HEALTHY. If "I could not read it" counted as a failure, a host that does not
# implement the key would make every module uneditable — which is a far worse
# bug than the one being fixed.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { componentErrorKey, readComponentError }
  from "./src/shared/component_error.mjs";
import { readFileSync } from "node:fs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };

/* ---- the keys, including the one that is deliberately irregular --------- */
ok(componentErrorKey("synth") === "synth_error",
   "the generator publishes at the SLOT level (synth_error), not synth:error");
ok(componentErrorKey("fx1") === "fx1:error", "an fx component namespaces its own");
ok(componentErrorKey("midi_fx1") === "midi_fx1:error", "so does a midi fx");
ok(componentErrorKey("") === null && componentErrorKey(null) === null,
   "no component, no key");

/* ---- healthy must stay healthy ----------------------------------------- */
const healthy = [["an empty value (never failed)", () => ""],
                 ["a key nobody serves (null)", () => null],
                 ["a key nobody serves (undefined)", () => undefined],
                 ["whitespace only", () => "   "],
                 ["a reader that THROWS", () => { throw new Error("no such binding"); }]];
for (const [what, io] of healthy) {
  ok(readComponentError(io, "synth") === null,
     "healthy: " + what + " does not read as a failure");
}
ok(readComponentError(null, "synth") === null, "no reader at all is not a failure");

/* ---- and a real failure is reported verbatim ---------------------------- */
{
  const msg = "UI buffer overflow";
  ok(readComponentError(() => msg, "synth") === msg, "a real error comes back as itself");
  ok(readComponentError(() => "  padded  ", "fx1") === "padded", "and trimmed");
}

/* ---- ONE RULE: both consumers must go through it ----------------------- */
{
  const host = readFileSync("src/shadow/shadow_ui.js", "utf8");
  const dbx  = readFileSync("davebox/ui/ui_sound.mjs", "utf8");

  ok(host.includes("readComponentError"), "the HOST reads through the shared rule");
  ok(dbx.includes("readComponentError"), "dAVEBOx reads through the shared rule");

  /* ⭐ The point of the exercise: neither may re-derive the key. A second
   * spelling is how the two drift, and the drift is invisible — a key nobody
   * serves answers "" and reads as healthy. */
  for (const [name, src] of [["shadow_ui.js", host], ["ui_sound.mjs", dbx]]) {
    const q = String.fromCharCode(34, 39, 96);   /* the three quote chars */
    const literal = new RegExp(
      "getSlotParam\\([^)]*,\\s*" + String.fromCharCode(34) + "synth_error"
      + String.fromCharCode(34) + "\\)|[" + q + "][a-z0-9_]+:error[" + q + "]").test(src);
    ok(!literal, name + " does not spell an error key itself");
  }

  /* And davebox must actually REFUSE, not merely read. A read whose result is
   * discarded is the same silence with more code. */
  ok(/const err = componentError\(comp\);[\s\S]{0,200}?return;/.test(dbx),
     "dAVEBOx refuses to open the editor when the component reports a failure");
}

console.log(fail === 0 ? "PASS: one error rule, both consumers, fails open" : "FAIL (" + fail + ")");
process.exit(fail === 0 ? 0 : 1);
'
