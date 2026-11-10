import assert from 'node:assert/strict';
import {summarizeMinuteAudit,ledgerKey} from '../netlify/functions/lib/research-ledger37.mjs';
import {buildDailyDiagnostic37,publishDailyDiagnostic37,dailyResearchKey37,researchExpectedMinutes37} from '../netlify/functions/lib/daily-research-diagnostic37.mjs';
import {dailyEvidenceReadiness,verifyReview,buildEvidence,callOpenAiResearch,researchBudgetKey37,PILOT} from '../netlify/functions/lib/research-openai37.mjs';
import {publicResearchSummary} from '../netlify/functions/lib/research-public37.mjs';
import {summarizeRetiredPeriod372 as summarizePeriodScalp37,retiredBookHistory372 as scalpResearchHistory37} from '../netlify/functions/lib/retired-history372.mjs';
import {generateStrategyLearningCycle37} from '../netlify/functions/lib/research-strategy-cycle37.mjs';
import {pairedDailyResearch} from '../netlify/functions/lib/research-ledger37.mjs';
import {readFileSync} from 'node:fs';
const day='2026-11-05',now=new Date('2026-11-05T22:16:00.000Z');
const state=()=>{const map=new Map();let writes=0;return {map,get writes(){return writes},async get(key){return map.has(key)?structuredClone(map.get(key)):null},
 async setJSON(key,value,opts={}){if(opts.onlyIfNew&&map.has(key))return {modified:false};writes++;map.set(key,structuredClone(value));return {modified:true}}}};
function shard(kind,minute=650){const evidence={source:'AAOIFI',snapshotSha256:'simulated'};
 const row={symbol:'ABC',state:'SMART',reason:'WAIT_RETEST',features:{price:12,openingReturnPct:1},
  checks:[{gate:'test',reason:'WAIT_RETEST',passed:false}],quote:{bid:11.99,ask:12,bidSize:2,askSize:2,timestamp:now.toISOString(),source:'Alpaca IEX'}};
 const entry=summarizeMinuteAudit({kind,day,doc:{minute,shariaEvidence:evidence,
  ...(kind==='scanner'?{records:[row]}:{snapshots:[row]})}});
 return {kind,day,schemaVersion:'3.7-RESEARCH-LEDGER-1',minutes:{[String(minute).padStart(4,'0')]:entry}};
}
let count=0;
async function test(label,fn){await fn();count++;console.log('PASS',label)}
await test('local report exists with zero verified shards, no invented zero trades',async()=>{
 const s=state();const {report}=await publishDailyDiagnostic37({store:s,day,now});
 assert.equal(report.status,'NO_VERIFIED_SCANNER_DATA');assert.equal(report.engines.scanner.storedMinutes,null);
 assert.equal(report.engines.ai.observations,null);assert.equal(report.mode,'LOCAL_NO_OPENAI_SPEND');
 assert.equal(report.canApplyChanges,false);assert.equal(s.map.get(dailyResearchKey37(day)).digest,report.digest);
});
await test('missing hourly shards is a partial evidence day, not a quiet market',async()=>{
 const s=state();for(const kind of ['scanner','ai'])s.map.set(ledgerKey(kind,day,600),shard(kind));
 const {report}=await publishDailyDiagnostic37({store:s,day,now});
 assert.equal(report.status,'PARTIAL_EVIDENCE');assert.equal(report.engines.ai.storedMinutes,1);
 assert.equal(report.engines.scanner.missingMinutes,329);assert.equal(report.recommendations[0].area,'ARCHIVE_COVERAGE');
 assert.equal(report.engines.ai.topReasons[0].count,1);
});
await test('local report is stored before optional OpenAI, idempotent rerun',async()=>{
 const s=state();const first=await publishDailyDiagnostic37({store:s,day,now});const before=s.writes;
 const second=await publishDailyDiagnostic37({store:s,day,now});assert.equal(second.alreadySaved,true);
 assert.equal(s.writes,before);assert.equal(second.report.digest,first.report.digest);
});
await test('daily report persists when source read fails',async()=>{
 const s=state();const broken={...s,async get(key){if(key.startsWith('dt37-research-ledger-ai'))throw Error('NO_BLOB');return s.get(key)}};
 const result=await publishDailyDiagnostic37({store:broken,day,now});
 assert.equal(result.report.status,'NO_VERIFIED_SCANNER_DATA');
 assert.equal(result.report.readFailures.length,7);assert.equal(result.report.engines.ai.storedMinutes,null);
});
await test('corrupted hourly source cannot suppress diagnostic',async()=>{
 const s=state();s.map.set(ledgerKey('ai',day,600),{kind:'WRONG',day,minutes:{'0650':{}}});
 const result=await publishDailyDiagnostic37({store:s,day,now});
 assert(result.report.readFailures.some(x=>x.source==='AI_LEDGER_INVALID'));
 assert.equal(result.report.engines.ai.status,'NOT_RECORDED');
});
await test('failed report write never asserts daily success',async()=>{
 const s=state();const broken={...s,async setJSON(){return {modified:true}}};
 await assert.rejects(publishDailyDiagnostic37({store:broken,day,now}),/PERSIST_NOT_VERIFIED/);
});
await test('failed report write throws before any paid request can be invoked by handler',async()=>{
 const s=state();const broken={...s,async setJSON(){throw Error('STORAGE_FAIL')}};
 await assert.rejects(publishDailyDiagnostic37({store:broken,day,now}),/STORAGE_FAIL/);
});
await test('display local daily when paid review absent',async()=>{
 const daily=buildDailyDiagnostic37({day,now});const res=publicResearchSummary({day,daily});
 assert.equal(res.status,'LOCAL_DAILY_REPORT');assert(res.summary.includes('لم تتوفر سجلات'));
 assert.equal(res.paidStatus,'NOT_RUN');assert.equal(res.daily.engines.scanner.storedMinutes,null);
 assert.equal(res.budget.limitUsd,3);
});
await test('paid failure does not overwrite verified local digest',async()=>{
 const daily=buildDailyDiagnostic37({day,now});const res=publicResearchSummary({day,daily,review:{status:'FAILED_NO_RETRY'}});
 assert.equal(res.status,'LOCAL_DAILY_REPORT');assert.equal(res.paidStatus,'FAILED_NO_RETRY');
 assert(res.summary.includes('لم تتوفر سجلات'));
});
await test('window report matches 330 normal and 150 early close minutes',async()=>{
 assert.equal(researchExpectedMinutes37({DT37_RESEARCH_EXPECTED_MINUTES:'330'}),330);
 assert.equal(researchExpectedMinutes37({}),330);
 assert.equal(researchExpectedMinutes37({},'2026-11-05'),330);
 assert.equal(researchExpectedMinutes37({},'2026-11-27'),150);
 const stream={storedMinutes:330,missingMinutes:Array.from({length:60},(_,i)=>900+i),attemptedRows:330,
  failedCycles:0,withFeature:330,withChecks:330,shariaSnapshots:[{a:1}],quote:{valid:330,withTimestamp:330}};
 const audit={streams:{scanner:stream,ai:stream}};
 assert.equal(dailyEvidenceReadiness(audit).ok,false);
 assert.equal(dailyEvidenceReadiness(audit,{expectedMinutes:330,minimumMinutes:315}).ok,true);
});
await test('standalone scalp is authoritative over duplicate legacy paper rows',async()=>{
 const pos={id:'P1',symbol:'ABC',status:'CLOSED',closedAt:'2026-11-05T19:00:00Z',openedAt:'2026-11-05T18:00:00Z',
  setupType:'VWAP_RECLAIM_SCALP',netUsd:3.25};
 const period={start:day,end:day};const old={dateKey:day,scalp37:{schemaVersion:'3.7-SCALP-PAPER-1',closedOutcomes:[pos]}};
 const standalone={day,book:{records:{ABC:{position:pos}},closedOutcomes:[pos]}};
 const result=summarizePeriodScalp37({period,states:[old],standaloneStates:[standalone]});
 assert.equal(result.uniqueClosed,1);assert.equal(result.withPaperNet,1);assert.equal(result.bySetup.VWAP_RECLAIM_SCALP.paperNetUsd,3.25);
 assert.equal(result.standaloneDays,1);
});
await test('unpriced scalp trades cannot create artificial profits',async()=>{
 const pos={id:'P2',symbol:'ABC',status:'CLOSED',closedAt:'2026-11-05T19:00:00Z',openedAt:'2026-11-05T18:00:00Z',
  setupType:'MOMENTUM_SCALP',netUsd:null};
 const result=summarizePeriodScalp37({period:{start:day,end:day},standaloneStates:[{day,book:{closedOutcomes:[pos]}}]});
 assert.equal(result.uniqueClosed,1);assert.equal(result.withPaperNet,0);assert.equal(result.bySetup.MOMENTUM_SCALP.withPaperNet,0);
});
await test('a failed scanner cycle remains degraded despite saved minute shard',async()=>{
 const scanner=shard('scanner'),ai=shard('ai');
 scanner.minutes['0650'].status='FAILED';
 const report=buildDailyDiagnostic37({day,now,scanner,ai});
 assert.equal(report.engines.scanner.failedCycles,1);
 assert.equal(report.status,'PARTIAL_EVIDENCE');
 assert.equal(report.canApplyChanges,false);
});
await test('model empty response cannot count as actionable review',async()=>{
 const ev=buildEvidence({day,aiState:{updatedAt:now.toISOString(),records:{}}});
 const out=verifyReview({summary_ar:'',observations:[],experiments:[],uncertainties_ar:[]},ev);
 assert.equal(out.quality,'NO_ACTIONABLE_REVIEW');
 await assert.rejects(()=>callOpenAiResearch({evidence:ev,apiKey:'dummy',fetchFn:async()=>({ok:true,status:200,
  json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({summary_ar:'',observations:[],experiments:[],uncertainties_ar:[]})}]}]})})}),
 /OPENAI_NO_ACTIONABLE/);
});
await test('model unsupported profit guarantee is filtered as unverified',async()=>{
 const ev=buildEvidence({day,aiState:{updatedAt:now.toISOString(),records:{}}});
 const doc={summary_ar:'demo',observations:[{fact_ar:'ربح مضمون بنسبة 95%',limitation_ar:'لكن هناك نقص البيانات',evidence_ids:[`DT37_${day}`]}],
  experiments:[{area:'COVERAGE',hypothesis_ar:'فحص توافر الدقائق المفقودة',test_ar:'قارن أرشيف الدقائق',expected_risk_ar:'ضعف عينة البيانات',acceptance_metric_ar:'نسبة الدقائق المكتملة',confidence:'LOW',evidence_ids:[`DT37_${day}`]}]};
 const result=verifyReview(doc,ev);assert.equal(result.observations.length,0);
 assert.equal(result.quality,'NO_ACTIONABLE_REVIEW');
});
await test('research budget rotates monthly while November old ledger remains readable',async()=>{
 assert.equal(researchBudgetKey37('2026-11-05'),'dt37-openai37-budget-one-month-20261102');
 assert.equal(researchBudgetKey37('2026-12-04'),'dt37-openai37-budget-2026-12');
 assert(PILOT.maxCalls*PILOT.reservePerCallUsd<=PILOT.budgetUsd);
 assert.equal(PILOT.endExclusive,null);
});
await test('daily learning uses standalone scalp over same-day embedded legacy book',async()=>{
 const pos={id:'Z1',symbol:'ABC',status:'CLOSED',closedAt:'2026-11-05T20:00:00Z',openedAt:'2026-11-05T18:00:00Z',
  setupType:'VWAP_RECLAIM_SCALP',netUsd:-1.7};
 const source=[{day,book:{closedOutcomes:[pos]},gateCounts:{SPREAD_TOO_WIDE:4}}];
 const legacy=[{dateKey:day,scalp37:{schemaVersion:'3.7-SCALP-PAPER-1',closedOutcomes:[{...pos,netUsd:999}],entryRejections:{SPREAD_TOO_WIDE:120}}}];
 const summary=scalpResearchHistory37(legacy,day,'2026-11-05T22:30:00Z',source);
 assert.equal(summary.uniqueClosed,1);assert.equal(summary.netModeledUsd,-1.7);
 assert.equal(summary.rejectionsToday.SPREAD_TOO_WIDE,4);
});
await test('retired scalp does not enter daily strategy learning',async()=>{
 const audit=pairedDailyResearch(shard('scanner'),shard('ai'));
 const pos={id:'D1',symbol:'ABC',status:'CLOSED',closedAt:'2026-11-05T20:00:00Z',openedAt:'2026-11-05T18:00:00Z',
  setupType:'VWAP_RECLAIM_SCALP',netUsd:-2};
 const cycle=generateStrategyLearningCycle37({day,audit,aiState:{updatedAt:now.toISOString()},scannerHistory:{signals:{}},now:now.toISOString(),
  standaloneScalpStates:[{day,book:{closedOutcomes:[pos]},gateCounts:{SPREAD_TOO_WIDE:4}}]});
 assert.equal(cycle.historical.scalp,undefined);
 assert(!cycle.proposals.some(p=>p.engines.includes('SCALP')));
 assert.equal(cycle.canAutoApply,false);
});
await test('API optional weekly failure does not hide locally saved daily status',async()=>{
 const src=readFileSync(new URL('../netlify/functions/research-status37.mjs',import.meta.url),'utf8');
 const transformed=src.replace(/^import .*;\n/gm,'');
 const stub=`const newYorkDay=()=> '${day}';\nconst researchBudgetKey37=()=> 'budget';\nconst dailyResearchKey37=()=> 'daily';\nconst PILOT={budgetUsd:3};\nconst strategyLearningKey37=()=> 'learning';\nconst recentResearchReportEnds37=()=>({weekly:'2026-11-06',monthly:'2026-11-30'});\nconst researchWeeklyKey37=()=> 'weekly';\nconst researchMonthlyKey37=()=> 'monthly';\nconst researchMemoryKey37='memory';\nconst getStore=()=>globalThis.__reportFakeStore;\nconst publicResearchSummary=({day,daily})=>({day,status:daily?'LOCAL_DAILY_REPORT':'NO_REVIEW'});\n`;
 const {default:handle}=await import(`data:text/javascript;base64,${Buffer.from(stub+transformed).toString('base64')}`);
 const sample=buildDailyDiagnostic37({day,now});
 globalThis.__reportFakeStore={async get(key){if(key==='weekly')throw Error('INJECTED_WEEKLY_FAILURE');
  if(key==='daily')return sample;return null}};
 const response=await handle(new Request(`https://local.invalid/research-status?day=${day}&includePeriods=1`));
 assert.equal(response.status,200);const parsed=await response.json();
 assert.equal(parsed.status,'LOCAL_DAILY_REPORT');assert(parsed.periodWarnings.includes('WEEKLY_ARCHIVE_READ_FAILED'));
});
await test('LLM numeric claim with valid citation but false metric is rejected',async()=>{
 const ev=buildEvidence({day,aiState:{updatedAt:now.toISOString(),records:{}},
  stats:{topBlockers:[{reason:'SPREAD',count:31}]}});
 const mk=fact_ar=>({summary_ar:'سجل تحليل',observations:[{fact_ar,metric_ref:'blocker.SPREAD',
  limitation_ar:'العدد هو تقييمات متكررة وليس فرصاً رابحة',evidence_ids:[ev.sourceId]}],
  experiments:[{area:'COSTS_SPREAD',hypothesis_ar:'فحص أثر السبريد على الإشارات',
   test_ar:'إعادة اختبار مستقلة خارج العينة',expected_risk_ar:'انحياز بيانات التقييمات المتكررة',
   acceptance_metric_ar:'تحسن النتائج بعد التكاليف',confidence:'LOW',evidence_ids:[ev.sourceId]}]});
 assert.equal(verifyReview(mk('99 رفضاً بسبب السبريد'),ev).quality,'NO_ACTIONABLE_REVIEW');
 const valid=verifyReview(mk('31 رفضاً بسبب السبريد'),ev);
 assert.equal(valid.observations.length,1);assert.equal(valid.observations[0].metricValueMatched,true);
 assert.equal(valid.meaningExternallyVerified,false);
});
console.log('DT37_DAILY_AGENT_HARDENING_TESTS_PASS',count+'/'+count);
