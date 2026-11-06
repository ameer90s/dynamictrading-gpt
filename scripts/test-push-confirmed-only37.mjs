import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {dispatchPushSafely37} from '../netlify/functions/lib/notification-safe37.mjs';

const root=new URL('../',import.meta.url);
const read=(p)=>readFileSync(new URL(p,root),'utf8');
let pass=0;
async function test(name,fn){await fn();pass++;console.log('PASS',name)}

await test('scheduled scanner invokes CONFIRMED push only in both paths',()=>{
 const s=read('netlify/functions/daily-recommendation.mjs');
 assert.match(s,/import\s*\{\s*sendConfirmedPushes\s*\}/);
 assert.equal(/sendSmartPushes/.test(s),false);
 assert.equal((s.match(/dispatchPushSafely37\(store,data,clock\.dateKey,\{sendConfirmedPushes\}\)/g)||[]).length,2);
 assert.match(s,/["']latest-daily["']/);
});

await test('dispatcher ignores even a supplied legacy SMART callback',async()=>{
 let smart=0,confirmed=0;
 const r=await dispatchPushSafely37({}, {display8:[{recommendationState:'SMART'},{recommendationState:'CONFIRMED'}]},'2026-11-06',{
  sendSmartPushes:async()=>{smart++;throw Error('MUST NEVER EXECUTE')},
  sendConfirmedPushes:async()=>{confirmed++;return {sent:1,status:'OK'}}
 });
 assert.equal(smart,0);assert.equal(confirmed,1);
 assert.deepEqual(r.SMART,{sent:0,status:'DISABLED_CONFIRMED_ONLY'});
 assert.deepEqual(r.CONFIRMED,{sent:1,status:'OK'});
});

await test('confirmed push provider failure cannot turn successful scan into failure',async()=>{
 const r=await dispatchPushSafely37({}, {}, '2026-11-06',{
  sendConfirmedPushes:async()=>{throw Error('VAPID_DOWN')}
 });
 assert.equal(r.SMART.sent,0);
 assert.equal(r.CONFIRMED.status,'PUSH_FAILED_NOT_SCAN_FAILED');
});

await test('legacy SMART sender is inert and no SMART payload exists',()=>{
 const s=read('netlify/functions/lib/push.mjs');
 assert.match(s,/export\s+async\s+function\s+sendSmartPushes\(\)\s*\{\s*return\s*\{sent:0,status:'DISABLED_CONFIRMED_ONLY'\}/);
 assert.doesNotMatch(s,/(push-smart-notified-|alert=smart|🟠 SMART مراقبة)/);
 assert.match(s,/filter\(x=>x\.recommendationState==='CONFIRMED'\)/);
 assert.match(s,/type:'CONFIRMED'/);
});

async function swShow(payload){
 const callbacks={};const shown=[];const telemetry=[];
 const ctx={
  self:{addEventListener:(name,fn)=>{callbacks[name]=fn},registration:{showNotification:async(title,opts)=>shown.push({title,opts})}},
  fetch:async(url,init)=>{telemetry.push({url,init});return {ok:true}},
  clients:{matchAll:async()=>[],openWindow:async()=>{}},
  console
 };
 runInNewContext(read('public/service-worker.js'),ctx);
 let promise=Promise.resolve();
 const ev={data:{json:()=>payload},waitUntil:p=>{promise=p}};
 callbacks.push(ev);await promise;
 return {shown,telemetry};
}
await test('service worker rejects SMART even if queued from old version',async()=>{
 const r=await swShow({title:'🟠 SMART مراقبة · ABC',url:'/?alert=smart',type:'SMART'});
 assert.equal(r.shown.length,0);assert.equal(r.telemetry.length,0);
});
await test('service worker rejects arbitrary untyped pushes',async()=>{
 const r=await swShow({title:'Opportunity · ABC',url:'/'});
 assert.equal(r.shown.length,0);
});
await test('service worker displays new explicit CONFIRMED payload',async()=>{
 const r=await swShow({title:'🟢 CONFIRMED PAPER · ABC',url:'/?alert=confirmed',type:'CONFIRMED',signalId:'abc'});
 assert.equal(r.shown.length,1);assert.equal(r.telemetry.length,1);
});
await test('service worker preserves queued legacy CONFIRMED payload with matching URL',async()=>{
 const r=await swShow({title:'🟢 CONFIRMED PAPER · ABC',url:'/?alert=confirmed',signalId:'abc'});
 assert.equal(r.shown.length,1);
});
await test('cannot label a SMART URL as confirmed with a spoofed title',async()=>{
 const r=await swShow({title:'🟢 CONFIRMED PAPER · ABC',url:'/?alert=smart'});
 assert.equal(r.shown.length,0);
});
await test('SMART cards stay visible in scanner and user interface',()=>{
 assert.match(read('netlify/functions/daily-recommendation.mjs'),/\["SMART","CONFIRMED"\]\.includes\(x\.recommendationState\)/);
 assert.match(read('public/app.js'),/SMART:\["🟠 SMART"/);
});
console.log(`DT37_PUSH_CONFIRMED_ONLY_PASS ${pass}/${pass}`);
