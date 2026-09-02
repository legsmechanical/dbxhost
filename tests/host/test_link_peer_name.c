/* tests/host/test_link_peer_name.c — the one predicate the Link Audio
 * subscriber uses to recognise the Move it runs on. A Move that renamed itself
 * at boot ("Move-2") must still be recognised, or every Move bus control goes
 * silently inert (2026-09-02); anything that is not this Move must not be. */
#include "../../src/host/link_peer_name.h"
#include <stdio.h>

static int fails = 0;
static void expect(const char *peer, int want) {
    int got = link_peer_is_move(peer);
    if (got != want) { fails++; printf("FAIL: link_peer_is_move(\"%s\") = %d, want %d\n", peer ? peer : "(null)", got, want); }
}

int main(void) {
    expect("Move", 1);
    expect("Move-2", 1);          /* the avahi collision rename, observed on device */
    expect("Move-10", 1);
    expect("Move (2)", 1);        /* the other common collision spelling */
    expect("Move-", 0);
    expect("Move-x", 0);
    expect("Move (2", 0);
    expect("Movement", 0);        /* another peer whose name merely starts with Move */
    expect("Moveable-2", 0);
    expect("MacBook", 0);
    expect("", 0);
    expect(NULL, 0);
    if (fails) return 1;
    printf("PASS: link_peer_is_move — Move and its collision renames, nothing else\n");
    return 0;
}
