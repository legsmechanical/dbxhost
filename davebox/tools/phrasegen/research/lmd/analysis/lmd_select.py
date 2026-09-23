# Select LMD-matched songs per target genre from tags (see ../README.md "Selection").
# Usage: python3 lmd_select.py <meta.json from lmd_meta.py> out/selection.json [out/selection_report.txt]
#
# Evidence per song and genre (strength 0..1):
#   - Last.fm TRACK tag (MSD Last.fm dataset, 0..100) >= 20  -> val/100
#   - Echo Nest ARTIST term among the artist's top-4 terms with weight >= 0.7 -> weight * 0.9
#     (artist-level, so it is weaker than a track tag)
# Era: the song's MSD/MusicBrainz year; if 0, the median known year of that artist in LMD-matched.
# One genre per song: the FIRST genre in SPECIFIC with any evidence (post-punk/italo/ebm are more
# specific than synthpop, synthpop than new wave; every target genre beats the controls).
# MANUAL SCREEN: artists in SCREEN are removed from that genre (tag evidence plainly wrong: name
# collisions, country/60s/cantautori/metal/2000s-pop acts). Unknown artists are kept.
# Songs are de-duplicated on the MIDI md5 and on (artist, core title); <= CAP songs per artist per genre (best match score).
import json, sys, collections, re, statistics as st

G = {
    'newwave': dict(terms=['new wave'], era=(1976, 1992)),
    'postpunk': dict(terms=['post-punk', 'post punk', 'gothic rock', 'goth rock', 'dark wave', 'darkwave',
                            'coldwave', 'cold wave', 'deathrock', 'goth', 'ethereal wave', 'gothic', 'minimal wave'],
                     era=(1977, 1995)),
    'synthpop': dict(terms=['synthpop', 'synth pop', 'synth-pop', 'new romantic', 'technopop', 'electropop'],
                     era=(1978, 1993)),
    'italo': dict(terms=['italo disco', 'italo-disco', 'italo', 'hi-nrg', 'hi nrg', 'euro disco', 'eurodisco',
                         'italian disco'], era=(1977, 1992)),
    'ebm': dict(terms=['ebm', 'electronic body music', 'electro-industrial', 'electro industrial', 'aggrotech',
                       'dark electro', 'industrial dance', 'futurepop'], era=(1980, 2011)),
    'synthwave': dict(terms=['synthwave', 'retrowave', 'outrun', 'darksynth', 'dreamwave', 'new retro wave'],
                      era=(2005, 2011)),
    # controls
    'rock': dict(terms=['classic rock', 'hard rock', 'rock'], era=(1965, 2011)),
    'disco': dict(terms=['disco', '70s disco'], era=(1974, 1984)),
    'house': dict(terms=['house', 'deep house', 'chicago house', 'acid house', 'vocal house', 'garage house'],
                  era=(1985, 2011)),
    'techno': dict(terms=['techno', 'detroit techno', 'minimal techno', 'acid techno'], era=(1987, 2011)),
}
SPECIFIC = ['synthwave', 'ebm', 'italo', 'postpunk', 'synthpop', 'newwave', 'disco', 'techno', 'house', 'rock']
# artists whose top terms mark them as metal/pop-idol etc. are excluded from the 80s electronic/goth sets
EXCL = {'postpunk': ['gothic metal', 'symphonic metal', 'metal', 'heavy metal', 'nu metal', 'doom metal',
                     'black metal', 'death metal', 'power metal', 'alternative metal', 'industrial metal'],
        'ebm': ['industrial metal', 'nu metal', 'alternative metal', 'metal', 'heavy metal'],
        'italo': ['canzone d\'autore', 'cantautori', 'italian pop', 'soundtrack', 'classical'],
        'rock': ['new wave', 'post-punk', 'synthpop', 'punk'],
        'disco': ['house', 'techno', 'eurodance', 'hi nrg', 'italo disco', 'synthpop'],
        }
CAP = 5
SCREEN = {
    'newwave': {'Aretha Franklin', 'Anson Funderburgh and The Rockets', 'Carlene Carter', 'Jessi Colter / Waylon Jennings',
                'DJ Technic', 'Ghetto Street Fighter', 'Mick Farren/Jack Lancaster', 'Eurythmics;Aretha Franklin'},
    'postpunk': {'Charly García', 'Doro Pesch', 'Gerard Films / Norman Gerard', 'HIM', 'Jean-Claude Gianadda',
                 'Modern Talking', 'SNAP!', 'Shitdisco', 'The Streets', 'Univers Karaoké', 'Zucchero / Randy Crawford',
                 'Tiamat', 'The Gathering', 'Syria', 'Negative', 'David Bowie', 'Gary Numan', 'The Cranberries',
                 'Eric Burdon And The New Animals', "Dexy's Midnight Runners", 'The Pretenders', 'Iggy Pop',
                 'Janus', 'Silence', 'Erik Vee'},  # Janus/Silence = ABBA/Queen cover acts, Erik Vee = trance
    'italo': {'Al Bano & Romina Power', 'Aleandro Baldi', 'Enrico Ruggeri', 'Fabio Concato', 'Gino Paoli', 'Mino Reitano',
              'Pierangelo Bertoli', 'Raf', 'Rondò Veneziano', 'Roberto Vecchioni', 'Samuele Bersani', 'Nek',
              'Ricchi_ Poveri', 'Gianni Togni', 'Jeff Wayne', 'Jeff Wayne;Paul Vigrass;Gary Osborne',
              'Jeff Wayne;Richard Burton;Justin Hayward', 'Glass Tiger', 'Kip Winger', 'Cutting Crew', 'Billy Ocean',
              'Johnny Lee', 'Ricky Valance', 'Tracey Ullman', 'Joe und die Party Singers', 'Grupo Mamey', 'Fiordaliso',
              'Corona', 'Black Box', 'Rozalla', 'Frisco / Alexia', 'Frisco vs Ice MC', 'Feel Feat. Tiff Lacey',
              'Umberto Tozzi', '883', 'Gianluca Grignani', 'Marina Rei', 'Jovanotti', 'Paola Turci', 'Pupo',
              'Frederic Chopin / Helmuth Brandenburg', 'Aled Jones', 'Line Renaud', 'Anna Oxa', 'Santamaria',
              'Mumiy Troll', 'Roger Taylor', 'La Unión', 'Talk Talk'},
    'synthpop': {'Heidi Montag', 'Livvi Franc', 'Dangerous Muse', 'frYars', 'Pagan Wanderer Lu', 'Agnes', 'Anna Oxygen',
                 'Joe Cocker & Jennifer Warnes', 'John Waite', 'Beto Cuevas', 'Godhead', 'Kylie Minogue',
                 'Britney Spears', 'Lady GaGa', 'Ke$ha', 'Owl City', 'Steps', 'Alizée', 'Plushgun',
                 'Aretha Franklin', 'Eurythmics;Aretha Franklin', 'Robert Palmer', 'Urban Cookie Collective', 'Sunscreem', 'Kent'},
    'ebm': {'Laura Pausini', 'Tony Evans & His Orchestra', 'Janus'},
}
# words that corroborate an Echo Nest artist term when found in the artist's MusicBrainz tags or the
# track's Last.fm tags (any value)
CORR = {'newwave': ['new wave', '80s', 'post-punk', 'synthpop', 'synth pop', 'new romantic', 'punk'],
        'postpunk': ['post-punk', 'post punk', 'goth', 'gothic', 'dark wave', 'darkwave', 'coldwave', 'new wave', 'deathrock'],
        'synthpop': ['synthpop', 'synth pop', 'synth-pop', 'new wave', '80s', 'new romantic', 'electropop', 'electronic'],
        'italo': ['italo', 'italo disco', 'italo-disco', 'hi-nrg', 'hi nrg', 'euro disco', 'eurodisco', 'disco', '80s', 'synthpop'],
        'ebm': ['ebm', 'industrial', 'electro-industrial', 'dark electro', 'aggrotech', 'futurepop', 'electronic', 'synthpop'],
        'synthwave': ['synthwave', 'retrowave', 'outrun', 'electronic'],
        'rock': ['rock'], 'disco': ['disco', 'funk', 'soul', '70s', 'dance'], 'house': ['house', 'dance', 'electronic'],
        'techno': ['techno', 'electronic', 'trance', 'dance']}


def corroborated(v, g):
    tags = set(v['mbtags']) | set(v['lastfm'])
    return any(any(c in t for c in CORR[g]) for t in tags)


def norm(s): return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def norm_title(s):
    s = re.sub(r'\(.*?\)|\[.*?\]', '', s.lower())
    s = s.split(' - ')[0]
    return norm(s)


def main():
    meta = json.load(open(sys.argv[1]))
    ayears = collections.defaultdict(list)
    for v in meta.values():
        if v['year']: ayears[v['artist']].append(v['year'])
    aera = {a: st.median(y) for a, y in ayears.items()}
    labelled = []
    for tid, v in meta.items():
        year = v['year'] or aera.get(v['artist'], 0)
        top = list(v['terms'].items())[:4]
        topterms = [k for k, w in top]
        ev = {}
        for g, d in G.items():
            s = 0.0; src = None
            for t in d['terms']:
                if v['lastfm'].get(t, 0) >= 20 and v['lastfm'][t] / 100 > s: s = v['lastfm'][t] / 100; src = 'lastfm:' + t
                for rank, (k, w) in enumerate(top):
                    if k == t and w >= .7 and w * .9 > s and (corroborated(v, g) or (rank <= 1 and w >= .85)):
                        s = w * .9; src = 'artist:' + t
            if g in ('house', 'techno') and src and not src.startswith('lastfm'): continue  # controls: track tags only
            if g == 'rock' and src and src.startswith('artist:rock'): s *= .8  # plain 'rock' is weak
            if not s: continue
            if g in EXCL and any(k in EXCL[g] for k in topterms[:2]): continue
            lo, hi = d['era']
            if year and not lo <= year <= hi: continue
            if not year and src.startswith('artist:') and g not in ('rock', 'house', 'techno'): s *= .8
            ev[g] = (round(s, 3), src)
        if not ev: continue
        for a in list(ev):
            if v['artist'] in SCREEN.get(a, ()): del ev[a]
        if not ev: continue
        g = min(ev, key=SPECIFIC.index)
        labelled.append({'tid': tid, 'md5': v['md5'], 'score': v['score'], 'artist': v['artist'], 'title': v['title'],
                         'year': year, 'year_known': bool(v['year']), 'genres': [g], 'evidence': ev[g][1],
                         'strength': ev[g][0], 'also': sorted(k for k in ev if k != g)})
    # de-dup: (1) the same MIDI file matched to several MSD tracks -> keep the best-scoring track;
    # (2) (artist, title without '(Album Version)'-style suffixes) -> keep the best match score.
    best = {}
    for r in labelled:
        if r['md5'] not in best or r['score'] > best[r['md5']]['score']: best[r['md5']] = r
    best2 = {}
    for r in best.values():
        k = (norm(r['artist']), norm_title(r['title']))
        if k not in best2 or r['score'] > best2[k]['score']: best2[k] = r
    rows = [r for r in best2.values() if r['score'] >= .5]
    # cap per artist per genre
    by = collections.defaultdict(list)
    for r in rows: by[(r['genres'][0], r['artist'])].append(r)
    sel = []
    for k, rs in by.items(): sel += sorted(rs, key=lambda r: -r['score'])[:CAP]
    # cap rock to keep run time sane: the 400 strongest-evidence rock songs
    rock = sorted([r for r in sel if r['genres'][0] == 'rock'], key=lambda r: (-r['strength'], -r['score']))
    sel = [r for r in sel if r['genres'][0] != 'rock'] + rock[:400]
    json.dump(sel, open(sys.argv[2], 'w'), indent=0)
    rep = open(sys.argv[3], 'w') if len(sys.argv) > 3 else sys.stdout
    cnt = collections.Counter(r['genres'][0] for r in sel)
    for g in G:
        rs = [r for r in sel if r['genres'][0] == g]
        arts = collections.Counter(r['artist'] for r in rs)
        srcs = collections.Counter(r['evidence'].split(':')[0] for r in rs)
        also = collections.Counter(a for r in rs for a in r['also'])
        print(f"{g}: {cnt[g]} songs, {len(arts)} artists, evidence {dict(srcs)}, also-tagged {dict(also.most_common(4))}", file=rep)
        print('   ', ', '.join(f'{a} ({n})' for a, n in arts.most_common(30)), file=rep)


if __name__ == '__main__': main()
