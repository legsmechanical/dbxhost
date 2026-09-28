#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# ONE SHARED MODULE, ONE INSTANCE — under a build whose shared/ is NOT the
# canonical one (dbxhost installs to /data/UserData/dbx-host).
#
# The bug this pins (found on device, 2026-09-15): dAVEBOx logged
# "widgets: monksynth registered custom:monkmouth" and the Vowel cell still drew
# a plain knob. dAVEBOx imports widget_registry.mjs by the CANONICAL specifier;
# page_controller.mjs reaches it RELATIVELY. QuickJS looks a module up by its
# normalized name BEFORE calling the loader, and the loader only rewrote the
# prefix of the file it READ — the module was registered under the LOCAL name.
# So the canonical name was never found, every canonical import loaded a fresh
# copy, and dAVEBOx registered into a registry the grid never reads. On stock
# the two prefixes are the same string, which is why stock drew the mouth.
#
# A node test cannot see this: node keys modules by URL and the rig's hooks map
# both specifiers to one file. So this compiles the REAL resolver
# (src/host/shared_import_resolve.h) against the vendored QuickJS, with temp
# dirs standing in for the two prefixes, and asserts identity both import
# orders round.

QJS=libs/quickjs/quickjs-2025-04-26
CC=${CC:-cc}
command -v "$CC" >/dev/null 2>&1 || { echo "FAIL: no C compiler" >&2; exit 1; }

work=$(mktemp -d "${TMPDIR:-/tmp}/shared-import.XXXXXX")
trap 'rm -rf "$work"' EXIT
canon="$work/canon/shared/"      # the contract prefix: NOTHING lives here
local_dir="$work/local/shared/"  # this build's shared/
mkdir -p "$work/canon/shared" "$local_dir/sub" "$work/mod"

# A stateful module, and a sibling that reaches it relatively (one dir down, so
# ../ resolution is exercised too).
cat > "$local_dir/registry.mjs" <<'JS'
export const bag = [];
JS
cat > "$local_dir/sub/reader.mjs" <<'JS'
import { bag } from "../registry.mjs";
export function count() { return bag.length; }
JS

# Two consumer orders: canonical registry first, and the relative path first.
cat > "$work/mod/a.mjs" <<JS
import { bag } from "${canon}registry.mjs";
import { count } from "${canon}sub/reader.mjs";
bag.push(1);
globalThis.resultA = count();
JS
cat > "$work/mod/b.mjs" <<JS
import { count } from "${canon}sub/reader.mjs";
import { bag } from "${canon}registry.mjs";
bag.push(1);
globalThis.resultB = count();
JS

cat > "$work/t.c" <<C
#define SHARED_IMPORT_CANONICAL "${canon}"
#define SHARED_IMPORT_LOCAL     "${local_dir}"
#include "host/shared_import_resolve.h"
#include <stdlib.h>

static int run(JSContext *ctx, const char *path, const char *var) {
    size_t len; uint8_t *buf = js_load_file(ctx, &len, path);
    if (!buf) { printf("cannot read %s\n", path); return -1; }
    JSValue v = JS_Eval(ctx, (char *)buf, len, path, JS_EVAL_TYPE_MODULE);
    js_free(ctx, buf);
    if (JS_IsException(v)) { js_std_dump_error(ctx); return -1; }
    v = js_std_await(ctx, v);
    if (JS_IsException(v)) { js_std_dump_error(ctx); return -1; }
    JS_FreeValue(ctx, v);
    JSValue g = JS_GetGlobalObject(ctx);
    JSValue r = JS_GetPropertyStr(ctx, g, var);
    int32_t n = -1; JS_ToInt32(ctx, &n, r);
    JS_FreeValue(ctx, r); JS_FreeValue(ctx, g);
    return n;
}

int main(int argc, char **argv) {
    int fails = 0;
    for (int i = 1; i < argc; i++) {
        JSRuntime *rt = JS_NewRuntime();
        JSContext *ctx = JS_NewContext(rt);
        js_std_add_helpers(ctx, 0, NULL);
        schwung_install_module_resolver(rt);
        const char *var = (i == 1) ? "resultA" : "resultB";
        int n = run(ctx, argv[i], var);
        /* 1 = the sibling saw the push: one instance. 0 = two copies. */
        printf("%s: sibling sees %d entr%s\n", var, n, n == 1 ? "y" : "ies");
        if (n != 1) fails++;
        JS_FreeContext(ctx); JS_FreeRuntime(rt);
    }
    return fails ? 1 : 0;
}
C

if ! "$CC" -O0 -w -D_GNU_SOURCE -DCONFIG_VERSION='"test"' -I"$QJS" -Isrc \
      "$work/t.c" "$QJS/quickjs.c" "$QJS/quickjs-libc.c" "$QJS/libregexp.c" \
      "$QJS/libunicode.c" "$QJS/cutils.c" "$QJS/dtoa.c" -lm -lpthread \
      -o "$work/t" 2>"$work/cc.log"; then
  cat "$work/cc.log" >&2
  echo "FAIL: could not build the resolver probe" >&2
  exit 1
fi

# POSITIVE CONTROL first: the local file really is reachable through the
# canonical prefix (a probe that cannot load anything would report 0 and look
# like the bug).
if ! out=$("$work/t" "$work/mod/a.mjs" "$work/mod/b.mjs" 2>&1); then
  echo "$out" >&2
  echo "FAIL: a shared module imported canonically AND relatively is TWO instances" >&2
  echo "      (state registered through one is invisible through the other)" >&2
  exit 1
fi
echo "$out"
echo "PASS: canonical and relative imports of a shared module are one instance"
