/* voices.mjs — this fork carries no voice model (upstream's voicesOf/focusToken
 * live in its own page controller); only the sibling-shape spelling of
 * child_press_param is needed here, for the hierarchy-top declaration
 * (upstream #426, 2026-09-06). */

/** The sibling-shape spelling of `child_press_param` (child_key.mjs): a param
 *  the UI writes "1" to when a FINGER hits a pad while this component is on
 *  the grid. Or null. */
export function focusPressParamOf(hierarchy) {
    const k = hierarchy && hierarchy.focus_press_param;
    return (typeof k === "string" && k.length) ? k : null;
}
