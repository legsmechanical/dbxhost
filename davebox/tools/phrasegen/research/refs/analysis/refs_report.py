# Aggregate refs_measure.py output per genre (and per era for the priority groups) into
#   stats/<genre>.json   machine-readable targets keyed by part
#   analysis/out/<genre>_tables.md  the full tables (the prose in ../<genre>.md quotes from these)
#   analysis/out/summary.md, analysis/out/counts.json
# Usage: python3 refs_report.py ~/phrasegen-cache/refs/songs.jsonl <research/refs dir> [chordonomicon_stats.json]
#   The optional third file (refs_chordonomicon.py output) adds chord-sheet loop families per genre.
#
# Every number is SONG-WEIGHTED: a statistic is computed per song first, then combined across songs
# (quartiles of the per-song values, or the mean of per-song shares), so a long song never dominates.
# Velocity/accent numbers use only songs whose part is not flat (> 2 distinct velocities).
import sys, os, json, collections, statistics as st
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs_genres as R
from refs_chordonomicon import family

PARTS = ['bass', 'chord', 'pad', 'keys', 'guitar', 'lead', 'arp', 'seq', 'fx']
DEG = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']
CATS = ['kick', 'snare', 'hat', 'tom', 'perc', 'cymb']
MIN_SONGS_ERA = 12
# Niche styles are FLAVOURS of a public parent style (refs_genres.FLAVOUR_OF): measured as their own
# group, then reported inside the parent's stats JSON ('flavours' block: full targets + deltas).


def profile(O):
    """Flat {metric: number} summary of an aggregated group, used for the flavour deltas."""
    P = O.get('parts') or {}; D = O.get('drums') or {}; H = O.get('harmony') or {}
    g = lambda d, *ks: _get(d, ks)
    m = {'tempo_p50': g(O, 'tempo', 1), 'minor_share': O.get('minor_share'),
         'chord_changes_per_bar': g(H, 'change_per_bar', 1)}
    for p in ('bass', 'lead', 'arp', 'seq', 'pad', 'chord', 'keys', 'guitar'):
        a = P.get(p)
        m[f'{p}_presence'] = a['presence'] if a else 0.0
        # a part's shape metrics only when >= 5 songs AND >= 30 % of the group have the part: a thin
        # flavour's 2-song arp is anecdote, not a delta
        if not a or a['songs'] < 5 or a['presence'] < .3: continue
        m[f'{p}_onsets_per_bar'] = g(a, 'density_per_bar', 1)
        m[f'{p}_gate'] = g(a, 'gate', 1)
        m[f'{p}_len16'] = g(a, 'len16', 1)
        m[f'{p}_offbeat16_share'] = g(a, 'syncopation', 'offbeat16_share', 1)
        m[f'{p}_register_med'] = g(a, 'register', 1)
        m[f'{p}_loop_1bar_rhythm'] = g(a, 'loop_share_rhythm', '1')
        if 'interval_classes' in a:
            for k in ('repeat', 'step_1_2', 'leap_5_7', 'octave'):
                m[f'{p}_iv_{k}'] = g(a, 'interval_classes', k, 1)
        if 'poly' in a:
            m[f'{p}_voices'] = g(a, 'poly', 'voices', 1)
    for k, v in (D.get('families') or {}).items(): m['drum_' + k] = v
    if D:
        m['drum_open_hat_share'] = D['hat'].get('open_share')
        m['drum_flat_share'] = D.get('flat_share')
        for c in ('kick', 'snare', 'hat'):
            m[f'drum_{c}_hits_per_bar'] = g(D, c, 'hits_per_bar', 1)
    return m


def _get(d, ks):
    for k in ks:
        if d is None: return None
        try:
            d = d[k]
        except (KeyError, IndexError, TypeError):
            return None
    return d


def flavour_block(F, Pa, chords=None):
    pf, pp = profile(F), profile(Pa)
    deltas = {}
    for k in pf:
        a, b = pf.get(k), pp.get(k)
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            deltas[k] = {'flavour': round(a, 3), 'parent': round(b, 3), 'delta': round(a - b, 3)}
    # the metrics that move most, relative to a scale per kind
    def scale(k):
        if k.startswith('tempo'): return 10.0
        if 'register' in k: return 6.0
        if 'onsets' in k or 'hits' in k or 'len16' in k or 'voices' in k: return 2.0
        return .15
    top = sorted(((k, v['delta'] / scale(k)) for k, v in deltas.items()), key=lambda x: -abs(x[1]))
    steps = {}
    for p in ('bass', 'lead', 'arp', 'seq'):
        a = (F.get('parts') or {}).get(p); b = (Pa.get('parts') or {}).get(p)
        if a and b and a['songs'] >= 3:
            steps[p] = [round(x - y, 3) for x, y in zip(a['step_onset_prob'], b['step_onset_prob'])]
    for c in ('kick', 'snare', 'hat'):
        a = (F.get('drums') or {}).get(c); b = (Pa.get('drums') or {}).get(c)
        if a and b: steps['drum_' + c] = [round(x - y, 3) for x, y in zip(a['step_onset_prob'], b['step_onset_prob'])]
    H = F.get('harmony') or {}
    if F['measured'] < 5:  # too few songs for a delta to mean anything; keep only the chord-sheet data
        return {'songs': F['measured'], 'artists': F['artists'], 'sources': F['sources'], 'eras': F['eras'],
                'distinctive': [], 'deltas': {}, 'step_onset_prob_delta': {}, 'progression_ngrams': {},
                'distinctness': None, 'note': 'fewer than 5 measured songs: no deltas',
                **({'chord_sheets': chords} if chords else {})}
    blk = {'songs': F['measured'], 'artists': F['artists'], 'sources': F['sources'], 'eras': F['eras'],
           'distinctive': [{'metric': k, 'flavour': deltas[k]['flavour'], 'parent': deltas[k]['parent'],
                            'delta': deltas[k]['delta']} for k, z in top if abs(z) >= 1][:14],
           'deltas': deltas, 'step_onset_prob_delta': steps,
           'progression_ngrams': {m: H[m]['progression_families'][:8] for m in ('min', 'maj') if m in H},
           'distinctness': round(float(np.mean([min(abs(z), 3) for _, z in top])), 2) if top else None}
    if chords: blk['chord_sheets'] = chords
    return blk


def chord_sheet(CH, g):
    if not CH or g not in CH: return None
    x = CH[g]
    return {'songs': x['songs'], 'minor_share': x['minor_share'], 'loops': x['families_songs_share'][:10],
            'eras': {e: {'songs': CH[f'{g}:{e}']['songs'], 'minor_share': CH[f'{g}:{e}']['minor_share'],
                         'loops': CH[f'{g}:{e}']['families_songs_share'][:6]}
                     for e in ('80s', 'new') if f'{g}:{e}' in CH and CH[f'{g}:{e}']['songs'] >= 10}}


def q3(xs, r=2):
    xs = [x for x in xs if x is not None]
    if not xs: return None
    return [round(float(np.percentile(xs, p)), r) for p in (25, 50, 75)]


def mean(xs, r=3):
    xs = [x for x in xs if x is not None]
    return round(float(np.mean(xs)), r) if xs else None


def med(xs, r=2):
    xs = [x for x in xs if x is not None]
    return round(float(np.median(xs)), r) if xs else None


def share_mean(dicts, keys=None, r=3):
    """mean over songs of a {key: share} dict (missing key = 0)."""
    dicts = [d for d in dicts if d]
    if not dicts: return {}
    ks = keys or sorted({k for d in dicts for k in d})
    return {k: round(float(np.mean([d.get(k, 0) for d in dicts])), r) for k in ks}


def fold_bpm(b): return b * 2 if b < 85 else (b / 2 if b > 180 else b)


def agg_part(rows, p):
    P = [r['parts'][p] for r in rows if p in r.get('parts', {}) and r['parts'][p]['bars'] >= 4]
    if not P: return None
    dyn = [x for x in P if not x['vel_flat']]
    o = {'songs': len(P), 'presence': round(len(P) / len(rows), 3),
         'density_per_bar': q3([x['density'] for x in P], 1),
         'active_bar_share': q3([x['active'] for x in P]),
         'step_onset_prob': [round(float(np.mean([x['P'][i] for x in P])), 3) for i in range(16)],
         'syncopation': {'lhl_per_bar': q3([x['lhl'] for x in P], 1), 'offbeat16_share': q3([x['off16'] for x in P]),
                         'off8_share': q3([x['off8'] for x in P])},
         'vel': {'mean': med([x['vel_mean'] for x in dyn], 1), 'sd': med([x['vel_sd'] for x in dyn], 1),
                 'accent': [med([x['accent'][i] for x in dyn], 1) for i in range(16)],
                 'flat_share': round(1 - len(dyn) / len(P), 3), 'songs_dyn': len(dyn)},
         'len16': q3([x['len'][1] for x in P]),
         'gate': q3([x['gate'][1] for x in P if x.get('gate')]),
         'register': [med([x['reg'][i] for x in P], 0) for i in range(3)],
         'register_spread': {'q1_of_q1': q3([x['reg'][0] for x in P], 0), 'q3_of_q3': q3([x['reg'][2] for x in P], 0)},
         'poly_notes_per_onset': q3([x['poly'] for x in P]),
         'insts_per_song': med([x['n_insts'] for x in P], 1),
         'how': dict(collections.Counter(x['how'] for x in P).most_common())}
    for mode in ('maj', 'min'):
        dd = [x['deg'] for r, x in zip(rows, [r['parts'].get(p) for r in rows]) if x and x['bars'] >= 4 and r['key']['mode'] == mode]
        if dd:
            m = share_mean([{DEG[int(k)]: v for k, v in d.items()} for d in dd], DEG)
            o.setdefault('degree_share', {})[mode] = m
            o.setdefault('degree_songs', {})[mode] = len(dd)
    if p in ('bass', 'lead', 'arp', 'seq'):
        iv = [x['iv'] for x in P if x.get('iv') and x.get('iv_n', 0) >= 8]
        if iv:
            keys = [str(k) for k in range(-12, 13)]
            o['interval_share'] = share_mean(iv, keys)
            a = collections.defaultdict(list)
            for d in iv:
                a['repeat'].append(d.get('0', 0))
                a['step_1_2'].append(sum(d.get(str(k), 0) for k in (-2, -1, 1, 2)))
                a['skip_3_4'].append(sum(d.get(str(k), 0) for k in (-4, -3, 3, 4)))
                a['leap_5_7'].append(sum(d.get(str(k), 0) for k in (-7, -6, -5, 5, 6, 7)))
                a['leap_8_11'].append(sum(d.get(str(k), 0) for k in (-11, -10, -9, -8, 8, 9, 10, 11)))
                a['octave'].append(d.get('12', 0) + d.get('-12', 0))
                up = sum(v for k, v in d.items() if int(k) > 0); dn = sum(v for k, v in d.items() if int(k) < 0)
                a['descending_of_moves'].append(dn / (up + dn) if up + dn else None)
            o['interval_classes'] = {k: q3(v) for k, v in a.items()}
        o['pcs_per_bar'] = q3([x.get('pcs_per_bar') for x in P])
    if p == 'arp':
        A = [x['arp'] for x in P if x.get('arp') and x['arp']['shape']]
        if A:
            o['arp'] = {'shape': share_mean([x['shape'] for x in A], ['up', 'down', 'updown', 'random', 'static']),
                        'rate16': dict(collections.Counter(str(x['rate16']) for x in A if x['rate16']).most_common(5)),
                        'oct_span': q3([x['oct_span'] for x in A])}
    if p in ('chord', 'pad', 'keys', 'guitar'):
        Cs = [x['chord'] for x in P if x.get('chord') and x['chord'].get('voices')]
        if Cs:
            o['poly'] = {'chord_onset_share': q3([c['chord_onset_share'] for c in Cs]),
                         'voices': q3([c['voices'] for c in Cs], 1),
                         'spread_semitones': [med([c['spread'][i] for c in Cs], 0) for i in range(3)],
                         'inversion_share': q3([c['inversion_share'] for c in Cs]),
                         'change_per_bar': q3([c['change_per_bar'] for c in Cs]),
                         'quality': share_mean([c['qual'] for c in Cs])}
    L = [x['loop']['pitch'] for x in P if x['loop'].get('pitch')]
    Lr = [x['loop']['rhythm'] for x in P if x['loop'].get('rhythm')]
    o['loop_share'] = share_mean(L, ['1', '2', '4', '>4'])
    o['loop_share_rhythm'] = share_mean(Lr, ['1', '2', '4', '>4'])
    o['loop_songs'] = len(L)
    return o


def agg_drums(rows):
    ok = [r['drum'] for r in rows if r.get('drum') and 'skip' not in r['drum'] and r['drum'].get('drums')]
    if not ok: return None
    dyn = [d for d in ok if not d.get('drum_flat')]
    D = {'songs': len(ok), 'flat_share': round(1 - len(dyn) / len(ok), 3)}
    for c in CATS:
        x = [d['drums'][c] for d in ok]
        xd = [d['drums'][c] for d in dyn if d['drums'][c]['bars_with_any'] >= .25]
        acc = []
        for i in range(16):
            vs = [(y['vel'][i] - y['vel_mean']) for y in xd if y['vel'][i] is not None and y['P'][i] >= .1 and y['vel_mean']]
            acc.append(med(vs, 1))
        modal = collections.Counter(y['top'][0][0] for y in x if y.get('top') and y['top'][0][0].count('x'))
        D[c] = {'step_onset_prob': [round(float(np.mean([y['P'][i] for y in x])), 3) for i in range(16)],
                'hits_per_bar': q3([y['hits_per_bar'] for y in x], 1),
                'songs_using': round(sum(1 for y in x if y['bars_with_any'] >= .25) / len(x), 3),
                'vel': {'mean': med([y['vel_mean'] for y in xd], 1), 'sd': med([y['vel_sd'] for y in xd], 1),
                        'accent': acc},
                'modal_bar_share': [(p_, round(n / len(x), 3)) for p_, n in modal.most_common(4)]}
    D['hat']['open_share'] = mean([d['drums']['hat'].get('open_share') for d in ok])
    D['cymb']['ride_share'] = mean([d['drums']['cymb'].get('ride_share') for d in ok])
    K = lambda d, i: d['drums']['kick']['P'][i - 1]; S = lambda d, i: d['drums']['snare']['P'][i - 1]
    fam = collections.Counter()
    for d in ok:
        H = d['drums']['hat']; hp = H['hits_per_bar']
        fam['kick_4otf'] += all(K(d, i) >= .85 for i in (1, 5, 9, 13))
        fam['kick_1_and_9_only'] += K(d, 1) >= .7 and K(d, 9) >= .4 and K(d, 5) < .3 and K(d, 13) < .3
        fam['snare_backbeat_5_13'] += S(d, 5) >= .75 and S(d, 13) >= .75
        fam['snare_halftime_9'] += S(d, 9) >= .6 and S(d, 5) < .3 and S(d, 13) < .3
        fam['hat_16ths'] += hp >= 12
        fam['hat_8ths'] += 6 <= hp <= 9.5 and sum(H['P'][0::2]) >= 6
        fam['hat_offbeat_only'] += 2.5 <= hp <= 5 and sum(H['P'][i] for i in (2, 6, 10, 14)) >= 3
        fam['hat_none'] += hp < 1
    D['families'] = {k: round(v / len(ok), 3) for k, v in fam.items()}
    D['fill_bar_share'] = med([d.get('fill_share') for d in ok], 3)
    D['kit_bar_repeat'] = med([d.get('kit_bar_repeat') for d in ok], 3)
    D['crash_on_1_after_fill'] = mean([d.get('crash1_after_fill') for d in ok])
    sw = [d.get('hat_swing_ticks') for d in ok if d.get('hat_swing_ticks') is not None]
    D['hat_swing_ticks96'] = q3(sw, 1)
    D['drum_skips'] = dict(collections.Counter(r['drum']['skip'].split(':')[0] for r in rows
                                               if r.get('drum') and 'skip' in r['drum']))
    return D


def agg_harmony(rows):
    H = [r for r in rows if r.get('harmony') and r['harmony']['windows'] >= 8]
    if not H: return None
    o = {'songs': len(H), 'change_per_bar': q3([r['harmony']['change_per_bar'] for r in H])}
    for mode in ('maj', 'min'):
        hs = [r for r in H if r['key']['mode'] == mode]
        if not hs: continue
        fs = collections.Counter(); fsh = collections.Counter(); chords = collections.Counter()
        for r in hs:
            f = collections.Counter()
            for ng, c in r['harmony']['ng4'].items():
                f[family(tuple(ng.split()), ('i',) if mode == 'min' else ('I',))] += c
            tot = sum(f.values()) or 1
            for k, c in f.items():
                if c >= 2: fs[k] += 1
                fsh[k] += c / tot
            for ch in r['harmony']['chords']: chords[ch] += 1
        o[mode] = {'songs': len(hs),
                   'progression_families': [{'loop': k, 'songs_share': round(fs[k] / len(hs), 3),
                                             'ngram_share': round(fsh[k] / len(hs), 3)} for k, _ in fs.most_common(10)],
                   'chords_songs_share': [(k, round(c / len(hs), 3)) for k, c in chords.most_common(14)]}
    return o


def agg(rows, name):
    ok = [r for r in rows if 'skip' not in r and not r.get('pskip') and r.get('parts') is not None and r.get('key')]
    bpm = [r['bpm'] for r in rows if r.get('bpm') and 'skip' not in r]
    O = {'genre': name, 'selected': len(rows), 'measured': len(ok),
         'artists': len({r['artist'] for r in ok}),
         'sources': dict(collections.Counter(r['src'] for r in ok)),
         'eras': dict(collections.Counter(r['era'] for r in ok)),
         'skips': dict(collections.Counter((r.get('skip') or r.get('pskip') or 'ok').split(':')[0] for r in rows)),
         'tempo_file_bpm': q3(bpm, 0), 'tempo': [round(float(np.percentile([fold_bpm(b) for b in bpm], p)))
                                                 for p in (10, 50, 90)] if bpm else None,
         'minor_share': round(sum(1 for r in ok if r['key']['mode'] == 'min') / len(ok), 3) if ok else None,
         'key_how': dict(collections.Counter(r['key']['how'] for r in ok)),
         'keysig_agree': None}
    ks = [r for r in ok if r.get('keysig') and not (r['keysig']['tonic'] == 0 and r['keysig']['mode'] == 'maj')]
    if ks:
        O['keysig_agree'] = {'n': len(ks), 'same_key': round(sum(1 for r in ks if r['keysig']['tonic'] == r['key']['tonic'] and r['keysig']['mode'] == r['key']['mode']) / len(ks), 3),
                             'same_scale': round(sum(1 for r in ks if (r['keysig']['tonic'] + (3 if r['keysig']['mode'] == 'min' else 0)) % 12 == (r['key']['tonic'] + (3 if r['key']['mode'] == 'min' else 0)) % 12) / len(ks), 3)}
    if not ok: return O
    O['parts'] = {p: a for p in PARTS if (a := agg_part(ok, p))}
    O['drums'] = agg_drums([r for r in rows if 'skip' not in r])
    O['harmony'] = agg_harmony(ok)
    O['song_list'] = sorted({(r['artist'], (r['title'] or '') if r['src'] != 'lamd' else '(text-matched file, title not recorded)', r['era'], r['src']) for r in ok})
    return O


# ------------------------------------------------------------------ markdown
def fm(x):
    if x is None: return '–'
    if isinstance(x, float): return f'{x:.2f}'.rstrip('0').rstrip('.') if abs(x) < 10 else f'{x:.0f}'
    return str(x)


def qs(x): return '–' if not x else ' / '.join(fm(v) for v in x)


STEP_HDR = '| | ' + ' | '.join(str(i) for i in range(1, 17)) + ' |\n|---|' + '---|' * 16


def tables(O):
    L = [f"# {O['genre']} — measured tables\n",
         f"selected {O['selected']} · measured {O['measured']} · artists {O['artists']} · sources {O['sources']} · "
         f"eras {O['eras']}\n", f"skips: {O['skips']}\n",
         f"tempo (folded 85–180) p10/p50/p90: {qs(O.get('tempo'))} · file BPM q1/med/q3: {qs(O.get('tempo_file_bpm'))} · "
         f"minor share {fm(O.get('minor_share'))} · key method {O.get('key_how')} · key-signature check {O.get('keysig_agree')}\n"]
    if 'parts' not in O: return '\n'.join(L)
    L.append('## Parts\n')
    L.append('| part | songs | presence | onsets/bar q1/med/q3 | len 16ths | gate | register q1/med/q3 | notes/onset | LHL | off-16th | vel mean/sd (flat) | loop 1/2/4/>4 (pitch) | loop 1/2/4/>4 (rhythm) |')
    L.append('|---|' + '---|' * 12)
    for p, a in O['parts'].items():
        ls = a['loop_share']; lr = a['loop_share_rhythm']
        L.append(f"| {p} | {a['songs']} | {fm(a['presence'])} | {qs(a['density_per_bar'])} | {qs(a['len16'])} | {qs(a['gate'])} | "
                 f"{qs(a['register'])} | {qs(a['poly_notes_per_onset'])} | {qs(a['syncopation']['lhl_per_bar'])} | "
                 f"{qs(a['syncopation']['offbeat16_share'])} | {fm(a['vel']['mean'])}/{fm(a['vel']['sd'])} ({fm(a['vel']['flat_share'])}) | "
                 f"{'/'.join(fm(ls.get(k)) for k in ('1', '2', '4', '>4'))} | {'/'.join(fm(lr.get(k)) for k in ('1', '2', '4', '>4'))} |")
    L.append('\n### Per-step onset probability (song mean, 16th grid)\n'); L.append(STEP_HDR)
    for p, a in O['parts'].items():
        L.append(f"| {p} | " + ' | '.join(fm(x) for x in a['step_onset_prob']) + ' |')
    L.append('\n### Per-step velocity accent (median of song step-mean minus song mean; non-flat songs)\n'); L.append(STEP_HDR)
    for p, a in O['parts'].items():
        L.append(f"| {p} | " + ' | '.join(fm(x) for x in a['vel']['accent']) + ' |')
    L.append('\n### Scale-degree share (onsets; song transposed to C; song mean)\n')
    L.append('| part | mode | songs | ' + ' | '.join(DEG) + ' |\n|---|---|---|' + '---|' * 12)
    for p, a in O['parts'].items():
        for mode, d in a.get('degree_share', {}).items():
            L.append(f"| {p} | {mode} | {a['degree_songs'][mode]} | " + ' | '.join(fm(d[k]) for k in DEG) + ' |')
    L.append('\n### Melodic intervals (semitones; song mean share; q1/med/q3 of per-song class shares)\n')
    L.append('| part | repeat | step 1–2 | skip 3–4 | leap 5–7 | leap 8–11 | octave | descending share of moves | pcs/bar |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for p, a in O['parts'].items():
        if 'interval_classes' in a:
            c = a['interval_classes']
            L.append(f"| {p} | {qs(c['repeat'])} | {qs(c['step_1_2'])} | {qs(c['skip_3_4'])} | {qs(c['leap_5_7'])} | "
                     f"{qs(c['leap_8_11'])} | {qs(c['octave'])} | {qs(c['descending_of_moves'])} | {qs(a.get('pcs_per_bar'))} |")
    L.append('\n| part | ' + ' | '.join(str(k) for k in range(-12, 13)) + ' |\n|---|' + '---|' * 25)
    for p, a in O['parts'].items():
        if 'interval_share' in a:
            L.append(f"| {p} | " + ' | '.join(fm(a['interval_share'][str(k)]) for k in range(-12, 13)) + ' |')
    pol = [(p, a['poly']) for p, a in O['parts'].items() if 'poly' in a]
    if pol:
        L.append('\n### Polyphony (chord / pad / keys / guitar)\n')
        L.append('| part | chord-onset share | voices | spread (st) | inversion share | changes/bar | qualities |\n|---|---|---|---|---|---|---|')
        for p, c in pol:
            qq = ', '.join(f'{k} {fm(v)}' for k, v in sorted(c['quality'].items(), key=lambda x: -x[1])[:5])
            L.append(f"| {p} | {qs(c['chord_onset_share'])} | {qs(c['voices'])} | {qs(c['spread_semitones'])} | "
                     f"{qs(c['inversion_share'])} | {qs(c['change_per_bar'])} | {qq} |")
    if 'arp' in O['parts'] and 'arp' in O['parts']['arp']:
        a = O['parts']['arp']['arp']
        L.append(f"\n### Arp shapes\n\nshape share {a['shape']} · step rate (16ths between notes, songs) {a['rate16']} · octave span q1/med/q3 {qs(a['oct_span'])}\n")
    H = O.get('harmony')
    if H:
        L.append(f"\n## Harmony (half-bar chord windows from bass + chord/pad/keys/guitar/arp/seq)\n\nsongs {H['songs']} · chord changes per bar q1/med/q3 {qs(H['change_per_bar'])}\n")
        for mode in ('min', 'maj'):
            if mode not in H: continue
            h = H[mode]
            L.append(f"\n**{mode} songs ({h['songs']})** — loop families (rotation-folded 4-grams; 'songs' = share of songs with the loop ≥ 2×)\n")
            L.append('| loop | songs | 4-gram share |\n|---|---|---|')
            for f in h['progression_families']:
                L.append(f"| {f['loop']} | {fm(f['songs_share'])} | {fm(f['ngram_share'])} |")
            L.append('\nchords (share of songs using): ' + ', '.join(f'{k} {fm(v)}' for k, v in h['chords_songs_share']) + '\n')
    D = O.get('drums')
    if D:
        L.append(f"\n## Drums (lmd_measure groove bars; {D['songs']} songs, flat-velocity share {fm(D['flat_share'])})\n")
        L.append(f"families: {D['families']}\n\nfill-bar share {fm(D['fill_bar_share'])} · kit bar repeat {fm(D['kit_bar_repeat'])} · crash on 1 after a fill {fm(D['crash_on_1_after_fill'])} · open-hat share {fm(D['hat']['open_share'])} · ride share of cymbals {fm(D['cymb']['ride_share'])} · hat swing (ticks @96) {qs(D['hat_swing_ticks96'])} · drum skips {D['drum_skips']}\n")
        L.append(STEP_HDR)
        for c in CATS:
            L.append(f"| {c} P | " + ' | '.join(fm(x) for x in D[c]['step_onset_prob']) + ' |')
        for c in ('kick', 'snare', 'hat'):
            L.append(f"| {c} acc | " + ' | '.join(fm(x) for x in D[c]['vel']['accent']) + ' |')
        L.append('\n| lane | hits/bar q1/med/q3 | songs using | vel mean / sd | modal bar (share of songs) |\n|---|---|---|---|---|')
        for c in CATS:
            d = D[c]
            L.append(f"| {c} | {qs(d['hits_per_bar'])} | {fm(d['songs_using'])} | {fm(d['vel']['mean'])} / {fm(d['vel']['sd'])} | "
                     + ', '.join(f'`{p}` {fm(s)}' for p, s in d['modal_bar_share'][:3]) + ' |')
    return '\n'.join(L) + '\n'


def targets(O):
    """The compact machine-readable target block of the brief."""
    T = {'genre': O['genre'], 'songs': O['measured'], 'artists': O['artists'], 'eras': O['eras'],
         'tempo': O.get('tempo'), 'tempo_file_bpm': O.get('tempo_file_bpm'), 'minor_share': O.get('minor_share'),
         'parts': {}}
    for p, a in (O.get('parts') or {}).items():
        t = {'songs': a['songs'], 'presence': a['presence'], 'density_per_bar': a['density_per_bar'],
             'step_onset_prob': a['step_onset_prob'],
             'vel': {'mean': a['vel']['mean'], 'sd': a['vel']['sd'], 'accent': a['vel']['accent'],
                     'flat_share': a['vel']['flat_share']},
             'gate': a['gate'], 'len16': a['len16'], 'syncopation': a['syncopation'],
             'degree_share': a.get('degree_share'), 'interval_share': a.get('interval_share'),
             'interval_classes': a.get('interval_classes'), 'register': a['register'],
             'poly': a.get('poly'), 'notes_per_onset': a['poly_notes_per_onset'],
             'loop_share': a['loop_share'], 'loop_share_rhythm': a['loop_share_rhythm']}
        if 'arp' in a: t['arp'] = a['arp']
        T['parts'][p] = t
    H = O.get('harmony') or {}
    T['harmony'] = {'change_per_bar': H.get('change_per_bar'),
                    'progression_ngrams': {m: H[m]['progression_families'] for m in ('min', 'maj') if m in H}}
    D = O.get('drums')
    if D:
        T['parts']['drums'] = {c: {'step_onset_prob': D[c]['step_onset_prob'], 'hits_per_bar': D[c]['hits_per_bar'],
                                   'songs_using': D[c]['songs_using'], 'vel': D[c]['vel']} for c in CATS}
        T['parts']['drums'].update({'families': D['families'], 'open_hat_share': D['hat']['open_share'],
                                    'ride_share': D['cymb']['ride_share'], 'fill_bar_share': D['fill_bar_share'],
                                    'songs': D['songs'], 'flat_share': D['flat_share']})
    return T


PARTS_FOUND = ['bass', 'chord', 'pad', 'keys', 'guitar', 'lead', 'arp', 'seq', 'fx']


def song_rows(rows):
    """The per-song list (derived facts only, no notes): songs.csv / songs.json."""
    out = []
    for r in rows:
        if 'skip' in r or r.get('pskip') or not r.get('key'): continue
        g = r['genre']
        style = R.FLAVOUR_OF.get(g, g)
        k = r['key']
        parts = [p for p in PARTS_FOUND if p in (r.get('parts') or {})]
        if r.get('drums_present'): parts.append('drums')
        tc = r.get('tempo_changes') or 0
        out.append({'style': style.upper().replace('NEWWAVE', 'NEW WAVE'), 'flavour': g.upper() if g in R.FLAVOUR_OF else '',
                    'artist': r['artist'], 'title': r['title'] if r['src'] != 'lamd' else '',
                    'era': r['era'], 'source': r['src'],
                    'tonic': ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][k['tonic']],
                    'mode': r.get('modal') or ('minor' if k['mode'] == 'min' else 'major'),
                    'key_confidence': k['r'], 'key_method': k['how'],
                    'bpm': r['bpm'], 'tempo_map': 'single tempo' if tc <= 1 else
                    f"{tc} tempo events ({r['tempo_range'][0]}-{r['tempo_range'][1]}); bpm = median beat",
                    'time_signature': r.get('ts', ''), 'bars_4_4_share': r.get('meter_valid_share'),
                    'parts': ' '.join(parts)})
    out.sort(key=lambda x: (x['style'], x['flavour'], x['artist'].lower(), x['title'].lower()))
    return out


def main():
    rows = [json.loads(l) for l in open(os.path.expanduser(sys.argv[1]))]
    base = sys.argv[2]
    CH = json.load(open(os.path.expanduser(sys.argv[3]))) if len(sys.argv) > 3 else None
    od = os.path.join(base, 'analysis', 'out'); sd = os.path.join(base, 'stats')
    os.makedirs(od, exist_ok=True); os.makedirs(sd, exist_ok=True)
    for f in os.listdir(sd):  # stale files from an earlier taxonomy
        if f.endswith('.json') and f[:-5] not in R.PUBLIC + ['basics']: os.remove(os.path.join(sd, f))
    counts = {}; allO = {}; allT = {}; eraO = {}
    groups = {g: [r for r in rows if r['genre'] == g] for g in R.PRECEDENCE}
    for u, members in R.UNION.items():
        groups[u] = [r for r in rows if r['genre'] in members]
    groups['basics'] = rows  # genre-less: every measured song, each group's songs as they are
    for g, rs in groups.items():
        O = agg(rs, g)
        eras = {}
        for e in ('80s', 'new'):
            er = [r for r in rs if r['era'] == e]
            if len(er) < MIN_SONGS_ERA or g == 'basics': continue
            Oe = agg(er, f'{g}:{e}')
            if Oe['measured'] >= MIN_SONGS_ERA: eras[e] = Oe
        songs = O.pop('song_list', [])
        T = targets(O)
        if eras: T['eras_split'] = {e: targets({**Oe, 'song_list': None}) for e, Oe in eras.items()}
        cs = chord_sheet(CH, g)
        if cs: T['harmony']['chord_sheets'] = cs
        if g in R.FLAVOUR_OF: T['flavour_of'] = R.FLAVOUR_OF[g]
        if g in R.UNION: T['union_of'] = R.UNION[g]
        allT[g] = T; eraO[g] = eras
        md = tables(O)
        for e, Oe in eras.items():
            Oe.pop('song_list', None)
            md += '\n\n---\n\n' + tables(Oe)
        if g != 'basics':
            md += '\n\n## Songs measured (artist — title · era · source)\n\n' + '\n'.join(
                f'- {a} — {t} · {e} · {s}' for a, t, e, s in songs) + '\n'
        open(os.path.join(od, f'{g}_tables.md'), 'w').write(md)
        counts[g] = {'selected': O['selected'], 'measured': O['measured'], 'artists': O['artists'],
                     'sources': O['sources'], 'eras': O['eras'],
                     'era_splits': {e: Oe['measured'] for e, Oe in eras.items()}}
        allO[g] = O
    for f_, p_ in R.FLAVOUR_OF.items():
        blk = flavour_block(allO[f_], allO[p_], chord_sheet(CH, f_))
        blk['targets'] = allT[f_]
        allT[p_].setdefault('flavours', {})[f_] = blk
    for g in R.PUBLIC + ['basics']:
        json.dump(allT[g], open(os.path.join(sd, f'{g}.json'), 'w'), separators=(',', ':'))
    if CH:
        json.dump({g: chord_sheet(CH, g) for g in groups if chord_sheet(CH, g)},
                  open(os.path.join(od, 'chord_sheet_loops.json'), 'w'), indent=1)
    json.dump(counts, open(os.path.join(od, 'counts.json'), 'w'), indent=1)
    summary(allO, od)
    sr = song_rows(rows)
    with open(os.path.join(base, 'songs.json'), 'w') as fh:  # one song per line
        fh.write('[\n' + ',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in sr) + '\n]\n')
    import csv
    with open(os.path.join(base, 'songs.csv'), 'w', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=list(sr[0].keys())); w.writeheader(); w.writerows(sr)


def summary(allO, od):
    L = ['# Cross-genre summary (refs)\n',
         '| genre | measured | artists | tempo p10/p50/p90 | minor | bass onsets/bar | bass oct-leap med | bass 1-bar loop | chord changes/bar | lead step share | arp songs | kick 4otf | backbeat | hat 16ths | top minor loop | top major loop |',
         '|---|' + '---|' * 15]
    for g, O in allO.items():
        if 'parts' not in O: L.append(f"| {g} | {O['measured']} |" + ' – |' * 14); continue
        b = O['parts'].get('bass', {}); ld = O['parts'].get('lead', {}); D = O.get('drums') or {}
        H = O.get('harmony') or {}
        tm = (H.get('min') or {}).get('progression_families') or [{}]
        tj = (H.get('maj') or {}).get('progression_families') or [{}]
        fam = D.get('families', {})
        L.append(f"| {g} | {O['measured']} | {O['artists']} | {qs(O.get('tempo'))} | {fm(O.get('minor_share'))} | "
                 f"{fm((b.get('density_per_bar') or [None, None])[1])} | {fm(((b.get('interval_classes') or {}).get('octave') or [None, None])[1])} | "
                 f"{fm((b.get('loop_share') or {}).get('1'))} | {fm((H.get('change_per_bar') or [None, None])[1])} | "
                 f"{fm(((ld.get('interval_classes') or {}).get('step_1_2') or [None, None])[1])} | "
                 f"{fm(O['parts'].get('arp', {}).get('presence'))} | {fm(fam.get('kick_4otf'))} | {fm(fam.get('snare_backbeat_5_13'))} | "
                 f"{fm(fam.get('hat_16ths'))} | {tm[0].get('loop', '–')} ({fm(tm[0].get('songs_share'))}) | {tj[0].get('loop', '–')} ({fm(tj[0].get('songs_share'))}) |")
    open(os.path.join(od, 'summary.md'), 'w').write('\n'.join(L) + '\n')


if __name__ == '__main__': main()
