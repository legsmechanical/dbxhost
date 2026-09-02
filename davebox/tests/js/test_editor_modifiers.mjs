/* Chain-editor modifiers (Josh's device pass, 2026-09-02):
 *  - Mute+touch must not fall through to the TRACK mute. davebox acts on the
 *    Mute RELEASE and mutes the track unless muteUsedAsModifier is set — on
 *    davebox's state object (GS), not sound mode's own S, which is inert.
 *  - Delete held paints the rings like Mute held does, so you see what a
 *    Delete+touch would clear; either release hands the rings back only once
 *    BOTH are up. */
import { readFileSync } from 'node:fs';
const src = readFileSync('ui/ui_sound.mjs', 'utf8');
let failed = 0;
function check(c, m) { console.log((c ? '  ok   — ' : '  FAIL — ') + m); if (!c) failed++; }

const touch = src.indexOf("} else if (S.muteHeld) {\n");
const toggle = src.indexOf('automationToggleActive(t, c, target)', touch);
check(touch > 0 && toggle > 0, 'the Mute+touch branch exists');
const flag = src.indexOf('GS.muteUsedAsModifier = true;', touch);
check(flag > 0 && flag < toggle, '⚠ Mute+touch marks the Mute as a MODIFIER (on GS) before toggling — else the release mutes the track');
check(!/[^G]S\.muteUsedAsModifier = true/.test(src.slice(touch, toggle)),
      'and on GS, not sound mode\'s own S (which is silently inert)');

check(src.includes('if ((S.muteHeld || S.deleteHeld) && S.view === VIEW_EDIT) {'),
      '⚠ holding Delete paints the rings like holding Mute');
const muteRel = src.indexOf('if (d1 === 88) {');
check(src.indexOf('if (!S.muteHeld && !S.deleteHeld && S.autoLedPaint)', muteRel) - muteRel < 200,
      'Mute release hands the rings back only when Delete is up too');
const delRel = src.indexOf('if (d1 === 119) {');
check(src.indexOf('if (!S.deleteHeld && !S.muteHeld && S.autoLedPaint)', delRel) - delRel < 300,
      'Delete release hands the rings back only when Mute is up too');

if (failed) { console.log('FAIL: editor modifiers'); process.exit(1); }
console.log('PASS: Mute+touch is a modifier; Delete paints the rings');
