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

binding=src/shadow/shadow_ui_param_pages.mjs
bundler=davebox/scripts/bundle_ui.sh
adapter=davebox/ui/pp_ctx.mjs
for f in "$binding" "$bundler" "$adapter"; do [ -f "$f" ] || fail "$f missing"; done

# --- 1. davebox OWNS THE COPY: COMMITTED, AND NEVER HAND-EDITED ------------
#
# Josh, 2026-08-31: "i want davebox module editing to be something it owns so
# that future upstream updates don't break things. but i also want to be able to
# easily pull any module editor updates into davebox if they're desirable."
#
# Those pull opposite ways. The copy is COMMITTED so an upstream rework cannot
# change davebox's editor underneath it — regenerating at build time would have
# been the same code with no diff, no review and no way to decline. And it is
# never hand-edited, because the instant it is, "davebox's module editor IS
# stock's module editor" stops being true, nothing reconciles it again, and
# pulling a future update turns from a copy into a merge.
vendor=davebox/ui/vendor/shadow_ui_param_pages.mjs
stamp=davebox/ui/vendor/VENDORED
[ -f "$vendor" ] || fail "$vendor missing — it is a COMMITTED copy of $binding"
git ls-files --error-unmatch "$vendor" >/dev/null 2>&1 ||
  fail "$vendor is NOT COMMITTED. davebox must own this copy: an uncommitted or
generated one changes with the host, which is what 'updates don't break things'
forbids."
[ -f "$stamp" ] || fail "$stamp missing — the copy has no recorded provenance,
so nothing can tell whether it is the host's file or something someone edited"

# Hand-edit detector. The stamp records the sha256 of the SOURCE the copy was
# taken from; the copy is that file plus a 4-line header. Compare bodies.
want=$(grep '^sha256:' "$stamp" | awk '{print $2}')
# ⚠ STRIP THE HEADER BY ITS SHAPE, NOT BY A LINE COUNT. It was `tail -n +5`,
# which silently became wrong the moment the header gained two lines — and a
# body hash computed from the wrong offset reports a HAND-EDIT that never
# happened, which is a check crying wolf about its own arithmetic.
# ⚠ Match the header's CLOSING LINE by the `*/` it contains, not by `^ */`:
# that line reads " * Edit davebox/ui/pp_ctx.mjs instead. */", so an anchored
# pattern never matched, sed's unmatched end address deleted to EOF, and the
# check reported a HAND-EDIT that never happened. A pin crying wolf about its
# own arithmetic is worse than no pin.
got=$(sed '1,/\*\//d' "$vendor" | shasum -a 256 | cut -d' ' -f1)
[ -n "$want" ] || fail "$stamp records no sha256"
[ "$want" = "$got" ] ||
  fail "$vendor does not match the source it records in $stamp.
Either it was HAND-EDITED — which it must never be; davebox's half of the seam
is ui/pp_ctx.mjs — or the header shape changed and this check needs updating.
  recorded: $want
  actual:   $got"
ok "the vendored binding is committed, and byte-identical to its recorded source"

# ⭐⭐ ...AND IN SYNC WITH THE HOST'S CURRENT FILE. The check above only proves
# the copy has not been hand-edited; it compares against the sha the stamp
# recorded AT VENDORING TIME, so the host's file could move underneath it and
# every test would stay green while "davebox's editor IS the host's editor"
# quietly became false.
#
# ⚠⚠ THAT IS INTRA-REPO VERSION SKEW, in a repo whose founding rule is ONE
# deliverable, ONE version — the rule P2/P4b spent two phases and 378 deleted
# capability probes enforcing. A frozen copy inside a single repo manufactures
# exactly the skew that model exists to abolish, and a stamp-only check
# certifies it as healthy. So SYNC IS THE DEFAULT STATE and divergence must be
# deliberate, dated and visible — the inverse of a stamp you can forget.
host_now=$(shasum -a 256 "$binding" | cut -d' ' -f1)
if [ "$want" != "$host_now" ]; then
  if [ -f davebox/ui/vendor/DIVERGED ]; then
    ok "vendor is behind the host's binding, and davebox/ui/vendor/DIVERGED says why (deliberate)"
  else
    fail "the host's binding has MOVED and davebox is still running the old one.
  vendored: $want
  host now: $host_now
davebox's module editor is no longer the host's — silently, with every test
green. Re-vendor:
  copy $binding over the body of $vendor (keeping its header comment); refresh
  davebox/ui/vendor/VENDORED's sha256 from $binding, review the diff, commit.
If the divergence is DELIBERATE, write davebox/ui/vendor/DIVERGED saying what
davebox needs that the host's current binding does not do, and dated."
  fi
fi

# ⭑ AND THAT IS THE WHOLE UPDATE STORY. Taking a future upstream change is
# `cp src/shadow/shadow_ui_param_pages.mjs` over the copy, refresh VENDORED,
# review the diff, commit — no machinery, because the copy being VERBATIM is
# what keeps it that cheap. There is deliberately no update script yet
# (Josh, 2026-08-31: "i don't need a script for all that now... i just want to
# make sure our architecture makes it possible to do it without major surgery
# if we choose to"). This check is what protects that option: the day the copy
# is hand-edited, updating stops being a copy and becomes a merge.

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
[ -n "$members" ] || fail "read no ctx members out of $binding — the binding's
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

echo "PASS: davebox runs the host's own param-pages binding, and the seam is honest"
