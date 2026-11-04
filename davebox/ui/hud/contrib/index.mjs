/* index.mjs — THE list of contributors. Order = the document's key order.
 * Add an element: write contrib/<name>.mjs exporting { key, collect(frame) },
 * add one line here. Remove one: delete its line. Nothing else knows about it. */
import { where } from './where.mjs';
import { body } from './body.mjs';
import { overlay } from './overlay.mjs';
import { touch } from './touch.mjs';
import { held } from './held.mjs';
import { knobmeta } from './knobmeta.mjs';
import { params } from './params.mjs';
import { context } from './context.mjs';
export const CONTRIBUTORS = [where, body, params, overlay, touch, held, knobmeta, context];
