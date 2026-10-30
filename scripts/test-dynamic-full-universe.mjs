import assert from 'node:assert/strict';
import {normalizePool,discoveryBatch,discoveryBatches,mergeDiscovery,selectedUniverse,priceBucket,PRICE_CAP} from '../netlify/functions/lib/dynamic.mjs';
import {buildSessionUniverseFromScan} from '../netlify/functions/lib/session-universe.mjs';
import {getSmartWatch,smartWatchSymbols,updateSmartWatch} from '../netlify/functions/lib/smart-watch.mjs';

const symbols=Array.from({length:1237},(_,i)=>`T${String(i+1).padStart(4,'0')}`);
assert.equal(normalizePool(symbols).length,1237,'normalizePool must not truncate >500');
assert.equal(new Set(normalizePool([...symbols,...symbols.slice(0,20)])).size,1237,'dedupe must preserve full universe');
assert.equal(priceBucket(4.99),'0-4.99');assert.equal(priceBucket(5),'5-9.99');assert.equal(priceBucket(9.99),'5-9.99');assert.equal(priceBucket(10),'10-200');assert.equal(priceBucket(199.99),'10-200');

// Session price screen: exact band counts + $200 exclusion.
const quotes={};for(let i=0;i<symbols.length;i++){const px=i<100?4.5:i<250?7.5:i<1200?50:205;quotes[symbols[i]]={mid:px,timestamp:'2026-10-20T13:50:00Z'};}
const sess=buildSessionUniverseFromScan('2026-10-20',symbols,{quotes,batchCount:25,errors:[]});
assert.equal(sess.universeCount,1237);assert.equal(sess.pricedSymbols,1237);assert.equal(sess.quoteCoveragePct,100);assert.equal(sess.eligibleCount,1200);assert.deepEqual(sess.priceBands,{'0-4.99':100,'5-9.99':150,'10-200':950});assert(!sess.eligibleSymbols.includes(symbols[1200]));

// Full regular-session discovery coverage with 8/minute, continuing after 10:10.
let d=null;const eligible=sess.eligibleSymbols;const minutes=Math.ceil(eligible.length/8);
for(let k=0;k<minutes;k++){const minute=590+k;const batch=discoveryBatch(eligible,minute);const all=batch.map((symbol,j)=>({symbol,price:50+j/100,inPlayScore:50,confidence:60,metrics:{relativeVolume:1.2,liquidityScore:80,mtfAlignment:70,relativeStrengthPct:.2,atrPct:1,sessionChangePct:1}}));d=mergeDiscovery(d,{all,generatedAt:`2026-10-20T${String(13+Math.floor(k/60)).padStart(2,'0')}:00:00Z`},minute,eligible,batch);}
assert.equal(d.scannedSymbols,1200,'all eligible symbols must be attempted');assert.equal(d.analyzedSymbols,1200,'all mocked symbols must be analyzed');assert.equal(d.leaders.length,1200,'discovery must not truncate leaders to 80');assert.equal(new Set(d.attemptedSymbols).size,1200);
assert(discoveryBatch(eligible,610).length===8,'discovery must continue after 10:10');
assert.equal(selectedUniverse(d,[]).length,1200,'dynamic selection must not truncate eligible leaders to a fixed Top-8');
const tenMinute=new Set();for(let m=570;m<580;m++)for(const batch of discoveryBatches(eligible,m,10))for(const sym of batch)tenMinute.add(sym);assert.equal(tenMinute.size,1200,'10-minute discovery cycle must cover the full eligible universe');

// Attempted coverage must still count a failed/deep-analysis symbol, without promoting it to leaders.
const b=discoveryBatch(eligible,590);const partial=b.slice(0,7).map(symbol=>({symbol,price:50,inPlayScore:50,confidence:60,metrics:{}}));const failD=mergeDiscovery(null,{all:partial,generatedAt:'2026-10-20T13:50:00Z'},590,eligible,b);assert.equal(failD.scannedSymbols,8);assert.equal(failD.analyzedSymbols,7);

// Same-session >$200 continuation: session eligibility, not current price, governs watch eligibility.
const carry=mergeDiscovery(null,{all:[{symbol:'NEAR200',price:199,inPlayScore:60,confidence:70,metrics:{}}],generatedAt:'2026-10-20T13:50:00Z'},590,['NEAR200'],['NEAR200']);
const risen=mergeDiscovery(carry,{all:[{symbol:'NEAR200',price:205,inPlayScore:60,confidence:70,metrics:{}}],generatedAt:'2026-10-20T15:00:00Z'},660,['NEAR200'],['NEAR200']);assert.equal(risen.leaders[0].sessionEligible,true);assert.equal(risen.leaders[0].watchPriceExceptionEligible,true);assert.equal(selectedUniverse(risen,[])[0],'NEAR200');
// Next session rebuild at >$200 excludes it.
const next=buildSessionUniverseFromScan('2026-10-21',['NEAR200'],{quotes:{NEAR200:{mid:205}},batchCount:1,errors:[]});assert.equal(next.eligibleCount,0);assert.equal(next.rows[0].sessionEligible,false);

// Persistent SMART watch: rank changes cannot silently drop SMART; only terminal states remove it.
const mem=new Map();const store={async get(k){return mem.get(k)||null;},async setJSON(k,v){mem.set(k,structuredClone(v));}};
await updateSmartWatch(store,'2026-10-20',{generatedAt:'2026-10-20T14:00:00Z',all:[{symbol:'SMART1',recommendationState:'SMART',confidence:91,price:100,metrics:{setupFamily:'MOMENTUM'}}]});
let watch=await getSmartWatch(store,'2026-10-20');assert.deepEqual(smartWatchSymbols(watch),['SMART1']);
await updateSmartWatch(store,'2026-10-20',{generatedAt:'2026-10-20T14:01:00Z',all:[{symbol:'SMART1',recommendationState:'WAIT',confidence:88,price:100.2,metrics:{setupFamily:'MOMENTUM'}}]});watch=await getSmartWatch(store,'2026-10-20');assert.deepEqual(smartWatchSymbols(watch),['SMART1'],'WAIT must not silently drop a prior SMART');
await updateSmartWatch(store,'2026-10-20',{generatedAt:'2026-10-20T14:02:00Z',all:[{symbol:'SMART1',recommendationState:'CONFIRMED',confidence:92,price:100.4,metrics:{setupFamily:'MOMENTUM'}}]});watch=await getSmartWatch(store,'2026-10-20');assert.equal(smartWatchSymbols(watch).length,0);assert.equal(watch.terminal.at(-1).terminalState,'CONFIRMED');
assert.equal(PRICE_CAP,200);
console.log('FUNCTIONAL_DYNAMIC_FULL_UNIVERSE_PASS');
