/* DT PULSE 3.9 — independent research presentation; no new API calls.
   All recommendations, prices, status and counts derive from archived records. */
(()=>{'use strict';
const E=id=>document.getElementById(id);
const put=(id,v)=>{const x=E(id);if(x)x.textContent=String(v??'—')};
const valid=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const money=x=>valid(x)?'$'+Number(x).toFixed(2):'—';
const icons={flask:'<path d="M9 3h6M10 3v6L4 19a1.4 1.4 0 0 0 1.3 2h13.4a1.4 1.4 0 0 0 1.3-2L14 9V3M7 16h10"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8m-5 0h5v5"/>',ai:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v5m10-5v5M3 10h18"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-8"/>',cross:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',file:'<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7m-7 4h7"/>',history:'<path d="M3 12a9 9 0 1 1 3 6M3 17v-5h5M12 7v5l4 2"/>',openai:'<circle cx="12" cy="12" r="9"/><path d="m12 4 6 4v8l-6 4-6-4V8z"/>',down:'<path d="m6 9 6 6 6-6"/>',eye:'<path d="M2 12c4-7 16-7 20 0-4 7-16 7-20 0z"/><circle cx="12" cy="12" r="3"/>',approve:'<path d="m4 12 6 6L20 5"/>',reject:'<path d="m5 5 14 14M19 5 5 19"/>'};
const ico=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]||icons.file}</svg>`;
function template(){return `<div class="r39" id="dt39-research" dir="rtl" lang="ar">
 <section class="r39-heading"><h1>${ico('flask')} الباحث</h1><p>التقارير والتحليلات والتوصيات من ماسح AI و OpenAI</p></section>
 <div class="r39-tabs" role="tablist" aria-label="مصادر البحث">
 <button type="button" data-r39-tab="ai" role="tab" aria-selected="false">${ico('ai')} تقرير ماسح AI</button>
 <button type="button" data-r39-tab="openai" role="tab" aria-selected="false">${ico('openai')} تقرير OpenAI</button>
 <button type="button" data-r39-tab="recommendations" class="selected" role="tab" aria-selected="true">${ico('target')} التوصيات</button>
 </div>
 <section class="r39-overview" aria-label="مؤشرات الباحث"><div class="r39-overview-title">${ico('file')} ملخص اليوم</div>
 <div class="r39-metric"><span>${ico('file')} إجمالي التوصيات</span><b id="r39-total">—</b></div>
 <div class="r39-metric"><span>${ico('check')} موافقة</span><b id="r39-accepted">—</b></div>
 <div class="r39-metric"><span>${ico('cross')} مرفوضة</span><b id="r39-rejected">—</b></div>
 <div class="r39-metric r39-date"><span>${ico('calendar')} آخر تقرير</span><b id="r39-date">—</b></div></section>
 <div class="r39-panes">
 <section data-r39-pane="recommendations" class="r39-pane"><header class="r39-row-heading">${ico('target')} <strong>التوصيات الحالية</strong><span id="r39-source-note">من التقرير المحفوظ</span></header><div id="r39-list" class="r39-list" aria-live="polite">لا توجد توصيات محفوظة</div></section>
 <section data-r39-pane="openai" class="r39-pane" hidden><header class="r39-row-heading">${ico('openai')} <strong>تقرير OpenAI</strong></header><div class="r39-report" id="r39-openai">لا يوجد تقرير مكتمل محفوظ</div></section>
 <section data-r39-pane="ai" class="r39-pane" hidden><header class="r39-row-heading">${ico('ai')} <strong>تقرير ماسح AI</strong></header><div class="r39-report" id="r39-ai-report">لا يوجد تقرير ماسح AI محفوظ</div></section>
 </div>
 <div class="r39-accordions"><details><summary>${ico('ai')} تقرير ماسح AI – ملخص اليوم ${ico('down')}</summary><div id="r39-ai-detail">لا يوجد تقرير محفوظ</div></details>
 <details><summary>${ico('openai')} تقرير OpenAI – التحليل العام والتوقعات ${ico('down')}</summary><div id="r39-openai-detail">لا يوجد تقرير محفوظ</div></details>
 <details><summary>${ico('history')} التوصيات السابقة وقراراتي ${ico('down')}</summary><div class="r39-history"><button type="button" data-research-history="1">عرض قراراتي المحفوظة</button><div id="pu-owner-history"></div><div id="pu-owner-history-full"></div></div></details></div>
 <p class="r39-note">القرارات المقترحة لا تُطبّق تلقائياً، وتعتمد على الأدلة المسجلة فقط.</p>
 </div>`;}
let latestResearch=null,latestAI=null;
function recommendationState(x){const v=String(x?.verdict||x?.status||'').toUpperCase();return v==='APPROVED'?'موافقة':v==='REJECTED'?'رفض':'بانتظار القرار';}
function render(research,ai){latestResearch=research||null;latestAI=ai||null;const host=E('dt39-research');if(!host)return;
 const report=latestResearch;const offers=report?[...(Array.isArray(report.experiments)?report.experiments:[]),...(Array.isArray(report.localHypotheses)?report.localHypotheses:[])]:[];
 put('r39-total',report?offers.length:'—');put('r39-accepted','—');put('r39-rejected','—');put('r39-date',report?.day||report?.updatedAt||'—');
 put('r39-source-note',report?.paidStatus==='REVIEW_CREATED_NOT_APPLIED'?'OpenAI — غير مطبق':report?'من التحليل المحلي':'لا بيانات موثقة');
 const list=E('r39-list');list.replaceChildren();
 if(!offers.length){list.textContent='لا توجد توصيات حالية محفوظة';list.classList.add('r39-empty')}else{list.classList.remove('r39-empty');offers.slice(0,12).forEach((x,i)=>{const row=document.createElement('article');row.className='r39-offer';
 const title=document.createElement('strong');title.className='r39-offer-symbol';title.textContent=String(x.symbol||x.ticker||x.area||'بحث').slice(0,36);
 const heading=document.createElement('b');heading.className='r39-offer-heading';heading.textContent=String(x.hypothesis_ar||x.hypothesis||x.title||'توصية بحثية').slice(0,180);
 const summary=document.createElement('small');summary.className='r39-offer-summary';summary.textContent=String(x.test_ar||x.experiment||x.summary||'لا توجد أدلة إضافية محفوظة').slice(0,220);
 const state=document.createElement('span');state.className='r39-offer-badge';state.textContent=recommendationState(x);
 const actions=document.createElement('div');actions.className='r39-actions';for(const [text,verdict] of [['موافقة','APPROVE'],['رفض','REJECT']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.ownerVerdict=verdict;b.dataset.ownerId=String(x.id||`${report?.day||'unknown'}-${x.area||'GENERAL'}-${i}`).slice(0,110);b.dataset.ownerSummary=String(x.hypothesis_ar||x.hypothesis||'').slice(0,200);actions.append(b)}
 row.append(title,heading,state,actions,summary);list.append(row)})}
 const status=report?.paidStatus==='REVIEW_CREATED_NOT_APPLIED'?'مراجعة OpenAI محفوظة – غير مطبقة':'حالة OpenAI غير متحققة';
 put('r39-openai',report?`${status} · ${report.summary||report.daily?.summary||'لا يوجد ملخص نصي'}`:'لا يوجد تقرير OpenAI محفوظ');
 put('r39-openai-detail',report?`${status} · ${report.delivery?.reason||report.summary||report.paidStatus||'لا تفاصيل موثقة'}`:'لا يوجد تقرير مكتمل محفوظ');
 const ar=ai?.internalReport||ai?.recommendations?.internalReport||null;const aiSummary=ar?.summary||ar?.interpretation||ar?.researchSummary||ai?.recommendations?.strategicSummary||null;
 put('r39-ai-report',aiSummary?String(aiSummary).slice(0,700):'لم يُحفظ ملخص تقرير ماسح AI');
 put('r39-ai-detail',ar?`تقرير داخلي محفوظ · ${ar.generatedAt||ar.day||'وقت غير متوفر'} · الصافي الورقي ${money(ar.outcomes?.netPaperUsd)}`:'لا يوجد تقرير ماسح AI محفوظ');
}
function bind(){const root=E('dt39-research');if(!root||root.dataset.bound)return;root.dataset.bound='1';root.addEventListener('click',e=>{const b=e.target.closest('[data-r39-tab]');if(!b)return;root.querySelectorAll('[data-r39-tab]').forEach(el=>{const selected=el===b;el.classList.toggle('selected',selected);el.setAttribute('aria-selected',String(selected))});root.querySelectorAll('[data-r39-pane]').forEach(el=>el.hidden=el.dataset.r39Pane!==b.dataset.r39Tab)})}
window.DT39ResearchScreen=Object.freeze({template,render,bind});
})();
