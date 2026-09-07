#!/usr/bin/env bash
# An AUTOMATED param must not be read like a MODULATED one.
#
# ⚠⚠ THE BUG THIS PINS COST A LIVE TAKE, and it was invisible because nothing
# was wrong on screen. `s.modCache[key]` is a TRI-STATE: davebox writes the
# STRING "auto" / "auto-off" into the slot the library stores a boolean in, to
# mark a param its own automation is recording. Two sites then read that slot as
# a FLAG, and `"auto"` is truthy:
#
#   · the value cursor asked `<key>:base` — served only while a MODULATION
#     target is active, so for an automated param it MISSES, comes back "", and
#     falls through to a second read of the plain key. Two SPI round trips
#     (~2.9 ms each) where one would do.
#   · refreshModulatedValues asked `<key>:effective` EVERY TICK, forever, for a
#     value no source is driving.
#
# Josh, from the device: playing automation stalls while you operate the params.
# noisemaker's Wave macro is the worst case, because one automated param marks
# many as driven.
#
# ⭑ MEASURED, NOT SPELLED. The observable is the KEYS THE CONTROLLER ASKS FOR,
# counted over the same number of ticks for each answer — a grep for `=== true`
# would pass on a controller that had stopped reading anything at all.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };

const PARAMS = [{ key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 }];
const HIER = { modes: null,
  levels: { root: { label: "T", knobs: ["cutoff"], params: [{ key: "cutoff" }] } } };

/* Run the real controller for a fixed number of ticks and hand back every key
 * it asked the device for. */
function readsFor(answer, ticks = 40) {
  const asked = [];
  let clock = 1000;
  const ctl = createController({
    getParam: (k) => {
      const b = String(k).replace(/^[^:]+:/, "");
      if (b === "ui_hierarchy") return JSON.stringify(HIER);
      if (b === "chain_params") return JSON.stringify(PARAMS);
      asked.push(b);
      /* ⚠ `:base` and `:effective` answer EMPTY, which is what the device does
       * for a key nobody serves — an automated param has no modulation target,
       * so there is nothing behind either subkey. A stub that answered them
       * would hide the second read the miss provokes. */
      if (b.indexOf(":") >= 0) return "";
      if (b === "cutoff") return "0.5";
      return "";
    },
    setParam: () => {},
    announce: () => {},
    now: () => clock,
    isModulated: () => answer,
  });
  ctl.setLayout(LAYOUT_MOVY);
  ctl.load({ prefix: "synth" });
  for (let i = 0; i < ticks; i++) { clock += 20; ctl.tick(); }
  return asked;
}
const count = (list, k) => list.filter((x) => x === k).length;

const plain = readsFor(false);
const modul = readsFor(true);
const auto  = readsFor("auto");
const off   = readsFor("auto-off");

/* ⚠ CONTROLS FIRST. Without them every assertion below passes on a controller
 * that reads nothing at all, which is the failure these are meant to exclude. */
ok(count(plain, "cutoff") > 0, "control: a plain param IS read");
ok(count(modul, "cutoff:base") > 0,
   "control: a genuinely MODULATED param still asks for its base");
ok(count(modul, "cutoff:effective") > 0,
   "control: ...and for the value its source is driving, every tick");

ok(count(auto, "cutoff:base") === 0,
   "an AUTOMATED param asks for no `:base` — nothing serves it (" +
   count(auto, "cutoff:base") + ")");
ok(count(auto, "cutoff:effective") === 0,
   "...and for no `:effective` either (" + count(auto, "cutoff:effective") + ")");
ok(count(off, "cutoff:base") === 0 && count(off, "cutoff:effective") === 0,
   "the same for `auto-off` — it is the same string slot");
ok(count(auto, "cutoff") > 0,
   "control: it is still read by its own name — the value has not gone dark");

/* The whole point, as a number. */
ok(auto.length < modul.length,
   "an automated param costs FEWER device reads than a modulated one (" +
   auto.length + " vs " + modul.length + ")");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: an automated param is not read like a modulated one");
'
