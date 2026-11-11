/* Dynamic Trading 3.7 — Research Agent. Read-only; no publish, trade, or strategy write. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('preview')==='1';
const put=(id,v)=>{const el=$(id);if(el)el.textContent=String(v??'—')};
const newEl=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
let inflight=false,loaded=false,periodCache=null;
const example={status:'REVIEW_CREATED_NOT_APPLIED',day:'2026-11-02',updatedAt:'2026-11-02T22:15:00Z',
 summary:'مثال توضيحي: الماسح الأساسي التزم ببوابات Retest. ماسح AI احتفظ بمرشحين للمتابعة. تُفحص حالة الأسعار قبل اقتراح تغيير الشروط.',
 evidence:{status:'READY',scannerMinutes:385,aiMinutes:385,missingMinutes:10},
 experiments:[{area:'QUOTE_COMPLETENESS',hypothesis_ar:'مثال: بعض المرشحين فقدوا السعر الصالح وقت القرار',test_ar:'تتبّع عمر Quote في الدقائق المطابقة وقياس أثره بعد التكاليف',status:'PROPOSED_UNTESTED',confidence:'LOW'},
 {area:'RETEST',hypothesis_ar:'مثال: تأخير الدخول إلى Retest قد يخفض المطاردة',test_ar:'مقارنة عينات منفصلة تحت نفس تكاليف التنفيذ',status:'PROPOSED_UNTESTED',confidence:'LOW'}],budget:{calls:1,reservedUsd:0.18,limitUsd:3},usage:{estimatedUsd:0.032}};
const fmtDate=t=>{try{return new Date(t).toLocaleString('ar-AE',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'})}catch{return '—'}};
function render(data){
 if(data?.weekly||data?.monthly){periodCache={weekly:data.weekly,monthly:data.monthly}}
 else if(periodCache)data={...data,weekly:periodCache.weekly,monthly:periodCache.monthly};
 window.DT38LastResearch=data;window.dispatchEvent(new CustomEvent("dt38:research",{detail:data}));
 const status=data?.status||'NO_REVIEW',r=document.querySelector('.desk-research-list');
 const hasLocal=Array.isArray(data?.localHypotheses)&&data.localHypotheses.length>0;
 const available=status==='REVIEW_CREATED_NOT_APPLIED'||status==='REVIEW_CREATED_NOT_VALIDATED'||status==='LOCAL_DAILY_REPORT'||status==='LOCAL_RESEARCH_ONLY'||hasLocal;
 const statusLabel=({BACKGROUND_PENDING:'الطلب لدى المزود؛ التقرير لم يكتمل',BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED:'انتهت نافذة المتابعة؛ النتيجة غير متحققة',BACKGROUND_PREREQUISITES_NOT_VERIFIED:'الخلفية تنتظر تحقق الحساب والخصوصية والتكلفة',REVIEW_CREATED_NOT_APPLIED:'مراجعة OpenAI محفوظة (التوصيات فرضيات)',LOCAL_DAILY_REPORT:'تقرير يومي محلي محفوظ',LOCAL_RESEARCH_ONLY:'تحليل محلي فقط',NO_REVIEW:'لا توجد مراجعة محفوظة لهذه الجلسة',DISABLED:'التحليل غير مفعل',RESERVED:'قيد التحليل',FAILED_NO_RETRY:'فشلت المراجعة',ARCHIVE_UNAVAILABLE:'أرشيف غير متاح'})[status]||status.replaceAll('_',' ');
 put('dt37ResearchState',demo?'مثال: مراجعة محفوظة':statusLabel);
 put('dt37ResearchDetail',data.updatedAt?`آخر تقرير محفوظ: ${fmtDate(data.updatedAt)} · OpenAI: ${window.DT37ReportArabic?.label(data.paidStatus)||data.paidStatus||'غير متحقق'}`:'لا توجد مراجعة مسجلة حتى الآن');
 put('researchStatusValue',statusLabel);
 put('researchLastRun',data.updatedAt?`آخر تقرير: ${fmtDate(data.updatedAt)} · ${data.openaiModel||'محرك محلي'} · إيصال التشغيل: ${data.delivery?.status||'غير متاح'}`:'لم يُسجّل تقرير؛ تحقق من جدولة الأرشيف وحالة التشغيل');
 const evidence=data.evidence;
 put('researchEvidenceValue',evidence?(evidence.status==='READY'?'بيانات مقبولة':'غير مكتملة'):(data.daily?('تقرير تشخيصي: '+data.daily.status):'غير متحقق'));
 const engines=data.daily?.engines;
 put('researchEvidenceWarning',evidence?`دقائق محفوظة: الأساسي ${evidence.scannerMinutes??'—'} · AI ${evidence.aiMinutes??'—'}؛ المفقود لا يعتبر صفراً من الفرص.`:
  engines?`الأساسي ${engines.scanner?.storedMinutes??'غير متاح'}/${engines.scanner?.expectedMinutes}، AI ${engines.ai?.storedMinutes??'غير متاح'}/${engines.ai?.expectedMinutes}؛ الدقائق غير المسجلة ليست فرصاً صفراً.`:'سلامة أرشيف Netlify لم تُثبت لهذه الجلسة؛ لا يمكن الاعتماد على نتائج غير محفوظة.');
 const experiments=Array.isArray(data.experiments)&&data.experiments.length?data.experiments:(data.localHypotheses||[]);
 put('researchHypothesesValue',experiments.length);put('dt37ResearchRuns',available?'1':'0');
 put('researchBudgetValue',data.budget?`حجز تقديري $${Number(data.budget.reservedUsd||0).toFixed(2)} / $${Number(data.budget.limitUsd||0).toFixed(2)}`:'—');
 put('researchSummary',(data.summary||(hasLocal?'توجد فرضيات محلية محفوظة غير مطبقة وغير مثبتة خارج العينة.':'لا يوجد تحليل محفوظ لهذه الجلسة.'))+
  (data.paidStatus&&data.paidStatus!=='REVIEW_CREATED_NOT_APPLIED'?` · المراجعة المدفوعة: ${window.DT37ReportArabic?.label(data.paidStatus)||data.paidStatus}. التقرير المحلي لا يتطلب OpenAI.`:'')+
  (data.periodWarnings?.length?` · تنبيه أرشيف الفترات: ${data.periodWarnings.join(', ')}`:''));
 const learning=data?.learning;
 if(learning){
  const note=`طبقة التعلم للماسحين: الأساسي ${learning.scanner.observedRows} سجل، AI ${learning.ai.observedRows} سجل؛ ${learning.proposals.length} تحسينات مرشحة. `+
   (learning.status==='OPENAI_CONNECTED_TO_STRATEGY_LEARNING'?'تقرير OpenAI مربوط بالدورة. ':'التعلم من الأرشيف فقط؛ تقرير OpenAI غير مربوط لهذه الجلسة. ')+
   'الملاحظات اليومية ليست اعتماداً؛ تجميع أسبوعي ثم تقييم عينة شهري. لا تغيير تلقائياً.';
  put('researchSummary',(data.summary?data.summary+' · ':'')+note);
 }
 if(r){r.replaceChildren();const candidateList=learning?.proposals||[];if(!experiments.length&&!candidateList.length){r.append(newEl('div','empty-state','لا توجد فرضيات محفوظة لهذه الجلسة.'))}else experiments.slice(0,5).forEach((x,i)=>{
 const card=newEl('article','desk-research-idea');const badge=newEl('span','desk-research-idea-tag',`${String(i+1).padStart(2,'0')} · ${x.area||x.id||'RESEARCH'}`);card.append(badge);
 card.append(newEl('h3',null,x.hypothesis_ar||x.hypothesis||'فرضية غير محددة'));
 card.append(newEl('p','muted',x.test_ar||x.experiment||'تجربة التحقق لم تُكتب'));
 card.append(newEl('small',null,'غير مطبقة · '+(x.acceptance_metric_ar||x.acceptanceMetric||'تنتظر تجربة خارج العينة')));
 r.append(card)});
 if(candidateList.length){r.append(newEl('h3',null,'ملاحظات اليوم — ليست مرشحات نهائية'));
  candidateList.forEach((x,i)=>{const card=newEl('article','desk-research-idea');
   card.append(newEl('span','desk-research-idea-tag',`${String(i+1).padStart(2,'0')} · ${x.area||'RESEARCH'} · ${(x.engines||[]).join(' + ')}`));
   card.append(newEl('h3',null,x.hypothesis_ar||'مقترح بحثي'));
   card.append(newEl('small',null,x.suppressed?`محظور من إعادة التوصية: ${x.priorDecision?.verdict||'قرار سابق'} · ${x.priorDecision?.evidenceId||'تاريخ محفوظ'}`:
    `${x.candidateKind||'تجربة'} · ملاحظة يومية، تُجمع أسبوعياً · ${x.testResult||'NOT_VERIFIED'} · غير مطبق`));r.append(card)});
 }
 // Periodic research is strictly read-only: daily observations, weekly shortlist,
 // monthly sample checks. No button here can approve or change a strategy.
 for(const [period,label] of [[data.weekly,'المقترحات الأسبوعية'],[data.monthly,'تقييم نهاية الشهر']]){
  r.append(newEl('h3',null,label));
  if(!period){r.append(newEl('p','muted','لا يوجد تقرير معتمد الحفظ لهذه الفترة بعد.'));continue}
  r.append(newEl('p','muted',`${period.end} · جلسات مكتملة ${period.sessionsWithFullEvidence}/${period.minimumFullEvidenceSessions} · صفقات ورقية فريدة ${period.uniquePaperTrades??'غير محسوبة'} · ${period.status}`));
  if(period.kind==='MONTHLY'&&!period.descriptiveLearningReady)
   r.append(newEl('p','muted','العينة الشهرية غير كافية للتعلم الإحصائي؛ تأجيل الترشيح النهائي للشهر التالي.'));
  for(const c of (period.proposals||[]).slice(0,8)){
   const card=newEl('article','desk-research-idea');
   card.append(newEl('span','desk-research-idea-tag',`${c.area||'RESEARCH'} · ${(c.engines||[]).join(' + ')}`));
   card.append(newEl('h3',null,c.hypothesis||'تحسين مرشح للمراجعة'));
   card.append(newEl('small',null,c.suppressed?'ممنوع إعادة الاقتراح بسبب نتيجة أو رفض سابق':'حالة الأدلة: '+c.status+' · يحتاج تجربة مستقلة وموافقتك'));
   r.append(card);
  }
 }
 }
}
async function refresh(forcePeriods=false){if(inflight)return;inflight=true;put('researchLastRun','جاري قراءة الأرشيف…');
 if(demo){render(example);inflight=false;loaded=true;return}
 try{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);let res;
  try{res=await fetch('/.netlify/functions/research-status37'+(!loaded||forcePeriods?'?includePeriods=1':''),{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timer)}
  if(!res.ok)throw Error(`HTTP_${res.status}`);render(await window.DT37ApiJson.parse(res));
 }catch(error){render({status:'ARCHIVE_UNAVAILABLE'});const msg=String(error?.message||'HTTP_UNAVAILABLE');put('researchLastRun',msg.startsWith('API_')?msg:'تعذر الاتصال بخدمة الباحث — لا توجد بيانات قابلة للتحقق')}
 finally{inflight=false;loaded=true}
}
function start(){$('dt37ResearchRefresh')?.addEventListener('click',()=>refresh(true));
 window.addEventListener('dynamic-trading:tabchange',e=>{if(e.detail?.tab==='research'&&!loaded)refresh()});
 refresh();setInterval(()=>{if(!document.hidden&&document.querySelector('#tab-research.active'))refresh()},300000)}
 window.DT37ResearchPanel={refresh};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
