#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# The module-lists model, unit-tested with no device and no globals.
#
# Everything that can be a rule lives here rather than in shadow_ui.js, for
# one reason: this file can be imported by node and that one cannot. A rule
# that is only reachable through a 21k-line UI file is a rule with no test.
#
# Two of these assertions are load-bearing beyond their own line:
#
#  - a CORRUPT file must be reported as corrupt, not silently replaced by the
#    seeded default. The caller declines to write over a file it could not
#    read, because a future version might read it. Collapsing "could not read"
#    into "was empty" is the same tri-state mistake the param channel made.
#  - filterIds answers NULL for a list that does not exist, never the identity.
#    The identity would silently show every module under a filter name that no
#    longer means anything, which reads as the filter being broken.

if ! command -v node >/dev/null 2>&1; then echo "FAIL: node required" >&2; exit 1; fi

node -e '
import("./src/shared/module_lists.mjs").then((M) => {
  let failures = 0;
  const fail = (m) => { console.error("FAIL: " + m); failures++; };
  const ok = (m) => { console.error("ok: " + m); };
  const eq = (a, b, m) => { JSON.stringify(a) === JSON.stringify(b) ? ok(m) : fail(m + " -- got " + JSON.stringify(a) + " want " + JSON.stringify(b)); };

  const io = (raw) => ({ readFile: () => raw, writeFile: () => true });

  /* FORK: every load/save takes an EXPLICIT path -- see the fork note in
   * module_lists.mjs. A tmp path, never a real install tree, and never the
   * stock one. */
  const P = "/tmp/module_lists_test.json";

  /* ---- 1. seeding ------------------------------------------------------ */
  let r = M.loadLists(io(null), P);
  eq(r.state.lists.map(l => l.name), ["Favorites"], "missing file seeds Favorites only");
  eq(r.corrupt, false, "missing file is not corrupt");
  eq(r.state.lists[0].modules, [], "seeded Favorites is empty");

  r = M.loadLists(io("{not json"), P);
  eq(r.state.lists.map(l => l.name), ["Favorites"], "corrupt file still yields a usable state");
  eq(r.corrupt, true, "corrupt file is REPORTED corrupt, so the caller can decline to overwrite it");

  r = M.loadLists(io(JSON.stringify({ version: 1, lists: [ { name: "Live", modules: ["dx7"] } ] })), P);
  eq(r.state.lists.map(l => l.name), ["Favorites", "Live"], "a file without Favorites gets it inserted at 0");

  r = M.loadLists(io(JSON.stringify({ version: 1, lists: [ { name: "Live", modules: [] }, { name: "Favorites", modules: ["braids"] } ] })), P);
  eq(r.state.lists.map(l => l.name), ["Favorites", "Live"], "Favorites is moved to index 0");
  eq(r.state.lists[0].modules, ["braids"], "moving Favorites keeps its members");

  r = M.loadLists(io(JSON.stringify({ version: 1, lists: [ { name: "Live", modules: ["braids", "braids", "dx7"] } ] })), P);
  eq(r.state.lists[1].modules, ["braids", "dx7"], "a duplicate module id in the file is deduped on load, first-seen order kept");

  /* ---- 2. create ------------------------------------------------------- */
  let s = M.emptyState();
  eq(M.createList(s, "").ok, false, "createList rejects an empty name");
  eq(M.createList(s, "   ").ok, false, "createList rejects whitespace only");
  eq(M.createList(s, "Live").ok, true, "createList accepts a fresh name");
  eq(M.createList(s, "live").ok, false, "createList rejects a case-insensitive duplicate");
  eq(M.createList(s, "FAVORITES").ok, false, "createList cannot shadow Favorites");
  eq(s.lists.map(l => l.name), ["Favorites", "Live"], "create appends in order");

  /* ---- 3. rename / delete / clear -------------------------------------- */
  eq(M.renameList(s, "Favorites", "Faves").ok, false, "Favorites cannot be renamed");
  eq(M.deleteList(s, "Favorites").ok, false, "Favorites cannot be deleted");
  eq(M.renameList(s, "Live", "LIVE").ok, true, "renaming a list to its own name in another case is not a collision");
  eq(s.lists[1].name, "LIVE", "the rename took");
  eq(M.renameList(s, "LIVE", "").ok, false, "rename rejects an empty name");
  eq(M.renameList(s, "Nope", "X").ok, false, "rename rejects an unknown list");
  eq(M.deleteList(s, "Nope").ok, false, "delete rejects an unknown list");
  eq(M.clearList(s, "Nope").ok, false, "clear rejects an unknown list");

  M.toggleMembership(s, "Favorites", "braids");
  eq(M.clearList(s, "Favorites").ok, true, "Favorites CAN be cleared");
  eq(s.lists[0].modules, [], "clear empties the members");
  eq(M.deleteList(s, "LIVE").ok, true, "an ordinary list deletes");
  eq(s.lists.map(l => l.name), ["Favorites"], "delete removes it");

  /* ---- 4. membership --------------------------------------------------- */
  s = M.emptyState();
  M.createList(s, "Live");
  eq(M.toggleMembership(s, "Favorites", "braids"), true, "toggle on returns true");
  eq(M.isMember(s, "Favorites", "braids"), true, "isMember sees it");
  eq(M.toggleMembership(s, "Favorites", "braids"), false, "toggle off returns false");
  eq(M.isMember(s, "Favorites", "braids"), false, "isMember agrees");
  M.toggleMembership(s, "Favorites", "braids");
  M.toggleMembership(s, "Live", "braids");
  eq(M.listsContaining(s, "braids"), ["Favorites", "Live"], "listsContaining reports both, in list order");
  eq(M.listsContaining(s, "nope"), [], "listsContaining is empty for a stranger");
  eq(M.toggleMembership(s, "Nope", "braids"), null, "toggling a nonexistent list answers NULL, not false, so a caller cannot announce a removal that did not happen");
  eq(M.isMember(s, "Nope", "braids"), false, "isMember on a nonexistent list is false");

  /* ---- 5. filtering ---------------------------------------------------- */
  s = M.emptyState();
  M.createList(s, "FX");
  M.toggleMembership(s, "Favorites", "braids");
  M.toggleMembership(s, "Favorites", "cloudseed");
  M.toggleMembership(s, "FX", "cloudseed");
  const synths = ["braids", "hera", "dx7"];
  eq(M.filterIds(s, synths, null), synths, "a null filter is the identity");
  eq(M.filterIds(s, synths, "Favorites"), ["braids"], "filterIds intersects and keeps input order");
  eq(M.filterIds(s, synths, "Gone"), null, "filterIds answers NULL for a list that does not exist");
  eq(M.listsWithAnyOf(s, synths), ["Favorites"], "a list with no synth member is not offered to a synth picker");
  eq(M.listsWithAnyOf(s, ["cloudseed"]), ["Favorites", "FX"], "both lists are offered where both have a member");
  eq(M.listsWithAnyOf(s, ["zzz"]), [], "nothing is offered when nothing matches");

  /* ---- 6. cycle order -------------------------------------------------- */
  const elig = ["Favorites", "FX"];
  eq(M.nextFilter(null, elig), "Favorites", "All goes to the first eligible list");
  eq(M.nextFilter("Favorites", elig), "FX", "then to the next");
  eq(M.nextFilter("FX", elig), null, "then wraps to All");
  eq(M.nextFilter("Gone", elig), null, "a filter no longer eligible falls back to All");
  eq(M.nextFilter(null, []), null, "with nothing eligible the cycle stays on All");

  /* ---- 7. FORK: the path is required, and the file is SHARED ----------- */
  /*
   * The file is shared with the stock install on purpose so one Favorites
   * list serves both hosts (Josh, 2026-09-09). Two consequences are pinned
   * here because neither fails loudly on its own.
   */
  const threw = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  eq(threw(() => M.loadLists(io(null))), true, "FORK: loadLists with no path THROWS rather than guessing an install");
  eq(threw(() => M.saveLists(io(null), M.emptyState())), true, "FORK: saveLists with no path THROWS");
  eq(M.listsPathFor("/data/UserData/schwung"), "/data/UserData/schwung/module_lists.json", "listsPathFor composes the shared path");
  eq(M.listsPathFor("/data/UserData/schwung/"), "/data/UserData/schwung/module_lists.json", "a trailing slash does not double up");
  eq(threw(() => M.listsPathFor("")), true, "an empty root THROWS rather than composing a root-relative path");
  eq(typeof M.LISTS_PATH, "undefined", "FORK: no LISTS_PATH constant to fall back to");

  /* ---- 8. FORK: a NEWER file is readable but never rewritten ----------- */
  /*
   * The whole cost of sharing the file. A future stock schema that adds a
   * field would have it deleted the first time this build saved, because the
   * writer emits exactly {version, lists}. Checked BEFORE the guard existed:
   * the v2 file below read back clean and saving rewrote it as v1 with the
   * per-list color and the top-level key both gone -- silently, on a file the
   * other host owns.
   */
  const v2 = JSON.stringify({ version: 2, lists: [ { name: "Favorites", modules: ["braids"], color: "red" } ], extra: 1 });
  r = M.loadLists(io(v2), P);
  eq(r.newer, true, "a file from a NEWER schema is flagged newer, so the caller declines to write");
  eq(r.corrupt, false, "and NOT corrupt -- the data is good, the user should still see their lists");
  eq(r.state.lists[0].modules, ["braids"], "what this version understands is still usable");
  r = M.loadLists(io(JSON.stringify({ version: 1, lists: [] })), P);
  eq(r.newer, false, "our own version is not newer");
  r = M.loadLists(io(null), P);
  eq(r.newer, false, "a missing file is not newer");
  r = M.loadLists(io("{not json"), P);
  eq(r.newer, false, "a corrupt file is corrupt, not newer -- the two are different refusals");

  if (failures) { console.error(failures + " failure(s)"); process.exit(1); }
  console.log("PASS");
}).catch((e) => { console.error("FAIL: " + e); process.exit(1); });
'
