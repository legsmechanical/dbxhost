#!/usr/bin/env python3
"""dAVEBOx → Ableton .ablbundle packager (runs on-device via host_system_cmd).

The Schwung host file APIs (host_write_file / host_read_file) are NOT byte-safe
(strlen + UTF-8 on write, NUL-terminated read), so binary samples and the final
ZIP can't be produced from the module's JS. This one-shot script does the binary
work: copy the resolved sample files into the staging Samples/ folder and build a
store-mode (uncompressed) .ablbundle ZIP. It is invoked once per export, offline,
on the device — no network, no daemon.

JS writes a small args JSON (no user-controlled strings on the shell command line)
and reads back the status JSON this script writes.

args JSON:
  { "staging": "<dir>",            # contains Song.abl (written by JS)
    "out":     "<path>.ablbundle", # final bundle path (may contain spaces)
    "samples": [ {"src": "<abs>", "dest": "<rel-in-Samples>"} ... ],
    "status":  "<dir>/pack-status.json" }

status JSON:
  { "ok": true,  "out": "...", "copied": N, "missing": [...] }
  { "ok": false, "error": "..." }

Usage: python3 pack.py <args.json>
"""

import sys
import os
import json
import shutil
import zipfile


def main():
    if len(sys.argv) < 2:
        return 2

    args_path = sys.argv[1]
    try:
        with open(args_path) as f:
            args = json.load(f)
    except Exception:
        return 3

    staging = args["staging"]
    out = args["out"]
    samples = args.get("samples", [])
    status_path = args.get("status", os.path.join(staging, "pack-status.json"))

    status = {"ok": False}
    rc = 1
    try:
        samples_dir = os.path.join(staging, "Samples")
        copied = 0
        missing = []
        if samples:
            os.makedirs(samples_dir, exist_ok=True)
            for s in samples:
                src = s["src"]
                dest = s["dest"]
                dpath = os.path.join(samples_dir, dest)
                os.makedirs(os.path.dirname(dpath), exist_ok=True)
                if os.path.exists(src):
                    shutil.copy2(src, dpath)
                    copied += 1
                else:
                    missing.append(src)

        song = os.path.join(staging, "Song.abl")
        if not os.path.exists(song):
            raise RuntimeError("Song.abl missing in staging")

        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out):
            os.remove(out)

        # Store mode (ZIP_STORED): Live accepts uncompressed bundles, and it
        # avoids spending CPU compressing already-compressed audio.
        with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
            z.write(song, "Song.abl")
            if os.path.isdir(samples_dir):
                for root, _, files in os.walk(samples_dir):
                    for fn in files:
                        full = os.path.join(root, fn)
                        rel = os.path.relpath(full, staging)
                        z.write(full, rel)

        status = {"ok": True, "out": out, "copied": copied, "missing": missing}
        rc = 0
    except Exception as e:
        status = {"ok": False, "error": str(e)[:160]}
        rc = 1

    try:
        with open(status_path, "w") as f:
            json.dump(status, f)
    except Exception:
        pass

    return rc


if __name__ == "__main__":
    sys.exit(main())
