/* shared_import_resolve.h — resolve a shared-library import to THIS install.
 *
 * The includer defines both prefixes first:
 *   SHARED_IMPORT_CANONICAL  the prefix every shipped module hardcodes
 *   SHARED_IMPORT_LOCAL      where THIS build keeps its own shared/
 * (shadow_ui.c does; so does tests/host/test_shared_import_one_instance.sh,
 * with temp dirs, which is why the functions live in a header at all.)
 *
 * Modules import shared utilities by absolute canonical path, which hardcodes
 * one install location. A second install running the SAME modules directory
 * would load the other install's shared/ — silently mixing two builds' library
 * code. Rewriting the prefix keeps the module contract stable while letting
 * each install serve its own shared/.
 */
#ifndef SHARED_IMPORT_RESOLVE_H
#define SHARED_IMPORT_RESOLVE_H

#include <string.h>
#include <stdio.h>
#include "quickjs.h"
#include "quickjs-libc.h"

#if !defined(SHARED_IMPORT_CANONICAL) || !defined(SHARED_IMPORT_LOCAL)
#error "define SHARED_IMPORT_CANONICAL and SHARED_IMPORT_LOCAL before including shared_import_resolve.h"
#endif

/* ⚠⚠ THE REWRITE MUST HAPPEN IN THE NORMALIZER, NOT ONLY IN THE LOADER.
 *
 * QuickJS looks an import up in its loaded-module list by the NORMALIZED name,
 * and calls the loader only on a miss. A loader-only rewrite reads the local
 * file but the module is registered under the LOCAL name — so the CANONICAL
 * name never hits, and every canonical import of a module something else
 * already reached relatively (or canonically) evaluates a SECOND copy. Harmless
 * for a constants file; fatal for anything with state. It is exactly how
 * dAVEBOx registered a module's widgets into a registry its grid never read
 * (device, 2026-09-15): the log said "registered", the cell drew a plain knob.
 * Stock never sees it — its two prefixes are the same string.
 *
 * So the normalizer maps canonical -> local, and every module has ONE name.
 * Relative resolution below is QuickJS's default (js_default_module_normalize_
 * name, which is static and not exported): only a leading "./" or "../" is
 * resolved against the importer's directory; anything else is kept verbatim. */
static char *schwung_module_normalize(JSContext *ctx, const char *base_name,
                                      const char *name, void *opaque) {
    (void)opaque;
    const size_t canon_len = strlen(SHARED_IMPORT_CANONICAL);
    const size_t local_len = strlen(SHARED_IMPORT_LOCAL);
    size_t cap = strlen(base_name) + strlen(name) + local_len + 2;
    char *out = js_malloc(ctx, cap);
    if (!out) return NULL;

    if (name[0] != '.') {
        snprintf(out, cap, "%s", name);
    } else {
        const char *slash = strrchr(base_name, '/');
        size_t len = slash ? (size_t)(slash - base_name) : 0;
        memcpy(out, base_name, len);
        out[len] = '\0';
        const char *r = name;
        for (;;) {
            if (r[0] == '.' && r[1] == '/') {
                r += 2;
            } else if (r[0] == '.' && r[1] == '.' && r[2] == '/') {
                if (out[0] == '\0') break;
                char *p = strrchr(out, '/');
                p = p ? p + 1 : out;
                if (!strcmp(p, ".") || !strcmp(p, "..")) break;
                if (p > out) p--;
                *p = '\0';
                r += 3;
            } else {
                break;
            }
        }
        size_t used = strlen(out);
        snprintf(out + used, cap - used, "%s%s", out[0] ? "/" : "", r);
    }

    if (strcmp(SHARED_IMPORT_CANONICAL, SHARED_IMPORT_LOCAL) != 0 &&
        strncmp(out, SHARED_IMPORT_CANONICAL, canon_len) == 0) {
        size_t rest = strlen(out + canon_len);
        char *mapped = js_malloc(ctx, local_len + rest + 1);
        if (!mapped) { js_free(ctx, out); return NULL; }
        memcpy(mapped, SHARED_IMPORT_LOCAL, local_len);
        memcpy(mapped + local_len, out + canon_len, rest + 1);
        js_free(ctx, out);
        return mapped;
    }
    return out;
}

/* The loader keeps its own rewrite as a backstop (a name that reached it
 * without passing the normalizer). No-op on a stock build. */
static JSModuleDef *schwung_module_loader(JSContext *ctx, const char *module_name,
                                          void *opaque) {
    const size_t canon_len = strlen(SHARED_IMPORT_CANONICAL);

    if (strncmp(module_name, SHARED_IMPORT_CANONICAL, canon_len) == 0) {
        char local[512];
        int n = snprintf(local, sizeof(local), "%s%s",
                         SHARED_IMPORT_LOCAL, module_name + canon_len);
        /* Truncation would silently resolve to the wrong file; fall through to
         * the canonical path instead, which at worst loads the stock copy. */
        if (n > 0 && (size_t)n < sizeof(local))
            return js_module_loader(ctx, local, opaque);
    }
    return js_module_loader(ctx, module_name, opaque);
}

static void schwung_install_module_resolver(JSRuntime *rt) {
    JS_SetModuleLoaderFunc(rt, schwung_module_normalize, schwung_module_loader, NULL);
}

#endif
