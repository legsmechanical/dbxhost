#!/usr/bin/env python3
"""pick-splash.py — weighted launch-splash pick + Dave Box collection record.

Prints the chosen splash-N.hex path (empty if none available) and appends the
chosen Dave's PERMANENT number to the collection file — the Dave Box gacha
(Josh, 2026-08-31): totally random with repeats, rarity-weighted, and every
Dave you are dealt stays in the collection forever.

Reads splash-pool.tsv (index, dave_num, weight, name — emitted by
make-splashes.mjs). Missing/short manifest degrades to a uniform pick over
whatever splash-N.hex exist, recording nothing it cannot name.

The collection file survives reinstalls by construction: the host deploy
merges file-by-file and leaves files the build does not ship untouched.
Appends are deduped here; readers still tolerate duplicates and junk lines.
"""
import glob, os, random, sys

DBX = sys.argv[1] if len(sys.argv) > 1 else "/data/UserData/dbx-host"
SEEN = os.path.join(DBX, "daves-seen.txt")

pool = []                              # (path, dave_num, weight)
try:
    for line in open(os.path.join(DBX, "splash-pool.tsv")):
        f = line.rstrip("\n").split("\t")
        if len(f) < 3:
            continue
        p = os.path.join(DBX, "splash-%s.hex" % f[0])
        if os.path.isfile(p):
            pool.append((p, f[1], float(f[2])))
except (OSError, ValueError):
    pool = []

if pool:
    r = random.random() * sum(w for _, _, w in pool)
    for path, num, w in pool:
        r -= w
        if r < 0:
            break
    try:
        seen = set()
        if os.path.isfile(SEEN):
            seen = {l.strip() for l in open(SEEN)}
        if num not in seen:
            with open(SEEN, "a") as fh:      # one short O_APPEND write
                fh.write(num + "\n")
    except OSError:
        pass                                  # a failed record never blocks the launch
    print(path)
else:
    f = sorted(glob.glob(os.path.join(DBX, "splash-*.hex")))
    f = [p for p in f if "pool" not in p]
    p = random.choice(f) if f else os.path.join(DBX, "splash.hex")
    print(p if os.path.isfile(p) else "")
