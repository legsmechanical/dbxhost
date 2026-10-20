#!/usr/bin/env bash
set -euo pipefail
# The web manager's "Report a bug" page exists only while <base>/bug-report.json
# does (schwung-manager/bugreport.go). Every release ships it (Josh, 2026-10-20:
# keep it for 1.0); a payload WITHOUT it still takes an old copy away, and the
# dev upload address must never be tracked.
# Behaviour of the page itself: schwung-manager/bugreport_test.go.
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*" >&2; exit 1; }

rel=standalone/scripts/build-sa-release.sh
# The file is written for every release, not behind a version case.
grep -q 'case "$SA_VERSION"' "$rel" && fail "$rel gates something on the version again (1.0 keeps the bug report page)"
grep -q '^printf .*> "$P/bug-report.json"' "$rel" || fail "$rel no longer ships bug-report.json with every release"

lay=standalone/scripts/layout-install.sh
grep -q 'if \[ ! -f ./bug-report.json \] && \[ -f "$DBX_DIR/bug-report.json" \]; then' "$lay" ||
  fail "$lay no longer retires an old bug-report.json when the payload has none"

ih=standalone/scripts/install-host.sh
grep -q 'bug-report.local.json' "$ih" || fail "$ih no longer drops the dev bug-report.json"

git check-ignore -q standalone/bug-report.local.json ||
  fail "standalone/bug-report.local.json is not ignored — the upload address would reach the public repo"

grep -q 'SA_BUG_REPORT_URL: ${{ secrets.SA_BUG_REPORT_URL }}' .github/workflows/release.yml ||
  fail "release.yml no longer passes the upload address secret to the release build"

# Functional: the retire step, run on a scratch install.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/bugrep.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/payload" "$tmp/dbx"; echo '{}' > "$tmp/dbx/bug-report.json"
snippet=$(awk '/bug-report page goes with its payload/{f=1} f{print} f&&/^fi$/{exit}' "$lay")
( cd "$tmp/payload" && DBX_DIR="$tmp/dbx" bash -c "$snippet" ) >/dev/null
[ ! -e "$tmp/dbx/bug-report.json" ] || fail "a payload without the file left an old bug-report.json in place"
echo '{}' > "$tmp/dbx/bug-report.json"; echo '{}' > "$tmp/payload/bug-report.json"
( cd "$tmp/payload" && DBX_DIR="$tmp/dbx" bash -c "$snippet" ) >/dev/null
[ -e "$tmp/dbx/bug-report.json" ] || fail "a payload removed its own bug-report.json"

echo "PASS: bug-report.json ships with every release, and the dev address stays untracked"
