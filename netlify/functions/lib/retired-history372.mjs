/** Read-only historical compatibility. Not imported by any active scanner or Research job. */
import {summarizePeriodTrades37} from './research-memory-cadence37.mjs';
import {marketTimestamp372} from './market-time372.mjs';
const integer=x=>Number.isInteger(x)&&x>=0?x:0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*1000)/1000;
const id=x=>String(x??'').replace(/[^A-Za-z0-9_:\-.]/g,'').slice(0,90);
const closedAsOf=(v,day,at)=>{const t=marketTimestamp372(v),end=marketTimestamp372(at);return t!==null&&end!==null&&v.slice(0,10)<=day&&t<=end;};
/** The independent scalp paper book is never silently mixed into baseline AI wins. */
export function retiredBookHistory372(states=[],day,now,standaloneStates=[]){
 // Standalone per-day books are authoritative; an embedded legacy scalp book
 // can fill gaps for older dates, but must never double-count the same day.
 const standaloneByDay=new Map(standaloneStates.filter(x=>x?.day&&x?.book).map(x=>[x.day,x]));
 const normalized=[...standaloneByDay.values()].map(x=>({dateKey:x.day,scalp37:{
  schemaVersion:'3.7-SCALP-PAPER-1',closedOutcomes:x.book.closedOutcomes||[],
  entryRejections:x.gateCounts||{}}}));
 const legacy=states.filter(x=>!standaloneByDay.has(x?.dateKey||x?.day));
 states=[...normalized,...legacy];
 // Preserve the daily counter even when older books are later in the collection.
 const today=states.find(x=>(x.dateKey||x.day)===day)||states[0];
 const seen=new Set(),closed=[];
 const rejects={};
 for(const state of states){
  const book=state?.scalp37;
  if(!book||book.schemaVersion!=='3.7-SCALP-PAPER-1')continue;
  for(const p of book.closedOutcomes||[]){
   if(!p?.id||seen.has(p.id)||!closedAsOf(p.closedAt,day,now))continue;
   seen.add(p.id);
   if(p.status!=='CLOSED')continue; // UNPRICED is not a win or a loss
   closed.push({id:id(p.id),setupType:id(p.setupType),netUsd:finite(p.netUsd)?p.netUsd:null,
    strategyVariantId:id(p.strategyVariantId),outcome:id(p.outcome)});
  }
  // Report today's concrete scalp rejection reasons without summing rolling snapshots.
  if(state===today)for(const [reason,n] of Object.entries(book.entryRejections||{})){
   if(integer(n)>0)rejects[id(reason)]=n;
  }
 }
 const priced=closed.filter(x=>x.netUsd!==null),types=[...new Set(closed.map(x=>x.setupType))];
 return {status:states.some(x=>x?.scalp37?.schemaVersion==='3.7-SCALP-PAPER-1')?'RECORDED_PAPER_ONLY':'NOT_RECORDED',
  uniqueClosed:closed.length,withModeledNet:priced.length,netModeledUsd:round(priced.reduce((v,x)=>v+x.netUsd,0)),
  wins:priced.filter(x=>x.netUsd>0).length,losses:priced.filter(x=>x.netUsd<0).length,
  unpriced:closed.length-priced.length,rejectionsToday:rejects,
  bySetup:Object.fromEntries(types.map(t=>[t,{sample:priced.filter(x=>x.setupType===t).length,
   netModeledUsd:round(priced.filter(x=>x.setupType===t).reduce((v,x)=>v+x.netUsd,0)),
   readyForDescriptiveStudy:priced.filter(x=>x.setupType===t).length>=60}])),
  distinctTradeDeduplication:true,actualBrokerFillsVerified:false,causalImprovementVerified:false};
}
/** Scalp is reported SEPARATELY from the primary AI's EARLY/RETEST results.
 * Only final per-day state snapshots count. Never sum rolling daily reports. */
export function summarizeRetiredPeriod372({period,states=[],standaloneStates=[]}={}){
 // Standalone state is authoritative. Use old embedded scalp ONLY for days without it.
 const byDay=new Map(standaloneStates.filter(s=>s?.day&&s?.book).map(s=>[s.day,s]));
 const scalpStates=[...byDay.values()].map(s=>({records:s.book.records||{},closedOutcomes:s.book.closedOutcomes||[]}));
 for(const state of states){const day=state?.dateKey||state?.day;
  if(day&&byDay.has(day))continue;
  if(state?.scalp37?.schemaVersion==='3.7-SCALP-PAPER-1')scalpStates.push({records:state.scalp37.records||{},closedOutcomes:state.scalp37.closedOutcomes||[]});
 }
 const summary=summarizePeriodTrades37({period,states:scalpStates});
 return {...summary,book:'INDEPENDENT_SCALP_PAPER37',
  standaloneDays:byDay.size,sourceMode:byDay.size?'STANDALONE_SCALP_AUTHORITATIVE':'LEGACY_ONLY_OR_NOT_RECORDED',
  status:scalpStates.length?'RECORDED_SCALP_PAPER_ONLY':'NOT_RECORDED',
  actualBrokerFillsVerified:false,independentWalkForwardVerified:false,
  limitations:[...summary.limitations,'Scalp profits are modeled on bars and adverse-slippage assumptions, not an executable quote at exit']};
}
