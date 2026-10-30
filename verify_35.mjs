import assert from 'node:assert/strict';
import {BUNDLED_SHARIA_SYMBOLS} from './netlify/functions/lib/sharia-bundled.mjs';
import {getShariaUniverse} from './netlify/functions/lib/sharia.mjs';
import {buildSessionUniverseFromScan} from './netlify/functions/lib/session-universe.mjs';
import {discoveryBatches,mergeDiscovery,normalizePool,PRICE_CAP} from './netlify/functions/lib/dynamic.mjs';

assert.equal(BUNDLED_SHARIA_SYMBOLS.length,172,'bundled US stock universe count');
assert.equal(new Set(BUNDLED_SHARIA_SYMBOLS).size,172,'no duplicate Sharia symbols');
assert.ok(!BUNDLED_SHARIA_SYMBOLS.some(x=>x.endsWith('.TO')),'no TSX symbols');
const fakeStore={async get(){return null},async setJSON(){}};
const sh=await getShariaUniverse(fakeStore);
assert.equal(sh.source,'BUNDLED_VERIFIED_SHARIA_CSV');
assert.equal(sh.count,172);
assert.equal(sh.cacheStatus,'BUNDLED_LOCAL_ZERO_CREDIT');

const q={}; BUNDLED_SHARIA_SYMBOLS.forEach((s,i)=>q[s]={mid:i===0?4.5:i===1?7.5:i===2?200:i===3?200.01:50,timestamp:'2026-10-20T13:30:00Z'});
const sess=buildSessionUniverseFromScan('2026-10-20',BUNDLED_SHARIA_SYMBOLS,{quotes:q,batchCount:4,errors:[]});
assert.equal(sess.universeCount,172);assert.equal(sess.pricedSymbols,172);assert.equal(sess.eligibleCount,171,'<=200 inclusive, >200 excluded');
assert.equal(sess.priceBands['0-4.99'],1);assert.equal(sess.priceBands['5-9.99'],1);assert.equal(sess.priceBands['10-200'],169);
assert.ok(sess.eligibleSymbols.includes(BUNDLED_SHARIA_SYMBOLS[2]),'$200 is eligible');assert.ok(!sess.eligibleSymbols.includes(BUNDLED_SHARIA_SYMBOLS[3]),'$200.01 excluded');

const pool=normalizePool(BUNDLED_SHARIA_SYMBOLS);const seen=new Set();
for(let m=570;m<=840;m++)for(const b of discoveryBatches(pool,m))for(const x of b)seen.add(x);
assert.equal(seen.size,pool.length,'full eligible universe gets discovery coverage');

const sym=pool[0];
let d=mergeDiscovery(null,{generatedAt:'2026-10-20T13:31:00Z',all:[{symbol:sym,price:199,confidence:80,inPlayScore:80,metrics:{relativeVolume:2,liquidityScore:90,mtfAlignment:90,relativeStrengthPct:1,atrPct:2,sessionChangePct:3,setupFamily:'VWAP_RECLAIM'}}]},571,[sym],[sym]);
d=mergeDiscovery(d,{generatedAt:'2026-10-20T14:00:00Z',all:[{symbol:sym,price:205,confidence:80,inPlayScore:80,metrics:{relativeVolume:2,liquidityScore:90,mtfAlignment:90,relativeStrengthPct:1,atrPct:2,sessionChangePct:3,setupFamily:'VWAP_RECLAIM'}}]},600,[sym],[sym]);
const row=d.leaders.find(x=>x.symbol===sym);assert.equal(row.sessionEligible,true);assert.equal(row.watchPriceExceptionEligible,true,'same-session >$200 continuation retained');
assert.equal(PRICE_CAP,200);
console.log('FUNCTIONAL_TESTS_PASS');
