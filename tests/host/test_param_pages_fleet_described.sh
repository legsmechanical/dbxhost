#!/usr/bin/env bash
# EVERY MODULE, EVERY PAGE, DESCRIBED (Josh, 2026-11-10: "we need to make sure
# we have full grid module coverage" -- and "when knobs do something, they
# should always be shown and labeled"). The Screen view draws what
# describePage says; a page the controller lets you turn knobs on, but that
# describePage does not describe, is a surface where the knobs work and the
# browser shows nothing. MonkSynth's Face was one (a module-drawn preset browser
# that carries keys) until 2026-11-10.
#
# For every captured module in the fleet fixture (tests/fixtures/
# module-contracts.json), on every page the controller plans:
#   - a page whose knobs act (it carries keys, and is a knob page or a page the
#     module draws itself) describes a NAMED cell for every key it carries;
#   - a list page (menu, items, preset browser) is described as a list.
# It reports what it walked, and what it could not, beside the result.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node is required (test_param_pages_fleet_described)" >&2; exit 1; }
node --input-type=module - <<'JS'
import * as C from "./src/shared/param_pages/page_controller.mjs";
import { fleet, createFakeDevice } from "./tools/param-pages/fake_device.mjs";
const LISTS = new Set(["menu", "items", "preset"]);
const bad = [], skipped = [];
let mods = 0, pages = 0, knobPages = 0, listPages = 0, drawn = 0;
for (const m of fleet().modules) {
  /* a module with no hierarchy still gets pages from its params: the controller decides */
  if (m.status !== "ok") { skipped.push(m.id + " (" + m.status + ")"); continue; }
  const comp = m.component_key || "synth";
  let dev;
  try { dev = createFakeDevice({ id: m.id, prefix: comp }); } catch (e) { skipped.push(m.id + " (no fake device: " + e.message + ")"); continue; }
  const ctl = C.createController({ getParam: dev.getParam, setParam: dev.setParam, announce: () => {}, now: () => 0 });
  ctl.load({ slot: 0, component: comp });
  for (let i = 0; i < 16; i++) ctl.tick();
  if (!ctl.pages || !ctl.pages.length) { skipped.push(m.id + " (no pages planned)"); continue; }
  mods++;
  for (let i = 0; i < ctl.pages.length; i++) {
    ctl.goToPage(i, { remember: false });
    const p = ctl.page, vm = ctl.describePage({ title: m.id });
    pages++;
    const where = m.id + " page " + i + " \"" + (p && p.name) + "\" (" + (p && p.kind) + (p && p.canvas ? ", module-drawn" : "") + ")";
    if (p && p.canvas) drawn++;
    const keys = p && Array.isArray(p.keys) ? p.keys.filter(Boolean) : [];
    const acts = keys.length && (p.kind === "knobs" || p.canvas);
    if (acts) {
      knobPages++;
      const named = new Map((vm.cells || []).filter(Boolean).map((c) => [c.key, c.name]));
      const missing = keys.filter((k) => !named.has(k) || !String(named.get(k) || "").trim());
      if (missing.length) bad.push(where + ": knobs act on " + missing.join(", ") + " but are not described with a name");
    }
    if (p && LISTS.has(p.kind)) {
      listPages++;
      if (!vm.list || !Array.isArray(vm.list.rows)) bad.push(where + ": a list page not described as a list");
    }
  }
}
console.log("  walked " + mods + " modules, " + pages + " pages: " + knobPages + " where knobs act, " + listPages + " lists, " + drawn + " drawn by the module");
console.log("  skipped " + skipped.length + (skipped.length ? ": " + skipped.join(", ") : ""));
if (mods < 50) { console.log("FAIL: too few modules walked (" + mods + ") -- the fixture or the walk is broken"); process.exit(1); }
if (bad.length) { console.log(bad.map((b) => "  FAIL -- " + b).join("\n")); console.log("FAIL: test_param_pages_fleet_described (" + bad.length + ")"); process.exit(1); }
console.log("PASS: test_param_pages_fleet_described");
JS
