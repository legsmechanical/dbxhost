# Upstream

How this fork stays aware of `charlesvestal/schwung` now that it no longer rebases onto it.

`upstream` is **fetch-only**. This fork does not replay its history onto upstream's; it reviews
upstream's new commits, takes what is worth taking, and records the decision here. That is the
whole discipline — a **watermark** plus a short table, replacing the 11-patch series and its
368-line README that used to be the mechanism.

## Watermark

| | |
|---|---|
| **Last upstream commit reviewed** | `120ba662` — *docs: point README and MODULES.md at the provenance policy (#196)*, 2026-08-04 |
| **Reviewed on** | 2026-08-08 |
| **Merge base** | `a46f32b2` — *Merge pull request #179: bump host to 0.11.6*, 2026-07-19 |

To advance it:

```sh
git fetch upstream
git log --oneline HEAD..upstream/main                       # what is new
git diff --stat HEAD...upstream/main -- src/ schwung-manager/   # what of it is CODE
```

Then take what applies (cherry-pick or hand-apply), add rows below, and move the watermark.
Docs/catalog-only commits need no action beyond the watermark move — say so in the table rather
than leaving them unlisted, so "not applied" is never ambiguous with "not looked at".

### Reviewed since the merge base

| Upstream | What | Decision |
|---|---|---|
| `b8ea14c3`, `c4f2e4e5`, `c4e57d24`, `83ecdbf0` | Catalog additions (Forge, Noisemaker, Work/Work In/Overwork, Beat Bank/Groove Bank) | **Skipped** — catalog only. This fork's catalog is not user-facing; see the note below. |
| `82cc1dac`, `120ba662` | Contribution-provenance policy docs | **Skipped** — upstream project governance, no code. |

Those 10 commits touch **no** `src/` or `schwung-manager/` file, so nothing was owed.

> ⚠ The module catalog is fetched from **upstream's** `module-catalog.json` at a hardcoded URL, so
> catalog edits made in this fork do nothing. Shipping a module means a public repo, a release, and
> an upstream PR — not a commit here.

## Keep-list — paths this fork owns

Divergence is concentrated, and these are the files where an upstream change is most likely to
collide and most deserving of a careful read before taking:

| Path | Δ vs upstream | Why it diverges |
|---|---|---|
| `src/shadow/shadow_ui.js` | ~3.1k lines | Canvas click/back, edit-CC claims, Module Level row, Send/Move FX pickers, optional-readback normalization |
| `src/schwung_shim.c` | ~1.3k | Module-level render paths, edit-CC forwarding, `claims_edit_ccs`, remote-UI push |
| `src/host/shadow_chain_mgmt.c` + `.h` | ~890 | 4 FX blocks per slot, Send FX buses |
| `src/modules/chain/dsp/chain_patch.c`, `chain_host.c` | ~750 | fx3/fx4 routing and patch parse |
| `src/shadow/shadow_ui.c`, `src/host/shadow_constants.h` | ~570 | Fork-only JS bindings, SHM struct fields |
| `standalone/`, `davebox/` | all of it | Fork-only by construction — no upstream counterpart exists |

## Still worth offering upstream

Not a carrying obligation — just the list of changes written generically enough to land upstream,
so the option stays visible.

| Change | In this tree | Upstream status |
|---|---|---|
| Send FX buses + generic FX-bus picker | `0d6402b6` (the Send FX half only) | **PR #121 OPEN**, parked on review time |
| Remote UI v2 — off-thread snapshots, lossless edits, server push | `c29abdf7` + the 7-commit push series | **PR #180 OPEN** |
| Let a canvas claim the jog click (`canvas_takes_click`) | `0bea22ad` | Not submitted |
| Contextual Back in a canvas UI (`handleBack` + Shift+Back failsafe) | `2bad2ea5` | Not submitted |
| Let a module claim Undo/Copy/Delete (`claims_edit_ccs`) + its tests | `883b5f1e`, `df03a19c` | Not submitted. Supersedes upstream #154, which #175 reverted |
| Treat an empty param readback as absent, not as a value | `16368a97` | Not submitted |
| Text-entry function keys no longer overlap the last characters | `02e5ac2d` | Not submitted |

⚠ **Identify these by SUBJECT, not by hash.** Upstream rewrites history on every release, and this
fork has been renumbered by it before — a stale hash reads as "the work is missing" when it is
present and running. Re-find with `git log --grep` on the subject.

**PR branches live in `legsmechanical/schwung`, not here** (`send-fx-pr`, `fx-buses-pr`,
`upstream-pr/remote-ui-v2`). That fork is where PRs against upstream are staged; this one is the
davebox host. Do not look for them on `origin`.

Permanently fork-only, for contrast — never offer these: `MOVE_FX_BLOCKS = 4` and slot `fx3`/`fx4`
(upstream is deliberately 2), the Module Level series' shim half (`c88d6976` — `synth_volume` has
nothing to attach to upstream), and everything under `standalone/` and `davebox/`.

## Why `patches/` is nearly gone

The series was a rebase-survival tool. Every patch in it was a `format-patch` snapshot of a commit
already in this fork's `main`, re-applied by hand after each rebase onto upstream's rewritten
history — and re-applying was the *only* reason the snapshots existed.

This fork stopped rebasing. Slimming the host to what davebox needs means deletions, and deletions
conflict with everything, forever; the merge that brought davebox in-tree settled it. Without a
rebase there is nothing to re-apply, so the patches became a third copy of code that already lives
in `main` (verified: all 11 were fully present in the working tree when they were removed) and, for
the two upstreamable ones, on a PR branch as well. Three copies of the same change is not
redundancy, it is three things to keep in sync — and the README had already drifted, carrying stale
hashes and omitting two of its own patch files entirely.

What the patches genuinely recorded — provenance, upstream intent, expected conflicts — is above.
The code itself is where it always was: in `main`.

**Three survive**, and only because they track a still-open PR: `fx-blocks-local.patch` (#121) and
`remote-ui-responsivity.patch` + `remote-ui-push.patch` (#180). They are backups, not the carrier —
the live PR branches are in `legsmechanical/schwung`. Retire each when its PR merges; see
`patches/README.md`.

⚠ The plan for this phase said to keep the "#148 series". **#148 has merged** — the still-open PR
carrying that work is **#180**, so the bridge patch (`remote-ui-overtake-tools.patch`) was dissolved
and its two follow-ups kept instead.

Dissolved 2026-08-08 (P1). To recover one, find the removing commit with
`git log --diff-filter=D --oneline -- patches/` and read the file out of its parent
(`git show <sha>~1:patches/<name>.patch`) — or just regenerate it with `git format-patch -1 <sha>`
from the table above.
