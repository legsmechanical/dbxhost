#!/usr/bin/env bash
# Every consumer that DRAWS a sample must register the wave-peaks file IO.
#
# ⚠⚠ THE FAILURE THIS PINS IS SILENT AND LOOKS LIKE DATA. wav_peaks.mjs reads
# through an injected io and has none by default: with no io, fileSignature()
# returns null, wavPeaksTick caches the path as `missing:<path>` with the error
# "file not found", and the widget draws an empty box. A sample whose IO is
# missing is indistinguishable, on screen and in the cache, from a sample whose
# FILE is missing. dAVEBOx shipped that way (found 2026-09-06, reported from the
# device as "no waveforms on the widgets") because only the host's entry point
# ever imported wav_io_qjs.mjs.
#
# It also pins the property that keeps the registration SEPARATE: wav_io_qjs
# names the QuickJS `std` and `os` modules, so it may only be imported from a
# device-only ENTRY POINT. Importing it from a ui_*.mjs / shared module would
# make the renderer unloadable under node, where every host test runs.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
ok() { if [ "$1" = "y" ]; then echo "  ok   — $2"; else echo "FAIL  — $2"; fail=$((fail+1)); fi; }

IO=src/shared/param_pages/wav_io_qjs.mjs
[ -f "$IO" ] || { echo "FAIL: $IO is missing"; exit 1; }

# ---- control: the io really is injected, and defaults to nothing ------------
grep -q 'let IO = null;' src/shared/param_pages/wav_peaks.mjs \
  && ok y "control: wav_peaks starts with NO io — registration is not optional" \
  || ok n "control: wav_peaks no longer defaults its io to null; re-read this test"
grep -q 'setWavPeaksIO' "$IO" \
  && ok y "control: wav_io_qjs is what registers it" \
  || ok n "control: wav_io_qjs does not call setWavPeaksIO"

# ---- both entry points import it -------------------------------------------
for entry in src/shadow/shadow_ui.js davebox/ui/ui.js; do
  # ⚠ EITHER FORM COUNTS. A bare side-effect import registers through the io
  # module's own relative `./wav_peaks.mjs`; a NAMED import (`{ WAV_QJS_IO }`)
  # lets the entry point register it explicitly, into the instance its own
  # consumers use. The second exists because the first proved not to be enough:
  # on a device carrying two installs the two resolved to different module
  # instances, and every sample cell drew flat while the pump reported success.
  # Requiring only the bare form would fail a tree that fixed exactly that.
  if grep -qE "^import +('|\{ *WAV_QJS_IO *\} +from +')/data/UserData/schwung/shared/param_pages/wav_io_qjs\.mjs';" "$entry"; then
    ok y "$entry registers the wave-peaks io"
  else
    ok n "$entry does NOT import wav_io_qjs — its sample widgets will draw empty boxes"
  fi
done

# ---- and nothing else does -------------------------------------------------
# `std`/`os` are QuickJS modules. An import from anywhere a test can reach takes
# the suite down at BUNDLE time, i.e. all at once rather than one test.
# ⚠ IMPORT STATEMENTS ONLY. Four files mention the name in a COMMENT, and a
# name-grep would report them as importers — the "a commented-out call still
# matches the grep" shape.
# ⚠ SOURCE ONLY. `davebox/dist/` is BUILD OUTPUT and carries the entry point's
# own import verbatim — counting it makes this check fire on a tree that is
# simply built, which is a check that cries wolf.
others=$(grep -rn "^ *import .*wav_io_qjs" src davebox/ui davebox/tests --include='*.mjs' --include='*.js' 2>/dev/null \
         | grep -v -e '^src/shadow/shadow_ui.js:' \
                   -e '^davebox/ui/ui.js:' || true)
if [ -z "$others" ]; then
  ok y "no other file imports it — it stays out of every node-loadable path"
else
  echo "$others"
  ok n "wav_io_qjs is referenced outside the two entry points (above)"
fi

# ---- the test bundler can survive it if that ever changes -------------------
grep -q "filter: /\^os\$/" davebox/tests/js/build.mjs \
  && ok y "the JS test bundler stubs \`os\` as well as \`std\`" \
  || ok n "the JS test bundler has no \`os\` stub — one import would break the whole suite"

[ "$fail" = 0 ] || { echo "FAIL: $fail assertion(s)"; exit 1; }
echo "PASS: the wave-peaks io is registered by every entry point that draws samples"
