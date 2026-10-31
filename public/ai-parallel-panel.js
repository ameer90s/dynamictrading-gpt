/* Independent research observer UI; deliberately no hooks into 3.6 signal state. */
(()=>{
const el=id=>document.getElementById(id),safe=x=>String(x??'غير متاح').replace(/[&<>"']/g,a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));
const fmt=x=>x==null?'—':typeof x==='number'?Number(x).toLocaleString('en-US',{maximumFractionDigits:4}):safe(x);
let pending=false,last=0;
async function refresh(force=false){if(pending||(!force&&Date.now()-last<45000))return;pending=true;last=Date.now();
try{const res=await fetch('/api/ai-parallel?sessions=1',{cache:'no-store'});if(!res.ok)throw Error(`HTTP ${res.status}`);const data=await res.json(),s=data.days?.[0],latest=data.latest;
 const status=el('aiParallelStatus');if(status)status.innerHTML=latest?.at?`<b>الحالة:</b> ${safe(latest.serviceStatus)} · <b>آخر تشغيل:</b> ${safe(latest.at)} · <b>تغطية الكون:</b> ${fmt(latest.coverage?.coveragePct)}% · <b>تم فحصه:</b> ${fmt(s?.scannedSymbols)} سهم · <b>الصفقات الورقية:</b> ${fmt(s?.aiPositions?.length)} · <b>Confidence:</b> غير مُعاير`:'لا يوجد تشغيل AI مسجل حتى الآن. تحقق من إعداد Alpaca ومن جدولة ai-parallel-scan على Netlify.';
 const candidates=el('aiParallelCandidates');if(candidates)candidates.innerHTML=(s?.transitions||[]).slice(0,25).map(x=>`<article class="dt36-transition"><div class="dt36-head"><b>${safe(x.symbol)} · ${safe(x.state)}</b><small>${safe(x.reason)}</small></div>
 <div>السعر ${fmt(x.features?.price)} · RVOL ${fmt(x.features?.volumeRatio)} · RSI ${fmt(x.features?.rsi14)} · ATR% ${fmt(x.features?.atrPct)} · HOD ${fmt(x.features?.hod)}</div>
 <div>Bid ${fmt(x.quote?.bid)} · Ask ${fmt(x.quote?.ask)} · Spread ${fmt(x.quote?.spreadBps)} bps · درجة جودة ${fmt(x.confidence?.profitPotentialScore)} (ليست احتمالية ربح)</div>
 ${['opening','candidate','execution'].map(k=>`<details><summary>${safe(k)}: ${fmt(x.checks?.[k]?.filter(y=>y.passed).length)}/${fmt(x.checks?.[k]?.length)} PASS</summary><div>${(x.checks?.[k]||[]).map(c=>`<div>${c.passed?'✅':'❌'} ${safe(c.gate)}: ${fmt(c.observed)} ${safe(c.operator)} ${fmt(c.threshold)} · ${safe(c.reason)}</div>`).join('')}</div></details>`).join('')}
 </article>`).join('')||'<div class="empty-state">بانتظار حالات SMART وAI PAPER CONFIRMED المستقلة.</div>';
 const pp=latest?.adaptivePolicy||s?.transitions?.[0]?.adaptiveParameters;const pol=el('aiParallelPolicy');if(pol){const p=pp?.params||pp||{};pol.innerHTML=Object.entries(p).map(([k,v])=>`<span>${safe(k)}: <b>${fmt(v)}</b></span>`).join('')||'بانتظار المعايير الديناميكية من أول دورة مسح.';}
 const rec=el('aiParallelRecommendations');if(rec){const r=s?.recommendations||{},items=r.suggestions||latest?.recommendations||[];rec.innerHTML=items.map(x=>`<article class="dt36-advice"><b>${safe(x.area)} · ${safe(x.title)}</b><p>الفرضية: ${safe(x.hypothesis)}</p><small>التجربة المقترحة: ${safe(x.experiment)}</small><details><summary>الأدلة</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${safe(JSON.stringify(x.evidence||{},null,2))}</pre></details><small>بحث فقط؛ غير مطبق تلقائياً في ماسح 3.6.</small></article>`).join('')+(s?.llmReview?.suggestions||[]).map(x=>`<article class="dt36-advice"><b>LLM · ${safe(x.area)} · ${safe(x.title_ar)}</b><p>الدليل: ${safe(x.observed_fact_ar)}</p><small>الفرضية: ${safe(x.hypothesis_ar)} · الاختبار: ${safe(x.experiment_ar)}</small><p>المخاطر: ${safe(x.risk_ar)}</p></article>`).join('')||'لا توجد توصيات موثقة بعد.';}
 const comp=el('aiParallelCompare');if(comp){const c=s?.recommendations?.comparison||{};comp.innerHTML=`AI Paper: ${fmt(c.aiTrades)} · الماسح الأساسي (أحداث التأكيد القابلة للمقارنة): ${fmt(c.scannerComparableEvents)} · فرص AI غير موجودة لدى الأساسي في اليوم نفسه: ${fmt(c.aiOnly)}. هذه مقارنة اكتشاف أولية وليست إثباتاً لتفوق الأرباح.\n <div>${(s?.aiPositions||[]).slice(-25).map(x=>`${safe(x.symbol)} · ${safe(x.setupType)} · ${safe(x.outcome||x.status)} · صافي افتراضي ${fmt(x.netUsd)}$`).join(' | ')}</div>`;}
}catch(e){const status=el('aiParallelStatus');if(status)status.textContent=`بيانات AI غير متاحة: ${e.message}`;}finally{pending=false;}}
async function exportAudit(kind,format){
 const status=el('aiParallelStatus');const buttons=['aiParallelExportJson','aiParallelExportCsv','scannerAuditExportJson'].map(el).filter(Boolean);
 buttons.forEach(b=>b.disabled=true);
 try{
  const day=status?.dataset?.day||'';
  const url=`/api/ai-parallel-audit?kind=${encodeURIComponent(kind)}&minutes=390&format=${encodeURIComponent(format)}${day?`&day=${encodeURIComponent(day)}`:''}`;
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
  const blob=await response.blob();
  if(format==='json'){
   const data=JSON.parse(await blob.text());
   if(!data.foundMinutes)throw new Error(`لا توجد سجلات محفوظة بتاريخ ${data.dateKey}. لا يمكن تصدير بيانات غير موجودة.`);
  }else if(blob.size<150){throw new Error('لا توجد سجلات قابلة للتصدير في الفترة المختارة.');}
  const link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);
  link.href=objectUrl;link.download=`${kind}-audit-${day||new Date().toISOString().slice(0,10)}.${format}`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
 }catch(error){if(status)status.textContent=`فشل تنزيل السجل: ${error.message}`;}
 finally{buttons.forEach(b=>b.disabled=false);}
}
function init(){el('aiParallelRefresh')?.addEventListener('click',()=>refresh(true));el('aiParallelExportJson')?.addEventListener('click',()=>exportAudit('ai-parallel','json'));el('aiParallelExportCsv')?.addEventListener('click',()=>exportAudit('ai-parallel','csv'));el('scannerAuditExportJson')?.addEventListener('click',()=>exportAudit('scanner','json'));refresh(true);setInterval(()=>refresh(),60000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
