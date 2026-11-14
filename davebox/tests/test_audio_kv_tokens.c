/* tests/test_audio_kv_tokens.c — an Audio clip's saved line is read whole.
 *
 * The state reader (seq8_audio.c au_read_kv) keeps up to AU_KV_MAX key=value
 * tokens and drops the rest without a word. An Audio clip's line already
 * carries 15, so two more fields would have lost the tail (Speed, then Free)
 * on load. This pins room to spare: a line with every field a clip writes,
 * plus keys a newer build might add in front, reads the last one. */
#include "harness.h"

int main(void) {
    au_kv_t kv[AU_KV_MAX];
    const char *line = "x1=1 x2=2 x3=3 x4=4 x5=5 x6=6 rs=10 p=1 dt=2 g=3 dr=1 nu=4 sh=0 sy=1 bpm=1200 "
                       "of=12 os=1 en=900 sp=768 fr=1 spd=500|a.wav";
    const char *p = line;
    int n = au_read_kv(&p, kv);
    HX_ASSERT(n == 21, "not every token was read");
    HX_ASSERT(au_kv(kv, n, "spd", 0) == 500 && au_kv(kv, n, "fr", 0) == 1 && au_kv(kv, n, "sp", 0) == 768,
              "the line's last fields (Speed, Free, Bars) were dropped");
    HX_ASSERT(au_kv(kv, n, "rs", 0) == 10 && au_kv(kv, n, "bpm", 0) == 1200, "the line's first fields were lost");
    HX_ASSERT(*p == '|', "the reader did not stop on the name");
    printf("PASS: test_audio_kv_tokens\n");
    return 0;
}
