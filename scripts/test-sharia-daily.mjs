import assert from 'node:assert/strict';
import {normalizeHalalWallet,diffSymbols,refreshDailySharia} from '../netlify/functions/lib/sharia-daily.mjs';
class Store{constructor(seed={}){this.m=new Map(Object.entries(seed))}async get(k){return this.m.get(k)||null}async setJSON(k,v){this.m.set(k,v)}}
const payload={_meta:{generatedAt:'2026-10-20T00:00:00Z'},records:[
 {ticker:'AAA',exchange:'NASDAQ',entityType:'stock',verdict:'halal',basis:'AAOIFI'},
 {ticker:'BBB',exchange:'NYSE',entityType:'stock',verdict:'halal',basis:'AAOIFI'},
 {ticker:'CCC',exchange:'TSX',entityType:'stock',verdict:'halal',basis:'AAOIFI'},
 {ticker:'DDD',exchange:'NASDAQ',entityType:'stock',verdict:'not_halal',basis:'AAOIFI'},
 {ticker:'ETF',exchange:'NASDAQ',entityType:'fintech_product',verdict:'halal',basis:'AAOIFI'}]};
assert.deepEqual(normalizeHalalWallet(payload).symbols,['AAA','BBB']);
assert.deepEqual(diffSymbols(['AAA','OLD'],['AAA','BBB']),{added:['BBB'],removed:['OLD'],unchanged:1});
let s=new Store();let r=await refreshDailySharia(s,{minSymbols:2,now:new Date('2026-10-20T12:15:00Z'),fetchImpl:async()=>({ok:true,json:async()=>payload})});assert.equal(r.count,2);assert.equal(r.cacheStatus,'DAILY_REFRESHED');
r=await refreshDailySharia(s,{minSymbols:2,now:new Date('2026-10-21T12:15:00Z'),fetchImpl:async()=>({ok:false,status:500})});assert.equal(r.count,2);assert.equal(r.cacheStatus,'DAILY_STALE_FALLBACK');
r=await refreshDailySharia(s,{minSymbols:50,fetchImpl:async()=>({ok:true,json:async()=>payload})});assert.equal(r.count,2);assert.equal(r.cacheStatus,'DAILY_STALE_FALLBACK');
console.log('daily sharia refresh: PASS 7/7');
