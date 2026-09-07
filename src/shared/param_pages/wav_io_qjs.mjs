/*
 * The QuickJS file IO for wav_peaks.mjs, kept in a file of its own.
 *
 * `std` and `os` are QuickJS MODULES (registered by JS_NewCustomContext in
 * host/js_host_common.c). Importing them from wav_peaks.mjs would make that
 * file — and viz_draw.mjs, and therefore most of the renderer — unloadable
 * under node, which is where every host test runs. So the dependency is
 * injected, and this is the only file in the tree that names them.
 *
 * NOTHING under tests/ may import this. It is pulled in by the two ENTRY
 * POINTS that are device-only already, once each: src/shadow/shadow_ui.js for
 * the host, and davebox/ui/ui.js for dAVEBOx SA. (It used to say
 * shadow_ui_param_pages.mjs; the import moved when the editor became a factory,
 * and dAVEBOx had no registration at all until 2026-09-06 — every sample widget
 * in SA drew an empty box and reported it as a missing file.)
 *
 * host_read_file is deliberately NOT used: it slurps the whole file, and a
 * multi-megabyte read inside one 60 Hz tick is exactly the input lag
 * wav_peaks.mjs is streamed to avoid.
 */
import * as std from "std";
import * as os from "os";
import { setWavPeaksIO } from "./wav_peaks.mjs";

/*
 * ⚠⚠ EXPORTED, NOT ONLY SELF-REGISTERED — and this is the whole bug.
 *
 * Registering from inside this module puts the reader into the `wav_peaks.mjs`
 * instance THIS file resolves, via its own relative `./wav_peaks.mjs`. A
 * consumer that reaches wav_peaks through a DIFFERENT specifier gets a
 * different module instance with no reader in it, and the two cannot see each
 * other. Measured on device 2026-09-07: dAVEBOx resolved a real, existing file
 * and still reported "file not found" —
 *   key=synth:pad0_sample_move  exists=yes  peaksIo=NO
 * — with two different `wav_peaks.mjs` files present on disk (stock's tree and
 * the SA tree, different md5s). Same module, works on stock, dead in SA.
 *
 * ⭑ So the io is now a VALUE a consumer registers with ITS OWN import. Module
 * identity stops being an assumption the feature silently depends on. The
 * self-registration below is kept so nothing that relies on it regresses; it is
 * simply no longer the only route.
 */
export const WAV_QJS_IO = {
    open(path) {
        const f = std.open(path, "rb");
        if (!f) return null;
        return {
            read: (buf, pos, len) => f.read(buf, pos, len),
            /* whence 0 = SEEK_SET, matching std.seek. */
            seek: (off, whence) => f.seek(off, whence),
            close: () => f.close(),
        };
    },
    stat(path) {
        /* os.stat returns [obj, errno]; a non-zero errno means no answer, and
         * a signature we cannot compute is what makes the cache re-read a file
         * that changed underneath it. */
        const st = os.stat(path);
        if (!st || st[1] !== 0 || !st[0]) return null;
        return { size: st[0].size || 0, mtime: st[0].mtime || 0 };
    },
};

/* Kept: a consumer that reaches THIS module's wav_peaks instance still works
 * exactly as before. It is no longer the only route — see the header. */
setWavPeaksIO(WAV_QJS_IO);
