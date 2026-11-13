/* Dynamic Trading 3.9 — Independent AI scanner presentation.
   Read-only projection of DT38LastAiPaper. No fetch, orders, fabricated recommendations,
   inferred win probabilities, or changes to the parallel AI engine. */
(()=>{'use strict';
const paths={chip:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2m16-6h2m-2 6h2"/><text x="12" y="15.3" text-anchor="middle" fill="currentColor" stroke="none" font-size="9" font-weight="900">AI</text>', chart:'<path d="M4 20v-5m5 5V9m5 11V4m5 16V11"/>', check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-8"/>', data:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>', speed:'<circle cx="12" cy="12" r="9"/><path d="m12 7 0 5 4 2"/>', model:'<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8m0-8-8 8"/>',trend:'<path d="m3 17 6-6 4 3 8-8m-6 0h6v6"/>', target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>', docs:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/>',layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>', sliders:'<path d="M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M10 17v4"/>',history:'<path d="M3 12a9 9 0 1 1 3 6M3 17v-5h5M12 7v5l4 2"/>',chev:'<path d="m6 9 6 6 6-6"/>',badge:'<path d="m12 2 3 5 6 1-3 5 1 7-7-3-7 3 1-7-3-5 6-1z"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[k]||paths.docs}</svg>`;
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const clean=v=>String(v??'—').trim().slice(0,300);
const stateLabel=s=>({AI_PAPER_CONFIRMED:'إشارة AI ورقية',SMART:'متابعة',CANDIDATE:'مرشحة',WAIT:'انتظار',REJECTED:'مرفوضة'}[s]||'حالة غير متحققة');
const labelValue=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val};
let lastData=null, expanded='';
// Read-only presentation helpers. Never use report evidence to make trading decisions.
const fieldNames={schema:'نسخة التقرير',day:'يوم التداول',generatedAt:'وقت إنشاء التقرير',at:'وقت الحدث',updatedAt:'وقت التحديث',coverage:'تغطية الأسهم',eligible:'أسهم مؤهلة',everScanned:'أسهم فُحصت',coveragePct:'نسبة التغطية',feedErrors:'أخطاء بيانات السوق',outcomes:'نتائج التداول الورقي',uniqueClosed:'صفقات مغلقة',priced:'صفقات محسوبة',unpriced:'صفقات لم تُحسب',winners:'رابحة',losers:'خاسرة',netPaperUsd:'صافي التداول الورقي (دولار)',brokerFillVerified:'تنفيذ الوسيط مثبت',winProbabilityCalibrated:'احتمال الربح مُعاير',stageStates:'مراحل التقرير',scan:'فحص الأسهم',select:'اختيار المرشحين',paperFollowup:'متابعة الورق',auditDecisions:'تدقيق القرارات',analyzeErrors:'تحليل الأخطاء',proposeImprovements:'التحسينات المقترحة',decisionCases:'أدلة القرارات',recentDecisions:'القرارات الأخيرة',caseCoverage:'تغطية القرارات',recordedCases:'قرارات مسجلة',shownCases:'قرارات معروضة',casesAreNotTheFullPopulation:'العرض ليس كل السجل',everyEvaluationArchive:'أرشيف كل الفحوص',quote:'أسعار العرض والطلب',evidenceId:'مرجع الدليل',archiveKey:'مرجع الأرشيف',factCount:'عدد الحقائق',hypotheses:'فرضيات',causalConclusion:'استنتاج سببي',counterfactuals:'سيناريوهات بديلة',confidence:'تقييم',level:'مستوى الثقة',area:'مجال التحسين',hypothesis:'الفرضية',proposedExperiment:'اختبار مقترح',acceptance:'شرط القبول',autoApply:'تطبيق تلقائي',approved:'موافق عليه',errorReview:'مراجعة الخسائر',rejectionReview:'الفرص المرفوضة',reason:'سبب القرار',evaluations:'مرات التقييم',missedTradeOutcome:'هل ضاعت فرصة رابحة',rejectedFollowthrough:'متابعة المرفوضات',rejectionFollowthroughTotals:'حركة المرفوضات',observedSetups:'نماذج مرصودة',activeSetups:'نماذج نشطة',positivePriceMfe:'حالات حركة صاعدة',interpretation:'تفسير النتائج',source:'المصدر',status:'الحالة',symbol:'السهم',minute:'دقيقة الفحص',kind:'نوع الحدث',netUsd:'الصافي بالدولار',setupType:'نوع النموذج',openedAt:'وقت الدخول',closedAt:'وقت الخروج',mfePct:'أقصى صعود %',maePct:'أقصى هبوط %',riskControls:'شروط الأمان',additionalProviderCalls:'طلبات مزوّد إضافية',additionalBlobWrites:'عمليات حفظ إضافية',costNote:'ملاحظة التكلفة',externalAudit:'تدقيق مستقل'};
const codeNames={RECORDED:'مسجل',NOT_VERIFIED:'غير متحقق',ASOF_PLANS_COMPARED:'تمت مقارنة البدائل وقت القرار',RECORDED_WHEN_AVAILABLE:'مسجل عند توفره',RECORDED_WITH_ARCHIVE_POINTERS:'مسجل مع مراجع الأرشيف',FACTS_HYPOTHESES_AND_ASOF_COUNTERFACTUALS:'حقائق وفرضيات وبدائل وقت القرار',PROPOSED_UNTESTED:'مقترح ولم يُختبر',LOW:'منخفض',DESCRIPTIVE_SAMPLE_ONLY:'عينة وصفية وليست احتمال ربح',UNVERIFIED_WITHOUT_ASOF_REPLAY_AND_QUOTE_AUDIT:'غير مثبت دون إعادة فحص الأسعار والقرارات',OBSERVED_NEGATIVE_PAPER_OUTCOME:'خسارة ورقية مسجلة',NOT_VERIFIED_REQUIRES_HOLDOUT:'غير متحقق ويحتاج اختباراً مستقلاً',NOT_VERIFIED_REQUIRES_DETERMINISTIC_ASOF_REPLAY:'يحتاج إعادة تشغيل تاريخية',PRICE_PATH_OBSERVATIONS_NOT_EXECUTABLE_MISSED_PROFITS:'تحرك سعر، وليس ربحاً قابلاً للتنفيذ',APPROVED_SHARIA:'التوافق الشرعي',FRESH_AUTHENTIC_BID_ASK:'Bid/Ask حديث وموثق',POSITIVE_NET_ECONOMICS:'عائد صافٍ إيجابي بعد التكاليف',NO_AUTO_BROKER_ORDERS:'بدون أوامر وسيط تلقائية',AI_OWN_RECORDED_DECISIONS:'قرارات AI المسجلة',NET_AFTER_COSTS_AND_WALK_FORWARD_REQUIRED:'اختبار صافي العائد مع تحقق زمني مستقل',DYNAMIC_AI_ONLY:'تقرير AI الداخلي',NOT_VERIFIED_REQUIRES_HOLDOUT:'غير مثبت دون عينة اختبار مستقلة',SESSION_RETURN_LOW:'حركة الجلسة أقل من المطلوب',DATA_AND_GATES:'فحص البيانات والبوابات',TARGETS_AND_POST_EXIT:'الأهداف وحركة السعر بعد الخروج',RECORDED_ASOF_PLANS_WITH_OHLC_COUNTERFACTUALS_NOT_EXECUTED_FILLS:'خطط افتراضية تعتمد على الشموع وليست تنفيذات حقيقية',NOT_VERIFIED_REQUIRES_DETERMINISTIC_ASOF_REPLAY:'غير مثبت؛ يحتاج إعادة اختبار تاريخي'};
function unpack(x){if(typeof x!=='string')return x;const t=x.trim();if(!t.startsWith('{')&&!t.startsWith('['))return x;try{return JSON.parse(t)}catch{return x}}
function keyAr(s){return fieldNames[s]||String(s).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').slice(0,95)}
function humanText(s){if(s==null||s==='')return 'غير متوفر';if(typeof s==='boolean')return s?'نعم':'لا';if(typeof s==='number')return s.toLocaleString('en-US',{maximumFractionDigits:3});const v=String(s);if(codeNames[v])return codeNames[v];if(/^\d{4}-\d{2}-\d{2}T/.test(v))return formatDateTime(v);return v.replace(/_/g,' ').slice(0,500)}
function fmt(n){return valid(n)?Number(n).toLocaleString('en-US',{maximumFractionDigits:2}):'—'}
function moneyPaper(n){return valid(n)?`${Number(n)>=0?'+':''}${Number(n).toFixed(2)} $ (ورقي)`:'غير متحقق'}
function formatDateTime(t){if(!t)return 'غير متوفر';const d=new Date(t);if(!Number.isFinite(d.getTime()))return 'غير متوفر';return new Intl.DateTimeFormat('ar-AE',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true}).format(d)}
function formatDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return 'غير متوفر';return s+' (نيويورك)'}
function appendFact(host,key,value){const row=document.createElement('div');row.className='a39-foldline a39-evidence-line';const label=document.createElement('span');label.className='a39-evidence-key';label.textContent=keyAr(key);const val=document.createElement('strong');val.className='a39-evidence-value';val.textContent=humanText(value);row.append(label,val);host.append(row)}
function appendStructured(host,raw,name,depth=0,limit=36){const data=unpack(raw);if(data==null)return;let emitted=0;const write=(key,v,level)=>{if(emitted>=limit||level>5)return;v=unpack(v);if(v==null||typeof v!=='object'){appendFact(host,key,v);emitted++;return}const entries=Array.isArray(v)?v.map((a,i)=>[String(i+1),a]):Object.entries(v);if(!entries.length)return;
 const heading=document.createElement('div');heading.className='a39-evidence-heading';heading.textContent=keyAr(key);host.append(heading);
 for(const [k,child] of entries){if(emitted>=limit)break;write(k,child,level+1)}
 };write(name,data,depth)}
function template(){return `<section class="a39-root" dir="rtl" lang="ar" id="dt39-ai-scanner" aria-label="ماسح الذكاء الاصطناعي">
 <header class="a39-head"><h1>ماسح AI <span>${icon('chip')}</span></h1><p>إشارات ذكية وفرص مدعومة بالذكاء الاصطناعي</p><p class="a39-updated" id="a39-updated" aria-live="polite">تاريخ آخر تقرير: غير متوفر</p></header>
 <section class="a39-metrics" aria-label="مؤشرات ماسح AI">
 <div class="a39-metric"><span>${icon('model')}</span><small>النموذج</small><strong id="a39-model">—</strong></div>
 <div class="a39-metric"><span>${icon('check')}</span><small>حالة AI</small><strong id="a39-state">غير متحقق</strong></div>
 <div class="a39-metric"><span>${icon('data')}</span><small>جودة البيانات</small><strong id="a39-quality">—</strong></div>
 <div class="a39-metric"><span>${icon('speed')}</span><small>سرعة المعالجة</small><strong id="a39-speed">—</strong></div>
 </section>
 <section class="a39-decision"><div class="a39-decision-main"><h2>${icon('target')} القرار الاستراتيجي اليوم</h2><p id="a39-decision-text">لا يوجد قرار استراتيجي موثق حالياً</p></div><span class="a39-trend-pill" id="a39-trend">غير متحقق ${icon('trend')}</span></section>
 <section class="a39-board"><h2>${icon('chart')} أبرز الفرص حسب تقييم AI</h2><div id="a39-opportunities" class="a39-opportunities" aria-live="polite"><p class="a39-empty">لا توجد فرص AI موثقة</p></div>
 <div class="a39-report-brief" id="a39-report-brief" aria-live="polite">تقرير AI الداخلي: لم تصل بيانات موثقة</div>
 <div class="a39-accordion"><details><summary>${icon('docs')} التحليل المختصر لكل فرصة ${icon('chev')}</summary><div id="a39-analysis" class="a39-foldbody">لا يوجد تحليل محفوظ</div></details>
 <details><summary>${icon('layers')} نظرة القطاعات (تقييم AI) ${icon('chev')}</summary><div id="a39-sectors" class="a39-foldbody">لا توجد قطاعات مسجلة</div></details>
 <details><summary>${icon('sliders')} معايير التصفية والضبط ${icon('chev')}</summary><div id="a39-policy" class="a39-foldbody">لا توجد معايير محفوظة</div></details>
 <details><summary>${icon('history')} سجل إشارات AI (آخر 5 إشارات) ${icon('chev')}</summary><div id="a39-history" class="a39-foldbody">لا توجد إشارات مسجلة</div></details></div></section>
 <p class="a39-disclaimer">${icon('docs')} الإشارات مبنية على تحليل آلي وليست نصيحة استثمارية مباشرة.</p>
 </section>`}
function render(data){const root=document.getElementById('dt39-ai-scanner');if(!root)return;
 const ai=data||null, latest=ai?.latest||{}, transitions=Array.isArray(ai?.transitions)?ai.transitions:[];
 const report=unpack(ai?.internalReport??ai?.recommendations?.internalReport??latest?.internalReport);
 const stamp=report?.generatedAt||latest?.at||latest?.generatedAt||null;
 labelValue('a39-updated',`آخر تقرير: ${formatDateTime(stamp)} · جلسة ${formatDay(report?.day||ai?.day||null)} · توقيت الإمارات`);
 const brief=root.querySelector('#a39-report-brief');brief.replaceChildren();
 if(report){
   const outcome=unpack(report.outcomes)||{}, coverage=unpack(report.coverage)||{};
   const parts=[['حالة التقرير','تقرير AI داخلي · ورقي فقط'],['تغطية الأسهم',valid(coverage.coveragePct)?`${Number(coverage.coveragePct).toFixed(1)}%`:'غير متحقق'],['صفقات مغلقة',fmt(outcome.uniqueClosed)],['رابحة / خاسرة',`${fmt(outcome.winners)} / ${fmt(outcome.losers)}`],['الصافي الورقي',moneyPaper(outcome.netPaperUsd)]];
   for(const [k,v] of parts)appendFact(brief,k,v);
 }else brief.textContent='لم يصل تقرير AI داخلي موثق؛ لا نعرض نتائج افتراضية.';
 const status=String(latest.serviceStatus||'').toUpperCase();
 const active=['ACTIVE','LIVE','OK','RUNNING'].includes(status)&&!ai?.stale;
 labelValue('a39-state',!ai||ai.stale?'غير متحقق':active?'نشط':status?'غير مؤكد':'غير متحقق');
 labelValue('a39-model',clean(latest.model||latest.modelId||'غير متوفر'));
 const coverage=latest.coverage||{};
 const q=coverage.qualityLabel||latest.dataQuality?.label||null;
 labelValue('a39-quality',q?clean(q):valid(coverage.coveragePct)?`${Number(coverage.coveragePct).toFixed(0)}% تغطية`:'غير متحقق');
 const t=latest.processingTimeMs??latest.latencyMs;
 labelValue('a39-speed',valid(t)?`${(Number(t)/1000).toFixed(1)} ث`:'غير مقاسة');
 const strategy=latest.strategy?.summary||latest.adaptivePolicy?.regime||ai?.recommendations?.strategicSummary;
 labelValue('a39-decision-text',ai?.stale?'بيانات آخر جلسة محفوظة؛ لا توجد حالة تشغيل حديثة مؤكدة':strategy?clean(strategy):'لا يوجد قرار استراتيجي موثق حالياً');
 const direction=String(latest.strategy?.direction||latest.strategy?.marketDirection||latest.adaptivePolicy?.marketRegime||'').toUpperCase();
 const translated=({'BULLISH':'ميل إيجابي','BEARISH':'ميل سلبي','NEUTRAL':'متوازن','RANGE':'عرضي'})[direction]||'غير متحقق';labelValue('a39-trend',translated);
 const picks=transitions.filter(x=>x&&typeof x.symbol==='string'&&/^[A-Z0-9.^-]{1,16}$/i.test(x.symbol)&&['AI_PAPER_CONFIRMED','SMART','CANDIDATE'].includes(String(x.state)));
 picks.sort((a,b)=>(valid(b.confidence?.profitPotentialScore)?Number(b.confidence.profitPotentialScore):-Infinity)-(valid(a.confidence?.profitPotentialScore)?Number(a.confidence.profitPotentialScore):-Infinity));
 const box=root.querySelector('#a39-opportunities');box.replaceChildren();
 if(!picks.length){box.textContent=ai?.stale?'البيانات المحفوظة قديمة؛ لا توجد فرص حديثة مؤكدة':'لا توجد فرص AI موثقة حالياً';box.classList.add('a39-empty');}else{
 box.classList.remove('a39-empty');for(const [i,x] of picks.slice(0,7).entries()){
 const row=document.createElement('article');row.className='a39-row';const symbol=document.createElement('strong');symbol.className='a39-symbol';symbol.textContent=x.symbol;
 const name=document.createElement('small');name.className='a39-company';name.textContent=clean(x.companyName||x.company||x.features?.sector||'');
 const rank=document.createElement('span');rank.className='a39-rank';rank.textContent=String(i+1);
 const score=document.createElement('span');score.className='a39-score';score.textContent=valid(x.confidence?.profitPotentialScore)?`${Math.round(Number(x.confidence.profitPotentialScore))}/100`:'—';score.title='درجة تقييم داخلية وليست احتمال ربح';
 const rr=document.createElement('span');rr.className='a39-rr';const v=x.confidence?.rewardRiskRatio??x.metrics?.rewardRiskRatio??x.rewardRiskRatio;rr.textContent=valid(v)?`1:${Number(v).toFixed(1)}`:'—';
 const mark=document.createElement('span');mark.className='a39-row-mark';mark.textContent=x.symbol==='NVDA'?'◉':x.symbol==='MSFT'?'▦':x.symbol==='AAPL'?'●':'✦';
 const btn=document.createElement('button');btn.type='button';btn.className='a39-action'+(x.state==='AI_PAPER_CONFIRMED'?'':' a39-follow-orange');btn.textContent=x.state==='AI_PAPER_CONFIRMED'?'ورقية ↗':'متابعة';btn.addEventListener('click',()=>{const fold=root.querySelector('.a39-accordion details:first-child');fold.open=true;expanded=x.symbol;renderAnalysis(root,transitions,report);fold.scrollIntoView({block:'nearest'});});
 const chart=document.createElement("span");chart.className="a39-row-chart";chart.innerHTML=icon("chart");row.append(rank,mark,symbol,name,chart,score,rr,btn);box.append(row);
 }}
 renderAnalysis(root,transitions,report);
 const sectors=root.querySelector('#a39-sectors');sectors.replaceChildren();const grouped={};for(const x of transitions){const s=x.features?.sector;if(typeof s==='string'&&s.length<55)grouped[s]=(grouped[s]||0)+1;}fillList(sectors,Object.entries(grouped).map(([s,n])=>`${s}: ${n} إشارات`),'لا توجد قطاعات موثقة');
 const pol=latest.adaptivePolicy||{};const p=root.querySelector('#a39-policy');p.replaceChildren();
 appendStructured(p,unpack(pol.params)||pol,'معايير الماسح',0,24);
 if(report?.stageStates)appendStructured(p,report.stageStates,'مراحل التقرير',0,16);
 if(report?.riskControls)appendStructured(p,report.riskControls,'ضوابط المخاطر',0,10);
 if(!p.childNodes.length)p.textContent='لا توجد معايير موثقة';
 const hist=root.querySelector('#a39-history');hist.replaceChildren();
 if(report?.rejectionReview)appendStructured(hist,report.rejectionReview,'أسباب الرفض المسجلة',0,25);
 if(report?.recentDecisions)appendStructured(hist,report.recentDecisions,'آخر قرارات AI',0,16);
 if(!hist.childNodes.length)fillList(hist,transitions.slice(0,5).map(x=>`${clean(x.symbol)} · ${stateLabel(x.state)} · ${clean(x.reason||'')}`),'لا يوجد سجل موثق');
}
function fillList(host,items,empty){if(!items.length){host.textContent=empty;return;}for(const str of items){const div=document.createElement('div');div.className='a39-foldline';div.textContent=str;host.append(div)}}
function renderAnalysis(root,transitions,report){const host=root.querySelector('#a39-analysis');host.replaceChildren();
 const chosen=expanded?transitions.filter(x=>x.symbol===expanded):transitions.slice(0,5);
 for(const x of chosen){appendFact(host,`${clean(x.symbol)} · ${stateLabel(x.state)}`,humanText(x.reason||x.stateReason||'لا يوجد سبب موثق'));if(x.checks)appendStructured(host,x.checks,'فحوص السهم',0,12);}
 if(!expanded&&report){
  if(report.caseCoverage)appendStructured(host,report.caseCoverage,'تغطية أدلة القرارات',0,10);
  if(report.decisionCases)appendStructured(host,report.decisionCases,'الأدلة المرتبطة بالقرارات',0,28);
  if(report.errorReview)appendStructured(host,report.errorReview,'مراجعة النتائج الخاسرة',0,16);
  if(report.proposedExperiments)appendStructured(host,report.proposedExperiments,'التجارب المقترحة (غير مطبقة)',0,15);
 }
 if(!host.childNodes.length)host.textContent='لا توجد أدلة موثقة حالياً';
}
window.DT39AIScreen=Object.freeze({template,render});
})();
