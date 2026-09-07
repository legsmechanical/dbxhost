/*
 * component_error.mjs — "is this component's module actually running?"
 *
 * ⭐ WHY THIS IS SHARED. The chain DSP publishes a load failure as a readable
 * param — `synth_error` on the slot, `<component>:error` for the rest — and the
 * host has always checked it before opening an editor, popping a warning
 * instead. dAVEBOx draws its own screens, so it never asked: a generator that
 * failed to load its assets got an editor for a module that is not running,
 * with no message anywhere. The knobs move and nothing makes a sound.
 *
 * The RULE is generic — do not open an editor on a component that reported a
 * failure, and say why. The SCREEN is each consumer's own. So the rule lives
 * here and each consumer draws its own warning: that is the split that stops a
 * second consumer silently inheriting less than the first.
 *
 * PURE. It reads through an injected accessor and never draws.
 */

/*
 * The key a component publishes its load failure under.
 *
 * ⚠ `synth` IS THE ODD ONE and it is not a tidy-up waiting to happen. The
 * generator's failure is a SLOT-level fact (`synth_error`), because a slot has
 * one generator and the chain host reports it there; every other component
 * namespaces its own (`fx1:error`). Rewriting either spelling to match the
 * other would stop reading the value the DSP actually publishes.
 */
export function componentErrorKey(component) {
    const c = String(component || "");
    if (!c) return null;
    return c === "synth" ? "synth_error" : `${c}:error`;
}

/*
 * The failure `component` is reporting, or null when it is healthy.
 *
 * @param {function} getParam  (key) -> value; the caller supplies the slot.
 *
 * ⚠ EMPTY IS HEALTHY, and so is a key nobody serves. A component that has never
 * failed answers "", and a host that does not implement the key answers "" or
 * null — neither is an error, and treating "I could not read it" as a failure
 * would refuse to open editors on a working device. This has to fail OPEN: the
 * cost of missing a warning is a confusing editor, the cost of inventing one is
 * a module you cannot edit at all.
 */
export function readComponentError(getParam, component) {
    if (typeof getParam !== "function") return null;
    const key = componentErrorKey(component);
    if (!key) return null;
    let raw;
    try {
        raw = getParam(key);
    } catch (e) {
        return null;                    /* unreadable is not failed */
    }
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    return text.length > 0 ? text : null;
}
