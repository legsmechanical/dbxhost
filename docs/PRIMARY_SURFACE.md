# Primary surface + service stack (P4a — additive, toggle-gated)

The inversion of the overtake model: instead of a tool being a *guest* that
takes the surface over and hands pieces back imperatively, one module can
register as the session's **primary surface**, and every host screen it needs
is reached through a **service stack**. Hardware ownership — input routing,
the co-run split, LED ownership, sysex suppression, the vol / edit-CC / pad
blocks — is **derived** from the stack every tick and applied by diffing,
never asserted at enter/exit sites. There is no handoff to forget and no
re-assertion to miss, which retires the ownership-desync bug class on this
path.

## The toggle

The path is live only when `primary.json` exists under the host state root
(`$HOST_INSTALL_DIR/primary.json`). Without it every binding below is inert
and the classic overtake / co-run lifecycle runs untouched — recovery from a
bad session is deleting one file. The file's content is reserved (write `{}`).

This is a **runtime mode**, not a capability: the bindings exist
unconditionally in this tree (no `typeof` probing — see CLAUDE.md).

## Module-facing bindings (plain globals; one QuickJS context)

```javascript
host_primary_active()          // -> bool: is the toggle live this session?

host_register_primary({        // -> bool: false = use the classic lifecycle
  id: "my-module",             //   surface identity (defaults to module id)
  claims: {                    //   the surface's DECLARED baseline claims
    overtake_mode: 2,          //   own all events (0 = pass to Move)
    suppress_sysex: 1,         //   strip Move's clip/grid LED sysex
    passthrough: "60,119",     //   CCs yielded to Move firmware (CSV)
    /* skip_led_clear, vol_block, edit_cc_block, pad_block, canvas_input,
     * keep_mask, led_keep_mask ... — any claim key, see below */
  },
  onServiceReturn(id, result)  //   called when a service closes, including
                               //   framework-initiated closes (Back)
})

host_open_service(id, opts)    // -> bool: push a host service
host_close_service(result)     // -> bool: pop the top service; the primary's
                               //   onServiceReturn(id, result) fires
```

In P4a the module still loads through the existing boot machinery
(`boot_tool.json` → overtake load); registration inverts *ownership*, not the
dispatcher. `init`/`tick`/`onMidi`/`draw` keep their existing contracts.

## Services

| id                | kind    | opts                                   |
|-------------------|---------|----------------------------------------|
| `chain_editor`    | session | `{slot, keep_mask, led_keep_mask}`     |
| `move_native`     | session | `{track, keep_mask, led_keep_mask}`    |
| `fx_picker`       | overlay | `{keep_mask}`                          |
| `master_fx`       | overlay | `{keep_mask}`                          |
| `global_settings` | overlay | `{keep_mask}`                          |
| `slots`           | overlay | `{keep_mask}`                          |
| `chain_editor_view` | overlay | `{slot, keep_mask}`                  |

*Session* services open a co-run session (the SHM-state poll primes the
editor exactly as with `shadow_corun_begin`); *overlay* services draw an
addressable host screen over the surface (the `CORUN_ENTRIES` set,
generalized). Overlays may be pushed on top of sessions (e.g. `fx_picker`
over `move_native`); the stack unwinds in order.

A service the host hasn't absorbed yet is exactly what this exists for: push
it, let the user work, get `onServiceReturn` — claims restore by derivation.

## Claim keys

`overtake_mode`, `corun_target`, `corun_id`, `keep_mask`, `led_keep_mask`,
`overlay`, `overlay_keep_mask`, `skip_led_clear`, `suppress_sysex`,
`vol_block`, `edit_cc_block`, `pad_block`, `canvas_input`, `passthrough`.

Effective claims = neutral ← primary ← stack bottom→top, key-by-key; a
service overrides only the keys it names. The derivation and the diff→op
compiler are pure (`src/shadow/shadow_ui_primary.mjs`) and unit-tested
off-device (`tests/host/test_primary_claims.sh`); the op vocabulary maps 1:1
onto the host bindings that already own SHM write-ordering
(`shadow_corun_begin` writes keep before target, etc.).

## Lifecycle notes

- **Framework closes are reconciled**: if the shim's Back handler ends a
  co-run session, the host notices the SHM target dropped, pops the stack,
  re-derives claims, and fires `onServiceReturn(id, null)`. The module never
  needs its own poll-reconcile on this path.
- **Re-registration and the first reconcile are self-healing**: ops are
  idempotent SHM writes, so deriving over whatever the classic load path
  already asserted converges rather than glitching.
- **P4b** (destructive) deletes the classic overtake lifecycle only after
  this path is device-proven. Until then both coexist behind the toggle.
