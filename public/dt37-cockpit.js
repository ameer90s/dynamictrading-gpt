/* Dynamic Trading 3.7 — unified three-engine overview; read-only network calls. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('preview')==='1';
const put=(id,value)=>{const n=$(id);if(n)n.textContent=String(value??'—')};
const pretty=(s)=>{try{return new Date(s).toLocaleString('ar-AE',{timeZone:'Asia/Dubai',dateStyle:'short',timeStyle:'short'})}catch{return '—'}};
const ageMinutes=t=>{const ms=Date.now()-Date.parse(t||'');return Number.isFinite(ms)&&ms>=0?Math.floor(ms/60000):null};
const fetchJson=async(url)=>{const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error(`HTTP_${r.status}`);return await window.DT37ApiJson.parse(r)}finally{clearTimeout(timer)}};
let busy=false;
function setUiState(){
 if(!demo)return;
 const b=document.createElement('div');b.className='desk-demo-banner';b.textContent='معاينة التصميم فقط — جميع القيم المعروضة أدناه تجريبية وليست بيانات سوق حقيقية';
 document.querySelector('.desk-header')?.before(b);
}
async function refresh(){if(busy)return;busy=true;
 if(demo){
  put('dt37ScannerState','مثال: قيد المتابعة');put('dt37ScannerDetail','مثال: 385 دقيقة محفوظة · 0 أخطاء');
  put('dt37AiState','مثال: قيد التقييم');put('dt37AiDetail','مثال: 17 مرشحاً · 0 صفقات مؤكدة');
  put('dt37Coverage','96.4%');put('dt37AiTrades','0');put('dt37ArchiveMinutes','385 / 390');
  put('dt37LiveStatus','PREVIEW · قيم توضيحية فقط، ليست اتصالاً بالسوق');put('dt37LastUpdate','DEMO');
  busy=false;return;
 }
 put('dt37LiveStatus','جاري قراءة الأرشيف والخدمات…');
 const [ai,arch]=await Promise.allSettled([fetchJson('/api/ai-parallel?sessions=1'),fetchJson('/api/archive-health')]);
 if(ai.status==='fulfilled'){
   const data=ai.value,last=data?.latest,day=data?.days?.[0],age=ageMinutes(last?.at);
   put('dt37AiState',!last?.at?'لا توجد دورة مسجلة':age!=null&&age>10?'آخر دورة قديمة':'آخر دورة محفوظة');
   put('dt37AiDetail',last?.at?`آخر تشغيل ${pretty(last.at)} · ${last.serviceStatus||'—'}`:'لا يوجد سجل مثبت لتشغيل AI');
   const coverage=Number(last?.coverage?.coveragePct);put('dt37Coverage',last?.coverage?.coveragePct!=null&&Number.isFinite(coverage)?coverage.toFixed(1)+'%':'—');
   put('dt37AiTrades',Array.isArray(day?.aiPositions)?day.aiPositions.length:'—');
 }else{put('dt37AiState','تعذر الاتصال');put('dt37AiDetail','لم تصل بيانات الخدمة');put('dt37Coverage','—');put('dt37AiTrades','—')}
 if(arch.status==='fulfilled'){
   const r=arch.value?.streams?.scanner;const count=Number(r?.foundMinutes);
   put('dt37ScannerState',Number.isFinite(count)&&count>0?'أرشيف متوفر':'لا توجد دقائق موثقة');
   put('dt37ScannerDetail',r?`${count||0} دقيقة مسجلة · ${(Number(r?.readErrors)||0)} أخطاء قراءة`:'لا يوجد تقرير تغطية موثّق');
   put('dt37ArchiveMinutes',Number.isFinite(count)?count+' / 390':'—');
 }else{put('dt37ScannerState','غير متحقق');put('dt37ScannerDetail','تعذر قراءة أرشيف الماسح');put('dt37ArchiveMinutes','—')}
 put('dt37LiveStatus',ai.status==='fulfilled'&&arch.status==='fulfilled'?'بيانات آخر دورة محفوظة · تداول ورقي فقط':'بعض الخدمات غير متاحة — لا نعرض بيانات مختلقة');
 put('dt37LastUpdate',new Date().toLocaleTimeString('ar-AE',{timeZone:'Asia/Dubai'}));busy=false;
}
function jump(name){
 if(name==='research'){
  window.DynamicTradingTabNav?.activate('research',true);
  return;
 }
 window.DynamicTradingTabNav?.activate('market',true);
 const id=name==='scanner'?'dt36AuditSection':'aiParallelSection';
 const item=$(id);if(item){const fold=item.closest('.dt37-detail-fold');if(fold)fold.open=true;requestAnimationFrame(()=>item.scrollIntoView({behavior:'smooth',block:'start'}));}
}
function start(){setUiState();$('dt37CockpitRefresh')?.addEventListener('click',()=>{refresh();window.DT37ResearchPanel?.refresh?.()});
 document.querySelectorAll('[data-dt37-jump]').forEach(b=>b.addEventListener('click',()=>jump(b.dataset.dt37Jump)));
 refresh();setInterval(()=>{if(!document.hidden)refresh()},30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
