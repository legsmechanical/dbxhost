# tutorial-video — dAVEBOx tutorial videos from the real device

Each video is a **storyboard** (`storyboards/NN_*.py`) performed on the Move by
the test harness while the web mirror's stream is recorded, then rendered
offline to a 1080p30 H.264 + AAC mp4: the OLED large, a caption panel, the
Move's control surface (with the controls being pressed highlighted), and title
cards.

```sh
python3 take.py storyboards/01_getting_around.py out/01_getting_around.mp4   # fresh session, record, render
python3 render.py takes/01_getting_around out/01_getting_around.mp4        # re-render a take
python3 review.py takes/01_getting_around sheet.png                        # a frame per caption
python3 review_gestures.py takes/01_getting_around sheet.png 0.6           # a frame after each press
```

`takes/` and `out/` are gitignored: a take is rebuilt, never committed.

## Pieces

| file | does |
|---|---|
| `record.py` | records `GET /stream-auto?v=2&audio=1` (through the manager, port 7700, which turns Mirror Display on): screen frames, `surface` snapshots, `pcm` sound blocks, all on `time.monotonic()` |
| `director.py` | performs a storyboard over `SchwungBus`, logging every press, turn, caption and card on the same clock |
| `device_draw.py` | the Move's surface, a Pillow port of `schwung-manager/static/mirror.html`'s drawing and LED palette (Cycling '74, MIT) |
| `render.py` | composes the frames and pipes them, with the sound, to ffmpeg |
| `take.py` | one video end to end, from a fresh session on the demo project |

## Things that are true, and cost time to find out

- **An injected press is invisible to the mirror's press layer** — it reads the
  raw hardware input, before injection. So highlights come from the
  director's log, not the stream. LEDs do respond (they come from MIDI_OUT).
- **The screen is sent only when it changes**; the renderer holds the last frame.
- **The sound is stereo** int16 L R; `pos` counts frames. It is placed by its
  own clock, anchored to the least-delayed block's arrival — measured: Play's
  press to the first sound, +37 ms.
- **Knobs scale by how fast they turn.** Detents 90 ms apart barely move a
  value; a real twist is ~14 ms apart (16 detents of OCTAVE = +1).
- **Rapid `SET_PARAM`s through the test daemon can drop** — read setup back.
- **A fresh session lands on the project picker.** `take.py` ends the session,
  relaunches, restarts the test daemon after it, and loads the demo project
  with Shift + its picker pad (68 + its index), then checks the session's
  library carries its name — it will not record on another project.
- **The step page's knobs:** a 16-detent fast twist moves Note one scale degree
  and Length about two steps.

## The demo project

"dAVEBOx Tutorial": track 1 DR32 with Move's stock 707 kit, track 2 NuSaw as a
plain bass (attack 0, short release, chorus and delay off), track 3 MiniJV
preset 0 (A.Piano 1), track 4 NuSaw as a lead (one saw, short release, chorus
and delay off), no audio FX — simple sounds so the sequencer's work is clear.
110 BPM, C minor; a four-on-the-floor beat, a bass riff and two chords; track
4's clip is left empty (video 2's setup clears it). Melodic demos play the lead
at C4 and up, so they carry on speakers without bass. The pad octave is not
saved, so every fresh session starts it at C2 — a storyboard's PRE sets it.
