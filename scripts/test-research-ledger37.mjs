import assert from 'node:assert/strict';
import {summarizeMinuteAudit,recordResearchMinute,ledgerKey,summarizeDailyLedger,pairedDailyResearch} from '../netlify/functions/lib/research-ledger37.mjs';
import {buildEvidence,dailyEvidenceReadiness,PILOT} from '../netlify/functions/lib/research-openai37.mjs';
import {writeScannerAudit36} from '../netlify/functions/lib/scanner-audit36.mjs';
const day='2026-11-03';let tests=0;
const check=(name,fn)=>{tests++;return Promise.resolve(fn()).then(()=>console.log('PASS',name));};
function store(){const map=new Map;return {map,
 async get(k){return map.has(k)?structuredClone(map.get(k)):null},
 async setJSON(k,v){map.set(k,structuredClone(v));return {modified:true}}}}
const sharia={source:'VERIFIED_ASOF',sourceUpdatedAt:'2026-11-02T12:00Z',snapshotSha256:'sha-test',methodology:'AAOIFI'};
const quote={bid:99.97,ask:100,bidSize:250,askSize:190,timestamp:'2026-11-03T15:31:00Z',source:'Alpaca IEX',spreadBps:3,ageSec:2};
const scannerRecord={symbol:'AAA',state:'SMART',reason:'WAIT_CONFIRMED_RETEST',features:{price:100,volumeRatio:1.5,hodGapPct:1.2,rsi14:61},
 quote,openingChecks:[{gate:'volume',passed:true}],confirmationChecks:[{gate:'retest',passed:false,observed:0,threshold:1,reason:'WAIT_CONFIRMED_RETEST'}],
 tradePlan:{entryLow:99.8,entryHigh:100.2,stopLoss:98,tp1:101,tp2:102,tp3:103}};
const aiRecord={symbol:'AAA',state:'AI_PAPER_CONFIRMED',reason:'AI_INDEPENDENT_ENTRY',features:{price:100,volumeRatio:1.9,hodGapPct:1.4},quote,
 checks:{opening:[{gate:'opening',passed:true}],execution:[{gate:'spread',passed:true}]},policy:{maxSpreadBps:8},
 position:{id:'P1',status:'CLOSED',entry:100,netUsd:-1.35,feesUsd:.24,mfePct:.3,maePct:-.8,outcome:'SL'}};
function doc(kind,minute,rows,{failed=false}={}){return {day,minute,cycleStatus:failed?'FAILED':'COMPLETED',shariaEvidence:sharia,
 ...(kind==='scanner'?{records:rows,attemptedSymbols:rows.map(x=>x.symbol)}:{snapshots:rows,transitions:[],closedNew:[]})};}
await check('raw base scanner audit preserves every row, all gates, unresolved and no price invention',async()=>{
 const s=store();const r={symbol:'AAA',recommendationState:'SMART',stateReason:'WAIT_CONFIRMED_RETEST',price:100,
  research36:{features:{price:100},openingChecks:[{gate:'g1',passed:true}],confirmationChecks:[{gate:'retest',passed:false}],
    executionChecks:[],quote}};
 const d=await writeScannerAudit36(s,day,570,[r],{attempted:['AAA','BBB'],eligibleCount:200,shariaEvidence:sharia});
 assert.equal(d.records.length,2);assert.equal(d.records[1].reason,'ATTEMPTED_NO_RESULT');
 assert.equal(d.records[0].confirmationChecks[0].gate,'retest');
 assert.equal((await s.get(ledgerKey('scanner',day,570))).minutes['0570'].rowCount,2);
 assert.equal((await s.get(`scanner-audit-${day}-0570`)).records.length,2);
});
await check('daily ledger covers all rows even when no signal or no quote',()=>{
 const r=summarizeMinuteAudit({kind:'scanner',day,doc:doc('scanner',571,[scannerRecord,{symbol:'BBB',state:'WAIT',reason:'NO_QUOTE'}])});
 assert.equal(r.rowCount,2);assert.equal(r.quote.valid,1);assert.equal(r.quote.missing,1);
 assert.equal(r.gatesFail.retest,1);assert.equal(r.features.price.count,1);
 assert.equal(r.symbols.length,2);assert.equal(r.examples[0].id,`scanner:${day}:0571:AAA`);
});
await check('AI includes independent dynamic policy, real quote sizes, paper outcome, source refs',()=>{
 const r=summarizeMinuteAudit({kind:'ai',day,doc:doc('ai',572,[aiRecord])});
 assert.equal(r.examples[0].policy.maxSpreadBps,8);
 assert.equal(r.quote.withSize,1);assert.equal(r.examples[0].position.maePct,-.8);
 assert.equal(r.examples[0].archiveKey,`ai-parallel-audit-${day}-0572`);
});
await check('duplicate minute cannot double-count; corrected minute replaces previous summary',async()=>{
 const s=store(),d=doc('ai',573,[aiRecord]);
 assert.equal((await recordResearchMinute({store:s,day,kind:'ai',doc:d})).status,'RECORDED');
 assert.equal((await recordResearchMinute({store:s,day,kind:'ai',doc:d})).status,'DUPLICATE');
 d.snapshots[0].reason='NEW_REASON';
 assert.equal((await recordResearchMinute({store:s,day,kind:'ai',doc:d})).status,'RECORDED');
 const led=await s.get(ledgerKey('ai',day,573));assert.equal(Object.keys(led.minutes).length,1);
 assert.equal(summarizeDailyLedger(led).reasonCounts[0].name,'NEW_REASON');
});
await check('390-minute paired audit has deterministic complete distributions and exact missing zeros',()=>{
 const a={day,kind:'scanner',minutes:{}},b={day,kind:'ai',minutes:{}};
 for(let m=570;m<960;m++){
  const k=String(m).padStart(4,'0');
  a.minutes[k]=summarizeMinuteAudit({kind:'scanner',day,doc:doc('scanner',m,m===570?[scannerRecord]:[{symbol:'AAA',state:'WAIT',reason:'NO_ENTRY',features:{price:100},openingChecks:[{gate:'one',passed:true}]}])});
  b.minutes[k]=summarizeMinuteAudit({kind:'ai',day,doc:doc('ai',m,m===570?[aiRecord]:[{symbol:'AAA',state:'SMART',reason:'PENDING',features:{price:100},checks:{candidate:[{gate:'one',passed:true}]}}])});
 }
 const x=pairedDailyResearch(a,b);assert.equal(x.complete,true);
 assert.equal(x.streams.scanner.attemptedRows,390);assert.equal(x.streams.ai.attemptedRows,390);
 assert.equal(x.comparison.sameSymbolMinute,390);assert.equal(x.comparison.quoteComparison,'ACTUAL_RECORDED_L1_PER_SYMBOL_MINUTE_NOT_BROKER_FILL');
 assert.equal(x.comparison.comparableQuotePairs,1);assert.equal(x.comparison.matchingPriceAndSourceAndTimestamp,1);
 assert.equal(x.streams.scanner.missingMinutes.length,0);assert.equal(x.streams.ai.missingMinutes.length,0);
 assert.equal(dailyEvidenceReadiness(x).ok,true);
 const docLLM=buildEvidence({day,aiState:{updatedAt:new Date().toISOString(),records:{AAA:{position:{id:'P1',status:'CLOSED',netUsd:-1.35}}}},
  scanner:{signals:{}},audit:x});
 assert.equal(docLLM.sourceCompleteness.aiRowsAggregated,390);
 assert.equal(docLLM.sourceCompleteness.modelReceivesAllRawRows,false);
 assert.equal(docLLM.archive.scanner.reasonCounts,undefined); // field is named `reasons`
 assert(docLLM.archive.ai.detailedCases.length>0);
 assert(docLLM.evidenceIndex.some(v=>v.startsWith(`ai:${day}`)));
 assert(JSON.stringify(docLLM).length<=PILOT.maxInputChars);
});
await check('missing 16 minutes, failed cycle, or absent sharia block paid daily analysis',()=>{
 const mk=(kind,n=390)=>({kind,day,minutes:Object.fromEntries(Array.from({length:n},(_,i)=>{
  const m=570+i;return [String(m).padStart(4,'0'),summarizeMinuteAudit({kind,day,doc:doc(kind,m,kind==='ai'?[aiRecord]:[scannerRecord])})];}))});
 const s=mk('scanner',374),a=mk('ai');
 let x=pairedDailyResearch(s,a);assert.equal(dailyEvidenceReadiness(x).ok,false);
 assert.equal(dailyEvidenceReadiness(x).reason,'SCANNER_COVERAGE_TOO_LOW');
 const bad=mk('scanner');for(let minute=570;minute<576;minute++)bad.minutes[String(minute).padStart(4,'0')].status='FAILED';
 x=pairedDailyResearch(bad,a);assert.equal(dailyEvidenceReadiness(x).reason,'SCANNER_EXCESSIVE_FAILED_CYCLES');
 const no=mk('scanner');for(const r of Object.values(no.minutes))r.sharia=null;
 x=pairedDailyResearch(no,a);assert.equal(dailyEvidenceReadiness(x).reason,'SCANNER_NO_SHARIA_PROVENANCE');
});
console.log(`DT37_DEEP_RESEARCH_LEDGER_PASS ${tests}/${tests}`);
