#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The browser mixer mirrors ui/ui_engine.mjs's addressing law: a Move-routed
# track's bus is its CHANNEL (which Move instrument it plays), clamped 1..4 —
# NEVER the track index. Reading the index opens a different instrument's
# strip, silently, which is exactly the class of bug this pins. The device
# half is pinned by tests/test_move_bus_flavour.sh; this is the WEB copy.

src="davebox/web_ui_mix.js"
[ -f "$src" ] || { echo "FAIL: $src missing" >&2; exit 1; }

node -e '
const fs=require("fs");
const src=fs.readFileSync(process.argv[1],"utf8");
const m=src.match(/function moveBusForChannel\([\s\S]*?\n\}/);
if(!m){ console.error("FAIL: moveBusForChannel not found in web_ui_mix.js"); process.exit(1); }
var MIX_MOVE_BUSES=4;
eval(m[0]);
const cases=[[1,1],[2,2],[4,4],[9,4],[0,1],[-3,1]];
for(const [ch,bus] of cases){
  if(moveBusForChannel(ch)!==bus){
    console.error("FAIL: moveBusForChannel("+ch+") = "+moveBusForChannel(ch)+", want "+bus);
    process.exit(1);
  }
}
// the off-diagonal law: the function must take a CHANNEL — assert the mixer
// derives the prefix from trk.chan, not from the track index
if(!/moveBusForChannel\(trk\.chan\)/.test(src)){
  console.error("FAIL: mixPrefixFor must derive the bus from trk.chan (the channel), never the index");
  process.exit(1);
}
console.log("PASS: web mixer bus law — bus = channel, clamped 1..4");
' "$src"
