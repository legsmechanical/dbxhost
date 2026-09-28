#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A GATE RE-PLAN MUST NOT KEEP THE PREVIOUS KEY LIST'S GRAPHICS.
#
# The controller caches a page's resolved graphics. Its key named the
# fingerprint, the page, the focused child and the widget generation -- not
# the page's KEYS. A visible_if gate that moves with the focused child (a pad
# that is a sample on one pad and a synth on the next) re-plans the page in
# place: same page index, same fingerprint, same child. So when the focus move
# reached a render BEFORE the gate read did -- they are read on different
# ticks -- the cache filled with the old key list under the new child, and the
# re-plan was then handed those groups: labels on the new layout, graphics on
# the old one, until some other pad busted the cache (device, 2026-09-28).
#
# Fixture: one child level, two voices. Voice 0 is kind 0 and shows an
# envelope over attack/decay; voice 1 is kind 1 and hides them. The gate is a
# module-wide key on no level. Every graphic the controller hands back must
# name only keys the page carries, after every focus move.
#
# NO APOSTROPHES inside the node script (single-quoted bash string).

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required for the viz-cache test" >&2
  exit 1
fi

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";
import { evaluateVisibility } from "./src/shared/param_pages/visibility.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + ": " + m); if (!c) fail++; };

const gate = { param: "kind", equals: "0" };
const P = [
  { key: "sel",    name: "Voice",  type: "int",   min: 0, max: 1 },
  { key: "attack", name: "Attack", type: "float", min: 0, max: 1, visible_if: gate,
    viz: { group: "amp", role: "attack" } },
  { key: "decay",  name: "Decay",  type: "float", min: 0, max: 1, visible_if: gate,
    viz: { group: "amp", role: "decay" } },
  { key: "level",  name: "Level",  type: "float", min: 0, max: 1 },
];
const H = { modes: null, levels: {
  root: { label: "Voices", knobs: [], params: [], children: "voice" },
  voice: { label: "Voice", child_prefix: "v", child_count: 2, child_index_param: "sel",
           child_key_overrides: { sel: "sel" },
           knobs: ["sel", "attack", "decay", "level"], params: P },
} };
const KIND = ["0", "1"];
const store = { sel: "0" };
const getParam = (k) => {
  const b = String(k).replace(/^[^:]+:/, "");
  if (b === "ui_hierarchy") return JSON.stringify(H);
  if (b === "chain_params") return JSON.stringify(P.map(({ visible_if, viz, ...e }) => e));
  if (b === "kind") return KIND[+store.sel];
  if (b in store) return store[b];
  return /^v[0-9]+_/.test(b) ? "0.5" : "";
};
let clock = 1000;
const ctl = createController({ getParam, setParam: () => {}, announce: () => {}, now: () => clock });
ctl.setLayout(LAYOUT_MOVY);
ctl.load({ prefix: "synth", visible: (cond, lvl) =>
  evaluateVisibility({ prefix: "synth", getParam, childIndexOf: () => +store.sel }, cond, lvl) });
const pi = ctl.state.pages.findIndex((p) => (p.keys || []).includes("level"));
ok(pi >= 0, "control: the voice page is planned");
ctl.goToPage(pi, { remember: false });
/* One frame = tick then draw, as every host does; the draw is what fills the cache. */
const frames = (n) => { for (let i = 0; i < n; i++) { clock += 16; ctl.tick(); ctl.vizGroups(); } };
const check = (label, wantEnv) => {
  const keys = ctl.page.keys;
  const groups = ctl.vizGroups();
  const stray = groups.flatMap((g) => g.keys || []).filter((k) => !keys.includes(k));
  const env = groups.some((g) => g.kind === "envelope");
  ok(stray.length === 0, label + ": every graphic names a key on the page (stray: " + stray.join(",") + ")");
  ok(env === wantEnv, label + ": envelope " + (wantEnv ? "shown" : "gone"));
};

frames(40); check("voice 0 (kind 0)", true);
ok(ctl.page.keys.includes("attack"), "control: kind 0 carries the gated keys");
store.sel = "1"; frames(40); check("to voice 1 (kind 1)", false);
ok(!ctl.page.keys.includes("attack"), "control: the gate re-planned the page");
store.sel = "0"; frames(40); check("back to voice 0", true);
process.exit(fail ? 1 : 0);
'
