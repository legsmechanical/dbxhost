# Aggregate lmd_measure.py output per genre into tables (markdown) + JSON.
# Usage: python3 lmd_report.py <songs.jsonl> <outdir>
#   writes <outdir>/<genre>_tables.md, <outdir>/<genre>_stats.json, <outdir>/summary.md
# Every per-step number is SONG-WEIGHTED: each song's groove-bar mean, then the mean over songs, so
# a long song does not dominate. Velocity numbers use only songs whose drums are NOT flat (> 2
# distinct velocities); flat songs are counted and reported.
import json, sys, collections, statistics as st
import numpy as np

GENRES = ['newwave', 'postpunk', 'synthpop', 'italo', 'ebm', 'synthwave', 'rock', 'disco', 'house', 'techno']
CATS = ['kick', 'snare', 'hat', 'tom', 'perc', 'cymb']
DEG = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']
GMN = {35: 'kick2', 36: 'kick', 37: 'side-stick', 38: 'snare', 39: 'clap', 40: 'e-snare', 42: 'closed hat', 44: 'pedal hat',
       46: 'open hat', 41: 'lo-floor tom', 43: 'hi-floor tom', 45: 'low tom', 47: 'lo-mid tom', 48: 'hi-mid tom',
       50: 'high tom', 49: 'crash', 57: 'crash2', 55: 'splash', 52: 'china', 51: 'ride', 59: 'ride2', 53: 'ride bell',
       54: 'tambourine', 56: 'cowbell', 58: 'vibraslap', 60: 'hi bongo', 61: 'lo bongo', 62: 'mute hi conga',
       63: 'open hi conga', 64: 'low conga', 65: 'hi timbale', 66: 'lo timbale', 67: 'hi agogo', 68: 'lo agogo',
       69: 'cabasa', 70: 'maracas', 71: 'short whistle', 72: 'long whistle', 73: 'short guiro', 74: 'long guiro',
       75: 'claves', 76: 'hi wood block', 77: 'lo wood block', 78: 'mute cuica', 79: 'open cuica',
       80: 'mute triangle', 81: 'open triangle', 82: 'shaker', 27: 'high Q', 28: 'slap', 31: 'sticks', 34: 'metronome bell',
       25: 'snare roll', 26: 'finger snap', 29: 'scratch', 30: 'scratch2', 33: 'metronome click'}


def mean(xs): xs = [x for x in xs if x is not None]; return sum(xs) / len(xs) if xs else None
def med(xs): xs = [x for x in xs if x is not None]; return st.median(xs) if xs else None
def pct(xs, p): xs = [x for x in xs if x is not None]; return float(np.percentile(xs, p)) if xs else None
def f2(x, d=2): return '–' if x is None else (f'{x:.{d}f}' if isinstance(x, float) else str(x))
def fp(x): return '–' if x is None else f'{x:.2f}'.lstrip('0') if x < 1 else f'{x:.2f}'
def fv(x): return '–' if x is None else f'{x:.0f}'


def row(label, xs, fmt):
    return '| ' + label + ' | ' + ' | '.join(fmt(x) for x in xs) + ' |'


HDR = '| step | ' + ' | '.join(str(i) for i in range(1, 17)) + ' |\n|---|' + '---|' * 16


def agg_genre(rs, g):
    ok = [r for r in rs if 'skip' not in r]
    O = {'genre': g, 'selected': len(rs), 'measured': len(ok),
         'skips': dict(collections.Counter(r['skip'].split(':')[0] for r in rs if 'skip' in r)),
         'artists': len({r['artist'] for r in ok})}
    if not ok: return O, ''
    bpm = [r['bpm'] for r in ok]
    O['bpm'] = [pct(bpm, 25), med(bpm), pct(bpm, 75)]
    # tempo folded into 90..180 (MIDI files are often written at half or double time)
    fold = [b * 2 if b < 90 else b / 2 if b > 180 else b for b in bpm]
    O['bpm_folded'] = [pct(fold, 25), med(fold), pct(fold, 75)]
    flat = [r for r in ok if r['drum_flat']]; dyn = [r for r in ok if not r['drum_flat']]
    O['flat_share'] = len(flat) / len(ok); O['n_dyn'] = len(dyn)
    O['fill_share'] = med([r['fill_share'] for r in ok])
    O['crash1_after_fill'] = mean([r['crash1_after_fill'] for r in ok])
    O['crash1_after_groove'] = mean([r['crash1_after_groove'] for r in ok])
    O['kit_bar_repeat'] = med([r['kit_bar_repeat'] for r in ok])
    sw = [r.get('hat_swing_ticks') for r in ok]
    O['hat_swing'] = [pct(sw, 25), med(sw), pct(sw, 75)]
    O['swung_ge4'] = sum(1 for x in sw if x is not None and x >= 4) / max(1, sum(1 for x in sw if x is not None))
    D = {}
    for c in CATS:
        d = {}
        d['P'] = [mean([r['drums'][c]['P'][i] for r in ok]) for i in range(16)]
        d['vel'] = [mean([r['drums'][c]['vel'][i] for r in dyn if r['drums'][c]['P'][i] >= .1]) for i in range(16)]
        d['hits_per_bar'] = med([r['drums'][c]['hits_per_bar'] for r in ok])
        d['songs_using'] = sum(1 for r in ok if r['drums'][c]['bars_with_any'] >= .25) / len(ok)
        d['bars_with_any'] = mean([r['drums'][c]['bars_with_any'] for r in ok])
        d['vel_mean'] = med([r['drums'][c]['vel_mean'] for r in dyn])
        d['vel_sd'] = med([r['drums'][c]['vel_sd'] for r in dyn if r['drums'][c]['bars_with_any'] >= .25])
        d['vel_distinct'] = med([r['drums'][c]['vel_distinct'] for r in dyn if r['drums'][c]['bars_with_any'] >= .25])
        nc = collections.Counter()
        for r in ok:
            tot = sum(n for _, n in r['drums'][c].get('notes', [])) or 1
            for p, n in r['drums'][c].get('notes', []): nc[p] += n / tot
        d['notes'] = [(GMN.get(p, str(p)), round(v / len(ok), 3)) for p, v in nc.most_common(6)]
        tp = collections.Counter()
        for r in ok:
            for p, n in r['drums'][c]['top'][:1]:
                if p.count('x'): tp[p] += 1
        d['modal_bar'] = [(p, round(n / len(ok), 2)) for p, n in tp.most_common(5)]
        D[c] = d
    D['hat']['open_share'] = mean([r['drums']['hat'].get('open_share') for r in ok])
    D['hat']['open_P'] = [mean([r['drums']['hat']['open_P'][i] for r in ok]) for i in range(16)]
    D['cymb']['ride_share'] = mean([r['drums']['cymb'].get('ride_share') for r in ok])
    O['drums'] = D
    # derived drum families per song
    K = lambda r, i: r['drums']['kick']['P'][i - 1]; S = lambda r, i: r['drums']['snare']['P'][i - 1]
    H = lambda r: r['drums']['hat']
    fam = collections.Counter()
    for r in ok:
        fam['kick 4otf'] += all(K(r, i) >= .85 for i in (1, 5, 9, 13))
        fam['kick 1+9 (no 5/13)'] += K(r, 1) >= .7 and K(r, 9) >= .4 and K(r, 5) < .3 and K(r, 13) < .3
        fam['kick even-16th share>.1'] += (sum(r['drums']['kick']['P'][1::2]) / max(1e-9, sum(r['drums']['kick']['P']))) > .1
        fam['snare backbeat 5+13'] += S(r, 5) >= .75 and S(r, 13) >= .75
        fam['snare half-time 9'] += S(r, 9) >= .6 and S(r, 5) < .3 and S(r, 13) < .3
        hp = H(r)['hits_per_bar']
        fam['hat 16ths (>=12/bar)'] += hp >= 12
        fam['hat 8ths (6-9/bar)'] += 6 <= hp <= 9.5 and sum(H(r)['P'][0::2]) >= 6
        fam['hat off-beat only (3/7/11/15, <=5/bar)'] += 2.5 <= hp <= 5 and sum(H(r)['P'][i] for i in (2, 6, 10, 14)) >= 3
        fam['hat none/rare (<1/bar)'] += hp < 1
        fam['toms in groove (>=.25 bars)'] += r['drums']['tom']['bars_with_any'] >= .25
        fam['perc lane (>=.5 bars)'] += r['drums']['perc']['bars_with_any'] >= .5
    O['families'] = {k: round(v / len(ok), 3) for k, v in fam.items()}
    # kick even-step share (pooled per song)
    O['kick_even_share'] = med([sum(r['drums']['kick']['P'][1::2]) / max(1e-9, sum(r['drums']['kick']['P'])) for r in ok])
    # hat tiering: beat-hat vel minus off-8th-hat vel (dyn songs with 8th/16th hats)
    tier = []
    for r in dyn:
        v = r['drums']['hat']['vel']; P = r['drums']['hat']['P']
        b = [v[i] for i in (0, 4, 8, 12) if v[i] is not None and P[i] >= .5]
        o = [v[i] for i in (2, 6, 10, 14) if v[i] is not None and P[i] >= .5]
        if b and o: tier.append(mean(b) - mean(o))
    O['hat_beat_minus_off8'] = [pct(tier, 25), med(tier), pct(tier, 75), len(tier)]
    # snare ghost share (vel <= 45 at steps other than 5/13), dyn songs using snare
    gh = []
    for r in dyn:
        s = r['drums']['snare']
        if s['bars_with_any'] < .5: continue
        tot = sum(s['P']);
        if tot <= 0: continue
        g_ = sum(s['P'][i] for i in range(16) if s['vel'][i] is not None and s['vel'][i] <= 45)
        gh.append(g_ / tot)
    O['snare_ghost_share'] = med(gh); O['snare_ghost_songs_gt10'] = sum(1 for x in gh if x > .1) / max(1, len(gh))
    # distinct velocities per lane (all songs incl. flat), share <= 2 and <= 3
    for c in ('kick', 'snare', 'hat'):
        vd = [r['drums'][c]['vel_distinct'] for r in ok if r['drums'][c]['bars_with_any'] >= .25]
        O[f'{c}_vel_distinct_le2'] = sum(1 for x in vd if x <= 2) / max(1, len(vd))
        O[f'{c}_vel_distinct_le3'] = sum(1 for x in vd if x <= 3) / max(1, len(vd))
    # ---------------- bass
    B = [r['bass'] for r in ok if r.get('bass') and r['bass']['bars'] >= 8]
    O['bass_songs'] = len(B); O['bass_src'] = dict(collections.Counter(b['src'] for b in B))
    if B:
        ob = {}
        ob['P'] = [mean([b['P'][i] for b in B]) for i in range(16)]
        for k in ('notes_per_bar', 'odd_step_share', 'len_med', 'gate_med', 'oct_share', 'rep_share', 'step_share',
                  'leap_share', 'pcs_per_bar', 'vel_cv_bar_med'):
            xs = [b[k] for b in B if not (k == 'vel_cv_bar_med' and b['vel_flat'])]
            ob[k] = [pct(xs, 25), med(xs), pct(xs, 75)]
        ob['seq16_share_bars'] = mean([b['seq16_share'] for b in B]); ob['seq8_share_bars'] = mean([b['seq8_share'] for b in B])
        ob['songs_seq_ge50'] = sum(1 for b in B if b['seq16_share'] + b['seq8_share'] >= .5) / len(B)
        ob['songs_seq16_ge50'] = sum(1 for b in B if b['seq16_share'] >= .5) / len(B)
        ob['songs_seq8_ge50'] = sum(1 for b in B if b['seq8_share'] >= .5) / len(B)
        ob['songs_oct_ge25'] = sum(1 for b in B if (b['oct_share'] or 0) >= .25) / len(B)
        ob['len_hist'] = [mean([b['len_hist'][i] for b in B]) for i in range(6)]
        ob['reg'] = [med([b['reg'][i] for b in B]) for i in range(3)]
        ob['vel_flat_share'] = sum(1 for b in B if b['vel_flat']) / len(B)
        ob['programs'] = collections.Counter(b['program'] for b in B).most_common(6)
        for mode in ('maj', 'min'):
            dd = collections.Counter(); n = 0
            for r in ok:
                if r.get('bass') and r['bass']['bars'] >= 8 and r['key']['mode'] == mode:
                    n += 1
                    for k, v in r['bass']['deg'].items(): dd[int(k)] += v
            ob['deg_' + mode] = [round(dd[i] / n, 3) if n else None for i in range(12)]; ob['n_' + mode] = n
        O['bass'] = ob
    # ---------------- key / harmony
    keyed = [r for r in ok if r.get('key')]
    O['minor_share'] = sum(1 for r in keyed if r['key']['mode'] == 'min') / max(1, len(keyed))
    H = {}
    for mode in ('maj', 'min'):
        rs_ = [r for r in keyed if r['key']['mode'] == mode and r.get('harmony') and r['harmony']['windows'] >= 8]
        cont = collections.Counter(); qual = collections.Counter(); qtot = 0; cls = collections.Counter()
        for r in rs_:
            labs = r['harmony']['labels']; seen = set()
            for lab, n in labs.items():
                if n >= 2: cont[lab] += 1
                qual[lab.split(':')[1]] += n; qtot += n
                d, q = lab.split(':'); d = int(d)
                if n >= 2:
                    if q in ('maj', '7', 'maj7', 'add9', 'sus4', 'sus2', '5'): seen.add((d, 'M'))
                    if q in ('maj', '7', 'maj7', 'add9'): seen.add((d, 'M3'))
                    if q in ('min', 'm7', 'madd9'): seen.add((d, 'm'))
            for x in seen: cls[x] += 1
        H[mode] = {'n': len(rs_), 'contains': {k: round(v / len(rs_), 3) for k, v in cont.most_common(14)} if rs_ else {},
                   'quality_share': {k: round(v / qtot, 3) for k, v in qual.most_common(8)} if qtot else {},
                   'change_per_halfbar': med([r['harmony']['change_per_halfbar'] for r in rs_]),
                   'deg_class': {f'{d}:{c}': round(v / len(rs_), 3) for (d, c), v in cls.items()} if rs_ else {}}
    O['harmony'] = H
    # ---------------- roles
    R = collections.defaultdict(list)
    for r in ok:
        for x in r.get('roles', []):
            if x['bars'] >= 4: R[x['role']].append((r, x))
    OR = {}
    for role in ('chord', 'pad', 'arp', 'lead', 'other'):
        xs = [x for _, x in R[role]]
        if not xs: continue
        o = {'parts': len(xs), 'songs_with': len({id(r) for r, _ in R[role]}) / len(ok),
             'families': collections.Counter(x['family'] for x in xs).most_common(5)}
        for k in ('onsets_per_bar', 'poly', 'len_med', 'gate_med', 'pcs_per_bar', 'span_bar', 'grid16_share', 'grid8_share',
                  'desc_share'):
            o[k] = med([x[k] for x in xs])
        o['reg'] = [med([x['reg'][i] for x in xs]) for i in range(3)]
        o['len_hist'] = [mean([x['len_hist'][i] for x in xs]) for i in range(6)]
        q = collections.Counter()
        for x in xs:
            for k, v in x['qual'].items(): q[k.replace('+ext', '')] += v
        tq = sum(q.values())
        o['qual'] = [(k, round(v / tq, 3)) for k, v in q.most_common(7)] if tq else []
        if role == 'arp':
            o['arp_16th'] = sum(1 for x in xs if x['grid16_share'] >= .5) / len(xs)
            o['arp_8th'] = sum(1 for x in xs if x['grid8_share'] >= .5) / len(xs)
        if role in ('lead', 'arp'):
            iv = collections.Counter()
            for x in xs:
                for k, v in (x['iv_abs'] or {}).items(): iv[int(k)] += v
            ti = sum(iv.values()) or 1
            o['iv_abs'] = {k: round(iv[k] / ti, 3) for k in sorted(iv)}
        OR[role] = o
    O['roles'] = OR
    # instrument-family presence (any non-drum part with >= 4 groove bars)
    fams = collections.Counter()
    for r in ok:
        fs = {x['family'] for x in r.get('roles', []) if x['bars'] >= 4}
        if r.get('bass'): fs.add('bass:' + ('synth' if 38 <= r['bass']['program'] <= 39 else 'other'))
        for f in fs: fams[f] += 1
    O['family_presence'] = {k: round(v / len(ok), 3) for k, v in fams.most_common(14)}
    return O, tables(O)


def tables(O):
    L = []
    D = O['drums']
    L.append(f"**Corpus:** {O['selected']} songs selected, **{O['measured']} measured** ({O['artists']} artists); "
             f"skipped {O['skips']}. Drums FLAT (≤ 2 distinct velocities): {O['flat_share']:.0%} of measured songs "
             f"({O['n_dyn']} songs carry velocity stats).")
    b = O['bpm']; bf = O['bpm_folded']
    L.append(f"**Tempo (file tempo map):** median {b[1]:.0f} BPM, IQR {b[0]:.0f}–{b[2]:.0f}; folded into 90–180: "
             f"median {bf[1]:.0f}, IQR {bf[0]:.0f}–{bf[2]:.0f}.")
    s = O['hat_swing']
    if s[1] is not None:
        L.append(f"**Swing (even-16th hat delay, ticks @ 96 PPQN):** median {s[1]:.1f}, IQR {s[0]:.1f}–{s[2]:.1f}; "
                 f"songs ≥ 4 ticks: {O['swung_ge4']:.0%}. Files with a triplet/shuffle grid were skipped "
                 f"({O['skips'].get('triplet', 0)}).")
    L.append(f"**Fills:** median fill-bar share {f2(O['fill_share'])}; P(crash on 1 | after fill) {f2(O['crash1_after_fill'])}, "
             f"| after groove {f2(O['crash1_after_groove'])}. Kit (kick+snare+hat) bar-to-bar repeat: median {f2(O['kit_bar_repeat'])}.")
    L.append('')
    L.append('**Drum families (share of songs):** ' + '; '.join(f'{k} {v:.0%}' for k, v in O['families'].items()))
    L.append('')
    L.append(f"**Kick even-16th share (median song):** {f2(O['kick_even_share'])}. "
             f"**Hat tiering** (beat-hat vel − off-8th-hat vel, dynamic songs): median {f2(O['hat_beat_minus_off8'][1], 1)}, "
             f"IQR {f2(O['hat_beat_minus_off8'][0], 1)}…{f2(O['hat_beat_minus_off8'][2], 1)} (n={O['hat_beat_minus_off8'][3]}). "
             f"**Snare ghost share** (vel ≤ 45 off the backbeat, dynamic songs): median {f2(O['snare_ghost_share'])}; "
             f"songs with > 10 % ghosts: {f2(O['snare_ghost_songs_gt10'])}.")
    L.append(f"**Distinct velocities per lane** (all songs using the lane): kick ≤ 2 in {O['kick_vel_distinct_le2']:.0%} "
             f"(≤ 3 in {O['kick_vel_distinct_le3']:.0%}); snare ≤ 2 in {O['snare_vel_distinct_le2']:.0%} "
             f"(≤ 3 {O['snare_vel_distinct_le3']:.0%}); hat ≤ 2 in {O['hat_vel_distinct_le2']:.0%} (≤ 3 {O['hat_vel_distinct_le3']:.0%}).")
    L.append('')
    L.append('### Drums — onset probability (P) and mean velocity per 16th step, groove bars')
    L.append('')
    L.append(HDR)
    for c in CATS:
        L.append(row(f'{c.upper()} P', D[c]['P'], fp))
        L.append(row(f'{c} vel', D[c]['vel'], fv))
    L.append(row('open-hat P', D['hat']['open_P'], fp))
    L.append('')
    L.append('| lane | songs using (≥ 25 % bars) | hits/bar (median song) | vel median | vel SD (median song) | distinct vels (median) | commonest notes (share) | commonest modal bar (share of songs) |')
    L.append('|---|---|---|---|---|---|---|---|')
    for c in CATS:
        d = D[c]
        L.append(f"| {c} | {d['songs_using']:.0%} | {f2(d['hits_per_bar'], 1)} | {fv(d['vel_mean'])} | {f2(d['vel_sd'], 1)} | "
                 f"{f2(d['vel_distinct'], 0)} | {', '.join(f'{n} {v:.2f}' for n, v in d['notes'][:4])} | "
                 f"{', '.join(f'`{p}` {v:.2f}' for p, v in d['modal_bar'][:3])} |")
    L.append('')
    L.append(f"Open-hat share of hat hits: {f2(D['hat']['open_share'])}. Ride share of cymbal hits: {f2(D['cymb']['ride_share'])}.")
    L.append('')
    if 'bass' in O:
        B = O['bass']
        L.append(f"### Bass ({O['bass_songs']} songs; source {O['bass_src']})")
        L.append('')
        L.append(HDR)
        L.append(row('BASS P', B['P'], fp))
        L.append('')
        q = lambda k, d=2: f"{f2(B[k][1], d)} (IQR {f2(B[k][0], d)}–{f2(B[k][2], d)})"
        L.append(f"- notes/bar {q('notes_per_bar', 1)}; share of onsets on 8th positions {q('odd_step_share')}")
        L.append(f"- **sequencer-ness:** bars that are a constant 16th pulse {B['seq16_share_bars']:.0%}, constant 8th pulse "
                 f"{B['seq8_share_bars']:.0%}; songs where ≥ half the bass bars are a constant 8th/16th pulse "
                 f"{B['songs_seq_ge50']:.0%} (16th {B['songs_seq16_ge50']:.0%}, 8th {B['songs_seq8_ge50']:.0%})")
        L.append(f"- note length (16ths) median {q('len_med')}; gate ratio (length ÷ gap to next onset) {q('gate_med')}; "
                 f"length histogram ≤½ / ½–1 / 1–2 / 2–4 / 4–8 / > 8 steps: "
                 + ' / '.join(f'{x:.2f}' for x in B['len_hist']))
        L.append(f"- register (MIDI) p10/median/p90 of the median song: {B['reg'][0]:.0f} / {B['reg'][1]:.0f} / {B['reg'][2]:.0f}")
        L.append(f"- intervals between consecutive notes: repeat {q('rep_share')}, step 1–2 st {q('step_share')}, "
                 f"leap 3–11 st {q('leap_share')}, **octave {q('oct_share')}**; songs with ≥ 25 % octave moves "
                 f"{B['songs_oct_ge25']:.0%}")
        L.append(f"- pitch classes per bar {q('pcs_per_bar')}; flat-velocity bass {B['vel_flat_share']:.0%}; velocity CV within a bar "
                 f"(non-flat) {q('vel_cv_bar_med')}")
        L.append(f"- programs: {', '.join(f'{p} ({n})' for p, n in B['programs'])}")
        for mode in ('maj', 'min'):
            if B.get('n_' + mode):
                dd = B['deg_' + mode]
                top = sorted(range(12), key=lambda i: -dd[i])[:7]
                L.append(f"- scale degrees of bass notes, {mode} songs (n={B['n_' + mode]}): "
                         + ', '.join(f'{DEG[i]} {dd[i]:.2f}' for i in top))
        L.append('')
    Hm = O['harmony']
    L.append(f"### Key and harmony (estimated; minor share {O['minor_share']:.0%})")
    L.append('')
    for mode in ('maj', 'min'):
        h = Hm[mode]
        if not h['n']: continue
        dc = h['deg_class']; g_ = lambda k: dc.get(k, 0)
        if mode == 'min':
            key = [('bVII', '10:M'), ('bVI', '8:M'), ('bIII', '3:M'), ('iv', '5:m'), ('IV (maj/7, Dorian)', '5:M3'),
                   ('v (minor)', '7:m'), ('V (maj/7, harmonic)', '7:M3'), ('bII', '1:M')]
        else:
            key = [('IV', '5:M'), ('V', '7:M'), ('vi', '9:m'), ('ii', '2:m'), ('iii', '4:m'), ('bVII', '10:M'),
                   ('bIII', '3:M'), ('bVI', '8:M')]
        L.append(f"- **{mode} songs (n={h['n']})** — share of songs using the chord (≥ 2 half-bars; 'major-type' includes "
                 f"power chords and sus): " + ', '.join(f'{n} {g_(k):.2f}' for n, k in key))
        conts = ', '.join(f"{lab_name(k, mode)} {v:.2f}" for k, v in list(h['contains'].items())[:12])
        L.append(f"  - commonest labels: {conts}")
        L.append(f"  - half-bar chord qualities: {', '.join(f'{k} {v:.2f}' for k, v in h['quality_share'].items())}; "
                 f"chord change per half-bar (median) {f2(h['change_per_halfbar'])}")
    L.append('')
    L.append('### Other parts (role by polyphony / rhythm heuristic, see README)')
    L.append('')
    L.append('| role | parts | songs with | families | onsets/bar | poly | note len (16ths) | gate | register p10/med/p90 | pcs/bar | notes |')
    L.append('|---|---|---|---|---|---|---|---|---|---|---|')
    for role, o in O['roles'].items():
        extra = ''
        if role in ('chord', 'pad') and o['qual']: extra = 'qualities ' + ', '.join(f'{k} {v:.2f}' for k, v in o['qual'][:5])
        if role == 'arp': extra = f"16th-grid {o['arp_16th']:.0%}, 8th-grid {o['arp_8th']:.0%}, span/bar {f2(o['span_bar'], 0)} st"
        if role == 'lead' and o.get('iv_abs'):
            iv = o['iv_abs']; extra = (f"repeat {iv.get(0, 0):.2f}, step 1–2 {iv.get(1, 0) + iv.get(2, 0):.2f}, "
                                       f"3rds {iv.get(3, 0) + iv.get(4, 0):.2f}, 4/5th {iv.get(5, 0) + iv.get(7, 0):.2f}, "
                                       f"oct {iv.get(12, 0):.2f}; descending {f2(o['desc_share'])}")
        L.append(f"| {role} | {o['parts']} | {o['songs_with']:.0%} | {', '.join(f'{k} {n}' for k, n in o['families'][:3])} | "
                 f"{f2(o['onsets_per_bar'], 1)} | {f2(o['poly'])} | {f2(o['len_med'], 1)} | {f2(o['gate_med'])} | "
                 f"{f2(o['reg'][0], 0)}/{f2(o['reg'][1], 0)}/{f2(o['reg'][2], 0)} | {f2(o['pcs_per_bar'], 1)} | {extra} |")
    L.append('')
    L.append('Instrument-family presence (share of songs): ' + ', '.join(f'{k} {v:.0%}' for k, v in O['family_presence'].items()))
    return '\n'.join(L) + '\n'


def lab_name(k, mode):
    d, q = k.split(':'); d = int(d)
    names = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII']
    n = names[d]
    if q in ('min', 'm7', 'madd9'): n = n.lower()
    suf = {'maj': '', 'min': '', '7': '7', 'maj7': 'maj7', 'm7': '7', 'sus4': 'sus4', 'sus2': 'sus2', 'dim': '°',
           'aug': '+', 'add9': 'add9', 'madd9': 'add9', '5': '5'}.get(q, q)
    return n + suf


def main():
    rs = [json.loads(l) for l in open(sys.argv[1])]
    out = sys.argv[2]
    summ = ['| genre | selected | measured | artists | flat drums | median BPM (folded) | 4otf kick | backbeat 5+13 | 16th hats | bass seq ≥ 50 % | bass oct ≥ 25 % | minor |',
            '|---|---|---|---|---|---|---|---|---|---|---|---|']
    summ2 = ['| genre | kick P 5/13 | kick P 7/11 | hat hits/bar | open-hat share | hat tier (beat−off8) | clap share of snare notes | perc lane | ride share | bass notes/bar | bass len (16ths) | bass gate | bass median MIDI | bass repeat share | arp songs | synth-family songs | drum-lane vel SD kick/snare/hat |',
             '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for g in GENRES:
        rg = [r for r in rs if r['genres'][0] == g]
        if not rg: continue
        O, T = agg_genre(rg, g)
        json.dump(O, open(f'{out}/{g}_stats.json', 'w'), indent=1, default=str)
        open(f'{out}/{g}_tables.md', 'w').write(T)
        if O['measured']:
            f = O['families']; B = O.get('bass', {})
            summ.append(f"| {g} | {O['selected']} | {O['measured']} | {O['artists']} | {O['flat_share']:.0%} | "
                        f"{O['bpm_folded'][1]:.0f} | {f['kick 4otf']:.0%} | {f['snare backbeat 5+13']:.0%} | "
                        f"{f['hat 16ths (>=12/bar)']:.0%} | {B.get('songs_seq_ge50', 0):.0%} | {B.get('songs_oct_ge25', 0):.0%} | "
                        f"{O['minor_share']:.0%} |")
            D = O['drums']; clap = dict(D['snare']['notes']).get('clap', 0)
            fp_ = O['family_presence']; syn = max(fp_.get('synthlead', 0), fp_.get('synthpad', 0))
            summ2.append(f"| {g} | {fp(D['kick']['P'][4])}/{fp(D['kick']['P'][12])} | {fp(D['kick']['P'][6])}/{fp(D['kick']['P'][10])} | "
                         f"{f2(D['hat']['hits_per_bar'], 1)} | {f2(D['hat']['open_share'])} | {f2(O['hat_beat_minus_off8'][1], 1)} | "
                         f"{clap:.2f} | {O['families']['perc lane (>=.5 bars)']:.0%} | {f2(D['cymb']['ride_share'])} | "
                         f"{f2(B.get('notes_per_bar', [None]*3)[1], 1)} | {f2(B.get('len_med', [None]*3)[1])} | {f2(B.get('gate_med', [None]*3)[1])} | "
                         f"{f2(B.get('reg', [None]*3)[1], 0)} | {f2(B.get('rep_share', [None]*3)[1])} | {O['roles'].get('arp', {}).get('songs_with', 0):.0%} | "
                         f"{syn:.0%} | {f2(D['kick']['vel_sd'], 1)}/{f2(D['snare']['vel_sd'], 1)}/{f2(D['hat']['vel_sd'], 1)} |")
    open(f'{out}/summary.md', 'w').write('\n'.join(summ) + '\n\n' + '\n'.join(summ2) + '\n')
    print('\n'.join(summ2))
    print('\n'.join(summ))


if __name__ == '__main__': main()
