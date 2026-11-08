#!/usr/bin/env bash
# A popped-out module page edits ONE chain component, and the shared remote API
# must hand it that component's structure.
#
# The Sound view (and "open in tab") opens a module's web_ui.html standalone,
# with ?slot=N and, for an effect, ?component=fxK. schwung-remote-api.js used to
# resolve getChainParams()/getHierarchy() only for "synth": an effect's page was
# handed the INSTRUMENT's chain_params, found none of its own keys, and its
# knobs fell back to a 0..1 range — a touch snapped a 200 Hz band to the bottom
# and it could not be moved (4K EQ on the device, 2026-11-08).
#
# Runs the real file in a vm with a fake socket: the instrument's metadata
# arrives FIRST (the manager always answers it first), then the effect's.
#
# Such a page also SUBSCRIBES to its one component only: subscribed to the
# whole slot, every embedded editor read every module's values one by one on
# each connect, and a few kept pages starved the param channel the editor's
# transport and mode changes use (device, 2026-11-08).
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required (test_remote_api_component)"; exit 1; }

node -e '
const vm = require("vm"), fs = require("fs");
const src = fs.readFileSync("schwung-manager/static/schwung-remote-api.js", "utf8");
let bad = 0;
const ok = (n, c, why) => { console.log((c ? "  ok   — " : "  FAIL — ") + n + (c ? "" : "  " + (why || ""))); if (!c) bad = 1; };
function page(search) {
  let sock = null; const sent = [];
  class WS { constructor() { sock = this; this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 0); }
             send(m) { sent.push(JSON.parse(m)); } close() {} }
  WS.OPEN = 1;
  const win = { location: { search, protocol: "http:", host: "move.local:7700" },
                navigator: { userAgent: "node", maxTouchPoints: 0 }, WebSocket: WS,
                addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
                URLSearchParams, console, JSON };
  win.top = win; win.self = win; win.window = win; win.parent = win;
  vm.runInContext(src, vm.createContext(win));
  const feed = (m) => sock.onmessage({ data: JSON.stringify(m) });
  return { api: win.schwungRemote, feed, sent };
}
(async () => {
  const synth = [{ key: "cutoff", min: 0, max: 1 }], eq = [{ key: "lf_freq", min: 30, max: 450 }];
  const hSynth = { levels: { root: { label: "SYNTH" } } }, hEq = { levels: { root: { label: "EQ" } } };

  /* an effect page in FX 1: the instrument answers first */
  const fx = page("?schwungStandalone=1&slot=1&component=fx1");
  await new Promise((r) => setTimeout(r, 5));
  const cp = fx.api.getChainParams(), hp = fx.api.getHierarchy();
  fx.feed({ type: "hierarchy", slot: 1, component: "synth", data: hSynth });
  fx.feed({ type: "chain_params", slot: 1, component: "synth", data: synth });
  fx.feed({ type: "hierarchy", slot: 1, component: "fx1", data: hEq });
  fx.feed({ type: "chain_params", slot: 1, component: "fx1", data: eq });
  const [c, h] = await Promise.race([Promise.all([cp, hp]), new Promise((r) => setTimeout(() => r([null, null]), 300))]);
  ok("an effect page gets ITS chain_params, not the instrument’s", !!c && c[0].key === "lf_freq", JSON.stringify(c));
  ok("...and its hierarchy", !!h && h.levels.root.label === "EQ", JSON.stringify(h));
  ok("...and says which component it edits", fx.api.component === "fx1", fx.api.component);
  const fsub = fx.sent.filter((m) => m.type === "subscribe");
  ok("...and subscribes to that component alone", fsub.length === 1 && fsub[0].slot === 1 && fsub[0].component === "fx1", JSON.stringify(fsub));
  fx.api.resubscribe();
  const fre = fx.sent.filter((m) => m.type === "subscribe").pop();
  ok("...on a resubscribe too", !!fre && fre.component === "fx1", JSON.stringify(fre));

  /* an instrument page, no component: unchanged */
  const sy = page("?schwungStandalone=1&slot=2");
  await new Promise((r) => setTimeout(r, 5));
  const scp = sy.api.getChainParams();
  sy.feed({ type: "chain_params", slot: 2, component: "fx1", data: eq });
  sy.feed({ type: "chain_params", slot: 2, component: "synth", data: synth });
  const sc = await Promise.race([scp, new Promise((r) => setTimeout(() => r(null), 300))]);
  ok("an instrument page (no component) still gets the instrument’s", !!sc && sc[0].key === "cutoff", JSON.stringify(sc));
  ok("...and its component is synth", sy.api.component === "synth", sy.api.component);
  const ssub = sy.sent.filter((m) => m.type === "subscribe");
  ok("...and subscribes to the whole slot, as before", ssub.length === 1 && ssub[0].slot === 2 && !("component" in ssub[0]), JSON.stringify(ssub));

  console.log(bad ? "FAIL: test_remote_api_component" : "PASS: test_remote_api_component");
  process.exit(bad);
})();
'
