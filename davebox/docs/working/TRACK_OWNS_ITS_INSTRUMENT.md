# A track owns its instrument — spec

Status: **proposed** (Josh, 2026-08-11). Supersedes the P8-2 ruling of the same day
("1:1 default track→slot with free override"), in the direction that ruling was already
heading — this makes the 1:1 structural instead of merely default.

## The idea

Today a track carries two independent addressing concepts: a **route** (Move / Schwung /
Ext) and a **slot** (which chain it plays through). Users have to hold both, and we
deliberately kept them independent — which is exactly the complexity being removed here.

**A track owns its instrument.** Declaring a track "Schwung" gives it a chain of its own,
created with the track. There is no slot to choose, no routing to set, and no way to
express an ambiguous assignment.

The track menu's `Route` row becomes an **Instrument** selector:

| Instrument | Meaning |
|---|---|
| `Move 1`–`Move 4` | plays that Move instrument, through its Move FX bus |
| `Schwung` | plays this track's own chain |
| `MIDI` | plays nothing itself; sends notes somewhere, see below |

A `MIDI` track gains one more row, **MIDI to**:

| MIDI to | Meaning |
|---|---|
| `Ext 1`–`Ext 16` | out to external gear on that channel |
| `Track 1`–`Track 8` | plays that track's instrument |

`MIDI to Track` is how one instrument is played by more than one track — the case that
slot-sharing covers today, expressed directionally and visibly instead of by coincidence
of two tracks naming the same slot.

## What this deletes

- **The Slot row** in the track menu, and the whole user-facing notion of a slot.
- **The 8-shared-total cap** and any assignment-time enforcement of it: 8 tracks each
  owning at most one instrument makes oversubscription unrepresentable.
- **The tracks-5-to-8-address-a-Move-track corner.** A track routed to Move today reaches
  one of Move's four via its channel setting; `Move 1`–`Move 4` are literal entries, so the
  ambiguity cannot be written down.
- Eventually **`tN_slot`** itself: the slot becomes the track index, so the param and its
  migration fallback are derivable rather than stored.

## Decisions (Josh, 2026-08-11)

### 1. Changing a track's instrument PARKS its chain, never destroys it

Switching a loaded Schwung track to `Move 2` and back must return the synth, its effects
and their state. The chain is parked, not torn down.

⚠ This is newly *visible* under this model. Today the chain survives a route change by
construction, because it belongs to a slot rather than to the track — so "does my sound
survive" was never a question anyone had to answer. Here it is a deliberate one, and
getting it wrong is silent data loss of exactly the kind that is only noticed later.

Implication: a parked chain still occupies its track's instance. That costs nothing — the
idle gate makes a silent chain nearly free — and it keeps "all 8 instantiated" (the other
P8-2 ruling) true and simple.

### 2. A MIDI track may only target a Move or Schwung track

`MIDI to Track N` is rejected — not followed — when track N is itself a MIDI track. This
kills routing cycles by construction rather than by cycle detection, and it is one sentence
to explain in the UI. Chains of MIDI tracks are not a feature anyone asked for; the useful
case (several tracks playing one instrument) is fully served by the direct form.

### 3. Slot settings LOSE their routing rows, and MPE goes with them

Josh, same session, signing off both deletions explicitly (the standing rule requires
item-by-item sign-off for anything user-facing that is removed):

- **`Recv Ch` and `Fwd Ch` go.** Once the track owns its instrument, "where do this
  track's notes go" is answered entirely by the Instrument selector and `MIDI to`. Two
  places to express routing is exactly the ambiguity this spec exists to remove — and the
  slot-settings pair would be the stale one, since nothing reads it.
- **`MPE` goes.** davebox does not support MPE.

⭑ Both are confirmed dead rather than merely redundant. davebox dispatches notes by
**addressed slot**, never by channel match (`ROUTE_SCHWUNG` = "host->midi_send_internal_slot
→ addressed chain slot", seq8.c:92), so a slot's receive channel has no effect on anything
davebox does. And MPE is *defined* as recv=All + fwd=Thru — it is built out of the very two
rows being deleted, so it could not have survived its own dependencies. All three were
absorbed from the host's chain editor in P7 because that screen had them, not because this
module uses them.

⚠ **Delete the surface, not the host params — but not for the reason first written here.**
An earlier draft said "other (stock) consumers use them". That was wrong twice. dbxhost and
stock Schwung are **separate installs with separate binaries** (they share modules/presets/
patches — content, not code), so nothing deleted here can affect stock at all. And the real
consumers are not display-only.

Who actually reads these fields in this host:

| site | what it does |
|---|---|
| `shadow_midi.c:865` | dispatches external cable-2 MIDI to slots with **receive=All AND forward=THRU** |
| `schwung_shim.c:6144` | `any_thru_slot_active()` — **globally bypasses** the cable-2 channel remap if any slot is forward=THRU |
| `shadow_midi.c:216` | channel remap on forward |

⭑ Those first two conditions are the *definition* of MPE mode. **The only load-bearing
consumers of these fields are the MPE machinery** — which independently corroborates the
call to drop it: forward=THRU exists to serve nothing else.

So: keep the host fields for now, because host code reads them and removing state is a
bigger, separate change than removing a UI surface. But note the consequence — with the rows
gone nothing can ever set recv=All + fwd=THRU, so `any_thru_slot_active()` is permanently
false and that dispatch loop never matches. **The host is left carrying an unreachable MPE
path**, which is a later slimming opportunity and belongs on the board, not in this change.

What that leaves on the screen, all genuinely per-instrument: Volume, Send A, Send B,
Transpose, Muted, Soloed, and the Knobs / LFO 1 / LFO 2 sub-editors.

Code that goes with the rows: the derived MPE row and its whole apparatus — `setSlotMpe`'s
atomic three-write set, `recomputeMpeRow`, the `mpePreState` array, and the `mpe:` special
cases in the edit and render paths.

⚠ Leftover to fix in the same pass: the screen is called **[SLOT SETTINGS]**. With the slot
no longer a user-facing concept, that name outlives the thing it names — the same shape as
the dead `Move>Schw` row deleted on 2026-08-11.

## Migration

Projects whose tracks point at a non-1:1 slot collapse to track-owns-slot-N. Permitted by
the standing no-back-compat-until-shipped rule, and after the 4→8 flip most projects are
1:1 already — but **Josh's own SA projects are the ones that would move**, so audit them
before rather than after.

The frozen legacy divisor (`SEQ8_LEGACY_CHAIN_SLOTS`, added with the 4→8 flip) becomes
irrelevant once `tN_slot` retires, but should not be deleted in the same change — one
behaviour move at a time.

## What is already built for this

The Move-vs-chain split in sound mode (P8a 1b) maps exactly onto the Instrument selector:
every track has one instrument, and the route already picks which flavour of sound mode you
see. That half needs no rework.

## Open

- Naming: is `Schwung` the right user-facing word for "this track's own chain"? It is the
  host's name, not a description. `Chain`, or simply the loaded module's name once there is
  one, may read better.
- Where the Instrument selector's Move entries should show a Move track that is already
  taken by another track — allowed (two tracks can drive one Move instrument) or shown as
  in-use? Not blocking; decide when building.
