"""The two app icons (web_ui_app.js): the Screen view's (web_ui_screen-*.png),
a 2:1 screen above two rows of pads in the track colours, and the editor's
(web_ui_editor-*.png), a piano roll's notes in those colours. Run from davebox/:
    python3 tools/make_app_icons.py
Writes 180 (Apple touch), 192 and 512 (the manifests) of each."""
from PIL import Image, ImageDraw

TRACK = ['#ff4032', '#3663fc', '#fadc3b', '#62ff55', '#ff2bd4', '#31adff', '#ffa833', '#24d05a']

def screen(n):
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=224, fill='#08090b')
    # the screen
    d.rounded_rectangle([150, 170, S - 150, 170 + 362], radius=44, fill='#1c2733', outline='#4da3ff', width=14)
    d.rounded_rectangle([222, 250, 560, 290], radius=20, fill='#f2f3f5')
    d.rounded_rectangle([222, 330, 760, 356], radius=13, fill='#8a8f99')
    d.rounded_rectangle([222, 396, 660, 422], radius=13, fill='#4a4f59')
    # the pads: two rows of four
    pw, gap, x0, y0 = 152, 28, 150, 600
    for r in range(2):
        for c in range(4):
            x, y = x0 + c * (pw + gap), y0 + r * (pw * 0.62 + gap)
            d.rounded_rectangle([x, y, x + pw, y + pw * 0.62], radius=22, fill=TRACK[r * 4 + c])
    return im.resize((n, n), Image.LANCZOS)

def editor(n):
    S = 1024
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=224, fill='#101216')
    # the roll: lane rows, bar lines, then notes climbing in the track colours
    for r in range(8):
        y = 150 + r * 92
        d.rectangle([150, y, S - 150, y + 84], fill='#191c22' if r % 2 else '#21252e')
    for x in (150 + 181, 150 + 362, 150 + 543):
        d.rectangle([x, 150, x + 4, 150 + 8 * 92 - 8], fill='#39414f')
    notes = [(0, 6, 150), (150, 4, 120), (270, 5, 110), (380, 2, 170), (550, 3, 90), (640, 1, 84)]
    for i, (x, row, w) in enumerate(notes):
        y = 150 + row * 92
        d.rounded_rectangle([160 + x, y + 10, 160 + x + w, y + 74], radius=16, fill=TRACK[i])
    d.rectangle([150 + 470, 140, 150 + 478, 150 + 8 * 92], fill='#ffcf4d')   # the playhead
    return im.resize((n, n), Image.LANCZOS)

for n in (180, 192, 512):
    for name, fn in (('screen', screen), ('editor', editor)):
        fn(n).save(f'web_ui_{name}-{n}.png', optimize=True)
        print(f'web_ui_{name}-{n}.png')
