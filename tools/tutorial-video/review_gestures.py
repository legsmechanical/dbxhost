"""review_gestures.py — a contact sheet of a take's GESTURES: one frame `lag` s
after each press (and the first turn of a run), with what was pressed and the
caption showing.   python3 review_gestures.py <take> <out.png> [lag]"""
import sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render
take = render.Take(sys.argv[1]); lag = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
cells, last_turn = [], -9
for e in take.events:
    if e["kind"] == "down" or (e["kind"] == "turn" and e["t"] - last_turn > 0.6):
        if e["kind"] == "turn": last_turn = e["t"]
        t = e["t"] + lag
        cap, _ = render.state_at(take.events, t)
        img, _ = render.compose(take, t, {})
        cells.append((img.crop((0, 0, 1920, 520)).resize((640, 173)), "%s%s  %s" % (e["key"], "" if e["kind"] == "down" else " turn%+d" % e["dir"], (cap or {}).get("text", "")[:60]), t - (take.t_begin - 0.3)))
cols = 3
rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 650, rows * 200), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, (im, txt, tt) in enumerate(cells):
    x, y = (i % cols) * 650, (i // cols) * 200
    sheet.paste(im, (x + 5, y + 5)); d.text((x + 8, y + 182), "%d @%.1fs %s" % (i, tt, txt), fill=(255, 255, 0))
sheet.save(sys.argv[2]); print(len(cells), "cells")
