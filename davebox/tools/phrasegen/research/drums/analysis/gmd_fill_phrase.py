# DK-fill: where do FILL BARS (definition as gmd_drum_stats.py) fall in a 4-/8-bar phrase counted from
# the start of each GMD beat file? Usage (dir with groove/): python3 gmd_fill_phrase.py <family>
import csv, sys, collections
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from gmd_drum_stats import match, load, CATS
fam = sys.argv[1]; m4 = collections.Counter(); n4 = collections.Counter(); m8 = collections.Counter(); n8 = collections.Counter()
run = collections.Counter()
for r in csv.DictReader(open('groove/info.csv')):
    if not match(r['style'], fam) or r['beat_type'] != 'beat' or r['time_signature'] != '4-4': continue
    ev, s16 = load(r)
    if not ev: continue
    nb = int(max(e[0] for e in ev) / (16 * s16)) + 1
    if nb < 8: continue
    tom = collections.defaultdict(set); sn = collections.defaultdict(set)
    for tk, n, v in ev:
        q = round(tk / s16); b, s = q // 16, q % 16
        if n in CATS['tom']: tom[b].add(s)
        if n in CATS['snare'] and v > 60 and s >= 8 and s != 12: sn[b].add(s)
    fill = [bool(tom[b]) or len(sn[b]) >= 3 for b in range(nb)]
    for b in range(nb):
        n4[b % 4] += 1; m4[b % 4] += fill[b]; n8[b % 8] += 1; m8[b % 8] += fill[b]
    k = 0
    for x in fill + [False]:
        if x: k += 1
        elif k: run[min(k, 5)] += 1; k = 0
print(fam, 'P(fill | bar%4)', {k: round(m4[k] / n4[k], 2) for k in sorted(n4)})
print(fam, 'P(fill | bar%8)', {k: round(m8[k] / n8[k], 2) for k in sorted(n8)})
print(fam, 'fill-run lengths (5 = 5+)', dict(sorted(run.items())))
