# DK-ingest: rank GMD beat files as INGEST candidates per category from gmd_drum_stats.py --json output
# (the 'all' bars run). A good loop source has >= 8 bars and a high modal-bar share (the most common
# 1-bar onset pattern of that lane covers many bars), i.e. a stable groove with occasional variation.
# Usage: python3 gmd_ingest_candidates.py out/rock_beat_all.json [N]
import json, sys
o = json.load(open(sys.argv[1])); N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
fr = [f for f in o['files_detail'] if f['bars'] >= 8]
print(o['family'], 'files >= 8 bars:', len(fr), 'of', len(o['files_detail']))
for cat in ('kick', 'snare', 'hat', 'ride'):
    c = [f for f in fr if cat in f['modal'] and f['modal'][cat][0].count('x') >= (2 if cat != 'kick' else 1)]
    c.sort(key=lambda f: -f['modal'][cat][1])
    print(f'  {cat}: {len(c)} files with a non-empty modal bar; top {N}:')
    for f in c[:N]:
        print(f"    {f['file']}  {f['bpm']}bpm {f['bars']}bars fill={f['fill_bars']}  modal {f['modal'][cat][0]} x{f['modal'][cat][1]}")
