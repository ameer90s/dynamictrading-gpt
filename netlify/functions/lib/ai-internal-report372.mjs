/** DT PULSE 3.7.2 — Dynamic AI internal-only, deterministic research journal.
 * This routine runs on the existing AI scan data and is stored within the
 * existing ai-parallel-recommendations blob. It NEVER calls OpenAI, Research
 * Agent, broker, Netlify functions or a market-data provider, and never applies
 * a proposed change. No new Blob write is introduced.
 */
import {isClosedAsOf372} from './market-time372.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const round=x=>finite(x)==null?null:Number(x.toFixed(4));
const small=x=>String(x??'').slice(0,100);
function asofClosed(trades,now){
 const seen=new Set(),out=[];
 for(const p of trades){
  if(!p||p.status!=='CLOSED'||!p.id||seen.has(p.id))continue;
  if(!isClosedAsOf372(p,now))continue;
  seen.add(p.id);out.push(p);
 }
 return out;
}
/** All paper histories are observed facts. Proposed what-if strategies are
 * never described as backtested outcomes, and lack of traceable quote is unknown.
 */
export function buildAiInternalReport372({day,now=new Date(),records=[],history=[],coverage=null,
 reasons={},recommendations=null,events=[]}={}){
 if(!/^20\d\d-\d\d-\d\d$/.test(day||''))throw Error('INVALID_AI_REPORT_DAY');
 const closed=asofClosed([...history,...records.map(x=>x?.position)],now);
 const reviews=records.map(x=>x.decisionReview372).filter(x=>x&&Date.parse(x.at)<=now.getTime());
 const reviewByPosition=new Map(records.filter(x=>x.position?.id).map(x=>[x.position.id,x.decisionReview372]));
 const rejectedCases=records.map(x=>x.rejectionStudy372).filter(Boolean);
 const priced=closed.filter(x=>finite(x.netUsd)!=null),wins=priced.filter(x=>x.netUsd>0),losses=priced.filter(x=>x.netUsd<0);
 const groups={};for(const trade of priced){
  const type=small(trade.setupType||'UNKNOWN');const row=groups[type]||(groups[type]={closed:0,wins:0,losses:0,netPaperUsd:0});
  row.closed++;row.wins+=trade.netUsd>0?1:0;row.losses+=trade.netUsd<0?1:0;row.netPaperUsd=round(row.netPaperUsd+trade.netUsd);
 }
 const errorReview=losses.slice(-50).map(t=>({
  id:small(t.id),setupType:small(t.setupType),openedAt:t.openedAt||null,closedAt:t.closedAt,
  netUsd:round(t.netUsd),mfePct:round(t.mfePct),maePct:round(t.maePct),
  category:'OBSERVED_NEGATIVE_PAPER_OUTCOME',
  cause:'UNVERIFIED_WITHOUT_ASOF_REPLAY_AND_QUOTE_AUDIT',
  investigation:'COMPARE_ACTUAL_ASK_STOP_TARGET_FEES_AND_LATER_COMPLETED_BARS',
  evidence:reviewByPosition.get(t.id)||{classification:'UNVERIFIED',reason:'HISTORICAL_DECISION_TRACE_NOT_IN_CURRENT_COMPACT_STATE',positionId:t.id},
 }));
 const rejected=Object.entries(reasons||{}).filter(([,v])=>Number.isFinite(Number(v))&&Number(v)>0)
  .sort((a,b)=>b[1]-a[1]).slice(0,15).map(([reason,count])=>({reason:small(reason),evaluations:Number(count),
   missedTradeOutcome:'NOT_VERIFIED'}));
 const ideas=(recommendations?.suggestions||[]).slice(0,12).map((x,i)=>({
  id:`AI_${day}_${i+1}`,area:small(x.area),hypothesis:small(x.hypothesis),
  proposedExperiment:small(x.experiment),source:'AI_OWN_RECORDED_DECISIONS',
  acceptance:'NET_AFTER_COSTS_AND_WALK_FORWARD_REQUIRED',status:'PROPOSED_UNTESTED',
  evidenceIds:reviews.slice(-20).map(x=>x.evidenceId),
  sample:{uniqueClosed:closed.length,priced:priced.length,decisionCases:reviews.length},
  confidence:{level:priced.length>=30?'DESCRIPTIVE_SAMPLE_ONLY':'LOW',winProbability:null},
  alternatives:reviews.flatMap(x=>x.counterfactuals||[]).slice(-20),
  impact:{observedNetPaperUsd:round(priced.reduce((a,x)=>a+x.netUsd,0)),
   projectedProfit:'NOT_VERIFIED_REQUIRES_HOLDOUT',projectedDrawdown:'NOT_VERIFIED_REQUIRES_HOLDOUT',
   coveragePct:finite(coverage?.coveragePct),additionalProviderCalls:0,additionalBlobWrites:0},
  approved:false,autoApply:false}));
 return {schema:'DT372-AI-INTERNAL-REPORT-1',day,generatedAt:now.toISOString(),
  owner:'DYNAMIC_AI_ONLY',sharedWithResearchAgent:false,externalReportForwarding:false,
  stageStates:{scan:records.length?'RECORDED':'NOT_VERIFIED',select:reviews.length?'ASOF_PLANS_COMPARED':'NOT_VERIFIED',paperFollowup:'RECORDED_WHEN_AVAILABLE',
   auditDecisions:reviews.length?'RECORDED_WITH_ARCHIVE_POINTERS':'NOT_VERIFIED',analyzeErrors:reviews.length?'FACTS_HYPOTHESES_AND_ASOF_COUNTERFACTUALS':'NOT_VERIFIED',
   proposeImprovements:'PROPOSED_UNTESTED'},
  coverage:{eligible:coverage?.eligible??null,everScanned:coverage?.everScanned??null,
   coveragePct:finite(coverage?.coveragePct),feedErrors:(coverage?.lastFeedErrors||[]).slice(0,5)},
  outcomes:{uniqueClosed:closed.length,priced:priced.length,unpriced:closed.length-priced.length,
   winners:wins.length,losers:losses.length,netPaperUsd:round(priced.reduce((a,x)=>a+x.netUsd,0)),
   bySetup:groups,brokerFillVerified:false,winProbabilityCalibrated:false},
  errorReview,rejectionReview:rejected,
  decisionCases:reviews.slice(-20).map(x=>({evidenceId:x.evidenceId,archiveKey:x.archiveKey,at:x.at,
   confidence:x.confidence,hypotheses:x.hypotheses,causalConclusion:x.causalConclusion,
   counterfactuals:x.counterfactuals,factCount:x.facts.length,
   fullFactsSource:{archiveKey:x.archiveKey,field:'decisionReview372.facts'}})),
  rejectedFollowthrough:rejectedCases.slice(-20),
  rejectionFollowthroughTotals:{observedSetups:records.reduce((n,x)=>n+(x.rejectionTotals372?.observedSetups||0),0),
   activeSetups:records.reduce((n,x)=>n+(x.rejectionStudies372?.length||0),0),
   positivePriceMfe:records.reduce((n,x)=>n+(x.rejectionTotals372?.positivePriceMfe||0),0),
   interpretation:'PRICE_PATH_OBSERVATIONS_NOT_EXECUTABLE_MISSED_PROFITS'},
  caseCoverage:{recordedCases:reviews.length,shownCases:Math.min(20,reviews.length),
   everyEvaluationArchive:'/api/ai-parallel-audit',casesAreNotTheFullPopulation:true},
  recentDecisions:(events||[]).slice(-35).map(x=>({id:small(x.id),kind:small(x.kind),symbol:small(x.symbol),reason:small(x.reason),minute:x.minute??null})),
  proposedExperiments:ideas,
  alternateEntryStopTargetEvaluation:reviews.some(x=>x.counterfactuals?.length)?
   'RECORDED_ASOF_PLANS_WITH_OHLC_COUNTERFACTUALS_NOT_EXECUTED_FILLS':'NOT_VERIFIED_REQUIRES_DETERMINISTIC_ASOF_REPLAY',
  riskControls:['APPROVED_SHARIA','FRESH_AUTHENTIC_BID_ASK','POSITIVE_NET_ECONOMICS','NO_AUTO_BROKER_ORDERS'],
  autoChangeProduction:false,externalAudit:'NOT_VERIFIED',
  costNote:'EMBEDDED_IN_EXISTING_AI_RECOMMENDATIONS_WRITE_NO_NEW_PROVIDER_REQUEST'};
}
