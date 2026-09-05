/* smoke_none_route.mjs — the NONE instrument (item 13, 2026-09-05) in the
 * remote UI: a track routed to none reads "None" in the seq header, its
 * settings dropdown offers and shows None, the mixer shows None with no audio
 * position, and the Sound view shows a static NONE card — never the parked
 * chain's cards. Runs on the mock shim (web_ui_core.js). */
import { loadPage } from './loadpage.mjs';
const dom = await loadPage();
const {window}=dom;
const d=window.document, out={}, sleep=ms=>new Promise(r=>setTimeout(r,ms));
const T=4;   /* track 5, Schwung in the mock */
window.schwungRemote.setParam('overtake_dsp:t'+T+'_route','none');
await sleep(1500);
window.location.hash='#seq'; await sleep(700);
const hdr=[...d.querySelectorAll('.strk')].map(e=>e.textContent)[T]||'';
out.seqLabel=hdr.replace(/☰.*/,'').trim();
const gear=d.querySelectorAll('.strk-gear')[T]; gear.dispatchEvent(new window.Event('click',{bubbles:true})); await sleep(300);
out.gearOptions=[...d.querySelectorAll('#tgRoute option')].map(o=>o.value).join(',');
out.gearValue=d.querySelector('#tgRoute')&&d.querySelector('#tgRoute').value;
window.location.hash='#mix'; await sleep(700);
const strips=d.querySelectorAll('.strip'); out.mixLabel=strips[T]&&strips[T].querySelector('.inst').textContent; out.mixExt=strips[T]&&strips[T].classList.contains('ext');
window.location.hash='#sound'; await sleep(600);
d.querySelectorAll('.sndchip')[T].dispatchEvent(new window.Event('click',{bubbles:true})); await sleep(700);
out.soundRole=d.querySelector('#sound .sndcard-static .sndrole')&&d.querySelector('#sound .sndcard-static .sndrole').textContent;
out.soundLiveCards=d.querySelectorAll('#sound .sndcard:not(.sndcard-static)').length;
/* ITEM 15: a MIDI track's Sound view = the MIDI card + its MIDI FX card, no instrument */
const M2=6; window.schwungRemote.setParam('overtake_dsp:t'+M2+'_route','external'); await sleep(1500);
window.location.hash='#sound'; await sleep(400);
d.querySelectorAll('.sndchip')[M2].dispatchEvent(new window.Event('click',{bubbles:true})); await sleep(700);
out.midiRoles=[...d.querySelectorAll('#sound .sndcard .sndrole')].map(e=>e.textContent).join(',');
const fails=[];
if(!/^MIDI,MIDI FX$/.test(out.midiRoles)) fails.push('MIDI track sound cards '+JSON.stringify(out.midiRoles)+' (want MIDI + MIDI FX, no instrument)');
if(!/\bNone\b/.test(out.seqLabel)) fails.push('seq label '+JSON.stringify(out.seqLabel));
if(!/(^|,)none(,|$)/.test(out.gearOptions)) fails.push('gear has no None option: '+out.gearOptions);
if(out.gearValue!=='none') fails.push('gear value '+out.gearValue);
if(out.mixLabel!=='None'||!out.mixExt) fails.push('mix strip '+JSON.stringify(out.mixLabel)+' ext='+out.mixExt);
if(out.soundRole!=='NONE') fails.push('sound card role '+JSON.stringify(out.soundRole));
if(out.soundLiveCards!==0) fails.push('sound shows '+out.soundLiveCards+' live cards for a NONE track');
console.log(JSON.stringify(out,null,1));
if(fails.length){ console.log('FAIL: '+fails.join(' | ')); process.exit(1); }
console.log('ALL PASS'); process.exit(0);
