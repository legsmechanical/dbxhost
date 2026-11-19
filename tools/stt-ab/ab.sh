#!/usr/bin/env bash
# ab.sh — compare speech recognizers on the same takes, ON THE MOVE.
#
#   tools/stt-ab/ab.sh run  <takes-dir> [model-id...]   # every model in models.tsv by default
#   tools/stt-ab/ab.sh pull <takes-dir>                 # your own takes, kept by the dictation
#
# <takes-dir>: *.wav plus refs.tsv (<name without .wav> TAB <what was said>).
#
# run: builds the bench, fetches + verifies the model archives (fetch.lock), copies
#      what each model needs to /data/UserData/stt-ab/ on the Move, runs every model
#      over the same takes with the dictation's OWN runtime libraries
#      (daveboxSA/stt/lib) and front end, and prints word error rate, time and RAM.
#      Results land in <takes-dir>/results/<model>.out.
# pull: copies the takes the dictation kept (create daveboxSA/dictation/keep/ on the
#      Move to start keeping them; delete it to stop) and writes refs.tsv with what
#      the shipped model heard — correct each line to what you actually said.
#
# The Move is busy with nothing else from this: one model at a time, one thread,
# cores 0-2, nice 19 — the helper's own manners. MOVE_HOST overrides move.local.
set -euo pipefail
cd "$(dirname "$0")/../.."
HERE=tools/stt-ab
HOST="${MOVE_HOST:-move.local}"
SSH=(ssh -o LogLevel=ERROR "ableton@$HOST")
DEV=/data/UserData/stt-ab
LIB=/data/UserData/daveboxSA/stt/lib
CACHE=.cache/stt-ab
cmd="${1:-}"; dir="${2:-}"
[ -n "$cmd" ] && [ -n "$dir" ] || { sed -n '2,9p' "$0"; exit 2; }

if [ "$cmd" = pull ]; then
    mkdir -p "$dir"
    rsync -a -e "ssh -o LogLevel=ERROR" "ableton@$HOST:/data/UserData/daveboxSA/dictation/keep/" "$dir/"
    [ -e "$dir/refs.tsv" ] || : > "$dir/refs.tsv"
    for j in "$dir"/*.json; do
        [ -e "$j" ] || continue
        k="$(basename "$j" .json)"
        grep -q "^$k	" "$dir/refs.tsv" || printf '%s\t%s\n' "$k" \
            "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("text",""))' "$j")" >> "$dir/refs.tsv"
    done
    echo "pulled $(ls "$dir"/*.wav 2>/dev/null | wc -l | tr -d ' ') takes into $dir; now correct $dir/refs.tsv"
    exit 0
fi
[ "$cmd" = run ] || { echo "unknown command $cmd" >&2; exit 2; }
shift 2
ls "$dir"/*.wav >/dev/null 2>&1 || { echo "no .wav in $dir" >&2; exit 1; }
[ -s "$dir/refs.tsv" ] || { echo "no $dir/refs.tsv" >&2; exit 1; }

# ---- the bench, cross-built with the dictation helper's own flags ----------
[ -f .cache/stt/stage/.stamp ] || scripts/fetch-stt.sh
mkdir -p "$CACHE/bin"
docker run --rm -v "$PWD:/build" -w /build -u "$(id -u):$(id -g)" schwung-builder \
    sh -c 'aarch64-linux-gnu-gcc -O2 -Wall -std=c11 -I.cache/stt/stage/include -Isrc/stt \
        tools/stt-ab/stt_bench.c src/stt/stt_core.c -o .cache/stt-ab/bin/stt_bench \
        -L.cache/stt/stage/lib -lsherpa-onnx-c-api -lm -Wl,--allow-shlib-undefined'

# ---- archives, verified --------------------------------------------------------
mkdir -p "$CACHE/dl"
grep -v '^#' "$HERE/fetch.lock" | while read -r name sum url; do
    [ -n "$name" ] || continue
    f="$CACHE/dl/$name"
    [ -f "$f" ] || curl -sfL -o "$f.part" "$url" && { [ -f "$f" ] || mv "$f.part" "$f"; }
    got="$(shasum -a 256 "$f" | cut -d' ' -f1)"
    [ "$got" = "$sum" ] || { echo "HASH MISMATCH $name: $got" >&2; rm -f "$f"; exit 1; }
done

# ---- stage each model's files: stage/<id>/ ----------------------------------
want=("$@")
ids=()
while IFS=$'\t' read -r id arc fam enc decf join tok extra; do
    case "$id" in ''|\#*) continue ;; esac
    if [ ${#want[@]} -gt 0 ]; then
        hit=0; for w in "${want[@]}"; do [ "$w" = "$id" ] && hit=1; done
        [ $hit = 1 ] || continue
    fi
    ids+=("$id")
    s="$CACHE/stage/$arc"
    # Per FILE, not per archive: two models can take different files from one
    # archive (Whisper's int8 and fp32 weights).
    need=0
    for f in "$enc" "$decf" "$join" "$tok"; do [ "$f" = - ] || [ -f "$s/$f" ] || need=1; done
    [ $need = 1 ] || continue
    mkdir -p "$s"
    if [ "$arc" = current ]; then
        cp build/stt/model/* "$s/"
    else
        tmp="$CACHE/x"; rm -rf "$tmp"; mkdir -p "$tmp"
        tar xjf "$CACHE/dl/$arc" -C "$tmp"
        top="$(find "$tmp" -mindepth 1 -maxdepth 2 -type d -name 'sherpa-onnx-*' | head -1)"
        for f in "$enc" "$decf" "$join" "$tok"; do [ "$f" = - ] || cp "$top/$f" "$s/"; done
        rm -rf "$tmp"
    fi
done < "$HERE/models.tsv"
mkdir -p "$CACHE/stage/aux"
cp "$CACHE/dl/gtcrn_simple.onnx" "$CACHE/dl/dpdfnet2.onnx" build/stt/model/silero_vad.onnx "$CACHE/stage/aux/"

# ---- to the Move: models, bench, takes ----------------------------------------
"${SSH[@]}" "mkdir -p $DEV/takes"
rsync -a -e "ssh -o LogLevel=ERROR" "$CACHE/stage/" "ableton@$HOST:$DEV/models/"
rsync -a -e "ssh -o LogLevel=ERROR" "$CACHE/bin/stt_bench" "ableton@$HOST:$DEV/stt_bench"
rsync -a --delete -e "ssh -o LogLevel=ERROR" --include='*.wav' --exclude='*' "$dir/" "ableton@$HOST:$DEV/takes/"

# ---- run, one model at a time -------------------------------------------------
mkdir -p "$dir/results"
while IFS=$'\t' read -r id arc fam enc decf join tok extra; do
    case "$id" in ''|\#*) continue ;; esac
    hit=0; for w in "${ids[@]}"; do [ "$w" = "$id" ] && hit=1; done
    [ $hit = 1 ] || continue
    m="$DEV/models/$arc"
    opts="family=$fam enc=$m/$enc dec=$m/$decf tokens=$m/$tok vad=$DEV/models/aux/silero_vad.onnx"
    [ "$join" = - ] || opts="$opts joiner=$m/$join"
    [ "$extra" = - ] || opts="$opts ${extra//@/$DEV/models/aux/}"
    echo "== $id"
    # -n: ssh must not read this loop's stdin (the model list)
    "${SSH[@]}" -n "LD_LIBRARY_PATH=$LIB taskset 0x7 nice -n 19 $DEV/stt_bench $opts -- $DEV/takes/*.wav" \
        > "$dir/results/$id.out" 2> "$dir/results/$id.err" || echo "   (failed: see $dir/results/$id.err)"
done < "$HERE/models.tsv"

echo
python3 "$HERE/score.py" "$dir/results" "$dir/refs.tsv" "${AB_VERBOSE:+-v}"
