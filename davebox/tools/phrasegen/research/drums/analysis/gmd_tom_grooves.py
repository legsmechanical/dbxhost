# DK-tomgroove: tom OSTINATO bars in GMD beat files (all styles): a bar with >= 4 tom onsets whose
# tom onset pattern equals the previous or next bar's (i.e. a repeated tom groove, not a fill).
# Reports count per style, the per-slot P and mean velocity of the tom lane in those bars, and
# the top patterns. Usage (dir with groove/): python3 gmd_tom_grooves.py
import csv, sys, collections, statistics as st
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from gmd_drum_stats import load, CATS
per_style = collections.Counter(); pats = collections.Counter(); P = [0] * 16; V = [[] for _ in range(16)]
n = 0; snare_in = [0] * 16; files = collections.Counter()
for r in csv.DictReader(open('groove/info.csv')):
    if r['beat_type'] != 'beat' or r['time_signature'] != '4-4': continue
    ev, s16 = load(r)
    if not ev: continue
    nb = int(max(e[0] for e in ev) / (16 * s16)) + 1
    tom = collections.defaultdict(dict); sn = collections.defaultdict(set)
    for tk, nn, v in ev:
        q = round(tk / s16); b, s = q // 16, q % 16
        if nn in CATS['tom'] and s not in tom[b]: tom[b][s] = v
        if nn in CATS['snare'] and v > 45: sn[b].add(s)
    key = lambda b: ''.join('x' if i in tom[b] else '.' for i in range(16))
    for b in range(nb):
        if len(tom[b]) < 4: continue
        if not ((b > 0 and key(b - 1) == key(b)) or (b + 1 < nb and key(b + 1) == key(b))): continue
        n += 1; per_style[r['style']] += 1; pats[key(b)] += 1; files[r['midi_filename']] += 1
        for s, v in tom[b].items(): P[s] += 1; V[s].append(v)
        for s in sn[b]: snare_in[s] += 1
print('tom-ostinato bars', n, 'files', len(files))
print('by style', per_style.most_common(12))
print('tom P  ', [round(x / n, 2) for x in P]); print('tom vel', [round(st.mean(x)) if x else None for x in V])
print('snare P in those bars', [round(x / n, 2) for x in snare_in])
print('top', pats.most_common(8)); print('files', files.most_common(8))
