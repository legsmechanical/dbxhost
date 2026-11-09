/* overlay.mjs — whatever drawUI drew over the body afterwards (bank picker,
 * track volume card, notices, low battery), described the same way. */
import { describeLayer } from './layer.mjs';
export const overlay = { key: 'overlayLayer', collect: (frame) => describeLayer(frame.overlay) };
