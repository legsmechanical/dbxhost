/* tests/host/test_font_utf8.c — a bitmap glyph past ASCII is DRAWN.
 *
 * Text reaches print() from JS as UTF-8. The renderer used to walk it byte by
 * byte against a 256-entry table, so every glyph the font defines past ASCII
 * (°, Ä, €, the record dot) was unreachable: two or three bytes, none of them
 * naming it. Loads the REAL deployment font (built by generate_font.py) and
 * reads the screen buffer back. */
#include <stdio.h>
#include <string.h>
#include "js_display.h"

/* js_display.c's QuickJS bindings are not under test; these only let it link. */
void JS_FreeCString(JSContext *c, const char *p) { (void)c; (void)p; }
JSValue JS_NewCFunction2(JSContext *c, JSCFunction *f, const char *n, int l, JSCFunctionEnum k, int m)
    { (void)c; (void)f; (void)n; (void)l; (void)k; (void)m; return JS_UNDEFINED; }
int JS_SetPropertyStr(JSContext *c, JSValueConst o, const char *p, JSValue v)
    { (void)c; (void)o; (void)p; (void)v; return 0; }
const char *JS_ToCStringLen2(JSContext *c, size_t *l, JSValueConst v, JS_BOOL b)
    { (void)c; (void)l; (void)v; (void)b; return NULL; }
int JS_ToInt32(JSContext *c, int32_t *r, JSValueConst v) { (void)c; (void)r; (void)v; return 0; }

static int fails = 0;
#define CHECK(c, m) do { if (c) printf("  ok   — %s\n", m); else { printf("  FAIL — %s\n", m); fails++; } } while (0)

static int ink(int x0, int x1) {
    int n = 0;
    for (int y = 0; y < DISPLAY_HEIGHT; y++)
        for (int x = x0; x < x1; x++) n += js_display_screen_buffer[y * DISPLAY_WIDTH + x] ? 1 : 0;
    return n;
}

int main(int argc, char **argv) {
    if (argc < 2 || !js_display_set_font(argv[1])) { printf("  FAIL — could not load %s\n", argc > 1 ? argv[1] : "(no font)"); return 1; }

    memset(js_display_screen_buffer, 0, sizeof js_display_screen_buffer);
    js_display_print(0, 0, "\xe2\x97\x8f", 1);                 /* ● U+25CF, 3 bytes */
    CHECK(ink(0, 128) == 21, "⭐ the record dot draws: its 21 pixels, nothing else");
    CHECK(js_display_text_width("\xe2\x97\x8f") == 6, "...and measures as ONE 5-wide glyph plus spacing");

    memset(js_display_screen_buffer, 0, sizeof js_display_screen_buffer);
    js_display_print(0, 0, "\xc2\xb0", 1);                      /* ° U+00B0, 2 bytes */
    CHECK(ink(0, 128) == 8, "a 2-byte glyph (the degree ring) draws its 8 pixels");

    /* ASCII is untouched: "AB" draws and measures as before, and a glyph the
     * font lacks advances by the spacing alone. */
    memset(js_display_screen_buffer, 0, sizeof js_display_screen_buffer);
    js_display_print(0, 0, "A\xe2\x97\x8f" "B", 1);
    const int wA = js_display_text_width("A");
    CHECK(ink(wA, wA + 5) == 21, "the dot lands right after A — the multi-byte walk kept the cursor");
    CHECK(js_display_text_width("A\xe2\x97\x8f" "B") == js_display_text_width("A") + 6 + js_display_text_width("B"),
          "mixed text measures as the sum of its glyphs");
    CHECK(js_display_text_width("\xe2\x98\x83") == 1, "an absent glyph (U+2603) advances by the spacing, as before");

    printf("test_font_utf8: %d fail(s)\n", fails);
    return fails ? 1 : 0;
}
