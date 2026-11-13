/* DT PULSE 3.9: TODAY screen rebuilt from an empty screen, independent of legacy card layout.
   Display-only; all data assigned by pulse-rebuild.js sync() from the original read-only application.
   Missing values remain NOT VERIFIED; no requests or trades originate here. */
(()=>{'use strict';
const i=(name)=>{
  const paths={bars:'<path d="M4 20v-5M10 20V9M16 20V4M22 20v-9"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  scales:'<path d="M12 2v19M5 6h14M5 6l-3 8h6zm14 0-3 8h6zM6 21h12"/>',
  arrow:'<path d="M4 18 10 12l4 3 6-9M15 6h5v5"/>',
  book:'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1zM12 5v15"/>',
  flask:'<path d="M9 3h6M10 3v6l-6.4 10.3A1.4 1.4 0 0 0 4.8 21h14.4a1.4 1.4 0 0 0 1.2-1.7L14 9V3M7 16h10"/>',
  spark:'<path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  warn:'<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  chevron:'<path d="m14 6-6 6 6 6"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${paths[name]||paths.bars}</svg>`;
};
function template(){return `<div id="dt39-today" lang="ar" dir="rtl" aria-label="تاب اليوم - الواجهة الجديدة">
  <section class="t39-status-card" aria-label="التوقيت وحالة جلسة السوق">
    <div class="t39-clocks">
      <div class="t39-clock"><b id="pu-uae">—</b><span>الإمارات 🇦🇪</span></div>
      <div class="t39-clock"><b id="pu-ny">—</b><span>نيويورك 🇺🇸</span></div>
    </div>
    <div class="t39-session-line"><span class="t39-spark-bars">▁▃▅▇</span><span class="t39-session-text" id="pu-today-session">حالة الجلسة غير متحققة</span><span class="t39-live-dot"></span></div>
  </section>
  <section class="t39-card t39-summary" aria-labelledby="t39-sum-label">
     <div class="t39-section-heading"><span class="t39-section-symbol">${i('bars')}</span><h2 id="t39-sum-label">ملخص اليوم</h2></div>
     <div class="t39-summary-grid">
       <div class="t39-stat"><span class="t39-glyph">${i('target')}</span><span>الفرص المؤكدة</span><strong id="pu-today-confirm">—</strong></div>
       <div class="t39-stat"><span class="t39-glyph">${i('scales')}</span><span>حالة السوق</span><strong id="pu-today-market">غير متحقق</strong></div>
       <div class="t39-stat"><span class="t39-glyph">${i('calendar')}</span><span>الإجراء القادم</span><strong id="pu-today-next">متابعة الباحث</strong></div>
     </div>
     <span id="pu-today-direction" hidden>غير متحقق</span>
  </section>
  <section class="t39-card t39-action" aria-labelledby="t39-action-label">
     <div class="t39-action-title"><span class="t39-section-symbol">${i('target')}</span><div><h2 id="t39-action-label">شو تحتاج تسوي الحين؟</h2><p id="pu39-action-description">راجع آخر الفرص المحفوظة قبل اتخاذ قرارك.</p></div></div>
     <div class="t39-action-buttons"><button type="button" data-go="market" class="t39-primary">${i('arrow')}<span>استعراض الفرص</span></button><button type="button" data-go="research" class="t39-secondary">${i('book')}<span>مراجعة الباحث</span></button></div>
  </section>
  <section class="t39-card t39-research" aria-labelledby="t39-research-label">
    <div class="t39-research-head"><span class="t39-section-symbol">${i('flask')}</span><h2 id="t39-research-label">الباحث</h2></div>
    <div class="t39-research-content"><div class="t39-research-lines">
      <p><span class="t39-point okay">${i('check')}</span><span>جودة البيانات: <strong id="pu-quality">غير متحقق</strong></span></p>
      <p><span class="t39-point caution">${i('warn')}</span><span id="pu-research-filter">لا توجد توصية تصفية موثقة</span></p>
      <p><span class="t39-point okay">${i('check')}</span><span id="pu-research-action">لا توجد توصية تغيير فوري موثقة</span></p>
    </div><img alt="" aria-hidden="true" src="/dt-approved-research.png" /></div>
    <button class="t39-research-details" type="button" data-go="research"><span>يمكنك توسّع التحليل التفصيلي عند الحاجة</span>${i('chevron')}</button>
  </section>
  <section class="t39-card t39-ai" aria-labelledby="t39-ai-label">
     <div class="t39-ai-text"><div class="t39-ai-heading"><span class="t39-section-symbol">${i('spark')}</span><h2 id="t39-ai-label">Dynamic AI</h2></div><strong>قرار أوضح، ضجيج أقل</strong><p>ذكاء تداول يركز على ما يهم فعلاً.</p></div>
     <img alt="" aria-hidden="true" src="/dt-approved-ai.png" />
  </section>
 </div>`}
window.DT39TodayScreen=Object.freeze({template});
})();
