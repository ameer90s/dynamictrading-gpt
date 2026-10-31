/* Dynamic Trading 3.7 — Research Agent. Read-only; no publish, trade, or strategy write. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const demo=new URLSearchParams(location.search).get('preview')==='1';
const put=(id,v)=>{const el=$(id);if(el)el.textContent=String(v??'—')};
const newEl=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
let inflight=false,loaded=false;
const example={status:'REVIEW_CREATED_NOT_APPLIED',day:'2026-11-02',updatedAt:'2026-11-02T22:15:00Z',
 summary:'مثال توضيحي: الماسح الأساسي التزم ببوابات Retest. ماسح AI احتفظ بمرشحين للمتابعة. تُفحص حالة الأسعار قبل اقتراح تغيير الشروط.',
 evidence:{status:'READY',scannerMinutes:385,aiMinutes:385,missingMinutes:10},
 experiments:[{area:'QUOTE_COMPLETENESS',hypothesis_ar:'مثال: بعض المرشحين فقدوا السعر الصالح وقت القرار',test_ar:'تتبّع عمر Quote في الدقائق المطابقة وقياس أثره بعد التكاليف',status:'PROPOSED_UNTESTED',confidence:'LOW'},
 {area:'RETEST',hypothesis_ar:'مثال: تأخير الدخول إلى Retest قد يخفض المطاردة',test_ar:'مقارنة عينات منفصلة تحت نفس تكاليف التنفيذ',status:'PROPOSED_UNTESTED',confidence:'LOW'}],budget:{calls:1,reservedUsd:0.18,limitUsd:5},usage:{estimatedUsd:0.032}};
const fmtDate=t=>{try{return new Date(t).toLocaleString('ar-AE',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'})}catch{return '—'}};
function render(data){
 const status=data?.status||'NO_REVIEW',r=document.querySelector('.desk-research-list');
 const available=status==='REVIEW_CREATED_NOT_APPLIED'||status==='REVIEW_CREATED_NOT_VALIDATED'||status==='LOCAL_RESEARCH_ONLY';
 const statusLabel=({REVIEW_CREATED_NOT_APPLIED:'مراجعة مكتملة',LOCAL_RESEARCH_ONLY:'تحليل محلي فقط',NO_REVIEW:'بانتظار جلسة',DISABLED:'التحليل غير مفعل',RESERVED:'قيد التحليل',FAILED_NO_RETRY:'فشلت المراجعة',ARCHIVE_UNAVAILABLE:'أرشيف غير متاح'})[status]||status.replaceAll('_',' ');
 put('dt37ResearchState',demo?'مثال: مراجعة محفوظة':statusLabel);
 put('dt37ResearchDetail',data.updatedAt?`آخر مراجعة: ${fmtDate(data.updatedAt)}`:'لا توجد مراجعة مسجلة حتى الآن');
 put('researchStatusValue',statusLabel);
 put('researchLastRun',data.updatedAt?`آخر مراجعة: ${fmtDate(data.updatedAt)} · ${data.openaiModel||'محرك محلي'}`:'بانتظار أرشيف الجلسة القادمة');
 const evidence=data.evidence;
 put('researchEvidenceValue',evidence?(evidence.status==='READY'?'بيانات مقبولة':'غير مكتملة'):'غير متحقق');
 put('researchEvidenceWarning',evidence?`دقائق محفوظة: الأساسي ${evidence.scannerMinutes??'—'}/390 · AI ${evidence.aiMinutes??'—'}/390 · دقائق مفقودة ${evidence.missingMinutes??'—'}. المفقود لا يعتبر صفراً من الفرص.`:'سلامة أرشيف Netlify لم تُثبت لهذه الجلسة؛ لا يمكن الاعتماد على نتائج غير محفوظة.');
 const experiments=Array.isArray(data.experiments)&&data.experiments.length?data.experiments:(data.localHypotheses||[]);
 put('researchHypothesesValue',experiments.length);put('dt37ResearchRuns',available?'1':'0');
 put('researchBudgetValue',data.budget?`$${Number(data.budget.reservedUsd||0).toFixed(2)} / $5`:'—');
 put('researchSummary',data.summary||'لا يوجد تحليل لغوي محفوظ لهذه الجلسة. لن تُنشأ توصيات من بيانات ناقصة.');
 if(r){r.replaceChildren();if(!experiments.length){r.append(newEl('div','empty-state','لا توجد فرضيات محفوظة لهذه الجلسة.'))}else experiments.slice(0,5).forEach((x,i)=>{
 const card=newEl('article','desk-research-idea');const badge=newEl('span','desk-research-idea-tag',`${String(i+1).padStart(2,'0')} · ${x.area||x.id||'RESEARCH'}`);card.append(badge);
 card.append(newEl('h3',null,x.hypothesis_ar||x.hypothesis||'فرضية غير محددة'));
 card.append(newEl('p','muted',x.test_ar||x.experiment||'تجربة التحقق لم تُكتب'));
 card.append(newEl('small',null,'غير مطبقة · '+(x.acceptance_metric_ar||x.acceptanceMetric||'تنتظر تجربة خارج العينة')));
 r.append(card)})}
}
async function refresh(){if(inflight)return;inflight=true;put('researchLastRun','جاري قراءة الأرشيف…');
 if(demo){render(example);inflight=false;loaded=true;return}
 try{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);let res;
  try{res=await fetch('/.netlify/functions/research-status37',{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timer)}
  if(!res.ok)throw Error(`HTTP_${res.status}`);render(await res.json());
 }catch{render({status:'ARCHIVE_UNAVAILABLE'});put('researchLastRun','تعذر الاتصال بخدمة الباحث — لم نعرض بيانات تجريبية')}
 finally{inflight=false;loaded=true}
}
function start(){$('dt37ResearchRefresh')?.addEventListener('click',refresh);
 window.addEventListener('dynamic-trading:tabchange',e=>{if(e.detail?.tab==='research'&&!loaded)refresh()});
 refresh();setInterval(()=>{if(!document.hidden&&document.querySelector('#tab-research.active'))refresh()},60000)}
 window.DT37ResearchPanel={refresh};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
