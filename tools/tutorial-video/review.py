"""review.py — a contact sheet of a take: one frame per caption (and card),
taken `at` seconds before the next caption starts, with the caption text, to
check the screen does what the caption says.   python3 review.py <take> <out.png>"""
import sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render
take = render.Take(sys.argv[1])
marks = [e for e in take.events if e["kind"] in ("caption", "card")] + [{"t": take.t_end, "kind": "end"}]
cells = []
for a, b in zip(marks, marks[1:]):
    t = max(a["t"] + 0.2, b["t"] - float(sys.argv[3]) if len(sys.argv) > 3 else b["t"] - 0.4)
    img, _ = render.compose(take, t, {})
    cells.append((img.resize((640, 360)), (a.get("title") or "") + " | " + (a.get("text") or a.get("title", ""))[:90], t - (take.t_begin - 0.3)))
cols = 3
rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 650, rows * 400), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, (im, txt, tt) in enumerate(cells):
    x, y = (i % cols) * 650, (i // cols) * 400
    sheet.paste(im, (x + 5, y + 5))
    d.text((x + 8, y + 368), "%d @%.1fs %s" % (i, tt, txt), fill=(255, 255, 0))
sheet.save(sys.argv[2]); print(len(cells), "cells")
