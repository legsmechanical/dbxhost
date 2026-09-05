#!/bin/bash
# tests/test_param_auto_scale_export.sh — pa_export writes SCALED values.
# EXPORT_PA_PATH is a device path (the file lives under /data/UserData), so the
# export cannot run here; this pins the one line that must apply the scale, and
# that the export header carries the percent. The arithmetic is unit-tested in
# test_param_auto_scale.c.
set -e
cd "$(dirname "$0")/.."
blk=$(awk '/if \(!strcmp\(key, "pa_export"\)\)/{f=1} f{print} f&&/return snprintf\(out, out_len, "%d", lanes\)/{exit}' dsp/seq8.c)
[ -n "$blk" ] || { echo "FAIL: pa_export block not found"; exit 1; }
echo "$blk" | grep -q 'pa_scaled(e, e->points\[k\].val)' && echo "  ok   — pa_export writes each point through pa_scaled" || { echo "FAIL: export writes raw points"; exit 1; }
echo "$blk" | grep -q 'pa_scale_pct(e));' && echo "  ok   — ...and the lane header carries the percent" || { echo "FAIL: header lacks the scale"; exit 1; }
echo "PASS: test_param_auto_scale_export.sh"
