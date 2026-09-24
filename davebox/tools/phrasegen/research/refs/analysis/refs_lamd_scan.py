# Scan the Los Angeles MIDI Dataset (LAMD v4.0, CC BY-NC-SA 4.0) zip for the TEXT meta events of every
# MIDI file (text, copyright, track name) and match them against the curated artist lists.
# LAMD file names are content hashes, so the only artist/title evidence is what the transcriber wrote
# into the file. Output: one JSON line per matched file (genre, matched artist, the matching strings).
#
# Usage: python3 refs_lamd_scan.py ~/phrasegen-cache/refs/lamd/LAMD-4.0.zip ~/phrasegen-cache/refs/lamd_matches.jsonl
#
# Matching (conservative, because a text event is free-form; see matches()):
#   - only the first 16 text events, only lines of <= 12 words (karaoke files store LYRICS as text events);
#   - the artist name must appear as a whole phrase, not after 'sequenced/transcribed/midi... by';
#   - AMBIGUOUS names (<= 6 letters or a common word, COMMON below) count only when the line IS the name,
#     or is 'name - title' / 'title - name' / 'by name';
#   - files whose text names a game platform/publisher are dropped (game-music rips), and names that
#     collided with non-music text in the first pass (BLOCK) are not matched at all.
#   The raw text events stay in the cache (they can carry transcriber names/e-mails) and are NEVER
#   written into the repo.
import sys, os, re, json, zipfile, collections, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refs_genres as R
from refs_select_lmd import artist_index, norm

META_RE = re.compile(rb'\xff([\x01\x02\x03])([\x00-\x7f])')
COMMON = {'college', 'desire', 'survive', 'drive', 'valerie', 'nina', 'actors', 'qual', 'riki', 'tempers', 'air',
          'x', 'joy', 'lime', 'change', 'savage', 'push', 'york', 'lange', 'signum', 'culture', 'war', 'slave',
          'hybrid', 'dune', 'liquid', 'brisk', 'magazine', 'television', 'wire', 'suicide', 'shame', 'omni',
          'squid', 'berlin', 'kano', 'casco', 'scotch', 'fancy', 'koto', 'sandra', 'dimension', 'sigma', 'metrik',
          'spor', 'feint', 'koven', 'logistics', 'calibre', 'klute', 'fisher', 'stardust', 'spiller', 'sticky',
          'salute', 'conducta', 'gost', 'acen', 'aswad', 'kristine', 'wice', 'drive', 'stranger things',
          'hotline miami', 'deathrock', 'specimen', 'play dead', 'rhombus', 'nosferatu', 'the awakening',
          'hurts', 'editors', 'ceremony', 'clinic', 'placebo', 'muse', 'phoenix', 'bastille', 'real life',
          'propaganda', 'japan', 'iris', 'mesh', 'parallels', 'grimes', 'austra', 'maurice', 'humanoid',
          'adonis', 'armando', 'tyree', 'moby', 'enigma', 'enya', 'yanni', 'kitaro', 'culture beat', 'the orb',
          'underworld', 'orbital', 'surgeon', 'mayday', 'u96', 'westbam', 'the advent', 'hashim', 'shannon',
          'freestyle', 'duice', 'strafe', 'justice', 'the time', 'lakeside', 'rufus', 'mandrill', 'prince',
          'chic', 'gentleman', 'seeed', 'the congos', 'scientist', 'yellowman', 'burial', 'kano', 'lonyo',
          'gabrielle', 'the streets', 'liquid', 'technohead', 'thunderdome', 'party animals', 'holy noise',
          'the damned', 'x', 'pup', 'refused', 'the jam', 'the hives', 'the vandals', 'lagwagon', 'the sound',
          'the fall', 'delta 5', 'esg', 'suicide', 'omni', 'ought', 'liars', 'shame', 'savages', 'the cult',
          'the mission', 'the bolshoi', 'visage', 'ministry', 'klinik', 'proceed', 'grendel', 'adult', 'push',
          'energy 52', 'bt', 'york', 'signum', 'system f', 'rank 1', 'sash', 'lasgo', 'veracocha', 'airscape',
          'brainbug', 'jaydee', 'spiller', 'cassius', 'stardust', 'modjo', 'fisher', 'black box', 'inner city',
          'ten city', 'robin s', 'snap', 'avicii', 'mousse t', 'moloko', 'nightcrawlers', 'alcazar',
          'survive', 's u r v i v e', 'nightcrawler', 'le matos', 'tokyo rose', 'arcade high', 'jordan f',
          'the midnight', 'lebrock', 'desire', 'mega drive', 'ghost', 'magic sword', 'irving force', 'hubrid',
          'tommy 86', 'volkor x', 'lueur verte', 'el huervo', 'scattle', 'jasper byrne', 'power glove',
          'john carpenter', 'actors', 'selofan', 'tempers', 'riki', 'automelodi', 'soft kill', 'qual', 'sixth june',
          'cold showers', 'die form', 'das ich', 'mesh', 'camouflage', 'kaelan mikla', 'hante', 'buzz kull',
          'the kvb', 'lust for youth', 'then comes silence', 'minuit machine', 'ash code', 'kontravoid'}


def ambiguous(k):
    return k in COMMON or len(k.replace(' ', '')) <= 6


def texts_of(data, limit=60):
    out = []
    for m in META_RE.finditer(data):
        n = m.group(2)[0]
        s = data[m.end():m.end() + n]
        if len(s) != n or n < 2: continue
        try:
            t = s.decode('latin-1')
        except Exception:
            continue
        printable = sum(1 for ch in t if 32 <= ord(ch) < 127 or ord(ch) >= 160)
        if printable < .9 * len(t): continue
        out.append(t.strip())
        if len(out) >= limit: break
    return out


GAME = re.compile(r'\b(sega|mega ?drive|snes|nintendo|capcom|konami|mega ?man|zelda|final fantasy|game ?boy|'
                  r'playstation|rpg|video ?game|famicom|castlevania|sonic the)\b', re.I)
BLOCK = {'mega drive', 'drive', 'culture', 'sigma', 'maurice', 'qual', 'york', 'dimension', 'fisher', 'stardust',
         # second pass: instrument / common-word track names ('Koto' alone matched 1,659 files)
         'koto', 'joy', 'change', 'war', 'slave', 'air', 'japan', 'iris', 'the drums', 'desire', 'valerie', 'nina',
         'savage', 'sandra', 'fancy', 'lime', 'shannon', 'freestyle', 'strafe', 'expose', 'gentleman', 'liquid',
         'dune', 'push', 'bt', 'lange', 'wink', 'tin man', 'salute', 'el b', 'riki', 'shame', 'pil', 'wire', 'omni',
         'ceremony', 'the sound', 'hybrid', 'college', 'spor', 'snap', 'phoenix', 'wilkinson', 'aphrodite',
         'pendulum'}  # lower-case 'pendulum' text was mostly a transcriber alias; LMD's Pendulum is kept


def line_norm(raw):
    r = raw[2:] if raw[:2] in ('@T', '@t') else raw
    return norm(r)


def matches(k, amb, tx):
    """k must stand in a SHORT credit/title line among the first 16 text events (lyric lines excluded:
    a karaoke file stores lyrics as text events). Ambiguous names must BE the line, or be the artist
    half of 'artist - title' / 'title - artist' / 'by artist'."""
    for raw in tx[:16]:
        ln = line_norm(raw)
        if not ln or len(ln.split()) > 12: continue
        if amb:
            low = raw.lower().strip()
            if ln == k or re.match(r'^(@t)?\s*' + re.escape(k) + r'\s*[-:/]', low) \
                    or re.search(r'[-:/]\s*' + re.escape(k) + r'\s*$', low) \
                    or re.match(r'^(@t)?\s*by\s+' + re.escape(k) + r'\s*$', low):
                return True
        elif re.search(r'(?:^| )' + re.escape(k) + r'(?: |$)', ln):
            if re.search(r'(sequenced|transcribed|arranged|midi|tab|created|entered|programmed)\s+by\s+.*' + re.escape(k), ln):
                continue
            return True
    return False


def main():
    zpath, outp = os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2])
    AI = artist_index()
    pats = [(k, g, era, ambiguous(k)) for k, (g, era) in AI.items() if len(k) >= 2 and k not in BLOCK]
    firsts = {k.split(' ')[0] for k, *_ in pats}
    z = zipfile.ZipFile(zpath)
    out = open(outp, 'w'); n = hits = 0; seen = set()
    for info in z.infolist():
        if not info.filename.lower().endswith(('.mid', '.midi', '.kar')): continue
        n += 1
        if n % 50000 == 0: print(n, hits, file=sys.stderr, flush=True)
        try:
            data = z.read(info)
        except Exception:
            continue
        tx = texts_of(data)
        if not tx: continue
        words = set(' '.join(line_norm(t) for t in tx[:16]).split())
        if not (words & firsts): continue
        if any(GAME.search(t) for t in tx[:16]): continue
        found = [(k, g, era) for k, g, era, amb in pats if k.split(' ')[0] in words and matches(k, amb, tx)]
        if not found: continue
        md5 = hashlib.md5(data).hexdigest()
        if md5 in seen: continue
        seen.add(md5); hits += 1
        k, g, era = max(found, key=lambda x: len(x[0]))
        out.write(json.dumps({'src': 'lamd', 'id': info.filename, 'md5': md5, 'artist_key': k, 'genre': g,
                              'era_tag': era, 'all_found': sorted({f[0] for f in found}),
                              'texts': tx[:12]}) + '\n')
    print('files', n, 'matched', hits, file=sys.stderr)


def norm_keep(s):
    return re.sub(r'[^a-z0-9\-:]+', ' ', s.lower()).strip()


if __name__ == '__main__': main()
