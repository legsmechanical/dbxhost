# Per-song measurement for research/refs: every part of every reference song reduced to NUMBERS.
# Nothing written here (or by refs_report.py) is a note sequence: per song we keep step-occupancy
# probabilities, histograms, quartiles and chord-numeral counts only, and refs_report.py aggregates
# them per genre. (The drum lane loops that research/lmd/analysis/lmd_measure.py also extracts are
# DROPPED here - see strip_drum_loops; only each drum lane's modal 16-step onset bar is kept, and the
# report publishes it only as a cross-song share, as research/lmd did.)
#
# Usage: python3 refs_measure.py <selection.json> <songs.jsonl> [workers]
#   selection.json = output of refs_build_selection.py (src, path, artist, title, year, genre, era).
#
# METHOD (see ../README.md for the full text):
# - Grid: research/lmd/analysis/lmd_measure.Grid (pretty_midi beats + downbeats; only bars that hold
#   4 beats under 4/4). Onset -> nearest 16th. A song is skipped if < 50 % of its bars are 4/4, the
#   tempo is outside 60..200, or its pitched onsets sit off the 16th grid (median |dev| > .15 of a
#   16th, or > 25 % near a triplet position).
# - Drums: lmd_measure.measure() (groove/fill split, categories, velocities), unchanged.
# - Key: Krumhansl-Kessler on the duration-weighted pitch-class histogram of the non-lead pitched
#   parts; the relative major/minor pair is then decided by where the BASS sits on downbeats (the
#   commonest KK failure is the relative key). Every pitch is expressed as semitones above the tonic,
#   i.e. the song transposed to C major / C minor.
# - Parts (one song may have several instruments per part; the one with most notes is the part's
#   representative): see classify().
import sys, os, json, re, collections, statistics as st, math
import numpy as np
import pretty_midi
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lmd', 'analysis'))
import lmd_measure as LM  # noqa: E402

PARTS = ['bass', 'chord', 'pad', 'keys', 'guitar', 'lead', 'arp', 'seq', 'fx']
LHL_W = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4]
MAJ_SCALE = {0, 2, 4, 5, 7, 9, 11}
MIN_SCALE = {0, 2, 3, 5, 7, 8, 10}


def lhl(steps):
    """Longuet-Higgins & Lee syncopation of one 16-step bar (cyclic) - research/analysis/lhl.py."""
    on = sorted(set(s % 16 for s in steps))
    if not on: return 0
    tot = 0
    for k, n in enumerate(on):
        nxt = on[(k + 1) % len(on)]
        span = range(n + 1, nxt if nxt > n else nxt + 16)
        rests = [LHL_W[r % 16] for r in span]
        if rests:
            d = max(rests) - LHL_W[n]
            if d > 0: tot += d
    return tot


# ---------------------------------------------------------------- part classification
NAME_RULES = [  # (regex on the track/instrument name, part)
    (r'\b(drum|kick|snare|hat|perc|cymbal|tom)s?\b', 'drop'),
    (r'\bbass(?!oon)', 'bass'),
    (r'\barp', 'arp'), (r'\bseq', 'seq'),
    (r'\b(vocal|voice|vox|melod|sing|lead ?voc|lyric|chant)', 'lead'),
    (r'\blead\b', 'lead'),
    (r'\b(pad|strings?|choir)\b', 'pad'),
    (r'\b(guit|gtr|guitar)', 'guitar'),
    (r'\b(piano|organ|rhodes|keys|wurli|clav|e\.?p\.?\b|harpsi)', 'keys'),
    (r'\b(fx|sfx|effect|noise|sweep|riser)\b', 'fx'),
]


def feats(rows):
    on = collections.defaultdict(list)
    for r in rows: on[r[0]].append(r)
    bars = collections.defaultdict(list)
    for q in sorted(on): bars[q // 16].append(q)
    poly = st.mean(len(v) for v in on.values())
    per = st.mean(len(v) for v in bars.values())
    lens = [r[3] for r in rows]
    pcs = st.mean(len({r[1] % 12 for q in qs for r in on[q]}) for qs in bars.values())
    span = st.mean(max(r[1] for q in qs for r in on[q]) - min(r[1] for q in qs for r in on[q]) for qs in bars.values())
    return dict(poly=poly, per=per, len_med=float(np.median(lens)), pcs=pcs, span=span,
                med=float(np.median([r[1] for r in rows])), n=len(rows), nbars=len(bars))


def classify(prog, name, f):
    """-> (part, source). Name first (transcribers label tracks), then GM program + behaviour."""
    nm = (name or '').lower()
    by_name = None
    for rx, p in NAME_RULES:
        if re.search(rx, nm): by_name = p; break
    mono = f['poly'] < 1.3
    dense = f['per'] >= 6 and f['len_med'] <= 2.0
    arpish = mono and dense and f['pcs'] >= 3 and f['span'] >= 7
    if by_name == 'drop': return None, 'name'
    if by_name in ('bass', 'guitar', 'arp', 'seq', 'fx'): return by_name, 'name'
    if by_name == 'lead': return 'lead', 'name-vocal' if re.search(r'voc|voice|vox|melod|sing|lyric', nm) else 'name'
    if by_name == 'pad': return ('pad' if (not mono or f['len_med'] >= 8) else 'lead'), 'name'
    if by_name == 'keys':
        if mono and not dense and f['med'] >= 58: return 'lead', 'name-keys-mono'
        return 'keys', 'name'
    # GM program
    if 32 <= prog <= 39: return 'bass', 'program'
    if 24 <= prog <= 31: return 'guitar', 'program'
    if prog >= 112: return None, 'program'           # ethnic percussion / sfx kits
    if 96 <= prog <= 103 or 120 <= prog <= 127: return 'fx', 'program'
    if prog <= 7 or 16 <= prog <= 20:
        if mono and f['med'] >= 58 and not dense: return 'lead', 'program-keys-mono'
        if arpish: return 'arp', 'behaviour'
        return 'keys', 'program'
    if 8 <= prog <= 15:
        if arpish: return 'arp', 'behaviour'
        if mono and dense: return 'seq', 'behaviour'
        return ('lead' if mono else 'keys'), 'program'
    if 48 <= prog <= 55 or 88 <= prog <= 95:
        if not mono or f['len_med'] >= 8: return 'pad', 'program'
        if arpish: return 'arp', 'behaviour'
        return 'lead', 'program'
    # synth leads 80-87, brass/reed/pipe 56-79, others: by behaviour
    if arpish: return 'arp', 'behaviour'
    if mono and dense: return 'seq', 'behaviour'
    if mono: return ('lead' if f['med'] >= 52 else 'seq'), 'behaviour'
    return ('pad' if f['len_med'] >= 6 else 'chord'), 'behaviour'


# ---------------------------------------------------------------- key
def est_key(parts_rows, bass_rows):
    h = np.zeros(12)
    for rows in parts_rows:
        for q, p, v, ln, d in rows: h[p % 12] += min(max(ln, .25), 16)
    if h.sum() <= 0: return None
    cands = []
    for mode, prof in (('maj', LM.MAJ), ('min', LM.MIN)):
        for t in range(12):
            cands.append((float(np.corrcoef(h, np.roll(prof, t))[0, 1]), t, mode))
    cands.sort(reverse=True)
    r, t, mode = cands[0]
    rel_t, rel_mode = ((t + 9) % 12, 'min') if mode == 'maj' else ((t + 3) % 12, 'maj')
    rel_r = next(c[0] for c in cands if c[1] == rel_t and c[2] == rel_mode)
    how = 'kk'
    if bass_rows:
        bw = np.zeros(12)
        for q, p, v, ln, d in bass_rows:
            w = min(max(ln, .25), 16) * (2.0 if q % 16 == 0 else 1.0 if q % 4 == 0 else .5)
            bw[p % 12] += w
        if r - rel_r < .08 and bw[rel_t] >= 1.3 * bw[t]:
            t, mode, r, how = rel_t, rel_mode, rel_r, 'bass-relative'
    return {'tonic': t, 'mode': mode, 'r': round(r, 3), 'how': how}


def modal_flavour(rows_list, tonic, mode):
    """'dorian' / 'phrygian' (minor) or 'mixolydian' / 'lydian' (major) when the degree that separates
    the mode from plain major/minor clearly outweighs the plain one (>= 1.5x and >= 4 % of the
    duration-weighted pitch-class mass); else the plain mode. A lean, not a certainty."""
    h = np.zeros(12)
    for rows in rows_list:
        for q, p, v, ln, d in rows: h[(p - tonic) % 12] += min(max(ln, .25), 16)
    if h.sum() <= 0: return mode
    h = h / h.sum()
    if mode == 'min':
        if h[9] >= 1.5 * h[8] and h[9] >= .04: return 'dorian'
        if h[1] >= 1.5 * h[2] and h[1] >= .04: return 'phrygian'
        return 'minor'
    if h[10] >= 1.5 * h[11] and h[10] >= .04: return 'mixolydian'
    if h[6] >= 1.5 * h[5] and h[6] >= .04: return 'lydian'
    return 'major'


# ---------------------------------------------------------------- chord naming
QUAL_SIMPLE = {'maj': 'maj', 'min': 'min', '7': 'maj', 'maj7': 'maj', 'm7': 'min', 'sus4': 'sus', 'sus2': 'sus',
               'dim': 'dim', 'aug': 'aug', 'add9': 'maj', 'madd9': 'min', '5': 'pow'}
MAJ_NUM = {0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: '#IV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII'}
MIN_NUM = {0: 'I', 1: 'bII', 2: 'II', 3: 'III', 4: '#III', 5: 'IV', 6: '#IV', 7: 'V', 8: 'VI', 9: '#VI', 10: 'VII', 11: '#VII'}


def numeral(deg, qual, mode):
    base = (MIN_NUM if mode == 'min' else MAJ_NUM)[deg]
    q = QUAL_SIMPLE.get(qual.replace('+ext', ''), 'maj')
    if q in ('min', 'dim'):
        base = re.sub(r'[IV]+', lambda m: m.group(0).lower(), base)
    return base + {'dim': 'o', 'aug': '+', 'sus': 'sus', 'pow': '5'}.get(q, '')


def harmony_seq(rows_list, tonic, mode, bass_rows):
    """Half-bar chord numerals from the harmonic parts (bass + chord/pad/keys/guitar/arp/seq); a window's
    pitch classes are those holding >= 15 % of its duration weight, named by lmd_measure.chord_quality."""
    W = collections.defaultdict(lambda: np.zeros(12)); low = {}
    for rows in rows_list:
        for q, p, v, ln, d in rows:
            t = q; end = q + max(ln, .25)
            while t < end - 1e-9:
                w = int(t // 8); seg = min(end, (w + 1) * 8) - t
                W[w][p % 12] += seg; t += seg
    for q, p, v, ln, d in bass_rows or []:
        w = q // 8
        if w not in low or p < low[w]: low[w] = p
    labels = {}
    for w, h in W.items():
        if h.sum() <= 0: continue
        pcs = {i for i in range(12) if h[i] >= .15 * h.sum()}
        c = LM.chord_quality(pcs, low[w] % 12 if w in low else None)
        if c: labels[w] = numeral((c[0] - tonic) % 12, diatonic(c[1], (c[0] - tonic) % 12, mode), mode)
    return labels


def diatonic(qual, deg, mode):
    """Power chords and sus chords carry no third: name them as the triad the mode puts on that degree
    (major key: I IV V major, ii iii vi minor, vii dim; minor key: i iv v minor, III VI VII major, ii dim;
    chromatic degrees major), so 'I5' and 'I' are one chord in a progression."""
    q = qual.replace('+ext', '')
    if q not in ('5', 'sus4', 'sus2'): return qual
    table = ({0: 'maj', 5: 'maj', 7: 'maj', 2: 'min', 4: 'min', 9: 'min', 11: 'dim'} if mode == 'maj' else
             {0: 'min', 5: 'min', 7: 'min', 3: 'maj', 8: 'maj', 10: 'maj', 2: 'dim'})
    return table.get(deg, 'maj')


# ---------------------------------------------------------------- per-part statistics
def part_stats(rows, part, tonic, shift, nbars_song):
    """rows: (q16, pitch, vel, len16, dev). Returns a dict of numbers only."""
    on = collections.defaultdict(list)
    for r in rows: on[r[0]].append(r)
    bars = collections.defaultdict(set)
    for q in on: bars[q // 16].add(q % 16)
    nb = len(bars)
    per = [len(s) for s in bars.values()]
    P = [0] * 16
    for s in bars.values():
        for i in s: P[i] += 1
    onsets = sorted(on)
    lens = [r[3] for r in rows]
    # gate = length / distance to the next onset of the part
    nxt = {a: b for a, b in zip(onsets, onsets[1:])}
    gates = [min(r[3] / (nxt[r[0]] - r[0]), 2.0) for r in rows if r[0] in nxt]
    vel = [r[2] for r in rows]
    flat = len(set(vel)) <= 2
    vm = st.mean(vel)
    acc = [None] * 16
    if not flat:
        bystep = collections.defaultdict(list)
        for r in rows: bystep[r[0] % 16].append(r[2])
        acc = [round(st.mean(bystep[i]) - vm, 1) if len(bystep[i]) >= 3 else None for i in range(16)]
    deg = collections.Counter((r[1] - tonic) % 12 for r in rows)
    reg = [r[1] + shift for r in rows]
    o = {'bars': nb, 'active': round(nb / max(1, nbars_song), 3), 'notes': len(rows),
         'density': float(np.median(per)), 'density_mean': round(st.mean(per), 2),
         'P': [round(x / nb, 3) for x in P],
         'lhl': round(st.mean(lhl(s) for s in bars.values()), 2),
         'off16': round(sum(1 for q in onsets if q % 2 == 1) / len(onsets), 3),
         'off8': round(sum(1 for q in onsets if q % 4 == 2) / len(onsets), 3),
         'len': [round(float(np.percentile(lens, x)), 2) for x in (25, 50, 75)],
         'gate': [round(float(np.percentile(gates, x)), 2) for x in (25, 50, 75)] if gates else None,
         'vel_flat': flat, 'vel_mean': round(vm, 1), 'vel_sd': round(st.pstdev(vel), 1), 'accent': acc,
         'deg': {str(k): round(v / len(rows), 4) for k, v in deg.items()},
         'reg': [int(np.percentile(reg, x)) for x in (25, 50, 75)],
         'poly': round(st.mean(len(v) for v in on.values()), 2)}
    # melodic line (top voice for lead/arp/seq, lowest for bass)
    if part in ('bass', 'lead', 'arp', 'seq'):
        pick = min if part == 'bass' else max
        mono = [pick(on[q], key=lambda r: r[1]) for q in onsets]
        iv = [b[1] - a[1] for a, b in zip(mono, mono[1:]) if b[0] - a[0] <= 8]
        if iv:
            c = collections.Counter(max(-12, min(12, x)) for x in iv)
            o['iv'] = {str(k): round(v / len(iv), 4) for k, v in c.items()}
            o['iv_n'] = len(iv)
        # pitch variety per bar
        pb = collections.defaultdict(set)
        for r in mono: pb[r[0] // 16].add(r[1] % 12)
        o['pcs_per_bar'] = round(st.mean(len(v) for v in pb.values()), 2)
    if part == 'arp':
        o['arp'] = arp_shape(on, bars)
    if part in ('chord', 'pad', 'keys', 'guitar'):
        o['chord'] = chord_voicing(on, tonic)
    o['loop'] = loop_share(on, bars)
    return o


def arp_shape(on, bars):
    shapes = collections.Counter(); rates = []; spans = []
    for b, steps in bars.items():
        qs = sorted(b * 16 + s for s in steps)
        if len(qs) < 4: continue
        top = [max(r[1] for r in on[q]) for q in qs]
        d = [y - x for x, y in zip(top, top[1:]) if y != x]
        if not d: shapes['static'] += 1; continue
        up = sum(1 for x in d if x > 0) / len(d)
        turns = sum(1 for x, y in zip(d, d[1:]) if (x > 0) != (y > 0))
        if up >= .75: shapes['up'] += 1
        elif up <= .25: shapes['down'] += 1
        elif turns <= max(2, len(d) // 3): shapes['updown'] += 1
        else: shapes['random'] += 1
        rates.append(float(np.median(np.diff(qs))))
        spans.append((max(top) - min(top)) / 12)
    n = sum(shapes.values())
    return {'shape': {k: round(v / n, 3) for k, v in shapes.items()} if n else {},
            'rate16': float(np.median(rates)) if rates else None,
            'oct_span': round(float(np.median(spans)), 2) if spans else None}


def chord_voicing(on, tonic):
    voices = []; spread = []; inv = 0; named = 0; qual = collections.Counter(); prev = None; changes = 0
    ch_on = 0
    bars_seen = set()
    for q in sorted(on):
        ps = sorted({r[1] for r in on[q]})
        bars_seen.add(q // 16)
        if len(ps) < 2: continue
        ch_on += 1
        voices.append(len(ps)); spread.append(ps[-1] - ps[0])
        pcs = frozenset(p % 12 for p in ps)
        if prev is not None and pcs != prev: changes += 1
        prev = pcs
        c = LM.chord_quality(set(pcs), ps[0] % 12)
        if c:
            named += 1; qual[QUAL_SIMPLE.get(c[1].replace('+ext', ''), 'other') + ('7' if c[1] in ('7', 'maj7', 'm7') else '')] += 1
            if ps[0] % 12 != c[0]: inv += 1
    if not ch_on: return {'chord_onset_share': 0.0}
    return {'chord_onset_share': round(ch_on / len(on), 3), 'voices': round(st.mean(voices), 2),
            'spread': [int(np.percentile(spread, x)) for x in (25, 50, 75)],
            'inversion_share': round(inv / named, 3) if named else None,
            'change_per_bar': round(changes / max(1, len(bars_seen)), 2),
            'qual': {k: round(v / named, 3) for k, v in qual.items()} if named else {}}


def loop_share(on, bars):
    """Repetition structure: 8-bar windows (aligned to multiples of 8 in the song) in which the part is
    active in every bar. Period 1 if every bar is identical (steps + pitches), else 2, else 4, else '>4'.
    'rhythm' repeats the test on onset steps only."""
    sig = {b: tuple(sorted((q % 16, tuple(sorted(r[1] for r in on[q]))) for q in on if q // 16 == b)) for b in bars}
    rsig = {b: tuple(sorted(bars[b])) for b in bars}
    out = {}
    for name, S in (('pitch', sig), ('rhythm', rsig)):
        c = collections.Counter()
        for w0 in range(0, (max(bars) // 8 + 1) * 8, 8):
            bs = list(range(w0, w0 + 8))
            if not all(b in S for b in bs): continue
            seq = [S[b] for b in bs]
            if all(x == seq[0] for x in seq): c['1'] += 1
            elif all(seq[i] == seq[i + 2] for i in range(6)): c['2'] += 1
            elif all(seq[i] == seq[i + 4] for i in range(4)): c['4'] += 1
            else: c['>4'] += 1
        n = sum(c.values())
        out[name] = {k: round(v / n, 3) for k, v in c.items()} if n else None
        out[name + '_n'] = n
    return out


# ---------------------------------------------------------------- song
def strip_drum_loops(d):
    d.pop('lanes', None)
    for c in (d.get('drums') or {}).values():
        c['top'] = c.get('top', [])[:1]  # the song's modal single-lane bar only (aggregated to shares)
    return d


def measure(s):
    path = os.path.expanduser(s['path'])
    pm = pretty_midi.PrettyMIDI(path)
    g = LM.Grid(pm)
    out = {'meter_valid_share': round(g.valid_share, 3)}
    _, tempi = pm.get_tempo_changes()
    out['tempo_changes'] = int(len(tempi))
    if len(tempi): out['tempo_range'] = [round(float(min(tempi)), 1), round(float(max(tempi)), 1)]
    tsc = sorted(pm.time_signature_changes, key=lambda x: x.time)
    out['ts'] = f'{tsc[0].numerator}/{tsc[0].denominator}' if tsc else '4/4 (none)'
    out['ts_changes'] = len(tsc)
    out['drums_present'] = sum(len(i.notes) for i in pm.instruments if i.is_drum) >= 64
    if g.valid_share < .5: out['skip'] = 'meter'; return out
    bpm = float(60.0 / np.median(np.diff(g.beats)))
    out['bpm'] = round(bpm, 1)
    if not 60 <= bpm <= 200: out['skip'] = 'tempo'; return out
    # drums (lmd_measure, unchanged) - computed from the same file
    LM.path_for = lambda root, tid, md5: path
    try:
        dr = LM.measure({'tid': 'x', 'md5': 'x'}, '')
    except Exception as e:  # noqa
        dr = {'skip': 'error:' + type(e).__name__}
    for k in ('bass', 'roles', 'harmony', 'key', 'pitched_skip'): dr.pop(k, None)
    out['drum'] = strip_drum_loops(dr)
    # pitched parts
    insts = [i for i in pm.instruments if not i.is_drum and len(i.notes) >= 16]
    table = {}; devs = []
    for idx, inst in enumerate(insts):
        rows = []
        for nt in inst.notes:
            q, d = LM.quant(g, nt.start)
            if q < 0: continue
            rows.append((q, nt.pitch, nt.velocity, g.tick_len(nt.start, nt.end), d)); devs.append(abs(d))
        if len(rows) >= 16: table[idx] = sorted(rows)
    if not table: out['pskip'] = 'nopitched'; return out
    devs = np.array(devs)
    out['pitch_med_dev'] = round(float(np.median(devs)), 3)
    trip = float(np.mean((devs >= .25) & (devs <= .42)))
    out['pitch_trip_share'] = round(trip, 3)
    if np.median(devs) > .15 or trip >= .25:
        out['pskip'] = 'offgrid'; return out
    all_bars = sorted({r[0] // 16 for rows in table.values() for r in rows})
    nbars_song = all_bars[-1] - all_bars[0] + 1
    # classify
    cls = {}
    for k, rows in table.items():
        f = feats(rows)
        part, how = classify(insts[k].program, insts[k].name, f)
        if part: cls[k] = [part, how, f]
    # one primary bass: the bass-classified part with the most notes; other 'bass' parts: low + mono ->
    # stay bass (doubling), else seq
    bass_ks = [k for k in cls if cls[k][0] == 'bass']
    if not bass_ks:
        low = [k for k in cls if cls[k][2]['med'] < 50 and cls[k][2]['poly'] < 1.3 and cls[k][0] in ('seq', 'lead')]
        if low:
            k = min(low, key=lambda k: cls[k][2]['med']); cls[k][0] = 'bass'; cls[k][1] = 'lowest'; bass_ks = [k]
    bass_k = max(bass_ks, key=lambda k: len(table[k])) if bass_ks else None
    for k in bass_ks:
        if k != bass_k and cls[k][2]['med'] >= 48: cls[k][0] = 'seq'
    harm_ks = [k for k in cls if cls[k][0] in ('bass', 'chord', 'pad', 'keys', 'guitar', 'arp', 'seq')]
    key = est_key([table[k] for k in harm_ks] or [table[k] for k in cls], table[bass_k] if bass_k is not None else None)
    if not key: out['pskip'] = 'nokey'; return out
    ks = pm.key_signature_changes
    if ks:
        kn = ks[0].key_number  # 0-11 major, 12-23 minor
        out['keysig'] = {'tonic': kn % 12, 'mode': 'min' if kn >= 12 else 'maj'}
    out['key'] = key
    tonic, mode = key['tonic'], key['mode']
    out['modal'] = modal_flavour([table[k] for k in harm_ks] or [table[k] for k in cls], tonic, mode)
    shift = -tonic if tonic <= 6 else 12 - tonic  # transpose to C by the smaller move (-6..+5)
    parts = {}
    for p in PARTS:
        ks_ = [k for k in cls if cls[k][0] == p]
        if not ks_: continue
        k0 = max(ks_, key=lambda k: len(table[k]))
        st_ = part_stats(table[k0], p, tonic, shift, nbars_song)
        st_['n_insts'] = len(ks_); st_['how'] = cls[k0][1]; st_['program'] = insts[k0].program
        parts[p] = st_
    out['parts'] = parts
    # harmony
    labels = harmony_seq([table[k] for k in harm_ks if k in table], tonic, mode,
                         table[bass_k] if bass_k is not None else None)
    ws = sorted(labels)
    seq = []
    for w in ws:
        if not seq or seq[-1][1] != labels[w]: seq.append((w, labels[w]))
    chords = [x[1] for x in seq]
    ng = collections.Counter(tuple(chords[i:i + 4]) for i in range(len(chords) - 3))
    ng3 = collections.Counter(tuple(chords[i:i + 3]) for i in range(len(chords) - 2))
    adj = sum(1 for a, b in zip(ws, ws[1:]) if b == a + 1)
    chg = sum(1 for a, b in zip(ws, ws[1:]) if b == a + 1 and labels[a] != labels[b])
    out['harmony'] = {'windows': len(labels), 'change_per_bar': round(2 * chg / adj, 3) if adj else None,
                      'chords': dict(collections.Counter(labels.values()).most_common(16)),
                      'ng4': {' '.join(k): v for k, v in ng.most_common(12)},
                      'ng3': {' '.join(k): v for k, v in ng3.most_common(12)}}
    out['n_bars'] = nbars_song
    return out


def run_one(s):
    try:
        r = measure(s)
    except Exception as e:  # noqa
        r = {'skip': 'error:' + type(e).__name__ + ':' + str(e)[:60]}
    r.update({k: s.get(k) for k in ('src', 'id', 'md5', 'artist', 'title', 'year', 'genre', 'era', 'evidence')})
    return r


def main():
    sel = json.load(open(os.path.expanduser(sys.argv[1])))
    outp = open(os.path.expanduser(sys.argv[2]), 'w')
    nw = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    import multiprocessing as mp, warnings
    warnings.filterwarnings('ignore')
    with mp.Pool(nw) as pool:
        for i, r in enumerate(pool.imap_unordered(run_one, sel, chunksize=4)):
            outp.write(json.dumps(r, default=lambda o: o.item() if hasattr(o, 'item') else str(o)) + '\n')
            if i % 100 == 0: print(i, file=sys.stderr, flush=True)


if __name__ == '__main__': main()
