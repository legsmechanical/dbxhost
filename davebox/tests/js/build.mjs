// tests/js/build.mjs — bundle each test_*.mjs with esbuild's JS API,
// redirecting the on-device shared constants path to a local stub.
// (The esbuild CLI's --alias flag rejects absolute-path keys on this
// esbuild version, so we use a resolve plugin instead.)
import * as esbuild from 'esbuild';
import { globSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const stub = path.join(__dirname, 'stubs/shared_constants.mjs');
const stdStub = path.join(__dirname, 'stubs/quickjs_std.mjs');
const DEVICE_PATH = '/data/UserData/schwung/shared/constants.mjs';

const stubPlugin = {
    name: 'device-shared-constants-stub',
    setup(build) {
        build.onResolve({ filter: /^\/data\/UserData\/schwung\/shared\/constants\.mjs$/ }, () => ({
            path: stub,
        }));
        // Every OTHER device-absolute shared import resolves to the real host
        // tree — one repo, one deliverable, so the file the device serves is
        // right here. This is what lets a test import ui modules that pull in
        // menu_layout/text_entry/input_filter (e.g. the picker boot test).
        build.onResolve({ filter: /^\/data\/UserData\/schwung\/shared\// }, (args) => ({
            path: path.join(repoRoot, '../src/shared', path.basename(args.path)),
        }));
        // QuickJS built-ins. A shared module may import `std` (session_state
        // probes the session lock through it); Node has no such module, so the
        // real host file would fail to bundle and take every test that reaches
        // it down with it.
        build.onResolve({ filter: /^std$/ }, () => ({ path: stdStub }));
    },
};

const outDir = '/tmp/davebox-js-tests';
const tests = globSync(path.join(repoRoot, 'tests/js/test_*.mjs'));

for (const t of tests) {
    const name = path.basename(t, '.mjs');
    const outfile = path.join(outDir, `${name}.js`);
    await esbuild.build({
        entryPoints: [t],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
        logLevel: 'warning',
        plugins: [stubPlugin],
    });
    console.log(outfile);
}
