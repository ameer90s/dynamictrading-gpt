(()=>{'use strict';
const $=id=>document.getElementById(id);let busy=false;
function set(id,v){const e=$(id);if(e)e.textContent=String(v??'—');}
function ago(t){if(!t)return null;const ms=Date.now()-Date.parse(t);return Number.isFinite(ms)&&ms>=0?Math.round(ms/60000):null;}
async function get(url){const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);try{const r=await fetch(url,{cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timeout);}}
async function refresh(){if(busy)return;busy=true;set('dt37LiveStatus','جاري تحديث البيانات…');
const results=await Promise.allSettled([get('/api/ai-parallel?sessions=1'),get('/api/archive-health')]);
const a=results[0],h=results[1];
if(a.status==='fulfilled'){
 const d=a.value,l=d.latest,day=d.days?.[0],age=ago(l?.at);
 set('dt37AiState',!l?.at?'لا يوجد تشغيل مسجل':age!==null&&age>10?'بيانات قديمة':'آخر تشغيل مسجل');
 set('dt37AiDetail',l?.at?`آخر تشغيل ${new Date(l.at).toLocaleString('ar-AE')} · ${l.serviceStatus||'—'}`:'لم يصل سجل AI بعد');
 set('dt37Coverage',Number.isFinite(Number(l?.coverage?.coveragePct))?Number(l.coverage.coveragePct).toFixed(1)+'%':'—');
 set('dt37AiTrades',Array.isArray(day?.aiPositions)?day.aiPositions.length:'—');
}else{set('dt37AiState','تعذر الاتصال');set('dt37AiDetail','لا يمكن تأكيد تشغيل AI');set('dt37Coverage','—');set('dt37AiTrades','—');}
if(h.status==='fulfilled'){
 const v=h.value;const stream=v?.streams?.scanner;
 set('dt37ScannerState',stream?.foundMinutes>0?'الأرشيف متوفر':'لا توجد دقائق محفوظة');
 set('dt37ScannerDetail',stream?`${stream.foundMinutes} دقيقة محفوظة · ${stream.records} سجل · أخطاء قراءة ${stream.readErrors}`:'بيانات الأرشيف غير مكتملة');
}else{set('dt37ScannerState','غير متحقق');set('dt37ScannerDetail','تعذر قراءة صحة الأرشيف');}
set('dt37LiveStatus',a.status==='fulfilled'&&h.status==='fulfilled'?'تم تحديث بيانات الخدمات · لا تُعد دليلاً على تنفيذ صفقة':'بعض الخدمات غير متاحة — لا تُعرض بيانات افتراضية');
set('dt37LastUpdate',new Date().toLocaleTimeString('ar-AE'));busy=false;}
function init(){$('dt37CockpitRefresh')?.addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
