#!/bin/bash
# tests/test_param_auto_scale_export.sh — pa_export writes SCALED values.
# EXPORT_PA_PATH is a device path (the file lives under /data/UserData), so the
# export cannot run here; this pins the one line that must apply the scale, and
# that the export header carries the percent. The arithmetic is unit-tested in
# test_param_auto_scale.c.
#
# 6b2 follow-up: the per-point scaling moved into pa_export_points (factored
# out so the window-start lead point is white-box testable — see
# test_param_auto_export_lead.c), so this now pins THAT function, and pins
# pa_export itself only for the header's percent + for actually calling it.
set -e
cd "$(dirname "$0")/.."
pts_blk=$(awk '/^static int pa_export_points\(/{f=1} f{print} f&&/^}/{exit}' dsp/seq8.c)
[ -n "$pts_blk" ] || { echo "FAIL: pa_export_points not found"; exit 1; }
echo "$pts_blk" | grep -q 'pa_scaled(e, e->points\[k\].val)' && echo "  ok   — pa_export_points writes each raw point through pa_scaled" || { echo "FAIL: export writes raw points"; exit 1; }

exp_blk=$(awk '/if \(!strcmp\(key, "pa_export"\)\)/{f=1} f{print} f&&/return snprintf\(out, out_len, "%d", lanes\)/{exit}' dsp/seq8.c)
[ -n "$exp_blk" ] || { echo "FAIL: pa_export block not found"; exit 1; }
echo "$exp_blk" | grep -q 'pa_export_points(etr, e, xpts, PA_ENTRY_POINTS + 2)' && echo "  ok   — pa_export writes its points through pa_export_points" || { echo "FAIL: pa_export no longer calls pa_export_points"; exit 1; }
echo "$exp_blk" | grep -q 'pa_scale_pct(e));' && echo "  ok   — ...and the lane header carries the percent" || { echo "FAIL: header lacks the scale"; exit 1; }
echo "PASS: test_param_auto_scale_export.sh"
