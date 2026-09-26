#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# restorePage(null, { key }) with a REPEATED element's concrete key.
#
# An automation lane is keyed by the concrete param (pad2_transpose), while
# the page lists the bare key (transpose) and addresses whichever element is
# selected. Landing "on the page holding pad2_transpose" must therefore pick
# that page AND select element 2 -- landing on the page with element 0
# selected would put the knob on a different pad's parameter.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required for the restore-child-key tests" >&2
  exit 1
fi

node -e '
import("./src/shared/param_pages/page_controller.mjs").then((C) => {
  const fail = (msg) => { console.log("FAIL: " + msg); process.exit(1); };
  const contract = (withIdx) => ({
    "synth:chain_params": JSON.stringify([
      { key: "master", name: "Master", type: "float", min: 0, max: 1, step: 0.01 },
      { key: "tune", name: "Tune", type: "float", min: 0, max: 1, step: 0.01 },
      { key: "transpose", name: "Transpose", type: "int", min: -48, max: 48 },
    ]),
    "synth:ui_hierarchy": JSON.stringify({
      modes: null,
      levels: {
        root: { label: "Kit", knobs: ["master"], params: [{ key: "master", label: "Master" }, { level: "pads", label: "Pads" }] },
        pads: Object.assign({ label: "Pad", child_prefix: "pad", child_count: 4, knobs: ["tune", "transpose"],
                              params: [{ key: "tune", label: "Tune" }, { key: "transpose", label: "Transpose" }] },
                            withIdx ? { child_index_param: "ui_current_pad" } : {}),
      },
    }),
  });
  const run = (withIdx) => {
    const c = contract(withIdx);
    const writes = [];
    const values = { "synth:ui_current_pad": "0" };
    const ctl = C.createController({
      getParam: (k) => (k in c ? c[k] : (k in values ? values[k] : "0")),
      setParam: (k, v) => { writes.push([k, String(v)]); values[k] = String(v); },
    });
    ctl.load({ slot: 0, component: "synth" });
    for (let i = 0; i < 8; i++) ctl.tick();
    ctl.restorePage(null, { key: "pad2_transpose" });
    for (let i = 0; i < 4; i++) ctl.tick();
    const pg = ctl.page;
    if (!pg || (pg.keys || []).indexOf("transpose") < 0)
      fail((withIdx ? "[idx] " : "") + "did not land on the page holding transpose: " + JSON.stringify(pg && pg.keys));
    writes.length = 0;
    let t = 1000;
    const slot = pg.keys.indexOf("transpose");
    for (let i = 0; i < 4; i++) ctl.onKnobTurn(slot, 1, (t += 30));
    const w = writes.filter(([k]) => /transpose$/.test(k));
    if (!w.length) fail((withIdx ? "[idx] " : "") + "turning the knob wrote nothing: " + JSON.stringify(writes));
    if (w[w.length - 1][0] !== "synth:pad2_transpose")
      fail((withIdx ? "[idx] " : "") + "the knob addresses " + w[w.length - 1][0] + ", not synth:pad2_transpose");
    return values;
  };
  run(false);
  const v = run(true);
  if (v["synth:ui_current_pad"] !== "2") fail("the module-owned focus was not told: ui_current_pad = " + v["synth:ui_current_pad"]);
  /* CONTROL: a bare key still lands, with the selection untouched. */
  {
    const c = contract(false);
    const ctl = C.createController({ getParam: (k) => (k in c ? c[k] : "0"), setParam: () => {} });
    ctl.load({ slot: 0, component: "synth" });
    for (let i = 0; i < 8; i++) ctl.tick();
    ctl.restorePage(null, { key: "master" });
    if ((ctl.page.keys || []).indexOf("master") < 0) fail("CONTROL: a bare key no longer lands");
  }
  console.log("PASS: restorePage lands a repeated element'"'"'s concrete key on its page and element");
}).catch((e) => { console.log("FAIL: " + (e && e.stack || e)); process.exit(1); });
'
