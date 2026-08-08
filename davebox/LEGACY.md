# dAVEBOx Legacy

**This repo is the home of dAVEBOx Legacy** — the stock-Schwung-hosted build of dAVEBOx
(module id `davebox`, state prefix `seq8`), frozen at tag **`davebox-legacy-1.0`**
(2026-08-08).

## What happened

As of 2026-08-08, active dAVEBOx development moved to the **dAVEBOx SA** lineage, which lives
as the `davebox/` tree inside the `dbxhost` repository and ships as one versioned deliverable
with that host. This repo continues to exist independently and permanently as the Legacy home
— it is not archived, and its history was copied (not moved) into `dbxhost`.

## What Legacy is

- The dAVEBOx tool module that runs under **stock Schwung** (charlesvestal/schwung), installed
  from this repo via `build.sh` / `install.sh` (module id `davebox`).
- Feature-complete as of the freeze: the full sequencer, sound mode (richer under the dbx host,
  still correct on stock via capability gating), module hosting, remote UI.
- Sessions are deliberately **incompatible** with dAVEBOx SA (separate state prefixes:
  `seq8` here, `seq8sa` in SA). Neither reads the other's state.

## What Legacy will never get

- SA features from the re-architecture onward: the primary-surface/service-stack UI model,
  the SA project workspace, host-surface absorption, the standardized UI language, 8-chain
  support, or the new set model.
- Routine backports. SA changes are never backported here.

## What Legacy may still get

- **Legacy-critical fixes only** — data loss, crashes, or breakage caused by a stock Schwung
  update — applied directly in this repo, on top of the freeze tag.

## Installing

Unchanged from before the freeze: see `README.md` / `QUICKSTART.md`. `build.sh` then
`install.sh` deploys the stock-hosted module (and reboots the device to remap the shim).
`MANUAL.md` is the Legacy manual; `MANUAL-SA.md` describes SA and does not apply here.
