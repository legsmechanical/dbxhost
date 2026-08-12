/* tests/js/test_name_index_delete.mjs — deleting a project must drop the
 * name -> uuid entries that pointed at it, from the CACHE as well as the file.
 *
 * The name index exists so a duplicated set inherits the original's state. Its
 * invariant is that it only holds sets whose state file exists. Delete erased
 * the state and left the entries, so within the same session a new project
 * created with the deleted one's NAME inherited from a uuid whose files were
 * gone. The tick's periodic sweep cleans it up — next session.
 *
 * ⚠ Why this is an eval test and not a grep: the failure that matters is the
 * CACHE one. The module holds the map in `S.nameIndexCache` and `saveNameIndex`
 * writes it whole, so an entry removed from the file behind its back is
 * resurrected by the next save — a fix that edits only the file LOOKS right in
 * the source and does nothing. The last block below is exactly that scenario.
 */

let failed = 0;
function ok(label) { console.log(`  ok   — ${label}`); }
function bad(label, e) { console.error(`  FAIL — ${label}: ${e && e.stack ? e.stack : e}`); failed = 1; }

const DEAD = 'dddddddd-4444-4444-8444-000000000004';
const LIVE = 'aaaaaaaa-1111-4111-8111-000000000001';

/* A tiny in-memory filesystem: the index file is the only thing under test, and
 * the point is what lands IN it. */
const files = {};
globalThis.host_read_file = (p) => (p in files ? files[p] : '');
globalThis.host_file_exists = (p) => p in files;
globalThis.host_write_file = (p, body) => { files[p] = body; return true; };
globalThis.host_ensure_dir = () => true;
globalThis.host_remove_dir = () => true;
globalThis.host_system_cmd = () => 0;
globalThis.host_module_set_param = () => {};
globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => '';
globalThis.shadow_set_param = () => {};
globalThis.clear_screen = () => {};
globalThis.print = () => {};
globalThis.fill_rect = () => {};
globalThis.set_pixel = () => {};
globalThis.move_midi_internal_send = () => {};

/* ⚠ The state prefix is injected at BUILD time (esbuild --define
 * SEQ8_STATE_PREFIX), so the SA build says `seq8sa` and this unbundled test
 * gets ui_persistence.mjs's fallback, `seq8`. Hardcoding the SA spelling here
 * makes every block seed a file the module never reads, and they pass by
 * reading an empty index — a false green. Mirror the module's own rule. */
const PREFIX = (typeof SEQ8_STATE_PREFIX === 'string') ? SEQ8_STATE_PREFIX : 'seq8';
const INDEX = '/data/UserData/schwung/' + PREFIX + '_name_index.json';

async function main() {
const { S } = await import('../../ui/ui_state.mjs');
const per = await import('../../ui/ui_persistence.mjs');

function step(label, fn) { try { fn(); ok(label); } catch (e) { bad(label, e); } }

function seed() {
    const idx = {
        'Doomed': DEAD,
        'Doomed Copy': DEAD,     /* the family shape: several names, one uuid */
        'Keeper': LIVE,
    };
    files[INDEX] = JSON.stringify(idx);
    /* ⭑ The cache is PRIMED, not null — that is the real situation and the only
     * one where the bug bites. A session that has saved once holds the map in
     * memory, so a drop that edits only the file is undone by the next save. */
    S.nameIndexCache = JSON.parse(JSON.stringify(idx));
}

step('drops every name pointing at the deleted uuid, on disk', () => {
    seed();
    const n = per.dropNameIndexUuid(DEAD);
    if (n !== 2) throw new Error('expected 2 drops, got ' + n);
    const idx = JSON.parse(files[INDEX]);
    if ('Doomed' in idx || 'Doomed Copy' in idx) throw new Error('dead entries survived: ' + files[INDEX]);
    if (idx['Keeper'] !== LIVE) throw new Error('an unrelated entry was dropped');
});

step('leaves the file alone when nothing matches', () => {
    seed();
    const before = files[INDEX];
    if (per.dropNameIndexUuid('99999999-9999-4999-8999-999999999999') !== 0)
        throw new Error('claimed a drop it did not make');
    if (files[INDEX] !== before) throw new Error('rewrote the index for nothing');
});

step('an empty uuid is a no-op, not a wipe', () => {
    seed();
    if (per.dropNameIndexUuid('') !== 0) throw new Error('acted on an empty uuid');
    if (Object.keys(JSON.parse(files[INDEX])).length !== 3) throw new Error('index was damaged');
});

/* THE ONE THAT MATTERS. A file-only fix passes every block above and fails
 * here: the cache still holds the dead names, so the next save puts them back. */
step('the CACHE is cleared too, so the next save cannot resurrect it', () => {
    seed();
    per.dropNameIndexUuid(DEAD);
    /* Any later save writes the cache out whole — simulate one. */
    per.saveNameIndex(S.nameIndexCache);
    const idx = JSON.parse(files[INDEX]);
    if ('Doomed' in idx)
        throw new Error('the next save resurrected the deleted project\'s entry — ' +
                        'the drop only touched the file, not S.nameIndexCache');
});

console.log(failed ? 'test_name_index_delete: FAIL' : 'test_name_index_delete: PASS');
process.exit(failed);
}

main();
