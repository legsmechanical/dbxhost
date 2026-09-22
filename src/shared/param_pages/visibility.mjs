/* visibility.mjs — `visible_if` evaluation, shared by every consumer.
 *
 * A level or a param can declare `visible_if`, and a module uses it to fold away
 * controls that do not apply in its current mode. Evaluate it wrong and the
 * editor shows everything at once; skip it and you show controls the module
 * deliberately hides.
 *
 * ⭐ WHY IT LIVES HERE. This was a PORT in davebox (`ui/pp_visible.mjs`) for one
 * session, because the host's evaluator sat in `src/shadow/shadow_ui.js` where
 * no module can import it — and a copy of a decision rule is the drift shape
 * this repo has paid for more than once (a hand-copied renderer four times, a
 * cell classifier twice). dbxhost is dAVEBOx's own host and may be changed to
 * suit it, so the rule moved to the one place both consumers can reach instead.
 *
 * ⚠ IT TAKES ITS READS INJECTED (`io.getParam`, `io.prefix`, `io.childIndexOf`)
 * rather than importing any state. That is param_pages/README.md rules 1 and 4 —
 * no param I/O, no module-level state — and it is what lets the shadow UI
 * evaluate against its hierarchy-editor cursor while dAVEBOx evaluates against
 * the page controller's, from the same code.
 *
 * ⭑ Generic and upstreamable: nothing here names a consumer.
 */

import { hasChildren, resolveChildKey } from "./child_key.mjs";

/* ⚠ FAIL-OPEN IS THE HOST'S RULE, not a convenience. A condition naming a param
 * we cannot read returns TRUE — showing a control that should be hidden is a
 * cosmetic fault, hiding one the user needs is a functional one. */

export function parseMetaBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === null || value === undefined) return false;
    const v = String(value).trim().toLowerCase();
    return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function parseMetaNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

/* ⚠ The EXPECTED side decides the comparison, not the actual one. A raw param
 * arrives as a string whatever it means, so comparing by the actual's type
 * would make every test a string test — `equals: 1` would never match "1". */
export function compareConditionValue(actualRaw, expectedRaw) {
    if (typeof expectedRaw === "boolean") {
        return parseMetaBool(actualRaw) === expectedRaw;
    }
    if (typeof expectedRaw === "number") {
        const num = Number(actualRaw);
        return Number.isFinite(num) && num === expectedRaw;
    }
    return String(actualRaw) === String(expectedRaw);
}

/* A condition names a param by its BARE key; this turns it into the full key
 * the engine answers to. ⚠ Repeated elements are why childIndex exists: inside
 * a child level, `cutoff` means THIS child's cutoff (`op2_cutoff`).
 *
 * ⚠⚠ ONLY A KEY THE LEVEL LISTS IS PER-INSTANCE, and this is the host's rule
 * (upstream shadow_ui.js `hierChildKeyFor`), not a choice. A module gates its
 * child levels on a GLOBAL key too -- a drum module's `ui_engine` says which
 * engine the focused pad runs, sits on no level, and is served bare. Expanding
 * every key turned it into `pad2_ui_engine`, which nothing serves: it read "",
 * compared equal to 0, and every pad got the sample pages whatever it ran.
 * Membership of the level's own list also covers a key that is already
 * concrete (`op1_ratio` is never listed), which the old `startsWith` test
 * guessed at -- and guessed wrong for a listed key that merely begins with the
 * prefix.
 *
 * ⚠ `childIndex` is ZERO-BASED, the same index the controller hands
 * resolveChildKey for a value key. Building `${child_prefix}${childIndex}_`
 * here ignored `child_index_base` and templates, so on a module numbering its
 * pads from 1 a condition read the PREVIOUS pad's value. One resolver for
 * value keys and condition keys is what keeps them the same instance. */
function listsKey(levelDef, rawKey) {
    const listed = (k) => (typeof k === "string" ? k : (k && k.key)) === rawKey;
    return (levelDef.knobs || []).some(listed) || (levelDef.params || []).some(listed);
}

export function normalizeVisibilityConditionKey(componentPrefix, levelDef, childIndex, rawKey) {
    if (!rawKey) return "";
    if (rawKey.includes(":")) return rawKey;
    if (!componentPrefix) return rawKey;
    if (childIndex >= 0 && hasChildren(levelDef) && listsKey(levelDef, rawKey)) {
        return `${componentPrefix}:${resolveChildKey(levelDef, childIndex, rawKey) || rawKey}`;
    }
    return `${componentPrefix}:${rawKey}`;
}

/**
 * @param {object} io  { getParam(fullKey), prefix, childIndexOf(levelDef) }
 *        Injected rather than imported so this file has no davebox state in it
 *        and the pin can exercise every branch headlessly.
 */
export function evaluateVisibility(io, condition, levelDef) {
    if (!condition || typeof condition !== "object") return true;
    const conditionParam = condition.param || condition.key || condition.param_key;
    if (!conditionParam) return true;

    const childIndex = (io && typeof io.childIndexOf === "function")
        ? io.childIndexOf(levelDef) : -1;
    const fullKey = normalizeVisibilityConditionKey(
        io && io.prefix, levelDef, childIndex, String(conditionParam));
    const rawValue = io.getParam(fullKey);
    if (rawValue === null || rawValue === undefined) return true;   /* fail-open */

    if (condition.equals !== undefined) {
        return compareConditionValue(rawValue, condition.equals);
    }
    if (condition.not_equals !== undefined) {
        return !compareConditionValue(rawValue, condition.not_equals);
    }
    if (condition.gt !== undefined || condition.greater_than !== undefined || condition.greater !== undefined) {
        const threshold = parseMetaNumber(
            condition.gt !== undefined ? condition.gt :
                (condition.greater_than !== undefined ? condition.greater_than : condition.greater),
            null
        );
        const current = Number(rawValue);
        return Number.isFinite(current) && Number.isFinite(threshold) && current > threshold;
    }
    if (condition.lt !== undefined || condition.smaller_than !== undefined || condition.smaller !== undefined) {
        const threshold = parseMetaNumber(
            condition.lt !== undefined ? condition.lt :
                (condition.smaller_than !== undefined ? condition.smaller_than : condition.smaller),
            null
        );
        const current = Number(rawValue);
        return Number.isFinite(current) && Number.isFinite(threshold) && current < threshold;
    }
    if (condition.truthy !== undefined) {
        return parseMetaBool(condition.truthy) ? parseMetaBool(rawValue) : !parseMetaBool(rawValue);
    }
    if (condition.falsey !== undefined || condition.falsy !== undefined) {
        const flag = condition.falsey !== undefined ? condition.falsey : condition.falsy;
        return parseMetaBool(flag) ? !parseMetaBool(rawValue) : parseMetaBool(rawValue);
    }

    return parseMetaBool(rawValue);
}
