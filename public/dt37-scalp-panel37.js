/** Standalone scalp PAPER panel below Research Agent. Read only, fetch on demand. */
(()=>{'use strict';
const $=id=>document.getElementById(id),put=(id,text)=>{const el=$(id);if(el)el.textContent=String(text??'—')};
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=String(text);return x};
let last=0,loading=false;
function render(d){
 const summary=d?.summary||{};
 put('dt37ScalpStatus',d?.status==='RECORDED'?(d?.latest?.serviceStatus||'RECORDED'):(d?.status||'NOT_RECORDED'));
 put('dt37ScalpCount',d?.status==='RECORDED'?`${summary.entered??0} / ${summary.closed??0}`:'—');
 put('dt37ScalpNet',d?.status==='RECORDED'&&summary.priced?`$${Number(summary.netPaperUsd||0).toFixed(2)} (ورقي)`:'غير متحقق');
 put('dt37ScalpPatterns',d?.latest?.patternsSupported??'—');
 const trades=$('dt37ScalpPositions');if(trades){trades.replaceChildren();
  const all=(d?.positions||[]).slice(-24);if(!all.length)trades.append(el('div','empty-state','لا توجد صفقات سكالب ورقية محفوظة.'));
  for(const p of all){const card=el('article','dt36-transition');card.append(el('strong',null,`${p.symbol} · ${p.setupType||'—'} · ${p.status}`));
   card.append(el('div',null,`الدخول: ${p.entry??'—'} · الهدف: ${p.target??'—'} · الوقف: ${p.stop??'—'} · الكمية: ${p.qty??'—'}`));
   card.append(el('small',null,`النتيجة: ${p.outcome||'مفتوحة'} · صافي ورقي: ${p.netUsd??'غير مسعر'} · تنفيذ افتراضي فقط`));trades.append(card)}
 }
 const research=$('dt37ScalpAnalysis');if(research){research.replaceChildren();const report=d?.agentReview;
  if(report?.status!=='LOCAL_EVIDENCE_REVIEW'){research.append(el('div','empty-state','لم يُسجل الباحث مراجعة سكالب مستقلة لهذه الجلسة بعد.'));return}
  research.append(el('p','muted',`مراجعة محلية مستقلة · ${report.source?.cycles||0} دورات · ${report.summary?.pricedUnique||0} إغلاقاً مسعّراً · لا تعديل تلقائياً`));
  const suggestions=report.recommendations||[];if(!suggestions.length)research.append(el('div','empty-state','لا توجد مقترحات جديدة مدعومة بالسجل.'));
  for(const suggestion of suggestions.slice(0,8)){const card=el('article','desk-research-idea');
   card.append(el('span','desk-research-idea-tag',suggestion.area+' · PROPOSED_UNTESTED'));
   card.append(el('h3',null,suggestion.hypothesis));card.append(el('p','muted',suggestion.observation));
   card.append(el('small',null,`${suggestion.test} · معيار القبول: ${suggestion.acceptanceMetric}`));research.append(card)}
 }
}
async function refresh(force=false){
 if(loading||(!force&&Date.now()-last<3*60000))return;loading=true;last=Date.now();
 try{const response=await fetch('/api/scalp-paper',{cache:'no-store'});if(!response.ok)throw Error(`HTTP_${response.status}`);
  const data=await window.DT37ApiJson.parse(response);render(data);
 }catch(e){put('dt37ScalpStatus','ARCHIVE_UNAVAILABLE');put('dt37ScalpNet','NOT VERIFIED')}
 finally{loading=false}
}
function start(){const button=$('dt37ScalpRefresh');if(button)button.addEventListener('click',()=>refresh(true));
 window.addEventListener('dynamic-trading:tabchange',e=>{if(e?.detail?.tab==='research')refresh()});
 if(document.querySelector('#tab-research.active'))refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
