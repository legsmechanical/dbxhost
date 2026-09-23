# D1: per-16th-slot hat/snare/kick onset P, mean velocity, timing (ticks@96PPQN) in GMD.
# Usage: run in a dir containing groove/ (unzipped groove-v1.0.0-midionly.zip, CC BY 4.0): python3 gmd_slot_stats.py funk
import csv,mido,collections,sys,statistics as st
style=sys.argv[1]; btype=sys.argv[2] if len(sys.argv)>2 else 'beat'
CL={42,22,44}; OP={46,26}; SN={38,40,37}; KK={36}
rows=[r for r in csv.DictReader(open('groove/info.csv')) if r['style'].split('/')[0]==style and r['beat_type']==btype and r['time_signature']=='4-4']
cnt={k:[0]*16 for k in ('cl','op','sn','kk','hatany')}
vel={k:[[] for _ in range(16)] for k in ('cl','sn','kk','hatany')}
off=[[] for _ in range(16)]; bars=0; bpms=[]
for r in rows:
    m=mido.MidiFile('groove/'+r['midi_filename']); tpb=m.ticks_per_beat
    t=0; ev=[]
    for tr in m.tracks:
        t=0
        for msg in tr:
            t+=msg.time
            if msg.type=='note_on' and msg.velocity>0: ev.append((t,msg.note,msg.velocity))
    if not ev: continue
    s16=tpb/4; nb=int(max(e[0] for e in ev)/(16*s16))+1; bars+=nb; bpms.append(int(r['bpm']))
    seen=set()
    for tk,n,v in ev:
        q=round(tk/s16); slot=q%16; bar=q//16
        dev=(tk-q*s16)/s16*24  # ticks at 96 PPQN (24 per 16th)
        for k,S in (('cl',CL),('op',OP),('sn',SN),('kk',KK),('hatany',CL|OP)):
            if n in S:
                key=(k,bar,slot)
                if key in seen: continue
                seen.add(key); cnt[k][slot]+=1
                if k in vel: vel[k][slot].append(v)
                if k=='hatany': off[slot].append(dev)
print(style,btype,'files',len(rows),'bars',bars,'bpm median',st.median(bpms),'range',min(bpms),max(bpms))
for k in cnt: print(k,'P',[round(x/bars,2) for x in cnt[k]])
for k in vel: print(k,'meanvel',[round(st.mean(x)) if x else '-' for x in vel[k]])
print('hat mean timing dev (ticks@96ppqn)',[round(st.mean(x),1) if x else '-' for x in off])
