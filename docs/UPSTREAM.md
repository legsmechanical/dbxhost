# Upstream

How this fork stays aware of `charlesvestal/schwung` now that it no longer rebases onto it.

## 🔴 Before you port ANYTHING: name the dAVEBOx screen

**The point of watching upstream is to take what is useful TO DAVEBOX and make it work FOR
DAVEBOX** (Josh, 2026-09-09). dAVEBOx is the product; the host exists to serve it.

**Answer this in one line before writing code:**

> Which dAVEBOx screen shows this, and what does the user press to get there?

If the answer names a HOST screen — the chain editor, `enterComponentSelect`, Global Settings,
the host help viewer — **stop**. Find dAVEBOx's own equivalent first. A host-side change is
right only when it is PLUMBING that dAVEBOx calls into; never when it is the surface itself.

dAVEBOx's own hooks, for the common cases:

| upstream puts it in | dAVEBOx's actual surface |
|---|---|
| `enterComponentSelect` / the swap picker | `openBrowse` + `buildBrowseList` + `applyModulePick` (`davebox/ui/ui_sound.mjs`) |
| the host knob grid's trailing pages | dAVEBOx draws its own editor — `ui_sound.mjs` |
| Global Settings rows | `davebox/ui/ui_menu.mjs` |
| the host help viewer | ⚠ dAVEBOx has NO help screen — building one is its own decision |
| text entry / dialogs | `davebox/ui/ui_dialogs.mjs` (shared keyboard, already used) |

⚠⚠ **Every test can pass on the wrong surface.** Tests ask whether the code is WIRED, not
whether the screen is REACHED. #378 was ported into the host chain editor across four commits —
tested, mutation-checked, deployed, and invisible, because a dAVEBOx session never opens that
editor. `default_fx` cost months the same way: `ui_sound.mjs` records that it "never logged a
single line, because nothing reached the hook — the host seeds them from its OWN component
picker, which this UI never uses."

`upstream` is **fetch-only**. This fork does not replay its history onto upstream's; it reviews
upstream's new commits, takes what is worth taking, and records the decision here. That is the
whole discipline — a **watermark** plus a short table, replacing the 11-patch series and its
368-line README that used to be the mechanism.

## Watermark

| | |
|---|---|
| **Last upstream commit reviewed** | `8e1d99f4` — *release 1.4.0 (#483)*, 2026-09-09 |
| **Reviewed on** | 2026-09-10 (1.3.1 → 1.4.0, 10 commits; plus the backfill of the 33 the 1.3.0 survey left unlisted) |
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

### ⚠⚠ SURVEY THE COMMIT LIST, NOT A RELEASE RANGE (learned 2026-09-10)

**Every commit between the watermark and `upstream/main` gets a row. No exceptions, no
sampling.** Two features were lost to the alternative, in two different ways:

- **`#378` Module lists** landed 2026-08-31, just BEFORE the window the 1.3.0 survey started
  from, and just AFTER the window before it closed. Two adjacent surveys, one seam, nothing in
  between. Found only because Josh asked whether module lists were portable.
- **`#423` Boot selector** landed 2026-09-06, INSIDE the reviewed 1.2.0 → 1.3.1 window, and was
  never listed at all. That window holds 52 commits; the table below carried 19. The other 33
  were neither taken nor skipped — they were unwritten, which is the exact state this document
  exists to make impossible.

The check that would have caught both, run before writing any rows:

```sh
# every commit in the window, and whether this file already mentions it
for h in $(git log --format=%h <watermark>..upstream/main); do
  grep -q "$h" docs/UPSTREAM.md || echo "UNLISTED $h $(git log -1 --format=%s $h)"
done
```

⚠ A row may say **Unverified — needs the diff read**. That is a legitimate state and an honest
one: it says the commit was seen and the decision is owed. What is not allowed is silence.

⚠⚠ **A marker grep is not a presence check** ([[a-single-token-probe-is-not-evidence]]). This
fork splits the shadow UI differently from upstream — there is no `shadow_ui_global_grid.mjs`
here, and the settings live in `shadow_ui_settings.mjs` — so "upstream's file is absent" says
nothing about the capability. Rows below that rest on a filename alone are marked as such.

### Reviewed since the merge base

| Upstream | What | Decision |
|---|---|---|
| `b8ea14c3`, `c4f2e4e5`, `c4e57d24`, `83ecdbf0` | Catalog additions (Forge, Noisemaker, Work/Work In/Overwork, Beat Bank/Groove Bank) | **Skipped** — catalog only. This fork's catalog is not user-facing; see the note below. |
| `82cc1dac`, `120ba662` | Contribution-provenance policy docs | **Skipped** — upstream project governance, no code. |

Those 10 commits touch **no** `src/` or `schwung-manager/` file, so nothing was owed.

### Reviewed 2026-09-05 — v1.1.1 → v1.2.0 (21 real commits)

| Upstream | What | Decision |
|---|---|---|
| `a86d4428` #399 | Preset browser asked for the wrong name key, then latched the blank | **Taken** (cherry-pick) |
| `c145d512` #402 | Relative CC decoded only ±1 — accelerated encoders lost every fast turn | **Taken** (cherry-pick) |
| `0d5d193e` #384 | Tool time estimate never read `processing_ratio` | **Taken** (cherry-pick) |
| `b2c1b744` #394 | Forward-channel Auto asks the module | **Taken** (cherry-pick; Makefile TARGETS kept as the fork's list + `test_forward_channel`) |
| `39f60cbd` #407 | Link Audio: bound the backlog so a module load cannot park Move's audio 85 ms | **Taken** (cherry-pick; same Makefile resolution) |
| `dc73d948` #404 | Two knob multipliers are a MAX; an enum counts detents | **Held** (Josh) — folds into the KNOB FEEL item so one curve is tuned, not two |
| `a6fc6235` #415 | Enum list drew through device globals | **ALREADY HERE — the row was wrong.** ⭑ Corrected 2026-09-10: `src/shared/param_pages/enum_list.mjs` is **byte-identical to upstream** (`git diff upstream/main HEAD --` is empty), `ctx,` forwarded at the `drawMenuList` call with upstream's own comment. The file never diverged; nothing was owed to the library sync. |
| `98b5c3c7` #393, `2ff52653` #387, `51c11134` #389, `ccbe11ac` `57c3d13c` #411, `c315b95d` #385 | CPU monitor, defaults on, metronome, pad_layout/voices, snapshot recall | **Later, as roadmap items** (snapshot recall = board item 18's mechanism) |
| `5b6d4b18` #386, `121a79b6` #397 | Track tap = Stay; long-press Track toggles layers | **Assess first** — gesture surfaces davebox owns |
| `2272a1eb` #392 | Save Stems | **Skipped** — overlaps davebox's export pipeline |
| `c8cb169e` #405, `e36e8ab5` #410, `cfb9db55` #414 | drawCell frame, module card, frame_ctx primitives | **Already have** (this fork's own work, merged upstream; #414 to reconcile in the library sync) |
| `949af236` #413, `bfcb2011` #382, `a25af5b8` #417 | Test card, release commits | **Skipped** — no code owed |

> ⚠ The module catalog is fetched from **upstream's** `module-catalog.json` at a hardcoded URL, so
> catalog edits made in this fork do nothing. Shipping a module means a public repo, a release, and
> an upstream PR — not a commit here.

### Reviewed 2026-09-08 — v1.2.0 → v1.3.1

| Upstream | What | Decision |
|---|---|---|
| `45f728b8` | **#444** param contract to 128 KB, and the 1.2 MB frame off the callback stack | **Ported** (`6d704fe3`) — the CONSTANTS only. See the divergence below. |
| `bde219c5` | **#468** `param-slow`: name the key when a param serve eats the frame | **Ported** (`4b6b3032`), wiring adapted. Verified firing on hardware. |
| `b27cd8d4`, `52435f70` | **#464** `default_buses` + **#467** its queued-params fix | **Ported together** (`19005d7e`) — never #464 alone; see below. |
| `f97d5548` | **#466** a bus insert can say what it IS (`display_name` polling) | **PORTED `84845932`** — davebox consumer, scoped to the open bus and refreshed on ENTRY (upstream polls, to drive announcements we do not have). ⚠ Contract-honouring only: NO module implements the key, here or upstream. |
| `acad35ab` | **#472** a widget whose canvas.js failed to load was recorded as loaded | **Not portable as written, but THE DEFECT WAS HERE — fixed `3cb8b664`.** No `ensureComponentWidgets`/`widgetModuleLoaded` latch, so their patch had no target; the same defect lived in the CARD cache, keyed on the module's raw declaration and outliving every `load()`. Two modules using the same obvious filename shared an entry, and a failed load never retried. ⚠ "Their symbol is absent" ruled out a same-named latch, not the same defect — the row said NOT PORTED for a month while the bug sat here. |
| `f7c504be` | **#443** the CC claim key must turn on the display mode | **Ported `01fae0c7`.** Real gap found by the drift check: the shim clears `claim_cc_bits` on the display-close edge without telling JS, so a module's buttons went to Move for the rest of the session. ⚠ Upstream's test also asserts an `enterGlobalSettingsGrid` route this fork does not have — invariant ported, assertion not. |
| `e866597c` | **#438** the copy gesture READS the focus | **Already here** — `liveChildIndex`, `childIndexFromWire`, the notice and the gesture-cancel all present. Drift check only. |
| `55ef3881` | **#440** the grid asked its value cache with the CONCRETE key | **Already here**, cited in `evaluateVisibilityCondition` and using `gridListedKeyFor`. Drift check only. |
| `4c36a239` | **#442** voice-poc declares `focus_press_param` | **No target, verified.** Touches only `src/modules/sound_generators/voice-poc/`, a demo module this fork does not carry. |
| `7b8a83dc` | **#451** choosing a preset left the knobs stepping from the PREVIOUS one | **Ported `b205a95f`.** Both halves: the cached values/knob states are dropped, and a pending knob write is flushed BEFORE the index write. ⚠ Upstream's test does not cover the ordering — extended here. |
| `0c606999` | **#447** stop re-hashing a contract that has not changed | **Ported `d455d04d`.** Memoised on IDENTITY; premise (the controller never mutates the contract in place) verified in this fork rather than inherited. |
| `2aedc2c1` | **#446** two gaps in the module draw contract | **Ported `bb8d85f9`.** A viz GROUP could never carry `extra_keys`; the landing page can now opt into a subtitle. ⚠ This fork builds `g.roles` at TWO sites where upstream touched one — the second needs nothing, checked. |
| `249d5867` | **#450** "already resolved" asked about the PROCESS, so one widgetless module killed every widget until reboot | **BLOCKED on #420, not skipped.** This fork registers NO custom widgets — `registerOverlayWidgets` and `clearWidgets` have zero callers, so the registry it fixes is never populated and cannot be wrongly emptied. The shared-library half of #420 is already here; the ~110 lines of `shadow_ui.js` wiring that would call it are not. Port #420 first. |
| `59400051` | **#445** report a `visible_if` that only exists in chain_params | **Ported `6286503c`**, NARROWED. Upstream matches a level entry with `item.key \|\| item.param`, but the planner's `keyOf()` never reads `.param` (identical in both trees) — so their version silences the warning for a contract that really is broken. Ported as `item.key` only, case pinned. |
| `e3888ab4` | **#421** hand modules their state COMPACT, never the pretty file slice | **Ported `c6340a7a`.** ⚠⚠ Was HALF-ported: `json_compact.h` was present, byte-identical and `#include`d, and **called by nobody**, with both tests missing. Bug was LIVE. ⚠ THREE sites here vs upstream's two (MIDI FX are fork-only) — the ported test found the third. Fork's `state_fits()` guard kept. |
| `f2835420` | **#430** the sampler's preroll trim never ran — the WAV was write-only | **Ported `90ef82a5`.** Live here: `fread` on a `"wb"` stream returns 0, so the copy never moved a byte and the `ftruncate` ran anyway — the count-in was kept and the take's tail cut. Took upstream's extracted, unit-tested helper rather than only the mode, because the arithmetic had never once executed. ⚠ No stems in this fork; the guard pins their ABSENCE so it fails if they arrive. |
| `60df0d23` | **#434** the cell and the editor read ONE wave-format table | **Already fully here** — `wav_format.mjs` byte-identical, both consumers import it, no duplicate table in `shadow_ui.js`, `test_wav_format_readers.sh` green. The survey's "outstanding" note was stale. Our `wav_peaks.mjs` diverges only by the fork's own `wavPeaksHasIo()` export. |

### Divergences taken in this window — each deliberate, each pinned

**#444: we kept OUR fix for the 1.2 MB frame and took only the constants.** Upstream made
`chain_mod_refresh_target_param_cache`'s two buffers file-scope `static`; this fork had already
moved them onto the INSTANCE in `b96b5d0f`. Ours is stronger — a static is shared across all chain
instances, and this fork runs `SHADOW_UI_SLOTS = 8` against upstream's 4 — so porting upstream's
version would have been a silent regression to a shared scratch buffer. That prior fix is also
what makes the raise safe: the buffer grows +64 KB per instance, but it is a member of a `calloc`'d
instance, i.e. **+512 KiB of HEAP, not stack**. `tests/host/test_param_buffers_not_on_stack.sh` is
ported and ADAPTED: it exempts by REGION (struct vs function body), because chain_internal.h is
not declaration-only and a file-wide exemption could hide a real stack frame.

**#464: the seeding needed a BINDING here, and that is a fork-only file.** Upstream seeds
`default_fx` / `default_buses` from `applyComponentSelectionConfirmed`, its own component picker.
davebox — the only UI this fork ships — picks through `applyModulePick` and never reaches it, so
**`default_fx` had shipped here for months without ever firing once** and `default_buses` was inert
on arrival. `globalThis.host_seed_module_defaults` (fork-only) is what both consumers reach;
davebox calls it from its pick. Upstream needs no such binding and should not be offered one.
⚠ Both seeding tests now enumerate WHERE the seeding is called from and additionally read
`davebox/ui/ui_sound.mjs`, because seeding from a restore path would re-create buses the user
deleted on every boot.

**#466: PORTED as davebox's own consumer (`84845932`), with a deliberately different SCOPING.**
Upstream polls the open bus once a second; that poll also drives change-based ANNOUNCEMENTS (key
detection), which this fork does not have. For LABELLING the name only changes when the insert's
module or its `plugin_id` changes — both gestures that leave and re-enter the screen — so davebox
refreshes on ENTRY behind a (slot, bus) latch: ≤ `BUS_FX_SLOTS` reads when the chain screen opens,
zero per tick while it sits, never a sweep of `SLOT_BUSES × BUS_FX_SLOTS` at ~2.9 ms a round trip.

⚠⚠ **It is CONTRACT-HONOURING, not a live fix, and the earlier entry here claimed otherwise.**
**No module implements `display_name` — not one `.so` in this fork's module tree, and not one in
upstream's**, where the key appears only in the two CONSUMERS (`shadow_ui.js`,
`shadow_ui_buses.mjs`). That includes `clap`, which IS the Airwindows module (`abbrev: "AW"`, 500+
plugins via `plugin_id`) and the exact case the gap was written about. So four Airwindows inserts
still label identically, and closing that needs **clap to SERVE the key** — upstream's module, so a
PR there rather than a fork change ([[schwung-only-what-we-originated]]). Filed on the board.

**`SLOT_BUSES = 8` against upstream's 4.** Pre-existing, restated here because `default_buses`
makes it module-visible: a module may declare more buses on this fork, and the seeding loop simply
stops at the host's cap. Documented in `MODULES.md` for authors targeting both.

### Reviewed 2026-09-10 — v1.3.1 → v1.4.0 (10 commits)

| Upstream | What | Decision |
|---|---|---|
| `8e1d99f4` #483, `81692c66` #477 | Release 1.4.0; forge `min_host_version` bump | **Skipped** — no code owed. |
| `bea4ee3c` #480, `8f482522` #478, `d48a693f` #459, `ecc0ce9d` #471 | Catalog: MonkSynth, Pixel Walkers, Overwork Mix, Maze Voice | **Skipped** — catalog only, and this fork's catalog is not user-facing (see the note in the 1.2.0 window). |
| `71d0be92` #475 | Disable USB-C output persistence | **NOT APPLICABLE, verified.** Upstream's saved USB-C Main Out state could replay at boot and mute the built-in speaker; their fix rips the feature out (348 deletions). We never took it — `usbc_out_persist` has **0 hits** in `src/`. ⚠ Positive control run: `shadow_resample.c` IS present and DOES carry neighbouring `usb-c` handling (`:247`), so the zero is a real absence and not a probe that could not fire. |
| `abfe4ec0` #476 | `pad_block` could outlive the component UI that raised it | **PORTED `409c70ff`**, adapted (upstream's `test_pad_block_lifecycle.sh` filename not taken). Merged via `fix-476-pad-block-stranding` → `b1b68b72`. |
| `d3217ee2` #479 | **Spkr EQ setting — Auto / Off / On** | **DEFERRED (Josh, 2026-09-10): _"we may need it later but i don't want to mess with it now."_** Not skipped — absent and undecided. What it is: the shim emulates Move's `MoveSpeakerEnhancer` gated on the headphone jack and biased hard toward OFF, because a stray CC 115 "speaker" with headphones in is the hollow-audio bug. A device whose XMOS insists on "speaker" with a jack in cannot silence the EQ; one that never settles on speaker never gets it. `#479` adds the escape. ⚠ **Two reasons it is not a casual port:** it APPENDS `speaker_eq_mode` to `shadow_control_t`, and that struct's `sizeof` is a contract between two binaries; and its surface is Global Settings → Audio, whose dAVEBOx equivalent is `davebox/ui/ui_menu.mjs`, not a host settings row. |
| `897ceea4` #482 | **Boot-target registration through Schwung Manager** | **Not ported; the RISK is the reason to read it, not the feature.** 6,475 lines across 29 files, but **zero `src/`** — it is all `schwung-manager/` Go (`boot_registry.go`, `boot_reconcile.go`, `platforms.go`, `boot_target.go`, the Boot and Platforms pages) plus docs. On its own it is the browser-side registration UI for the selector `#423` shipped. See the `#423` row in the backfill below: that is the item with teeth for dAVEBOx SA. |

### Backfill 2026-09-10 — the 33 commits the 1.3.0 survey never listed

⚠ The 1.2.0 → 1.3.1 window is **52 commits**; the table above carried 19. These are the rest.
Two carry real consequences (`#423`, `#424`); most were already here, taken silently during the
buses and param-pages work without ever getting a row.

**Docs, catalog and release commits — no action beyond being written down:**
`546cd953` #462, `28849c96` #448, `027021fd` #454 (docs); `7995808b` #458, `88dfcca1` #456,
`70c95aec` #452 (catalog); `8d714811` #470 and `aa4d8f33` #473 (the 1.3.0 and 1.3.1 release
commits — version bumps and changelog, no code).

| Upstream | What | Decision |
|---|---|---|
| `5dadcf38` **#423** | **Boot selector: chainload Schwung, stock Move, or a third-party target** | 🔴 **NOT PORTED, AND NEVER SURVEYED — the miss this backfill exists for.** 3,455 lines, 29 files, squarely in `src/`. Upstream main carries `src/boot-select.c`, `src/host/boot_select_core.c/.h`, `src/host/boot_target_lib.sh`, `src/schwung-entry.sh`; **this fork has none of them**, and our `src/shim-entrypoint.sh` diverges from theirs by 58/66 lines. What it does: `/opt/move/Move` becomes a thin Schwung-owned entrypoint that shows `Loading <name> — press Back to change` for ~2s, then execs a registered target; a third party drops `/data/UserData/boot-targets/<id>/boot.json` plus an entry script and appears in the picker. ⭐ **Why it matters to dAVEBOx SA:** this is our launcher's problem, solved upstream by a different mechanism — SA is reached today by booting stock, opening Tools, and relaunching Move under `dbx-host`. ✅ **NOT a collision — checked, 2026-09-10.** An earlier draft of this row claimed one; the code refutes it. The selector's contract forbids a platform from rewriting `/opt/move/Move`, `/usr/lib/schwung-shim.so` and `/etc/ld.so.preload` ("will be silently reverted, or will fight heal, which is worse"). **`standalone/` rewrites none of them** — it launches with `env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal` (`launch.sh:433`), i.e. OUR shim over stock's untouched original. Grep for those three paths across `standalone/` returns only prose in `README.md` and the launcher's own `LD_PRELOAD` line. ⭐ **The dependency #423 would actually retire is a different and worse one**, already documented at `launch.sh:6-30`: dAVEBOx SA is invoked by **stock's** `launch-standalone.sh`, which lives in a tree we do not control and whose behaviour has **flipped twice silently** (pre-kill → no pre-kill → pre-kill again at v1.0.0, taking the `pidof` guard with it) — each flip a live breakage. A published `boot.json` + `entry.sh` contract replaces that with something upstream cannot change under us. → [[stock-tree-is-not-ours-own-what-we-run]] |
| `f60bf2c5` **#424** | Retire Updates, Module Store and the File Browser toggle; add the Web Manager QR screen | **NOT PORTED — and the evidence is content, not a filename.** `filebrowser_enabled` is still a row in `src/shared/settings-schema.json:42`, and the 33 MB `libs/filebrowser/filebrowser` binary is still shipped and still built. Upstream deleted both. ⚠ Its surface is Global Settings, so under the gate at the top of this file the dAVEBOx question is `ui_menu.mjs`, not the host grid — but the **payload weight and the dead settings row are ours either way**. Worth sizing. |
| `bde51a56` #455 | Restore hardware `audio_in` for both overtake roles, not only the generator | **ATTEMPTED AND DELIBERATELY REVERTED 2026-09-09; PARKED.** Upstream's fix is a pure hoist within ONE function; this fork splits the two roles across two functions on two paths — generator in `shadow_inprocess_render_to_buffer()` (`schwung_shim.c:8885`), FX `process_block` in `shadow_inprocess_mix_from_buffer()` (`:5892`). Hoisting inside `render_to_buffer` reaches only the role that already worked. Needs the per-frame ORDER of those two calls established, and the restore placed where both see fresh data without paying the `AUDIO_BUFFER_SIZE` memcpy twice a frame. |
| `06c9d24a` #457 | `audio_in` restore stands down while the resample bridge is applying | **Blocked on #455** — the follow-up to a fix this fork does not carry. `src/host/audio_in_restore.h` absent, verified as a FILE (the header is upstream-only, not a fork rename: no equivalent guard exists on either of our two paths). |
| `30c73aeb`, `953f97e5` | `schwung-heal` installs and resolves a **standalone tool's** staged helper | **NOT PORTED — read before the next `install-sa.sh` change.** `src/host/heal_tool_id.h` absent; `src/schwung-heal.c` carries no tool-id resolution. ⭐ Directly adjacent to a known SA trap: a stock install strips setuid from `davebox-heal` ([[stock-install-unblesses-davebox-heal.md]]). Upstream now has heal do this staging for a tool the way it does for itself. Pairs with `#423`/`#482`. |
| `2f92abdc` #431, `6604d861` #439 + `5d22a68e` | `install.sh`: a payload older than the selector is a DOWNGRADE, not a corrupt tarball; tolerate a missing preselector boot default | **No target while `#423` is unported** — both are selector-aware `scripts/install.sh` logic. Revisit with `#423`. |
| `9b58ea40` #460 | Module dependencies, and modules declaring the FX behind them | ✅ **RESOLVED 2026-09-10 — SPLIT VERDICT.** Its `shadow_ui.js` half is **already here**: `moduleDefaultFx`, reading `capabilities.default_fx` off the module metadata, lives at `shadow_ui.js:3577` (it arrived with the #463/#464 work). What is absent is the **`schwung-manager` half** — module dependencies in the WEB MODULE STORE. **Skipped:** that is the browser install UI, and this fork's catalog is fetched from UPSTREAM's `module-catalog.json` at a hardcoded URL, so it is not a surface we own. Not dAVEBOx work. |
| `f5d42aa1` #449 | Step + volume knob is a VELOCITY edit, and the volume scanner read it | 🔴 **RESOLVED 2026-09-10 — ABSENT, AND THE BUG IS LIVE. PORT IT.** Move's per-step velocity edit draws a velocity overlay in the SAME ROWS as the master volume bar, so the pixel scanner reads it as a volume bar and drags mailbox gain down with the velocity. ⭐ **Half the gate is already here and the other half is not**: `schwung_shim.c:6005` reads `shadow_volume_knob_touched && shadow_held_track < 0 && shadow_pads_held == 0` — the PADS-held term exists, the STEPS-held term (`shadow_steps_held_mask`, notes 16-31) does not. ⚠ Take upstream's MASK, not a counter: `midi_monitor()` only processes a MIDI_IN slot whose first four bytes CHANGED, and events shift between slots, so the same note-on can be seen twice — a counter drifts and a drifted counter latches the scanner off forever. ⓘ Reachable in CO-RUN, where Move's own editor owns the steps; in dAVEBOx's sequencer the steps and Shift+Volume are dAVEBOx's own. |
| `4c874ad4` #432, `b5aacd68` #436 | Wake idle synth slots when MIDI FX timers emit; the wake follows DELIVERY, not emission | 🔴 **RESOLVED 2026-09-10 — ABSENT, AND THE BUG IS LIVE. PORT IT.** `chain_take_midi_tick_wake` has **zero hits** in `src/`, and **we carry the exact idle path upstream patched, unpatched**: `schwung_shim.c:1804-1810` increments `shadow_slot_silence_frames`, and on a non-probe frame sets `shadow_slot_deferred_valid[s] = 1` and skips the synth render. So a chain-hosted MIDI FX timer (a delay's echoes, an arp's notes) that emits while its synth is idle has nothing to play it — the notes are dropped. Upstream's fix asks the chain for a one-shot wake before deciding to skip. ⓘ Host + chain DSP; the two commits go together (#436 is #432's correction — the wake must follow DELIVERY to the synth, not emission). |
| `d53f10f1` #428 | Wave editor reads 24-bit WAV and AIFF | **ALREADY HERE, via the shared table.** `shadow_ui.js:236` imports `wav_format.mjs`, which handles `pcm24le`/`pcm24be`, `WAVE_FORMAT_EXTENSIBLE` (0xFFFE — how ffmpeg and sox write every 24-bit WAV) and signed 8-bit AIFF. Arrived with `#434`, which the window above already records as fully present. |
| `382deb5b` #441 | The `extra_keys` cap the docs promised, from one constant | **ALREADY HERE.** `page_plan.mjs:23` imports `MAX_DECLARED_EXTRA_KEYS` from `viz.mjs` and applies it at `:476`. |
| `4fc36731` #425, `891982ce` #435 | A module may claim buttons (`claims_ccs`, `claims_edit_ccs`); a held button survives the display close | **ALREADY HERE.** Both markers present across 4 and 8 files; `tests/host/test_claims_ccs.sh` present. `#443` in the window above is the later fix ON this feature, and was ported — it could not have been if the feature were missing. |
| `856ec1b2` #426 | A module may be told about live pad presses (`child_press_param`) | **ALREADY HERE** — marker across 9 files including `page_input.mjs`, `voices.mjs`, `child_key.mjs`. |
| `1d663c7d` #427 | `visible_if` resolved against the list editor's slot, and failed open on the grid | **ALREADY HERE** — `tests/host/test_grid_visible_if_context.sh` present. `#440` above (the concrete-key fix on the same path) is recorded as already here for the same reason. |
| `e7bcd159` #429 | Hold Copy or Delete, then pick an instance — copy, clear and undo for child levels | **ALREADY HERE** — `tests/host/test_child_copy_gesture.sh` present. `#438` above (the copy gesture reading the focus) is its follow-up and is recorded as present. |
| `0006840f` #422 | Enum peek: a LIST never peeks, and 700 ms was shorter than the header | ✅ **ALREADY HERE — BOTH HALVES, verified 2026-09-10.** The timing: `ENUM_PEEK_MS = 1500` (`page_controller.mjs:383`) against `TURN_CLAIM_MS = 1200` (`:356`), i.e. the peek outlives the header's claim, which is the rule the commit establishes. The LIST guard: `s.layout !== LAYOUT_LIST` leads the peek condition at `:3457`. ⚠ **One drift found while checking**: `davebox/ui/ui_movy.mjs:2785` keeps `MV_ENUM_PEEK_MS = 700` with a comment claiming it is "upstream's ENUM_PEEK_MS, carried verbatim so the two surfaces cannot drift" — they have drifted, 700 vs 1500. It is DORMANT (its own note says the peek is off unless a caller opts in, and no davebox caller does), so nothing is wrong on screen; the constant and its comment are the stale part. |
| `c4b27647` #433 | Let custom pages read hidden canvas state | ✅ **ALREADY HERE, verified 2026-09-10.** `declaredCanvasExtraKeys(p)` feeds `extraKeys` into the plan (`page_plan.mjs:470`, `:504`) and they join the staggered read rotation rather than the draw path — which is the commit's whole point. ⓘ Moot in practice until #420's widget wiring lands (nothing here registers a custom page to read the state with), but present.|
| `8ebcbe66` #463 | `default_fx` can name a factory PRESET, not only params | **Unverified — and probably moot.** `default_fx` is handled in `shadow_ui.js` (`:3577`), but ⚠⚠ `ui_sound.mjs` records that `default_fx` "had shipped in this fork for months and never logged a single line, because nothing reached the hook — the host seeds them from its OWN component picker, which this UI never uses." Extending a hook dAVEBOx never reaches is the exact failure the gate at the top of this file exists to stop. **Do not port without first answering which dAVEBOx screen seeds an FX chain.** |
| `523205ba` #461 | Unbundle `velocity_scale`, stop shipping `voice-poc` | **PARTIALLY here, by accident.** `voice-poc` is absent (never carried — which is why `#442` above is "no target, verified"); `src/modules/midi_fx/velocity_scale/` is **still shipped here**. Upstream moved it to the catalog. Ours to decide: unbundling it is payload weight, and this fork's catalog is not user-facing, so a user who loses the bundled copy has no route to get it back. **Recommend: keep it bundled, deliberately** — and this row is that decision being written down. |

### Also resolved in this pass — items the board carried as open

- **`#350` Move's selected track follows a track long-press slot switch** (`ee07f870`) —
  **NO TARGET, verified.** It fixes a divergence between the shadow UI's slot and MOVE's selected
  track after a Track long-press, which with a HiJack kit leaves the editor showing one module
  while the pads play another; the fix injects a synthetic release/press/release tap and swallows
  the user's real release. **This fork has no track long-press at all** — `track_longpress_fired`,
  `track_swallow_release` and `LONG_PRESS_ACTIVE()` all have zero hits in `src/schwung_shim.c`;
  the macro went in upstream's `40d223b4` and the leftover call was the undefined-symbol bug this
  fork already closed. dAVEBOx owns the Track buttons for its own gestures. Nothing is owed.
- **`#372` module help is a jog from its knobs** (`bee45c58`) — **WORTH TAKING; Josh, 2026-09-10:
  _"if this is about allowing modules to display a help menu in the module editor UI then we
  should include it."_ It is exactly that.** A conditional **Module Help** row on the Module page
  at the end of a component's knob grid, above Swap and Remove — appearing only when the module
  ships a `help.json` with topics, because a row that opens an empty viewer teaches that the
  feature is broken. ⭐ **dAVEBOx already has that page**: `ui_sound.mjs`'s `trailingMenus()`
  returns a `Module` page carrying Swap Module / Remove Module, on Move buses and session buses
  alike. The Help row goes above those two, in a list dAVEBOx already builds. **Two things it
  needs that are not free:** (1) upstream's viewer is hosted by Global Settings, a screen dAVEBOx
  never opens — dAVEBOx needs its own, which is `scrollable_text.mjs` (present) plus a return
  pair; (2) content — 17 of 86 installed modules ship no `help.json`, **dAVEBOx itself among
  them**, so the row would condition itself away on our own module until we write it.
  ⭑ **Its shared-primitive half is worth taking on its own merits**, independent of the help door:
  `#372` exports `drawScrollbar` so text and rows get one bar, and kills a rogue
  `LINE_HEIGHT = 10` in `scrollable_text.mjs` that was throwing away a line of help per screen.
  This fork still has the split it fixes — **three** separate `LIST_LINE_HEIGHT = 9` declarations,
  in `chain_ui_views.mjs:13`, `list_geometry.mjs:142` and `menu_layout.mjs:21`.
- **`#420` module draw surfaces / `#450` "already resolved" asked about the PROCESS** — the
  existing rows stand, with the dAVEBOx consequence now stated. `widget_registry.mjs` is here in
  full, and **`registerOverlayWidgets` and `clearWidgets` have zero callers** — the ~110 lines of
  `shadow_ui.js` wiring that loads a module's `canvas.js` and populates the registry were never
  ported. **So no module can draw a custom cell in dAVEBOx's editor.** `viz.mjs:253` degrades an
  unavailable custom kind back into the detector pool rather than leaving a hole, so a module
  wanting a wave display, an envelope curve or a filter response gets **plain dials, silently and
  permanently**. `#450` is genuinely moot until `#420` lands (it fixes wrongly EMPTYING a registry
  that is never FILLED) — blocked, not skipped. ⚠ When the wiring is ported, apply the lesson from
  `3cb8b664`: this fork's own canvas-load defect lived in the CARD cache, and a failed load that
  records as a success is the same defect class `#472` fixed upstream.

## Module buses (#453) — ported, with three named divergences

Piece 1 (the module-facing half) is in as of 2026-09-08. The contract a module speaks is
IDENTICAL to upstream's, deliberately: `split_voices`, `move_plugin_render_split`, `bus<N>:` keys,
`default_buses`. A module written for either host runs on both.

This fork differs in three host-internal ways, none visible to a module, all pinned by tests:
`BUS_FX_SLOTS` separate from `MAX_AUDIO_FX`; `chain_drain_sends` taking int32 accumulators and a
float gain; and ONE producer of a bus send key rather than upstream's two. Full reasoning in
[`MODULE_BUSES.md`](MODULE_BUSES.md).

`default_buses` (#464, with #466/#467) landed 2026-09-08 — see the window above for its
divergences. Pieces 2 (send-FX chain editing) and 3 (the async FX load ring) are NOT ported.

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
