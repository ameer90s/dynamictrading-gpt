/** Source-locked independent PAPER AI orchestration, with injectable data for tests.
 * Logs every scanned as-of candidate in immutable-by-minute audit shards. No
 * dependency on 3.6's decisions or its prior shortlist; only shared Sharia master.
 */
import {featureSet,adaptiveAiPolicy,evaluateIndependentAi,updateAiPaperOutcome,buildAiRecommendations} from './ai-parallel36.mjs';
import {completedSessionRows} from './research36.mjs';
const dateBar=b=>String(b?.datetime||'').slice(0,16);
const n=(x)=>Number.isFinite(x)?x:null;
export function independentCycle({dateKey,now,minute,universe=[],batch=[],barMap={},quotes={},existing={},history=[],scannerEvents=[],coverage=null,approved=[],deliveryStats=null,scannerOutcomes=[],sessionEndMinute=959}={}){
 const priorState=existing?.records||{};const allowed=new Set(approved.map(s=>String(s).toUpperCase()));
 const spies=barMap.SPY||[];const candidates=[...new Set([...batch,...Object.values(priorState).filter(x=>x.position?.status==='OPEN'||x.state==='SMART'||x.pending).map(x=>x.symbol)])]
  .filter(x=>x!=='SPY');
 const features=candidates.map(s=>featureSet(completedSessionRows(barMap[s],now),completedSessionRows(spies,now))).filter(Boolean);
 const policy=adaptiveAiPolicy(features,history,minute,Object.values(quotes)),records={...priorState},snapshots=[],transitions=[],closedNew=[];
 const reasonCounters={...(existing?.reasonCounters||{})},stageCounters={...(existing?.stageCounters||{})};
 for(const symbol of candidates){
  let previous=priorState[symbol]||null;
  // Evaluate outcomes from completed minute candles ONLY; never use current incomplete
  // candle or any later bar to declare a target/stop hit.
  const completedBars=completedSessionRows(barMap[symbol]||[],now);
  let settled=previous?updateAiPaperOutcome(previous,completedBars,now,{forceClose:minute>=sessionEndMinute}):null;
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
 const recommendations=buildAiRecommendations({records:Object.values(records),historicalClosed:history,scannerEvents,coverage,reasonCounters,deliveryStats,scannerOutcomes});
 return {state:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,updatedAt:now.toISOString(),records,cursor:existing?.cursor??0,
   cycles:(existing?.cycles||0)+1,cumulativeScanned:[...new Set([...(existing?.cumulativeScanned||[]),...snapshots.filter(x=>x.features).map(x=>x.symbol)])],lastPolicy:policy,
   closedOutcomes:previouslyClosed,reasonCounters,stageCounters},audit:{schemaVersion:'3.6-AI-PARALLEL-1',dateKey,minute,at:now.toISOString(),
   symbolCount:candidates.length,eligibleUniverseSize:universe.length,parameters:policy,snapshots,transitions,closedNew,coverage,
   source:'INDEPENDENT_ALPACA_1MIN_AND_L1',quoteMode:'REAL_AUTHENTIC_ONLY_FOR_AI_CONFIRMED'},recommendations,historicalOutcomes};
}
