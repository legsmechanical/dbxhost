/* pp_visible.mjs — `visible_if` evaluation for the module editor.
 *
 * ⚠⚠ THIS IS A PORT, AND IT IS THE ONLY ONE IN THE MODULE EDITOR. Everything
 * else davebox shows in that editor is the host's own code, vendored or shared.
 * This is here because the host's evaluator lives in `src/shadow/shadow_ui.js`
 * (not in `shared/`), along with all four of its helpers — so there is nothing
 * to import, and a module cannot reach into the shadow tree at runtime without
 * executing the STOCK install (see scripts/bundle_ui.sh).
 *
 * ⭐ WHY IT MATTERS: unanswered, the page planner shows EVERYTHING, so davebox
 * would display parameters stock deliberately HIDES — a module's hierarchy uses
 * `visible_if` to fold away controls that do not apply in the current mode, and
 * without this they all appear at once. That is not a cosmetic difference.
 *
 * ⚠ A PORT SILENTLY ROTS. `tests/host/test_pp_visible_matches_host.sh` pins the
 * behaviour of every branch below against the host's own functions, read out of
 * shadow_ui.js's CODE. If the host's rules change, that test fails rather than
 * this file quietly disagreeing with the editor it feeds.
 *
 * Ported verbatim in behaviour from shadow_ui.js:
 *   evaluateVisibilityConditionForContext, normalizeVisibilityConditionKey,
 *   compareConditionValue, parseMetaNumber, parseMetaBool
 */

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
 * a `child_prefix` level, `cutoff` means THIS child's cutoff (`op2_cutoff`),
 * and a key that already carries the prefix must not get a second one. */
export function normalizeVisibilityConditionKey(componentPrefix, levelDef, childIndex, rawKey) {
    if (!rawKey) return "";
    if (rawKey.includes(":")) return rawKey;
    if (!componentPrefix) return rawKey;
    if (levelDef && levelDef.child_prefix && childIndex >= 0) {
        if (rawKey.startsWith(levelDef.child_prefix)) {
            return `${componentPrefix}:${rawKey}`;
        }
        return `${componentPrefix}:${levelDef.child_prefix}${childIndex}_${rawKey}`;
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
