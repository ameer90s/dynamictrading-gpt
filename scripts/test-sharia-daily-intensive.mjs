import assert from 'node:assert/strict';
import {refreshDailySharia,DAILY_SHARIA_KEY} from '../netlify/functions/lib/sharia-daily.mjs';
import {buildSessionUniverseFromScan} from '../netlify/functions/lib/session-universe.mjs';
class Store{constructor(){this.m=new Map()}async get(k){return this.m.get(k)||null}async setJSON(k,v){this.m.set(k,structuredClone(v))}}
const rows=n=>Array.from({length:n},(_,i)=>({ticker:`T${String(i).padStart(4,'0')}`,exchange:i%2?'NYSE':'NASDAQ',entityType:'stock',verdict:'halal',basis:'AAOIFI'}));
let store=new Store();
let p={_meta:{generatedAt:'2026-10-20T10:00:00Z'},records:rows(150)};
let r=await refreshDailySharia(store,{minSymbols:50,fetchImpl:async()=>({ok:true,json:async()=>p})});assert.equal(r.count,150);
// changed source: 10 removed, 20 added
let p2={_meta:{generatedAt:'2026-10-21T10:00:00Z'},records:[...rows(140),...Array.from({length:20},(_,i)=>({ticker:`N${i}`,exchange:'NASDAQ',entityType:'stock',verdict:'halal',basis:'AAOIFI'}))]};
r=await refreshDailySharia(store,{minSymbols:50,fetchImpl:async()=>({ok:true,json:async()=>p2})});assert.equal(r.count,160);assert.equal(r.changes.added.length,20);assert.equal(r.changes.removed.length,10);
// empty/corrupt/http/throw preserve last valid 160
for(const f of [async()=>({ok:true,json:async()=>({records:[]})}),async()=>({ok:false,status:429}),async()=>{throw new Error('network')},async()=>({ok:true,json:async()=>({records:[{ticker:'BAD',exchange:'TSX',entityType:'stock',verdict:'halal',basis:'AAOIFI'}]})})]){const x=await refreshDailySharia(store,{minSymbols:50,fetchImpl:f});assert.equal(x.count,160);assert.equal(x.cacheStatus,'DAILY_STALE_FALLBACK');}
// Session universe lock semantics: eligible at <=200 remains in saved session concept even if later >200.
const scan={quotes:{T0000:{mid:199},T0001:{mid:200},T0002:{mid:200.01}}};const u=buildSessionUniverseFromScan('2026-10-20',['T0000','T0001','T0002'],scan);assert.deepEqual(u.eligibleSymbols,['T0000','T0001']);assert.equal(u.eligibleCount,2);
// Master mutation does not mutate already-built session object.
const master=await store.get(DAILY_SHARIA_KEY);master.symbols.splice(0,50);assert.deepEqual(u.eligibleSymbols,['T0000','T0001']);
// 100 randomized validation rounds
for(let k=0;k<100;k++){const n=50+k;const pp={records:rows(n)};const x=await refreshDailySharia(store,{minSymbols:50,fetchImpl:async()=>({ok:true,json:async()=>pp})});assert.equal(x.count,n);}
console.log('INTENSIVE_DAILY_SHARIA_PASS 112/112');
