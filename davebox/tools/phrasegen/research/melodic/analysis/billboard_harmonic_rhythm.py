# M3: harmonic rhythm + chord vocabulary from the McGill Billboard chord annotations (salami_chords.txt, CC0).
# Usage: python3 billboard_harmonic_rhythm.py <dir containing McGill-Billboard/*/salami_chords.txt>
# Only 4/4 songs, only bars with exactly 4 beat slots (i.e. one chord token per beat, '.' = held) or 1/2 tokens
# (1 token = whole bar, 2 tokens = half bars). 'N'/'X' bars are skipped.
import glob, os, re, sys, collections
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def root(s):
    m = re.match(r'([A-G])([#b]*)', s); r = PC[m.group(1)]
    for c in m.group(2): r += 1 if c == '#' else -1
    return r % 12
DEG = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
bars = 0; per_bar = collections.Counter(); pos = collections.Counter(); qual = collections.Counter()
per2 = collections.Counter(); degs = collections.Counter(); songs = 0
for f in glob.glob(os.path.join(sys.argv[1], '**', 'salami_chords.txt'), recursive=True):
    txt = open(f).read()
    if '# metre: 4/4' not in txt: continue
    ton = re.search(r'# tonic: (\S+)', txt); t = root(ton.group(1)); songs += 1
    seq = []                                  # list of bars, each = list of 4 beat-chords
    for line in txt.split('\n'):
        for b in re.findall(r'\|([^|]*)(?=\|)', line):
            toks = b.split()
            if not toks or not all(x == '.' or re.match(r'[A-G]', x) for x in toks): seq.append(None); continue
            if len(toks) == 1: beats = toks * 4
            elif len(toks) == 2: beats = [toks[0]] * 2 + [toks[1]] * 2
            elif len(toks) == 4: beats = toks
            else: seq.append(None); continue
            out = []
            for x in beats: out.append(out[-1] if x == '.' and out else x)
            if out[0] == '.': seq.append(None); continue
            seq.append(out)
    prev = None
    for i, br in enumerate(seq):
        if br is None: prev = None; continue
        bars += 1; ch = 0
        for k, c in enumerate(br):
            last = br[k - 1] if k else prev
            if c != last:
                ch += 1; pos[k + 1] += 1
                q = c.split(':')[1] if ':' in c else 'maj'; qual[q.split('/')[0].split('(')[0]] += 1
                degs[DEG[(root(c) - t) % 12] + ('m' if q.startswith('min') else '')] += 1
        per_bar[ch] += 1; prev = br[-1]
        if i % 2 == 1 and seq[i - 1] is not None:
            per2[len({x for x in seq[i - 1] + br})] += 1
T = sum(per_bar.values())
print('songs', songs, '4/4 bars', bars)
print('chord onsets per bar (a held chord across the barline = 0):', [(k, round(v / T, 3)) for k, v in sorted(per_bar.items())])
P = sum(pos.values()); print('position of chord changes (beat 1-4):', [(k, round(v / P, 3)) for k, v in sorted(pos.items())])
Q = sum(per2.values()); print('distinct chords per 2-bar window:', [(k, round(v / Q, 3)) for k, v in sorted(per2.items())])
C = sum(qual.values()); print('chord quality share:', [(k, round(v / C, 3)) for k, v in qual.most_common(12)])
D = sum(degs.values()); print('chord root vs annotated tonic:', [(k, round(v / D, 3)) for k, v in degs.most_common(16)])
