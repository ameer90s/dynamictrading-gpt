import assert from 'node:assert/strict';
import {gateEvidence39,reconcileResearch39,attachForwardOutcomes39,summarizeGateEvidence39,gateOutcomeMatrix39} from '../netlify/functions/lib/gate-evidence39.mjs';
import {writeScannerAudit36} from '../netlify/functions/lib/scanner-audit36.mjs';
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS',name)};
const day='2026-11-12';
test('opening incomplete classified as data problem',()=>{const x=gateEvidence39({state:'WAIT',reason:'INCOMPLETE_OPENING'});assert.equal(x.classification,'DATA_OR_OPENING');assert.equal(x.opening.state,'INCOMPLETE')});
test('failed technical gate reported separately',()=>{const x=gateEvidence39({state:'WAIT',openingChecks:[{gate:'VWAP',passed:false,observed:0.3,threshold:0.6}]});assert.equal(x.classification,'GATE_REJECTION');assert.equal(x.failedGates[0].gate,'VWAP')});
test('stale quotes remain data defect',()=>{const x=gateEvidence39({state:'SMART',reason:'STALE_QUOTE',quote:{bid:10,ask:10.01,ageSec:9}});assert.equal(x.classification,'DATA_OR_OPENING');assert.equal(x.quote.ageSec,9)});
test('missing quote is unknown not false invalid',()=>{const x=gateEvidence39({state:'WAIT'});assert.equal(x.quote.status,'MISSING');assert.equal(x.opening.state,'UNVERIFIED');assert.equal(x.classification,'UNDETERMINED')});
test('crossed bid ask invalid',()=>{const x=gateEvidence39({state:'WAIT',quote:{bid:11,ask:10}});assert.equal(x.quote.status,'INVALID');assert.equal(x.classification,'DATA_OR_OPENING')});
test('signal not changed by audit',()=>{const r={state:'CONFIRMED',quote:{bid:10,ask:10.02}};const snap=JSON.stringify(r);gateEvidence39(r);assert.equal(JSON.stringify(r),snap)});
test('research day mismatch never linked',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:600,state:'SMART'}],researchRows:[{day:'2026-11-13',symbol:'A',minute:600}]})[0];assert.equal(x.matchStatus,'NO_SCANNER_RECORD')});
test('exact minute matches',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:600,state:'SMART'}],researchRows:[{day,symbol:'A',minute:600}]})[0];assert.equal(x.matchStatus,'EXACT_MINUTE')});
test('never uses future scanner decision',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:610,state:'CONFIRMED'}],researchRows:[{day,symbol:'A',minute:600}]})[0];assert.equal(x.matchStatus,'NO_ASOF_SCANNER_RECORD')});
test('ambiguous same minute not guessed',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:610,state:'SMART'},{day,symbol:'A',minute:610,state:'WAIT'}],researchRows:[{day,symbol:'A',minute:610}]})[0];assert.equal(x.matchStatus,'AMBIGUOUS')});
test('missing research minute not guessed',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:610,state:'SMART'}],researchRows:[{day,symbol:'A'}]})[0];assert.equal(x.matchStatus,'MISSING_RESEARCH_MINUTE')});
test('multiple positions not summed',()=>{const x=reconcileResearch39({scannerRows:[{day,symbol:'A',minute:610,state:'SMART'}],researchRows:[{day,symbol:'A',minute:610}],positionRows:[{day,symbol:'A',netUsd:2},{day,symbol:'A',netUsd:-2}]})[0];assert.equal(x.positionStatus,'MULTIPLE_POSITION_RECORDS');assert.equal(x.actualNetUsd,null)});
test('no future bars is NOT VERIFIED',()=>{const x=attachForwardOutcomes39([{day,symbol:'A',decisionAt:'2026-11-12T15:00:00Z'}],{})[0];assert.equal(x.followUp.status,'NOT_VERIFIED')});
test('uses entry strictly after decision and fee',()=>{const d='2026-11-12T15:00:00Z',z='2026-11-12T15:01:00Z';const bars={[`${day}|A`]:[{at:d,open:1,close:10},{at:z,open:100,close:110,high:120,low:90},{at:'2026-11-12T16:00:00Z',open:108,close:110,high:111,low:107}]};const x=attachForwardOutcomes39([{day,symbol:'A',decisionAt:d}],bars)[0].followUp.outcomes[60];assert.equal(x.status,'SIMULATED_MARK_TO_MARKET');assert.equal(x.entry,100);assert.ok(Math.abs(x.netPct-9.8)<1e-8)});
test('incomplete future horizon remains unverified',()=>{const bars={[`${day}|A`]:[{at:'2026-11-12T15:01:00Z',open:100,close:110}]};const x=attachForwardOutcomes39([{day,symbol:'A',decisionAt:'2026-11-12T15:00:00Z'}],bars)[0].followUp.outcomes[60];assert.equal(x.status,'NOT_VERIFIED')});
test('summarize gate frequencies',()=>{const x=summarizeGateEvidence39([{state:'WAIT',reason:'INCOMPLETE_OPENING'},{state:'WAIT',openingChecks:[{gate:'VWAP',passed:false}]}]);assert.equal(x.records,2);assert.equal(x.failedGates.VWAP,1)});
test('gate outcome matrix uses observed checks and complete horizons only',()=>{const rows=[
 {openingChecks:[{gate:'VWAP',passed:true}],followUp:{outcomes:{60:{status:'SIMULATED_MARK_TO_MARKET',netPct:2}}}},
 {openingChecks:[{gate:'VWAP',passed:false}],followUp:{outcomes:{60:{status:'SIMULATED_MARK_TO_MARKET',netPct:-1}}}},
 {openingChecks:[{gate:'VWAP',passed:true}],followUp:{outcomes:{60:{status:'NOT_VERIFIED'}}}},
 {openingChecks:[{gate:'SPREAD'}],followUp:{outcomes:{60:{status:'SIMULATED_MARK_TO_MARKET',netPct:99}}}}
 ];const out=gateOutcomeMatrix39(rows);assert.equal(out.length,2);assert.equal(out.find(x=>x.decision==='PASS').averageNetPct,2);assert.equal(out.find(x=>x.decision==='FAIL').positiveCount,0)});
test('conflicting gate checks in one record are not guessed',()=>{const out=gateOutcomeMatrix39([{openingChecks:[{gate:'VWAP',passed:true},{gate:'VWAP',passed:false}],followUp:{outcomes:{60:{status:'SIMULATED_MARK_TO_MARKET',netPct:10}}}}]);assert.equal(out.length,0)});
const store={data:new Map(),async setJSON(k,v,opts){this.data.set(k,v);return opts?{modified:true,etag:'TEST_ETAG'}:undefined},async get(k){return this.data.get(k)},async getWithMetadata(){return null}};
await writeScannerAudit36(store,day,600,[{symbol:'A',recommendationState:'WAIT',stateReason:'INCOMPLETE_OPENING',research36:{openingChecks:[{gate:'OPENING_BARS',passed:false}]}}],{attempted:['A','B']});
assert.equal(store.data.get(`scanner-audit-${day}-0600`).records.length,2);
assert.equal(store.data.get(`scanner-audit-${day}-0600`).gateSummary39.records,2);
assert.equal(store.data.get(`scanner-audit-${day}-0600`).records[0].gateEvidence39.classification,'DATA_OR_OPENING');
assert.equal(store.data.get(`dt37-research-ledger-scanner-${day}-10`).minutes['0600'].gateSummary39.byClass.DATA_OR_OPENING,1);
console.log('PASS existing scanner audit stores derived evidence and unresolved attempts');checks++;
console.log(`GATE_EVIDENCE_39_PASS ${checks}/${checks}`);
