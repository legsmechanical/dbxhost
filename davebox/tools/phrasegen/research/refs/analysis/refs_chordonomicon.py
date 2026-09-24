# Chord-sheet progressions per reference genre from Chordonomicon v2 (Hugging Face ailsntua/Chordonomicon,
# CC BY-NC 4.0 -> REFERENCE ONLY: aggregates here, nothing ingested). A second, larger source for the
# ROMAN-NUMERAL n-grams, independent of the MIDI transcriptions (no timing, no voicing).
#
# Usage: python3 refs_chordonomicon.py ~/phrasegen-cache/refs/chordonomicon/chordonomicon_v2.csv <out.json>
#
# Per song: chord tokens (section tags dropped, slash-bass dropped) -> key by Krumhansl-Kessler on the
# chord-tone pitch-class histogram (each chord token once), relative major/minor decided by which
# tonic TRIAD occurs more often -> mode-relative numerals (minor: III VI VII = b3 b6 b7) -> consecutive
# repeats collapsed -> 4-grams. A 4-gram is folded into its ROTATION FAMILY (i-VI-III-VII and
# VI-III-VII-i are the same loop) named from the rotation that starts on the tonic when it has one;
# a 4-gram whose ends meet is a 3-chord loop, an a-b-a-b 4-gram a 2-chord loop.
# Reported: share of songs whose sheet contains the family at least twice, and the song-weighted share
# of all 4-grams. Era: release year <= 1995 = '80s', >= 2000 = 'new'.
import csv, sys, re, json, collections
import numpy as np
csv.field_size_limit(10 ** 9)

GROUPS = {  # spotify artist-genre substrings (lower case) -> reference group
    'darksynth': ['darksynth'],
    'synthwave': ['synthwave', 'retrowave', 'outrun'],
    'darkwave': ['dark wave', 'darkwave', 'coldwave', 'cold wave', 'minimal wave', 'ethereal wave',
                 'neue deutsche todeskunst', 'dark synthpop'],
    'goth': ['gothic rock', 'deathrock', 'gothic post-punk', 'modern goth', 'batcave', 'gothic alternative'],
    'postpunk': ['post-punk', 'no wave', 'dance-punk'],
    'newwave': ['new wave'],
    'synthpop': ['synthpop', 'synth-pop', 'electropop'],
    'italo': ['italo disco', 'italo dance', 'hi-nrg', 'eurodisco'],
    'ebm': ['ebm', 'electro-industrial', 'aggrotech', 'futurepop', 'dark electro'],
    'punk': ['punk'],
    'rock': ['rock'],
    'house': ['house'], 'techno': ['techno'], 'trance': ['trance'], 'dnb': ['drum and bass', 'jungle', 'liquid funk'],
    'breaks': ['breakbeat', 'big beat'], 'garage': ['uk garage', '2-step', 'speed garage', 'future garage'],
    'acid': ['acid house', 'acid techno'], 'dub': ['dub', 'roots reggae', 'reggae'], 'ambient': ['ambient'],
    'hardcore': ['happy hardcore', 'gabber', 'hardcore techno', 'breakbeat hardcore', 'uk hardcore', 'hardstyle'],
    'electro': ['electro', 'freestyle'], 'disco': ['disco'], 'funk': ['funk'], 'hiphop': ['hip hop', 'rap'],
    'pop': ['pop'],
    'industrial': ['industrial'], 'metal': ['metal'], 'indie': ['indie'], 'alt': ['alternative rock', 'alternative'],
    'shoegaze': ['shoegaze'], 'dreampop': ['dream pop'], 'grunge': ['grunge'], 'rnb': ['r&b'], 'soul': ['soul'],
    'neosoul': ['neo soul', 'neo-soul'], 'reggae': ['reggae', 'rocksteady', 'lovers rock'], 'dancehall': ['dancehall', 'ragga'],
    'ska': ['ska'], 'latin': ['latin'], 'reggaeton': ['reggaeton', 'urbano latino', 'trap latino'],
    'salsa': ['salsa', 'timba', 'mambo'], 'bossa': ['bossa nova', 'mpb', 'samba'], 'cumbia': ['cumbia'],
    'jazz': ['jazz'], 'swing': ['swing', 'big band'], 'bebop': ['bebop', 'hard bop'], 'jazzfunk': ['jazz funk', 'acid jazz'],
    'country': ['country'], 'folk': ['folk'], 'bluegrass': ['bluegrass'], 'kpop': ['k-pop'], 'jpop': ['j-pop', 'j-rock', 'anime'],
    'citypop': ['city pop'], 'hyperpop': ['hyperpop'], 'trap': ['trap'], 'lofi': ['lo-fi', 'chillhop', 'jazz boom bap'],
    'boombap': ['boom bap', 'east coast hip hop', 'golden age hip hop'], 'jungle': ['jungle'], 'blues': ['blues'],
}
EXCLUDE = {'punk': ['post-punk', 'dance-punk'], 'rock': ['punk', 'goth'], 'dub': ['dubstep', 'dublin'],
           'soul': ['neo soul', 'neo-soul'], 'jazz': ['jazz funk', 'acid jazz', 'jazz rap', 'jazz boom bap'],
           'folk': ['folk punk', 'folk metal'], 'trap': ['trap latino', 'trap queen'], 'metal': ['metalcore'],
           'alt': ['alternative metal', 'alternative hip hop'],
           'electro': ['electropop', 'electronica', 'electro house', 'electronic rock'],
           'hardcore': ['post-hardcore', 'hardcore punk'], 'pop': ['punk', 'synthpop', 'k-pop'],
           'house': ['tropical house', 'slap house', 'stutter house']}
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJ_NUM = {0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: '#IV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII'}
MIN_NUM = {0: 'I', 1: 'bII', 2: 'II', 3: 'III', 4: '#III', 5: 'IV', 6: '#IV', 7: 'V', 8: 'VI', 9: '#VI', 10: 'VII', 11: '#VII'}


def parse(tok):
    m = re.match(r'^([A-G])(s|b)?(.*)$', tok.split('/')[0])
    if not m: return None
    r = (PC[m.group(1)] + {'s': 1, 'b': -1, None: 0}[m.group(2)]) % 12
    q = m.group(3)
    if q.startswith('dim'): return r, 'dim', {r, (r + 3) % 12, (r + 6) % 12}
    if q.startswith('min') or (q.startswith('m') and not q.startswith('maj')):
        return r, 'min', {r, (r + 3) % 12, (r + 7) % 12}
    if q.startswith('sus'): return r, 'sus', {r, (r + 7) % 12}
    if q == 'no3d' or q == '5': return r, 'pow', {r, (r + 7) % 12}
    if q.startswith('aug'): return r, 'aug', {r, (r + 4) % 12, (r + 8) % 12}
    return r, 'maj', {r, (r + 4) % 12, (r + 7) % 12}


def numeral(deg, q, mode):
    b = (MIN_NUM if mode == 'min' else MAJ_NUM)[deg]
    if q in ('min', 'dim'): b = re.sub(r'[IV]+', lambda m: m.group(0).lower(), b)
    return b + {'dim': 'o', 'aug': '+', 'sus': 'sus', 'pow': '5'}.get(q, '')


def key_of(ch):
    h = np.zeros(12)
    for r, q, pcs in ch:
        for p in pcs: h[p] += 1
    if h.sum() == 0: return None
    best = max(((np.corrcoef(h, np.roll(P, t))[0, 1], t, m) for m, P in (('maj', MAJ), ('min', MIN)) for t in range(12)))
    _, t, m = best
    rt, rm = ((t + 9) % 12, 'min') if m == 'maj' else ((t + 3) % 12, 'maj')
    cnt = lambda tt, mm: sum(1 for r, q, _ in ch if r == tt and q == ('min' if mm == 'min' else 'maj'))
    if cnt(rt, rm) > 1.2 * cnt(t, m): t, m = rt, rm
    return t, m


def family(ng, tonic_names=('I', 'i')):
    # reduce to the loop's minimal period: 'I IV I IV' is the 2-chord loop I-IV, 'VII i VI VII' the
    # 3-chord loop i-VI-VII (its ends meet)
    if ng[0] == ng[2] and ng[1] == ng[3]: ng = ng[:2]
    elif ng[0] == ng[3]: ng = ng[:3]
    rots = [ng[i:] + ng[:i] for i in range(len(ng))]
    ton = [r for r in rots if r[0] in tonic_names]
    return ' '.join(ton[0] if ton else min(rots))


def groups_of(gstr):
    gl = [g.strip(" '\"") for g in gstr.strip('[]').split(',')]
    gl = [g for g in gl if g]
    out = set()
    for G, subs in GROUPS.items():
        for g in gl:
            if any(s in g for s in subs) and not any(x in g for x in EXCLUDE.get(G, [])):
                out.add(G); break
    return out


def main():
    rows = csv.DictReader(open(sys.argv[1]))
    A = collections.defaultdict(lambda: {'n': 0, 'minor': 0, 'fam_songs': collections.Counter(),
                                         'ng_share': collections.Counter(), 'chords': collections.Counter(),
                                         'changes': []})
    for r in rows:
        gs = groups_of(r['genres'])
        if not gs: continue
        toks = [t for t in r['chords'].split() if not t.startswith('<')]
        ch = [c for c in (parse(t) for t in toks) if c]
        if len(ch) < 8: continue
        k = key_of(ch)
        if not k: continue
        t, m = k
        nums = [numeral((c[0] - t) % 12, c[1], m) for c in ch]
        seq = [x for i, x in enumerate(nums) if i == 0 or x != nums[i - 1]]
        ngs = [tuple(seq[i:i + 4]) for i in range(len(seq) - 3)]
        if not ngs: continue
        fams = collections.Counter(family(n, ('i',) if m == 'min' else ('I',)) for n in ngs)
        y = (r.get('release_date') or '')[:4]
        era = '80s' if y.isdigit() and int(y) <= 1995 else ('new' if y.isdigit() and int(y) >= 2000 else '')
        for G in gs:
            for key in (G, G + ':' + era) if era else (G,):
                a = A[key]; a['n'] += 1; a['minor'] += m == 'min'
                for f, c in fams.items():
                    if c >= 2: a['fam_songs'][f + ' |' + m] += 1
                    a['ng_share'][f + ' |' + m] += c / len(ngs)
                for x in set(seq): a['chords'][x + ' |' + m] += 1
    out = {}
    for G, a in sorted(A.items()):
        n = a['n']
        out[G] = {'songs': n, 'minor_share': round(a['minor'] / n, 3),
                  'families_songs_share': [(f, round(c / n, 3)) for f, c in a['fam_songs'].most_common(15)],
                  'families_ngram_share': [(f, round(c / n, 4)) for f, c in a['ng_share'].most_common(15)],
                  'chords_songs_share': [(f, round(c / n, 3)) for f, c in a['chords'].most_common(20)]}
    json.dump(out, open(sys.argv[2], 'w'), indent=1)
    for G in GROUPS:
        if G in out:
            o = out[G]
            print(G, o['songs'], 'minor', o['minor_share'], o['families_songs_share'][:4])


if __name__ == '__main__': main()
