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
| **Last upstream commit reviewed** | `35260e0b` — *docs: a standalone tool is one file from being a boot target, and `exec` is the wrong file (#510)*, 2026-09-13 |
| **Reviewed on** | 2026-09-14 (`8e1d99f4`..`upstream/main`, 23 commits) |
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

### Reviewed 2026-09-14 — `8e1d99f4` → `upstream/main` (23 commits)

| Upstream | What | Decision |
|---|---|---|
| `e912756d` #486, `444be110` #485, `43c08481` #484, `3bc05eb8` #488, `317b8c37` #495, `52439245` #496, `9c2f4a54` #499, `e3b42ed8` #498, `ef07aa44` #501, `d2d92254` #503 | Catalog/taxonomy: new modules, subcategories, tags; `module-catalog.json` + `taxonomy.json` + `schwung-manager` filter UI only | **Skipped** — catalog is fetched from **upstream's** hardcoded URL (see the note above); this fork's edits to it do nothing, and the taxonomy filter lives entirely in `schwung-manager`'s own templates, a store surface this fork does not use. Verified via `git show --stat`: no `src/` file in any of the ten. |
| `f84c477f` #497 | `host.channels.stable` catalog field + mirror test | **Skipped** — catalog + test only, no `src/` change. |
| `844cc7d8` #390, `2adb05e3` #505, `c50908ff` #506 | `schwung-manager`: beta/stable channels, stale-catalog downgrade guard, Check-for-Update cache/lock | **Skipped** — `schwung-manager` Go/template code only, a store surface this fork does not carry (verified `--stat`: `schwung-manager/*.go`, `templates/*.html` only). |
| `fbe33154` #502 | `schwung-manager`: single builder (`build-manager.sh`) + CI pin; `install.sh`'s `go`-guard silent-skip fixed | **Skipped, applicable-to-upstream-only** — `install.sh`/`build.sh` here are `dbxhost`'s own scripts (`standalone/scripts/install-sa.sh` etc.), not upstream's; the bug fixed (silent stale-manager ship) is specific to upstream's manager-build indirection. No `src/` change. |
| `035b96f2` #507 | Licensing: LICENSE/THIRD_PARTY_LICENSES consistency, GPL text shipped; `JackShadowDriver.cpp` header corrected | **Skipped** — docs/licensing only; the one `src/` file touched is a **comment-only** header-block correction (verified in the diff: code starts unchanged at line 33). This fork's own licensing statement is separate and unaffected. |
| `2ecdb741` #508 | Release: version-agreement test, `release.json` bump | **Skipped** — release tooling for upstream's own release process. |
| `35260e0b` #510 | Docs: `BOOT_TARGETS.md` design note | **Skipped** — docs only. |
| `1491fe1d` #400 | `shadow_ui.js`: clear the loaded-preset record (`currentUserPresets`) when a chain position changes hands, so an incoming module's My Presets page didn't read the outgoing module's name | **Already here, independently.** dAVEBOx never uses the host's `enterComponentSelect`/`currentUserPresets` path (it picks through `applyModulePick`, `davebox/ui/ui_sound.mjs:7596`) — it has its own `presetRecord()`/`setPresetRecord()` (`ui_sound.mjs:2178`), keyed by `slot:comp` and immune to this bug **by construction**: the accessor checks `r.mod !== S.moduleId` and drops the stale record lazily on every read, rather than needing an eager clear on the swap gesture. No port needed. |
| `485740bc` #396 | `shadow_ui.js` + `component_load_gate.mjs`: a chain component that draws its own param grid (ships `ui_chain.js`) now gets the host's trailing "My Presets"/"Module" pages too | **Not applicable.** This is entirely the host's own chain editor / `enterParamPages` trailing-page mechanism — the surface named in the gate above as one dAVEBOx never opens. dAVEBOx already builds its own "My Presets" (`openPresets()`, `ui_sound.mjs:2218`) and Module Menu row independent of this host plumbing, so there is nothing to plumb dAVEBOx into. |
| `820e2db1` #465 | `src/shared/param_pages/page_controller.mjs`: coalesce `replanIfCondition` writes to one `planPages()` per tick (an encoder sweep on DR32's send-effect page cost 112 full replans in one 10.6 ms tick) | **Already here.** `dbxhost/src/shared/param_pages/page_controller.mjs` — the shared file `davebox/ui/ui_sound.mjs`'s `createParamPagesBinding` runs on — already has `replanOwed`/`flushReplan()`/`replanNow()` at the same call sites (`tick()` line ~2106, `replanIfCondition` ~3645). No drift, no port needed. |
| `0aee5d89` #500 | `src/host/shadow_resample.c` + `shadow_dbus.c` + `shim_worker.c`: delete the screen-reader-text sampler-source classifier (a bare substring match that never saw a true positive and gated a resample-bridge mode, `mode 1`, that no shipped UI could select) and its dead 4th argument; fix a real JS/C disagreement on migrating the retired mode-1 value | **Applicable & worth porting — needs Josh.** `dbxhost/src/host/shadow_resample.c` carries the identical pre-fix code: `native_resample_bridge_mode_from_text`, the same mode-1 hole, and (unverified here) the same JS `parseResampleBridgeMode` migration gap in `src/shadow/shadow_ui.js`. This is host-level audio-input routing plumbing with no screen of its own — it runs in the background regardless of which UI has focus, so the gate's "name the dAVEBOx screen" question doesn't apply the way it does to a UI port. It is real dead-code removal plus a correctness fix (mode-1 backward-compat migration agreement between the C boot-time reader and the JS runtime reader) on a shared audio-routing path both installs carry. Low urgency (no live bug observed — mode 1 is equally unreachable here), but it is a genuine simplification+bugfix on live host code, not chrome. Filed on the board. |
| `2e406933` #504 | New `clip_regions.c`/`clip_state.c`/`editor_bar_announce.h` + `schwung-manager/clip_debug.go`: decode which Move Session-view clip is playing per track and where in it, from the cable-0 LED stream, behind a `clip_state_on` diagnostic toggle | **Not applicable.** This decodes Move's own native **Session-view clip launch** grid (`move_ui_mode`, pad LED channels 9/14) — a surface dAVEBOx does not co-run with; dAVEBOx takes over the pads for its own sequencer and never puts Move in native Session mode while it holds the surface. Diagnostic/telemetry feature (`schwung-manager` debug endpoint) with no dAVEBOx-reachable behavior. |



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
| `2272a1eb` #392 | Save Stems | **Skipped** — overlaps davebox's export pipeline. ⚠ It also carries `paramPagesPaginate()` / the `paginate` chrome flag, which diffs as "a setting this fork lost". It is not a setting: only upstream's Global Settings passes `paginate: false` (so its list is not chunked at 8); every other screen gets `true`, the controller's default. Nothing to port — checked 2026-09-22. |
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
| `acad35ab` | **#472** a widget whose canvas.js failed to load was recorded as loaded | **PORTED (dAVEBOx surface), `feat-custom-widgets`.** The lesson is carried into dAVEBOx's own loader: `ppWidgetsTick` records `ok` separately from which module it tried, and a failed load stops for the VISIT and is re-asked on the next one (`test_custom_widgets.mjs` Test B). The host-side latch it patched is not ported (R2). The card-cache instance of the same defect was fixed earlier, `3cb8b664`. |
| `f7c504be` | **#443** the CC claim key must turn on the display mode | **Ported `01fae0c7`.** Real gap found by the drift check: the shim clears `claim_cc_bits` on the display-close edge without telling JS, so a module's buttons went to Move for the rest of the session. ⚠ Upstream's test also asserts an `enterGlobalSettingsGrid` route this fork does not have — invariant ported, assertion not. |
| `e866597c` | **#438** the copy gesture READS the focus | **Already here** — `liveChildIndex`, `childIndexFromWire`, the notice and the gesture-cancel all present. Drift check only. |
| `55ef3881` | **#440** the grid asked its value cache with the CONCRETE key | **Already here**, cited in `evaluateVisibilityCondition` and using `gridListedKeyFor`. Drift check only. |
| `4c36a239` | **#442** voice-poc declares `focus_press_param` | **No target, verified.** Touches only `src/modules/sound_generators/voice-poc/`, a demo module this fork does not carry. |
| `7b8a83dc` | **#451** choosing a preset left the knobs stepping from the PREVIOUS one | **Ported `b205a95f`.** Both halves: the cached values/knob states are dropped, and a pending knob write is flushed BEFORE the index write. ⚠ Upstream's test does not cover the ordering — extended here. |
| `0c606999` | **#447** stop re-hashing a contract that has not changed | **Ported `d455d04d`.** Memoised on IDENTITY; premise (the controller never mutates the contract in place) verified in this fork rather than inherited. |
| `2aedc2c1` | **#446** two gaps in the module draw contract | **Ported `bb8d85f9`.** A viz GROUP could never carry `extra_keys`; the landing page can now opt into a subtitle. ⚠ This fork builds `g.roles` at TWO sites where upstream touched one — the second needs nothing, checked. |
| `866408b7` | **#420** module draw surfaces: several widgets, a card that sees the page, pages a module owns | **PORTED (dAVEBOx surface) — widgets AND module-owned pages, `feat-custom-widgets`.** ⚠ The first cut ported only the widgets and this row said PORTED anyway: `as_page` canvas pages (MonkSynth's Face) drew a blank band, because the controller returns early when its io has no `drawCanvasPage` and dAVEBOx's `ppIo()` supplied none. **Widgets:** the shared library half was already here; the missing half was a WRITER for the registry. Upstream's lives in the host chain editor (`ensureComponentWidgets`/`tickComponentWidgets`), which a dAVEBOx session never opens, so it is re-done dAVEBOx-side: `ppWidgetsTick` in `ui_sound.mjs` + `engineLoadCanvasOverlay` in `ui_engine.mjs`; nothing in `shared/param_pages` changed and the host chain editor wiring is deliberately NOT ported (R2). Pinned by `test_custom_widgets.mjs` (real gesture, loader-off control) and `test_custom_widgets_bundle.sh` (one registry in the shipped bundle). **Pages:** `ppIo().drawCanvasPage` → `engineCanvasPageDrawer` (`ui_engine.mjs`; resolves `drawPage`, frame-scoped ctx, one strike per visit), sharing ONE `canvas.js` evaluation with the widget loader (`engineCanvasOverlayShared`); pinned by `test_canvas_page.mjs`. ⚠ Device finding: the widgets did not draw under dbxhost either — the loader rewrote the shared prefix only in the LOADER, so dAVEBOx's canonical import of `widget_registry.mjs` loaded a SECOND instance beside the one the grid reads relatively; fixed in `shared_import_resolve.h` (normalizer), pinned by `tests/host/test_shared_import_one_instance.sh`. **The host chain editor is NOT wired** for either surface in this fork (R2). Device check: MonkSynth (Vowel mouth + Face page), Hank. |
| `249d5867` | **#450** "already resolved" asked about the PROCESS, so one widgetless module killed every widget until reboot | **PORTED (dAVEBOx surface), `feat-custom-widgets`.** Unblocked by the #420 port: the resolved-check is keyed on `<slot>:<comp>|<moduleId>`, so a widgetless module settles for itself only, and a swap/removal clears the registry in `runDiscovery` (Test C, incl. the widget module drawing again on another slot). |
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
| `5dadcf38` **#423** | **Boot selector: chainload Schwung, stock Move, or a third-party target** | ✅ **RESOLVED 2026-09-12 — DELIBERATELY NOT PORTED; we CONSUME it instead, and dAVEBOx now ships as a registered target (merged `2b72483c`).** The selector ships with STOCK Schwung ≥ 1.3.0 and SA already requires a stock install beside it, so porting 3,455 lines would duplicate machinery we can simply use. What we wrote is `standalone/boot-target/{boot.json,entry.sh}` plus an install step — dAVEBOx appears in the picker by name, the Tools door is untouched, and the install never writes `boot-targets/default` so a reboot still returns to stock. ⚠⚠ The hard-won part is the EXIT: at boot, `MoveLauncher` SUPERVISES our pid, so ending the session at all reads as "Move crashed" whatever the exit code — the launcher must `exec` onward (to stock `schwung-entry.sh`) rather than exit, and must never sweep `MoveLauncher`/`Move` or pause the unit. → [[movelauncher-supervises-our-pid]], `standalone/README.md` "Two doors". **The original survey note is kept below because its reasoning still stands.** 🔴 **Was: NOT PORTED, AND NEVER SURVEYED — the miss this backfill exists for.** 3,455 lines, 29 files, squarely in `src/`. Upstream main carries `src/boot-select.c`, `src/host/boot_select_core.c/.h`, `src/host/boot_target_lib.sh`, `src/schwung-entry.sh`; **this fork has none of them**, and our `src/shim-entrypoint.sh` diverges from theirs by 58/66 lines. What it does: `/opt/move/Move` becomes a thin Schwung-owned entrypoint that shows `Loading <name> — press Back to change` for ~2s, then execs a registered target; a third party drops `/data/UserData/boot-targets/<id>/boot.json` plus an entry script and appears in the picker. ⭐ **Why it matters to dAVEBOx SA:** this is our launcher's problem, solved upstream by a different mechanism — SA is reached today by booting stock, opening Tools, and relaunching Move under `dbx-host`. ✅ **NOT a collision — checked, 2026-09-10.** An earlier draft of this row claimed one; the code refutes it. The selector's contract forbids a platform from rewriting `/opt/move/Move`, `/usr/lib/schwung-shim.so` and `/etc/ld.so.preload` ("will be silently reverted, or will fight heal, which is worse"). **`standalone/` rewrites none of them** — it launches with `env LD_PRELOAD=davebox-shim.so /opt/move/MoveOriginal` (`launch.sh:433`), i.e. OUR shim over stock's untouched original. Grep for those three paths across `standalone/` returns only prose in `README.md` and the launcher's own `LD_PRELOAD` line. ⭐ **The dependency #423 would actually retire is a different and worse one**, already documented at `launch.sh:6-30`: dAVEBOx SA is invoked by **stock's** `launch-standalone.sh`, which lives in a tree we do not control and whose behaviour has **flipped twice silently** (pre-kill → no pre-kill → pre-kill again at v1.0.0, taking the `pidof` guard with it) — each flip a live breakage. A published `boot.json` + `entry.sh` contract replaces that with something upstream cannot change under us. → [[stock-tree-is-not-ours-own-what-we-run]] |
| `f60bf2c5` **#424** | Retire Updates, Module Store and the File Browser toggle; add the Web Manager QR screen | **NOT PORTED — and the evidence is content, not a filename.** `filebrowser_enabled` is still a row in `src/shared/settings-schema.json:42`, and the 33 MB `libs/filebrowser/filebrowser` binary is still shipped and still built. Upstream deleted both. ⚠ Its surface is Global Settings, so under the gate at the top of this file the dAVEBOx question is `ui_menu.mjs`, not the host grid — but the **payload weight and the dead settings row are ours either way**. Worth sizing. |
| `bde51a56` #455 | Restore hardware `audio_in` for both overtake roles, not only the generator | **ATTEMPTED AND DELIBERATELY REVERTED 2026-09-09; PARKED.** Upstream's fix is a pure hoist within ONE function; this fork splits the two roles across two functions on two paths — generator in `shadow_inprocess_render_to_buffer()` (`schwung_shim.c:8885`), FX `process_block` in `shadow_inprocess_mix_from_buffer()` (`:5892`). Hoisting inside `render_to_buffer` reaches only the role that already worked. Needs the per-frame ORDER of those two calls established, and the restore placed where both see fresh data without paying the `AUDIO_BUFFER_SIZE` memcpy twice a frame. |
| `06c9d24a` #457 | `audio_in` restore stands down while the resample bridge is applying | **Blocked on #455** — the follow-up to a fix this fork does not carry. `src/host/audio_in_restore.h` absent, verified as a FILE (the header is upstream-only, not a fork rename: no equivalent guard exists on either of our two paths). |
| `30c73aeb`, `953f97e5` | `schwung-heal` installs and resolves a **standalone tool's** staged helper | ✅ **CORRECTED 2026-09-12 — "not ported" was the wrong frame: THESE ARE OURS.** They are our own PR schwung#419 (`standalone-heal`), merged upstream and shipped in stock 1.3.0 — so they belong in STOCK's tree, run there as root, and we DEPEND on them rather than porting them. `launch.sh` already relies on it: its not-blessed branch refuses with "this stock Schwung cannot bless the helper (predates schwung#419)". This is what makes the boot target work at all — at boot the selector runs stock's `schwung-heal` before exec-ing any target, so `davebox-heal` is blessed by the time our entry runs, with no prior session to have re-blessed it. **Was (misleading): NOT PORTED — read before the next `install-sa.sh` change.** `src/host/heal_tool_id.h` absent; `src/schwung-heal.c` carries no tool-id resolution. ⭐ Directly adjacent to a known SA trap: a stock install strips setuid from `davebox-heal` ([[stock-install-unblesses-davebox-heal.md]]). Upstream now has heal do this staging for a tool the way it does for itself. Pairs with `#423`/`#482`. |
| `2f92abdc` #431, `6604d861` #439 + `5d22a68e` | `install.sh`: a payload older than the selector is a DOWNGRADE, not a corrupt tarball; tolerate a missing preselector boot default | **Still no target, and the reason has CHANGED — re-checked 2026-09-12.** It was "revisit when #423 is ported"; #423 is now CONSUMED rather than ported (see its row), so these never gain a target here: they are logic for **stock's** `scripts/install.sh` handling **its own** selector payloads, and we ship no selector. ⓘ Our equivalent concern is handled instead by `install-boot-target.sh`, which skips cleanly when `/data/UserData/boot-targets/` is absent (stock < 1.3.0). |
| `9b58ea40` #460 | Module dependencies, and modules declaring the FX behind them | ✅ **RESOLVED 2026-09-10 — SPLIT VERDICT.** Its `shadow_ui.js` half is **already here**: `moduleDefaultFx`, reading `capabilities.default_fx` off the module metadata, lives at `shadow_ui.js:3577` (it arrived with the #463/#464 work). What is absent is the **`schwung-manager` half** — module dependencies in the WEB MODULE STORE. **Skipped:** that is the browser install UI, and this fork's catalog is fetched from UPSTREAM's `module-catalog.json` at a hardcoded URL, so it is not a surface we own. Not dAVEBOx work. |
| `f5d42aa1` #449 | Step + volume knob is a VELOCITY edit, and the volume scanner read it | 🔴 **RESOLVED 2026-09-10 — ABSENT, AND THE BUG IS LIVE. PORT IT.** Move's per-step velocity edit draws a velocity overlay in the SAME ROWS as the master volume bar, so the pixel scanner reads it as a volume bar and drags mailbox gain down with the velocity. ⭐ **Half the gate is already here and the other half is not**: `schwung_shim.c:6005` reads `shadow_volume_knob_touched && shadow_held_track < 0 && shadow_pads_held == 0` — the PADS-held term exists, the STEPS-held term (`shadow_steps_held_mask`, notes 16-31) does not. ⚠ Take upstream's MASK, not a counter: `midi_monitor()` only processes a MIDI_IN slot whose first four bytes CHANGED, and events shift between slots, so the same note-on can be seen twice — a counter drifts and a drifted counter latches the scanner off forever. ⓘ Reachable in CO-RUN ONLY, where Move's own editor owns the steps; in dAVEBOx's sequencer the steps and Shift+Volume are dAVEBOx's own. ⏸ **NOT PORTED — Josh, 2026-09-10: "davebox doesn't rely on moves native sequencer."** He is right: the gesture is Move's native per-step velocity edit, so dAVEBOx's own mode cannot produce it and the only exposure is a compatibility mode. Recorded, deliberately unported. Revisit only if co-run becomes something users live in. |
| `4c874ad4` #432, `b5aacd68` #436, + the `mod:tick` half of `63f5105c` #213 | Idle slots keep their LFO/MIDI timers; a MIDI FX note wakes the parked slot | ✅ **PORTED 2026-09-12** (`fix-idle-slot-midi-wake`). PLUMBING, so the screen gate does not apply: no dAVEBOx surface, this is the audio engine under every track that uses a chain slot. ⚠⚠ **THE 09-10 ROW WAS INCOMPLETE, and the gap would have made a literal port inert: #432/#436 hang the wake off a silent-frame `mod:tick` that came from `63f5105c` #213 — which THIS LEDGER HAD NO ROW FOR AT ALL.** Without it, `lfo_tick` and `v2_tick_midi_fx` are called from `render_block` and nowhere else, so on a parked slot the MIDI FX timers never ran and there was nothing to report. That also means we carried #213's OTHER live bug: an idle slot's LFOs advanced only on the 1-in-172 probe (~172x too slow, in visible steps) and resumed from a STALE PHASE at note-on — an audio bug, not a display one. Both fixed together. ⓵ Three fork adaptations: `mod:tick` goes ABOVE this fork's unconditional `snprintf` debug log at the top of `v2_set_param` (SPI callback, every silent frame); `lfo_tick` is static and defined ~1600 lines below its new caller so it needed a forward declaration; and `shadow_chain_take_midi_tick_wake` is NULL-checked because install-sa does not deploy the chain dsp.so, so this host can run against STOCK's, which does not export it. ⓶ `test_chain_host_file_split.sh`'s exported-symbol pin FIRED and the symbol was added with its argument. **Not yet on hardware.** |
| `63f5105c` #213 (the rest of it) | "Fix the laggy knob grid" — a multi-part commit: param-read tallying, the UI-loop rate fix, the modulation dot, glyph clipping | ⚠ **UNVERIFIED — needs the diff read, and it is a LEDGER GAP found 2026-09-12.** It had NO row despite the 09-10 pass's rule that every commit between the watermark and `upstream/main` gets one; found only because #432 turned out to depend on it. Its `mod:tick` half is now PORTED (row above). The remaining pieces are unassessed. → [[survey-windows-leave-seams]] |
| `d53f10f1` #428 | Wave editor reads 24-bit WAV and AIFF | **ALREADY HERE, via the shared table.** `shadow_ui.js:236` imports `wav_format.mjs`, which handles `pcm24le`/`pcm24be`, `WAVE_FORMAT_EXTENSIBLE` (0xFFFE — how ffmpeg and sox write every 24-bit WAV) and signed 8-bit AIFF. Arrived with `#434`, which the window above already records as fully present. |
| `382deb5b` #441 | The `extra_keys` cap the docs promised, from one constant | **ALREADY HERE.** `page_plan.mjs:23` imports `MAX_DECLARED_EXTRA_KEYS` from `viz.mjs` and applies it at `:476`. |
| `4fc36731` #425, `891982ce` #435 | A module may claim buttons (`claims_ccs`, `claims_edit_ccs`); a held button survives the display close | **ALREADY HERE.** Both markers present across 4 and 8 files; `tests/host/test_claims_ccs.sh` present. `#443` in the window above is the later fix ON this feature, and was ported — it could not have been if the feature were missing. |
| `856ec1b2` #426 | A module may be told about live pad presses (`child_press_param`) | **ALREADY HERE** — marker across 9 files including `page_input.mjs`, `voices.mjs`, `child_key.mjs`. |
| `1d663c7d` #427 | `visible_if` resolved against the list editor's slot, and failed open on the grid | **ALREADY HERE** — `tests/host/test_grid_visible_if_context.sh` present. `#440` above (the concrete-key fix on the same path) is recorded as already here for the same reason. |
| `e7bcd159` #429 | Hold Copy or Delete, then pick an instance — copy, clear and undo for child levels | **ALREADY HERE** — `tests/host/test_child_copy_gesture.sh` present. `#438` above (the copy gesture reading the focus) is its follow-up and is recorded as present. |
| `0006840f` #422 | Enum peek: a LIST never peeks, and 700 ms was shorter than the header | ✅ **ALREADY HERE — BOTH HALVES, verified 2026-09-10.** The timing: `ENUM_PEEK_MS = 1500` (`page_controller.mjs:383`) against `TURN_CLAIM_MS = 1200` (`:356`), i.e. the peek outlives the header's claim, which is the rule the commit establishes. The LIST guard: `s.layout !== LAYOUT_LIST` leads the peek condition at `:3457`. ⚠ **One drift found while checking**: `davebox/ui/ui_movy.mjs:2785` keeps `MV_ENUM_PEEK_MS = 700` with a comment claiming it is "upstream's ENUM_PEEK_MS, carried verbatim so the two surfaces cannot drift" — they have drifted, 700 vs 1500. It is DORMANT (its own note says the peek is off unless a caller opts in, and no davebox caller does), so nothing is wrong on screen; the constant and its comment are the stale part. |
| `c4b27647` #433 | Let custom pages read hidden canvas state | ✅ **ALREADY HERE, verified 2026-09-10.** `declaredCanvasExtraKeys(p)` feeds `extraKeys` into the plan (`page_plan.mjs:470`, `:504`) and they join the staggered read rotation rather than the draw path — which is the commit's whole point. ⓘ Now reachable for custom CELLS since the #420 port (`feat-custom-widgets`).|
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
- **`#372` module help is a jog from its knobs** (`bee45c58`) — ✅ **PORTED for dAVEBOx
  (2026-09-22)**: the Module Help row on dAVEBOx's own Module page and dAVEBOx's own viewer
  (`ui_sound.mjs` `openModuleHelp`/`renderHelp`, `ui_engine.mjs` `engineModuleHelp`), drawn with
  the kit list (`drawKitList` gained `start`/`labelInset`/`rightInset`) rather than
  `scrollable_text.mjs`, at upstream's 124px line budget. `tests/host/test_module_help_shape.sh`
  taken from `866408b73`; this fork's file-browser and song-mode help were rewrapped to pass it
  (our wording kept — upstream's song-mode rewrite documents stems this fork does not have).
  NOT taken: the shared `drawScrollbar` half (the kit list already owns one rail), and the
  earlier note's "dAVEBOx itself among them" / stock-tree fix — dAVEBOx has no slot modules of
  its own and is an overtake. Original note: **WORTH TAKING; Josh, 2026-09-10:
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
- **`#420` module draw surfaces / `#450` / `#472`** — ✅ **PORTED for dAVEBOx** (`feat-custom-
  widgets`, 2026-09-15). This note used to record that `registerOverlayWidgets` had zero callers,
  so every module wanting a custom cell (MonkSynth's mouth, Hank's waves) drew plain dials in
  dAVEBOx's editor. The registry is now filled by dAVEBOx's module editor itself, and module-owned
  pages (`as_page`) draw there too — see the rows above. The host chain editor is not wired.

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

## Canvas contract (#520) — ported while the PR is open

Ported 2026-09-17 from charlesvestal/schwung#520 (open, 11 commits) so both hosts carry ONE shape.
The fork's own `canvas_takes_click` and contextual-Back/Shift+Back experiments were reverted first;
`enterable` + `handleBack` supersede both.

- **Taken:** `enterable`, `handleBack` (true = went up a level), `ctx.close()`, `wantsPads`,
  `ctx.shiftHeld()`, `ctx.measureText()`, `show_footer: false`, the unconditional Shift+jog escape
  hatch, and the one-strike hook primitive (a throw answers a sentinel, never a value).
- **dAVEBOx surface:** `davebox/ui/ui_canvas.mjs` (`VIEW_CANVAS`), reached from `openParamEditor`
  when a `type: "canvas"` param is dived into. ⚠ The escape hatch is keyed on the host's
  `VIEWS.CANVAS`, which dAVEBOx never enters, so it needs its own dAVEBOx copy —
  `tests/host/test_canvas_escape_hatch_both_surfaces.sh` pins both.
- **NOT taken:** the draw-path ctx split (`DRAW_PATH_HOOKS` / `canvasHookCtx`, which strips param
  accessors from `draw`/`tick`). An unrelated read-cost change; it belongs to a proper upstream
  sync, and its test was left out rather than shipped failing.
- **Deliberately absent from the host:** host-drawn footer hints, a `canGoUp` hook, and a published
  device font. Each was built and reverted; a module carries its own font and draws its own chrome.
  `test_canvas_enterable.sh` pins the absence of a typeface on the ctx.

When #520 merges, re-diff it against this port — upstream may change shape in review.

## Insert FX reorder (`da427483`, `f8e98c1f`, `53df334e`) — ported, reshaped for four fixed positions

Ported 2026-09-22. Upstream renumbers a chain section by PERMUTING its per-position arrays (no
module reloads, so a reverb keeps its tail) — `chain_permute.h` taken verbatim; the verb is
upstream's spelling, `fx:move` = `"<from>><to>"`, 1-based.

- **Taken:** `src/host/chain_permute.h` and its test; the permute-don't-reload design; owned
  buffers rotated, never zeroed (`fx_params` / `fx_ui_hierarchy` moved out of line to make that
  cheap — `chain_alloc_position_storage`).
- **Reshaped:** this chain has FOUR FIXED positions with holes allowed (`fx_count` is a high-water
  mark), not upstream's compact variable-length list. So `chain_reorder.c` is ours: audio FX only,
  move only (no insert/remove verbs), and **a move never crosses an empty position** — the slot save
  compacts, so a hole would not survive a reload. The shim refuses such a move with an answer
  (`chain_move_check.h`), and refuses while the render pool still has a lane in the chain.
- **Added here:** the same verb on the master, send and Move FX buses (`bus_fx_move.h`, with the
  master's LFO targets retargeted); a snapshot recall that finds the saved modules in another order
  moves them back before restoring state (`planReorders`, `shared/snapshot.mjs`) and reports the
  moves (`moved`) so the caller's own references follow.
- **dAVEBOx surface:** Move Up / Move Down rows under the loaded module in the FX browser
  (`openBrowse` → `browseMoveRows`, `davebox/ui/ui_sound.mjs`) — upstream's Move Left / Right rows,
  vertical. Automation, macro legs and the loaded-preset record follow a move
  (`chainFxMove` / `busFxMove`). `davebox/tests/js/test_fx_move_rows.mjs` performs the gesture.
- **NOT taken:** upstream's Shift+jog reorder gesture and its MIDI-FX section moves.

## Keep-list — paths this fork owns

Divergence is concentrated, and these are the files where an upstream change is most likely to
collide and most deserving of a careful read before taking:

| Path | Δ vs upstream | Why it diverges |
|---|---|---|
| `src/shadow/shadow_ui.js` | ~3.1k lines | Canvas contract (#520 port), edit-CC claims, Module Level row, Send/Move FX pickers, optional-readback normalization |
| `src/schwung_shim.c` | ~1.3k | Module-level render paths, edit-CC forwarding, `claims_edit_ccs`, remote-UI push |
| `src/host/shadow_chain_mgmt.c` + `.h` | ~890 | 4 FX blocks per slot, Send FX buses |
| `src/modules/chain/dsp/chain_patch.c`, `chain_host.c` | ~750 | fx3/fx4 routing and patch parse |
| `src/shadow/shadow_ui.c`, `src/host/shadow_constants.h` | ~570 | Fork-only JS bindings, SHM struct fields |
| `standalone/`, `davebox/` | all of it | Fork-only by construction — no upstream counterpart exists |
| `src/host/shadow_param_lane.h`, `src/host/shadow_param_lane_policy.h` | new (branch `param-transport`) | The param-transport write lane + its eligibility classifier — no upstream equivalent |
| `tests/host/test_shadow_param_lane.c`, `tests/host/test_param_lane_policy.c`, `tests/host/test_param_apply_set_dispatch.sh`, `tests/host/test_param_lane_wiring.sh` | new (branch `param-transport`) | Unit + structural pins for the lane and the one-dispatcher invariant |
| `src/host/render_pool.h` | new (2026-09-15) | The fork-join render pool under the per-slot chain render (`shadow_inprocess_render_to_buffer` restructured around it; `slot:parallel`, `master_fx:render_lanes`) — no upstream equivalent |
| `tests/host/test_render_pool.c`, `tests/host/test_render_pool_wiring.sh` | new (2026-09-15) | The pool's unit (plan, round, bail) and the structural pin on how the shim uses it |

## Still worth offering upstream

Not a carrying obligation — just the list of changes written generically enough to land upstream,
so the option stays visible.

| Change | In this tree | Upstream status |
|---|---|---|
| Send FX buses + generic FX-bus picker | `0d6402b6` (the Send FX half only) | **PR #121 OPEN**, parked on review time |
| Remote UI v2 — off-thread snapshots, lossless edits, server push | `c29abdf7` + the 7-commit push series | **PR #180 OPEN** |
| Let a module claim Undo/Copy/Delete (`claims_edit_ccs`) + its tests | `883b5f1e`, `df03a19c` | Not submitted. Supersedes upstream #154, which #175 reverted |
| Treat an empty param readback as absent, not as a value | `16368a97` | Not submitted |
| Text-entry function keys no longer overlap the last characters | `02e5ac2d` | Not submitted |
| One-dispatcher param SET extraction (`shadow_param_apply_set`) + the variable-length param write lane | branch `param-transport` | Not submitted — generic host change, no module named; fixes a real two-dispatcher class of bug (see the 09-05 lesson in `docs/HOST_REFERENCE.md`) |
| The render pool (`render_pool.h` + the shim restructure) | 2026-09-15 | Not submitted — generic, no module named; `slot:parallel` is a plain slot key. Worth offering once the CM4 A/B exists (upstream's users are all on CM4) |

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
