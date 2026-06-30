# Fork-local patches

Re-appliable patches for **fork-only divergences** carried on fork `main`. They
must be **re-applied on every rebase** onto `upstream/main`. **Fork-only — never
include `patches/` in an upstream PR** (see [[schwung-never-push-claudemd-upstream]]
/ `CLAUDE.md` → "⚠️ Fork-only divergences"). Committed here so they're backed up on
the fork remote.

## fx-blocks-local.patch

Our extra FX-block work — a 2-commit `format-patch` series:

- `87a997d3` **feat(fx): Send FX + Move FX buses + generic FX-bus picker**
- `72f8f641` **fix(chain): route fx3/fx4 get_param** (slot synth-chain blocks 3–4)

Split of what's permanent vs temporary:

- **Send FX** is upstreamable — draft PR `charlesvestal/schwung#121` (parked; Charles
  needs review time). Retire this half once #121 merges.
- **Move FX** (`MOVE_FX_BLOCKS=4`) and **slot fx3/fx4** are ⛔ **permanent fork-only**
  (the 4-block divergence — `CLAUDE.md`). Keep forever.

### Re-apply on rebase

After rebasing fork `main` onto `upstream/main` (merged dup commits auto-drop):

```sh
git apply --3way patches/fx-blocks-local.patch
# Expect a ONE-TIME conflict in src/shadow/shadow_ui.js: Send FX and fx3/fx4 both
# edit it, against upstream's moved (merged presets/corun) version. This is inherent
# to the entanglement, not a patch defect. Resolve it, then:
git add -A && git commit -m "Re-apply fork-local FX blocks (patches/fx-blocks-local.patch)"
```

Then **regenerate** so the patch tracks the new base:

```sh
git format-patch -1 <send-fx-hash> --stdout >  patches/fx-blocks-local.patch
git format-patch -1 <fx34-hash>    --stdout >> patches/fx-blocks-local.patch
```

> `git am --3way` is stricter than `git apply --3way` and conflicts even on the first
> commit — prefer `git apply --3way` (fewer conflicts, then a single fork-local commit).

## remote-ui-overtake-tools.patch

Host-side bridge so the **schwung-manager** web UI serves a tool module's
`web_ui.html` remote UI for the **active overtake tool**, reached via the shim's
existing `overtake_dsp:` param prefix. **Entirely in `schwung-manager/`** (no
shim/host-C change); fully generic with no module-specific assumptions.

**Upstreamed as PR `charlesvestal/schwung#148`** (single squashed commit off
`upstream/main`) — carried here as a patch only until that merges. A tool module
pairs by flipping its `web_ui` prefix `synth:`→`overtake_dsp:` and answering
`get_param("module_id")`.

### Re-apply on rebase

Manager-only files don't entangle with upstream's host source, so a clean apply is expected:

```sh
git am --3way patches/remote-ui-overtake-tools.patch
# If git am balks, fall back to a squashed apply:
#   git apply --3way patches/remote-ui-overtake-tools.patch && git add -A && \
#   git commit -m "Re-apply remote-ui-overtake-tools (patches/remote-ui-overtake-tools.patch)"
```

Then **regenerate** so the patch tracks the new base (single squashed commit):

```sh
git format-patch -1 <replayed-commit> --stdout > patches/remote-ui-overtake-tools.patch
```
