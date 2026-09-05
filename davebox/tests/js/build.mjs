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
        // ⚠ THE SUBPATH IS KEPT, NOT BASENAME'D. It was basename() until
        // 2026-08-31, which FLATTENS a shared PACKAGE: `shared/param_pages/
        // page_controller.mjs` resolved to `src/shared/page_controller.mjs`,
        // which does not exist, and the whole JS suite failed to bundle the
        // moment davebox imported the module editor. Nothing had noticed
        // because every shared import davebox had until then was a flat file.
        build.onResolve({ filter: /^\/data\/UserData\/schwung\/shared\// }, (args) => ({
            path: path.join(repoRoot, '../src/shared',
                            args.path.replace('/data/UserData/schwung/shared/', '')),
        }));
        // QuickJS built-ins. A shared module may import `std` (session_state
        // probes the session lock through it); Node has no such module, so the
        // real host file would fail to bundle and take every test that reaches
        // it down with it.
        build.onResolve({ filter: /^std$/ }, () => ({ path: stdStub }));
    },
};

/* ---- staleness guard -------------------------------------------------------
 *
 * ⚠⚠ THE BUG THIS KILLS. Tests compile to /tmp and the bundle is a plain node
 * script, so ANY invocation that skips this build runs the PREVIOUS code — and
 * passes, which is the worst possible outcome. It bit on 2026-08-24: a mutation
 * test reported SURVIVED against a bundle that had never been rebuilt with the
 * mutation in it, i.e. the tool said the test was weak when the test was fine.
 * A green run against stale code is indistinguishable from a green run.
 *
 * So a stale bundle now REFUSES to run rather than lying. mtime, not a content
 * hash: it costs one stat per source file, needs nothing baked in, and cannot
 * itself go out of date.
 */
const WATCH_DIRS = [
    path.join(repoRoot, 'ui'),
    path.join(repoRoot, 'tests/js'),
    path.resolve(repoRoot, '../src/shared'),
];
/* ⚠ ONE host binding is defaulted for every rig, and only one.
 *
 * Blanket-stubbing the host surface would be actively harmful: a MISSING
 * binding throws inside tick(), which swallows it, so every later stage of the
 * tick silently never runs and the test passes against a tick that stopped on
 * line one. Rigs declare their own stubs so that absence stays loud.
 *
 * host_register_primary is different: its absence does not throw, it makes
 * init() log "PRIMARY: registration FAILED — host defect, ownership claims not
 * live" on EVERY run. That is a false alarm about the ownership model printed
 * ~20 times per suite, and a false alarm that constant is worse than no message
 * — it trains everyone (me included, repeatedly) to filter out the exact line
 * that would matter on device. Fixed in the RIG, not in the module: on device
 * the binding always exists, and gating the module on `typeof` would break the
 * no-capability-probing invariant. */
const primaryStub = `if(typeof globalThis.host_register_primary!=='function')globalThis.host_register_primary=function(){return true;};\n` +
/* shadow_get_shift_held: the tick's stuck-modifier reconcile reads it every
 * frame. Undefined in the rig it throws INSIDE tick() — which swallows errors —
 * so every test that calls tick() would keep passing while silently doing
 * NOTHING after that line. That is why it is stubbed here at all.
 *
 * ⚠ It returns 1 ("hardware agrees Shift is down"), which makes the reconcile
 * INERT by default — it only fires on `shiftHeld && !hardware`. The first cut
 * returned 0 and broke two real tests: they hold Shift via CC 49, and the
 * reconcile correctly healed it away because the stubbed hardware disagreed.
 * On DEVICE the hardware is authoritative and that is right; in a rig with no
 * hands on it, the module's own view is the only truth there is.
 *
 * A test that wants to exercise HEALING overrides this with a stub returning 0
 * — see test_shift_stuck_reconcile.mjs. */
`if(typeof globalThis.shadow_get_shift_held!=='function')globalThis.shadow_get_shift_held=function(){return 1;};\n`;

const guard = primaryStub + `(function(){try{
var _fs=require('fs'),_p=require('path');
var _dirs=${JSON.stringify(WATCH_DIRS)};
var _mine=_fs.statSync(__filename).mtimeMs,_new=0,_who='';
while(_dirs.length){var _d=_dirs.pop(),_e;
try{_e=_fs.readdirSync(_d,{withFileTypes:true});}catch(_){continue;}
for(var _i=0;_i<_e.length;_i++){var _f=_p.join(_d,_e[_i].name);
if(_e[_i].isDirectory()){if(_e[_i].name!=='node_modules'&&_e[_i].name!=='stubs')_dirs.push(_f);continue;}
if(!/\.(mjs|js)$/.test(_e[_i].name))continue;
var _m=_fs.statSync(_f).mtimeMs;if(_m>_new){_new=_m;_who=_f;}}}
if(_new>_mine+1000){
process.stderr.write('\\n  STALE BUNDLE — refusing to run.\\n'+
'  '+_p.basename(__filename)+' was built before '+_p.basename(_who)+' changed.\\n'+
'  Running it would test the PREVIOUS code and pass, which is worse than failing.\\n\\n'+
'  Rebuild first:  node tests/js/build.mjs\\n'+
'  Or run one test:  bash tests/js/run-one.sh '+_p.basename(__filename,'.js')+'\\n\\n');
process.exit(2);}
}catch(_){/* guard must never be the reason a test cannot run */}})();`;

/* ⚠ PER-TREE, not one shared /tmp dir (2026-09-05). Two worktrees running the
 * suite at once wrote the same bundle paths, and a test in one tree ran the
 * OTHER tree's code — a "failure" that no source in the failing tree contained.
 * run.sh / run-one.sh derive the dir from the tree's own path and export it;
 * the fallback here is only for a direct `node build.mjs`. */
const outDir = process.env.DAVEBOX_JS_TEST_DIR || '/tmp/davebox-js-tests';
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
        banner: { js: guard },
        plugins: [stubPlugin],
    });
    console.log(outfile);
}
