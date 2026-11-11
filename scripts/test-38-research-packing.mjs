import assert from 'node:assert/strict';
import {packEvidence38,RESEARCH_BUDGET_38} from '../netlify/functions/lib/research-budget38.mjs';
import {PILOT,makeOpenAiResearchRequest37,buildEvidence} from '../netlify/functions/lib/research-openai37.mjs';
const len=x=>JSON.stringify(x).length;
let n=0;function check(name,fn){fn();n++;console.log('PASS',name)}
function makeEvidence(caseCount=40,blobSize=2000){
 const makeCases=prefix=>Array.from({length:caseCount},(_,i)=>({id:`${prefix}_${i}`,archiveKey:`full-${prefix}-${i}`,reason:i%2?'WAIT_RETEST':'HOD',symbol:'NVDA',minute:570+i,state:'WAIT',failedGates:[{gate:'RETEST',value:i}],quote:{bid:120,ask:120.05,timestamp:'2026-11-10T15:00:00Z',spreadBps:4.2},features:{foo:'z'.repeat(blobSize)},decisionTrace:{verbose:'a'.repeat(blobSize)},riskEvidence:{'x':'d'.repeat(100)}}));
 const c=makeCases('scanner'),a=makeCases('ai');
 return {sourceId:'DT37_2026-11-10',day:'2026-11-10',mode:'PAPER_ONLY',evidenceIndex:['DT37_2026-11-10',...c.map(x=>x.id),...a.map(x=>x.id)],verifiedMetrics:{'scanner.totalConfirmed':{value:7,unit:'COUNT',sourceId:'DT37_2026-11-10'}},sourceCompleteness:{fullyAnalyzedLocally:true,rawPerMinuteRowsRetained:true,modelReceivesAllRawRows:false},limitations:['No NBBO'],scanner:{totalConfirmed:7,signals:[]},ai:{profitablePaperOutcomes:10,losingPaperOutcomes:2,netPaperUsd:30,positions:[]},archive:{scanner:{storedMinutes:330,attemptedRows:6020,reasonCounts:{WAIT_RETEST:1200},featureDistributions:{},detailedCases:c},ai:{storedMinutes:330,attemptedRows:4009,reasonCounts:{SESSION_RETURN_LOW:1653},featureDistributions:{},detailedCases:a},complete:true}};
}
check('Budget is 80k soft, 90k hard, 4000 output tokens',()=>{
 assert.deepEqual([PILOT.softInputChars,PILOT.maxInputChars,PILOT.maxOutputTokens],[80000,90000,4000]);
 assert.deepEqual([RESEARCH_BUDGET_38.softChars,RESEARCH_BUDGET_38.hardChars,RESEARCH_BUDGET_38.outputTokens],[80000,90000,4000]);
});
check('Nov 10 sized report is passed unchanged',()=>{
 const e={sourceId:'DT37_2026-11-10',evidenceIndex:['DT37_2026-11-10'],verifiedMetrics:{},limitations:[],body:'x'.repeat(66700)};
 const r=packEvidence38(e);assert.equal(r.status,'SINGLE_REQUEST');assert.equal(r.compressed,false);assert.equal(len(r.evidence),len(e));
});
check('Large scanner and AI evidence fits one 90k request with aggregate metrics untouched',()=>{
 const original=makeEvidence(40,2200);const prior=len(original);assert(prior>90000);
 const r=packEvidence38(original);
 assert.equal(r.status,'SINGLE_REQUEST');assert(r.compressed);assert(r.chars<=90000);assert.equal(r.extraPaidCalls,0);
 assert.equal(r.evidence.archive.scanner.attemptedRows,6020);assert.equal(r.evidence.archive.ai.attemptedRows,4009);
 assert.equal(r.evidence.archive.ai.reasonCounts.SESSION_RETURN_LOW,1653);
 assert.deepEqual(r.evidence.verifiedMetrics,original.verifiedMetrics);
 assert.equal(original.archive.scanner.detailedCases[0].features.foo.length,2200);
 assert(r.evidence.evidenceIndex.every(id=>id===r.evidence.sourceId||['scanner','ai'].some(k=>r.evidence.archive[k].detailedCases.some(c=>c.id===id))));
 const request=makeOpenAiResearchRequest37(r.evidence);assert.equal(request.max_output_tokens,4000);
 assert(len(JSON.parse(request.input))<=90000);
});
check('Massive required aggregate fails closed with no paid request',()=>{
 const e=makeEvidence(1,1);e.archive.scanner.reasonCounts={veryLarge:'z'.repeat(100000)};
 const r=packEvidence38(e);assert.equal(r.status,'EVIDENCE_ESSENTIAL_DATA_OVER_BUDGET');assert.equal(r.evidence,null);assert.equal(r.extraPaidCalls,0);
});
check('Invalid limits stop before preparing evidence',()=>{
 assert.throws(()=>packEvidence38(makeEvidence(1,1),{softChars:90000,hardChars:80000}),/INVALID_EVIDENCE_BUDGET/);
});
console.log(`DT38_RESEARCH_PACKING_PASS ${n}/${n}`);
