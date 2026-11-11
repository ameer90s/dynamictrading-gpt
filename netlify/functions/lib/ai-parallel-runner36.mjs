/** Source-locked independent PAPER AI orchestration, with injectable data for tests.
 * Logs every scanned as-of candidate in immutable-by-minute audit shards. No
 * dependency on 3.6's decisions or its prior shortlist; only shared Sharia master.
 */
import {learnRegimePatterns38} from './ai-regime-lab38.mjs';
import {buildAiInternalReport372} from './ai-internal-report372.mjs';
import {reviewDecision372} from './ai-decision-review372.mjs';
import {featureSet,adaptiveAiPolicy,evaluateIndependentAi,updateAiPaperOutcome,buildAiRecommendations} from './ai-parallel36.mjs';
import {completedSessionRows} from './research36.mjs';
import {updateAiExitShadow37} from './ai-paper-exit-shadow37.mjs';
import {classifyMarket37,discoverCandidateSetups37,researchAgentLearningLayer37} from './ai-research-feedback37.mjs';
import {updateResearchPatternShadows37,PATTERN_CATALOG_VERSION37} from './ai-pattern-catalog37.mjs';
const dateBar=b=>String(b?.datetime||'').slice(0,16);
const n=(x)=>Number.isFinite(x)?x:null;
export function independentCycle({dateKey,now,minute,universe=[],batch=[],barMap={},quotes={},existing={},history=[],scannerEvents=[],coverage=null,approved=[],deliveryStats=null,scannerOutcomes=[],sessionEndMinute=959}={}){
 const priorState=existing?.records||{};const allowed=new Set(approved.map(s=>String(s).toUpperCase()));
 const spies=barMap.SPY||[];
 const candidates=[...new Set([...batch,...Object.values(priorState).filter(x=>x.position?.status==='OPEN'||x.state==='SMART'||x.pending).map(x=>x.symbol)])]
  .filter(x=>x!=='SPY');
 const featureMap=Object.fromEntries(candidates.map(s=>[s,featureSet(completedSessionRows(barMap[s],now),completedSessionRows(spies,now))]));
 const features=Object.values(featureMap).filter(Boolean);
 const marketContext37=classifyMarket37(features);
 const researchLearning37=researchAgentLearningLayer37({scannerOutcomes,aiOutcomes:history,asOfDay:dateKey});
 const discovery37=features.flatMap(f=>discoverCandidateSetups37(f,marketContext37).map(idea=>({...idea,barTime:f.barTime})));
 const policy=adaptiveAiPolicy(features,history,minute,Object.values(quotes)),records={...priorState},snapshots=[],transitions=[],closedNew=[],lifecycleEvents=[];
 const reasonCounters={...(existing?.reasonCounters||{})},stageCounters={...(existing?.stageCounters||{})};
 for(const symbol of candidates){
  let previous=priorState[symbol]||null;
  // Evaluate outcomes from completed minute candles ONLY; never use current incomplete
  // candle or any later bar to declare a target/stop hit.
  const completedBars=completedSessionRows(barMap[symbol]||[],now);
  // Experimental paper exit: disabled unless explicitly enabled; never changes baseline fills.
  const shadowInput=process.env.DT37_AI_PAPER_EXIT_SHADOW_ENABLED==='true' && previous
    ? updateAiExitShadow37(previous,completedBars,{forceClose:minute>=sessionEndMinute}) : previous;
  let settled=shadowInput?updateAiPaperOutcome(shadowInput,completedBars,now,{forceClose:minute>=sessionEndMinute}):null;
  if(settled?.position?.status==='CLOSED'&&previous?.position?.status==='OPEN')closedNew.push({symbol,...settled.position});
  // Do not reopen the same symbol on the same session; later signals remain audit-only.
  const blockedReentry=settled?.position?.status==='CLOSED';
  let d=evaluateIndependentAi(symbol,barMap[symbol],spies,quotes[symbol],{now,prior:settled,policy,approved:allowed.has(symbol)});
  if(blockedReentry){d={...d,state:'RESULT_RECORDED',reason:'ONE_AI_PAPER_TRADE_PER_SYMBOL_SESSION',position:settled.position,pending:null};}
  if(settled?.position?.status==='OPEN'&&d.position?.status!=='OPEN')d={...d,state:'AI_PAPER_CONFIRMED',position:settled.position,reason:'AI_PAPER_TRADE_ACTIVE'};
  const review=reviewDecision372({symbol,day:dateKey,minute,now,decision:d,previous,bars:completedBars});
  // Research catalog: independent from the five currently allowed AI paper setups.
  // Reuse bars already fetched for this symbol; no extra quote/API request.
  const patternAssessment=d.researchPatterns||{detected:[],assessments:[]};
  const formerResearch= new Map((previous?.activeResearchPatterns||[]).map(x=>[x.type,x]));
  const currentResearch=new Map((patternAssessment.detected||[]).map(x=>[x.type,x]));
  const researchOutcome=updateResearchPatternShadows37({previous:previous?.researchPatternShadows||{},
    detected:(patternAssessment.detected||[]).filter(x=>!formerResearch.has(x.type)),
    bars:completedBars,at:now.toISOString(),day:dateKey,symbol});
  for(const x of researchOutcome.events)lifecycleEvents.push({id:`${dateKey}:${minute}:${symbol}:${x.kind}:${x.type}`,day:dateKey,minute,...x});
  for(const [type,pattern] of currentResearch)if(!formerResearch.has(type))lifecycleEvents.push({
    id:`${dateKey}:${minute}:${symbol}:RESEARCH_PATTERN_DETECTED:${type}`,
    symbol,day:dateKey,minute,kind:'RESEARCH_PATTERN_DETECTED',at:now.toISOString(),type,
    barTime:d.features?.barTime||null,pattern,canEnterTrade:false});
  for(const [type,pattern] of formerResearch)if(!currentResearch.has(type)){
    const unverified=!!patternAssessment.blockedReason;
    const kind=unverified?'RESEARCH_PATTERN_UNVERIFIED_DATA':'RESEARCH_PATTERN_CLEARED';
    lifecycleEvents.push({id:`${dateKey}:${minute}:${symbol}:${kind}:${type}`,
     symbol,day:dateKey,minute,kind,at:now.toISOString(),type,
     lastDetectedBar:pattern?.barTime||pattern?.evidence?.barTime||null,
     reason:patternAssessment.blockedReason||
       patternAssessment.assessments?.find(x=>x.type===type)?.reason||'NO_LONGER_DETECTED'});
  }
  const previousState=previous?.state||'REGULAR';
   const eventBase={symbol,day:dateKey,minute,at:now.toISOString(),completedBarAt:d.features?.barTime||null};
   const eventLog=(kind,details)=>lifecycleEvents.push({id:`${dateKey}:${minute}:${symbol}:${kind}`,...eventBase,kind,...details});
   // A pending setup can expire and be replaced by a new setup IN ONE cycle.
   // Compare stable signal identities, not just presence, or both transitions disappear.
   const pendingKey=x=>x?`${x.day}:${x.signalMinute}:${x.type}:${x.signalBarTime||''}`:null;
   const pendingChanged=pendingKey(previous?.pending)!==pendingKey(d.pending);
   if(pendingChanged&&previous?.pending&&!d.position?.id)eventLog('PENDING_EXPIRED_OR_CANCELLED',{
      signal:previous.pending,reason:d.reason,failedChecks:d.decisionTrace?.allFailedChecks||[]});
   if(pendingChanged&&d.pending)eventLog('SETUP_PENDING_CREATED',{
      setupType:d.pending.type,signal:d.pending,features:d.features,checks:d.checks,
      reason:d.reason,policy:d.policy});
   if(!previous?.position?.id&&d.position?.status==='OPEN')eventLog('PAPER_ENTRY_CONFIRMED',{
      position:d.position,entryEvidence:d.position.entryEvidence,
      signalId:d.position.id,setupType:d.position.setupType});
   if(previous?.position?.status==='OPEN'&&d.position?.status==='CLOSED')eventLog('PAPER_EXIT_RECORDED',{
      signalId:d.position.id,setupType:d.position.setupType,exitEvidence:d.position.exitEvidence,
      position:d.position,netUsd:d.position.netUsd,outcome:d.position.outcome});
   if(previous?.state!==d.state)eventLog('STATE_TRANSITION',{
      from:previousState,to:d.state,reason:d.reason,setupType:d.setupType,
      failedChecks:d.decisionTrace?.allFailedChecks||[],pending:d.pending||null,
      positionId:d.position?.id||null});
   if(previous&&previous.reason!==d.reason)eventLog('GATE_CHANGE',{
      fromReason:previous.reason||null,toReason:d.reason,
      failedChecks:d.decisionTrace?.allFailedChecks||[]});
  const stateChange=d.state!==previousState;
  const changeReason=d.reason!==previous?.reason;
  const event={symbol,from:previousState,to:d.state,reason:d.reason,at:now.toISOString(),completedBarAt:d.features?.barTime||null,
    checks:d.checks,features:d.features,quote:d.quote,policy:d.policy,confidence:d.confidence,position:d.position,decisionTrace:d.decisionTrace,
    paperStrategyRanking:d.paperStrategyRanking,comparedPlans:d.tradeEvaluation?.alternatives||[],...review,
    kind:stateChange?'TRANSITION':changeReason?'GATE_UPDATE':'OBSERVATION',
     setupDiscovery:d.setupDiscovery,tradeEvaluation:d.tradeEvaluation,
     // Compact per-minute audit: pattern evidence is archived in full upon each
     // DETECTED transition, rather than re-serializing it on every observation.
     researchPatterns:{version:patternAssessment.version||null,barTime:patternAssessment.barTime||null,
      assessed:patternAssessment.evaluated||0,
      detected:(patternAssessment.detected||[]).map(x=>({type:x.type,researchScore:x.researchScore,barTime:x.evidence?.barTime||null})),
      assessments:(patternAssessment.assessments||[]).map(x=>({type:x.type,status:x.status,reason:x.reason})),
      blockedReason:patternAssessment.blockedReason||null},
     researchShadowStatus:Object.values(researchOutcome.shadows).map(x=>({type:x.type,status:x.status,
      outcome:x.outcome,observationId:x.id}))};
  if(stateChange||changeReason)transitions.push(event);
  // Every symbol-evaluation gets an append-only per-minute audit record.
  snapshots.push(event);
  reasonCounters[d.reason]=(reasonCounters[d.reason]||0)+1;
  stageCounters[d.state]=(stageCounters[d.state]||0)+1;
  records[symbol]={symbol,state:d.state,reason:d.reason,firstSeenAt:previous?.firstSeenAt||now.toISOString(),lastSeenAt:now.toISOString(),lastBarAt:d.features?.barTime||null,
    ...review,
    pending:d.pending,position:d.position,latestFeatures:d.features,latestQuote:d.quote,latestChecks:d.checks,latestPolicy:d.policy,latestConfidence:d.confidence,
    historyCount:(previous?.historyCount||0)+1,transitionCount:(previous?.transitionCount||0)+(stateChange?1:0),
    researchPatternShadows:researchOutcome.shadows,
    activeResearchPatterns:(patternAssessment.detected||[]).map(x=>({type:x.type,
     barTime:x.evidence?.barTime||null,researchScore:x.researchScore})),
    researchPatternCatalogVersion:PATTERN_CATALOG_VERSION37};
 }
 const previouslyClosed=Object.values(records).filter(x=>x.position?.status==='CLOSED').map(x=>x.position);
 const historicalOutcomes=[...history,...previouslyClosed.filter(x=>x.closedAt&&String(x.closedAt)<String(dateKey))];
 const regimeLab38=learnRegimePatterns38({closedPositions:history,asOfDay:dateKey,regime:marketContext37.regime});
 const researchOutcomeCounters={...(existing?.researchOutcomeCounters||{})};
 for(const e of lifecycleEvents)if(e.kind==='RESEARCH_PATTERN_OBSERVED_OUTCOME'){
  const key=`${e.type}:${e.outcome}`;
  researchOutcomeCounters[key]=(researchOutcomeCounters[key]||0)+1;
 }
 const recommendations=buildAiRecommendations({records:Object.values(records),historicalClosed:history,scannerEvents,coverage,reasonCounters,deliveryStats,scannerOutcomes});
 recommendations.internalReport=buildAiInternalReport372({day:dateKey,now,records:Object.values(records),history,coverage,reasons:reasonCounters,recommendations,events:lifecycleEvents});
 return {state:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,updatedAt:now.toISOString(),records,cursor:existing?.cursor??0,
   retiredArchive372:existing?.retiredArchive372||null,
   cycles:(existing?.cycles||0)+1,cumulativeScanned:[...new Set([...(existing?.cumulativeScanned||[]),...snapshots.filter(x=>x.features).map(x=>x.symbol)])],lastPolicy:policy,marketContext37,researchLearning37,regimeLab38,discovery37,
   closedOutcomes:previouslyClosed,reasonCounters,stageCounters,
    researchPatternCatalog:{version:PATTERN_CATALOG_VERSION37,automaticallyTradeEligible:false,noAdditionalMarketDataRequests:true},
    researchOutcomeCounters,
    recentLifecycleEvents:[...(existing?.recentLifecycleEvents||[]),...lifecycleEvents].slice(-120),
    lifecycleEventCount:(existing?.lifecycleEventCount||0)+lifecycleEvents.length},audit:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,minute,at:now.toISOString(),
   symbolCount:candidates.length,eligibleUniverseSize:universe.length,parameters:policy,marketContext37,regimeLab38,discovery37,snapshots,transitions,closedNew,lifecycleEvents,coverage,
   researchPatternCatalog:{version:PATTERN_CATALOG_VERSION37,researchOnly:true,authorizedForPaperEntry:false},
   source:'INDEPENDENT_ALPACA_1MIN_AND_L1',quoteMode:'REAL_AUTHENTIC_ONLY_FOR_AI_CONFIRMED',
  },recommendations,historicalOutcomes};
}
