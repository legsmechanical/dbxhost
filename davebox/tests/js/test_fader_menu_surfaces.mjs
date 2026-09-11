import './_bulk_get_stub.mjs';
/* tests/js/test_fader_menu_surfaces.mjs — the sound menu's Volume row moves on
 * the fader law, on BOTH of its paths.
 *
 * Josh, 2026-09-11: "can we apply the same to shift+volume track volume
 * shortcut, volume item in sound menu, and volume cell in sound+cnfg?"
 *
 * ⚠⚠ WHY THIS FILE EXISTS. "The sound menu's Volume" is two code paths — a
 * chain slot's row (slotCfgStep) and a Move bus's row (busLevelStep) — and
 * with BOTH reverted to linear the entire suite stayed green. Nothing reached
 * either one. So these drive the REAL step functions with the REAL declarations
 * the menus use, and each case also asserts the answer is NOT the old linear
 * one, so it cannot pass by accident. */
let failed = 0;
const ok = (l) => console.log(`  ok   — ${l}`);
const bad = (l, e) => { console.error(`  FAIL — ${l}: ${e && e.stack ? e.stack : e}`); failed = 1; };
const step = (l, fn) => { try { fn(); ok(l); } catch (e) { bad(l, e); } };

for (const k of ['host_system_cmd','host_write_file','host_ensure_dir','host_remove_dir'])
    globalThis[k] = () => 0;
globalThis.host_read_file = () => ''; globalThis.host_file_exists = () => false;
globalThis.host_module_set_param = () => {}; globalThis.host_module_get_param = () => '';
globalThis.shadow_get_param = () => ''; globalThis.shadow_set_param = () => 1;
for (const k of ['clear_screen','print','fill_rect','draw_rect','set_pixel','stipple_rect',
                 'set_led','move_midi_internal_send','move_midi_external_send','flush_display'])
    globalThis[k] = () => {};
globalThis.text_width = (t) => String(t).length * 6;

async function main() {
await import('../../ui/ui.js');
const snd = await import('../../ui/ui_sound.mjs');
const { faderStep, faderFormatDb } = await import('../../ui/ui_engine.mjs');
const db = (g) => 20 * Math.log10(g);
const specs = snd.soundVolumeSpecsForTest();

for (const [name, spec, run] of [
    ['CHAIN SLOT row (slotCfgStep)', specs.slot, (v, d) => snd.soundSlotCfgStepForTest(specs.slot, v, d)],
    ['MOVE BUS row (busLevelStep)',  specs.bus,  (v, d) => snd.soundBusLevelStepForTest(specs.bus, v, d)],
]) {
    step('setup: the ' + name + ' Volume declaration exists and is marked as a fader', () => {
        if (!spec) throw new Error('no volume spec found');
        if (!spec.fader) throw new Error('⭑ the ' + name + ' Volume is not marked `fader: true`');
    });

    step('⭐⭐ ' + name + ': one step from unity lands ON the fader law, not the linear one', () => {
        const got = run(1.0, 1);
        const linear = 1.0 + spec.step;
        const law = faderStep(1.0, 1, spec.max / spec.step);
        if (Math.abs(got - linear) < 1e-9)
            throw new Error('⭑ still LINEAR: ' + got + ' (1.00 + ' + spec.step + ')');
        if (Math.abs(got - law) > 1e-9)
            throw new Error('expected the fader law ' + law + ', got ' + got);
    });

    step('⚠ ' + name + ': the throw is UNCHANGED — ' + (spec.max / spec.step) + ' steps cross it', () => {
        /* Only WHERE the steps land moved; how many it takes to cross did not. */
        let v = 0, n = 0;
        while (v < spec.max - 1e-9 && n < 1000) { v = run(v, 1); n++; }
        const want = spec.max / spec.step;
        if (Math.abs(n - want) > 1)
            throw new Error('took ' + n + ' steps from silence to the top; the throw is ' + want);
    });

    step('⚠ ' + name + ': it bottoms out at TRUE silence, and back up round-trips', () => {
        let v = 1.0;
        for (let i = 0; i < 200; i++) v = run(v, -1);
        if (v !== 0) throw new Error('did not bottom out at 0, got ' + v);
        const up = run(1.0, 1), back = run(up, -1);
        if (Math.abs(db(back)) > 0.05) throw new Error('+1 then -1 from unity landed at ' + faderFormatDb(back));
    });

    step(name + ': the readout is dB', () => {
        if (spec.fmt(1.0) !== '0.0') throw new Error('unity prints ' + spec.fmt(1.0));
    });
}

if (failed) { console.log('FAIL: fader menu surfaces'); process.exit(1); }
console.log('PASS: the sound menu Volume row moves on the fader law, on both paths');
}
main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
