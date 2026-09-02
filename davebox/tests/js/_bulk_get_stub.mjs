/* Test scaffolding: the bulk read, derived from whatever single-read stub a
 * test installs. pollDSP prefetches its standing keys with ONE bulk read on
 * device; here each key resolves through the test's own host_module_get_param
 * at call time, so a test's stub keeps answering exactly as before. */
function enc(items) { let s = items.length + '\n'; for (const it of items) s += it.length + '\n' + it; return s; }
function dec(blob) {
    const out = []; if (!blob) return out;
    const nl = blob.indexOf('\n'); const n = parseInt(blob.slice(0, nl), 10) || 0; let p = nl + 1;
    for (let i = 0; i < n; i++) { const e = blob.indexOf('\n', p); const len = parseInt(blob.slice(p, e), 10) || 0; p = e + 1; out.push(blob.slice(p, p + len)); p += len; }
    return out;
}
globalThis.host_module_get_params = (blob) => enc(dec(blob).map((k) => {
    const g = globalThis.host_module_get_param;
    const v = (typeof g === 'function') ? g(k) : null;
    return (v === null || v === undefined) ? '' : String(v);
}));

/* The host's autosave hold: a no-op here; the edge is pinned by its own test. */
if (typeof globalThis.host_autosave_hold !== 'function') globalThis.host_autosave_hold = () => {};
