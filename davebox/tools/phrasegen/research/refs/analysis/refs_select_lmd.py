# Select Lakh MIDI (LMD-matched) songs for every reference genre in refs_genres.py.
# Usage: python3 refs_select_lmd.py ~/phrasegen-cache/lmd/meta.json ~/phrasegen-cache/refs/cand_lmd.json
#   meta.json is produced by research/lmd/analysis/lmd_meta.py (MSD metadata for LMD-matched).
#
# Evidence (strongest first):
#   artist  - the MSD artist name equals a curated artist of the genre (refs_genres.G[..]['artists'],
#             resolved to one genre per artist by refs_genres.PRIMARY)            strength 1.0
#   lastfm  - a Last.fm TRACK tag >= 20 (of 100) for one of the genre's terms       strength tag/100
#   artist term - an Echo Nest ARTIST term in the artist's top 4 with weight >= .7 that is corroborated by
#             the artist's MusicBrainz tags or the track's Last.fm tags (the lmd_select.py rule)  .9*w
# Tag evidence is era-filtered (G[g]['era']); artist evidence is not. The manual SCREEN of
# research/lmd/analysis/lmd_select.py is re-used for the genres it covers, plus refs_genres.SCREEN;
# tag evidence is refused when the artist's top-2 terms hit refs_genres.EXCL (metal etc.), and needs
# corroboration for every genre outside refs_genres.STRICT_EXEMPT.
import json, sys, re, collections, statistics as st, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'lmd', 'analysis'))
import refs_genres as R
try:
    from lmd_select import SCREEN as LMD_SCREEN
except Exception:
    LMD_SCREEN = {}


def norm(s): return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def norm_title(s):
    s = re.sub(r'\(.*?\)|\[.*?\]', '', s.lower()).split(' - ')[0]
    return norm(s)


def artist_index():
    """normalised artist name -> (genre, era tag). PRIMARY wins; else the first genre in PRECEDENCE."""
    idx = {}
    for g in R.PRECEDENCE:
        for a, era in R.G[g]['artists'].items():
            k = norm(a)
            if k in R.PRIMARY:
                if R.PRIMARY[k] is None: continue
                if R.PRIMARY[k] != g and k not in idx:
                    continue
            if k not in idx: idx[k] = (g, era)
    for k, g in R.PRIMARY.items():
        if g is None: idx.pop(k, None); continue
        era = next((e for a, e in R.G[g]['artists'].items() if norm(a) == k), '')
        idx[k] = (g, era)
    return idx


SCREEN_MAP = {'newwave': 'newwave', 'postpunk': 'postpunk', 'goth': 'postpunk', 'darkwave': 'postpunk',
              'synthpop': 'synthpop', 'italo': 'italo', 'ebm': 'ebm'}


def era_of(year):
    if not year: return '?'
    return '80s' if year <= 1995 else ('90s' if year < 2000 else 'new')


def main():
    meta = json.load(open(os.path.expanduser(sys.argv[1])))
    AI = artist_index()
    ayears = collections.defaultdict(list)
    for v in meta.values():
        if v['year']: ayears[v['artist']].append(v['year'])
    aera = {a: st.median(y) for a, y in ayears.items()}
    rows = []
    for tid, v in meta.items():
        year = v['year'] or aera.get(v['artist'], 0)
        ev = {}
        k = norm(v['artist'])
        if k in AI:
            g, e = AI[k]; ev[g] = (1.0, 'artist')
        top = list(v['terms'].items())[:4]
        tags = set(v['mbtags']) | set(v['lastfm'])
        for g, d in R.G.items():
            lo, hi = d['era']
            if year and not lo <= year <= hi: continue
            s, src = 0.0, None
            for t in d['terms']:
                if v['lastfm'].get(t, 0) >= 20 and v['lastfm'][t] / 100 > s:
                    s, src = v['lastfm'][t] / 100, 'lastfm'
                for rank, (kk, w) in enumerate(top):
                    if kk == t and w >= .7 and .9 * w > s:
                        corr = any(any(tw in x for tw in d['terms']) for x in tags)
                        if corr or (g in R.STRICT_EXEMPT and rank <= 1 and w >= .85):
                            s, src = .9 * w, 'artist-term'
            if g in ('rock', 'pop') and src == 'artist-term': s *= .8
            if s and any(kk in R.EXCL.get(g, ()) for kk, _ in top[:2]): s = 0
            if s and (g not in ev or ev[g][0] < s): ev[g] = (round(s, 3), src)
        for g in list(ev):
            if ev[g][1] != 'artist' and (v['artist'] in LMD_SCREEN.get(SCREEN_MAP.get(g, ''), ())
                                         or v['artist'] in R.SCREEN.get(g, ())): del ev[g]
        if not ev: continue
        # an artist-listed genre claims the song outright; else precedence
        art = [g for g in ev if ev[g][1] == 'artist']
        g = art[0] if art else min(ev, key=R.PRECEDENCE.index)
        rows.append({'src': 'lmd', 'id': tid, 'md5': v['md5'], 'score': v['score'], 'artist': v['artist'],
                     'title': v['title'], 'year': year, 'year_known': bool(v['year']), 'genre': g,
                     'evidence': ev[g][1], 'strength': ev[g][0], 'era': era_of(year) if year else (
                         AI.get(k, ('', ''))[1] or '?')})
    # de-dup on MIDI md5 and on (artist, core title), keep the best match score
    best = {}
    for r in rows:
        if r['md5'] not in best or r['score'] > best[r['md5']]['score']: best[r['md5']] = r
    best2 = {}
    for r in best.values():
        kk = (norm(r['artist']), norm_title(r['title']))
        if kk not in best2 or r['score'] > best2[kk]['score']: best2[kk] = r
    rows = [r for r in best2.values() if r['score'] >= .5]
    json.dump(rows, open(os.path.expanduser(sys.argv[2]), 'w'), indent=0)
    c = collections.Counter((r['genre'], r['evidence']) for r in rows)
    for g in R.PRECEDENCE:
        print(g, {e: c[(g, e)] for e in ('artist', 'lastfm', 'artist-term')},
              'artists', len({r['artist'] for r in rows if r['genre'] == g}))


if __name__ == '__main__': main()
