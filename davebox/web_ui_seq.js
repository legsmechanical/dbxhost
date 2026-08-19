/* dAVEBOx remote UI — rendering + interaction (session grid, piano roll, drum
 * lanes, step/velocity/automation editors, per-clip FX, conductor, inspector,
 * menus, zoom, pointer engine) and the boot sequence at the bottom.
 *
 * Loaded AFTER web_ui_core.js; see that file's header for the IIFE note. */

/* named note-value labels for the clock-synced FX params (C-2). Verified against
 * the DSP value order (seq8_set_param.c) — see the worklog VERIFIED WIRING SPEC. */
const DELAY_TIME_LAB=["1/64","1/64D","1/32","1/16T","1/32D","1/16","1/8T","1/16D","1/8","1/4T",
                      "1/8D","1/4","1/4D","1/2","1/2D","1/1","1/1D"];               // 17, default idx10
const DELAY_GATEFB_LAB=["Off","1/64","1/32","1/16T","1/16","1/8T","1/8","1/4T","1/4","1/2","1bar"]; // 11
const SEQ_ARP_RATE_LAB=["1/32","1/16","1/16T","1/8","1/8T","1/4","1/4T","1/2","1/2T","1/1"];        // 10, default idx1
const SEQ_ARP_STYLE_LAB=["Off","Up","Dn","U-D","D-U","Cnv","Div","Ord","Rnd","RnO"];
const FX_GROUP_TITLE={"NOTE FX":"Note FX","HARMZ":"Harmony","MIDI DLY":"MIDI Delay","SEQ ARP":"Seq / Arp"};
/* per-clip FX descriptors — MUST match the DSP rui_pfx value order (29 entries) */
const PFX=[
 {g:"NOTE FX",key:"noteFX_octave",l:"Octave",lo:-4,hi:4},
 {g:"NOTE FX",key:"noteFX_offset",l:"Offset",lo:-24,hi:24},
 {g:"NOTE FX",key:"noteFX_gate",l:"Gate %",lo:0,hi:400},
 {g:"NOTE FX",key:"noteFX_velocity",l:"Vel ±",lo:-127,hi:127},
 {g:"NOTE FX",key:"quantize",l:"Quantize",lo:0,hi:100},
 {g:"NOTE FX",key:"noteFX_random",l:"Random",lo:0,hi:24},
 {g:"NOTE FX",key:"noteFX_random_mode",l:"Rnd Mode",lo:0,hi:2,opts:["Uniform","Gauss","Walk"]},
 {g:"NOTE FX",key:"noteFX_length_mode",l:"Len",lo:0,hi:8,opts:["--",".25",".5",".75","1","2","4","8","16"]},
 {g:"HARMZ",key:"harm_octaver",l:"Octaver",lo:-4,hi:4},
 {g:"HARMZ",key:"harm_interval1",l:"Intv 1",lo:-24,hi:24},
 {g:"HARMZ",key:"harm_interval2",l:"Intv 2",lo:-24,hi:24},
 {g:"HARMZ",key:"harm_interval3",l:"Intv 3",lo:-24,hi:24},
 {g:"MIDI DLY",key:"delay_time",l:"Time",lo:0,hi:16,opts:DELAY_TIME_LAB},
 {g:"MIDI DLY",key:"delay_level",l:"Level",lo:0,hi:127},
 {g:"MIDI DLY",key:"delay_repeats",l:"Repeats",lo:0,hi:16},
 {g:"MIDI DLY",key:"delay_vel_fb",l:"Vel FB",lo:-127,hi:127},
 {g:"MIDI DLY",key:"delay_pitch_fb",l:"Pitch FB",lo:-24,hi:24},
 {g:"MIDI DLY",key:"delay_pitch_random",l:"Pitch Rnd",lo:0,hi:24},
 {g:"MIDI DLY",key:"delay_pitch_random_mode",l:"PRnd Mode",lo:0,hi:2,opts:["Uniform","Gauss","Walk"]},
 {g:"MIDI DLY",key:"delay_gate_fb",l:"Gate FB",lo:0,hi:10,opts:DELAY_GATEFB_LAB},
 {g:"MIDI DLY",key:"delay_clock_fb",l:"Clock FB",lo:-100,hi:100},
 {g:"MIDI DLY",key:"delay_retrig",l:"Retrig",lo:0,hi:1,opts:["Off","On"]},
 {g:"SEQ ARP",key:"seq_arp_style",l:"Style",lo:0,hi:9,opts:["Off","Up","Dn","U-D","D-U","Cnv","Div","Ord","Rnd","RnO"]},
 {g:"SEQ ARP",key:"seq_arp_rate",l:"Rate",lo:0,hi:9,opts:SEQ_ARP_RATE_LAB},
 {g:"SEQ ARP",key:"seq_arp_octaves",l:"Octaves",lo:-4,hi:4},
 {g:"SEQ ARP",key:"seq_arp_gate",l:"Gate %",lo:1,hi:200},
 {g:"SEQ ARP",key:"seq_arp_steps_mode",l:"Steps",lo:0,hi:2,opts:["Off","Mute","Skip"]},
 {g:"SEQ ARP",key:"seq_arp_retrigger",l:"Retrig",lo:0,hi:1,opts:["Off","On"]},
 {g:"SEQ ARP",key:"seq_arp_sync",l:"Sync",lo:0,hi:1,opts:["Free","Sync"]},
];

/* ---------- chrome + selector ---------- */
function renderChrome(){
  const tr=document.getElementById("transport");
  tr.textContent=M.play.on?"▶ playing":"■ stopped"; tr.classList.toggle("play",!!M.play.on);
  /* play/stop button shows the ACTION (▶ start when stopped, ■ stop when playing) */
  const xp=document.getElementById("xport");
  if(xp){ xp.textContent=M.play.on?"■":"▶"; xp.classList.toggle("play",!!M.play.on);
    xp.title=M.play.on?"Stop transport":"Start transport"; }
  /* keep the BPM input live without clobbering an in-progress edit */
  const bi=document.getElementById("bpmIn"); if(bi && document.activeElement!==bi) bi.value=M.play.bpm|0;
  const lane=(isDrum()&&M.sel.lane>=0)?(" · lane "+M.sel.lane):"";
  document.getElementById("clipname").textContent=(isDrum()?"D":"M")+(M.sel.t+1)+" · "+SCENE_LETTERS[M.sel.c]+lane;
  /* truncation badge: the DSP snapshot dropped notes/CC at the 64KB budget. */
  const tb=document.getElementById("trunc"); if(tb) tb.style.display=(M&&M.trunc)?"":"none";
}
/* rebuild the side panel (clip controls + FX). Skipped while a side input is
 * focused so polls don't clobber in-progress typing. */
function renderSidePanels(){
  if(document.activeElement && document.activeElement.closest && document.activeElement.closest("#side,#editbar,#globalpop")) return;
  renderInspector(); renderNoteEdit(); renderStepEdit(); renderGlobals();
}
/* ---------- slider control (wide-range continuous params; touch-friendly) ----------
 * sliderRow() builds a labelled full-width slider with a tappable value field + ±
 * nudge; bindSlider() wires it (drag emits throttled, release/type commits). */
function sliderRow(id,label,v,lo,hi){ const bip=lo<0&&hi>0;
  return `<div class="slrow" data-sl="${id}">`+
    `<div class="sllab"><span>${label}</span>`+
      `<input class="slval" id="${id}_v" type="number" min="${lo}" max="${hi}" value="${v}"></div>`+
    `<div class="slwrap"><button class="sm nudge" id="${id}_dn">−</button>`+
      `<input id="${id}_r" type="range" class="${bip?"bip":""}" min="${lo}" max="${hi}" value="${v}">`+
      `<button class="sm nudge" id="${id}_up">+</button></div></div>`; }
function bindSlider(root,id,lo,hi,apply){
  const r=root.querySelector("#"+id+"_r"), nv=root.querySelector("#"+id+"_v"); if(!r||!nv) return;
  const clamp=v=>Math.max(lo,Math.min(hi,(v|0))), show=v=>{ r.value=v; nv.value=v; };
  let t=0;
  r.oninput=e=>{ const v=clamp(+e.target.value); show(v); const n=now(); if(n-t>55){ t=n; apply(v); } };
  r.onchange=e=>{ const v=clamp(+e.target.value); show(v); apply(v); };
  nv.onchange=e=>{ const v=clamp(+e.target.value); show(v); apply(v); };
  root.querySelector("#"+id+"_up").onclick=()=>{ const v=clamp(+r.value)+1; show(v); apply(v); };
  root.querySelector("#"+id+"_dn").onclick=()=>{ const v=clamp(+r.value)-1; show(v); apply(v); };
}
const isWideFX=d=>!d.opts && (d.hi-d.lo)>=60;   /* which FX params get a slider */
/* ---------- accordion inspector (#inspector) ----------
 * Builds collapsible sections into #inspector, then delegates to the existing
 * populators (renderSide/renderClipOps/renderFX/renderDrumPanel) which target
 * stable container IDs nested inside the section bodies, plus the new *Util
 * builders for the verified UI-only feature buttons. Open/closed state per
 * section + FX sub-group persists in localStorage. */
let secOpen={}, subOpen={};
try{ secOpen=JSON.parse(localStorage.getItem("dbx_secOpen")||"{}"); }catch(e){}
try{ subOpen=JSON.parse(localStorage.getItem("dbx_subOpen")||"{}"); }catch(e){}
function saveSec(){ try{localStorage.setItem("dbx_secOpen",JSON.stringify(secOpen));}catch(e){} }
function saveSub(){ try{localStorage.setItem("dbx_subOpen",JSON.stringify(subOpen));}catch(e){} }
const secIsOpen=(id,def)=> id in secOpen ? secOpen[id] : def;
const subIsOpen=(id,def)=> id in subOpen ? subOpen[id] : def;
function secEl(id,title,sum,bodyHTML,defOpen){
  const open=secIsOpen(id,defOpen);
  return `<div class="sec${open?" open":""}" data-sec="${id}">`+
    `<div class="sec-h"><span class="tw">▶</span><span class="title">${title}</span>`+
    `<span class="sum">${sum||""}</span></div><div class="sec-b">${bodyHTML}</div></div>`;
}
function subEl(id,title,sum,bodyHTML,defOpen){
  const open=subIsOpen(id,defOpen);
  return `<div class="sub${open?" open":""}" data-sub="${id}">`+
    `<div class="sub-h"><span class="tw">▶</span><span>${title}</span><span class="sum">${sum||""}</span></div>`+
    `<div class="sub-b">${bodyHTML}</div></div>`;
}
function clipSum(){ const ri=RES_TPS.indexOf(M.clip.tps);
  return `${M.clip.len} stp · ${RES_LAB[ri]||"?"} · ${["Fwd","Bwd","PP-F","PP-B"][M.clip.dir]||""}`; }
function laneSum(){ if(M.sel.lane<0||!M.laneInfo) return "select a lane";
  const ln=M.dlanes[M.sel.lane]; return `${ln?noteName(ln.note):"L"+M.sel.lane} · ${M.laneInfo.len} stp`; }
function fxSum(){ const drum=isDrum();
  return drum ? (allLanes?"all lanes":("lane "+M.sel.lane)) : ""; }
/* ---------- conductor responder editor (shown when the selected track IS the
 * conductor). Edits the conductor's clip M.cond.clip: a Lock toggle + one row per
 * eligible responder track (not the conductor, not a drum track): responder on/off,
 * an octave stepper (-4..+4), and a Now/Next toggle. Writes go to per-track
 * tN_cC_cond_* keys; the model is mutated optimistically. The poll re-render is
 * guarded at the #side level (renderSidePanels) so in-progress edits aren't lost. */
function condEligible(ti){ return M.cond && M.cond.trk>=0 && ti!==M.cond.trk && M.tracks[ti] && M.tracks[ti].pm!==1; }
function condSum(){ if(!M.cond||M.cond.trk<0) return ""; let n=0;
  for(let ti=0;ti<M.tracks.length;ti++){ const r=M.cond.resp&&M.cond.resp[ti];
    if(condEligible(ti) && r && r.resp) n++; }
  return n+" resp"+(M.cond.lock?" · lock":""); }
function renderCondPanel(){
  const el=document.getElementById("condpanel"); if(!el||!M.cond||M.cond.trk<0) return;
  if(!M.cond.resp) M.cond.resp=[];
  const ct=M.cond.trk, cc=M.cond.clip, locked=!!M.cond.lock;
  let html=`<div class="kv"><span>Lock responders</span><span>`+
    `<button id="cdLock" class="sm${locked?" on":""}">${locked?"Locked":"Unlocked"}</button></span></div>`+
    `<div class="hint">Responder tracks follow this conductor clip, transposed per row.</div>`;
  for(let ti=0;ti<M.tracks.length;ti++){
    if(!condEligible(ti)) continue;
    const r=(M.cond.resp&&M.cond.resp[ti])||{resp:0,oct:0,when:0};
    html+=`<div class="kv" data-ti="${ti}"><span>${(M.tracks[ti].pm===2?"C":"M")+(ti+1)}</span><span class="stp">`+
      `<button class="sm cdResp${r.resp?" on":""}">${r.resp?"On":"Off"}</button>`+
      `<button class="sm cdOctD" title="octave −">−</button>`+
      `<input class="cdOct" type="number" min="-4" max="4" value="${r.oct|0}" style="width:46px;text-align:right">`+
      `<button class="sm cdOctU" title="octave +">+</button>`+
      `<button class="sm cdWhen${r.when?" on":""}" title="apply Now or at Next loop">${r.when?"Now":"Next"}</button>`+
      `</span></div>`;
  }
  el.innerHTML=html;
  const wr=(suffix,val)=>{ R.setParam(P+`t${ct}_c${cc}_cond_${suffix}`,val); afterEdit(); pullSoon(); };
  el.querySelector("#cdLock").onclick=()=>{
    if(document.activeElement && el.contains(document.activeElement)) return; // protect an in-progress octave edit
    const nl=!M.cond.lock; M.cond.lock=nl?1:0;
    wr("lock",nl?"1":"0"); renderCondPanel(); };
  el.querySelectorAll(".kv[data-ti]").forEach(row=>{
    const ti=+row.dataset.ti, r=(M.cond.resp&&M.cond.resp[ti])||(M.cond.resp[ti]={resp:0,oct:0,when:0});
    const oi=row.querySelector(".cdOct");
    const setOct=v=>{ v=Math.max(-4,Math.min(4,v|0)); r.oct=v; oi.value=v; wr("oct",`${ti} ${v}`); };
    row.querySelector(".cdResp").onclick=e=>{ const on=!r.resp; r.resp=on?1:0;
      e.currentTarget.classList.toggle("on",on); e.currentTarget.textContent=on?"On":"Off"; wr("resp",`${ti} ${on?1:0}`); };
    row.querySelector(".cdOctD").onclick=()=>setOct((r.oct|0)-1);
    row.querySelector(".cdOctU").onclick=()=>setOct((r.oct|0)+1);
    oi.onchange=e=>setOct(+e.target.value);
    row.querySelector(".cdWhen").onclick=e=>{ const nw=!r.when; r.when=nw?1:0;
      e.currentTarget.classList.toggle("on",nw); e.currentTarget.textContent=nw?"Now":"Next"; wr("when",`${ti} ${nw?1:0}`); };
  });
}
function renderInspector(){
  const insp=document.getElementById("inspector"); if(!insp||!M) return;
  const drum=isDrum(), laneSel=drum && M.sel.lane>=0;
  const showCond = M.cond && M.cond.trk>=0 && M.cond.trk===M.sel.t;
  let html="";
  if(showCond) html+=secEl("cond","Conductor",condSum(),`<div id="condpanel"></div>`,true);
  if(drum){
    html+=secEl("lane","Lane",laneSum(),`<div id="drumpanel"></div><div id="laneUtil"></div>`,true);
    if(laneSel) html+=secEl("fx","FX",fxSum(),`<div id="fxpanel"></div><div id="fxUtil"></div>`,true);
    html+=secEl("clip","Drum clip","",`<div id="clipops"></div>`,false);
  } else {
    html+=secEl("clip","Clip",clipSum(),`<div id="clipinfo"></div><div id="clipUtil"></div><div id="clipops"></div>`,true);
    html+=secEl("fx","FX",fxSum(),`<div id="fxpanel"></div><div id="fxUtil"></div>`,true);
  }
  insp.innerHTML=html;
  insp.querySelectorAll(".sec-h").forEach(h=>h.onclick=()=>{
    const s=h.parentNode,id=s.dataset.sec,open=!s.classList.contains("open");
    s.classList.toggle("open",open); secOpen[id]=open; saveSec(); });
  if(showCond) renderCondPanel();
  if(drum){
    renderDrumPanel(); renderLaneUtil();
    if(laneSel){ renderFX(); renderFXUtil(); }
    renderClipOps();
  } else {
    renderSide(); renderClipUtil(); renderClipOps(); renderFX(); renderFXUtil();
  }
}
/* per-clip / per-lane FX reset (verified safe keys). */
function renderFXUtil(){
  const el=document.getElementById("fxUtil"); if(!el) return;
  const drum=isDrum(), laneSel=drum && M.sel.lane>=0;
  if(drum && !laneSel){ el.innerHTML=""; return; }
  el.innerHTML=`<div class="btnrow"><button class="sm" id="fxReset">Reset FX</button></div>`;
  el.querySelector("#fxReset").onclick=()=>{
    if(drum){ if(allLanes){ for(let l=0;l<M.dlanes.length;l++) R.setParam(P+`t${M.sel.t}_l${l}_pfx_set`,"pfx_reset 1"); }
      else R.setParam(P+`t${M.sel.t}_l${M.sel.lane}_pfx_set`,"pfx_reset 1"); }
    else R.setParam(P+`t${M.sel.t}_c${M.sel.c}_pfx_set`,"pfx_reset 1");
    afterEdit(); pullSoon(); };
}
/* global single-level undo/redo (drum + melodic separate DSP queues, drum first). */
function doUndo(){ R.setParam(P+"undo_restore",""); afterEdit(); pullSoon(); }
function doRedo(){ R.setParam(P+"redo_restore",""); afterEdit(); pullSoon(); }
/* Melodic clip transforms (per-TRACK keys → act on the track's ACTIVE clip only).
 * Gated on active==selected so a transform can't mutate the wrong (playing) clip. */
function renderClipUtil(){
  const el=document.getElementById("clipUtil"); if(!el) return;
  const t=M.sel.t,c=M.sel.c, activeSel=!!(M.tracks[t]&&M.tracks[t].ac===c);
  const dis=activeSel?"":" disabled";
  const tip=activeSel?"":' title="Launch this clip (make it active) to transform it"';
  el.innerHTML=
    `<div class="hint"><b>Transform</b>${activeSel?"":" — launch this clip to enable"}</div>`+
    `<div class="btnrow"${tip}>`+
      `<button class="sm" id="trStrU"${dis} title="Beat-stretch ×2 (expand)">×2</button>`+
      `<button class="sm" id="trStrD"${dis} title="Beat-stretch ÷2 (compress)">÷2</button>`+
      `<button class="sm" id="trShL"${dis} title="Clock-shift left">⟸</button>`+
      `<button class="sm" id="trShR"${dis} title="Clock-shift right">⟹</button>`+
      `<button class="sm" id="trNuL"${dis} title="Nudge left">◀</button>`+
      `<button class="sm" id="trNuR"${dis} title="Nudge right">▶</button>`+
      `<button class="sm" id="trLg"${dis} title="Legato">Legato</button></div>`+
    `<div class="hint"><b>Bake FX → notes</b> (undoable)</div>`+
    `<div class="btnrow"><label style="flex:0 0 auto;font-size:12px">×<select id="bkN" style="width:auto;padding:5px 5px"><option>1</option><option>2</option><option>4</option></select></label>`+
      `<button class="sm" id="bkWrap" title="wrap MIDI-delay tails past the clip end back to the start">Wrap</button>`+
      `<button class="sm" id="bkGo" title="render the live FX chain into actual notes (clears FX; undoable)">Bake</button></div>`;
  el.querySelector("#bkWrap").onclick=e=>e.currentTarget.classList.toggle("on");
  el.querySelector("#bkGo").onclick=()=>{ const n=+el.querySelector("#bkN").value||1, w=el.querySelector("#bkWrap").classList.contains("on")?1:0;
    R.setParam(P+"bake",`${t} ${c} 0 ${n} 0 ${w}`); afterEdit(); pullSoon(); };
  if(activeSel){ const tr=(op,v)=>{ R.setParam(P+`t${t}_${op}`,v); afterEdit(); pullSoon(); };
    el.querySelector("#trStrU").onclick=()=>tr("beat_stretch","1");
    el.querySelector("#trStrD").onclick=()=>tr("beat_stretch","0");
    el.querySelector("#trShL").onclick=()=>tr("clock_shift","0");
    el.querySelector("#trShR").onclick=()=>tr("clock_shift","1");
    el.querySelector("#trNuL").onclick=()=>tr("nudge","-1");
    el.querySelector("#trNuR").onclick=()=>tr("nudge","1");
    el.querySelector("#trLg").onclick=()=>tr("lgto_apply",""); }
}
/* Drum lane utilities: transforms (per-lane = SAFE; all_lanes_* atomic when scope=All),
 * Euclidean fill, lane Clear/hard-Reset, All-Lanes double-fill, undo/redo. */
const dleu={};   /* per (track:lane) running euclid count for symmetric-diff stamping */
function renderLaneUtil(){
  const el=document.getElementById("laneUtil"); if(!el) return;
  if(M.sel.lane<0){ el.innerHTML=""; return; }
  const t=M.sel.t,lane=M.sel.lane,key=t+":"+lane;
  if(!(key in dleu)) dleu[key]=(M.dnotes[lane]||[]).length;   /* seed from current hit count */
  const eMax=M.laneInfo?M.laneInfo.len:64;
  el.innerHTML=
    `<div class="hint"><b>Transform</b>${allLanes?" · all lanes":""}</div>`+
    `<div class="btnrow">`+
      `<button class="sm" id="laStrU" title="Beat-stretch ×2">×2</button>`+
      `<button class="sm" id="laStrD" title="÷2">÷2</button>`+
      `<button class="sm" id="laShL" title="Clock-shift left">⟸</button>`+
      `<button class="sm" id="laShR" title="right">⟹</button>`+
      `<button class="sm" id="laNuL" title="Nudge left">◀</button>`+
      `<button class="sm" id="laNuR" title="right">▶</button>`+
      (allLanes?"":`<button class="sm" id="laLg" title="Legato">Legato</button>`)+`</div>`+
    `<div class="kv"><span>Euclidean</span><span class="stp">`+
      `<input id="euN" type="number" min="0" max="${eMax}" value="${dleu[key]}">`+
      `<button class="sm" id="euApply">Fill</button></span></div>`+
    (allLanes?`<div class="btnrow"><button class="sm" id="laDbl">Double-fill (all lanes)</button></div>`:"")+
    `<div class="hint"><b>Bake FX → notes</b> (undoable)</div>`+
    `<div class="btnrow"><label style="flex:0 0 auto;font-size:12px">×<select id="bkN" style="width:auto;padding:5px 5px"><option>1</option><option>2</option><option>4</option></select></label>`+
      `<button class="sm" id="bkWrap" title="wrap delay tails past the clip end back to the start">Wrap</button>`+
      `<button class="sm" id="bkLane">Lane</button>`+
      `<button class="sm" id="bkAll" title="bake all 32 lanes">All lanes</button></div>`+
    `<div class="btnrow"><button class="sm" id="laClr">Clear</button>`+
      `<button class="sm danger" id="laRst">Reset</button></div>`;
  el.querySelector("#bkWrap").onclick=e=>e.currentTarget.classList.toggle("on");
  const bkArgs=()=>({n:+el.querySelector("#bkN").value||1, w:el.querySelector("#bkWrap").classList.contains("on")?1:0});
  el.querySelector("#bkLane").onclick=()=>{ const a=bkArgs(); R.setParam(P+"bake",`${t} ${M.sel.c} 1 ${a.n} ${lane} ${a.w}`); afterEdit(); pullSoon(); };
  el.querySelector("#bkAll").onclick=()=>{ const a=bkArgs(); R.setParam(P+"bake",`${t} ${M.sel.c} 2 ${a.n} 0 ${a.w}`); afterEdit(); pullSoon(); };
  const lt=(suffix,val,allKey)=>{ if(allLanes){ if(allKey) R.setParam(P+`t${t}_${allKey}`,val);
      else for(let l=0;l<M.dlanes.length;l++) R.setParam(P+`t${t}_l${l}_${suffix}`,val); }
    else R.setParam(P+`t${t}_l${lane}_${suffix}`,val); afterEdit(); pullSoon(); };
  el.querySelector("#laStrU").onclick=()=>lt("beat_stretch","1","all_lanes_beat_stretch");
  el.querySelector("#laStrD").onclick=()=>lt("beat_stretch","0","all_lanes_beat_stretch");
  el.querySelector("#laShL").onclick=()=>lt("clock_shift","0","all_lanes_clock_shift");
  el.querySelector("#laShR").onclick=()=>lt("clock_shift","1","all_lanes_clock_shift");
  el.querySelector("#laNuL").onclick=()=>lt("nudge","-1","all_lanes_nudge");
  el.querySelector("#laNuR").onclick=()=>lt("nudge","1","all_lanes_nudge");
  const lg=el.querySelector("#laLg"); if(lg) lg.onclick=()=>lt("lgto_apply","",null);   /* no all-lanes legato */
  el.querySelector("#euApply").onclick=()=>{ const n=Math.max(0,Math.min(eMax,+el.querySelector("#euN").value|0));
    const prev=dleu[key]||0; if(prev===n) return;
    R.setParam(P+`t${t}_l${lane}_euclid_stamp`,`${prev} ${n} 100`); dleu[key]=n; afterEdit(); pullSoon(); };
  const db=el.querySelector("#laDbl"); if(db) db.onclick=()=>{ R.setParam(P+`t${t}_all_lanes_double_fill`,""); afterEdit(); pullSoon(); };
  el.querySelector("#laClr").onclick=()=>{ R.setParam(P+`t${t}_l${lane}_clear`,""); afterEdit(); pullSoon(); };
  el.querySelector("#laRst").onclick=()=>{ R.setParam(P+`t${t}_l${lane}_hard_reset`,""); afterEdit(); pullSoon(); };
}
/* ---------- selected-note numeric editor (melodic) ---------- */
let selNote=null;   /* {tick,pitch} of the selected melodic note (or null) */
let selDrum=null;   /* {lane,tick} of the selected drum hit (or null) */
function findSelNote(){ if(!selNote||!M||isDrum()) return -1;
  return M.notes.findIndex(n=>n.tick===selNote.tick&&n.pitch===selNote.pitch); }
function ebNum(lbl,id,val,min,max){
  return `<label>${lbl} <input type="number" id="${id}" value="${val}" min="${min}" max="${max}" step="1"></label>`;
}
/* multi-note editor (Select tool): NOTE props only (vel/len/move/octave/delete) —
 * never step props (iteration/probability/ratchet stay per-step). */
function renderMultiEdit(el){ const notes=selectedNotes(), n=notes.length;
  if(!n){ el.innerHTML=`<span class="eb-empty">Drag a box to select notes</span>`; return; }
  el.innerHTML=
    `<span class="et">▦ ${n} note${n===1?"":"s"}</span>`+
    `<label>Vel <button class="sm" id="meVD" title="velocity −5 (relative, keeps balance)">−</button>`+
      `<button class="sm" id="meVU" title="velocity +5 (relative)">+</button></label>`+
    `<label>Len <input type="number" id="meLen" min="1" placeholder="—" style="width:54px"></label>`+
    `<button class="sm" id="meNL" title="nudge −1 tick">◀</button>`+
    `<button class="sm" id="meNR" title="nudge +1 tick">▶</button>`+
    `<button class="sm" id="meOD" title="octave down">8vb</button>`+
    `<button class="sm" id="meOU" title="octave up">8va</button>`+
    `<button class="sm danger" id="meDel">Delete</button>`;
  /* velocity is RELATIVE across the selection — preserves each note's balance */
  function shiftVel(d){ const ops=[]; selectedNotes().forEach(nt=>{ const nv=Math.max(1,Math.min(127,nt.vel+d));
    if(nv!==nt.vel){ nt.vel=nv; ops.push(["v",`${nt.tick} ${nt.pitch} ${nv}`]); } }); emitBatch(ops); draw(); }
  el.querySelector("#meVD").onclick=()=>shiftVel(-5);
  el.querySelector("#meVU").onclick=()=>shiftVel(5);
  el.querySelector("#meLen").onchange=e=>{ const v=Math.max(1,+e.target.value|0); if(!v) return;
    const ops=[]; selectedNotes().forEach(nt=>{ nt.gate=v; ops.push(["r",`${nt.tick} ${nt.pitch} ${v}`]); }); emitBatch(ops); draw(); };
  function moveAll(dt,dp){ const ns=selectedNotes(), ops=[];
    ns.forEach(nt=>{ const o={tick:nt.tick,pitch:nt.pitch};
      nt.tick=Math.max(0,Math.min(maxEditTick()-1,nt.tick+dt)); nt.pitch=Math.max(0,Math.min(127,nt.pitch+dp));
      ops.push(["m",`${o.tick} ${o.pitch} ${nt.tick} ${nt.pitch}`]); });
    emitBatch(ops); selSet.clear(); ns.forEach(nt=>selSet.add(nKey(nt))); draw(); renderNoteEdit(); }
  el.querySelector("#meNL").onclick=()=>moveAll(-1,0);
  el.querySelector("#meNR").onclick=()=>moveAll(1,0);
  el.querySelector("#meOD").onclick=()=>moveAll(0,-12);
  el.querySelector("#meOU").onclick=()=>moveAll(0,12);
  el.querySelector("#meDel").onclick=()=>{ const ops=[]; selectedNotes().forEach(nt=>{ const k=M.notes.indexOf(nt); if(k>=0) M.notes.splice(k,1);
    ops.push(["d",`${nt.tick} ${nt.pitch}`]); }); emitBatch(ops); selSet.clear(); draw(); renderNoteEdit(); };
}
function renderNoteEdit(){
  const el=document.getElementById("noteedit"); if(!el) return;
  if(isDrum()){ renderDrumNoteEdit(el); return; }
  if(selSet.size>=1){ renderMultiEdit(el); return; }
  const i=findSelNote();
  if(i<0){ el.innerHTML=`<span class="eb-empty">Click a note to edit it (Shift-drag / Snap=Off for off-grid)</span>`; return; }
  const nt=M.notes[i];
  el.innerHTML=
    `<span class="et">♪ ${noteName(nt.pitch)}</span>`+
    ebNum("Pos","nePos",nt.tick,0,maxTick()-1)+
    ebNum("Pitch","nePitch",nt.pitch,0,127)+
    ebNum("Vel","neVel",nt.vel,1,127)+
    ebNum("Len","neLen",nt.gate,1,maxTick())+
    `<button class="sm" id="neNL" title="nudge −1 tick">◀</button>`+
    `<button class="sm" id="neNR" title="nudge +1 tick">▶</button>`+
    `<button class="sm danger" id="neDel">Del</button>`;
  const cur=()=>{ const k=findSelNote(); return k<0?null:M.notes[k]; };
  function moveTo(tick,pitch){ const n=cur(); if(!n) return; const o={tick:n.tick,pitch:n.pitch};
    tick=Math.max(0,Math.min(maxTick()-1,tick|0)); pitch=Math.max(0,Math.min(127,pitch|0));
    if(tick===o.tick&&pitch===o.pitch) return;
    if(M.notes.some(x=>x!==n&&x.tick===tick&&x.pitch===pitch)) return;
    n.tick=tick; n.pitch=pitch; selNote={tick,pitch}; draw();
    emit("note_move",`${o.tick} ${o.pitch} ${tick} ${pitch}`); renderNoteEdit(); }
  el.querySelector("#nePos").onchange=e=>moveTo(+e.target.value, cur()?cur().pitch:0);
  el.querySelector("#nePitch").onchange=e=>moveTo(cur()?cur().tick:0, +e.target.value);
  el.querySelector("#neVel").onchange=e=>{ const n=cur(); if(!n) return; n.vel=Math.max(1,Math.min(127,+e.target.value|0));
    draw(); emit("note_vel",`${n.tick} ${n.pitch} ${n.vel}`); };
  el.querySelector("#neLen").onchange=e=>{ const n=cur(); if(!n) return; n.gate=Math.max(1,+e.target.value|0);
    draw(); emit("note_resize",`${n.tick} ${n.pitch} ${n.gate}`); };
  el.querySelector("#neNL").onclick=()=>{ const n=cur(); if(n) moveTo(n.tick-1,n.pitch); };
  el.querySelector("#neNR").onclick=()=>{ const n=cur(); if(n) moveTo(n.tick+1,n.pitch); };
  el.querySelector("#neDel").onclick=()=>{ const n=cur(); if(!n) return;
    M.notes.splice(findSelNote(),1); const o={tick:n.tick,pitch:n.pitch}; selNote=null;
    draw(); emit("note_del",`${o.tick} ${o.pitch}`); renderNoteEdit(); };
}
/* ---------- selected drum-hit editor (per-lane, absolute tick) ---------- */
function maxTickDrum(){ return Math.max(1,M.clip.len*M.clip.tps); }
function findSelDrum(){ if(!selDrum||!M||!isDrum()) return null;
  const arr=M.dnotes[selDrum.lane]||[]; return arr.find(x=>x.tick===selDrum.tick)||null; }
function renderDrumNoteEdit(el){
  if(M.sel.lane<0){ el.innerHTML=`<span class="eb-empty">Click a lane name to select it, then edit its hits</span>`; return; }
  const h=findSelDrum();
  if(!h){ el.innerHTML=`<span class="eb-empty">Click a hit to edit it (Shift-drag / Snap=Off for off-grid)</span>`; return; }
  const lane=selDrum.lane, ln=M.dlanes[lane];
  el.innerHTML=
    `<span class="et">● ${ln?noteName(ln.note):("L"+lane)}</span>`+
    ebNum("Pos","dnPos",h.tick,0,maxTickDrum()-1)+
    ebNum("Vel","dnVel",h.vel,1,127)+
    ebNum("Len","dnLen",h.gate,1,maxTickDrum())+
    `<button class="sm" id="dnNL" title="nudge −1 tick">◀</button>`+
    `<button class="sm" id="dnNR" title="nudge +1 tick">▶</button>`+
    `<button class="sm danger" id="dnDel">Del</button>`;
  const cur=()=>findSelDrum();
  function moveTo(tick){ const n=cur(); if(!n) return; const o=n.tick;
    tick=Math.max(0,Math.min(maxTickDrum()-1,tick|0)); if(tick===o) return;
    if((M.dnotes[lane]||[]).some(x=>x!==n&&x.tick===tick)) return;
    n.tick=tick; selDrum={lane,tick}; draw();
    R.setParam(P+`t${M.sel.t}_l${lane}_note_move`,`${o} ${tick}`); afterEdit(); renderNoteEdit(); }
  el.querySelector("#dnPos").onchange=e=>moveTo(+e.target.value);
  el.querySelector("#dnVel").onchange=e=>{ const n=cur(); if(!n) return; n.vel=Math.max(1,Math.min(127,+e.target.value|0));
    draw(); R.setParam(P+`t${M.sel.t}_l${lane}_note_vel`,`${n.tick} ${n.vel}`); afterEdit(); };
  el.querySelector("#dnLen").onchange=e=>{ const n=cur(); if(!n) return; n.gate=Math.max(1,+e.target.value|0);
    draw(); R.setParam(P+`t${M.sel.t}_l${lane}_note_resize`,`${n.tick} ${n.gate}`); afterEdit(); };
  el.querySelector("#dnNL").onclick=()=>{ const n=cur(); if(n) moveTo(n.tick-1); };
  el.querySelector("#dnNR").onclick=()=>{ const n=cur(); if(n) moveTo(n.tick+1); };
  el.querySelector("#dnDel").onclick=()=>{ const n=cur(); if(n) drumDelete(lane,n.tick); };
}
function drumHitAt(mx,my){
  const lane=laneOfY(my); if(lane<0||lane>=M.dlanes.length) return null;
  const arr=M.dnotes[lane]||[];
  for(let i=arr.length-1;i>=0;i--){ const h=arr[i];
    const x=xOfTick(h.tick), w=Math.max(5,h.gate*PXPERTICK);
    if(mx>=x&&mx<=x+Math.max(w,12)) return {lane,tick:h.tick,i,edge:(mx>=x+w-edgeZone(w))}; }
  return null;
}
function drumAdd(lane,tick){ const arr=M.dnotes[lane]||(M.dnotes[lane]=[]);
  if(arr.some(h=>h.tick===tick)) return;
  arr.push({tick,vel:100,gate:M.clip.tps}); if(M.dlanes[lane]) M.dlanes[lane].has=true;
  draw(); R.setParam(P+`t${M.sel.t}_l${lane}_note_add`,`${tick} 100 ${M.clip.tps}`); afterEdit(); }
function drumDelete(lane,tick){ const arr=M.dnotes[lane]||[]; const i=arr.findIndex(h=>h.tick===tick);
  if(i<0) return; arr.splice(i,1); if(M.dlanes[lane]) M.dlanes[lane].has=arr.length>0;
  if(selDrum&&selDrum.lane===lane&&selDrum.tick===tick) selDrum=null;
  draw(); renderNoteEdit(); R.setParam(P+`t${M.sel.t}_l${lane}_note_del`,String(tick)); afterEdit(); }
/* Map a note tick → its step index the SAME way the device does: the NEAREST
 * step (round), matching dsp note_step() = (tick + tps/2)/tps. The browser used
 * to floor() here, so an off-grid note (Input-Quantize-Off / nudged / sub-step)
 * was filed one step earlier than the device filed it — the step the note was
 * drawn in couldn't be selected while the neighbour could. All note→step mapping
 * (draw, counts, highlight, step-pick) goes through this so they stay aligned. */
function noteStep(tick,tps){ return Math.floor((tick + (tps>>1)) / tps); }
/* ---------- step-param editor (per-step iter/prob/ratchet/nudge) ---------- */
function stepCount(s,tps){ let nc=0;
  if(isDrum()){ (M.dnotes[M.sel.lane]||[]).forEach(h=>{ if(noteStep(h.tick,tps)===s) nc++; }); }
  else { M.notes.forEach(n=>{ if(noteStep(n.tick,tps)===s) nc++; }); }
  return nc; }
function renderStepEdit(){
  const el=document.getElementById("stepedit"); if(!el) return;
  /* showing/hiding this strip changes the roll container's height, but the
   * canvas only re-measures in layout() — without a re-layout the step band
   * at the canvas bottom gets clipped out of view the moment the strip
   * appears. Re-layout + redraw whenever content presence flips. */
  const hadContent=!!el.innerHTML;
  const relayout=()=>{ if(hadContent!==!!el.innerHTML){ layout(); draw(); } };
  const drum=isDrum();
  const len=drum?(M.laneInfo?M.laneInfo.len:0):M.clip.len;
  if(selStep<0||selStep>=len||(drum&&M.sel.lane<0)){ if(selStep>=len) selStep=-1; el.innerHTML=""; relayout(); return; }
  const s=selStep, tps=drum?(M.laneInfo?M.laneInfo.tps:M.clip.tps):M.clip.tps;
  const tr=M.stepTrig[s]||{iter:0,rand:0,ratch:0,nudge:0};
  const nc=stepCount(s,tps), tmax=Math.max(1,tps-1);
  const pfx=drum?`t${M.sel.t}_l${M.sel.lane}_step_${s}`:`t${M.sel.t}_c${M.sel.c}_step_${s}`;
  /* seed Vel/Gate from the step's first note (they set ALL notes in the step) */
  const sNotes=(drum?(M.dnotes[M.sel.lane]||[]):M.notes).filter(nt=>noteStep(nt.tick,tps)===s);
  const svel=sNotes.length?sNotes[0].vel:100, sgate=sNotes.length?sNotes[0].gate:tps;
  let iterOpts=`<option value="0">Every</option>`;
  for(let cl=2;cl<=8;cl++)for(let ci=1;ci<=cl;ci++){const v=(cl<<4)|ci;
    iterOpts+=`<option value="${v}"${v===tr.iter?" selected":""}>${ci}/${cl}</option>`;}
  el.innerHTML=
    `<span class="et">▣ Step ${s+1}${drum?` · L${M.sel.lane}`:""} · ${nc} note${nc===1?"":"s"}</span>`+
    `<label>Iter <select id="seIter">${iterOpts}</select></label>`+
    `<label>Prob <input type="number" id="seRand" value="${tr.rand}" min="0" max="100">%</label>`+
    `<label>Ratch <input type="number" id="seRatch" value="${tr.ratch}" min="0" max="4"></label>`+
    `<label>Nudge <input type="number" id="seNudge" value="${tr.nudge}" min="${-tmax}" max="${tmax}"${nc?"":" disabled"}></label>`+
    `<label>Vel <input type="number" id="seVel" value="${svel}" min="1" max="127"></label>`+
    `<label>Gate <input type="number" id="seGate" value="${sgate}" min="1" max="${tps*4}"></label>`+
    `<button class="sm danger" id="seClr" title="clear this step (remove its notes + trig)">Clear</button>`;
  function setTrig(f,v){ const o=Object.assign({iter:0,rand:0,ratch:0,nudge:0},M.stepTrig[s]); o[f]=v; M.stepTrig[s]=o; }
  el.querySelector("#seIter").onchange=e=>{ const v=+e.target.value; setTrig("iter",v); R.setParam(P+pfx+"_iter",String(v)); afterEdit(); drawStepStrip(); };
  el.querySelector("#seRand").onchange=e=>{ const v=Math.max(0,Math.min(100,+e.target.value|0)); setTrig("rand",v); R.setParam(P+pfx+"_rand",String(v)); afterEdit(); drawStepStrip(); };
  el.querySelector("#seRatch").onchange=e=>{ const v=Math.max(0,Math.min(4,+e.target.value|0)); setTrig("ratch",v); R.setParam(P+pfx+"_ratch",String(v)); afterEdit(); drawStepStrip(); };
  const nu=el.querySelector("#seNudge");
  if(nu&&!nu.disabled) nu.onchange=e=>{ const v=Math.max(-tmax,Math.min(tmax,+e.target.value|0)); setTrig("nudge",v); R.setParam(P+pfx+"_nudge",String(v)); afterEdit(); drawStepStrip(); };
  el.querySelector("#seVel").onchange=e=>{ const v=Math.max(1,Math.min(127,+e.target.value|0)); R.setParam(P+pfx+"_vel",String(v)); afterEdit(); pullSoon(); };
  el.querySelector("#seGate").onchange=e=>{ const v=Math.max(1,+e.target.value|0); R.setParam(P+pfx+"_gate",String(v)); afterEdit(); pullSoon(); };
  el.querySelector("#seClr").onclick=()=>{ R.setParam(P+pfx+"_clear",""); selStep=-1; afterEdit(); pullSoon(); renderStepEdit(); };
  relayout();
}
const RES_TPS=[12,24,48,96,192,384], RES_LAB=["1/32","1/16","1/8","1/4","1/2","1/1"];
const DIR_LAB=["Fwd","Bwd","PP-Fwd","PP-Bwd"];
let allLanes=false;   /* drum: edits target ALL lanes at once (like the hardware ALL LANES bank) */
/* emit a per-lane setting honoring All-Lanes: atomic tN_all_lanes_* key when one
 * exists, else broadcast tN_lL_<suffix> across every lane. */
function laneEmit(suffix,val,allKey){
  if(allLanes){
    if(allKey) R.setParam(P+`t${M.sel.t}_${allKey}`,val);
    else for(let l=0;l<M.dlanes.length;l++) R.setParam(P+`t${M.sel.t}_l${l}_${suffix}`,val);
  } else R.setParam(P+`t${M.sel.t}_l${M.sel.lane}_${suffix}`,val);
  afterEdit();
}
/* per-clip FX, MELODIC ONLY → tN_cC_pfx_set.
 *
 * ⚠ rui_pfx is EMPTY on a drum track, deliberately. It used to claim to carry the
 * selected drum lane's FX, but a drum lane's pfx is a different, smaller struct
 * (44 bytes vs 132) with a different field order and no harmonize/seq_arp fields at
 * all — so the DSP was reading past the end of it and every value shown here was
 * mislabelled. Editing them wrote the garbage back. The DSP no longer emits it.
 *
 * The PFX descriptors below are the MELODIC order. A per-lane drum FX panel needs
 * its own snapshot key in the drum field order; it cannot reuse these. */
/* compact one-line summaries shown on a collapsed FX sub-group */
function fxGroupSummary(g){ const gp=key=>{ const i=PFX.findIndex(d=>d.key===key); return i>=0?(M.pfx[i]|0):0; };
  if(g==="NOTE FX") return `Oct ${gp("noteFX_octave")} · Gate ${gp("noteFX_gate")}%`;
  if(g==="HARMZ")   return `${gp("harm_interval1")}/${gp("harm_interval2")}/${gp("harm_interval3")}`;
  if(g==="MIDI DLY")return `${DELAY_TIME_LAB[gp("delay_time")]||"?"} · Lv ${gp("delay_level")}`;
  if(g==="SEQ ARP") return `${SEQ_ARP_STYLE_LAB[gp("seq_arp_style")]||"?"} · ${SEQ_ARP_RATE_LAB[gp("seq_arp_rate")]||"?"}`;
  return ""; }
function fxRow(d,i){ const v=M.pfx[i];
  if(d.opts) return `<div class="kv"><span>${d.l}</span><span><select class="fxsel" data-i="${i}">`+
      d.opts.map((o,oi)=>`<option value="${d.lo+oi}"${(d.lo+oi)===v?" selected":""}>${o}</option>`).join("")+
      `</select></span></div>`;
  if(isWideFX(d)) return sliderRow("fx"+i, d.l, v, d.lo, d.hi);
  return `<div class="kv"><span>${d.l}</span><span>`+
      `<button class="fxdn sm" data-i="${i}">−</button>`+
      `<input class="fxin" data-i="${i}" type="number" min="${d.lo}" max="${d.hi}" value="${v}" style="width:54px;text-align:right">`+
      `<button class="fxup sm" data-i="${i}">+</button></span></div>`;
}
function renderFX(){
  const el=document.getElementById("fxpanel"); if(!el) return;
  const drum=isDrum(), laneSel=drum && M.sel.lane>=0;
  if((drum && !laneSel) || !M.pfx || M.pfx.length<PFX.length){ el.innerHTML=""; return; }
  /* C-1: drum lanes only see Note FX + MIDI Delay (Harmony + Seq/Arp are melodic-only) */
  const groups=["NOTE FX","HARMZ","MIDI DLY","SEQ ARP"].filter(g=> !drum || (g!=="HARMZ" && g!=="SEQ ARP"));
  let html="";
  groups.forEach(g=>{
    let body=""; PFX.forEach((d,i)=>{ if(d.g===g) body+=fxRow(d,i); });
    html+=subEl("fx."+g, FX_GROUP_TITLE[g]||g, fxGroupSummary(g), body, false);
  });
  el.innerHTML=html;
  el.querySelectorAll(".sub-h").forEach(h=>h.onclick=()=>{
    const s=h.parentNode,id=s.dataset.sub,open=!s.classList.contains("open");
    s.classList.toggle("open",open); subOpen[id]=open; saveSub(); });
  const setI=(i,val)=>{ const d=PFX[i]; val=Math.max(d.lo,Math.min(d.hi,val|0));
    if(M.pfx[i]===val) return; M.pfx[i]=val;
    if(drum && allLanes){ for(let l=0;l<M.dlanes.length;l++) R.setParam(P+`t${M.sel.t}_l${l}_pfx_set`, d.key+" "+val); }
    else { const key=drum ? `t${M.sel.t}_l${M.sel.lane}_pfx_set` : `t${M.sel.t}_c${M.sel.c}_pfx_set`;
      R.setParam(P+key, d.key+" "+val); }
    afterEdit();
    const inp=el.querySelector(`.fxin[data-i="${i}"]`); if(inp) inp.value=val; };
  el.querySelectorAll(".fxin").forEach(inp=>inp.onchange=e=>setI(+e.target.dataset.i,+e.target.value));
  el.querySelectorAll(".fxup").forEach(b=>b.onclick=e=>setI(+e.currentTarget.dataset.i,M.pfx[+e.currentTarget.dataset.i]+1));
  el.querySelectorAll(".fxdn").forEach(b=>b.onclick=e=>setI(+e.currentTarget.dataset.i,M.pfx[+e.currentTarget.dataset.i]-1));
  el.querySelectorAll(".fxsel").forEach(s=>s.onchange=e=>setI(+e.target.dataset.i,+e.target.value));
  PFX.forEach((d,i)=>{ if(isWideFX(d)) bindSlider(el,"fx"+i,d.lo,d.hi,v=>setI(i,v)); });
}
function renderSide(){
  const ridx=RES_TPS.indexOf(M.clip.tps);
  const el=document.getElementById("clipinfo");
  el.innerHTML=
    sliderRow("clLs","Loop start",M.clip.ls,0,255)+
    sliderRow("clLen","Length",M.clip.len,1,256)+
    `<div class="kv"><span>Direction</span><span><select id="dirSel">`+
      ["Fwd","Bwd","PP-Fwd","PP-Bwd"].map((n,i)=>`<option value="${i}"${i===M.clip.dir?" selected":""}>${n}</option>`).join("")+
      `</select></span></div>`+
    `<div class="kv"><span>Resolution</span><span><select id="resSel">`+
      RES_LAB.map((n,i)=>`<option value="${i}"${i===ridx?" selected":""}>${n}</option>`).join("")+
      `</select></span></div>`+
    `<div class="kv"><span>Notes</span><span>${isDrum()?"—":M.notes.length}</span></div>`;
  bindSlider(el,"clLen",1,256,v=>{ if(v===M.clip.len)return; M.clip.len=v; emit("length",String(v)); layout(); draw(); });
  el.querySelector("#dirSel").onchange=e=>{ M.clip.dir=+e.target.value; emit("dir",e.target.value); };
  el.querySelector("#resSel").onchange=e=>{ emit("resolution",e.target.value); pullSoon(); };
  /* loop start (loop_set packed = ls*65536 + len) */
  bindSlider(el,"clLs",0,255,v=>{ M.clip.ls=v; emit("loop_set",String(v*65536+M.clip.len)); pullSoon(); });
}
/* Clip management: Clear (wipe notes, keep length/FX) · Duplicate (→ next empty
 * slot, same track) · Delete (hard reset to defaults). */
function renderClipOps(){
  const el=document.getElementById("clipops"); const t=M.sel.t,c=M.sel.c,drum=isDrum();
  el.innerHTML=`<button class="sm" id="opClear">Clear</button>`+
    `<button class="sm" id="opDup">Duplicate</button>`+
    `<button class="sm danger" id="opDel">Delete</button>`;
  el.querySelector("#opClear").onclick=()=>{
    R.setParam(P+(drum?`t${t}_c${c}_drum_clear`:`t${t}_c${c}_clear`),"0"); afterEdit(); pullSoon(); };
  el.querySelector("#opDel").onclick=()=>{
    R.setParam(P+`t${t}_c${c}_hard_reset`,"1"); afterEdit(); pullSoon(); };
  el.querySelector("#opDup").onclick=()=>{
    const tr=M.tracks[t]; let dst=-1;
    for(let i=0;i<16;i++) if(!tr.has[i] && i!==c){ dst=i; break; }
    if(dst<0) return;
    R.setParam(P+(drum?"drum_clip_copy":"clip_copy"), `${t} ${c} ${t} ${dst}`); afterEdit();
    setTimeout(()=>selectClip(t,dst),140); };
}
/* Drum: per-lane length for the selected lane (click a lane label to select). */
function renderDrumPanel(){
  const el=document.getElementById("drumpanel");
  if(!isDrum()){ el.innerHTML=""; return; }
  if(M.sel.lane<0 || !M.laneInfo){
    el.innerHTML=`<div class="hint">Click a <b>lane label</b> (left of the drum grid) to edit that lane's length + FX.</div>`;
    return;
  }
  const li=M.laneInfo, ln=M.dlanes[M.sel.lane], lane=M.sel.lane;
  const muted=!!(ln&&ln.mute), soloed=!!(ln&&ln.solo), ridx=RES_TPS.indexOf(li.tps);
  const dis=allLanes?" disabled":"";   /* trigger note is per-lane identity → no All-Lanes */
  el.innerHTML=
    `<h4 style="margin-top:14px${allLanes?";color:var(--accent)":""}">`+
      `${allLanes?"ALL LANES":("Lane "+lane+(ln?" · "+noteName(ln.note):""))}</h4>`+
    `<div class="kv"><span>Edit scope</span><span>`+
      `<button id="laThis" class="sm${allLanes?"":" on"}">This</button>`+
      `<button id="laAll" class="sm${allLanes?" on":""}">All</button></span></div>`+
    (allLanes ? `<div class="kv"><span>Trigger note</span><span class="val mut">— per lane —</span></div>`
              : sliderRow("laNote","Trigger note",ln?ln.note:36,0,127))+
    sliderRow("laLs","Loop start",li.ls,0,255)+
    sliderRow("laLen","Length",li.len,1,256)+
    `<div class="kv"><span>Resolution</span><span><select id="lResSel">`+
      RES_LAB.map((n,i)=>`<option value="${i}"${i===ridx?" selected":""}>${n}</option>`).join("")+`</select></span></div>`+
    `<div class="kv"><span>Direction</span><span><select id="lDirSel">`+
      DIR_LAB.map((n,i)=>`<option value="${i}"${i===li.dir?" selected":""}>${n}</option>`).join("")+`</select></span></div>`+
    `<div class="kv"><span>Mute / Solo</span><span>`+
      `<button id="lMute" class="sm${muted?" on":""}">Mute</button>`+
      `<button id="lSolo" class="sm${soloed?" on":""}">Solo</button></span></div>`;
  el.querySelector("#laThis").onclick=()=>{ allLanes=false; renderInspector(); };
  el.querySelector("#laAll").onclick=()=>{ allLanes=true; renderInspector(); };
  /* trigger note — per-lane only */
  if(!allLanes) bindSlider(el,"laNote",0,127,v=>{ if(!ln||v===ln.note)return; ln.note=v;
    R.setParam(P+`t${M.sel.t}_l${lane}_lane_note`,String(v)); afterEdit(); draw(); });
  /* length */
  bindSlider(el,"laLen",1,256,v=>{ li.len=v; laneEmit("clip_length",String(v),"all_lanes_length"); });
  /* resolution */
  el.querySelector("#lResSel").onchange=e=>{ laneEmit("clip_resolution",e.target.value,"all_lanes_clip_resolution"); pullSoon(); };
  /* loop start (loop_set packed = ls*65536 + len) */
  bindSlider(el,"laLs",0,255,v=>{ li.ls=v; laneEmit("loop_set",String(v*65536+li.len),"all_lanes_loop_set"); pullSoon(); });
  /* direction */
  el.querySelector("#lDirSel").onchange=e=>{ li.dir=+e.target.value; laneEmit("playback_dir",e.target.value,"all_lanes_playback_dir"); };
  /* mute / solo — no atomic all key, broadcast across lanes when All */
  el.querySelector("#lMute").onclick=()=>{ const nv=!muted;
    if(allLanes){ for(let l=0;l<M.dlanes.length;l++){ M.dlanes[l].mute=nv; R.setParam(P+`t${M.sel.t}_l${l}_mute`,nv?"1":"0"); } }
    else if(ln){ ln.mute=nv; R.setParam(P+`t${M.sel.t}_l${lane}_mute`,nv?"1":"0"); }
    afterEdit(); renderDrumPanel(); draw(); };
  el.querySelector("#lSolo").onclick=()=>{ const nv=!soloed;
    if(allLanes){ for(let l=0;l<M.dlanes.length;l++){ M.dlanes[l].solo=nv; R.setParam(P+`t${M.sel.t}_l${l}_solo`,nv?"1":"0"); } }
    else if(ln){ ln.solo=nv; R.setParam(P+`t${M.sel.t}_l${lane}_solo`,nv?"1":"0"); }
    afterEdit(); renderDrumPanel(); draw(); };
}
/* Global params: BPM (top bar) + key/scale/swing/scale-aware/launch-quant (side). */
function renderGlobals(){
  const g=M.glob||{key:0,scale:0,swing:0,swingRes:0,quant:0,scaleAware:false};
  const tb=document.getElementById("globals");
  if(document.activeElement!==tb.querySelector("#bpmIn"))
    tb.innerHTML=`<label>BPM <input id="bpmIn" type="number" min="40" max="250" value="${M.play.bpm|0}"></label>`;
  tb.querySelector("#bpmIn").onchange=e=>{ const v=Math.max(40,Math.min(250,+e.target.value|0));
    R.setParam(P+"bpm",String(v)); afterEdit(); };
  const el=document.getElementById("globalpanel");
  const opt=(arr,sel)=>arr.map((n,i)=>`<option value="${i}"${i===sel?" selected":""}>${n}</option>`).join("");
  const QUANT=["Off","1 bar","1/2","1/4","1/8","1/16"];
  el.innerHTML=
    `<div class="kv"><span>Key</span><span><select id="gKey">${opt(KEY_NAMES,g.key)}</select></span></div>`+
    `<div class="kv"><span>Scale</span><span><select id="gScale">${opt(SCALE_NAMES,g.scale)}</select></span></div>`+
    `<div class="kv"><span>Scale aware</span><span><button class="sm${g.scaleAware?" on":""}" id="gSA">${g.scaleAware?"On":"Off"}</button></span></div>`+
    sliderRow("gSw","Swing",g.swing,0,100)+
    `<div class="kv"><span>Swing res</span><span><select id="gSwR"><option value="0"${!g.swingRes?" selected":""}>1/16</option><option value="1"${g.swingRes?" selected":""}>1/8</option></select></span></div>`+
    `<div class="kv"><span>Launch quant</span><span><select id="gQ">${opt(QUANT,g.quant)}</select></span></div>`;
  const setG=(key,val)=>{ R.setParam(P+key,String(val)); afterEdit(); };
  el.querySelector("#gKey").onchange=e=>{ g.key=+e.target.value; setG("key",e.target.value); pullSoon(); };
  el.querySelector("#gScale").onchange=e=>{ g.scale=+e.target.value; setG("scale",e.target.value); pullSoon(); };
  el.querySelector("#gSA").onclick=()=>{ g.scaleAware=!g.scaleAware; setG("scale_aware",g.scaleAware?1:0); renderGlobals(); layout(); draw(); };
  bindSlider(el,"gSw",0,100,v=>{ g.swing=v; setG("swing_amt",v); });
  el.querySelector("#gSwR").onchange=e=>setG("swing_res",e.target.value);
  el.querySelector("#gQ").onchange=e=>setG("launch_quant",e.target.value);
}
/* Session grid: tracks = columns, scenes = rows. Track headers + clips show the
 * device track colors. Click a clip = select it for editing; double-click =
 * launch it; ▶ in the left column = launch the whole scene row. */
let clipDrag=null;   /* {t,c} source while dragging a clip in the session grid */
function renderSession(){
  closeClipMenu();   /* a rebuild destroys the menu's anchor — never leave it orphaned */
  const grid=document.getElementById("grid");
  const NT=M.tracks.length||8, NC=16;
  grid.style.gridTemplateColumns=`30px repeat(${NT},minmax(20px,1fr))`;
  let html=`<div class="scorner"></div>`;
  const soloAny=M.tracks.some(x=>x.solo);
  M.tracks.forEach((trk,t)=>{
    /* header names the track's INSTRUMENT: "5 - OB-Xd" (own instrument; module
     * name once known, "Synth" until the mixer namespace has been seeded),
     * "1 - Move 3", "3 - MIDI Ch.3"; falls back to mode+index without route
     * data. Never the retired position letters. */
    const instShort=trk.route===0?(mixKV["chain:"+t+":synth_name"]||mixKV["chain:"+t+":synth_module"]||"Synth")
      :trk.route===1?("Move "+moveBusForChannel(trk.chan))
      :trk.route===2?("MIDI Ch."+trk.chan):null;
    const lbl=(instShort!=null)?`${t+1} - ${instShort}`:(trk.pm===1?"D":trk.pm===2?"C":"M")+(t+1);
    const ttl=(instShort!=null)?`Track ${t+1} → ${instShort}`:`track ${t+1}`;
    /* conductor / responder indicator (rui_cond): "C" on the conductor track,
     * a dot on every non-drum responder track */
    let cind="";
    if(M.cond && M.cond.trk>=0){
      if(t===M.cond.trk) cind=` <span class="cind cond" title="Conductor">C</span>`;
      else if(trk.pm!==1 && M.cond.resp && M.cond.resp[t] && M.cond.resp[t].resp===1)
        cind=` <span class="cind resp" title="Responds to conductor">•</span>`;
    }
    /* mute (click) / solo (right-click) state: badges + effective-silence dim.
     * effectively silenced if muted, OR some track is soloed and this one isn't. */
    const eff = trk.mute || (soloAny && !trk.solo);
    const mind = (trk.mute?` <span class="cind tm" title="Muted">M</span>`:"")
               + (trk.solo?` <span class="cind ts" title="Soloed">S</span>`:"");
    html+=`<div class="strk${t===M.sel.t?" sel":""}${eff?" eff":""}" data-t="${t}" style="background:${trackColor(t)}" `+
          `title="${ttl} · click=mute, right-click=solo">`+
          `${lbl}${cind}${mind}<span class="strk-gear" data-t="${t}" title="Track settings (route / channel)">☰</span></div>`;
  });
  for(let c=0;c<NC;c++){
    html+=`<div class="slaunch" data-scene="${c}" title="Launch scene ${SCENE_LETTERS[c]}">▶${SCENE_LETTERS[c]}</div>`;
    M.tracks.forEach((trk,t)=>{
      const col=trackColor(t), has=trk.has[c];
      const cutHere=clipClipboard&&clipClipboard.cut&&clipClipboard.t===t&&clipClipboard.c===c&&has;
      const cls="sclip"+(t===M.sel.t&&c===M.sel.c?" sel":"")
                +(trk.pl&&trk.ac===c?" playing":"")+(trk.qc===c?" queued":"")
                +(cutHere?" cutmark":"");
      const bg=has?col:hexA(col,0.14);
      html+=`<div class="${cls}" data-t="${t}" data-c="${c}" data-has="${has?1:0}" draggable="${has?'true':'false'}" style="background:${bg}" `+
            `title="track ${t+1} ${SCENE_LETTERS[c]}${has?' · clip · drag to move (Alt=copy)':' · empty'}">`+
            `<span class="sclip-menu" data-t="${t}" data-c="${c}" title="clip menu">≡</span></div>`;
    });
  }
  grid.innerHTML=html;
  /* track header: BODY click = mute, right-click = solo (selection stays on the
   * clip cells below), DOUBLE-click = jump to this track's Sound view. The
   * single-click mute defers ~250ms so a double-click never toggles it — the
   * two would otherwise fire mute on+off around every jump. The gear
   * (stopPropagation) opens route/channel settings. */
  grid.querySelectorAll(".strk").forEach(el=>{
    const t=+el.dataset.t;
    el.onclick=()=>{ clearTimeout(el._muteT);
      el._muteT=setTimeout(()=>{ const tr=M.tracks[t]; tr.mute=tr.mute?0:1;
        R.setParam(P+`t${t}_mute`, tr.mute?"1":"0"); afterEdit(); renderSession(); pullSoon(); },250); };
    el.ondblclick=()=>{ clearTimeout(el._muteT); jumpTo("sound", t); };
    el.oncontextmenu=e=>{ e.preventDefault(); const tr=M.tracks[t]; tr.solo=tr.solo?0:1;
      R.setParam(P+`t${t}_solo`, tr.solo?"1":"0"); afterEdit(); renderSession(); pullSoon(); };
  });
  grid.querySelectorAll(".strk-gear").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); openTrackGear(+el.dataset.t, el); };
    el.oncontextmenu=e=>{ e.stopPropagation(); e.preventDefault(); };
  });
  grid.querySelectorAll(".slaunch").forEach(el=>el.onclick=()=>launchScene(+el.dataset.scene));
  grid.querySelectorAll(".sclip").forEach(el=>{
    /* hardware parity: tapping a clip LAUNCHES it (and the editor follows it,
     * like the device where the launched clip is the active/edit clip).
     * Alt/Shift-click = view-only select (remote-editor extra: inspect a clip
     * without triggering it). */
    el.onclick=e=>{ const t=+el.dataset.t,c=+el.dataset.c;
      if(e.altKey||e.shiftKey){ selectClip(t,c); return; }
      launchClip(t,c); selectClip(t,c); };
    /* drag a clip to another slot: move (Alt = copy); only between same-mode tracks */
    el.ondragstart=e=>{ if(el.dataset.has!=="1"){ e.preventDefault(); return; }
      clipDrag={t:+el.dataset.t,c:+el.dataset.c}; e.dataTransfer.effectAllowed="copyMove"; };
    el.ondragover=e=>{ if(!clipDrag) return;
      const ok=M.tracks[clipDrag.t].pm===M.tracks[+el.dataset.t].pm;
      if(!ok){ e.dataTransfer.dropEffect="none"; return; }
      e.preventDefault(); e.dataTransfer.dropEffect=e.altKey?"copy":"move"; el.classList.add("drop"); };
    el.ondragleave=()=>el.classList.remove("drop");
    el.ondragend=()=>{ clipDrag=null; el.classList.remove("drop"); };  /* abandoned drag → clear so polls resume */
    el.ondrop=e=>{ e.preventDefault(); el.classList.remove("drop");
      const dst={t:+el.dataset.t,c:+el.dataset.c}; const src=clipDrag; clipDrag=null;
      if(!src||(src.t===dst.t&&src.c===dst.c)) return;
      if(M.tracks[src.t].pm!==M.tracks[dst.t].pm) return;
      dropClip(src,dst,e.altKey); };
  });
  grid.querySelectorAll(".sclip-menu").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); openClipMenu(+el.dataset.t,+el.dataset.c,el); };
    el.ondragstart=e=>e.preventDefault();
  });
}
/* ---------- per-clip burger menu: duplicate / copy / cut / paste / delete ---- */
let clipClipboard=null;           /* {t,c,pm,cut} — cut = move-on-paste (source marked, cleared at paste) */
let clipMenuEl=null;
function closeClipMenu(){ if(clipMenuEl){ clipMenuEl.remove(); clipMenuEl=null;
  document.removeEventListener("pointerdown",clipMenuOutside,true); } }
function clipMenuOutside(e){ if(clipMenuEl && !clipMenuEl.contains(e.target)) closeClipMenu(); }
function clipCopyOp(src,dst){ const drum=M.tracks[src.t].pm===1;
  R.setParam(P+(drum?"drum_clip_copy":"clip_copy"), `${src.t} ${src.c} ${dst.t} ${dst.c}`); }
function clipClearOp(t,c){ const drum=M.tracks[t].pm===1;
  R.setParam(P+(drum?`t${t}_c${c}_drum_clear`:`t${t}_c${c}_clear`),"0"); }
function openClipMenu(t,c,anchor){
  const wasOpen=clipMenuEl&&clipMenuEl.dataset.tc===t+":"+c;
  closeClipMenu(); if(wasOpen) return;
  const has=!!M.tracks[t].has[c];
  const cb=clipClipboard;
  const canPaste=cb&&M.tracks[cb.t].pm===M.tracks[t].pm&&!(cb.t===t&&cb.c===c)&&M.tracks[cb.t].has[cb.c];
  /* duplicate target: first empty slot after c in this track (wrapping) */
  let dupC=-1; for(let i=1;i<16;i++){ const cc=(c+i)%16; if(!M.tracks[t].has[cc]){ dupC=cc; break; } }
  const el=document.createElement("div"); el.className="clipmenu"; el.dataset.tc=t+":"+c;
  const item=(id,label,dis,title)=>`<button id="${id}"${dis?" disabled":""}${title?` title="${title}"`:""}>${label}</button>`;
  el.innerHTML=
    item("cmDup",`Duplicate${dupC>=0?" → "+SCENE_LETTERS[dupC]:""}`,!has||dupC<0,dupC<0?"no empty slot in this track":"copy into the next empty slot")+
    item("cmCopy","Copy",!has)+
    item("cmCut","Cut",!has,"marks the clip; pasting moves it")+
    item("cmPaste","Paste",!canPaste,cb?(canPaste?"":"clipboard clip is a different track type"):"nothing copied")+
    item("cmDel","Delete",!has);
  document.body.appendChild(el);
  const done=()=>{ closeClipMenu(); afterEdit(); renderSession(); pullSoon(); };
  el.querySelector("#cmDup").onclick=()=>{ clipCopyOp({t,c},{t,c:dupC}); M.tracks[t].has[dupC]=true; done(); };
  el.querySelector("#cmCopy").onclick=()=>{ clipClipboard={t,c,pm:M.tracks[t].pm,cut:false}; closeClipMenu(); renderSession(); };
  el.querySelector("#cmCut").onclick=()=>{ clipClipboard={t,c,pm:M.tracks[t].pm,cut:true}; closeClipMenu(); renderSession(); };
  el.querySelector("#cmPaste").onclick=()=>{ clipCopyOp({t:cb.t,c:cb.c},{t,c});
    M.tracks[t].has[c]=true;
    if(cb.cut){ clipClearOp(cb.t,cb.c); M.tracks[cb.t].has[cb.c]=false; clipClipboard=null; }
    done(); };
  el.querySelector("#cmDel").onclick=()=>{ clipClearOp(t,c); M.tracks[t].has[c]=false;
    if(cb&&cb.t===t&&cb.c===c) clipClipboard=null; done(); };
  const r=anchor.getBoundingClientRect();
  el.style.left=Math.max(6,Math.min(window.innerWidth-140,r.left))+"px";
  el.style.top=Math.min(window.innerHeight-190,r.bottom+4)+"px";
  clipMenuEl=el;
  setTimeout(()=>document.addEventListener("pointerdown",clipMenuOutside,true),0);
}
/* perform a clip move/copy via clip_copy + (move) clearing the source */
function dropClip(src,dst,copy){
  const drum=M.tracks[src.t].pm===1;
  R.setParam(P+(drum?"drum_clip_copy":"clip_copy"), `${src.t} ${src.c} ${dst.t} ${dst.c}`);
  if(!copy) R.setParam(P+(drum?`t${src.t}_c${src.c}_drum_clear`:`t${src.t}_c${src.c}_clear`),"0");
  /* optimistic grid update */
  M.tracks[dst.t].has[dst.c]=true; if(!copy) M.tracks[src.t].has[src.c]=false;
  afterEdit(); renderSession();
  setTimeout(()=>selectClip(dst.t,dst.c),160);
}
/* per-track settings dropdown (route + MIDI channel), anchored under the gear.
 * Mirrors the global ⚙ popover's open/close model: outside-click / second-gear
 * click closes; the gear's own click toggles. */
let trackGearEl=null;
function closeTrackGear(){ if(trackGearEl){ trackGearEl.remove(); trackGearEl=null;
  document.removeEventListener("pointerdown",trackGearOutside,true); } }
function trackGearOutside(e){ if(trackGearEl && !trackGearEl.contains(e.target) && !e.target.closest(".strk-gear")) closeTrackGear(); }
function openTrackGear(t,anchor){
  const wasOpen = trackGearEl && trackGearEl.dataset.t===String(t);
  closeTrackGear();
  if(wasOpen) return;                       /* second click on same gear → toggle closed */
  const tr=M.tracks[t]; if(!tr) return;
  const routeVal = tr.route===2?"external":tr.route===0?"schwung":"move";
  const el=document.createElement("div"); el.className="trkgear"; el.dataset.t=String(t);
  el.innerHTML=
    `<h4>Track ${t+1}</h4>`+
    `<div class="tgrow"><span>Instrument</span><select id="tgRoute" class="full">`+
      `<option value="schwung">Schwung</option><option value="move">Move</option><option value="external">MIDI</option>`+
      `</select></div>`+
    `<div class="tgrow"><span>MIDI Channel</span><select id="tgChan" class="full">`+
      Array.from({length:16},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")+`</select></div>`+
    `<div class="tgrow tgviews"><span>Open in</span>`+
      `<button id="tgMix" class="sm">Mixer</button><button id="tgSound" class="sm">Sound</button></div>`;
  document.body.appendChild(el);
  el.querySelector("#tgRoute").value=routeVal;
  el.querySelector("#tgChan").value=String(tr.chan||1);
  el.querySelector("#tgRoute").onchange=e=>{ R.setParam(P+`t${t}_route`, e.target.value); afterEdit(); pullSoon(); };
  el.querySelector("#tgChan").onchange=e=>{ R.setParam(P+`t${t}_channel`, String(e.target.value)); afterEdit(); pullSoon(); };
  el.querySelector("#tgMix").onclick=()=>{ closeTrackGear(); jumpTo("mix", t); };
  el.querySelector("#tgSound").onclick=()=>{ closeTrackGear(); jumpTo("sound", t); };
  const r=anchor.getBoundingClientRect();
  el.style.left=Math.max(6,Math.min(window.innerWidth-194, r.left))+"px";
  el.style.top=(r.bottom+4)+"px";
  trackGearEl=el;
  setTimeout(()=>document.addEventListener("pointerdown",trackGearOutside,true),0);
}
function selectClip(t,c){
  R.setParam(P+`t${t}_c${c}_ruisel`,"");
  selNote=null; selStep=-1; selDrum=null; allLanes=false; ccSel=-1;   /* new clip → drop selections + All-Lanes + automation focus */
  if(M){ M.sel.t=t; M.sel.c=c; renderSession(); renderChrome(); }
  /* selection is not an edit — pull the newly-selected clip promptly */
  suppressRefreshUntil=0; setTimeout(refresh,30);
}

/* ================= unified piano-roll engine (touch + mouse) =================
 * ONE coordinate system for melodic + drum: px-per-tick horizontally, a fixed
 * left GUTTER (pitch names / drum-lane names) and top RULER (bars) that stay
 * frozen while the note area scrolls. The canvas is sized to the VIEWPORT and we
 * manage scroll/zoom ourselves (scrollX/scrollY, px) — so the gutter+ruler stay
 * put, zoom anchors under the finger, and the playhead is smooth per-tick
 * (faithful to the device's absolute-tick storage). Pointer Events unify
 * mouse + touch: tap empty = add, drag note = move, fat right edge = resize,
 * long-press = delete, one-finger drag empty = pan, two-finger = pinch-zoom+pan;
 * mouse keeps right-click/alt delete + wheel-scroll + ctrl-wheel zoom. */
const cv=document.getElementById("rollcanvas"), ctx=cv.getContext("2d");
const vc=document.getElementById("velcanvas"), vctx=vc.getContext("2d");
const ac=document.getElementById("autocanvas"), actx=ac.getContext("2d");
let AVW=880, AVH=70;
let ccSel=-1;                    /* focused automation lane (knob index) or -1 */
/* collapsible band state (persisted like the accordion prefs, dbx_*Open) */
let velOpen=true, autoOpen=false;
try{ const v=localStorage.getItem("dbx_velOpen"); if(v!=null) velOpen=JSON.parse(v); }catch(e){}
try{ const v=localStorage.getItem("dbx_autoOpen"); if(v!=null) autoOpen=JSON.parse(v); }catch(e){}
function saveBands(){ try{ localStorage.setItem("dbx_velOpen",JSON.stringify(velOpen));
  localStorage.setItem("dbx_autoOpen",JSON.stringify(autoOpen)); }catch(e){} }
let selStep=-1;   /* selected step index for the step-param editor (or -1) */
const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const noteName=n=>NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1);
const BLACK_KEY=[0,1,0,1,0,0,1,0,1,0,1,0];
let tool="draw";                 /* "draw" | "select" | "erase" */
let selSet=new Set();            /* multi-selection (Select tool): keys "tick:pitch" */
let marquee=null;                /* {x0,y0,x1,y1} during a Select-tool drag */
const nKey=n=>n.tick+":"+n.pitch;
function isNoteSelected(n){ return (selSet.size&&selSet.has(nKey(n))) || (selNote&&selNote.tick===n.tick&&selNote.pitch===n.pitch); }
const ZB=18;                                  /* px: edge zoom-band thickness reserved at top of ruler / left of gutter for the zoom strips (must match .zoomstrip zh height / zv width) */
const GUTTER=48+ZB, RULER=24+ZB, STEPBAND=28; /* px: left gutter, top ruler (+loop brace), bottom step-edit band — gutter/ruler each gain ZB so the zoom strips sit in an empty band clear of the brace + pitch labels */
let VW=880, VH=400, VVW=880, VVH=56;          /* css px of the main + velocity canvases */
let PXPERTICK=0.6, ROWH=14, scrollX=0, scrollY=0;
const MIN_PX=0.03, MAX_PX=8, MIN_ROWH=6, MAX_ROWH=42;
/* row model: melodic = pitches 127..0 (folded to in-scale rows when scale-aware);
 * drum = one row per lane. rowList[r] = pitch (melodic), descending. */
let rowList=[], rowMap={};
function buildRows(){ rowList=[]; rowMap={}; if(!M||isDrum()) return;
  const fold=!!(M.glob&&M.glob.scaleAware&&M.scaleMask);
  for(let p=127;p>=0;p--){ if(fold && !M.scaleMask[((p%12)+12)%12]) continue; rowMap[p]=rowList.length; rowList.push(p); }
  if(!rowList.length) for(let p=127;p>=0;p--){ rowMap[p]=rowList.length; rowList.push(p); } }
function nRows(){ return isDrum()?(M&&M.dlanes?M.dlanes.length:0):rowList.length; }
function rowIdxForPitch(p){ if(p in rowMap) return rowMap[p];
  let best=0,bd=1e9; for(let i=0;i<rowList.length;i++){ const d=Math.abs(rowList[i]-p); if(d<bd){bd=d;best=i;} } return best; }
/* the grid/time reference: melodic clip, or (drum) the selected lane else lane 0 */
function gridTps(){ return isDrum()?(M.laneInfo?M.laneInfo.tps:M.clip.tps):M.clip.tps; }
function gridLen(){ return isDrum()?(M.laneInfo?M.laneInfo.len:M.clip.len):M.clip.len; }
function gridTicks(){ return Math.max(1,gridLen()*gridTps()); }
function maxTick(){ return Math.max(1,M.clip.len*M.clip.tps); }
/* PPQN=96 → beat=96 ticks, bar=384 ticks (4/4 hardwired on device) */
const BEAT_TICKS=96, BAR_TICKS=384;
/* loop window in steps [ls, ls+len) and the drawn extent (covers loop + content
 * so the loop brace has room and out-of-loop notes are visible). */
function loopStartSteps(){ return isDrum()?(M.laneInfo?M.laneInfo.ls:0):(M.clip.ls||0); }
function loopTicks(){ return [loopStartSteps()*gridTps(), (loopStartSteps()+gridLen())*gridTps()]; }
function displayTicks(){ const [,le]=loopTicks(); let last=le;
  const arr=isDrum()?(M.dnotes[M.sel.lane]||[]):(M.notes||[]);
  arr.forEach(n=>{ const t=n.tick+(n.gate||0); if(t>last) last=t; });
  /* round up to a whole bar so the ruler ends cleanly, min one loop-window past 0 */
  return Math.max(gridTps(), Math.ceil(last/BAR_TICKS)*BAR_TICKS || le); }
/* loop brace hit test (ruler) + apply */
function loopHandleAt(px){ const [lsT,leT]=loopTicks(); const xL=xOfTick(lsT), xR=xOfTick(leT), grab=12;
  if(Math.abs(px-xL)<=grab) return "start";
  if(Math.abs(px-xR)<=grab) return "end";
  if(px>xL&&px<xR) return "body"; return null; }
let loopEmitT=0;
function setLoop(ls,len,commit){ ls=Math.max(0,Math.min(255,ls|0)); len=Math.max(1,len|0); if(ls+len>256) len=256-ls;
  if(isDrum()){ if(M.laneInfo){ M.laneInfo.ls=ls; M.laneInfo.len=len; } } else { M.clip.ls=ls; M.clip.len=len; }
  clampScroll();
  /* automation focus: the brace edits the focused CC lane's loop instead of the clip's */
  /* drum: All-Lanes mode sets every lane's loop (matches the drum panel's loop-start
   * slider laneEmit(...,"all_lanes_loop_set")); single-lane writes the selected lane. */
  const key=(!isDrum()&&ccSel>=0)?`t${M.sel.t}_c${ccClip()}_k${ccSel}_cc_loop_set`
    :isDrum()?(allLanes?`t${M.sel.t}_all_lanes_loop_set`:`t${M.sel.t}_l${M.sel.lane}_loop_set`)
    :`t${M.sel.t}_c${M.sel.c}_loop_set`;
  const n=now(); if(commit||n-loopEmitT>55){ loopEmitT=n; R.setParam(P+key,String(ls*65536+len)); afterEdit(); }
  if(commit) pullSoon(); }
function maxEditTick(){ return displayTicks(); }   /* placement/clamp extent = drawn extent */
/* screen<->data transforms (all in css px relative to the main canvas) */
const xOfTick=t=>GUTTER + t*PXPERTICK - scrollX;
const tickOfX=x=>(x-GUTTER+scrollX)/PXPERTICK;
const yOfRow=r=>RULER + r*ROWH - scrollY;
const rowOfY=y=>Math.floor((y-RULER+scrollY)/ROWH);
const pitchAt=y=>{ const r=Math.max(0,Math.min(rowList.length-1,rowOfY(y))); return rowList.length?rowList[r]:60; };
/* drum lanes are drawn first-at-BOTTOM: lane l ↔ row (nLanes-1-l) */
function rowOfLane(l){ const n=(M&&M.dlanes)?M.dlanes.length:1; return n-1-l; }
function laneOfY(y){ const n=(M&&M.dlanes)?M.dlanes.length:1; return n-1-rowOfY(y); }
function snapPitch(pi){ if(!(M&&M.glob&&M.glob.scaleAware)||!M.scaleMask) return pi;
  for(let d=0;d<12;d++){ const up=pi+d,dn=pi-d;
    if(up<=127&&M.scaleMask[((up%12)+12)%12])return up; if(dn>=0&&M.scaleMask[((dn%12)+12)%12])return dn; } return pi; }
/* Snap select (ticks) — 0 = Off (free at integer ticks); Shift forces free. */
function snapTicks(){ const n=+document.getElementById("snap").value; return isNaN(n)?gridTps():n; }
function snap(t,free){ const s=snapTicks(); if(free||s<=0) return Math.max(0,Math.round(t)); return Math.round(t/s)*s; }
/* click-to-ADD floors to the cell the pointer is IN — round-to-nearest sent
 * right-half clicks to the NEXT slot. Moves/nudges keep round-snap (snap()). */
function snapAdd(t,free){ const s=snapTicks(); if(free||s<=0) return Math.max(0,Math.round(t)); return Math.floor(t/s)*s; }
function gateDefault(){ return snapTicks()||gridTps(); }
function noteAreaW(){ return VW-GUTTER; }
function noteAreaH(){ return VH-RULER-STEPBAND; }
function contentW(){ return displayTicks()*PXPERTICK; }
function endTick(){ return displayTicks(); }
function contentH(){ return nRows()*ROWH; }
function clampScroll(){
  scrollX=Math.max(0,Math.min(scrollX,Math.max(0,contentW()-noteAreaW())));
  scrollY=Math.max(0,Math.min(scrollY,Math.max(0,contentH()-noteAreaH()))); }
/* center the vertical view on the clip's note content (melodic) / top (drum) */
function centerOnContent(){ scrollX=0;
  if(isDrum()){ scrollY=0; clampScroll(); return; }
  let lo=127,hi=0,any=false; M.notes.forEach(n=>{any=true; lo=Math.min(lo,n.pitch); hi=Math.max(hi,n.pitch);});
  if(!any){ lo=hi=60; }
  const r=rowIdxForPitch(Math.round((lo+hi)/2));
  scrollY=r*ROWH - noteAreaH()/2 + ROWH/2; clampScroll(); }
let centerKey="";
function layout(){
  buildRows();
  const view=document.getElementById("rollview"), dpr=window.devicePixelRatio||1;
  VW=Math.max(300,view.clientWidth||880); VH=Math.max(150,view.clientHeight||400);
  cv.style.width=VW+"px"; cv.style.height=VH+"px"; cv.width=Math.round(VW*dpr); cv.height=Math.round(VH*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const vw=document.getElementById("velwrap");
  VVW=Math.max(300,vw.clientWidth||VW); VVH=vw.clientHeight||56;
  vc.style.width=VVW+"px"; vc.style.height=VVH+"px"; vc.width=Math.round(VVW*dpr); vc.height=Math.round(VVH*dpr);
  vctx.setTransform(dpr,0,0,dpr,0,0);
  const aw=document.getElementById("autowrap");
  if(aw && aw.style.display!=="none" && aw.clientHeight>0){ AVW=Math.max(300,aw.clientWidth||VW); AVH=aw.clientHeight||70;
    ac.style.width=AVW+"px"; ac.style.height=AVH+"px"; ac.width=Math.round(AVW*dpr); ac.height=Math.round(AVH*dpr);
    actx.setTransform(dpr,0,0,dpr,0,0); }
  if(!M) return;
  /* on a fresh clip selection: fit the clip width and re-center on content */
  const ck=M.sel.t+":"+M.sel.c+":"+(isDrum()?"d":"m");
  if(ck!==centerKey){ centerKey=ck; fitView(); }
  clampScroll();
}
/* fit horizontal zoom so the whole clip is comfortably visible, pick a sensible
 * row height, then center vertically on the content. */
function fitView(){
  PXPERTICK=Math.max(MIN_PX,Math.min(MAX_PX, noteAreaW()/displayTicks()));
  /* drum: default vertical zoom shows ~16 lanes (not all 32 squeezed in) */
  if(isDrum()) ROWH=Math.max(MIN_ROWH,Math.min(24,Math.floor(noteAreaH()/Math.min(16,Math.max(1,nRows())))||14));
  else ROWH=14;
  centerOnContent();
}
function zoomAroundX(f,fx){ const t=tickOfX(fx); PXPERTICK=Math.max(MIN_PX,Math.min(MAX_PX,PXPERTICK*f));
  scrollX=(GUTTER + t*PXPERTICK) - fx; clampScroll(); draw(); }
function zoomAroundY(f,fy){ const r=(fy-RULER+scrollY)/ROWH; ROWH=Math.max(MIN_ROWH,Math.min(MAX_ROWH,Math.round(ROWH*f)));
  scrollY=(RULER + r*ROWH) - fy; clampScroll(); draw(); }
function zoomH(f){ zoomAroundX(f, GUTTER+noteAreaW()/2); }
function zoomV(f){ zoomAroundY(f, RULER+noteAreaH()/2); }
function zoomReset(){ fitView(); draw(); }

/* ---------- draw ---------- */
function visRows(){ const r0=Math.max(0,Math.floor(scrollY/ROWH));
  const r1=Math.min(nRows()-1,Math.floor((scrollY+noteAreaH())/ROWH)); return [r0,r1]; }
function draw(){
  if(!M) return;
  const drum=isDrum(), hasDrumData = drum && M.dlanes && M.dlanes.length;
  document.getElementById("drumph").style.display=(drum && !hasDrumData)?"flex":"none";
  cv.style.display=(drum && !hasDrumData)?"none":"block";
  if(drum && !hasDrumData){ drawVel(); return; }
  ctx.clearRect(0,0,VW,VH); ctx.fillStyle="#15171c"; ctx.fillRect(0,0,VW,VH);
  ctx.textBaseline="middle";
  /* note-area content is clipped so it never paints over the frozen ruler/gutter/step band */
  ctx.save(); ctx.beginPath(); ctx.rect(GUTTER,RULER,VW-GUTTER,noteAreaH()); ctx.clip();
    if(drum) drawLaneBodies(); else drawPitchBodies();
    drawGrid(); if(drum) drawDrumHits(); else drawNotes(); drawLoopShade(); drawMarquee();
  ctx.restore();
  drawStepBand(); drawRuler(); drawLoopBrace(); if(drum) drawGutterDrum(); else drawGutterMelodic();
  ctx.fillStyle="#13161b"; ctx.fillRect(0,0,GUTTER,RULER);                  /* corner */
  ctx.strokeStyle="#000"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(GUTTER+0.5,0); ctx.lineTo(GUTTER+0.5,VH);
  ctx.moveTo(0,RULER+0.5); ctx.lineTo(VW,RULER+0.5); ctx.stroke();
  drawVel();
  drawAuto();
}
function drawPitchBodies(){ const [r0,r1]=visRows(), sk=(M.glob?M.glob.key:0)%12;
  for(let r=r0;r<=r1;r++){ const p=rowList[r], s=((p%12)+12)%12, blk=BLACK_KEY[s], y=yOfRow(r);
    const inScale=M.scaleMask?M.scaleMask[s]:true, root=(s===sk);
    ctx.fillStyle = root?(blk?"#243a39":"#2b4544"):inScale?(blk?"#1c2630":"#222c38"):(blk?"#141619":"#181b21");
    ctx.fillRect(GUTTER,y,VW-GUTTER,ROWH-1);
    if(s===0){ ctx.strokeStyle="#2c333f"; ctx.beginPath(); ctx.moveTo(GUTTER,y+0.5); ctx.lineTo(VW,y+0.5); ctx.stroke(); } }
}
function drawLaneBodies(){ const [r0,r1]=visRows(), n=M.dlanes.length;
  for(let r=r0;r<=r1;r++){ const l=n-1-r; if(l<0||l>=n) continue; const y=yOfRow(r), selL=(l===M.sel.lane), ln=M.dlanes[l];
    ctx.fillStyle=(l%2)?"#191c22":"#1d212a"; ctx.fillRect(GUTTER,y,VW-GUTTER,ROWH-1);
    /* per-lane loop overview: dim each lane outside its own [ls, ls+len) window so
     * you can see where every lane starts/stops at a glance (needs DSP loop fields). */
    if(ln && ln.len!==undefined){ const lt=ln.tps||gridTps(), xL=xOfTick((ln.ls||0)*lt), xR=xOfTick(((ln.ls||0)+ln.len)*lt);
      ctx.fillStyle="rgba(8,9,12,0.5)";
      if(xL>GUTTER) ctx.fillRect(GUTTER,y,Math.min(xL,VW)-GUTTER,ROWH-1);
      if(xR<VW)     ctx.fillRect(Math.max(GUTTER,xR),y,VW-Math.max(GUTTER,xR),ROWH-1);
      ctx.fillStyle="rgba(255,207,77,0.45)";
      if(xR>=GUTTER&&xR<=VW) ctx.fillRect(Math.round(xR),y,1,ROWH-1);
      if(xL>GUTTER&&xL<=VW)  ctx.fillRect(Math.round(xL),y,1,ROWH-1); }
    if(selL){ ctx.fillStyle="rgba(57,208,200,0.10)"; ctx.fillRect(GUTTER,y,VW-GUTTER,ROWH-1); } }
}
/* grid lines are MUSICAL (bar=384t, beat=96t) so they stay correct at every step
 * resolution; light step lines only when they're distinct from beats and there's room. */
function vline(x,top,bot){ ctx.beginPath(); ctx.moveTo(Math.round(x)+0.5,top); ctx.lineTo(Math.round(x)+0.5,bot); ctx.stroke(); }
function drawGrid(){ const tps=gridTps(), endT=endTick(), top=RULER, bot=VH-STEPBAND;
  /* the fine tier follows the toolbar Snap setting (falls back to the clip's
   * step size when Snap is free/unset) so what you see is where notes land */
  const sn=snapTicks(), fine=(sn>0?sn:tps);
  const stepPx=fine*PXPERTICK, beatPx=BEAT_TICKS*PXPERTICK;
  /* three-tier contrast: step < beat < bar — deliberately strong (round-2's
   * subtle bump was still too faint on the device's dark theme per Josh). */
  if(stepPx>=5 && fine<BEAT_TICKS){ ctx.strokeStyle="#49536b"; ctx.lineWidth=1;
    for(let t=0;t<=endT;t+=fine){ if(t%BEAT_TICKS===0) continue; const x=xOfTick(t); if(x<GUTTER-1||x>VW) continue; vline(x,top,bot); } }
  if(beatPx>=11){ ctx.strokeStyle="#6e7da3"; ctx.lineWidth=1;
    for(let t=0;t<=endT;t+=BEAT_TICKS){ if(t%BAR_TICKS===0) continue; const x=xOfTick(t); if(x<GUTTER-1||x>VW) continue; vline(x,top,bot); } }
  ctx.strokeStyle="#9aa8d0"; ctx.lineWidth=2;
  for(let t=0;t<=endT;t+=BAR_TICKS){ const x=xOfTick(t); if(x<GUTTER-1||x>VW) continue; vline(x,top,bot); }
  ctx.lineWidth=1;
}
function drawNotes(){ const [r0,r1]=visRows(), tps=gridTps(), ac=rollAccent();
  M.notes.forEach(nt=>{ const r=rowIdxForPitch(nt.pitch); if(r<r0-1||r>r1+1) return;
    const x=xOfTick(nt.tick), w=Math.max(3,nt.gate*PXPERTICK), y=yOfRow(r); if(x>VW||x+w<GUTTER) return;
    const sel=isNoteSelected(nt), inStep=selStep>=0 && noteStep(nt.tick,tps)===selStep;
    ctx.fillStyle=hexA(ac,0.32+0.68*(nt.vel/127)); ctx.fillRect(x,y+1,w,ROWH-2);
    ctx.strokeStyle=sel?"#ffcf4d":(inStep?"#9d86ff":"#0c2e2c"); ctx.lineWidth=(sel||inStep)?2:1; ctx.strokeRect(x+0.5,y+1.5,Math.max(1,w-1),ROWH-3);
    if(sel && w>18){ ctx.fillStyle="#ffcf4d"; ctx.fillRect(x+w-3,y+1,2,ROWH-2); } });
}
function drawDrumHits(){ const [r0,r1]=visRows(), tps=gridTps(), n=M.dlanes.length, ac=rollAccent();
  for(const L in M.dnotes){ const l=+L; if(l>=n) continue; const row=n-1-l; if(row<r0-1||row>r1+1) continue;
    const dim=M.dlanes[l]&&M.dlanes[l].mute?0.32:1, y=yOfRow(row);
    M.dnotes[L].forEach(h=>{ const x=xOfTick(h.tick), w=Math.max(5,h.gate*PXPERTICK); if(x>VW||x+w<GUTTER) return;
      const sel=selDrum&&selDrum.lane===l&&selDrum.tick===h.tick;
      const inStep=selStep>=0 && l===M.sel.lane && noteStep(h.tick,tps)===selStep;
      ctx.fillStyle=hexA(ac,(0.38+0.62*(h.vel/127))*dim); ctx.fillRect(x,y+2,w,ROWH-4);
      ctx.strokeStyle=sel?"#ffcf4d":(inStep?"#9d86ff":"#0c2e2c"); ctx.lineWidth=(sel||inStep)?2:1; ctx.strokeRect(x+0.5,y+2.5,Math.max(1,w-1),ROWH-5); }); }
}
/* smooth playhead — see the rAF extrapolation block near the poll loop; the line
 * is a DOM overlay (#playhead) moved per-frame, not painted into the roll. */
/* musical ruler: numbered bars, beat ticks when zoomed in; label density adapts
 * to zoom so numbers never crowd or vanish. */
function drawRuler(){ ctx.fillStyle="#13161b"; ctx.fillRect(GUTTER,0,VW-GUTTER,RULER);
  const endT=endTick(), barPx=BAR_TICKS*PXPERTICK, beatPx=BEAT_TICKS*PXPERTICK;
  ctx.font="10px ui-monospace,monospace"; ctx.textBaseline="middle";
  let everyBars=1; while(everyBars*barPx<44) everyBars*=2;     /* keep labels ~>=44px apart */
  if(beatPx>=24){ ctx.strokeStyle="#2a3040"; ctx.lineWidth=1;
    for(let t=0;t<=endT;t+=BEAT_TICKS){ if(t%BAR_TICKS===0) continue; const x=xOfTick(t); if(x<GUTTER||x>VW) continue;
      vline(x,RULER-6,RULER); } }
  ctx.lineWidth=1;
  for(let bar=0; bar*BAR_TICKS<=endT; bar++){ const x=xOfTick(bar*BAR_TICKS); if(x<GUTTER-30||x>VW) continue;
    ctx.strokeStyle="#3c4456"; vline(x,ZB,RULER);
    if(bar%everyBars===0){ ctx.fillStyle="#808995"; ctx.fillText(String(bar+1), x+4, (ZB+RULER)/2); } }
  ctx.strokeStyle="#000"; ctx.beginPath(); ctx.moveTo(GUTTER,RULER-0.5); ctx.lineTo(VW,RULER-0.5); ctx.stroke();
}
/* dim the out-of-loop region so the playing window [ls,ls+len) is obvious */
function drawLoopShade(){ const [lsT,leT]=loopTicks(); const xL=xOfTick(lsT), xR=xOfTick(leT), yT=RULER, h=noteAreaH();
  ctx.fillStyle="rgba(8,9,12,0.5)";
  if(xL>GUTTER) ctx.fillRect(GUTTER,yT,Math.min(xL,VW)-GUTTER,h);
  if(xR<VW)     ctx.fillRect(Math.max(GUTTER,xR),yT,VW-Math.max(GUTTER,xR),h);
  ctx.strokeStyle="rgba(255,207,77,0.5)"; ctx.lineWidth=1;
  if(xL>=GUTTER&&xL<=VW) vline(xL,yT,VH-STEPBAND);
  if(xR>=GUTTER&&xR<=VW) vline(xR,yT,VH-STEPBAND);
}
/* draggable loop brace in the ruler: body = move loop_start, ends = resize length */
function drawLoopBrace(){ const [lsT,leT]=loopTicks(); const xL=xOfTick(lsT), xR=xOfTick(leT);
  const a=Math.max(GUTTER,xL), b=Math.min(VW,xR);
  if(b>a){ ctx.fillStyle="rgba(255,207,77,0.9)"; ctx.fillRect(a,ZB,b-a,3); }
  ctx.fillStyle="#ffcf4d";
  if(xL>=GUTTER&&xL<=VW){ ctx.fillRect(xL,ZB,3,RULER-ZB); ctx.fillRect(xL,ZB,9,4); }
  if(xR>=GUTTER&&xR<=VW){ ctx.fillRect(xR-3,ZB,3,RULER-ZB); ctx.fillRect(xR-9,ZB,9,4); }
}
/* marquee selection rectangle (Select tool) */
function drawMarquee(){ if(!marquee) return; const x=Math.min(marquee.x0,marquee.x1), y=Math.min(marquee.y0,marquee.y1),
  w=Math.abs(marquee.x1-marquee.x0), h=Math.abs(marquee.y1-marquee.y0);
  ctx.fillStyle="rgba(57,208,200,0.12)"; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="#39d0c8"; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,w,h); }
/* The step-trig band is a SEPARATE control surface from the note roll (steps gate
 * iteration/probability/ratchet/nudge, not pitch) — so it gets its own dark panel,
 * a violet separator + "STEP" label, and button-style cells in a violet/blue family
 * (distinct from the teal note roll). */
function drawStepBand(){ const y0=VH-STEPBAND;
  ctx.fillStyle="#100d18"; ctx.fillRect(0,y0,VW,STEPBAND);               /* violet-tinted panel */
  ctx.fillStyle="#181426"; ctx.fillRect(0,y0,GUTTER,STEPBAND);
  ctx.fillStyle="#6a5aa8"; ctx.fillRect(0,y0,VW,3);                       /* bold accent separator */
  ctx.fillStyle="#b3a4ee"; ctx.font="bold 8px ui-monospace,monospace"; ctx.textBaseline="middle";
  ctx.fillText("STEP",6,y0+STEPBAND/2-4); ctx.fillText("EDIT",6,y0+STEPBAND/2+6);
  const drum=isDrum(); if(drum && M.sel.lane<0) return;
  const tps=gridTps(), len=gridLen(), noteSet=new Set();
  (drum?(M.dnotes[M.sel.lane]||[]):M.notes).forEach(n=>noteSet.add(noteStep(n.tick,tps)));
  const yc=y0+5, hc=STEPBAND-8;
  for(let s=0;s<len;s++){ const xa=xOfTick(s*tps), xb=xOfTick((s+1)*tps); if(xb<GUTTER||xa>VW) continue;
    const x=Math.max(GUTTER+1.5,xa)+1, w=Math.max(2,xb-xa-3);
    const tr=M.stepTrig[s], hasTrig=tr&&(tr.iter||tr.rand||tr.ratch||tr.nudge), hasNote=noteSet.has(s), selS=(s===selStep);
    ctx.fillStyle = selS?"#39d0c8":hasTrig?"#6b54c6":hasNote?"#2a2746":"#1b1830";
    ctx.fillRect(x,yc,w,hc);
    ctx.strokeStyle = selS?"#bdf6f1":hasTrig?"#b9a6ff":"#4a4570"; ctx.lineWidth=2;     /* BOLD outlines */
    ctx.strokeRect(x+1,yc+1,Math.max(1,w-2),hc-2);
    if(hasTrig&&!selS){ ctx.fillStyle="#e0d6ff"; ctx.fillRect(x+w-4,yc+2,3,3); } }
}
function drawGutterMelodic(){ ctx.fillStyle="#171a20"; ctx.fillRect(0,RULER,GUTTER,VH-RULER-STEPBAND);
  const [r0,r1]=visRows(), sk=(M.glob?M.glob.key:0)%12; ctx.font="9px ui-monospace,monospace";
  for(let r=r0;r<=r1;r++){ const p=rowList[r], s=((p%12)+12)%12, blk=BLACK_KEY[s], y=yOfRow(r);
    ctx.fillStyle=blk?"#0e1014":"#262a31"; ctx.fillRect(GUTTER-13,y,13,ROWH-1);
    if(s===sk){ ctx.fillStyle="rgba(57,208,200,0.55)"; ctx.fillRect(GUTTER-13,y,3,ROWH-1); }
    if(ROWH>=11 || s===0){ ctx.fillStyle=(s===0)?"#9aa1ae":(s===sk?"#39d0c8":"#5a606c"); ctx.fillText(noteName(p),ZB+3,y+ROWH/2); } }
  /* (step-band gutter + STEP label are painted by drawStepBand) */
}
function drawGutterDrum(){ ctx.fillStyle="#171a20"; ctx.fillRect(0,RULER,GUTTER,VH-RULER-STEPBAND);
  const [r0,r1]=visRows(), n=M.dlanes.length; ctx.font="9px ui-monospace,monospace";
  for(let r=r0;r<=r1;r++){ const l=n-1-r; if(l<0||l>=n) continue; const ln=M.dlanes[l], selL=(l===M.sel.lane), y=yOfRow(r);
    if(selL){ ctx.fillStyle="rgba(57,208,200,0.12)"; ctx.fillRect(0,y,GUTTER,ROWH-1); ctx.fillStyle="#39d0c8"; ctx.fillRect(ZB,y,3,ROWH-1); }
    ctx.globalAlpha=ln&&ln.has?1:0.5; ctx.fillStyle=selL?"#cfe9e7":(ln&&ln.has?"#aeb4c0":"#6b707c");
    ctx.fillText(ln?noteName(ln.note):("L"+l),ZB+7,y+ROWH/2); ctx.globalAlpha=1;
    if(ln&&(ln.mute||ln.solo)){ ctx.fillStyle=ln.solo?"#ffcf4d":"#e88"; ctx.fillText(ln.solo?"S":"M",GUTTER-10,y+ROWH/2); } }
  /* (step-band gutter + STEP label are painted by drawStepBand) */
}
function drawVel(){ if(!velOpen) return; vctx.clearRect(0,0,VVW,VVH); vctx.fillStyle="#0e1014"; vctx.fillRect(0,0,VVW,VVH);
  /* faint value reference lines at 127 / 64 / 1 */
  [127,64,1].forEach(v=>{ const y=VVH-3-(v/127)*(VVH-10);
    vctx.strokeStyle="rgba(74,85,110,0.35)"; vctx.beginPath(); vctx.moveTo(GUTTER,y); vctx.lineTo(VVW,y); vctx.stroke(); });
  vctx.fillStyle="#171a20"; vctx.fillRect(0,0,GUTTER,VVH);
  vctx.fillStyle="#5a606c"; vctx.font="9px ui-monospace,monospace"; vctx.textBaseline="middle"; vctx.fillText("VEL",6,VVH/2);
  /* value axis in the gutter */
  vctx.font="8px ui-monospace,monospace"; vctx.textAlign="right";
  vctx.fillText("127",GUTTER-3,Math.max(6,VVH-3-(VVH-10)));
  if(VVH>=64) vctx.fillText("64",GUTTER-3,VVH-3-(64/127)*(VVH-10));
  vctx.fillText("1",GUTTER-3,VVH-4);
  vctx.textAlign="left";
  if(!M) return; const drum=isDrum(), ac=rollAccent();
  const notes = drum ? (M.sel.lane>=0?(M.dnotes[M.sel.lane]||[]):[]) : M.notes;
  const tps=gridTps(), len=gridLen();
  for(let s=0;s<=len;s+=4){ const x=xOfTick(s*tps); if(x<GUTTER||x>VVW) continue;
    vctx.strokeStyle=(s%16===0)?"#262c36":"#1a1e25"; vctx.beginPath(); vctx.moveTo(x,0); vctx.lineTo(x,VVH); vctx.stroke(); }
  notes.forEach(n=>{ const x=xOfTick(n.tick); if(x<GUTTER||x>VVW) return; const h=Math.max(2,(n.vel/127)*(VVH-10));
    const sel=drum?(selDrum&&selDrum.tick===n.tick):isNoteSelected(n);
    vctx.fillStyle=sel?"#ffcf4d":hexA(ac,0.45+0.55*(n.vel/127)); vctx.fillRect(x-2,VVH-h-3,4,h);
    vctx.beginPath(); vctx.arc(x,VVH-h-3,sel?6:4.5,0,7); vctx.fill(); });
}
/* ---------- step strip ---------- the per-step trig band lives inside the main
 * canvas (drawStepBand); external callers just trigger a redraw. */
function drawStepStrip(){ draw(); }
function pickStep(x){ const drum=isDrum(); if(drum&&M.sel.lane<0) return;
  const tps=gridTps(), len=gridLen(); let pick=-1;
  for(let s=0;s<len;s++){ if(x>=xOfTick(s*tps)&&x<xOfTick((s+1)*tps)){ pick=s; break; } }
  if(pick<0) return;
  /* empty steps have no notes → nothing to edit → not selectable */
  const notes=drum?(M.dnotes[M.sel.lane]||[]):M.notes;
  if(!notes.some(nt=>noteStep(nt.tick,tps)===pick)){ if(selStep>=0){ selStep=-1; draw(); renderStepEdit(); } return; }
  /* note-select and step-select are mutually exclusive */
  selNote=null; selSet.clear(); selDrum=null;
  selStep=(selStep===pick)?-1:pick; draw(); renderNoteEdit(); renderStepEdit(); }

/* ---------- hit testing ---------- (fat grab zones for touch) */
function edgeZone(w){ return Math.max(10,Math.min(20,w*0.45)); }
function noteAt(mx,my){ for(let i=M.notes.length-1;i>=0;i--){ const nt=M.notes[i];
    const r=rowIdxForPitch(nt.pitch), x=xOfTick(nt.tick), w=Math.max(3,nt.gate*PXPERTICK), y=yOfRow(r);
    if(mx>=x&&mx<=x+Math.max(w,12)&&my>=y&&my<=y+ROWH-1){ return {i,edge:(mx>=x+w-edgeZone(w))}; } }
  return null; }
function regionAt(x,y){ if(x<GUTTER&&y<RULER) return "corner";
  if(y<RULER) return "ruler"; if(x<GUTTER) return "gutter"; if(y>=VH-STEPBAND) return "stepband"; return "notes"; }

/* ---------- emit (per-track-prefixed, ≤255B) ---------- */
function emit(op,val){ R.setParam(P+`t${M.sel.t}_c${M.sel.c}_${op}`, val); afterEdit(); }
/* Batch several melodic note ops into ONE atomic tN_cC_notes_op set_param.
 * Rationale (NOT per-buffer coalescing — remote overtake_dsp: set_params ride
 * the slow shadow_param ring as serialized synchronous round-trips in the host
 * shim, no coalescing there): (1) atomicity — a multi-note edit (shift-vel,
 * move-all, multi-delete, box-nudge) applies all-or-nothing, so a partial
 * round-trip failure can't leave half the notes moved; (2) one round trip
 * instead of N; (3) one rev bump / snapshot push instead of N. The DSP
 * _notes_op handler applies the whole "<op> args;<op> args;..." string and
 * finalizes once (bumps the rev). ops = [[opChar,argStr],...]; opChar in a/d/m/r/v. */
function emitBatch(ops){ if(!ops||!ops.length) return;
  R.setParam(P+`t${M.sel.t}_c${M.sel.c}_notes_op`, ops.map(o=>`${o[0]} ${o[1]}`).join(";"));
  afterEdit(); }
function selectLane(lane){ if(lane<0||lane>=M.dlanes.length) return;
  M.sel.lane=lane; selStep=-1; selDrum=null;   /* lane change → drop step + hit selection (per-lane) */
  R.setParam(P+`t${M.sel.t}_c${M.sel.c}_ruisel`, String(lane));
  renderSidePanels(); renderChrome(); draw(); pullSoon(); }

/* ---------- pointer engine (mouse + touch unified) ---------- */
const ptrs=new Map();           /* active pointers: id → {x,y} */
let gesture=null, gData=null, didMove=false, longTimer=0, pinch=null;
function localXY(e){ const r=cv.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
function clearLong(){ if(longTimer){ clearTimeout(longTimer); longTimer=0; } }
function armLong(fn){ clearLong(); longTimer=setTimeout(()=>{ if(!didMove){ fn(); gesture=null; gData=null; dragging=false; } },550); }
function dist(a,b){ const dx=a.x-b.x,dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
function startPinch(){ clearLong(); gesture=null; const a=[...ptrs.values()]; if(a.length<2) return;
  const cx=(a[0].x+a[1].x)/2, cy=(a[0].y+a[1].y)/2;
  pinch={d:dist(a[0],a[1]),cy,px:PXPERTICK,sy:scrollY,tAt:tickOfX(cx)}; dragging=true; }
function movePinch(){ if(!pinch) return; const a=[...ptrs.values()]; if(a.length<2) return;
  const ncx=(a[0].x+a[1].x)/2, ncy=(a[0].y+a[1].y)/2, f=dist(a[0],a[1])/Math.max(1,pinch.d);
  PXPERTICK=Math.max(MIN_PX,Math.min(MAX_PX,pinch.px*f));
  scrollX=(GUTTER + pinch.tAt*PXPERTICK) - ncx;       /* pin the start tick under the moving centroid */
  scrollY=pinch.sy-(ncy-pinch.cy);                    /* two-finger vertical pan */
  clampScroll(); draw(); }
function delNoteObj(nt){ const k=M.notes.indexOf(nt); if(k<0) return;
  M.notes.splice(k,1); if(selNote&&selNote.tick===nt.tick&&selNote.pitch===nt.pitch) selNote=null;
  draw(); renderNoteEdit(); emit("note_del",`${nt.tick} ${nt.pitch}`); }
function selectedNotes(){ if(selSet.size) return M.notes.filter(n=>selSet.has(nKey(n)));
  return selNote?M.notes.filter(n=>n.tick===selNote.tick&&n.pitch===selNote.pitch):[]; }
cv.addEventListener("pointerdown",e=>{ if(!M) return; try{cv.setPointerCapture(e.pointerId);}catch(_){}
  const [x,y]=localXY(e); ptrs.set(e.pointerId,{x,y});
  if(ptrs.size>=2){ startPinch(); return; }
  const mouseDel = e.pointerType==="mouse" && (e.button===2 || e.altKey);
  const erase = tool==="erase" || mouseDel;
  const region=regionAt(x,y); didMove=false;
  if(region==="corner") return;
  if(region==="ruler"){
    if(!(isDrum()&&M.sel.lane<0)){ const lh=loopHandleAt(x);
      if(lh){ gesture="loop"; gData={mode:lh,x,ls0:loopStartSteps(),len0:gridLen()}; dragging=true; return; } }
    gesture="pan"; gData={x,y,sx:scrollX,sy:scrollY}; dragging=true; return; }
  if(region==="stepband"){ pickStep(x); return; }
  if(region==="gutter"){
    if(isDrum()){ const l=laneOfY(y); if(l>=0&&l<M.dlanes.length) selectLane(l); }
    else { gesture="pan"; gData={x,y,sx:scrollX,sy:scrollY}; dragging=true; }
    return; }
  /* ---- note area ---- */
  if(isDrum()){ const lane=laneOfY(y); if(lane<0||lane>=M.dlanes.length) return;
    if(lane!==M.sel.lane) selectLane(lane);
    const hit=drumHitAt(x,y);
    if(erase){ if(hit) drumDelete(lane,hit.tick); gesture="erase"; dragging=true; return; }
    if(hit){ selDrum={lane,tick:hit.tick}; selStep=-1; renderNoteEdit();
      gesture=hit.edge?"dresize":"dmove"; gData={lane,srcLane:lane,tick:hit.tick,o:{...M.dnotes[lane][hit.i]},gx:x-xOfTick(hit.tick)};
      dragging=true; draw(); return; }
    if(tool==="select"){ gesture="pan"; gData={x,y,sx:scrollX,sy:scrollY}; dragging=true; return; }
    gesture="add"; gData={x,y,sx:scrollX,sy:scrollY,kind:"drum",lane}; return; }
  /* melodic */
  const hit=noteAt(x,y);
  if(erase){ if(hit) delNoteObj(M.notes[hit.i]); gesture="erase"; dragging=true; return; }
  if(tool==="select"){
    if(hit){ const nt=M.notes[hit.i], k=nKey(nt);
      if(e.shiftKey){ if(selSet.has(k)) selSet.delete(k); else selSet.add(k); }
      else if(!selSet.has(k)){ selSet.clear(); selSet.add(k); }
      selNote=null; selStep=-1;
      gesture="selmove"; gData={ax:nt.tick, ar:rowIdxForPitch(nt.pitch), gx:x-xOfTick(nt.tick), gr:rowIdxForPitch(nt.pitch)-rowOfY(y),
        orig:selectedNotes().map(n=>({ref:n,t:n.tick,p:n.pitch}))}; dragging=true; renderNoteEdit(); draw(); return; }
    if(!e.shiftKey) selSet.clear();
    gesture="marquee"; gData={}; marquee={x0:x,y0:y,x1:x,y1:y}; selNote=null; selStep=-1; dragging=true; renderNoteEdit(); draw(); return; }
  /* DRAW tool */
  if(hit){ const nt=M.notes[hit.i]; selNote={tick:nt.tick,pitch:nt.pitch}; selSet.clear(); selStep=-1; renderNoteEdit();
    gesture=hit.edge?"resize":"move"; gData={i:hit.i,o:{...nt},gx:x-xOfTick(nt.tick),gr:rowIdxForPitch(nt.pitch)-rowOfY(y)};
    dragging=true; draw(); return; }
  gesture="add"; gData={x,y,sx:scrollX,sy:scrollY,kind:"mel"};
});
cv.addEventListener("pointermove",e=>{ if(!M) return; const p=ptrs.get(e.pointerId); if(!p) return;
  const [x,y]=localXY(e);
  if(ptrs.size>=2 || pinch){ ptrs.set(e.pointerId,{x,y}); movePinch(); return; }
  if(!gesture){ return; }
  if(Math.abs(x-gData.x)>5 || Math.abs(y-gData.y)>5){ didMove=true; clearLong(); }
  if(gesture==="erase"){ if(isDrum()){ const h=drumHitAt(x,y); if(h) drumDelete(h.lane,h.tick); }
    else { const h=noteAt(x,y); if(h) delNoteObj(M.notes[h.i]); } return; }
  if(gesture==="loop"){ const tps=gridTps(), dx=Math.round((tickOfX(x)-tickOfX(gData.x))/tps), end=gData.ls0+gData.len0;
    let ls=gData.ls0,len=gData.len0;
    if(gData.mode==="start"){ ls=Math.max(0,Math.min(end-1,gData.ls0+dx)); len=end-ls; }
    else if(gData.mode==="end"){ len=Math.max(1,Math.min(256-gData.ls0,gData.len0+dx)); }
    else { ls=Math.max(0,Math.min(256-gData.len0,gData.ls0+dx)); }
    setLoop(ls,len,false); draw(); return; }
  if(gesture==="marquee"){ marquee.x1=x; marquee.y1=y; draw(); return; }
  if(gesture==="selmove"){ const dt=snap(tickOfX(x-gData.gx),e.shiftKey)-gData.ax;
    const dr=(rowOfY(y)+gData.gr)-gData.ar;
    gData.orig.forEach(o=>{ o.ref.tick=Math.max(0,Math.min(maxEditTick()-1,o.t+dt));
      o.ref.pitch=rowList[Math.max(0,Math.min(rowList.length-1,rowIdxForPitch(o.p)+dr))]; });
    selSet.clear(); gData.orig.forEach(o=>selSet.add(nKey(o.ref))); draw(); return; }
  if(gesture==="add"){ if(didMove){ gesture="pan"; gData={x:gData.x,y:gData.y,sx:gData.sx,sy:gData.sy}; } }
  if(gesture==="pan"){ scrollX=gData.sx-(x-gData.x); scrollY=gData.sy-(y-gData.y); clampScroll(); draw(); return; }
  if(gesture==="move"){ const nt=M.notes[gData.i]; if(!nt) return;
    nt.tick=Math.min(maxEditTick()-1,Math.max(0,snap(tickOfX(x-gData.gx),e.shiftKey)));
    nt.pitch=rowList[Math.max(0,Math.min(rowList.length-1,rowOfY(y)+gData.gr))]; draw(); return; }
  if(gesture==="resize"){ const nt=M.notes[gData.i]; if(!nt) return;
    const end=Math.max(nt.tick+1,snap(tickOfX(x),e.shiftKey)); nt.gate=Math.max(1,end-nt.tick); draw(); return; }
  if(gesture==="dmove"||gesture==="dresize"){ const arr=M.dnotes[gData.lane]; if(!arr) return;
    const i=arr.findIndex(h=>h.tick===gData.tick); if(i<0) return; const h=arr[i];
    if(gesture==="dmove"){ const nt=Math.max(0,Math.min(maxEditTick()-1,snap(tickOfX(x-gData.gx),e.shiftKey)));
      if(arr.some(z=>z!==h&&z.tick===nt)) return; h.tick=nt; gData.tick=nt; if(selDrum) selDrum.tick=nt;
      /* vertical drag crosses lanes: transfer the hit locally as the pointer
       * crosses rows (blocked if the destination already has a hit at this
       * tick). Ticks are absolute time, so the hit keeps its position even if
       * the destination lane's length/resolution differ; the DSP commit at
       * drag end is a del(src) + add(dst) with vel+gate carried over. */
      const dl=laneOfY(y);
      if(dl>=0 && dl<M.dlanes.length && dl!==gData.lane){
        const dest=M.dnotes[dl]||(M.dnotes[dl]=[]);
        if(!dest.some(z=>z.tick===h.tick)){
          const i2=arr.indexOf(h); if(i2>=0) arr.splice(i2,1);
          dest.push(h);
          if(M.dlanes[gData.lane]) M.dlanes[gData.lane].has=arr.length>0;
          if(M.dlanes[dl]) M.dlanes[dl].has=true;
          gData.lane=dl; if(selDrum) selDrum.lane=dl; } } }
    else { const end=Math.max(h.tick+1,snap(tickOfX(x),e.shiftKey)); h.gate=Math.max(1,end-h.tick); }
    draw(); return; }
});
function endPointer(e){ ptrs.delete(e.pointerId); clearLong(); try{cv.releasePointerCapture(e.pointerId);}catch(_){}
  if(pinch){ if(ptrs.size<2){ pinch=null; gesture=null; dragging=false; } return; }
  if(!gesture){ dragging=false; return; }
  const [x,y]=localXY(e);
  if(gesture==="add" && !didMove){
    if(gData.kind==="drum"){ const tk=Math.max(0,Math.min(maxEditTick()-1,snapAdd(tickOfX(x),e.shiftKey)));
      drumAdd(gData.lane,tk); selDrum={lane:gData.lane,tick:tk}; selStep=-1; renderNoteEdit(); }
    else { const tk=Math.min(maxEditTick()-1,Math.max(0,snapAdd(tickOfX(x),e.shiftKey))), pi=snapPitch(Math.max(0,Math.min(127,pitchAt(y))));
      if(!M.notes.some(n=>n.tick===tk&&n.pitch===pi)){ const gate=gateDefault();
        M.notes.push({tick:tk,pitch:pi,vel:100,gate}); selNote={tick:tk,pitch:pi}; selStep=-1; draw(); renderNoteEdit();
        emit("note_add",`${tk} ${pi} 100 ${gate}`); } }
  } else if(gesture==="loop"){ setLoop(loopStartSteps(),gridLen(),true); renderSidePanels();
  } else if(gesture==="marquee"){ const x0=Math.min(marquee.x0,marquee.x1),x1=Math.max(marquee.x0,marquee.x1),
      y0=Math.min(marquee.y0,marquee.y1),y1=Math.max(marquee.y0,marquee.y1);
    M.notes.forEach(n=>{ const nx=xOfTick(n.tick), nw=Math.max(3,n.gate*PXPERTICK), ny=yOfRow(rowIdxForPitch(n.pitch));
      if(nx+nw>=x0&&nx<=x1&&ny+ROWH>=y0&&ny<=y1) selSet.add(nKey(n)); });
    marquee=null; renderNoteEdit();
  } else if(gesture==="selmove"){ const ops=[];
    gData.orig.forEach(o=>{ if(o.ref.tick!==o.t||o.ref.pitch!==o.p){
      ops.push(["m",`${o.t} ${o.p} ${o.ref.tick} ${o.ref.pitch}`]); } });
    emitBatch(ops); renderNoteEdit();
  } else if(gesture==="move"){ const nt=M.notes[gData.i], o=gData.o;
    if(nt&&(nt.tick!==o.tick||nt.pitch!==o.pitch)) emit("note_move",`${o.tick} ${o.pitch} ${nt.tick} ${nt.pitch}`);
    if(nt){ selNote={tick:nt.tick,pitch:nt.pitch}; renderNoteEdit(); }
  } else if(gesture==="resize"){ const nt=M.notes[gData.i], o=gData.o;
    if(nt&&nt.gate!==o.gate) emit("note_resize",`${nt.tick} ${nt.pitch} ${nt.gate}`);
    if(nt){ selNote={tick:nt.tick,pitch:nt.pitch}; renderNoteEdit(); }
  } else if(gesture==="dmove"||gesture==="dresize"){ const arr=M.dnotes[gData.lane]||[], h=arr.find(z=>z.tick===gData.tick), o=gData.o;
    if(h){ const src=(gData.srcLane!=null)?gData.srcLane:gData.lane;
      if(gesture==="dmove"&&src!==gData.lane){
        /* cross-lane move: del from the source lane + add (vel+gate carried)
         * to the destination — two writes on the serialized slow ring. */
        R.setParam(P+`t${M.sel.t}_l${src}_note_del`,String(o.tick));
        R.setParam(P+`t${M.sel.t}_l${gData.lane}_note_add`,`${h.tick} ${h.vel} ${h.gate}`);
      }
      else if(gesture==="dmove"&&h.tick!==o.tick) R.setParam(P+`t${M.sel.t}_l${gData.lane}_note_move`,`${o.tick} ${h.tick}`);
      else if(gesture==="dresize"&&h.gate!==o.gate) R.setParam(P+`t${M.sel.t}_l${gData.lane}_note_resize`,`${h.tick} ${h.gate}`);
      afterEdit(); selDrum={lane:gData.lane,tick:h.tick}; renderNoteEdit(); } }
  gesture=null; gData=null; didMove=false; dragging=false;
}
cv.addEventListener("pointerup",endPointer);
cv.addEventListener("pointercancel",endPointer);
cv.addEventListener("contextmenu",e=>e.preventDefault());
/* hover cursor (mouse only) */
cv.addEventListener("pointermove",e=>{ if(e.pointerType!=="mouse"||gesture||pinch||!M) return;
  const [x,y]=localXY(e); const reg=regionAt(x,y);
  if(reg==="ruler"){ const lh=(isDrum()&&M.sel.lane<0)?null:loopHandleAt(x);
    cv.style.cursor=lh==="body"?"grab":lh?"ew-resize":"grab"; return; }
  if(reg!=="notes"){ cv.style.cursor=(reg==="gutter"&&!isDrum())?"grab":"default"; return; }
  const hit=isDrum()?drumHitAt(x,y):noteAt(x,y);
  if(tool==="erase"){ cv.style.cursor=hit?"crosshair":"default"; return; }
  if(tool==="select"){ cv.style.cursor=hit?"move":"crosshair"; return; }
  cv.style.cursor=(hit&&hit.edge)?"ew-resize":(hit?"grab":"crosshair"); });
/* wheel: scroll; shift = horizontal; ctrl/⌘ = zoom (anchored at cursor) */
cv.addEventListener("wheel",e=>{ if(!M) return; e.preventDefault(); const [x,y]=localXY(e);
  if(e.ctrlKey||e.metaKey){ const f=e.deltaY<0?1.12:1/1.12; if(e.shiftKey) zoomAroundY(f,y); else zoomAroundX(f,x); return; }
  if(e.shiftKey){ scrollX+=(e.deltaY||e.deltaX); } else { scrollY+=e.deltaY; scrollX+=e.deltaX; }
  clampScroll(); draw(); },{passive:false});

/* ---------- velocity strip (mouse + touch) ---------- */
let vdrag=false;
function localXYv(e){ const r=vc.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
vc.addEventListener("pointerdown",e=>{ if(!M) return; try{vc.setPointerCapture(e.pointerId);}catch(_){}
  vdrag=true; dragging=true; const xy=localXYv(e); vAdjust(xy[0],xy[1]); });
vc.addEventListener("pointermove",e=>{ if(!vdrag) return; const xy=localXYv(e); vAdjust(xy[0],xy[1]); });
function endVel(e){ if(vdrag){ vdrag=false; dragging=false; try{vc.releasePointerCapture(e.pointerId);}catch(_){}} }
vc.addEventListener("pointerup",endVel); vc.addEventListener("pointercancel",endVel);
function vAdjust(mx,my){ const drum=isDrum();
  const vel=Math.max(1,Math.min(127,Math.round((1-(my-2)/(VVH-4))*127)));
  /* multi-selection (melodic): drag adjusts the WHOLE selection RELATIVELY (keeps
   * each note's balance) — delta derived from the nearest selected note. */
  if(!drum && selSet.size>1){ const sel=selectedNotes();
    let best=-1,bd=1e9; sel.forEach((n,i)=>{ const d=Math.abs(xOfTick(n.tick)-mx); if(d<bd){bd=d;best=i;} });
    if(best<0||bd>22) return; const delta=vel-sel[best].vel; if(!delta) return;
    sel.forEach(n=>{ n.vel=Math.max(1,Math.min(127,n.vel+delta)); });
    /* one atomic batch of ABSOLUTE vels per move → applied all-or-nothing in one
     * round trip + one rev bump (see emitBatch; not per-buffer coalescing). */
    emitBatch(sel.map(n=>["v",`${n.tick} ${n.pitch} ${n.vel}`]));
    draw(); renderNoteEdit(); return; }
  const notes=drum?(M.sel.lane>=0?(M.dnotes[M.sel.lane]||[]):[]):M.notes;
  let best=-1,bd=1e9; notes.forEach((n,i)=>{ const d=Math.abs(xOfTick(n.tick)-mx); if(d<bd){bd=d;best=i;} });
  if(best<0||bd>16) return;
  const n=notes[best]; if(n.vel===vel) return; n.vel=vel; draw();
  if(drum){ R.setParam(P+`t${M.sel.t}_l${M.sel.lane}_note_vel`,`${n.tick} ${vel}`); afterEdit(); selDrum={lane:M.sel.lane,tick:n.tick}; }
  else { emit("note_vel",`${n.tick} ${n.pitch} ${vel}`); selNote={tick:n.tick,pitch:n.pitch}; }
  renderNoteEdit(); }

/* ================= automation band (CC lanes, melodic-only) =================
 * Mirrors the velocity strip: same x = tick→px via the shared ruler/zoom; y maps
 * 0..127 over the band height. One focused lane at a time (ccSel) gated by
 * tN_cC_cc_focus; the device streams that lane's breakpoints as rui_cc. Edits use
 * the verified tN_cc_auto_* keys; the model is mutated optimistically (like notes)
 * so the curve follows the gesture before the device round-trips. */
/* CC automation is track-level; melodic sources it from the selected clip, drum
 * mode from the track's ACTIVE clip (rui_index ac). All CC writes target ccClip(). */
function ccClip(){ if(!M) return 0;
  if(isDrum()){ const tr=M.tracks[M.sel.t]; return tr?tr.ac:M.sel.c; } return M.sel.c; }
function bandsApply(){
  const drum=isDrum();
  const vh=document.getElementById("velhdr"), vw=document.getElementById("velwrap");
  if(vh) vh.querySelector(".tw").textContent=velOpen?"▼":"▶";
  if(vw) vw.style.display=velOpen?"block":"none";
  const ah=document.getElementById("autohdr"), ap=document.getElementById("autopick"),
        actl=document.getElementById("autoctl"), aw=document.getElementById("autowrap");
  /* automation is shown for drum tracks too (engine supports track-level CC, keyed
   * by the active clip) — no longer hidden in drum mode */
  if(ah){ ah.style.display="flex"; ah.querySelector(".tw").textContent=autoOpen?"▼":"▶"; }
  const show=autoOpen;
  if(ap) ap.style.display=show?"flex":"none";
  if(actl) actl.style.display=(show&&ccSel>=0)?"flex":"none";
  if(aw) aw.style.display=(show&&ccSel>=0)?"block":"none";
}
function ccLabel(m){ return m.type===1?"Aft":m.type===2?"Schw":("CC"+(m.assign|0)); }
function renderCcPicker(){
  const el=document.getElementById("autopick"); if(!el) return;
  if(!autoOpen){ el.innerHTML=""; return; }
  const meta=(M&&M.ccmeta)||[];
  let html="";
  for(let k=0;k<8;k++){ const m=meta[k]||{assign:0,type:0,hasdata:false,cur:255};
    const assigned=(m.type|0)!==0||(m.assign|0)>0;
    const cur=(m.cur!=null&&m.cur!==255)?String(m.cur):"";
    html+=`<button class="ccslot${k===ccSel?" sel":""}${assigned?"":" off"}" data-k="${k}" title="Knob ${k+1} — ${ccLabel(m)}">`+
      `<span class="ccn">${ccLabel(m)}</span>`+(m.hasdata?`<span class="ccdot"></span>`:"")+
      (cur?`<span class="ccv">${cur}</span>`:"")+`</button>`; }
  el.innerHTML=html;
  el.querySelectorAll(".ccslot").forEach(b=>b.onclick=()=>focusCc(+b.dataset.k));
  const hs=document.getElementById("autohsum");
  if(hs) hs.textContent=(ccSel>=0)?ccLabel(meta[ccSel]||{assign:0,type:0}):"";
}
function focusCc(k){ if(!M) return; ccSel=(ccSel===k?-1:k);
  R.setParam(P+`t${M.sel.t}_c${ccClip()}_cc_focus`,String(ccSel)); afterEdit(); pullSoon();
  renderCcPicker(); renderCcCtl(); bandsApply(); layout(); drawAuto(); }
function renderCcCtl(){
  const el=document.getElementById("autoctl"); if(!el) return;
  /* don't clobber an in-progress edit of a control input (poll re-render) */
  if(document.activeElement && document.activeElement.closest && document.activeElement.closest("#autoctl")) return;
  if(!autoOpen||ccSel<0||!M){ el.innerHTML=""; el.style.display="none"; return; }
  el.style.display="flex";
  const m=(M.ccmeta&&M.ccmeta[ccSel])||{assign:0,type:0,rest:255};
  const restv=(m.rest!=null&&m.rest!==255)?m.rest:"";
  el.innerHTML=
    `<span class="cclab">Lane ${ccSel+1}</span>`+
    `<label>Type <select id="ccType"><option value="0"${(m.type|0)===0?" selected":""}>CC</option>`+
      `<option value="2"${(m.type|0)===2?" selected":""}>Schw</option>`+
      `<option value="1"${(m.type|0)===1?" selected":""}>Aft</option></select></label>`+
    `<label>CC# <input id="ccNum" type="number" min="0" max="127" value="${m.assign|0}" style="width:54px;text-align:right"></label>`+
    `<label>Rest <input id="ccRest" type="number" min="0" max="127" placeholder="—" value="${restv}" style="width:54px;text-align:right"></label>`+
    `<button class="sm danger" id="ccClr" title="Erase this lane's automation">Clear lane</button>`;
  const assign=()=>{ const ty=+el.querySelector("#ccType").value,
      cc=Math.max(0,Math.min(127,+el.querySelector("#ccNum").value|0));
    R.setParam(P+`t${M.sel.t}_cc_type_assign`,`${ccSel} ${ty} ${cc}`); afterEdit(); pullSoon(); };
  el.querySelector("#ccType").onchange=assign;
  el.querySelector("#ccNum").onchange=assign;
  el.querySelector("#ccRest").onchange=e=>{ const s=e.target.value;
    const v=(s===""||s==null)?128:Math.max(0,Math.min(127,+s|0));
    R.setParam(P+`t${M.sel.t}_cc_rest`,`${ccClip()} ${ccSel} ${v}`); afterEdit(); pullSoon(); };
  el.querySelector("#ccClr").onclick=()=>{ R.setParam(P+`t${M.sel.t}_cc_auto_clear_k`,`${ccClip()} ${ccSel}`);
    if(M.cc&&M.cc.k===ccSel) M.cc.points=[]; afterEdit(); pullSoon(); drawAuto(); };
}
const AVPAD=5;   /* top inset; ccVofY MUST use this so it stays the exact inverse of ccYofV */
const ccYofV=v=>AVH-3-(Math.max(0,Math.min(127,v))/127)*(AVH-8);
const ccVofY=y=>Math.max(0,Math.min(127,Math.round((1-(y-AVPAD)/(AVH-8))*127)));
function drawAuto(){
  if(!autoOpen||ccSel<0||!M) return;
  actx.clearRect(0,0,AVW,AVH); actx.fillStyle="#0e1014"; actx.fillRect(0,0,AVW,AVH);
  /* musical step grid (mirror drawVel) */
  const tps=gridTps(), len=gridLen();
  for(let s=0;s<=len;s+=4){ const x=xOfTick(s*tps); if(x<GUTTER||x>AVW) continue;
    actx.strokeStyle=(s%16===0)?"#262c36":"#1a1e25"; actx.beginPath(); actx.moveTo(x,0); actx.lineTo(x,AVH); actx.stroke(); }
  const meta=(M.ccmeta&&M.ccmeta[ccSel])||{assign:0,type:0,rest:255}, accent=rollAccent();
  /* resting-value baseline (dashed) */
  if(meta.rest!=null&&meta.rest!==255){ const yr=ccYofV(meta.rest);
    actx.strokeStyle="rgba(90,96,108,0.6)"; actx.setLineDash([4,4]); actx.beginPath();
    actx.moveTo(GUTTER,yr); actx.lineTo(AVW,yr); actx.stroke(); actx.setLineDash([]); }
  const pts=(M.cc&&M.cc.k===ccSel)?M.cc.points:[];
  if(pts.length){ actx.strokeStyle=hexA(accent,0.9); actx.lineWidth=2; actx.beginPath();
    pts.forEach((p,i)=>{ const x=xOfTick(p.tick), y=ccYofV(p.val); if(i===0)actx.moveTo(x,y); else actx.lineTo(x,y); });
    actx.stroke();
    pts.forEach(p=>{ const x=xOfTick(p.tick), y=ccYofV(p.val); if(x<GUTTER-5||x>AVW+5) return;
      actx.fillStyle=accent; actx.beginPath(); actx.arc(x,y,4.5,0,7); actx.fill(); }); }
  /* faint value reference lines at 127 / 64 / 0 */
  [127,64,0].forEach(v=>{ const y=ccYofV(v);
    actx.strokeStyle="rgba(74,85,110,0.35)"; actx.beginPath(); actx.moveTo(GUTTER,y); actx.lineTo(AVW,y); actx.stroke(); });
  /* gutter label painted last (sits above the grid) */
  actx.fillStyle="#171a20"; actx.fillRect(0,0,GUTTER,AVH);
  actx.fillStyle="#5a606c"; actx.font="9px ui-monospace,monospace"; actx.textBaseline="middle";
  actx.fillText(ccLabel(meta),6,AVH/2);
  /* value axis in the gutter */
  actx.font="8px ui-monospace,monospace"; actx.textAlign="right";
  actx.fillText("127",GUTTER-3,Math.max(6,ccYofV(127)));
  actx.fillText("0",GUTTER-3,Math.min(AVH-5,ccYofV(0)));
  actx.textAlign="left";
}
/* edit gestures (draw / drag / erase) — driven by the roll's tool state */
function ccPointAt(mx){ if(!M.cc||M.cc.k!==ccSel) return null; let best=null,bd=1e9;
  M.cc.points.forEach(p=>{ const d=Math.abs(xOfTick(p.tick)-mx); if(d<bd){bd=d;best=p;} });
  return (best&&bd<=10)?best:null; }
function ccLocalSet(tick,val){ if(!M.cc||M.cc.k!==ccSel) M.cc={k:ccSel,points:[]};
  const i=M.cc.points.findIndex(p=>p.tick===tick); if(i>=0)M.cc.points[i].val=val; else M.cc.points.push({tick,val});
  M.cc.points.sort((a,b)=>a.tick-b.tick); }
function ccLocalClear(tick){ if(M.cc&&M.cc.k===ccSel) M.cc.points=M.cc.points.filter(p=>p.tick!==tick); }
function ccSetEmit(tick,val){ R.setParam(P+`t${M.sel.t}_cc_auto_set`,`${ccClip()} ${ccSel} ${tick} ${val}`); afterEdit(); }
function ccClearEmit(t1,t2){ R.setParam(P+`t${M.sel.t}_cc_auto_clear_range`,`${ccClip()} ${ccSel} ${t1} ${t2==null?t1:t2}`); afterEdit(); }
let adrag=null, ccEmitT=0, ccLast=null;
function localXYa(e){ const r=ac.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
ac.addEventListener("pointerdown",e=>{ if(!M||ccSel<0) return; try{ac.setPointerCapture(e.pointerId);}catch(_){}
  const [x,y]=localXYa(e); if(x<GUTTER) return; dragging=true;
  const erase=tool==="erase"||(e.pointerType==="mouse"&&(e.button===2||e.altKey));
  const hit=ccPointAt(x);
  if(erase){ if(hit){ ccLocalClear(hit.tick); drawAuto(); ccClearEmit(hit.tick); pullSoon(); } adrag=null; return; }
  if(hit){ const ex=M.cc.points.find(p=>p.tick===hit.tick); adrag={tick:hit.tick}; ccLast={tick:hit.tick,val:ex?ex.val:0}; return; }
  const tk=Math.max(0,Math.min(maxEditTick()-1,snap(tickOfX(x),e.shiftKey))), v=ccVofY(y);
  ccLocalSet(tk,v); drawAuto(); ccSetEmit(tk,v); adrag={tick:tk}; ccLast={tick:tk,val:v}; });
ac.addEventListener("pointermove",e=>{ if(!adrag||!M||ccSel<0) return; const [x,y]=localXYa(e);
  const nt=Math.max(0,Math.min(maxEditTick()-1,snap(tickOfX(x),e.shiftKey))), nv=ccVofY(y);
  if(nt!==adrag.tick){ ccLocalClear(adrag.tick); ccClearEmit(adrag.tick); }
  ccLocalSet(nt,nv); adrag.tick=nt; ccLast={tick:nt,val:nv}; drawAuto();
  const n=now(); if(n-ccEmitT>55){ ccEmitT=n; ccSetEmit(nt,nv); } });
function endAuto(e){ if(adrag){ if(ccLast) ccSetEmit(ccLast.tick,ccLast.val); adrag=null; ccLast=null; pullSoon(); }
  dragging=false; try{ac.releasePointerCapture(e.pointerId);}catch(_){} }
ac.addEventListener("pointerup",endAuto); ac.addEventListener("pointercancel",endAuto);
ac.addEventListener("contextmenu",e=>e.preventDefault());

/* ---------- apply incoming snapshot ---------- */
let autoLaneKey="";   /* track which drum clip we auto-selected a lane for (fire once per clip) */
let lastFoldSig="";   /* scale-aware + scale-mask signature; re-layout the roll when it changes */
function firstLaneWithHits(){ if(!M||!M.dnotes) return 0; let best=-1;
  for(const L in M.dnotes){ if(M.dnotes[L]&&M.dnotes[L].length){ const l=+L; if(best<0||l<best) best=l; } }
  return best<0?0:best; }
/* Rejected-push stash. The server pushes DELTAS (only keys that changed since
 * the snapshot this client last received), so a rejected message is no longer
 * recoverable from "the next push carries everything again" — a delta dropped
 * during a drag or the suppress window would leave kv stale on exactly its
 * keys until some unrelated edit touched them. So reject paths STASH the
 * message and a pump re-applies it once the rejecting condition clears; an
 * ACCEPTED message drops any stashed keys it supersedes. */
let rejectStash=null, rejectPump=0;
function stashRejected(params){
  rejectStash=Object.assign(rejectStash||{},params);
  if(rejectPump) return;
  rejectPump=setInterval(()=>{
    if(dragging||clipDrag) return;
    if(now()<suppressRefreshUntil) return;
    const s=rejectStash; rejectStash=null;
    clearInterval(rejectPump); rejectPump=0;
    if(s) applyParams(s);
  },200);
}
function applyParams(params){
  /* STAGED merge: the sticky kv cache must only keep values from ACCEPTED
   * messages. It used to be written before the reject gate, so a WiFi-delayed
   * pre-edit snapshot — though rejected for rendering — silently poisoned kv,
   * and the next accepted rui_play-only push rebuilt the model from the stale
   * cache (the true root of the "fresh note reverts" flicker). On any reject
   * path the previous values are restored. */
  const prevKv={}; let touched=false;
  for(const k in params){ if(k.indexOf(P+"rui_")===0){ prevKv[k]=kv[k]; kv[k]=params[k]; touched=true; } }
  if(!touched) return;
  if(rejectStash){ for(const k in params) delete rejectStash[k]; } /* accepted supersedes stashed */
  const revert=()=>{ for(const k in prevKv){ if(prevKv[k]===undefined) delete kv[k]; else kv[k]=prevKv[k]; } };
  if(dragging || clipDrag){ revert(); stashRejected(params); return; }   /* don't clobber a canvas OR session-grid clip drag */
  const m=parseModel(); if(!m){ revert(); return; }
  /* Playhead/transport target: applied BEFORE the content gate — the post-edit
   * suppress window must never delay a stop/start edge or a phase correction.
   * Ordered by the DEVICE clock (devms is monotonic per instance) so a stale
   * delivery can't rewind it; a large BACKWARD devms jump means the module was
   * re-instantiated (rui_frames reset) → drop the learned clock offset and
   * re-learn immediately instead of holding a wrong minimum for 30s. */
  {
    const pl=m.play, backJump=pl.dev>0 && phLastDev>0 && pl.dev<phLastDev-5000;
    if(backJump){ phOff=Infinity; phOffT=0; phLastDev=0; }
    if(pl.dev===0 || pl.dev>=phLastDev || backJump){
      if(pl.dev>0) phLastDev=pl.dev;
      const wasPlaying=phPlaying;
      phTgtTick=pl.tick; phTgtT=now(); phTgtDev=pl.dev;
      phBpm=pl.bpm||120; phPlaying=!!pl.on;
      if(pl.dev>0){ const off=now()-pl.dev;         /* clock offset + latency */
        if(off<phOff || now()-phOffT>30000){ phOff=off; phOffT=now(); } }
      if(phPlaying&&!wasPlaying){ phEst=pl.tick; phEstT=now(); }
      if(phPlaying) startPlayhead(); else stopPlayhead();
    }
  }
  /* during the post-edit suppress window, ignore snapshots that haven't caught up */
  if(now()<suppressRefreshUntil && M && m.rev<=M.rev){ revert(); stashRejected(params); return; }
  const prevRev=lastRev, prevSel=lastSelKey;
  M=m;
  /* drum: land on a lane so the Lane + FX populate immediately instead of a blank
   * "select a lane" prompt on first click (once per clip; device honors the ruisel). */
  if(isDrum() && M.sel.lane<0){ const ck=M.sel.t+":"+M.sel.c;
    if(ck!==autoLaneKey){ autoLaneKey=ck; selectLane(firstLaneWithHits()); return; } }
  const selKey=M.sel.t+":"+M.sel.c;
  /* re-fold the roll whenever scale-aware / scale / key changes — even if it came
   * from the device (which may not bump rev), so an on melodic track ALWAYS folds. */
  const foldSig=(M.glob&&M.glob.scaleAware?1:0)+":"+(M.scaleMask?M.scaleMask.map(b=>b?1:0).join(""):"");
  renderChrome(); renderSession();
  bandsApply(); renderCcPicker(); renderCcCtl();
  if(M.rev!==prevRev || selKey!==prevSel || foldSig!==lastFoldSig){ lastRev=M.rev; lastSelKey=selKey; lastFoldSig=foldSig;
    layout(); renderSidePanels(); }
  draw();
}


/* ---------- lane resize + hover value readout (vel + automation) ---------- */
const laneTip=document.createElement("div"); laneTip.id="lanetip"; document.body.appendChild(laneTip);
function laneTipShow(e,txt){ laneTip.textContent=txt; laneTip.style.display="block";
  laneTip.style.left=Math.min(window.innerWidth-90,e.clientX+12)+"px"; laneTip.style.top=(e.clientY-26)+"px"; }
function laneTipHide(){ laneTip.style.display="none"; }
function velOfY(y){ return Math.max(1,Math.min(127,Math.round((VVH-3-y)*127/Math.max(1,VVH-10)))); }
vc.addEventListener("pointermove",e=>{ if(!M) return; const r=vc.getBoundingClientRect();
  const x=e.clientX-r.left,y=e.clientY-r.top; if(x<GUTTER){ laneTipHide(); return; }
  const drum=isDrum();
  const notes=drum?(M.sel.lane>=0?(M.dnotes[M.sel.lane]||[]):[]):M.notes;
  let best=null,bd=1e9; notes.forEach(n=>{ const d=Math.abs(xOfTick(n.tick)-x); if(d<bd){bd=d;best=n;} });
  laneTipShow(e,(best&&bd<=22)?("Vel "+best.vel):("Vel "+velOfY(y))); });
vc.addEventListener("pointerleave",laneTipHide);
ac.addEventListener("pointermove",e=>{ if(!M||ccSel<0) return; const r=ac.getBoundingClientRect();
  const x=e.clientX-r.left,y=e.clientY-r.top; if(x<GUTTER){ laneTipHide(); return; }
  const hit=ccPointAt(x);
  laneTipShow(e,(hit?hit.val:Math.max(0,Math.min(127,ccVofY(y))))+(hit?" ●":"")); });
ac.addEventListener("pointerleave",laneTipHide);
/* drag the handle at a lane's top edge to resize it (persisted) */
document.querySelectorAll(".lane-rs").forEach(h=>{
  const wrap=document.getElementById(h.dataset.for), key="dbx_h_"+h.dataset.for;
  const saved=+localStorage.getItem(key); if(saved>=40&&saved<=280) wrap.style.flexBasis=saved+"px";
  let rs=null;
  h.addEventListener("pointerdown",e=>{ e.preventDefault(); e.stopPropagation();
    try{h.setPointerCapture(e.pointerId);}catch(_){}
    rs={y:e.clientY,h:wrap.getBoundingClientRect().height}; h.classList.add("on"); });
  h.addEventListener("pointermove",e=>{ if(!rs) return;
    const nh=Math.max(40,Math.min(280,rs.h+(rs.y-e.clientY)));
    wrap.style.flexBasis=nh+"px"; layout(); draw(); drawVel(); drawAuto(); });
  const end=e=>{ if(!rs) return; rs=null; h.classList.remove("on");
    localStorage.setItem(key,String(Math.round(wrap.getBoundingClientRect().height))); };
  h.addEventListener("pointerup",end); h.addEventListener("pointercancel",end);
});

/* ---------- wire ---------- */
R.onParamChange && R.onParamChange(applyParams);
let auto=true;
document.getElementById("auto").onclick=e=>{auto=!auto;e.target.classList.toggle("on",auto);};
document.getElementById("sync").onclick=()=>{ suppressRefreshUntil=0; refresh(); };
document.getElementById("snap").onchange=()=>draw();   /* grid's fine tier follows Snap */
/* ⚙ global-settings popover (+ scrim) and ▦ session-grid toggle */
(function(){
  const gear=document.getElementById("gear"), pop=document.getElementById("globalpop"), scrim=document.getElementById("scrim");
  function close(){ pop.classList.remove("open"); scrim.classList.remove("open"); gear.classList.remove("on"); }
  gear.onclick=()=>{ const o=!pop.classList.contains("open");
    pop.classList.toggle("open",o); scrim.classList.toggle("open",o); gear.classList.toggle("on",o);
    if(o && M) renderGlobals(); };
  scrim.onclick=close;
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") close(); });
  const sess=document.getElementById("session"), st=document.getElementById("sessToggle");
  st.classList.add("on");
  st.onclick=()=>{ sess.classList.toggle("collapsed"); st.classList.toggle("on",!sess.classList.contains("collapsed")); };
})();
/* collapsible velocity / automation band headers */
document.getElementById("velhdr").onclick=()=>{ velOpen=!velOpen; saveBands(); bandsApply(); if(M){ layout(); draw(); } };
document.getElementById("autohdr").onclick=()=>{ autoOpen=!autoOpen; saveBands(); bandsApply();
  renderCcPicker(); renderCcCtl(); if(M){ layout(); draw(); } };
bandsApply();   /* initial show/hide from persisted prefs (before first model) */
document.getElementById("zxin").onclick=()=>zoomH(1.3);
document.getElementById("zxout").onclick=()=>zoomH(1/1.3);
document.getElementById("zyin").onclick=()=>zoomV(1.3);
document.getElementById("zyout").onclick=()=>zoomV(1/1.3);
document.getElementById("zrst").onclick=zoomReset;
/* ---------- continuous edge zoom strips (top = horizontal, left = vertical) ----------
 * Reuse the existing PXPERTICK / ROWH zoom vars + the same MIN/MAX clamps the H/V
 * buttons enforce — pure view state, no DSP writes. Exponential pixel→zoom mapping
 * so a normal drag spans the useful range; anchored so the roll's left edge (top
 * strip) / top row (left strip) stays put. Same clampScroll()+draw() as the buttons. */
const Z_SENS_H=60, Z_SENS_V=90;   /* px per zoom octave (smaller = more sensitive) */
function wireZoomStrip(el,axis){
  let drag=null;
  el.addEventListener("pointerdown",e=>{ if(!M) return; e.preventDefault();
    try{el.setPointerCapture(e.pointerId);}catch(_){}
    drag={x:e.clientX,y:e.clientY,px:PXPERTICK,rh:ROWH,
          tAt:scrollX/PXPERTICK, rAt:scrollY/ROWH}; });   /* tick at left edge / row at top */
  el.addEventListener("pointermove",e=>{ if(!drag) return; e.preventDefault();
    if(axis==="h"){ const dy=e.clientY-drag.y;            /* drag down = zoom in */
      PXPERTICK=Math.max(MIN_PX,Math.min(MAX_PX, drag.px*Math.pow(2,dy/Z_SENS_H)));
      scrollX=drag.tAt*PXPERTICK; }                       /* pin left-edge tick */
    else { const dx=e.clientX-drag.x;                     /* drag right = zoom in */
      ROWH=Math.max(MIN_ROWH,Math.min(MAX_ROWH, Math.round(drag.rh*Math.pow(2,dx/Z_SENS_V))));
      scrollY=drag.rAt*ROWH; }                            /* pin top row */
    clampScroll(); draw(); });
  const end=e=>{ if(drag){ try{el.releasePointerCapture(e.pointerId);}catch(_){} drag=null; } };
  el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end);
}
wireZoomStrip(document.getElementById("zstripH"),"h");
wireZoomStrip(document.getElementById("zstripV"),"v");
/* edit-tool toggle (Draw / Select / Erase) */
function setTool(t){ tool=t;
  document.getElementById("toolDraw").classList.toggle("on",t==="draw");
  document.getElementById("toolSel").classList.toggle("on",t==="select");
  document.getElementById("toolErase").classList.toggle("on",t==="erase");
  if(t!=="select"){ selSet.clear(); } marquee=null; if(M){ renderNoteEdit(); draw(); } }
document.getElementById("toolDraw").onclick=()=>setTool("draw");
document.getElementById("toolSel").onclick=()=>setTool("select");
document.getElementById("toolErase").onclick=()=>setTool("erase");
document.getElementById("hUndo").onclick=doUndo;     /* global undo/redo in the top toolbar */
document.getElementById("hRedo").onclick=doRedo;
/* transport start/stop — toggles on current state; renderChrome keeps the label in
 * sync each poll, so a click never fights the status text. */
document.getElementById("xport").onclick=()=>{ if(!M) return;
  R.setParam(P+"transport", M.play.on ? "stop" : "play"); afterEdit(); pullSoon(); };
/* ---------- keyboard shortcuts ---------- */
function deleteSelection(){ if(isDrum()){ if(selDrum) drumDelete(selDrum.lane,selDrum.tick); return; }
  const ns=selectedNotes(); if(!ns.length) return; const ops=[];
  ns.forEach(nt=>{ const k=M.notes.indexOf(nt); if(k>=0) M.notes.splice(k,1); ops.push(["d",`${nt.tick} ${nt.pitch}`]); });
  emitBatch(ops); selSet.clear(); selNote=null; draw(); renderNoteEdit(); }
function nudgeSelection(key,big){
  if(isDrum()){ if(!selDrum) return; const arr=M.dnotes[selDrum.lane]||[], h=arr.find(z=>z.tick===selDrum.tick); if(!h) return;
    if(key==="ArrowLeft"||key==="ArrowRight"){ const d=(key==="ArrowRight"?1:-1)*(big?1:(snapTicks()||1));
      const o=h.tick, nt=Math.max(0,Math.min(maxEditTick()-1,h.tick+d)); if(nt===o||arr.some(z=>z!==h&&z.tick===nt)) return;
      h.tick=nt; selDrum.tick=nt; R.setParam(P+`t${M.sel.t}_l${selDrum.lane}_note_move`,`${o} ${nt}`); afterEdit(); draw(); renderNoteEdit(); }
    return; }
  const ns=selectedNotes(); if(!ns.length) return; let dt=0,dp=0;
  if(key==="ArrowLeft") dt=-(big?1:(snapTicks()||1)); else if(key==="ArrowRight") dt=(big?1:(snapTicks()||1));
  else if(key==="ArrowUp") dp=big?12:1; else if(key==="ArrowDown") dp=big?-12:-1; else return;
  const ops=[]; ns.forEach(nt=>{ const o={tick:nt.tick,pitch:nt.pitch};
    nt.tick=Math.max(0,Math.min(maxEditTick()-1,nt.tick+dt)); nt.pitch=Math.max(0,Math.min(127,nt.pitch+dp));
    ops.push(["m",`${o.tick} ${o.pitch} ${nt.tick} ${nt.pitch}`]); });
  emitBatch(ops);
  if(selSet.size){ selSet.clear(); ns.forEach(nt=>selSet.add(nKey(nt))); }
  if(selNote) selNote={tick:ns[0].tick,pitch:ns[0].pitch};
  draw(); renderNoteEdit(); }
document.addEventListener("keydown",e=>{ const ae=document.activeElement;
  if(ae && (ae.tagName==="INPUT"||ae.tagName==="SELECT"||ae.tagName==="TEXTAREA")) return;
  if(!M) return; const k=e.key;
  if(k==="b"||k==="1"){ setTool("draw"); return; }
  if(k==="v"||k==="2"){ setTool("select"); return; }
  if(k==="e"||k==="3"){ setTool("erase"); return; }
  if(k==="Escape"){ if(selSet.size||marquee||selNote||selDrum||selStep>=0){ selSet.clear(); marquee=null; selNote=null; selDrum=null; selStep=-1; renderNoteEdit(); renderStepEdit(); draw(); } return; }
  if((e.metaKey||e.ctrlKey)&&(k==="z"||k==="Z")){ e.preventDefault(); if(e.shiftKey) doRedo(); else doUndo(); return; }
  if((e.metaKey||e.ctrlKey)&&(k==="y"||k==="Y")){ e.preventDefault(); doRedo(); return; }
  if((e.metaKey||e.ctrlKey)&&(k==="a"||k==="A")){ if(!isDrum()){ e.preventDefault(); setTool("select");
    selSet.clear(); M.notes.forEach(n=>selSet.add(nKey(n))); selNote=null; renderNoteEdit(); draw(); } return; }
  if(k==="Delete"||k==="Backspace"){ e.preventDefault(); deleteSelection(); return; }
  if(k.indexOf("Arrow")===0){ e.preventDefault(); nudgeSelection(k,e.shiftKey); return; }
});
/* (scroll + wheel + pinch zoom are handled by the unified pointer engine on the
 * canvas; the viewport no longer uses native scroll, so the gutter/ruler freeze.) */
/* adaptive poll: brisk while playing (live playhead), relaxed when stopped
 * (lighter SHM/device load). Self-scheduling so the cadence tracks transport.
 * Paused entirely while the page is hidden (other browser tab / minimized) so
 * the device isn't polled when nobody's looking — each poll is a full snapshot
 * read on the DSP. Resumes with an immediate refresh when shown again. */
(function poll(){
  if(auto && !document.hidden) refresh();
  const playing = M && M.play && M.play.on;
  /* polls are cheap now (manager rev-gates the heavy snapshot read), so we can
   * poll briskly for snappier device→browser sync; faster still right after an
   * edit to pick up device-side recompute; paused entirely when hidden. */
  const ms = document.hidden ? 3000 : (now()<fastUntil ? 150 : (playing ? 250 : 500));
  setTimeout(poll, ms);
})();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ suppressRefreshUntil=0; refresh(); } });

refresh();
/* first layout() at boot can see clientHeight 0 (pre-paint) → relayout after a
 * frame, and on window resize, so the grid fills the viewport (laptop use). */
function relayout(){ if(M){ layout(); draw(); } }
requestAnimationFrame(relayout);
window.addEventListener("resize", relayout);
window._dbg={get M(){return M;}, refresh, applyParams, draw, noteAt, xOfTick, yOfRow,
             geom:{get rowh(){return ROWH;}, get px(){return PXPERTICK;}, get sx(){return scrollX;}, get sy(){return scrollY;}}};
