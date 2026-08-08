# patches/ — the keep-list only

**The patch series was dissolved on 2026-08-08.** It existed to survive rebases onto upstream's
rewritten history; this fork no longer rebases, so there was nothing to re-apply and every patch
was a second copy of code already in `main`. See **`docs/UPSTREAM.md`** for the reasoning, the
upstream watermark, and provenance for each dissolved patch.

What is left tracks a **still-open upstream PR**, and only that:

| Patch | Upstream PR | Note |
|---|---|---|
| `fx-blocks-local.patch` | **#121** (open) | Only the **Send FX** half is upstreamable. Move FX (`MOVE_FX_BLOCKS=4`) and slot `fx3`/`fx4` in the same series are permanent fork-only and must be split out before offering. |
| `remote-ui-responsivity.patch` | **#180** (open) | Server-driven tool poll. Depends on the #148 bridge, which has **merged** upstream. |
| `remote-ui-push.patch` | **#180** (open) | 7-commit push/robustness series layered on the above. |

⚠ **These are snapshots, not the carrier.** The live branches for both PRs are in
**`legsmechanical/schwung`** (`send-fx-pr`, `fx-buses-pr`, `upstream-pr/remote-ui-v2`) — a
different fork. Push PR revisions there; these files are a backup and will go stale. The hashes
inside `fx-blocks-local.patch` already have: an upstream rebase renumbered them, so identify the
commits by **subject** (`git log --grep`), never by hash.

Retire each file when its PR merges. When the last one goes, so does this directory.

⛔ Never include `patches/` in an upstream PR.
