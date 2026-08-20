import { JSDOM } from 'jsdom';
import { installCanvasStub } from './ctxstub.mjs';
const html = await (await fetch('http://localhost:8199/web_ui.html')).text();
const dom = new JSDOM(html,{url:'http://localhost:8199/web_ui.html',runScripts:'dangerously',
  resources:'usable',pretendToBeVisual:true,beforeParse(w){installCanvasStub(w);}});
const {window}=dom;
for(let i=0;i<100&&typeof window.chainParams!=="object";i++) await new Promise(r=>setTimeout(r,100));
await new Promise(r=>setTimeout(r,1200));
const d=window.document,out={};
window.location.hash='#sound'; await new Promise(r=>setTimeout(r,600));
out.chips=d.querySelectorAll('.sndchip').length;
out.selChip=d.querySelector('.sndchip.sel')&&d.querySelector('.sndchip.sel').textContent;
// click chip 5 (T5, idx 4) -> sound view should now show T5
d.querySelectorAll('.sndchip')[4].dispatchEvent(new window.Event('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,700));
out.headAfterChip=d.querySelector('.sndhead').textContent;
out.selChipAfter=d.querySelector('.sndchip.sel').textContent;
out.viewStays=d.body.dataset.view;
// synth card still mounts an editor (panel probe retries don't wedge the card)
out.editorRows=d.querySelectorAll('#sound .cpk [class*=cpk]').length>0||d.querySelectorAll('#sound input[type=range]').length>0;
console.log(JSON.stringify(out,null,1)); process.exit(0);
