/* body.mjs — the screen drawUIBody chose, described from its primitives. */
import { describeLayer } from './layer.mjs';
export const body = { key: 'body', collect: (frame) => describeLayer(frame.body) };
