/* tests/js/test_header_abbrev_before_scan.mjs — the header's [instrument] mark
 * is the module's DECLARED abbrev from the first read of the session, not the
 * id's first two letters until something happens to scan the modules.
 *
 * Seen 2026-10-16 recording tutorials: a NuSaw track's header read [NU] after
 * a fresh launch and [NS] (NuSaw's declared mark) once a picker had been
 * opened — the same track, two names. engineModuleAbbrev only knew a declared
 * mark after a scan; it now makes the one scan itself, as engineGeneratorName
 * already did for the name.
 */
import './_bulk_get_stub.mjs';
import * as os from 'os';

const GEN_DIR = '/data/UserData/schwung/modules/sound_generators';
const MODULES = {
    nusaw: { id: 'nusaw', name: 'NuSaw', abbrev: 'NS', component_type: 'sound_generator' },
    plaits: { id: 'plaits', name: 'Plaits', component_type: 'sound_generator' },   /* declares none */
};
os.__setReaddir({ [GEN_DIR]: Object.keys(MODULES) });
let scans = 0;
globalThis.host_read_file = (p) => {
    const m = String(p).match(/sound_generators\/([^/]+)\/module\.json$/);
    if (!m || !MODULES[m[1]]) return '';
    if (m[1] === 'nusaw') scans++;
    return JSON.stringify(MODULES[m[1]]);
};
globalThis.host_file_exists = () => false;

let failed = 0;
function eq(got, want, label) {
    if (got !== want) { console.error(`FAIL: ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); failed = 1; }
}

async function main() {
const { engineModuleAbbrev } = await import('../../ui/ui_engine.mjs');
/* The very first read, no picker ever opened: the declared mark. */
eq(engineModuleAbbrev('nusaw'), 'NS', 'first read of a module that declares a mark');
/* A module that declares none keeps the host's fallback, its id's first two letters. */
eq(engineModuleAbbrev('plaits'), 'PL', 'a module with no declared mark');
/* One scan for the session, however often the header asks (it asks every second). */
for (let i = 0; i < 5; i++) engineModuleAbbrev('nusaw');
engineModuleAbbrev('no-such-module');
eq(scans, 1, 'the module folder is scanned once');

os.__setReaddir(null);
if (failed) process.exit(1);
console.log('PASS test_header_abbrev_before_scan');
}
main().catch((e) => { console.error(e); process.exit(1); });
