# Write the numeric body of research/refs/<genre>.md from stats/<genre>.json + analysis/out/.
# Usage: python3 refs_writeup.py <research/refs dir>
# The hand-written "Findings" prose lives in analysis/prose.json ({genre: markdown}) and is spliced in,
# so a re-run regenerates the numbers without losing the prose. Every number here is copied from the
# stats file by code; nothing is hand-entered.
import sys, os, json

DEG = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs_genres as R

NAMES = {'newwave': 'NEW WAVE', 'darksyn': 'DARKSYN', 'basics': 'BASICS (genre-less: every measured song)'}
FL_NAMES = {'postpunk': 'POST PUNK', 'darkwave': 'DARKWAVE', 'goth': 'GOTH', 'synthwave': 'SYNTHWAVE', 'ebm': 'EBM',
            'industrial': 'INDUSTRIAL', 'darksynth': 'DARKSYNTH', 'synthpop': 'SYNTHPOP', 'kpop': 'KPOP', 'jpop': 'JPOP',
            'citypop': 'CITY POP', 'hyperpop': 'HYPERPOP', 'soul': 'SOUL', 'neosoul': 'NEO SOUL', 'alt': 'ALT',
            'shoegaze': 'SHOEGAZE', 'dreampop': 'DREAM POP', 'grunge': 'GRUNGE', 'dub': 'DUB', 'dancehall': 'DANCEHALL',
            'ska': 'SKA', 'reggaeton': 'REGGAETON', 'salsa': 'SALSA', 'bossa': 'BOSSA', 'cumbia': 'CUMBIA',
            'swing': 'SWING', 'bebop': 'BEBOP', 'jazzfunk': 'JAZZ FUNK', 'folk': 'FOLK', 'bluegrass': 'BLUEGRASS',
            'trap': 'TRAP', 'lofi': 'LOFI', 'boombap': 'BOOM BAP', 'jungle': 'JUNGLE', 'blues': 'BLUES'}


def f(x, d=2):
    if x is None: return '–'
    if isinstance(x, float):
        s = f'{x:.{d}f}'
        return s.rstrip('0').rstrip('.') if '.' in s else s
    return str(x)


def rng(q, d=2):
    if not q: return '–'
    return f'{f(q[1], d)} ({f(q[0], d)}–{f(q[2], d)})'


def steps_over(P, thr):
    return ','.join(str(i + 1) for i, p in enumerate(P) if p >= thr) or 'none'


def part_targets(p, t, mode):
    L = [f'**{p}** ({t["songs"]} songs, in {f(t["presence"])} of songs)']
    L.append(f'- onsets/bar {rng(t["density_per_bar"], 1)}; steps with P ≥ .5: {steps_over(t["step_onset_prob"], .5)}; '
             f'P ≥ .3: {steps_over(t["step_onset_prob"], .3)}')
    sy = t['syncopation']
    L.append(f'- syncopation: LHL/bar {rng(sy["lhl_per_bar"], 1)}, off-16th onset share {rng(sy["offbeat16_share"])}')
    L.append(f'- length {rng(t["len16"])} 16ths, gate (length ÷ gap to next onset) {rng(t["gate"])}')
    v = t['vel']
    acc = [(i + 1, a) for i, a in enumerate(v['accent']) if a is not None]
    top = sorted(acc, key=lambda x: -x[1])[:3]; low = sorted(acc, key=lambda x: x[1])[:2]
    L.append(f'- velocity mean {f(v["mean"], 0)} ± {f(v["sd"], 1)} (flat files {f(v["flat_share"])}); accents '
             + ', '.join(f'step {i} {a:+.0f}' for i, a in top) + '; weakest ' + ', '.join(f'step {i} {a:+.0f}' for i, a in low))
    L.append(f'- register (MIDI, transposed to C) {f(t["register"][1], 0)} ({f(t["register"][0], 0)}–{f(t["register"][2], 0)})')
    ds = (t.get('degree_share') or {}).get(mode)
    if ds:
        top = sorted(ds.items(), key=lambda x: -x[1])[:6]
        L.append(f'- degrees ({mode}): ' + ', '.join(f'{k} {f(v)}' for k, v in top))
    ic = t.get('interval_classes')
    if ic:
        L.append('- intervals: repeat ' + rng(ic['repeat']) + ', step 1–2 ' + rng(ic['step_1_2']) + ', skip 3–4 '
                 + rng(ic['skip_3_4']) + ', leap 5–7 ' + rng(ic['leap_5_7']) + ', octave ' + rng(ic['octave'])
                 + ', descending share of moves ' + rng(ic['descending_of_moves']))
    po = t.get('poly')
    if po:
        L.append(f'- chords: voices {rng(po["voices"], 1)}, spread {f(po["spread_semitones"][1], 0)} st, inversion share '
                 f'{rng(po["inversion_share"])}, changes/bar {rng(po["change_per_bar"])}, qualities '
                 + ', '.join(f'{k} {f(v)}' for k, v in sorted(po['quality'].items(), key=lambda x: -x[1])[:4]))
    if t.get('arp'):
        a = t['arp']
        L.append(f'- arp shape ' + ', '.join(f'{k} {f(v)}' for k, v in a['shape'].items()) +
                 f'; spacing (16ths) {a["rate16"]}; octave span {rng(a["oct_span"])}')
    ls = t['loop_share']; lr = t['loop_share_rhythm']
    L.append(f'- repetition in 8-bar windows (pitch+rhythm): 1-bar {f(ls.get("1"))}, 2-bar {f(ls.get("2"))}, 4-bar '
             f'{f(ls.get("4"))}, longer {f(ls.get(">4"))}; rhythm only: 1-bar {f(lr.get("1"))}, 2-bar {f(lr.get("2"))}, '
             f'4-bar {f(lr.get("4"))}, longer {f(lr.get(">4"))}')
    return '\n'.join(L)


def drum_targets(d):
    L = [f'**drums** ({d["songs"]} songs with a usable kit; flat-velocity files {f(d["flat_share"])})']
    fam = d['families']
    L.append('- families: ' + ', '.join(f'{k} {f(v)}' for k, v in fam.items()))
    for c in ('kick', 'snare', 'hat', 'perc', 'tom', 'cymb'):
        x = d[c]
        L.append(f'- {c}: hits/bar {rng(x["hits_per_bar"], 1)}, songs using {f(x["songs_using"])}, P ≥ .5 at steps '
                 f'{steps_over(x["step_onset_prob"], .5)}, P ≥ .2 at {steps_over(x["step_onset_prob"], .2)}; vel '
                 f'{f(x["vel"]["mean"], 0)} ± {f(x["vel"]["sd"], 1)}')
    L.append(f'- open-hat share of hat hits {f(d["open_hat_share"])}, ride share of cymbals {f(d["ride_share"])}, '
             f'fill-bar share {f(d["fill_bar_share"])}')
    return '\n'.join(L)


def progressions(H, L, own_label='measured MIDI'):
    for m in ('min', 'maj'):
        pg = (H.get('progression_ngrams') or {}).get(m)
        if not pg: continue
        L.append(f'| {m} loop ({own_label}) | songs | 4-gram share |\n|---|---|---|')
        for x in pg[:10]:
            L.append(f'| {x["loop"]} | {f(x["songs_share"])} | {f(x["ngram_share"])} |')
        L.append('')
    cs = H.get('chord_sheets')
    if cs:
        L.append(f'Chord-sheet cross-check (Chordonomicon, {cs["songs"]} songs, minor share {f(cs["minor_share"])}; '
                 'share of songs containing the loop ≥ 2×): ' + ', '.join(f'{a.replace(" |", " (")}) {f(b)}' for a, b in cs['loops'][:8])
                 + ('. By era: ' + '; '.join(f'{e} ({v["songs"]} songs, minor {f(v["minor_share"])}): ' +
                                             ', '.join(f'{a.replace(" |", " (")}) {f(b)}' for a, b in v['loops'][:4])
                                             for e, v in cs['eras'].items()) if cs.get('eras') else '') + '\n')


def era_table(T, L):
    if not T.get('eras_split'): return
    L.append('| era | songs | tempo p10/p50/p90 | minor | bass onsets/bar | bass gate | lead step share | pad presence | arp presence | kick 4otf | hat 16ths | top minor loop |')
    L.append('|---|' + '---|' * 11)
    for e, Te in T['eras_split'].items():
        P = Te['parts']; b = P.get('bass', {}); ld = P.get('lead', {})
        dr = P.get('drums', {}).get('families', {})
        pm = ((Te.get('harmony') or {}).get('progression_ngrams') or {}).get('min') or [{}]
        L.append(f'| {e} | {Te["songs"]} | {" / ".join(f(x, 0) for x in (Te["tempo"] or []))} | {f(Te["minor_share"])} | '
                 f'{rng(b.get("density_per_bar"), 1)} | {rng(b.get("gate"))} | '
                 f'{rng((ld.get("interval_classes") or {}).get("step_1_2"))} | {f(P.get("pad", {}).get("presence"))} | '
                 f'{f(P.get("arp", {}).get("presence"))} | {f(dr.get("kick_4otf"))} | {f(dr.get("hat_16ths"))} | '
                 f'{pm[0].get("loop", "–")} ({f(pm[0].get("songs_share"))}) |')
    L.append('')


def targets_block(T, L, mode, only=None):
    for p, t in T['parts'].items():
        if p == 'drums' or (only and p not in only): continue
        L.append(part_targets(p, t, mode) + '\n')
    if 'drums' in T['parts']:
        L.append(drum_targets(T['parts']['drums']) + '\n')


def main():
    base = sys.argv[1]
    pp = os.path.join(base, 'analysis', 'prose.json')
    prose = json.load(open(pp)) if os.path.exists(pp) else {}
    counts = json.load(open(os.path.join(base, 'analysis', 'out', 'counts.json')))
    for g in R.PUBLIC + ['basics']:
        name = NAMES.get(g, g.upper())
        T = json.load(open(os.path.join(base, 'stats', f'{g}.json')))
        c = counts[g]
        L = [f'# {name} — reference statistics\n']
        if g in R.UNION:
            L.append(f'{name} has no songs of its own: it is the union of its flavours '
                     f'({", ".join(FL_NAMES[x] for x in R.UNION[g])}); the tables below are measured on that union.\n')
        L.append(f'**{T["songs"]} songs measured** ({c["selected"]} selected), {T["artists"]} artists; sources '
                 f'{c["sources"]}; eras {c["eras"]}' + (f'; era splits: {c["era_splits"]}' if c.get('era_splits') else '')
                 + f'. Every table: `analysis/out/{g}_tables.md`; every song: `songs.csv`.\n')
        if T['songs']:
            L.append(f'Tempo (file BPM folded into 85–180) p10/p50/p90: **{" / ".join(f(x, 0) for x in (T["tempo"] or []))}**; '
                     f'file BPM q1/med/q3 {" / ".join(f(x, 0) for x in (T["tempo_file_bpm"] or []))}; minor share '
                     f'**{f(T["minor_share"])}**.\n')
        L.append('## Findings\n')
        L.append(prose.get(g, '_(numbers only — see the targets and the tables)_') + '\n')
        if T.get('flavours'):
            L.append('Flavours filed under this style: ' + ', '.join(
                f'**{FL_NAMES[k]}** ({v["songs"]} songs)' for k, v in T['flavours'].items()) + ' — see "Flavours" below.\n')
        mode = 'min' if (T['minor_share'] or 0) >= .5 else 'maj'
        H = T.get('harmony') or {}
        L.append('## Progressions (roman numerals, rotation-folded loop families)\n')
        L.append(f'Chord changes per bar {rng(H.get("change_per_bar"))}. Minor keys use natural-minor numerals '
                 '(III VI VII = b3 b6 b7); power/sus chords are named as the mode\'s diatonic triad. "songs" = share '
                 'of that mode\'s songs whose chord windows contain the loop at least twice.\n')
        progressions(H, L)
        L.append(f'## Generator targets (median (q1–q3) across songs; aim inside the quartiles; main mode: {mode})\n')
        targets_block(T, L, mode)
        if T.get('eras_split'):
            L.append('## Era split (≤ 1995 vs ≥ 2000)\n')
            era_table(T, L)
        if T.get('flavours'):
            L.append('## Flavours\n')
            L.append('Each flavour is measured as its own group. "Distinctive" lists the metrics that move most from '
                     'the parent (scaled: 10 BPM, 6 semitones, 2 onsets or 0.15 of a share = 1 unit; distinctness = '
                     'mean scaled |delta|, capped at 3 per metric). A part\'s shape metrics are compared only when '
                     '≥ 5 songs and ≥ 30 % of both groups have the part. Full targets: the parent JSON '
                     '`flavours.<name>.targets`.\n')
            for k, v in T['flavours'].items():
                Tf = v['targets']
                L.append(f'### {FL_NAMES[k]} ({v["songs"]} songs, {v["artists"]} artists; sources {v["sources"]}; '
                         f'distinctness {f(v["distinctness"])})\n')
                L.append(prose.get(k, '') + ('\n' if prose.get(k) else ''))
                if not v['songs']:
                    L.append('_No measurable songs in the sources (see README, weak spots)._\n')
                    if Tf.get('harmony', {}).get('chord_sheets'): progressions(Tf['harmony'], L)
                    continue
                L.append(f'Tempo p10/p50/p90 {" / ".join(f(x, 0) for x in (Tf["tempo"] or []))}; minor share {f(Tf["minor_share"])}.\n')
                if v['distinctive']:
                    L.append('| distinctive metric | flavour | parent | delta |\n|---|---|---|---|')
                    for d in v['distinctive'][:12]:
                        L.append(f'| {d["metric"]} | {f(d["flavour"])} | {f(d["parent"])} | {d["delta"]:+.2f} |')
                    L.append('')
                progressions(Tf.get('harmony') or {}, L)
                fmode = 'min' if (Tf['minor_share'] or 0) >= .5 else 'maj'
                if v['songs'] >= 8:
                    targets_block(Tf, L, fmode, only=('bass', 'lead', 'pad', 'chord', 'keys', 'guitar', 'arp', 'seq'))
                era_table(Tf, L)
        open(os.path.join(base, f'{g}.md'), 'w').write('\n'.join(L) + '\n')


if __name__ == '__main__': main()
