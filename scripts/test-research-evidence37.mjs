import assert from 'node:assert/strict';
import {loadResearchAudit,auditResearchReadiness} from '../netlify/functions/lib/research-evidence37.mjs';
import {shariaSnapshotEvidence} from '../netlify/functions/lib/research-sharia37.mjs';
import {buildEvidence} from '../netlify/functions/lib/research-openai37.mjs';
import {researchAgent37FromAudit} from '../netlify/functions/lib/research-agent37.mjs';
function mock(){const map=new Map();return {map,
 async get(k){return map.has(k)?structuredClone(map.get(k)):null},
 async setJSON(k,v,options={}){if(options.onlyIfNew&&map.has(k))return {modified:false};map.set(k,structuredClone(v));return {modified:true}},
 async list({prefix}={}){return {blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key,etag:'test'})),directories:[]}}
}}
const day='2026-11-03';const sharia=shariaSnapshotEvidence({symbols:['XYZ','ABC','XYZ'],source:'LOCAL',methodology:'AAOIFI',fetchedAt:'2026-11-03T12:00Z'});
function writeMinute(m,scanner,ai,store){const ts=String(m).padStart(4,'0');
  store.map.set(`scanner-audit-${day}-${ts}`,{day,minute:m,eligibleCount:2,shariaEvidence:sharia,
   records:scanner,coverage:{attempted:scanner.length},errors:[]});
  store.map.set(`ai-parallel-audit-${day}-${ts}`,{day,minute:m,shariaEvidence:sharia,
   snapshots:ai,coverage:{attempted:ai.length},feedErrors:[],transitions:[],closedNew:[]});
}
const pos={symbol:'ABC',to:'AI_PAPER_CONFIRMED',state:'AI_PAPER_CONFIRMED',reason:'AI_PAPER_CONFIRMED',
 features:{price:42,volumeRatio:1.8,hodGapPct:2.1},quote:{bid:41.99,ask:42,bidSize:8,askSize:5,timestamp:'2026-11-03T15:00:00Z',source:'Alpaca IEX',spreadBps:2.38,age:2},
 position:{status:'CLOSED',entry:42,mfePct:1.2,maePct:-.3,netUsd:.6,feesUsd:.2}};
let count=0;function t(label,fun){count++;return Promise.resolve(fun()).then(()=>console.log('PASS',label))}
await t('exact source sha reproducible',()=>assert.equal(sharia.snapshotSha256,shariaSnapshotEvidence({symbols:['ABC','XYZ'],source:'OTHER'}).snapshotSha256));
await t('missing archive means missing, never zero',async()=>{
 const s=mock();const q=await loadResearchAudit({store:s,day});assert.equal(q.streams.ai.storedMinutes,0);assert.equal(q.streams.ai.zeroRecordMinutes,0);assert.equal(q.streams.ai.missingMinutes.length,390);assert.equal(auditResearchReadiness(q).ok,false);
});
await t('all decisions, zero candidates, provenance and quote fields',async()=>{
 const s=mock();writeMinute(570,[],[pos],s);writeMinute(571,[],[],s);
 const q=await loadResearchAudit({store:s,day});assert.equal(q.streams.ai.storedMinutes,2);assert.equal(q.streams.ai.zeroRecordMinutes,1);
 assert.equal(q.streams.ai.quote.withSizes,1);assert.equal(q.streams.ai.quote.validBidAsk,1);
 assert.equal(q.streams.scanner.zeroRecordMinutes,2);assert.equal(q.streams.ai.attemptedRows,1);
 assert.equal(q.streams.ai.shariaSnapshots.length,1);assert.equal(q.streams.ai.reasonCounts[0].name,'AI_PAPER_CONFIRMED');
 assert.equal(auditResearchReadiness(q).ok,false); // base scanner has no symbols
});
await t('daily evidence only includes recorded snapshots, no invented fills',async()=>{
 const s=mock();writeMinute(570,[{symbol:'ABC',state:'WAIT',reason:'SPREAD_TOO_WIDE',quote:pos.quote,features:{price:42},openingChecks:[{passed:false}]}],[pos],s);
 const q=await loadResearchAudit({store:s,day});assert.equal(auditResearchReadiness(q).ok,true);
 const e=buildEvidence({day,aiState:{updatedAt:'2026-11-03',records:{}},audit:q});
 assert.equal(e.archive.complete,false);assert.equal(e.archive.ai.missingMinutes,389);
 assert.equal(e.archive.ai.detailedCases[0].quote.bidSize,8);assert(JSON.stringify(e).length<=65000);
 assert.equal(e.archive.crossScanner.sameMinuteSameSymbol,1);assert.equal(e.archive.crossScanner.matchingBothBidAsk,1);
 assert.equal(e.limitations.some(x=>x.includes('Missing minute')),true);
 const research=researchAgent37FromAudit({day,audit:q});assert.equal(research.noBrokerOrders,true);assert.equal(research.hypotheses.every(h=>h.canApply===false),true);assert.equal(research.hypotheses[0].status,'PROPOSED_UNTESTED');
});
await t('read errors fail readiness',async()=>{
 const s=mock();writeMinute(570,[{symbol:'ABC',state:'WAIT'}],[pos],s);
 s.map.set(`scanner-audit-${day}-0570`,{minute:700,records:[{symbol:'ABC'}]});
 const q=await loadResearchAudit({store:s,day});assert.equal(q.streams.scanner.readErrors[0].error,'MINUTE_KEY_MISMATCH');assert.equal(auditResearchReadiness(q).ok,false);
});
await t('full regular session complete means 390 records per stream',async()=>{
 const s=mock();for(let m=570;m<=959;m++)writeMinute(m,[{symbol:'ABC',state:'WAIT',reason:'NO_ENTRY',quote:null}],[pos],s);
 const q=await loadResearchAudit({store:s,day});assert.equal(q.complete,true);assert.equal(q.streams.ai.storedMinutes,390);
 assert.equal(q.streams.ai.missingMinutes.length,0);assert.equal(q.streams.ai.attemptedRows,390);
 assert.equal(q.streams.scanner.quote.missing,390);assert.equal(auditResearchReadiness(q).ok,true);
});
await t('failed cycle preserved separately from zero-trade minute',async()=>{
 const s=mock();writeMinute(570,[{symbol:'ABC',state:'WAIT'}],[pos],s);
 s.map.set(`ai-parallel-audit-${day}-0571`,{minute:571,cycleStatus:'FAILED',snapshots:[],feedErrors:[{symbol:'SPY',error:'429'}],shariaEvidence:sharia});
 const q=await loadResearchAudit({store:s,day});assert.equal(q.streams.ai.failedCycles,1);assert.equal(q.streams.ai.zeroRecordMinutes,1);
});
console.log(`DT37_RESEARCH_EVIDENCE_PASS ${count}/${count}`);
