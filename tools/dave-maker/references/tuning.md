# Tuning Move portraits

Always diagnose at 128x64. Enlarged previews must use nearest-neighbor scaling so pixels remain visible.

| Symptom | First adjustment | Notes |
|---|---|---|
| Vertical lines or repeating woven patterns | Keep the default `serpentine` method and background flattening | Alternating scan direction prevents directional error accumulation. |
| Flat background contains distracting pixels | Keep background flattening on; try `--method atkinson` if noise remains | Flattening is restricted to smooth regions connected to the frame edge and protects a central portrait ellipse. |
| Face is too dark | Add `--shadow-lift 0.65`; reduce toward `0.4` if needed | Values below 1 brighten midtones and shadows. Change gradually. |
| Face is washed out | Add `--contrast 1.3`; consider `--shadow-lift 1.15` | Values above 1 for shadow lift darken midtones. |
| Important scene detail disappears | Use `--no-background-flatten` | Useful for props, instruments, or meaningful scenery. |
| Too many diffuse pixels | Try `--method atkinson` | Atkinson retains less propagated error and usually looks cleaner. |
| Low-resolution source looks chaotic | Try `--denoise 3 --method atkinson` | Denoising cannot restore missing identity detail. |
| Display polarity is reversed | Add `--invert` | OLED libraries differ on whether set bits mean lit or dark. |

## Text layout

Supply exact copy with `--text`. The CLI wraps it into a dedicated panel and shrinks the bitmap font until it fits. Use `--text-panel-width` to trade text space for portrait space. Keep the panel at least 44 pixels wide and the portrait at least 40 pixels wide.

If exact line breaks matter, include newline characters in the argument. The CLI preserves explicit line breaks and wraps overlong lines further.

## Cropping

The default center is `0.5, 0.5`. Adjust `--center-x` or `--center-y` from 0 to 1 only when the face is visibly off-center. Do not stretch the source to 2:1.

## Validation

A valid canonical PNG is:

- exactly 128x64;
- true 1-bit, not 8-bit grayscale with two colors;
- free of antialiasing after final quantization;
- recognizable at native size;
- named for the subject when the user supplies a name.

XBM output is 1,024 bytes, packed horizontally with the least-significant bit first in each byte. The generated array treats white pixels as set bits; use `--invert` if the consuming display library expects the opposite polarity.
