#!/usr/bin/env bash
# tests/host/test_layout_install.sh — the device-side layout (2026-09-05): one
# script lays a payload into $DBX_DIR by the rules install-host.sh used to carry
# inline. Fixture: a fake stock tree, a payload, an existing install with the
# things a real one has (a stale help page, a file the payload does not ship, a
# shared dir that became a real copy, a private file that became a link, a bare
# modules symlink).
set -u
cd "$(dirname "$0")/../.." || exit 2
fail=0; ok(){ echo "  ok   — $1"; }; bad(){ echo "  FAIL — $1"; fail=1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
STOCK="$T/stock"; DBX="$T/dbx"; SRC="$T/payload"
mkdir -p "$STOCK/presets" "$STOCK/patches" "$STOCK/modules/audio_fx/verb" "$STOCK/modules/tools/movy" \
         "$STOCK/modules/tools/davebox-sound" "$STOCK/modules/chain"
mkdir -p "$SRC/scripts" "$SRC/bin" "$SRC/shadow" "$SRC/help" "$SRC/presets" "$SRC/modules/tools/davebox-sound" "$SRC/modules/audio_fx/verb"
cp standalone/scripts/layout-install.sh "$SRC/scripts/"; cp standalone/config.sh "$SRC/scripts/config.sh"
printf 'host\n' > "$SRC/schwung"; chmod 755 "$SRC/schwung"
printf 'ui\n' > "$SRC/shadow/shadow_ui"
printf '# ch1\n' > "$SRC/help/ch1.md"
printf 'stock heal\n' > "$SRC/bin/schwung-heal"
printf 'payload preset\n' > "$SRC/presets/p.json"        # must NOT be copied (shared name)
printf 'mine\n' > "$SRC/modules/tools/davebox-sound/module.json"
printf 'payload verb\n' > "$SRC/modules/audio_fx/verb/x"  # must NOT be copied (not owned)
# an existing install with history
mkdir -p "$DBX/bin" "$DBX/help" "$DBX/presets"
printf 'old\n' > "$DBX/bin/keepme"                        # not in the payload: must survive (merge)
printf 'stale\n' > "$DBX/help/old.md"                     # help is MIRRORED: must go
printf 'copy\n' > "$DBX/presets/local.json"               # a real copy of a shared dir: moved aside
ln -s "$STOCK/active_set.txt" "$DBX/active_set.txt"       # private state as a link: un-linked
ln -s "$STOCK/modules" "$DBX/modules"                     # bare symlink: replaced by a real dir

echo "layout-install.sh:"
sh "$SRC/scripts/layout-install.sh" "$SRC" "$DBX" "$STOCK" > "$T/out" 2>&1 || { bad "exit $?: $(tail -3 "$T/out")"; }
[ -x "$DBX/schwung" ] && ok "payload files land (schwung, executable)" || bad "schwung missing"
[ -f "$DBX/bin/keepme" ] && ok "MERGE: a file the payload does not ship survives" || bad "bin/ was replaced"
[ -f "$DBX/bin/schwung-heal" ] && ok "bin/ gained the payload's files beside it" || bad "bin merge failed"
[ ! -f "$DBX/help/old.md" ] && [ -f "$DBX/help/ch1.md" ] && ok "help/ is MIRRORED (stale page gone, new page in)" || bad "help mirror"
[ -L "$DBX/presets" ] && [ "$(readlink "$DBX/presets")" = "$STOCK/presets" ] && ok "presets is a link into stock" || bad "presets not linked"
ls "$DBX" | grep -q "^presets.unshared-" && ok "...and the real copy was moved aside, not deleted" || bad "real presets copy vanished"
[ ! -e "$STOCK/presets/p.json" ] && ok "the payload's presets/ was NOT copied through the link into stock" || bad "payload wrote into stock's presets"
[ ! -L "$DBX/active_set.txt" ] && ok "private state un-linked" || bad "active_set.txt still a link"
[ -d "$DBX/slot_state" ] && ok "private dirs created" || bad "slot_state missing"
[ -d "$DBX/modules" ] && [ ! -L "$DBX/modules" ] && ok "modules/ is a REAL dir (bare link replaced)" || bad "modules still a link"
[ -L "$DBX/modules/audio_fx" ] && ok "a stock category is one link" || bad "audio_fx not linked"
[ ! -e "$STOCK/modules/audio_fx/verb/x" ] && ok "the payload's unowned module was NOT copied through into stock" || bad "wrote into stock modules"
[ -d "$DBX/modules/tools" ] && [ ! -L "$DBX/modules/tools" ] && ok "tools/ is SPLIT (real dir)" || bad "tools not split"
[ -L "$DBX/modules/tools/movy" ] && ok "...stock tools linked one by one" || bad "movy not linked"
[ -d "$DBX/modules/tools/davebox-sound" ] && [ ! -L "$DBX/modules/tools/davebox-sound" ] && ok "...the owned tool is real" || bad "davebox-sound not real"
[ -f "$DBX/modules/tools/davebox-sound/module.json" ] && ok "...and got its payload" || bad "owned payload not copied"
[ -d "$DBX/modules/chain" ] && [ ! -L "$DBX/modules/chain" ] && ok "chain is ours (whole)" || bad "chain not real"
echo "idempotent:"
sh "$SRC/scripts/layout-install.sh" "$SRC" "$DBX" "$STOCK" > "$T/out2" 2>&1 && ok "second run exits 0" || bad "second run failed"
[ "$(ls "$DBX" | grep -c "^presets.unshared-")" = 1 ] && ok "nothing moved aside twice" || bad "moved aside again"
[ $fail = 0 ] && echo "PASS: $(basename "$0")" || { echo "FAIL: $(basename "$0")"; cat "$T/out"; }
exit $fail
