/** One bounded, post-close learner; all writes are new research artifacts only.
 * Uses the existing 14 hourly shards, plus at most 3 prior paper histories per engine
 * and 3 prior learning digests. No network or OpenAI request here.
 */
import {randomUUID} from 'node:crypto';
import {researchExpectedMinutes37} from './daily-research-diagnostic37.mjs';
import {pairedDailyResearch,ledgerKey,researchHours,combineLedgerShards} from './research-ledger37.mjs';
import {generateStrategyLearningCycle37} from './research-strategy-cycle37.mjs';
import {HISTORY_INDEX_KEY} from './version.mjs';
import {annotateDailyProposals37,consolidateResearchPeriod37,dueResearchPeriods37,
 researchMemoryKey37,researchWeeklyKey37,researchMonthlyKey37,
 memoryFromPeriod37,summarizePeriodTrades37} from './research-memory-cadence37.mjs';
const read=(store,k)=>store.get(k,{type:'json',consistency:'strong'});
export const strategyLearningKey37=day=>`dt37-research-strategy-learning-${day}`;
function safeDays(index,day,source){
 const raw=source==='scanner'?(index?.sessions||[]).map(x=>x.dateKey):(index?.days||[]);
 return [...new Set(raw.filter(x=>/^20\d{2}-\d\d-\d\d$/.test(x||'')&&x<day))].sort().reverse().slice(0,3);
}
async function optionalRead(st,key,issues){try{return await read(st,key)}catch(e){issues.push({key:key.replace(/\d{4}-\d\d-\d\d/,'<day>'),reason:'ARCHIVE_READ_FAILED'});return null}}
export async function loadResearchLearningContext37({store,day,aiState=null,scannerHistory=null,audit=null}={}){
 if(!store||!/^20\d{2}-\d\d-\d\d$/.test(day||''))throw Error('LEARNING_CONTEXT_INVALID');
 const issues=[];
 if(!audit){const [scParts,aiParts]=await Promise.all(['scanner','ai'].map(kind=>
  Promise.all(researchHours.map(hour=>read(store,ledgerKey(kind,day,hour*60))))));
  const sc=combineLedgerShards('scanner',day,scParts),ai=combineLedgerShards('ai',day,aiParts);
  if(!sc||!ai)return {status:'MISSING_RESEARCH_LEDGERS',day};
  audit=pairedDailyResearch(sc,ai);
 }
 const [state,scanner,aiIndex,scannerIndex,memory]=await Promise.all([
  aiState||read(store,`ai-parallel-state-${day}`),scannerHistory||read(store,`signal-history-${day}`),
  optionalRead(store,'ai-parallel-session-index',issues),optionalRead(store,HISTORY_INDEX_KEY,issues),
  read(store,researchMemoryKey37)]);
 if(memory!=null&&memory.schemaVersion!=='3.7-PROPOSAL-MEMORY-1')
  return {status:'INVALID_LONG_TERM_MEMORY_FAIL_CLOSED',day};
 // No source => evidence is incomplete; don't fabricate zero-error performance.
 if(!state?.updatedAt||state.publication372||!scanner?.signals)return {status:'MISSING_SESSION_STATES',day};
 const aiDays=safeDays(aiIndex,day,'ai'),scDays=safeDays(scannerIndex,day,'scanner');
 const [pastAiStates,pastScannerHistories,previousCycles]=await Promise.all([
  Promise.all(aiDays.map(d=>optionalRead(store,`ai-parallel-state-${d}`,issues))),
  Promise.all(scDays.map(d=>optionalRead(store,`signal-history-${d}`,issues))),
  Promise.all([...new Set([...aiDays,...scDays])].sort().reverse().slice(0,3).map(d=>optionalRead(store,strategyLearningKey37(d),issues)))
 ]);
 return {status:'READY',day,audit,aiState:state,scannerHistory:scanner,
  pastAiStates:pastAiStates.filter(Boolean),pastScannerHistories:pastScannerHistories.filter(Boolean),
  previousCycles:previousCycles.filter(Boolean),memory:memory||null,issues,
  historicalCoverage:{aiDays,scannerDays:scDays,aiStatesFound:pastAiStates.filter(Boolean).length,
   scannerStatesFound:pastScannerHistories.filter(Boolean).length}};
}
export async function persistResearchLearning37({store,context,review=null,now=new Date(),env=process.env}={}){
 if(!context||context.status!=='READY')return {status:context?.status||'MISSING_CONTEXT',day:context?.day};
 const {day,audit,aiState,scannerHistory,pastAiStates,pastScannerHistories,previousCycles,memory,issues,historicalCoverage}=context;
 const key=strategyLearningKey37(day),existing=await read(store,key);
 if(existing&&(existing.day!==day||existing.schemaVersion!=='3.7-RESEARCH-STRATEGY-CYCLE-1'))
  return {status:'EXISTING_LEARNING_CORRUPTED_FAIL_CLOSED',day};
 if(existing?.sourceDigest&&existing.sourceDigest!==audit.sourceDigest)
  return {status:'SOURCE_DIGEST_CHANGED_REQUIRES_REVIEW',day};
 if(review&&(review.day!==day||review.status!=='REVIEW_CREATED_NOT_APPLIED'))
  return {status:'OPENAI_REVIEW_DAY_OR_STATUS_MISMATCH',day};
 // Once a checked LLM review has been incorporated, late local-only retries cannot replace it.
 if(existing?.openai?.included&&review==null)return {status:'ALREADY_LEARNED',day,cycle:existing};
 const cycle=annotateDailyProposals37(generateStrategyLearningCycle37({day,audit,aiState,scannerHistory,pastAiStates,pastScannerHistories,
  previousCycles,openaiReview:review,now:now.toISOString(),
  expectedMinutes:researchExpectedMinutes37(env,day)}),memory);
 cycle.historyReadIssues=issues;cycle.historicalCoverage=historicalCoverage;
 cycle.sourceTrust=issues?.length?'DEGRADED_HISTORICAL_READS':'RECORDED_EVIDENCE_WITH_LIMITATIONS';
 if(existing?.digest===cycle.digest&&existing?.openai?.included===cycle.openai.included)
  return {status:'ALREADY_LEARNED',day,cycle:existing};
 // Daily idempotency for first writer, second successful OpenAI review updates a local-only artifact.
 const claimId=randomUUID();cycle.writeClaimId=claimId;
 const result=await store.setJSON(key,cycle,existing?{}:{onlyIfNew:true});
 if(result?.modified!==true){const winner=await read(store,key);if(winner?.digest===cycle.digest)
  return {status:'ALREADY_LEARNED',day,cycle:winner};
  return {status:'CLAIM_NOT_VERIFIED',day};}
 const checked=await read(store,key);
 if(checked?.writeClaimId!==claimId||checked?.digest!==cycle.digest)
  return {status:'CLAIM_NOT_VERIFIED',day};
 return {status:cycle.openai.included?'LEARNED_WITH_OPENAI_REVIEW':'LEARNED_FROM_ARCHIVES_ONLY',day,cycle:checked};
}
export async function runLocalStrategyLearning37({store,day,now=new Date(),env=process.env}={}){
 const context=await loadResearchLearningContext37({store,day});
 if(context.status!=='READY')return {status:context.status,day};
 const result=await persistResearchLearning37({store,context,now,env});
 return {status:result.status,day,proposals:result.cycle?.proposals?.length||0,
  historicalCoverage:context.historicalCoverage,sourceTrust:result.cycle?.sourceTrust||'UNVERIFIED',
  mode:'OFFLINE_RESEARCH_NO_PAID_API'};
}
/** No new scheduled functions. This runs only after the existing daily run,
 * and only for calendar boundary periods. Each day is an immutable source;
 * reports are research artifacts (never trading parameter writes). */
export async function finalizeDueResearchPeriods37({store,day,now=new Date()}={}){
 if(!store||!/^20\d{2}-\d\d-\d\d$/.test(day||''))return {status:'INVALID_PERIOD_CONTEXT'};
 const periods=dueResearchPeriods37(day),out=[],reports=[];
 if(!periods.length)return {status:'NO_PERIOD_DUE',reports:[]};
 // Scheduled call is normally after 16:00 New York. Block accidental early
 // invocation from freezing unfinished weekly/monthly research.
 const hm=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now);
 if(Number(hm)<16)return {status:'BEFORE_NY_CLOSE_NO_CONSOLIDATION',reports:[]};
 let memory=await read(store,researchMemoryKey37);
 if(memory&&memory.schemaVersion!=='3.7-PROPOSAL-MEMORY-1')return {status:'INVALID_LONG_TERM_MEMORY_FAIL_CLOSED',reports:[]};
 for(const period of periods){
  const key=period.kind==='WEEKLY'?researchWeeklyKey37(period.end):researchMonthlyKey37(period.end);
  const previous=await read(store,key);
  if(previous){
   if(previous.kind!==period.kind||previous.start!==period.start||previous.end!==period.end||!previous.digest){
    out.push({kind:period.kind,end:period.end,status:'PREVIOUS_REPORT_INVALID_FAIL_CLOSED'});continue;
   }
   reports.push(previous);
   out.push({kind:period.kind,end:period.end,status:'ALREADY_CONSOLIDATED'});continue}
  const dates=[];
  for(let d=period.start;d<=period.end;){const weekday=new Date(`${d}T12:00:00Z`).getUTCDay();if(weekday!==0&&weekday!==6)dates.push(d);
   const t=new Date(`${d}T12:00:00Z`);t.setUTCDate(t.getUTCDate()+1);d=t.toISOString().slice(0,10);
   if(dates.length>24)break;
  }
  // Bound provider operations: reads occur only at week/month boundaries.
  const cycles=(await Promise.all(dates.map(x=>read(store,strategyLearningKey37(x))))).filter(Boolean);
  if(!cycles.length){out.push({kind:period.kind,end:period.end,status:'NO_CYCLES_YET'});continue}
  // Do not freeze an immutable weekly/monthly report from an insufficient
  // number of complete source days: a later run can retry after archive recovery.
  const full=cycles.filter(c=>c?.recordedEvidenceComplete===true&&!(c.historyReadIssues||[]).length);
  const minimum=period.kind==='WEEKLY'?3:12;
  if(full.length<minimum){out.push({kind:period.kind,end:period.end,status:'WAITING_FOR_COMPLETE_ARCHIVES',
    completeDays:full.length,minimum});continue;}
  const states=(await Promise.all(dates.map(x=>read(store,`ai-parallel-state-${x}`)))).filter(Boolean);
  const outcomes=summarizePeriodTrades37({period,states});
  // Decommissioned independent scalp is not part of active period research.
  const report=consolidateResearchPeriod37({period,cycles,memory,outcomes,now:now.toISOString()});
  const result=await store.setJSON(key,report,{onlyIfNew:true});
  const actual=await read(store,key);
  if(actual?.kind!==period.kind||actual?.start!==period.start||actual?.end!==period.end||
    actual?.digest!==report.digest||(result?.modified!==true&&result?.modified!==false)){
    out.push({kind:period.kind,end:period.end,status:'FINAL_REPORT_NOT_VERIFIED'});continue;
  }
  reports.push(actual);
  out.push({kind:period.kind,end:period.end,status:result.modified?'CONSOLIDATED':'ALREADY_CONSOLIDATED',
   sample:actual.sessionsWithFullEvidence,distinctPaperTrades:actual.distinctPaperOutcomes.uniqueClosed,
   candidates:actual.candidateCount,ready:actual.sufficientSessionSample,
   monthlyStatisticalLearningReady:actual.statisticsReadyForMonthlyLearning});
 }
 // Period documents are immutable, canonical history. This bounded snapshot
 // avoids rescanning years of Blob records on every daily report. On a crash,
 // an existing period is resynchronized on the next eligible run.
 let unsynced=0;
 for(const r of reports){
  if(memory?.syncedPeriodIds?.includes(`${r.kind}:${r.end}`))continue;
  memory=memoryFromPeriod37(r,memory);unsynced++;
 }
 if(unsynced){
  const claim=randomUUID(),candidate={...memory,lastSyncClaim:claim,syncedAt:now.toISOString()};
  const result=await store.setJSON(researchMemoryKey37,candidate,memory?.schemaVersion?{}:{onlyIfNew:true});
  const actual=await read(store,researchMemoryKey37);
  if(result?.modified!==true||actual?.lastSyncClaim!==claim){
   return {status:'MEMORY_SYNC_UNVERIFIED_FAIL_CLOSED',reports:out};
  }
 }
 return {status:'PERIODIC_RESEARCH_COMPLETED',reports:out};
}
