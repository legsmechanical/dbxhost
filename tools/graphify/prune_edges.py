#!/usr/bin/env python3
"""Drop cross-file `calls` edges that no import or header declaration can justify.

graphify's AST pass resolves a call site to a definition by bare function name across
the whole corpus. Any name defined in two files therefore produces an edge that looks
identical to a real one, tagged INFERRED. On this repo that invented a davebox->host
dependency on `shadow_ui.js`, `controller/ui.js` and `menu_ui.js` that does not exist.

Two rules, both provable from the source rather than guessed:

  JS/MJS  a cross-file call survives only if the calling file imports the file the
          target is defined in. Import specifiers are matched on basename, so the
          canonical runtime prefix (/data/UserData/schwung/shared/x.mjs) and a relative
          ./x.mjs both resolve.

  C/H     a cross-file call survives only if the target is reachable from the calling
          file's includes (followed one level through header includes). A target defined
          in a header is reachable when that header is included -- `static inline` helpers
          such as shadow_pan_gain_l() live there and are legitimately called everywhere.
          A target defined in a .c file must be non-static (a `static` in a .c is
          file-local by definition, so an edge leaving it is impossible) and declared in
          an included header.

Intra-file calls are always kept: name resolution cannot be ambiguous within one file.
Non-`calls` relations are never touched -- `imports`, `contains` and the semantic layer
are already accurate.

Usage:  prune_edges.py <extract.json> [-o out.json] [--report]
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

JS_EXT = (".js", ".mjs")
C_EXT = (".c", ".h")

IMPORT_RE = re.compile(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""")
INCLUDE_RE = re.compile(r'^\s*#\s*include\s*"([^"]+)"', re.M)
# `static` definitions: allow return types spanning `static const struct foo *name(`
STATIC_DEF_RE = re.compile(r"^\s*static\s+[\w\s\*\(\)]*?(\w+)\s*\(", re.M)
# declarations in headers: `int foo(`, `void bar(`, `const char *baz(`
HEADER_DECL_RE = re.compile(r"^[\w][\w\s\*]*?(\w+)\s*\([^;{]*\)\s*;", re.M)


def read(root: Path, rel: str) -> str:
    try:
        return (root / rel).read_text(errors="replace")
    except OSError:
        return ""


def build_js_imports(root: Path, files: set[str]) -> dict[str, set[str]]:
    """file -> set of imported module basenames (no extension)."""
    out: dict[str, set[str]] = {}
    for f in files:
        if not f.endswith(JS_EXT):
            continue
        mods = set()
        for spec in IMPORT_RE.findall(read(root, f)):
            base = spec.rsplit("/", 1)[-1]
            for e in JS_EXT:
                if base.endswith(e):
                    base = base[: -len(e)]
                    break
            mods.add(base)
        out[f] = mods
    return out


def build_c_tables(root: Path, files: set[str]):
    """Return (includes, header_decls, statics) keyed by file / header basename."""
    includes: dict[str, set[str]] = {}
    header_decls: dict[str, set[str]] = defaultdict(set)
    statics: dict[str, set[str]] = {}

    for f in files:
        if not f.endswith(C_EXT):
            continue
        text = read(root, f)
        includes[f] = {i.rsplit("/", 1)[-1] for i in INCLUDE_RE.findall(text)}
        statics[f] = set(STATIC_DEF_RE.findall(text))
        if f.endswith(".h"):
            base = f.rsplit("/", 1)[-1]
            for name in HEADER_DECL_RE.findall(text):
                header_decls[base].add(name)

    # follow header -> header includes one level, so a .c that includes a
    # roll-up header still sees what that header pulls in
    header_files = {f.rsplit("/", 1)[-1]: f for f in includes if f.endswith(".h")}
    expanded = {}
    for f, incs in includes.items():
        seen = set(incs)
        for h in incs:
            hf = header_files.get(h)
            if hf:
                seen |= includes.get(hf, set())
        expanded[f] = seen
    return expanded, header_decls, statics


def fn_name(label: str) -> str:
    return label.split("(")[0].strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("extract")
    ap.add_argument("-o", "--out")
    ap.add_argument("--report", action="store_true", help="print what was dropped")
    ap.add_argument("--root", default=".", help="repo root the source_files are relative to")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    data = json.loads(Path(args.extract).read_text())
    nodes = {n["id"]: n for n in data["nodes"]}
    files = {n.get("source_file") for n in data["nodes"] if n.get("source_file")}

    js_imports = build_js_imports(root, files)
    includes, header_decls, statics = build_c_tables(root, files)

    kept, dropped = [], []
    for e in data["edges"]:
        if e.get("relation") != "calls":
            kept.append(e)
            continue
        s, t = nodes.get(e["source"]), nodes.get(e["target"])
        if not s or not t:
            kept.append(e)
            continue
        sf, tf = s.get("source_file"), t.get("source_file")
        if not sf or not tf or sf == tf:
            kept.append(e)
            continue

        name = fn_name(t.get("label", ""))
        verdict = None

        if sf.endswith(JS_EXT) and tf.endswith(JS_EXT):
            tbase = tf.rsplit("/", 1)[-1]
            for x in JS_EXT:
                if tbase.endswith(x):
                    tbase = tbase[: -len(x)]
                    break
            if tbase not in js_imports.get(sf, set()):
                verdict = f"{sf} does not import {tbase}"

        elif sf.endswith(C_EXT) and tf.endswith(C_EXT):
            src_includes = includes.get(sf, set())
            if tf.endswith(".h"):
                # defined in a header: reachable exactly when that header is included.
                # covers `static inline` helpers, which are per-includer copies.
                if tf.rsplit("/", 1)[-1] not in src_includes:
                    verdict = f"{sf} does not include {tf}"
            elif name in statics.get(tf, set()):
                verdict = f"{name} is static in {tf}"
            else:
                visible = set()
                for h in src_includes:
                    visible |= header_decls.get(h, set())
                if name not in visible:
                    verdict = f"{name} not declared in any header {sf} includes"

        if verdict:
            dropped.append((e, verdict))
        else:
            kept.append(e)

    data["edges"] = kept
    out = args.out or args.extract
    Path(out).write_text(json.dumps(data))

    total_calls = sum(1 for e in data["edges"] if e.get("relation") == "calls") + len(dropped)
    print(f"calls edges: {total_calls} -> {total_calls - len(dropped)} ({len(dropped)} dropped)")
    print(f"all edges:   {len(kept) + len(dropped)} -> {len(kept)}")
    print(f"written to {out}")

    if args.report:
        by_reason = defaultdict(int)
        for _, why in dropped:
            by_reason["static" if "is static" in why else
                       "no header decl" if "header" in why else "no import"] += 1
        print("\ndropped by rule:", dict(by_reason))
        print("\nsample:")
        for e, why in dropped[:15]:
            print(f"  {nodes[e['source']].get('label')} -> {nodes[e['target']].get('label')}   ({why})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
