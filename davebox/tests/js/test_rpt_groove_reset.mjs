import './_bulk_get_stub.mjs';
/* tests/js/test_rpt_groove_reset.mjs — Delete + jog click on a drum track's
 * RPT GROOVE bank resets the selected lane's groove, with or without a repeat
 * mode on.
 *
 * ⚠ The bug: bank 5 is RPT GROOVE on a drum track but LIVE ARP on a melodic
 * one, and the drum arm handed the bank number to the shared reset without the
 * pad mode. With no repeat mode on, the gesture reset the drum track's (hidden,
 * unreachable) live arp and said "LIVE ARP RESET"; the groove the user was
 * looking at stayed as it was.
 *
 * Every check performs the real gesture — hold Delete, click the jog — and
 * reads the queue the device would drain. */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }
function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }
function assert(c, m) { if (!c) throw new Error(m); }

globalThis.host_system_cmd = () => 0; globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false; globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true; globalThis.host_remove_dir = () => true;
const sent = [];
globalThis.host_module_set_param = (k, v) => { sent.push(k + '=' + v); };
globalThis.host_module_set_params = () => true;
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
globalThis.shadow_set_params = () => true; globalThis.shadow_get_params = () => '';
globalThis.host_vol_block = () => {}; globalThis.host_edit_cc_block = () => {};
globalThis.host_autosave_hold = () => {};
globalThis.clear_screen = () => {}; globalThis.print = () => {}; globalThis.fill_rect = () => {};
globalThis.draw_rect = () => {}; globalThis.text_width = (t) => Math.max(0, String(t).length * 6 - 1);
globalThis.set_pixel = () => {}; globalThis.move_midi_internal_send = () => {};
globalThis.move_midi_external_send = () => {}; globalThis.set_led = () => {};
globalThis.host_ext_midi_remap_clear = () => {}; globalThis.host_ext_midi_remap_set = () => {};
globalThis.host_ext_midi_remap_enable = () => {};

async function main() {
await import('../../ui/ui.js');
const { S } = await import('../../ui/ui_state.mjs');
const { BANKS, PAD_MODE_DRUM } = await import('../../ui/ui_constants.mjs');

S.ledInitComplete = true; S.stateLoading = false; S.bootSplashMs = 0;
S.awaitingProjectSelect = false; S.sessionView = false;
for (let i = 0; i < 8; i++) { S.trackRoute[i] = 0; S.trackChannel[i] = i + 1; }
S.bankParams = Array.from({ length: 8 }, () => Array.from({ length: BANKS.length }, () => new Array(8).fill(0)));
S.tickCount = 1000;

const cc = (d1, d2) => globalThis.onMidiMessageInternal(new Uint8Array([0xB0, d1, d2]));
const JOG_CLICK = 3, DELETE = 119;
const T = 0, LANE = 3;
const queued = () => S.pendingDefaultSetParams.map(e => e.key + '=' + e.val);
const popup = () => (S.actionPopupLines || []).join(' ');

function freshDrumGroove(performMode, bank) {
    sent.length = 0; S.pendingDefaultSetParams.length = 0;
    S.actionPopupLines = [];
    S.deleteHeld = false; S.shiftHeld = false;
    S.activeTrack = T; S.trackPadMode[T] = PAD_MODE_DRUM;
    S.trackActiveClip[T] = 0; S.trackQueuedClip[T] = -1;
    S.drumPerformMode[T] = performMode;
    S.activeBank = bank; S.trackActiveBank[T] = bank; S.bankCardLatched = false;
    S.activeDrumLane[T] = LANE;
    /* A shaped groove on the selected lane, and on another lane as the control. */
    for (const l of [LANE, LANE + 1]) {
        S.drumRepeatGate[T][l] = 0x55; S.drumRepeatGateLen[T][l] = 5;
        for (let s = 0; s < 8; s++) { S.drumRepeatVelScale[T][l][s] = 40; S.drumRepeatNudge[T][l][s] = 12; }
    }
}
const deleteJogClick = () => {
    cc(DELETE, 127); cc(JOG_CLICK, 127); cc(JOG_CLICK, 0); cc(DELETE, 0);
};
function assertGrooveReset(l) {
    assert(S.drumRepeatGate[T][l] === 0xFF && S.drumRepeatGateLen[T][l] === 8,
           'lane ' + l + ' gate mask not reset: ' + S.drumRepeatGate[T][l] + '/' + S.drumRepeatGateLen[T][l]);
    for (let s = 0; s < 8; s++)
        assert(S.drumRepeatVelScale[T][l][s] === 255 && S.drumRepeatNudge[T][l][s] === 0,
               'lane ' + l + ' step ' + s + ' not reset: vel ' + S.drumRepeatVelScale[T][l][s] +
               ', nudge ' + S.drumRepeatNudge[T][l][s]);
}

step('⚠ RPT GROOVE, no repeat mode: Delete + jog click resets the selected lane\'s groove', () => {
    freshDrumGroove(0, 5);
    deleteJogClick();
    const q = queued();
    assert(q.indexOf('t0_l' + LANE + '_repeat_groove_reset=1') >= 0,
           'no groove reset was queued: ' + q.join(' | '));
    assertGrooveReset(LANE);
});

step('⚠ and it does NOT reset the live arp, which a drum track does not show', () => {
    freshDrumGroove(0, 5);
    deleteJogClick();
    const all = queued().concat(sent);
    assert(!all.some(x => /_tarp_reset=/.test(x)), 'the live arp was reset: ' + all.join(' | '));
});

step('⚠ the popup names what was reset: RPT GROOVE', () => {
    freshDrumGroove(0, 5);
    deleteJogClick();
    assert(popup() === 'RPT GROOVE RESET', 'popup says "' + popup() + '"');
});

step('control: only the selected lane\'s groove is reset', () => {
    freshDrumGroove(0, 5);
    deleteJogClick();
    assert(S.drumRepeatGate[T][LANE + 1] === 0x55 && S.drumRepeatVelScale[T][LANE + 1][0] === 40,
           'lane ' + (LANE + 1) + ' was touched');
});

step('control: with a repeat mode on, RPT GROOVE still resets the groove (unchanged)', () => {
    freshDrumGroove(1, 5);
    deleteJogClick();
    assert(queued().indexOf('t0_l' + LANE + '_repeat_groove_reset=1') >= 0, 'no groove reset: ' + queued().join(' | '));
    assertGrooveReset(LANE);
    assert(popup() === 'RPT GROOVE RESET', 'popup says "' + popup() + '"');
});

step('control: a MELODIC track on LIVE ARP still resets its live arp', () => {
    freshDrumGroove(0, 5);
    S.activeTrack = 1; S.trackPadMode[1] = 0; S.trackActiveClip[1] = 0; S.trackQueuedClip[1] = -1;
    S.trackActiveBank[1] = 5;
    deleteJogClick();
    assert(queued().some(x => /^t1_tarp_reset=/.test(x)), 'melodic LIVE ARP was not reset: ' + queued().join(' | '));
    assert(popup() === 'LIVE ARP RESET', 'popup says "' + popup() + '"');
    S.activeTrack = T;
});

if (failed) { console.log('FAIL: RPT GROOVE reset'); process.exit(1); }
console.log('PASS: Delete + jog click on RPT GROOVE resets the groove');
}
main().catch(e => { console.error(e); process.exit(1); });
