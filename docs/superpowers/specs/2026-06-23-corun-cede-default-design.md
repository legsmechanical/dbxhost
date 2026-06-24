# Co-run input contract — cede-default, uniform classification (host-only)

**Date:** 2026-06-23
**Repo:** `schwung` (host) — host-only; one module (davebox) migrated in lockstep
**Status:** DRAFT spec (supersedes `2026-06-21-corun-input-classification-design.md`)
**Replaces:** the `CORUN_KEEP_EXTENDED` opt-in flag + extended-button carve-out

## Goal

Make the co-run control surface a **single, uniform contract**: every physically
distinct Move control is a first-class `CORUN_GRP_*` group, and a tool declares
ownership with **one consistent default — KEEP**. A tool keeps the whole surface
and lists only what it **cedes** to the co-run peer (Move firmware or the Schwung
chain editor). No second-class inputs, no per-input opt-in flag, no tiers.

This is the framework primitive we want to expose upstream "so anyone can use any
input for whatever they want." The default is the most load-bearing decision,
because every future module inherits it silently.

## Why this supersedes the flag design

The 2026-06-21 branch classified the 12 unclassified buttons but had to gate them
behind `CORUN_KEEP_EXTENDED`, leaving a permanent two-tier surface (bits 0–12
always in the split; the new 12 only when the flag is set). The root cause it was
working around is an **inconsistent default**, not the buttons themselves:

| Input kind today | Default ownership |
|---|---|
| Unclassified (the 12 buttons) | **KEEP** (always stay with tool) |
| Classified but unlisted in `keep_mask` | **CEDE** (go to peer) |

Classifying a button moves it from the keep-default world into the cede-default
world — which is why classification was unsafe and needed a flag. Fix the default
instead of papering over it, and the flag, the carve-out, and the tiering all
disappear.

## Background — current model

`corun_group_for_event(type, d1)` maps a cable-0 MIDI event → one `CORUN_GRP_*`
bit (or 0 = unclassified). `corun_event_owner` resolves TOOL vs PEER:

```c
uint16_t grp = corun_group_for_event(type, d1);
if (grp == CORUN_GRP_BACK && !(keep_mask & CORUN_KEEP_BACK)) return CORUN_OWNER_NONE;
if (!grp) return CORUN_OWNER_TOOL;                 /* unclassified ⇒ always tool */
uint16_t keep = corun_keep_mask_eff(keep_mask);    /* keep_mask ? keep_mask : DEFAULT */
return (keep & grp) ? CORUN_OWNER_TOOL : CORUN_OWNER_PEER;
```

Two ownership layers in the `/schwung-control` SHM (`shadow_control_t.corun`):

```c
struct {
    int8_t target;          /* corun_target_t: NONE / CHAIN_EDIT / MOVE_NATIVE */
    int8_t id;
    uint16_t keep_mask;      /* CORUN_GRP_* the tool owns for INPUT */
    uint16_t led_keep_mask;  /* CORUN_GRP_* the tool owns for LEDs; 0 = follow keep_mask */
} corun;
```

Only **davebox** sets any of this (verified: it's the lone co-run *tool*; synths
are always the peer). `led_keep_mask` lets davebox paint the track-button clip
indicators while ceding the press.

## Design

### 1. The model: cede-default

A tool **keeps every input by default** and declares a **cede-list**:

- `cede_mask` — `CORUN_GRP_*` the tool hands to the peer. Everything else is the
  tool's. `cede_mask == 0` ⇒ tool keeps the entire surface (valid, meaningful).
- LED ownership mirrors it: `led_cede_mask` — LEDs the tool hands to the peer;
  the tool paints everything else.

Owner resolution becomes uniform — no `grp == 0` special case, no flag, no
extended carve-out:

```c
corun_owner_t corun_event_owner(ctrl, type, d1) {
    if (!corun_active(ctrl)) return CORUN_OWNER_TOOL;
    uint32_t grp = corun_group_for_event(type, d1);   /* full classifier; 0 only for non-buttons */
    if (grp == CORUN_GRP_BACK && (ctrl->corun.cede_mask & CORUN_CEDE_BACK)) {
        /* Back: framework exit gesture unless the tool keeps it. See §6. */
        return CORUN_OWNER_NONE;
    }
    if (!grp) return CORUN_OWNER_TOOL;                 /* genuinely unroutable (sensor CCs) */
    return (ctrl->corun.cede_mask & grp) ? CORUN_OWNER_PEER : CORUN_OWNER_TOOL;
}
```

Note the inversion vs today: the mask test now returns PEER when the bit is set
(cede), TOOL otherwise (keep).

### 2. Classify every input uniformly (carried from the prior branch)

Every distinct control gets a group bit; masks widen to `uint32_t`. The 12
formerly-unclassified buttons join as ordinary first-class groups — no longer
fenced off:

| CC | Group | CC | Group | CC | Group |
|----|-------|----|-------|----|-------|
| 85 | `PLAY` | 60 | `COPY` | 55 | `NAV_UP` |
| 86 | `REC` | 119 | `DELETE` | 54 | `NAV_DOWN` |
| 118 | `SAMPLE` | 56 | `UNDO` | 62 | `NAV_LEFT` |
| 58 | `LOOP` | 52 | `CAPTURE` | 63 | `NAV_RIGHT` |

Existing groups unchanged: `OLED PADS STEPS JOG TRACK_BUTTONS KNOBS MASTER SHIFT
BACK MENU TOUCH MUTE`. `TRANSPORT` becomes the composite `PLAY|REC|SAMPLE|LOOP`.
Sensor CCs (mic/speaker plug-detect 114/115) stay unclassified (`grp == 0`) — they
are not routable buttons; under cede-default `grp == 0` correctly means "always
tool" (it can't be ceded, which is right for a sensor).

Convenience composites: `CORUN_GRP_NAV`, `CORUN_GRP_EDIT (COPY|DELETE|UNDO|CAPTURE)`,
`CORUN_GRP_TRANSPORT`.

### 3. The LED layer (the question that prompted this)

`led_cede_mask` mirrors `cede_mask`: LEDs the tool gives away; it paints the rest.
This keeps the two axes consistent (the whole point) **and** preserves davebox's
"paint but don't handle" pattern:

- davebox cedes the track-button *press* → `TRACK_BUTTONS ∈ cede_mask`
- davebox keeps painting the track-button *LEDs* → `TRACK_BUTTONS ∉ led_cede_mask`

**The "follow input" sentinel problem.** Today `led_keep_mask == 0` means "LED
ownership follows input." Under cede-default, `0` is a real value ("cede no LEDs =
paint everything"), so it can no longer double as the follow sentinel. Resolution:
an explicit indicator, default = follow.

- Add `CORUN_LED_DISTINCT` flag (in a small `corun.flags` byte). **Clear (default)**
  ⇒ LED ownership == input ownership (`led` derived from `cede_mask`). **Set** ⇒
  the host uses `led_cede_mask` verbatim. davebox sets it (it has distinct LED
  ownership); every other tool gets the friendly follow-the-input default for free.

### 4. Backward compatibility (the only real seam)

Flipping the mask meaning would misread a legacy keep-list tool, and upstream may
have co-run tools we can't inspect. So we keep one **model-level** seam — normal
versioning, not a per-input tier:

- New `corun.flags` bit `CORUN_MODEL_CEDE`.
  - **Set** ⇒ host interprets `cede_mask` / `led_cede_mask` (this model).
  - **Clear** ⇒ host runs the **legacy keep-list path verbatim** (old
    `corun_event_owner`, old `corun_group_for_event` with the 12 unclassified, old
    `keep_mask`/`led_keep_mask`). Byte-for-byte today's behavior.
- A tool selects the model implicitly by which JS API it calls (see §5). No tool
  ever sees a "flag per button"; it just picks the cede API and lists what it cedes.
- Legacy keep-list support is deprecation-window scaffolding: once all known co-run
  tools are on the cede model, the legacy path can be retired in a later release.

This makes fork and upstream identical (no divergence) and breaks nothing.

### 5. Module-facing JS API

New, model-selecting entry points (host functions exposed to modules):

- `shadow_corun_begin(target, id, cede_mask)` — **v2**, sets `CORUN_MODEL_CEDE`.
  (Old `shadow_corun_begin` keep-list signature retained under the legacy path, or
  renamed; decide in plan to avoid silent signature reinterpretation.)
- `shadow_corun_set_cede_mask(mask)` / `shadow_corun_set_led_cede_mask(mask)` —
  the latter sets `CORUN_LED_DISTINCT` as a side effect.
- Host should also **publish the `CORUN_GRP_*` constants to JS** (the prior spec's
  deferred non-goal) so modules stop hand-copying bit values. Worth doing now that
  the surface is the public contract. (Plan: small generated JS constants file or a
  host getter.)

### 6. Back gesture under cede-default

Back stays the framework exit gesture by default. Today: framework consumes Back
unless `CORUN_KEEP_BACK` is set. Under cede-default the natural spelling is: Back
is framework-owned (exit) **unless the tool cedes it** with `CORUN_CEDE_BACK`,
in which case it routes to the peer per normal rules; a tool that wants Back for
its own sub-nav keeps it (default) and handles it. Confirm this preserves davebox's
current Back behavior (it currently sets `CORUN_KEEP_BACK`). Map the equivalence
explicitly in the plan.

### 7. davebox migration (lockstep, the only module touched)

Today (keep-list): keeps `{PADS, STEPS, TRANSPORT, MENU}` (+ `MUTE` for chain-edit;
+ `KEEP_BACK`); LED keeps the above + `TRACK_BUTTONS`; FX-picker variant cedes more.
Re-express as cede-lists (keep everything else by default):

- **Move-native / default:** `cede_mask = {JOG, KNOBS, MASTER, SHIFT, BACK, TOUCH,
  TRACK_BUTTONS, MUTE}` (cedes Mute to Move — current behavior) + whatever of the
  newly-available buttons davebox wants the peer to have (likely none initially →
  it now *keeps* Play/Rec/Copy/Delete/etc. exactly as today's unclassified default).
- **Chain-edit:** same but **keep** `MUTE` (don't cede) — i.e. `MUTE ∉ cede_mask` —
  EXCEPT per the just-shipped fix davebox ignores Mute in chain-edit anyway; the
  cede model lets us express "cede Mute to the chain bypass modifier" directly
  instead of the JS guard. (Revisit: the 2026-06-23 chain-edit Mute fix may fold
  into this cleanly — cede `MUTE` in chain-edit and drop the `schwungCoRunSlot`
  guard. Evaluate in the plan.)
- **FX picker:** its extra cedes become extra `cede_mask` bits.
- **LED:** `led_cede_mask` = `cede_mask` minus `TRACK_BUTTONS` (paint clip dots),
  with `CORUN_LED_DISTINCT` set.

Critically: davebox's mask is now a *complete, explicit* statement, and the newly
classified buttons it doesn't list are **kept automatically** — same as today, but
now intentional rather than accidental.

### 8. SHM ABI

Restructure `corun` (this is an ABI bump regardless):

```c
struct {
    int8_t  target;
    int8_t  id;
    uint8_t flags;          /* CORUN_MODEL_CEDE | CORUN_LED_DISTINCT */
    uint8_t _pad;
    uint32_t cede_mask;     /* (legacy path reads this slot as keep_mask) */
    uint32_t led_cede_mask; /* (legacy path reads this slot as led_keep_mask) */
} corun;
```

- Bump `CONTROL_BUFFER_SIZE` until `shadow_control_size_check` compiles (~76 → ~84).
- **Shim + host + shadow_ui rebuilt from the same header and deployed together**
  (PR #133 dep-glob already forces host rebuild on header change). Modules don't map
  this SHM, so no module is affected by the ABI bump — only by the model semantics.
- JS bridge: keep the prior branch's `uint32_t` casts + `0x7FFFFFFF` range guards
  (bit 31 unused; JS coerces signed via `| 0`).

## Non-goals

- No new sound/behavior — purely the co-run ownership contract.
- Not retiring the legacy keep-list path in this change (deprecation later).
- Not touching sensor CCs (114/115).

## Test plan

- Unit: `corun_event_owner` truth table for both models (legacy keep + new cede),
  every group, `CORUN_OWNER_NONE` Back cases, LED follow-vs-distinct.
- Unit: legacy path is byte-identical to pre-change `corun_event_owner` (golden).
- Build: ARM `build.sh` clean; `shadow_control_size_check` static assert passes.
- Device regression (the deploy Josh held on the prior branch):
  - davebox co-run unchanged in all modes (Move-native, chain-edit, FX picker):
    kept inputs still kept, ceded inputs still ceded, LEDs correct.
  - Newly classified buttons (Play/Copy/Delete/nav/etc.) still behave as today in
    davebox co-run (kept), proving the default.
  - A throwaway test tool that cedes one new button (e.g. `CAPTURE`) to prove the
    new power works end-to-end.

## Upstream framing

Host-only, single coherent contract, no module breakage (legacy path), and it
publishes the input constants to JS. Pairs naturally with the other co-run host
work (the `MUTE` group `6decd147`, the canvas co-run fix `92f8d404`+`e1fcf651`)
for one bundled co-run upstream PR.

## Open decisions (flag for Josh)

1. **Compat strategy:** soft migration (legacy path kept; recommended, fork==upstream)
   vs clean flip (cede-only, migrate davebox, breaking for unknown upstream tools).
   Spec above assumes **soft migration**.
2. **Fold in the 2026-06-23 chain-edit Mute fix?** Cede-model lets us express it
   natively (cede `MUTE` in chain-edit) and drop the `schwungCoRunSlot` JS guard.
3. **Publish `CORUN_GRP_*` to JS now** (recommended) vs defer again.
