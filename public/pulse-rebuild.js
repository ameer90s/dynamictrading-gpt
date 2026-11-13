/* Independent five-tab, owner-reference UI; uses existing application state and actions only.
 * No market fetch, write, order, or synthetic trading result is performed here. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escape=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths={
 today:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 market:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 ai:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z"/>',
 research:'<path d="M9 3h6M10 3v6l-6.4 10.3A1.4 1.4 0 0 0 4.8 21h14.4a1.4 1.4 0 0 0 1.2-1.7L14 9V3M7 16h10"/>',
 performance:'<path d="M5 18v-4m5 4V9m5 9V5m5 13v-7" stroke-width="3"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 watch:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 trend:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
 docs:'<path d="M7 3h8l4 4v14H7zM15 3v5h4M10 12h6M10 16h6"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2L17 7m-10 10-2.1 2.1"/>',
 alert:'<path d="m12 3 10 18H2zM12 9v5m0 4h.01"/>',
 scale:'<path d="M12 3v18M4 7h16M4 7l-3 7h6L4 7m16 0-3 7h6l-3-7M8 21h8"/>',
 wallet:'<path d="M4 6V4h15v4M3 8h18v12H3zM16 12h5v5h-5z"/>',
 up:'<path d="M4 17 10 11l4 3 6-8m-5 0h5v5"/>',
 down:'<path d="m4 7 6 6 4-3 6 8m-5 0h5v-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 paper:'<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h7"/>'
};
const svg=(key,clazz='')=>`<svg class="pu-svg ${clazz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[key]||iconPaths.target}</svg>`;
const names={today:'اليوم',market:'الماسح',ai:'ماسح AI',research:'الباحث',performance:'الأداء'};
const icons={today:'today',market:'market',ai:'ai',research:'research',performance:'performance'};
const value=(id)=>{const v=$(id)?.textContent?.trim();return v||'—'};
const stat=(label,data,icon='target')=>`<div class="pu-cell"><span class="pu-ico">${svg(icon)}</span><small>${label}</small><strong>${data}</strong></div>`;
const panel=(title,content,icon='performance')=>`<section class="pu-panel"><h2><span class="pu-green pu-titleicon">${svg(icon)}</span>${title}</h2>${content}</section>`;
const fold=(title,body,icon='docs')=>`<details class="pu-fold"><summary><span><span class="pu-green pu-foldicon">${svg(icon)}</span>${title}</span></summary><div class="pu-foldbody">${body}</div></details>`;
const title=(label,sub,icon)=>`<div class="pu-title"><h1>${label} <span class="pu-green">${svg(icon)}</span></h1><p>${sub}</p></div>`;
const unknown='<span class="pu-muted">لا توجد بيانات موثقة حالياً</span>';
// Today is authored as a separate standalone screen; no legacy Today markup is reused.
const home=()=>window.DT39TodayScreen.template();
// Scanner 3.9 independent layout: no inherited scanner cards or legacy DOM.
const scanner=()=>window.DT39ScannerScreen.template();
// Independent AI scanner — no inherited AI cards.
const ai=()=>window.DT39AIScreen.template();
const research=()=>window.DT39ResearchScreen.template();
const performance=()=>window.DT39PerformanceScreen.template();
const views={today:home,market:scanner,ai,research,performance};
let active='today';let root;
function set(id,txt){const e=$('#'+id,root);if(e&&e.textContent!==txt)e.textContent=txt}
function money(n){return n===null||n===undefined||n===''||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n))}
function num(x){return x===null||x===undefined||x===''||!Number.isFinite(Number(x))?'—':Number(x).toFixed(2)}
function native(tab,target){document.body.classList.remove('pu-rebuilt');window.DynamicTradingTabNav?.activate(tab,true);const e=document.getElementById(target);if(e){let parent=e.closest('details');while(parent){parent.open=true;parent=parent.parentElement?.closest('details')}setTimeout(()=>e.scrollIntoView({behavior:'smooth',block:'start'}),30)}let back=document.getElementById('pu-return');if(!back){back=document.createElement('button');back.id='pu-return';back.textContent='العودة إلى الواجهة الجديدة';back.style.cssText='position:fixed;bottom:12px;right:12px;z-index:9999;background:#a6ff38;color:#082a19;padding:10px;border-radius:10px;font-weight:bold;border:1px solid green';document.body.appendChild(back);back.onclick=()=>{document.body.classList.add('pu-rebuilt');back.remove();window.scrollTo(0,0)}}}
function safeFinite(value){return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value)}
function numericText(v,suffix=''){const n=safeFinite(v);return n===null?'—':n.toLocaleString('en-US',{maximumFractionDigits:2})+suffix}
function showRows(id,items,kind){const host=$('#'+id,root);if(!host)return;const hash=JSON.stringify(items.map(x=>[x.symbol,x.state,x.recommendationState,x.price,x.entryLow,x.reason,x.netUsd,x.status]));if(host.dataset.hash===hash)return;host.dataset.hash=hash;host.replaceChildren();if(!items.length){host.textContent='لا توجد بيانات محفوظة';return}for(const r of items.slice(0,20)){const btn=document.createElement('button');btn.className='pu-trade';const name=document.createElement('strong');name.textContent=r.symbol||'—';const status=document.createElement('span');status.className='pu-mark';status.textContent=kind==='ai'?String(r.state||'—'):r.recommendationState==='CONFIRMED'?'شراء ↗':'متابعة ◎';const detail=document.createElement('small');const px=safeFinite(r.entryLow)??safeFinite(r.features?.price)??safeFinite(r.price);const quality=kind==='ai'?safeFinite(r.confidence?.profitPotentialScore):null;detail.textContent=(px===null?'—':`$${px.toFixed(2)}`)+(quality===null?'':` · درجة جودة ${quality.toFixed(0)}/100`);btn.append(name,detail,status);btn.addEventListener('click',()=>dialog(r,kind));host.appendChild(btn)}}
function detailLines(rows){return rows.map(([key,v])=>`<div class="pu-detailrow"><span>${escape(key)}</span><strong>${escape(v)}</strong></div>`).join('')}
function dialog(item,kind='scanner'){
 const modal=$('#pu-modal',root),isAi=kind==='ai',confirmed=item.recommendationState==='CONFIRMED'||item.state==='AI_PAPER_CONFIRMED';
 const vals=isAi?[
 ['السهم',item.symbol],['الحالة',item.state],['السعر',num(item.features?.price)],['Bid',num(item.quote?.bid)],['Ask',num(item.quote?.ask)],['Spread bps',num(item.quote?.spreadBps)],['السبب',item.reason||'—']
 ]:[['السهم',item.symbol],['الحالة',item.recommendationState],['الدخول',num(item.entryLow??item.price)],['الهدف 1',confirmed?num(item.target1):'غير مؤكد'],['الهدف 2',confirmed?num(item.target2):'غير مؤكد'],['الهدف 3',confirmed?num(item.target3):'غير مؤكد'],['وقف الخسارة',confirmed?num(item.stopLoss):'غير مؤكد'],['السبب',item.stateReason||item.reason||'—']];
 $('#pu-dialog-body',root).innerHTML=`<h2>${escape(item.symbol||'—')}</h2>${detailLines(vals)}${isAi&&item.checks?`<details class="pu-fold"><summary>فحوص AI</summary><pre>${escape(JSON.stringify(item.checks,null,2))}</pre></details>`:''}`;
 modal.hidden=false;
}
// Structured, readable presentation of the original AI report; no fields are discarded.
const AI_REPORT_AR={
 schema:'إصدار التقرير',day:'تاريخ الجلسة',generatedAt:'وقت إعداد التقرير',owner:'الجهة المسؤولة',
 sharedWithResearchAgent:'مشاركة التقرير مع الباحث',externalReportForwarding:'إرسال التقرير خارجياً',
 stageStates:'مراحل التحليل',scan:'المسح',select:'اختيار الفرص',paperFollowup:'متابعة الصفقات الورقية',
 auditDecisions:'تدقيق القرارات',analyzeErrors:'تحليل الأخطاء',proposeImprovements:'اقتراح التحسينات',
 coverage:'تغطية الأسهم',eligible:'الأسهم المؤهلة',everScanned:'الأسهم التي فُحصت',coveragePct:'نسبة التغطية',feedErrors:'أخطاء البيانات',
 outcomes:'نتائج التداول الورقي',uniqueClosed:'الصفقات المغلقة',priced:'الصفقات المحسوبة',unpriced:'الصفقات غير المحسوبة',
 winners:'الصفقات الرابحة',losers:'الصفقات الخاسرة',netPaperUsd:'الصافي الورقي بالدولار',bySetup:'النتائج حسب نوع الفرصة',
 brokerFillVerified:'التحقق من تنفيذ الوسيط',winProbabilityCalibrated:'معايرة احتمال النجاح',
 closed:'مغلقة',wins:'رابحة',losses:'خاسرة',
 errorReview:'مراجعة الخسائر',rejectionReview:'أسباب استبعاد الفرص',decisionCases:'قرارات AI والأدلة',
 rejectedFollowthrough:'متابعة الفرص المستبعدة',rejectionFollowthroughTotals:'إحصاءات الفرص المستبعدة',
 caseCoverage:'تغطية سجل القرارات',recentDecisions:'آخر قرارات الماسح',proposedExperiments:'التجارب المقترحة',
 alternateEntryStopTargetEvaluation:'مراجعة بدائل الدخول والوقف والأهداف',riskControls:'ضوابط المخاطر',
 autoChangeProduction:'تعديل النظام تلقائياً',externalAudit:'تدقيق خارجي',costNote:'ملاحظة التكلفة',
 id:'المرجع',symbol:'السهم',at:'الوقت',minute:'دقيقة التداول',reason:'السبب',kind:'نوع القرار',
 status:'الحالة',source:'المصدر',area:'المجال',hypothesis:'الفرضية',proposedExperiment:'التجربة المقترحة',
 confidence:'الثقة',level:'المستوى',winProbability:'احتمال النجاح',alternatives:'البدائل',impact:'الأثر',
 observedNetPaperUsd:'الصافي الورقي الفعلي',projectedProfit:'الربح المتوقع',projectedDrawdown:'التراجع المتوقع',
 additionalProviderCalls:'طلبات مزوّد إضافية',additionalBlobWrites:'عمليات تخزين إضافية',
 approved:'معتمد',autoApply:'تطبيق تلقائي',evidenceIds:'مراجع الأدلة',evidenceId:'مرجع الدليل',
 archiveKey:'مرجع الأرشيف',factCount:'عدد الحقائق',facts:'الحقائق',hypotheses:'الفرضيات',
 counterfactuals:'البدائل الافتراضية',causalConclusion:'الاستنتاج السببي',fullFactsSource:'مصدر الأدلة الكاملة',
 category:'التصنيف',cause:'السبب المؤكد',investigation:'المطلوب للتحقق',openedAt:'وقت الفتح',closedAt:'وقت الإغلاق',
 netUsd:'الصافي بالدولار',mfePct:'أقصى حركة إيجابية %',maePct:'أقصى حركة سلبية %',setupType:'نوع النموذج',
 evaluations:'مرات الرصد',missedTradeOutcome:'نتيجة الفرصة المستبعدة',observedSetups:'النماذج المرصودة',
 activeSetups:'النماذج النشطة',positivePriceMfe:'النماذج ذات الحركة الإيجابية',interpretation:'تفسير النتائج',
 recordedCases:'القرارات المسجلة',shownCases:'القرارات المعروضة',everyEvaluationArchive:'أرشيف كافة القرارات',
 casesAreNotTheFullPopulation:'المعروض ليس كامل السجل',sample:'حجم العينة',decisionCases:'القرارات المدققة',
 uniqueClosed:'الصفقات المغلقة',acceptance:'شروط الاعتماد',sourceModel:'النموذج',
};
const AI_REPORT_STATES={
 RECORDED:'مسجل',NOT_VERIFIED:'غير متحقق',ASOF_PLANS_COMPARED:'تمت مقارنة الخطط وقت القرار',
 RECORDED_WHEN_AVAILABLE:'تُسجل عند توفرها',RECORDED_WITH_ARCHIVE_POINTERS:'مسجلة مع مراجع الأرشيف',
 FACTS_HYPOTHESES_AND_ASOF_COUNTERFACTUALS:'حقائق وفرضيات ومقارنة بدائل وقت القرار',
 PROPOSED_UNTESTED:'مقترح — لم يُختبر',UNVERIFIED_WITHOUT_ASOF_REPLAY_AND_QUOTE_AUDIT:'السبب غير مثبت دون إعادة اختبار ومراجعة الأسعار',
 OBSERVED_NEGATIVE_PAPER_OUTCOME:'خسارة ورقية مرصودة',LOW:'منخفضة',DESCRIPTIVE_SAMPLE_ONLY:'عينة وصفية فقط',
 NOT_VERIFIED_REQUIRES_HOLDOUT:'غير متحقق — يحتاج اختبار خارج العينة',
 NOT_VERIFIED_REQUIRES_DETERMINISTIC_ASOF_REPLAY:'غير متحقق — يحتاج إعادة تشغيل تاريخية',
 PRICE_PATH_OBSERVATIONS_NOT_EXECUTABLE_MISSED_PROFITS:'تحركات سعر مرصودة وليست أرباحاً ضائعة قابلة للتنفيذ',
 APPROVED_SHARIA:'أسهم شرعية معتمدة',FRESH_AUTHENTIC_BID_ASK:'أسعار شراء وبيع حديثة وموثقة',
 POSITIVE_NET_ECONOMICS:'عائد صافٍ إيجابي بعد التكاليف',NO_AUTO_BROKER_ORDERS:'لا أوامر تداول تلقائية',
 AI_OWN_RECORDED_DECISIONS:'قرارات AI المسجلة',NET_AFTER_COSTS_AND_WALK_FORWARD_REQUIRED:'تحقق صافي العائد واختبار زمني مستقل مطلوب',
};
function reportLabel(key){return AI_REPORT_AR[key]||String(key).replace(/([a-z])([A-Z])/g,'$1 $2')}
function reportValue(v,key){
 if(v===null||v===undefined||v==='')return 'غير متوفر';
 if(typeof v==='boolean')return v?'نعم':'لا';
 if(typeof v==='number')return new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(v)+(key==='coveragePct'?'%':'');
 const str=String(v);return AI_REPORT_STATES[str]||str;
}
function reportNode(k,v,depth=0){
 const wrap=document.createElement('div');wrap.className='pu-report-item';
 if(v===null||typeof v!=='object'){
  const label=document.createElement('span');label.className='pu-report-key';label.textContent=reportLabel(k);
  const val=document.createElement('strong');val.className='pu-report-value';val.textContent=reportValue(v,k);
  wrap.append(label,val);return wrap;
 }
 const detail=document.createElement('details');detail.className='pu-fold pu-report-fold';
 const summary=document.createElement('summary');summary.textContent=reportLabel(k)+(Array.isArray(v)?` (${v.length})`:'');
 detail.append(summary);
 const inside=document.createElement('div');inside.className='pu-report-content';
 if(Array.isArray(v)){
  if(!v.length){inside.textContent='لا توجد بيانات مسجلة';}
  else v.forEach((item,i)=>inside.append(reportNode(String(i+1),item,depth+1)));
 }else{
  const entries=Object.entries(v);
  if(!entries.length)inside.textContent='لا توجد بيانات مسجلة';
  else entries.forEach(([key,item])=>inside.append(reportNode(key,item,depth+1)));
 }
 detail.append(inside);wrap.append(detail);return wrap;
}
function renderReport(id,report){
 const host=$('#'+id,root);if(!host)return;
 const fingerprint=JSON.stringify(report||null);if(host.dataset.reportFingerprint===fingerprint)return;
 host.dataset.reportFingerprint=fingerprint;host.replaceChildren();
 if(!report||typeof report!=='object'){host.textContent='لا يوجد تقرير محفوظ';return}
 const heading=document.createElement('div');heading.className='pu-report-intro';
 heading.textContent=`تقرير ماسح AI · ${report.day||'تاريخ غير متوفر'} · ${report.generatedAt||'وقت غير متوفر'}`;
 host.append(heading);
 const metrics=[['الأسهم المؤهلة',report.coverage?.eligible],['نسبة التغطية',report.coverage?.coveragePct],
 ['الصفقات المغلقة',report.outcomes?.uniqueClosed],['الصافي الورقي',report.outcomes?.netPaperUsd]];
 const stats=document.createElement('div');stats.className='pu-report-metrics';
 for(const [name,value] of metrics){const tile=document.createElement('div');tile.className='pu-report-stat';
  const label=document.createElement('small');label.textContent=name;
  const num=document.createElement('b');num.textContent=value===null||value===undefined?'—':
   name==='الصافي الورقي'?money(value):name==='نسبة التغطية'?reportValue(value,'coveragePct'):reportValue(value);
  tile.append(label,num);stats.append(tile)}host.append(stats);
 const notice=document.createElement('p');notice.className='pu-muted';
 notice.textContent=report.sharedWithResearchAgent===true?'التقرير يشير إلى مشاركة مع الباحث؛ تحقق من إيصال الاستلام':
 'هذا تقرير داخلي؛ لا يعني ظهوره أن الباحث استلمه. اقتراحات التحسين لا تُطبق تلقائياً.';
 host.append(notice);
 const featured=['stageStates','coverage','outcomes','errorReview','rejectionReview','decisionCases',
 'rejectedFollowthrough','rejectionFollowthroughTotals','caseCoverage','recentDecisions','proposedExperiments'];
 const metadata=['schema','day','generatedAt','owner','sharedWithResearchAgent','externalReportForwarding'];
 for(const key of featured){if(Object.hasOwn(report,key))host.append(reportNode(key,report[key]))}
 const other=Object.keys(report).filter(key=>!featured.includes(key)&&!metadata.includes(key));
 if(other.length){const extra=document.createElement('details');extra.className='pu-fold pu-report-fold';
  const summary=document.createElement('summary');summary.textContent='المعلومات الإضافية والضوابط';extra.append(summary);
  const content=document.createElement('div');content.className='pu-report-content';
  [...metadata,...other].filter(key=>Object.hasOwn(report,key)).forEach(key=>content.append(reportNode(key,report[key])));
  extra.append(content);host.append(extra)}
}
function renderResearch(r){window.DT39ResearchScreen.render(r,window.DT38LastAiPaper||null)}
function sync(){if(!root)return;
 set('pu-uae',value('#uaeTime'));set('pu-ny',value('#nyTime'));
 const sessionRaw=value('#marketStatus');
 const session=/مفتوح|REGULAR/i.test(sessionRaw)?'مفتوح':/PRE.MARKET|قبل السوق/i.test(sessionRaw)?'ما قبل السوق':/POST.MARKET|بعد السوق/i.test(sessionRaw)?'بعد السوق':/مغلق|عطلة/i.test(sessionRaw)?'مغلق':'غير متحقق';
 set('pu-today-session',session==='مفتوح'?'السوق الأمريكي مفتوح':session==='مغلق'?'السوق الأمريكي مغلق':session==='غير متحقق'?'حالة الجلسة غير متحققة':session);const sessionNode=$('#pu-header-session',root);if(sessionNode)sessionNode.parentElement.dataset.state=session==='مفتوح'?'open':session==='مغلق'?'closed':'neutral';
 set('pu-marketstatus',sessionRaw);
 const rawTrend=value('#marketInterpretation');
 // Derive direction only from actual market-analysis output, never from the session clock.
 const dir=/سلبي|هابط|ضعيف/i.test(rawTrend)?'هابط':/إيجابي|داعم للشراء|صاعد/i.test(rawTrend)?'صاعد':/متوازن|محايد|عرضي/i.test(rawTrend)?'متوازن':'غير متحقق';
 set('pu-today-direction',dir);set('pu-today-market',dir);
 const rowsToday=Array.isArray(window.DT38LastScannerRows)?window.DT38LastScannerRows:[];
 const confirmedToday=rowsToday.filter(x=>x?.recommendationState==='CONFIRMED').length;
 const confirmedLive=rowsToday.filter(x=>x?.recommendationState==='CONFIRMED'&&!x.historicalOnly).length;
 set('pu-today-confirm',Array.isArray(window.DT38LastScannerRows)?String(confirmedToday):'—');
 set('pu-today-next',confirmedLive?'مراجعة الفرص':confirmedToday?'مراجعة السجل':session==='مفتوح'?'متابعة السوق':'متابعة الباحث');
 set('pu39-action-description',confirmedLive?'توجد فرص مؤكدة حديثة؛ تحقق من صلاحية الدخول.':confirmedToday?'توجد إشارات مؤكدة محفوظة للعرض فقط، وليست فرص دخول جديدة.':session==='مفتوح'?'راجع الفرص المسجلة اليوم وتأكد من شروط القرار.':'راجع آخر النتائج المحفوظة قبل اتخاذ قرار.');
 const quality=value('#scannerHealthState');set('pu-quality',quality!=='—'?quality:'غير متحقق');
 const researcher=window.DT38LastResearch;
 set('pu-research-filter',researcher?.summary||researcher?.daily?.summary||'لا توجد توصية تصفية موثقة');
 set('pu-research-action',researcher?.localHypotheses?.[0]?.hypothesis_ar||researcher?.experiments?.[0]?.hypothesis_ar||'لا توجد توصية تغيير فوري موثقة');
 const rows=Array.isArray(window.DT38LastScannerRows)?window.DT38LastScannerRows:[];
 window.DT39ScannerScreen.render(root,{rows,rowsKnown:Array.isArray(window.DT38LastScannerRows),trend:dir,health:value('#scannerHealthState'),visibilityNote:window.DT39ScannerVisibilityNote});
 // The weekly screen is now owned exclusively by the independent 3.9 presentation.
 // Legacy weekly calculator remains mounted invisibly as the only data source.
 window.DT39PerformanceScreen.render(window.DT38LastWeekly||null);
 window.DT39AIScreen.render(window.DT38LastAiPaper||null);
 const aiState=window.DT38LastAiPaper;const aiReport=aiState?.internalReport||aiState?.recommendations?.internalReport||null;
 renderReport('pu-research-ai',aiReport);renderReport('pu-ai-summary',aiReport);
 window.DT39ResearchScreen.render(window.DT38LastResearch||null,window.DT38LastAiPaper||null);
}
async function ownerDecision(button){
 const token=window.prompt('رمز مراجعة الباحث الخاص بك (DT38_DECISION_ADMIN_TOKEN):');if(!token)return;
 const status=document.createElement('small');status.className='pu-owner-status';status.textContent='جاري حفظ القرار…';button.parentElement.append(status);
 button.disabled=true;
 try{const report=window.DT38LastResearch||{};const r=await fetch('/api/research-decision38',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`},body:JSON.stringify({id:button.dataset.ownerId,verdict:button.dataset.ownerVerdict,summary:button.dataset.ownerSummary,day:report.day,source:report.paidStatus==='REVIEW_CREATED_NOT_APPLIED'?'OPENAI':'LOCAL'})});const body=await r.json().catch(()=>({}));status.textContent=r.ok?'تم تسجيل القرار في الخادم':`لم يُحفظ القرار: ${body.error||r.status}`;if(!r.ok)button.disabled=false;
 }catch{status.textContent='تعذر حفظ القرار؛ لا نعتبره مسجلاً';button.disabled=false}
}
async function ownerHistory(){const token=window.prompt('رمز مراجعة الباحث الخاص بك (DT38_DECISION_ADMIN_TOKEN):');if(!token)return;const host=$('#pu-owner-history',root);host.textContent='جاري جلب القرارات…';try{const r=await fetch(`/api/research-decision38?day=${encodeURIComponent(window.DT38LastResearch?.day||'')}`,{headers:{authorization:`Bearer ${token}`}});if(!r.ok)throw Error(`HTTP_${r.status}`);const data=await r.json();const decisions=Array.isArray(data.decisions)?data.decisions:[];host.replaceChildren();for(const d of decisions){const row=document.createElement('div');row.className='pu-detailrow';row.textContent=`${d.verdict==='APPROVE'?'موافقة':'رفض'} · ${d.summary||d.id||'—'} · ${d.at||'—'}`;host.append(row)}if(!decisions.length)host.textContent='لا توجد قرارات مسجلة';const mirror=$('#pu-owner-history-full',root);if(mirror){mirror.replaceChildren(...[...host.childNodes].map(n=>n.cloneNode(true)))}set('pu-accepted',String(decisions.filter(x=>x.verdict==='APPROVE').length));set('pu-rejected',String(decisions.filter(x=>x.verdict==='REJECT').length));}catch{host.textContent='تعذر قراءة القرارات؛ الحالة غير متحققة'}
}
function boot(){if($('#pulse-app'))return;root=document.createElement('div');root.id='pulse-app';root.innerHTML=`<header class="pu-top"><button class="pu-topcontrol" data-native="tools" aria-label="القائمة والإعدادات">☰</button><button class="pu-topcontrol" data-native="tools" data-target="pushBtn" aria-label="إعدادات الإشعارات">♧<i class="pu-alertdot"></i></button><div class="pu-brand" role="img" aria-label="DT PULSE"></div><button class="s39-header-settings" type="button" data-native="tools" aria-label="فتح الإعدادات" title="الإعدادات">⚙</button></header><main id="pu-main">${Object.entries(views).map(([id,f])=>`<section class="pu-screen" data-screen="${id}" ${id!=='today'?'hidden':''}>${f()}</section>`).join('')}</main><nav class="pu-scrolltabs" aria-label="التنقل الرئيسي">${Object.entries(names).map(([id,label])=>`<button type="button" data-go="${id}" class="${id==='today'?'selected':''}"><b>${svg(icons[id])}</b>${label}</button>`).join('')}</nav><div id="pu-modal" class="pu-modal" hidden><div class="pu-dialog"><button type="button" class="pu-close" data-close="1">×</button><div id="pu-dialog-body"></div></div></div>`;
document.body.insertBefore(root,document.body.firstChild);document.body.classList.add('pu-rebuilt');
window.DT39ScannerScreen.bind(root);window.DT39ResearchScreen.bind();window.DT39PerformanceScreen.bind();
window.DT39AIScreen.render(window.DT38LastAiPaper||null);
root.addEventListener('change',e=>{if(e.target.id==='pu-week-picker'){const old=$('[data-weekly371-week]');if(old){old.value=e.target.value;old.dispatchEvent(new Event('change',{bubbles:true}))}}else if(e.target.id==='pu-week-commission'){const old=$('[data-weekly371-commission]');if(old){old.value=e.target.value;old.dispatchEvent(new Event('change',{bubbles:true}))}}});
root.addEventListener('click',e=>{const week=e.target.closest('[data-week-action]');if(week){const btn=$('[data-weekly371-refresh]');if(btn)btn.click();return}const owner=e.target.closest('[data-owner-verdict]');if(owner){ownerDecision(owner);return}if(e.target.closest('[data-research-history]')){ownerHistory();return}const nav=e.target.closest('[data-go]');if(nav){active=nav.dataset.go;$$('.pu-screen',root).forEach(s=>s.hidden=s.dataset.screen!==active);$$('.pu-scrolltabs button',root).forEach(b=>b.classList.toggle('selected',b.dataset.go===active));window.scrollTo({top:0,behavior:'instant'});if(active==='performance')window.dispatchEvent(new CustomEvent('dynamic-trading:tabchange',{detail:{tab:'performance'}}));sync();return}const nativeB=e.target.closest('[data-native]');if(nativeB){native(nativeB.dataset.native,nativeB.dataset.target);return}if(e.target.closest('[data-close]')){$('#pu-modal',root).hidden=true;return}const filter=e.target.closest('[data-filter]');if(filter){$$('[data-filter]',root).forEach(b=>b.classList.toggle('selected',b===filter));const selected=filter.dataset.filter;$('#pu-confirmed-list',root).closest('.pu-panel').hidden=selected==='smart';$('#pu-smart-list',root).closest('.pu-panel').hidden=selected==='confirmed';return}const report=e.target.closest('[data-rtab]');if(report){$$('[data-rtab]',root).forEach(b=>b.classList.toggle('selected',b===report));$$('[data-rpanel]',root).forEach(p=>p.hidden=p.dataset.rpanel!==report.dataset.rtab);return}});
$('#pu-modal',root).addEventListener('click',e=>{if(e.target.id==='pu-modal')e.target.hidden=true});
for(const ev of ['dt38:scanner-rows','dt38:weekly','dt38:research','dt38:ai-paper'])window.addEventListener(ev,sync);
for(const id of ['marketStatus','marketInterpretation','scannerHealthState','uaeTime','nyTime','dt38TodayConfirmed','dt38PerformanceNet','dt38PerformanceRate','aiParallelStatus','researchSummary']){let n=document.getElementById(id);if(n)new MutationObserver(()=>{if(document.body.contains(root))sync()}).observe(n,{childList:true,subtree:true,characterData:true})}
sync();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
