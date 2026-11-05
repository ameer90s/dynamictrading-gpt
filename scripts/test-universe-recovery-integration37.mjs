import assert from 'node:assert/strict';
import {maybeRecoverUniverse37,buildSessionUniverseFromScan} from '../netlify/functions/lib/session-universe.mjs';
const previousEnv={...process.env};
process.env.ALPACA_API_KEY_ID='LOCAL_TEST_FAKE';process.env.ALPACA_API_SECRET_KEY='LOCAL_TEST_FAKE';
let n=0;const check=async(name,fn)=>{await fn();n++;console.log('PASS',name)};
const make=()=>buildSessionUniverseFromScan('2026-11-03',['AAA','BBB','CCC'],{quotes:{AAA:{mid:17,timestamp:'2026-11-03T14:30Z'}}});
function store(saved){const m=new Map([['session-universe-2026-11-03',saved]]);return {m,async get(k){return m.has(k)?structuredClone(m.get(k)):null},async setJSON(k,v,opt){if(opt?.onlyIfNew&&m.has(k))return{modified:false};m.set(k,structuredClone(v));return{modified:true}}}}
const time=new Date('2026-11-03T14:45:00Z');
await check('disabled recovery makes no request',async()=>{const s=store(make());let count=0;const r=await maybeRecoverUniverse37(s,'session-universe-2026-11-03',make(),{enabled:false,fetchQuotes:async()=>{count++}});assert.equal(count,0);assert.equal(r.pricedSymbols,1)});
await check('recover only missing symbols',async()=>{const original=make();const s=store(original);const r=await maybeRecoverUniverse37(s,'session-universe-2026-11-03',original,{enabled:true,now:time,fetchQuotes:async(symbols)=>{assert.deepEqual(symbols.sort(),['BBB','CCC']);return {BBB:{mid:21,timestamp:time.toISOString()},CCC:{mid:230,timestamp:time.toISOString()}}}});assert.equal(r.pricedSymbols,3);assert.equal(r.eligibleCount,2);assert.equal(r.rows.find(x=>x.symbol==='AAA').sessionStartPrice,17);assert.equal(r.rows.find(x=>x.symbol==='CCC').sessionEligible,false)});
await check('same round cannot issue second request',async()=>{const original=make(),s=store(original);let attempts=0;const req=()=>maybeRecoverUniverse37(s,'session-universe-2026-11-03',original,{enabled:true,now:time,fetchQuotes:async()=>{attempts++;return {}}});await Promise.all([req(),req()]);assert.equal(attempts,1)});
await check('missing quote remains missing not zero eligible',async()=>{const original=make(),s=store(original);const r=await maybeRecoverUniverse37(s,'session-universe-2026-11-03',original,{enabled:true,now:time,fetchQuotes:async()=>({})});assert.equal(r.eligibleCount,1);assert.equal(r.failedSymbols.length,2)});
await check('after recovery cooldown blocks additional requests',async()=>{const original=make(),s=store(original);const after=await maybeRecoverUniverse37(s,'session-universe-2026-11-03',original,{enabled:true,now:time,fetchQuotes:async()=>({})});let calls=0;await maybeRecoverUniverse37(s,'session-universe-2026-11-03',after,{enabled:true,now:new Date(time.getTime()+2*60_000),fetchQuotes:async()=>{calls++}});assert.equal(calls,0)});
process.env=previousEnv;
console.log('DT37_UNIVERSE_RECOVERY_INTEGRATION_PASS',n+'/'+n);
