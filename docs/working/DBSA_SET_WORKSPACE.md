# dAVEBOx SA — the Design-B set workspace

> Design doc, 2026-08-06. Implements the recorded Design-B decision
> ([`DBSA_SET_MODEL.md`](DBSA_SET_MODEL.md) superseding banner): **SA keeps its
> own live-set library, entirely separate from Move native's; native sets are
> never touched.** Grounded in code as of `dbxhost` `85bea767` —
> the set-pages machinery (`src/host/shadow_set_pages.c:780-990`) is the shipped
> precedent for every primitive this needs.
>
> ✅ **IMPLEMENTED + DEVICE-VERIFIED 2026-08-06** (same day): host `3dcdc618`,
> davebox branch `feat/sa-projects`. Entry/exit swaps, first-run template seed
> (DE-2: Move loads it), in-session new/switch via the supervisor loop, and
> hard-reboot recovery all verified on hardware. Two traps caught live and
> fixed: the song index must be applied AFTER Move exits (its SIGTERM teardown
> saves Settings.json over an early write), and the relaunch loop must kill
> the session sidecars before the SHM wipe (a surviving shadow_ui runs on
> deleted segments). Owed: Josh's hands-on of the Projects menu; DE-1.

## 1. The model

Move has exactly one live-set library: `/data/UserData/UserLibrary/Sets/`
(`Song.abl` per UUID dir, ordering via the `user.song-index` xattr, active set
via `currentSongIndex` in `/data/UserData/settings/Settings.json`). Move's path
is not configurable, so "SA has its own sets" means **swap the library at the
session boundary**, exactly as set pages already does between pages:

- **SA entry:** native set dirs are stashed (dir `rename()`, same filesystem,
  atomic per set) into the SA-private tree; SA's own sets move into `Sets/`;
  `currentSongIndex` points at SA's last-active set. The dbx `MoveOriginal`
  then boots seeing only SA's sets.
- **SA exit:** the reverse, with `currentSongIndex` restored to the value saved
  at entry. Stock boots seeing exactly what it saw before.

Both swaps run inside `launch.sh`, which brackets the session — the stock
stack is already dead at entry-swap time and the dbx host has already exited at
exit-swap time, so **nothing is reading `Sets/` during either swap**, and Move
restarts on both edges anyway (no extra reload — same "timing is friendly"
observation the old plan made for C1).

### Invariants

- **I1 — Native sets are never modified, only moved.** No rewrite, no routing
  patch, no restore logic. The entire C1 data-loss register disappears.
- **I2 — SA sets are born correctly wired.** Every SA set starts from a
  template `Song.abl` shipped by davebox (tracks 1-4 receive ch 1-4, MIDI out
  off). Routing enforcement at load time (old B8) dissolves — there is nothing
  to enforce because no set ever enters the library any other way (imports are
  the one exception; see §8).
- **I3 — Hard reboot mid-session must still yield a usable device, and native
  sets must be recoverable without expert knowledge.** See §4.
- **I4 — davebox per-set state follows automatically.** `seq8sa` state and the
  host's per-set state are keyed by set UUID under the (now private)
  `$DBX_DIR/set_state/` — SA sets keep their UUIDs across stash/swap, so
  nothing else moves.

## 2. On-disk layout (all under `$DBX_DIR`, the private tree)

```
$DBX_DIR/sets/
  library/            SA's sets while a session is NOT running (UUID dirs)
  native-stash/       native sets while a session IS running (UUID dirs)
  xattrs-library.txt  saved user.song-index attrs for SA sets   (set-pages format)
  xattrs-native.txt   saved attrs for stashed native sets
  swap_state          "none" | "sa-live"  + saved native currentSongIndex
                      — THE intent marker; written before the first rename,
                      updated after the last (crash tells us which phase died)
  manifest-*.txt      recovery manifests (set-pages format)
  template/Song.abl   the wired-correctly seed for New Set
```

Design rule carried over from the marker work: **liveness from `/dev/shm`,
intent from `/data`.** `swap_state` is intent; whether a session is actually
running stays with the boot-scoped `standalone_active` marker.

## 3. Entry / exit flows

**Entry** (insertion point: `launch.sh`, after the SHM wipe, before
`davebox-heal`):
1. While stock is still alive — in `quiesce-stock.sh` — fire dbus
   `saveSongIfDirty` (same call set-pages makes) so the native set's unsaved
   edits reach disk before teardown. ⚠ needs DE-1 (§10) to confirm the clean
   SIGTERM path doesn't already guarantee this.
2. Record native `currentSongIndex` into `swap_state`; set phase `entering`.
3. Save xattrs → stash native dirs → verify `Sets/` empty (count, like
   set-pages' inventory logging) → move SA library in → restore SA xattrs.
4. Write `currentSongIndex` = SA's last-active index; phase `sa-live`.
5. First run ever: library empty → copy `template/` in as "Set 1" (new UUID).

**Exit** (insertion point: after `MoveOriginal` exits, before the watchdog
resumes):
1. Phase `exiting`; save SA xattrs; move SA sets back to `library/`.
2. Restore native dirs + xattrs; restore saved `currentSongIndex`;
   phase `none`.

Both flows are pure `rename()` sequences over a manifest — idempotent and
resumable from any phase (each set dir is in exactly one of two places; the
manifest says which ones belong where).

## 4. Crash recovery — the one genuinely new problem

If the device hard-reboots mid-session, `Sets/` holds SA's sets and stock Move
boots into them. Nothing of the user's is lost (native sets sit intact in
`native-stash/`), but the device *looks* wrong — and we cannot run code at
stock boot from inside the stock install (it stays unmodified, by design).

Two candidate mechanisms:

- **R1 — recovery systemd unit (recommended).** The one-time `bless.sh` root
  step already exists; extend it to install a `davebox-restore.service` oneshot
  ordered `Before=move-launcher.service`. It runs a tiny POSIX-sh script:
  *if `swap_state` ≠ `none` and no session is live, run the exit-swap*. Boots
  are then always clean — the G4 sentence "turn it off and on again; you get
  stock Move" stays literally true, sets included. Cost: one more blessed
  artifact, same trust footprint as `davebox-heal` (closed verb set, hardcoded
  paths, no caller input).
- **R2 — heal-at-next-launch only (fallback).** `launch.sh` starts every
  session by completing any interrupted swap per `swap_state` (it must do this
  anyway — R1 can race or be uninstalled). Recovery affordance for the user:
  *"see unfamiliar sets after a reboot? Launch dAVEBOx and Quit."* Zero new
  privileged surface; the cost is a confusing interim state on stock.

R2's logic is required regardless; R1 is the difference between "self-healing"
and "healed on next launch". → **Decision D1.**

## 5. In-session set switching (the old B9, now real work)

There is no "pick your set before launching" any more — set selection lives in
davebox. Minimum viable surface (global menu → **Sets**):

- **List** SA sets (read `Sets/` UUID dirs + `Song.abl` names — while a session
  runs, `Sets/` *is* the SA library), current one marked.
- **Switch**: dbus `saveSongIfDirty` (Move is alive mid-session — the
  set-pages precedent), write `currentSongIndex`, restart Move *within the
  session*.
- **New Set**: copy `template/`, fresh UUID, next song-index, switch to it.

⚠ **The supervisor gap — the one structural change this needs.** `launch.sh`
treats `MoveOriginal` exiting as "session over" (watchdog restored, swaps
reversed). In-session switching requires a restart loop:

```sh
while :; do
  env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal
  [ -f "$DBX_DIR/relaunch_requested" ] || break
  rm -f "$DBX_DIR/relaunch_requested"
  rm -f /dev/shm/dbxhost-*          # same stale-ring hygiene as boot
done
```

davebox writes `relaunch_requested` (via the host's existing restart plumbing —
⚠ the C set-pages path calls `restart-move.sh`, which is WRONG inside an SA
session; the SA host's restart request must become this marker instead), then
lets Move exit. Everything else — boot_tool.json, splash guard, heal — already
handles the re-entry. `standalone_active` stays valid across the loop (same
boot).

## 6. What davebox needs from the host

Almost nothing new — the verbs exist:
- dbus save + `currentSongIndex` rewrite: shell-able from davebox via
  `host_system_cmd` allowlist, or a small host binding; pick at implementation.
- Restart-into-loop: the `relaunch_requested` marker (§5) plus teaching the SA
  host's restart request path to write it (generic: "a standalone session
  restarts its Move in place").
- Set enumeration: `host_read_file`/dir listing already suffices.

## 7. Set management scope (v1 vs later)

v1: **list, switch, new** (that's the minimum that makes SA self-sufficient).
Later: rename (text entry exists), delete (with confirm), duplicate,
reorder (xattr edit). Move-native gestures for these are hidden under SA
anyway, so nothing collides. → **Decision D3.**

## 8. Getting existing work in (migration / import)

Josh's current SA material lives in *native* sets (worked on before Design B).
Options: an **Import from Move…** entry in the Sets menu (copies a native set
— from `native-stash/` during a session — into the library; keeps the UUID so
existing `seq8sa`/host per-set state under `$DBX_DIR/set_state/<uuid>` starts
working immediately; imported sets are the one case where routing is NOT
template-born, so import is also the one place a routing rewrite still runs,
on the SA COPY only — I1 holds). Or: no import; start fresh. → **Decision D2.**

## 9. What this dissolves / what remains from the C1 plan

Dissolved: the confirmation prompt + its placement problem, archive-on-rewrite,
restore markers/opportunistic restore, the schema-drift abort path, the five
"does Move reload a rewritten Song.abl in place" experiments (we never rewrite
in place — Move always boots after a swap).
Remains (transformed): the template's routing correctness (I2, one-time
authoring + DE-2), import-time rewrite (§8, reuses the export-side Song.abl
knowledge in `ui_export.mjs`), and set-pages-under-SA (G2 row 8: **hide** —
this design replaces it wholesale).

## 10. Device experiments (all cheap, none block starting §5's davebox UI)

- **DE-1** — does the stock stack's clean SIGTERM save a dirty song, or is the
  explicit dbus save in quiesce required? (Edit a native set, launch SA
  without the dbus call, exit, inspect.)
- **DE-2** — template validation: does Move load our authored template
  `Song.abl` (fresh UUID, no xattr) and treat it as an ordinary set —
  index assignment, naming, saving?
- **DE-3** — mid-session `MoveOriginal` restart under the supervisor loop:
  clean SHM teardown/reattach, splash guard on re-entry, davebox state reload
  via UUID-mismatch path.
- **DE-4** — swap timing with a realistic library (~50 sets): renames are
  metadata-only, expect ms — confirm, since it sits in the launch path.

## 11. Decisions — ✅ ALL ANSWERED (Josh, 2026-08-06)

- **D1 = R1** — blessed oneshot unit (`davebox-restore.service`), installed by
  `bless.sh`, ordered before `move-launcher.service`. Boots always clean; R2's
  launch-time healing is still implemented as the required backstop.
- **D2 = start fresh** — no import path. The SA library begins with the
  template set. (§8's import machinery is NOT built; if it's ever wanted, the
  design there stands.)
- **D3 = list + switch + new** — v1 scope. Rename/delete/duplicate later.
- **D4 = "Project"** — the UI word for an SA set. Menu: **Projects**; entries
  "New Project", the manual speaks of projects. On disk they remain Move set
  dirs (`Song.abl` + UUID); "set" stays correct in code comments about Move's
  own format.

---

## 12. REVISED SELECTION MODEL (Josh, 2026-08-06): the native picker IS the project picker

> Supersedes §5's jog-menu as the *primary* selection surface. Investigated on
> hardware the same day — every mechanism below is an observed fact, not a
> guess. The jog Projects menu survives only as the later archive-management
> surface (§13).

**The idea:** Move's boot surface under a standalone session is its native set
picker ("Choose a Set", pads = sets), already interactive, already showing the
project library (the swap put it there). So: don't auto-launch davebox at
boot. Hold a **project-select phase** — Move owns pads and set management,
dbxhost owns the OLED with a "Select dAVEBOx project" screen — and launch
davebox when a project is chosen. Selecting a project loads the davebox
session tied to it (UUID-keyed state, already works) AND the Move instruments
it uses (the set itself).

### Observed facts the design rests on (hardware, 2026-08-06)

- Move boots the picker with the **last project auto-loaded**; a pad tap
  **immediately loads** that set (no confirm).
- **Pad note 68+k ↔ user.song-index k.** (Template seeding should use
  index 0.)
- **Tapping the already-loaded pad is silent** on every observable channel —
  the raw pad press (which the shim sees) must be the launch trigger, not any
  downstream signal.
- **Empty pad → native "Empty Set"**, materialized lazily (no dir until
  save). This is the native "new project" path; template wiring is applied by
  our post-selection hook (rewiring OUR OWN set is risk-free under Design B).
- **The screenreader `text` D-Bus signal narrates everything with TTS off** —
  "Choose a Set", set names, "Copy...", "<name> copied", "<name> Copy
  pasted", "Delete...", "Press pad again to delete <name>", "<name> deleted",
  the Shift menu items. The shim already listens on D-Bus; this is the event
  bus for the OLED-cede state machine.
- **Copy and Delete need NO jog** (paste = tap destination; delete confirm =
  tap again). **Only Shift+pad does** (Color submenu + per-set Cloud toggle).
- **Jog-click is inert in the picker natively** — free to claim.

### The phase, concretely

1. Session entry unchanged (swap, seed) — but no `boot_tool` auto-open.
   Splash → **"Select dAVEBOx project"** screen (shadow display on; we can
   show the touched pad's project name — we have `projects.json`).
2. Pads + Copy + Delete pass through to Move untouched. **Shift+pad is
   suppressed** during the phase (Josh's call: recoloring/cloud not worth a
   conditional jog; both remain available on vanilla Move).
3. **OLED cede:** on Copy/Delete button-down (raw CC) → `display_mode=0` so
   Move's confirm text shows; reclaim on button-up + settle delay.
   Announcements are the belt-and-braces (and tell us flow completion).
4. **Launch triggers:** any pad tap that is not part of a Copy/Delete flow →
   that project (after Move's load settles); **jog-click → resume the
   already-loaded project** (swallowed from Move — natively inert anyway).
5. Post-selection hook: if the chosen set is missing template wiring (native
   Empty Set, or a pad-copy), rewrite OUR set file and reload before davebox
   opens.
6. In-session project switch: suspend davebox → the same native picker →
   selection re-triggers davebox (the existing UUID-mismatch reload path) —
   the supervisor relaunch loop remains as plumbing for flows that need a
   true Move restart.

### What this obsoletes / keeps

- Obsoletes: the jog Projects picker as the selection UI (built 08-06,
  branch `feat/sa-projects`) — davebox-side picker code retires; the
  underlying `project-cmd.sh` verbs stay (list feeds the OLED name display;
  new/switch stay for programmatic use).
- Keeps: the whole swap/recovery machinery unchanged; native Copy/Delete
  replace the deferred "management pass" (D3) almost entirely.
- New davebox/host work: the select-phase state machine (shim + shadow_ui,
  fork-only, generic: "standalone boot-time set-select gate"), the
  post-selection wiring hook, Shift+pad suppression, jog-click claim.

## 13. Archive / backup (the 32-pad cap) — direction agreed 2026-08-06

Library stays ≤32 (the picker's addressable space). An `archive/` joins
`library/`/`native-stash/` with the same rename mechanics; the jog Projects
menu repurposes to "Archive project… / Restore from archive…", and a
`project-cmd backup` verb tars the library into `davebox-exports/` for
off-device backup via the manager's file browser. Not yet designed in detail.
