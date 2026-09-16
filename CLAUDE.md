# CLAUDE.md

Instructions for Claude Code in this repository.

Schwung is a framework for custom JavaScript and native DSP modules on Ableton Move hardware (pads,
encoders, buttons, 128x64 1-bit display, audio I/O, MIDI via USB-A).

**This file holds the RULES. [`RATIONALE.md`](RATIONALE.md) holds the history behind them** — read
that when a rule looks wrong or worth changing, not before every session.
**[`docs/HOST_REFERENCE.md`](docs/HOST_REFERENCE.md) holds the shape of each subsystem.**

📌 **A rule earns its place here only if breaking it costs something a test cannot catch.**
Everything else belongs in `tests/host/test_repo_claims.sh` or in `RATIONALE.md`. In particular:
**do not write counts into this file.** Counts rot silently — a test count here was once 3x low, a
worktree count stale, and a dated "verified: ZERO of these" invariant had been violated for a week.

## 🤝 This host and dAVEBOx are ONE repo

This fork exists to serve **dAVEBOx**, so a davebox need is a valid reason to change this host — not
an outside request. The module lives in `davebox/` and is the sole living SA source.

- **Commit to `main` directly.** It is not protected. A cross-seam change is one commit.
- **One command deploys the whole deliverable:** `standalone/scripts/install-sa.sh`. The two
  half-installers (`standalone/scripts/install-host.sh`, `davebox/scripts/install_sound.sh`) stay
  usable when iterating on one side.
- **📌 No capability probing. If the code is in the tree, the feature exists.** One host, one module,
  shipped and versioned together, so a `typeof host_*` gate can only ever be true. Never write a new
  gate; never bump a contract. The count in `davebox/ui/` is a **ratchet** in
  `tests/host/test_repo_claims.sh` — it may fall, never rise.
- **📌 Move's own mixer stays NEUTRAL in every project** — every instrument at unity, unmuted,
  unsoloed (`mixer.speakerOn: true`, `solo-cue: false`, `volume: 0.0`). Track mixing is done entirely
  by the session's FX buses, so a mute or trim in the SET is invisible on the surface the user mixes
  on. Enforced at creation (`make-template.py`; `project-cmd.sh` new/new-at/copy) and swept by
  `project-cmd.sh normalize` from `launch.sh` while Move is not running. Pan is left alone — that is
  a musical choice, not a level.
- **📌 dAVEBOx owns project management. Out-of-band mutation is NOT defended against.** Projects are
  created, copied, renamed and deleted through dAVEBOx's own picker, and that is the only path the
  code answers for. **A project dAVEBOx has never seen opens BLANK.** Never reintroduce an ancestor
  guess. We never modify the stock tree; a live session's library is filtered out of
  `shared/filepath_browser.mjs` via `pathHiddenFromBrowsers()` in `shared/session_state.mjs`.
- **📌 Shared constants are pinned.** `standalone/config.sh` is the one declaration of the install
  dir / SHM prefix / soname; `standalone/scripts/check-config.sh` (CI-gated) pins the davebox-side
  literals too.
- **Keep host changes generic anyway** (no module named, docs in the same commit) — not because
  upstream demands it, but because a generic change *can* be offered upstream, and each one that
  merges shrinks what this fork carries. See `docs/UPSTREAM.md`.
- The OLED UI language is specified in `docs/UI_LANGUAGE.md`; rebuilt screens compose from the shared
  primitives.

## 🔴🔴 dAVEBOx IS THE PRODUCT — port FOR it, onto a screen it OPENS

> *"WE'RE WORKING ON DAVEBOX. EVERYTHING NEEDS TO BE HAPPENING INSIDE DAVEBOX. the entire point of
> the work with upstream is to pick what's useful to davebox and port it so it works FOR DAVEBOX."*
> — Josh, 2026-09-09

**Before writing ANY port or feature, answer in one line: which dAVEBOx screen shows this, and what
does the user press to get there?** If the answer names a HOST screen — the chain editor,
`enterComponentSelect`, Global Settings, the host help viewer — **stop and find dAVEBOx's own
equivalent.** A host-side change is right only when it is PLUMBING dAVEBOx calls into, never when it
is the surface itself.

| upstream puts it in | dAVEBOx's actual surface |
|---|---|
| the swap picker / `enterComponentSelect` | the **Instrument picker** (`openInstrPicker`, `instrPickerRows`) for generators; `openBrowse`/`buildBrowseList`/`applyModulePick` for FX blocks — `davebox/ui/ui_sound.mjs` |
| the host knob grid's trailing pages | dAVEBOx draws its own editor (`ui_sound.mjs`, via `createParamPagesBinding`) |
| Global Settings rows | `davebox/ui/ui_menu.mjs` |
| the host help viewer | ⚠ dAVEBOx has **no help screen** — building one is its own decision |
| text entry / dialogs | `davebox/ui/ui_dialogs.mjs` (the shared keyboard) |

⚠⚠ **A GREEN SUITE DOES NOT MEAN THE SCREEN IS REACHABLE.** #378 was built three times on three
screens; 17 source pins, 31 mutations, a render harness and three hash-verified deploys were green
on two surfaces a dAVEBOx session cannot open. Tests here answer *"is it wired"*, never *"is this
the screen"*. Make one test perform the real gesture and assert what is on screen —
`davebox/tests/js/test_instr_lists.mjs` is the worked example, and it found three defects in seconds
that every pin had missed.

⚠ This fork had already paid for it once: `default_fx` shipped here for months and never logged a
line, because nothing reached the hook — the host seeds them from its OWN component picker, which
this UI never uses.

## 📏 No A/B number without naming the control

Before stating ANY comparative result — performance, size, output — state **what was held constant
and how that was VERIFIED**: a hash or a captured input, never a filename or a folder name.
**No control named, no number reported.** For a probe, the same rule reads: show it producing a
POSITIVE before believing a negative.

⚠ On 2026-08-26 a "container builds are 23% slower" result was reported as decisive and collapsed —
the two artifacts had different provenance and nobody hashed the input. In the same session a
knob-sweep "finding" came from a probe that silently ignored the knob. Both were caught only after
being reported.

## 📗 Module composition: read the CURRENT `MODULES.md`

Before writing or debugging any `module.json`, UI hierarchy, chain param, knob mapping, menu, DSP
entry point or JS↔DSP param bridge — read **`docs/MODULES.md` in THIS repo** for dAVEBOx SA work;
`../schwung-current/docs/MODULES.md` is the upstream-bound contract. ⚠ Do **not** infer the schema
by copying another module's `module.json`: the failure mode is that the module loads, the DSP
instantiates, nothing is logged, and the menu does nothing when you turn a knob. Traps already paid
for: editable params use **`name`**, not `label`; a file browser is a **`filepath` param type**
(`root`/`start_path`/`filter`); repeated elements use **`child_prefix`/`child_count`/`child_label`**;
and the DSP must implement **`get_param` readback** for every key the UI displays or every knob
reads zero.

## ⚠️ Fork-only divergences (never push upstream)

Keep each isolated in its own commit so it is easy to exclude when cherry-picking upstream.

- **Move FX = 4 insert blocks per slot** (upstream stays at 2) — `src/host/shadow_chain_mgmt.h:25`,
  `src/shadow/shadow_ui.js:909`.
- **Slot synth-chain = 4 audio-FX blocks** (`fx1`..`fx4`, upstream had 2). This touches MANY sites,
  so **any change to FX-block handling must be checked at fx3/fx4 too — they are easy to miss**:
  `CHAIN_COMPONENTS`/`createEmptyChainConfig` in `shadow_ui.js`; set+get_param prefix routing,
  `fxN:bypassed`, knob-mapping and chain_params/ui_hierarchy fallbacks in `chain_host.c`;
  patch/preset parse in `chain_patch.c`; slot activation in `shadow_midi.c` + `shadow_chain_mgmt.c`.
- **Four fork-only JS bindings:** `host_vol_block`, `host_edit_cc_block`, `host_canvas_input`,
  `host_state_subdir`. ⚠ Derive this list from the `JS_SetPropertyStr` registrations diffed against
  `upstream/main`, **not** from `docs/API.md`.
- **Fork-only param-key namespaces** that no `typeof` check can probe: `fx3:`/`fx4:` and
  `send_fx:a:`/`send_fx:b:`.

→ full history and the silent-misbehaviour warning: [`RATIONALE.md`](RATIONALE.md).

## Code Style

**C**: snake_case. Prefix module manager fns `mm_`, JS host bindings `js_`. Log with `mm:`, `host:`,
`shim:` prefixes.
**JavaScript**: `.mjs` = shared ES modules, `.js` = UI modules. Host fns are `snake_case`.
**Naming**: Module IDs lowercase-hyphenated (`song-mode`). Param keys lowercase_underscored
(`tail_bars`). LED colors PascalCase (`BrightRed`).

## Build / Deploy

```bash
./scripts/build.sh                                        # Docker cross-build
./scripts/package.sh                                      # schwung.tar.gz
./scripts/install.sh local --skip-modules --skip-confirmation
./scripts/uninstall.sh                                    # restore stock Move
```

**Never scp individual files** — the install script owns setuid, symlinks, feature config and the
service restart. `install.sh` always ends in a reboot; running it over the USB-ethernet tether works
and is the preferred path. **Manager-only changes skip `install.sh`**: `schwung-manager` is a
self-contained Go binary (embeds templates/static), so build the ARM binary, scp to
`/data/UserData/schwung/schwung-manager` as `ableton` (temp name + `mv -f` to dodge ETXTBSY), then
`scripts/restart_move.sh` — no reboot.

**Module deploys need a host restart.** Copying a new `dsp.so`/`module.json` is not enough, and
swapping the synth out and back in leaves the old code live — the deploy looks like a no-op. Use
`scripts/restart_move.sh` (it stops the launcher, kills Move/schwung procs, removes stale `/dev/shm`
rings, frees the SPI device and waits for `MoveOriginal`); a **partial** restart leaves stale ring
segments whose pointers hang slots on reattach. `MOVE_HOST=root@172.16.254.1` for the tether.

Cross-compile via `${CROSS_PREFIX}gcc`. See `BUILDING.md`.

## Testing

**`scripts/hooks/pre-commit` gates by staged path and fails closed** — `src`/`tests/host`/
`standalone`/`scripts` → the host suite; `davebox` → `davebox/tests/run.sh`; `schwung-manager` → go
(through `golang:1.26-bookworm` when there is no local toolchain). A missing tool is an error, never
a skip. Install with `./scripts/install-hooks.sh`; bypass deliberately with `SCHWUNG_SKIP_HOOKS=1`.

⚠ **The local gate runs natively (macOS) and cannot see platform differences in C.** Before pushing:

```bash
scripts/test-linux.sh                 # the host suite on glibc, as CI runs it
```

### ⭑⭑ A runner must report what it did NOT do

**A count is never a claim about coverage.** A skipped case prints PASS, increments the total, and
leaves the number **identical to a clean run** — there is nothing in the output to notice. So, for
any runner in this repo:

- **A missing tool is a FAILURE, not a skip.** Give it a named escape hatch instead, so a skip is a
  deliberate act: `SCHWUNG_SKIP_HOOKS=1` (pre-commit), `DBX_ALLOW_MISSING_TOOLS=1` (davebox suite).
- **Zero collected is not green.** A glob that matches nothing leaves the counters at 0 while
  everything downstream still prints PASS.
- **Count the skips and name them beside the result.** `test-linux.sh` does; `KNOWN-OPEN` cases are
  named rather than hidden.
- **Run the suite in the CHECKOUT, not a worktree** — a worktree silently skips tests a checkout
  runs (a branch once reported "177/177" that was 175 plus two skips; both failures surfaced only
  after the merge).
- When you report a number, say what was skipped. *"223/223, 0 skipped"* is a claim; *"223/223"* is
  not.

⚠ Four instances of this one shape surfaced on 2026-09-16, three in machinery built that same day.
Prove the negative before believing it: hide the tool, break the glob, confirm it goes red.

CI (`.github/workflows/ci.yml`) runs host-tests, davebox-tests, go and cross-compile on every push
and PR. It is advisory — `main` is unprotected — so the local hook is the real gate.
`tests/{shadow,store,build}` are **not** run by anything and their failing count is unknown.

Enable the unified logger:
```bash
ssh ableton@move.local "touch /data/UserData/schwung/debug_log_on"
ssh ableton@move.local "tail -f /data/UserData/schwung/debug.log"
```
JS: `console.log()` or `shared/logger.mjs`. C: `LOG_DEBUG("source","msg")` from `host/unified_log.h`.

**On-device E2E** (opt-in): `tools/pytest-schwung/`, driving real hardware through `schwung-testd`.
**OTLP span tracing** (off by default): `touch /data/UserData/schwung/otlp_trace_on`; see
`docs/tracing.md`.

## 🔁 Mutation testing: `tools/mutate.sh`, never a bare revert

```sh
tools/mutate.sh <file> <find> <replace> -- <test command...>
```
Refuses a dirty tree, applies the mutation, runs the test, restores on any exit — tracked and
untracked alike. Exit **0** = caught · **1** = survived (the test does not pin that behaviour) ·
**2** = could not run.

**Never `git checkout -- <file>` / `git restore` / `git clean` / `git stash` to undo a mutation.** A
PreToolUse hook (`scripts/hooks/dirty-tree-guard.sh`, wired in `.claude/settings.json`) refuses those
verbs on a dirty tree. It matches on the command string, so it also trips on commands that merely
*mention* them — reword rather than weaken it.

⚠ **Settings do not cascade from a parent folder** the way `CLAUDE.md` does; they are project-rooted.
That is why the guard is carried here rather than in the workspace above.

## Device Constraints

**Never write to `/tmp` on the Move.** Root FS is ~463 MB and usually 100% full. Always use
`/data/UserData/` (~49 GB free) for logs, recordings and temp files.

## Realtime Safety

SPI callback runs SCHED_FIFO 90 on core 3; budget ~900µs/frame after the ~2ms transfer.
**Never in the SPI callback path:** `unified_log()`, `fprintf()`, `fopen()`, any file I/O;
allocation; locks held by non-RT threads.
**FIFO inheritance:** any child process must reset to SCHED_OTHER before exec — handled by
`shadow_process.c` and `shadow_ui.c`, don't bypass.
**CPU pinning:** keep core 3 free; pin compute-heavy procs to cores 0–2 (`taskset 0x7`).
See `docs/REALTIME_SAFETY.md`.

## 🗺️ Code graph (graphify)

`graphify-out/` is a gitignored, rebuild-on-demand graph of the code and docs. `scripts/hooks/
post-commit` refreshes it in the background after any commit touching `src/` or `davebox/`.

**Use `graphify explain "<symbol>"`** — that is the shape that works: it returns the real call
structure around a definition, fast. ⚠ Semantic "how does X work" queries return the documentation
cluster, including retired designs, and `calls` edges are name-matched guesses — a lead to verify,
never a fact. `graphify-out/wiki/index.md` is the crawlable form.

```bash
python3 tools/graphify/rebuild.py --reextract                 # ~2s, no LLM
python3 tools/graphify/rebuild.py --reextract --allow-shrink  # when the graph should get SMALLER
/graphify --update                                            # only when DOCS or IMAGES changed (costs tokens)
```

⚠ `to_json` **refuses to overwrite a larger `graph.json`** and only warns, so a deliberate shrink
leaves that one file stale while everything else updates — and `graphify query` reads it.
`--allow-shrink` says the shrink is intended; without it the rebuild now exits non-zero rather than
pretending. Narrowing `CODE_ROOTS` or `STALE_DOC_PREFIXES` needs it.

⚠ **Historical documentation is excluded** (`STALE_DOC_PREFIXES` in `rebuild.py`): `docs/plans/`,
`docs/archive/`, `docs/superpowers/`, `davebox/docs/working/`. Measured 2026-09-16, they were **401
of 726 doc nodes — 55%** — and they dominated semantic results, so "how does X work" answered with
dissolved plans and unimplemented designs. The files stay; only the graph ignores them.

⚠ `libs/`, `dist/`, `node_modules/` and minified bundles are excluded deliberately. Measured
usage and the pruning rules: [`RATIONALE.md`](RATIONALE.md).

## Documentation Index

- `RATIONALE.md` — **why the rules are what they are** (history, deleted machinery, incidents)
- `docs/HOST_REFERENCE.md` — **the shape of each subsystem**: architecture, Move hardware MIDI, SPI,
  deployment layout, gain staging, Link Audio, the signal-chain module, shadow mode, module
  install/update, external module development
- `docs/UPSTREAM.md` — upstream watermark: how far `upstream/main` has been reviewed, what was
  applied/skipped, the keep-list of paths this fork owns
- `docs/UI_LANGUAGE.md` — normative OLED spec. Read before building or rebuilding any screen
- `docs/PRIMARY_SURFACE.md` — primary surface + service stack
- `docs/MODULE_BUSES.md` — module buses: the cross-host contract and this fork's divergences
- `docs/MODULES.md` — module development (module.json, capabilities, DSP API, Remote UI)
- `docs/API.md` — JS API reference. ⚠ Incomplete before; not authoritative for the binding list
- `docs/SPI_PROTOCOL.md` — the full SPI wire reference (HOST_REFERENCE has the overview)
- `docs/ARCHITECTURE.md`, `docs/MIDI_INJECTION.md`, `docs/LOGGING.md`, `docs/tracing.md`,
  `docs/REALTIME_SAFETY.md`, `docs/ADDRESSING_MOVE_SYNTHS.md`
- `../schwung-catalog-site/manual.html` — user-facing manual (canonical)
- `BUILDING.md` — build system, cross-compilation

## Release Checklist

1. `./scripts/build.sh` succeeds
2. `./scripts/install.sh local --skip-modules --skip-confirmation`, verify on hardware
3. Bump `src/host/version.txt` and `module-catalog.json` (host `latest_version` + download URL)
4. Update `CLAUDE.md`, `docs/API.md`, `docs/MODULES.md`, `src/shared/help_content.json` and the
   manual for new/changed behaviour
5. Update `help.json` in modified tool modules
6. Bump `min_host_version` for modules depending on new host features
7. `git tag v0.X.0 && git push --tags`
8. `gh release edit` with concise bullets

## Dependencies

QuickJS (`libs/quickjs/`), stb_image.h (`src/lib/`), curl (`libs/curl/`).
