# Why the rules are what they are

Split out of `CLAUDE.md` on 2026-09-16. **`CLAUDE.md` holds the rules; this file holds the history
behind them.** Read this when a rule looks wrong, arbitrary, or worth changing — not before every
session.

The split exists because the instruction layer was measured at ~230 KB / ~2,800 lines read before
any source, while the verification layer had no gate at all on 84% of the work. Reading cost was
growing monotonically and retrieval precision was falling: nothing was ever deleted, only annotated
with a correction, so each document accreted corrections-to-corrections.

---

## The capability-probe deletion (P2/P3/P4b, 2026-08-08 → 08-09)

**The rule now:** no capability probing. If the code is in the tree, the feature exists. Never write
a `typeof host_*` gate, never bump a contract.

**How it got there.** There is exactly one host and one module, shipped and versioned together, so a
`typeof` gate can only ever be true. The machinery for surviving version skew was deleted in stages:

- **P2** (08-08) deleted davebox's probes: `HOST_CONTRACT_MIN`, the "HOST TOO OLD" screen, and 102
  dead `typeof` gates.
- **P3** deleted the host-side producer: `host_build_info()`, `SCHWUNG_BUILD_INFO_CONTRACT`.
- **P4b** (08-09) deleted the remaining **276** gates on the module-param and lifecycle symbols
  (`host_module_set_param`/`get_param`, `host_suspend_overtake`, `host_hide_module`,
  `host_exit_module`).

Those bindings are still installed and removed at runtime by the host's tool lifecycle. What makes
the gates deletable is that the host **guarantees them present during every davebox execution
context** — module eval, init, tick, `onMidi*`, `onResume`, `onUnload`, the parked-tick loop — via
the shim-swap-around-callback machinery in `src/shadow/shadow_ui.js`.

⚠ **The invariant has been violated twice, and the second time nothing noticed for a week.** An
earlier note here read "~332 gates still exist, leave them alone" and was two phases out of date.
It was replaced with a dated claim — "Verified 2026-08-14: `davebox/ui/` contains ZERO" — and two
gates were added on **2026-09-09** (`7e531fb02`, `ui_sound.mjs:7376-7377`), each returning
`null`/`false` on absence, which is the silent-degradation mode the rule exists to forbid. Writing
the date down did not help. **`tests/host/test_repo_claims.sh` now owns the count as a ratchet**:
it may fall to zero, never rise.

## Why this fork and dAVEBOx are one repo (2026-08-08)

Josh, 2026-08-04: *"I want to continue working on davebox and the custom host simultaneously so
there's no conceptual separation between what davebox needs and what the host can provide. What we
need the host to do, we change."*

They were two git repos for exactly one reason — `dbxhost` had to keep rebasing onto Charles's
Schwung. That reason died when slimming the host to what davebox needs meant deletions, and
deletions conflict with everything, forever. P1 subtree-merged davebox at prefix `davebox/` with its
full history, host files staying at their upstream paths.

`../schwung-davebox` still exists but is frozen **dAVEBOx Legacy** (stock-hosted). SA changes never
backport there.

## The Move-mixer-neutral rule

**The rule now:** every Move instrument sits at unity, unmuted, unsoloed in every set.

**The bug that produced it:** the donor fixture the template is generated from was captured with
track 2 muted, and "patch the template minimally" carried that mute into every project born from it
and every copy of those. A mute in the SET is invisible on the surface the user mixes on — the bus
fader moves and nothing happens, because the instrument is silenced underneath it.

## Why out-of-band project mutation is not defended against

Phase 0 of the state-co-location plan (`docs/plans/2026-08-12-…`, 2026-08-12) deleted the whole
apparatus that used to guess a project's ancestry: the inherit picker, the name→uuid index, the
copy-suffix family lookup, `copy_source.txt`, and the host's `Song.abl`-file-size duplicate
heuristic. All of it answered one question — *"a set appeared that we have never seen; whose
descendant is it?"* — which belongs to the **Legacy** world, where davebox ran as a module under
stock Schwung and the user held full native set management.

⚠ This is a **policy, not an impossibility**, and the difference has already caused one wrong claim
in this repo. What remains reachable by design: the file browser's own copy/move destination picker,
`schwung-manager` on :7700, the optional third-party `filebrowser` binary, and any network share.
The library therefore carries a `DO-NOT-EDIT.txt` written by `set-swap.sh` on every enter. The blast
radius stays a project that opens blank, which is the accepted contract.

## Fork-only divergences — the upstream history

These live in this fork's build only and must never be carried into upstream PRs.

**Move FX = 4 insert blocks per slot** (upstream stays at 2): `MOVE_FX_BLOCKS = 4` in
`src/host/shadow_chain_mgmt.h:25`, `MOVE_FX_BLOCKS_JS = 4` in `src/shadow/shadow_ui.js:909`.
⚠ The isolation this had is **gone**. It was once a standalone commit (`ab5ec6da`) kept separate so
the upstream feature could be cherry-picked unchanged, but a rebase folded it together with Send FX
into **`0d6402b6`** (2026-06-14). Separating it again means splitting that commit by hand.

**Four fork-only JS bindings:** `host_vol_block`, `host_edit_cc_block`, `host_canvas_input`,
`host_state_subdir` (the last, 2026-09-14, resolves a project's state dir name via
`src/host/dbx_state_subdir.h`). ⚠ Derive this list from the `JS_SetPropertyStr` registrations diffed
against `upstream/main` — **not** from `docs/API.md`, which has been incomplete before and produced
an undercount of exactly this list.

**⚠ The binding list is not the whole fork surface.** The fork also adds param-key namespaces no
`typeof` check can probe, and sound mode hardcodes them: `fx3:`/`fx4:` (`ui/ui_sound.mjs:56`) and
`send_fx:a:`/`send_fx:b:` (`ui/ui_sound.mjs:89`; zero `send_fx` hits upstream). Sound mode's entry
gate is `typeof shadow_corun_begin`, which **is** upstream, so sound mode was fully reachable on a
stock host — where those rows rendered but read unrouted prefixes and their writes vanished. That is
silent misbehaviour, and a `typeof`-only gating audit reports this surface as clean when it is not.

**As of the 2026-08-08 merge this class of bug is closed by construction.** dAVEBOx SA ships in this
repo, in this deliverable, and only ever runs under this host; there is no stock-host configuration
left to misbehave in. Keep the paragraph above as the reason the P2 de-gate is safe, and as the
standing warning for any *other* module reaching for these prefixes.

**Slot synth-chain = 4 audio-FX blocks** (`fx1`..`fx4`, upstream had 2). The historically-known
asymmetries are all FIXED as of P3 (2026-08-08): the slot lazy-activation probe (`shadow_midi.c`)
and set-restore activation (`shadow_chain_mgmt.c`) now probe `fx3_module`/`fx4_module` too (they
share one key list — keep them in step), `chain/ui.js`'s component selector handles fx3/fx4, and the
`fxN:` get_param routing in `chain_host.c` was fixed earlier.

## Branch protection

`main` is **not** protected here. The repo went public on 2026-08-19, so protection became
*possible*, but the standing rule is unchanged: commit to main directly. ⚠ An earlier stale claim
that PRs were required caused real wasted work; do not resurrect it by inference from the repo being
public.

## The mutation-testing rule

**The rule now:** never `git checkout -- <file>` / `git restore` / `git clean` / `git stash` to undo
a mutation. Use `tools/mutate.sh`.

**Why:** twice on 2026-08-24 a bare revert discarded work that had never been committed — and once
the mutated file was **untracked**, which `git checkout` ignores entirely, so the "restored" tree was
still mutated and the next run reported a pass that meant nothing. A PreToolUse hook now refuses
those verbs on a dirty tree, so the mistake is unavailable rather than merely discouraged.

## The graphify graph — what it gets wrong, and how much it is used

graphify's AST pass resolves a call site to a definition **by bare function name across the whole
corpus**, with no import resolution, then tags the guess `INFERRED`. Any name defined in two files
produces an edge indistinguishable from a real one. Unpruned, this invented a davebox→host
dependency on `shadow_ui.js`, `controller/ui.js` and `menu_ui.js` that does not exist in the source
at all.

`tools/graphify/prune_edges.py` drops cross-file `calls` edges that no import or header declaration
can justify (~10%). Two rules, both provable from source: a JS cross-file call survives only if the
calling file imports the defining file; a C target in a header survives only if that header is
included (this is what keeps `static inline` helpers such as `shadow_pan_gain_l()`), and a target in
a `.c` must be non-static and declared in an included header.

The verified davebox→host seam is exactly ten shared ES modules imported through the canonical
`/data/UserData/schwung/shared/` prefix (`constants`, `input_filter`, `text_entry`, `menu_items`,
`menu_layout`, `menu_nav`, `menu_stack`, `filepath_browser`, `session_state`, `logger`) plus the
C-implemented display primitives (`set_pixel`, `draw_rect`, …). Nothing else crosses.

⚠ **Do not use `graphify.extract.collect_files()`** — it does not recognise `.mjs` and silently
dropped 89 files here, including all 22 of `src/shared/*.mjs`. `rebuild.py` walks `CODE_SUFFIX`
explicitly instead.

**Measured 2026-09-16: graphify is used in 0.04% of lookups** — 7 invocations against 16,285
grep/find calls across 81 sessions (3 before that day). CLAUDE.md spent ~5 KB instructing its use and
a hook nagged on every search. Tested on four probes: `explain "<symbol>"` on a well-connected node
is excellent (116 real edges for `_tickImpl`, 0.4 s); a semantic "how does X work" query returns the
documentation cluster, including retired designs; a low-degree symbol returns location only; `path`
between two files returned nothing. So it earns one line about the shape that works, not five
kilobytes.

Community names survive rebuilds two ways: carried across by membership overlap, and re-anchored
from `tools/graphify/labels.json`, which pins each name to high-degree node ids and **is committed**
(verified restoring 35 of 35 from a cold start). Widening `CODE_ROOTS` reshuffles communities and
strands a few names; re-label and refresh the anchor file in the same pass.

## Docs that look superseded and are not

`docs/HOST_REFERENCE.md` (2026-09-09) took the **shape** of each subsystem. It did not absorb the
detailed references. `docs/SPI_PROTOCOL.md` is still the wire reference (buffer layout, MIDI packet
formats, cable numbers, display protocol, ioctls, constants) against HOST_REFERENCE's single
overview section; `docs/ARCHITECTURE.md` and `docs/MIDI_INJECTION.md` are likewise live — 9, 3 and 7
inbound references respectively. Acting on the earlier wording would have deleted three live
documents (checked 2026-09-16).

Also checked the same day and found alive: `docs/superpowers/` (not empty — a plan and a spec) and
`docs/plans/` (**29** inbound references including two live tests, `test_param_pages_viz.sh` and
`test_param_pages_plan.sh` — moving it breaks the suite).
