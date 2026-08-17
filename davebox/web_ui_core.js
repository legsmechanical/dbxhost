/* dAVEBOx remote UI — transport + state plumbing.
 *
 * Split out of the single-file web_ui.html verbatim (no logic changes). The
 * original wrapped everything in one IIFE; the two halves cross-reference each
 * other pervasively (core's refresh() calls seq's applyParams(), seq's emit()
 * calls core's afterEdit()), so the wrapper was dropped rather than duplicated —
 * classic <script> tags share one global lexical scope, so top-level const/let/
 * function here are visible in web_ui_seq.js exactly as they were inside the IIFE.
 * Load order is fixed by web_ui.html: this file first, web_ui_seq.js second, and
 * everything that executed at the bottom of the original script still executes at
 * the bottom of web_ui_seq.js. */

/* Chain slots the host renders. Must match SEQ8_CHAIN_SLOTS (dsp/seq8.c) and
   CHAIN_SLOTS (ui/ui_engine.mjs) — pinned by
   tests/host/test_slot_count_is_single_sourced.sh. Declared here so BOTH script
   blocks below see one value; the slot selector, the display letters and the
   incoming-value clamp all used to hardcode 4 independently. */
window.CHAIN_SLOTS = 8;
window.slotLetter = (i) => String.fromCharCode(65 + Math.max(0, Math.min(window.CHAIN_SLOTS - 1, i | 0)));

/* ---- fallback shim: standalone local preview without a device. Speaks the same
       "overtake_dsp:"-prefixed flat fields the manager seeds, and APPLIES note ops to its
       mock store so the preview is a faithful edit loop. ---- */
if (!window.schwungRemote) {
  let rev=1;
  /* live playhead tick for the preview: advance at 120 BPM (96 ticks/beat * 120/60000
     = 0.192 ticks/ms) and wrap within the loop window [ls, ls+len)*tps24 — exactly like
     the device's current_clip_tick — so a foreground preview faithfully shows looping. */
  const phTick=()=>{ const win=Math.max(1,clipLen*24); return clipLs*24 + Math.floor(performance.now()*0.192)%win; };
  const sel={t:1,c:0,lane:-1};
  let mockPlay=1;                 /* preview transport state, toggled by the transport key */
  let clipLen=16, clipDir=0, clipLs=0;
  // melodic store (track 1, clip 0)
  let mel=[[0,60,100,24],[24,64,90,24],[48,67,110,24],[72,72,80,48],
           [96,60,100,24],[120,63,70,24],[144,67,100,48],[192,72,120,24],[216,69,90,24]]
          .map(([tick,pitch,vel,gate])=>({tick,pitch,vel,gate}));
  // drum store (track 0): 32 lanes, base notes 36..67, a little starter groove
  const drum=Array.from({length:32},(_,l)=>({note:36+l,hits:[]}));
  [[0,0],[0,96],[0,192],[0,288]].forEach(([l,t])=>drum[0].hits.push({tick:t,vel:110,gate:24})); // kick
  [[2,96],[2,288]].forEach(([l,t])=>drum[2].hits.push({tick:t,vel:100,gate:24}));               // snare
  for(let t=0;t<384;t+=48) drum[6].hits.push({tick:t,vel:70,gate:24});                            // hat
  const tracks=Array.from({length:8},(_,t)=>({pm:t===0?1:0, ac:0, mute:0, solo:0, route:t<4?1:0, chan:t+1}));
  // per-clip FX (melodic), 29 values matching the DSP rui_pfx order
  const PFXKEYS=["noteFX_octave","noteFX_offset","noteFX_gate","noteFX_velocity","quantize",
    "noteFX_random","noteFX_random_mode","noteFX_length_mode","harm_octaver","harm_interval1",
    "harm_interval2","harm_interval3","delay_time","delay_level","delay_repeats","delay_vel_fb",
    "delay_pitch_fb","delay_pitch_random","delay_pitch_random_mode","delay_gate_fb","delay_clock_fb",
    "delay_retrig","seq_arp_style","seq_arp_rate","seq_arp_octaves","seq_arp_gate","seq_arp_steps_mode",
    "seq_arp_retrigger","seq_arp_sync"];
  const pfx=[0,0,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,100,0,1,0]; // sensible defaults
  /* mock CC automation: 8 knob lanes (knob 0 seeded with a little curve) + focus */
  let ccFocus=-1;
  const ccLanes={0:[[0,40],[96,90],[192,60],[288,110]]};
  const CC_ASSIGN=[7,74,71,73,72,91,93,10];
  /* mock conductor: selected track (1) is the conductor of clip 0, all tracks set
   * as responders so the responder panel + grid badges preview on a plain browser. */
  const cond={trk:1,clip:0,lock:0,resp:Array.from({length:8},()=>({resp:1,oct:0,when:0}))};
  const KV={};
  function rebuild(){
    KV["overtake_dsp:rui_rev"]=String(rev);
    KV["overtake_dsp:rui_play"]=mockPlay+":"+phTick()+":120";
    KV["overtake_dsp:rui_sel"]=sel.t+":"+sel.c+":"+sel.lane;
    const isDrum=tracks[sel.t].pm===1;
    KV["overtake_dsp:rui_index"]=tracks.map((tk,t)=>{
      const has=Array.from({length:16},(_,c)=> (c===0 && ((t===0&&drum.some(l=>l.hits.length))||(t===1&&mel.length)))?1:0).join("");
      /* mock seeds route/chan on the track (0-3 Move, 4-7 Schwung; ch=track#) and
       * carries mute/solo so the header state + gear dropdown preview in a browser */
      return tk.pm+":"+tk.ac+":-1:0:"+has+":"+tk.route+":"+tk.chan+":"+(tk.mute?1:0)+":"+(tk.solo?1:0)+":"+(tk.slot||0);
    }).join(";");
    if(isDrum){
      KV["overtake_dsp:rui_clip"]="16:24:0:0";
      KV["overtake_dsp:rui_dlanes"]=drum.map((l,i)=>[l.note,(l.hits.length?1:0),0,0,8+(i%9),(i%4===0?2:0),24].join(",")).join(";");
      KV["overtake_dsp:rui_dnotes"]=drum.map((l,i)=>l.hits.length?i+"|"+l.hits.map(h=>h.tick+":"+h.vel+":"+h.gate).join(","):null)
                                 .filter(Boolean).join(";");
      KV["overtake_dsp:rui_notes"]="";
      delete KV["overtake_dsp:rui_ccmeta"]; delete KV["overtake_dsp:rui_cc"];
    } else {
      KV["overtake_dsp:rui_clip"]=clipLen+":24:"+clipLs+":"+clipDir;
      KV["overtake_dsp:rui_notes"]=mel.map(n=>n.tick+":"+n.pitch+":"+n.vel+":"+n.gate+";").join("");
      KV["overtake_dsp:rui_pfx"]=pfx.join(":");
      KV["overtake_dsp:rui_ccmeta"]=Array.from({length:8},(_,k)=>
        [ CC_ASSIGN[k], 0, (ccLanes[k]&&ccLanes[k].length?1:0), 255, 255, 0,0,0,0 ].join(",")).join(";");
      KV["overtake_dsp:rui_cc"]= ccFocus>=0 ? ccFocus+"|"+(ccLanes[ccFocus]||[]).map(p=>p[0]+":"+p[1]).join(",") : "";
      delete KV["overtake_dsp:rui_dlanes"]; delete KV["overtake_dsp:rui_dnotes"];
    }
    KV["overtake_dsp:rui_cond"]=cond.trk+":"+cond.clip+":"+cond.lock+
      cond.resp.map(r=>";"+r.resp+","+r.oct+","+r.when).join("");
  }
  const findM=(tk,pi)=>mel.findIndex(n=>n.tick===tk&&n.pitch===pi);
  function melOp(op,a){
    if(op==='a'){ const [tk,pi,ve=100,ga=24]=a; if(findM(tk,pi)<0) mel.push({tick:tk,pitch:pi,vel:ve,gate:ga}); }
    else if(op==='d'){ const i=findM(a[0],a[1]); if(i>=0) mel.splice(i,1); }
    else if(op==='m'){ const i=findM(a[0],a[1]); if(i>=0){ mel[i].tick=a[2]; mel[i].pitch=a[3]; } }
    else if(op==='r'){ const i=findM(a[0],a[1]); if(i>=0) mel[i].gate=a[2]; }
    else if(op==='v'){ const i=findM(a[0],a[1]); if(i>=0) mel[i].vel=a[2]; }
  }
  rebuild();
  let subs=[];
  const compSubs=[];          /* onComponentData listeners */
  const compKV={};            /* "<component>:<param>" -> value */
  const compSets=[];          /* every setParamAt, in order (smoke test reads it) */
  window.schwungRemote={
    _mock:true,
    getParam:k=>Promise.resolve(KV[k]!=null?KV[k]:""),
    setParam:(k,v)=>{
      let m;
      /* mixer wire keys (phase D) — plain KV store in the preview */
      if(/^(chain|move_fx):/.test(k)){ KV[k]=String(v); return; }
      /* transport start/stop — flip the preview playing state */
      if(/(^|:)transport$/.test(k)){ mockPlay=(String(v)==="play")?1:0; rev++; rebuild(); return; }
      /* CC automation (Task 1 keys) — keep the preview curve live */
      if(/_cc_focus$/.test(k)){ ccFocus=+v; rev++; rebuild(); return; }
      if(/_cc_auto_set$/.test(k)){ const a=String(v).split(/\s+/).map(Number); const kn=a[1],tk=a[2],vl=a[3];
        const L=ccLanes[kn]||(ccLanes[kn]=[]); const i=L.findIndex(p=>p[0]===tk); if(i>=0)L[i][1]=vl; else L.push([tk,vl]);
        L.sort((x,y)=>x[0]-y[0]); rev++; rebuild(); return; }
      if(/_cc_auto_clear_range$/.test(k)){ const a=String(v).split(/\s+/).map(Number); const kn=a[1],t1=a[2],t2=a[3];
        if(ccLanes[kn]) ccLanes[kn]=ccLanes[kn].filter(p=>p[0]<t1||p[0]>t2); rev++; rebuild(); return; }
      if(/_cc_auto_clear_k$/.test(k)){ const a=String(v).split(/\s+/).map(Number); ccLanes[a[1]]=[]; rev++; rebuild(); return; }
      /* conductor responder edits — mutate the mock cond so the panel reflects them */
      if(/_cond_lock$/.test(k)){ cond.lock=+v?1:0; rev++; rebuild(); return; }
      if((m=k.match(/_cond_(resp|when)$/))){ const a=String(v).split(/\s+/).map(Number);
        if(cond.resp[a[0]]) cond.resp[a[0]][m[1]]=a[1]?1:0; rev++; rebuild(); return; }
      if(/_cond_oct$/.test(k)){ const a=String(v).split(/\s+/).map(Number);
        if(cond.resp[a[0]]) cond.resp[a[0]].oct=Math.max(-4,Math.min(4,a[1]|0)); rev++; rebuild(); return; }
      /* track header gear / mute / solo (Change 1) — keep the preview header live */
      if((m=k.match(/t(\d+)_(mute|solo)$/))){ tracks[+m[1]][m[2]]=+v?1:0; rev++; rebuild(); return; }
      if((m=k.match(/t(\d+)_route$/))){ const r={schwung:0,move:1,external:2}[v];
        if(r!=null) tracks[+m[1]].route=r; rev++; rebuild(); return; }
      if((m=k.match(/t(\d+)_channel$/))){ tracks[+m[1]].chan=Math.max(1,Math.min(16,+v|0)); rev++; rebuild(); return; }
      if((m=k.match(/t(\d+)_slot$/))){ tracks[+m[1]].slot=Math.max(0,Math.min(window.CHAIN_SLOTS-1,+v|0)); rev++; rebuild(); return; }
      if((m=k.match(/t(\d+)_c(\d+)_ruisel$/))){ sel.t=+m[1]; sel.c=+m[2];
        sel.lane=(v&&v[0]&&v[0]!=='-')?+v:-1; rev++; rebuild(); return; }
      if((m=k.match(/t(\d+)_l(\d+)_(note_\w+)$/))){      // drum lane op
        const lane=+m[2], op=m[3], n=v.split(/\s+/).filter(Boolean).map(Number), tick=n[0];
        const arr=drum[lane].hits, i=arr.findIndex(h=>h.tick===tick);
        if(op==="note_toggle"){ if(i>=0)arr.splice(i,1); else arr.push({tick,vel:n[1]||100,gate:n[2]||24}); }
        else if(op==="note_add"){ if(i<0)arr.push({tick,vel:n[1]||100,gate:n[2]||24}); }
        else if(op==="note_del"){ if(i>=0)arr.splice(i,1); }
        else if(op==="note_vel"&&i>=0)arr[i].vel=n[1];
        else if(op==="note_resize"&&i>=0)arr[i].gate=n[1];
        rev++; rebuild(); return;
      }
      if((m=k.match(/t(\d+)_c(\d+)_pfx_set$/))){    // per-clip FX param
        const sp=v.indexOf(" "); const key=v.slice(0,sp), val=+v.slice(sp+1);
        const idx=PFXKEYS.indexOf(key); if(idx>=0){ pfx[idx]=val; rev++; rebuild(); } return;
      }
      if((m=k.match(/t(\d+)_c(\d+)_(note_\w+|notes_op|length|dir|loop_set)$/))){
        const op3=m[3];
        if(op3==="length"){ clipLen=Math.max(1,Math.min(256,+v|0)); }
        else if(op3==="loop_set"){ const pk=+v|0; clipLs=(pk>>16)&0xFFFF; clipLen=Math.max(1,pk&0xFFFF); }
        else if(op3==="dir"){ clipDir=+v|0; }
        else { const num=s=>s.split(/\s+/).filter(Boolean).map(Number);
          if(op3==="notes_op") v.split(";").forEach(seg=>{const t=seg.trim();if(!t)return;const p=t.split(/\s+/);melOp(p[0],p.slice(1).map(Number));});
          else melOp(op3.slice(5,6), num(v)); }    // note_add->'a', note_del->'d', etc.
        rev++; rebuild(); return;
      }
    },
    onParamChange:cb=>{subs.push(cb);},
    resubscribe:()=>{ KV["overtake_dsp:rui_play"]=mockPlay+":"+phTick()+":120";   /* keep preview tick live */
      subs.forEach(cb=>cb(Object.assign({},KV))); },
    /* status surface (pill/DIAG) — the mock is always "connected" */
    onStatus:cb=>{ try{cb({state:"open",toolId:"mock"});}catch(e){} },
    /* mixer surface (phase D): seed the wire namespace with plausible strips
     * so the Mixer view previews in a plain browser. Writes just land in KV. */
    subscribeMixer:()=>{ const m={};
      for(let t=0;t<8;t++){ m["chain:"+t+":volume"]="1"; m["chain:"+t+":pan"]="0.5";
        m["chain:"+t+":send_a"]="0"; m["chain:"+t+":send_b"]="0";
        m["chain:"+t+":muted"]="0"; m["chain:"+t+":soloed"]="0";
        if(t>=4){ m["chain:"+t+":synth_module"]=["obxd","dexed","",""][t-4]||"";
                  m["chain:"+t+":synth_name"]=["OB-Xd","Dexed","",""][t-4]||""; } }
      for(let b=1;b<=4;b++){ m["move_fx:"+b+":volume"]="1"; m["move_fx:"+b+":pan"]="0.5";
        m["move_fx:"+b+":send_a"]="0"; m["move_fx:"+b+":send_b"]="0";
        m["move_fx:"+b+":muted"]="0"; m["move_fx:"+b+":soloed"]="0"; }
      Object.assign(KV,m); subs.forEach(cb=>cb(Object.assign({},m))); },
    /* component surface (Sound view): one fake instrument on the Schwung-routed
     * tracks so the generated editor previews in a plain browser; every other
     * position answers "nothing loaded" (empty hierarchy + empty metadata). */
    requestComponent:(compSlot,component)=>{
      const fake = compSlot>=4 && component==="synth";
      const hier = fake ? {levels:{root:{label:"OB-Xd",
          params:[{key:"cutoff",label:"Cutoff"},{key:"resonance",label:"Resonance"}], knobs:[]}}} : {};
      const cps = fake ? [
          {key:"cutoff",name:"Cutoff",type:"float",min:0,max:1,step:0.01,default:0.5},
          {key:"resonance",name:"Resonance",type:"float",min:0,max:1,step:0.01,default:0.1}] : [];
      setTimeout(()=>{
        compSubs.forEach(cb=>cb({type:"hierarchy",slot:compSlot,component,data:hier}));
        compSubs.forEach(cb=>cb({type:"chain_params",slot:compSlot,component,data:cps}));
        if(!cps.length) return;
        const vals={};
        cps.forEach(p=>{ const wire=component+":"+p.key;
          if(compKV[wire]===undefined) compKV[wire]=String(p.default);
          vals[wire]=compKV[wire]; });
        subs.forEach(cb=>cb(vals,compSlot));
      },0);
    },
    onComponentData:cb=>{compSubs.push(cb);},
    setParamAt:(compSlot,key,value)=>{ compKV[key]=String(value);
      compSets.push({slot:compSlot,key,value:String(value)}); },
    /* preview-only introspection for the headless smoke test */
    _compSets:()=>compSets.slice(),
    _compKV:()=>Object.assign({},compKV)
  };
}

const R = window.schwungRemote;
const P = "overtake_dsp:";
const kv = {};
let M = null;
let lastRev = null, lastSelKey = null;
let dragging = false, suppressRefreshUntil = 0, fastUntil = 0;
/* smooth-playhead anchor: re-set on every accepted poll, extrapolated at BPM by rAF */
/* playhead estimator: phEst free-runs at BPM rate; phTgt* is the latest pushed
 * device position; phStep slews the estimate toward the target so bursty WiFi
 * delivery can't make the line jump. When the push carries a device-clock ms
 * (phTgtDev), the target is time-based on the DEVICE clock via phOff — the
 * running minimum of (receiveTime - devms), i.e. clock offset + best-case
 * latency — so a push delayed by a WiFi burst no longer drags the target
 * backward (the rubber-banding seen in round 2). phOff re-learns every 30s. */
let phEst = 0, phEstT = 0, phTgtTick = 0, phTgtT = 0, phTgtDev = 0,
    phOff = Infinity, phOffT = 0, phLastDev = 0, phPlaying = false, phBpm = 120, phRAF = 0;

/* device track colors (fixed Move palette by track index — mirrors
 * ui_constants.mjs TRACK_COLORS). Clips inherit the track color. */
const TRACK_COLORS=["#FF0000","#0000FF","#FFE000","#00FF00","#FF4DC4","#3FB6F0","#E6A521","#16C72E"];
const SCENE_LETTERS="ABCDEFGHIJKLMNOP";
const KEY_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const SCALE_NAMES=["Major","Minor","Dorian","Phrygian","Lydian","Mixolydian","Locrian",
                   "Harm Min","Mel Min","Pent Maj","Pent Min","Blues","Whole Tone","Dim"];
const trackColor=t=>TRACK_COLORS[t%TRACK_COLORS.length];
const hexA=(h,a)=>{const n=parseInt(h.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;};
/* clip-view accent = the selected track's color, so notes/velocity reflect the track */
const rollAccent=()=>(M?trackColor(M.sel.t):"#39d0c8");
/* clip / scene / global launch + ops (overtake_dsp: keys forwarded straight to DSP) */
function launchScene(c){ R.setParam(P+"launch_scene", String(c)); afterEdit(); }
function launchClip(t,c){ R.setParam(P+`t${t}_launch_clip`, String(c)); afterEdit(); }

/* ---------- parse flat snapshot fields ---------- */
/* CC automation meta: 8 knob groups joined by ";", each
 * "assign,type,hasdata,rest,curval,ls,len,tps,restps" (rest/cur 255 = unset). */
function parseCcMeta(s){ if(!s) return []; return s.split(";").map(g=>{
  const a=g.split(",").map(Number);
  return {assign:a[0],type:a[1],hasdata:!!a[2],rest:a[3],cur:a[4],ls:a[5],len:a[6],tps:a[7],restps:a[8]}; }); }
/* focused knob's breakpoints: "k|tick:val,tick:val,..." (empty when no focus) */
function parseCc(s){ if(!s) return null; const [k,pts]=s.split("|");
  return {k:+k, points:(pts||"").split(",").filter(Boolean).map(p=>{const [t,v]=p.split(":").map(Number); return {tick:t,val:v};})}; }
/* conductor/responder map: header "condTrk:condClip:lock" + 8 ";resp,oct,when"
 * groups (one per track). No conductor → "-1:-1:0" (no groups). */
function parseCond(s){ if(!s) return {trk:-1, resp:[]};
  const [hdr,...g]=s.split(";"); const [trk,clip,lock]=hdr.split(":").map(Number);
  return {trk,clip,lock,resp:g.map(x=>{const a=x.split(",").map(Number); return {resp:a[0],oct:a[1],when:a[2]};})}; }
function parseModel(){
  const get = k => kv[P+k];
  if (get("rui_sel") == null) return null;
  const pv = (get("rui_play")||"0:0:120").split(":").map(Number);   /* tolerate short/garbled forms → no NaN into the playhead */
  const pon = pv[0]||0, ptick = Number.isFinite(pv[1])?pv[1]:0, pbpm = Number.isFinite(pv[2])?pv[2]:120;
  /* 4th field (playing only): device-clock ms for ptick — lets the playhead
   * time-base corrections on the DEVICE clock so delivery latency is harmless. */
  const pdev = Number.isFinite(pv[3])&&pv[3]>0 ? pv[3] : 0;
  const [st,sc,sl]       = (get("rui_sel")||"0:0:-1").split(":").map(Number);
  const [cl,ct,cls,cd]   = (get("rui_clip")||"16:24:0:0").split(":").map(Number);
  const tracks = (get("rui_index")||"").split(";").map(seg=>{
    /* pm:ac:qc:pl:<16 bits>[:route:chan:mute:solo[:slot]]; tolerate old pm:ac:<bits> and
     * the pre-routing pm:ac:qc:pl:<bits> form (route/chan/mute/solo/slot all optional). */
    const p=seg.split(":");
    let pm,ac,qc,pl,bits,route,chan,mute,solo,slot;
    if(p.length>=5){ pm=+p[0]||0; ac=+p[1]||0; qc=(p[2]===""||p[2]===undefined)?-1:+p[2]; pl=+p[3]?1:0; bits=p[4]||"";
      route=p.length>5?+p[5]:undefined; chan=p.length>6?+p[6]:undefined;
      mute=p.length>7?(+p[7]?1:0):0; solo=p.length>8?(+p[8]?1:0):0;
      slot=p.length>9?+p[9]:undefined; }
    else { pm=+p[0]||0; ac=+p[1]||0; qc=-1; pl=0; bits=p[2]||""; mute=0; solo=0; }
    const has=[]; for(let i=0;i<16;i++) has.push(bits[i]==="1");
    return {pm,ac,qc,pl,has,route,chan,mute,solo,slot};
  });
  const notes = (get("rui_notes")||"").split(";").filter(Boolean).map(tok=>{
    const [tick,pitch,vel,gate]=tok.split(":").map(Number); return {tick,pitch,vel,gate};
  });
  /* drum data (present only when the selected track is in drum mode) */
  const dlanes = (get("rui_dlanes")||"").split(";").filter(Boolean).map(s=>{
    /* "note,has,mute,solo[,len,loop_start,tps]" — extra loop fields are optional
     * (newer DSP) so an old device still parses fine. */
    const a=s.split(",").map(Number);
    return {note:a[0],has:!!a[1],mute:!!a[2],solo:!!a[3],
            len:a.length>4?a[4]:undefined, ls:a.length>5?a[5]:undefined, tps:a.length>6?a[6]:undefined};
  });
  const dnotes = {};
  (get("rui_dnotes")||"").split(";").filter(Boolean).forEach(blk=>{
    const bar=blk.indexOf("|"); if(bar<0) return; const L=+blk.slice(0,bar);
    dnotes[L]=blk.slice(bar+1).split(",").filter(Boolean).map(h=>{
      const [tick,vel,gate]=h.split(":").map(Number); return {tick,vel,gate};
    });
  });
  const pfx=(get("rui_pfx")||"").split(":").filter(s=>s!=="").map(Number);
  /* globals: key:scale:swing:swingRes:launchQuant:scaleAware */
  const g=(get("rui_glob")||"0:1:0:0:0:0").split(":").map(Number);
  const glob={key:g[0]|0, scale:g[1]|0, swing:g[2]|0, swingRes:g[3]|0, quant:g[4]|0, scaleAware:!!g[5]};
  /* 12 pitch-class in-scale bits (absolute, key applied) */
  const sm=get("rui_scale")||"111111111111"; const scaleMask=[];
  for(let i=0;i<12;i++) scaleMask.push(sm[i]==="1");
  /* selected drum lane "len:tps:loop" (drum only) */
  const lr=get("rui_lane"); let laneInfo=null;
  if(lr){ const la=lr.split(":").map(Number); laneInfo={len:la[0]|0,tps:la[1]|0,ls:la[2]|0,dir:la[3]|0}; }
  /* per-step trig conditions for the step strip: melodic clip (rui_steps) or
   * selected drum lane (rui_dsteps). Map step-index → {iter,rand,ratch,nudge}. */
  const stepTrig={};
  const sel_pm=(tracks[st]&&tracks[st].pm)||0;
  const draw_src=(sel_pm===1?get("rui_dsteps"):get("rui_steps"))||"";
  draw_src.split(";").filter(Boolean).forEach(tok=>{
    const a=tok.split(":").map(Number); stepTrig[a[0]]={iter:a[1]|0,rand:a[2]|0,ratch:a[3]|0,nudge:a[4]|0};
  });
  const ccmeta=parseCcMeta(get("rui_ccmeta")||"");
  const cc=parseCc(get("rui_cc")||"");
  /* rui_trunc:1 when the DSP snapshot dropped notes/CC points at the 64KB budget
   * (dense clip) — drives a non-blocking "some notes hidden" badge. Absent/0 = clean. */
  const trunc = (+(get("rui_trunc")||0))?1:0;
  return {rev:+(get("rui_rev")||0), play:{on:pon,tick:ptick,bpm:pbpm,dev:pdev},
          sel:{t:st,c:sc,lane:sl}, clip:{len:cl,tps:ct,ls:cls,dir:cd}, tracks, notes,
          dlanes, dnotes, pfx, glob, scaleMask, laneInfo, stepTrig, ccmeta, cc, trunc,
          cond: parseCond(get("rui_cond")||"")};
}
const isDrum = ()=> M && M.tracks[M.sel.t] && M.tracks[M.sel.t].pm===1;

/* Schedule a reconcile ~130ms after an edit. Do NOT zero the suppress window
 * here: a poll that was already in flight BEFORE the edit can land in the
 * 130..250ms gap, and if the window were torn down it would clobber the
 * optimistic model with pre-edit data (the edit visibly reverts for a frame).
 * refresh(true) forces THIS reconcile to run past the window; applyParams still
 * rejects any snapshot whose rev hasn't caught up, so stale polls can't win. */
function pullSoon(){ setTimeout(()=>refresh(true), 130); }
/* Post-edit stale-snapshot rejection window. Snapshots with rev <= M.rev are
 * rejected inside it — that's ONLY late deliveries of pre-edit state (WiFi can
 * delay them ~0.5-1s; at 250ms they landed after the window and momentarily
 * wiped freshly added/dragged notes). Genuinely newer snapshots (rev bumped by
 * this or any device edit) pass instantly, so 1.2s costs nothing in sync
 * latency; it only delays acceptance of a legit rev RESET (module reload). */
function afterEdit(){ suppressRefreshUntil=now()+1200; fastUntil=now()+1400; }
/* ---------- refresh ---------- */
function refresh(force){
  if(dragging) return;
  if(!force && now()<suppressRefreshUntil) return;
  if(typeof R.resubscribe==="function"){ R.resubscribe(); return; }
  if(window.parent){ window.parent.postMessage({type:"subscribe"},"*"); }
  const keys=["rui_rev","rui_play","rui_sel","rui_clip","rui_glob","rui_scale","rui_index",
              "rui_notes","rui_pfx","rui_lane","rui_dlanes","rui_dnotes","rui_cond","rui_trunc"];
  Promise.all(keys.map(k=>R.getParam(P+k).then(v=>[P+k,v]).catch(()=>null)))
    .then(pairs=>{ const o={}; pairs.forEach(p=>{if(p&&p[1]!=null)o[p[0]]=p[1];}); applyParams(o); });
}
function now(){ return (window.performance&&performance.now)?performance.now():+new Date(); }

/* ---------- smooth playhead (client-side tempo extrapolation) ----------
 * The device only reports the playhead a few times/sec (each poll), so drawing it
 * straight from M.play.tick steps. Instead we anchor to the device tick+timestamp
 * on every poll (applyParams) and glide a lightweight DOM line at the known BPM
 * between polls — re-anchoring each poll auto-corrects drift and snaps cleanly on
 * stop / loop-jump / tempo change. Only the #playhead line moves per frame; the
 * roll is never redrawn here. The rAF loop runs ONLY while playing. */
function phStep(){
  const ph=document.getElementById("playhead");
  if(!ph){ phRAF=0; return; }
  if(!phPlaying || !M || cv.style.display==="none"){ ph.style.display="none"; phRAF=0; return; }
  /* Free-running local clock + slewed phase correction. The device clock rate
   * is known (BPM), so between pushes the line advances smoothly on its own;
   * each push only CORRECTS phase, eased over a few frames (wrap-aware, within
   * the device loop window [ls, ls+len)*tps that current_clip_tick wraps in).
   * A huge error (>1/4 window — seek/relaunch) snaps instead of easing. */
  const t=now(), rate=BEAT_TICKS*phBpm/60000;                         /* ticks/ms */
  const [lsT,leT]=loopTicks(); const win=leT-lsT;
  let est=phEst + (t-phEstT)*rate;
  /* target: device-clock-based when the push carried devms (delivery latency
   * then cancels out entirely); receipt-time fallback otherwise. */
  let tgt=(phTgtDev>0&&Number.isFinite(phOff))
        ? phTgtTick + ((t-phOff)-phTgtDev)*rate
        : phTgtTick + (t-phTgtT)*rate;
  if(win>0){
    const wrap=v=>lsT+(((v-lsT)%win)+win)%win;
    est=wrap(est); tgt=wrap(tgt);
    let err=tgt-est; if(err>win/2) err-=win; else if(err<-win/2) err+=win;
    if(Math.abs(err)>win/4) est=tgt;                                  /* seek/relaunch: snap */
    else{
      /* slew-capped correction: at most ±15% tempo trim, so catching up reads
       * as a barely-perceptible rate change, never a visible surge/stall. */
      const maxStep=rate*(t-phEstT)*0.15;
      const corr=err*0.12;
      est=wrap(est+Math.max(-maxStep,Math.min(maxStep,corr)));
    }
  } else est=tgt;
  phEst=est; phEstT=t;
  const x=xOfTick(est);
  if(!Number.isFinite(x)||x<GUTTER||x>VW){ ph.style.display="none"; }
  else { ph.style.display="block"; ph.style.transform="translateX("+x+"px)"; }
  phRAF=requestAnimationFrame(phStep);
}
function startPlayhead(){ if(!phRAF) phRAF=requestAnimationFrame(phStep); }
function stopPlayhead(){ if(phRAF){ cancelAnimationFrame(phRAF); phRAF=0; }
  const ph=document.getElementById("playhead"); if(ph) ph.style.display="none"; }

/* ---------- connection pill (C5) + DIAG overlay (C1) ----------
 * The pill is the user-facing truth about the link: Live (socket open, a
 * dAVEBOx session answering), Reconnecting (socket down, transport retrying),
 * or "dAVEBOx not running" — a REAL state under SA: the session exited while
 * the manager stayed up. DIAG (` / ~ toggles, persisted) is the instrument
 * every perf claim in this arc is measured with, instead of argued about. */
let connState={state:"closed",toolId:null};
let diagPushCount=0, diagPushAt=0, diagPushBytes=0, diagPushKeys=0, diagWinCount=0, diagWinAt=0, diagRate=0;
let diagFull=0, diagPartial=0;
function pillRender(){
  const el=document.getElementById("connpill"); if(!el) return;
  let cls="", txt="";
  if(connState.state!=="open"){ cls="recon"; txt="reconnecting…"; }
  else if(connState.toolId===""){ cls="notool"; txt="dAVEBOx not running"; }
  else if(connState.toolId===null){ cls="recon"; txt="connecting…"; }
  else { cls="live"; txt="● live"; }
  el.className="badge pill "+cls; el.textContent=txt;
}
if(R && typeof R.onStatus==="function"){
  R.onStatus(s=>{ connState=Object.assign({},s); pillRender(); });
}
pillRender();

/* every push feeds the counters; JSON size only measured while DIAG is open */
if(R && typeof R.onParamChange==="function"){
  R.onParamChange(params=>{
    diagPushCount++; diagPushAt=now();
    let n=0; for(const k in params) n++;
    diagPushKeys=n;
    /* full snapshots carry the whole rui_* family; deltas a handful */
    if(n>=10) diagFull++; else diagPartial++;
    diagWinCount++;
    if(now()-diagWinAt>2000){ diagRate=diagWinCount/((now()-diagWinAt)/1000); diagWinCount=0; diagWinAt=now(); }
    if(diagOpen) diagPushBytes=JSON.stringify(params).length;
  });
}

let diagOpen=false, diagTimer=0;
function diagRender(){
  const el=document.getElementById("diag"); if(!el) return;
  const age=diagPushAt?Math.round(now()-diagPushAt):-1;
  const devRev=kv[P+"rui_rev"]!==undefined?kv[P+"rui_rev"]:"?";
  const appRev=(M&&M.rev!==undefined)?M.rev:"?";
  const sup=Math.max(0,Math.round(suppressRefreshUntil-now()));
  const off=Number.isFinite(phOff)?Math.round(phOff)+"ms":"—";
  el.innerHTML=
    "<b>ws</b> "+connState.state+"  <b>tool</b> "+(connState.toolId==null?"?":(connState.toolId||"none"))+"\n"+
    "<b>push</b> #"+diagPushCount+"  age "+(age<0?"—":age+"ms")+"  "+diagRate.toFixed(1)+"/s\n"+
    "<b>last</b> "+diagPushKeys+" keys  "+(diagPushBytes?diagPushBytes+" B":"(open to measure)")+"\n"+
    "<b>delta/full</b> "+diagPartial+"/"+diagFull+"\n"+
    "<b>rev</b> dev "+devRev+"  applied "+appRev+"\n"+
    "<b>suppress</b> "+(sup>0?sup+"ms":"—")+"  <b>ph off</b> "+off+"\n"+
    "<b>trunc</b> "+(kv[P+"rui_trunc"]==="1"?"YES":"no")+"  <b>playing</b> "+(phPlaying?"yes":"no");
}
function diagSet(open){
  diagOpen=open;
  const el=document.getElementById("diag"); if(!el) return;
  el.style.display=open?"block":"none";
  try{ localStorage.setItem("dbx_diag",open?"1":"0"); }catch(e){}
  if(open && !diagTimer){ diagTimer=setInterval(diagRender,500); diagRender(); }
  if(!open && diagTimer){ clearInterval(diagTimer); diagTimer=0; }
}
window.addEventListener("keydown",e=>{
  if((e.key==="`"||e.key==="~") && !e.target.closest("input,textarea,select")){
    e.preventDefault(); diagSet(!diagOpen);
  }
});
try{ if(localStorage.getItem("dbx_diag")==="1") diagSet(true); }catch(e){}
