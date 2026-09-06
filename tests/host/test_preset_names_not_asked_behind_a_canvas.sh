#!/usr/bin/env bash
# `presetNames` is a hook with an AUDIBLE side effect. It is only asked when
# its answer can be drawn.
#
# ⚠⚠ The host that answers it (davebox, ui_sound.mjs ensureBakedNames) learns
# the names by WALKING the presets, and on this device walking them LOADS each
# one — you hear it. So the hook is not a getter and cannot be hoisted out of
# the branch that uses it. A module that draws its OWN preset browser
# (a canvas page declaring `preset_browser`) outranks the name list; computing
# the names above that branch, which is how a three-way precedence reads most
# naturally, starts the audible walk behind a screen that then throws the
# answer away.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";
import { createFramebuffer, drawContext } from "./tools/param-pages/harness.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };

const FACE = { key: "face", name: "Face", type: "canvas",
               canvas_script: "canvas.js", as_page: true, preset_browser: true };
const BASE = [{ key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 },
              { key: "preset_index", name: "Preset", type: "int", min: 0, max: 9 },
              { key: "preset_count", name: "Count", type: "int", min: 0, max: 99 },
              { key: "preset_name", name: "Name", type: "string" }];

function run({ withCanvas }) {
  const params = withCanvas ? BASE.concat([FACE]) : BASE.slice();
  const hier = { modes: null, levels: { root: {
    label: "T", knobs: ["cutoff"],
    list_param: "preset_index", count_param: "preset_count", name_param: "preset_name",
    params: params.map((p) => ({ key: p.key })) } } };
  const store = { cutoff: "0.5", preset_index: "2", preset_count: "10",
                  preset_name: "Fish", face: "0" };
  const asked = [];
  let clock = 1000;
  const ctl = createController({
    getParam: (k) => {
      const b = String(k).replace(/^[^:]+:/, "");
      if (b === "ui_hierarchy") return JSON.stringify(hier);
      if (b === "chain_params") return JSON.stringify(params);
      return b in store ? store[b] : "";
    },
    setParam: (k, v) => { store[String(k).replace(/^[^:]+:/, "")] = String(v); },
    announce: () => {}, now: () => clock,
    /* The side effect, counted. A real host loads every preset here. */
    presetNames: (page, o) => { asked.push(o); return ["A", "B", "C"]; },
  });
  ctl.setLayout(LAYOUT_MOVY);
  ctl.load({ prefix: "synth" });
  for (let i = 0; i < 24; i++) { clock += 20; ctl.tick(); }

  /* Walk to the preset page. */
  const idx = ctl.pages.findIndex((p) => p.kind === "preset");
  if (idx < 0) return { asked, found: false, canvas: false };
  ctl.goToPage(idx); clock += 20; ctl.tick();
  const canvas = !!(ctl.page && ctl.page.canvas);

  const fb = createFramebuffer();
  const g = { print: fb.print, fill_rect: fb.fillRect, set_pixel: fb.setPixel,
              text_width: fb.textWidth, host_send_screenreader: () => {} };
  const names = Object.keys(g);
  for (const k of names) globalThis[k] = g[k];
  try { ctl.render(drawContext(fb), { title: "T" }); }
  finally { for (const k of names) delete globalThis[k]; }
  return { asked, found: true, canvas };
}

const plain = run({ withCanvas: false });
ok(plain.found, "control: a level with list_param + count_param plans a preset page");
ok(!plain.canvas, "control: without a declared canvas the page has none");
/* ⚠ CONTROL. If the hook were never called at all, the assertion below would
 * pass on a controller that had simply dropped the fork tweak. */
ok(plain.asked.length > 0,
   "control: a stock preset page DOES ask for the names (the fork tweak still works)");

const drawn = run({ withCanvas: true });
ok(drawn.found && drawn.canvas, "control: the declared canvas becomes the preset page");
ok(drawn.asked.length === 0,
   "a module-drawn browser does NOT ask for the names — got " + drawn.asked.length + " call(s)");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: presetNames is asked only when its answer can be drawn");
'
