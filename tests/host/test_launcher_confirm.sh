#!/usr/bin/env bash
# The Tools-menu launcher ASKS before it restarts Move into dAVEBOx (Josh,
# 2026-09-30; wording ruled "Move will restart to load dAVEBOx. Proceed?").
#
# Pins, against the real standalone/module/ui.js:
#   - the manifest takes the INTERACTIVE path on every stock: no `standalone`
#     in either spelling (it would win over tool_config on current upstream and
#     skip the question), tool_config.skip_file_browser + interactive;
#   - the screen says the ruled words;
#   - Back leaves (host_exit_module) and launches nothing;
#   - a jog click runs exactly stock's standalone launch command, once;
#   - releases are ignored.
set -u
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

# The launcher's ui.js is an ES module that stock loads as one; node 18 (the
# Linux runner) decides by extension, so import a .mjs copy of the real file.
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cp standalone/module/ui.js "$T/launcher_ui.mjs"
export LAUNCHER_UI="$T/launcher_ui.mjs"

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
globalThis.clear_screen = () => { printed.length = 0; };
globalThis.print = (x, y, t) => { printed.push(String(t)); };
globalThis.fill_rect = () => {}; globalThis.set_pixel = () => {}; globalThis.draw_rect = () => {};
globalThis.text_width = (t) => String(t).length * 6;
globalThis.host_system_cmd = (c) => { cmds.push(c); return 0; };
globalThis.host_exit_module = () => { exits++; };

await import("file://" + process.env.LAUNCHER_UI);
globalThis.init();
const screen = printed.join(" | ");
/Move will restart/.test(screen) && /to load dAVEBOx\./.test(screen) && /Proceed\?/.test(screen) && /Click:Yes/.test(screen)
    ? ok("the screen asks: " + screen) : bad("the screen says: " + screen);

const cc = (n, v) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, n, v]));
cc(51, 0); cc(3, 0);
(exits === 0 && cmds.length === 0) ? ok("releases do nothing") : bad("a release acted");
cc(51, 127);
(exits === 1 && cmds.length === 0) ? ok("Back leaves and launches nothing") : bad("Back: exits=" + exits + " cmds=" + cmds.length);
cc(3, 127); cc(3, 127);
const want = "sh /data/UserData/schwung/launch-standalone.sh /data/UserData/schwung/modules/tools/davebox-sa/standalone";
(cmds.length === 1 && cmds[0] === want) ? ok("a jog click launches, once, with stock’s standalone command")
    : bad("launch cmds: " + JSON.stringify(cmds));
process.exit(fails ? 1 : 0);
' && echo "PASS: test_launcher_confirm.sh" || { echo "FAIL: test_launcher_confirm.sh"; exit 1; }
