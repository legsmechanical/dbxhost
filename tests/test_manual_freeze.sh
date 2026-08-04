#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# The frozen legacy manual must stay frozen, and the release must publish the SA one.
#
# There are two manuals: MANUAL.md documents dAVEBOx as an ordinary tool on official
# Schwung and is frozen at its final release under that model; MANUAL-SA.md is the
# actively developed one. Only the SA draft is edited.
#
# The failure this guards is quiet and destructive: cut_release.sh used to promote
# the draft into MANUAL.md, so if that target is ever restored, cutting a release
# overwrites the frozen legacy manual with a document describing features legacy
# does not have — four insert FX, two send buses, booting straight into the
# sequencer, handing the device back on exit. Legacy users would be reading
# instructions for a build they are not running, and nothing would fail loudly.

fail=0
note() { echo "  FAIL: $*" >&2; fail=1; }

# 1. The release script must publish the SA manual, and must not write MANUAL.md.
if ! grep -q 'pathlib.Path("MANUAL-SA.md").write_text' scripts/cut_release.sh; then
    note "cut_release.sh does not promote the draft into MANUAL-SA.md"
fi
if grep -q 'pathlib.Path("MANUAL.md").write_text' scripts/cut_release.sh; then
    note "cut_release.sh writes MANUAL.md — that file is FROZEN, promote to MANUAL-SA.md"
fi
if grep -qE '^git add .*[^-]MANUAL\.md' scripts/cut_release.sh; then
    note "cut_release.sh stages MANUAL.md — the frozen manual must not be part of a release"
fi

# 2. The draft it reads must be the SA draft, and must exist.
if ! grep -q 'docs/working/MANUAL-SA.draft.md' scripts/cut_release.sh; then
    note "cut_release.sh does not read docs/working/MANUAL-SA.draft.md"
fi
[ -f docs/working/MANUAL-SA.draft.md ] || note "docs/working/MANUAL-SA.draft.md is missing"
[ -f docs/working/MANUAL.draft.md ] && \
    note "docs/working/MANUAL.draft.md is back — the legacy draft was retired; edit the SA draft"

# 3. The frozen manual must carry its banner, so a reader on the legacy path knows
#    it is not the current document and where to go instead.
if ! grep -q "FROZEN-BANNER-START" MANUAL.md; then
    note "MANUAL.md has lost its frozen banner"
fi
if ! grep -q "MANUAL-SA.md" MANUAL.md; then
    note "MANUAL.md does not point readers at MANUAL-SA.md"
fi

# 4. The SA draft must keep its draft banner (cut_release strips it on promotion;
#    without the markers the banner would ship to users verbatim).
for m in DRAFT-BANNER-START DRAFT-BANNER-END; do
    grep -q "$m" docs/working/MANUAL-SA.draft.md || \
        note "SA draft is missing $m — the banner would be published verbatim"
done

if [ "$fail" != "0" ]; then
    echo "manual freeze: FAILED" >&2
    exit 1
fi
echo "PASS: legacy manual frozen, SA manual is the release target"
