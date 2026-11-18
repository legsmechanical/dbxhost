#!/usr/bin/env bash
# The remote sequencer's Playing/Stopped label follows the device's transport
# at once, even right after a click, and never trails the playhead.
#
# After any edit (the Play/Stop button included) the page rejects snapshots
# that do not bump the content rev for 1.2 s. Start/stop does not bump rev, so
# the playhead moved while the label, and the state the Play/Stop button
# toggles from, stayed stale: Stop clicked right after Play sent play again and
# the page read "stopped" with the cursor still running. And a stop carried no
# device-clock time, so a playing snapshot delivered after it (a fetch answered
# late) restarted the playhead — for good, since a stopped device sends nothing
# more. The stop now carries an order key. This runs the REAL
# applyParams from web_ui_seq.js against a stubbed page.
set -u
cd "$(dirname "$0")/.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node not found (test_web_transport_label_follows_device)" >&2; exit 1; }
out="$(node - <<'JS'
const fs = require('fs');
const src = fs.readFileSync('web_ui_seq.js', 'utf8');
const a = src.indexOf('function applyParams(params){');
const b = src.indexOf('\n}\n', a);
if (a < 0 || b < 0) { console.log('NOT FOUND: applyParams moved — update this test'); process.exit(0); }
const fn = src.slice(a, b + 2);
const env = new Function(`
  const P='dbx:'; let kv={}, rejectStash=null, dragging=false, clipDrag=null;
  let t=0; const now=()=>t;
  let suppressRefreshUntil=0, M=null, lastRev=-1, lastSelKey='', lastFoldSig='', autoLaneKey='';
  let phLastDev=0, phOff=Infinity, phOffT=0, phPlaying=false, phTgtTick=0, phTgtT=0, phTgtDev=0, phBpm=120, phEst=0, phEstT=0;
  let label='', stashed=0;
  const startPlayhead=()=>{}, stopPlayhead=()=>{};
  const stashRejected=()=>{ stashed++; };
  const parseModel=()=>{ const pl=JSON.parse(kv[P+'rui_play']||'{"on":0,"tick":0,"bpm":120,"dev":0}');
    return { rev:+(kv[P+'rui_rev']||0), play:{on:!!pl.on,tick:pl.tick,bpm:pl.bpm,dev:pl.dev},
             sel:{t:0,c:0,lane:0}, glob:{}, scaleMask:null, tracks:[{pm:0}], clip:{} }; };
  const isDrum=()=>false, selectLane=()=>{}, firstLaneWithHits=()=>0;
  const renderChrome=()=>{ label = M.play.on ? 'playing' : 'stopped'; };
  const renderSession=()=>{}, bandsApply=()=>{}, layout=()=>{}, renderSidePanels=()=>{}, draw=()=>{};
  ${fn}
  return {
    push(rev, on, dev){ applyParams({ [P+'rui_rev']:String(rev), [P+'rui_play']:JSON.stringify({on:on?1:0,tick:0,bpm:120,dev}) }); },
    click(){ suppressRefreshUntil=t+1200; },
    at(ms){ t=ms; },
    get state(){ return { label, model:M&&M.play.on, playhead:phPlaying }; },
  };`)();
const bad = [];
const expect = (what, want) => { const s = env.state;
  const ok = s.label===want && s.model===(want==='playing') && s.playhead===(want==='playing');
  if (!ok) bad.push(what + ': ' + JSON.stringify(s) + ' want ' + want); };
/* dev as the device sends it (seq8.c, rui_play): playing = the device clock
 * when the snapshot was built; stopped = the stop's order key, the last
 * playing block + 1, frozen for as long as it stays stopped (0 = never ran). */
env.at(0);    env.push(5, 0, 0);                   expect('initial, transport never ran', 'stopped');
env.at(100);  env.click();                          /* Play clicked */
env.at(250);  env.push(5, 1, 1100);                expect('started inside the window', 'playing');
env.at(400);  env.click();                          /* Stop clicked right after */
env.at(550);  env.push(5, 0, 1301);                expect('stopped inside the window', 'stopped');
env.at(2000); env.push(5, 1, 1300);                expect('the last playing snapshot landing after the stop', 'stopped');
env.at(2050); env.push(5, 1, 1200);                expect('an older playing snapshot landing late', 'stopped');
env.at(2100); env.push(6, 1, 1500);                expect('a newer start after the window', 'playing');
env.at(2200); env.push(6, 0, 1301);                expect('the old stop landing late after the restart', 'playing');
env.at(9000); env.push(6, 1, 8000);                expect('still playing seconds later', 'playing');
env.at(9100); env.push(6, 0, 1301);                expect('a much older stop is not a module reload', 'playing');
env.at(9200); env.push(6, 0, 8001);                expect('the real stop', 'stopped');
env.at(9300); env.push(6, 1, 8000);                expect('the last playing snapshot landing after the real stop', 'stopped');
env.at(9400); env.push(6, 1, 40);                  expect('a reloaded module starting from a reset clock', 'playing');
console.log(bad.length ? 'WRONG: ' + bad.join(' | ') : 'OK');
JS
)"
if [ "$out" = "OK" ]; then echo "PASS: transport label follows the device"; else echo "FAIL: $out" >&2; exit 1; fi
