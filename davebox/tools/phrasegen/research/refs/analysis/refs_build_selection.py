# Merge the three candidate sources into one selection (one genre per song, capped, de-duplicated).
# Usage: python3 refs_build_selection.py ~/phrasegen-cache/refs   (reads cand_lmd.json, lamd_matches.jsonl,
#        freemidi/manifest.jsonl; extracts the matched LAMD files; writes selection.json + selection_report.txt)
#
# Order of preference inside a genre: artist-list evidence, then tag strength; artists are taken
# ROUND-ROBIN (each artist's best song first) so a genre is as many artists deep as the sources allow,
# up to refs_genres.CAP_GENRE, <= CAP_ARTIST songs per artist (CAP_ARTIST_THIN for thin genres).
# De-duplication: identical files (md5) across sources; LAMD/freemidi songs of an artist whose
# normalised title-ish text repeats; an (artist, title) already present from LMD.
import sys, os, json, re, zipfile, collections, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs_genres as R
from refs_select_lmd import norm, norm_title, artist_index

C = os.path.expanduser(sys.argv[1])
LMD_ROOT = os.path.expanduser('~/phrasegen-cache/lmd/lmd_matched')


def lmd_path(tid, md5): return f"{LMD_ROOT}/{tid[2]}/{tid[3]}/{tid[4]}/{tid}/{md5}.mid"


def era_from(year, tag):
    if year:
        return '80s' if year <= 1995 else ('90s' if year < 2000 else 'new')
    return tag or '?'


def main():
    cands = []
    for r in json.load(open(os.path.join(C, 'cand_lmd.json'))):
        r['path'] = lmd_path(r['id'], r['md5']).replace(os.path.expanduser('~'), '~')
        r['era'] = era_from(r['year'], r.get('era') if r.get('era') in ('80s', 'new') else '')
        r['rank'] = (0 if r['evidence'] == 'artist' else 1, -r['strength'], -r['score'])
        r['title_key'] = norm_title(r['title'])
        cands.append(r)
    lmd_md5 = {r['md5'] for r in cands}
    # LAMD
    lp = os.path.join(C, 'lamd_matches.jsonl')
    AI = artist_index()
    if os.path.exists(lp):
        z = zipfile.ZipFile(os.path.join(C, 'lamd', 'LAMD-4.0.zip'))
        outd = os.path.join(C, 'files', 'lamd'); os.makedirs(outd, exist_ok=True)
        for line in open(lp):
            m = json.loads(line)
            if m['md5'] in lmd_md5 or m['artist_key'] not in AI: continue
            m['genre'] = AI[m['artist_key']][0]
            fn = os.path.join(outd, m['md5'] + '.mid')
            if not os.path.exists(fn): open(fn, 'wb').write(z.read(m['id']))
            ak = m['artist_key']
            tx = [norm(t) for t in m['texts']]
            tk = next((t for t in tx if t and ak not in t and len(t) > 2 and not re.match(
                r'^(track|untitled|copyright|generated|midi|piano|bass|drums?|melody|strings?|guitar|synth|lead|pad|'
                r'vocals?|voice|kick|snare|hi ?hat|seq|arp|chords?|organ)\b', t)), '')
            cands.append({'src': 'lamd', 'id': m['id'], 'md5': m['md5'], 'artist': ak, 'title': tk[:60],
                          'title_key': tk[:40], 'year': 0, 'genre': m['genre'], 'evidence': 'artist-text',
                          'strength': .9, 'era': era_from(0, m['era_tag']), 'path': fn.replace(os.path.expanduser('~'), '~'),
                          'rank': (0, -.9, 0)})
    # freemidi
    fp = os.path.join(C, 'freemidi', 'manifest.jsonl')
    AI = artist_index()
    if os.path.exists(fp):
        for line in open(fp):
            m = json.loads(line)
            if norm(m['artist']) not in AI: continue  # artist since removed from the lists
            m['genre'] = AI[norm(m['artist'])][0]
            data = open(m['file'], 'rb').read()
            md5 = hashlib.md5(data).hexdigest()
            a = m['artist']; t = m['title'].replace(re.sub(r'[^a-z0-9]+', '-', a.lower()).strip('-'), '').strip('-')
            era = AI[norm(a)][1]
            cands.append({'src': 'freemidi', 'id': m['url'], 'md5': md5, 'artist': a, 'title': t.replace('-', ' '),
                          'title_key': norm(t.replace('-', ' '))[:40], 'year': 0, 'genre': m['genre'],
                          'evidence': 'artist-site', 'strength': 1.0, 'era': era_from(0, era),
                          'path': m['file'].replace(os.path.expanduser('~'), '~'), 'rank': (0, -1.0, 0)})
    # de-dup
    seen_md5 = set(); seen_t = set(); ded = []
    for r in sorted(cands, key=lambda r: ({'lmd': 0, 'freemidi': 1, 'lamd': 2}[r['src']], r['rank'])):
        k = (norm(r['artist']), r['title_key'])
        if r['md5'] in seen_md5: continue
        if r['title_key'] and k in seen_t: continue
        seen_md5.add(r['md5']); seen_t.add(k); ded.append(r)
    # per genre: round-robin over artists
    sel = []
    rep = open(os.path.join(C, 'selection_report.txt'), 'w')
    for g in R.PRECEDENCE:
        rs = [r for r in ded if r['genre'] == g]
        cap_a = R.CAP_ARTIST_THIN if g in R.THIN else R.CAP_ARTIST
        by = collections.defaultdict(list)
        for r in sorted(rs, key=lambda r: r['rank']): by[norm(r['artist'])].append(r)
        order = sorted(by, key=lambda a: by[a][0]['rank'])
        chosen = []
        for i in range(cap_a):
            for a in order:
                if len(chosen) >= R.CAP_GENRE[g]: break
                if i < len(by[a]): chosen.append(by[a][i])
        # headroom for measurement skips: take up to 1.4x cap, report counts after measuring
        extra = []
        if len(chosen) >= R.CAP_GENRE[g]:
            rest = [r for a in order for r in by[a][:cap_a] if r not in chosen]
            extra = rest[:int(.4 * R.CAP_GENRE[g])]
        chosen += extra
        for r in chosen: r.pop('rank', None)
        sel += chosen
        srcs = collections.Counter(r['src'] for r in chosen); eras = collections.Counter(r['era'] for r in chosen)
        print(f"{g}: {len(chosen)} songs, {len({norm(r['artist']) for r in chosen})} artists, src {dict(srcs)}, era {dict(eras)}", file=rep)
        print('   ', ', '.join(f"{a} ({n})" for a, n in collections.Counter(r['artist'] for r in chosen).most_common(40)), file=rep)
    json.dump(sel, open(os.path.join(C, 'selection.json'), 'w'), indent=0)
    rep.close(); print(open(os.path.join(C, 'selection_report.txt')).read())


if __name__ == '__main__': main()
