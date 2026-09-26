#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# A HIGHLIGHT DECORATION KEEPS THE MODULE GRAPHICS; A LOCK STANDS THEM DOWN.
#
# A sequencer decorates a slot two ways. `locked` draws a 2x2 corner, and a
# graphic spanning several cells could hide which of them carries it, so the
# controller takes graphics down while a lock is decorated. `highlight` draws
# the cell as held -- in the label strip, which no graphic covers -- so it
# must NOT take them down. It used to: ANY decoration flattened the page, and
# a jump from an automation lane to a filter cutoff landed on plain knobs with
# the filter curve and the envelope gone (device, 2026-09-26).
#
# Measured as pixel differences against the undecorated frame: the lock frame
# differs where the graphic went (the CONTROL that a graphic is on the page at
# all); the highlight frame must differ from the plain one almost nowhere the
# lock frame does, and must differ somewhere (the highlight is visible).
#
# NO APOSTROPHES inside the node script (single-quoted bash string).

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required for the highlight/viz test" >&2
  exit 1
fi

node --input-type=module -e '
import { createController, LAYOUT_MOVY } from "./src/shared/param_pages/page_controller.mjs";
import { createFramebuffer, drawContext } from "./tools/param-pages/harness.mjs";

let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + ": " + m); if (!c) fail++; };

const CP = [
  { key: "cutoff",    name: "Cutoff",    type: "float", min: 0, max: 1, step: 0.01 },
  { key: "resonance", name: "Res",       type: "float", min: 0, max: 1, step: 0.01 },
  { key: "filter_type", name: "Type",    type: "enum",
    options: ["LP12", "LP24", "HP12", "HP24", "BP", "Notch"] },
  { key: "drive",     name: "Drive",     type: "float", min: 0, max: 1, step: 0.01 },
];
const H = { modes: null, levels: { root: { label: "F",
  knobs: ["cutoff", "resonance", "filter_type", "drive"],
  params: CP.map((p) => ({ key: p.key })) } } };

function paint(decorations) {
  let clock = 1000;
  const store = { cutoff: "0.5", resonance: "0.2", filter_type: "0", drive: "0.1" };
  const ctl = createController({
    getParam: (k) => {
      const b = String(k).replace(/^[^:]+:/, "");
      if (b === "ui_hierarchy") return JSON.stringify(H);
      if (b === "chain_params") return JSON.stringify(CP);
      return b in store ? store[b] : "";
    },
    setParam: () => {}, announce: () => {}, now: () => clock,
  });
  ctl.setLayout(LAYOUT_MOVY);
  ctl.load({ prefix: "synth" });
  for (let i = 0; i < 24; i++) { clock += 20; ctl.tick(); }
  const vizCount = ctl.vizGroups().length;
  ctl.setDecorations(decorations);
  const fb = createFramebuffer();
  const g = { print: fb.print, fill_rect: fb.fillRect, set_pixel: fb.setPixel,
              text_width: fb.textWidth, host_send_screenreader: () => {} };
  for (const k of Object.keys(g)) globalThis[k] = g[k];
  try { ctl.render(drawContext(fb), { title: "T" }); }
  finally { for (const k of Object.keys(g)) delete globalThis[k]; }
  return { ascii: fb.toAscii(), vizCount };
}
const diff = (a, b) => { const s = new Set(); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) s.add(i); return s; };

const plain = paint(null);
ok(plain.vizCount > 0, "control: the fixture page has a graphic");
const lockSlot = paint({ 0: { locked: true } });
const hiSlot   = paint({ 0: { highlight: true } });
const hiVal    = paint({ 0: { highlight: true, value: "0.9" } });

const L = diff(plain.ascii, lockSlot.ascii);
ok(L.size > 40, "control: a LOCK stands the graphic down (" + L.size + " px changed)");
for (const [name, f] of [["highlight", hiSlot], ["highlight + value", hiVal]]) {
  const Hd = diff(plain.ascii, f.ascii);
  let both = 0; for (const i of Hd) if (L.has(i)) both++;
  ok(Hd.size > 0, name + ": the highlight is visible (" + Hd.size + " px)");
  ok(both < L.size * 0.2, name + ": the graphic STAYS -- only " + both + " of the " + L.size
     + " px a lock changes also changed");
}

if (fail) { console.log("FAIL: " + fail); process.exit(1); }
console.log("PASS: a highlight keeps module graphics; a lock stands them down");
'
