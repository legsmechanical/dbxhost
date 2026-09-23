# D1: per-file even-16th swing of hats in GMD. Usage as gmd_slot_stats.py: python3 gmd_swing.py funk
import csv,mido,sys,statistics as st
style=sys.argv[1]; H={42,22,44,46,26}
res=[]
for r in csv.DictReader(open('groove/info.csv')):
    if r['style'].split('/')[0]!=style or r['beat_type']!='beat': continue
    m=mido.MidiFile('groove/'+r['midi_filename']); tpb=m.ticks_per_beat; s16=tpb/4
    odd=[];even=[]
    for tr in m.tracks:
        t=0
        for msg in tr:
            t+=msg.time
            if msg.type=='note_on' and msg.velocity>0 and msg.note in H:
                q=round(t/s16); dev=(t-q*s16)/s16*24
                (odd if q%2==0 else even).append(dev)
    if len(even)>=16 and len(odd)>=16:
        d=st.mean(even)-st.mean(odd); res.append((d,int(r['bpm'])))
ds=sorted(x[0] for x in res)
print(style,'files',len(ds),'swing delay ticks@96ppqn median',round(st.median(ds),2),'IQR',round(ds[len(ds)//4],2),round(ds[3*len(ds)//4],2),'max',round(ds[-1],1))
print(' as swing% median',round((24+st.median(ds))/48*100,1),' files >=58%:',sum(1 for d in ds if (24+d)/48>=0.58))
