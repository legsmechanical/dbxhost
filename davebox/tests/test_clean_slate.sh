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
#    gated on these; these two were not, which is how the window was reachable
#    at all.
#    ⚠ There used to be a THIRD gate here, S.pendingInheritPicker — the widest
#    of them, because it held the load pending a USER CHOICE (seconds, not five
#    ticks). It went with the inherit picker itself in Phase 0 of the
#    state-co-location plan: with no picker, no load can be held pending a
#    choice, so the window it guarded cannot open. ⚠⚠ ONLY that clause was
#    removed. The two below, and the state_uuid destination-agreement check
#    pinned in section 1, are what actually fix (14) — deleting them because
#    they sit next to picker code reopens the cross-project save bug.
for guard in 'S.pendingSetLoad' 'S.pendingDspSync'; do
    grep -A2 'S.currentSetUuid && !S.awaitingProjectSelect' ui/ui_dsp_bridge.mjs | grep -q "$guard" \
        && ok "the deferred save is gated on $guard" \
        || bad "the deferred save lost its $guard gate"
done
grep -q 'S.pendingSetLoad || S.pendingDspSync > 0' ui/ui_persistence.mjs \
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
#    ⚠ There are TWO roots and delete must take BOTH: the MODULE's
#    (schwung/set_state — clips, sequencer) and the HOST's ($DBX_DIR/set_state —
#    shadow_chain_config, slot_N, master_fx/move_fx/send_fx, i.e. the ROUTING
#    and PARAMS). Missing the host root left a deleted project's entire chain
#    and FX configuration on disk (found on hardware 2026-08-11).
for v in SET_STATE_DIR HOST_STATE_DIR STATE_PREFIX; do
    grep -q "^$v=" ../standalone/scripts/project-cmd.sh \
        && ok "project-cmd declares $v" \
        || bad "project-cmd lost $v — delete leaves that state root on disk"
done
awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh | grep -q '"\$HOST_STATE_DIR"' \
    && ok "the host state root is passed to the delete" \
    || bad "HOST_STATE_DIR is declared but never passed — the routing/params half survives delete"
awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh | grep -q 'shutil.rmtree(os.path.join(host_state_dir, u))' \
    && ok "the HOST root (ours alone) is removed wholesale" \
    || bad "the host state dir is no longer removed — routing/params survive delete"

#    ⚠⚠ THE ASYMMETRY IS THE POINT. The module root is the STOCK HOST'S own
#    state dir and the per-uuid folder is SHARED — measured on hardware, 4 of 18
#    held stock's slot_*/move_fx_*/send_fx_* alongside our seq8sa-*. Removing the
#    DIRECTORY there destroys the stock host's state for that set. Delete our
#    files by prefix; drop the folder only if we left it empty.
#    Counted, not pattern-matched: ANY second rmtree in do_delete is the bug,
#    whatever it is spelled against (a bare variable slipped past an earlier
#    literal-matching version of this pin). Exactly two are legitimate — the
#    set dir and the host state dir.
#    Comments stripped first — the prose here legitimately says "rmtree".
_rm=$(awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh \
        | sed 's/[[:space:]]*#.*$//' | grep -c 'rmtree')
if [ "$_rm" -eq 2 ]; then
    ok "do_delete contains exactly the 2 legitimate rmtree calls (set dir + host root)"
else
    bad "do_delete has $_rm rmtree calls, expected 2 — an extra one almost certainly rmtree's the SHARED module root and destroys the stock host's state"
fi
awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh | grep -q 'f.startswith(prefix + "-")' \
    && ok "module-root deletion is scoped to our own filename prefix" \
    || bad "module-root deletion is no longer prefix-scoped — it can take the stock host's files"
grep -q 'STATE_PREFIX:-seq8sa' ../standalone/scripts/project-cmd.sh \
    && ok "the prefix is seq8sa (not bare seq8, which would sweep Legacy's state too)" \
    || bad "STATE_PREFIX changed — 'seq8' would also delete dAVEBOx Legacy's state for the set"

# 5. A COPY IS A SNAPSHOT, taken at copy time.
#    Without this, a copy starts with no state file and the module's inherit
#    machinery seeds it from the source AT FIRST OPEN — so edits made to the
#    source in between leak into the copy, silently (no picker when there is
#    exactly one family candidate). Josh hit it on hardware: changes to
#    "Project 17" showed up in a pre-existing "Project 17 Copy".
# 6. "WHICH PROJECT IS OPEN" comes from the host's own record, not Settings.json.
#    currentSongIndex is written only at a relaunch and goes stale mid-session.
#    Measured naming project 5 while 14 was loaded — which made 14 unselectable
#    (a tap on the "already open" pad just closes the picker) and pointed the
#    delete guard at the wrong pad, permitting deletion of the LIVE project.
echo "which project is open:"
grep -q 'pr.uuid === _as.uuid' ui/ui_dialogs.mjs \
    && ok "the picker resolves current from active_set.txt by uuid" \
    || bad "the picker is back on Settings.json's currentSongIndex — a stale value makes the live project unselectable"
grep -q '^ACTIVE_SET_PATH=' ../standalone/scripts/project-cmd.sh \
    && ok "project-cmd declares ACTIVE_SET_PATH" \
    || bad "project-cmd lost ACTIVE_SET_PATH"
awk '/^do_delete\(\)/,/^}/' ../standalone/scripts/project-cmd.sh | grep -q 'index_of(open_uuid())' \
    && ok "the delete guard asks the host which set is loaded" \
    || bad "the delete guard is back on the stale index — it can permit deleting the LIVE project"
grep -q 'ACTIVE_SET_PATH:-\$DBX_DIR/active_set.txt' ../standalone/scripts/project-cmd.sh \
    && ok "ACTIVE_SET_PATH points at OUR tree, not the stock one" \
    || bad "ACTIVE_SET_PATH is not \$DBX_DIR — the stock copy holds native-session leftovers"

echo "copy is a snapshot:"
_cp=$(awk '/^do_copy\(\)/,/^}/' ../standalone/scripts/project-cmd.sh)
printf '%s' "$_cp" | grep -q 'module_state_dir' \
    && ok "do_copy seeds the destination's module state" \
    || bad "do_copy no longer copies module state — the copy will silently inherit the source's LATER edits at first open"
printf '%s' "$_cp" | grep -q 'shutil.copytree(hp_src' \
    && ok "do_copy seeds the destination's host state (routing/params)" \
    || bad "do_copy no longer copies host state — a copy starts with the DEFAULT chain/FX config"
printf '%s' "$_cp" | grep -q 'f.startswith(prefix + "-")' \
    && ok "the copy reads only our own files from the SHARED module root" \
    || bad "do_copy is not prefix-scoped in the shared module root"

[ "$fail" -eq 0 ] && echo "PASS: a project switch cannot inherit its predecessor's state" \
                  || echo "FAIL: clean-slate invariants broken"
exit "$fail"
