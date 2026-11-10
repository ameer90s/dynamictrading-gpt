import {completedSessionRows} from './research36.mjs';
import {marketTimestamp372} from './market-time372.mjs';
const pct=(a,b)=>b>0?(a/b-1)*100:null;
/** Recorded facts and explicitly hypothetical as-of alternatives, on bars already
 * fetched by the scanner. No provider call, new entry, model or extra Blob write.
 */
export function reviewDecision372({symbol,day,minute,now,decision,previous,bars=[]}){
 const completed=bars.filter(b=>b.datetime?.slice(0,10)===day&&marketTimestamp372(b.datetime)!==null&&
  marketTimestamp372(b.datetime)+60000<=now.getTime()).sort((a,b)=>a.datetime.localeCompare(b.datetime)),position=decision.position;
 const archiveKey=`ai-parallel-audit-${day}-${String(minute).padStart(4,'0')}`;
 const evidenceId=`ai:${day}:${String(minute).padStart(4,'0')}:${symbol}`;
 const facts=[{classification:'FACT',metric:'decision',value:decision.state,evidenceId,archiveKey},
  ...(decision.decisionTrace?.allFailedChecks||[]).map(x=>({classification:'FACT',metric:x.gate,
   observed:x.observed,threshold:x.threshold,reason:x.reason,evidenceId,archiveKey}))];
 const active=[...(previous?.rejectionStudies372||
  (previous?.rejectionStudy372?[previous.rejectionStudy372]:[]))];
 const matured=[],pendingCases=[];
 for(let rejection of active){
  const start=marketTimestamp372(rejection.barTime),until=start+20*60000;
  const later=completed.filter(b=>b.datetime>rejection.barTime&&marketTimestamp372(b.datetime)<=until);
  if(later.length){
   const last=later.at(-1);
   rejection={...rejection,observedThrough:last.datetime,
    mfePct:pct(Math.max(...later.map(b=>b.high)),rejection.referencePrice),
    maePct:pct(Math.min(...later.map(b=>b.low)),rejection.referencePrice),
    subsequentReturnPct:pct(last.close,rejection.referencePrice),
    status:'LATER_COMPLETED_PRICE_PATH_OBSERVED',executableMissedProfit:'NOT_VERIFIED_NO_BROKER_FILL'};
  }
  if(completed.some(b=>marketTimestamp372(b.datetime)>=until))matured.push({...rejection,
   horizonMinutes:20,observedBars:later.length,windowComplete:later.length===20});
  else pendingCases.push(rejection);
 }
 const signalId=decision.pending?`${symbol}:${day}:${decision.pending.signalMinute}:${decision.pending.type}`:
  decision.tradeEvaluation?`${symbol}:${day}:${decision.features?.barTime}`:null;
 // Observe every distinct rejected setup. Mature cases move into this minute's
 // immutable audit with cumulative counts, bounding the rolling state without
 // discarding evidence or issuing extra historical-data/provider requests.
 if(signalId!==null&&!position&&decision.features?.price>0&&signalId!==previous?.lastRejectedSignal372){
  pendingCases.push({id:evidenceId,signalId,archiveKey,barTime:decision.features.barTime,reason:decision.reason,
   referencePrice:decision.features.price,status:'WAITING_FOR_LATER_COMPLETED_BARS',
   interpretation:'OBSERVED_CLOSE_REFERENCE_NOT_EXECUTABLE_ENTRY',executableMissedProfit:'NOT_VERIFIED'});
 }
 const rejection=pendingCases.at(-1)||matured.at(-1)||null;
 const compared=position?.entryEvidence?.tradeEvaluation?.alternatives||decision.tradeEvaluation?.alternatives||[];
 const after=position?completed.filter(b=>b.datetime>position.openedBarTime):[];
 const counterfactuals=compared.map(plan=>{
  let outcome='UNRESOLVED',exit=null,at=null;
  for(const b of after){
   const stop=b.low<=plan.stop,target=b.high>=plan.target;
   if(stop||target){outcome=stop&&target?'AMBIGUOUS_SAME_BAR':stop?'STOP':'TARGET';exit=stop&&target?null:stop?plan.stop:plan.target;at=b.datetime;break;}
  }
  return {id:plan.id,classification:'ASSUMPTION',kind:'ASOF_RECORDED_PLAN_OHLC_TOUCH_COUNTERFACTUAL',
   selected:plan.selected,entry:plan.entry,stop:plan.stop,target:plan.target,qty:plan.qty,
   entryEvidence:position?.id||evidenceId,archiveKey,outcome,observedAt:at,
   netModeledUsd:exit!==null&&plan.economics?.valid?(exit-plan.entry)*plan.qty-plan.economics.totalCostUsd:null,
   noActualFill:true,originallyExecutable:plan.checks?.every(c=>c.passed)===true};
 });
 if(position){
  facts.push(...['entry','stop','target','netUsd','mfePct','maePct'].filter(k=>Number.isFinite(position[k]))
   .map(k=>({classification:'FACT',metric:k,value:position[k],positionId:position.id,evidenceId,archiveKey})));
  facts.push({classification:'FACT',metric:'modeledEntryEconomics',value:position.costModel||null,evidenceId,archiveKey});
 }
 const hypotheses=[];
 if(position?.status==='CLOSED'&&position.netUsd<0)hypotheses.push({classification:'ASSUMPTION',
  area:'ENTRY_STOP_TARGET_AND_MOMENTUM',hypothesis:'Compare recorded alternative entry timing, structural stop, target and later completed momentum; loss alone is not proof of error.',
  evidenceIds:[evidenceId,position.id],test:'Compare the recorded as-of alternatives on held-out sessions after spread, slippage and fees.'});
 for(const observed of [...matured,...pendingCases].filter(x=>x.mfePct>0))hypotheses.push({classification:'ASSUMPTION',area:'REJECTED_PRICE_FOLLOWTHROUGH',
  hypothesis:'The observed later rise warrants examining the failed gates; it does not prove an executable missed trade.',
  evidenceIds:[observed.id,evidenceId],test:'Replay authentic quotes and all failed safety gates; never infer entry or P/L from OHLC alone.'});
 const priorTotals=previous?.rejectionTotals372||{observedSetups:0,positivePriceMfe:0,incompleteWindows:0};
 return {rejectionStudy372:rejection,rejectionStudies372:pendingCases,completedRejectionStudies372:matured,
  lastRejectedSignal372:signalId||previous?.lastRejectedSignal372||null,
  rejectionTotals372:{observedSetups:priorTotals.observedSetups+matured.length,
   positivePriceMfe:priorTotals.positivePriceMfe+matured.filter(x=>x.mfePct>0).length,
   incompleteWindows:priorTotals.incompleteWindows+matured.filter(x=>!x.windowComplete).length},
  decisionReview372:{schema:'DT372-DECISION-REVIEW-1',evidenceId,archiveKey,
  at:now.toISOString(),facts,hypotheses,counterfactuals,
  confidence:{kind:'EVIDENCE_COVERAGE_NOT_WIN_PROBABILITY',recordedFacts:facts.length,
   originalPlans:compared.length,resolvedCounterfactuals:counterfactuals.filter(x=>x.outcome!=='UNRESOLVED').length},
  causalConclusion:{classification:'UNVERIFIED',reason:'OBSERVATIONAL_PAPER_DATA_DOES_NOT_ESTABLISH_CAUSALITY'},
  samplePolicy:'EVERY_DISTINCT_REJECTED_SETUP_20_MINUTE_COMPLETED_BAR_WINDOW_MATURE_CASES_IN_MINUTE_AUDIT',
  autoApply:false}};
}
