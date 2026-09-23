# DK: per-category (kick/snare/xstick/tom/crash/ride/hat) per-16th-slot statistics of the Groove MIDI
# Dataset (GMD, CC BY 4.0), by style family.
# Usage (in a dir holding the unzipped groove/ of groove-v1.0.0-midionly.zip):
#   python3 gmd_drum_stats.py <family> [beat|fill] [--bars all|groove|fill] [--json out.json]
#   <family>: 'rock' matches rock and rock/*; '=rock' matches exactly 'rock'; 'a,b' = union.
#   A FILL BAR is a bar with any tom onset, or loud snare (vel > 60) on >= 3 of steps 9-16 other
#   than 13; every other bar is a GROOVE BAR. --bars restricts the per-slot tables to one kind.
# Onsets quantised to the nearest 16th from tick 0 (GMD files start on a bar line); one onset per
# (category, bar, slot), keeping the first hit's velocity. Timing deviation is in ticks at 96 PPQN
# (24 ticks = one 16th). GHOST = velocity <= 45 (our threshold, not GMD's).
import csv, mido, collections, sys, json, statistics as st
sys.path.insert(0, __file__.rsplit('/', 1)[0] + '/../../analysis')
from lhl import lhl

CATS = {'kick': {36}, 'snare': {38, 40}, 'xstick': {37}, 'tom': {48, 50, 45, 47, 43, 58},
        'crash': {49, 55, 57, 52}, 'ride': {51, 59, 53}, 'hat': {42, 22, 44, 46, 26}}
GHOST = 45


def match(style, fam):
    for f in fam.split(','):
        if f.startswith('='):
            if style == f[1:]: return True
        elif style == f or style.startswith(f + '/'): return True
    return False


def pct(xs, p):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def load(r):
    m = mido.MidiFile('groove/' + r['midi_filename']); s16 = m.ticks_per_beat / 4
    ev = []
    for tr in m.tracks:
        t = 0
        for msg in tr:
            t += msg.time
            if msg.type == 'note_on' and msg.velocity > 0: ev.append((t, msg.note, msg.velocity))
    return sorted(ev), s16


def main():
    a = sys.argv
    fam = a[1]; btype = a[2] if len(a) > 2 and not a[2].startswith('--') else 'beat'
    BARS = a[a.index('--bars') + 1] if '--bars' in a else 'all'
    rows = [r for r in csv.DictReader(open('groove/info.csv'))
            if match(r['style'], fam) and r['beat_type'] == btype and r['time_signature'] == '4-4']
    P = {c: [0] * 16 for c in CATS}; V = {c: [[] for _ in range(16)] for c in CATS}
    D = {c: [[] for _ in range(16)] for c in CATS}
    perbar = {c: [] for c in CATS}; pats = {c: collections.Counter() for c in CATS}
    repeat = {c: [0, 0] for c in CATS}; kick_lhl = []; bars = 0; bpms = []; swing = []
    tom_steps_in_fill = [0] * 16; fs = collections.Counter(); filerows = []; drummers = set()
    for r in rows:
        ev, s16 = load(r)
        if not ev: continue
        last = max(e[0] for e in ev) / (16 * s16); nb = int(last) + 1
        if btype == 'beat' and nb > 1 and last % 1 < 0.25: nb -= 1  # trailing bar with only a final hit
        bpms.append(int(r['bpm'])); drummers.add(r['drummer'])
        grid = {c: collections.defaultdict(dict) for c in CATS}; odd = []; even = []
        for tk, n, v in ev:
            q = round(tk / s16); slot = q % 16; bar = q // 16
            if bar >= nb: continue
            dev = (tk - q * s16) / s16 * 24
            for c, S in CATS.items():
                if n in S and slot not in grid[c][bar]: grid[c][bar][slot] = (v, dev)
            if n in CATS['hat']: (odd if q % 2 == 0 else even).append(dev)
        if len(odd) >= 16 and len(even) >= 16: swing.append(st.mean(even) - st.mean(odd))
        isfill = [bool(grid['tom'][b]) or
                  sum(1 for i, (v, _) in grid['snare'][b].items() if i >= 8 and i != 12 and v > 60) >= 3
                  for b in range(nb)]
        fs['all_bars'] += nb; fs['fill_bars'] += sum(isfill)
        for b in range(nb - 1):
            k = 'fill' if isfill[b] else 'groove'
            fs['after_' + k] += 1; fs['crash1_after_' + k] += 0 in grid['crash'][b + 1]
            fs['fill_after_' + k] += isfill[b + 1]
        for b in range(nb):
            if isfill[b]:
                for i in grid['tom'][b]: tom_steps_in_fill[i] += 1
        keep = [b for b in range(nb) if BARS == 'all' or (BARS == 'fill') == isfill[b]]
        bars += len(keep)
        modal = {}
        for c in CATS:
            seq = []
            for b in keep:
                for slot, (v, dev) in grid[c][b].items():
                    P[c][slot] += 1; V[c][slot].append(v); D[c][slot].append(dev)
                s = ''.join('x' if i in grid[c][b] else '.' for i in range(16))
                seq.append(s); perbar[c].append(len(grid[c][b])); pats[c][s] += 1
                if c == 'kick': kick_lhl.append(lhl(list(grid[c][b].keys())))
            if BARS == 'all':
                for x, y in zip(seq, seq[1:]): repeat[c][1] += 1; repeat[c][0] += (x == y)
            if seq:
                mc = collections.Counter(seq).most_common(1)[0]; modal[c] = (mc[0], round(mc[1] / len(seq), 2))
        filerows.append({'file': r['midi_filename'], 'style': r['style'], 'bpm': int(r['bpm']), 'bars': nb,
                         'drummer': r['drummer'], 'fill_bars': sum(isfill), 'modal': modal})
    out = {'family': fam, 'btype': btype, 'bars_mode': BARS, 'files': len(rows), 'bars': bars,
           'drummers': len(drummers), 'bpm_median': st.median(bpms) if bpms else None,
           'bpm_range': [min(bpms), max(bpms)] if bpms else None,
           'fill': {'fill_bar_share': round(fs['fill_bars'] / fs['all_bars'], 2) if fs['all_bars'] else None,
                    'P_fill_after_fill': round(fs['fill_after_fill'] / fs['after_fill'], 2) if fs['after_fill'] else None,
                    'P_crash1_after_fill': round(fs['crash1_after_fill'] / fs['after_fill'], 2) if fs['after_fill'] else None,
                    'P_crash1_after_groove': round(fs['crash1_after_groove'] / fs['after_groove'], 2) if fs['after_groove'] else None,
                    'tom_step_share_in_fill_bars': [round(x / max(1, sum(tom_steps_in_fill)), 2) for x in tom_steps_in_fill]}}
    if swing:
        sw = sorted(swing)
        out['hat_swing_ticks'] = {'median': round(st.median(sw), 2), 'p25': round(pct(sw, .25), 2),
                                  'p75': round(pct(sw, .75), 2), 'n': len(sw),
                                  'files_ge_58pct': sum(1 for d in sw if (24 + d) / 48 >= .58)}
    for c in CATS:
        allv = [v for s in V[c] for v in s]
        out[c] = {
            'P': [round(x / bars, 2) for x in P[c]] if bars else None,
            'vel': [round(st.mean(x)) if x else None for x in V[c]],
            'ghost_share': [round(sum(1 for v in x if v <= GHOST) / len(x), 2) if len(x) >= 10 else None for x in V[c]],
            'dev': [round(st.mean(x), 1) if len(x) >= 10 else None for x in D[c]],
            'hits_per_bar_median': st.median(perbar[c]) if perbar[c] else 0,
            'bars_with_any': round(sum(1 for x in perbar[c] if x) / bars, 2) if bars else 0,
            'vel_p10_p50_p90': [pct(allv, .1), pct(allv, .5), pct(allv, .9)] if allv else None,
            'ghost_share_all': round(sum(1 for v in allv if v <= GHOST) / len(allv), 2) if allv else None,
            'bar_repeat_rate': round(repeat[c][0] / repeat[c][1], 2) if repeat[c][1] else None,
            'top_patterns': [(p, round(n / bars, 3)) for p, n in pats[c].most_common(8)],
        }
    if kick_lhl:
        k = sorted(kick_lhl); out['kick']['lhl_median_p25_p75'] = [st.median(k), pct(k, .25), pct(k, .75)]
    out['files_detail'] = filerows
    if '--json' in a: json.dump(out, open(a[a.index('--json') + 1], 'w'), indent=1)
    print(f"{fam} {btype} bars={BARS}: files {out['files']} bars {bars} drummers {out['drummers']} "
          f"bpm median {out['bpm_median']} range {out['bpm_range']}")
    if 'hat_swing_ticks' in out: print(' hat swing', out['hat_swing_ticks'])
    print(' fill', out['fill'])
    for c in CATS:
        o = out[c]
        print(f"== {c}: bars_with_any {o['bars_with_any']} hits/bar median {o['hits_per_bar_median']} "
              f"vel p10/50/90 {o['vel_p10_p50_p90']} ghost {o['ghost_share_all']} bar-repeat {o['bar_repeat_rate']}"
              + (f" LHL {o.get('lhl_median_p25_p75')}" if c == 'kick' else ''))
        print('  P  ', o['P']); print('  vel', o['vel']); print('  gh ', o['ghost_share']); print('  dev', o['dev'])
        print('  top', o['top_patterns'][:6])


if __name__ == '__main__': main()
