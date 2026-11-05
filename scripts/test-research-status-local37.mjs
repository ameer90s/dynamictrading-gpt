import assert from 'node:assert/strict';
import {publicResearchSummary} from '../netlify/functions/lib/research-public37.mjs';
let n=0;function test(name,fn){fn();n++;console.log('PASS',name)}
const day='2026-11-02';const local={generatedAt:'2026-11-03T02:15:00Z',hypotheses:[{id:'PAIR',status:'PROPOSED_UNTESTED',observedFact:'test',hypothesis:'test',experiment:'verify',acceptanceMetric:'metric',limitation:'no fills'}]};
test('failed OpenAI still exposes saved local research',()=>{const d=publicResearchSummary({day,review:{status:'FAILED_NO_RETRY'},local});assert.equal(d.status,'FAILED_NO_RETRY');assert.equal(d.localHypotheses.length,1);assert.equal(d.localHypotheses[0].status,'PROPOSED_UNTESTED');assert.equal(d.canTrade,false)});
test('local-only day displays local status',()=>{const d=publicResearchSummary({day,local});assert.equal(d.status,'LOCAL_RESEARCH_ONLY')});
test('no local data means NO_REVIEW',()=>{const d=publicResearchSummary({day});assert.equal(d.status,'NO_REVIEW');assert.deepEqual(d.localHypotheses,[])});
test('no broker fills asserted by dashboard',()=>{const d=publicResearchSummary({day,local});assert.equal(d.mode,'PAPER_ONLY');assert.equal(d.canApplyChanges,false)});
test('public summary strips review secrets',()=>{const d=publicResearchSummary({day,review:{status:'FAILED_NO_RETRY',apiKey:'secret-dont-publish',error:'internal'}});assert(!JSON.stringify(d).includes('secret-dont-publish'))});
console.log('DT37_RESEARCH_STATUS_LOCAL_PASS',n+'/'+n);
