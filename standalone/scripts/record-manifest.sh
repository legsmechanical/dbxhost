#!/bin/sh
# Record what the owned files ARE right now, for the launch preflight to check.
#
# Runs ON THE DEVICE, from whatever landed, not from build/ — a half-finished or
# interrupted deploy is then recorded as what it is, and the next launch reports
# the discrepancy rather than trusting the installer's intent.
#
# ⚠ CALLED BY EVERY INSTALLER THAT WRITES AN OWNED FILE, as its LAST step.
# dAVEBOx SA is deployed by two of them (install-host.sh for the host and the
# chain, install_sound.sh for the module), so a snapshot taken by only one is
# stale the moment the other runs — which is exactly what happened first time:
# install-host recorded ui.js, install_sound replaced it, and every launch then
# reported a false "changed since install".
#
# The owned list comes from .owned-dirs, written by install-host.sh from
# config.sh, so this file carries no second copy of it.

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
STOCK_STUB=/data/UserData/schwung/modules/tools/davebox-sa/standalone

cd "$DBX_DIR" || exit 0

owned=""
[ -r .owned-dirs ] && owned=$(cat .owned-dirs)
[ -n "$owned" ] || owned="chain tools/davebox-sound"

: > .owned-manifest.new
for own in $owned; do
    [ -d "modules/$own" ] || continue
    find "modules/$own" -type f -print | sort | while read -r f; do
        printf '%s %s/%s\n' "$(md5sum "$f" | cut -d' ' -f1)" "$DBX_DIR" "$f" >> .owned-manifest.new
    done
done

# The launcher stub is the ONE file of ours inside the stock tree, because it IS
# the Tools-menu entry. A stock update can replace or drop it, and then dAVEBOx
# simply stops appearing with nothing to explain why.
if [ -f "$STOCK_STUB" ]; then
    printf '%s %s\n' "$(md5sum "$STOCK_STUB" | cut -d' ' -f1)" "$STOCK_STUB" >> .owned-manifest.new
fi

mv -f .owned-manifest.new .owned-manifest
echo "      manifest: $(wc -l < .owned-manifest) file(s) pinned"
