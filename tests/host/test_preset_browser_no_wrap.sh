#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# The editors preset browser stops at both ends.
#
# No list wraps: menus, pickers and enums all clamp. The in-grid preset page
# (a level that declares list_param: click into it, the jog walks the presets)
# was the exception -- past the last preset it loaded the first, and back from
# the first it loaded the last. On a long bank that is a jump across the whole
# list with no way to tell it happened except by ear.
#
# A turn past either end must also WRITE nothing: a write is a preset load.
#
# NO APOSTROPHES inside the node script: it is a single-quoted bash string.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2
  exit 1
fi

node --input-type=module -e '
const R = process.cwd();
const PC = await import(R + "/src/shared/param_pages/page_controller.mjs");
const { PAGE_PRESET } = await import(R + "/src/shared/param_pages/page_plan.mjs");

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } };

const HIER = { levels: { root: {
  name: "Main",
  list_param: "preset", count_param: "preset_count", name_param: "preset_name",
  knobs: ["ratio"], params: [{ key: "ratio" }] } } };
const CP = [
  { key: "ratio",  name: "Ratio",  type: "float", min: 0, max: 1, step: 0.01 },
  { key: "preset", name: "Preset", type: "int", min: 0, max: 31 },
];
const dev = { preset: "0", preset_count: "3", preset_name: "p0", ratio: "0.50" };
const writes = [];
const io = {
  getParam: (k) => {
    const key = k.replace(/^synth:/, "");
    if (key === "ui_hierarchy") return JSON.stringify(HIER);
    if (key === "chain_params") return JSON.stringify(CP);
    if (key === "is_loading") return "0";
    if (key === "module") return "threepresets";
    return key in dev ? dev[key] : null;
  },
  setParam: (k, v) => {
    const key = k.replace(/^synth:/, "");
    dev[key] = String(v);
    writes.push([key, String(v)]);
    if (key === "preset") dev.preset_name = "p" + v;
  },
  announce: () => {}, now: () => Date.now(),
};

const c = PC.createController(io);
c.load({ slot: 0, component: "synth", prefix: "synth" });
c.setLayout("movy");
const spin = (n) => { for (let i = 0; i < n; i++) c.tick(); };
spin(60);
const presetPage = c.pages.findIndex((p) => p.kind === PAGE_PRESET);
ok(presetPage >= 0, "declaring list_param plans an in-grid preset page");
if (fails) process.exit(1);
c.goToPage(presetPage); spin(10);
c.onClick(); spin(5);                       /* the page is a door: click into it */
const presetWrites = () => writes.filter(([k]) => k === "preset").map(([, v]) => v);
const jog = (d) => { c.onJog(d); spin(10); };

/* control: the jog does walk the list here, or the rest proves nothing */
writes.length = 0;
jog(1);
ok(dev.preset === "1" && presetWrites().length === 1, "control: one detent up loads preset 1, got " + dev.preset);
jog(-1);
ok(dev.preset === "0", "control: one detent down loads preset 0, got " + dev.preset);

/* back from the FIRST preset: stays, and loads nothing */
writes.length = 0;
jog(-1); jog(-1);
ok(dev.preset === "0", "turning back from the first preset landed on " + dev.preset + " (the last = it wrapped)");
ok(presetWrites().length === 0, "turning back from the first preset wrote " + JSON.stringify(presetWrites()));

/* up to the LAST, then past it: stays, and loads nothing */
jog(1); jog(1);
ok(dev.preset === "2", "setup: two detents up reach the last preset, got " + dev.preset);
writes.length = 0;
jog(1); jog(1);
ok(dev.preset === "2", "turning on from the last preset landed on " + dev.preset + " (the first = it wrapped)");
ok(presetWrites().length === 0, "turning on from the last preset wrote " + JSON.stringify(presetWrites()));

/* and the end is not sticky */
jog(-1);
ok(dev.preset === "1", "one detent back from the last preset, got " + dev.preset);

if (fails) process.exit(1);
console.log("PASS: the preset browser stops at both ends");
'
