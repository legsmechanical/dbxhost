# CLAUDE.md

Instructions for Claude Code when working with this repository.

Schwung is a framework for custom JavaScript and native DSP modules on Ableton Move hardware (pads, encoders, buttons, 128x64 1-bit display, audio I/O, MIDI via USB-A).

Keep this file, `docs/API.md`, `docs/MODULES.md`, and the user manual in `../schwung-catalog-site/manual.html` in sync with code changes (see Release Checklist).

## 🤝 This host and dAVEBOx are ONE repo (standing rule; merged 2026-08-08)

This fork exists to serve **dAVEBOx**. Josh, 2026-08-04: *"I want to continue working on davebox and
the custom host simultaneously so there's no conceptual separation between what davebox needs and
what the host can provide. What we need the host to do, we change."*

So a davebox need is a valid reason to change this host. Do not treat it as an outside request.

- **The module lives in `davebox/`** — subtree-merged with its full history on 2026-08-08 (P1 of
  the re-architecture), host files staying at their upstream paths. It is the **sole living SA
  source**. `../schwung-davebox` still exists but is frozen **dAVEBOx Legacy** (stock-hosted);
  SA changes never backport there.
- **Commit to `main` here directly** — see Testing below; it is not protected. A cross-seam change
  (host + module) is now **one commit**.
- **One command deploys the whole deliverable:** `standalone/scripts/install-sa.sh`. The two
  half-installers (`standalone/scripts/install-host.sh`, `davebox/scripts/install_sound.sh`) stay
  usable when iterating on one side.
- **📌 No capability probing. If the code is in the tree, the feature exists.**
  One host, one module, shipped together and versioned together, so a `typeof host_*` gate can only
  ever be true. The skew machinery is **gone**: P2 (2026-08-08) deleted davebox's probes
  (`HOST_CONTRACT_MIN`, the "HOST TOO OLD" screen, 102 dead `typeof` gates), P3 deleted the
  host-side producer (`host_build_info()`, `SCHWUNG_BUILD_INFO_CONTRACT`), and P4b deleted the
  remaining 276 gates on the module-param/lifecycle symbols (`host_module_set_param`/`get_param`,
  `host_suspend_overtake`/`host_hide_module`/`host_exit_module`). Those bindings are still
  installed/removed at runtime by the host's tool lifecycle, but the host guarantees them present
  during every davebox execution context (module eval, init, tick, onMidi*, onResume, onUnload,
  the parked-tick loop) via the shim-swap-around-callback machinery in `src/shadow/shadow_ui.js` —
  that invariant is what makes the gates deletable. Never write a new gate or a new contract.
- **📌 Move's own mixer stays NEUTRAL in every project.** Every Move instrument sits at unity,
  unmuted and unsoloed in the set (`mixer.speakerOn: true`, `solo-cue: false`, `volume: 0.0`),
  because Move track mixing is done entirely by the session's FX buses. A mute or trim in the SET
  is invisible on the surface the user mixes on — the bus fader moves and nothing happens, because
  the instrument is silenced underneath it. Enforced at creation (`make-template.py` bakes it into
  the template; `project-cmd.sh`'s new/new-at/copy re-apply it) and swept over the whole library by
  `project-cmd.sh normalize`, called from `launch.sh` **while Move is not running** — the only
  window where a set file can be rewritten without Move's own save clobbering it. Pan is left
  alone: that is a musical choice, not a level.
  ⚠ The bug that produced the rule: the donor fixture the template is generated from was captured
  with track 2 muted, and "patch the template minimally" carried that mute into every project born
  from it and every copy of those.
- **📌 dAVEBOx owns project management. Out-of-band mutation is NOT defended against.**
  Projects are created, copied, renamed and deleted through dAVEBOx's own picker, and that is the
  only path the code answers for. **A project dAVEBOx has never seen opens BLANK** — it does not
  try to work out where the project came from. Phase 0 of the state-co-location plan
  (`docs/plans/2026-08-12-project-state-colocation-and-bind-mount-swap.md`, 2026-08-12) deleted the
  entire apparatus that used to guess: the inherit picker, the name→uuid index, the copy-suffix
  family lookup, `copy_source.txt`, and the host's `Song.abl`-file-size duplicate heuristic. All of
  it answered one question — *"a set appeared that we have never seen; whose descendant is it?"* —
  which belongs to the **Legacy** world, where davebox ran as a module under stock Schwung and the
  user held full native set management. Never reintroduce an ancestor guess.
  ⚠ This is a **policy, not an impossibility**, and the difference has already caused one wrong
  claim in this repo. Out-of-band mutation IS reachable, and the fix is bounded by a hard rule:
  **we never modify the stock tree** — not `schwung-manager`, not the built-in modules. The
  file-browser module in particular ships into the SHARED stock modules dir, so a stock user runs
  the stock copy and any guard added to it would not even be on the device.
  What we can do without touching stock, and do: the set library is filtered out of
  `shared/filepath_browser.mjs` while a session is live. Because this build's module loader
  **rewrites** the canonical `/data/UserData/schwung/shared/` import prefix to its own `shared/`
  dir, the STOCK, UNMODIFIED file browser running inside a session lists through OUR browser and
  inherits the filter for free. The predicate is `pathHiddenFromBrowsers()` in
  `shared/session_state.mjs`, which also holds the single definition of `standaloneSessionActive()`.
  Nothing is hidden outside a session — `Sets/` is then the user's own set list.
  ⚠ **What remains reachable, by design:** the file browser's own copy/move DESTINATION picker
  (module-side, so out of bounds), `schwung-manager` on :7700 (stock tree), the optional
  third-party `filebrowser` binary, and any network share. There is no code we own to filter
  there, so the library instead carries a **`DO-NOT-EDIT.txt`** written by `set-swap.sh` on every
  enter — visible in exactly those surfaces, absent from the user's own sets. The blast radius
  stays a project that opens blank, which is exactly the accepted contract.
- **Keep changes generic anyway** (no module named, docs in the same commit). Not because upstream
  demands it — because a generic change *can* be offered upstream, and each one that merges shrinks
  what this fork carries. See `docs/UPSTREAM.md`.

## ⚠️ Fork-only divergences (never push upstream)

Some changes live in this fork's daily-driver build only and must **never** be carried into upstream PRs/syncs. Keep each one isolated in its own commit so it's easy to exclude when cherry-picking features upstream.

- **Move FX = 4 insert blocks per slot** (upstream stays at 2). `MOVE_FX_BLOCKS = 4` in `src/host/shadow_chain_mgmt.h:25` and `MOVE_FX_BLOCKS_JS = 4` in `src/shadow/shadow_ui.js:909` — both bumped from 2→4, adding 2 extra effect blocks across the four shadow slots. Both `#define`/`const` carry a `fork daily-driver build` comment. The upstream Move FX feature is `08172e31` (2026-06-09), which is present here and stays at 2 blocks.
  ⚠ **The isolation this originally had is GONE.** It was once a standalone commit (`ab5ec6da`) kept separate precisely so the upstream feature could be cherry-picked unchanged — but a rebase folded it together with Send FX, and both now live in **`0d6402b6`** (2026-06-14, *"feat(fx): Send FX + Move FX buses + generic FX-bus picker"*). So there is no longer a commit that isolates the 2→4 bump; separating it again means splitting `0d6402b6` by hand. Re-isolate it if an upstream FX sync is ever attempted.
- **Three fork-only JS bindings: `host_vol_block`, `host_edit_cc_block`, `host_canvas_input`.** Derive this list from the `JS_SetPropertyStr(ctx, global_obj, ...)` registrations, diffed against `upstream/main` — **not** from `docs/API.md`, which has been incomplete before and produced an undercount of exactly this list. `host_vol_block` and `host_edit_cc_block` are called by the davebox module (`ui/ui_engine.mjs:131`, `ui/ui_sound.mjs:2190`), both `typeof`-gated; `host_canvas_input` (`src/shadow/shadow_ui.c:2634`) currently has no external caller — only this fork's own `shadow_ui.js`. All three are marked `[FORK-ONLY]` in `docs/API.md`. **If a rebase removes one that a module calls, the module loses a feature with no error** — `typeof` gating makes absence indistinguishable from a stock install.
- **⚠ The JS-binding list is NOT the whole fork surface, and this is the dangerous part.** The fork also adds **param-key namespaces** that no `typeof` check can probe, and davebox's sound mode hardcodes them: `fx3:`/`fx4:` (upstream has only two audio-FX blocks — `ui/ui_sound.mjs:56`) and `send_fx:a:`/`send_fx:b:` (Send FX is fork-only; zero `send_fx` hits in `upstream/main` — `ui/ui_sound.mjs:89`). Sound mode's entry gate is `typeof shadow_corun_begin`, which **is** upstream, so sound mode was fully reachable on a stock host — where those rows rendered but read unrouted prefixes and their writes vanished. That is *silent misbehaviour*, not graceful degradation, and **a `typeof`-only gating audit reports this surface as clean when it is not**.

**As of the 2026-08-08 merge this class of bug is closed by construction, not by better probing.** dAVEBOx SA is declared fork-host-only in the strongest available sense: it ships in this repo, in this deliverable, and only ever runs under this host. There is no stock-host configuration left to misbehave in. The remaining relevance of the paragraph above is historical — keep it as the reason the P2 de-gate is safe, and as the standing warning for any *other* module that might reach for these prefixes.
- **Slot synth-chain = 4 audio-FX blocks** (`fx1`..`fx4`, upstream had 2). The 3rd/4th insert FX inside a loaded synth's signal chain are fork-only. Because this divergence touches MANY sites (`CHAIN_COMPONENTS`/`createEmptyChainConfig` in `shadow_ui.js`; set+get_param prefix routing, `fxN:bypassed`, knob-mapping, and chain_params/ui_hierarchy fallbacks in `src/modules/chain/dsp/chain_host.c`; patch/preset parse in `chain_patch.c`; slot activation in `shadow_midi.c` + `shadow_chain_mgmt.c`), **any change to FX-block handling must be checked at fx3/fx4 too — they are easy to miss.** The historically-known asymmetries are all FIXED as of P3 (2026-08-08): the slot lazy-activation probe (`shadow_midi.c`) and set-restore activation (`shadow_chain_mgmt.c`) now probe `fx3_module`/`fx4_module` too (the two share one key list — keep them in step), the `chain/ui.js` component selector handles fx3/fx4, and the `fxN:` get_param routing in `chain_host.c` was fixed earlier. When touching FX-block code, extend the check to all four blocks rather than re-introducing an fx1/fx2-only path.

## Code Style

**C**: snake_case. Prefix module manager fns `mm_`, JS host bindings `js_`. Log with `mm:`, `host:`, `shim:` prefixes.
**JavaScript**: `.mjs` = shared ES modules, `.js` = UI modules. Host fns are `snake_case` (`host_load_module`).
**Naming**: Module IDs lowercase-hyphenated (`song-mode`). Param keys lowercase_underscored (`tail_bars`). LED colors PascalCase (`BrightRed`).

## Build / Deploy

```bash
./scripts/build.sh           # Build with Docker
./scripts/package.sh         # Create schwung.tar.gz
./scripts/install.sh         # Deploy from GitHub release
./scripts/install.sh local   # Deploy from local build
./scripts/uninstall.sh       # Restore stock Move
```

**Deploy shortcut**: `./scripts/install.sh local --skip-modules --skip-confirmation` — **never scp individual files**. The install script handles setuid, symlinks, feature config, and service restart.

Cross-compile via `${CROSS_PREFIX}gcc` for Move's ARM. See `BUILDING.md`.

## Testing

Static/regression suite: `for t in tests/{host,shadow,store,build}/*.sh; do bash "$t"; done`
(~95 shell tests: source-invariant pins, compiled C units, node-run .mjs units).
**CI gates the `tests/host/` subset** — `.github/workflows/ci.yml` runs `host-tests`
(`make -C tests/host test` + all `tests/host/*.sh`, all green), `davebox-tests`
(`npm ci` + `davebox/tests/run.sh`: 27 C units, 5 JS units, shell invariants), `go`
(`schwung-manager`), and `cross-compile` (ARM64 Docker build) on every PR and push
to `main`. The davebox job is new as of the merge — that suite had no CI at all
while it lived in a separate repo. ⚠ **`main` is NOT branch-protected in THIS fork — commit to it directly.**
(The repo went PUBLIC on 2026-08-19, so protection is now *possible* — but the
standing rule is unchanged until Josh says otherwise: no protection is enabled,
commit to main directly. An earlier stale claim that PRs were required caused
real wasted work; do not resurrect it by inference from the repo being public.)
CI still runs on every push, so the signal is intact without the gate; run
`tests/host/` locally before pushing rather than relying on a merge check. Install
the fast local checks with `./scripts/install-hooks.sh`. The broader
`tests/{shadow,store,build}` suites are **not** run by CI — ~20 stale failures pin
since-moved code (see the cleanup review doc). On-hardware behavior is verified
manually. Enable the unified logger:

```bash
ssh ableton@move.local "touch /data/UserData/schwung/debug_log_on"
ssh ableton@move.local "tail -f /data/UserData/schwung/debug.log"
```

JS: `console.log()` (auto-routed) or import `shared/logger.mjs`. C: `LOG_DEBUG("source", "msg")` from `host/unified_log.h`. See `docs/LOGGING.md`.

**On-device E2E tests** (opt-in, not in CI): `tools/pytest-schwung/` is a pip-installable pytest plugin that drives a real Move end-to-end through `schwung-testd`, an opt-in test-bus daemon (TCP loopback, started manually over SSH; built into the tarball but not auto-started). Tests inject MIDI, wait for SPI frames, snapshot pad LEDs, capture MIDI_OUT, and reset to a known-empty set (`pristine_set`). Run `pytest tests/e2e` against attached hardware. Full protocol, fixtures, and hardware pitfalls in `tools/pytest-schwung/README.md`.

**OTLP span tracing** (perf profiling, off by default): `touch /data/UserData/schwung/otlp_trace_on` makes **both** the shim and the `shadow_ui` process emit realtime-safe spans as OTLP/JSONL to `/data/UserData/schwung/traces/`, one file per service (`schwung-shim-*` / `schwung-shadow-ui-*`). Shim: `spi.pre`/`spi.post` roots + `shadow.mix_audio`, `midi.process`, `param.serve` children. shadow_ui: `js.tick` + `param.get`. Spans correlate **cross-process by trace_id** — the shim's `param.serve` is emitted as a child of shadow_ui's `param.get` (context propagated through `shadow_param_t`), so Tempo/Jaeger stitch the two files into one trace. JS modules (overtake/chain, incl. ion) can add spans via `host_trace_begin(name) -> handle` / `host_trace_end(handle)` (shadow_ui context only); balance the pair within one `tick()` (handles come from a 16-entry table reset each `js.tick`). `rm` the file to stop. Zero hot-path cost when off. See `docs/tracing.md`.

## Device Constraints

**Never write to `/tmp` on the Move device.** Root FS (`/`) is ~463MB and usually 100% full; `/tmp` lives there. **Always** use `/data/UserData/` (~49GB free) for logs, recordings, temp files, everything. The unified logger already writes to `/data/UserData/schwung/debug.log`.

## Realtime Safety

SPI callback runs SCHED_FIFO 90 on core 3. Budget ~900µs/frame after the ~2ms transfer.

**Never in the SPI callback path:** `unified_log()`, `fprintf()`, `fopen()`, any file I/O; allocation; locks held by non-RT threads.

**FIFO inheritance:** Shim runs in MoveOriginal's FIFO 70 threads. Any child process (`shadow_ui`, `host_system_cmd`) must reset to SCHED_OTHER before exec — handled by `shadow_process.c` and `shadow_ui.c`, don't bypass.

**CPU pinning:** Keep core 3 free for SPI. Pin compute-heavy procs (RNBO) to cores 0–2 (`taskset 0x7`). See `docs/REALTIME_SAFETY.md`.

## 🗺️ Code graph (graphify) — read `wiki/index.md` before grepping the tree

`graphify-out/` holds a knowledge graph of **`src/`, `davebox/`, `standalone/`,
`schwung-manager/`, `tests/`, `tools/` (code) + `docs/` (prose/images)** — ~5,800 nodes,
~13,000 edges, 347 communities (35 named). Built 2026-08-15. It is **gitignored**: derived data,
rebuilt on demand, never committed. The code roots live in `CODE_ROOTS` in
`tools/graphify/rebuild.py`, which is committed, so the scope survives a wipe.

**Use it for navigation and relationship questions** — "what calls X", "what would break if I
change Y", "how does the shim reach the module" — where it answers in ~12k tokens instead of
reading the corpus. Entry points:

```bash
graphify query "how does davebox reach the host mixer"   # BFS, broad context
graphify query "..." --dfs                               # trace one chain / impact path
graphify path "Quantized Sampler" "unity_view"           # shortest path between concepts
graphify explain "shadow_corun_begin"                    # a node and everything around it
```

`graphify-out/wiki/index.md` is the crawlable form (357 articles, one per community) and is
usually the cheapest way in. `graphify-out/graph.html` is the visual map — it is capped at 5,000
nodes, so it renders the largest named communities and prints which ones it dropped; the wiki and
`graph.json` always hold everything.

⚠ **Scope is deliberate.** `libs/` is excluded (1,435 vendored files — QuickJS, curl, Ableton
Link — that would swamp clustering), as are `dist/`, `node_modules/` and minified bundles: the
bundled `davebox/dist/davebox/ui.js` alone forms a 607-node community that is a duplicate of
`davebox/ui/`. Two vendored headers still leak in via `src/lib/` and own their own communities —
`stb_image` and the font code — ignore those. **Host and davebox are ONE graph**, deliberately:
they separate into their own communities anyway, and splitting would cut the cross-seam edges
that are the entire reason they share a repo.

### ⚠ What the graph gets wrong, and why it is pruned

graphify's AST pass resolves a call site to a definition **by bare function name across the whole
corpus**, with no import resolution, then tags the guess `INFERRED`. Any name defined in two files
produces an edge indistinguishable from a real one. Unpruned, this invented a davebox→host
dependency on `shadow_ui.js`, `controller/ui.js` and `menu_ui.js` that **does not exist in the
source at all** — nothing in `davebox/` defines or calls those symbols.

`tools/graphify/prune_edges.py` drops cross-file `calls` edges that no import or header
declaration can justify (765 of 7,280 here, ~10%). Two rules, both provable from source:

- **JS/MJS** — a cross-file call survives only if the calling file imports the defining file.
- **C/H** — a target in a header survives only if that header is included (this is what keeps
  `static inline` helpers such as `shadow_pan_gain_l()`, which are legitimately called
  everywhere); a target in a `.c` must be non-static and declared in an included header.

📌 **Even after pruning, treat a cross-file `calls` edge as a lead to verify, not a fact.** The
`imports` / `contains` edges and the whole doc/image semantic layer are accurate; `calls` is the
one relation built on a guess. The verified davebox→host seam is exactly ten shared ES modules
imported through the canonical `/data/UserData/schwung/shared/` prefix (`constants`,
`input_filter`, `text_entry`, `menu_items`, `menu_layout`, `menu_nav`, `menu_stack`,
`filepath_browser`, `session_state`, `logger`) plus the C-implemented display primitives
(`set_pixel`, `draw_rect`, …). Nothing else crosses.

### Rebuilding

```bash
tools/graphify/rebuild.py --reextract    # ~2s, no LLM: AST + cached semantic + prune + wiki + html
/graphify --update                       # only when DOCS or IMAGES changed (costs tokens)
```

`scripts/hooks/post-commit` runs the `--reextract` form in the background after any commit
touching `src/` or `davebox/` code, so the graph tracks the code for free. Enable with
`./scripts/install-hooks.sh`.

Community names are hand-written. They survive rebuilds two ways: carried across by membership
overlap with the previous run, and — because `graphify-out/` is gitignored and can vanish —
re-anchored from `tools/graphify/labels.json`, which pins each name to a few high-degree node ids
and **is committed**. Verified restoring 35 of 35 from a cold start. Widening `CODE_ROOTS`
reshuffles communities and will strand a few names; re-label the large unnamed ones and refresh
the anchor file in the same pass.

⚠ **Do not use `graphify.extract.collect_files()` to gather the file list** — it does not
recognise `.mjs` and silently dropped 89 files here, including all 22 of `src/shared/*.mjs`, the
very modules davebox imports across the seam. `rebuild.py` walks `CODE_SUFFIX` explicitly instead.

## Documentation Index

- `docs/HOST_REFERENCE.md` — **the shape of each subsystem**, split out of this file 2026-09-09:
  architecture, Move hardware MIDI, SPI, deployment layout, gain staging, Link Audio, the
  signal-chain module, shadow mode, module install/update, external module development. This file
  holds the RULES; that one holds the reference.
- `docs/UPSTREAM.md` — **Upstream watermark**: how far `upstream/main` has been reviewed, what was applied/skipped, the keep-list of paths this fork owns, and what is still worth offering upstream. Replaced the dissolved patch series.
- `docs/UI_LANGUAGE.md` — **Normative OLED UI spec**: the 128×64 cell grid, fonts, header/list/picker/dialog shapes, selection grammar, LED vocabulary, input grammar. Read before building or rebuilding any screen.
- `docs/PRIMARY_SURFACE.md` — **Primary surface + service stack** (P4a): the toggle-gated
  ownership inversion — derived claims, `host_register_primary`, `host_open_service`.
- `docs/MODULE_BUSES.md` — **module buses (#453 piece 1)**: the cross-host contract, what a
  module owes BOTH stock and davebox, this fork's three deliberate divergences, and the
  `split_voices` tri-state. Read before touching anything bus-shaped.
- `docs/API.md` — JS API reference (display, MIDI, host fns, LED colors)
- `docs/MODULES.md` — Module development guide (module.json, capabilities, tool_config, DSP API, Signal Chain integration, Remote UI `web_ui.html` + `schwungRemote` postMessage)
- `docs/LOGGING.md` — Unified logging
- `docs/SPI_PROTOCOL.md` — Full SPI reference
- `docs/REALTIME_SAFETY.md` — RT rules and JACK glitch root causes
- `docs/MIDI_INJECTION.md` — Cable-2 injection / echo filter history
- `docs/ADDRESSING_MOVE_SYNTHS.md` — Sending MIDI to Move tracks/slot synths from tools, overtake modules, chain MIDI FX. Ref: `src/modules/tools/seq-test/`.
- `../schwung-catalog-site/manual.html` — User-facing manual (canonical, lives in the catalog-site repo)
- `BUILDING.md` — Build system, cross-compilation

## Release Checklist

1. **Build**: `./scripts/build.sh` succeeds
2. **Deploy + test**: `./scripts/install.sh local --skip-modules --skip-confirmation`, verify on hardware
3. **Version**: bump `src/host/version.txt` and `module-catalog.json` (host `latest_version` + download URL)
4. **Docs**: update `CLAUDE.md`, `docs/API.md`, `docs/MODULES.md`, `src/shared/help_content.json`, and `../schwung-catalog-site/manual.html` for new features / changed behavior
5. **Help files**: update `help.json` in modified tool modules
6. **Module catalog**: bump `min_host_version` for modules depending on new host features
7. **Commit + tag**: `git tag v0.X.0 && git push --tags`
8. **Release notes**: `gh release edit` with concise bullets

## Dependencies

QuickJS (`libs/quickjs/`), stb_image.h (`src/lib/`), curl (`libs/curl/`, download backend for catalog detection + manual refresh).

## 🔁 Mutation testing: `tools/mutate.sh`, never a bare revert

**Never `git checkout -- <file>` / `git restore` / `git clean` / `git stash` to undo a mutation.**
Twice on 2026-08-24 that discarded work that had never been committed — and once the mutated file
was **untracked**, which `git checkout` ignores entirely, so the "restored" tree was still mutated
and the next run reported a pass that meant nothing.

```sh
tools/mutate.sh <file> <find> <replace> -- <test command...>
```

It refuses to start on a dirty tree (so the baseline is always committed), applies the mutation,
runs the test, and restores on any exit — tracked and untracked alike.
Exit **0** = caught (the test failed, as it should) · **1** = survived (the test does not pin that
behaviour) · **2** = could not run.

A workspace PreToolUse hook (`.claude/hooks/dirty-tree-guard.sh`) refuses those git verbs whenever
the tree is dirty, so the mistake is not available rather than merely discouraged. It matches on the
command string, so it also trips on commands that only *mention* those verbs — reword rather than
weaken it.


## 📚 Host reference — architecture, SPI, shadow mode, install layout

Moved to **[`docs/HOST_REFERENCE.md`](docs/HOST_REFERENCE.md)** (2026-09-09): architecture, Move hardware MIDI, the SPI protocol, deployment layout, gain staging, Link Audio, the signal-chain module, shadow mode, module install/update and external module development.

This file keeps the RULES; that one keeps the reference. Read it when you need the shape of a subsystem rather than a rule to follow.
