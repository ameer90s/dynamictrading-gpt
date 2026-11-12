/** DT PULSE 3.8: UI-only projections of existing data. Never fabricate trading results. */
(()=>{'use strict';
const $=id=>document.getElementById(id),T=(id,text)=>{const n=$(id);if(n)n.textContent=String(text??'غير متوفر')};
const money=n=>typeof n==='number'&&Number.isFinite(n)?`$${n.toFixed(2)}`:'—';
const safePrice=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
let scannerRows=[],activeFilter='ALL',report=null,aiPaper=null;
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x};
function dialog(){let d=$('dt38SignalDialog');if(d)return d;d=document.createElement('dialog');d.id='dt38SignalDialog';d.className='dt38-dialog';d.innerHTML='<form method="dialog"><button class="dt38-close" aria-label="إغلاق">✕</button><h2 id="dt38ModalTitle"></h2><div id="dt38ModalContent"></div><button class="secondary">إغلاق التفاصيل</button></form>';document.body.append(d);return d;}
function showSignal(x){
 const d=dialog();T('dt38ModalTitle',`${x.symbol} · ${x.recommendationState==='CONFIRMED'?'فرصة مؤكدة':'فرصة للمتابعة'}`);
 const content=$('dt38ModalContent');content.replaceChildren();
 const values=[['حالة الإشارة',x.recommendationState],['السعر الحالي',money(safePrice(x.price))],['منطقة الدخول',x.entryLow!=null&&x.entryHigh!=null&&Number.isFinite(Number(x.entryLow))&&Number.isFinite(Number(x.entryHigh))?`${money(safePrice(x.entryLow))} – ${money(safePrice(x.entryHigh))}`:'—'],['الهدف الأول',x.recommendationState==='CONFIRMED'?money(safePrice(x.target1)):'غير مؤكد'],['وقف الخسارة',x.recommendationState==='CONFIRMED'?money(safePrice(x.stopLoss)):'غير مؤكد'],['السبب',x.stateReason||x.reason||'لا توجد تفاصيل محفوظة'],['آخر تحديث',x.generatedAt||'غير متوفر']];
 for(const [a,b] of values){const row=el('div','dt38-popup-row');row.append(el('span',null,a),el('strong',null,b));content.append(row)}
 const details=el('details');details.append(el('summary',null,'معلومات التحليل الإضافية'));const pre=el('pre');pre.textContent=JSON.stringify({checks:x.researchDecision?.checks||null,metrics:x.metrics||null,quote:x.quote||null},null,2);details.append(pre);content.append(details);
 if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');
}
function filterCards(){const box=$('top5');if(!box)return;const cards=[...box.querySelectorAll('.mini-rec')];cards.forEach((card,i)=>{const row=scannerRows[i];card.hidden=!!row&&activeFilter!=='ALL'&&row.recommendationState!==activeFilter;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`تفاصيل ${row?.symbol||'الفرصة'}`);});}
function showPaper(p){if(!p){return}const positions=p.positions||[];const unique=[...new Map(positions.filter(x=>x?.id).map(x=>[x.id,x])).values()];const closed=unique.filter(x=>x.status==='CLOSED'&&Number.isFinite(Number(x.netUsd)));let win=0,loss=0,grossWin=0,grossLoss=0;for(const x of closed){const amount=Number(x.netUsd);if(amount>0){win++;grossWin+=amount}else if(amount<0){loss++;grossLoss+=amount}}const msg=closed.length?`مغلقة ${closed.length} · رابحة ${win} (${money(grossWin)}) · خاسرة ${loss} (${money(grossLoss)}) · الصافي ${money(grossWin+grossLoss)}`:'لا توجد صفقات ورقية مغلقة موثقة';T('dt38AiPaperPerformance',`ماسح AI — ${msg}`);T('dt38AiScannerPaper',msg);}
function showWeek(r){
 const starting=Number(r?.startingCapital);
 const net=r?.netAfterConfiguredCommissionsBeforeSpreadSlippage;
 const incomplete=r?.complete!==true||!Number.isFinite(net)||!Number.isFinite(starting)||starting<=0;
 if(incomplete){T('dt38WeeklyProgress','التقدم نحو الهدف: غير متحقق — الأسبوع أو التكاليف غير مكتملة');return}
 const goal=starting*.02,progress=Math.max(0,Math.min(100,net/goal*100));
 T('dt38WeeklyProgress',`الهدف ${money(goal)} · الصافي الورقي بعد العمولة المفترضة ${money(net)} · التقدم ${progress.toFixed(1)}% · السبريد والانزلاق غير محسوبين`);
}
function detailsText(parent,label,value){const line=el('div','dt38-report-line');line.append(el('strong',null,label),el('p',null,value));parent.append(line)}
function drawReport(r){report=r;const root=$('dt38ReportDetail');if(!root)return;root.replaceChildren();const paid=r.paidStatus==='REVIEW_CREATED_NOT_APPLIED';
 detailsText(root,'النوع',paid?'مراجعة OpenAI محفوظة':'تقرير محلي / حالة OpenAI غير متحققة');
 detailsText(root,'الجلسة والتشغيل',`${r.day||'—'} · ${r.delivery?.status||'إيصال غير متوفر'} · ${r.updatedAt||'—'}`);
 detailsText(root,'الملخص',r.summary||r.daily?.summary||'لا يوجد ملخص محفوظ');
 if(!paid)detailsText(root,'سبب عدم صدور OpenAI',r.delivery?.reason||r.paidStatus||'لم يُسجل السبب');
 if(r.usage)detailsText(root,'استخدام API المسجل',`مدخل ${r.usage.inputTokens??'—'} · مخرج ${r.usage.outputTokens??'—'} · تكلفة تقريبية ${money(r.usage.estimatedUsd)}`);
 const list=$('dt38ResearchDecisions');if(!list)return;list.replaceChildren();const items=[...(r.experiments||[]),...(r.localHypotheses||[])].slice(0,15);if(!items.length)list.append(el('p','muted','لا توجد توصيات قابلة للمراجعة محفوظة'));
 items.forEach((x,i)=>{const id=String(x.id||`${r.day||'unknown'}-${x.area||'general'}-${i}`).slice(0,110);const card=el('article','dt38-advice');card.append(el('strong',null,x.hypothesis_ar||x.hypothesis||x.area||'توصية بحثية'));const more=el('details');more.append(el('summary',null,'أدلة وخطة الاختبار'));more.append(el('p',null,x.test_ar||x.experiment||'الاختبار غير متحقق'));card.append(more);const actions=el('div','dt38-actions');for(const [title,verdict] of [['موافقة','APPROVE'],['رفض','REJECT']]){const b=el('button','secondary',title);b.type='button';b.addEventListener('click',()=>recordDecision({id,verdict,source:paid?'OPENAI':'LOCAL',day:r.day,summary:x.hypothesis_ar||x.hypothesis||''},card));actions.append(b)}card.append(actions);list.append(card)});
 // Owner may retrieve saved decisions explicitly; never store the token in browser storage.
 const history=el('button','secondary','عرض قراراتي المحفوظة');history.type='button';history.addEventListener('click',async()=>{const token=window.prompt('رمز مراجعة الباحث:');if(!token)return;try{const response=await fetch(`/api/research-decision38?day=${encodeURIComponent(r.day)}`,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw Error('AUTH_OR_READ_FAILED');const data=await response.json();const out=el('div','dt38-decisions-history');for(const d of data.decisions||[]){const line=el('p',null,`${d.verdict==='APPROVE'?'موافقة':'رفض'} · ${d.at} · ${d.summary||d.id}`);out.append(line)}if(!out.childNodes.length)out.append(el('p',null,'لا توجد قرارات محفوظة لهذه الجلسة'));list.append(out);history.disabled=true;}catch{list.append(el('p',null,'تعذر جلب القرارات؛ لم يتم افتراض نجاح الحفظ.'))}});list.append(history);
}
async function recordDecision(payload,card){
 // An explicit owner token is required by the server; never embed or persist in localStorage.
 const token=window.prompt('رمز مراجعة الباحث الخاص بك (DT38_DECISION_ADMIN_TOKEN):');if(!token)return;
 const message=el('p','muted','جاري حفظ القرار…');card.append(message);
 try{const r=await fetch('/api/research-decision38',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify(payload)});const v=await r.json();message.textContent=r.ok?`تم تسجيل القرار: ${payload.verdict==='APPROVE'?'موافقة':'رفض'} · ${v.at}`:`لم يُحفظ القرار: ${v.error||r.status}`;}catch{message.textContent='تعذر حفظ القرار؛ لا نفترض نجاحه.'}
}
function provider(name,status,at){const r=el('div','dt38-provider');const state=['LIVE','ok'].includes(status)?'live':['FALLBACK','fallback','DEGRADED'].includes(status)?'fallback':status==='NOT_CONFIGURED'||status==='not_configured'?'missing':'error';r.append(el('strong',null,name),el('span','dt38-provider-'+state,({live:'● LIVE',fallback:'● افتراضي / متراجع',missing:'● غير مهيأ',error:'● غير متحقق'}[state])+(at?` · ${at}`:'')));return r}
async function refreshProviders(){const box=$('dt38ProviderStatus');if(!box)return;try{const r=await fetch('/api/provider-status38',{cache:'no-store'});if(!r.ok)throw Error('HTTP_ERROR');const data=await r.json();box.replaceChildren(provider('Alpaca',data.alpaca?.status,data.alpaca?.lastVerifiedAt),provider('Finnhub',data.finnhub?.status,data.finnhub?.lastVerifiedAt));}catch{box.textContent='تعذر التحقق من الحالة المحفوظة؛ لن نفترض أن الاتصال LIVE.'}}
function updateTodaySummary(){
 const rows=Array.isArray(window.DT38LastScannerRows)?window.DT38LastScannerRows:scannerRows;
 const confirmed=rows.filter(x=>x?.recommendationState==='CONFIRMED').length;
 T('dt38TodayConfirmed',rows.length?String(confirmed):'—');
 const snapshot=window.DT38LastScannerMeta||{};
 const lastMarket=document.getElementById('marketStatus')?.textContent?.trim();
 T('dt38TodayMarket',lastMarket&& !/جاري|بانتظار/.test(lastMarket)?lastMarket:'غير متحقق');
 const research=window.DT38LastResearch;
 T('dt38TodayDataQuality',research?.delivery?.status==='DELIVERED'?'آخر تقرير محفوظ':'غير متحقق');
}
function boot(){
 if(window.DT38LastScannerRows)scannerRows=window.DT38LastScannerRows;if(window.DT38LastScannerMeta){T('dt38ShariaSource',window.DT38LastScannerMeta.source||'غير متوفر');T('dt38ShariaUpdated',window.DT38LastScannerMeta.updatedAt||'غير متوفر')}if(window.DT38LastResearch)drawReport(window.DT38LastResearch);if(window.DT38LastWeekly)showWeek(window.DT38LastWeekly);if(window.DT38LastAiPaper)showPaper(window.DT38LastAiPaper);
 updateTodaySummary();
 $('dt38Settings')?.addEventListener('click',()=>window.DynamicTradingTabNav?.activate('tools',true));
 document.querySelectorAll('[data-dt38-filter]').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.dt38Filter;document.querySelectorAll('[data-dt38-filter]').forEach(x=>x.classList.toggle('active',x===b));filterCards()}));
 $('top5')?.addEventListener('click',e=>{if(e.target.closest('button'))return;const card=e.target.closest('.mini-rec');if(!card)return;const index=[...card.parentElement.querySelectorAll('.mini-rec')].indexOf(card);if(scannerRows[index]&&['SMART','CONFIRMED'].includes(scannerRows[index].recommendationState))showSignal(scannerRows[index])});
 $('top5')?.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.mini-rec');if(!card)return;e.preventDefault();card.click()});
 window.addEventListener('dt38:scanner-rows',e=>{scannerRows=e.detail||[];filterCards();updateTodaySummary()});
 window.addEventListener('dt38:scanner-meta',e=>{T('dt38ShariaSource',e.detail.source||'غير متوفر');T('dt38ShariaUpdated',e.detail.updatedAt||'غير متوفر')});
 window.addEventListener('dt38:ai-paper',e=>{aiPaper=e.detail;showPaper(aiPaper)});
 window.addEventListener('dt38:weekly',e=>showWeek(e.detail));
 window.addEventListener('dt38:research',e=>{drawReport(e.detail||{});updateTodaySummary()});
 window.addEventListener('dynamic-trading:tabchange',e=>{if(e.detail?.tab==='tools')refreshProviders()});
 const ai=document.querySelector('#tab-ai .dt37-section-intro');if(ai&&!$('dt38AiScannerPaper'))ai.insertAdjacentHTML('afterend','<section class="card dt38-strategic"><h2>نتائج الصفقات الورقية — تلقائي</h2><p id="dt38AiScannerPaper">لا توجد بيانات موثقة بعد</p><details><summary>التفاصيل الإحصائية والمخاطرة</summary><p>تظهر بيانات المصدر الموثقة في سجل ماسح AI القابل للطي أسفل القسم.</p></details></section>');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* Read-only visual mirrors of the existing weekly calculator; no independent accounting. */
(() => {
 const read = (sel) => (document.querySelector(sel)?.textContent || '').trim();
 const write = (id,val) => { const n=document.getElementById(id);if(n)n.textContent=val||'—'; };
 const recalc = () => {
   write('dt38PerformanceRate',read('[data-weekly371-rate]'));
   write('dt38PerformanceNet',read('[data-weekly371-net]'));
   write('dt38PerformanceTrades',read('#statTotal'));
   write('dt38PerformanceStatus',read('[data-weekly371-completeness]') || 'بانتظار النتائج');
 };
 function init(){
  const n=document.querySelector('#weekly371Calculator');
  if(!n)return;
  recalc();
  const o=new MutationObserver(recalc);
  o.observe(n,{subtree:true,childList:true,characterData:true});
  const total=document.querySelector('#statTotal');
  if(total)new MutationObserver(recalc).observe(total,{childList:true,characterData:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
