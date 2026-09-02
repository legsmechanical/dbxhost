#!/usr/bin/env bash
# The label mark is tri-state: `true` = the modulation tilde, "auto" = a
# filled circle, "auto-off" = an empty circle, false = nothing. A host with its
# own per-parameter automation shows it where the tilde would go, and the two
# circles must differ from each other and from the tilde.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }
node -e '
Promise.all([import("./src/shared/param_pages/render_page_movy.mjs")]).then(([R]) => {
  const g = { x0: 0, cellW: 32 };
  function pixels(mark) {
    const calls = [];
    const ctx = { fillRect: (x, y, w, h, on) => calls.push([x, y, w, h, on]) };
    R.drawLabelCell(ctx, g, 0, 40, "CUTOFF", "0.5", false, false, mark);
    return JSON.stringify(calls);
  }
  const none = pixels(false), tilde = pixels(true), on = pixels("auto"), off = pixels("auto-off");
  const fail = (m) => { console.log("FAIL: " + m); process.exit(1); };
  if (tilde === none) fail("the tilde draws nothing");
  if (on === none || on === tilde) fail("\"auto\" must draw a mark that is not the tilde");
  if (off === none || off === tilde) fail("\"auto-off\" must draw a mark that is not the tilde");
  if (on === off) fail("the filled and empty circles must differ");
  /* The filled circle is the empty one plus its centre: strictly more paint. */
  if (JSON.parse(on).length !== JSON.parse(off).length + 1) fail("filled = empty + centre");
  console.log("PASS: tri-state label mark — tilde, filled circle, empty circle, nothing");
}).catch(e => { console.log("FAIL: " + e.message); process.exit(1); });
'
