#!/usr/bin/env bash
# Source-invariant pins for "a project switch is a clean slate".
#
# Josh's acceptance criterion (2026-08-11): *"users should assume that deleting
# a project creates a clean slate with default routing, params, and all clips
# empty."* He hit the opposite — deleted a project, reloaded, and the original
# routing AND clip data were still there.
#
# The data never came from disk. It came from an autosave that ran while JS had
# already adopted the NEW project's uuid but the DSP still held the PREVIOUS
# project's tracks and clips, so the old content was filed under the new name —
# and then loaded straight back in. Every failure below is silent: the switch
# still works, the project still opens, it just isn't empty.
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
ok()   { echo "  ok   — $1"; }
bad()  { echo "  FAIL — $1"; fail=1; }

echo "clean slate on project switch:"

# 1. The deferred state_full save must file its bytes where the DSP is pointed,
#    not where JS believes it is. state_full serialises `inst` as it is RIGHT
#    NOW; state_path is assigned by the same set_param that resets the instance,
#    so state_uuid flips exactly when the memory becomes the new project's.
#    A write keyed off S.currentSetUuid is the bug itself.
if grep -q "host_write_file(uuidToStatePath(S.currentSetUuid), _st)" ui/ui_dsp_bridge.mjs; then
    bad "the deferred save is keyed off S.currentSetUuid again — mid-switch it files the OLD project's state under the NEW project's uuid"
else
    ok "the deferred save is not keyed off S.currentSetUuid"
fi
grep -q "host_write_file(uuidToStatePath(_dspUuid), _st)" ui/ui_dsp_bridge.mjs \
    && ok "the deferred save writes to the DSP's own state_uuid" \
    || bad "the deferred save no longer derives its destination from state_uuid"
grep -q "_dspUuid && _dspUuid === S.currentSetUuid" ui/ui_dsp_bridge.mjs \
    && ok "the save requires DSP and JS to agree on the project" \
    || bad "the agreement check is gone — the switch window is open again"

# 2. Both savers sit out the load window. Every other post-load consumer is
#    gated on these three; these two were not, which is how the window was
#    reachable at all. pendingInheritPicker matters most: it holds the load
#    pending a USER CHOICE, so that window is seconds long, not five ticks.
for guard in 'S.pendingSetLoad' 'S.pendingDspSync' 'S.pendingInheritPicker'; do
    grep -A2 'S.currentSetUuid && !S.awaitingProjectSelect' ui/ui_dsp_bridge.mjs | grep -q "$guard" \
        && ok "the deferred save is gated on $guard" \
        || bad "the deferred save lost its $guard gate"
done
grep -q 'S.pendingSetLoad || S.pendingDspSync > 0 || S.pendingInheritPicker' ui/ui_persistence.mjs \
    && ok "writeSidecar sits out the load window too" \
    || bad "writeSidecar can write the old project's JS state under the new uuid"

# 3. Fields the LOADER defaults must ALSO be reset by state_load's reset block.
#    seq8_load_state returns early when the file is missing or empty — which is
#    exactly the brand-new-project case — so anything defaulted only inside it
#    survives the switch into the new project.
for f in clock_follow_on clock_send_on xpose_preview_active tick_delta; do
    grep -q "inst->$f" dsp/setparam/sp_globals_state.c \
        && ok "state_load resets $f (not just the loader's success path)" \
        || bad "$f is defaulted only inside seq8_load_state — a project with no state file inherits it"
done

# 4. Deleting a project takes davebox's half with it. The module cannot do this
#    itself (host_remove_dir is disallowed under set_state), so the shell verb
#    owns it; otherwise the state lingers until the orphan pruner runs at the
#    NEXT BOOT.
grep -q 'SET_STATE_DIR' ../standalone/scripts/project-cmd.sh \
    && ok "project-cmd knows where the module state lives" \
    || bad "project-cmd lost SET_STATE_DIR — delete leaves davebox's state on disk"
awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh | grep -q 'state_dir' \
    && ok "delete removes the project's module state" \
    || bad "do_delete no longer removes set_state/<uuid> — a deleted project is not a clean slate"

[ "$fail" -eq 0 ] && echo "PASS: a project switch cannot inherit its predecessor's state" \
                  || echo "FAIL: clean-slate invariants broken"
exit "$fail"
