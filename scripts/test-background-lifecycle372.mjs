import test from 'node:test';import assert from 'node:assert/strict';
import {runScheduledResearch,pollOpenAiResearch37} from '../netlify/functions/lib/research-openai37.mjs';
import {summarizeMinuteAudit,ledgerKey} from '../netlify/functions/lib/research-ledger37.mjs';
import {memoryStore372} from './lib/memory-store372.mjs';
const day='2026-11-03',at=new Date(day+'T22:15:00Z'),key=`dt37-openai37-review-${day}`;
const env={OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'LOCAL_FAKE',DT372_RESEARCH_BACKGROUND_ENABLED:'true',DT372_RESEARCH_BACKGROUND_VERIFIED:'true'};
function evidenceStore(){
 const s=memoryStore372({[`ai-parallel-state-${day}`]:{updatedAt:day+'T21:00:00Z',records:{},cycles:330},[`signal-history-${day}`]:{signals:{}}});
 for(const kind of ['scanner','ai'])for(const h of [9,10,11,12,13,14]){
  const minutes={};for(let m=Math.max(570,h*60);m<Math.min(900,(h+1)*60);m++){
   const row={symbol:'ABC',state:'WAIT',reason:'LOCAL_TEST',features:{price:100},openingChecks:[{gate:'known',passed:true}],
    quote:{bid:100,ask:100.01,bidSize:10,askSize:10,timestamp:day+'T15:00:00Z',source:'Alpaca IEX',ageSec:1}};
   minutes[String(m).padStart(4,'0')]=summarizeMinuteAudit({kind,day,doc:{minute:m,records:[row],snapshots:[row],cycleStatus:'COMPLETED',
    shariaEvidence:{source:'AAOIFI_TEST',snapshotSha256:'local',methodology:'AAOIFI'}}});
  }
  s.map.set(ledgerKey(kind,day,h*60),{etag:'fixture:'+kind+h,data:{kind,day,hour:h,minutes}});
 }
 return s;
}
const review={summary_ar:'محاكاة مراجعة بحثية معزولة',observations:[{fact_ar:'توجد سجلات موثقة للمراجعة',metric_ref:'NONE',evidence_ids:[`DT37_${day}`],limitation_ar:'لا يوجد إثبات تعبئة وسيط'}],
 experiments:[{area:'DATA_INGESTION',hypothesis_ar:'اختبار سلامة حفظ الأرشيف',evidence_ids:[`DT37_${day}`],test_ar:'قارن السجلات على عينة مستقلة',expected_risk_ar:'نقص بعض بيانات الأرشيف',acceptance_metric_ar:'اكتمال الحفظ دون فقد سجلات',confidence:'LOW'}],uncertainties_ar:[]};
const completed=()=>({ok:true,json:async()=>({id:'resp_lifecycle',status:'completed',model:'gpt-6.1-sol',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]})});
async function launch(store,extra={}){
 let posts=0;
 const r=await runScheduledResearch({store,env,now:at,fetchFn:async(u,o)=>{
  posts++;assert.equal(o.method,'POST');assert.equal(store.map.get(key).data.phase,'STARTED');
  const req=JSON.parse(o.body);assert.equal(req.reasoning.effort,'low','medium requires separate approval');
  return {ok:true,json:async()=>({id:'resp_lifecycle',status:'queued'})};},...extra});
 return {r,posts};
}
test('background start/pending/window exceeded/completion uses one POST and frozen evidence',async()=>{
 const s=evidenceStore();const {r,posts}=await launch(s);assert.equal(r.status,'BACKGROUND_PENDING');assert.equal(posts,1);
 const checkpoint=structuredClone(s.map.get(`dt372-research-background-evidence-${day}`).data);
 let gets=0;const pending=async(u,o)=>{gets++;assert.equal(o.method,'GET');return {ok:true,json:async()=>({status:'in_progress'})}};
 assert.equal((await pollOpenAiResearch37({store:s,env,day,now:new Date(day+'T22:17:00Z'),fetchFn:pending})).status,'BACKGROUND_PENDING');
 const late=await pollOpenAiResearch37({store:s,env,day,now:new Date(day+'T22:23:00Z'),fetchFn:pending,finalPoll:true});
 assert.equal(late.status,'BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED');assert.equal(late.phase,'FAILED_WITH_REASON');
 assert.equal(s.map.get(key).data.responseId,'resp_lifecycle');assert.deepEqual(s.map.get(`dt372-research-background-evidence-${day}`).data,checkpoint);
 const saved=await pollOpenAiResearch37({store:s,env,day,now:new Date(day+'T22:25:00Z'),fetchFn:async(u,o)=>{gets++;assert.equal(o.method,'GET');return completed();}});
 assert.equal(saved.phase,'PERSISTED');assert.equal(s.map.get(key).data.phase,'PERSISTED');
 assert(s.map.get(key).data.phases.some(x=>x.phase==='COMPLETED'));assert.equal(saved.notification.status,'NOT_AUTHORIZED');
 assert.equal((await runScheduledResearch({store:s,env,now:at,fetchFn:async()=>{throw Error('NO_REBILL')}})).status,'ALREADY_REVIEWED');assert.equal(gets,3);
});
test('a pending response ID survives primary write failure in the verified recovery slot',async()=>{
 const s=evidenceStore();s.beforeSet=async(k,v)=>{if(k===key&&v.status==='BACKGROUND_PENDING')throw Error('PRIMARY_PENDING_WRITE_DOWN')};
 await launch(s);assert.equal(s.map.get(`dt37-openai37-review-recovery-${day}`).data.responseId,'resp_lifecycle');
 assert.equal((await runScheduledResearch({store:s,env,now:at,fetchFn:async()=>{throw Error('NO_REPOST')}})).status,'BACKGROUND_PENDING');
 const r=await pollOpenAiResearch37({store:s,env,day,now:new Date(day+'T22:17:00Z'),fetchFn:completed});assert.equal(r.phase,'PERSISTED');
});
test('provider transport uncertainty records a reason and permanently prevents a second paid POST',async()=>{
 const s=evidenceStore();let posts=0;
 const r=await runScheduledResearch({store:s,env,now:at,fetchFn:async()=>{posts++;throw Error('LOCAL_SIMULATED_TIMEOUT')}});
 assert.equal(r.phase,'FAILED_WITH_REASON');assert.equal(s.map.get(key).data.reason,'LOCAL_SIMULATED_TIMEOUT');
 await runScheduledResearch({store:s,env,now:at,fetchFn:async()=>{posts++;throw Error('NO_REPOST')}});assert.equal(posts,1);
});
test('total ID storage failure after provider start returns an incident ID and never re-bills',async()=>{
 const s=evidenceStore();s.beforeSet=async(k,v)=>{if(v.status==='BACKGROUND_PENDING')throw Error('BOTH_RESULT_SLOTS_DOWN')};
 const old=console.error;let logged='';console.error=(...args)=>{logged=args.join(' ')};
 let first;try{first=await launch(s)}finally{console.error=old;}
 assert.equal(first.r.status,'BACKGROUND_ID_WRITE_NOT_VERIFIED_NO_RETRY');assert.equal(first.r.responseId,'resp_lifecycle');
 assert(logged.includes('resp_lifecycle'));assert.equal(first.posts,1);
 assert.equal((await runScheduledResearch({store:s,env,now:at,fetchFn:async()=>{throw Error('NO_REPOST')}})).status,'REVIEW_RESERVED_NOT_COMPLETED');
});
test('missing key/evidence and unverified background prerequisites never spend',async()=>{
 const s=evidenceStore();let calls=0;const no=async()=>{calls++;throw Error('NO_NETWORK')};
 const r=await runScheduledResearch({store:s,env:{...env,DT372_RESEARCH_BACKGROUND_VERIFIED:'false'},now:at,fetchFn:no});assert.equal(r.status,'BACKGROUND_PREREQUISITES_NOT_VERIFIED');
 await launch(s);
 assert.equal((await pollOpenAiResearch37({store:s,env:{},day,now:at,fetchFn:no})).status,'NO_API_KEY');
 s.map.delete(`dt372-research-background-evidence-${day}`);
 assert.equal((await pollOpenAiResearch37({store:s,env,day,now:at,fetchFn:no})).status,'BACKGROUND_EVIDENCE_MISSING_NO_RETRY');assert.equal(calls,0);
});
test('an authorized separate notifier rejection is recorded once; never claims phone delivery',async()=>{
 const s=evidenceStore();await launch(s);let sends=0;
 const args={store:s,env,day,now:new Date(day+'T22:17:00Z'),fetchFn:completed,notificationAuthorized:true,
  notifyFn:async()=>{sends++;throw Error('LOCAL_PROVIDER_REJECTED')}};
 const r=await pollOpenAiResearch37(args);assert.equal(r.notification.status,'FAILED_WITH_REASON');assert.equal(r.notification.phoneDeliveryVerified,false);
 await pollOpenAiResearch37(args);assert.equal(sends,1);
});
