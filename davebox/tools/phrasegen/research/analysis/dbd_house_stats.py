# D2: bass/band statistics for behzadhaki/drum_bassline_dataset (NO licence: reference/statistics only, never ingest).
# Usage: python3 dbd_house_stats.py "<clone>/House Dataset"
import os,glob,collections,sys
root=sys.argv[1]
bass_on=[0]*16; bass_bars=0; lens=collections.Counter(); ivs=collections.Counter(); regs=[]
kick=[0]*16; hat=[0]*16; hat7=[0]*16; dbars=0; onkick=0; ntot=0; offbeat8=0
n_rel=0
for d in sorted(glob.glob(os.path.join(root,'*/'))):
    bt=glob.glob(d+'harmonic/transcription/*.txt'); dt=glob.glob(d+'percussive/transcription*/*.txt')
    if not bt or not dt: continue
    notes=[]
    for l in open(bt[0]).read().split('\n')[1:]:
        p=l.split('\t')
        if len(p)<3: continue
        notes.append((int(float(p[0])),int(float(p[1])),float(p[2])))
    if not notes: continue
    rows=[list(map(int,l.split(','))) for l in open(dt[0]).read().split('\n') if l.strip()]
    nd=len(rows)//16*16 or len(rows)
    rows=rows[:nd]
    for i,r in enumerate(rows):
        s=i%16
        if r[0]: kick[s]+=1
        if r[-1]: hat[s]+=1
        if r[-2]: hat7[s]+=1
    dbars+=max(1,nd//16)
    L=max(o for _,o,_ in notes); nb=max(1,-(-L//16)); bass_bars+=nb
    # root = pitch class with max total duration
    pcd=collections.Counter()
    for a,b,m in notes: pcd[int(m)%12]+=b-a
    rpc=pcd.most_common(1)[0][0]
    kickset=set(i%16 for i,r in enumerate(rows) if r[0])
    for a,b,m in notes:
        bass_on[a%16]+=1; lens[b-a]+=1; ivs[(int(m)-rpc)%12]+=1; regs.append(m); ntot+=1
        if a%16 in kickset: onkick+=1
print('bass bars',bass_bars,'notes',ntot,'drum bars',dbars)
print('bass onset prob per step',[round(x/bass_bars,2) for x in bass_on])
print('kick prob',[round(x/dbars,2) for x in kick])
print('hat(B8) prob',[round(x/dbars,2) for x in hat])
print('hat(B7) prob',[round(x/dbars,2) for x in hat7])
print('lens(16ths)',sorted(lens.items()))
print('interval-from-root pc',sorted(ivs.items(),key=lambda x:-x[1]))
regs.sort(); print('midi pitch median',regs[len(regs)//2],'p10',regs[len(regs)//10],'p90',regs[9*len(regs)//10])
print('frac bass onsets on a kick step', round(onkick/ntot,2))
