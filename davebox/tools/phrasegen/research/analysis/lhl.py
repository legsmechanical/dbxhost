# Longuet-Higgins & Lee style syncopation for a 16-step 4/4 bar (cyclic).
W=[0,-4,-3,-4,-2,-4,-3,-4,-1,-4,-3,-4,-2,-4,-3,-4]
def lhl(steps):
    on=sorted(set(s%16 for s in steps))
    if not on: return 0
    tot=0
    for k,n in enumerate(on):
        nxt=on[(k+1)%len(on)]
        span=range(n+1, nxt if nxt>n else nxt+16)
        rests=[W[r%16] for r in span]
        if rests:
            d=max(rests)-W[n]
            if d>0: tot+=d
    return tot
if __name__=='__main__':
    import sys
    for p in sys.argv[1:]:
        print(p, lhl([i for i,c in enumerate(p) if c=='x']))
