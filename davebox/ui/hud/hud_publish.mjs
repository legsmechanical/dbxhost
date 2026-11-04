/* hud_publish.mjs — the only file that talks to the host.
 *
 * - Nobody watching (the normal case): probe host_ui_publish(null) about once
 *   a second, record nothing, build nothing.
 * - A viewer: drawUI records every drawn frame; it is published the moment it
 *   differs from the last one (no rate cap — a turned knob should reach the
 *   page in the same frame it reaches the OLED). An unchanged frame costs a
 *   string compare.
 * - When a viewer appears the screen is marked dirty so it gets a document at
 *   once instead of at the next unrelated redraw. */
import { S } from '../ui_state.mjs';
import { buildDoc, nextSeq } from './hud_doc.mjs';
import { hudFrameBegin, hudFrameEnd, hudRecord } from './hud_frame.mjs';
import { setKitHudSink } from '../ui_movy.mjs';

const PROBE_MS = 1000;
let viewer = false;
let lastProbe = -PROBE_MS;
let lastBody = '';

export function hudViewer() { return viewer; }

/* Every tick: keep learning whether anyone watches. */
export function hudTick(nowMs) {
    if (nowMs - lastProbe < PROBE_MS) return;
    lastProbe = nowMs;
    const was = viewer;
    viewer = !!host_ui_publish(null);
    if (viewer && !was) { lastBody = ''; S.screenDirty = true; }
}

/* After a recorded frame: build, compare, publish. */
export function hudPublishFrame(frame) {
    if (!frame) return;
    const doc = buildDoc(frame);
    const body = JSON.stringify(doc);
    if (body === lastBody) return;
    lastBody = body;
    /* seq goes in front without a second stringify */
    viewer = !!host_ui_publish('{"seq":' + nextSeq() + ',' + body.slice(1));
}

/* drawUI's bracket: open a recorded frame when a viewer watches (returns
 * whether it did), and close + publish it. */
export function hudFrameStart() {
    if (!viewer) return false;
    setKitHudSink(hudRecord);
    hudFrameBegin();
    return true;
}
export function hudFrameFinish() {
    setKitHudSink(null);
    hudPublishFrame(hudFrameEnd());
}
