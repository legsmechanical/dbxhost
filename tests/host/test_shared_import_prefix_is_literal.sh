#!/usr/bin/env bash
set -euo pipefail

# SHARED_IMPORT_CANONICAL must stay a hardcoded literal.
#
# It names the MODULE CONTRACT — the path shipped modules actually hardcode in
# their imports — not where this build happens to be installed. Deriving it from
# SCHWUNG_INSTALL_DIR makes it equal SHARED_IMPORT_LOCAL, so schwung_module_loader
# never rewrites anything. On a stock build that is invisible (the two are the
# same string anyway); on a second install sharing one modules directory it means
# modules silently load the OTHER install's shared/ library code.
#
# This is not hypothetical: a bulk rewrite of install-dir literals swallowed this
# one during the SCHWUNG_INSTALL_DIR work and had to be reverted.

file="src/shadow/shadow_ui.c"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required to run this test" >&2
  exit 1
fi

if ! rg -n '#define SHARED_IMPORT_CANONICAL "/data/UserData/schwung/shared/"' "$file" >/dev/null 2>&1; then
  echo "FAIL: SHARED_IMPORT_CANONICAL is not the expected hardcoded literal." >&2
  echo "      It must be \"/data/UserData/schwung/shared/\" — the module contract —" >&2
  echo "      NOT derived from SCHWUNG_INSTALL_DIR. See schwung_module_loader." >&2
  exit 1
fi

if rg -n '#define SHARED_IMPORT_CANONICAL\s+SCHWUNG_INSTALL_DIR' "$file" >/dev/null 2>&1; then
  echo "FAIL: SHARED_IMPORT_CANONICAL is derived from SCHWUNG_INSTALL_DIR." >&2
  exit 1
fi

echo "PASS: SHARED_IMPORT_CANONICAL is a literal, independent of the install dir"
exit 0
