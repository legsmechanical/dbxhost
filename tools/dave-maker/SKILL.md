---
name: move-dave-maker
description: Convert portrait photographs into readable 128x64 true 1-bit splash screens for the Ableton Move OLED. Use for creating, tuning, validating, or adding text to Move portrait bitmaps; do not use for general image resizing or color displays.
---

# Move Dave Maker

Create identity-preserving OLED portraits with the bundled deterministic CLI. Do not regenerate the person with an image model.

## Workflow

1. Inspect the source. Prefer a centered head or upper-body image with visible eyes and facial edges.
2. Run `scripts/make_move_dave.py INPUT OUTPUT.png`. The default path center-crops to 2:1, enhances contrast, flattens smooth edge-connected background regions, and uses serpentine Floyd–Steinberg diffusion.
3. Inspect both the 128x64 result and a nearest-neighbor enlarged preview. Use `--preview OUTPUT-preview.png` to create the latter.
4. Tune only the diagnosed problem. Read [references/tuning.md](references/tuning.md) for the decision table.
5. Verify the final file. The CLI rejects output that is not exactly 128x64 and Pillow mode `1`.

## Common commands

```sh
python3 scripts/make_move_dave.py source.png DAVE.png --preview DAVE-preview.png
python3 scripts/make_move_dave.py dark.png DAVE.png --shadow-lift 0.55
python3 scripts/make_move_dave.py portrait.png DAVE.png --method atkinson
python3 scripts/make_move_dave.py portrait.png DAVE.png \
  --text "HOORAY - YOU'VE UNWRAPPED A RARE DOUBLE DAVE" \
  --portrait-side right --text-panel-width 70
python3 scripts/make_move_dave.py source.png DAVE.png --all-formats
```

Preserve exact user-provided text. Text mode creates separate portrait and text panels; never draw text over the face.

## Deliverables

Return the generated path and report the selected method, any non-default tuning, and validation status. PNG is the canonical output. `--all-formats` also writes monochrome BMP and XBM/C data beside it.
