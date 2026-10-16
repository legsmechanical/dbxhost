"""review_points.py — a contact sheet of a take's pointers: one frame in the
middle of every point() step, to check each box sits on what the caption
names.   python3 review_points.py <take> <out.png>"""
import sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render
take = render.Take(sys.argv[1])
cells = []
for e in take.events:
    if e["kind"] != "point":
        continue
    t = e["t"] + min(1.0, e["secs"] * 0.6)
    img, _ = render.compose(take, t, {})
    cells.append((img.resize((640, 360)), " ".join(e["targets"])[:90], t - (take.t_begin - 0.3)))
cols = 3
rows = max(1, (len(cells) + cols - 1) // cols)
sheet = Image.new("RGB", (cols * 650, rows * 400), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, (im, txt, tt) in enumerate(cells):
    x, y = (i % cols) * 650, (i // cols) * 400
    sheet.paste(im, (x + 5, y + 5))
    d.text((x + 8, y + 368), "%d @%.1fs %s" % (i, tt, txt), fill=(255, 255, 0))
sheet.save(sys.argv[2]); print(len(cells), "cells")
