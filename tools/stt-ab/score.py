#!/usr/bin/env python3
"""score.py <results-dir> <refs.tsv> — word error rate and time per recognizer.

<results-dir> holds one <model-id>.out per recognizer (stt_bench's output).
<refs.tsv>: <take file name without .wav> <TAB> <what was said>. Takes with no
reference are listed but not scored.

Words are compared after lower-casing, dropping punctuation and spelling out
digits, so "Track 7." and "track seven" match: the keyboard shows neither
punctuation nor case differences as errors that matter."""
import os
import re
import sys

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + ("" if rest == 0 else " " + num_words(rest))
    return str(n)


def norm(s):
    s = s.lower().replace("-", " ")
    s = re.sub(r"\d+", lambda m: " " + num_words(int(m.group())) + " ", s)
    s = re.sub(r"[^a-z' ]", " ", s)
    return [w.strip("'") for w in s.split() if w.strip("'")]


def edits(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(b)]


def main():
    rdir, refs_path = sys.argv[1], sys.argv[2]
    refs = {}
    for line in open(refs_path, encoding="utf-8"):
        if line.strip() and not line.startswith("#") and "\t" in line:
            k, v = line.rstrip("\n").split("\t", 1)
            refs[k.strip()] = v.strip()
    order = [l.split("\t")[0] for l in open(os.path.join(os.path.dirname(__file__), "models.tsv"))
             if l.strip() and not l.startswith("#")]
    rows, detail = [], []
    for mid in order:
        p = os.path.join(rdir, mid + ".out")
        if not os.path.exists(p):
            continue
        load = rss = None
        errs = words = n = 0
        dec = []
        exact = 0
        for line in open(p, encoding="utf-8", errors="replace"):
            f = line.rstrip("\n").split("\t")
            if f[0] == "LOAD":
                load = int(f[1])
            elif f[0] == "RSS":
                rss = int(f[1])
            elif f[0] == "TAKE":
                take, audio_ms, voiced_ms, dn_ms, dec_ms, text = f[1], int(f[2]), int(f[3]), int(f[4]), int(f[5]), f[6] if len(f) > 6 else ""
                key = take[:-4] if take.endswith(".wav") else take
                dec.append((voiced_ms, dn_ms + dec_ms))
                ref = refs.get(key)
                if ref is not None:
                    r, h = norm(ref), norm(text)
                    e = edits(r, h)
                    errs += e; words += len(r); n += 1
                    exact += (e == 0)
                    detail.append((mid, key, e, len(r), text))
                else:
                    detail.append((mid, key, None, 0, text))
            elif f[0] == "SKIP":
                key = f[1][:-4] if f[1].endswith(".wav") else f[1]
                if key in refs:
                    r = norm(refs[key]); errs += len(r); words += len(r); n += 1
                detail.append((mid, key, "skip:" + f[2], 0, ""))
        rtf = sum(t for _, t in dec) / max(1, sum(v for v, _ in dec))
        worst = max((t for _, t in dec), default=0)
        rows.append((mid, 100.0 * errs / max(1, words), exact, n, rtf, worst, load, rss))
    print(f"{'recognizer':24} {'WER':>6} {'exact':>7} {'time/speech':>11} {'worst':>7} {'load':>6} {'RAM':>7}")
    for mid, wer, exact, n, rtf, worst, load, rss in rows:
        print(f"{mid:24} {wer:5.1f}% {exact:3d}/{n:<3d} {rtf:10.2f}x {worst:6d}ms {load or 0:5d}ms {(rss or 0) // 1024:5d}MB")
    print("\ntime/speech: decode (+ denoise) time over voiced audio, warm process. worst: slowest take.")
    if "-v" in sys.argv:
        print()
        for mid, key, e, nw, text in detail:
            mark = "" if e == 0 else (f"{e}/{nw}" if isinstance(e, int) else str(e))
            print(f"{mid:24} {key:16} {mark:>8}  {text}")


if __name__ == "__main__":
    main()
