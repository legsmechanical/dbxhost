#!/usr/bin/env bash
# Every field a module DECLARES and the host ACTS ON must be reachable by the
# second consumer — or be listed here with a reason.
#
# ⭐ THIS IS THE MECHANISM FOR A WHOLE CLASS OF BUG, not one field. dAVEBOx
# shares MODULES with the host, not SCREENS, and the split was drawn around
# DATA: behaviour that stayed in the host's own screen is silently absent for
# anyone second, with no error and nothing to grep for. `live_preview` sat in
# that gap from 2026-03-04 (upstream 9c48f4d3) until Josh hit it on hardware on
# 2026-09-07 — six months in which five of the hundred captured modules browsed
# silently in dAVEBOx and auditioned fine on the host.
#
# The check: for each declaration key used by TWO OR MORE real modules, if
# shadow_ui.js reads it and neither the shared library nor davebox mentions it,
# that is a field the host understands and davebox cannot. Either move the
# behaviour down, or add the key below and say why it does not apply.
#
# ⚠ ONE MODULE IS NOT A CONTRACT. A key used by a single module is as likely to
# be that module's private data as a host feature, and including those made the
# check noisy enough to be ignored — which is worse than not having it.
#
# ⚠⚠ WHAT A PASS DOES **NOT** MEAN — read this before quoting it. "Reachable"
# means the field is named in the shared library OR in davebox. It does NOT mean
# davebox actually passes it through: `live_preview` lives in the shared browser
# now, so this check stays silent even if davebox's `makeCell` drops it on the
# floor again — which is precisely the bug that was shipped. That half is pinned
# by davebox/tests/js/test_file_browser_behaviour.mjs, and the two are not
# substitutes. (Established by mutation: dropping the field from makeCell
# survives this check and fails that one.)
#
# ⚠ AND IT ONLY SEES BEHAVIOUR KEYED ON A DECLARED FIELD. Navigation targets,
# error text, the announcement layer and a screen davebox simply lacks are all
# invisible to it. Those are found by asking, before reimplementing any host
# screen, what its version DOES that the shared part does not.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required"; exit 1; }

python3 - <<'PY'
import json, re, os, sys, collections

CAPTURE = 'tests/fixtures/module-contracts.json'

# Keys the host acts on that davebox is not expected to reach, each with the
# reason. ⚠ A reason, not a blanket: an exemption that does not say why is
# indistinguishable from one somebody forgot to remove.
EXEMPT = {
    'show_value':  'canvas overlay chrome — davebox does not host a module CANVAS, '
                   'it harvests the bank structure and draws its own screens',
    'show_footer': 'canvas overlay chrome — same reason as show_value',
}

def readall(paths):
    out = []
    for p in paths:
        if os.path.isfile(p):
            out.append(open(p, errors='ignore').read())
    return '\n'.join(out)

def files(d, ext='.mjs'):
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(ext)]

host   = readall(['src/shadow/shadow_ui.js'])
shared = readall(files('src/shared') + files('src/shared/param_pages'))
dbx    = readall(files('davebox/ui') + ['davebox/ui/ui.js'])

if not host or not shared or not dbx:
    print('FAIL: one of the three trees read EMPTY — this check would pass on anything')
    sys.exit(1)

def uses(blob, key):
    return re.search(r'["\'`]' + re.escape(key) + r'["\'`]|\.' + re.escape(key) + r'\b', blob) is not None

cap = json.load(open(CAPTURE))
mods = cap['modules']
mods = mods if isinstance(mods, list) else list(mods.values())

users = collections.defaultdict(set)
def walk(o, mid):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(k, str) and re.fullmatch(r'[a-z][a-z0-9_]*', k):
                users[k].add(mid)
            walk(v, mid)
    elif isinstance(o, list):
        for v in o:
            walk(v, mid)
for m in mods:
    walk(m, m.get('id') or m.get('name') or '?')

def is_gap(key):
    return (len(users.get(key, ())) >= 2 and uses(host, key)
            and not uses(shared, key) and not uses(dbx, key))

# ---- POSITIVE CONTROL ---------------------------------------------------
# A check that cannot fire is worse than no check, so prove the detector fires
# on a REAL field before believing its silence. The exempted canvas keys are
# exactly the shape being hunted — host reads them, neither other tree does —
# so they must register as gaps with the exemption lifted, and vanish with it.
#
# ⚠ `live_preview` is NOT the control any more, and that is the point: it was,
# until moving it into the shared library meant shadow_ui no longer reads it
# directly and the control could no longer be built. A control has to be
# rebuilt when the thing it controls moves.
control_key = next((k for k in EXEMPT if is_gap(k)), None)
if control_key is None:
    print('FAIL: no exempted key still registers as a gap, so this check has not been')
    print('      shown to fire at all. Rebuild the control before trusting a PASS.')
    sys.exit(1)
print(f'  ok   — control: the detector FIRES on a real field ({control_key}, '
      f'declared by {len(users[control_key])} modules) and is silenced only by its exemption')

gaps = []
for key, who in users.items():
    if len(who) < 2:            continue
    if key in EXEMPT:           continue
    if not uses(host, key):     continue
    if uses(shared, key):       continue
    if uses(dbx, key):          continue
    gaps.append((len(who), key, sorted(who)))

# An exemption for a key nothing declares any more is dead weight that hides the
# next real one behind it.
stale = [k for k in EXEMPT if len(users.get(k, ())) < 2]
if stale:
    print('FAIL: exemptions for keys no longer declared by two or more modules: '
          + ', '.join(sorted(stale)))
    print('      Remove them; a stale exemption is a place for the next gap to hide.')
    sys.exit(1)
print(f'  ok   — every exemption still names a live field ({len(EXEMPT)})')

if gaps:
    gaps.sort(reverse=True)
    print()
    print('FAIL: the host acts on these declared fields and dAVEBOx cannot reach them.')
    print('      Move the behaviour into src/shared/, or add the key to EXEMPT with a reason.')
    for n, key, who in gaps:
        print(f'        {key:26s} declared by {n} modules: {", ".join(who[:5])}'
              + (' …' if n > 5 else ''))
    sys.exit(1)

print(f'  ok   — ⭐ every declared field the host acts on is reachable by davebox '
      f'({len(users)} keys in the capture)')
print('PASS: no module-declared behaviour is stranded on the host side')
PY
