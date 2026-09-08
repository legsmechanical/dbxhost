#!/usr/bin/env bash
# The module contract UPSTREAM PUBLISHES, checked against what this fork honours.
#
# ⭐ THE SIBLING CHECK IS RETROSPECTIVE; THIS ONE IS NOT, AND THAT IS THE POINT.
# test_module_fields_reach_davebox.sh draws its universe from a CAPTURE of real
# modules and fires only on a key TWO OR MORE of them declare. So it is
# structurally blind to anything upstream has just added: no module in the wild
# declares `voices` or `split_voices` yet, so it stays green until someone
# writes one and hits the gap on hardware. That is exactly how `live_preview`
# hid from 2026-03 to 2026-09.
#
# This one takes upstream's PUBLISHED contract as the universe — the keys in
# fenced examples in MODULES.md / PARAM_PAGES.md / CHAIN.md — so a key is
# flagged the day upstream documents it, before a module exists to break on it.
#
# Josh's axis (2026-09-07): "we don't need host feature parity and i don't want
# it. my only concern is that modules that run on schwung run without issue in
# davebox, taking full advantage of what upstream allows them to leverage."
#
# ⚠⚠ FOUR MISTAKES ARE BUILT INTO THE SHAPE OF THIS CHECK. Each one made it
# report confidently and wrongly while it was being written; each is now a
# control, because a check nobody can trust is worse than no check:
#
#  1. THE MATCHER MUST SEE A PROPERTY READ. A first cut looked only for
#     `"key"` and reported `component_type` as missing. davebox reads it as
#     `json.component_type` (ui_engine.mjs), with upstream's own two-place
#     lookup. Control A pins this.
#  2. THE FORK IS THREE TREES, NOT ONE. davebox imports the shared param_pages
#     engine UNMODIFIED (pp_ctx.mjs), and dbxhost owns its host half too — so a
#     key handled in src/shared/ or src/shadow/ IS reachable even though
#     davebox/ui/ never names it. Checking davebox alone reported `extra_keys`
#     and `as_page` as gaps when the fork has both. Controls B and C.
#  3. THE FENCE PARSER MUST KNOW EVERY LANGUAGE TAG. A regex that only knew
#     ```json/```js treated a CLOSING fence as an opener and swallowed the prose
#     after it — which is how `hidden` was reported as a declarable field. There
#     is no `hidden` field; the only mention in v1.3.0's docs is the sentence
#     saying so. Control D pins that the phantom stays out.
#  4. UPSTREAM'S OWN MODULES ARE NOT THE CONTRACT. Scanning all of src/ let
#     `src/modules/chain/ui.js` and `src/modules/store/ui.js` vouch for keys —
#     8 of 12 "gaps" were an upstream module's private data. The universe is
#     what the HOST acts on: src/shadow/ + src/shared/ only.
#
# Requires a sibling checkout of upstream at ../schwung-current with v1.3.0.
# SKIPS (does not fail) when that is absent, so CI on a bare clone stays green.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required"; exit 1; }

UPSTREAM="${UPSTREAM_TREE:-../schwung-current}"
UPSTREAM_TAG="${UPSTREAM_TAG:-v1.3.0}"
if [ ! -d "$UPSTREAM/.git" ]; then
  echo "  skip — no upstream checkout at $UPSTREAM (set UPSTREAM_TREE to point at one)"
  exit 0
fi
if ! git -C "$UPSTREAM" rev-parse -q --verify "$UPSTREAM_TAG^{commit}" >/dev/null; then
  echo "  skip — $UPSTREAM has no $UPSTREAM_TAG (fetch upstream --tags)"
  exit 0
fi

UPSTREAM="$UPSTREAM" UPSTREAM_TAG="$UPSTREAM_TAG" python3 - <<'PY'
import subprocess, re, os, sys

UP  = os.environ['UPSTREAM']
TAG = os.environ['UPSTREAM_TAG']

# Keys upstream's host reads that this fork deliberately does not. A reason, not
# a blanket — an exemption that does not say why is indistinguishable from one
# somebody forgot to remove.
EXEMPT = {
  'show_value':  'canvas overlay chrome — davebox harvests the bank structure and '
                 'draws its own screens rather than hosting a module CANVAS',
  'show_footer': 'canvas overlay chrome — same reason as show_value',
}

def sh(*a, cwd=None):
    return subprocess.run(a, capture_output=True, text=True, cwd=cwd).stdout
def show(f):
    return sh('git', 'show', f'{TAG}:{f}', cwd=UP)

# ---- the universe: what upstream PUBLISHES to module authors ---------------
DOCS = ['docs/MODULES.md', 'docs/PARAM_PAGES.md', 'docs/CHAIN.md']
KEY  = re.compile(r'"([a-z][a-z0-9_]{2,30})"\s*:')

def fenced(text):
    """Content inside ``` fences. Split on fence LINES and take the odd
       segments, so every language tag works — see mistake 3 in the header."""
    parts = re.split(r'(?m)^\s*```.*$', text)
    return '\n'.join(parts[i] for i in range(1, len(parts), 2))

universe = set()
for f in DOCS:
    universe |= set(KEY.findall(fenced(show(f))))

# ---- what the upstream HOST acts on (NOT its bundled modules) -------------
host_files = [f for f in sh('git','ls-tree','-r','--name-only',TAG,
                            'src/shadow/','src/shared/', cwd=UP).splitlines()
              if f.endswith(('.mjs', '.js'))]
upstream = '\n'.join(show(f) for f in host_files)

# ---- what this fork honours: all three trees ------------------------------
def readall(root):
    out = []
    for d, _, fs in os.walk(root):
        for f in fs:
            if f.endswith(('.mjs', '.js')):
                out.append(open(os.path.join(d, f), errors='ignore').read())
    return '\n'.join(out)

trees = {'davebox/ui': readall('davebox/ui'),
         'src/shared': readall('src/shared'),
         'src/shadow': readall('src/shadow')}
fork = '\n'.join(trees.values())

if not universe or not upstream or not all(trees.values()):
    print('FAIL: a tree or the doc universe read EMPTY — this check would pass on anything')
    sys.exit(1)

def uses(blob, k):
    return re.search(r'["\'`]' + re.escape(k) + r'["\'`]|\.' + re.escape(k) + r'\b', blob) is not None

# ---- controls: prove it can fire, and cannot fire wrongly ------------------
fails = []
def control(ok, msg):
    print(('  ok   — ' if ok else '  FAIL — ') + msg)
    if not ok: fails.append(msg)

control(uses(trees['davebox/ui'], 'component_type'),
        'A: the matcher sees a PROPERTY read (json.component_type in davebox)')
control(uses(trees['src/shared'], 'extra_keys'),
        'B: the shared engine davebox imports counts as reachable (extra_keys)')
control(uses(trees['src/shadow'], 'claims_ccs'),
        "C: the fork's own host half counts as reachable (claims_ccs)")
control('hidden' not in universe,
        'D: the `hidden` phantom stays OUT of the universe (there is no such field)')
control(not uses(upstream, 'chainable'),
        "E: an upstream MODULE's private key does not vouch for itself (chainable)")

# Gaps we KNOW about and have decided to close — each names the work that closes
# it. Pinned rather than tolerated: the check fails when the set CHANGES in
# either direction, so a new one is loud and a closed one cannot rot here.
# ⚠ This is not an exemption list. EXEMPT means "davebox should not have this";
# KNOWN means "davebox should, and here is the ticket".
KNOWN = {
  'split_voices':  '#453 buses/sends — the module ABI (Josh: IN, routing AND davebox UI)',
  'voices':        '#453 buses/sends — bus membership is by voice id',
  'default_buses': '#453 buses/sends — a module declaring a bus it ships with (#464)',
  'default_fx':    '#460/#463 — a module declaring the FX behind it, and a factory preset',
  'frames':        'a module\'s CUSTOM ANIMATED WIDGET (MODULES.md "custom:mymeter" example). '
                   'The fork lacks BOTH sprite_rle.mjs and the whole styles/ directory, so a '
                   'module shipping a sprite widget draws nothing here. Found 2026-09-07 by '
                   'this check; on no board item before that.',
}

gaps = sorted(k for k in universe
              if k not in EXEMPT and uses(upstream, k) and not uses(fork, k))

new_gaps    = [g for g in gaps if g not in KNOWN]
closed_gaps = [k for k in KNOWN if k not in gaps]
if closed_gaps:
    print('FAIL: these are honoured now — remove them from KNOWN so the list stays true:')
    for k in sorted(closed_gaps): print(f'        {k}')
    sys.exit(1)
print(f'  ok   — {len(KNOWN)} known gaps still open, each naming the work that closes it')
gaps = new_gaps

stale = [k for k in EXEMPT if not uses(upstream, k)]
if stale:
    print('FAIL: exemptions upstream no longer reads: ' + ', '.join(sorted(stale)))
    print('      Remove them; a stale exemption is where the next real gap hides.')
    sys.exit(1)
print(f'  ok   — every exemption still names a key upstream reads ({len(EXEMPT)})')

if fails:
    print('\nFAIL: a control did not hold, so this run proves nothing.')
    sys.exit(1)

print(f'  ok   — universe: {len(universe)} declarable keys in {TAG} contract docs')

if gaps:
    print()
    print('FAIL: upstream publishes these to module authors and this fork honours none of them.')
    print('      A module using one behaves differently in dAVEBOx — the thing the axis forbids.')
    print('      Fix by honouring the key, or add it to EXEMPT with a reason.')
    for g in gaps:
        print(f'        {g}')
    sys.exit(1)

print(f'PASS: no NEW contract gap — {len(KNOWN)} known and tracked, everything else reachable')
PY
