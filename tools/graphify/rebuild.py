#!/usr/bin/env python3
"""Rebuild the dbxhost knowledge graph from a merged extraction.

Wraps the steps that have to happen in order after any re-extraction: prune the
unjustifiable call edges, build, cluster, carry the hand-written community labels
across, then regenerate report / graph.json / wiki / graph.html.

Community ids are assigned fresh by Louvain on every run, so labels cannot be stored
against them. They are carried instead by membership overlap against the previous
run: a new community inherits the label of whichever old community it shares the most
nodes with, above --label-threshold. That keeps "Shadow UI (JS)" attached to the shadow
UI even when the id changes from 0 to 7.

Usage:  rebuild.py [--skip-prune] [--no-html]
Run from the repo root, after graphify-out/.graphify_extract.json exists.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

OUT = Path("graphify-out")
HTML_NODE_LIMIT = 5000

# Directories the AST layer scans. Committed here rather than read back from
# graphify-out/.graphify_detect.json, which is gitignored and would take the scope
# decision with it on a wipe. libs/ is excluded on purpose: 1,435 vendored files
# (QuickJS, curl, Ableton Link) that would swamp clustering with noise nobody queries.
CODE_ROOTS = ["src", "davebox", "standalone", "schwung-manager", "tests", "tools"]

# Build output, vendored dependencies and minified bundles. graphify's own detector
# filters these; collect_files() does not, and without this davebox/dist/davebox/ui.js
# alone contributes a 607-node community that is a duplicate of davebox/ui/.
EXCLUDE_PARTS = {"dist", "node_modules", "build", ".git", "__pycache__", "vendor", "libs"}
EXCLUDE_SUFFIX = (".min.js", ".bundle.js")

# Documentation that is HISTORY, not current design. The semantic pass indexes prose,
# and these dominate semantic queries: measured 2026-09-16, 401 of 726 doc nodes (55%)
# came from here, so "how does X work" returned dissolved plans and unimplemented
# designs -- "G10 (dissolved 2026-08-06)", "standalone_active marker (retired)",
# "Host Support Packs (design, unimplemented)" -- as though they described the system.
# The FILES stay; they are only kept out of the graph. (The host's inherited docs/plans,
# docs/archive and docs/superpowers were deleted outright on 2026-09-24.)
STALE_DOC_PREFIXES = (
    "davebox/docs/working/",
    "davebox/docs/archive/",
)


def _is_stale_doc(node):
    sf = node.get("source_file") or ""
    return sf.startswith(STALE_DOC_PREFIXES)

# Walked explicitly rather than via graphify.extract.collect_files, which does not
# recognise .mjs and silently dropped 89 files here -- including all of src/shared/*.mjs,
# the modules davebox actually imports across the seam.
CODE_SUFFIX = (".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".js", ".mjs", ".go", ".py")


def load(p, default=None):
    f = OUT / p
    if not f.exists():
        return default
    return json.loads(f.read_text())


def reextract():
    """Re-run AST over the code files and re-merge with the cached semantic layer.

    Costs no tokens: the semantic pass (docs and images) is read back from
    graphify-out/.graphify_semantic.json, which /graphify wrote and which only changes
    when a doc or image changes. graphify's own AST cache makes unchanged code cheap.
    """
    from graphify.extract import extract

    code, skipped = [], 0
    for root in CODE_ROOTS:
        p = Path(root)
        if not p.is_dir():
            continue
        for f in p.rglob("*"):
            if not f.is_file() or not f.name.endswith(CODE_SUFFIX):
                continue
            if EXCLUDE_PARTS & set(f.parts) or f.name.endswith(EXCLUDE_SUFFIX):
                skipped += 1
                continue
            code.append(f)
    if not code:
        print(f"no code files found under {CODE_ROOTS}", file=sys.stderr)
        return 1
    print(f"scanning {len(code)} code files ({skipped} excluded as build/vendored)")
    ast = extract(code, cache_root=Path("."))
    (OUT / ".graphify_ast.json").write_text(json.dumps(ast))

    sem = load(".graphify_semantic.json", {"nodes": [], "edges": [], "hyperedges": []})
    stale_ids = {n["id"] for n in sem["nodes"] if _is_stale_doc(n)}
    sem_nodes = [n for n in sem["nodes"] if n["id"] not in stale_ids]
    sem_edges = [e for e in sem["edges"]
                 if e.get("source") not in stale_ids and e.get("target") not in stale_ids]
    if stale_ids:
        print(f"excluded {len(stale_ids)} historical doc nodes "
              f"({len(sem['edges']) - len(sem_edges)} edges) -- see STALE_DOC_PREFIXES")
    seen = {n["id"] for n in ast["nodes"]}
    merged_nodes = list(ast["nodes"]) + [n for n in sem_nodes if n["id"] not in seen]
    (OUT / ".graphify_extract.json").write_text(json.dumps({
        "nodes": merged_nodes,
        "edges": ast["edges"] + sem_edges,
        "hyperedges": sem.get("hyperedges", []),
        "input_tokens": 0, "output_tokens": 0}))
    print(f"re-extracted: {len(ast['nodes'])} AST + {len(sem_nodes)} semantic nodes")
    return 0


def apply_anchors(labels, communities, anchors):
    """Override labels using anchor node ids committed to the repo.

    graphify-out/ is gitignored, so carry-over alone loses every hand-written name on a
    fresh clone or a wipe. anchors maps a label to a few high-degree node ids that were
    in that community; whichever community now holds most of them takes the name.
    """
    applied = 0
    for name, ids in anchors.items():
        best, best_hits = None, 0
        for cid, members in communities.items():
            hits = sum(1 for i in ids if i in members)
            if hits > best_hits:
                best, best_hits = cid, hits
        if best is not None and best_hits:
            if labels.get(best) != name:
                applied += 1
            labels[best] = name
    return applied


def carry_labels(new_comms, old_comms, old_labels, threshold):
    """Map each new community to the best-overlapping old community's label."""
    old_sets = {int(c): set(m) for c, m in old_comms.items()}
    labels, carried = {}, 0
    for cid, members in new_comms.items():
        ms = set(members)
        best, best_score = None, 0.0
        for ocid, os_ in old_sets.items():
            inter = len(ms & os_)
            if not inter:
                continue
            score = inter / len(ms | os_)
            if score > best_score:
                best, best_score = ocid, score
        name = old_labels.get(str(best)) if best is not None else None
        if name and not name.startswith("Community ") and best_score >= threshold:
            labels[cid] = name
            carried += 1
        else:
            labels[cid] = f"Community {cid}"
    return labels, carried


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-shrink", action="store_true",
                    help="permit graph.json to be rewritten with FEWER nodes than it has "
                         "(needed after narrowing CODE_ROOTS or STALE_DOC_PREFIXES)")
    ap.add_argument("--reextract", action="store_true",
                    help="re-run AST over code files and re-merge with the cached semantic "
                         "layer before rebuilding (no LLM, no subagents)")
    ap.add_argument("--skip-prune", action="store_true")
    ap.add_argument("--no-html", action="store_true")
    ap.add_argument("--label-threshold", type=float, default=0.30)
    args = ap.parse_args()

    if args.reextract:
        if reextract() != 0:
            return 1

    if not (OUT / ".graphify_extract.json").exists():
        print("no graphify-out/.graphify_extract.json - run /graphify first", file=sys.stderr)
        return 1

    if not args.skip_prune:
        r = subprocess.run(
            [sys.executable, "tools/graphify/prune_edges.py", str(OUT / ".graphify_extract.json")],
            capture_output=True, text=True)
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode:
            return r.returncode

    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.report import generate
    from graphify.export import to_json, to_html
    from graphify.wiki import to_wiki

    extraction = load(".graphify_extract.json")
    detection = load(".graphify_detect.json", {"total_files": 0, "total_words": 0, "files": {}})

    G = build_from_json(extraction)
    if G.number_of_nodes() == 0:
        print("graph is empty - extraction produced no nodes", file=sys.stderr)
        return 1

    communities = cluster(G)
    cohesion = score_all(G, communities)

    old_comms = (load(".graphify_analysis.json") or {}).get("communities", {})
    old_labels = load(".graphify_labels.json", {}) or {}
    labels, carried = carry_labels(communities, old_comms, old_labels, args.label_threshold)
    anchors_file = Path("tools/graphify/labels.json")
    anchored = apply_anchors(labels, communities,
                             json.loads(anchors_file.read_text())) if anchors_file.exists() else 0
    named = sum(1 for v in labels.values() if not v.startswith("Community "))
    print(f"communities: {len(communities)}  carried: {carried}  from anchors: {anchored}  named: {named}")

    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    questions = suggest_questions(G, communities, labels)

    (OUT / "GRAPH_REPORT.md").write_text(generate(
        G, communities, cohesion, labels, gods, surprises, detection,
        {"input": 0, "output": 0}, str(Path.cwd()), suggested_questions=questions))
    # ⚠ to_json REFUSES to overwrite a larger existing graph.json (graphify #479) and
    # only warns. That guard is right - it catches an accidental shrink - but it means
    # a DELIBERATE one leaves graph.json stale while every other artifact updates, and
    # `graphify query` reads graph.json. Excluding the historical docs shrank the graph
    # by 401 nodes and hit exactly that. --allow-shrink says the shrink is intended.
    if not to_json(G, communities, str(OUT / "graph.json"), force=args.allow_shrink):
        print("graph.json was NOT rewritten (it would shrink). "
              "Re-run with --allow-shrink if that is intended.", file=sys.stderr)
        return 1
    (OUT / ".graphify_labels.json").write_text(json.dumps({str(k): v for k, v in labels.items()}))
    (OUT / ".graphify_analysis.json").write_text(json.dumps({
        "communities": {str(k): v for k, v in communities.items()},
        "cohesion": {str(k): v for k, v in cohesion.items()},
        "gods": gods, "surprises": surprises, "questions": questions}))

    n = to_wiki(G, communities, str(OUT / "wiki"), community_labels=labels,
                cohesion=cohesion, god_nodes_data=gods)
    print(f"wiki: {n} articles")

    if not args.no_html:
        # keep the render under graphify's limit by dropping unnamed micro-communities
        # rather than collapsing everything to a community-level view
        named_ids = [c for c, l in labels.items() if not l.startswith("Community ")]
        if G.number_of_nodes() > HTML_NODE_LIMIT and named_ids:
            # largest-first, stopping before the cap: an unnamed micro-community is the
            # least useful thing on the map, and a dropped small named one is recoverable
            # from the wiki. Erroring out instead would leave no map at all.
            keep_ids, total = [], 0
            for c in sorted(named_ids, key=lambda c: -len(communities[c])):
                if total + len(communities[c]) > HTML_NODE_LIMIT:
                    continue
                keep_ids.append(c)
                total += len(communities[c])
            keep = {x for c in keep_ids for x in communities[c]}
            H, sub = G.subgraph(keep).copy(), {c: communities[c] for c in keep_ids}
            omitted = [labels[c] for c in named_ids if c not in keep_ids]
            note = f" ({G.number_of_nodes() - H.number_of_nodes()} nodes omitted to fit)"
            if omitted:
                note += f"; dropped named: {', '.join(omitted)}"
        else:
            H, sub, note = G, communities, ""
        to_html(H, sub, str(OUT / "graph.html"),
                community_labels={c: labels[c] for c in sub})
        print(f"graph.html: {H.number_of_nodes()} nodes, {H.number_of_edges()} edges{note}")

    print(f"\ngraph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return 0


if __name__ == "__main__":
    sys.exit(main())
