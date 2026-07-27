# dAVEBOx Host Support Packs

## Purpose

dAVEBOx sometimes needs host capabilities before upstream Schwung has accepted or shipped
them. Host Support Packs are the planned mechanism for distributing those capabilities to
dAVEBOx users safely, without presenting Git patches as an end-user installation method.

This is a parked reference/design, not an implemented feature.

## User experience

dAVEBOx would offer a **dAVEBOx Host Support** menu entry. It reports whether the host has
the capabilities required by the installed dAVEBOx version and, when appropriate, offers
to install, update, or restore a compatible support pack.

The user explicitly confirms. dAVEBOx then exits cleanly, the support pack is activated,
and the host restarts. On the next launch dAVEBOx reports whether the required capabilities
are available.

## What we distribute

We maintain dAVEBOx-related host changes as small, re-applicable patch series in the
Schwung fork. That is a developer and rebase workflow only. Users receive a complete,
tested, versioned host payload—not raw source patches or binary deltas.

Each pack is tied to:

- an exact compatible Schwung base/build;
- a compatible dAVEBOx version range;
- a signed manifest and payload hash; and
- explicit capability versions it provides.

For example:

```json
{
  "host_version": "0.12.0",
  "build_id": "davebox-host-2026.08.1",
  "capabilities": {
    "overtake_remote_ui": 2,
    "remote_ui_push": 1,
    "external_midi_delivery": 1
  }
}
```

dAVEBOx should capability-gate individual features, continuing to work on stock Schwung
while hiding or disabling only features whose required capability is absent or too old.

## Trust boundary

dAVEBOx may orchestrate an install but must not directly replace host files. It is a
QuickJS tool module with file/download facilities, and the current host also exposes an
allow-listed shell-command bridge. Those are useful implementation ingredients, but not a
sufficient public privilege boundary.

A narrow, trusted privileged host helper must own activation. It should accept only a
staged and verified pack, with operations equivalent to:

```
status
verify <staged-pack>
activate <staged-pack>
rollback
```

The existing `schwung-heal` setuid helper is the relevant precedent: it mirrors approved
payload files from `/data/UserData/schwung` into protected system locations. A support-pack
installer should extend that constrained model rather than granting arbitrary host-update
authority to module code.

## Safe activation requirements

- Verify signature, archive layout, manifest, hashes, and host/dAVEBOx compatibility before
  changing the active host.
- Stage a complete new payload outside the live path.
- Retain a known-good previous payload as a rollback slot.
- Atomically activate the staged payload, then run the privileged mirror/heal step.
- Restart only after dAVEBOx has exited.
- Health-check the restarted stack and roll back automatically on failure.

## Bootstrap and scope

Users need one normal Schwung installation/update that includes the trusted pack helper.
After that bootstrap, dAVEBOx can offer compatible support-pack updates from its own UI.

Start with one complete, tested fork build per supported upstream base. Do not start with
composable overlays; add them only if their dependency, compatibility, and rollback model
remains simple.

## Open questions

- Signing-key ownership and offline/revocation policy.
- The authoritative host build identifier available to modules.
- Staging/rollback locations and retained-slot count.
- Whether particular payloads require a restart or a full reboot.
- How failed download and failed post-restart health checks are surfaced on the Move and in
  schwung-manager.
- Which existing patches are first-class dAVEBOx capabilities versus upstream-only work.

## Evidence and related references

- [`SCHWUNG_PATCHES.md`](SCHWUNG_PATCHES.md) documents dAVEBOx's existing host-patch
  context.
- `schwung/patches/README.md` documents the fork-local patch workflow.
- `schwung/schwung-manager/self_heal.go` documents the `schwung-heal` privilege boundary.
- `schwung/src/shadow/shadow_ui.c` exposes the existing module file/download and command
  facilities.

