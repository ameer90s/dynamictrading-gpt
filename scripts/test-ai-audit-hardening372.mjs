import assert from 'node:assert/strict';
import {verifiedAiMinute372,inspectAiMinutes372} from '../netlify/functions/lib/ai-audit-hardening372.mjs';
const day='2026-11-06',minute=600;
const doc={dateKey:day,minute,cycleStatus:'COMPLETED',snapshots:[{symbol:'ABC'}]};
const make=()=>{const map=new Map();let seq=0;return {map,
 async get(k){return structuredClone(map.get(k)?.value||null)},
 async getWithMetadata(k){const v=map.get(k);return v?{data:structuredClone(v.value),etag:v.etag}:null},
 async setJSON(k,v,opt={}){if(opt.onlyIfNew&&map.has(k))return {modified:false};
  const etag=String(++seq);map.set(k,{value:structuredClone(v),etag});return {modified:true,etag}}}};
let tests=0;const test=async(name,fn)=>{await fn();tests++;console.log('PASS',name)};
await test('persistent success, verified readback',async()=>{
 const store=make();let ledgers=0;
 const r=await verifiedAiMinute372({store,day,minute,doc,recordResearchMinute:async()=>ledgers++});
 assert.equal(r.alreadyRecorded,false);assert.equal(ledgers,1);
 assert.equal((await inspectAiMinutes372({store,day,minutes:[minute]})).complete,true);
});
await test('identical retry safe (idempotent audit shard)',async()=>{
 const store=make(),recordResearchMinute=async()=>{};
 await verifiedAiMinute372({store,day,minute,doc,recordResearchMinute});
 assert.equal((await verifiedAiMinute372({store,day,minute,doc,recordResearchMinute})).alreadyRecorded,true);
});
await test('same minute different document fails closed',async()=>{
 const store=make(),recordResearchMinute=async()=>{};
 await verifiedAiMinute372({store,day,minute,doc,recordResearchMinute});
 await assert.rejects(verifiedAiMinute372({store,day,minute,doc:{...doc,snapshots:[]},recordResearchMinute}),/MINUTE_CONFLICT/);
});
await test('readback inconsistency rejects success',async()=>{
 const store=make();let reads=0;const broken={...store,async get(k){reads++;return {dateKey:day,minute,snapshots:['CORRUPT']}}};
 await assert.rejects(verifiedAiMinute372({store:broken,day,minute,doc,recordResearchMinute:async()=>{throw Error('SHOULD_NOT_REACH')}}),/READBACK_MISMATCH/);
});
await test('two concurrent distinct documents cannot overwrite same audit',async()=>{
 const store=make(),other={...doc,snapshots:[{symbol:'XYZ'}]};
 const result=await Promise.allSettled([verifiedAiMinute372({store,day,minute,doc,recordResearchMinute:async()=>{}}),verifiedAiMinute372({store,day,minute,doc:other,recordResearchMinute:async()=>{}})]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(result.filter(x=>x.status==='rejected').length,1);
 assert.equal((await store.get(`ai-parallel-audit-${day}-0600`)).snapshots.length,1);
});
await test('missing CAS support fails closed',async()=>{
 await assert.rejects(verifiedAiMinute372({store:{get:async()=>null,setJSON:async()=>{}},day,minute,doc,recordResearchMinute:async()=>{}}),/VERSIONED_READ_REQUIRED/);
});
await test('ledger failure propagates',async()=>{
 const store=make();await assert.rejects(verifiedAiMinute372({store,day,minute,doc,recordResearchMinute:async()=>{throw Error('LEDGER_UNAVAILABLE')}}),/LEDGER_UNAVAILABLE/);
});
await test('missing/degraded/failure/read error are not called complete',async()=>{
 const store=make();await store.setJSON(`ai-parallel-audit-${day}-0600`,{...doc,cycleStatus:'DEGRADED'});
 const r=await inspectAiMinutes372({store,day,minutes:[600,601]});
 assert.equal(r.complete,false);assert.deepEqual(r.missing,[601]);assert.equal(r.failed.length,1);
});
await test('storage write failure propagates',async()=>{
 const store=make();const broken={...store,async setJSON(){throw Error('WRITE_FAILED')}};
 await assert.rejects(verifiedAiMinute372({store:broken,day,minute,doc,recordResearchMinute:async()=>{}}),/WRITE_FAILED/);
});
console.log(`AI_AUDIT_HARDENING_372_PASS ${tests}/${tests}`);
