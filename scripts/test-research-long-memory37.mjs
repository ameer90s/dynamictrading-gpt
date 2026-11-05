import assert from 'node:assert/strict';
import {
 proposalFamily37,dueResearchPeriods37,validateFeedbackEvent37,memoryFromFeedback37,
 memoryFromPeriod37,annotateDailyProposals37,consolidateResearchPeriod37,
 summarizePeriodTrades37,recentResearchReportEnds37,
 researchMemoryKey37,researchWeeklyKey37,researchMonthlyKey37
} from '../netlify/functions/lib/research-memory-cadence37.mjs';
import {recordTrustedResearchFeedback37} from '../netlify/functions/lib/research-feedback-store37.mjs';
import {finalizeDueResearchPeriods37,strategyLearningKey37} from '../netlify/functions/lib/research-learning-runtime37.mjs';
const tests=[];const t=async(name,fn)=>{await fn();tests.push(name);console.log('PASS',name)};
const proposal=(text='اضبط السبريد')=>({id:'prop',area:'COSTS_SPREAD',engines:['SCANNER','AI'],source:'OPENAI_REVIEW',
 sourceIds:['ev'],hypothesis_ar:text,candidateStrategy:{kind:'TIGHTER_EXECUTION_GATES',
 scanner:{maxSpreadBps:{from:12,to:10.8}},ai:{maxSpreadBps:{from:10,to:9}}}});
const family=proposalFamily37(proposal());
const feedback=(verdict='HARMFUL_OBSERVED',extra={})=>({family,verdict,evaluatedOn:'2026-09-30',
 sourceEvidenceId:'DT37_TEST_0123456789',strategyVersion:'candidate-3.7-v2',
 evaluation:{independentReview:true,outOfSample:true,sameUniverseAndPeriod:true,afterCosts:true,
 sampleSize:90,candidateNetUsd:-38,baselineNetUsd:10},reason:'ورقياً دون تعميم سببي',...extra});
const store=()=>{const m=new Map(),ops=[];return {m,ops,async get(k){ops.push(`get:${k}`);return m.has(k)?structuredClone(m.get(k)):null},
 async setJSON(k,v,o={}){ops.push(`set:${k}`);if(o.onlyIfNew&&m.has(k))return {modified:false};m.set(k,structuredClone(v));return {modified:true}}};};
await t('same change fingerprint survives OpenAI paraphrases',()=>{
 assert.equal(proposalFamily37(proposal('وصف آخر كلياً')),family);
 assert.notEqual(proposalFamily37({...proposal(),candidateStrategy:{kind:'OTHER'}}),family);
});
await t('reject false verified loss and invalid evidence',()=>{
 assert.throws(()=>validateFeedbackEvent37(feedback('HARMFUL_OBSERVED',{evaluation:{sampleSize:1}})),/INDEPENDENT/);
 assert.throws(()=>validateFeedbackEvent37(feedback('HARMFUL_OBSERVED',{evaluation:{independentReview:true,outOfSample:true,
 sameUniverseAndPeriod:true,afterCosts:true,sampleSize:90,candidateNetUsd:50,baselineNetUsd:10}})),/UNSUPPORTED/);
 assert.throws(()=>memoryFromFeedback37([feedback()]),/PROVENANCE_NOT_CONFIRMED/);
});
await t('trusted negative outcome survives separate calendar months and blocks exact proposal',()=>{
 const memory=memoryFromFeedback37([{...feedback(),externalProvenanceConfirmed:true}]);
 const c=annotateDailyProposals37({day:'2026-11-25',proposals:[proposal('صياغة جديدة')],canAutoApply:false},memory);
 assert.equal(c.proposals[0].suppressedFromRecommendations,true);
 assert.equal(c.proposals[0].approvalStatus,'SUPPRESSED_PREVIOUS_NEGATIVE_OUTCOME');
 assert.equal(c.proposals[0].priorDecision.verdict,'HARMFUL_OBSERVED');
});
await t('owner-rejected proposal stays suppressed independently of calendar age',()=>{
 const memory=memoryFromFeedback37([{...feedback('REJECTED_BY_OWNER',{
  sourceEvidenceId:'DT37_OWNER_DECISION_091234',actorId:'approved-owner',confirmedByOwner:true,evaluation:null}),
  externalProvenanceConfirmed:true}]);
 assert.equal(annotateDailyProposals37({proposals:[proposal()]},memory).proposals[0].suppressedFromRecommendations,true);
});
await t('one losing trade never creates a causal failure verdict',()=>{
 const state={records:{Z:{position:{id:'loser',symbol:'Z',status:'CLOSED',closedAt:'2026-10-28T20:01:00Z',
  openedAt:'2026-10-28T15:00:00Z',netUsd:-5,setupType:'RETEST'}}}};
 const outcomes=summarizePeriodTrades37({period:{kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'},states:[state]});
 assert.equal(outcomes.uniqueClosed,1);assert.equal(outcomes.readyForDescriptiveLearning,false);
 assert.equal(outcomes.causalVariantComparisonVerified,false);
});
await t('weekly Friday and monthly final weekday calculated correctly',()=>{
 assert.deepEqual(dueResearchPeriods37('2026-11-06'),[{kind:'WEEKLY',start:'2026-11-02',end:'2026-11-06'}]);
 const oct=dueResearchPeriods37('2026-10-30');
 assert.equal(oct.length,2);assert.equal(oct[1].end,'2026-10-31');
 assert(dueResearchPeriods37('2026-11-02').some(x=>x.kind==='MONTHLY'&&x.end==='2026-10-31'));
 assert.equal(recentResearchReportEnds37('2026-11-04').weekly,'2026-10-30');
 assert(dueResearchPeriods37('2026-11-03').some(x=>x.kind==='WEEKLY'&&x.end==='2026-10-30'));
});
await t('weekly report counts only days truly observed, excludes carried proposals',()=>{
 const period={kind:'WEEKLY',start:'2026-11-02',end:'2026-11-06'};
 const cycles=['02','03','04','05','06'].map((dd,i)=>({day:`2026-11-${dd}`,recordedEvidenceComplete:true,historyReadIssues:[],
  proposals:[{...proposal(),notObservedToday:i>=2}]}));
 const x=consolidateResearchPeriod37({period,cycles,outcomes:{uniqueClosed:22},now:'2026-11-06T22:00Z'});
 assert.equal(x.sessionsWithFullEvidence,5);assert.equal(x.candidates[0].observedSessions,2);
 assert.equal(x.candidates[0].status,'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL');
 assert.equal(x.canAutoApply,false);
});
await t('month with 23 valid sessions but 59 unique trades is NOT enough to learn',()=>{
 const period={kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'};
 const days=Array.from({length:23},(_,i)=>new Date(Date.UTC(2026,9,1+i,12)).toISOString().slice(0,10)).filter(x=>![0,6].includes(new Date(`${x}T12:00Z`).getUTCDay()));
 const cycles=days.map(day=>({day,recordedEvidenceComplete:true,historyReadIssues:[],proposals:[proposal()]}));
 const x=consolidateResearchPeriod37({period,cycles,outcomes:{uniqueClosed:59,readyForDescriptiveLearning:false}});
 assert.equal(x.statisticsReadyForMonthlyLearning,false);
 assert.equal(x.proposalFinalization,'MONTHLY_SAMPLE_INSUFFICIENT_CARRY_FORWARD');
 assert.equal(x.candidates[0].status,'INSUFFICIENT_DISTINCT_PAPER_TRADES');
});
await t('deduplicate rolling 3-day trades and refuse fake repeated monthly sample',()=>{
 const a={records:{A:{position:{id:'same-id',symbol:'A',status:'CLOSED',setupType:'EARLY',netUsd:2,
  openedAt:'2026-10-20T15:00:00Z',closedAt:'2026-10-20T20:30:00Z'}}}};
 const x=summarizePeriodTrades37({period:{kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'},states:[a,a,a]});
 assert.equal(x.uniqueClosed,1);assert.equal(x.bySetup.EARLY.closed,1);
});
await t('long-term memory survives 8 weekly and 2 monthly merges with no shortening',()=>{
 let memory=memoryFromFeedback37([{...feedback(),externalProvenanceConfirmed:true}]);
 for(let i=0;i<10;i++){
  const d=new Date(Date.UTC(2026,0,2+i*7,12)).toISOString().slice(0,10);
  memory=memoryFromPeriod37({kind:i%5===0?'MONTHLY':'WEEKLY',end:d,candidates:[{
   family,firstObserved:d,lastObserved:d}]},memory);
 }
 assert.equal(memory.entries[family].blocked,true);
 assert.equal(memory.entries[family].lastVerdict,'HARMFUL_OBSERVED');
 assert.equal(memory.syncedPeriodIds.length,10);
 assert.equal(memory.eventCount,1);
});
await t('untrusted requests cannot write feedback, even if their payload claims independent',async()=>{
 const s=store();const x=await recordTrustedResearchFeedback37({store:s,event:feedback()});
 assert.equal(x.status,'AUTHORIZATION_REQUIRED_NO_WRITE');assert.equal(s.m.size,0);
 const y=await recordTrustedResearchFeedback37({store:s,event:feedback(),authorized:true,verifyProvenance:async()=>({independentlyConfirmed:false})});
 assert.equal(y.status,'PROVENANCE_NOT_VERIFIED_NO_WRITE');assert.equal(s.m.size,0);
});
await t('validated event is immutable, survives retry, blocks later daily suggestions',async()=>{
 const s=store();const verifyProvenance=async e=>({independentlyConfirmed:true,evidenceId:e.sourceEvidenceId});
 const args={store:s,event:feedback(),authorized:true,verifyProvenance};
 const first=await recordTrustedResearchFeedback37(args);
 assert.equal(first.status,'RECORDED_AND_INDEXED');
 assert.equal((await recordTrustedResearchFeedback37(args)).status,'ALREADY_RECORDED');
 assert.equal(s.m.get(researchMemoryKey37).entries[family].blocked,true);
 const daily=annotateDailyProposals37({proposals:[proposal('different text')]},s.m.get(researchMemoryKey37));
 assert.equal(daily.proposals[0].suppressedFromRecommendations,true);
});
await t('weekly/monthly writes use only existing research schedule, no scanner mutations',async()=>{
 const s=store(),day='2026-10-30';
 for(let i=0;i<30;i++){const d=new Date(Date.UTC(2026,9,1+i,12)).toISOString().slice(0,10);
  if([0,6].includes(new Date(`${d}T12:00Z`).getUTCDay()))continue;
  s.m.set(strategyLearningKey37(d),{day:d,recordedEvidenceComplete:true,historyReadIssues:[],proposals:[proposal()]});
  s.m.set(`ai-parallel-state-${d}`,{records:{}});
 }
 const x=await finalizeDueResearchPeriods37({store:s,day,now:new Date('2026-10-30T22:30:00Z')});
 assert.equal(x.status,'PERIODIC_RESEARCH_COMPLETED');assert.equal(x.reports.length,2);
 assert(s.m.has(researchWeeklyKey37(day)));assert(s.m.has(researchMonthlyKey37('2026-10-31')));
 assert(s.m.get(researchMemoryKey37).syncedPeriodIds.length===2);
 const before=s.ops.filter(x=>x.startsWith('set:')).length;
 const again=await finalizeDueResearchPeriods37({store:s,day,now:new Date('2026-10-30T22:40:00Z')});
 assert.equal(again.status,'PERIODIC_RESEARCH_COMPLETED');
 assert.equal(s.ops.filter(x=>x.startsWith('set:')).length,before);
 assert(![...s.m.keys()].some(k=>k.includes('scanner-calibration')||k.includes('netlify-deploy')));
});
await t('a later positive event does NOT erase a harmful verdict for the identical rule',()=>{
 const e1={...feedback(),externalProvenanceConfirmed:true};
 const e2={...feedback('TEST_PASSED',{evaluatedOn:'2026-11-02',sourceEvidenceId:'DT37_TEST_0123456790',
  evaluation:{independentReview:true,outOfSample:true,sameUniverseAndPeriod:true,afterCosts:true,
   sampleSize:120,candidateNetUsd:60,baselineNetUsd:30}}),externalProvenanceConfirmed:true};
 const memory=memoryFromFeedback37([e1,e2]);
 assert.equal(memory.entries[family].blocked,true);
 assert.equal(memory.entries[family].blockingVerdict,'HARMFUL_OBSERVED');
 const daily=annotateDailyProposals37({proposals:[proposal()]},memory);
 assert.equal(daily.proposals[0].priorDecision.verdict,'HARMFUL_OBSERVED');
});
await t('60 unique completed results are counted, not inflated by repeated archive reads',()=>{
 const states=Array.from({length:60},(_,i)=>({records:{['S'+i]:{position:{id:'trade'+i,
  symbol:'S'+i,setupType:'RETEST',status:'CLOSED',netUsd:i%2?2:-1,
  closedAt:'2026-10-20T20:00:00Z',openedAt:'2026-10-20T14:00:00Z'}}}}));
 const x=summarizePeriodTrades37({period:{kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'},states:[...states,...states]});
 assert.equal(x.uniqueClosed,60);assert.equal(x.bySetup.RETEST.withPaperNet,60);
 assert.equal(x.readyForDescriptiveLearning,true);assert.equal(x.causalVariantComparisonVerified,false);
});
await t('month with 12 complete sessions and 60 distinct setup outcomes still requires independent tests',()=>{
 const period={kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'};
 const days=Array.from({length:23},(_,i)=>new Date(Date.UTC(2026,9,1+i,12)).toISOString().slice(0,10))
   .filter(d=>![0,6].includes(new Date(`${d}T12:00Z`).getUTCDay()));
 const cycles=days.map(day=>({day,recordedEvidenceComplete:true,historyReadIssues:[],proposals:[proposal()]}));
 const report=consolidateResearchPeriod37({period,cycles,outcomes:{uniqueClosed:60,readyForDescriptiveLearning:true}});
 assert.equal(report.statisticsReadyForMonthlyLearning,true);
 assert.equal(report.status,'CONSOLIDATED_REQUIRES_INDEPENDENT_VALIDATION');
 assert.equal(report.candidates[0].status,'READY_FOR_INDEPENDENT_TEST_NOT_APPROVAL');
 assert.equal(report.candidates[0].eligibleForProductionApproval,false);
 assert.equal(report.canAutoApply,false);
});
await t('known historical harmful variant is excluded from monthly shortlist even with enough trades',()=>{
 const memory=memoryFromFeedback37([{...feedback(),externalProvenanceConfirmed:true}]);
 const period={kind:'MONTHLY',start:'2026-10-01',end:'2026-10-31'};
 const days=Array.from({length:23},(_,i)=>new Date(Date.UTC(2026,9,1+i,12)).toISOString().slice(0,10))
   .filter(d=>![0,6].includes(new Date(`${d}T12:00Z`).getUTCDay()));
 const cycles=days.map(day=>({day,recordedEvidenceComplete:true,historyReadIssues:[],proposals:[proposal()]}));
 const report=consolidateResearchPeriod37({period,cycles,memory,
  outcomes:{uniqueClosed:100,readyForDescriptiveLearning:true}});
 assert.equal(report.candidates[0].status,'SUPPRESSED_HISTORICAL_NEGATIVE');
 assert.equal(report.candidates[0].suppressed,true);
 assert.equal(report.candidates[0].historicalEvidenceId,'DT37_TEST_0123456789');
});
await t('period reports do not freeze before NY market close',async()=>{
 const s=store();const result=await finalizeDueResearchPeriods37({store:s,day:'2026-10-30',now:new Date('2026-10-30T15:00:00Z')});
 assert.equal(result.status,'BEFORE_NY_CLOSE_NO_CONSOLIDATION');assert.equal(s.m.size,0);
});
await t('monthly old evidence never shown as actually reviewed LLM',()=>{
 const q=annotateDailyProposals37({proposals:[proposal()]},null);
 assert.equal(q.durableMemory.loaded,false);assert.equal(q.canAutoApply,false);
});
console.log('RESEARCH_LONG_MEMORY37_PASS',tests.length+'/'+tests.length);
