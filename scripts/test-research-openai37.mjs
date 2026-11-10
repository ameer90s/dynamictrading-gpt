import assert from 'node:assert/strict';
import {summarizeMinuteAudit,ledgerKey} from '../netlify/functions/lib/research-ledger37.mjs';
import {PILOT,newYorkDay,buildEvidence,verifyReview,estimatedCostUsd,callOpenAiResearch,runScheduledResearch} from '../netlify/functions/lib/research-openai37.mjs';
const testDate=new Date('2026-11-03T22:30:00.000Z');
function store(){let map=new Map();return {map,async get(k){return map.has(k)? structuredClone(map.get(k)):null},async setJSON(k,v,o={}){if(o.onlyIfNew&&map.has(k))return {modified:false};map.set(k,structuredClone(v));return {modified:true}},async list({prefix}){return {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}}}
function evidence(s){s.map.set('ai-parallel-state-2026-11-03',{
  updatedAt:'2026-11-03T21:00:00Z',cycles:391,reasonCounters:{SPREAD:31,NO_QUOTE:2},records:{ABC:{symbol:'ABC',position:{status:'CLOSED',entry:52.5,netUsd:-1.3,mfePct:0.4,maePct:-1.1}}},cumulativeScanned:['ABC']});
  s.map.set('ai-parallel-recommendations-2026-11-03',{outcomes:{completedComparable:1,profitableProxy:0,winRateProxyPct:0},topBlockers:[{reason:'SPREAD',count:31}],comparison:{aiTrades:1,scannerComparableEvents:1}});
  s.map.set('signal-history-2026-11-03',{signals:{ABC:{confirmedSignals:[]}}});
  const ledgers={scanner:{schemaVersion:'3.7-RESEARCH-LEDGER-1',kind:'scanner',day:'2026-11-03',minutes:{}},
    ai:{schemaVersion:'3.7-RESEARCH-LEDGER-1',kind:'ai',day:'2026-11-03',minutes:{}}};
  for(let minute=570;minute<960;minute++){
    const suffix=String(minute).padStart(4,'0');
    const shariaEvidence={source:'AAOIFI_TEST',snapshotSha256:'test-source-verified',methodology:'AAOIFI'};
    const scanner={minute,shariaEvidence,records:[{symbol:'ABC',state:'WAIT',reason:'SPREAD_TOO_WIDE',features:{price:52},
      openingChecks:[{gate:'opening_return',passed:false,reason:'WEAK'}],quote:{bid:51.9,ask:52.1,bidSize:6,askSize:8,timestamp:'2026-11-03T16:00:00Z',spreadBps:38,source:'Alpaca IEX'}}]};
    const ai={minute,shariaEvidence,snapshots:[{symbol:'ABC',state:'SMART',reason:'AWAITING_RETEST',features:{price:52.5},
      checks:{candidate:[{gate:'retest',passed:false}]},quote:{bid:52.3,ask:52.5,bidSize:8,askSize:6,timestamp:'2026-11-03T16:00:00Z',spreadBps:38,source:'Alpaca IEX'}}]};
    for(const [kind,doc] of [['scanner',scanner],['ai',ai]]){
      ledgers[kind].minutes[suffix]=summarizeMinuteAudit({kind,day:'2026-11-03',doc});
    }
  }
  for(const [kind,ledger] of Object.entries(ledgers)){for(const hour of [9,10,11,12,13,14,15])s.map.set(ledgerKey(kind,'2026-11-03',hour*60),{...ledger,minutes:Object.fromEntries(Object.entries(ledger.minutes).filter(([minute])=>Math.floor(Number(minute)/60)===hour))})};

}
const resultReview={summary_ar:'السبريد مرتفع',observations:[{fact_ar:'تم حفظ 390 دقيقة من الماسح الأساسي',metric_ref:'archive.scannerMinutes',evidence_ids:['DT37_2026-11-03'],limitation_ar:'لا بيانات SIP'}],experiments:[{area:'COSTS_SPREAD',hypothesis_ar:'اختبار أثر السبريد',evidence_ids:['DT37_2026-11-03'],test_ar:'قارن على مجموعة خارج العينة',expected_risk_ar:'قلة الصفقات',acceptance_metric_ar:'مقارنة صافي النتائج',confidence:'LOW'}],uncertainties_ar:['لا يوجد إثبات ربحية']};
let sends=0;let seenReq;
const fakeFetch=async (u,o)=>{sends++;assert.equal(u,'https://api.openai.com/v1/responses');seenReq=JSON.parse(o.body);return {ok:true,status:200,json:async()=>({id:'resp_test',model:PILOT.model,usage:{input_tokens:2000,output_tokens:850},output:[{content:[{type:'output_text',text:JSON.stringify(resultReview)}]}]})}};
let count=0;
const check=(name,fn)=>{count++;return Promise.resolve(fn()).then(()=>console.log('PASS',name))};
await check('NY date across DST',()=>{assert.equal(newYorkDay(new Date('2026-11-03T03:00Z')),'2026-11-02');assert.equal(newYorkDay(new Date('2026-07-01T02:00Z')),'2026-06-30')});
await check('disabled never sends',async()=>{const s=store();evidence(s);assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'false'},now:testDate,fetchFn:fakeFetch})).status,'DISABLED');assert.equal(sends,0)});
await check('missing key never sends',async()=>{const s=store();evidence(s);assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true'},now:testDate,fetchFn:fakeFetch})).status,'NO_API_KEY');assert.equal(sends,0)});
await check('later-month run without archive never spends',async()=>{const s=store();evidence(s);assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:new Date('2027-01-04T22:00Z'),fetchFn:fakeFetch})).status,'NO_SESSION_EVIDENCE');assert.equal(sends,0)});
await check('model allowlist',async()=>{const s=store();evidence(s);assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test',OPENAI_RESEARCH_MODEL:'gpt-6-astra'},now:testDate,fetchFn:fakeFetch})).status,'UNAPPROVED_MODEL');assert.equal(sends,0)});
await check('no data never spends',async()=>{const s=store();assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fakeFetch})).status,'NO_SESSION_EVIDENCE');assert.equal(sends,0)});
await check('budget guard works',async()=>{const s=store();evidence(s);s.map.set('dt37-openai37-budget-one-month-20261102',{calls:25,reservedUsd:4.5});assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fakeFetch})).status,'BUDGET_GUARD');assert.equal(sends,0)});
await check('research review recorded with checked evidence',async()=>{const s=store();evidence(s);const x=await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test-secret',OPENAI_RESEARCH_MODEL:PILOT.model},now:testDate,fetchFn:fakeFetch});assert.equal(x.status,'REVIEW_CREATED_NOT_APPLIED');assert.equal(x.experiments,1);assert.equal(x.usage.estimatedUsd,0.0125);assert.equal(seenReq.model,PILOT.model);assert.equal(seenReq.store,false);assert.equal(seenReq.text.format.type,'json_schema');assert.equal(seenReq.reasoning.effort,'low');assert.equal(s.map.get('dt37-openai37-budget-one-month-20261102').reservedUsd,0.12);assert.equal(s.map.get('dt37-openai37-review-2026-11-03').review.experiments[0].canApply,false);assert.equal(s.map.get('dt37-research-evidence-quality-2026-11-03').readiness.ok,true);assert.equal(s.map.get('dt37-openai37-review-2026-11-03').archiveCoverage.ai,390);assert.equal(s.map.has('ai-parallel-llm-review-2026-11-03'),false,'Research Agent must not mirror its report into independent AI');assert(!JSON.stringify([...s.map]).includes('test-secret'));assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test-secret'},now:testDate,fetchFn:fakeFetch})).status,'ALREADY_REVIEWED');assert.equal(sends,1)});
await check('concurrent post-close jobs cannot double-send OpenAI',async()=>{
 const s=store();evidence(s);let paid=0;
 const fetchOnce=async()=>{paid++;return {ok:true,status:200,json:async()=>({model:PILOT.model,usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(resultReview)}]}]})}};
 const args={store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fetchOnce};
 const results=await Promise.all([runScheduledResearch(args),runScheduledResearch(args)]);
 assert.equal(paid,1);assert.equal(results.filter(x=>x.status==='REVIEW_CREATED_NOT_APPLIED').length,1);
 assert.equal(results.filter(x=>x.status==='ALREADY_REVIEWED').length,1);
});
await check('bad evidence citations discarded',()=>{const e=buildEvidence({day:'2026-11-03',aiState:{updatedAt:'2026-11-03',records:{}}});const wrong={...resultReview,experiments:[{...resultReview.experiments[0],evidence_ids:['INVENTED']}],observations:[{...resultReview.observations[0],evidence_ids:['INVENTED']}]};const valid=verifyReview(wrong,e);assert.equal(valid.experiments.length,0);assert.equal(valid.observations.length,0)});
await check('no retry after failed billed call',async()=>{const s=store();evidence(s);let attempts=0;const fail=async()=>{attempts++;return {ok:false,status:429}};const x=await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fail});assert.equal(x.status,'FAILED_NO_RETRY');assert.equal((await runScheduledResearch({store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fail})).status,'FAILED_PREVIOUS_ATTEMPT_NO_RETRY');assert.equal(attempts,1);assert.equal(s.map.get('dt37-openai37-budget-one-month-20261102').calls,1)});
await check('storage error fails before API call',async()=>{const st={get:async(k)=>k==='ai-parallel-state-2026-11-03'?{updatedAt:'2026-11-03',records:{}}:null,list:async()=>({blobs:[]}),setJSON:async()=>{throw Error('blob down')}};assert.equal((await runScheduledResearch({store:st,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},now:testDate,fetchFn:fakeFetch})).status,'MISSING_RESEARCH_LEDGERS');assert.equal(sends,1)});
await check('primary saved report remains visible when recovery key read breaks',async()=>{
 const s=store();evidence(s);
 const args={store:s,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'test'},
   now:testDate,fetchFn:fakeFetch};
 const first=await runScheduledResearch(args);
 assert.equal(first.status,'REVIEW_CREATED_NOT_APPLIED');
 const failsRecovery={...s,async get(k,o){
   if(k==='dt37-openai37-review-recovery-2026-11-03')throw Error('BACKUP_READ_FAIL');
   return s.get(k,o);
 }};
 const before=sends;
 assert.equal((await runScheduledResearch({...args,store:failsRecovery})).status,'ALREADY_REVIEWED');
 assert.equal(sends,before);
});
await check('unavailable recovery slot blocks paid OpenAI request',async()=>{
 const s=store();evidence(s);let attempts=0;
 const failingRecovery={
   ...s,
   async setJSON(k,v,o){
     if(k==='dt37-openai37-review-recovery-2026-11-03')throw Error('RECOVERY_SLOT_DOWN');
     return s.setJSON(k,v,o);
   }
 };
 const result=await runScheduledResearch({store:failingRecovery,
   env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'fake'},now:testDate,
   fetchFn:async()=>{attempts++;throw Error('SHOULD_NOT_SPEND')}});
 assert.equal(result.status,'REPORT_STORAGE_NOT_VERIFIED_NO_API_SPEND');
 assert.equal(attempts,0);
 assert.equal((await runScheduledResearch({store:failingRecovery,
   env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'fake'},now:testDate,
   fetchFn:async()=>{attempts++;throw Error('SHOULD_NOT_SPEND')}})).status,'REVIEW_RESERVED_NOT_COMPLETED');
 assert.equal(attempts,0);
});
await check('Sol is pinned with accurate standard pricing',()=>{assert.equal(PILOT.model,'gpt-6.1-sol');assert.equal(estimatedCostUsd({input_tokens:1000000,output_tokens:1000000}),12);assert.equal(PILOT.maxCalls*PILOT.reservePerCallUsd<=PILOT.budgetUsd,true)});
await check('OpenAI HTML response fails safely without leaking body',async()=>{
 const e=buildEvidence({day:'2026-11-03',aiState:{updatedAt:'2026-11-03',records:{}}});
 await assert.rejects(()=>callOpenAiResearch({evidence:e,apiKey:'dummy',fetchFn:async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},json:()=>{throw Error('SHOULD_NOT_PARSE_HTML')}})}),/OPENAI_NON_JSON_RESPONSE/);
});
await check('estimate only from server response',()=>assert.equal(estimatedCostUsd({input_tokens:2000,output_tokens:850}),0.0125));
await check('safe when zero trades',()=>{const e=buildEvidence({day:'2026-11-03',aiState:{updatedAt:'2026-11-03',records:{},cycles:391,reasonCounters:{NO_SIGNALS:391}}});assert.equal(e.ai.positions.length,0);assert.equal(e.ai.records,0)});
await check('large untrusted payload capped',()=>{const e=buildEvidence({day:'2026-11-03',aiState:{updatedAt:'2026-11-03',records:Object.fromEntries(Array.from({length:100},(_,i)=>['S'+i,{symbol:'S'+i,position:{status:'CLOSED',entry:i}}]))},stats:{outcomes:{secrets:'X'.repeat(10000)}}});assert(JSON.stringify(e).length<PILOT.maxInputChars);assert(!JSON.stringify(e).includes('XXXXX'))});
console.log('DT37_OPENAI_RESEARCH_TESTS_PASS '+count+'/'+count);

// 3.7.2: ensure the *full scheduled path* saves a provider ID instead of waiting 24 seconds.
await check('3.7.2 background scheduled launch is one POST and a durable ID',async()=>{
 const st=store();evidence(st);let posts=0;
 const launched=await runScheduledResearch({store:st,now:testDate,env:{
  OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'secret',DT372_RESEARCH_BACKGROUND_ENABLED:'true',DT372_RESEARCH_BACKGROUND_VERIFIED:'true',DT372_RESEARCH_MEDIUM_APPROVED:'true'},
  fetchFn:async(url,opts)=>{posts++;assert.equal(opts.method,'POST');const req=JSON.parse(opts.body);
   assert.equal(req.background,true);assert.equal(req.store,true);assert.equal(req.reasoning.effort,'medium');
   return {ok:true,json:async()=>({id:'resp_test372',status:'queued'})}}});
 assert.equal(launched.status,'BACKGROUND_PENDING',JSON.stringify(launched));assert.equal(posts,1);
 assert.equal(st.map.get('dt37-openai37-review-2026-11-03').responseId,'resp_test372');
 assert(st.map.get('dt372-research-background-evidence-2026-11-03').evidence);
 assert.equal((await runScheduledResearch({store:st,now:testDate,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'secret'},fetchFn:async()=>{throw Error('SHOULD_NOT_REPOST')}})).status,'BACKGROUND_PENDING');
 assert.equal(posts,1);
});
console.log('DT372_BACKGROUND_FULL_SCHEDULED_PATH_PASS');
