# M1: per-track-role statistics of the ComMU dataset (CC BY-NC-SA 4.0 -> REFERENCE ONLY, never ingest).
# Usage: python3 commu_role_stats.py <dir holding commu_meta.csv and commu/commu_midi/...>
# Every sample is in C major or A minor, so pitch class relative to the tonic (C or A) = scale degree.
# Grid: 16th steps (4 per beat); only 4/4 'standard' (non-triplet) samples.
import csv, glob, os, sys, ast, collections, statistics as st, mido
root = sys.argv[1]
meta = {r['id']: r for r in csv.DictReader(open(os.path.join(root, 'commu_meta.csv')))}
paths = {os.path.basename(p)[:-4]: p for p in glob.glob(os.path.join(root, 'commu', '**', '*.mid'), recursive=True)}
PCN = ['R', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def chord_pcs(sym):
    """pitch classes of a ComMU chord symbol (root + quality triad/7th; enough for chord-tone tests)"""
    r = NOTE[sym[0]]; q = sym[1:]
    if q[:1] in ('#', 'b'): r = (r + (1 if q[0] == '#' else -1)) % 12; q = q[1:]
    if q.startswith('dim'): iv = [0, 3, 6] + ([9] if '7' in q else [])
    elif q.startswith('aug'): iv = [0, 4, 8]
    elif q.startswith('sus4'): iv = [0, 5, 7] + ([10] if '7' in q else [])
    elif q.startswith('m7b5'): iv = [0, 3, 6, 10]
    elif q.startswith('maj7') or q.startswith('M7'): iv = [0, 4, 7, 11]
    elif q.startswith('m'): iv = [0, 3, 7] + ([10] if '7' in q else [])
    elif q.startswith('7'): iv = [0, 4, 7, 10]
    else: iv = [0, 4, 7]
    return {(r + i) % 12 for i in iv}
def load(p):
    m = mido.MidiFile(p); tpb = m.ticks_per_beat; s16 = tpb / 4; notes = []; on = {}
    for tr in m.tracks:
        t = 0
        for msg in tr:
            t += msg.time
            if msg.type == 'note_on' and msg.velocity > 0: on[msg.note] = (t, msg.velocity)
            elif msg.type in ('note_off', 'note_on') and msg.note in on:
                t0, v = on.pop(msg.note); notes.append((t0 / s16, (t - t0) / s16, msg.note, v))
    return sorted(notes)
roles = collections.defaultdict(lambda: collections.defaultdict(list))
for sid, r in meta.items():
    if r['time_signature'] != '4/4' or r['sample_rhythm'] != 'standard' or sid not in paths: continue
    notes = load(paths[sid]); 
    if not notes: continue
    nb = int(r['num_measures']); tonic = 0 if r['audio_key'] == 'cmajor' else 9
    chords = ast.literal_eval(r['chord_progressions'])[0]          # one symbol per 8th note
    R = roles[(r['track_role'], r['audio_key'][1:])]; A = roles[(r['track_role'], 'all')]
    for D in (R, A):
        D['n'].append(1); D['notes_per_bar'].append(len(notes) / nb)
        onsets = collections.Counter(round(n[0]) for n in notes)
        D['poly'] += list(onsets.values())
        for q in onsets: D['slot'].append(q % 16)
        D['bars'].append(nb)
        for q, d, p, v in notes:
            D['dur'].append(d); D['pitch'].append(p); D['vel'].append(v); D['deg'].append((p - tonic) % 12)
        # voicing width of simultaneous onsets (>=2 notes)
        byq = collections.defaultdict(list)
        for q, d, p, v in notes: byq[round(q)].append(p)
        for q, ps in byq.items():
            if len(ps) >= 2: D['width'].append(max(ps) - min(ps))
        # monophonic line stats: top voice per onset
        line = [max(byq[q]) for q in sorted(byq)]
        D['iv'] += [b - a for a, b in zip(line, line[1:])]
        for b in range(0, nb, 2):                                 # range per 2-bar window
            w = [max(byq[q]) for q in byq if b * 16 <= q < (b + 2) * 16]
            if w: D['range2'].append(max(w) - min(w))
        # chord tone on beat onsets (steps 1/5/9/13) for the top voice
        for q in byq:
            if q % 4 == 0 and q // 2 < len(chords):
                D['ct_beat'].append((max(byq[q]) % 12) in chord_pcs(chords[q // 2]))
            elif q % 2 == 1 and q // 2 < len(chords):
                D['ct_16off'].append((max(byq[q]) % 12) in chord_pcs(chords[q // 2]))
        # harmonic rhythm: chord changes per 2 bars
        ch = [chords[i] for i in range(0, len(chords))]
        chg = sum(1 for a, b in zip(ch, ch[1:]) if a != b)
        D['chg_per2'].append(chg / (len(ch) / 16))
        D['chg_pos'] += [(i + 1) % 8 for i, (a, b) in enumerate(zip(ch, ch[1:])) if a != b]  # 8th slot of change
def pct(x, q): x = sorted(x); return x[min(len(x) - 1, int(q * len(x)))]
for key in sorted(roles):
    D = roles[key]; nbars = sum(D['bars'])
    print('\n==', key, 'samples', len(D['n']), 'bars', nbars)
    print(' notes/bar median', round(st.median(D['notes_per_bar']), 1), 'IQR', round(pct(D['notes_per_bar'], .25), 1), round(pct(D['notes_per_bar'], .75), 1))
    sc = collections.Counter(D['slot']); print(' P(onset) per 16th slot', [round(sc[i] / nbars, 2) for i in range(16)])
    print(' notes per onset: mean', round(st.mean(D['poly']), 2), 'dist', sorted(collections.Counter(min(x, 6) for x in D['poly']).items()))
    print(' voicing width (st) median', st.median(D['width']) if D['width'] else '-', 'p10/p90', (pct(D['width'], .1), pct(D['width'], .9)) if D['width'] else '')
    dd = collections.Counter(min(8, max(0, round(d))) for d in D['dur']); n = len(D['dur'])
    print(' dur (16ths, 8=>=8) share', [(k, round(v / n, 2)) for k, v in sorted(dd.items())], 'median', round(st.median(D['dur']), 2))
    print(' pitch median/p10/p90', st.median(D['pitch']), pct(D['pitch'], .1), pct(D['pitch'], .9), ' vel median', st.median(D['vel']))
    dg = collections.Counter(D['deg']); print(' degree share', [(PCN[k], round(v / n, 3)) for k, v in dg.most_common()])
    iv = D['iv']
    if iv:
        a = collections.Counter(min(12, abs(x)) for x in iv); m = len(iv)
        print(' top-voice |interval| share', [(k, round(v / m, 3)) for k, v in sorted(a.items())])
        up = [x for x in iv if x > 0]; dn = [x for x in iv if x < 0]
        print('  up', round(len(up) / m, 2), 'down', round(len(dn) / m, 2), 'leaps>=5 up share', round(sum(1 for x in up if x >= 5) / max(1, sum(1 for x in iv if abs(x) >= 5)), 2))
    print(' 2-bar range (st) median', st.median(D['range2']), 'p10/p90', pct(D['range2'], .1), pct(D['range2'], .9))
    if D['ct_beat']: print(' chord tone on beats', round(sum(D['ct_beat']) / len(D['ct_beat']), 2), ' on 16th off-beats', round(sum(D['ct_16off']) / max(1, len(D['ct_16off'])), 2))
    print(' chord changes per 2 bars median', st.median(D['chg_per2']), 'mean', round(st.mean(D['chg_per2']), 2))
    cp = collections.Counter(D['chg_pos']); print(' chord-change 8th position in bar (0=downbeat)', sorted(cp.items()))
