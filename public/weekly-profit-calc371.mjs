/** Read-only auto P/L for PRIMARY scanner, never feeds trading or research. */
export const WEEKLY371_DAYS=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const DAY_MS=86400000;
const FETCH_TTL_MS=5*60000;
const currency=v=>v===null||v===undefined?'—':`${v<0?'−':v>0?'+':''}$${Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const percent=v=>v===null||v===undefined?'—':`${v>0?'+':''}${v.toFixed(2)}%`;
export function addDays(date,count){return new Date(Date.parse(`${date}T12:00:00Z`)+count*DAY_MS).toISOString().slice(0,10);}
export function mondayOf(day){
 if(!/^\d{4}-\d\d-\d\d$/.test(String(day)))throw Error('INVALID_DAY');
 const d=new Date(`${day}T12:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)throw Error('INVALID_DAY');
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export function currentNewYorkDate(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
export function mountWeeklyProfitCalculator(root=document.querySelector('#weekly371Calculator'),{fetcher=fetch}={}){
 if(!root)return null;
 const get=sel=>root.querySelector(sel),rows=[...root.querySelectorAll('[data-weekly371-row]')];
 if(rows.length!==5)throw Error('WEEKLY_ROWS_REQUIRED');
 let commission=0,week=mondayOf(currentNewYorkDate()),lastWeek=null,lastAt=0,lastReport=null,busy=false,queued=false,everOpened=false;
 function put(sel,value){const e=get(sel);if(e)e.textContent=String(value);}
 function numbered(sel,v){const e=get(sel);if(!e)return;e.textContent=currency(v);e.classList.toggle('weekly371-positive',v!==null&&v>0);e.classList.toggle('weekly371-negative',v!==null&&v<0);}
 function labelWeek(){get('[data-weekly371-week]').value=week;put('[data-weekly371-week-label]',`${week} ← ${addDays(week,4)}`);rows.forEach((row,i)=>row.querySelector('[data-weekly371-day-label]').textContent=`${WEEKLY371_DAYS[i]} · ${addDays(week,i).slice(5)}`);}
 function clear(){
  rows.forEach(row=>{for(const attr of ['count','status','daily-net','daily-rate'])row.querySelector(`[data-weekly371-${attr}]`).textContent='—';});
  ['gross','subscription-cost','net','gap'].forEach(s=>numbered(`[data-weekly371-${s}]`,null));
  put('[data-weekly371-rate]','—');put('[data-weekly371-progress]','0 / 5');put('[data-weekly371-completeness]','غير متحقق');
 }
 function display(report){
  if(report.week!==week||!Array.isArray(report.days)||report.days.length!==5)throw Error('INVALID_WEEKLY_RESPONSE');
  window.DT38LastWeekly=report;window.dispatchEvent(new CustomEvent('dt38:weekly',{detail:report}));
  const states={PREVIOUS_DAY_UNVERIFIED:'الرصيد السابق غير متحقق',CAPITAL_EXHAUSTED:'نفاد رأس المال',FUTURE:'لم يبدأ',SESSION_OPEN:'الجلسة جارية',MISSING_HISTORY:'السجل غير متوفر',NO_RECORDED_CONFIRMED:'لا توجد CONFIRMED مسجلة',INCOMPLETE:'صفقات غير محسومة',MODELED:'نتيجة ورقية'};
  rows.forEach((row,i)=>{
   const day=report.days[i];row.querySelector('[data-weekly371-count]').textContent=String(day.count??0);
   row.querySelector('[data-weekly371-status]').textContent=states[day.status]||'غير متحقق';
   const el=row.querySelector('[data-weekly371-daily-net]');el.textContent=currency(day.pnl);el.classList.toggle('weekly371-positive',day.pnl!==null&&day.pnl>0);el.classList.toggle('weekly371-negative',day.pnl!==null&&day.pnl<0);
   row.querySelector('[data-weekly371-daily-rate]').textContent=day.openingBalance===null||day.openingBalance===undefined?'—':`${currency(day.openingBalance)} ← ${currency(day.closingBalance)}`;
  });
  numbered('[data-weekly371-gross]',report.grossPnl);
  numbered('[data-weekly371-subscription-cost]',report.grossPnl===null?null:-report.weeklySubscription);
  numbered('[data-weekly371-net]',report.netAfterSubscriptionBeforeExecutionCosts);
  put('[data-weekly371-rate]',percent(report.weeklyReturnPct));
  put('[data-weekly371-target]',currency(report.targetUsd));
  numbered('[data-weekly371-gap]',report.netAfterSubscriptionBeforeExecutionCosts===null?null:report.netAfterSubscriptionBeforeExecutionCosts-report.targetUsd);
  put('[data-weekly371-progress]',`${report.modeledDays} / 5`);
  put('[data-weekly371-completeness]',report.complete?'مكتمل حسب سجل الإشارات':'غير مكتمل');
  put('[data-weekly371-verdict]',report.grossPnl===null?'لا توجد أيام قابلة للاحتساب بعد. لن نفترض ربحاً أو صفراً.':
   report.complete?(report.targetReached?'بلغت المحاكاة الورقية الهدف، قبل تكاليف التنفيذ.':'لم تبلغ المحاكاة الورقية الهدف الأسبوعي، قبل تكاليف التنفيذ.'):
   'الحصيلة جزئية حتى آخر يوم متتابع مكتمل؛ لا نفترض رأس مال الأيام اللاحقة.');
  put('[data-weekly371-source-status]','المصدر: سجل CONFIRMED للماسح الأساسي · القراءة مباشرة من الخادم');
 }
 async function refresh(force=false){
  if(busy){queued=true;return;}
  if(!force&&lastReport&&lastWeek===week&&Date.now()-lastAt<FETCH_TTL_MS){display(lastReport);return;}
  busy=true;put('[data-weekly371-error]','');put('[data-weekly371-source-status]','جاري قراءة نتائج الماسح الأساسي…');
  const requestWeek=week;
  try{
   const r=await fetcher(`/api/scanner-weekly-profit?week=${encodeURIComponent(requestWeek)}&commission=${commission.toFixed(2)}`,{cache:'no-store'});
   if(!r.ok)throw Error(`HTTP_${r.status}`);
   const data=await r.json();if(requestWeek!==week)return;
   display(data);lastWeek=week;lastAt=Date.now();lastReport=data;
  }catch{if(requestWeek===week){clear();window.DT38LastWeekly=null;window.dispatchEvent(new CustomEvent('dt38:weekly',{detail:null}));put('[data-weekly371-error]','تعذرت قراءة سجل الماسح. النتائج غير متحققة؛ لم تُنشأ أي أرباح افتراضية.');put('[data-weekly371-source-status]','فشل جلب بيانات الخادم');}}
  finally{busy=false;if(queued){queued=false;refresh();}}
 }
 function changeWeek(newWeek){try{week=mondayOf(newWeek);labelWeek();clear();refresh();}catch{put('[data-weekly371-error]','تاريخ الأسبوع غير صالح.');}}
 get('[data-weekly371-commission]').addEventListener('change',e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<0||v>100){e.target.value=String(commission);return;}commission=Math.round(v*100)/100;lastReport=null;refresh(true);});
 get('[data-weekly371-week]').addEventListener('change',e=>changeWeek(e.target.value));
 root.querySelectorAll('[data-weekly371-shift]').forEach(b=>b.addEventListener('click',()=>changeWeek(addDays(week,7*Number(b.dataset.weekly371Shift)))));
 get('[data-weekly371-refresh]').addEventListener('click',()=>refresh(true));
 // Do not add a timer; fetch on first Performance tab opening only, then 5m cache.
 function maybeOpen(e){if(e?.detail?.tab!=='performance')return;everOpened=true;refresh();}
 if(typeof window!=='undefined')window.addEventListener('dynamic-trading:tabchange',maybeOpen);
 labelWeek();clear();
 // The tab navigation module may have fired before our module mounted.
 if(root.closest('.tab-panel')?.classList.contains('active')){everOpened=true;refresh();}
 return {getWeek:()=>week,refresh,getLastReport:()=>lastReport,opened:()=>everOpened};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountWeeklyProfitCalculator(),{once:true});
 else mountWeeklyProfitCalculator();
}
