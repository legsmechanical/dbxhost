#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# describePage describes a LIST page as a list (page_controller.mjs).
#
# A consumer drawing the module editor its own way (dAVEBOx's Screen view in
# the browser) reads describePage, which used to fill `cells` for knob pages
# only — every other page reached it as a knob page with no knobs, so Presets,
# My Presets, Module and a module's own menus drew as eight empty dials (Josh,
# 2026-11-09: "a number of pages in modules aren't showing up like presets, my
# presets, module, etc."). Pinned here: each list kind's rows as render draws
# them, the jog's row only while entered (-1 inert), and the preset hook asked
# only where render asks it.

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2; exit 1
fi

node -e '
import("./src/shared/param_pages/page_controller.mjs").then((C) => {
  const fail = (m) => { console.log("FAIL: " + m); process.exit(1); };
  const names = ["Fish", "Bass", "Pad"];
  let index = 1, nameAsks = 0, withNames = true;
  const HIER = { modes: null, levels: { root: {
    label: "S", list_param: "preset", count_param: "preset_count", name_param: "preset_name",
    knobs: ["cutoff"], params: [{ key: "cutoff", label: "Cutoff" }] } } };
  const CP = [{ key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01 }];
  const ctl = C.createController({
    getParam: (k) => {
      const b = String(k).replace(/^[^:]+:/, "");
      if (b === "ui_hierarchy") return JSON.stringify(HIER);
      if (b === "chain_params") return JSON.stringify(CP);
      if (b === "preset_count") return String(names.length);
      if (b === "preset") return String(index);
      if (b === "preset_name") return names[index];
      if (b === "cutoff") return "0.5";
      return "";
    },
    setParam: (k, v) => { if (String(k).endsWith(":preset")) index = parseInt(v, 10); },
    announce: () => {},
    presetNames: () => { nameAsks++; return withNames ? names.slice() : null; },
    trailingMenus: () => [{ name: "My Presets", entries: [
      { label: "Preset", value: "Fish *", action: "up_load" },
      { label: "Save As", action: "up_save_as" },
    ] }],
  });
  ctl.load({ slot: 0, component: "synth" });
  for (let i = 0; i < 12; i++) ctl.tick();

  /* a knob page is still cells, and no list */
  let vm = ctl.describePage({ title: "T" });
  if (ctl.page.kind !== "knobs") fail("setup: should land on a grid");
  if (vm.list) fail("a knob page grew a list");
  if (!vm.cells.length) fail("a knob page lost its cells");

  /* the menu page (a trailing menu): inert, then entered */
  const menuAt = ctl.pages.findIndex((p) => p.kind === "menu" && p.name === "My Presets");
  if (menuAt < 0) fail("setup: no My Presets page planned");
  ctl.goToPage(menuAt, { remember: false });
  vm = ctl.describePage({ title: "T" });
  if (!vm.list || vm.list.kind !== "menu") fail("a menu page is not described as a list: " + JSON.stringify(vm.list));
  if (JSON.stringify(vm.list.rows) !== JSON.stringify([{ label: "Preset", value: "Fish *" }, { label: "Save As" }]))
    fail("menu rows wrong: " + JSON.stringify(vm.list.rows));
  if (vm.list.sel !== -1 || vm.list.entered) fail("an inert menu must select nothing: " + JSON.stringify(vm.list));
  if (vm.cells.length) fail("a menu page must carry no cells");
  ctl.onClick(-1);
  ctl.onJog(1);
  vm = ctl.describePage({ title: "T" });
  if (!vm.list.entered || vm.list.sel !== 1) fail("entered + one jog should select row 1: " + JSON.stringify(vm.list));

  /* the preset browser with names: a row per preset, the index as sel once entered */
  ctl.exitMenu();
  const presetAt = ctl.pages.findIndex((p) => p.kind === "preset");
  ctl.goToPage(presetAt, { remember: false });
  for (let i = 0; i < 9; i++) ctl.tick();
  vm = ctl.describePage({ title: "T" });
  if (!vm.list || vm.list.kind !== "preset" || vm.list.rows.length !== 3 || vm.list.rows[0].label !== "Fish")
    fail("a named preset page is not its names: " + JSON.stringify(vm.list));
  if (vm.list.sel !== -1 || vm.list.current !== 1) fail("inert preset list: sel -1, current 1: " + JSON.stringify(vm.list));
  ctl.onClick(-1);
  vm = ctl.describePage({ title: "T" });
  if (vm.list.sel !== 1 || !vm.list.entered) fail("entered preset list should select index 1: " + JSON.stringify(vm.list));

  /* without names: one row, the name and where it is */
  withNames = false;
  vm = ctl.describePage({ title: "T" });
  if (vm.list.rows.length !== 1 || vm.list.rows[0].label !== "Bass" || vm.list.rows[0].value !== "2 of 3")
    fail("an unnamed preset page should be one row \"Bass · 2 of 3\": " + JSON.stringify(vm.list));

  /* a module-drawn browser: the names hook is never asked (it may load each preset) */
  ctl.page.canvas = { path: "x" }; const asked = nameAsks; withNames = true;
  ctl.describePage({ title: "T" });
  if (nameAsks !== asked) fail("presetNames was asked behind a module-drawn browser");
  delete ctl.page.canvas;

  /* the section picker, over any page */
  ctl.exitMenu();
  ctl.goToPage(0, { remember: false });
  if (!ctl.openPicker()) fail("setup: the section picker did not open");
  {
    vm = ctl.describePage({ title: "T" });
    if (!vm.list || vm.list.kind !== "sections" || !vm.list.rows.length || vm.list.sel < 0)
      fail("the open section picker is not described: " + JSON.stringify(vm.list));
  }
  console.log("PASS: test_param_pages_describe_lists");
});
'
