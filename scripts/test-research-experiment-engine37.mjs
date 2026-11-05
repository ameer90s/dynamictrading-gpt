import assert from 'node:assert/strict';
import {runResearchExperiment37,attachExperimentEvidence37} from '../netlify/functions/lib/research-experiment-engine37.mjs';
const proposal={family:'FAMILY_1',engine:'AI'};
const row=(i,v,gross)=>({day:`2026-10-${String(1+Math.floor(i/10)).padStart(2,'0')}`,tradeId:`t${i}`,engine:'AI',variant:v,grossUsd:gross,spreadUsd:.1,feesUsd:.1,slippageUsd:.1,riskUsd:1,regime:i%2?'TREND':'RANGE',complete:true,authenticQuotes:true});
const rows=Array.from({length:60},(_,i)=>[row(i,'BASELINE',1),row(i,'CANDIDATE',1.2)]).flat();
const args={proposal,rows,trainingEnd:'2026-09-30',holdoutStart:'2026-10-01',holdoutEnd:'2026-10-07'};
const checks=[
 ()=>assert.equal(runResearchExperiment37(args).status,'PROMISING_REQUIRES_INDEPENDENT_AUDIT'),
 ()=>assert.equal(runResearchExperiment37(args).eligibleForManualApproval,false),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.slice(0,100)}).status,'INSUFFICIENT_HOLDOUT'),
 ()=>assert.equal(runResearchExperiment37({...args,rows:[...rows,rows[0]]}).status,'INVALID_DATA'),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.map(r=>r.variant==='CANDIDATE'?{...r,authenticQuotes:false}:r)}).status,'INVALID_DATA'),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.map(r=>r.variant==='CANDIDATE'?{...r,grossUsd:-1}:r)}).status,'NO_PROVEN_IMPROVEMENT'),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.map(r=>r.variant==='CANDIDATE'?{...r,riskUsd:2}:r)}).status,'INVALID_DATA'),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.slice(0,2)}).status,'INSUFFICIENT_HOLDOUT'),
 ()=>assert.equal(runResearchExperiment37(args).experimentId,runResearchExperiment37(args).experimentId),
 ()=>assert.equal(attachExperimentEvidence37({kind:'MONTHLY',candidates:[{family:'FAMILY_1'}]},[runResearchExperiment37(args)]).candidates[0].canTrade,false),
 ()=>assert.throws(()=>runResearchExperiment37({...args,holdoutStart:'2026-09-01'})),
 ()=>assert.equal(runResearchExperiment37({...args,rows:rows.map(r=>({...r,engine:'SCALP'}))}).status,'INVALID_DATA'),
];
for(const [i,test] of checks.entries()){test();console.log('PASS offline experiment',i+1)}console.log(`DT37_EXPERIMENT_ENGINE_PASS ${checks.length}/${checks.length}`);
