#!/usr/bin/env bash
# PreToolUse gate: never let a destructive git restore discard UNCOMMITTED work.
#
# WHY THIS EXISTS (Josh, 2026-08-24: "fix whatever's making you repeat those
# same errors again"). Twice in one day, mid mutation-test, a bare git discard
# threw away edits that had never been committed. There was already a memory
# saying "commit before mutation-testing"; prose did not stop it, because the
# mistake happens inside a mechanical loop where the revert LOOKS like the safe
# half of the cycle. Once was a slip; twice is a missing guard.
#
# The rule: a revert is only safe when the baseline is committed. So if the
# working tree is dirty, a discard is refused, and the refusal names the safe
# path — dbxhost/tools/mutate.sh, which enforces a clean tree up front and then
# owns the whole mutate/test/restore cycle (untracked files included, which a
# checkout cannot restore at all).
#
# Deliberately a wall, not a confirm prompt: the whole failure mode is that it
# looks fine in the moment.
set -euo pipefail

input="$(cat)"
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
[ "$tool" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cmd" ] || exit 0

# Does this command actually RUN a discard?
#
# ⚠ Matched at COMMAND POSITION, and with heredoc bodies stripped first. A plain
# substring test refused any command that merely MENTIONED these verbs — it
# blocked the very commit that added this file, because the message described
# them. The parsing below is the difference between a guard you keep and one you
# switch off.
verdict=$(printf '%s' "$cmd" | python3 -c '
import re, sys
cmd = sys.stdin.read()

# Drop heredoc bodies: commit messages, file contents, test fixtures. Anything
# in them is data, not a command.
def strip_heredocs(s):
    out, i = [], 0
    for m in re.finditer(r"<<-?\s*[\x27\"]?([A-Za-z_][A-Za-z0-9_]*)[\x27\"]?", s):
        tag = m.group(1)
        end = re.search(r"^\s*%s\s*$" % re.escape(tag), s[m.end():], re.M)
        if not end:
            continue
        out.append((m.end(), m.end() + end.start()))
    for a, b in reversed(out):
        s = s[:a] + s[b:]
    return s

c = strip_heredocs(cmd)
# ...and single/double quoted strings, for the same reason.
c = re.sub(r"\x27[^\x27]*\x27", " ", c)
c = re.sub(r"\"[^\"]*\"", " ", c)

# A command position: start, or after a separator.
CMDPOS = r"(?:^|[;&|\n(]|&&|\|\|)\s*"
pats = [
    CMDPOS + r"git\s+checkout\s+(?:-f\b|--\s|\.\s*$|\.\s*[;&|])",
    CMDPOS + r"git\s+restore\s+(?!.*--staged)",
    CMDPOS + r"git\s+clean\s+(?!.*(?:-n\b|--dry-run))",
    CMDPOS + r"git\s+stash\s+(?:push|save|-u|--include-untracked|$|[^ap])",
]
sys.stdout.write("1" if any(re.search(p, c) for p in pats) else "0")
' 2>/dev/null || printf '0')
[ "$verdict" = "1" ] || exit 0

# Which repo? Prefer an explicit `cd <path> &&` in the command, else the cwd.
target="$cwd"
if [[ "$cmd" =~ cd[[:space:]]+\"?([^\"\&\;]+)\"?[[:space:]]*\&\& ]]; then
  cand="${BASH_REMATCH[1]}"
  cand="${cand%\"}"; cand="${cand#\"}"; cand="${cand%/}"
  [ -d "$cand" ] && target="$cand"
fi
[ -d "$target" ] || exit 0
git -C "$target" rev-parse --git-dir >/dev/null 2>&1 || exit 0

dirty=$(git -C "$target" status --porcelain 2>/dev/null | head -20)
[ -n "$dirty" ] || exit 0     # clean tree: nothing to lose, let it through

reason="REFUSED — this discards UNCOMMITTED work.

Dirty in $target:
$dirty

You have lost work this way twice in one day, both times mid mutation-test. A
revert is only safe once the baseline is COMMITTED.

  - Mutation-testing? Commit first, then use dbxhost/tools/mutate.sh — it
    refuses a dirty tree and owns the whole mutate -> test -> restore cycle,
    untracked files included (a checkout cannot restore those at all, which is
    how a mutated new file once survived a 'restore' and made the next run
    report a meaningless pass).
  - Genuinely want these changes gone? Commit them on a scratch branch first,
    or remove the lines directly (python/sed) so nothing else is caught."

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
exit 0
