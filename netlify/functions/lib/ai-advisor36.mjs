/** Offline/realtime-statistics research advisor. No external LLM, no auto modifications.
 * Suggestions are observational only; require OOS validation before any adoption.
 */
const pct=(a,b)=>b>0?Math.round(a/b*1000)/10:null;
export function computeAiAdvisor36(sessions){
 const blockers=new Map(), smart=[],closed=[],obs=[],shots=[];
 for(const session of sessions||[]){
  for(const rec of Object.values(session?.signals||{})){
   for(const c of rec.gateChanges||[])if(c.version==='3.6'&&c.reason)blockers.set(c.reason,(blockers.get(c.reason)||0)+1);
   for(const t of rec.transitions||[])if(t.version==='3.6'&&t.state==='SMART')smart.push({symbol:rec.symbol,...t});
   for(const t of rec.smartObservations||[])obs.push({symbol:rec.symbol,...t});
   for(const x of rec.confirmedSignals||[])if(x.version==='3.6'&&x.finalOutcome)closed.push({symbol:rec.symbol,...x});
   for(const x of rec.confirmedSignals||[])if(x.version==='3.6'&&x.shadowTargets)shots.push(x);
  }
 }
 const blockersSorted=[...blockers].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([reason,count])=>({reason,count}));
 const outcome=closed.filter(x=>['SL','T1','T2','T3'].includes(x.finalOutcome));
 const excluded=closed.length-outcome.length;
 const successes=outcome.filter(x=>x.finalOutcome!=='SL').length;
 const shadow={};for(const trade of shots)for(const [mode,t] of Object.entries(trade.shadowTargets||{})){
   const row=shadow[mode]??{mode,observed:0,hitBeforeStop:0,stopFirst:0,ambiguous:0,postExitHit:0};
   row.observed++;if(t.firstHitAt)row.hitBeforeStop++;if(t.stopFirstAt)row.stopFirst++;if(t.status==='AMBIGUOUS_SAME_BAR')row.ambiguous++;
   if(t.postExitHitAt)row.postExitHit++;shadow[mode]=row;
 }
 const recommendations=[];
 if(smart.length<30||outcome.length<30)recommendations.push({priority:'HIGH',id:'MORE_OOS_DATA',
   title:'جمع عينة مستقلة قبل تعديل المعايير',evidence:`SMART ${smart.length}، صفقات مكتملة قابلة للمقارنة ${outcome.length}`,
   hypothesis:'العينة الحالية لا تكفي لمعرفة تأثير أي تغيير على الربحية',changeApproved:false});
 if(blockersSorted[0]?.count>=10)recommendations.push({priority:'RESEARCH',id:'TOP_BLOCKER',
   title:`دراسة سبب الرفض المتكرر: ${blockersSorted[0].reason}`,evidence:`${blockersSorted[0].count} تحديثات لسبب الرفض`,
   hypothesis:'تحقق من جودة البيانات قبل تخفيف هذا الشرط؛ قد يكون الشرط يحمي من خسائر',changeApproved:false});
 const stale=(blockers.get('STALE_QUOTE')||0)+(blockers.get('NO_AUTHENTIC_ALPACA_QUOTE')||0);
 if(stale>=5)recommendations.push({priority:'DATA',id:'QUOTE_QUALITY',title:'تحسين مصدر Bid/Ask وتواتر الاستقبال',
   evidence:`${stale} حالات بيانات غير قابلة للتنفيذ`,hypothesis:'قد يسبب تأخر IEX فقدان فرص رغم صحة Retest',changeApproved:false});
 if(outcome.length>=30&&pct(successes,outcome.length)<45)recommendations.push({priority:'RESEARCH',id:'LOW_OOS_WIN',
   title:'اختبر بوابة HOD والعائد الصافي على عينة زمنية لاحقة',evidence:`معدل نتائج رابحة ${pct(successes,outcome.length)}% من ${outcome.length}`,
   hypothesis:'يحتاج ضبط جودة الدخول وربح ما بعد الرسوم',changeApproved:false});
 const outliers=obs.filter(x=>Number(x.features?.openingReturnPct)>5||Number(x.features?.retestVolumeRatio)>10).slice(-25)
  .map(x=>({symbol:x.symbol,at:x.at,reason:'EXTREME_INPUT',openingReturnPct:x.features?.openingReturnPct,volumeRatio:x.features?.retestVolumeRatio}));
 return {version:'3.6',method:'RULE_BASED_STATISTICAL_AI_RESEARCH_ASSISTANT',automaticStrategyChange:false,
  calibration:{status:'UNCALIBRATED',profitProbability:null,independentCompletedTrades:outcome.length,minRecommended:60},
  sessionsAnalyzed:sessions.length,smartTransitions:smart.length,smartObservations:obs.length,
  outcomes:{completedComparable:outcome.length,excludedAmbiguousOrExpired:excluded,profitableProxy:successes,winRateProxyPct:pct(successes,outcome.length)},
  blockers:blockersSorted,shadow: Object.values(shadow),outliers,recommendations,
  evidenceLimit:'IEX 1-min OHLCV + quote snapshots; not causal explanation, real fills or calibrated probability.'};
}
