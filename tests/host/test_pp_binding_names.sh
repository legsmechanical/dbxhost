#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../.."

# Every editor function davebox CALLS must be destructured from the factory, and
# must actually exist on it.
#
# ⚠⚠ THE BUG THIS EXISTS FOR, and Josh found it on hardware. `ppHasLayer()`
# called `paramPagesPickerOpen()`, which was never destructured — so the call
# threw ReferenceError, the Back branch was skipped, and davebox's own Back ran
# and left the module editor. The symptom was "back after entering a module edit
# page menu still exits the module editor": no error on screen, nothing in the
# suite, because a throw inside the input path is swallowed.
#
# ⚠ HOW IT GOT THERE, which is the more useful half: two edits added names to
# that destructure with a string replace whose target had stopped existing after
# an unrelated revert. A replace that matches nothing is a SILENT no-op — it
# reports success and changes nothing. Reading the file back would have caught
# it; a test that reads the file back catches it every time.

fail=0
ok()  { echo "  ok   — $1"; }
bad() { echo "  FAIL — $1"; fail=1; }

sound=davebox/ui/ui_sound.mjs
binding=src/shared/param_pages/binding_movy.mjs
for f in "$sound" "$binding"; do [ -f "$f" ] || { echo "FAIL: $f missing"; exit 1; }; done

nocomments() {
  awk '{ line=""; i=1
    while (i <= length($0)) { c=substr($0,i,2)
      if (inblk) { if (c=="*/") { inblk=0; i+=2 } else i++; continue }
      if (c=="/*") { inblk=1; i+=2; continue }
      if (c=="//") break
      line=line substr($0,i,1); i++ }
    print line }'
}

src=$(nocomments < "$sound")
destructured=$(sed -n '/= createParamPagesBinding(/,/} = PP;/p' "$sound" \
               | tr ',{}' '\n\n\n' | grep -oE "[A-Za-z_][A-Za-z0-9_]*" \
               | grep -vE "^(const|PP|createParamPagesBinding|ppCtx)$" | sort -u)
[ -n "$destructured" ] || bad "read no destructured names — the binding call was restructured"

# Names that can only come from the editor factory.
used=$(grep -oE "\b(paramPages[A-Za-z]*|enterParamPages|exitParamPages|tickParamPages|drawParamPages|handleParamPagesMidi|clearParamPagesTouch|currentParamPage)\b" <<<"$src" | sort -u)
[ -n "$used" ] || bad "read no editor calls out of $sound"

missing=""
for u in $used; do grep -qx "$u" <<<"$destructured" || missing="$missing $u"; done
[ -z "$missing" ] && ok "every editor function davebox calls is destructured" \
  || bad "called but NOT destructured:$missing
Each is a ReferenceError at the moment the user presses something, swallowed by
the input path — no error on screen, nothing in this suite. Add it to the
destructure in $sound."

# ...and each destructured name must be something the factory really returns,
# or the destructure yields undefined and the call throws just the same.
returned=$(awk '/^    return \{/,/^    \};/' "$binding" | tr ',' '\n' \
           | grep -oE "[A-Za-z_][A-Za-z0-9_]*" | sort -u)
[ -n "$returned" ] || bad "read no exports out of the factory in $binding"
absent=""
for d in $destructured; do grep -qx "$d" <<<"$returned" || absent="$absent $d"; done
[ -z "$absent" ] && ok "every destructured name is returned by the factory" \
  || bad "destructured but NOT returned by the factory:$absent"

# --- and every pp* helper davebox calls must EXIST ---------------------------
#
# ⚠⚠ THE SAME BUG, ONE LAYER DOWN. Minutes after fixing two missing destructured
# names I called ppRefreshPresets(), which an unrelated revert had deleted — a
# ReferenceError on a menu row, swallowed exactly the same way. `node --check`
# cannot see it: an undefined function is valid syntax until it runs.
pp_called=$(grep -oE "\bpp[A-Z][A-Za-z0-9_]*\(" <<<"$src" | tr -d '(' | sort -u)
pp_defined=$(grep -oE "^(function|const|let|var) +pp[A-Z][A-Za-z0-9_]*" <<<"$src" \
             | awk '{print $2}' | sort -u)
undef=""
for c in $pp_called; do
  grep -qx "$c" <<<"$pp_defined" && continue
  grep -qx "$c" <<<"$destructured" && continue
  undef="$undef $c"
done
[ -z "$undef" ] && ok "every pp* helper davebox calls is defined or destructured" \
  || bad "called but NEVER DEFINED:$undef
A ReferenceError the moment that row or gesture is used, swallowed by the input
path. node --check cannot see it — an undefined call is valid syntax."

[ "$fail" = 0 ] && echo "PASS: davebox and the editor factory agree on names" || echo "FAIL"
exit $fail
