/** Local-only integration rehearsal: real engine checkpoints, synthetic full-day ledger.
 * NO external provider, secrets, broker, Netlify or paid calls. This does NOT
 * prove live 390-minute processing, delivery timing or production readiness.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {analyzeUniverse} from '../netlify/functions/lib/trading.mjs';
import {updateSignalHistory} from '../netlify/functions/lib/signal-history.mjs';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
import {recordResearchMinute,summarizeMinuteAudit,ledgerKey,combineLedgerShards,researchHours,pairedDailyResearch} from '../netlify/functions/lib/research-ledger37.mjs';
import {runScheduledResearch,PILOT,dailyEvidenceReadiness} from '../netlify/functions/lib/research-openai37.mjs';
import {strategyLearningKey37} from '../netlify/functions/lib/research-learning-runtime37.mjs';
import {publicResearchSummary} from '../netlify/functions/lib/research-public37.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const profile=JSON.parse(readFileSync(resolve(root,'LOCAL_FEATURE_ACTIVATION37.json'),'utf8'));
assert.equal(profile.externalCallsAllowed,false);assert.equal(profile.paidReview.realApiAllowed,false);
assert.equal(profile.flags.AI_LLM_REVIEW_ENABLED,'false');
const DAY='2026-11-03',PREV='2026-11-02',syms=['AAA','BBB','CCC'];
const oldFlags=Object.fromEntries(Object.keys(profile.flags).map(k=>[k,process.env[k]]));
for(const [k,v] of Object.entries(profile.flags))process.env[k]=v;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('NETWORK_BLOCKED_IN_LOCAL_TEST');};
const store=()=>{const map=new Map();return {map,
  async get(k){return map.has(k)?structuredClone(map.get(k)):null},
  async setJSON(k,v,o={}){if(o.onlyIfNew&&map.has(k))return {modified:false};map.set(k,structuredClone(v));return {modified:true};},
  async list({prefix=''}={}){return {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}}};
const st=store(),checks=[];
function pass(name,details){checks.push({name,status:'PASS',details});console.log('PASS',name,details||'');}
function localTime(m,day=DAY){return `${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;}
function utc(m){return new Date(Date.UTC(2026,10,3,Math.floor(m/60)+5,m%60,4));}
function bar(day,m,i){const base=i===3?470:i===4?500:75+i*14;
  const x=base+(m-570)*(.03+i*.005)+Math.sin((m-570)/12+i)*.08;
  return {datetime:localTime(m,day),open:x-.03,high:x+.08,low:x-.1,close:x+.03,volume:15000+(m%5)*2500};}
const oldBars={SPY:[],QQQ:[]},newBars={SPY:[],QQQ:[]};
for(const [i,s] of ['AAA','BBB','CCC','SPY','QQQ'].entries()){
 oldBars[s]=Array.from({length:390},(_,j)=>bar(PREV,570+j,i));
 newBars[s]=Array.from({length:390},(_,j)=>bar(DAY,570+j,i));
}
const sharia={source:'SYNTHETIC_AAOIFI_TEST_NOT_VERIFIED',snapshotSha256:'FAKE_SOURCE_DIGEST_FOR_TEST_ONLY',methodology:'NOT_GENUINE_SHARIA_AUDIT'};
let paidMockCalls=0;
const checkpoints=[610,611,710,950,959];
let latestScanner=null,latestAi=null,aiState={},primaryEvaluations=0,aiEvaluations=0,signalCount=0;
try{
 for(const minute of checkpoints){
  const now=utc(minute),input=Object.fromEntries(Object.keys(newBars).map(k=>
    [k,[...oldBars[k].slice(-50),...newBars[k].slice(Math.max(0,minute-570-90),minute-570)]]));
  const quotes=Object.fromEntries(syms.map(k=>{const price=input[k].at(-1).close;
    return [k,{source:'Alpaca IEX latest quote',bid:+(price-.02).toFixed(4),ask:+(price+.02).toFixed(4),
      bidSize:200,askSize:200,timestamp:new Date(now.getTime()-1000).toISOString()}]}));
  const primary=await analyzeUniverse(syms,'NEVER_CALL_EXTERNAL',undefined,{},'10:30–11:29','active',{}, {}, {},
    {replayBars:input,replayQuotes:quotes,replayNow:now.toISOString()});
  assert.equal(primary.all.length,3);
  assert.equal(primary.errors.filter(e=>!String(e).startsWith('Legacy DIAGNOSTICS ONLY')).length,0,JSON.stringify(primary.errors));
  primary.generatedAt=now.toISOString();
  await updateSignalHistory(st,primary,DAY);
  latestScanner=primary.all.map(r=>({symbol:r.symbol,state:r.recommendationState,reason:r.stateReason,
    features:r.research36?.features||{},quote:r.research36?.quote||quotes[r.symbol],
    openingChecks:r.research36?.openingChecks||[],confirmationChecks:r.research36?.confirmationChecks||[],
    executionChecks:r.research36?.executionChecks||[]}));
  const ai=independentCycle({dateKey:DAY,now,minute,universe:syms,batch:syms,barMap:input,quotes,
    existing:aiState,approved:syms,sessionEndMinute:959});
  assert.equal(ai.audit.scalp37.summary.noOrders,true);
  assert.notEqual(ai.state.scalp37.status,'DISABLED_BY_DEFAULT');
  latestAi=ai.audit.snapshots;
  aiState=ai.state;primaryEvaluations+=latestScanner.length;aiEvaluations+=latestAi.length;
  // Exercise true per-minute recorder on actual engine output; later synth data is separate.
  await recordResearchMinute({store:st,kind:'scanner',day:DAY,doc:{minute,records:latestScanner,shariaEvidence:sharia,cycleStatus:'COMPLETED'}});
  await recordResearchMinute({store:st,kind:'ai',day:DAY,doc:{...ai.audit,shariaEvidence:sharia,cycleStatus:'COMPLETED'}});
 }
 pass('REAL_SCANNER_ANALYSIS_AND_SIGNAL_HISTORY',`${checkpoints.length} checkpoints, ${primaryEvaluations} evaluated stock rows`);
 pass('REAL_AI_AND_PAPER_SCALP_ENGINE',`${checkpoints.length} checkpoints, ${aiEvaluations} evaluated AI rows; scalp enabled`);
 // Simulated per-minute data is only for exercising report readiness and routing.
 // It MUST NOT be described as 390 authentic engine outcomes or market coverage.
 for(const kind of ['scanner','ai']){
  for(const hour of researchHours){
   const minutes={};
   for(let m=570;m<=959;m++)if(Math.floor(m/60)===hour){
    const quotesSynthetic=syms.map((symbol,i)=>({symbol,state:'WAIT',reason:'SYNTHETIC_REPORT_ROUTE_TEST',
      features:{price:75+i*14,atrPct:.4,momentum5Pct:.25},
      quote:{bid:75+i*14-.02,ask:75+i*14+.02,bidSize:200,askSize:200,
        timestamp:utc(m).toISOString(),source:'Alpaca IEX synthetic fixture'},
      openingChecks:[{gate:'SYNTHETIC_MARKER',passed:false}]}));
    const doc={minute:m,shariaEvidence:sharia,cycleStatus:'COMPLETED',
      ...(kind==='scanner'?{records:quotesSynthetic}:{snapshots:quotesSynthetic})};
    minutes[String(m).padStart(4,'0')]=summarizeMinuteAudit({kind,day:DAY,doc});
   }
   await st.setJSON(ledgerKey(kind,DAY,hour*60),{
     schemaVersion:'3.7-RESEARCH-LEDGER-1',kind,day:DAY,hour,minutes,
     testTag:'SYNTHETIC_COMPLETENESS_FOR_E2E_ROUTE_ONLY'});
  }
 }
 const sc=combineLedgerShards('scanner',DAY,await Promise.all(researchHours.map(h=>st.get(ledgerKey('scanner',DAY,h*60)))));
 const ai=combineLedgerShards('ai',DAY,await Promise.all(researchHours.map(h=>st.get(ledgerKey('ai',DAY,h*60)))));
 const audit=pairedDailyResearch(sc,ai);assert.equal(audit.complete,true);
 assert.equal(audit.streams.scanner.storedMinutes,390);assert.equal(audit.streams.ai.storedMinutes,390);
 const readiness=dailyEvidenceReadiness(audit);
 assert.equal(readiness.ok,true,JSON.stringify(readiness));
 pass('SYNTHETIC_390_MINUTE_REPORT_INPUT','390/390 generated rows per stream; NOT actual full-day scanner execution');
 const h=await st.get(`signal-history-${DAY}`);assert.equal(Object.keys(h.signals).length,3);
 signalCount=Object.values(h.signals).reduce((x,y)=>x+(y.confirmedSignals||[]).length,0);
 await st.setJSON(`ai-parallel-state-${DAY}`,aiState);
 await st.setJSON(`ai-parallel-recommendations-${DAY}`,{outcomes:{},topBlockers:[],comparison:{}});
 await st.setJSON('ai-parallel-session-index',{days:[DAY]});
 const testReview={summary_ar:'اختبار تكامل اصطناعي وليس تقرير سوق حقيقي',
  observations:[{fact_ar:'تم قبول سجلات اصطناعية كاملة لأجل تجربة مسار التقرير',metric_ref:'NONE',
    evidence_ids:[`DT37_${DAY}`],limitation_ar:'لا يمثل فحصاً حيّاً أو بيانات حقيقية'}],
  experiments:[{area:'AUDIT_RETENTION',hypothesis_ar:'فحص اكتمال الأرشيف الحقيقي مستقلاً',
    evidence_ids:[`DT37_${DAY}`],test_ar:'مقارنة الأرشيف مع المصدر الأصلي',
    expected_risk_ar:'بيانات غير مكتملة',acceptance_metric_ar:'تطابق المصدر مع 390 دقيقة',confidence:'LOW'}],
  uncertainties_ar:['البيانات كلها اصطناعية']};
 const mockFetch=async(url,opts)=>{paidMockCalls++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(opts.body).model,PILOT.model);
  assert.match(opts.headers.authorization,/LOCAL_FAKE_ONLY/);
  return {ok:true,status:200,headers:{get:()=> 'application/json'},
    json:async()=>({id:'LOCAL_MOCK',model:PILOT.model,usage:{input_tokens:1200,output_tokens:450},
      output:[{content:[{type:'output_text',text:JSON.stringify(testReview)}]}]})};};
 const env={...profile.flags,OPENAI_RESEARCH_API_KEY:'LOCAL_FAKE_ONLY',OPENAI_RESEARCH_MODEL:PILOT.model};
 const now=new Date('2026-11-03T22:30:00Z');
 const reviewResult=await runScheduledResearch({store:st,env,now,fetchFn:mockFetch});
 assert.equal(reviewResult.status,'REVIEW_CREATED_NOT_APPLIED',JSON.stringify(reviewResult));
 assert.equal(reviewResult.learningStatus,'LEARNED_WITH_OPENAI_REVIEW');
 assert.equal(paidMockCalls,1);
 pass('MOCKED_PAID_REVIEW_PERSISTED','real paid API calls 0, simulated HTTP calls 1');
 const learning=await st.get(strategyLearningKey37(DAY));
 assert.equal(learning.openai.included,true);assert.equal(learning.canTrade,false);
 assert(learning.proposals.every(p=>!p.applied));
 pass('DETERMINISTIC_LEARNING_AND_REVIEW_LINKED','no strategy changes');
 const publicView=publicResearchSummary({day:DAY,
  review:await st.get(`dt37-openai37-review-${DAY}`),
  local:await st.get(`dt37-research-agent-daily-${DAY}`),
  evidence:await st.get(`dt37-research-evidence-quality-${DAY}`),learning,
  budget:await st.get('dt37-openai37-budget-one-month-20261102')});
 assert.equal(publicView.learning.status,'OPENAI_CONNECTED_TO_STRATEGY_LEARNING');
 assert.equal(publicView.experiments.length,1);assert.equal(publicView.canApplyChanges,false);
 assert.equal(publicView.canTrade,false);
 assert(!JSON.stringify(publicView).includes('LOCAL_FAKE_ONLY'));
 const rerun=await runScheduledResearch({store:st,env,now,fetchFn:mockFetch});
 assert.equal(rerun.status,'ALREADY_REVIEWED');assert.equal(paidMockCalls,1);
 pass('RESEARCH_REPORT_PUBLIC_AND_IDEMPOTENT','UI-safe report stored; no second paid-mock request');
 let emptyCalls=0;const empty=await runScheduledResearch({store:store(),env,now,
  fetchFn:async()=>{emptyCalls++;throw Error('MUST_NOT_CALL')}});
 assert.equal(empty.status,'NO_SESSION_EVIDENCE');assert.equal(emptyCalls,0);
 pass('FAIL_CLOSED_WITH_NO_ARCHIVE','OpenAI not called when no state exists');
 const output={schema:'DT37_ACTIVATED_LOCAL_E2E_V2',day:DAY,
  activation:profile.flags,scope:'LOCAL_ONLY_NO_DEPLOY',realEngineCheckpoints:checkpoints,
  realScannerRows:primaryEvaluations,realAiRows:aiEvaluations,
  syntheticLedgerMinutesPerStream:390,syntheticLedgerAuthenticMinutes:0,
  actualFullDayEngineContinuityVerified:false,
  realPaidApiCalls:0,mockedPaidApiCalls:paidMockCalls,
  realNetlifyWrites:0,brokerOrders:0,externalReportSent:false,
  scannerConfirmedSignalsOnCheckpoints:signalCount,scalpPaperEntriesOnCheckpoints:aiState.scalp37.tradeCount,
  report:{status:reviewResult.status,learningStatus:reviewResult.learningStatus,
    evidenceReadyForSyntheticFixture:readiness.ok,publicView:publicView.learning.status,
    proposalCount:publicView.learning.proposals.length,repeatedRunStatus:rerun.status},
  checks,notVerified:['Real 390-minute continuous scanner execution','real source data and AAOIFI provenance',
    'real OpenAI review delivery/billing','real Netlify Blob and credits','browser UI and push notifications',
    'external report distribution','independent audit','live market price quote timing and real P&L']};
 const dest=resolve(root,'DT37_ACTIVATED_E2E_LOCAL_RESULTS.json');
 writeFileSync(dest,JSON.stringify(output,null,2)+'\n');
 console.log('DT37_ACTIVATED_LOCAL_E2E_PASS',checks.length+'/'+checks.length);
}catch(e){console.error('DT37_ACTIVATED_LOCAL_E2E_FAILED',e.stack||String(e));process.exitCode=1;
}finally{
 globalThis.fetch=originalFetch;
 for(const [k,v] of Object.entries(oldFlags)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
