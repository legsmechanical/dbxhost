# LMD per-song measurement for the phrase library (drums, bass, chord/pad/arp/lead roles).
# Lakh MIDI Dataset (LMD-matched, CC BY 4.0, Raffel 2016). The MIDI files are transcriptions of
# commercial songs: DRUM single-lane loops may be carried over (owner ruling); every MELODIC number
# here is a statistic only.
#
# Usage: python3 lmd_measure.py out/selection.json <lmd_matched dir> out/songs.jsonl
#   selection.json = output of lmd_select.py (one best MIDI per song, with genre labels).
# Writes one JSON line per song (measured or with a 'skip' reason). lmd_report.py aggregates.
#
# METHOD (all choices are ours; see ../README.md):
# - Grid: pretty_midi beat + downbeat times (tempo map AND meter map); every beat split into four
#   16ths by linear interpolation. Onset -> nearest 16th; deviation = fraction of a 16th (x24 =
#   ticks @ 96 PPQN). Only bars holding exactly 4 beats under 4/4 are used; notes in other bars
#   (a 2/4 turnaround, a 3/4 bridge) are dropped. No meter event = 4/4 (MIDI default).
# - Usable timing: >= 50 % of bars are 4/4 ('meter'); tempo 60..200 BPM; drum onsets must sit
#   on the grid: median |dev| <= 0.15 of a 16th, and triplet share (|dev| in .25..0.42) < 0.25.
#   Otherwise skip ('offgrid' / 'triplet' / 'meter').
# - Phase check: if snare prefers beats 1+3 over 2+4 AND kick prefers 2+4, the bar phase is
#   off by a beat -> skip ('phase'); we do not rotate.
# - Groove vs fill (as GMD DK1): a bar is a FILL if it has tom onsets whose tom pattern differs
#   from both neighbours, or >= 3 snare hits on steps 9-16 other than 13 and that snare pattern is
#   not the song's modal snare bar. A GROOVE bar has kick or snare, and is not a fill.
#   Steady section = all groove bars (drum-less intros/breakdowns drop out automatically).
# - Categories: KICK 35,36 | SNARE 38,40,39(clap) | HAT 42,44 closed/pedal, 46 open |
#   TOM 41,43,45,47,48,50 | CYMB 49,52,55,57 crash, 51,53,59 ride | PERC everything else
#   (incl. 37 side-stick, 54 tambourine, 56 cowbell, 60-81).
# - FLAT velocity file = <= 2 distinct drum velocities in the groove bars; excluded from velocity
#   stats (flagged in counts).
import json, sys, collections, statistics as st, math
import numpy as np
import pretty_midi

KICK = {35, 36}; SNARE = {38, 40, 39}; HATC = {42, 44}; HATO = {46}; TOM = {41, 43, 45, 47, 48, 50}
CRASH = {49, 52, 55, 57}; RIDE = {51, 53, 59}
CATS = ['kick', 'snare', 'hat', 'tom', 'perc', 'cymb']


def dcat(n):
    if n in KICK: return 'kick'
    if n in SNARE: return 'snare'
    if n in HATC or n in HATO: return 'hat'
    if n in TOM: return 'tom'
    if n in CRASH or n in RIDE: return 'cymb'
    return 'perc'


# Krumhansl-Kessler key profiles
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def est_key(hist):
    best = None
    for mode, prof in (('maj', MAJ), ('min', MIN)):
        for t in range(12):
            r = np.corrcoef(hist, np.roll(prof, t))[0, 1]
            if best is None or r > best[0]: best = (r, t, mode)
    return best[1], best[2], round(float(best[0]), 3)


# chord templates (intervals above root) - tested in this order of preference on ties
TEMPL = [('maj', {0, 4, 7}), ('min', {0, 3, 7}), ('7', {0, 4, 7, 10}), ('maj7', {0, 4, 7, 11}),
         ('m7', {0, 3, 7, 10}), ('sus4', {0, 5, 7}), ('sus2', {0, 2, 7}), ('dim', {0, 3, 6}),
         ('aug', {0, 4, 8}), ('add9', {0, 2, 4, 7}), ('madd9', {0, 2, 3, 7}), ('5', {0, 7})]


def chord_quality(pcs, bass_pc=None):
    """pcs: set of pitch classes. Returns (root, quality) of the exactly-matching template, else
    best-covering template, else None. Power chord '5' only if exactly {r, r+7}."""
    pcs = set(pcs)
    if len(pcs) < 2: return None
    cands = []
    for r in range(12):
        rel = {(p - r) % 12 for p in pcs}
        for q, T in TEMPL:
            if rel == T: cands.append((0, q != 'maj' and q != 'min', r != bass_pc, r, q))
    if cands:
        c = min(cands); return c[3], c[4]
    # superset of a triad (extensions we do not name) -> triad + 'ext'
    for r in range(12):
        rel = {(p - r) % 12 for p in pcs}
        for q, T in TEMPL[:2]:
            if T <= rel: cands.append((len(rel - T), r != bass_pc, r, q + '+ext'))
    if cands:
        c = min(cands); return c[2], c[3]
    return None


class Grid:
    """Bars from pretty_midi downbeats (so meter changes are respected); a bar is VALID only if it
    holds exactly 4 beats under a 4/4 signature. pos(t) = global 16th index (bar*16 + step), or
    None inside a non-4/4 bar. Onsets in invalid bars are dropped."""
    def __init__(self, pm):
        b = pm.get_beats()
        if len(b) < 8: raise ValueError('short')
        self.beats = b
        step = float(np.median(np.diff(b)))
        self.b = np.concatenate([b, b[-1] + step * np.arange(1, 9)])
        db = list(pm.get_downbeats())
        if not db: db = [0.0]
        # extend downbeats past the end using the last bar's beat count
        last_n = 4
        while db[-1] < self.b[-1]:
            i = int(np.argmin(np.abs(self.b - db[-1])))
            if i + last_n >= len(self.b): break
            db.append(float(self.b[i + last_n]))
        self.db = np.array(db)
        ts = sorted(pm.time_signature_changes, key=lambda x: x.time)
        def ts_at(t):
            cur = (4, 4)
            for x in ts:
                if x.time <= t + 1e-6: cur = (x.numerator, x.denominator)
            return cur
        self.bar_of_beat = []; self.beat_in_bar = []
        for t in self.b:
            k = int(np.searchsorted(self.db, t + 1e-6) - 1); self.bar_of_beat.append(k)
        cnt = collections.Counter(self.bar_of_beat)
        seen = collections.Counter()
        for k in self.bar_of_beat:
            self.beat_in_bar.append(seen[k]); seen[k] += 1
        self.valid = {k for k in cnt if k >= 0 and cnt[k] == 4 and ts_at(self.db[k]) == (4, 4)}
        # the last (extended) bar may be short: treat as valid if 4/4
        nb = len(self.db) - 1
        self.valid_share = len([k for k in self.valid if k < nb]) / max(1, nb)

    def pos(self, t):
        b = self.b
        i = int(np.searchsorted(b, t, side='right') - 1)
        if i < 0: i = 0
        if i >= len(b) - 1: i = len(b) - 2
        frac = (t - b[i]) / (b[i + 1] - b[i])
        k = self.bar_of_beat[i]
        if k not in self.valid: return None
        return k * 16 + self.beat_in_bar[i] * 4 + frac * 4

    def tick_len(self, t0, t1):
        # note length in 16ths using the local beat duration at the onset
        b = self.b
        i = int(np.clip(np.searchsorted(b, t0, side='right') - 1, 0, len(b) - 2))
        return (t1 - t0) / (b[i + 1] - b[i]) * 4


def quant(g, t):
    p = g.pos(t)
    if p is None: return -1, 0.0
    q = int(round(p))
    if q // 16 not in g.valid: return -1, 0.0
    return q, p - q


def main():
    sel = json.load(open(sys.argv[1])); root = sys.argv[2]; outp = open(sys.argv[3], 'w')
    only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
    n = 0
    for s in sel:
        if only and not (set(s['genres']) & only): continue
        n += 1
        try:
            r = measure(s, root)
        except Exception as e:  # noqa
            r = {'skip': 'error:' + type(e).__name__ + ':' + str(e)[:80]}
        r.update({k: s[k] for k in ('tid', 'md5', 'artist', 'title', 'year', 'genres', 'score')})
        outp.write(json.dumps(r, default=lambda o: o.item()) + '\n'); outp.flush()
        if n % 50 == 0: print(n, file=sys.stderr)


def path_for(root, tid, md5):
    return f"{root}/{tid[2]}/{tid[3]}/{tid[4]}/{tid}/{md5}.mid"


def measure(s, root):
    pm = pretty_midi.PrettyMIDI(path_for(root, s['tid'], s['md5']))
    tt, tempi = pm.get_tempo_changes()
    g = Grid(pm)
    if g.valid_share < .5: return {'skip': 'meter'}
    drums = [i for i in pm.instruments if i.is_drum]
    dnotes = [n for i in drums for n in i.notes]
    if len(dnotes) < 64: return {'skip': 'nodrums'}
    # ---------- drums onto the grid
    ev = []
    devs = []
    for nt in dnotes:
        q, d = quant(g, nt.start)
        if q < 0: continue
        ev.append((q, nt.pitch, nt.velocity, d)); devs.append(abs(d))
    devs = np.array(devs)
    med_dev = float(np.median(devs)); trip = float(np.mean((devs >= .25) & (devs <= .42)))
    bpm = float(60.0 / np.median(np.diff(g.beats)))
    info = {'meter_valid_share': round(g.valid_share, 3), 'bpm': round(bpm, 1), 'tempo_changes': len(tempi), 'drum_med_dev': round(med_dev, 3),
            'drum_trip_share': round(trip, 3)}
    if not 60 <= bpm <= 200: info['skip'] = 'tempo'; return info
    if trip >= .25: info['skip'] = 'triplet'; return info
    if med_dev > .15: info['skip'] = 'offgrid'; return info
    nb = max(e[0] for e in ev) // 16 + 1
    grid = {c: collections.defaultdict(dict) for c in CATS}
    openhat = collections.defaultdict(set); ride = collections.defaultdict(set)
    cat_notes = {c: collections.Counter() for c in CATS}; bar_ok = lambda b: True
    hat_dev = {'odd': [], 'even': []}
    for q, p, v, d in ev:
        bar, slot = divmod(q, 16); c = dcat(p)
        if slot not in grid[c][bar] or v > grid[c][bar][slot][0]:
            grid[c][bar][slot] = (v, d, p)
        if p in HATO: openhat[bar].add(slot)
        if p in RIDE: ride[bar].add(slot)
        if bar_ok(bar): cat_notes[c][p] += 1
        if c == 'hat': (hat_dev['odd'] if slot % 2 == 0 else hat_dev['even']).append(d)
    bars = range(nb)
    pat = lambda c, b: frozenset(grid[c][b]) if 0 <= b < nb else None
    snare_modal = collections.Counter(pat('snare', b) for b in bars if grid['snare'][b]).most_common(1)
    snare_modal = snare_modal[0][0] if snare_modal else None
    isfill = []
    for b in bars:
        tf = bool(grid['tom'][b]) and pat('tom', b) != pat('tom', b - 1) and pat('tom', b) != pat('tom', b + 1)
        sf = sum(1 for i in grid['snare'][b] if i >= 8 and i != 12) >= 3 and pat('snare', b) != snare_modal
        isfill.append(tf or sf)
    groove = [b for b in bars if b in g.valid and (grid['kick'][b] or grid['snare'][b]) and not isfill[b]]
    if len(groove) < 8: info['skip'] = 'fewgroove'; return info
    # phase check
    def P(c, s): return sum(1 for b in groove if s in grid[c][b]) / len(groove)
    sn13 = P('snare', 0) + P('snare', 8); sn24 = P('snare', 4) + P('snare', 12)
    k13 = P('kick', 0) + P('kick', 8); k24 = P('kick', 4) + P('kick', 12)
    if sn13 > sn24 + .3 and k24 > k13 + .1: info['skip'] = 'phase'; return info
    gset = set(groove)
    # velocity flatness over groove bars
    allv = [grid[c][b][i][0] for c in CATS for b in groove for i in grid[c][b]]
    info['drum_vel_distinct'] = len(set(allv)); info['drum_flat'] = len(set(allv)) <= 2
    D = {}
    for c in CATS:
        onP = [0] * 16; vel = [[] for _ in range(16)]; per = []; pats = collections.Counter()
        for b in groove:
            per.append(len(grid[c][b])); pats[''.join('x' if i in grid[c][b] else '.' for i in range(16))] += 1
            for i, (v, d, _p) in grid[c][b].items(): onP[i] += 1; vel[i].append(v)
        lv = [v for x in vel for v in x]
        D[c] = {'P': [round(x / len(groove), 3) for x in onP],
                'vel': [round(st.mean(x), 1) if x else None for x in vel],
                'hits_per_bar': round(st.mean(per), 2), 'bars_with_any': round(sum(1 for x in per if x) / len(per), 3),
                'vel_mean': round(st.mean(lv), 1) if lv else None, 'vel_sd': round(st.pstdev(lv), 1) if len(lv) > 1 else None,
                'vel_distinct': len(set(lv)),
                'top': pats.most_common(3)}
    oh = sum(len(openhat[b]) for b in groove); hh = sum(len(grid['hat'][b]) for b in groove)
    D['hat']['open_share'] = round(oh / hh, 3) if hh else None
    D['hat']['open_P'] = [round(sum(1 for b in groove if i in openhat[b]) / len(groove), 3) for i in range(16)]
    cy = sum(len(grid['cymb'][b]) for b in groove); rd = sum(len(ride[b]) for b in groove)
    D['cymb']['ride_share'] = round(rd / cy, 3) if cy else None
    for c in CATS: D[c]['notes'] = cat_notes[c].most_common(8)
    # fills / crash after fill
    aft = collections.Counter()
    for b in range(nb - 1):
        k = 'fill' if isfill[b] else 'groove'
        aft[k] += 1; aft['crash_' + k] += any(i == 0 for i in grid['cymb'][b + 1])
    info['fill_share'] = round(sum(isfill) / nb, 3)
    info['crash1_after_fill'] = round(aft['crash_fill'] / aft['fill'], 3) if aft['fill'] else None
    info['crash1_after_groove'] = round(aft['crash_groove'] / aft['groove'], 3) if aft['groove'] else None
    info['groove_bars'] = len(groove); info['bars'] = nb
    if len(hat_dev['odd']) >= 16 and len(hat_dev['even']) >= 16:
        info['hat_swing_ticks'] = round((st.mean(hat_dev['even']) - st.mean(hat_dev['odd'])) * 24, 2)
    # bar-to-bar repeat of the full kit in groove bars
    kit = lambda b: tuple(pat(c, b) for c in ('kick', 'snare', 'hat'))
    rep = [kit(b) == kit(b + 1) for b in groove if b + 1 in gset]
    info['kit_bar_repeat'] = round(sum(rep) / len(rep), 3) if rep else None
    info['drums'] = D
    # ingest: per-lane 1- and 2-bar loops over consecutive groove bars (with velocities)
    info['lanes'] = lane_loops(grid, groove, openhat)
    # ---------- pitched parts
    info.update(pitched(pm, g, gset))
    return info


def lane_loops(grid, groove, openhat):
    """For each category: the longest run of consecutive groove bars in which the lane's ONSET
    pattern repeats with period 1 or 2 bars. Keeps the loop's steps + per-hit velocities (the first
    occurrence) and the velocity spread across the run."""
    gs = set(groove); out = {}
    for c in CATS:
        best = None
        pt = lambda b: frozenset(grid[c][b])
        for per in (1, 2):
            for start in groove:
                if not grid[c][start]: continue
                if per == 2 and (start + 1 not in gs or pt(start) == pt(start + 1)): continue
                L = 0
                while start + L + per in gs and pt(start + L) == pt(start + L + per):
                    L += 1
                n = L + per
                if n >= (4 if per == 1 else 6) and (best is None or n > best[0]):
                    best = (n, per, start)
        if not best: continue
        n, per, start = best
        run = range(start, start + n)
        loop = []
        for k in range(per):
            b = start + k
            loop.append({str(i): [grid[c][b][i][0], grid[c][b][i][2]] for i in sorted(grid[c][b])})
        vels = [grid[c][b][i][0] for b in run for i in grid[c][b]]
        # velocity pattern consistency: per (bar mod per, step) mean over the run
        cell = collections.defaultdict(list)
        for b in run:
            for i in grid[c][b]: cell[((b - start) % per, i)].append(grid[c][b][i][0])
        cell_mean = {f'{k[0]}:{k[1]}': round(st.mean(v), 1) for k, v in cell.items()}
        out[c] = {'start_bar': start, 'bars': n, 'period': per, 'loop': loop,
                  'vel_distinct': len(set(vels)), 'vel_range': max(vels) - min(vels),
                  'vel_sd': round(st.pstdev(vels), 1), 'cell_mean': cell_mean,
                  'cell_spread': round(max(cell_mean.values()) - min(cell_mean.values()), 1),
                  'cell_sd_mean': round(st.mean(st.pstdev(v) for v in cell.values()), 1)}
    return out


def pitched(pm, g, gset):
    """Bass + roles. Returns dict with 'key', 'bass', 'roles', 'harmony'."""
    res = {}
    insts = [i for i in pm.instruments if not i.is_drum and len(i.notes) >= 16]
    if not insts: res['pitched_skip'] = 'none'; return res
    # key: duration-weighted pitch-class histogram over all pitched notes
    h = np.zeros(12)
    for i in insts:
        for nt in i.notes: h[nt.pitch % 12] += min(nt.end - nt.start, 2.0)
    tonic, mode, kr = est_key(h)
    res['key'] = {'tonic': tonic, 'mode': mode, 'r': kr}
    # per-instrument note table on the grid, restricted to groove bars
    table = {}
    for idx, i in enumerate(insts):
        rows = []
        for nt in i.notes:
            q, d = quant(g, nt.start)
            if q < 0 or q // 16 not in gset: continue
            ln = g.tick_len(nt.start, nt.end)
            rows.append((q, nt.pitch, nt.velocity, ln, d))
        if len(rows) >= 16: table[idx] = sorted(rows)
    if not table: res['pitched_skip'] = 'nogroove'; return res
    med = {k: float(np.median([r[1] for r in v])) for k, v in table.items()}
    poly = {}
    for k, v in table.items():
        on = collections.Counter(r[0] for r in v); poly[k] = st.mean(on.values())
    # bass choice: GM 32-39 (the one with the most groove notes), else lowest median pitch < 55, mono-ish
    bass_cands = [k for k in table if 32 <= insts[k].program <= 39]
    if bass_cands:
        bk = max(bass_cands, key=lambda k: len(table[k])); bsrc = 'program'
    else:
        low = [k for k in table if med[k] < 55 and poly[k] < 1.3]
        bk = min(low, key=lambda k: med[k]) if low else None; bsrc = 'lowest'
    if bk is not None:
        res['bass'] = bass_stats(table[bk], tonic, insts[bk].program, bsrc)
    # roles for the rest
    roles = []
    for k, v in table.items():
        if k == bk: continue
        roles.append(role_stats(v, insts[k].program, tonic, med[k], poly[k]))
    res['roles'] = roles
    # harmony: half-bar windows, all non-drum notes sounding (duration-weighted pcs), bass pc = lowest
    res['harmony'] = harmony(table, tonic, bk)
    return res


def ioi_len(rows):
    """gate ratio per note of a (monophonic-ish) line = length / gap to the next onset"""
    out = []
    ons = sorted(set(r[0] for r in rows))
    nxt = {a: b for a, b in zip(ons, ons[1:])}
    for q, p, v, ln, d in rows:
        if q in nxt: out.append(min(ln / (nxt[q] - q), 2.0))
    return out


def bass_stats(rows, tonic, prog, src):
    # monophonic reduction: lowest note per onset
    lo = {}
    for r in rows:
        if r[0] not in lo or r[1] < lo[r[0]][1]: lo[r[0]] = r
    mono = [lo[q] for q in sorted(lo)]
    bars = collections.defaultdict(list)
    for r in mono: bars[r[0] // 16].append(r)
    onP = [0] * 16
    per = []; seq8 = seq16 = 0; pcs_bar = []; vcv = []
    for b, rs in bars.items():
        steps = {r[0] % 16 for r in rs}
        for s in steps: onP[s] += 1
        per.append(len(steps))
        if steps == set(range(16)): seq16 += 1
        elif steps == set(range(0, 16, 2)): seq8 += 1
        pcs_bar.append(len({r[1] % 12 for r in rs}))
        vs = [r[2] for r in rs]
        if len(vs) >= 4 and st.mean(vs) > 0: vcv.append(st.pstdev(vs) / st.mean(vs))
    nbars = len(bars)
    pitches = [r[1] for r in mono]
    iv = [b[1] - a[1] for a, b in zip(mono, mono[1:]) if b[0] - a[0] <= 4]
    absiv = [abs(x) for x in iv]
    deg = collections.Counter((p - tonic) % 12 for p in pitches)
    lens = [r[3] for r in mono]
    gates = ioi_len(mono)
    allv = [r[2] for r in mono]
    return {'program': prog, 'src': src, 'bars': nbars, 'notes': len(mono),
            'P': [round(x / nbars, 3) for x in onP], 'notes_per_bar': round(st.mean(per), 2),
            'odd_step_share': round(sum(1 for r in mono if r[0] % 2 == 0) / len(mono), 3),
            'seq16_share': round(seq16 / nbars, 3), 'seq8_share': round(seq8 / nbars, 3),
            'len_hist': hist(lens, [0.5, 1, 2, 4, 8]), 'len_med': round(float(np.median(lens)), 2),
            'gate_med': round(float(np.median(gates)), 2) if gates else None,
            'reg': [int(np.percentile(pitches, 10)), int(np.median(pitches)), int(np.percentile(pitches, 90))],
            'oct_share': round(sum(1 for x in absiv if x == 12) / len(absiv), 3) if absiv else None,
            'rep_share': round(sum(1 for x in absiv if x == 0) / len(absiv), 3) if absiv else None,
            'step_share': round(sum(1 for x in absiv if 1 <= x <= 2) / len(absiv), 3) if absiv else None,
            'leap_share': round(sum(1 for x in absiv if 3 <= x <= 11) / len(absiv), 3) if absiv else None,
            'iv_hist': dict(collections.Counter(max(-12, min(12, x)) for x in iv).most_common(10)),
            'deg': {str(k): round(v / len(pitches), 3) for k, v in sorted(deg.items())},
            'pcs_per_bar': round(st.mean(pcs_bar), 2),
            'vel_flat': len(set(allv)) <= 2, 'vel_cv_bar_med': round(float(np.median(vcv)), 3) if vcv else None}


def hist(xs, edges):
    out = [0] * (len(edges) + 1)
    for x in xs:
        k = 0
        while k < len(edges) and x > edges[k] + 1e-6: k += 1
        out[k] += 1
    t = max(1, len(xs)); return [round(o / t, 3) for o in out]


def family(prog):
    fams = ['piano', 'chromperc', 'organ', 'guitar', 'bass', 'strings', 'ensemble', 'brass', 'reed',
            'pipe', 'synthlead', 'synthpad', 'synthfx', 'ethnic', 'percussive', 'sfx']
    return fams[prog // 8]


def role_stats(rows, prog, tonic, med, poly):
    on = collections.defaultdict(list)
    for r in rows: on[r[0]].append(r)
    bars = collections.defaultdict(set)
    for q in on: bars[q // 16].add(q % 16)
    nb = len(bars)
    lens = [r[3] for r in rows]
    per = st.mean(len(s) for s in bars.values())
    pcs_bar = st.mean(len({r[1] % 12 for q, rs in on.items() if q // 16 == b for r in rs}) for b in bars)
    grid16 = sum(1 for s in bars.values() if len(s) >= 12) / nb
    grid8 = sum(1 for s in bars.values() if s >= set(range(0, 16, 2)) and len(s) <= 9) / nb
    medlen = float(np.median(lens))
    pr = [r[1] for r in rows]
    span_bar = st.mean(max(r[1] for q, rs in on.items() if q // 16 == b for r in rs) -
                       min(r[1] for q, rs in on.items() if q // 16 == b for r in rs) for b in bars)
    # role heuristic
    if poly < 1.3 and per >= 7 and medlen <= 1.6 and pcs_bar >= 3 and span_bar >= 7:
        role = 'arp'
    elif poly >= 1.5 and medlen >= 6:
        role = 'pad'
    elif poly >= 1.5:
        role = 'chord'
    elif poly < 1.3 and med >= 55:
        role = 'lead'
    else:
        role = 'other'
    qual = collections.Counter(); rootdeg = collections.Counter()
    if role in ('chord', 'pad'):
        for q, rs in on.items():
            if len(rs) >= 2:
                c = chord_quality({r[1] % 12 for r in rs}, min(r[1] for r in rs) % 12)
                if c: qual[c[1]] += 1; rootdeg[(c[0] - tonic) % 12] += 1
    iv = []
    if role in ('lead', 'arp'):
        mono = [max(on[q], key=lambda r: r[1]) for q in sorted(on)]
        iv = [b[1] - a[1] for a, b in zip(mono, mono[1:]) if b[0] - a[0] <= 8]
    gates = ioi_len([max(on[q], key=lambda r: r[1]) for q in sorted(on)])
    return {'role': role, 'program': prog, 'family': family(prog), 'bars': nb, 'onsets_per_bar': round(per, 2),
            'poly': round(poly, 2), 'len_med': round(medlen, 2), 'len_hist': hist(lens, [0.5, 1, 2, 4, 8]),
            'gate_med': round(float(np.median(gates)), 2) if gates else None,
            'reg': [int(np.percentile(pr, 10)), int(np.median(pr)), int(np.percentile(pr, 90))],
            'pcs_per_bar': round(pcs_bar, 2), 'span_bar': round(span_bar, 1),
            'grid16_share': round(grid16, 3), 'grid8_share': round(grid8, 3),
            'odd_step_share': round(sum(1 for q in on if q % 2 == 0) / len(on), 3),
            'qual': dict(qual), 'rootdeg': {str(k): v for k, v in rootdeg.items()},
            'iv_abs': dict(collections.Counter(min(12, abs(x)) for x in iv)) if iv else None,
            'desc_share': round(sum(1 for x in iv if x < 0) / max(1, sum(1 for x in iv if x != 0)), 3) if iv else None,
            'vel_distinct': len({r[2] for r in rows})}


def harmony(table, tonic, bk):
    """Half-bar chord labels from all pitched parts (duration-weighted pitch classes, a pc counts if
    it has >= 15 % of the window's weight). Returns counts of (root degree, quality) and the share of
    windows per chord-root degree; plus changes per bar."""
    W = collections.defaultdict(lambda: np.zeros(12)); lowest = {}
    for k, rows in table.items():
        for q, p, v, ln, d in rows:
            t = q; end = q + max(ln, 0.25)
            while t < end:
                w = int(t // 8); seg = min(end, (w + 1) * 8) - t
                W[w][p % 12] += seg
                if k == bk and (w not in lowest or p < lowest[w]): lowest[w] = p
                t += seg
    labels = {}
    for w, h in W.items():
        if h.sum() <= 0: continue
        pcs = {i for i in range(12) if h[i] >= .15 * h.sum()}
        c = chord_quality(pcs, lowest[w] % 12 if w in lowest else None)
        if c: labels[w] = ((c[0] - tonic) % 12, c[1].replace('+ext', ''))
    cnt = collections.Counter(labels.values())
    ws = sorted(labels)
    ch = sum(1 for a, b in zip(ws, ws[1:]) if b == a + 1 and labels[a] != labels[b])
    adj = sum(1 for a, b in zip(ws, ws[1:]) if b == a + 1)
    return {'labels': {f'{k[0]}:{k[1]}': v for k, v in cnt.most_common(12)}, 'windows': len(labels),
            'change_per_halfbar': round(ch / adj, 3) if adj else None}


if __name__ == '__main__': main()
