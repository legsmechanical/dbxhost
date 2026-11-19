# stt-ab — compare speech recognizers on the Move

Runs several recognizers over the SAME takes on the device and prints word error rate, time
and memory for each. Everything but the recognizer is held constant: the dictation's own front
end (WAV read + normalise, level gate, 16 kHz resample, Silero voice span — copied from
`src/stt/stt_helper.c`), the dictation's installed runtime libraries
(`/data/UserData/daveboxSA/stt/lib`), one thread on cores 0-2 at nice 19.

```sh
tools/stt-ab/ab.sh run <takes-dir> [model-id ...]   # all of models.tsv by default
AB_VERBOSE=1 tools/stt-ab/ab.sh run <takes-dir>      # + every transcript
```

`<takes-dir>` holds `*.wav` and `refs.tsv` (`<name without .wav>` TAB `<what was said>`).
Results stay in `<takes-dir>/results/`; `score.py` re-scores them without re-running.

## Takes in your own voice, on the Move's mic

1. On the Move: `mkdir /data/UserData/daveboxSA/dictation/keep` — from then on every
   dictation take (and what the shipped model heard) is copied there.
2. Dictate on any keyboard as normal (cancel with Back if you like; the take is kept anyway).
3. `tools/stt-ab/ab.sh pull <takes-dir>` copies them down and writes `refs.tsv` filled with
   what the shipped model heard. **Correct each line to what you actually said.**
4. `rm -r /data/UserData/daveboxSA/dictation/keep` on the Move to stop keeping takes.

## The candidates (`models.tsv`)

| id | what it tests |
|---|---|
| `moonshine-tiny` | the shipped model — the control |
| `moonshine-tiny+gtcrn`, `+dpdfnet` | the same model behind a speech denoiser (more time, for noisy rooms) |
| `moonshine-base` | Moonshine's larger sibling |
| `whisper-tiny.en-int8` / `-fp32` | Whisper tiny, quantized and full precision |
| `whisper-base.en-int8` | Whisper base |
| `zipformer-small`, `-beam4` | a transducer, greedy and beam search |
| `parakeet-110m` | NVIDIA Parakeet TDT 110M (int8) |

Archives are pinned in `fetch.lock` (sha256) and cached in `.cache/stt-ab/`. Moonshine and
Whisper decode greedily only in this runtime (sherpa-onnx v2.0.1), so beam search applies to
the transducers alone.
