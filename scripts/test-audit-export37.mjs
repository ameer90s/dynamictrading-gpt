import assert from 'node:assert/strict';
import {serveAudit} from '../netlify/functions/ai-parallel-audit.mjs';
import {writeScannerAudit36} from '../netlify/functions/lib/scanner-audit36.mjs';
const saved=new Map();
const store={async setJSON(k,v){saved.set(k,structuredClone(v))},async get(k){return structuredClone(saved.get(k)??null)}};
const day='2026-10-30';
await writeScannerAudit36(store,day,570,[],{eligibleCount:40,attempted:[],errors:[]});
await writeScannerAudit36(store,day,571,[],{eligibleCount:40,attempted:['AAA'],errors:['feed_timeout']});
await writeScannerAudit36(store,day,572,[{symbol:'BBB',recommendationState:'SMART',stateReason:'RETEST_PENDING',price:20}],{eligibleCount:40,attempted:['BBB']});
for(const format of ['json','csv']){
 const req=new Request(`https://example.com/api/scanner-audit?kind=scanner&day=${day}&until=572&minutes=3&format=${format}`);
 const res=await serveAudit(req,store);assert.equal(res.status,200);
 assert.match(res.headers.get('content-disposition'),/attachment/);
 const body=await res.text();assert.match(body,/AAA/);assert.match(body,/BBB/);
 if(format==='csv'){
  assert.match(body,/NO_CANDIDATES/);assert.match(body,/feed_timeout/);
  assert.equal(body.trim().split('\n').length,4);
 }else{
  const data=JSON.parse(body);assert.equal(data.foundMinutes,3);assert.equal(data.documents[0].minute,572);assert.equal(data.documents[2].minute,570);
 }
}
const missing=await serveAudit(new Request('https://example.com/api/scanner-audit?kind=scanner&day=2026-10-29&until=570&minutes=1&format=json'),store);
assert.equal(missing.status,404);assert.equal((await missing.json()).foundMinutes,0);
console.log('PASS 3.7 archive export: zero-candidate minute, failed symbol, populated minute, CSV/JSON readback, missing archive status');
