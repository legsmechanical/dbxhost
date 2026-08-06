# Set pages — can it be reworked to avoid the data-loss appearance?

> 2026-08-04. Investigation only — nothing implemented. Follows the workspace direction in
> [`DBSA_SET_MODEL.md`](DBSA_SET_MODEL.md) §0b.
> Citations are `file:line` against `schwungbox-host` `4673d445` / `schwung-davebox` `c34c07e`.

**Verdict: yes — do H1 + H2 as one change, applied in the shim entrypoint while Move is dead.**

---

## 🚨 URGENT AND INDEPENDENT: davebox destroys its own data for stashed sets

**Confirmed in code, not theoretical.** `prune_orphan_states`
(`davebox/dsp/setparam/sp_globals_state.c:52-79`, fired every launch from `ui/ui_tick.mjs:1841`)
walks `set_state/<uuid>`, `stat()`s `/data/UserData/UserLibrary/Sets/<uuid>`, and if it is **absent**
deletes that set's `seq8-state.json`, `seq8-ui-state.json`, **every snapshot**, then `rmdir`s the
folder.

Set pages *physically renames* stashed sets out of `Sets/`. So **opening davebox while on page 1
permanently deletes davebox's sequencer data for every set on pages 2-8.** Patterns and snapshots —
real musical work.

✅ **Not currently firing on Josh's device**: there is no `/data/UserData/schwung/set_pages`
directory, i.e. set pages has never been used. But it is armed, and the first page switch made while
davebox is installed triggers it.

⚠ **Fix this BEFORE any set-pages work, and independently of it.** The prune must treat a set as
alive if it exists in `Sets/` **or** in any stash (`set_pages/page_*/<uuid>`, plus whatever layout
the rework lands on). Everything else here can wait; this cannot.

---

## 1. What happens today, and every interruption window

Trigger: Shift+Vol+Left/Right (`host/src/schwung_shim.c:7144-7151`) → `shadow_change_set_page()`
(`host/src/host/shadow_set_pages.c:933`), which updates the page **in memory only** (:950) and spawns
a detached thread (:821). ⚠ **Move firmware keeps running through the whole swap** — it is killed
only at the end.

| # | Step | Atomic? | State if power is lost here |
|---|---|---|---|
| 1 | `saveSongIfDirty` (dbus) | n/a | Safe |
| 2 | `sync()` + ≤3 s settle poll | n/a | Safe — heuristic only; firmware can still autosave after it |
| 3 | mkdir stash + save xattrs | file write | Safe |
| 4 | **Stash loop** — one `rename()` per set dir | each atomic, **loop is not** | `Sets/` holds a random subset of the user's own page. Manifest not yet written. |
| 5 | `write_manifest(old)` | file write | — |
| 6 | **Restore loop** — target page in | each atomic, **loop is not** | ⚠ **Worst window.** `Sets/` holds a partial foreign page, the user's page is fully stashed, and `current_page.txt` still names the old page. A further switch from here compounds the mixing. |
| 7 | restore xattrs | — | Mostly redundant (rename preserves xattrs on one fs) |
| 8 | `set_page_update_song_index(0)` (:777-818) | ⚠ **NOT atomic** — `fopen("w")` truncates | Corrupt **`/data/UserData/settings/Settings.json`** — firmware-wide settings damage, beyond set pages |
| 9 | `set_page_persist(new)` (:733) | not atomic | **First moment the on-disk page number matches `Sets/`.** Every earlier interruption boots old-page-number over new-or-mixed contents |
| 10 | save state + `restart-move.sh` | — | Clean |

**Standing hazards found:**
- ⚠⚠ **The recovery manifest is write-only** — no reader exists anywhere in the tree. "Recovery via
  manifest" was never real; it is manual SSH surgery. Worse, `write_manifest` runs only for the page
  being *stashed*, so an active page's manifest goes stale the moment its dirs are restored — a human
  following it can be actively misled.
- Collision skip (:709-716) permanently shadows one copy of a UUID present in both places. **Anyone
  tidying `set_pages/` by hand deletes it — real loss.**

## 2. H1 — can `Sets/` be a symlink?

**Probably yes; one honest unknown, settled by Experiment 1.**

Evidence for:
- The firmware is path-driven boost::filesystem code, and the strings dump shows
  `boost::filesystem::symlink_status`, `read_symlink`, `create_symlink`, `realpath`, plus
  `opendir`/`lstat`/`readlink` imports. `opendir`/`stat`/`getxattr`/`open` on
  `Sets/<uuid>/…` follow a symlink at the `Sets` component transparently; boost's
  `status()`/`is_directory()` follow by default.
- ⭑ **Schwung already does exactly this trick on the same filesystem** —
  `host/src/shim-entrypoint.sh` migrates `/data/UserData/move-anything` and `Samples/Move Everything`
  to symlinks, and stock firmware has tolerated them for a year.
- Same-filesystem is proven: today's renames between `Sets/` and `set_pages/` succeed, so an atomic
  symlink `rename()` swap is available.

⚠⚠ **The linchpin unknown: boost's `recursive_directory_iterator` does NOT descend into directory
symlinks by default.** If any firmware component enumerates `UserLibrary` *from above* (cloud sync
scan, the Move Manager web set list, library indexing) rather than opening `Sets/` directly, sets
behind the link become invisible **to that component only** — loads would work while sync/web/export
silently skipped them. The recon corpus does not settle it.

Everything else touching the path was checked and is read-only + symlink-transparent (our C at
`shadow_sampler.c:258`, `shadow_overlay.c:385`, the polling at `shadow_set_pages.c:513`; our JS at
`shadow_ui.js:4200, 5625, 15877`; davebox `ui_export.mjs:36`, `ui_persistence.mjs:111`). Only
`set_page_move_dirs` renames into `Sets/`, and that is the thing being replaced.
Minor: `schwung-manager`/`filebrowser` use Go's `filepath.Walk`, which does not follow symlinks — the
web file browser may stop listing `Sets/`. Cosmetic, worth checking, not a data risk.

### ⭑ The design improvement that matters most: flip while Move is DEAD

Today the swap runs with MoveOriginal live (autosave race, held FDs). The right home is
`host/src/shim-entrypoint.sh`, which runs as `ableton` *before* `exec … MoveOriginal` on every start,
including after `restart-move.sh`:

1. **Shim at switch time:** atomically write a boot-id-stamped intent file, `saveSongIfDirty`,
   restart Move. The shim never touches `Sets/` again.
2. **Entrypoint, Move not running:** tmp symlink → one `rename()` over `Sets` (kernel guarantees
   old-or-new); rewrite `currentSongIndex` tmp+rename; write the page number tmp+rename; delete
   intent.
3. **One-time migration** on the first switch ever: `rename(Sets → pages/page_K)` — a **single atomic
   rename of the whole directory** — then link. The brief window is closed by a boot heal in the same
   entrypoint (missing link, or a real dir while pages exist → merge and relink deterministically).
   No manifest, no human.
4. Existing `set_pages/page_N` stashes are adopted where they lie; the xattr dance and `xattrs.txt`
   become dead code.

**If Experiment 1 fails:** keep everything except the link. The entrypoint performs the bulk renames
itself, journaled via the intent file, and **resumes idempotently at next boot before Move ever opens
`Sets/`.** The partial window still exists on disk but can never be observed by firmware or user —
which alone kills the panic scenario.

## 3. H2 — boot-scoped intent

Reuse `a6c84d45` (the standalone-marker fix) exactly: intent file holding `boot_id\ntarget_page`,
written atomically, validated against `/proc/sys/kernel/random/boot_id`.

⭑ **Key property:** `restart-move.sh` is a *process* restart, so boot_id is unchanged and a normal
switch survives its own restart. A power cut changes boot_id, so an unapplied intent is self-evidently
stale and is discarded — and discarding is always safe, because with H1 both sides of the rename are
whole pages.

⚠ **`currentSongIndex` must be reconciled whenever the page changes or reverts.** It is firmware
state and survives any revert. Pointing it at an index with no matching set is non-destructive — the
shim's existing pending-set path (`shadow_set_pages.c:559-573`) shows the firmware treats it as a new
un-materialised set — but it is confusing. Reconcile atomically, which also fixes the truncate-in-place
hazard at :808 for free.

🚫 **Do NOT adopt "always boot to page 0."** With H1 the page after a power cut is always a complete
page the user chose. Forcing page 0 every power cycle is a behaviour change existing users would feel
and it hurts upstreamability. **Boot-scope the intent, not the page.**

## 4. Cost and composition

| | Cost | Notes |
|---|---|---|
| **H1 (symlink, entrypoint)** | ~150 lines shell; `shadow_set_pages.c` *shrinks* (move/xattr/manifest machinery deleted) | One firmware unknown, fully gated by Exp 1 |
| **H1-weak (journaled renames)** | similar | No firmware unknowns; window invisible + self-repairing |
| **H2** | small | ⚠ **Not sufficient alone** — does not fix the mixed-pool window |

They **compose necessarily**: the intent file *is* H2's marker and *is* H1's trigger. Land as one
change. Independent fixes worth landing regardless: atomic `Settings.json` rewrite, the davebox prune
bug, and surfacing the silent collision skip.

## 5. Upstream-ability

`schwung/src/host/shadow_set_pages.c` is byte-identical bar a path macro, so a PR transplants cleanly.
Maintainer-acceptable shape:
- **No behaviour change for non-page users** — `Sets/` stays a real directory until the first page
  switch is ever performed.
- **No migration burden** — first switch does the one-rename migration; existing stashes adopted in
  place; stale `xattrs.txt`/`manifest.txt` ignored.
- ⚠ **Uninstall must materialise the link** (`scripts/uninstall.sh` — today it only backs up stashes
  at :135-151, and already leaves inactive pages invisible post-uninstall; fix in the same PR).
- The entrypoint is upstream's own file.

## 6. Device experiments (ordered)

⚠ **First: `tar` all of `Sets/` and `set_pages/` off-device and use sacrificial sets.** Undo is
`rm` the link + `mv` back.

1. **Symlink linchpin** (Move stopped): `mv Sets pages/page_0; ln -s pages/page_0 Sets`; start Move.
   Check listing, load/edit/save, create, duplicate, delete, **the Move Manager web UI**, reboot
   persistence. All pass → full H1; any component blind → H1-weak.
2. ⚠⚠ **Cloud sync through the link — CAN DESTROY REMOTE COPIES.** If a synced account sees `Sets/`
   differently through the link, sync may propagate deletions upstream. Throwaway account only, or
   keep the device offline for Exp 1 and test cloud last. Watch `user.local-cloud-state` /
   `user.was-externally-modified` for mass changes.
3. **Dangling `currentSongIndex`** (back up `Settings.json` first): set it to 99 with sets present and
   boot. Expected: a new empty set, folder materialised on save — confirms the H2 reconciliation story.
4. **Does firmware recreate `Sets/`?** Delete the link with Move stopped and boot. If it creates a
   real dir, the entrypoint heal is mandatory.
5. **Atomic-flip stress**: 100 rapid tmp-symlink + rename flips while `ls Sets/` loops. Confidence
   only, no risk.
