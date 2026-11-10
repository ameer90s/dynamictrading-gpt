/** End-of-session AI PAPER follow-up only: no candidate discovery, pending
 * setup creation, entry evaluation or broker orders. Assesses existing OPEN
 * positions using completed 1-minute candles and preserves prior decisions.
 */
import {completedSessionRows} from './research36.mjs';
import {updateAiPaperOutcome} from './ai-parallel36.mjs';
import {updateAiExitShadow37} from './ai-paper-exit-shadow37.mjs';
import {reviewDecision372} from './ai-decision-review372.mjs';
export const aiOpenSymbols37=state=>[...new Set(Object.values(state?.records||{})
 .filter(r=>r?.position?.status==='OPEN').map(r=>r.symbol).filter(Boolean))];
export function followAiOpenPositions37({state,barMap={},now,minute,closeMinute}){
 const result=structuredClone(state||{}),closedNew=[],snapshots=[];
 const open=aiOpenSymbols37(state);
 for(const symbol of open){
  const prior=state.records[symbol],bars=completedSessionRows(barMap[symbol]||[],now);
  const shadow=process.env.DT37_AI_PAPER_EXIT_SHADOW_ENABLED==='true'
    ?updateAiExitShadow37(prior,bars,{forceClose:minute>=closeMinute}):prior;
  const settled=updateAiPaperOutcome(shadow,bars,now,{forceClose:minute>=closeMinute});
  // This path cannot create a fresh paper trade or a new pending setup.
  result.records[symbol]={...settled,pending:null,state:settled.position?.status==='CLOSED'?'RESULT_RECORDED':'AI_PAPER_CONFIRMED',
    reason:settled.position?.status==='CLOSED'?'FOLLOWUP_PAPER_EXIT_RECORDED':'FOLLOWUP_OPEN_POSITION_ONLY'};
  Object.assign(result.records[symbol],reviewDecision372({symbol,day:state.dateKey,minute,now,
   decision:result.records[symbol],previous:prior,bars}));
  if(settled.position?.status==='CLOSED'){
   if(prior.position?.status==='OPEN')closedNew.push({symbol,...settled.position});
  }
  snapshots.push({symbol,state:result.records[symbol].state,kind:'FOLLOWUP_ONLY',
    reason:result.records[symbol].reason,position:settled.position,
    outcome:settled.position?.outcome||null,netUsd:settled.position?.netUsd??null,
    completedBarAt:bars.at(-1)?.datetime||null});
 }
 result.updatedAt=now.toISOString();result.lastMinuteProcessed=minute;
 result.cycles=(result.cycles||0)+1;
 result.closedOutcomes=[...new Map([...(result.closedOutcomes||[]),...closedNew]
  .filter(x=>x?.id).map(x=>[x.id,x])).values()];
 return {state:result,closedNew,snapshots};
}
