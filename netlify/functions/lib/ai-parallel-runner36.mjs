/** Source-locked independent PAPER AI orchestration, with injectable data for tests.
 * Logs every scanned as-of candidate in immutable-by-minute audit shards. No
 * dependency on 3.6's decisions or its prior shortlist; only shared Sharia master.
 */
import {featureSet,adaptiveAiPolicy,evaluateIndependentAi,updateAiPaperOutcome,buildAiRecommendations} from './ai-parallel36.mjs';
import {completedSessionRows} from './research36.mjs';
import {updateAiExitShadow37} from './ai-paper-exit-shadow37.mjs';
import {classifyMarket37,discoverCandidateSetups37,researchAgentLearningLayer37} from './ai-research-feedback37.mjs';
import {scalpCycle37} from './ai-scalp-paper37.mjs';
const dateBar=b=>String(b?.datetime||'').slice(0,16);
const n=(x)=>Number.isFinite(x)?x:null;
export function independentCycle({dateKey,now,minute,universe=[],batch=[],barMap={},quotes={},existing={},history=[],scannerEvents=[],coverage=null,approved=[],deliveryStats=null,scannerOutcomes=[],sessionEndMinute=959}={}){
 const priorState=existing?.records||{};const allowed=new Set(approved.map(s=>String(s).toUpperCase()));
 const spies=barMap.SPY||[];const scalpActive=Object.values(existing?.scalp37?.records||{}).filter(x=>x?.position?.status==='OPEN'||x?.pending).map(x=>x.symbol);
 const candidates=[...new Set([...batch,...scalpActive,...Object.values(priorState).filter(x=>x.position?.status==='OPEN'||x.state==='SMART'||x.pending).map(x=>x.symbol)])]
  .filter(x=>x!=='SPY');
 const featureMap=Object.fromEntries(candidates.map(s=>[s,featureSet(completedSessionRows(barMap[s],now),completedSessionRows(spies,now))]));
 const features=Object.values(featureMap).filter(Boolean);
 const marketContext37=classifyMarket37(features);
 const researchLearning37=researchAgentLearningLayer37({scannerOutcomes,aiOutcomes:history,asOfDay:dateKey});
 const discovery37=features.flatMap(f=>discoverCandidateSetups37(f,marketContext37).map(idea=>({...idea,barTime:f.barTime})));
 const policy=adaptiveAiPolicy(features,history,minute,Object.values(quotes)),records={...priorState},snapshots=[],transitions=[],closedNew=[];
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
  const previousState=previous?.state||'REGULAR';
  const stateChange=d.state!==previousState;
  const changeReason=d.reason!==previous?.reason;
  const event={symbol,from:previousState,to:d.state,reason:d.reason,at:now.toISOString(),completedBarAt:d.features?.barTime||null,
    checks:d.checks,features:d.features,quote:d.quote,policy:d.policy,confidence:d.confidence,position:d.position,decisionTrace:d.decisionTrace,
    kind:stateChange?'TRANSITION':changeReason?'GATE_UPDATE':'OBSERVATION'};
  if(stateChange||changeReason)transitions.push(event);
  // Every symbol-evaluation gets an append-only per-minute audit record.
  snapshots.push(event);
  reasonCounters[d.reason]=(reasonCounters[d.reason]||0)+1;
  stageCounters[d.state]=(stageCounters[d.state]||0)+1;
  records[symbol]={symbol,state:d.state,reason:d.reason,firstSeenAt:previous?.firstSeenAt||now.toISOString(),lastSeenAt:now.toISOString(),lastBarAt:d.features?.barTime||null,
    pending:d.pending,position:d.position,latestFeatures:d.features,latestQuote:d.quote,latestChecks:d.checks,latestPolicy:d.policy,latestConfidence:d.confidence,
    historyCount:(previous?.historyCount||0)+1,transitionCount:(previous?.transitionCount||0)+(stateChange?1:0)};
 }
 const previouslyClosed=Object.values(records).filter(x=>x.position?.status==='CLOSED').map(x=>x.position);
 const historicalOutcomes=[...history,...previouslyClosed.filter(x=>x.closedAt&&String(x.closedAt)<String(dateKey))];
 // An independent PAPER scalp book shares already-fetched bars and quotes only.
 // The main scanner, AI confirmed positions, research gate and brokerage are unchanged.
 const scalp=scalpCycle37({day:dateKey,now,minute,candidates,barMap,quotes,features:featureMap,
  approved,market:marketContext37,baselinePolicy:policy,previous:existing?.scalp37,sessionEndMinute,
  enabled:process.env.DT37_AI_SCALP_PAPER_ENABLED==='true'});
 const recommendations=buildAiRecommendations({records:Object.values(records),historicalClosed:history,scannerEvents,coverage,reasonCounters,deliveryStats,scannerOutcomes});
 return {state:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,updatedAt:now.toISOString(),records,cursor:existing?.cursor??0,
   cycles:(existing?.cycles||0)+1,cumulativeScanned:[...new Set([...(existing?.cumulativeScanned||[]),...snapshots.filter(x=>x.features).map(x=>x.symbol)])],lastPolicy:policy,marketContext37,researchLearning37,discovery37,scalp37:scalp.state,
   closedOutcomes:previouslyClosed,reasonCounters,stageCounters},audit:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,minute,at:now.toISOString(),
   symbolCount:candidates.length,eligibleUniverseSize:universe.length,parameters:policy,marketContext37,discovery37,snapshots,transitions,closedNew,coverage,
   source:'INDEPENDENT_ALPACA_1MIN_AND_L1',quoteMode:'REAL_AUTHENTIC_ONLY_FOR_AI_CONFIRMED',
   scalp37:{summary:scalp.summary,events:scalp.events,closedNew:scalp.closedNew,policy:scalp.policy}},recommendations,historicalOutcomes};
}
