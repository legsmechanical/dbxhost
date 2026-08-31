#!/usr/bin/env python3
"""Create a 128x64 true 1-bit portrait splash for the Ableton Move OLED."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

WIDTH, HEIGHT = 128, 64


def pixel_values(image: Image.Image) -> list[int]:
    """Return flat pixel values across supported Pillow versions."""
    getter = getattr(image, "get_flattened_data", None)
    return list(getter() if getter else image.getdata())


def fit_gray(path: Path, center_x: float, center_y: float) -> Image.Image:
    with Image.open(path) as source:
        return ImageOps.fit(
            source.convert("RGB"),
            (WIDTH, HEIGHT),
            method=Image.Resampling.LANCZOS,
            centering=(center_x, center_y),
        ).convert("L")


def apply_tone(image: Image.Image, contrast: float, shadow_lift: float, denoise: int) -> Image.Image:
    if denoise:
        image = image.filter(ImageFilter.MedianFilter(denoise))
    image = ImageOps.autocontrast(image, cutoff=1)
    image = ImageEnhance.Contrast(image).enhance(contrast)
    if shadow_lift != 1.0:
        table = [round(255 * ((value / 255) ** shadow_lift)) for value in range(256)]
        image = image.point(table)
    return image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=135, threshold=2))


def flatten_edge_background(image: Image.Image) -> Image.Image:
    """Flatten smooth, edge-connected regions outside a protected face ellipse."""
    smooth_image = image.filter(ImageFilter.GaussianBlur(1.0))
    smooth = pixel_values(smooth_image)
    output = pixel_values(image)

    def at(x: int, y: int) -> int:
        return smooth[y * WIDTH + x]

    candidates = [False] * (WIDTH * HEIGHT)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            left = at(max(0, x - 1), y)
            right = at(min(WIDTH - 1, x + 1), y)
            above = at(x, max(0, y - 1))
            below = at(x, min(HEIGHT - 1, y + 1))
            gradient = (abs(right - left) + abs(below - above)) / 2
            guard = ((x - WIDTH * 0.5) / (WIDTH * 0.36)) ** 2 + (
                (y - HEIGHT * 0.51) / (HEIGHT * 0.58)
            ) ** 2 < 1.0
            candidates[y * WIDTH + x] = gradient < 7.5 and not guard

    visited = [False] * (WIDTH * HEIGHT)
    seeds = [(x, 0) for x in range(WIDTH)] + [(x, HEIGHT - 1) for x in range(WIDTH)]
    seeds += [(0, y) for y in range(1, HEIGHT - 1)]
    seeds += [(WIDTH - 1, y) for y in range(1, HEIGHT - 1)]

    for seed_x, seed_y in seeds:
        seed = seed_y * WIDTH + seed_x
        if visited[seed] or not candidates[seed]:
            continue
        queue = deque([(seed_x, seed_y)])
        visited[seed] = True
        component: list[tuple[int, int]] = []
        while queue:
            x, y = queue.popleft()
            component.append((x, y))
            value = at(x, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT):
                    continue
                index = ny * WIDTH + nx
                if visited[index] or not candidates[index]:
                    continue
                if abs(at(nx, ny) - value) > 9:
                    continue
                visited[index] = True
                queue.append((nx, ny))
        if len(component) < 12:
            continue
        values = sorted(at(x, y) for x, y in component)
        flat = 255 if values[len(values) // 2] >= 128 else 0
        for x, y in component:
            output[y * WIDTH + x] = flat
    result = Image.new("L", (WIDTH, HEIGHT))
    result.putdata(output)
    return result


def serpentine_dither(image: Image.Image) -> Image.Image:
    values = [float(value) for value in pixel_values(image)]
    for y in range(HEIGHT):
        direction = 1 if y % 2 == 0 else -1
        xs = range(WIDTH) if direction == 1 else range(WIDTH - 1, -1, -1)
        for x in xs:
            index = y * WIDTH + x
            old = min(255.0, max(0.0, values[index]))
            new = 255.0 if old >= 128 else 0.0
            values[index] = new
            error = old - new
            for nx, ny, weight in (
                (x + direction, y, 7 / 16),
                (x - direction, y + 1, 3 / 16),
                (x, y + 1, 5 / 16),
                (x + direction, y + 1, 1 / 16),
            ):
                if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                    values[ny * WIDTH + nx] += error * weight
    result = Image.new("1", (WIDTH, HEIGHT))
    result.putdata([255 if value >= 128 else 0 for value in values])
    return result


def atkinson_dither(image: Image.Image) -> Image.Image:
    values = [float(value) for value in pixel_values(image)]
    for y in range(HEIGHT):
        for x in range(WIDTH):
            index = y * WIDTH + x
            old = min(255.0, max(0.0, values[index]))
            new = 255.0 if old >= 128 else 0.0
            values[index] = new
            error = (old - new) / 8
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                    values[ny * WIDTH + nx] += error
    result = Image.new("1", (WIDTH, HEIGHT))
    result.putdata([255 if value >= 128 else 0 for value in values])
    return result


def threshold_dither(image: Image.Image) -> Image.Image:
    values = sorted(pixel_values(image))
    cutoff = values[len(values) // 2]
    return image.point(lambda value: 255 if value >= cutoff else 0, mode="1")


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    lines: list[str] = []
    for explicit_line in text.splitlines() or [""]:
        words = explicit_line.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if draw.textbbox((0, 0), candidate, font=font)[2] <= width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def compose_text_panel(
    portrait: Image.Image,
    text: str,
    side: str,
    panel_width: int,
    requested_font_size: int,
) -> Image.Image:
    if not 44 <= panel_width <= 86:
        raise ValueError("--text-panel-width must be between 44 and 86")
    canvas = Image.new("1", (WIDTH, HEIGHT), 1)
    draw = ImageDraw.Draw(canvas)
    available_width = panel_width - 5
    font_size = requested_font_size
    while font_size >= 5:
        font = ImageFont.load_default(size=font_size)
        lines = wrap_text(draw, text, font, available_width)
        line_height = font_size + 2
        if len(lines) * line_height <= HEIGHT - 4:
            break
        font_size -= 1
    else:
        raise ValueError("Text does not fit; shorten it or increase --text-panel-width")

    text_x = 2 if side == "right" else WIDTH - panel_width + 2
    y = (HEIGHT - len(lines) * line_height) // 2
    for line in lines:
        draw.text((text_x, y), line, fill=0, font=font)
        y += line_height

    separator = panel_width if side == "right" else WIDTH - panel_width - 1
    draw.line((separator, 3, separator, HEIGHT - 4), fill=0)
    portrait_width = WIDTH - panel_width - 2
    portrait_panel = ImageOps.fit(
        portrait.convert("1"),
        (portrait_width, HEIGHT),
        method=Image.Resampling.NEAREST,
        centering=(0.5, 0.5),
    )
    portrait_x = panel_width + 2 if side == "right" else 0
    canvas.paste(portrait_panel, (portrait_x, 0))
    return canvas


def save_xbm(image: Image.Image, path: Path, name: str) -> None:
    pixels = pixel_values(image.convert("1"))
    packed: list[int] = []
    for y in range(HEIGHT):
        for x0 in range(0, WIDTH, 8):
            byte = 0
            for bit in range(8):
                if pixels[y * WIDTH + x0 + bit]:
                    byte |= 1 << bit
            packed.append(byte)
    lines = [
        f"#define {name}_width {WIDTH}",
        f"#define {name}_height {HEIGHT}",
        f"static const unsigned char {name}_bits[] = {{",
    ]
    for start in range(0, len(packed), 12):
        lines.append("  " + ", ".join(f"0x{value:02x}" for value in packed[start : start + 12]) + ",")
    lines.append("};")
    path.write_text("\n".join(lines) + "\n")


def validate(path: Path) -> None:
    with Image.open(path) as image:
        if image.size != (WIDTH, HEIGHT) or image.mode != "1":
            raise RuntimeError(f"Invalid output: expected 128x64 mode 1, got {image.size} mode {image.mode}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--method", choices=("serpentine", "atkinson", "threshold"), default="serpentine")
    parser.add_argument("--contrast", type=float, default=1.18)
    parser.add_argument("--shadow-lift", type=float, default=1.0, help="Gamma: below 1 brightens shadows")
    parser.add_argument("--denoise", type=int, choices=(0, 3, 5), default=0)
    parser.add_argument("--no-background-flatten", action="store_true")
    parser.add_argument("--center-x", type=float, default=0.5)
    parser.add_argument("--center-y", type=float, default=0.5)
    parser.add_argument("--text")
    parser.add_argument("--portrait-side", choices=("left", "right"), default="right")
    parser.add_argument("--text-panel-width", type=int, default=70)
    parser.add_argument("--font-size", type=int, default=8)
    parser.add_argument("--invert", action="store_true")
    parser.add_argument("--all-formats", action="store_true")
    parser.add_argument("--preview", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    if args.output.suffix.lower() != ".png":
        raise ValueError("Canonical output path must end in .png")
    if not 0 <= args.center_x <= 1 or not 0 <= args.center_y <= 1:
        raise ValueError("Crop centers must be between 0 and 1")
    if args.shadow_lift <= 0 or args.contrast <= 0:
        raise ValueError("Tone parameters must be positive")

    gray = fit_gray(args.input, args.center_x, args.center_y)
    gray = apply_tone(gray, args.contrast, args.shadow_lift, args.denoise)
    if not args.no_background_flatten:
        gray = flatten_edge_background(gray)
    methods = {
        "serpentine": serpentine_dither,
        "atkinson": atkinson_dither,
        "threshold": threshold_dither,
    }
    image = methods[args.method](gray)
    if args.text:
        image = compose_text_panel(image, args.text, args.portrait_side, args.text_panel_width, args.font_size)
    if args.invert:
        image = ImageOps.invert(image.convert("L")).convert("1")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, bits=1, optimize=True)
    validate(args.output)

    if args.all_formats:
        image.save(args.output.with_suffix(".bmp"))
        symbol = "".join(character if character.isalnum() else "_" for character in args.output.stem)
        save_xbm(image, args.output.with_suffix(".xbm"), symbol)
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        image.convert("L").resize((WIDTH * 8, HEIGHT * 8), Image.Resampling.NEAREST).save(args.preview)

    print(f"wrote {args.output} (128x64, true 1-bit, method={args.method})")


if __name__ == "__main__":
    main()
