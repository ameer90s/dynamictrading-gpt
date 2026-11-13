/* DT PULSE 3.9 — independent scanner view. No trading engine or network side effects.
   Read-only projections from the existing scanner rows (DT38LastScannerRows).
   Never substitute sample data into production. */
(()=>{'use strict';
const icons={trend:'<path d="m3 18 6-6 4 3 7-9m-6 0h6v6"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-8"/>',watch:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="m12 1v4m0 14v4M1 12h4m14 0h4"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',close:'<path d="M5 5l14 14M19 5 5 19"/>',docs:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h6"/>',db:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',chart:'<path d="M3 20V13m6 7V8m6 12V4m6 16v-9"/>',chev:'<path d="m6 9 6 6 6-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',settings:'<path d="M3 6h18M3 12h18M3 18h18M8 4v4M16 10v4M9 16v4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',basket:'<path d="m4 10 4 11h8l4-11M2 10h20M8 10l4-8 4 8"/>',layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>'};
const svg=(n)=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${icons[n]||icons.check}</svg>`;
const esc=(s)=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usable=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const money=x=>usable(x)?Number(x).toFixed(2):'—';
const validRow=r=>r&&typeof r==='object'&&typeof r.symbol==='string'&&/^[A-Z0-9.^-]{1,16}$/i.test(r.symbol);

/* Static decorative brand marks only; never used as market identifiers or data evidence. */
function markFor(symbol){
 if(symbol==='AAPL')return '<svg viewBox="0 0 44 44" aria-hidden="true"><path fill="#f7fff9" d="M23 13c-3.5-3-8-3.3-11.3.2-3.6 3.8-2.5 13.2 2 19.3 1.2 1.8 2.6 3 4.6 2.9 1.6 0 2.1-.9 4.7-.9 2.4 0 3.1.9 4.7.9 2 0 3.2-1.1 4.6-2.9 1.6-2 2.9-4.5 3.7-7.2-3.6-1.6-4.5-7.4-.7-10-3-3.1-6.9-3.1-10.3-.4z"/><path d="M22 13c0-5 3.4-8.1 7.8-8.9-.1 4.1-2.7 7.8-7.8 8.9z" fill="#caff9e"/></svg>';
 if(symbol==='MSFT')return '<span class="s39-msft"><i></i><i></i><i></i><i></i></span>';
 if(symbol==='NVDA')return '<svg viewBox="0 0 44 44" aria-hidden="true" fill="none" stroke="#9fff4e" stroke-width="3"><path d="M6 24c9-17 25-16 33-3-8 13-24 15-33 3z"/><circle cx="23" cy="22" r="7"/><circle cx="23" cy="22" r="2" fill="#b8ff42"/></svg>';
 return null;
}

let selected='CONFIRMED', rows=[], lastSignature='', shown=null;
function template(){return `<div id="dt39-scanner" lang="ar" dir="rtl" aria-label="الماسح الأساسي — التصميم الجديد">
 <div class="s39-heading"><div class="s39-title"><h1>الماسح ${svg('search')}</h1><p>فرص التداول من الماسح الأساسي</p></div></div>
 <div class="s39-overview" aria-label="ملخص فرص الماسح">
  <div class="s39-counter"><span>حالة السوق</span><strong id="s39-market-direction">غير متحقق</strong><i>${svg('trend')}</i></div>
  <div class="s39-counter"><span>الفرص المؤكدة</span><strong id="s39-confirmed-count">—</strong><i>${svg('check')}</i></div>
  <div class="s39-counter"><span>فرص المتابعة</span><strong id="s39-watch-count">—</strong><i>${svg('watch')}</i></div>
 </div>
 <div class="s39-filters" role="group" aria-label="عرض أنواع الفرص"><button type="button" data-s39-filter="CONFIRMED" aria-pressed="true" class="selected">${svg('check')} الفرص المؤكدة <b id="s39-filter-confirmed">—</b></button><button type="button" data-s39-filter="SMART" aria-pressed="false">${svg('watch')} فرص المتابعة <b id="s39-filter-watch">—</b></button></div>
 <section class="s39-board" aria-label="قائمة الفرص">
  <div class="s39-board-title"><span id="s39-list-title">الفرص المؤكدة</span><span class="s39-live-note">الفرص المسجلة فقط</span></div>
  <div class="s39-opportunity-list" id="s39-opportunity-list" aria-live="polite"><p class="s39-empty">لا توجد فرص محفوظة لهذه الحالة</p></div>
  <div class="s39-board-foot" id="s39-list-foot">اضغط على أي فرصة لعرض التفاصيل الموثقة</div>
 </section>
 <details class="s39-archive"><summary>${svg('layers')} بيانات الفحص وأسباب القرارات ${svg('chev')}</summary><div id="s39-data-note">لا توجد بيانات موثقة حالياً</div></details>
 <section class="s39-detail-overlay" id="s39-detail-overlay" hidden aria-label="تفاصيل الفرصة المختارة" role="dialog" aria-modal="true"><div class="s39-backdrop" data-s39-close="1"></div><article class="s39-dialog"><button type="button" data-s39-close="1" class="s39-close" aria-label="إغلاق التفاصيل">${svg('close')}</button><div id="s39-detail-content"></div></article></section>
 </div>`;}
function text(root,id,value){let e=root.querySelector('#'+id);if(e&&e.textContent!==String(value))e.textContent=String(value)}
function filter(root,state){selected=state==='SMART'?'SMART':'CONFIRMED';root.querySelectorAll('[data-s39-filter]').forEach(btn=>{const on=btn.dataset.s39Filter===selected;btn.classList.toggle('selected',on);btn.setAttribute('aria-pressed',String(on))});renderList(root);}
function rowButton(r,compact=false){
 const b=document.createElement('button');b.type='button';b.className='s39-result'+(compact?' s39-preview-result':'');const symbol=document.createElement('strong');symbol.textContent=r.symbol;const company=document.createElement('small');company.textContent=String(r.companyName||r.company||r.name||'').slice(0,45);const meta=document.createElement('span');meta.className='s39-company';meta.append(symbol,company);const state=document.createElement('span');state.className='s39-result-state';state.textContent=r.historicalOnly?'◴':r.recommendationState==='CONFIRMED'?'✓':'◷';const mark=document.createElement('span');mark.className='s39-result-mark';const decoration=markFor(r.symbol);if(decoration)mark.innerHTML=decoration;else mark.textContent=r.symbol.slice(0,1);if(r.historicalOnly){const note=document.createElement('small');note.className='s39-historical-label';note.textContent='سجل سابق · ليس دخولاً';meta.append(note);}b.append(state,meta,mark);b.addEventListener('click',()=>open(b.closest('#pulse-app'),r));return b;
}
function renderList(root){
 const host=root.querySelector('#s39-opportunity-list');if(!host)return;host.replaceChildren();const subset=rows.filter(r=>r.recommendationState===selected);
 text(root,'s39-list-title',selected==='SMART'?'فرص المتابعة':'الفرص المؤكدة');
 if(!subset.length){const p=document.createElement('p');p.className='s39-empty';p.textContent=rows.length?'لا توجد فرص من هذا النوع في السجل الحالي':'لم تصل بيانات فرص موثقة بعد';host.appendChild(p);text(root,'s39-list-foot','لا توجد فرص قابلة للعرض حالياً');return;}
 // In the approved reference, a compact preview of SMART opportunities remains visible
 // below the confirmed list. Those rows are always sourced from stored scanner results.
 const mainLimit=selected==='CONFIRMED'?3:40;
 for(const r of subset.slice(0,mainLimit))host.appendChild(rowButton(r));
 const watches=rows.filter(r=>r.recommendationState==='SMART');
 if(selected==='CONFIRMED'&&watches.length){
  const group=document.createElement('section');group.className='s39-watch-preview';
  const heading=document.createElement('h3');heading.textContent='فرص المتابعة';const count=document.createElement('span');count.textContent=String(watches.length);heading.append(count);group.append(heading);
  for(const r of watches.slice(0,2))group.appendChild(rowButton(r,true));host.appendChild(group);
 }
 text(root,'s39-list-foot',selected==='CONFIRMED'&&watches.length?`عرض ${Math.min(subset.length,3)} فرص مؤكدة · ${Math.min(watches.length,2)} فرص متابعة · اضغط للعرض`:`عرض ${Math.min(subset.length,mainLimit)} من ${subset.length} فرصة · التفاصيل عند الاختيار`);
}
function detailsRows(root,container,items){for(const [label,value] of items){const div=document.createElement('div');div.className='s39-price';const key=document.createElement('span');key.textContent=label;const strong=document.createElement('strong');strong.textContent=value;div.append(key,strong);container.appendChild(div)}}
function open(root,r){if(!validRow(r))return;shown=r;const host=root.querySelector('#s39-detail-content'),overlay=root.querySelector('#s39-detail-overlay');host.replaceChildren();
 const top=document.createElement('div');top.className='s39-modal-top';const badge=document.createElement('span');badge.className='s39-save-pill';badge.textContent=r.historicalOnly?'سجل تاريخي — ليس توصية جديدة':r.autoRecorded===true?'التسجيل التلقائي':'إشارة مسجلة';const h=document.createElement('h2');h.textContent=r.recommendationState==='CONFIRMED'?'تفاصيل الفرصة المؤكدة':'تفاصيل فرصة المتابعة';top.append(badge,h);host.append(top);
 const company=document.createElement('div');company.className='s39-modal-company';const left=document.createElement('span');left.className='s39-modal-logo';const decoration=markFor(r.symbol);if(decoration)left.innerHTML=decoration;else left.textContent=r.symbol.slice(0,1);const textbox=document.createElement('div');const ticker=document.createElement('strong');ticker.textContent=r.symbol;const sub=document.createElement('small');sub.textContent=String(r.companyName||r.company||r.name||'السهم المختار');textbox.append(ticker,sub);const type=document.createElement('span');type.className='s39-type';type.textContent=r.recommendationState==='CONFIRMED'?'شراء ↗':'متابعة ◷';company.append(type,textbox,left);host.append(company);
 const price=document.createElement('div');price.className='s39-prices';const confirmed=r.recommendationState==='CONFIRMED'&&!r.historicalOnly;detailsRows(root,price,[['الدخول',money(r.entryLow??r.entryPrice??r.price)],['الهدف',confirmed?money(r.target1):'غير مؤكد'],['وقف الخسارة',confirmed?money(r.stopLoss):'غير مؤكد']]);host.append(price);
 const why=document.createElement('div');why.className='s39-reasons';const whytitle=document.createElement('strong');whytitle.textContent=confirmed?'أسباب التأكيد':'أسباب المتابعة';why.append(whytitle);const checks=r.researchDecision?.checks||r.research36?.checks||r.checks;const checkTitles={breakout:'اختراق مستوى مقاومة',price:'ملاءمة السعر ومنطقة الدخول',market:'توافق مع اتجاه السوق العام',spread:'السبريد ضمن الحدود',quoteFresh:'حداثة بيانات السعر',volume:'الحجم والسيولة'};let reasons=[];if(Array.isArray(checks))reasons=checks.filter(x=>x?.passed===true||x===true).map(x=>x?.label||x?.reason||String(x));else if(checks&&typeof checks==='object')reasons=Object.entries(checks).filter(([,v])=>v===true||v?.passed===true).map(([k,v])=>v?.label||checkTitles[k]||k);
 if(!reasons.length){const reason=r.stateReason||r.reason;reasons=reason?[String(reason)]:['أسباب التأكيد التفصيلية غير محفوظة'];}for(const s of reasons.slice(0,4)){const p=document.createElement('p');p.textContent='✓ '+String(s).slice(0,140);why.append(p)}host.append(why);
 const status=document.createElement('div');status.className='s39-status';status.innerHTML=`<span>الحالة</span><b>${confirmed?'مؤكدة':'متابعة'}</b>`;host.append(status);
 const time=document.createElement('div');time.className='s39-status';const timeKey=document.createElement('span');timeKey.textContent='وقت التسجيل';const timeVal=document.createElement('b');timeVal.textContent=String(r.generatedAt||r.confirmedAt||r.selectedAt||'غير متوفر');time.append(timeKey,timeVal);host.append(time);
 const extra=[['التحليل الفني المختصر',r.metrics?.setupFamilyLabel||r.metrics?.setupFamily||r.reason||'غير متوفر'],['معايير التأكيد',checks?JSON.stringify(checks,null,2):'غير متوفرة'],['ملاحظات الماسح',r.stateReason||r.reason||'غير متوفرة']];for(const [label,content] of extra){const d=document.createElement('details');d.className='s39-fold';const s=document.createElement('summary');s.textContent=label;const p=document.createElement('p');p.textContent=String(content);d.append(s,p);host.append(d)}overlay.hidden=false;const close=root.querySelector('.s39-close');close?.focus();}
function close(root){const modal=root.querySelector('#s39-detail-overlay');if(modal)modal.hidden=true;shown=null;}
function render(root,info){if(!root?.querySelector('#dt39-scanner'))return;const incoming=Array.isArray(info?.rows)?info.rows.filter(validRow):[];const unique=new Map();for(const r of incoming)unique.set(r.symbol+':'+r.recommendationState,r);const cleaned=[...unique.values()];const signature=JSON.stringify(cleaned.map(r=>[r.symbol,r.historicalOnly,r.recommendationState,r.entryLow,r.price,r.target1,r.stopLoss,r.stateReason,r.generatedAt,r.companyName,r.reason,r.researchDecision?.checks]));const countKnown=info?.rowsKnown===true;
 text(root,'s39-market-direction',info?.trend||'غير متحقق');text(root,'s39-confirmed-count',countKnown?cleaned.filter(x=>x.recommendationState==='CONFIRMED').length:'—');text(root,'s39-watch-count',countKnown?cleaned.filter(x=>x.recommendationState==='SMART').length:'—');text(root,'s39-filter-confirmed',countKnown?cleaned.filter(x=>x.recommendationState==='CONFIRMED').length:'—');text(root,'s39-filter-watch',countKnown?cleaned.filter(x=>x.recommendationState==='SMART').length:'—');const historicalCount=cleaned.filter(x=>x.historicalOnly).length;text(root,'s39-data-note',`المصدر: نتائج الماسح المحفوظة · ${info?.visibilityNote||'الحالة غير متحققة'} · ${historicalCount?`بينها ${historicalCount} إشارات تاريخية للعرض فقط · `:''}صحة البيانات: ${info?.health||'غير متحققة'}`);
 if(signature!==lastSignature){lastSignature=signature;rows=cleaned;renderList(root);if(shown){const current=rows.find(r=>r.symbol===shown.symbol&&r.recommendationState===shown.recommendationState);if(current)open(root,current);else close(root)}}
}
function bind(root){const screen=root.querySelector('#dt39-scanner');if(!screen||screen.dataset.bound)return;screen.dataset.bound='1';screen.addEventListener('click',e=>{const btn=e.target.closest('[data-s39-filter]');if(btn){filter(root,btn.dataset.s39Filter);return}if(e.target.closest('[data-s39-close]')){close(root);return}});screen.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.querySelector('#s39-detail-overlay:not([hidden])'))close(root)});}
window.DT39ScannerScreen=Object.freeze({template,render,bind,close});})();
