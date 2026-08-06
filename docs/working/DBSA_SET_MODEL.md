# dAVEBOx SA — set routing: which design?

> Decision document, 2026-08-04. Answers **Q4** of
> [`DBSA_SPEC_PLAN.md`](DBSA_SPEC_PLAN.md) — Josh asked for the tradeoff dug into
> rather than deciding blind.
> **Analysis only — nothing implemented.** Citations are leads to re-verify, and
> §7 lists real unknowns that need device experiments before any code is written.

## The problem

SA needs Move's tracks wired a specific way: **instruments 1-4 receive on channels 1-4, MIDI
out off.** Josh wants this automatic — users should "never have to mess with or even be aware
of" it.

⚠ **"MIDI out off" is not cosmetic — it is loop safety.** Move echoes injected cable-2 MIDI back
out on cable-2, and that echo cascade is a documented crash class
(`host/docs/MIDI_INJECTION.md:35, 55`). davebox's injection path depends on out being off.

Josh's spec described **two conflicting designs** without noticing they conflict.

---

## ✅ DECIDED (Josh, 2026-08-04): **C1**, plus a confirmation

> *"c1 seems like the right path. and maybe we can add a confirmation before an existing set is
> overwritten with new routing?"*
>
> **Added requirement — confirm before overwriting an existing set's routing.**
> ⭑ This composes well with C1's own logic: channels 1-4 is already Move's default posture, so a
> compliant set is a **no-op and must not prompt at all**. Only a set whose routing would actually
> change prompts — which is exactly the minority of deliberately-rewired sets, and keeps the feature
> invisible for everyone else as intended.
>
> ⚠ **OPEN: where does the prompt appear?** The rewrite happens in `launch.sh`, *after* the stock
> stack has been killed — there is no UI alive at that moment. Options to cost out: (a) give the
> launcher a pre-handoff UI phase in stock Schwung; (b) let davebox boot, detect non-compliance,
> prompt, then rewrite and trigger a Move reload; (c) something else. **Not yet investigated.**

### ⚠ Correction to the prior-art assumption (checked 2026-08-04)

Josh recalled *"we've tested similar things in the past (like writing bpm into live sets) and it's
worked fine."* The recollection is real but **proves a different thing**, and the difference matters:

- **Nothing in either repo writes to an existing Move set.** Every `Song.abl` access in the host is
  read-only (`grep` over `src/` for writes into `UserLibrary/Sets` returns nothing).
- The tempo work (`4628b53f` "Link tempo override from Move sets") **reads** the BPM out of a set
  and writes it to a *separate* file, `/data/UserData/schwung/desired-tempo`
  (`host/src/shadow/shadow_ui.js:15750-15757`). The set is never modified.
- davebox's export **does** author a `Song.abl` from scratch — but into an `.ablbundle` consumed by
  **Ableton Live**, off-device (`davebox/ui/ui_export.mjs:1-13`), not by Move's firmware.

**So: "we can author this JSON correctly" is proven. "Move's firmware will reload a set file we
rewrote in place" is NOT.** That is experiment #2 in §6 and it remains the gate. Do not skip it on
the strength of the export work.

## Bottom line

**Design B is dominated — reject it.** It still contains Design A's hard part, adds the worst
failure mode of any option, and creates a set-picker UX problem that contradicts the goal that
motivated it.

**Recommendation: a third design, C1** — rewrite the user's set at SA launch, archive the replaced
values, and **never restore on exit.** Everything genuinely dangerous in Design A lives in the
restore half; C1 deletes that half.

---

## 0b. NEW DIRECTION (Josh, 2026-08-04): davebox as a separate workspace

> *"the idea i'm leaning toward is for davebox to be an entirely separate workspace that doesn't
> generally interact with the native sets."*

⭑ This is **the** condition §5 named as the only legitimate reason to revisit Design B: a deliberate
product decision that SA is its own appliance with its own content namespace. B lost as a *routing
fix*; that is a different question from the one being asked now.

### Findings from the follow-up investigation (all verified in code)

**⚠⚠ Set pages is NOT a second Move instance with its own sets.** (Correcting an assumption.) It
physically `rename()`s the set folders out of `Sets/` into `set_pages/page_N/`, moves the other
page's folders in, rewrites `currentSongIndex`, and restarts Move
(`host/src/host/shadow_set_pages.c:830-880`). **It IS Design B's swap** — so it is not a free
precedent for isolating davebox's sets; it is the risky pattern, already shipped. Upstream carrying
it does not make it safe.

**✅ "Slots exist before sets do" is supported by the code.** Sets are matched by a `user.song-index`
xattr against `currentSongIndex` (`shadow_set_pages.c:474-530`), and the shim carries an explicit
**pending path** — `sampler_pending_song_index`, *"unresolved currentSongIndex without UUID dir
yet"* — that retries until a folder appears. That is the host handling **a slot index with no set
folder**, exactly the model Josh described. ⚠ The count (32) is a firmware fact, not in our code —
still needs the device.

**✅ Launching straight into davebox survives set selection.** Today the shim raises the open-tool
command at init, the moment it sees the launcher's marker (`host/src/schwung_shim.c:3245-3250`). Move
the *trigger*, not the mechanism: keep the marker as the intent and consume it at the **first
resolved set-load** instead of at boot — the shim already polls for that (~1.4 s). Flow becomes:
Move boots → user picks a set → davebox opens itself. No extra step, both signals already exist.

### Which reframes the design a third way

Point 3 collapses the workspace idea into something much cheaper than a library swap: **davebox does
not need its own library, it needs sets it is allowed to own.** If davebox works in designated slots
rather than the user's existing sets, the isolation is achieved with **no stashing, swapping or
restoring**, and "rewrite routing at launch" becomes safe because it is rewriting a davebox set.

The open question stops being *"how do we protect the user's sets"* and becomes *"how does a slot
become a davebox slot"* — a far easier question. Call this **design D**; it is distinct from both B
and C1 and is not yet costed.

⚠ Two device unknowns gate it: whether the untouched-slot model really behaves that way, and whether
Move shows a picker or auto-loads here (which decides whether the deferred-open work is needed).

## 1. The designs

**Common ground (verified):** sets at `/data/UserData/UserLibrary/Sets/<UUID>/<Name>/Song.abl`;
current set identified by `currentSongIndex` in `Settings.json` matched to a UUID via the
`user.song-index` xattr (`host/src/host/shadow_set_pages.c:477-573`). The two fields are per-track:
`midiInputMode` (`[N]` = 0-based channel; `"auto"` on Note-created sets) and `midiOutputEndpoint`
(`davebox/ui/ui_export.mjs:94-104, 378-379`). **Move restarts on both SA entry and exit anyway**
(`host/standalone/scripts/launch.sh:71-109`), so no design costs an extra reload.

### A — rewrite in place, restore on exit (spec L16)
Launch: dbus `saveSongIfDirty` first (set pages does this; `launch.sh` does **not** today, so
without it you rewrite a stale file) → resolve set → parse → **validate** → record originals to a
pending marker → patch tracks 1-4 → atomic `tmp`+`rename` → boot.
Exit: re-read the **current** `Song.abl` (Move has been saving all session — it is a different file
than at launch) → re-patch only the two fields back → drop the marker.
⚠ **Never restore a whole-file backup — that erases the user's session work.**

### B — SA-owned set library (spec L14)
Stash all of `Sets/` aside, swap in an SA pool, reverse on exit. The machinery is real and shipped
as **set pages** (`shadow_set_pages.c:580-927`: xattr save/restore, whole-dir `rename()`, recovery
manifest, `currentSongIndex` rewrite, Move restart).

⚠ **B does not escape the rewriter.** SA-pool sets still have to get correctly wired — new sets get
firmware defaults, imported sets carry the user's routing. **B = A + a library-swap layer + a UX
problem**, not an alternative to A's hard part.

### C1 — rewrite on first use, never restore (recommended)
Same launch steps as A. Then archive the replaced values to
`/data/UserData/dbx-host/routing_original/<uuid>.json` — **passive, never auto-applied** — and stop.
No exit step, no pending marker, no restore-vs-user-edit ambiguity, no crash asymmetry.

⭑ **The fact that makes this palatable:** ch-1-4 receive is *already Move's default posture*
(`host/docs/ADDRESSING_MOVE_SYNTHS.md:16-18`), so for most sets the rewrite is a near-no-op. Only
deliberately re-routed sets change, and their old values are archived. The routing becomes a durable
property of "sets you've used with davebox" — which is arguably just *correct*: a set davebox has
sequenced is a set whose wiring davebox needs next time too.

### C2 — runtime normalisation, file never touched (partial)
davebox already parses the set's `midiInputMode` map and could *adapt* instead of forcing 1-4; the
shim already rewrites/blocks cable-2 MIDI in flight (`host/src/schwung_shim.c:6128-6200`).
Best data-safety posture — but **it has a hole the file rewrite doesn't: the shim cannot make
firmware listen on a channel.** Two tracks sharing a channel, or `"auto"`, defeat it. C2 delivers
"usually reachable", not "always 1-4".
⭑ Keep the **out-off half** regardless — a shim-side echo guard is good defence-in-depth under any
design.

---

## 2. Failure modes, side by side

⚠ Precedent hazard: the stale `standalone_active` marker in `/data` survives a hard reboot and makes
every davebox Quit under stock a surprise restart (`_worklogs/OUTSTANDING.md:99-107`; written
`launch.sh:45`, removed only on clean exit `:116`). **A and B both add persistent intent-state of
exactly this family. C1 does not.**

| Scenario | A (rewrite + restore) | B (library swap) |
|---|---|---|
| Normal exit | Fields re-patched. Self-heals. | Pools swapped back. Self-heals. |
| Crash mid-session | Restore usually still runs; else pending marker heals at next launch. No work lost. | A half-run swap can leave `Sets/` holding a **mix** of SA and native sets. |
| **Hard reboot / battery death** | Restore never runs; stock boots with SA routing in one set. Confusing only — **all musical data intact.** | **Stock boots showing only SA sets — the user's whole library appears gone.** Nothing is actually lost (stash + manifest), but it *looks* like total loss, and a panicked "fix" (factory reset, hand-deleting folders) converts it into **real, permanent loss of musical work.** ⬅ decisive |
| Power loss mid-write | Atomic `tmp`+`rename` bounds damage to one orphan file. | The swap is a *sequence* of dozens of renames — interruption leaves a partial swap, recoverable only by manifest surgery. |
| Two SA launches racing | Second rewrite records already-patched values as "original" → restore pins SA routing forever (silent config loss). ⚠ `launch.sh` has **no double-launch guard** today. | Stashes the SA pool into the native stash — pool identity corruption. Same guard needed, higher stakes. |
| Firmware changes the set schema | Validation gate → abort to no-rewrite → feature silently off. ⚠ **Without the gate, a rewrite Move rejects makes that set unloadable** — the one way A can destroy access to work. | Swap is schema-agnostic, but a firmware migration while the native pool is stashed could leave xattr/index bookkeeping stale — unknown territory. B *also* runs the rewriter on SA sets. |
| User edits routing mid-session | Blind restore reverts a deliberate change → compare-before-restore. | N/A for native sets. |
| Set renamed / deleted while pending | UUID-keyed → rename-safe; deletion → skip and drop marker. | Renaming/deleting a native set is impossible during SA (stashed) — itself a behaviour change. |

**Which failures lose musical work:** none inherently in either design — **except** (A) a malformed
rewrite bricking one set's loadability (engineering-controllable), (B) whole-file restore if anyone
ever implements it that way (**must be a code-review prohibition**), and (B) user panic-response to
an apparently-emptied library — *not* engineering-controllable.

---

## 3. Cost

| | Build cost |
|---|---|
| **C1** | Smallest. One ~150-300-line helper (python3 is stock on Move and already used by davebox's `pack.py`; its `json` round-trips float formatting, which QuickJS does not) + `launch.sh` insertions. No shim / shadow_ui / davebox-UI changes. |
| **A** | C1 + the restore half + pending-marker heal (co-fix with `standalone_active`). |
| **B** | Refactor `shadow_set_pages.c`'s stash machinery for script-time use, **plus the A rewriter anyway**, **plus an entire davebox set-management UI** — the largest item in the whole spec by multiples, in a layer where nothing like it exists. |

---

## 4. Design B's UX problem (Josh flagged this himself)

Under B, "pick your set in stock before launching" dies by construction — the set the user picked
gets stashed at launch. The replacements:

1. **A davebox set browser** — list SA sets, select → rewrite `currentSongIndex` → full Move restart
   (~10 s per switch). Weeks of UI work; every switch is a reboot-grade event.
2. **A set-page-style gesture** — pages ≠ sets; you still need a browser within a page.
3. **First-run import of the current set** — softens the cliff but **forks the set**: stock and SA
   copies silently diverge. "Why doesn't my stock set have last night's work" is exactly the
   confusion being eliminated.
4. **"SA is its own world, start fresh"** — honest, but discards the affordance Josh explicitly
   praised (`DBSA_SPEC_SKELETON.md:16`).

⭑ **Every option makes users *more* set-machinery-aware. B fails the requirement that motivated it.**
The only reason to pick B is a product decision that SA is a separate appliance with its own content
namespace — and that shouldn't be smuggled in as a wiring fix.

---

## 5. Recommendation

**Build C1.** Reject B outright.

- B costs the most, still contains A's hard part, has the one failure mode that can cascade into
  real loss of musical work, and breaks pick-before-launch while creating an unsolved UX problem.
- A-with-restore is workable, but **everything dangerous in A lives in the restore half**: the
  pending marker (a second `standalone_active`-class bug), mid-session-edit ambiguity, the
  double-launch race, restoring against the wrong file. C1 deletes all of it.
- What C1 gives up — byte-honesty for the minority of sets with deliberate non-default routing — is
  bounded (values archived, change is *toward* the firmware-default posture) and invisible to
  exactly the users who should never be aware of any of this.

**Choose full Design A instead if** Josh decides byte-honest user sets are a principle — e.g. users
share sets between stock multi-device MIDI rigs and SA, where custom routing is deliberate and
out-off would break their stock workflow. Then: field-only restore, compare-before-restore, marker
unified with the `standalone_active` fix. Everything else here applies unchanged, since A ⊃ C1.

**Under any design:** fix the stale `standalone_active` bug in the same pass (liveness from
`/dev/shm`, intent from `/data`, one recovery pass) and **add a double-launch entry guard to
`launch.sh`** — it has none today.

---

## 6. Device experiments owed before implementing (~1 hour)

These are genuine unknowns from the code — do not implement on assumptions.

1. **`midiOutputEndpoint` vocabulary** — toggle a track's MIDI out in Move, diff `Song.abl`. Also
   confirms whether out defaults to off on new sets.
2. **Does Move accept a re-serialised `Song.abl`?** (number formatting, key order) — round-trip a
   sacrificial set through the planned patcher and reload.
3. **Move's behaviour on an unparseable `Song.abl`** — skip, or crash-loop? Corrupt a sacrificial
   set deliberately. This sizes the worst case of a botched rewrite.
4. **`user.was-externally-modified` xattr semantics** (`shadow_set_pages.c:46`) — does Move react to
   external edits? Unknown from code.
5. **Do `"auto"` / duplicate channels occur in Move-authored sets?** Sizes the rewrite's real-world
   frequency and C2's hole.
