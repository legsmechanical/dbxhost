#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Module lists must be wired into DAVEBOX's browser, not the host's picker.
#
# ⚠⚠ THIS TEST EXISTS BECAUSE THE FEATURE WAS BUILT ON THE WRONG SURFACE FIRST.
# #378 was ported into the host's shadow_ui.js chain editor and
# enterComponentSelect -- seventeen source pins, thirty-one mutations, a render
# harness and a three-way md5 against the device all passed, and the feature was
# INVISIBLE, because a dAVEBOx session never opens that editor. A test that asks
# "is the code wired" cannot tell you the SURFACE is wrong.
#
# So every pin below names a dAVEBOx function. If someone moves this back to the
# host, these fail rather than the suite going quietly green on a screen the
# user cannot reach. Same lesson `default_fx` taught this file: davebox picks
# through openBrowse/applyModulePick, and nothing else.

fail() { echo "FAIL: $1" >&2; exit 1; }
f="ui/ui_sound.mjs"
fails=0
pin() {
    local desc="$1" want="$2" pat="$3" got
    got=$(grep -c -- "$pat" "$f" || true)
    if [ "$got" = "$want" ]; then echo "  ok  $desc"
    else echo "FAIL: $desc -- matched $got, want $want" >&2; fails=$((fails+1)); fi
}

# --- the model is dAVEBOx's, imported into dAVEBOx ------------------------
pin "the model is imported here" 1 "import \* as ModuleLists from '/data/UserData/schwung/shared/module_lists.mjs'"

# --- the filter lives in openBrowse, dAVEBOx's OWN picker -----------------
# If this ever reads enterComponentSelect or shadow_ui, the port has gone back
# to the host and the feature is invisible again.
ob=$(awk '/^function openBrowse\(/,/^}$/' "$f")
[ -n "$ob" ] || fail "openBrowse is gone from $f -- dAVEBOx's picker is the surface"
grep -q "mlEligible(found).indexOf(mlFilter) < 0" <<<"$ob" || \
  fail "openBrowse does not drop an ineligible filter -- the picker opens EMPTY and reads as 'there are no modules'"
grep -q "ModuleLists.filterIds(mlState, mlRealIds(found), mlFilter)" <<<"$ob" || \
  fail "openBrowse does not filter the catalogue"
grep -q "id: LIST_ROW_ID" <<<"$ob" || \
  fail "openBrowse does not add the filter row"
grep -q "S.browseIdx = picked.idx + 1;" <<<"$ob" || \
  fail "the cursor is not shifted past the spliced filter row"

# The cursor must never REST on the filter row, for the same reason it never
# rests on [ none ]: one click at index 0 would change the filter instead of
# choosing a module. That default wiped two slots in phase-1 testing.
grep -q "if (S.browseIdx <= 0) S.browseIdx = Math.min(1, S.browseList.length - 1);" <<<"$ob" || \
  fail "the cursor can rest on the filter row"

# --- the gestures are dAVEBOx's -------------------------------------------
pin "click on the filter row cycles"        1 "S.pendingAction = { t: 'listcycle' }"
# ⚠ UPDATED 2026-09-12: Shift+click opens the LISTS MENU rather than filing
# silently. Josh: "shift+click on a module in the fx picker doesn't open the list
# menu for it, either on regular or bus inserts" — the asymmetry with the
# Instrument picker. The INVARIANT is unchanged (Shift+click is how you reach
# filing from the browser); what changed is that it now goes through a screen
# with visible rows instead of a blind toggle.
pin "shift+click opens the lists menu"      1 "S.pendingAction = { t: 'listmenu' }"
pin "both actions are DISPATCHED"           2 "a.t === 'listcycle'\|a.t === 'listmenu'"
# ⭐ And the menu must be opened FOR THE MODULE UNDER THE CURSOR, with the origin
# recorded — without the origin every exit returns to the Instrument picker,
# which is where the eleven hardcoded openInstrPicker() calls used to lead.
pin "the menu is opened on the browse row, from 'browse'" 1 \
    "openListMenu(S.browseList\[S.browseIdx\], 'browse')"

# --- the filter row is never loaded as a module ---------------------------
ls=$(awk '/^function loadSelected\(\)/,/^}$/' "$f")
grep -q "if (mod.id === LIST_ROW_ID) return;" <<<"$ls" || \
  fail "loadSelected would write the filter row's synthetic id into the slot as a module"

# --- a failed write is never announced as done ----------------------------
# ⚠ The toggle moved INTO the lists menu (commitListMenu's 'toggle' act) when the
# browse-only toggleListMembership was retired; the invariant came with it.

# --- every exit from the lists menu returns to the picker it came FROM -------
# Eleven exits used to name openInstrPicker() directly, so opening the menu from
# the FX browser and choosing a filter would have dumped the user in the
# Instrument picker. One owner now.
lm=$(awk '/^function commitListMenu\(r\) \{/,/^}$/' "$f")
grep -q "openInstrPicker()" <<<"$lm" && \
  fail "commitListMenu still returns to the Instrument picker by name"
grep -q "mlReopen()" <<<"$lm" || \
  fail "commitListMenu does not reopen through the one owner"
grep -q "if (now === null)" <<<"$lm" || \
  fail "a toggle that touched nothing is reported as a change"
grep -q "if (mlMenuFrom === 'browse') openBrowse" "$f" || \
  fail "mlReopen cannot return to the FX browser"
grep -q "if (!mlSave())" <<<"$lm" || \
  fail "the write is not checked"
# TWO calls, not one: the toggle itself and the REVERT on a failed write. A
# count of >=1 passes with the revert deleted, which is how the first version of
# this pin let that mutation survive.
# ⚠ Counted inside commitListMenu now, and against `active` rather than the
# retired browse-only `listName`.
n_toggle=$(grep -c "ModuleLists.toggleMembership(mlState, active, id);" <<<"$lm" || true)
[ "$n_toggle" = "2" ] || \
  fail "expected 2 toggleMembership calls (the toggle and the revert), found $n_toggle -- a failed write leaves the row disagreeing with the file, and it silently undoes itself on the next open"

# --- cycling re-scans, or the cycle narrows to nothing --------------------
cy=$(awk '/^function cycleListFilter\(\)/,/^}$/' "$f")
grep -q "engineListModules(specKeyFor(S.comp))" <<<"$cy" || \
  fail "cycleListFilter reuses the FILTERED list -- the eligible set shrinks every step until only All remains"

if [ "$fails" -ne 0 ]; then echo "$fails pin(s) failed" >&2; exit 1; fi
echo "PASS: module lists is wired into dAVEBOx's own browser"
