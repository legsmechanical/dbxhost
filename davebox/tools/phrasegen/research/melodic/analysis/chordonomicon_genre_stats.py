# M2: key-free harmony statistics per genre from Chordonomicon v2 (CC BY-NC 4.0 -> REFERENCE ONLY, never ingest).
# Usage: python3 chordonomicon_genre_stats.py chordonomicon_v2.csv
# Chords are crowd-sourced chord sheets (no timing). The "tonic proxy" of a song = its most frequent chord
# (root+major/minor); degrees below are chord ROOTS in semitones above that proxy. An estimate, not a key.
import csv, re, sys, collections
csv.field_size_limit(10**9)
GROUPS = {
    'ROCK': lambda mg, t: mg == 'rock', 'PUNK': lambda mg, t: mg == 'punk', 'HIPHOP': lambda mg, t: mg == 'rap',
    'FUNK': lambda mg, t: bool(t & {'funk', 'p funk'}), 'DISCO': lambda mg, t: 'disco' in t,
    'HOUSE': lambda mg, t: bool(t & {'house', 'deep house', 'chicago house', 'acid house', 'tech house', 'progressive house'}),
    'TECHNO': lambda mg, t: bool(t & {'techno', 'minimal techno', 'detroit techno'}),
    'TRANCE': lambda mg, t: bool(t & {'trance', 'uplifting trance', 'progressive trance'}),
    'DNB': lambda mg, t: bool(t & {'drum and bass', 'liquid funk', 'jungle'}),
    'BREAKS': lambda mg, t: bool(t & {'breakbeat', 'big beat', 'nu skool breaks'}),
    'ELECTRO': lambda mg, t: 'electro' in t, 'SYNTHPOP': lambda mg, t: 'synthpop' in t,
    'NEWWAVE': lambda mg, t: bool(t & {'new wave', 'new wave pop'}),
    'POSTPUNK_GOTH': lambda mg, t: bool(t & {'post-punk', 'uk post-punk', 'american post-punk', 'gothic rock', 'dark wave', 'coldwave', 'deathrock', 'ethereal wave'}),
    'ITALO': lambda mg, t: bool(t & {'italo disco', 'italo dance', 'hi-nrg'}),
    'EBM': lambda mg, t: bool(t & {'ebm', 'electro-industrial', 'aggrotech'}),
    'SYNTHWAVE': lambda mg, t: bool(t & {'synthwave', 'retrowave', 'outrun', 'darksynth'}),
}
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def parse(c):
    m = re.match(r'^([A-G])((?:s|b)(?!us))?([^/]*)', c)
    if not m: return None
    r = (PC[m.group(1)] + {'s': 1, 'b': -1, None: 0}[m.group(2)]) % 12; q = m.group(3)
    if q == 'no3d': k = 'power'
    elif q.startswith('min'): k = 'm7' if q == 'min7' else ('m-ext' if q not in ('min',) else 'min')
    elif q == '': k = 'maj'
    elif q == '7': k = 'dom7'
    elif q.startswith('maj7') or q.startswith('maj9') or q.startswith('maj1'): k = 'maj7+'
    elif 'sus' in q: k = 'sus'
    elif q.startswith('dim') or q.startswith('aug'): k = 'dim/aug'
    else: k = 'ext'   # add9, 9, 11, 13, add13 ...
    minor = q.startswith('min') or q.startswith('dim')
    return r, k, minor
DEG = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
S = {g: collections.defaultdict(collections.Counter) for g in GROUPS}; N = collections.Counter()
for x in csv.DictReader(open(sys.argv[1])):
    tags = set(re.findall(r"'([^']+)'", x['genres'])); gs = [g for g, f in GROUPS.items() if f(x['main_genre'], tags)]
    if not gs: continue
    secs = []; cur = []
    for tok in x['chords'].split():
        if tok.startswith('<'):
            if cur: secs.append(cur)
            cur = []; continue
        p = parse(tok)
        if p: cur.append(p)
    if cur: secs.append(cur)
    allc = [c for s in secs for c in s]
    if len(allc) < 4: continue
    tonic = collections.Counter((r, mi) for r, k, mi in allc).most_common(1)[0][0]
    for g in gs:
        D = S[g]; N[g] += 1
        D['mode']['minor' if tonic[1] else 'major'] += 1
        for r, k, mi in allc:
            D['qual'][k] += 1
            D['deg_' + ('min' if tonic[1] else 'maj')][DEG[(r - tonic[0]) % 12] + ('m' if mi else '')] += 1
        seen = set()
        for r, k, mi in allc: seen.add(((r - tonic[0]) % 12, mi))
        if tonic[1]:
            D['minor_has']['bVII major'] += (10, False) in seen; D['minor_has']['V major'] += (7, False) in seen
            D['minor_has']['bVI major'] += (8, False) in seen; D['minor_has']['iv minor'] += (5, True) in seen
            D['minor_has']['IV major (dorian)'] += (5, False) in seen; D['minor_has']['n'] += 1
        else:
            D['major_has']['bVII major'] += (10, False) in seen; D['major_has']['bVI major'] += (8, False) in seen
            D['major_has']['bIII major'] += (3, False) in seen; D['major_has']['n'] += 1
        for s in secs:
            dist = []
            for c in s:
                if not dist or dist[-1] != c: dist.append(c)
            for a, b in zip(dist, dist[1:]):
                if a[0] != b[0]: D['motion'][(b[0] - a[0]) % 12] += 1
            D['secsize'][min(6, len(set(dist)))] += 1
def show(c, n=None, top=12):
    t = sum(v for k, v in c.items() if k != 'n'); return ', '.join(f'{k} {v / t:.2f}' for k, v in c.most_common(top) if k != 'n')
for g in GROUPS:
    D = S[g]; print(f'\n== {g}  songs {N[g]}')
    if not N[g]: continue
    print(' tonic-proxy mode:', show(D['mode']))
    print(' chord quality share:', show(D['qual']))
    print(' chord roots vs proxy (major songs):', show(D['deg_maj'], top=10))
    print(' chord roots vs proxy (minor songs):', show(D['deg_min'], top=10))
    mh = D['major_has']; nh = D['minor_has']
    if mh['n']: print(' major songs containing:', ', '.join(f'{k} {mh[k] / mh["n"]:.2f}' for k in mh if k != 'n'))
    if nh['n']: print(' minor songs containing:', ', '.join(f'{k} {nh[k] / nh["n"]:.2f}' for k in nh if k != 'n'))
    print(' root motion (semitones up, mod 12):', show(D['motion'], top=8))
    print(' distinct chords per section:', show(D['secsize'], top=6))
