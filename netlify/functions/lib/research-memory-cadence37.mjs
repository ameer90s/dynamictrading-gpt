import {attachExperimentEvidence37} from './research-experiment-engine37.mjs';
/**
 * Research Agent 3.7: long-horizon, evidence-gated proposal memory.
 * Daily = observations only; Friday/roll-forward = weekly consolidation;
 * month end/roll-forward = monthly learning gate. NEVER touches scanners.
 * Local deterministic logic, no provider calls and no implicit approvals.
 */
import {createHash} from 'node:crypto';
const h=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(`${x}T12:00:00Z`))&&new Date(`${x}T12:00:00Z`).toISOString().slice(0,10)===x;
const utc=x=>new Date(`${x}T12:00:00Z`);
const plus=(d,n)=>{const t=utc(d);t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const wkday=d=>utc(d).getUTCDay();
const range=(start,end)=>{const days=[];for(let d=start;d<=end&&days.length<33;d=plus(d,1))days.push(d);return days;};
const safeInteger=n=>Number.isInteger(n)&&n>=0?n:0;
const verdicts=new Set(['REJECTED_BY_OWNER','INDEPENDENT_TEST_FAILED','HARMFUL_OBSERVED','ROLLED_BACK','APPROVED_FOR_PAPER','APPROVED_FOR_PRODUCTION','TEST_INCONCLUSIVE','TEST_PASSED']);
const suppressed=new Set(['REJECTED_BY_OWNER','INDEPENDENT_TEST_FAILED','HARMFUL_OBSERVED','ROLLED_BACK']);
const stripSource=p=>({area:String(p?.area||''),engines:[...(p?.engines||[])].sort(),
  kind:String(p?.candidateStrategy?.kind||''),template:p?.candidateStrategy?.scanner||null,
  ai:p?.candidateStrategy?.ai||null,setups:p?.candidateStrategy?.setups||null,
  rules:p?.candidateStrategy?.rules||null});
export const proposalFamily37=p=>`DT37_FAMILY_${h(stripSource(p)).slice(0,24)}`;
export const researchMemoryKey37='dt37-research-proposal-memory-v1';
export const researchWeeklyKey37=end=>`dt37-research-weekly-${end}`;
export const researchMonthlyKey37=end=>`dt37-research-monthly-${end}`;
export const feedbackEventKey37=(family,eventId)=>`dt37-research-feedback-${family}-${eventId}`;
function monday(d){const n=wkday(d);return plus(d,-((n+6)%7))}
const friday=d=>plus(monday(d),4);
const endMonth=d=>{const [y,m]=d.split('-').map(Number);return new Date(Date.UTC(y,m,0,12)).toISOString().slice(0,10)};
const firstMonth=d=>`${d.slice(0,7)}-01`;
function lastWeekdayOfMonth(d){let e=endMonth(d);while([0,6].includes(wkday(e)))e=plus(e,-1);return e}
/** Periods are evaluated only after the normal scheduled close; next Monday or
 * next-month scheduled run also catches Friday/last-day market holidays.
 * This intentionally makes no additional schedule/Netlify invocation. */
export function dueResearchPeriods37(day){
 if(!iso(day))throw Error('RESEARCH_DAY_INVALID');
 const due=[];
 if(wkday(day)===5)due.push({kind:'WEEKLY',start:monday(day),end:day});
 // Catch up if the scheduled Monday run was a US market holiday.
 // Existence checks on immutable report keys avoid duplicate consolidation.
 if(wkday(day)>=1&&wkday(day)<=4){const end=plus(monday(day),-3);
  due.push({kind:'WEEKLY',start:plus(end,-4),end});}
 const e=lastWeekdayOfMonth(day);
 if(day===e)due.push({kind:'MONTHLY',start:firstMonth(day),end:endMonth(day)});
 if(day.slice(-2)<='05'){
  const prev=plus(firstMonth(day),-1);
  due.push({kind:'MONTHLY',start:firstMonth(prev),end:endMonth(prev)});
 }
 return due;
}
/** Reviews are observations; only evidence from a trusted independent test
 * may classify a variant as harmful. A single losing trade is NOT causality. */
export function validateFeedbackEvent37(input){
 const e=input&&typeof input==='object'?input:{};
 if(!/^DT37_FAMILY_[a-f0-9]{24}$/.test(e.family||'')||!verdicts.has(e.verdict)||!iso(e.evaluatedOn))
  throw Error('INVALID_FEEDBACK_EVENT');
 if(typeof e.sourceEvidenceId!=='string'||!/^DT37_(?:TEST|OWNER_DECISION|ROLLBACK)_[A-Za-z0-9_-]{6,100}$/.test(e.sourceEvidenceId))
  throw Error('FEEDBACK_MISSING_TRUSTED_EVIDENCE_REFERENCE');
 if(['HARMFUL_OBSERVED','INDEPENDENT_TEST_FAILED','TEST_PASSED'].includes(e.verdict)){
  const x=e.evaluation||{};
  if(x.independentReview!==true||x.outOfSample!==true||x.sameUniverseAndPeriod!==true||x.afterCosts!==true||
    !Number.isFinite(x.candidateNetUsd)||!Number.isFinite(x.baselineNetUsd)||safeInteger(x.sampleSize)<60)
    throw Error('FEEDBACK_NOT_INDEPENDENTLY_VERIFIED');
  if(['HARMFUL_OBSERVED','INDEPENDENT_TEST_FAILED'].includes(e.verdict)&&
    !(x.candidateNetUsd<x.baselineNetUsd))throw Error('HARMFUL_VERDICT_UNSUPPORTED');
  if(e.verdict==='TEST_PASSED'&&!(x.candidateNetUsd>x.baselineNetUsd))throw Error('PASS_VERDICT_UNSUPPORTED');
 }
 if(['REJECTED_BY_OWNER','APPROVED_FOR_PAPER','APPROVED_FOR_PRODUCTION'].includes(e.verdict)&&
   (typeof e.actorId!=='string'||e.actorId.length<3||e.confirmedByOwner!==true))throw Error('OWNER_DECISION_NOT_AUTHENTICATED');
 // This validates shape, NOT the authenticity of the named reviewer or owner.
 return {family:e.family,verdict:e.verdict,evaluatedOn:e.evaluatedOn,
  sourceEvidenceId:e.sourceEvidenceId,actorId:e.actorId||null,
  evaluation:e.evaluation||null,reason:String(e.reason||'').slice(0,400),
  strategyVersion:e.strategyVersion||null,trust:'SELF_REPORTED_NEEDS_EXTERNAL_PROVENANCE_VALIDATION'};
}
/** Append-only events can be imported by authenticated, externally approved
 * workflow later. A report cannot manufacture these outcomes from LLM text. */
export function memoryFromFeedback37(events=[],previous=null){
 const entries={...(previous?.entries||{})},seen=new Set(previous?.eventIds||[]);
 const accepted=[];
 for(const raw of events){
  if(raw?.externalProvenanceConfirmed!==true)throw Error('FEEDBACK_EXTERNAL_PROVENANCE_NOT_CONFIRMED');
  const ev=validateFeedbackEvent37(raw);
  const eventId=h(ev).slice(0,24);if(seen.has(eventId))continue;
  accepted.push({...ev,eventId});seen.add(eventId);
 }
 accepted.sort((a,b)=>a.evaluatedOn.localeCompare(b.evaluatedOn)||a.eventId.localeCompare(b.eventId));
 for(const e of accepted){
  const old=entries[e.family]||{family:e.family,events:[],lastVerdict:'NO_VERIFIED_OUTCOME',blocked:false};
  const history=[...(old.events||[]),{eventId:e.eventId,day:e.evaluatedOn,verdict:e.verdict,
    evidenceId:e.sourceEvidenceId,strategyVersion:e.strategyVersion,reason:e.reason}]
    .sort((a,b)=>a.day.localeCompare(b.day)||a.eventId.localeCompare(b.eventId));
  const latest=history[history.length-1];
  // Negative results stay blocked forever for the SAME variant fingerprint.
  // Reconsideration requires an explicitly different tested variant, not a
  // rephrased old proposal or a later positive self-report.
  const blocking=history.find(x=>suppressed.has(x.verdict));
  entries[e.family]={...old,family:e.family,events:history,lastVerdict:latest.verdict,
    blocked:!!blocking,blockingVerdict:blocking?.verdict||null,
    blockingEvidenceId:blocking?.evidenceId||null,
    lastEvaluatedOn:latest.day,evidenceId:latest.evidenceId,
    reviewLevel:'EXTERNAL_PROVENANCE_CONFIRMED'};
 }
 return {schemaVersion:'3.7-PROPOSAL-MEMORY-1',entries,eventIds:[...seen].sort(),
  eventCount:seen.size,syncedPeriodIds:previous?.syncedPeriodIds||[],
  source:'IMMUTABLE_TRUSTED_FEEDBACK_EVENTS_ONLY',
  provenanceVerifiedExternally:accepted.length>0||(previous?.provenanceVerifiedExternally===true)};
}
export function annotateDailyProposals37(cycle,memory){
 const entries=memory?.entries||{};
 const proposals=(cycle.proposals||[]).map(p=>{
  const family=proposalFamily37(p),prior=entries[family],blocked=prior?.blocked===true;
  return {...p,family,phase:'DAILY_OBSERVATION_ONLY',
   approvalStatus:blocked?'SUPPRESSED_PREVIOUS_NEGATIVE_OUTCOME':'DAILY_OBSERVATION_NOT_FINAL',
   priorDecision:prior?{verdict:blocked?(prior.blockingVerdict||prior.lastVerdict):prior.lastVerdict,
     day:prior.lastEvaluatedOn,
     evidenceId:blocked?(prior.blockingEvidenceId||prior.evidenceId):prior.evidenceId,
     reviewLevel:prior.reviewLevel}:null,
   suppressedFromRecommendations:blocked,eligibleForApproval:false,
   // Keep historical rationale visible; never delete the evidence of failures.
   applied:false,canDeploy:false,canTrade:false};
 });
 return {...cycle,proposals,proposalCadence:'DAILY_MONITORING_NOT_STRATEGY_LEARNING',
  durableMemory:{loaded:!!memory,events:memory?.eventCount||0,
   provenanceVerifiedExternally:memory?.provenanceVerifiedExternally===true},
  learningInDailyReports:false,canAutoApply:false};
}
const complete=c=>c?.recordedEvidenceComplete===true&&c?.historyReadIssues?.length===0;
/** Honest sample checks: daily error counts cannot substitute for independent
 * validated trade samples. Monthly statistical learning is deferred if sparse. */
export function consolidateResearchPeriod37({period,cycles=[],memory=null,outcomes=null,scalpOutcomes=null,now=null,experimentReports=[]}={}){
 const {kind,start,end}=period||{};
 if(!['WEEKLY','MONTHLY'].includes(kind)||!iso(start)||!iso(end)||end<start)throw Error('RESEARCH_PERIOD_INVALID');
 const allowed=range(start,end);
 const days=new Map();
 for(const x of cycles)if(x?.day&&allowed.includes(x.day)&&!days.has(x.day))days.set(x.day,x);
 const sessions=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
 const good=sessions.filter(complete),allProposals=new Map();
 for(const c of sessions)for(const p of c.proposals||[]){
  // Carried pending issues are not fresh observations.
  if(p.notObservedToday===true)continue;
  const family=proposalFamily37(p),x=allProposals.get(family)||{family,area:p.area,engines:p.engines,
   candidateStrategy:p.candidateStrategy,firstObserved:c.day,lastObserved:c.day,observedDays:new Set(),
   sources:new Set(),sourceIds:new Set(),proposalIds:new Set(),hypotheses:new Set(),rawCount:0};
  x.observedDays.add(c.day);x.sources.add(p.source);x.proposalIds.add(p.id);
  for(const id of p.sourceIds||[])x.sourceIds.add(id);
  x.hypotheses.add(p.hypothesis_ar);x.lastObserved=c.day;x.rawCount++;
  allProposals.set(family,x);
 }
 const minSessions=kind==='WEEKLY'?3:12;
 const completeEnough=good.length>=minSessions;
 const entries=memory?.entries||{};
 const candidates=[...allProposals.values()].map(p=>{
  const mem=entries[p.family],negative=mem?.blocked===true;
  const occurrences=p.observedDays.size;
  const repeated=occurrences>=(kind==='WEEKLY'?2:5);
  const minOutcomes=kind==='WEEKLY'?20:60;
  // Daily history windows overlap; their per-day trade counts must never be summed.
  // A separate unique-trade rollup is supplied by the periodic runtime.
  const verifiedIndependentSample=0;
  const actualDistinct=outcomes?.uniqueClosed||0;
  const dataOnly=['DATA_INGESTION','COVERAGE','AUDIT_RETENTION'].includes(p.area);
  const enoughDistinct=kind==='MONTHLY'?outcomes?.readyForDescriptiveLearning===true:actualDistinct>=minOutcomes;
  let status=negative?'SUPPRESSED_HISTORICAL_NEGATIVE':
   !completeEnough?'INSUFFICIENT_SESSION_SAMPLE':
   !repeated?'INSUFFICIENT_REPEATED_EVIDENCE':
   !dataOnly&&!enoughDistinct?'INSUFFICIENT_DISTINCT_PAPER_TRADES':
   'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL';
  return {family:p.family,area:p.area,engines:p.engines,variant:p.candidateStrategy,
    firstObserved:p.firstObserved,lastObserved:p.lastObserved,observedSessions:occurrences,
    sourceKinds:[...p.sources].sort(),sourceIds:[...p.sourceIds].sort().slice(0,25),
    priorProposalIds:[...p.proposalIds].sort(),hypotheses:[...p.hypotheses].slice(0,4),
    historicalVerdict:negative?(mem?.blockingVerdict||mem?.lastVerdict):(mem?.lastVerdict||'NONE_RECORDED'),
    historicalEvidenceId:negative?(mem?.blockingEvidenceId||mem?.evidenceId):(mem?.evidenceId||null),
    suppressed:negative,status,needIndependentTest:true,
    minimumObservedDistinctTrades:dataOnly?0:minOutcomes,
    observedDistinctPaperTrades:outcomes?.uniqueClosed||0,
    independentTestMinSample:60,independentEvidenceSample:verifiedIndependentSample,
    eligibleForProductionApproval:false,canTrade:false,canDeploy:false};
 });
 candidates.sort((a,b)=>Number(a.suppressed)-Number(b.suppressed)||b.observedSessions-a.observedSessions||a.family.localeCompare(b.family));
 const report={schemaVersion:'3.7-RESEARCH-PERIODIC-1',kind,start,end,generatedAt:now,
  expectedWeekdays:allowed.filter(d=>![0,6].includes(wkday(d))).length,
  sessionsObserved:sessions.length,sessionsWithFullEvidence:good.length,
  missingTradingOrEvidenceDays:allowed.filter(d=>![0,6].includes(wkday(d))&&!days.has(d)),
  tradingHolidaysNotVerified:true,
  minimumFullEvidenceSessions:minSessions,
  sufficientSessionSample:completeEnough,
  candidateCount:candidates.length,candidates,
  statisticsReadyForMonthlyLearning:kind==='MONTHLY'&&completeEnough&&outcomes?.readyForDescriptiveLearning===true,
  proposalFinalization:kind==='MONTHLY'&&!(completeEnough&&outcomes?.readyForDescriptiveLearning===true)?
   'MONTHLY_SAMPLE_INSUFFICIENT_CARRY_FORWARD':
   kind==='WEEKLY'?'WEEKLY_RESEARCH_SHORTLIST_ONLY':'MONTHLY_RESEARCH_SHORTLIST_ONLY',
  distinctPaperOutcomes:outcomes||{status:'NOT_VERIFIED',uniqueClosed:0,limitations:['No period-distinct outcomes supplied']},
  scalpPaperOutcomes:scalpOutcomes||{status:'NOT_VERIFIED',uniqueClosed:0},
  scalpMonthlyDescriptiveStudyReady:kind==='MONTHLY'&&completeEnough&&scalpOutcomes?.readyForDescriptiveLearning===true,
  status:completeEnough&&(kind==='WEEKLY'||outcomes?.readyForDescriptiveLearning===true)?
   'CONSOLIDATED_REQUIRES_INDEPENDENT_VALIDATION':'INSUFFICIENT_SAMPLE_CARRY_FORWARD',
  warnings:['Repeated paper outcome counts across daily reports are NOT unique trades',
   'Scanner shadow target touches are NOT realized broker P&L',
   'No causal attribution of losses to a rule without linked comparable out-of-sample testing',
   'Strategy approval and production activation are separate owner-controlled actions'],
  strategyChanged:false,applied:false,canAutoApply:false};
 return {...attachExperimentEvidence37(report,experimentReports),digest:h([report.kind,report.start,report.end,report.sessionsWithFullEvidence,
   report.candidates,report.distinctPaperOutcomes,report.scalpPaperOutcomes])};
}

/** Current period closing snapshots are deduplicated by immutable trade ID,
 * not by adding rolling 3-day daily learning totals. These are PAPER outcomes.
 * No rule-change effect is inferred without a tagged comparable baseline. */
export function summarizePeriodTrades37({period,states=[]}={}){
 const seen=new Set(),closed=[];
 const closeDay=iso(period?.end)?period.end:null;
 if(!closeDay)throw Error('TRADE_PERIOD_INVALID');
 for(const state of states)for(const p of [...Object.values(state?.records||{}).map(v=>v?.position),...(state?.closedOutcomes||[])]){
  if(p?.status!=='CLOSED'||typeof p.closedAt!=='string'||!Number.isFinite(Date.parse(p.closedAt)))continue;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.closedAt));
  if(day<period.start||day>closeDay)continue;
  const key=p.id||`${p.symbol}:${p.openedAt}`;if(!key||seen.has(key))continue;seen.add(key);
  closed.push({id:String(key).slice(0,100),day,setup:String(p.setupType||'UNKNOWN').slice(0,40),
   netUsd:typeof p.netUsd==='number'&&Number.isFinite(p.netUsd)?p.netUsd:null,
   strategyVariantId:typeof p.strategyVariantId==='string'?p.strategyVariantId:null});
 }
 const bySetup={};
 for(const x of closed){const s=bySetup[x.setup]||(bySetup[x.setup]={closed:0,withPaperNet:0,wins:0,losses:0,paperNetUsd:0,taggedVariants:{}});
  s.closed++;if(x.netUsd!==null){s.withPaperNet++;s.paperNetUsd+=x.netUsd;if(x.netUsd>0)s.wins++;if(x.netUsd<0)s.losses++;}
  if(x.strategyVariantId)s.taggedVariants[x.strategyVariantId]=(s.taggedVariants[x.strategyVariantId]||0)+1;
 }
 for(const s of Object.values(bySetup)){s.paperNetUsd=Math.round(s.paperNetUsd*100)/100;
  s.meanPaperNetUsd=s.withPaperNet?Math.round((s.paperNetUsd/s.withPaperNet)*1000)/1000:null;
  s.sampleSufficientForDescriptiveStudy=s.withPaperNet>=60;}
 return {status:'RECORDED_PAPER_OUTCOMES_ONLY',uniqueClosed:closed.length,withPaperNet:closed.filter(x=>x.netUsd!==null).length,
  bySetup,readyForDescriptiveLearning:Object.values(bySetup).some(x=>x.sampleSufficientForDescriptiveStudy),
  distinctTradeDeduplication:true,causalVariantComparisonVerified:false,
  limitations:['Paper projection is not an actual broker fill',
   'Fees and slippage are only as accurate as the original paper model',
   'At least 60 distinct outcomes per setup does not alone prove profitable strategy changes']};
}
/** Scalp is reported SEPARATELY from the primary AI's EARLY/RETEST results.
 * Only final per-day state snapshots count. Never sum rolling daily reports. */
export function summarizePeriodScalp37({period,states=[]}={}){
 const scalpStates=states.map(s=>({records:{},closedOutcomes:s?.scalp37?.closedOutcomes||[]}));
 const summary=summarizePeriodTrades37({period,states:scalpStates});
 return {...summary,book:'INDEPENDENT_SCALP_PAPER37',
  status:states.some(s=>s?.scalp37?.schemaVersion==='3.7-SCALP-PAPER-1')?'RECORDED_SCALP_PAPER_ONLY':'NOT_RECORDED',
  actualBrokerFillsVerified:false,independentWalkForwardVerified:false,
  limitations:[...summary.limitations,'Scalp profits are modeled on bars and adverse-slippage assumptions, not an executable quote at exit']};
}
/** A compact lifetime registry: unlike the 3-day carry-forward, this preserves
 * every known family and its dated weekly/monthly consideration. */
export function memoryFromPeriod37(report,previous=null){
 if(!['WEEKLY','MONTHLY'].includes(report?.kind)||!iso(report?.end))throw Error('MEMORY_PERIOD_INVALID');
 const entries={...(previous?.entries||{})};
 for(const p of report.candidates||[]){
  if(!/^DT37_FAMILY_[a-f0-9]{24}$/.test(p.family||''))continue;
  const old=entries[p.family]||{family:p.family,events:[],lastVerdict:'NO_VERIFIED_OUTCOME',blocked:false};
  const key=report.kind==='WEEKLY'?'weeksObserved':'monthsObserved';
  entries[p.family]={...old,firstObserved:old.firstObserved&&old.firstObserved<p.firstObserved?old.firstObserved:p.firstObserved,
   lastObserved:p.lastObserved>(old.lastObserved||'')?p.lastObserved:old.lastObserved,
   [key]:[...new Set([...(old[key]||[]),report.end])].sort(),
   recordedInPeriodReports:true};
 }
 return {schemaVersion:'3.7-PROPOSAL-MEMORY-1',entries,
  eventIds:previous?.eventIds||[],eventCount:previous?.eventCount||0,
  syncedPeriodIds:[...new Set([...(previous?.syncedPeriodIds||[]),`${report.kind}:${report.end}`])].sort(),
  source:'LIFETIME_WEEKLY_MONTHLY_OBSERVATION_AND_VERIFIED_FEEDBACK',
  provenanceVerifiedExternally:previous?.provenanceVerifiedExternally===true,
  lastConsolidatedPeriod:{kind:report.kind,end:report.end}};
}
export function recentResearchReportEnds37(day){
 if(!iso(day))throw Error('REPORT_DAY_INVALID');
 const weekly=day>=friday(day)?friday(day):plus(friday(day),-7);
 const monthly=day>=lastWeekdayOfMonth(day)?endMonth(day):endMonth(plus(firstMonth(day),-1));
 return {weekly,monthly};
}
