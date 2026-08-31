#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# davebox runs the HOST'S param-pages binding, vendored into its bundle at build
# time (davebox/scripts/bundle_ui.sh), so that "the module editor is no different
# from stock's" is true by construction rather than by resemblance.
#
# That only holds while three things stay true. This pins all three, and it
# DERIVES what it checks from the binding's own code — nothing here restates a
# list of members, because a hand-written list is the thing that goes stale.

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok   — $*"; }

# ⚠⚠ Comments stripped before any "does this code reference X" scan. A member
# named only in a comment is not a dependency, and a commented-out call is not a
# call — both directions of that mistake were made in this repo on 2026-08-31
# (see test_kit_layout_split.sh).
nocomments() {
  awk '
    { line = "" ; i = 1
      while (i <= length($0)) {
        c = substr($0, i, 2)
        if (inblk) { if (c == "*/") { inblk = 0; i += 2 } else i++ ; continue }
        if (c == "/*") { inblk = 1; i += 2; continue }
        if (c == "//") break
        line = line substr($0, i, 1); i++
      }
      print line }'
}

bundler=davebox/scripts/bundle_ui.sh
adapter=davebox/ui/pp_ctx.mjs
ctxsrc=src/shadow/shadow_ui_param_pages.mjs
for f in "$bundler" "$adapter"; do [ -f "$f" ] || fail "$f missing"; done

# --- 1. THE EDITOR IS ONE FILE WITH TWO INSTANCES, NOT TWO FILES -------------
#
# ⭐ davebox and the shadow UI run the SAME editor. Not a copy kept in step by a
# hash, which is what this was until 2026-08-31 — a frozen vendored copy plus a
# stamp, a hand-edit detector and a skew check, machinery whose entire job was
# to simulate being the same file inside a repo that is ONE deliverable.
#
# What replaced it: shared/param_pages/binding_movy.mjs is a FACTORY, and each
# consumer creates its own instance over its own host context.
binding=src/shared/param_pages/binding_movy.mjs
[ -f "$binding" ] || fail "$binding missing — the shared editor factory is gone"
grep -q "^export function createParamPagesBinding" "$binding" ||
  fail "$binding no longer exports createParamPagesBinding"
ok "the editor is a factory in shared/, importable by host and module alike"

# ⚠⚠ AND IT MUST HOLD NO MODULE-LEVEL MUTABLE STATE. That is the whole reason it
# is a factory: the binding used to keep fourteen `let`s closed over ONE host
# ctx, so it had exactly one consumer by construction. param_pages/README.md
# rule 4 says it outright — "No module-level state — a tool has four tracks x
# five components live at once" — and the binding was the one piece of the
# library breaking its own contract. A single `let` back at module scope and the
# two consumers silently share a controller again.
# ⚠ MEASURED ON THE REGION ABOVE THE FACTORY, not by indentation. The factory's
# body is deliberately left at its original indentation so it stays a clean diff
# against upstream's file — so `^let` matches INSIDE it too, and an
# indentation-based check fails the correct tree. (It did, first run.)
leaked=$(nocomments < "$binding" | sed -n '1,/^export function createParamPagesBinding/p' \
         | grep -nE "^let |^var " || true)
if [ -n "$leaked" ]; then
  echo "$leaked" >&2
  fail "$binding has module-level mutable state (above). It is a FACTORY: that
state belongs inside createParamPagesBinding, or the shadow UI and davebox share
one controller and fight over it."
fi
ok "the factory leaks no module-level state — each consumer gets its own"

# Both consumers create their own, and neither reaches for the other's.
host_shim=src/shadow/shadow_ui_param_pages.mjs
[ -f "$host_shim" ] || fail "$host_shim missing — the shadow UI's instance is gone"
grep -q "createParamPagesBinding(ctx)" <<<"$(nocomments < "$host_shim")" ||
  fail "$host_shim no longer creates the shadow UI's own instance"
grep -q "createParamPagesBinding(" <<<"$(nocomments < davebox/ui/ui_sound.mjs)" ||
  fail "davebox no longer creates its own instance of the editor"
ok "host and davebox each create their own instance of the one editor"

# --- 2. NOTHING IMPORTS OUT OF THE shadow/ TREE AT RUNTIME ------------------
#
# 🔴 RED LINE. The module loader rewrites ONLY the shared/ prefix
# (SHARED_IMPORT_CANONICAL, src/shadow/shadow_ui.c), so a `shadow/` import
# resolves into the STOCK tree and executes code a stock update can replace
# underneath us — the 2026-08-30 chain-DSP incident. It would also hand davebox
# the same module INSTANCE the host already imported, sharing its singleton
# controller and host-wired ctx.
if grep -rn "UserData/schwung/shadow" davebox/ui/*.mjs davebox/ui/*.js 2>/dev/null | nocomments | grep -q .; then
  grep -rn "UserData/schwung/shadow" davebox/ui/*.mjs davebox/ui/*.js >&2
  fail "davebox imports out of the shadow/ tree at runtime — see above"
fi
ok "no davebox source imports the shadow/ tree at runtime"

# --- 3. THE ADAPTER ANSWERS EVERY ctx MEMBER THE BINDING READS -------------
#
# Derived from the binding's code. Most reads are `typeof === 'function'`
# guarded, so a member this file forgets is a SILENT loss of behaviour — the
# editor quietly stops offering something stock offers — which is exactly the
# failure "no different from stock" cannot tolerate.
# ⚠ IMPORT LINES DROPPED FIRST. The binding imports './shadow_ui_ctx.mjs', and
# `ctx.mjs` matches the member pattern — a phantom member called "mjs" that no
# adapter can ever answer. A scan that reports a member which cannot exist
# teaches the reader to ignore its output.
members=$(nocomments < "$binding" | grep -v "^\s*import\|from ['\"]" \
          | grep -oE "ctx\.[A-Za-z_][A-Za-z0-9_]*" | sed 's/^ctx\.//' | sort -u)
[ -n "$members" ] || fail "read no ctx members out of $binding — the factory's
shape changed and this check is now blind"

# The adapter declares its contract as DATA — PP_CTX_MEMBERS (answered) and
# PP_CTX_ABSENT (deliberately not answered, BECAUSE THE HOST OMITS THEM TOO) —
# so this reads arrays, never prose.
# ⚠ A comment claiming a member is handled is not a member being handled; this
# repo has twice shipped a pin that passed by matching prose.
arrays=$(nocomments < "$adapter" \
         | sed -n '/PP_CTX_MEMBERS *= *\[/,/\]/p;/PP_CTX_ABSENT *= *\[/,/\]/p' \
         | grep -oE "'[A-Za-z_][A-Za-z0-9_]*'" | tr -d "'" | sort -u)
[ -n "$arrays" ] || fail "$adapter declares no PP_CTX_MEMBERS / PP_CTX_ABSENT —
the contract stopped being machine-readable and this check is now blind"

missing=""
for m in $members; do
  grep -qx "$m" <<<"$arrays" || missing="$missing $m"
done
if [ -n "$missing" ]; then
  fail "the binding reads ctx member(s) the adapter neither answers nor names as
a gap:$missing
Add each to PP_CTX_MEMBERS (if ui_sound installs it) or PP_CTX_ABSENT (with the
reason, which must be that the HOST omits it too — see shadow_ui.js).
⚠ These reads are mostly \`typeof === 'function'\` guarded, so the editor will
NOT error — it will silently drop whatever that member does, and the drop will
look like a design choice."
fi

# ...and nothing declared that the binding does not actually read, which is how
# a contract rots into a list of things someone once thought were needed.
stale=""
for a in $arrays; do
  grep -qx "$a" <<<"$members" || stale="$stale $a"
done
[ -z "$stale" ] || fail "$adapter declares member(s) the binding never reads:$stale"

ok "the adapter accounts for all $(wc -w <<<"$members" | tr -d ' ') ctx members ($(wc -w <<<"$(nocomments < "$adapter" | sed -n '/PP_CTX_ABSENT *= *\[/,/\]/p' | grep -oE "'[A-Za-z_][A-Za-z0-9_]*'" | tr -d "'")" | tr -d ' ') deliberately absent, as on the host)"

# --- 4. THE DECLARED CONTRACT MATCHES WHAT IS ACTUALLY INSTALLED -----------
#
# PP_CTX_MEMBERS/PP_CTX_ABSENT are only worth checking against the binding if they
# also describe reality. Without this, the arrays are a WISH: a member could be
# listed as answered while ui_sound installs nothing, and the binding's
# `typeof === 'function'` guard would swallow it silently — a behaviour missing
# from the editor with a test cheerfully reporting the contract is complete.
wiring=davebox/ui/ui_sound.mjs
[ -f "$wiring" ] || fail "$wiring missing"
install=$(nocomments < "$wiring" | awk '/installPpCtx\(\{/,/^\}\);/')
[ -n "$install" ] || fail "$wiring no longer calls installPpCtx({...}) — the
editor has no host context at all, so every guarded read silently falls back"
installed=$(grep -oE "^\s+[A-Za-z_][A-Za-z0-9_]*:" <<<"$install" | tr -d ' :' | sort -u)

declared=$(nocomments < "$adapter" | sed -n '/PP_CTX_MEMBERS *= *\[/,/\]/p' \
           | grep -oE "'[A-Za-z_][A-Za-z0-9_]*'" | tr -d "'" | sort -u)

for m in $declared; do
  grep -qx "$m" <<<"$installed" ||
    fail "PP_CTX_MEMBERS claims '$m' is answered, but $wiring never installs it.
The binding's read is guarded, so the editor will NOT error — it will quietly
drop whatever '$m' does. Either install it, or move it to PP_CTX_ABSENT."
done

gaps=$(nocomments < "$adapter" | sed -n '/PP_CTX_ABSENT *= *\[/,/\]/p' \
       | grep -oE "'[A-Za-z_][A-Za-z0-9_]*'" | tr -d "'" | sort -u)
for g in $gaps; do
  grep -qx "$g" <<<"$installed" &&
    fail "'$g' is listed in PP_CTX_ABSENT but $wiring DOES install it. Either the
list is stale, or davebox has started supplying something the HOST does not —
which makes its editor differ from stock's, in the nicer direction but still a
difference. Check shadow_ui.js before adding it."
done
ok "everything declared answered is installed, and every gap really is one"

# --- 5. davebox ANSWERS EXACTLY WHAT THE HOST ANSWERS -----------------------
#
# ⭐⭐ THIS IS THE CHECK THAT MAKES "no different from stock" MECHANICAL rather
# than a claim in a commit message. For every ctx member the binding reads, the
# question is not "did davebox implement it" but "does davebox's answer MATCH
# THE HOST'S" — and both directions are failures:
#
#   host supplies it, davebox does not  ->  the editor silently drops a
#       behaviour stock has (the reads are `typeof`-guarded, so no error)
#   host omits it, davebox supplies it  ->  davebox's editor is BETTER than
#       stock's, which is still a difference and still a surprise
#
# The host's own answer is DERIVED from shadow_ui.js, never restated here, so
# the day the host grows or drops one this fails instead of drifting.
host=src/shadow/shadow_ui.js
[ -f "$host" ] || fail "$host missing"
host_src=$(nocomments < "$host")

for m in $members; do
  if grep -qE "_ctx\.$m *=|Object\.defineProperty\(_ctx, *'$m'" <<<"$host_src"; then
    grep -qx "$m" <<<"$declared" ||
      fail "the HOST supplies ctx.$m but davebox lists it as absent. Stock's
editor has that behaviour and davebox's would not — and the binding's read is
guarded, so it fails silently rather than loudly. Implement it in $wiring and
move it to PP_CTX_MEMBERS."
  else
    grep -qx "$m" <<<"$gaps" ||
      fail "davebox supplies ctx.$m but this host does not — the two have drifted.
⭐ THE REMEDY IS USUALLY TO GROW THE HOST, NOT TO DROP IT FROM davebox.
dbxhost is davebox's own host, maintained on a separate track precisely to serve
what davebox needs (workspace CLAUDE.md: \"there is no conceptual separation
between what davebox needs and what the host can provide. What we need the host
to do, we change\"). So supply it in shadow_ui.js's ctx block IN THE SAME COMMIT
and this check passes from the other side.
⚠ What this check exists to stop is ACCIDENTAL divergence — the two halves of one
deliverable disagreeing without anyone deciding. It is not a rule that davebox
may never exceed upstream."
  fi
done
ok "davebox answers exactly the members the host answers, and omits exactly the ones it omits"

echo "PASS: one editor, two instances, and the seam is honest"
