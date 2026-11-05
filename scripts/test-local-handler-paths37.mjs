import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateExecutionQuote37} from '../netlify/functions/lib/execution-quote37.mjs';
import {randomUUID} from 'node:crypto';
function loadHandler(p,injected){
  let source=readFileSync(p,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export default async \(req\) =>/,'const handler = async (req) =>').replace(/^export /gm,'');
  return new Function(...Object.keys(injected),source+'\nreturn handler;')(...Object.values(injected));
}
const day='2026-11-03',good={symbol:'ABC',side:'LONG',tradeable:true,price:99.99,entryLow:99.7,entryHigh:100.2,badTrade:false};
const fresh={bid:99.98,ask:100,bidSize:40,askSize:25,timestamp:new Date().toISOString(),source:'Alpaca IEX latest quote'};
const makeStore=()=>{const m=new Map([[`candidate-${day}-active`,{generatedAt:new Date().toISOString(),all:[good],display8:[good]}]]);return {m,get:async k=>m.get(k)||null,setJSON:async(k,v,o={})=>{if(o.onlyIfNew&&m.has(k))return{modified:false};m.set(k,v);return{modified:true}},delete:async k=>{m.delete(k)}}};
const args={recommendationWindow:()=>({dateKey:day,isTradingDay:true,startMinute:570,minuteOfDay:800}),nextTradingDateKey:()=>day,previousTradingDateKey:()=>day,
 STRATEGY_VERSION:'3.7',validateExecutionQuote37,randomUUID,Response,URL};
function selection(store,configured,fetchFn){return loadHandler('netlify/functions/selection.mjs',{...args,getStore:()=>store,alpacaConfigured:()=>configured,fetchLatestQuotes:fetchFn})}
const req={method:'POST',json:async()=>({symbol:'ABC',mode:'active'})};
let n=0;async function test(name,fn){await fn();n++;console.log('PASS',name)}
await test('selection without Alpaca denies approval',async()=>{const store=makeStore(),handler=selection(store,false,async()=>{throw Error('should not fetch')});const res=await handler(req);assert.equal(res.status,503);assert.equal(store.m.has(`selection-${day}`),false)});
await test('selection quote transport failure denies approval',async()=>{const store=makeStore(),handler=selection(store,true,async()=>{throw Error('Alpaca unavailable')});const res=await handler(req);assert.equal(res.status,503);assert.equal(store.m.has(`selection-${day}`),false)});
await test('selection incomplete quote denies approval',async()=>{const store=makeStore(),handler=selection(store,true,async()=>({ABC:{...fresh,askSize:0}}));const res=await handler(req);assert.equal(res.status,409);assert.equal((await res.json()).reason,'EXECUTION_QUOTE_INCOMPLETE');assert.equal(store.m.has(`selection-${day}`),false)});
await test('selection valid quote accepts only paper selection',async()=>{const store=makeStore(),handler=selection(store,true,async()=>({ABC:fresh}));const res=await handler(req);assert.equal(res.status,201);assert.equal(store.m.get(`selection-${day}`).executableEntry,100);assert.equal(store.m.get(`selection-${day}`).ownershipRule,'CASH_LONG_ONLY')});
await test('two simultaneous approvals: exactly one accepted',async()=>{const store=makeStore(),handler=selection(store,true,async()=>({ABC:fresh}));const responses=await Promise.all([handler(req),handler(req)]);assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===409).length,1);assert.equal(store.m.get(`daily-risk-${day}`).trades,1)});
const oldKey='market-pro-latest-v35';const newKey=s=>`${oldKey}-${s}`;
function marketPro(store,hasKey,fetchFn=async()=>{throw Error('should not fetch')},allowed=false){
 return loadHandler('netlify/functions/market-pro.mjs',{getStore:()=>store,fetchCandles:fetchFn,reserveApiMinute:async()=>({allowed,waitSeconds:15}),marketSession:()=>({status:'REGULAR'}),Response,URL,process:{env:hasKey?{TWELVE_DATA_API_KEY:'LOCAL_TEST'}:{}}});
}
const get=s=>({method:'GET',url:`https://local.invalid/api/market-pro?symbol=${s}`});
await test('market pro missing TwelveData key is safely disabled',async()=>{const store=makeStore(),handler=marketPro(store,false);const res=await handler(get('ABC'));assert.equal(res.status,503);assert.equal((await res.json()).reason,'TWELVE_DATA_NOT_CONFIGURED')});
await test('market pro does not reuse another symbol cached result',async()=>{const store=makeStore();store.m.set(newKey('XYZ'),{symbol:'XYZ',generatedAt:new Date().toISOString()});const res=await marketPro(store,true)(get('ABC'));assert.equal(res.status,429)});
await test('market pro caches valid result for requested symbol only',async()=>{const store=makeStore();store.m.set(newKey('ABC'),{symbol:'ABC',generatedAt:new Date().toISOString()});const res=await marketPro(store,true)(get('ABC'));assert.equal(res.status,200);assert.equal((await res.json()).symbol,'ABC')});
await test('market pro marks aged cached result stale',async()=>{const store=makeStore();store.m.set(newKey('ABC'),{symbol:'ABC',generatedAt:'2025-01-01T00:00:00Z'});const res=await marketPro(store,true)(get('ABC'));assert.equal((await res.json()).cacheStale,true)});
console.log('DT37_LOCAL_HANDLER_PATHS_PASS',n+'/'+n);
