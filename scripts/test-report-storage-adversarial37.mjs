import assert from 'node:assert/strict';
import { createPrimaryBarsLoader37 } from '../netlify/functions/lib/primary-bars-cache37.mjs';
import { runScheduledResearch } from '../netlify/functions/lib/research-openai37.mjs';
import { summarizeMinuteAudit, ledgerKey } from '../netlify/functions/lib/research-ledger37.mjs';

const DAY='2026-11-03';
const dayNow=new Date('2026-11-03T22:30:00Z');
function memoryStore({failAfterPaid=false}={}){
 const map=new Map();
 return {
   map,
   async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
   async setJSON(key,value,opts={}){
     if(opts.onlyIfNew&&map.has(key))return {modified:false};
     if(failAfterPaid && key===`dt37-openai37-review-${DAY}` && value.status==='REVIEW_CREATED_NOT_APPLIED') throw Error('INJECTED_BLOB_WRITE_FAIL_AFTER_SUCCESSFUL_API');
     map.set(key,structuredClone(value));return {modified:true};
   }
 };
}
const bar=(date,close)=>({datetime:date,open:close,high:close+0.1,low:close-0.1,close,volume:100});
const cacheStore=memoryStore();
const old=bar('2026-11-04 09:30:00',100),revised=bar('2026-11-04 09:30:00',250);
const today=bar('2026-11-05 09:30:00',101);
let revisedAtSource=false;
let mockClock=new Date('2026-11-05T15:00:00Z');
const fullFetch=async()=>[revisedAtSource?revised:old,today];
const rangeFetch=async()=>[today];
const first=createPrimaryBarsLoader37(cacheStore,{nowFn:()=>mockClock,fullFetch,rangeFetch});
const out1=await first('AAPL');
assert.equal(out1.find(x=>x.datetime===old.datetime)?.close,100);
revisedAtSource=true;
mockClock=new Date('2026-11-05T15:01:00Z');
const second=createPrimaryBarsLoader37(cacheStore,{nowFn:()=>mockClock,fullFetch,rangeFetch});
const optimized=await second('AAPL');
const canonical=await fullFetch();
const optimizedClose=optimized.find(x=>x.datetime===old.datetime)?.close;
const canonicalClose=canonical.find(x=>x.datetime===old.datetime)?.close;
assert.equal(optimizedClose,250);
assert.equal(canonicalClose,250);
console.log('PASS_GATE PRIMARY_CORRECTED_HISTORY_RECONCILED',JSON.stringify({optimizedClose,canonicalClose,minute:'10:01 ET',reason:'strict full-source fetch on every scanner cycle'}));

const source=memoryStore({failAfterPaid:true});
source.map.set(`ai-parallel-state-${DAY}`,{updatedAt:'2026-11-03T21:00:00Z',records:{ABC:{position:{status:'CLOSED',netUsd:-1,entry:100}}},cumulativeScanned:['ABC'],cycles:390});
source.map.set(`ai-parallel-recommendations-${DAY}`,{outcomes:{completedComparable:1},topBlockers:[],comparison:{aiTrades:1}});
source.map.set(`signal-history-${DAY}`,{signals:{ABC:{confirmedSignals:[]}}});
for (const kind of ['scanner','ai']) {
 for (const h of [9,10,11,12,13,14,15]){
  const minutes={};
  for (let m=Math.max(h*60,570);m<Math.min((h+1)*60,960);m++) {
    const quote={bid:100,ask:100.05,bidSize:10,askSize:12,timestamp:'2026-11-03T15:00:00Z',spreadBps:5,source:'Alpaca IEX'};
    const shariaEvidence={source:'AAOIFI_TEST',snapshotSha256:'audit_fixture',methodology:'AAOIFI'};
    const data=kind==='scanner'?{minute:m,shariaEvidence,records:[{symbol:'ABC',state:'WAIT',reason:'WAIT',features:{price:100},openingChecks:[{gate:'g',passed:false}],quote}]}:
      {minute:m,shariaEvidence,snapshots:[{symbol:'ABC',state:'SMART',reason:'WAIT',features:{price:100},checks:{candidate:[{gate:'g',passed:false}]},quote}]};
    minutes[String(m).padStart(4,'0')]=summarizeMinuteAudit({kind,day:DAY,doc:data});
  }
  source.map.set(ledgerKey(kind,DAY,h*60),{schemaVersion:'3.7-RESEARCH-LEDGER-1',kind,day:DAY,minutes});
 }
}
let apiCount=0;
const review={summary_ar:'محاكاة اختبار حفظ التقرير',observations:[{fact_ar:'توجد سجلات موثقة للمراجعة',metric_ref:'NONE',evidence_ids:[`DT37_${DAY}`],limitation_ar:'لا توجد أسعار تنفيذ حقيقية'}],experiments:[{area:'DATA_INGESTION',hypothesis_ar:'فحص سلامة حفظ الأرشيف',evidence_ids:[`DT37_${DAY}`],test_ar:'مقارنة مصادر السجل المحفوظ',expected_risk_ar:'نقص بيانات الأرشيف المحتمل',acceptance_metric_ar:'حفظ كامل دون فقد السجلات',confidence:'LOW'}],uncertainties_ar:[]};
const fakePaidApi=async()=>{apiCount++;return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({id:'paid-fixture',model:'gpt-6.1-sol',usage:{input_tokens:2000,output_tokens:200},output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]})}};
let thrown='';
try{await runScheduledResearch({store:source,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'FAKE_FOR_OFFLINE_TEST'},now:dayNow,fetchFn:fakePaidApi});}
catch(e){thrown=e.message;}
const saved=source.map.get(`dt37-openai37-review-${DAY}`);
assert.equal(apiCount,1,'fixture must have sent one simulated paid call');
assert.equal(saved.status,'RESERVED');
assert.equal(source.map.get(`dt37-openai37-review-recovery-${DAY}`)?.status,'REVIEW_CREATED_NOT_APPLIED');
assert.equal(source.map.get('dt37-openai37-budget-one-month-20261102').calls,1);
const followUp=await runScheduledResearch({store:source,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'FAKE_FOR_OFFLINE_TEST'},now:dayNow,fetchFn:fakePaidApi});
assert.equal(followUp.status,'ALREADY_REVIEWED');
assert.equal(apiCount,1);
console.log('PASS_GATE PAID_API_REPORT_RECOVERED_WITHOUT_REBILLING',JSON.stringify({apiCount,persistentState:saved.status,followUp:followUp.status,injectedFailure:thrown}));
console.log('AUDIT_FINISHED: two deterministic failure paths reproduced, zero external network calls, no deploy.');

// All writes fail AFTER a successful simulated paid reply. A caller cannot
// promise recovery when the paid response was never persisted anywhere. This
// must be explicit, stop automatic retry, and leave an audit marker.
const outageBase=memoryStore();
for(const [k,v] of source.map){
 if(k.startsWith('ai-parallel-state-')||k.startsWith('ai-parallel-recommendations-')||
    k.startsWith('signal-history-')||k.startsWith('research-ledger-')||k.startsWith('dt37-research-ledger-'))
   outageBase.map.set(k,structuredClone(v));
}
// The evidence data uses ledgerKey names: include all source keys except the
// paid review/budget receipts from the previous scenario.
for(const [k,v] of source.map){
 if(!k.startsWith('dt37-openai37-')&&!k.startsWith('dt37-research-agent-')&&
    !k.startsWith('dt37-research-evidence-quality-')&&!k.startsWith('ai-parallel-llm-review-'))
   outageBase.map.set(k,structuredClone(v));
}
let paidOutage=false,attempts=0,observed='';
const outageStore={
 ...outageBase,
 async setJSON(k,v,opts={}){
  if(paidOutage&&v?.status==='REVIEW_CREATED_NOT_APPLIED')throw Error('INJECTED_TOTAL_STORAGE_FAILURE');
  return outageBase.setJSON(k,v,opts);
 }
};
const outagePaid=async()=>{attempts++;paidOutage=true;return fakePaidApi();};
try{await runScheduledResearch({store:outageStore,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'FAKE_FOR_OFFLINE_TEST'},now:dayNow,fetchFn:outagePaid});}
catch(e){observed=String(e?.message||e);}
assert.match(observed,/PAID_REVIEW_PERSISTENCE_FAILED_NO_API_RETRY/);
assert.equal(attempts,1);
assert.equal(outageBase.map.get(`dt37-openai37-review-${DAY}`)?.status,'RESERVED');
assert.equal(outageBase.map.get(`dt37-openai37-review-recovery-${DAY}`)?.status,'RECOVERY_READY');
const neverRetry=await runScheduledResearch({store:outageStore,env:{OPENAI_RESEARCH_ENABLED:'true',OPENAI_RESEARCH_API_KEY:'FAKE_FOR_OFFLINE_TEST'},now:dayNow,fetchFn:outagePaid});
assert.equal(neverRetry.status,'REVIEW_RESERVED_NOT_COMPLETED');
assert.equal(attempts,1);
console.log('PASS_GATE TOTAL_POST_API_STORAGE_OUTAGE_FAILS_CLOSED_WITHOUT_REBILLING',JSON.stringify({paidSimulatedCalls:attempts,unrecoverablePaidResult:true,manualIncidentRequired:true}));
