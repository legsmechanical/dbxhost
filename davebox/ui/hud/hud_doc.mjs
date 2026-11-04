/* hud_doc.mjs — a recorded frame → the document the browser draws.
 *
 * The document is the contributors' outputs under their keys, in list order
 * (contrib/index.mjs). A contributor sees the frame and the document so far.
 * One that throws is skipped for that frame and logged once per key, so a
 * broken element never takes the screen down with it. */
import { CONTRIBUTORS } from './contrib/index.mjs';

const loggedFail = new Set();
let seq = 0;

export function buildDoc(frame) {
    const doc = { v: 1 };
    for (const c of CONTRIBUTORS) {
        try {
            const part = c.collect(frame, doc);
            if (part !== null && part !== undefined) doc[c.key] = part;
        } catch (e) {
            if (!loggedFail.has(c.key)) {
                loggedFail.add(c.key);
                if (typeof console !== 'undefined') console.log('hud: contributor ' + c.key + ' failed: ' + (e && e.message));
            }
        }
    }
    return doc;
}

/* Stamped only when the document is published (an unchanged screen keeps its
 * seq, so the browser can drop anything older than what it has). */
export function nextSeq() { return ++seq; }
