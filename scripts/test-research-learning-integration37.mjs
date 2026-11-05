import assert from 'node:assert/strict';
import {summarizeMinuteAudit,ledgerKey} from '../netlify/functions/lib/research-ledger37.mjs';
import {runScheduledResearch,PILOT} from '../netlify/functions/lib/research-openai37.mjs';
import {strategyLearningKey37,runLocalStrategyLearning37} from '../netlify/functions/lib/research-learning-runtime37.mjs';
import {publicResearchSummary} from '../netlify/functions/lib/research-public37.mjs';
const DAY='2026-11-03',now=new Date('2026-11-03T22:30:00Z');
const makeStore=()=>{const m=new Map();return {m,async get(k){return m.has(k)?structuredClone(m.get(k)):null},async setJSON(k,v,o={}){
 if(o.onlyIfNew&&m.has(k))return {modified:false};m.set(k,structuredClone(v));return {modified:true};}}};
function fixture(store){
 const source={source:'AAOIFI_TEST',snapshotSha256:'STABLE',methodology:'AAOIFI'};
 const row={symbol:'XYZ',state:'WAIT',reason:'SPREAD_TOO_WIDE',features:{price:50,atrPct:.4},
  quote:{bid:49.8,ask:50.2,bidSize:10,askSize:12,timestamp:'2026-11-03T16:00:00Z',source:'Alpaca IEX'},
  checks:{opening:[{gate:'spread_limit',reason:'SPREAD_TOO_WIDE',passed:false}]}};
 for(const kind of ['scanner','ai'])for(const hour of [9,10,11,12,13,14,15]){
  const minutes={};for(let minute=570;minute<960;minute++)if(Math.floor(minute/60)===hour){
   minutes[String(minute).padStart(4,'0')]=summarizeMinuteAudit({kind,day:DAY,
    doc:{minute,shariaEvidence:source,...(kind==='scanner'?{records:[row]}:{snapshots:[row]})}});
  }
  store.m.set(ledgerKey(kind,DAY,hour*60),{schemaVersion:'3.7-RESEARCH-LEDGER-1',kind,day:DAY,minutes});
 }
 store.m.set('ai-parallel-state-'+DAY,{updatedAt:'2026-11-03T22:25:00Z',records:{XYZ:{position:{id:'ai1',status:'CLOSED',closedAt:'2026-11-03T20:40:00Z',netUsd:-4,setupType:'RETEST'}}},
  lastPolicy:{params:{maxSpreadBps:9}},cycles:390,cumulativeScanned:['XYZ']});
 store.m.set('signal-history-'+DAY,{signals:{XYZ:{confirmedSignals:[{signalId:'sig1',finalOutcome:'T1',closedAt:'2026-11-03T20:35:00Z'}]}}});
 store.m.set('ai-parallel-recommendations-'+DAY,{outcomes:{completedComparable:1},topBlockers:[{reason:'SPREAD_TOO_WIDE',count:390}],comparison:{aiTrades:1}});
 store.m.set('ai-parallel-session-index',{days:[DAY,'2026-11-02']});
 store.m.set('signal-history-session-index-v35',{sessions:[{dateKey:DAY},{dateKey:'2026-11-02'}]});
 store.m.set('ai-parallel-state-2026-11-02',{updatedAt:'2026-11-02T22:00Z',closedOutcomes:[
  {id:'oldAI',status:'CLOSED',closedAt:'2026-11-02T20:55Z',netUsd:3,setupType:'EARLY'}]});
 store.m.set('signal-history-2026-11-02',{signals:{XYZ:{confirmedSignals:[
  {signalId:'oldSIG',finalOutcome:'SL',closedAt:'2026-11-02T20:30Z'}]}}});
}
let calls=0;const parsed={summary_ar:'اختبر السبريد',observations:[{fact_ar:'رفض بسبب السبريد',evidence_ids:[`DT37_${DAY}`],limitation_ar:'ليس دليلاً ربحياً'}],
 experiments:[{area:'COSTS_SPREAD',hypothesis_ar:'ضبط حد السبريد قبل فتح الصفقة',
  evidence_ids:[`DT37_${DAY}`],test_ar:'قارن نفس الأسعار بنظام ورقي خارج العينة',expected_risk_ar:'قد يفقد فرصاً',
  acceptance_metric_ar:'صافي الربح بعد التكاليف',confidence:'LOW'}],uncertainties_ar:[]};
const fetchFn=async()=>{calls++;return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({id:'resp_demo',model:PILOT.model,
 usage:{input_tokens:1000,output_tokens:300},output:[{content:[{type:'output_text',text:JSON.stringify(parsed)}]}]})}};
const checks=[];const t=async(label,fn)=>{await fn();checks.push(label);console.log('PASS',label)};
await t('post-close deterministic learning works without OpenAI and reads two scanners',async()=>{
 const s=makeStore();fixture(s);const x=await runScheduledResearch({store:s,env:{DT37_RESEARCH_LEARNING_ENABLED:'true',OPENAI_RESEARCH_ENABLED:'false'},now,fetchFn});
 assert.equal(x.status,'LEARNED_FROM_ARCHIVES_ONLY');assert.equal(calls,0);
 const cycle=s.m.get(strategyLearningKey37(DAY));assert.equal(cycle.scannerMistakes.observedRows,390);
 assert.equal(cycle.aiMistakes.observedRows,390);assert.equal(cycle.recordedEvidenceComplete,true);
 assert.equal(cycle.historical.ai.closedUnique,2);assert.equal(cycle.historical.scanner.closedUnique,2);
 assert(cycle.proposals.length>=2);assert.equal(cycle.openai.included,false);
 assert(cycle.proposals.every(p=>!p.applied));
});
await t('OpenAI report upgrades same daily learning artifact and proposals are publicly read-only',async()=>{
 const s=makeStore();fixture(s);const args={store:s,now,fetchFn,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test_only',DT37_RESEARCH_LEARNING_ENABLED:'true'}};
 const a=await runScheduledResearch(args);assert.equal(a.status,'REVIEW_CREATED_NOT_APPLIED');assert.equal(a.learningStatus,'LEARNED_WITH_OPENAI_REVIEW');
 const cycle=s.m.get(strategyLearningKey37(DAY));assert.equal(cycle.openai.included,true);
 assert(cycle.proposals.some(p=>p.source==='OPENAI_REVIEW'));
 const view=publicResearchSummary({day:DAY,learning:cycle,review:s.m.get('dt37-openai37-review-'+DAY)});
 assert.equal(view.learning.status,'OPENAI_CONNECTED_TO_STRATEGY_LEARNING');
 assert.equal(view.learning.manualApprovalRequired,true);assert.equal(view.canTrade,false);
 assert(!JSON.stringify(view).includes('test_only'));assert.equal((await runScheduledResearch(args)).status,'ALREADY_REVIEWED');
 assert.equal(calls,1);
});
await t('historical trade outcomes remain deduplicated and no outside-day data leakage',async()=>{
 const s=makeStore();fixture(s);
 const past=s.m.get('ai-parallel-state-2026-11-02');past.closedOutcomes.push(past.closedOutcomes[0]);
 past.closedOutcomes.push({id:'future',status:'CLOSED',closedAt:'2026-11-04T12:00:00Z',netUsd:9999});
 s.m.set('ai-parallel-state-2026-11-02',past);
 const x=await runLocalStrategyLearning37({store:s,day:DAY,now});assert.equal(x.status,'LEARNED_FROM_ARCHIVES_ONLY');
 const cycle=s.m.get(strategyLearningKey37(DAY));assert.equal(cycle.historical.ai.closedUnique,2);
 assert.equal(cycle.historical.ai.netPaperUsd,-1);
});
await t('OpenAI failed request still leaves deterministic learning and NEVER applies variant',async()=>{
 const s=makeStore();fixture(s);let failed=0;const failure=async()=>{failed++;return {ok:false,status:429}};
 const x=await runScheduledResearch({store:s,now,fetchFn:failure,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test_only',DT37_RESEARCH_LEARNING_ENABLED:'true'}});
 assert.equal(x.status,'FAILED_NO_RETRY');assert.equal(failed,1);
 const cycle=s.m.get(strategyLearningKey37(DAY));assert(cycle&&cycle.proposals.length>0);
 assert.equal(cycle.openai.included,false);assert.equal(cycle.canTrade,false);
});
await t('OpenAI missing key learns recorded errors but never spends',async()=>{
 const s=makeStore();fixture(s);const prev=calls;
 const x=await runScheduledResearch({store:s,now,fetchFn,env:{OPENAI_RESEARCH_ENABLED:'true',DT37_RESEARCH_LEARNING_ENABLED:'true'}});
 assert.equal(x.status,'LEARNED_FROM_ARCHIVES_ONLY');assert.equal(calls,prev);
});
await t('missing ledger refuses invented success and never bills',async()=>{
 const s=makeStore();const prev=calls;
 const x=await runScheduledResearch({store:s,now,fetchFn,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test',DT37_RESEARCH_LEARNING_ENABLED:'true'}});
 assert.equal(x.status,'NO_SESSION_EVIDENCE');assert.equal(calls,prev);
});
await t('never handles manual approvals or writes scanner calibration',async()=>{
 const s=makeStore();fixture(s);await runLocalStrategyLearning37({store:s,day:DAY,now});
 assert(![...s.m.keys()].some(k=>k.startsWith('scanner-calibration-')||k.startsWith('netlify-deploy')));
 assert(s.m.get(strategyLearningKey37(DAY)).proposals.every(x=>x.approvalStatus==='DAILY_OBSERVATION_NOT_FINAL'));
});
console.log('RESEARCH_LEARNING_INTEGRATION37_PASS',checks.length+'/'+checks.length);
