/*
 * chain_move_check.h — may this "fx:move" happen? The answer the dispatcher
 * gives a chain REORDER before it reaches a module, because the chain's
 * set_param cannot answer.
 *
 * Header-only and dependency-free (like chain_permute.h and send/master key
 * headers) so tests/host can RUN it: its caller, shadow_chain_mgmt.c, is a shim
 * translation unit that does not build on the dev machine.
 *
 * The rules:
 *   - the value is "<from>><to>", 1-based, both within [1, npos], from != to;
 *   - nothing may still be rendering this chain (a render-pool lane can outlive
 *     a bailed round) — BUSY;
 *   - both ends AND every position the rotation crosses hold a module. The slot
 *     save writes positions COMPACTED and the load appends, so an order with a
 *     hole in it does not survive a reload: a move through a hole would come
 *     back different, with every "fxN" reference outside the chain naming the
 *     wrong module.
 */
#ifndef CHAIN_MOVE_CHECK_H
#define CHAIN_MOVE_CHECK_H

#include <stdio.h>

#define CHAIN_MOVE_OK       0
#define CHAIN_MOVE_BUSY    14
#define CHAIN_MOVE_REFUSED 15

/* `occupied(ctx, pos)` answers for a 1-based position. */
static inline int chain_fx_move_check(const char *value, int npos, int busy,
                                      int (*occupied)(void *ctx, int pos), void *ctx)
{
    int from = 0, to = 0;
    if (!value || sscanf(value, "%d>%d", &from, &to) != 2) return CHAIN_MOVE_REFUSED;
    if (from < 1 || from > npos || to < 1 || to > npos || from == to) return CHAIN_MOVE_REFUSED;
    if (busy) return CHAIN_MOVE_BUSY;
    if (!occupied) return CHAIN_MOVE_REFUSED;
    int lo = from < to ? from : to, hi = from < to ? to : from;
    for (int p = lo; p <= hi; p++)
        if (!occupied(ctx, p)) return CHAIN_MOVE_REFUSED;
    return CHAIN_MOVE_OK;
}

#endif /* CHAIN_MOVE_CHECK_H */
