import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memoryStore372} from './lib/memory-store372.mjs';
import {registerPendingResearch38,recoverPendingResearch38} from '../netlify/functions/lib/research-recovery38.mjs';
const dt=s=>new Date(s);
const key=d=>`dt37-openai37-review-${d}`;
const pending=d=>({day:d,status:'BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED',responseId:'resp_'+d.replaceAll('-',''),requestedAt:d+'T22:15:00Z'});
test('same four scheduled invocations with 90-minute last poll',()=>{
 const main=readFileSync('netlify/functions/research-openai37.mjs','utf8');
 const late=readFileSync('netlify/functions/research-openai37-late.mjs','utf8');
 const core=readFileSync('netlify/functions/lib/research-openai37.mjs','utf8');
 assert.match(main,/15,30 22 \* \* 1-5/);assert.match(late,/0,45 23 \* \* 1-5/);
 assert.match(core,/90\*60000/);assert.match(main,/recoverPendingResearch38/);
 assert.match(main,/finalPoll:now.getUTCHours\(\)===23&&now.getUTCMinutes\(\)===45/);
});
test('next-day recovery persists result without any provider POST',async()=>{
 const old='2026-11-11',today='2026-11-12',now=dt(today+'T22:15:00Z');
 const store=memoryStore372({[key(old)]:pending(old)});
 await registerPendingResearch38({store,day:old,now:dt(old+'T22:15:00Z')});
 let gets=0;
 const recovered=await recoverPendingResearch38({store,env:{},now,currentDay:today,pollFn:async({day,finalPoll})=>{
  assert.equal(day,old);assert.equal(finalPoll,true);gets++;
  await store.setJSON(key(day),{status:'REVIEW_CREATED_NOT_APPLIED',responseId:pending(day).responseId});
  return {status:'REVIEW_CREATED_NOT_APPLIED',phase:'PERSISTED',day};
 }});
 assert.equal(recovered.recoveredDay,old);assert.equal(gets,1);
 assert.deepEqual((await store.get('dt38-research-pending-days')).days,[]);
 const repeat=await recoverPendingResearch38({store,env:{},now,currentDay:today,pollFn:async()=>{throw Error('EXTRA_PROVIDER_CALL')}});
 assert.equal(repeat.status,'NO_INDEXED_PENDING_REPORT');
});
test('no GET on same session, at most one older session per daily invocation, retain others',async()=>{
 const d1='2026-11-09',d2='2026-11-10',d3='2026-11-11';
 const store=memoryStore372({[key(d1)]:pending(d1),[key(d2)]:pending(d2),[key(d3)]:pending(d3)});
 for(const day of [d1,d2,d3])await registerPendingResearch38({store,day,now:dt('2026-11-12T22:15:00Z')});
 let calls=0;
 const r=await recoverPendingResearch38({store,now:dt('2026-11-12T22:15:00Z'),currentDay:d3,pollFn:async({day})=>{calls++;assert.equal(day,d1);return {status:'BACKGROUND_WINDOW_EXCEEDED_NOT_VERIFIED',day};}});
 assert.equal(calls,1);assert.equal(r.recoveredDay,d1);
 assert.deepEqual((await store.get('dt38-research-pending-days')).days,[d1,d2,d3]);
});
test('no index => zero provider requests, missing key and storage failures fail closed',async()=>{
 const store=memoryStore372();let calls=0;
 const no=async()=>{calls++;throw Error('provider should not be called')};
 assert.equal((await recoverPendingResearch38({store,now:dt('2026-11-12T22:15:00Z'),currentDay:'2026-11-12',pollFn:no})).status,'NO_INDEXED_PENDING_REPORT');
 assert.equal(calls,0);
 store.beforeSet=async key=>{if(key==='dt38-research-pending-days')throw Error('STORE_DOWN')};
 await assert.rejects(registerPendingResearch38({store,day:'2026-11-11',now:dt('2026-11-11T22:15:00Z')}),/STORE_DOWN/);
});
test('retention bound: 30 days; older dates pruned and never polled',async()=>{
 const store=memoryStore372({[key('2026-10-01')]:pending('2026-10-01')});
 await registerPendingResearch38({store,day:'2026-10-01',now:dt('2026-10-01T22:15:00Z')});
 let calls=0;
 const result=await recoverPendingResearch38({store,now:dt('2026-11-12T22:15:00Z'),currentDay:'2026-11-12',pollFn:async()=>{calls++;}});
 assert.equal(result.status,'NO_INDEXED_PENDING_REPORT');assert.equal(calls,0);
});
