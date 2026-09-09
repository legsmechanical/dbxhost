#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# A module-supplied CARD DRAWER is cached, and the cache must not outlive the
# view.
#
# ⚠⚠ THE CACHE KEY IS THE MODULE'S RAW DECLARATION ("card.js#draw"), not the
# path it resolves to — the consumer resolves that against whichever module is
# LOADED. Two modules may reasonably declare the same string; it is the obvious
# name for the file. So an entry surviving a load() would hand the second module
# the FIRST one's drawer: another module's picture under this knob, with nothing
# reporting a problem. A component change is not a sufficient guard either — a
# module can be swapped inside one slot and component.
#
# ⭑ The same reset makes a FAILED load recoverable. A cached null is never
# retried by design (right for a missing file, wrong for a load that failed once
# and would now succeed). Leaving the view and returning is the transition that
# clears it; upstream #472 was this defect with that transition left closed.
#
# LATENT TODAY, PINNED ANYWAY: zero of the 87 installed module.json files
# declare card_script (checked 2026-09-09 across 224 .so, following the symlinks
# into the stock tree — an earlier scan that did NOT follow them saw 2 files and
# would have "confirmed" anything).

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required" >&2; exit 1
fi

node -e '
import("./src/shared/param_pages/page_controller.mjs").then((C) => {
  const fail = (m) => { console.log("FAIL: " + m); process.exit(1); };
  const ok   = (m) => console.log("  ok   — " + m);

  const CARD = "card.js#draw";
  const hier = {
    "synth:chain_params": JSON.stringify([
      { key: "cutoff", name: "Cutoff", type: "float", min: 0, max: 1, step: 0.01,
        card_script: CARD },
    ]),
    "synth:ui_hierarchy": JSON.stringify({
      modes: null,
      levels: { root: { label: "S", knobs: ["cutoff"],
                        params: [{ key: "cutoff", label: "Cutoff", card_script: CARD }] } },
    }),
  };

  const calls = [];
  let handed = 0, retNull = false;
  const ctl = C.createController({
    getParam: (k) => (k in hier ? hier[k] : ""),
    setParam: () => {},
    announce: () => {},
    /* Each call stands in for a DIFFERENT module behind the same declared
     * string — which is exactly what the raw-string cache key cannot tell
     * apart. */
    loadCard: (path, ref) => {
      calls.push(path + "#" + ref);
      if (retNull) return null;
      const n = ++handed;
      return () => n;
    },
  });

  ctl.load({ slot: 0, component: "synth" });
  ctl.onKnobTouch(0, true);
  if (calls.length !== 1) fail("expected ONE load on first touch, got " + calls.length);
  ok("the drawer is loaded once, on the gesture");

  ctl.onKnobTouch(0, false);
  ctl.onKnobTouch(0, true);
  ctl.onKnobTurn(0, 1, 1000);
  if (calls.length !== 1) fail("re-warmed inside one view: " + calls.length + " loads");
  ok("further touches and turns inside the same view do NOT reload");

  /* ⭐ THE FIX. Re-entering must drop it: the module behind the declaration may
   * have changed, and the string alone cannot tell. */
  ctl.load({ slot: 0, component: "synth" });
  ctl.onKnobTouch(0, true);
  if (calls.length !== 2)
    fail("the cache SURVIVED a load() — a second module would inherit the first drawer (loads: " + calls.length + ")");
  ok("re-entering the view reloads — no drawer is inherited across modules");

  /* A null must stick within the view, and be retried after leaving it. */
  retNull = true;
  ctl.load({ slot: 0, component: "synth" });
  const before = calls.length;
  ctl.onKnobTouch(0, true);
  ctl.onKnobTouch(0, false);
  ctl.onKnobTouch(0, true);
  if (calls.length !== before + 1)
    fail("a failed load was retried within one view (" + (calls.length - before) + " attempts)");
  ctl.load({ slot: 0, component: "synth" });
  ctl.onKnobTouch(0, true);
  if (calls.length !== before + 2)
    fail("a failed load was NEVER retried, even after leaving the view");
  ok("a failed load stays failed within the view, and is retried after leaving it");

  console.log("PASS: the card cache is scoped to the view, not the session");
}).catch((e) => { console.log("FAIL: " + (e && e.stack ? e.stack : e)); process.exit(1); });
'
