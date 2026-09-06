#!/usr/bin/env bash
# The sample-marker arithmetic, exercised headlessly.
#
# This is the pure third of the fullscreen wave editor, lifted out of
# shadow_ui.js so dAVEBOx can have that screen too (a module may import
# `shared/` and never `shadow/`). Everything here is arithmetic — no drawing,
# no file IO — which is exactly why it is worth pinning: each of these
# functions has a failure mode that is invisible on the device, because a
# marker drawn in the wrong place still looks like a marker.
set -euo pipefail
cd "$(dirname "$0")/../.."
command -v node >/dev/null 2>&1 || { echo "FAIL: node required"; exit 1; }

node --input-type=module -e '
import * as W from "./src/shared/param_pages/wav_position.mjs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "  ok   — " : "FAIL  — ") + m); if (!c) fail++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/* ============================================================== spellings */
/* ⚠ BOTH are live in the fleet, and the two trees normalise in OPPOSITE
 * directions — param_meta folds ui_type into type, the host sets type "float"
 * and tests ui_type. A predicate that picks one field misses half the fleet. */
ok(W.isWavPosition({ type: "wav_position" }), "`type: wav_position` is recognised");
ok(W.isWavPosition({ type: "float", ui_type: "wav_position" }),
   "`type: float` + `ui_type: wav_position` is recognised");
ok(W.isWavPosition({ expanded_type: "wav_position" }), "an already-expanded meta is recognised");
ok(!W.isWavPosition({ type: "float" }), "control: a plain float is NOT a marker");
ok(!W.isWavPosition(null), "control: no meta is not a marker");

/* ==================================================================== meta */
{
  const m = W.wavPositionMeta({ key: "s", type: "wav_position", mode: "trim_front",
                                filepath_param: "path", enable_zoom: "true" });
  ok(m.wav_mode === "start", "`trim_front` is the older spelling of `start`");
  ok(W.wavPositionMeta({ mode: "trim_end" }).wav_mode === "end", "...and `trim_end` of `end`");
  ok(W.wavPositionMeta({}).wav_mode === "position", "no mode declared = a plain position");
  ok(m.enable_zoom === true, "`enable_zoom` accepts the string \"true\" off the wire");
  ok(m.step === 0.01, "a ratio marker steps in hundredths by default");
  ok(W.wavPositionMeta({ display_unit: "ms" }).step === 1,
     "...but a MILLISECOND marker steps in whole units — 0.01 ms is not a step");
  ok(W.wavPositionMeta({ shift_increment_multiplier: 0 }).shift_increment_multiplier === 0.1,
     "a zero shift multiplier is refused — it would freeze the fine step");
  /* The extras live at the top level or under `options`, depending on the module. */
  ok(W.wavPositionMeta({ options: { view_group: "loop" } }).view_group === "loop",
     "an extra declared inside `options` is still read");
}

/* =================================================================== ratio */
{
  const pct = W.wavPositionMeta({ display_unit: "percent", min: 0, max: 1 });
  ok(near(W.wavPositionRatio(0.25, pct, 0), 0.25), "a ratio marker needs no duration");
  const ms = W.wavPositionMeta({ display_unit: "ms" });
  ok(near(W.wavPositionRatio(500, ms, 2), 0.25), "500 ms into a 2 s file is a quarter in");
  const sec = W.wavPositionMeta({ display_unit: "sec" });
  ok(near(W.wavPositionRatio(0.5, sec, 2), 0.25), "0.5 s into a 2 s file is a quarter in");
  ok(W.wavPositionRatio(500, ms, 0) === 0, "no duration falls back to the file start");
  /* ⚠⚠ ...and THAT is why the caller needs to know the difference. A confident
   * marker at 0 is a lie; the screen should say it has no duration. */
  ok(W.wavRatioKnown(0.25, pct, 0) === true, "a ratio is known without a duration");
  ok(W.wavRatioKnown(500, ms, 0) === false,
     "a TIME marker with no duration is UNKNOWN, not zero");
  ok(W.wavRatioKnown(500, ms, 2) === true, "control: with a duration it is known again");
  ok(W.wavPositionRatio(99, pct, 0) === 1 && W.wavPositionRatio(-99, pct, 0) === 0,
     "out-of-range values clamp into the file rather than off the plot");
}

/* =============================================================== precision */
/* ⚠⚠ THE BUG THIS EXISTS FOR. A zoomable step is divided by up to 256, so at
 * high zoom one detent moves the value by less than a thousandth. Round the
 * write to the STEP`s precision and nothing changes: the value re-reads
 * identical and the marker sits still — a dead encoder, at exactly the zoom
 * where precision was the point. */
{
  const zoomable = W.wavPositionMeta({ step: 0.01, enable_zoom: true });
  const plain = W.wavPositionMeta({ step: 0.01, enable_zoom: false });
  ok(W.wavSetPrecision(zoomable) > W.wavSetPrecision(plain),
     "a zoomable marker writes MORE decimals than a fixed one (" +
     W.wavSetPrecision(zoomable) + " vs " + W.wavSetPrecision(plain) + ")");
  const finest = W.wavKnobStep(zoomable, W.WAV_ZOOM_MAX, true);
  const written = Number(finest.toFixed(W.wavSetPrecision(zoomable)));
  ok(written > 0,
     "the SMALLEST possible detent survives the write rounding (" + finest + " -> " + written + ")");
  /* ⚠ CONTROL: the same step written at the plain precision is annihilated —
   * which is the failure, demonstrated rather than asserted about. */
  ok(Number(finest.toFixed(W.wavSetPrecision(plain))) === 0,
     "control: at the fixed-step precision that same detent rounds to NOTHING");
  ok(W.wavSetPrecision(W.wavPositionMeta({ display_unit: "ms" })) === 0,
     "milliseconds are written whole");
}

/* ==================================================================== zoom */
{
  ok(W.wavZoomFactor(0) === 1 && W.wavZoomFactor(8) === 256, "zoom 0..8 is 1x..256x");
  ok(W.clampWavZoom(99) === W.WAV_ZOOM_MAX && W.clampWavZoom(-1) === 0, "zoom clamps both ends");
  const mid = W.wavZoomWindow(0.5, 4, false);
  ok(near(mid.window, 1 / 16), "zoom 4 shows a sixteenth of the file");
  ok(near(mid.start + mid.span / 2, 0.5), "...centred on the marker");
  /* ⚠ At the very start the window cannot centre — it must not run negative,
   * or half the plot would be off the front of the file. */
  const atStart = W.wavZoomWindow(0, 4, false);
  ok(atStart.start === 0 && near(atStart.span, 1 / 16), "at the file start the window clamps to 0");
  const atEnd = W.wavZoomWindow(1, 4, false);
  ok(near(atEnd.end, 1), "at the file end it clamps to 1");
  ok(W.wavZoomWindow(0.5, 0, false).window === 1, "unzoomed shows the whole file");
  ok(near(W.wavZoomWindow(0.5, 0, true).window, W.WAV_SHIFT_PREVIEW_WINDOW),
     "...and Shift previews a tenth when there is no sticky zoom");
  ok(W.wavZoomWindow(0.5, 4, true).window === W.wavZoomWindow(0.5, 4, false).window,
     "control: a sticky zoom OUTRANKS the Shift preview");
  ok(W.wavZoomLabel(0) === "1x (off)", "zoom off says so rather than showing 1.0x");
}

/* ================================================================ markers */
{
  const win = W.wavZoomWindow(0.5, 4, false);       /* 0.46875 .. 0.53125 */
  ok(W.wavMarkerInWindow(0.5, win).off === 0, "the active marker is in view");
  ok(W.wavMarkerInWindow(0.1, win).off === -1, "a marker before the window reports LEFT");
  ok(W.wavMarkerInWindow(0.9, win).off === 1, "a marker after it reports RIGHT");
  ok(W.wavMarkerInWindow(0.1, win).pos === 0 && W.wavMarkerInWindow(0.9, win).pos === 1,
     "...and both clamp to an edge, so an offscreen marker still has somewhere to draw");
  const full = W.wavZoomWindow(0.5, 0, false);
  ok(near(W.wavMarkerInWindow(0.25, full).pos, 0.25), "unzoomed, position is the ratio itself");
}

/* ============================================================ view groups */
{
  const P = (key, extra) => ({ key, fullKey: "c:" + key,
    meta: W.wavPositionMeta({ key, type: "wav_position", view_group: "loop", ...extra }) });
  const params = [
    P("sample_start", { marker_label: "S" }),
    { key: "gain", meta: { type: "float" } },                       /* not a marker */
    P("loop_start", { marker_label: "L>" }),
    P("loop_end", { marker_label: "<L" }),
    P("other", { view_group: "elsewhere" }),                        /* another group */
  ];
  const g = W.wavViewGroupMembers(params, "loop");
  ok(g.length === 3, "only the markers of THIS group are members (got " + g.length + ")");
  ok(g.map((m) => m.key).join(",") === "sample_start,loop_start,loop_end",
     "...in DECLARATION order — which IS the knob assignment, so it is not cosmetic");
  ok(g[1].label === "L>", "a declared marker_label is used");
  ok(W.wavViewGroupMembers(params, "").length === 0, "no group named = no members");
  /* ⚠⚠ A member hidden by visible_if or paged elsewhere simply is not in the
   * list, and the ones that remain SHIFT DOWN A KNOB. Demonstrated, because it
   * is a real behaviour a caller has to know about. */
  const hidden = W.wavViewGroupMembers(params.filter((p) => p.key !== "loop_start"), "loop");
  ok(hidden.length === 2 && hidden[1].key === "loop_end",
     "with a member gone, the rest move UP the knob row");
}

/* ================================================================== knobs */
{
  const one = W.wavPositionMeta({ type: "wav_position", enable_zoom: true });
  const legacy = W.wavPositionMeta({ type: "wav_position" });
  const members = W.wavViewGroupMembers(
    ["a", "b"].map((k) => ({ key: k, fullKey: "c:" + k,
      meta: W.wavPositionMeta({ key: k, type: "wav_position", view_group: "g" }) })), "g");

  /* LEGACY: nothing is claimed. A module written before any of this keeps its
   * whole knob row — the roles are opt-in, not a screen-wide takeover. */
  ok(W.wavKnobRole(0, { meta: legacy }) === null && W.wavKnobRole(7, { meta: legacy }) === null,
     "legacy single marker: NO knob is claimed");

  /* SINGLE + zoom: knob 8 only. */
  ok(W.wavKnobRole(W.WAV_ZOOM_KNOB, { meta: one }).type === "zoom", "zoomable single: knob 8 zooms");
  ok(W.wavKnobRole(0, { meta: one }) === null, "...and the others are left alone");

  /* MULTI: markers, zoom, and everything else SILENT. */
  ok(W.wavKnobRole(0, { members }).type === "marker", "multi: knob 1 is the first marker");
  ok(W.wavKnobRole(1, { members }).member.key === "b", "multi: knob 2 is the second");
  ok(W.wavKnobRole(W.WAV_ZOOM_KNOB, { members }).type === "zoom", "multi: knob 8 zooms");
  ok(W.wavKnobRole(W.WAV_ZOOM_KNOB, { members }).anchor.key === "a",
     "...anchored on the FIRST member, so every marker shares one zoom");
  /* ⚠⚠ SILENT IS THE POINT. The page`s own mapping is still under these knobs;
   * an unclaimed encoder would edit some unrelated parameter of the module
   * while the user is looking at a waveform. */
  ok(W.wavKnobRole(4, { members }).type === "silent",
     "multi: an unused knob is SILENT, not left on the page`s own mapping");
}

/* =================================================================== path */
{
  const io = (files, params, metas = {}) => ({
    getParam: (k) => params[k],
    metaOf: (k) => metas[k],
    buildKey: (bare) => "comp:" + bare,
    exists: (p) => files.includes(p),
  });
  const m = W.wavPositionMeta({ type: "wav_position", filepath_param: "sample_path" });

  ok(W.resolveWavSourcePath(W.wavPositionMeta({ type: "wav_position" }), io([], {})) === "",
     "no filepath_param declared = no file (there is NO sniffing, by design)");
  ok(W.resolveWavSourcePath(m, io(["/s/kick.wav"], { "comp:sample_path": "/s/kick.wav" }))
     === "/s/kick.wav", "an absolute path that exists is used as-is");
  ok(W.resolveWavSourcePath(m, io([], { "comp:sample_path": "  \"/s/k.wav\"  " })) === "/s/k.wav",
     "quotes and whitespace are stripped off the wire value");
  ok(W.resolveWavSourcePath(m, io([], { "comp:sample_path": "file:///s/k.wav" })) === "/s/k.wav",
     "a file:// URL is stripped");
  /* A relative value is resolved against the BROWSER`S roots — that is what it
   * was picked relative to. */
  ok(W.resolveWavSourcePath(m, io(["/root/kick.wav"], { "comp:sample_path": "kick.wav" },
                                 { sample_path: { root: "/root" } })) === "/root/kick.wav",
     "a relative value resolves against the filepath param`s `root`");
  ok(W.resolveWavSourcePath(m, io(["/start/kick.wav"], { "comp:sample_path": "kick.wav" },
                                 { sample_path: { start_path: "/start", root: "/root" } }))
     === "/start/kick.wav", "...and `start_path` is tried FIRST");
  ok(W.resolveWavSourcePath(m, io([], { "comp:sample_path": "gone.wav" })) === "gone.wav",
     "an unresolvable value comes back RAW, so the screen can name what it could not find");
  /* A fully-qualified filepath_param names its own component. */
  const q = W.wavPositionMeta({ type: "wav_position", filepath_param: "other:path" });
  ok(W.resolveWavSourcePath(q, io(["/x.wav"], { "other:path": "/x.wav" })) === "/x.wav",
     "a filepath_param that already names a component is not re-scoped");
}

/* ================================================================ columns */
{
  const win = W.wavZoomWindow(0.5, 0, false);
  ok(W.wavWindowColumns([], win, 10).every((v) => v === 0), "no peaks draws a flat line, not a throw");
  const peaks = new Array(100).fill(0).map((_, i) => (i === 50 ? 1 : 0.1));
  const cols = W.wavWindowColumns(peaks, win, 10);
  /* ⚠⚠ MAX, NOT SAMPLE. A transient one sample wide must not be stepped over —
   * averaging or point-sampling makes a drum hit disappear at low zoom, which
   * is the one place you are looking for it. */
  ok(Math.max(...cols) === 1, "a one-sample transient survives being squeezed into 10 columns");
  ok(cols.filter((v) => v === 1).length === 1, "...and lands in exactly one of them");
  /* ⚠⚠ THE COLUMNS TILE. The obvious floor/ceil pair overlaps by one index at
   * every boundary, and a transient then smears across two columns — 2px wide
   * at one zoom and 1px at the next, from the same file. Every peak must belong
   * to exactly one column, at every position, not just the one this test first
   * happened to try. */
  let smeared = 0, missing = 0;
  for (let at = 0; at < 100; at++) {
    const one = new Array(100).fill(0); one[at] = 1;
    const hit = W.wavWindowColumns(one, win, 10).filter((v) => v === 1).length;
    if (hit > 1) smeared++;
    if (hit === 0) missing++;
  }
  ok(smeared === 0, "no peak lands in two columns (" + smeared + " of 100 smeared)");
  ok(missing === 0, "and none is stepped over (" + missing + " of 100 lost)");
  const zoomed = W.wavWindowColumns(peaks, W.wavZoomWindow(0.5, 4, false), 10);
  ok(Math.max(...zoomed) === 1, "control: it is still there when zoomed in on");
  ok(W.wavWindowColumns([2, -3], win, 4).every((v) => v <= 1),
     "out-of-range peaks clamp — a rogue value cannot draw outside the plot");
}

if (fail) { console.log("FAIL: " + fail + " assertion(s)"); process.exit(1); }
console.log("PASS: wav_position arithmetic (" + 0 + " failures)");
'
