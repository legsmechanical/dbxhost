/*
 * bus_fx_move.h — reorder a BUS insert chain (master FX, a send bus, a Move FX
 * bus). Header-only so tests/host can RUN it: its caller, shadow_chain_mgmt.c,
 * is a shim translation unit that does not build on the dev machine.
 */
#ifndef BUS_FX_MOVE_H
#define BUS_FX_MOVE_H

#include <stdio.h>
#include "shadow_chain_mgmt.h"
#include "chain_move_check.h"
#include "chain_permute.h"

/* A BUS REORDER — "<bus>:fx:move" = "<from>><to>", 1-based — on the master FX,
 * a send bus or a Move FX bus. The bus array is PERMUTED (chain_permute.h):
 * each slot struct carries its instance, api, handle, module ids, capture
 * rules, bypass flag and its out-of-line chain_params_cache pointer, so the
 * whole position moves as one ~400 B element — nothing is unloaded, a reverb
 * keeps its tail. The bus's LFO targets ("fx1".."fx4") follow their module.
 * Same refusal rule as the slot chain (chain_fx_move_check): both ends and
 * everything between must hold a module. Bus FX render on this same SPI
 * thread (no render pool), so there is no busy case. `runtime_cached` (the
 * master bus's self-refreshing runtime chain_params cache) is marked stale for
 * the moved range rather than rotated. Returns 0 / 15. */
typedef struct { master_fx_slot_t *arr; int n; } bus_occ_ctx_t;
static inline int bus_fx_occupied(void *ctx, int pos) {
    const bus_occ_ctx_t *c = (const bus_occ_ctx_t *)ctx;
    return pos >= 1 && pos <= c->n && c->arr[pos - 1].instance != NULL;
}
_Static_assert(sizeof(master_fx_slot_t) <= CHAIN_PERM_MAX_ELEM,
               "master_fx_slot_t outgrew chain_permute.h's scratch: every bus fx:move would be refused");
static inline int shadow_bus_fx_move(master_fx_slot_t *arr, int n, lfo_state_t *lfos, int nlfo,
                              int *runtime_cached, const char *value) {
    bus_occ_ctx_t occ = { arr, n };
    int e = chain_fx_move_check(value, n, 0, bus_fx_occupied, &occ);
    if (e) return e;
    int from = 0, to = 0;
    sscanf(value, "%d>%d", &from, &to);
    chain_perm_array_t a = { (void *)arr, sizeof(master_fx_slot_t), 0 };
    int map[CHAIN_PERM_MAX_POS];
    if (chain_perm_move(&a, 1, n, from - 1, to - 1, map) < 0) return CHAIN_MOVE_REFUSED;
    for (int i = 0; i < nlfo; i++)
        chain_perm_retarget(lfos[i].target, sizeof(lfos[i].target), "fx", n, map, n);
    if (runtime_cached) {
        int lo = from < to ? from : to, hi = from < to ? to : from;
        for (int i = lo - 1; i <= hi - 1; i++) runtime_cached[i] = 0;
    }
    return CHAIN_MOVE_OK;
}
#endif /* BUS_FX_MOVE_H */
