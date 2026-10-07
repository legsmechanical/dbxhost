#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# TWO THINGS A MODULE-DRAWN PAGE MAY ASK FOR (ports of upstream #598 and #597):
#
#   page_first: true   the canvas page is planned BEFORE its level's knob grid,
#                      so a module whose drawn page is what you open it for
#                      lands you on it. It still carries the level's knobs.
#   extra_keys         are read on the page's rotation EVEN WHEN THE LEVEL HAS
#                      NO KNOBS. The rotation used to return before reading
#                      anything on a knobless page, so its picture was drawn
#                      from values nobody ever fetched.
#
# The blocks are upstream's, from its tests/host/test_canvas_page.sh.
#
# NO APOSTROPHES inside the node script: it is a single-quoted bash string.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2
  exit 1
fi

node --input-type=module -e '
const R = process.cwd();
const { planPages } = await import(R + "/src/shared/param_pages/page_plan.mjs");
const { createController, LAYOUT_MOVY } = await import(R + "/src/shared/param_pages/page_controller.mjs");

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); fails++; } };

const CP = [
  { key: "a", name: "A", type: "float", min: 0, max: 1, step: 0.01 },
  { key: "b", name: "B", type: "float", min: 0, max: 1, step: 0.01 },
  { key: "face", name: "Face", type: "canvas", canvas_script: "canvas.js",
    canvas_overlay: "face_page", as_page: true, extra_keys: ["activity"] },
];

/* ---- page_first: a canvas page can LEAD its level ---- */
{
  const H1 = { levels: { root: { name: "R", knobs: ["a", "b"], params: ["face", "a", "b"] } } };
  const lead = (on) => CP.map((p) => (p.key === "face" ? { ...p, page_first: on } : p));
  const first = planPages({ hierarchy: H1, chainParams: lead(true) }).pages;
  ok(first[0] && first[0].canvas && first[0].canvas.key === "face",
     "page_first puts the canvas page before the levels grid");
  ok(first[0] && JSON.stringify(first[0].keys) === JSON.stringify(["a", "b"]),
     "and it still carries the levels knobs");
  ok(first.filter((p) => p.canvas).length === 1, "and is planned exactly once");
  ok(first[1] && !first[1].canvas && JSON.stringify(first[1].keys) === JSON.stringify(["a", "b"]),
     "with the grid after it");
  const after = planPages({ hierarchy: H1, chainParams: lead(false) }).pages;
  ok(after[0] && !after[0].canvas && after[1] && after[1].canvas,
     "control: without it the grid still comes first");
}

/* ---- a canvas page with NO knobs still reads its extra_keys ---- */
{
  const HIER0 = { levels: {
    root: { name: "R", knobs: [], params: [{ level: "radio", label: "Radio" }, { level: "ctl", label: "Controls" }] },
    radio: { name: "Radio", params: ["browse"], knobs: [] },
    ctl: { name: "Controls", params: ["a"], knobs: ["a"] } } };
  const CP0 = [
    { key: "browse", name: "Browse", type: "canvas", canvas_script: "b.js",
      as_page: true, enterable: true, extra_keys: ["status"] },
    { key: "a", name: "A", type: "float", min: 0, max: 1, step: 0.01 },
  ];
  const plan0 = planPages({ hierarchy: HIER0, chainParams: CP0 });
  ok(plan0.pages[0] && plan0.pages[0].canvas && plan0.pages[0].keys.length === 0,
     "a knobless canvas level plans as the FIRST page, with no keys");
  const store = { ui_hierarchy: JSON.stringify(HIER0), chain_params: JSON.stringify(CP0),
                  a: "0.5", status: "streaming" };
  let t = 0;
  const ctrl = createController({
    getParam: (k) => { const b = String(k).split(":").pop();
                       return store[b] === undefined ? null : store[b]; },
    setParam: () => true, announce: () => {}, now: () => (t += 16),
  });
  ctrl.load({ prefix: "synth" });
  ctrl.setLayout(LAYOUT_MOVY);
  ctrl.goToPage(0, { remember: false });
  for (let i = 0; i < 20; i++) ctrl.tick();
  ok(ctrl.onCanvasPage(), "the knobless canvas page is the current page");
  ok(ctrl.state.values.status === "streaming",
     "its extra key is read even though the page has no knob");
  store.status = "buffering";
  for (let i = 0; i < 20; i++) ctrl.tick();
  ok(ctrl.state.values.status === "buffering", "and it stays live");
}

if (fails) { console.error(fails + " failure(s)"); process.exit(1); }
console.log("PASS: a canvas page can lead its level, and reads its extra keys with no knobs");
'
