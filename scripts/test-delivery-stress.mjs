import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizePool,discoveryBatch,discoveryBatches,mergeDiscovery,selectedUniverse} from '../netlify/functions/lib/dynamic.mjs';
import {buildSessionUniverseFromScan} from '../netlify/functions/lib/session-universe.mjs';

// Stress normalization / dedupe / blocked symbols / >500 regression.
const N=5000;const raw=Array.from({length:N},(_,i)=>`S${i}`);const norm=normalizePool([...raw,...raw,'SOFI','HOOD','COIN','MARA','MSTR']);assert.equal(norm.length,N+5);
// Verify deterministic minute rotation and no symbol outside allowed pool.
const pool=raw.slice(0,1999);const seen=new Set();for(let m=590;m<=839;m++){for(const s of discoveryBatch(pool,m)){assert(pool.includes(s));seen.add(s);}}assert.equal(seen.size,1999,'<=1999 eligible symbols must all be attempted by 14:00 with 8/min');
// 2000 boundary exactly covered in 250 minutes.
const pool2=raw.slice(0,2000),seen2=new Set();for(let m=590;m<=839;m++)for(const s of discoveryBatch(pool2,m))seen2.add(s);assert.equal(seen2.size,2000);
// Adaptive batches/minute guarantee full daily coverage for larger universes too.
for(const size of [2001,5000]){const p=raw.slice(0,size),seen=new Set();for(let m=590;m<=839;m++)for(const batch of discoveryBatches(p,m))for(const s of batch)seen.add(s);assert.equal(seen.size,size,`full coverage ${size}`);}
// Price screen with missing quote reports incomplete coverage rather than pretending 100%.
const q={A:{mid:4},B:{mid:7},C:{mid:50},D:{mid:201}};const x=buildSessionUniverseFromScan('2026-10-20',['A','B','C','D','E'],{quotes:q,batchCount:1,errors:[{batch:1}]});assert.equal(x.quoteCoveragePct,80);assert.equal(x.eligibleCount,3);assert.deepEqual(x.priceBands,{'0-4.99':1,'5-9.99':1,'10-200':1});
// Discovery failure accounting: attempted != analyzed.
let d=mergeDiscovery(null,{all:[{symbol:'A',price:4,inPlayScore:1,metrics:{}}]},590,['A','B'],['A','B']);assert.equal(d.scannedSymbols,2);assert.equal(d.analyzedSymbols,1);assert.equal(selectedUniverse(d,[])[0],'A');
// No forbidden truncation signatures in operational dynamic scanner.
const dyn=fs.readFileSync(new URL('../netlify/functions/lib/dynamic.mjs',import.meta.url),'utf8');assert(!/slice\(0\s*,\s*500\)/.test(dyn));assert(!/leaders\.slice\(0\s*,\s*80\)/.test(dyn));
console.log('DELIVERY_STRESS_PASS 12/12');
