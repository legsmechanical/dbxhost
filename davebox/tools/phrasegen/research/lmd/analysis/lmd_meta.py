# Build a metadata table for every LMD-matched MSD track: artist/title/year (MSD metadata, via
# lmd_matched_h5), Echo Nest artist_terms (+weights), MusicBrainz artist tags, Last.fm track tags
# (lastfm_tags.db, MSD Last.fm dataset) and the best-scoring matched MIDI (match_scores.json).
# Usage: python3 lmd_meta.py <cache dir> <out meta.json>
#   cache dir holds lmd_matched_h5/, lastfm_tags.db, match_scores.json.
import json, sys, sqlite3, os, collections
import h5py

C = sys.argv[1]
ms = json.load(open(f'{C}/match_scores.json'))
db = sqlite3.connect(f'{C}/lastfm_tags.db')
tidrow = {t: r for r, t in db.execute('select rowid, tid from tids') if t in ms}
tagname = {r: t for r, t in db.execute('select rowid, tag from tags')}
inv = {r: t for t, r in tidrow.items()}
lf = collections.defaultdict(dict)
for tid, tg, val in db.execute('select tid, tag, val from tid_tag'):
    if tid in inv: lf[inv[tid]][tagname[tg].lower()] = val
out = {}
for tid, cands in ms.items():
    p = f'{C}/lmd_matched_h5/{tid[2]}/{tid[3]}/{tid[4]}/{tid}.h5'
    with h5py.File(p) as h:
        s = h['metadata/songs'][0]
        terms = [t.decode().lower() for t in h['metadata/artist_terms'][:]]
        w = [round(float(x), 3) for x in h['metadata/artist_terms_weight'][:]]
        mb = [t.decode().lower() for t in h['musicbrainz/artist_mbtags'][:]]
        year = int(h['musicbrainz/songs'][0]['year'])
    md5, score = max(cands.items(), key=lambda kv: kv[1])
    out[tid] = {'artist': s['artist_name'].decode(errors='replace'), 'title': s['title'].decode(errors='replace'),
                'year': year, 'terms': dict(zip(terms, w)), 'mbtags': mb, 'lastfm': lf.get(tid, {}),
                'md5': md5, 'score': round(score, 3), 'n_midis': len(cands)}
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), 'tracks;', sum(1 for v in out.values() if v['lastfm']), 'with last.fm tags')
