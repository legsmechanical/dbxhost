#!/usr/bin/env bash
# The automation mark must survive the CONTROLLER, not just the renderer.
#
# ⚠⚠ WHY THIS TEST EXISTS, AND WHY THE ONE BESIDE IT WAS NOT ENOUGH.
# `test_param_pages_auto_mark.sh` calls drawLabelCell DIRECTLY with "auto" and
# proves the renderer draws a circle for it. It passed for months while the
# circle could not reach the screen at all: the controller handed the renderer
# `!!s.modCache[key]`, and `!!"auto"` is `true` — the TILDE. So every param
# davebox automates wore "an LFO is routed here", which is false, and the ON and
# OFF states were indistinguishable. Two green tests, one real screen, no
# overlap between them. The seam is the thing that has to be pinned.
#
# It drives the real controller with an io whose isModulated answers the
# tri-state, renders, and asserts the four answers paint four different cells.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";
import { createFramebuffer, drawContext } from "./tools/param-pages/harness.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "FAIL ") + " — " + m); if (!c) fail++; };

const PARAMS = [{ key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 }];
const HIER = { modes: null,
  levels: { root: { label: "T", knobs: ["cutoff"], params: [{ key: "cutoff" }] } } };

/* One controller per answer, so nothing carries over between renders. */
function paintWith(answer) {
  let clock = 1000;
  const ctl = createController({
    getParam: (k) => {
      const b = String(k).replace(/^[^:]+:/, "");
      if (b === "ui_hierarchy") return JSON.stringify(HIER);
      if (b === "chain_params") return JSON.stringify(PARAMS);
      if (b === "cutoff" || b.startsWith("cutoff:")) return "0.5";
      return "";
    },
    setParam: () => {},
    announce: () => {},
    now: () => clock,
    /* The host under test: davebox answers a STRING here when its own
     * automation owns the param, and a boolean otherwise (ui_sound.mjs
     * isModulated). */
    isModulated: () => answer,
  });
  /* The movy layout is the one davebox draws with (binding_movy); the dial
   * layout renders through render_page.mjs, which has no automation mark at
   * all and would make this test pass for the wrong reason. */
  ctl.setLayout(LAYOUT_MOVY);
  ctl.load({ prefix: "synth" });
  for (let i = 0; i < 24; i++) { clock += 20; ctl.tick(); }
  const fb = createFramebuffer();
  const g = { print: fb.print, fill_rect: fb.fillRect, set_pixel: fb.setPixel,
              text_width: fb.textWidth, host_send_screenreader: () => {} };
  const names = Object.keys(g);
  for (const k of names) globalThis[k] = g[k];
  try { ctl.render(drawContext(fb), { title: "T" }); }
  finally { for (const k of names) delete globalThis[k]; }
  return fb.toAscii();
}

const none  = paintWith(false);
const tilde = paintWith(true);
const on    = paintWith("auto");
const off   = paintWith("auto-off");

/* ⚠ CONTROL FIRST. If the renderer draws the same cell whatever it is told,
 * every assertion below would pass on a controller that forwards nothing. */
ok(tilde !== none, "control: a modulated param already renders differently from a plain one");

ok(on !== tilde,
   "\"auto\" reaches the cell as a string — it must NOT be collapsed to the tilde");
ok(off !== tilde,
   "\"auto-off\" reaches the cell as a string — it must NOT be collapsed to the tilde");
ok(on !== off,
   "automation ON and OFF paint differently — the two states are distinguishable");
ok(on !== none && off !== none, "both automation states paint something");

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: the tri-state automation mark survives the controller seam");
' 
