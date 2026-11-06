/** Local offline test suite for research-only multi-pattern discovery. */
import assert from 'node:assert/strict';
import {RESEARCH_ONLY_PATTERN_IDS37,detectResearchPatterns37,updateResearchPatternShadows37,assessResearchPatternReadiness37} from '../netlify/functions/lib/ai-pattern-catalog37.mjs';
import {evaluateIndependentAi} from '../netlify/functions/lib/ai-parallel36.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
const day='2026-10-30';let successes=0;
function test(name,fn){fn();successes++;console.log('PASS '+name)}
const bar=(m,close,vol=1000,overrides={})=>({datetime:`${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`,
 open:close-.02,high:close+.03,low:close-.04,close,volume:vol,_time:{min:m,day},...overrides});
const at=m=>new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60+1,3));
const rows=Array.from({length:30},(_,i)=>bar(570+i,10+i*.002,1000));
rows.at(-1).open=10.12;rows.at(-1).close=10.65;rows.at(-1).high=10.68;rows.at(-1).low=10.10;rows.at(-1).volume=4500;
const features={barTime:rows.at(-1).datetime,atr:.18,atrPct:1.7,volumeRatio:2.8,
 closePosition:(10.65-10.10)/(.58),momentum5Pct:.7,momentum3Pct:.8,sessionRelativeStrengthPct:1.1,
 minute:599,benchmarkLagMinutes:0,ema9:10.24,ema21:10.12,vwap:10.14,rsi14:62};
const run=(x={})=>detectResearchPatterns37({symbol:'TEST',rows,features,policy:{regime:'UP',params:{minClosePosition:.62}},approved:true,verifiedSource:true,...x});

test('exactly 20 explicit catalog patterns, no duplicate names',()=>{
 assert.equal(RESEARCH_ONLY_PATTERN_IDS37.length,20);
 assert.equal(new Set(RESEARCH_ONLY_PATTERN_IDS37).size,20);
});
test('catalog detects multiple independently evaluated patterns from completed OHLCV',()=>{
 const p=run();assert.equal(p.assessments.length,20);assert(p.detected.length>=3,p.detected.map(x=>x.type).join(','));
 assert(p.detected.some(x=>x.type==='CONSOLIDATION_BREAKOUT'||x.type==='MOMENTUM_CONTINUATION'));
});
test('every newly detected pattern is research-only; no auto trades or calibrated probabilities',()=>{
 const p=run();assert(p.detected.every(x=>x.status==='DETECTED_RESEARCH_ONLY'&&!x.canEnterTrade&&!x.tradeEligible&&x.manualApprovalRequired));
 assert(p.detected.every(x=>x.scoreType.includes('NOT_PROFIT_PROBABILITY')));
 assert.equal(p.automaticTrading,false);assert.equal(p.eligibleForAutoPromotion,false);
});
test('four patterns needing unavailable inputs are explicitly unavailable, not guessed',()=>{
 const p=run();assert.equal(p.unavailableCount,4);
 for(const id of ['GAP_AND_GO','GAP_FILL_RECOVERY','ORDER_BOOK_IMBALANCE','NEWS_CATALYST_MOMENTUM'])
  assert.equal(p.assessments.find(x=>x.type===id)?.status,'UNAVAILABLE_DATA');
});
test('research score deterministic, bounded, sorted, evidence contains bar timestamp and dynamic gates',()=>{
 const a=run(),b=run();assert.deepEqual(a.detected,b.detected);
 for(let i=0;i<a.detected.length;i++){
  assert(a.detected[i].researchScore>=0&&a.detected[i].researchScore<=100);
  assert(a.detected[i].evidence.barTime===features.barTime);
  if(i)assert(a.detected[i-1].researchScore>=a.detected[i].researchScore);
 }
});
test('no Sharia permission blocks every research detection',()=>{
 const p=run({approved:false});assert.equal(p.detected.length,0);
 assert(p.assessments.every(x=>x.status==='BLOCKED_UNTRUSTED_SOURCE'&&x.reason==='UNAPPROVED_SHARIA'));
});
test('no verified candle/source blocks detection even with attractive features',()=>{
 const p=run({verifiedSource:false});assert.equal(p.detected.length,0);
 assert.equal(p.blockedReason,'STALE_OR_UNVERIFIED_COMPLETED_BAR');
});
test('missing benchmark blocks research detection',()=>{
 const p=run({features:{...features,benchmarkLagMinutes:null}});
 assert.equal(p.detected.length,0);assert.equal(p.blockedReason,'BENCHMARK_NOT_FRESH');
});
test('bad OHLCV bars never produce signals',()=>{
 const p=run({rows:[...rows.slice(0,-1),{...rows.at(-1),high:4,low:5}]});
 assert.equal(p.detected.length,0);assert.equal(p.blockedReason,'NO_VERIFIED_COMPLETED_BARS');
});
test('OHLCV liquidity proxy is never called verified order flow',()=>{
 const p=run();const x=p.detected.find(a=>a.type==='LIQUIDITY_SWEEP_OHLCV_PROXY');
 if(x)assert.equal(x.evidence.dataType,'OHLCV_PROXY_NOT_ORDER_FLOW');
 assert.equal(p.assessments.find(x=>x.type==='ORDER_BOOK_IMBALANCE').status,'UNAVAILABLE_DATA');
});
test('research observational follow-up records a favorable movement without fictional profit',()=>{
 const p=run().detected.slice(0,1);assert(p.length);
 const first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const follow=updateResearchPatternShadows37({day,symbol:'TEST',at:at(601).toISOString(),detected:p,
  previous:first.shadows,bars:[...rows,bar(600,10.99,1000,{high:11.5,low:10.8})]});
 const x=follow.shadows[p[0].type];assert.equal(x.outcome,'FAVORABLE_PROXY_MOVE');assert.equal(x.netUsd,null);
 assert(follow.events.some(x=>x.kind==='RESEARCH_PATTERN_OBSERVED_OUTCOME'));
});
test('simultaneous favorable/adverse outcomes in same bar are ambiguous',()=>{
 const p=run().detected.slice(0,1),first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const t=first.shadows[p[0].type];const x=updateResearchPatternShadows37({day,symbol:'TEST',at:at(601).toISOString(),detected:[],previous:first.shadows,
  bars:[...rows,bar(600,10,1000,{high:t.favorableThreshold+.2,low:t.adverseThreshold-.2})]});
 assert.equal(x.shadows[p[0].type].outcome,'AMBIGUOUS_BOTH_IN_SAME_BAR');assert.equal(x.shadows[p[0].type].netUsd,null);
});
test('repeated observations never double-count a pattern outcome or open a second study same session',()=>{
 const p=run().detected.slice(0,1),first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const extra=bar(600,11.1,1000,{high:12,low:11});
 const second=updateResearchPatternShadows37({day,symbol:'TEST',at:at(601).toISOString(),detected:p,previous:first.shadows,bars:[...rows,extra]});
 const third=updateResearchPatternShadows37({day,symbol:'TEST',at:at(602).toISOString(),detected:p,previous:second.shadows,bars:[...rows,extra]});
 assert(!third.events.some(x=>x.kind==='RESEARCH_PATTERN_OBSERVED_OUTCOME'));
 assert(!third.events.some(x=>x.kind==='RESEARCH_PATTERN_OBSERVATION_STARTED'));
});
test('re-detected pattern after cooldown can start a second observation but is capped',()=>{
 const p=run().detected.slice(0,1),type=p[0].type;
 const first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const end1=updateResearchPatternShadows37({day,symbol:'TEST',at:at(601).toISOString(),detected:[],
  previous:first.shadows,bars:[...rows,bar(600,11.25,1000,{high:11.75,low:11})]});
 assert.equal(end1.shadows[type].status,'OBSERVED_OUTCOME');
 const at610=bar(610,10.65,1000,{high:10.7,low:10.5});
 const second=updateResearchPatternShadows37({day,symbol:'TEST',at:at(611).toISOString(),detected:p,
  previous:end1.shadows,bars:[...rows,at610]});
 assert.equal(second.shadows[type].studyCount,2);
 assert(second.events.some(e=>e.kind==='RESEARCH_PATTERN_OBSERVATION_STARTED'));
 const early=updateResearchPatternShadows37({day,symbol:'TEST',at:at(612).toISOString(),detected:p,
  previous:{...second.shadows,[type]:{...second.shadows[type],status:'OBSERVED_OUTCOME'}},bars:[...rows,at610]});
 assert(!early.events.some(e=>e.kind==='RESEARCH_PATTERN_OBSERVATION_STARTED'));
 const capped=updateResearchPatternShadows37({day,symbol:'TEST',at:at(625).toISOString(),detected:p,
  previous:{...second.shadows,[type]:{...second.shadows[type],status:'OBSERVED_OUTCOME',studyCount:3}},
  bars:[...rows,at610,bar(624,10.8)]});
 assert(!capped.events.some(e=>e.kind==='RESEARCH_PATTERN_OBSERVATION_STARTED'));
});
test('no observation is asserted without data later than original bar',()=>{
 const p=run().detected.slice(0,1),first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const again=updateResearchPatternShadows37({day,symbol:'TEST',at:at(602).toISOString(),detected:[],previous:first.shadows,bars:rows});
 assert.equal(again.shadows[p[0].type].status,'OBSERVING');assert.equal(again.events.length,0);
});
test('a favorable OHLCV shadow observation cannot validate a pattern for paper entry',()=>{
 const assessment=assessResearchPatternReadiness37('MOMENTUM_CONTINUATION',{
  favorableShadowBars:10000,netAfterCostsPositive:true});
 assert.equal(assessment.status,'NOT_VALIDATED_FOR_PAPER_ENTRY');
 assert.equal(assessment.canEnterTrade,false);assert.equal(assessment.autoPromotion,false);
});
test('even independently validated evidence cannot deploy or auto-enable a pattern',()=>{
 const assessment=assessResearchPatternReadiness37('MOMENTUM_CONTINUATION',{
  independentlyReviewedClosedPaperTrades:60,independentExternalAuditPassed:true,
  authenticOutOfSampleReplayPassed:true,feesSpreadAndSlippageValidated:true,
  netAfterCostsPositive:true,riskNotWorse:true,sourceProvenanceVerified:true});
 assert.equal(assessment.status,'ELIGIBLE_FOR_SEPARATE_MANUAL_REVIEW');
 assert.equal(assessment.canEnterTrade,false);assert.equal(assessment.productionApplied,false);
 assert.equal(assessment.manualApprovalAndCodeReviewRequired,true);
});
test('future bars passed directly to observational engine cannot leak outcomes',()=>{
 const p=run().detected.slice(0,1);
 const first=updateResearchPatternShadows37({day,symbol:'TEST',at:at(600).toISOString(),detected:p,bars:rows});
 const t=first.shadows[p[0].type];
 const futureBar=bar(608,t.entryProxyClose+4,1000,{high:t.favorableThreshold+2,low:t.entryProxyClose});
 const premature=updateResearchPatternShadows37({day,symbol:'TEST',at:at(601).toISOString(),detected:[],previous:first.shadows,bars:[...rows,futureBar]});
 assert.equal(premature.shadows[p[0].type].status,'OBSERVING');
 assert(!premature.events.some(x=>x.kind==='RESEARCH_PATTERN_OBSERVED_OUTCOME'));
});
const sbar=(m,p,v=4500)=>({datetime:`${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`,
 open:p-.08,high:p+.06,low:p-.2,close:p,volume:v});
const prices=[];for(let m=570;m<=700;m++){
 let price=100;if(m>=585&&m<690)price=100.06+(m-585)*.005;if(m>=690)price=100.58+(m-690)*.105;
 prices.push(sbar(m,price,m>=695?18000:4500));
}
const samples=m=>prices.filter(x=>+x.datetime.slice(11,13)*60+ +x.datetime.slice(14,16)<=m);
const spy=m=>Array.from({length:m-569},(_,i)=>sbar(570+i,100,10000));
const cycle=(m,existing={})=>independentCycle({dateKey:day,now:at(m),minute:m,universe:['TEST'],batch:['TEST'],
 barMap:{TEST:samples(m),SPY:spy(m)},existing,approved:['TEST']});
test('integrated cycle persistently archives research pattern assessments and provenance',()=>{
 const a=cycle(695),snap=a.audit.snapshots[0];assert(snap.researchPatterns);
 assert.equal(snap.researchPatterns.assessments.length,20);
 assert.equal(a.state.researchPatternCatalog.automaticallyTradeEligible,false);
 assert(a.state.records.TEST.researchPatternCatalogVersion);
 assert.equal(a.audit.researchPatternCatalog.authorizedForPaperEntry,false);
});
test('catalog lifecycle emits new detections once, NOT repeatedly for stable active patterns',()=>{
 const a=cycle(695),b=cycle(695,a.state);
 const newEvents=a.audit.lifecycleEvents.filter(e=>e.kind==='RESEARCH_PATTERN_DETECTED');
 assert(newEvents.length>0,'expected discovery events');
 assert(!b.audit.lifecycleEvents.some(e=>e.kind==='RESEARCH_PATTERN_DETECTED'&&newEvents.some(x=>x.type===e.type)));
 assert(newEvents.every(x=>x.canEnterTrade===false));
});
test('catalog research never bypasses trade entry: missing real quote still blocks paper confirmation',()=>{
 const a=cycle(695),b=cycle(696,a.state);
 assert.notEqual(b.state.records.TEST.state,'AI_PAPER_CONFIRMED');
 assert(!b.audit.lifecycleEvents.some(e=>e.kind==='PAPER_ENTRY_CONFIRMED'));
});
test('no duplicate research observation id after re-evaluation in same minute',()=>{
 const a=cycle(695),b=cycle(695,a.state);
 assert(!b.audit.lifecycleEvents.some(e=>e.kind==='RESEARCH_PATTERN_OBSERVATION_STARTED'));
});
console.log('DT37_MULTIPATTERN_LOCAL_PASS',successes);
