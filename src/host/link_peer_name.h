/* link_peer_name.h — is this Link Audio peer the Move we are running on?
 *
 * Move announces its Link Audio channels under its own device name. That name
 * is "Move" — until the mDNS responder renames the host to dodge a collision
 * ("Move-2", "Move-3", …), which it does at boot and then keeps. Observed
 * 2026-09-02: after such a rename the subscriber still discovered and
 * subscribed to all five channels (it matched by substring), but the slot
 * mapping compared the name EXACTLY, so no channel was ever written into
 * the input ring, the shim never entered the rebuild path, and every Move bus
 * control — volume, pan, sends, mute/solo, inserts — was silently inert.
 *
 * One predicate for every place the subscriber asks the question, so the
 * discovery filter and the slot mapping cannot disagree again. Header-only
 * and C-compatible so a unit test can pin it without the Link SDK. */
#ifndef LINK_PEER_NAME_H
#define LINK_PEER_NAME_H

#include <string.h>

/* "Move", or "Move" plus a collision suffix: "-<digits>" or " (<digits>)". */
static inline int link_peer_is_move(const char *peer) {
    if (!peer) return 0;
    if (strncmp(peer, "Move", 4) != 0) return 0;
    const char *p = peer + 4;
    if (*p == '\0') return 1;
    int paren = 0;
    if (*p == '-') { p++; }
    else if (*p == ' ' && p[1] == '(') { p += 2; paren = 1; }
    else return 0;
    if (*p < '0' || *p > '9') return 0;
    while (*p >= '0' && *p <= '9') p++;
    if (paren) { if (*p != ')') return 0; p++; }
    return *p == '\0';
}

#endif /* LINK_PEER_NAME_H */
