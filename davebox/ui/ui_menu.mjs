/* ui_menu.mjs
 * Global settings menu: building the item list (track config, clock/tempo,
 * key/scale, save/load/quit) and opening/refreshing the menu against the
 * active track. The TRACK section dissolved on 2026-08-13 — every per-track
 * setting lives in Track Control now — so this menu is global settings plus one
 * door into it. Key/scale preview (xposePreviewSet) comes from ui_xpose.mjs.
 * Extracted from ui.js (Phase 5 of the modularity refactor, module 4).
 */

import {
    createValue, createEnum, createToggle, createAction, createDivider
} from '/data/UserData/schwung/shared/menu_items.mjs';

import {
    createMenuState
} from '/data/UserData/schwung/shared/menu_nav.mjs';

import {
    createMenuStack
} from '/data/UserData/schwung/shared/menu_stack.mjs';

import { SCALE_NAMES } from './ui_constants.mjs';

import { S } from './ui_state.mjs';
import { keyRootName } from './ui_chord.mjs';
import { openDaveBox, daveWindowOn, setDaveWindowOn } from './ui_daves.mjs';
import { bluetoothPresent, bluetoothOn, setBluetoothOn } from './ui_bluetooth.mjs';
import { cardHoldMs, setCardHoldMs, CARD_HOLD_CHOICES } from './ui_prefs.mjs';
import { saveState, loadSnapshotManifest, showActionPopup } from './ui_persistence.mjs';
import { openLoadSnapshot, openProjectPadPicker } from './ui_dialogs.mjs';
import { forceRedraw } from './ui_leds.mjs';
import { exitMoveNativeCoRun, DAVEBOX_PICKER_KEEP_MASK, enterMoveSettingsCoRun } from './ui_corun.mjs';
import { requestExport } from './ui_export.mjs';
import { requestSetTemplate, requestClearTemplate, hasTemplate } from './ui_template.mjs';
import { xposePreviewSet } from './ui_xpose.mjs';
import { grooveOptions, grooveCurrentIndex, grooveSelect, grooveLabel,
         GROOVE_SWING_16, GROOVE_SWING_8, GROOVE_TABLE } from './ui_groove.mjs';

/* ------------------------------------------------------------------ */
/* Global menu items                                                    */
/* ------------------------------------------------------------------ */

/* Stub state for not-yet-wired global menu params */

/* Launch quantization: 0=Now, 1=1/16, 2=1/8, 3=1/4, 4=1/2, 5=1-bar; default 0 */

function buildGlobalMenuItems() {
    return [
        /* ---- the track section DISSOLVED (2026-08-13) ----
         *
         * `Instr`, `Layout`, `VelIn`, `Transpose`, `Looper` and `AftTch` moved
         * to Track Control, where everything about a track now lives: its
         * destination (`Track to`), its chain, its mixer position and its
         * config. A setting with two homes is the ambiguity `Instr` itself was
         * created to remove, so they are GONE here rather than mirrored.
         *
         * `Edit Slot...` / `Edit Synth...` went too, and so did the single
         * `Track Control` door that briefly replaced them (Josh, 2026-08-13):
         * this menu is GLOBAL settings and nothing else. Track settings are
         * reached from the hardware — Shift+Note / Shift+Session — which opens
         * them on every route, including EXT.
         *
         * `Mode` went last (2026-08-13), and it was the awkward one: its edit
         * CONVERTS the track behind a confirm. Those rules now live in
         * ui_dialogs' requestTrackModeChange, and the confirms it raises draw
         * above Track Control rather than here. */
        /* No leading divider: with the track section gone this menu is global
         * throughout, and a 'Global' rule with nothing above it labels nothing.
         *
         * ⭑ ORDER AND GROUPS ruled by Josh, 2026-09-24 (laid out with the menu
         * arranger): tempo / metronome / clock / groove (2026-10-13: its own
         * group, between the clock and the key) / key / launch + beat
         * marks / MIDI in / projects / snapshots / export / exits / host / Daves.
         * Tap Tempo left the menu — Shift + Step 5 is its door. Suspend and Quit
         * now sit together in one group, replacing the 09-19 rule between them. */

        createValue('BPM', {
            get: function() {
                const v = parseFloat(host_module_get_param('bpm'));
                return (v > 0 && isFinite(v)) ? Math.round(v) : 120;
            },
            /* Read-only while following — Move owns tempo (DSP also ignores writes). */
            set: function(v) {
                if (S.clockFollowOn) return;
                host_module_set_param('bpm', String(Math.round(v)));
            },
            min: 40, max: 250, step: 1,
            format: function(v) { return S.clockFollowOn ? 'Move' : String(Math.round(v)); }
        }),
        createDivider(),
        createEnum('Metro', {
            get: function() { return S.metronomeOn; },
            set: function(v) {
                S.metronomeOn = v | 0;
                host_module_set_param('metro_on', String(S.metronomeOn));
            },
            options: [0, 1, 2, 3],
            format: function(v) {
                return ['Off', 'Cnt-In', 'Play', 'Always'][v | 0];
            }
        }),
        createValue('Metro Vol', {
            get: function() { return S.metronomeVol; },
            set: function(v) {
                S.metronomeVol = v | 0;
                host_module_set_param('metro_vol', String(S.metronomeVol));
            },
            min: 0, max: 150, step: 1,
            format: function(v) { return String(v | 0) + '%'; }
        }),
        createDivider(),
        /* Clock Follow: follow Move's MIDI clock + transport. Default off =
         * unchanged internal free-run. When on, BPM is read-only (EXT) and Play
         * drives Move (single source of truth). */
        createToggle('Clock Follow', {
            get: function() { return S.clockFollowOn === true; },
            set: function(v) {
                S.clockFollowOn = v ? true : false;
                host_module_set_param('clock_follow_on', S.clockFollowOn ? '1' : '0');
            },
            onLabel: 'Move', offLabel: 'Off'
        }),
        /* Clock Out: db emits MIDI clock (start/stop + 24-PPQN) to external gear
         * over USB-A when free-running (db is master at its own tempo). Suppressed
         * while Clock Follow = Move (Move's own MIDI Clock Out owns external sync,
         * so db relaying would double the clock on the shared port). The toggle
         * stays a stored preference even while following; the value shows "—"
         * then. Uses createEnum (not createToggle) so the "—" format applies. */
        createEnum('Clock Out', {
            get: function() { return S.clockSendOn ? 1 : 0; },
            set: function(v) {
                S.clockSendOn = v ? true : false;
                host_module_set_param('clock_send_on', S.clockSendOn ? '1' : '0');
            },
            options: [0, 1],
            format: function(v) { return S.clockFollowOn ? '—' : (v ? 'On' : 'Off'); }
        }),
        createDivider(),
        /* THE GROOVE (replaces Swing Amt / Swing Res) — a group of its own,
         * between the clock and the key (Josh, 2026-10-13). One row picks it — Off,
         * Browse... (straight to the file list: a click there loads a MIDI
         * file or an Ableton groove), the two swings, and the project's own
         * loaded groove — and one says how much of it is applied. The swings
         * read as they always have: 50% is straight, 66% a triplet. */
        (function() {
            const opts = grooveOptions();
            return createEnum('Groove', {
                get: function() { return grooveCurrentIndex(opts); },
                set: function(i) {
                    if (opts[i] && opts[i].id === 'browse') {
                        S.globalMenuOpen = false;
                        S.pendingGrooveMakeOpen = true;   /* the tick opens it: it lists a folder */
                        S.screenDirty = true;
                        return;
                    }
                    grooveSelect(opts[i]);
                    S.globalMenuBuiltForTrack = -1;      /* the rows below depend on the groove: rebuild */
                },
                options: opts.map(function(_o, i) { return i; }),
                format: function(i) { return opts[i] ? opts[i].label : grooveLabel(); }
            });
        })(),
        createValue('Groove Amt', {
            get: function() { return S.grooveAmt; },
            set: function(v) { S.grooveAmt = v; host_module_set_param('groove_amt', String(v)); },
            min: 0, max: 100,
            format: function(v) {
                return (S.grooveKind === GROOVE_SWING_16 || S.grooveKind === GROOVE_SWING_8)
                    ? Math.round(50 + v * 0.25) + '%' : Math.round(v) + '%';
            }
        }),
        /* A loaded groove's own three amounts — how much of its timing, of
         * its velocities, and how much each note wanders. Shown only while
         * one is selected: the swings have no velocities and no random. */
        S.grooveKind === GROOVE_TABLE ? createValue('Grv Timing', {
            get: function() { return S.grooveTiming; },
            set: function(v) { S.grooveTiming = v; host_module_set_param('groove_timing', String(v)); },
            min: 0, max: 100, format: function(v) { return Math.round(v) + '%'; }
        }) : null,
        S.grooveKind === GROOVE_TABLE ? createValue('Grv Velocity', {
            get: function() { return S.grooveVelocity; },
            set: function(v) { S.grooveVelocity = v; host_module_set_param('groove_velocity', String(v)); },
            min: 0, max: 100, format: function(v) { return Math.round(v) + '%'; }
        }) : null,
        S.grooveKind === GROOVE_TABLE ? createValue('Grv Random', {
            get: function() { return S.grooveRandom; },
            set: function(v) { S.grooveRandom = v; host_module_set_param('groove_random', String(v)); },
            min: 0, max: 100, format: function(v) { return Math.round(v) + '%'; }
        }) : null,
        createDivider(),
        /* Key/Scale: turning the knob previews a transpose of all melodic clips
         * (live, uncommitted); the click commits behind a confirm (see the
         * jog-click intercept + xpose* helpers). set() runs as the menu-edit
         * live preview AND on edit-exit (set(get()) → candidate==committed →
         * cancel), so back-out cleanly drops the preview. */
        createEnum('Key', {
            get: function() { return S.padKey; },
            set: function(v) { xposePreviewSet(v, S.padScale); },
            options: [0,1,2,3,4,5,6,7,8,9,10,11],
            format: function(v) { return keyRootName(v, S.padScale, true); }
        }),
        createEnum('Scale', {
            get: function() { return S.padScale; },
            set: function(v) { xposePreviewSet(S.padKey, v); },
            options: [0,1,2,3,4,5,6,7,8,9,10,11,12,13],
            format: function(v) { return SCALE_NAMES[v] || 'Major'; }
        }),
        createToggle('Scale Aware', {
            get: function() { return S.scaleAware !== 0; },
            set: function(v) {
                S.scaleAware = v ? 1 : 0;
                host_module_set_param('scale_aware', S.scaleAware ? '1' : '0');
            },
            onLabel: 'On', offLabel: 'Off'
        }),
        createDivider(),
        createEnum('Launch', {
            get: function() { return S.launchQuant; },
            set: function(v) {
                S.launchQuant = v;
                host_module_set_param('launch_quant', String(v));
            },
            options: [0, 1, 2, 3, 4, 5],
            format: function(v) {
                return ['Now','1/16','1/8','1/4','1/2','1-bar'][v] || '1-bar';
            }
        }),
        createToggle('Beat Marks', {
            get: function() { return S.beatMarkersEnabled; },
            set: function(v) { S.beatMarkersEnabled = v; forceRedraw(); },
            onLabel: 'On', offLabel: 'Off'
        }),
        /* Card Hold (Josh, 2026-10-13): how long a knob's page stays on
         * screen after the knob is let go. Device-global (ui_prefs), Off by
         * default. */
        createEnum('Card Hold', {
            get: function() { return cardHoldMs(); },
            set: function(v) { setCardHoldMs(v); forceRedraw(); },
            options: CARD_HOLD_CHOICES,
            format: function(v) { return v === 0 ? 'Off' : (v / 1000) + ' s'; }
        }),
        createDivider(),
        createEnum('MIDI In', {
            get: function() { return S.midiInChannel; },
            set: function(v) {
                S.midiInChannel = v;
                host_module_set_param('midi_in_channel', String(v));
            },
            options: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
            format: function(v) { return v === 0 ? 'All' : String(v); }
        }),
        createDivider(),
        /* Projects: open dAVEBOx's own pad picker (v3) — 32 pads = project
         * slots, drawn by us, no restart and no native surface involved. It
         * closes the menu itself. Shift+Step 1 is the shortcut twin.
         * Projects (project-cmd.sh, projects.json) are part of this host, so
         * the entry is always present. */
        createAction('Projects...', function() {
            openProjectPadPicker();
            if (S.projectPadPicker) S.projectPadPicker.fromMenu = true;   /* Back returns here */
        }),
        /* The saved project TEMPLATE (Josh, 2026-09-30: "put set as template in
         * the project menu alongside a clear template"). Set takes the project
         * you are in; Clear shows only while there is one (ui_template.mjs). */
        createAction('Set as Template', function() {
            requestSetTemplate();
        }),
        hasTemplate() ? createAction('Clear Template', function() {
            requestClearTemplate();
        }) : null,
        createDivider(),
        createAction('Save state', function() {
            S.confirmSaveCount = loadSnapshotManifest(S.currentSetUuid).length;
            S.confirmSaveState = true;
            S.confirmSaveSel   = 1;   /* default No */
        }),
        createAction('Load state', function() {
            openLoadSnapshot();
        }),
        createAction('Clear Sess', function() {
            S.confirmClearSession = true;
            S.confirmClearSel     = 1;
            S.screenDirty         = true;
        }),
        createDivider(),
        createAction('Export to Ableton', function() {
            requestExport();
        }),
        createDivider(),
        createAction('Suspend session', function() {
            /* Park dAVEBOx in the background — after the exit confirm
             * (Josh, 2026-09-05); Yes runs _suspendModule.
             * ⚠ "same as hold-Back" no longer: holding Back does nothing now,
             * and this is the only way to suspend. */
            S.confirmExit = 'suspend'; S.confirmExitSel = 1;
            S.confirmExitFromMenu = 'Suspend session';   /* No returns here */
            S.globalMenuOpen = false;
        }),
        createAction('Quit', function() {
            /* Confirm first (Josh, 2026-09-05); Yes runs exitSessionNow():
             * save, then the exit a tick later so the save lands.
             *
             * In a standalone session dAVEBOx IS the session — the user launched
             * straight into it and there is no shadow UI worth returning to. So
             * Quit leaves the whole host and hands the device back to stock
             * Schwung, matching what Shift+Back does there.
             *
             * Runtime check, not build-time: the same module directory serves
             * both the stock and the dAVEBOx host, so this exact code also runs
             * under stock — where Quit must keep meaning "unload dAVEBOx". The
             * marker is written and removed by the standalone launcher.
             *
             * Either way we save first, and either way the exit happens a tick
             * later so the save actually lands. */
            S.confirmExit = 'quit'; S.confirmExitSel = 1;
            S.confirmExitFromMenu = 'Quit';   /* No returns here */
            S.globalMenuOpen = false;
        }),
        createDivider(),
        /* Host Settings: the host's Global Settings screen, opened as an
         * overlay SERVICE on top of the running session (claims re-derive on
         * close). This replaced the deleted Shift+Vol+Step2 / Shift+Step2-hold
         * host gestures (2026-08-09) — the menu entry is now the only door. */
        createAction('Host Settings...', function() {
            host_open_service('global_settings', { keep_mask: DAVEBOX_PICKER_KEEP_MASK });
            S.globalMenuOpen = false;
        }),
        /* Move's own Settings menu, in co-run (Josh, 2026-09-28) — the
         * session's copy of Move's settings, never the user's own. */
        createAction('Move Settings...', function() {
            enterMoveSettingsCoRun();
        }),
        /* Bluetooth: the radio itself, for Bluetooth MIDI devices. Off powers
         * the controller down (paired devices drop); On lets a trusted device
         * come back by itself. Shown only on a unit that has a controller. */
        bluetoothPresent() ? createToggle('Bluetooth', {
            get: function() { return bluetoothOn(); },
            set: function(v) { setBluetoothOn(v); },
            onLabel: 'On', offLabel: 'Off'
        }) : null,
        createDivider(),
        /* The Daves switch (Josh, 2026-09-05): On = a collected Dave scrolls
         * through the session banner while playing; Off = the static wordmark.
         * Default OFF (Josh, 2026-09-05); device-global, beside the collection. */
        createToggle('Daves', {
            get: function() { return daveWindowOn(); },
            set: function(v) { setDaveWindowOn(v); },
            onLabel: 'On', offLabel: 'Off'
        }),
        createAction('Open Your Dave Box', function() {
            openDaveBox();     /* closes the menu itself when it opens */
        }),
    ].filter(Boolean);   /* drops the host-gated entries when absent */
}

/* Open Project Settings with the cursor on the row labelled `label`. */
export function openGlobalMenuAt(label) {
    openGlobalMenu();
    if (!S.globalMenuOpen || !S.globalMenuItems || !S.globalMenuState) return;
    for (let i = 0; i < S.globalMenuItems.length; i++) {
        const it = S.globalMenuItems[i];
        if (it && it.label === label) { S.globalMenuState.selectedIndex = i; return; }
    }
}

export function openGlobalMenu() {
    /* SELECT-BEFORE-LOAD: the menu operates on a project — Save, Clear Session,
     * Snapshots, Quit, per-track config — and none of that is meaningful before
     * one is chosen. Clear Session in particular would wipe a project the user
     * has never opened. The picker is the whole session until a selection. */
    if (S.awaitingProjectSelect) return;
    /* Co-run owns the OLED — exit it before opening the menu so dAVEBOx
     * can draw again. */
    if (S.moveCoRunTrack >= 0) exitMoveNativeCoRun();
    S.globalMenuItems         = buildGlobalMenuItems();
    S.globalMenuState         = createMenuState();
    S.globalMenuStack         = createMenuStack();
    S.globalMenuOpen          = true;
    S.globalMenuBuiltForTrack = S.activeTrack;
    S.lastSentMenuEditValue   = null;
    S.screenDirty             = true;
    S.jogTouched              = false;
}

/* Rebuild the global menu items list if the active track has changed
 * since the last build. Edit Slot... and Edit Synth... visibility
 * depends on the track's Route, so a Shift+jog track switch with the
 * menu open must rebuild the list. Cursor preserved by label-match
 * when possible, otherwise clamped. */
export function ensureGlobalMenuFresh() {
    if (!S.globalMenuOpen) return;
    if (S.globalMenuBuiltForTrack === S.activeTrack) return;
    let prevLabel = null;
    if (S.globalMenuItems && S.globalMenuState) {
        const _cur = S.globalMenuItems[S.globalMenuState.selectedIndex];
        if (_cur) prevLabel = _cur.label || null;
    }
    S.globalMenuItems = buildGlobalMenuItems();
    if (prevLabel && S.globalMenuState) {
        let idx = -1;
        for (let i = 0; i < S.globalMenuItems.length; i++) {
            const _it = S.globalMenuItems[i];
            if (_it && _it.label === prevLabel) { idx = i; break; }
        }
        if (idx >= 0) S.globalMenuState.selectedIndex = idx;
        else S.globalMenuState.selectedIndex = Math.min(
            S.globalMenuState.selectedIndex,
            Math.max(0, S.globalMenuItems.length - 1));
    }
    S.globalMenuBuiltForTrack = S.activeTrack;
}
