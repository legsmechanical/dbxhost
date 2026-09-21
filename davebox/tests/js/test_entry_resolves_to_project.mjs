/* tests/js/test_entry_resolves_to_project.mjs — THE ENTRY IS NOT THE PROJECT.
 *
 * Move names, and logs, the library ENTRY it opened. The picker lists PROJECTS.
 * Those are the same string today, because the set library holds one slot per
 * project and names each slot after the project it points at — which is exactly
 * why this needs a test that does NOT rely on them being the same.
 *
 * When the library holds two fixed slots instead of N, an entry uuid stops
 * being any project's id. A picker matching on the entry would then leave
 * `current` at -1 forever: it would never mark the open project, and every tap
 * — including a tap on the project already loaded — would be treated as a
 * switch. Silent, and only on the device.
 *
 * ⚠ The resolving half of this seam had never been reached by any test: the
 * `os` stub had no `realpath`, so the call threw and every test exercised the
 * literal-join fallback. That is fixed here (stubs/quickjs_os.mjs), which is
 * what lets the second case below exist at all.
 */
import * as os from 'os';

let failed = 0;
const ok  = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };

const SETS = '/data/UserData/UserLibrary/Sets';
const PROJECTS = '/data/UserData/dbx-host/projects';

globalThis.host_state_subdir = () => 'dAVEBOx';
globalThis.host_read_file = () => '';
globalThis.host_file_exists = () => false;
globalThis.host_write_file = () => true;
globalThis.host_ensure_dir = () => true;

async function main() {
const persist = await import('../../ui/ui_persistence.mjs');
const { projectIdOfEntry } = persist;

const ENTRY   = 'aaaaaaaa-0000-4000-8000-00000000000a';
const PROJECT = 'ffffffff-0000-4000-8000-00000000000f';

/* ---- 1. today: one slot per project, named after it ----------------------
 * Unresolvable (the stub's default) means the seam keeps the literal join, so
 * the id it yields is the entry's own name. This is the identity function, and
 * it is what makes the change behaviour-neutral right now. */
step('an entry that resolves to nothing yields its own id (today: identity)', () => {
    os.__setRealpath(null);
    const got = projectIdOfEntry(ENTRY);
    if (got !== ENTRY) throw new Error(`expected ${ENTRY}, got ${got}`);
});

/* ---- 2. ⭐ the case the whole thing exists for ----------------------------
 * A slot pointing at a DIFFERENT project. If this returned the entry, the
 * picker would match nothing once the library stops naming slots after
 * projects — and nothing else in the suite would notice. */
step('an entry pointing elsewhere yields the PROJECT, not the entry', () => {
    os.__setRealpath({ [`${SETS}/${ENTRY}`]: `${PROJECTS}/${PROJECT}` });
    const got = projectIdOfEntry(ENTRY);
    if (got !== PROJECT) throw new Error(`expected ${PROJECT}, got ${got}`);
    if (got === ENTRY) throw new Error('resolved to the entry — the seam is a no-op');
});

/* ---- 3. a resolve that answers nothing must not answer "" as a match ------
 * Two projects with empty ids would compare equal. The caller is told to treat
 * '' as no-match; this pins that '' is what it gets. */
step('an empty entry yields an empty id, never a lucky match', () => {
    os.__setRealpath(null);
    if (projectIdOfEntry('') !== '') throw new Error('empty entry did not yield empty id');
});

/* ---- 4. the stub itself, or case 2 proves nothing -------------------------
 * ⚠ POSITIVE CONTROL. If __setRealpath silently did nothing, case 2 would have
 * failed loudly — but if realpath returned a resolved path unconditionally,
 * case 1 would be the accident. Assert both directions of the stub directly. */
step('CONTROL: the stub resolves when told to, and refuses when not', () => {
    os.__setRealpath({ '/x': '/y' });
    const [pr, er] = os.realpath('/x');
    if (!(pr === '/y' && er === 0)) throw new Error(`mapped realpath gave ${pr},${er}`);
    const [pn, en] = os.realpath('/unmapped');
    if (en === 0) throw new Error('an unmapped path reported success');
    os.__setRealpath(null);
});

console.log(failed ? 'FAIL: the entry is being assumed to be the project'
                   : 'PASS: a library entry is RESOLVED to its project');
process.exit(failed);
}

main();
