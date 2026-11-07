/** Local-only regression of concurrent hourly Blob persistence: zero network calls. */
import assert from 'node:assert/strict';
import {recordResearchMinute,ledgerKey} from '../netlify/functions/lib/research-ledger37.mjs';
import {dailyEvidenceReadiness} from '../netlify/functions/lib/research-openai37.mjs';
const day='2026-11-06';
function createStore({syncReads=2,phantomWrite=false,alwaysConflict=false}={}){
 const db=new Map(),rev=new Map(),writes=[];let readsWaiting=[];let initialReads=0;let unlock;
 const gate=new Promise(resolve=>{unlock=resolve;});
 return {db,writes,
  async getWithMetadata(key){
   const current=db.has(key)?{data:structuredClone(db.get(key)),etag:rev.get(key)}:null;
   if(syncReads&&initialReads++<syncReads){readsWaiting.push(key);if(readsWaiting.length===syncReads)unlock();await gate;}
   return current;
  },
  async get(key){return db.has(key)?structuredClone(db.get(key)):null;},
  async setJSON(key,value,opt={}){
   writes.push({key,conditional:opt.onlyIfNew?'new':opt.onlyIfMatch?'match':'UNCONDITIONAL'});
   if(phantomWrite)return {modified:true,etag:''};
   if(alwaysConflict)return {modified:false};
   if(opt.onlyIfNew&&db.has(key))return {modified:false};
   if(opt.onlyIfMatch&&rev.get(key)!==opt.onlyIfMatch)return {modified:false};
   const next=`"r${(Number(rev.get(key)?.slice(2,-1))||0)+1}"`;
   db.set(key,structuredClone(value));rev.set(key,next);return {modified:true,etag:next};
  }
 };
}
function audit(minute){return {minute,cycleStatus:'COMPLETED',records:[{symbol:'TEST',state:'SMART',reason:'WAIT',features:{price:30},openingChecks:[{gate:'OPEN',passed:true}]}]};}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
await test('two simultaneous first-minute writers use create-only CAS, do not drop either minute',async()=>{
 const store=createStore();const [a,b]=await Promise.all([570,571].map(minute=>recordResearchMinute({store,kind:'scanner',day,doc:audit(minute)})));
 assert.equal(a.status,'RECORDED');assert.equal(b.status,'RECORDED');
 const key=ledgerKey('scanner',day,570);assert.deepEqual(Object.keys(store.db.get(key).minutes).sort(),['0570','0571']);
 assert.equal(store.writes.every(x=>x.conditional!=='UNCONDITIONAL'),true);
});
await test('two simultaneous updates to existing hourly shard preserve all three recorded minutes',async()=>{
 const store=createStore({syncReads:0});await recordResearchMinute({store,kind:'scanner',day,doc:audit(570)});
 const original=store.getWithMetadata.bind(store);let waits=[];let release;
 const gate=new Promise(resolve=>{release=resolve;});let concurrentReads=0;
 store.getWithMetadata=async key=>{const snapshot=await original(key);if(concurrentReads++<2){waits.push(1);if(waits.length===2)release();await gate;}return snapshot;};
 const out=await Promise.all([571,572].map(minute=>recordResearchMinute({store,kind:'scanner',day,doc:audit(minute)})));
 assert(out.every(x=>x.status==='RECORDED'));
 assert.deepEqual(Object.keys(store.db.get(ledgerKey('scanner',day,570)).minutes).sort(),['0570','0571','0572']);
 assert(store.writes.some(x=>x.conditional==='match'));
});
await test('simulated phantom Netlify Blob write cannot be mistaken for saved minute',async()=>{
 const store=createStore({syncReads:0,phantomWrite:true});
 await assert.rejects(recordResearchMinute({store,kind:'scanner',day,doc:audit(570)}),/LEDGER_WRITE_ETAG_UNVERIFIED/);
 assert.equal(store.db.size,0);
});
await test('persistent CAS conflict does not count an unsaved minute as successful',async()=>{
 const store=createStore({syncReads:0,alwaysConflict:true});
 await assert.rejects(recordResearchMinute({store,kind:'scanner',day,doc:audit(570)}),/LEDGER_CONCURRENT_WRITE_RETRY_EXHAUSTED/);
 assert.equal(store.writes.length,4);assert.equal(store.db.size,0);
});
await test('production cannot silently degrade to stale read-modify-write without ETags',async()=>{
 await assert.rejects(recordResearchMinute({store:{get:async()=>null,setJSON:async()=>({modified:true})},kind:'scanner',day,doc:audit(570)}),/LEDGER_VERSIONED_READ_REQUIRED/);
});
await test('paid OpenAI gate still rejects a 283/330 primary archive',async()=>{
 const mk=(missing)=>({missingMinutes:Array.from({length:missing},(_,i)=>570+i),attemptedRows:6000,failedCycles:0,withFeature:5000,withChecks:5000,shariaSnapshots:[{source:'verified'}],quote:{valid:5000,withTimestamp:5000}});
 const verdict=dailyEvidenceReadiness({streams:{scanner:mk(47),ai:mk(0)}},{expectedMinutes:330,minimumMinutes:315});
 assert.equal(verdict.ok,false);assert.equal(verdict.reason,'SCANNER_COVERAGE_TOO_LOW');
});
console.log(`DT37_LEDGER_CAS_REGRESSION_PASS ${passed}/${passed}`);
