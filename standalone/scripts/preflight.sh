#!/bin/sh
# Assert every seam dAVEBOx has on the STOCK tree, at launch, and say so LOUDLY.
#
# WHY THIS EXISTS. We share a filesystem with an install that updates
# independently of us, and on 2026-08-30 a stock v1.0.0 update broke dAVEBOx
# twice at once. Neither failure produced an error anywhere:
#
#   * modules/chain/dsp.so was replaced with upstream's. Upstream's chain does
#     not answer the fork-only colon readback (synth:module), so every slot in
#     every project rendered "EMPTY / CLICK TO PICK" while the state on disk was
#     perfectly intact. The two module.json files are BYTE-IDENTICAL, version
#     string included.
#   * launch-standalone.sh went back to pre-killing the stack and lost the guard
#     on its Move restart, so native Move booted on top of the launch.
#
# Both took a long hardware session to find, because the symptom was miles from
# the cause and nothing announced that the ground had moved. We cannot stop
# stock changing. We CAN make the next change say so on the way in.
#
# Exit status is ALWAYS 0. This reports; it never refuses a launch. A degraded
# session the user can work in beats a correct one that will not start — the
# same rule the select-before-load fail-open follows.

DBX_DIR="${DBX_DIR:-/data/UserData/dbx-host}"
STOCK="${STOCK_DIR:-/data/UserData/schwung}"
LOG="${1:-$DBX_DIR/launch.log}"
REPORT="$DBX_DIR/preflight_report.txt"
MANIFEST="$DBX_DIR/.owned-manifest"

fails=0
warns=0
: > "$REPORT"

say()  { printf "%s\n" "$*" >> "$LOG"; }
bad()  { fails=$((fails + 1)); printf "FAIL %s\n" "$*" >> "$REPORT"; say "preflight: FAIL $*"; }
warn() { warns=$((warns + 1)); printf "WARN %s\n" "$*" >> "$REPORT"; say "preflight: WARN $*"; }

say "--- preflight: checking what we share with the stock install ---"

# 1. modules/ must be OURS, not a bare link into a tree stock rewrites.
if [ -L "$DBX_DIR/modules" ]; then
    bad "modules/ is a symlink into the stock tree: a stock update replaces the code we run (this is how the chain DSP was swapped out)"
elif [ ! -d "$DBX_DIR/modules" ]; then
    bad "modules/ is missing entirely"
fi

# 2. Everything we own must be REAL and non-empty. A symlink here means an
#    installer regressed and we are running stock's copy again.
for own in ${DBX_OWNED_MODULE_DIRS:-chain tools/davebox-sound}; do
    d="$DBX_DIR/modules/$own"
    if [ -L "$d" ]; then
        bad "modules/$own is a SYMLINK — we are running stock's copy, not ours"
    elif [ ! -d "$d" ]; then
        bad "modules/$own is missing — nothing will load it"
    elif [ -z "$(ls -A "$d" 2>/dev/null)" ]; then
        bad "modules/$own is EMPTY — the category was created but never deployed"
    fi
done

# 3. The owned payload must be the one this build installed. Catches a stock
#    update, a half-finished deploy, and a hand-edit equally.
if [ -r "$MANIFEST" ]; then
    while IFS=' ' read -r want path; do
        [ -n "$want" ] || continue
        [ -r "$path" ] || { bad "manifest names a missing file: $path"; continue; }
        got=$(md5sum "$path" 2>/dev/null | cut -d' ' -f1)
        [ "$got" = "$want" ] || bad "$path changed since install (expected $want, found $got) — a stock update may have overwritten it"
    done < "$MANIFEST"
else
    warn "no owned-file manifest at $MANIFEST — cannot tell whether our modules are still ours (re-run install-host.sh)"
fi

# 4. The ONE thing of ours that must live in stock's tree, because it IS the
#    Tools-menu entry. A stock update can drop it; then dAVEBOx simply is not
#    in the menu, with nothing to explain why.
if [ ! -x "$STOCK/modules/tools/davebox-sa/standalone" ]; then
    bad "the launcher stub $STOCK/modules/tools/davebox-sa/standalone is gone — dAVEBOx will not appear in stock's Tools menu (re-run install-host.sh)"
elif ! grep -q "$DBX_DIR" "$STOCK/modules/tools/davebox-sa/standalone" 2>/dev/null; then
    bad "the launcher stub in stock's tree is NOT ours — a stock update replaced it"
fi

# 5. Stock's launch-standalone.sh: we do not modify it and cannot stop it
#    changing, but we CAN name which variant is installed, because the two
#    behaviours that matter decide what our entry path inherits.
LS="$STOCK/launch-standalone.sh"
if [ ! -r "$LS" ]; then
    warn "stock's launch-standalone.sh is missing — the Tools-menu launch path may not work at all"
else
    if grep -q "SIGKILL \$name" "$LS" 2>/dev/null || grep -q "Two-phase kill" "$LS" 2>/dev/null; then
        say "preflight: note — stock's launcher PRE-KILLS the stack (entry takes the already-gone branch)"
    else
        say "preflight: note — stock's launcher leaves the stack alive (entry quiesces first)"
    fi
    if grep -q "already running" "$LS" 2>/dev/null; then
        say "preflight: note — stock's launcher GUARDS its Move restart"
    else
        say "preflight: note — stock's launcher restarts Move UNCONDITIONALLY (the reaper handles the duplicate)"
    fi
fi

# 6. The shared/ seam. Modules are loaded by US but import from the stock path,
#    which the loader rewrites into OUR tree — so a module that starts importing
#    something only stock has fails to load, and a module that fails to load is
#    a module that silently is not there.
missing_shared=""
for f in $(grep -rhoE "/data/UserData/schwung/shared/[A-Za-z0-9_/-]+\.mjs" \
             "$DBX_DIR/modules/" 2>/dev/null | sed -E 's:.*/shared/::' | sort -u); do
    [ -e "$DBX_DIR/shared/$f" ] || missing_shared="$missing_shared $f"
done
[ -n "$missing_shared" ] && bad "modules import shared files this install does not have:$missing_shared (they resolve into $DBX_DIR/shared, so those modules will not load)"

if [ "$fails" -gt 0 ]; then
    say "=============================================================="
    say "preflight: $fails PROBLEM(S) and $warns warning(s) — see $REPORT"
    say "  Most likely cause: the stock install was updated underneath us."
    say "  Re-running standalone/scripts/install-host.sh repairs everything"
    say "  this script owns."
    say "=============================================================="
    printf "1" > "$DBX_DIR/preflight_failed"
else
    say "preflight: ok ($warns warning(s))"
    rm -f "$DBX_DIR/preflight_failed"
fi

exit 0
