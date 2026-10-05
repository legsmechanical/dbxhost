#!/usr/bin/env bash
set -euo pipefail
# The web manager's "Report a bug" page exists only while <base>/bug-report.json
# does (schwung-manager/bugreport.go). These pins keep the file a TEST-build
# thing: release builds (>= 0.1) must not ship it, an upgrade to one must take
# a test build's copy away, and the dev upload address must never be tracked.
# Behaviour of the page itself: schwung-manager/bugreport_test.go.
cd "$(dirname "$0")/../.."
fail() { echo "FAIL: $*" >&2; exit 1; }

rel=standalone/scripts/build-sa-release.sh
# The file is written inside the 0.0.* (test build) case and nowhere else.
blk=$(awk '/bug-report.json/ && /printf/ {print prev} {prev=$0}' "$rel")
grep -q 'case "$SA_VERSION" in 0.0.\*)' <<<"$blk" ||
  fail "$rel writes bug-report.json outside the 0.0.* test-build case"
[ "$(grep -c 'bug-report.json' "$rel")" -ge 1 ] || fail "$rel no longer ships bug-report.json for test builds"

lay=standalone/scripts/layout-install.sh
grep -q 'if \[ ! -f ./bug-report.json \] && \[ -f "$DBX_DIR/bug-report.json" \]; then' "$lay" ||
  fail "$lay no longer retires a test build's bug-report.json on a release upgrade"

ih=standalone/scripts/install-host.sh
grep -q 'bug-report.local.json' "$ih" || fail "$ih no longer drops the dev bug-report.json"

git check-ignore -q standalone/bug-report.local.json ||
  fail "standalone/bug-report.local.json is not ignored — the upload address would reach the public repo"

grep -q 'SA_BUG_REPORT_URL: ${{ secrets.SA_BUG_REPORT_URL }}' .github/workflows/release.yml ||
  fail "release.yml no longer passes the upload address secret to the test build"

# Functional: the retire step, run on a scratch install.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/bugrep.XXXXXX"); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/payload" "$tmp/dbx"; echo '{}' > "$tmp/dbx/bug-report.json"
snippet=$(awk '/bug-report page belongs to TEST builds only/{f=1} f{print} f&&/^fi$/{exit}' "$lay")
( cd "$tmp/payload" && DBX_DIR="$tmp/dbx" bash -c "$snippet" ) >/dev/null
[ ! -e "$tmp/dbx/bug-report.json" ] || fail "a release payload left the test build's bug-report.json in place"
echo '{}' > "$tmp/dbx/bug-report.json"; echo '{}' > "$tmp/payload/bug-report.json"
( cd "$tmp/payload" && DBX_DIR="$tmp/dbx" bash -c "$snippet" ) >/dev/null
[ -e "$tmp/dbx/bug-report.json" ] || fail "a test payload removed its own bug-report.json"

echo "PASS: bug-report.json ships with test builds only, and the dev address stays untracked"
