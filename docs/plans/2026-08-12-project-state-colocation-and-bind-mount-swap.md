# Project State Co-location + Bind-Mount Library Swap

Date: 2026-08-12
Status: ✅ COMPLETE — all phases shipped 2026-08-12 (same day as the plan).
Phase 0 `e8fead69`/`c4f2734e`/`47e42df2` · A `df0de6aa` · B `2b3c2fb5` · C `8334ee1b` ·
D/E `6698a5fa`. Sequencing was re-ruled by Josh mid-arc: B–E landed BEFORE P8, not after.
Hardware-verified end to end incl. Josh's hands-on (rename both flavours; per-project routing
isolation). This document is now the RECORD of what was built and why — the review-findings
section doubles as the trap ledger for anyone touching these paths.
Rulings folded in 2026-08-12: visible reserved name, sibling layout, no migration.
Set pages verified already dead — no work needed.
⚠⚠ REVIEWED ADVERSARIALLY 2026-08-12 and CORRECTED — two material fixes: the "native set
management is structurally unreachable" claim was FALSE (File Browser and schwung-manager both
reach the live library mid-session) and is now a POLICY, not an invariant; and the reserved-name
filters MOVED from Phase D into Phase B, where the original ordering was destructive. Review
findings not yet folded into the body are collected in their own section — read it before
implementing, especially the citation-drift warning.

## Problem

A dAVEBOx project is three things on disk that nothing in the filesystem ties together:

1. **The Move set** — `Sets/<uuid>/<Name>/Song.abl` (+ `user.song-index`, `user.dbx-color`
   xattrs on the uuid dir).
2. **The MODULE state half** — `/data/UserData/schwung/set_state/<uuid>/seq8sa-*`:
   patterns, clips, UI sidecar, snapshots. ⚠ That folder is the **stock host's own state
   root** and is SHARED — the same `<uuid>/` can hold stock's `slot_N.json` /
   `shadow_chain_config.json` alongside ours, so our deletes there are by-prefix and the
   directory is never rmtree'd (`standalone/scripts/project-cmd.sh:39-56`).
3. **The HOST state half** — `$DBX_DIR/set_state/<uuid>/`: `shadow_chain_config.json`,
   `slot_0..3.json`, `master_fx_*`, `move_fx_*`, `send_fx_*` — the routing and params.
   Ours alone (`project-cmd.sh:49-57`).

The only key relating them is the set uuid, so a large body of machinery exists purely to
hand-maintain the relationship: **two pruners** with a liveness test that must know every
root a set can be renamed into, **a two-root delete with two different rules**, **a
name→uuid index** with a cache-coherency rule ("one writer per moment"), **family/copy-
suffix lookup and an inherit picker**, the host's **Song.abl-size duplicate heuristic** +
`copy_source.txt`, and the **state-seeding half of `do_copy`**. Every one of these has had
at least one real bug on hardware (worklog `_worklogs/dbxhost.md` (21)/(22): 100 leaked
host-state dirs; a copy that silently tracked its source; a name-index entry resurrected
from cache).

Separately, because Move has exactly one, non-configurable library path, the standalone
session physically **renames N set directories** at each session boundary
(`standalone/scripts/set-swap.sh`): manifest, xattr save/restore, and a 5-phase
crash-recovery state machine — all to make `Sets/` show a different population.

**The fix for both is the same idea: stop maintaining relationships that the filesystem
can express directly.** Put the per-project state *inside* the set dir, and swap the
library by *mounting* it rather than moving it.

## Established facts (hardware, 2026-08-12 — do not re-run)

1. **Move tolerates extra contents inside a set folder — PROVEN.** A `dAVEBOx/` folder AND
   a loose `probe.txt` placed inside a live project's `Sets/<uuid>/` beside the inner set
   dir: session ran fine; exit-to-stock (whole uuid dir renamed into
   `dbx-host/sets/library/`), relaunch, load — loaded normally, contents intact and
   byte-identical, zero JS faults. This is the path where Move firmware itself opens
   Song.abl, so the tolerance is proven, not inferred.
2. **Move keeps its own xattrs on set dirs**: `user.song-index`, `user.song-color`,
   `user.local-cloud-state`, `user.last-modified-time`, `user.was-externally-modified`.
   (`user.song-color` is NATIVE; dAVEBOx invented `user.dbx-color` alongside it —
   possible follow-up: adopt the native attr. Not part of this plan.)
3. **`do_copy` copies only the INNER dir** (`project-cmd.sh:270`) then hand-copies outer
   xattrs and both state halves. Under co-location this collapses to copying the uuid dir
   once.
4. **Move's own duplicate almost certainly does NOT carry extra contents** — it mints a
   fresh uuid dir and copies the inner set in, appending " Copy" to the INNER name.
   Evidence is indirect but strong: the host identifies a duplicate's ancestor by
   comparing Song.abl file SIZES plus "copy" in the name
   (`src/shadow/shadow_ui.js:4329`, `src/host/shadow_set_pages.c:413`) — nobody would
   write that if the copy carried anything identifying. Consequence under co-location:
   a Move-side duplicate arrives with NO davebox state = a blank project. See
   "Behaviour changes" below.
5. **Bind mount works — PROVEN at the filesystem level.**
   `mount --bind $DBX_DIR/sets/library /data/UserData/UserLibrary/Sets` flips `Sets/`
   from 14 natives to 12 projects instantly; writes through the mount land in the library
   (a session can still create projects); `umount` restores the natives exactly; nothing
   moves on disk. Single filesystem (`/dev/mmcblk0p2` for all of `/data`).
6. **NOT verified**: restarting stock Move with the mount active, to watch firmware open
   the library through it (blocked by a permission classifier; deliberately skipped).
   This is the one open verification. It is low-risk: a bind mount is transparent at the
   VFS layer, and the only question with design weight — must the mount exist before
   Move starts? — is already satisfied, because the launcher stops Move at that boundary
   anyway (`standalone/scripts/launch.sh:117-129, 140-159`).

## ⭑⭑ Policy: dAVEBOx owns project management — out-of-band mutation is NOT defended against

> ⚠⚠ **CORRECTED 2026-08-12, after an adversarial review.** This section first claimed native set
> management was *structurally unreachable* under SA. **That claim is FALSE**, and it was mine, not
> Josh's — his observation was about normal usage, which is correct; I overstated it into a
> structural guarantee and "audited" it without checking the two paths below. Verified
> counter-examples:
>
> 1. **File Browser, mid-session.** The Tools menu (Shift+Step13, gated only on shift+shadow —
>    `src/schwung_shim.c:7645-7646`) hides only `standalone` LAUNCHER entries during a live session
>    (`shadow_ui.js:15138-15144` filters `!t.standalone`). `file-browser` is `component_type:
>    "tool"` (`src/modules/tools/file-browser/module.json:7`), so it stays launchable — rooted at
>    `/data/UserData/UserLibrary` (`file-browser/ui.js:68`), which DURING A SESSION IS THE MOUNTED
>    SA LIBRARY — with `os.remove` (`:239`) and `os.rename` (`:258, :328`).
> 2. **schwung-manager, over the network, all session long.** `launch.sh:117-129` kills
>    `MoveMessageDisplay MoveLauncher Move MoveOriginal schwung shadow_ui` — **not**
>    schwung-manager. It keeps serving `POST /files/rename|delete|upload|mkdir`
>    (`schwung-manager/main.go:3432-3436`) rooted at `/data/UserData/`.
> 3. **Co-run Back depth is unproven.** dAVEBOx cedes Back/Jog/Shift and the OLED to Move firmware
>    (`ui_corun.mjs:176-180`); "sub-view nav only" is a *comment* (`:25-27`), not a mechanism, and
>    `cleanupAfterMoveNativeCoRun` (`:204-260`) does no set resync on exit. Closed firmware —
>    unproven either way, so it must not be asserted either way.
>
> Also: `shadow_poll_current_set()` fires SET_CHANGED for **any** origin with no
> dAVEBOx-initiated check (`shadow_set_pages.c:549+`), and Phase A's crash-without-reboot case
> leaves stock Move live over the mounted SA library, where it will *write* (autosave, xattrs).
> So "cosmetic, zero data moved" was also overclaimed there.

**The policy that replaces it** (this is what Phase 0 is licensed by, and it is a decision, not a
fact about the code):

**dAVEBOx does not defend against out-of-band mutation of its projects. A project dAVEBOx has
never seen opens BLANK.** Josh has already accepted that contract for the clean break; it is the
same answer, and it costs nothing to state deliberately instead of inferring an ancestor.

The deletions in Phase 0 are still correct — but because we have *chosen* not to answer "whose
descendant is this?", not because the question is impossible to ask. That difference matters: it
means the machinery can go, and it also means we must NOT write "structurally enforced" into
`CLAUDE.md`.

**⭑ RULED (Josh, 2026-08-12): proceed with Phase 0 now; the holes are a FOLLOW-UP, not a
blocker.** *"let's proceed but not worry about closing those holes right now. we'll deal with them
in a follow up."* The policy above is what ships: an out-of-band-mutated project opens blank, and
that is an accepted outcome rather than a bug to be defended against.

- [ ] **FOLLOW-UP (deferred, not cancelled)**: hide `file-browser` during a live session — the same
      predicate that already hides standalone launchers (`shadow_ui.js:15138-15144`) — and stop or
      scope schwung-manager in `launch.sh`. Both are small; they were deferred to keep Phase 0
      moving, not because they are unwanted. ⚠ Until they land, a user with the Tools menu or a
      browser pointed at port 7700 can rename or delete a live SA project out from under the
      session, and after Phase 0 nothing will try to recover from it.

### (Superseded) the original structural claim

**Josh, 2026-08-12:** *"the whole point of rebuilding the davebox / host relationship as we've
been doing is to keep everything user-facing contained inside davebox itself. Users wouldn't
normally be able to access the native set management apparatus — only what dAVEBOx's project
load screen gives them."*

Josh's original observation — correct as a statement about NORMAL USAGE, and the reason the
policy above is the right one:

- **During a session** the SA library is in `Sets/`, and dAVEBOx owns the primary surface. Move's
  set management is not on screen and cannot be reached.
- **Outside a session** the SA library is parked in `$DBX_DIR/sets/library/`, which is not Move's
  library path — stock Move cannot see dAVEBOx projects at all.
- **Move-native co-run** is *intended* for preset/synth navigation (`ui_corun.mjs:1-8, 23-41`).
  ⚠ Intended, not bounded — see counter-example 3 above. Do not cite this as a guarantee.

⇒ For the ordinary path — the picker, the session, stock Move outside a session — Move's set
management and dAVEBOx projects are indeed never in the same world at once. ⚠ The Tools menu,
schwung-manager and co-run are the exceptions above; they are *side doors*, not the normal path,
which is why the policy (open blank) is an adequate answer rather than a resignation.

**What it kills.** A whole family of code answers exactly one question: *"a set appeared that
dAVEBOx has never seen — whose descendant is it?"* That question can only arise when something
OUTSIDE dAVEBOx duplicated a set. That is the **Legacy** world (dAVEBOx as a module under stock
Schwung, user holding full native set management), and Legacy is a separate frozen repo
(`../schwung-davebox`) that this deletion does not touch. Under SA nothing can produce the input
this machinery waits for — dAVEBOx's own copy explicitly routes around it, pre-copying both state
halves precisely so the inherit path never fires (`standalone/scripts/project-cmd.sh:279-307`,
and read its comment).

⇒ **This machinery is already dead, TODAY.** It is not "simplified by co-location" — it can be
deleted before any storage change, which is why Phase 0 exists and runs first.

### ⭑ Set pages are ALREADY GONE — verified 2026-08-12, no work needed

Josh asked that set pages be made unreachable if they were reachable. They are not: **the 8-page
set-library stash died in P3** of the re-architecture. Evidence:

- `src/host/shadow_set_pages.c:1-4` — *"The 8-page set-library stash this file was named for died
  in P3; the name stays to keep history legible."* The file now does set **tracking**, not pages.
- `src/host/shadow_constants.h:173` — `set_pages_enabled` is **RESERVED** and kept only to
  preserve the SHM layout, commented "set pages died in P3".
- **No stash writer exists anywhere in the tree** — the only remaining references to a
  `set_pages` *directory* are the defensive readers listed below, and
  `davebox/docs/working/DBSA_SET_PAGES_HARDENING.md:23` already records that no
  `/data/UserData/schwung/set_pages` exists on the device.

So the residue is **dead defensive code guarding against a deleted feature**:
`SEQ8_SET_PAGES_DIR_A`/`_B` (`davebox/dsp/seq8.c:75-80`), the stash-walk arm of
`seq8_set_uuid_alive` (`sp_globals_state.c:45-59`), and `SET_PAGES_DIR_A`/`_B` in
`project-cmd.sh:84-85`. All are already on the Phase 0 / Phase E deletion lists. ⚠ Do not
"harden" set pages further — hardening a feature that does not exist is how this residue got here.

## Target model

### Layout

```
Sets/<uuid>/
  <Name>/                     ← Move's inner set dir (Song.abl, …) — untouched
  dAVEBOx/                    ← ours; reserved name, filterable everywhere
    seq8sa-state.json         ← MODULE half (DSP-written)
    seq8sa-ui-state.json      ← MODULE half (JS sidecar)
    seq8sa-snap-index.json
    seq8sa-snap-<id>-*.json
    host/                     ← HOST half (routing/params)
      shadow_chain_config.json
      slot_0..3.json
      master_fx_*.json  move_fx_*.json
      send_fx_*.json    send_fx_meta.json  move_fx_meta.json
      rnbo_graph.txt (when present)
```

Why a **sibling of the inner `<Name>/` dir**, not inside it: fact 1 proves the position is
safe; the inner dir is the thing Move renames on rename/" Copy", so putting state beside
it (not inside) means a rename never moves our files; and one subtree =
one `rmtree` on delete, one `copytree` on copy, zero cross-tree bookkeeping.

**⭑ RULED (Josh, 2026-08-12): sibling, and the inside-the-inner-dir experiment is NOT to be
run.** Inside would keep the one-child assumption intact (no filters needed) and would
likely make a Move-NATIVE duplicate carry our state. Both were judged not worth it:

- The one-child benefit is moot — we want the explicit filters regardless (see below).
- The Move-native-duplicate benefit serves **a flow users cannot reach** (see
  *Invariant: dAVEBOx owns the surface*). It buys inheritance for a duplicate that cannot
  be created.
- ⚠ Against it: the inner dir is **Move's own**, read/written/cloud-synced by closed
  firmware. If Move ever tidies unknown files there our data is gone, with no recourse.
  Beside it, Move only ever moves the enclosing dir wholesale and never has an opinion
  about our contents. For closed firmware, take the conservative position.

Everything that used to be "keep two trees in step" becomes "the state travels with the
set because it is IN the set":

- **delete** = `shutil.rmtree(Sets/<uuid>)` — already what `do_delete` does for the set
  itself; the two-root state delete (`project-cmd.sh:372-397`) just disappears.
- **copy** = `copytree(Sets/<uuid> → Sets/<newuuid>)` + rename inner to `<Name> Copy` +
  set xattrs. The snapshot property `do_copy` had to build by hand
  (`project-cmd.sh:279-307`) is free.
- **orphans cannot exist** — no set, no state. Both pruners, the liveness test, and its
  four-root union die.
- **the name index and inherit picker lose their reason to exist** — they only ever
  papered over "a duplicate arrives with no state" (see Behaviour changes for what
  replaces that answer).
- keeping the `seq8sa-` prefix costs nothing (the `SEQ8_STATE_PREFIX` build plumbing
  stays) and the `dAVEBOx/` dir is ours alone — the SHARED-root by-prefix delete rule
  and the `host_remove_dir`-under-`set_state` prohibition simply stop applying. Note
  `validate_path` (`src/host/js_host_common.c:173`) allows all of `/data/UserData`, so
  JS can read/write under `Sets/` today; `host_remove_dir` stays restricted to
  modules/staging/backup/tmp (`js_host_common.c:441-448`) — snapshot deletion keeps the
  stub-the-files approach unless we choose to extend that allowlist (out of scope).

The stock host's `set_state/` tree and the stock literal paths are untouched — stock
Schwung never learns about any of this (davebox is the only consumer;
`docs/UPSTREAM.md` watermark unaffected).

### ⚠ One-child assumptions — the sites this change breaks

Everything that enumerates `Sets/<uuid>/` and assumes the single child IS the set must
learn the reserved name. Audited sites:

**Breaks — required edits (filter to the inner set dir):**

| Site | Today | Fix |
|---|---|---|
| `project-cmd.sh:129-131` (`do_list`) | `names[0]` of all non-hidden dirs | exclude `dAVEBOx` (or require `Song.abl`) |
| `project-cmd.sh:264-270` (`do_copy`) | `inner[0]` → copytree of inner only | whole-uuid-dir copytree; rename inner; still must *find* the inner dir to rename → same filter |
| `project-cmd.sh:492-496` (`do_rename`) | `inner[0]` | same filter |
| `standalone/scripts/select-list.sh:43-45` | `inner[0]` as project name | same filter |

Recommend one rule, spelled identically in all four places: **skip the literal name
`dAVEBOx`** (a `Song.abl`-presence test is tempting but wrong for a set Move has created
and not yet saved — select-hook.sh's whole reason for existing,
`select-hook.sh:101-112`). Pin the reserved name the way `check-config.sh` pins
`DBX_DIR` literals — it will exist in sh, py-in-sh, JS, and C.

**⭑ RULED (Josh, 2026-08-12): a VISIBLE name with EXPLICIT filters. The dot-prefix
shortcut is rejected.** All four sites above already skip `startswith(".")`, so naming the
folder `.davebox` would need zero edits and no pin. Rejected anyway, for three reasons —
record them so the shortcut is not rediscovered and adopted:

1. **Wildcards skip dotfiles.** Any user, backup script or sync tool doing
   `cp -r <project>/* …` silently drops the state and produces a project that looks
   complete and is not. Silent, data-loss-shaped.
2. **Hidden exactly when it matters** — invisible over USB / the Move app / a file
   browser, i.e. while someone is troubleshooting the project.
3. ⭑ **The protection would be INCIDENTAL.** Those dotfile filters were not written to
   protect us; nothing marks them load-bearing, and a later refactor could drop one with
   no way to know. An explicit reserved-name check states the intent and the pin makes a
   mismatch impossible. Prefer the four edits.

**Safe as-is (verified):**

- `select-hook.sh:92-95` — iterates children but requires `<n>/Song.abl`; a `dAVEBOx/`
  sibling is skipped.
- `shadow_ui.js:4334-4350` (`getSongAblSize`) and `shadow_set_pages.c:380-399`
  (`shadow_get_song_abl_size`) — iterate until a `Song.abl` is found; also both are
  deleted with the duplicate heuristic anyway.
- `set-swap.sh:80-87` (`list_uuid_dirs`) — operates on whole uuid dirs, never looks
  inside; and is being replaced by the mount anyway.
- Move firmware — fact 1.

### Pointing both halves at the new location

**MODULE half — `state_path` is already a runtime param; this is the key enabler.**
The DSP's state file location is a plain instance field set via
`set_param("state_path")` (`davebox/dsp/setparam/sp_globals_state.c:153-158`,
`davebox/dsp/seq8.c:1074-1075`), and every save/load goes through it
(`davebox/dsp/seq8_state.c:537-576`). What must change is every place that *derives* a
path from a uuid:

- `davebox/dsp/seq8.c:93-94` — `SEQ8_SET_STATE_FMT` / `SEQ8_SET_UISTATE_FMT` become
  `SEQ8_SETS_DIR "/%s/dAVEBOx/" SEQ8_STATE_PREFIX "-state.json"` (and `-ui-state`).
  Consumers: `state_load` (`sp_globals_state.c:160-167`), the prune (dies anyway),
  create_instance (`seq8.c:4397-4398`).
- `seq8.c:4384-4399` — create_instance resolves the boot path from
  **`/data/UserData/schwung/active_set.txt`** — the STOCK literal (see Risks; this is a
  discovered latent bug, per [[schwung-two-install-trees-same-filenames]]). Re-point at
  `$DBX_DIR/active_set.txt` while changing the format string.
- `seq8.c:6315-6330` — `state_uuid` readback parses `"/set_state/"` out of
  `state_path`. The path shape changes; either parse the new shape or (better) store the
  uuid in its own instance field when `state_load` sets it.
- `davebox/ui/ui_persistence.mjs:15-25` (`uuidToStatePath` / `uuidToUiStatePath`),
  `:28` (`SET_STATE_DIR`), `:324-329` (snapshot paths) — all become
  `SETS_BASE_DIR + '/' + uuid + '/dAVEBOx/…'` (`SETS_BASE_DIR` already exists at
  `:132`). The module only ever runs in-session, when the mount makes `Sets/` the
  library view — so these paths are always valid when the module is alive.
- `ui_persistence.mjs:116` — `copyStateFiles`' `host_ensure_dir` (dies with the inherit
  machinery anyway).

**HOST half — every `HOST_STATE_ROOT + "/set_state/" + uuid` site:**

- `src/shadow/shadow_ui.js:13996` — SET_CHANGED's `newDir` becomes
  `SETS_BASE + "/" + uuid + "/dAVEBOx/host"`.
- `shadow_ui.js:14000-14001` — the `host_ensure_dir` pair follows.
- `shadow_ui.js:14010-14012` — `copy_source.txt` read: **deleted**.
- `shadow_ui.js:15611` — init's boot restore of `activeSlotStateDir`: same new path.
- `shadow_ui.js:4331` — inside `detectCopySource`: **deleted** with the function.
- `SLOT_STATE_DIR_DEFAULT` (`shadow_ui.js:289`, the no-uuid fallback) stays under
  `$DBX_DIR` — a session with no set loaded still needs somewhere.
- C side: `src/host/shadow_set_pages.h:18` `SET_STATE_DIR` — consumers are the batch
  migration (`shadow_set_pages.c:151`) and the copy heuristic (`:413-450`); see the
  inventory for both. If the shim's own boot restore reads per-set dirs through this
  define, the define moves with the JS path (verify at implementation:
  `grep -n SET_STATE_DIR src/host/*.c`).
- `active_set.txt` itself is **unchanged** — it answers "which uuid is open", which
  co-location does not answer.

## Inventory: machinery that exists only to keep the parallel trees in sync

| # | Machinery | Where | Fate |
|---|---|---|---|
| 1 | Module pruner `prune_orphan_states` | `sp_globals_state.c:95-151` | **DELETE** — orphans impossible |
| 2 | Liveness test `seq8_set_uuid_alive` (4-root union) | `sp_globals_state.c:33-72` | **DELETE** |
| 3 | Liveness roots `SEQ8_SET_LIBRARY_DIR`, `SEQ8_SET_PAGES_DIR_A/B` | `seq8.c:69-89` | **DELETE** (defines + comments) |
| 4 | Host pruner `do_prune` (refusal ladder, alive-union) | `project-cmd.sh:539-632` | **DELETE** — shipped 08-12 (worklog (22)), superseded |
| 5 | Tick prune branch (fires both pruners + index sweep) | `ui_tick.mjs:1891-1917`, `ui_state.mjs:544`, `ui_persistence.mjs:236` | **DELETE** |
| 6 | Name→uuid index: file, cache, 4 fns, coherency rule | `ui_persistence.mjs:27, 61-107`; `ui_dialogs.mjs:1048`; `project-cmd.sh:88-90` | **DELETE** |
| 7 | `_rename_update_name_index` + both call sites | `project-cmd.sh:452-472, 517, 534` | **DELETE** |
| 8 | Copy-suffix/family machinery: `stripCopySuffix`, `findInheritCandidates`, `maybeShowInheritPicker`, `copyStateFiles` | `ui_persistence.mjs:53-58, 109-126, 140-188` | **DELETE** |
| 9 | Inherit-picker dialog + interlocks (`S.pendingInheritPicker`, `resolveInheritPicker`, writeSidecar/tick guards) | `ui_dialogs.mjs`, `ui_tick.mjs:471, 674`, `ui_persistence.mjs:277` | **DELETE** (the `resolveSetLoadDecision` chain at `ui_persistence.mjs:201-223` simplifies to mismatch-gate + uuid/exists checks) |
| 10 | Host duplicate heuristic: `detectCopySource` (JS) | `shadow_ui.js:4329-4378` | **DELETE** |
| 11 | Host duplicate heuristic (C): `shadow_get_song_abl_size`, `shadow_set_name_looks_like_copy`, `shadow_detect_copy_source` | `shadow_set_pages.c:380-450` | **DELETE** |
| 12 | `copy_source.txt` read + concept | `shadow_ui.js:14009-14016` | **DELETE** |
| 13 | SET_CHANGED copy-seed branch (slot/mfx/sendfx/movefx/chain-cfg hand-copy) | `shadow_ui.js:14023-14053` | **DELETE** (the empty-seed `else` branch `:14054-14091` stays, path updated) |
| 14 | `do_copy` state-seeding half | `project-cmd.sh:279-307` | **DELETE** — whole-dir copytree carries it |
| 15 | `do_delete` two-root state delete | `project-cmd.sh:372-397` | **DELETE** — rmtree of the set carries it |
| 16 | Swap state machine: manifest, `move_uuid_dirs`/`move_by_manifest`, per-set renames, 5 phases | `set-swap.sh:89-121, 187-266` | **DELETE** — replaced by mount/umount (below) |
| 17 | Native/library xattr save-restore | `set-swap.sh:129-169, 203, 210, 233, 244, 251` | **DELETE** — natives never move; library xattrs live on their dirs |
| 18 | `state_uuid` readback path-parser | `seq8.c:6315-6330` | **SIMPLIFY** — dedicated uuid field |
| 19 | `do_list` / `do_rename` / `select-list.sh` inner-dir pick | `project-cmd.sh:129-131, 492-496`; `select-list.sh:43-45` | **SIMPLIFY** — reserved-name filter |
| 20 | `resolveSetLoadDecision` decision chain | `ui_persistence.mjs:201-223` | **SIMPLIFY** (inherit branches gone; both callers stay) |
| 21 | Batch migration + `seed_empty_set_state` | `shadow_set_pages.c:116-200` | **LEAVE for now** — it seeds empty per-set state (boot-feedback fix, 2026-06-25); re-point its target path; deleting it is a separate decision (it also guards natives under the stock-tree build; verify which builds compile it before touching) |
| 22 | `active_set.txt`, `projects.json`, xattr color/index, SELECT-BEFORE-LOAD | various | **LEAVE** — orthogonal (paths only) |
| 23 | Tests pinning deleted machinery | `davebox/tests/test_prune_respects_set_pages.c`, `davebox/tests/js/test_name_index_delete.mjs`, prune sections of `tests/host/test_project_cmd.sh`, most of `tests/host/test_set_swap.sh` | **DELETE/REWRITE** with their subjects (⚠ [[schwung-test-pinned-the-bug]] — do not leave a green test asserting a dead mechanism) |

## The bind-mount swap (independent piece — lands first)

### What replaces what

`set-swap.sh enter` (`:187-218`) — today: manifest, stash N natives, move M projects in,
xattr restore, index swap. Becomes:

1. `mount --bind $DBX_DIR/sets/library $SETS_DIR` — **needs root**; we run as `ableton`.
   Extend `davebox-heal` (setuid root, `standalone/davebox-heal.c`) with
   `--mount-sets` / `--umount-sets`, paths **hardcoded** like its existing unit name /
   shim paths (that is heal's whole security model), pinned by
   `standalone/scripts/check-config.sh`.
2. Save native `currentSongIndex`, write the SA one — **this survives**: Move has ONE
   `Settings.json`, so the index swap (`set-swap.sh:172-183, 197, 212-214, 234, 250-252`
   and `SA_INDEX_FILE`) is still needed verbatim.
3. `swap_state` collapses to a marker of "mounted + saved native index" — one phase,
   because the mount is atomic. No manifest, no xattr files.

`set-swap.sh exit` — `umount $SETS_DIR` (via heal) + restore native index + save SA
index. No renames, no "everything not on the manifest is ours" reasoning — projects
created mid-session were written *through the mount* into the library already.

`recover` — `mountpoint -q $SETS_DIR && umount` + restore index. Idempotent by
construction.

`launch.sh` — call sites unchanged in shape (`:140-159` enter + template seed, `:167`
and `:279-282` exit); the template first-run seed (`:143-153`) stays as-is (it writes
into `sets/library` directly, which is mount-independent). Every `refuse` path after
enter must umount (same discipline the 2026-08-10 frozen-device fix imposed for
resume-launcher, `launch.sh:67-77`).

The blessed boot oneshot (`install-privileged.sh:68-73`, `davebox-restore`,
`Before=move-launcher.service`) stays but becomes trivial: after a reboot there is
nothing to heal (see below); after a crash *without* reboot it umounts. Keep it.

### Crash/failure semantics — strictly better

- **A mount does not survive reboot.** Hard power-cut mid-session → on boot the user's
  real sets are simply back. Compare today: a reboot mid-`entering`/`exiting` leaves a
  half-moved library that the 5-phase machine + boot oneshot must converge — the entire
  reason `set-swap.sh:15-27` exists.
- **Crash without reboot** (supervisor killed, stock respawned by systemd): the mount is
  still active, so stock Move would see the SA library until umount/reboot. That is the
  new worst case — *wrong library visible*, cosmetic, zero data moved — versus today's
  worst case of a mixed/half-moved library. The `recover` backstop in `launch.sh:141`
  and the boot oneshot both clear it.
- **Nothing still needs the native-stash concept.** `sets/native-stash/` becomes an
  empty legacy dir; natives never leave `Sets/`. (Leave the dir on disk for one release
  so an old build's `recover` finding leftovers isn't a concern — Josh authorised a
  clean break on *state*, but the swap change should not strand a set mid-upgrade;
  concretely: ship the bind-mount build only after a verified `set-swap.sh exit` /
  `recover` on the old build, i.e. phase `none`.)

### Ordering vs Move

The mount must exist before MoveOriginal starts and disappear after it dies — already
guaranteed: `launch.sh` kills the stock stack before enter (`:117-129`) and runs exit
after the supervisor loop ends (`:279-282`), and the in-place relaunch loop never
touches the mount.

## Behaviour changes (clean break — explicitly authorised)

- **No migration.** Existing projects keep their `set_state/<uuid>/` halves, which the
  new build never reads: **existing projects lose their dAVEBOx state** (patterns,
  routing) and open blank. Best user action is to delete them and start fresh. Josh has
  explicitly waived retention. The old `set_state` trees become inert litter; a one-off
  manual sweep can remove `$DBX_DIR/set_state/` and the `seq8sa-*` files under the stock
  root (by prefix, as ever — [[schwung-two-install-trees-same-filenames]]).
- **A Move-native duplicate (Move's own copy gesture) arrives blank.** Move mints a
  fresh uuid and copies only the inner set (fact 4) — no `dAVEBOx/` travels. Today the
  inherit picker papers over this with a name-based guess that has already mis-fired
  (worklog: edits to "Project 17" appearing in a pre-existing "Project 17 Copy"). Blank
  is honest: the *supported* copy path is the module's own copy verb (`do_copy`), which
  under co-location is a perfect snapshot by construction. Flagged as a real behaviour
  change; if it stings in practice, a future explicit "seed from…" action beats
  resurrecting the heuristic.

## ⚠ Findings from the adversarial review (2026-08-12) — read before implementing

The invariant correction and the Phase B re-ordering are folded in above. The rest, all verified
against the code by the reviewer and not yet folded into the body:

- ⚠⚠ **The citation map drifts exactly where Phase 0 deletes.** `ui_persistence.mjs` boundaries
  are off by one function (actual: `copyStateFiles` 109-126, `findInheritCandidates` **134-161**,
  `maybeShowInheritPicker` **163-188**); a **third** `maybeShowInheritPicker` caller exists at
  `ui_tick.mjs:506` (post-resume self-heal) and is cited nowhere; the `pendingInheritPicker`
  interlocks are far wider than listed (`ui_dsp_bridge.mjs:812`, `ui_input_cc.mjs:87-90, 682-685,
  1535, 1559, 1972`, `ui_render.mjs:741, 781`, `ui_tick.mjs:475/499/566/676` — the cited 471/674
  land on comments); `updateNameIndex` is also called at `ui_tick.mjs:1823`;
  `S.pendingPruneOrphans` is also set at `ui.js:260`; `seq8.c:1074-1075` is the `state_path`
  struct FIELD, not the handler; heal is `standalone/src/davebox-heal.c`. **Re-derive every line
  number before executing Phase 0** — a wrong citation in a deletion list is worse than none.
- ⚠⚠ **Fix (14)'s save-destination guard must survive Phase 0.** Both savers gate on
  `!pendingSetLoad && pendingDspSync===0 && !pendingInheritPicker` (`ui_dsp_bridge.mjs:812`,
  `ui_persistence.mjs:277`). Delete **only the `pendingInheritPicker` clause**; the `state_uuid`
  destination-agreement mechanism survives Phase 0 AND the item-18 "simplify". A mechanical delete
  of everything referencing the picker reopens the cross-project save bug that started this arc.
  Same class as the `do_copy` trap already called out — assume there are more, and grep before
  deleting rather than trusting either list.
- ⚠ **A THIRD per-set state consumer exists and the plan never mentions it:** song-mode writes
  `set_state/<uuid>/song_mode.json` into the stock literal root (`src/modules/tools/song-mode/ui.js:150,202`),
  reachable from the Tools menu mid-session. After Phase 0/E delete both pruners nothing ever
  reclaims those dirs, and its files block `do_delete`'s legacy `rmdir`-if-empty. Decide: leave it
  (and accept the orphans), or co-locate it too.
- ⚠ **The test inventory is incomplete** — also breaking: `davebox/tests/test_clean_slate.sh`
  (pins the two-root delete, breaks at D), `davebox/tests/test_install_paths.sh` (pins the two-tree
  layout, breaks at B), `davebox/tests/test_setparam_domains.c:2694+` (`prune_orphan_states`
  section, breaks at 0/E), `tests/host/test_workspace_separation.sh` + `standalone/config.sh:79`
  (`DBX_PRIVATE_STATE` includes `set_state`, stale at C). Per [[schwung-test-pinned-the-bug]] these
  belong on the list, not discovered later as green-and-lying.
- ⚠ **`shadow_batch_migrate_sets()` is called UNCONDITIONALLY** from `shadow_chain_mgmt.c:1348`
  via shim init (`schwung_shim.c:4676`) — every build, every boot. Re-pointing it at the new layout
  would make the shim seed a `dAVEBOx/host/` dir into every uuid dir visible at init — under the
  mount, every SA project. **Decide at Phase C: gate it off for SA, or re-point deliberately.** Do
  not re-point mechanically.
- ⚠ **Export is unexamined**: `ui_export.mjs:51` reads the live GLOBAL
  `$DBX_DIR/shadow_chain_config.json`, which is only fine if the host keeps maintaining that global
  copy after Phase C. Verify at Phase C.
- **Genericity tension**: Phase C bakes the literal module-named `dAVEBOx/host` path into HOST code,
  which the repo's "no module named" rule discourages and which makes the host's per-set-state
  layout permanently un-offerable upstream. Either have the host read the reserved name from the
  one pinned constant (wanted anyway for the four filters) or record the waiver explicitly.
- ✅ **Checked and holds:** `do_delete` safe through every phase; sampler/skipback write only under
  `Samples/Schwung/`; `select-hook.sh` stays inside dAVEBOx's own flow; `resolveSetLoadDecision`
  has exactly the two claimed callers; `ui_export.mjs` uses none of the deleted symbols; no new
  `typeof` gates anywhere in the plan; heal's hardcoded-verb model is consistent with the existing
  security model; set-pages "died in P3" fully confirmed.

## Risks and unknowns

- **(Fact 6) Stock Move over an active bind mount is unverified.** The one open
  verification, first hardware step of Phase A. Low design risk (VFS-transparent;
  ordering already satisfied).
- **Move cloud sync**: `user.local-cloud-state` shows set dirs participate in Ableton
  cloud sync. If Move uploads whole set dirs, an SA project's `dAVEBOx/` contents could
  be synced (session runs real Move firmware with network). Unknown: whether sync sends
  unknown files, and whether SA sessions sync at all. Check on hardware during Phase B
  acceptance; worst case is harmless data in the cloud copy, but a sync that *round-trips*
  and strips unknown files would silently drop state — verify by syncing a probe set if
  cloud is enabled on the test device.
- **Discovered while reading — `seq8.c:4387` reads the STOCK `active_set.txt` literal**
  (`/data/UserData/schwung/active_set.txt`) to resolve the boot state path, while JS
  reads `$DBX_DIR/active_set.txt` (`ui_persistence.mjs:30-36`, which exists precisely
  because the stock copy went stale on hardware 2026-08-06). Today SELECT-BEFORE-LOAD
  masks it (create_instance skips loading under the marker; relaunches send
  `state_load`). Phase B re-points it; until then, do not assume the DSP's boot path is
  correct on any non-marker boot.
- **`mount` needs root** → `davebox-heal` grows two verbs. Setuid surface change; keep
  paths hardcoded, no arguments taken from the caller, pin with `check-config.sh`, and
  re-verify heal refuses everything else.
- **Reserved-name drift**: four independent spellings of the `dAVEBOx` filter (sh, py,
  JS, C). Same failure shape as worklog (21)'s mirror-list — pin it (config.sh constant
  + check-config, or a shell test that greps all four).
- **Unsaved/Move-born sets**: a uuid dir can briefly exist with no inner `Song.abl`
  (`select-hook.sh:101-112`). The reserved-name filter (not a Song.abl test) keeps
  `do_list`/`do_rename` correct there.
- **Uncertain — shim-side readers of per-set host state**: the shim restores slots at
  boot via its own C path (`shadow_chain_mgmt.c` per the boot-feedback addendum). This
  plan verified the JS sites; the C restore path's directory derivation must be found
  and re-pointed in Phase C (`grep -rn set_state src/host/ src/schwung_shim.c` at
  implementation time — the one grep run for this plan only surfaced
  `shadow_set_pages.{c,h}`, and `SET_STATE_DIR` consumers there; if the shim derives
  the per-set dir another way, find it before declaring Phase C done).
- **`Sets/` mtime semantics** ([[schwung-which-project-is-live-by-autosave-mtime]]):
  worklog heuristics that key off `set_state` autosave mtimes need re-learning after
  co-location; a session-forensics habit, not a code path.

## Phased implementation

Each phase is independently shippable. Phase 0 and Phase A are independent of P8 and land first;
Phases B–E are sequenced **after P8** (the unified slot model is the active arc).

### Phase 0 — write down the invariant, delete the native-set-defence machinery (independent, FIRST)

⭑ **Added after Josh's observation (see *Invariant: dAVEBOx owns the surface*).** No storage
changes, no migration, no dependency on P8 or on any later phase here. It only deletes code that
answers a question SA cannot ask — so it shrinks what every later phase has to move, and it is
worth doing even if the rest of this plan is never scheduled.

1. **`CLAUDE.md`: state the invariant** beside the existing "no capability probing" rule —
   *dAVEBOx owns the user-facing surface; native set management is unreachable; never add code
   that defends against a set changing behind our back.* This is the licence for everything below,
   so it must be written before the deletions, not after.
2. **Delete the "whose descendant is this?" family:**
   - inherit picker + `S.pendingInheritPicker` interlocks (`ui_dialogs.mjs`, `ui_tick.mjs:471, 674`,
     `ui_persistence.mjs:277`)
   - `findInheritCandidates` / `stripCopySuffix` / `copyStateFiles` (`ui_persistence.mjs:53-58,
     109-126, 140-188`)
   - the name→uuid index in full: file, cache, `loadNameIndex`/`saveNameIndex`/`updateNameIndex`/
     `dropNameIndexUuid` (`ui_persistence.mjs:27, 61-107`), `ui_dialogs.mjs:1048`,
     `_rename_update_name_index` + call sites (`project-cmd.sh:452-472, 517, 534`),
     `project-cmd.sh:88-90`
   - host-side duplicate detection: `detectCopySource` (`shadow_ui.js:4329-4378`),
     `shadow_get_song_abl_size` / `shadow_set_name_looks_like_copy` / `shadow_detect_copy_source`
     (`shadow_set_pages.c:380-450`), `copy_source.txt` (`shadow_ui.js:14009-14016`), and the
     SET_CHANGED copy-seed branch (`shadow_ui.js:14023-14053`)
3. **Delete the set-pages residue** — dead since P3, verified above: `SEQ8_SET_PAGES_DIR_A`/`_B`
   (`seq8.c:75-80`), the stash-walk arm of `seq8_set_uuid_alive` (`sp_globals_state.c:45-59`),
   `SET_PAGES_DIR_A`/`_B` (`project-cmd.sh:84-85`), and the set-pages case in
   `test_prune_respects_set_pages.c`. ⚠ Leave the RESERVED `set_pages_enabled` SHM byte alone —
   removing it changes the SHM layout (`shadow_constants.h:173`).
4. **Keep, for now:** both pruners and the liveness test's `Sets/` + library roots. They are not
   part of this family — they answer "is this set gone?", which is still a real question until
   co-location lands. Phase E removes them.

⚠ **Phase 0 has a REAL failure mode: an over-broad delete.** `do_copy` currently pre-copies both
state halves specifically so the inherit path never fires — that behaviour is what makes a
dAVEBOx-made duplicate a snapshot, and it **must survive** this phase (it is only simplified later,
by Phase D's whole-dir copytree). Deleting it here silently turns every duplicate into a blank
project.

Tests: an eval-level pin that a duplicate made through the picker still carries its source's
state (extend `davebox/tests/js/` — see `test_name_index_delete.mjs` for the idiom, which is
itself deleted by this phase). Shell pins that the deleted symbols have no remaining callers.
`tests/host/test_project_cmd.sh` copy assertions must stay green untouched — if they need editing,
the delete went too far. Mutation-verify ([[schwung-mutation-test-commit-first]]).
Hardware acceptance: duplicate a project in the picker → the copy opens with the source's clips
and routing; create a new project → opens blank.

### Phase A — bind-mount swap (independent, second)

1. `davebox-heal.c`: `--mount-sets` / `--umount-sets` (hardcoded paths;
   `umount` only if `mountpoint`). Update `build-heal.sh` if flags/defines change.
2. Rewrite `set-swap.sh`: `enter` = save native index → heal mount → write SA index;
   `exit`/`recover` = umount-if-mounted → restore native index → save SA index.
   Keep verbs and env-overridability (the test rig depends on it).
3. `launch.sh`: umount on every post-enter refuse path.
4. `install-privileged.sh`: oneshot keeps calling `set-swap.sh recover` (now trivial).
5. `check-config.sh`: pin the heal verb literals + mount paths.

Tests: rewrite `tests/host/test_set_swap.sh` — the mount itself cannot run in CI, so
split the script's *logic* (index bookkeeping, phase marker, idempotence with a stubbed
mount helper injected via env, exactly how xattr/Settings degrade today per
`set-swap.sh:28-32`) from the *mount* (hardware). Update
`tests/host/test_launch_project_workspace.sh` / `test_project_template.sh` pins.
Mutation-verify the new pins ([[schwung-mutation-test-commit-first]]).
Hardware acceptance: enter/exit round-trip; project created mid-session lands in
library; kill -9 the supervisor → recover umounts; reboot mid-session → natives present
at boot; **fact 6**: start stock Move with the mount active, load a set through it.

### Phase B — MODULE half co-location

⚠⚠ **THE RESERVED-NAME FILTERS SHIP IN THIS PHASE, NOT PHASE D.** Found by adversarial review,
2026-08-12; the original ordering was destructive. Phase B is what first creates a SECOND child
under a uuid dir, and `os.listdir()` is **unsorted**, so the moment it lands the four one-child
sites can pick `dAVEBOx` as the set:

- `do_rename` (`project-cmd.sh:492-496`) feeds `inner[0]` to `mv` at `:533` — it would **relocate
  the state directory** and never touch Move's set. Corruption, not cosmetics.
- `do_copy` (`:264-270`) can copytree the state dir *as* the set (a "project" with no `Song.abl`);
  and even when it picks correctly its seeding half (`:293-302`) still reads the OLD module root,
  so **every copy made between B and D loses its module half** — re-creating the copy-isn't-a-
  snapshot bug this plan exists to kill (archive worklog (16)).
- `do_list` (`:129-131`) and `select-list.sh:43-45` display `dAVEBOx` as a project name at once.

So Phase B must land steps 1-3 **and** 4-5 together, or be merged with Phase D outright:

1. `seq8.c:93-94` format strings → `Sets/<uuid>/dAVEBOx/…`; create_instance active-set
   source → `$DBX_DIR/active_set.txt` (`:4387`); `state_uuid` via stored field
   (`:6315-6330`). ⚠ Review the SELECT-BEFORE-LOAD marker skip at `seq8.c:4472-4486` in the same
   pass — it is outside the cited range and an implementer editing only `:4384-4399` will miss it.
2. `ui_persistence.mjs`: `uuidToStatePath`/`uuidToUiStatePath`/snapshot paths → new
   layout (`host_ensure_dir` the `dAVEBOx/` dir before first write).
3. No migration (clean break).
4. **The four reserved-name filters** (`project-cmd.sh:129-131, 264-270, 492-496`,
   `select-list.sh:43-45`) + the `check-config.sh` pin of the name.
5. **`do_copy` re-pointed** at the new module path — or promoted to the whole-uuid-dir copytree
   from Phase D. Either is fine; leaving it reading the old root is not.

⛔ **Gate:** Phase B is not shippable without 4 and 5. `test_project_cmd.sh`'s copy/rename
assertions must pass with a `dAVEBOx/` dir present in every fixture — add that to the fixtures
FIRST, watch them fail, then fix. (`do_delete` is safe throughout — it rmtree's the whole uuid dir
at `:362` before any inner-name logic. Verified, no action.)

Tests: the existing behavioural C harness already overrides `SEQ8_*` dirs for exactly
this (`seq8.c:57-63`) — point fixtures at a fake `Sets/<uuid>/dAVEBOx/` and run
`test_state_roundtrip.c` / `test_state_migration.c` against the new shape. Eval-level JS
test in `davebox/tests/js/` (idiom: `test_picker_boot.mjs` — stub `host_*`, eval the
real module, assert what lands in the in-memory fs) proving save/sidecar/snapshot writes
land under `Sets/<uuid>/dAVEBOx/` and honour the `SEQ8_STATE_PREFIX` fallback rule
(⚠ the unbundled-test define trap, worklog (22)).

### Phase C — HOST half co-location

1. `shadow_ui.js:13996, 14000-14001, 15611` → `…/dAVEBOx/host`; delete
   `detectCopySource` + `copy_source.txt` + the copy-seed branch (items 10, 12, 13).
2. `shadow_set_pages.c`: delete the copy heuristic trio (item 11); re-point
   `SET_STATE_DIR` consumers that survive (batch migration — or gate it off for the SA
   build; decide at implementation after the shim-restore-path grep in Risks).

Tests: `tests/host/test_slot_settings_are_per_set.sh` and
`test_slot_state_roundtrip.sh` re-pinned to the new path shape; a source-invariant pin
that `shadow_ui.js` contains no `"/set_state/"` concatenation outside
`SLOT_STATE_DIR_DEFAULT`. Hardware: set switch round-trip (routing follows the project),
exit-to-stock/relaunch state intact (fact 1's own path).

### Phase D — project-cmd collapse + reserved-name filters

1. `do_copy` → single `copytree(uuid dir)` + inner rename + xattrs (delete item 14).
2. `do_delete` → rmtree of the set only (delete item 15; the OPEN-project guard at
   `:321-354` stays).
3. Reserved-name filter at the four sites (item 19); pin the spelling.
4. Delete `_rename_update_name_index` + call sites (item 7).

Tests: `tests/host/test_project_cmd.sh` rewritten — copy carries `dAVEBOx/` bit-for-bit,
copy is a snapshot (edit source after copy, destination unchanged: the exact 2026-08-11
bug, now structural), delete removes everything with one call, list/rename ignore
`dAVEBOx/`. Mutation-verify against the *load-bearing* lines
([[schwung-mutation-test-commit-first]] — anchor inside the function, worklog (22)'s
wrong-line trap).

### Phase E — delete the sync machinery

Items 1-9 (both pruners, tick branch, name index, inherit picker, copy-suffix family
machinery) plus their tests (item 23), and the `resolveSetLoadDecision` simplification
(item 20). One commit per subsystem so a revert is surgical.

Tests: delete `test_prune_respects_set_pages.c`, `test_name_index_delete.mjs`, the prune
sections of `test_project_cmd.sh`; add an eval-level JS test that a fresh uuid with no
`dAVEBOx/state` file loads blank with **no** inherit dialog (the new contract), and that
`resolveSetLoadDecision`'s two callers still agree ([[schwung-node-check-wrong-gate]]
— eval, don't `node --check`). Full `davebox/tests/run.sh` + `tests/host/` green;
hardware pass: create/copy/rename/delete/switch cycle, Move-native duplicate opens
blank (expected), exit-to-stock and back.

## What gets deleted (the selling point, countable)

1. `prune_orphan_states` handler — `sp_globals_state.c:95-151`
2. `seq8_set_uuid_alive` + the 4-root union — `sp_globals_state.c:33-72`
3. `SEQ8_SET_LIBRARY_DIR` / `SEQ8_SET_PAGES_DIR_A` / `SEQ8_SET_PAGES_DIR_B` — `seq8.c:75-89`
4. `do_prune` + its refusal ladder — `project-cmd.sh:539-632` (shipped 2026-08-12, worklog (22); superseded the same day it landed, and that is fine — it fixed a live leak the interim needed)
5. The tick prune branch + `S.pendingPruneOrphans` — `ui_tick.mjs:1891-1917`, `ui_state.mjs:544`
6. The name→uuid index: file, cache, `loadNameIndex`/`saveNameIndex`/`updateNameIndex`/`dropNameIndexUuid` — `ui_persistence.mjs:27, 61-107` + `ui_dialogs.mjs:1048` + `project-cmd.sh:88-90`
7. `_rename_update_name_index` + call sites — `project-cmd.sh:452-472, 517, 534`
8. `stripCopySuffix` / `findInheritCandidates` / `maybeShowInheritPicker` / `copyStateFiles` — `ui_persistence.mjs:53-58, 109-126, 140-188`
9. The inherit-picker dialog + `S.pendingInheritPicker` interlocks — `ui_dialogs.mjs`, `ui_tick.mjs:471, 674`, `ui_persistence.mjs:277`
10. `detectCopySource` — `shadow_ui.js:4329-4378`
11. `shadow_get_song_abl_size` / `shadow_set_name_looks_like_copy` / `shadow_detect_copy_source` — `shadow_set_pages.c:380-450`
12. `copy_source.txt` (concept + read) — `shadow_ui.js:14009-14016`
13. SET_CHANGED's copy-seed branch — `shadow_ui.js:14023-14053`
14. `do_copy`'s two-root state seeding — `project-cmd.sh:279-307`
15. `do_delete`'s two-root state delete (by-prefix module sweep + host rmtree) — `project-cmd.sh:372-397`
16. set-swap's rename machinery: `move_uuid_dirs`, `move_by_manifest`, `MANIFEST_NATIVE`, the entering/exiting phases — `set-swap.sh:89-121, 187-266`
17. set-swap's xattr save/restore — `set-swap.sh:129-169` + call sites
18. Tests pinning all of the above — `test_prune_respects_set_pages.c`, `test_name_index_delete.mjs`, prune sections of `test_project_cmd.sh`, most of `test_set_swap.sh`

Eighteen subsystems, roughly 1,000 lines of the most bug-prone code in the tree — every
one of which existed only because the filesystem didn't already say what it now says.
