import assert from 'node:assert/strict';
import {reserveApiMinute} from '../netlify/functions/lib/credits.mjs';
let passed=0;const check=async(label,fn)=>{await fn();passed++;console.log('PASS',label)};
const store=()=>{const m=new Map();return {m,get:async key=>m.get(key)||null,
 setJSON:async(key,value,opts)=>{if(opts?.onlyIfNew&&m.has(key))return {modified:false};m.set(key,value);return {modified:true,etag:'"local-mock"'}}}};
await check('one API minute claim is allowed',async()=>{const s=store();assert.equal((await reserveApiMinute(s,'market-pro')).allowed,true)});
await check('duplicate claim does not use credits',async()=>{const s=store();await reserveApiMinute(s,'market-pro');assert.equal((await reserveApiMinute(s,'news-scan')).allowed,false)});
await check('12 concurrent requests: one winner',async()=>{const s=store();const res=await Promise.all(Array.from({length:12},(_,i)=>reserveApiMinute(s,'test'+i)));assert.equal(res.filter(x=>x.allowed).length,1)});
await check('successful receipt without persisted key fails closed',async()=>{const s={get:async()=>null,setJSON:async()=>({modified:true,etag:'"test"'})};await assert.rejects(()=>reserveApiMinute(s,'x'),/NOT_VERIFIED/)});
await check('conditional write not modified never approves',async()=>{const s={get:async()=>null,setJSON:async()=>({modified:false})};assert.equal((await reserveApiMinute(s,'x')).allowed,false)});
await check('storage failure never approves',async()=>{const s={get:async()=>null,setJSON:async()=>{throw Error('blobs unavailable')}};await assert.rejects(()=>reserveApiMinute(s,'x'),/blobs unavailable/)});
console.log('DT37_CREDIT_ATOMIC_PASS',passed+'/'+passed);
