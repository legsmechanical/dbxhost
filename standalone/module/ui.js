/*
 * dAVEBOx SA launcher — the Tools-menu door asks first (Josh, 2026-09-30:
 * "Davebox launch from tool menu should show a confirmation message"; wording
 * ruled "Move will restart to load dAVEBOx. Proceed?" — it restarts Move, it
 * does not reboot the device).
 *
 * This runs inside STOCK Schwung's shadow UI as an ordinary interactive tool
 * (module.json: tool_config.skip_file_browser + interactive, NO `standalone`).
 * On Yes it runs exactly what stock ran for a standalone tool:
 * `sh launch-standalone.sh <module dir>/standalone`. On No it hands the screen
 * back with host_exit_module().
 *
 * ⚠ Why not `standalone: true` plus this screen: stock picks ONE launch path
 * per tool, and which one wins changed between versions — 1.5.0 tests
 * tool_config first, current upstream (tool_launch.mjs) makes `standalone`
 * win. Declaring only the interactive path behaves the same on both.
 *
 * ⚠ Namespace import, never a named one: a stock whose menu_layout lacks
 * drawConfirmOverlay must still LOAD this file — a failed load is a Tools
 * entry that cannot launch dAVEBOx at all. Missing, it falls back to text.
 */
import * as layout from '/data/UserData/schwung/shared/menu_layout.mjs';

const MODULE_DIR = '/data/UserData/schwung/modules/tools/davebox-sa';
const LAUNCH = 'sh /data/UserData/schwung/launch-standalone.sh ' + MODULE_DIR + '/standalone';

const CC_JOG_CLICK = 3;
const CC_BACK = 51;

let launching = false;

function draw() {
    clear_screen();
    if (launching) {
        print(2, 28, 'Restarting Move...', 1);
        return;
    }
    const lines = ['Move will restart', 'to load dAVEBOx.', 'Proceed?'];
    if (typeof layout.drawConfirmOverlay === 'function') {
        layout.drawConfirmOverlay('dAVEBOx', lines, 'Back:No  Jog:Yes');
    } else {
        print(2, 2, 'dAVEBOx', 1);
        for (let i = 0; i < lines.length; i++) print(2, 16 + i * 10, lines[i], 1);
        print(2, 54, 'Back:No  Jog:Yes', 1);
    }
}

globalThis.init = function () {
    launching = false;
    draw();
};

globalThis.tick = function () {
    draw();
};

globalThis.onMidiMessageInternal = function (data) {
    if (!data || data.length < 3 || launching) return;
    if ((data[0] & 0xF0) !== 0xB0 || data[2] === 0) return;   /* CC presses only */
    if (data[1] === CC_JOG_CLICK) {
        launching = true;
        draw();
        host_system_cmd(LAUNCH);
    } else if (data[1] === CC_BACK) {
        host_exit_module();
    }
};
