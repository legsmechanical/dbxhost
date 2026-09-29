#!/usr/bin/env bash
# tests/host/test_site_ribbon_sync.sh — every manager page carries the editor's
# site ribbon (Josh, 2026-09-27: "headers need to be consistent across modes and
# match what's at root"). The ribbon exists in two copies — the editor's
# (davebox/web_ui.html, which must also render in the offline preview, where
# /static is not served) and the manager's (schwung-manager/templates/base.html)
# — so this holds them to the same brand and the same links, in the same order,
# and the manager's sheet to the editor's ribbon values.
set -u
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "FAIL: python3 required"; exit 1; }
python3 - <<'PY'
import re, sys
def ribbon(path):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'<div id="site">(.*?)</div>', s, re.S)
    if not m: return None
    body = m.group(1)
    brand = re.search(r'<a class="sitebrand" href="([^"]+)"[^>]*>(.*?)</a>', body, re.S)
    links = re.findall(r'<a href="([^"]+)"[^>]*>([^<]+)</a>', body.split('class="sitelinks"', 1)[-1])
    return (brand.groups() if brand else None, links)
ed, mg = ribbon('davebox/web_ui.html'), ribbon('schwung-manager/templates/base.html')
bad = 0
def fail(m):
    global bad; print('  FAIL — ' + m); bad = 1
if not ed: fail('no #site ribbon in davebox/web_ui.html')
if not mg: fail('no #site ribbon in schwung-manager/templates/base.html')
if ed and mg:
    if ed[0] != mg[0]: fail('brand differs: %r vs %r' % (ed[0], mg[0]))
    if ed[1] != mg[1]: fail('links differ:\n      editor  %r\n      manager %r' % (ed[1], mg[1]))
    if len(ed[1]) < 5: fail('control: the editor ribbon parsed to %r' % (ed[1],))
    if not bad: print('  ok   — brand and %d links identical: %s' % (len(ed[1]), ' · '.join(l for _, l in ed[1])))
# The look: the editor's ribbon values appear in the manager's #site rules.
css = open('schwung-manager/static/style.css', encoding='utf-8').read()
for v in ('height: 34px', 'background: #0b0d11', 'border-bottom: 1px solid #1b212b', 'font-size: 15px', 'font-size: 13px', 'color: #a9afbb', 'color: #39d0c8'):
    if v not in css: fail('the manager ribbon lacks the editor value %r' % v)
if re.search(r'<header\b', open('schwung-manager/templates/base.html', encoding='utf-8').read()):
    fail('base.html still has its own <header> bar')
print(('FAIL' if bad else 'PASS') + ': test_site_ribbon_sync.sh'); sys.exit(bad)
PY
