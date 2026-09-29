#!/usr/bin/env bash
# tests/host/test_uninstall_ui.sh — the "Uninstall dAVEBOx" screen, END TO END
# (2026-09-27): the real ui.js, driven by the gestures a user makes (open, jog
# click, Back), running the REAL uninstall.sh against a fake device. Only the
# hardcoded /data paths in ui.js are rewritten into the temp dir, and the
# script's device paths are pointed there through its test overrides.
#
# Asserts what is ON SCREEN (every print() of a frame), not internal state.
set -u
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }
export T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

mk() {  # $1 = live | installed
    F="$T/f"; rm -rf "$F"
    M="$F/stock/modules/tools/davebox-uninstall"
    mkdir -p "$M/bin" "$F/stock/bin" "$F/stock/modules/tools/davebox-sa" "$F/dbx/projects/p1" \
             "$F/UserLibrary/Sets" "$F/shm" "$F/proc" "$F/root" "$F/boot"
    cp standalone/uninstall/uninstall.sh "$M/uninstall.sh"
    echo song > "$F/dbx/projects/p1/Song.abl"; echo host > "$F/dbx/schwung"
    echo '{}' > "$F/stock/modules/tools/davebox-sa/module.json"
    printf '#!/bin/sh\nexit 0\n' > "$F/stock/bin/schwung-heal"; chmod 755 "$F/stock/bin/schwung-heal"
    if [ "$1" = live ]; then echo 99 > "$F/shm/.dbxhost-session.lock"; mkdir "$F/proc/99"; fi
}

drive() {  # $1 = gesture script name; prints the screens
    F="$T/f" node --input-type=module -e '
import fs from "fs"; import { execSync } from "child_process";
const F = process.env.F;
const M = F + "/stock/modules/tools/davebox-uninstall";
let src = fs.readFileSync("standalone/uninstall/ui.js", "utf8")
    .replace("/data/UserData/schwung/modules/tools/davebox-uninstall", M)
    .replace("/data/UserData/.dbx-uninstall.check", F + "/check")
    .replace("/data/UserData/.dbx-uninstall.done", F + "/done")
    .replace("/data/UserData/dbx-uninstall.log", F + "/log");
if (/\x27\/data\/UserData/.test(src)) { console.log("UNREWRITTEN PATH"); process.exit(1); }
const env = { ...process.env, DBX_DIR: F + "/dbx", STOCK_DIR: F + "/stock", SETS_DIR: F + "/UserLibrary/Sets",
    BOOT_ROOT: F + "/boot", SHM_DIR: F + "/shm", PROC_DIR: F + "/proc", SHIM_PATH: F + "/root/shim",
    UNIT_PATH: F + "/root/unit", DONE_FILE: F + "/done" };
const cmds = [];
let exited = false, frame = [];
Object.assign(globalThis, {
    host_system_cmd: (c) => { cmds.push(c);
        const allowed = ["tar ","cp ","mv ","mkdir ","rm ","ls ","test ","chmod ","sh "];   /* stock shadow_ui.c allowlist */
        if (!allowed.some((p) => c.startsWith(p))) return -1;
        try { execSync(c, { env, shell: "/bin/sh" }); return 0; } catch (e) { return e.status | 0; } },
    host_read_file: (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } },
    host_file_exists: (p) => fs.existsSync(p),
    host_exit_module: () => { exited = true; },
    clear_screen: () => { frame = []; }, fill_rect: () => {}, print: (x, y, t) => { frame.push(t); },
});
fs.writeFileSync(F + "/ui.mjs", src);
await import(F + "/ui.mjs");
const cc = (n) => globalThis.onMidiMessageInternal([0xB0, n, 127]);
const show = (label) => { globalThis.tick(); console.log(label + ": " + frame.filter(Boolean).join(" | ")); };
const waitDone = async () => { for (let i = 0; i < 200 && globalThis.__uninstallStateForTest().state === "running"; i++) {
    await new Promise((r) => setTimeout(r, 50)); globalThis.tick(); } };
globalThis.init(); show("open");
if (process.argv[1] === "uninstall") {
    cc(3); show("click1");
    cc(51); show("back");
    cc(3); cc(3); show("click2");
    cc(51); show("back-while-running"); console.log("exited-while-running=" + exited);
    await waitDone(); show("finished");
    cc(51); console.log("exited=" + exited);
} else {
    cc(3); cc(3); show("clicks"); cc(51); console.log("exited=" + exited);
}
console.log("RUNCMD=" + (cmds.find((c) => c.includes("--run")) || "none"));
' "$1"
}

fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
has() { grep -q -- "$2" <<<"$(grep "^$1:" "$T/out")"; }

echo "a normal uninstall, by gesture:"
mk installed; drive uninstall > "$T/out" 2>&1
has open "UNINSTALL DAVEBOX SA?" && has open "Projects & settings" && has open "dbx-host" && ok "opens on the question, saying projects are kept in dbx-host" || { bad "open"; cat "$T/out"; }
has click1 "ARE YOU SURE?" && ok "first click asks again" || bad "click1: $(grep '^click1' "$T/out")"
has back "UNINSTALL DAVEBOX SA?" && ok "Back from the second question returns to the first" || bad "back"
has click2 "UNINSTALLING" && ok "second click starts it" || bad "click2: $(grep '^click2' "$T/out")"
grep -q "exited-while-running=false" "$T/out" && ok "Back cannot leave while it runs" || bad "left mid-run"
has finished "DAVEBOX SA REMOVED" && has finished "dbx-host" && ok "finishes on DAVEBOX SA REMOVED, projects kept" || bad "finished: $(grep '^finished' "$T/out")"
grep -q "^exited=true" "$T/out" && ok "Back then exits" || bad "no exit"
grep -q "^RUNCMD=sh .*uninstall.sh --run > .* 2>&1 &$" "$T/out" && ok "the run is started in the background, through the allowed 'sh ' prefix" || bad "$(grep RUNCMD "$T/out")"
[ -f "$T/f/dbx/projects/p1/Song.abl" ] && [ ! -e "$T/f/dbx/schwung" ] && [ ! -e "$T/f/stock/modules/tools/davebox-sa" ] \
    && [ ! -e "$T/f/stock/modules/tools/davebox-uninstall" ] && ok "on disk: projects kept, dAVEBOx and the uninstaller gone" || bad "disk state"
grep -q "is uninstalled" "$T/f/log" && ok "the log says so" || bad "log: $(cat "$T/f/log")"

echo "a live session:"
mk live; drive clicks > "$T/out" 2>&1
has open "DAVEBOX SA IS RUNNING" && has open "Quit dAVEBOx SA," && ok "says to quit dAVEBOx first" || { bad "open"; cat "$T/out"; }
grep -q "^RUNCMD=none" "$T/out" && ok "clicks start nothing" || bad "$(grep RUNCMD "$T/out")"
grep -q "^exited=true" "$T/out" && [ -f "$T/f/dbx/schwung" ] && ok "Back exits, nothing removed" || bad "state"

echo "every screen fits the display (Josh 2026-09-27: "text on ui overflows the screen"):"
# Per-glyph widths of stock's font.png, measured from the device's atlas (1.4.0):
# text_width() = sum(glyph + 1). The UI prints at x=2 on a 128-px screen, so a
# line must be <= 124; rows start at y=14, 10 apart, so at most 5 fit under the title.
WIDTHS='{" ":5,"!":1,"\"":3,"#":5,"$":5,"%":5,"&":5,"'\''":2,"(":3,")":3,"*":5,"+":5,",":2,"-":5,".":2,"/":5,"0":5,"1":3,"2":5,"3":5,"4":5,"5":5,"6":5,"7":5,"8":5,"9":5,":":2,";":2,"<":4,"=":5,">":4,"?":5,"@":5,"A":5,"B":5,"C":5,"D":5,"E":5,"F":5,"G":5,"H":5,"I":3,"J":5,"K":5,"L":5,"M":5,"N":5,"O":5,"P":5,"Q":5,"R":5,"S":5,"T":5,"U":5,"V":5,"W":5,"X":5,"Y":5,"Z":5,"[":3,"\\":5,"]":3,"^":5,"_":5,"`":3,"a":5,"b":5,"c":4,"d":5,"e":5,"f":5,"g":5,"h":5,"i":3,"j":4,"k":4,"l":3,"m":5,"n":5,"o":5,"p":5,"q":5,"r":5,"s":5,"t":5,"u":5,"v":5,"w":5,"x":5,"y":5,"z":5,"{":3,"|":1,"}":3,"~":5}' node --input-type=module -e '
import fs from "fs";
Object.assign(globalThis, { host_system_cmd: () => 0, host_read_file: () => "installed", host_file_exists: () => false,
    host_exit_module: () => {}, clear_screen: () => {}, fill_rect: () => {}, print: () => {} });
const F = process.env.T + "/ui-screens.mjs";
fs.writeFileSync(F, fs.readFileSync("standalone/uninstall/ui.js", "utf8")); await import(F);
const W = JSON.parse(process.env.WIDTHS), tw = (s) => [...s].reduce((a, c) => a + (W[c] ?? 99) + 1, 0);
let bad = 0, lines = 0;
for (const [title, rows] of globalThis.__uninstallAllScreensForTest()) {
    if (rows.length > 5) { console.log("  FAIL — " + title + ": " + rows.length + " rows (max 5)"); bad = 1; }
    for (const l of [title, ...rows]) { lines++; if (tw(l) > 124) { console.log("  FAIL — " + tw(l) + " px > 124: " + l); bad = 1; } }
}
console.log(bad ? "  FAIL — overflow" : "  ok   — all " + lines + " lines of all 10 screens fit (<= 124 px, <= 5 rows)");
process.exit(bad);
' || fail=1

[ $fail = 0 ] && echo "PASS: $(basename "$0")" || echo "FAIL: $(basename "$0")"
exit $fail
