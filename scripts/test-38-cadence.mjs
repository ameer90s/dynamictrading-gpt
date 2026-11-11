import assert from 'node:assert/strict';
import {cadencedDiscoveryBatches38,isDiscoverySlot38} from '../netlify/functions/lib/discovery-cadence38.mjs';
import {discoveryBatches} from '../netlify/functions/lib/dynamic.mjs';
let checks=0;
for(const n of [1,8,12,80,120,172,240,400,500,1000]){
 for(const close of [900,720]){
  const symbols=Array.from({length:n},(_,i)=>`S${i}`);const found=[];
  for(let minute=570;minute<close;minute++){
   const batches=cadencedDiscoveryBatches38(symbols,minute,{discoveryCutoff:close});
   if(!isDiscoverySlot38(minute))assert.equal(batches.length,0);
   for(const batch of batches){assert(batch.length<=8);found.push(...batch)}
  }
  assert.equal(found.length,n,`coverage ${n}/${close}`);
  assert.equal(new Set(found).size,n,`unique coverage ${n}/${close}`);
  checks++;
 }
}
// Regression: calling the legacy minute-indexed routine every 15m scans only 16/120.
const pool=Array.from({length:120},(_,i)=>`S${i}`),legacy=new Set();
for(let m=570;m<900;m+=15)for(const b of discoveryBatches(pool,m,10))b.forEach(s=>legacy.add(s));
assert.equal(legacy.size,16);checks++;
assert.deepEqual(cadencedDiscoveryBatches38(['AA','AA','BB'],570,{discoveryCutoff:600}).flat(),['AA']);checks++;
assert.deepEqual(cadencedDiscoveryBatches38([],570),[]);checks++;
console.log(`DT38_CADENCED_DISCOVERY_PASS ${checks}/${checks} (logical coverage only; market quality NOT VERIFIED)`);
