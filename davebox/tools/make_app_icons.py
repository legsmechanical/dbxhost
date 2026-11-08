"""The Screen view's app icon (web_ui_icon-*.png): a 2:1 screen above two rows
of pads in the track colours, on the screen's own black. Run from davebox/:
    python3 tools/make_app_icons.py
Writes 180 (Apple touch), 192 and 512 (the manifest)."""
from PIL import Image, ImageDraw

TRACK = ['#ff4032', '#3663fc', '#fadc3b', '#62ff55', '#ff2bd4', '#31adff', '#ffa833', '#24d05a']

def icon(n):
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

for n in (180, 192, 512):
    icon(n).save(f'web_ui_icon-{n}.png', optimize=True)
    print('web_ui_icon-%d.png' % n)
