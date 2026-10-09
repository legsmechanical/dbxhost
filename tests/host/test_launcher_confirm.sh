#!/usr/bin/env bash
# The Tools-menu launcher ASKS before it restarts Move into dAVEBOx (Josh,
# 2026-09-30), and asks in dAVEBOx's own dialog style (Josh, 2026-10-09): its
# three screens are bitmaps drawn at build time by dAVEBOx's confirm chassis.
#
# Pins, against the real standalone/module/ui.js:
#   - the manifest takes the INTERACTIVE path on every stock: no `standalone`
#     in either spelling (it would win over tool_config on current upstream and
#     skip the question), tool_config.skip_file_browser + interactive;
#   - it imports nothing (a failed import is a Tools entry that cannot launch);
#   - the embedded frames equal a FRESH render, so they cannot go stale against
#     the fonts, and what reaches the screen is each frame pixel for pixel;
#   - YES is highlighted on open, the jog moves between No and Yes, a click
#     takes the highlighted one; Back leaves; releases are ignored;
#   - Yes runs exactly stock's standalone launch command, once;
#   - a host whose blit fails still asks, in text.
set -u
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

# The launcher's ui.js is an ES module that stock loads as one; node 18 (the
# Linux runner) decides by extension, so import a .mjs copy of the real file.
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cp standalone/module/ui.js "$T/launcher_ui.mjs"
export LAUNCHER_UI="$T/launcher_ui.mjs"
# A fresh render of the three screens, by dAVEBOx's own dialog code.
LAUNCHER_FRAMES="$(cd davebox && node --import ./tools/audit_loader.mjs tools/render_launcher_screens.mjs 2>/dev/null | tail -1)"
case "$LAUNCHER_FRAMES" in '{"yes":'*) ;; *) echo "FAIL: could not render the launcher screens"; exit 1 ;; esac
export LAUNCHER_FRAMES

node --import ./davebox/tools/audit_loader.mjs --input-type=module -e '
import { readFileSync } from "fs";
let fails = 0;
const ok  = (m) => console.log("  ok   — " + m);
const bad = (m) => { console.log("  FAIL — " + m); fails++; };

const man = JSON.parse(readFileSync("standalone/module/module.json", "utf8"));
(man.standalone === undefined && !(man.capabilities && man.capabilities.standalone !== undefined))
    ? ok("the manifest declares no standalone launch path") : bad("standalone is declared — it can win over the confirm");
(man.tool_config && man.tool_config.skip_file_browser === true && man.tool_config.interactive === true)
    ? ok("tool_config: skip_file_browser + interactive") : bad("tool_config " + JSON.stringify(man.tool_config));
(man.boot_target && man.boot_target.exec === "boot-entry.sh") ? ok("boot_target unchanged") : bad("boot_target changed");

const printed = [], cmds = []; let exits = 0;
let fb = new Uint8Array(128 * 64), blitFails = false;
globalThis.clear_screen = () => { printed.length = 0; fb = new Uint8Array(128 * 64); };
globalThis.print = (x, y, t) => { printed.push(String(t)); };
globalThis.fill_rect = (x, y, w, h, v) => {
    if (blitFails) throw new Error("no fill_rect here");
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) fb[(y + j) * 128 + x + i] = v ? 1 : 0;
};
globalThis.set_pixel = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.host_system_cmd = (c) => { cmds.push(c); return 0; };
globalThis.host_exit_module = () => { exits++; };

const src = readFileSync(process.env.LAUNCHER_UI, "utf8");
/^import /m.test(src) ? bad("the launcher imports something — a failed import is a Tools entry that cannot launch")
                      : ok("the launcher imports nothing");

/* The frames the launcher carries are the ones the renderer makes NOW. */
const want = JSON.parse(process.env.LAUNCHER_FRAMES);
const have = {};
for (const k of ["yes", "no", "starting"]) {
    const m = new RegExp(k + ":\\s*\x27([0-9a-f]{2048})\x27").exec(src);
    have[k] = m ? m[1] : null;
}
(have.yes && have.no && have.starting) ? ok("three frames are embedded, 128x64 each") : bad("a frame is missing or the wrong size");
(have.yes === want.yes && have.no === want.no && have.starting === want.starting)
    ? ok("the embedded frames match a fresh render (not stale against the fonts)")
    : bad("STALE frames — run: cd davebox && node --import ./tools/audit_loader.mjs tools/render_launcher_screens.mjs --write");
(have.yes !== have.no) ? ok("the Yes and No frames differ") : bad("Yes and No draw the same screen");

const ink = (hex) => { let n = 0; for (let i = 0; i < hex.length; i += 2) { let b = parseInt(hex.substr(i, 2), 16); while (b) { n += b & 1; b >>= 1; } } return n; };
const shows = (hex) => {             /* the screen buffer equals this frame, pixel for pixel */
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
        const on = (parseInt(hex.substr((y * 16 + (x >> 3)) * 2, 2), 16) >> (7 - (x & 7))) & 1;
        if (fb[y * 128 + x] !== on) return false;
    }
    return true;
};
(ink(want.yes) > 800 && ink(want.starting) > 150) ? ok("the frames have ink (a blank render is a broken rig)") : bad("a frame is nearly blank");

await import("file://" + process.env.LAUNCHER_UI);
const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
globalThis.init();
shows(want.yes) ? ok("it opens on the confirm with YES highlighted") : bad("the opening screen is not the Yes frame");
globalThis.tick();
shows(want.yes) ? ok("a tick redraws the same screen") : bad("a tick changed the screen");

cc(51, 0); cc(3, 0);
(exits === 0 && cmds.length === 0) ? ok("releases do nothing") : bad("a release acted");

cc(14, 127);
shows(want.no) ? ok("the jog turned back highlights NO") : bad("jog back did not show the No frame");
cc(14, 1);
shows(want.yes) ? ok("the jog turned forward highlights YES again") : bad("jog forward did not show the Yes frame");

cc(14, 127); cc(3, 127);
(exits === 1 && cmds.length === 0) ? ok("a click on NO leaves and launches nothing") : bad("click on No: exits=" + exits + " cmds=" + cmds.length);

globalThis.init();
cc(51, 127);
(exits === 2 && cmds.length === 0) ? ok("Back leaves and launches nothing") : bad("Back: exits=" + exits + " cmds=" + cmds.length);

globalThis.init();
cc(3, 127);
const wantCmd = "sh /data/UserData/schwung/launch-standalone.sh /data/UserData/schwung/modules/tools/davebox-sa/standalone";
(cmds.length === 1 && cmds[0] === wantCmd) ? ok("a click on YES (the default) launches with stock’s standalone command")
    : bad("launch cmds: " + JSON.stringify(cmds));
shows(want.starting) ? ok("...and the screen says it is restarting Move") : bad("the starting frame is not shown");
cc(3, 127); cc(14, 127); cc(51, 127);
(cmds.length === 1 && exits === 2) ? ok("once launching, nothing else is taken — it launches once") : bad("input acted while launching");

/* A host whose fill_rect fails must still ask, in plain text. */
blitFails = true;
globalThis.init();
const text = printed.join(" | ");
(/Move will restart/.test(text) && /Proceed\?/.test(text) && /Yes/.test(text) && /No/.test(text))
    ? ok("a failed blit falls back to text: " + text) : bad("the fallback says: " + text);
blitFails = false;
process.exit(fails ? 1 : 0);
' && echo "PASS: test_launcher_confirm.sh" || { echo "FAIL: test_launcher_confirm.sh"; exit 1; }
