# dAVEBOx SA — the Design-B set workspace

> Design doc, 2026-08-06. Implements the recorded Design-B decision
> ([`DBSA_SET_MODEL.md`](DBSA_SET_MODEL.md) superseding banner): **SA keeps its
> own live-set library, entirely separate from Move native's; native sets are
> never touched.** Grounded in code as of `schwungbox-host` `85bea767` —
> the set-pages machinery (`src/host/shadow_set_pages.c:780-990`) is the shipped
> precedent for every primitive this needs. **Design only — nothing implemented.**

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

## 11. Decisions for Josh

- **D1** — crash recovery: R1 (blessed oneshot unit, self-healing boots) or
  R2 only (healed at next SA launch; stock shows SA sets until then)?
- **D2** — import existing native sets: Sets-menu "Import from Move…" /
  one-time offer at first launch / none?
- **D3** — v1 management scope: list+switch+new only, or also
  rename/delete/duplicate?
- **D4** — naming in the UI: "Sets" (Move's word) or something davebox-own
  ("Sessions"?) — affects manual + menu labels.
