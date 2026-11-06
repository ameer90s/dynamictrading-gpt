/** Independent evidence-only scalp analyst. No settings writes, no broker calls.
 * It reports uncertainty and hypotheses, not proven causal profitability.
 */
import {scalpStateKey37,SCALP_STANDALONE_SCHEMA} from './scalp-standalone37.mjs';
import {scalpSummary37} from './ai-scalp-paper37.mjs';
export const scalpResearchKey37=day=>`dt37-scalp-agent-review-${day}`;
const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function evaluateScalpEvidence37(state,{day=state?.day}={}){
 if(!state||state.schema!==SCALP_STANDALONE_SCHEMA||state.day!==day||!state.book)
  return {schema:'DT37_SCALP_AGENT_RESEARCH_V1',day,status:'NOT_RECORDED',sourceStored:false,independentlyVerified:false,
   recommendations:[],summary:null,limitations:['NO_DURABLE_STANDALONE_SCALP_STATE']};
 const book=state.book,summary=scalpSummary37(book);
 const unique=new Map((book.closedOutcomes||[]).filter(x=>x?.id).map(x=>[x.id,x]));
 const closed=[...unique.values()],priced=closed.filter(x=>x.status==='CLOSED'&&n(x.netUsd)!==null);
 const bySetup={};for(const x of priced){const type=x.setupType||'UNKNOWN';const agg=bySetup[type]||(bySetup[type]={sample:0,wins:0,netUsd:0,losses:0});agg.sample++;
  agg.netUsd+=x.netUsd;agg.wins+=Number(x.netUsd>0);agg.losses+=Number(x.netUsd<0);}
 for(const v of Object.values(bySetup))v.netUsd=Number(v.netUsd.toFixed(3));
 const recommendations=[];const add=(area,observation,hypothesis,test,acceptanceMetric,evidence)=>recommendations.push({
  area,observation,hypothesis,test,acceptanceMetric,evidence,status:'PROPOSED_UNTESTED',
  automaticApply:false,brokerTradingAllowed:false,independentAuditRequired:true});
 const rejectCounts=Object.entries(state.gateCounts||{}).filter(([k])=>/SCALP_|QUOTE|SPREAD/.test(k)).sort((a,b)=>b[1]-a[1]);
 if(rejectCounts.length&&rejectCounts[0][1]>0)add('SCALP_ENTRY_GATES',
  `${rejectCounts[0][0]} appeared in ${rejectCounts[0][1]} observations, not necessarily unique missed opportunities.`,
  'A frequent gate may reflect delayed bars, execution costs, market regime or a restrictive rule.',
  'Compare rejected symbols against future completed bars with real time-aligned quotes; count unique episodes.',
  'Verified reduction in missed quality setups without worse modeled risk and after-cost outcomes.',
  {kind:'DAILY_GATE_OBSERVATIONS',reason:rejectCounts[0][0],count:rejectCounts[0][1]});
 if(priced.length<30)add('SCALP_SAMPLE_SIZE',
  `${priced.length} uniquely closed, priced paper scalp trades; missing outcomes are not wins.`,
  'Insufficient historical samples to establish net profitability or promote new patterns.',
  'Accumulate deduplicated paper outcomes across independent sessions without changing execution gates.',
  'At least 60 independent closed outcomes per candidate setup plus walk-forward and external QA.',
  {kind:'UNIQUE_PRICED_PAPER_TRADES',count:priced.length});
 for(const [type,rec] of Object.entries(bySetup).filter(([,v])=>v.losses>0).slice(0,3))add('SCALP_RISK_COSTS',
  `${type}: ${rec.losses} losing paper outcomes among ${rec.sample}, modeled net $${rec.netUsd}.`,
  'Entry timing, liquidity/spread, slippage or stop placement may explain the modeled losses.',
  'Compare slippage assumptions, market regimes, MFE/MAE and entry checks using historical sessions.',
  'Positive out-of-sample risk-adjusted net results with comparable quote quality, no higher max loss.',
  {kind:'CLOSED_PAPER_OUTCOMES',type,sample:rec.sample,losses:rec.losses});
 if(summary.open>0)add('SCALP_UNRESOLVED_POSITIONS',
  `${summary.open} paper positions remained open in the saved source; do not assume session-end fills or zero net result.`,
  'A missed scheduled minute or incomplete after-close bars may leave outcomes unresolved.',
  'Trace each open position to its final eligible completed bar or explicitly record UNPRICED without fictitious PnL.',
  'Every opened paper position has a unique, dated closed or explicitly unpriced outcome after session reconciliation.',
  {kind:'OPEN_PAPER_POSITIONS',count:summary.open});
 if(state.errorCount>0)add('SCALP_DATA_GAPS',
  `${state.errorCount} recorded feed errors; these cannot be treated as zero opportunities.`,
  'Missing or stale provider data may suppress scalp opportunities.',
  'Audit per-minute missing bars, quote timestamps and cycle delays independently.',
  'Zero unexplained missing minute shards and measured worst-case scan latency within budget.',
  {kind:'PROVIDER_ERRORS',count:state.errorCount});
 return {schema:'DT37_SCALP_AGENT_RESEARCH_V1',day,status:'LOCAL_EVIDENCE_REVIEW',sourceStored:true,independentlyVerified:false,
  generatedAt:new Date().toISOString(),source:{key:scalpStateKey37(day),lastRun:state.updatedAt,
   cycles:state.cycles,distinctSymbols:state.distinctSymbols?.length||0,errors:state.errorCount||0,
   dailyGateObservations:state.gateCounts||{},patternObservations:state.patternCounts||{},transitionObservations:state.transitionCounts||{}},
  summary:{...summary,bySetup,closedUnique:closed.length,pricedUnique:priced.length},recommendations,
  limitations:['PAPER_EXECUTION_ONLY_NOT_REAL_BROKER_FILL','FEES_SLIPPAGE_ARE_ASSUMED',
   'NO_CAUSAL_IMPROVEMENT_VERIFIED','COUNTS_ARE_REPEATED_MINUTE_OBSERVATIONS','UNPRICED_IS_NOT_ZERO_PNL'],
  appliesToScanner:false,appliesToScalp:false,approvalRequired:true};
}
export async function publishScalpResearch37(store,day){
 const state=await store.get(scalpStateKey37(day),{type:'json',consistency:'strong'});
 const report=evaluateScalpEvidence37(state,{day});
 if(report.status!=='LOCAL_EVIDENCE_REVIEW')return report;
 const previous=await store.get(scalpResearchKey37(day),{type:'json',consistency:'strong'});
 if(previous?.status==='LOCAL_EVIDENCE_REVIEW'&&previous?.source?.lastRun===state.updatedAt)return previous;
 await store.setJSON(scalpResearchKey37(day),report);
 const verified=await store.get(scalpResearchKey37(day),{type:'json',consistency:'strong'});
 if(verified?.source?.lastRun!==state.updatedAt||verified?.status!==report.status)
  throw Error('SCALP_RESEARCH_WRITE_NOT_VERIFIED');
 return verified;
}
