/* ui_menu.mjs
 * Global settings menu: building the item list (track config, clock/tempo,
 * key/scale, save/load/quit) and opening/refreshing the menu against the
 * active track. Track-config mutation (applyTrackConfig) comes from
 * ui_dsp_bridge.mjs; Tap Tempo (openTapTempo) comes from ui_record.mjs;
 * key/scale preview (xposePreviewSet) comes from ui_xpose.mjs.
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

import {
    PAD_MODE_DRUM, PAD_MODE_CONDUCT,
    fmtNA, fmtRoute, fmtVelOverride,
    NOTE_KEYS, SCALE_NAMES
} from './ui_constants.mjs';

import { S } from './ui_state.mjs';
import { CHAIN_SLOTS, slotLetter } from './ui_engine.mjs';
import { saveState, writeSidecar, showActionPopup, loadSnapshotManifest } from './ui_persistence.mjs';
import { openLoadSnapshot, openProjectPadPicker } from './ui_dialogs.mjs';
import { computePadNoteMap } from './ui_drummodel.mjs';
import { forceRedraw } from './ui_leds.mjs';
import { enterMoveNativeCoRun, exitMoveNativeCoRun, DAVEBOX_PICKER_KEEP_MASK } from './ui_corun.mjs';
import { requestExport } from './ui_export.mjs';
import { applyTrackConfig } from './ui_dsp_bridge.mjs';
import { openTapTempo } from './ui_record.mjs';
import { xposePreviewSet } from './ui_xpose.mjs';

/* ------------------------------------------------------------------ */
/* Global menu items                                                    */
/* ------------------------------------------------------------------ */

/* Stub state for not-yet-wired global menu params */

/* Launch quantization: 0=Now, 1=1/16, 2=1/8, 3=1/4, 4=1/2, 5=1-bar; default 0 */

function buildGlobalMenuItems() {
    return [
        createValue('Channel', {
            get: function() { return S.trackChannel[S.activeTrack]; },
            /* Conductor has no MIDI channel — inert + shows '-'. */
            set: function(v) {
                if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT) return;
                applyTrackConfig(S.activeTrack, 'channel', v);
            },
            min: 1, max: 16, step: 1,
            format: function(v) {
                return S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT ? fmtNA() : String(v);
            }
        }),
        createEnum('Slot', {
            /* Chain slot this track addresses on the Schwung route (direct
             * slot dispatch — no channel matching). Inert unless the route
             * is Schwung; Conductor emits nothing. */
            get: function() { return S.trackSlot[S.activeTrack]; },
            set: function(v) {
                if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT) return;
                if (S.trackRoute[S.activeTrack] !== 0) return;
                applyTrackConfig(S.activeTrack, 'slot', v);
            },
            options: Array.from({ length: CHAIN_SLOTS }, (_, i) => i),
            format: function(v) {
                if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT) return fmtNA();
                if (S.trackRoute[S.activeTrack] !== 0) return fmtNA();
                return slotLetter(v);
            }
        }),
        createEnum('Route', {
            get: function() { return S.trackRoute[S.activeTrack]; },
            /* Conductor routes nowhere (drives transposition) — inert + shows '-'. */
            set: function(v) {
                if (S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT) return;
                applyTrackConfig(S.activeTrack, 'route', v);
            },
            options: [0, 1, 2],
            format: function(v) {
                return S.trackPadMode[S.activeTrack] === PAD_MODE_CONDUCT ? fmtNA() : fmtRoute(v);
            }
        }),
        createEnum('Mode', {
            get: function() { return S.trackPadMode[S.activeTrack]; },
            /* DEFERRED COMMIT: scrolling only previews the selected type — set()
             * is a no-op, so passing over Drums/Cond while scrolling never fires
             * a conversion or confirm. The conversion (behind its confirm) is
             * triggered by the commit CLICK, intercepted in the jog-click handler
             * (search: label === 'Mode'). Mirrors the Key/Scale commit-on-click
             * pattern. Keys/Drums/Cond = PAD_MODE_MELODIC_SCALE/DRUM/CONDUCT. */
            set: function() {},
            options: [0, 1, 2],
            format: function(v) { return v === PAD_MODE_CONDUCT ? 'Conduct' : (v ? 'Drums' : 'Keys'); }
        }),
        createEnum('Layout', {
            get: function() { return S.padLayoutChromatic[S.activeTrack] ? 1 : 0; },
            set: function(v) {
                if (S.trackPadMode[S.activeTrack] !== 0) return;
                S.padLayoutChromatic[S.activeTrack] = v !== 0;
                computePadNoteMap();
                forceRedraw();
            },
            options: [0, 1],
            format: function(v) {
                if (S.trackPadMode[S.activeTrack] !== 0) return fmtNA();
                return v ? 'Chrom' : 'Scale';
            }
        }),
        createValue('VelIn', {
            get: function() { return S.trackVelOverride[S.activeTrack]; },
            set: function(v) { applyTrackConfig(S.activeTrack, 'track_vel_override', v); },
            min: 0, max: 127, step: 1,
            format: function(v) { return fmtVelOverride(v); }
        }),
        createToggle('Looper', {
            get: function() { return S.trackLooper[S.activeTrack] !== 0; },
            set: function(v) { applyTrackConfig(S.activeTrack, 'track_looper', v ? 1 : 0); },
            onLabel: 'On', offLabel: 'Off'
        }),
        /* Pad-pressure (aftertouch) send mode — melodic tracks only. On drum
         * tracks pad pressure is owned by the repeat-velocity system, so the
         * item is hidden there. Move route supports Off/Poly only (Move
         * instruments take poly AT); Schwung/External also offer Channel.
         * Options recompute each menu open (buildGlobalMenuItems re-runs). Mode is
         * JS-side (carried per-message in tN_live_at) → persisted in the sidecar. */
        ...(S.trackPadMode[S.activeTrack] !== PAD_MODE_DRUM ? [
            createEnum('AftTch', {
                get: function() { return S.trackAtMode[S.activeTrack] | 0; },
                set: function(v) { S.trackAtMode[S.activeTrack] = v | 0; writeSidecar(); },
                options: S.trackRoute[S.activeTrack] === 1 ? [0, 1] : [0, 1, 2],
                format: function(v) { return v === 2 ? 'Chan' : v === 1 ? 'Poly' : 'Off'; }
            })
        ] : []),
        /* Edit the track's sound IN sound mode — chain-edit co-run is gone
         * (P4b follow-up, Josh 2026-08-09): sound mode already carries the
         * block picker, module browser, editor, presets and slot settings.
         * Hidden on non-Schwung-routed tracks (symmetric with Edit Synth). */
        ...((S.trackRoute[S.activeTrack] === 0) ? [
            createAction('Edit Slot...', function() {
                S.globalMenuOpen = false;
                S.lastSentMenuEditValue = null;
                S.pendingSoundEnterTrack = S.activeTrack;
                forceRedraw();
            })
        ] : []),
        /* Move-native co-run entry — visible only on ROUTE_MOVE tracks. */
        ...((S.trackRoute[S.activeTrack] === 1) ? [
            createAction('Edit Synth...', function() {
                enterMoveNativeCoRun(S.activeTrack);
            })
        ] : []),
        createDivider('Global'),
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
        createAction('Tap Tempo', function() {
            if (S.clockFollowOn) { showActionPopup('TEMPO: MOVE'); return; }
            openTapTempo();
        }),
        /* Key/Scale: turning the knob previews a transpose of all melodic clips
         * (live, uncommitted); the click commits behind a confirm (see the
         * jog-click intercept + xpose* helpers). set() runs as the menu-edit
         * live preview AND on edit-exit (set(get()) → candidate==committed →
         * cancel), so back-out cleanly drops the preview. */
        createEnum('Key', {
            get: function() { return S.padKey; },
            set: function(v) { xposePreviewSet(v, S.padScale); },
            options: [0,1,2,3,4,5,6,7,8,9,10,11],
            format: function(v) { return NOTE_KEYS[((v | 0) % 12 + 12) % 12]; }
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
        createValue('Swing Amt', {
            get: function() { return S.swingAmt; },
            set: function(v) { S.swingAmt = v; host_module_set_param('swing_amt', String(v)); },
            min: 0, max: 100,
            format: function(v) { return Math.round(50 + v * 0.25) + '%'; }
        }),
        createEnum('Swing Res', {
            get: function() { return S.swingRes; },
            set: function(v) { S.swingRes = v; host_module_set_param('swing_res', String(v)); },
            options: [0, 1],
            format: function(v) { return ['1/16','1/8'][v] || '1/16'; }
        }),
        createEnum('MIDI In', {
            get: function() { return S.midiInChannel; },
            set: function(v) {
                S.midiInChannel = v;
                host_module_set_param('midi_in_channel', String(v));
            },
            options: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
            format: function(v) { return v === 0 ? 'All' : String(v); }
        }),
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
        createToggle('Beat Marks', {
            get: function() { return S.beatMarkersEnabled; },
            set: function(v) { S.beatMarkersEnabled = v; forceRedraw(); },
            onLabel: 'On', offLabel: 'Off'
        }),
        createAction('Export to Ableton', function() {
            requestExport();
        }),
        createAction('Save state', function() {
            S.confirmSaveCount = loadSnapshotManifest(S.currentSetUuid).length;
            S.confirmSaveState = true;
            S.confirmSaveSel   = 1;   /* default No */
        }),
        createAction('Load state', function() {
            openLoadSnapshot();
        }),
        /* Projects: open dAVEBOx's own pad picker (v3) — 32 pads = project
         * slots, drawn by us, no restart and no native surface involved. It
         * closes the menu itself. Shift+Step 1 is the shortcut twin.
         * Projects (project-cmd.sh, projects.json) are part of this host, so
         * the entry is always present. */
        createAction('Projects...', function() {
            openProjectPadPicker();
        }),
        createAction('Clear Sess', function() {
            S.confirmClearSession = true;
            S.confirmClearSel     = 1;
            S.screenDirty         = true;
        }),
        /* Host Settings: the host's Global Settings screen, opened as an
         * overlay SERVICE on top of the running session (claims re-derive on
         * close). This replaced the deleted Shift+Vol+Step2 / Shift+Step2-hold
         * host gestures (2026-08-09) — the menu entry is now the only door. */
        createAction('Host Settings...', function() {
            host_open_service('global_settings', { keep_mask: DAVEBOX_PICKER_KEEP_MASK });
            S.globalMenuOpen = false;
        }),
        createAction('Suspend session', function() {
            /* Park dAVEBOx in the background (same as hold-Back):
             * save, then host_suspend_overtake one tick later via pendingSuspendManaged. */
            saveState();                       /* sets pendingSuspendSave */
            S.pendingSuspendManaged = true;    /* drained one tick after save fires */
            S.globalMenuOpen = false;
        }),
        createAction('Quit', function() {
            saveState();                       /* sets pendingSuspendSave */
            /* In a standalone session dAVEBOx IS the session — the user launched
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
            S.pendingExitAfterSave = true;     /* drained one tick after save fires */
            S.globalMenuOpen = false;
        }),
    ].filter(Boolean);   /* drops the host-gated entries when absent */
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
