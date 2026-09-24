# Fetch MIDI transcriptions from freemidi.org for the curated artists of refs_genres.py.
# robots.txt of freemidi.org (checked 2026-09-23): "User-agent: * / Allow: /". Polite: one request
# every >= 2.5 s (the site answered 429 at ~1/s), a 60 s back-off on 429, a descriptive User-Agent. Files and the manifest stay in the cache, never the repo.
#
# Usage: python3 refs_freemidi.py search  ~/phrasegen-cache/refs/freemidi   # artist name -> artist page
#        python3 refs_freemidi.py fetch   ~/phrasegen-cache/refs/freemidi   # song pages -> .mid files
# Manifest: <dir>/manifest.jsonl  {url, retrieved, artist, genre, title, file}
import sys, os, re, json, time, datetime, urllib.request, urllib.error, urllib.parse, http.cookiejar
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs_genres as R
from refs_select_lmd import artist_index

UA = 'Mozilla/5.0 (compatible; phrase-statistics research; <= 1 req per 2.5 s)'
BASE = 'https://freemidi.org/'
CJ = http.cookiejar.CookieJar()
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CJ))
_last = [0.0]


def get(url, referer=None):
    dt = time.time() - _last[0]
    if dt < 2.5: time.sleep(2.5 - dt)
    h = {'User-Agent': UA}
    if referer: h['Referer'] = referer
    req = urllib.request.Request(url, headers=h)
    for attempt in range(3):
        try:
            with OP.open(req, timeout=30) as r:
                data = r.read(); ct = r.headers.get('Content-Type', '')
            _last[0] = time.time()
            return data, ct
        except urllib.error.HTTPError as e:
            _last[0] = time.time()
            if e.code != 429 or attempt == 2: raise
            time.sleep(60)


def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def search(d):
    AI = artist_index()
    names = {}
    for g in R.PRECEDENCE:
        for a in R.G[g]['artists']:
            k = re.sub(r'[^a-z0-9]+', ' ', a.lower()).strip()
            if k in AI and AI[k][0] == g: names[a] = g
    out = os.path.join(d, 'artists.json')
    found = json.load(open(out)) if os.path.exists(out) else {}
    for a, g in names.items():
        if a in found: continue
        try:
            html, _ = get(BASE + 'search?q=' + urllib.parse.quote_plus(a))
        except Exception as e:  # noqa
            print('ERR', a, e); continue
        links = set(re.findall(r'artist-(\d+)-([a-z0-9\-]+)', html.decode('utf-8', 'ignore')))
        want = {slug(a), slug(re.sub(r'^the ', '', a, flags=re.I))}
        hit = [f'artist-{i}-{s}' for i, s in links if s in want or re.sub(r'^the-', '', s) in want]
        found[a] = {'genre': g, 'page': hit[0] if hit else None}
        json.dump(found, open(out, 'w'), indent=0)
        if hit: print(g, a, hit[0], flush=True)


def fetch(d):
    found = json.load(open(os.path.join(d, 'artists.json')))
    man_p = os.path.join(d, 'manifest.jsonl')
    done = set()
    if os.path.exists(man_p):
        for line in open(man_p): done.add(json.loads(line)['url'])
    man = open(man_p, 'a')
    cap = {g: (R.CAP_ARTIST_THIN if g in R.THIN else R.CAP_ARTIST) + 4 for g in R.G}  # a few spare for skips
    AI = artist_index()
    for a, v in found.items():
        if not v['page']: continue
        k = re.sub(r'[^a-z0-9]+', ' ', a.lower()).strip()
        if k not in AI or AI[k][0] not in R.THIN: continue  # the site only fills the THIN genres
        v['genre'] = AI[k][0]
        songs = []
        for pg in [v['page']] + [v['page'] + f'-P-{i}' for i in (1, 2)]:
            try:
                html, _ = get(BASE + pg)
            except Exception:
                break
            new = re.findall(r'href=(download3-\d+-[a-z0-9\-]+)', html.decode('utf-8', 'ignore'))
            songs += [s for s in new if s not in songs]
            if f'{v["page"]}-P-' not in html.decode('utf-8', 'ignore'): break
        for s in songs[:cap[v['genre']]]:
            url = BASE + s
            if url in done: continue
            sid = s.split('-')[1]
            try:
                get(url)
                data, ct = get(BASE + 'getter-' + sid, referer=url)
            except Exception as e:  # noqa
                print('ERR', url, e); continue
            if not data.startswith(b'MThd'): continue
            fn = os.path.join(d, 'files', f'{sid}.mid'); os.makedirs(os.path.dirname(fn), exist_ok=True)
            open(fn, 'wb').write(data)
            title = re.sub(r'^download3-\d+-', '', s)
            man.write(json.dumps({'url': url, 'retrieved': datetime.date.today().isoformat(), 'artist': a,
                                  'genre': v['genre'], 'title': title, 'file': fn}) + '\n'); man.flush()
            print(v['genre'], a, title, flush=True)


if __name__ == '__main__':
    d = os.path.expanduser(sys.argv[2]); os.makedirs(d, exist_ok=True)
    {'search': search, 'fetch': fetch}[sys.argv[1]](d)
