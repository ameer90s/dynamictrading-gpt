import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Isolated HTTP handler smoke-test: inject a fake Netlify Blob store in memory.
// No server, paid API or network connections.
const file=new URL('../netlify/functions/ai-parallel.mjs',import.meta.url);
let source=readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
source=`const getStore=()=>globalThis.__dt37AuditStore;
const recommendationWindow=()=>({dateKey:'2026-11-03'});
const scalpSummary37=()=>({});\n`+source;
const {default:handler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const day='2026-11-03';
const baseDoc={status:'REVIEW_CREATED_NOT_APPLIED',model:'gpt-6.1-sol',usage:{input_tokens:1,output_tokens:1},
  review:{summary_ar:'safe report',experiments:[{area:'RISK_GATES',hypothesis_ar:'TEST_SHOW_REPORT',test_ar:'OFFLINE',
    expected_risk_ar:'NONE',evidence_ids:['DT37_2026-11-03'],confidence:'LOW'}]}};
async function run(primary,recovery,mirror){
 const doc=new Map([['ai-parallel-session-index',{days:[day]}],
  [`dt37-openai37-review-${day}`,primary],[`dt37-openai37-review-recovery-${day}`,recovery],
  [`ai-parallel-llm-review-${day}`,mirror],[`ai-parallel-recommendations-${day}`,{internalReport:{owner:'DYNAMIC_AI_ONLY',summary:'AI_INTERNAL_ONLY'},suggestions:[]}]]);
 globalThis.__dt37AuditStore={async get(k){return doc.get(k)??null;}};
 const reply=await handler(new Request(`https://local.invalid/api/ai-parallel?day=${day}`));
 assert.equal(reply.status,200);
 return (await reply.json()).days[0];
}
for(const input of [[baseDoc,null,null],[{status:'RESERVED'},baseDoc,null],[baseDoc,null,{status:'REVIEW_CREATED_NOT_APPLIED',suggestions:[{title_ar:'UI_MIRROR'}]}],[null,null,null]]){
 const result=await run(...input);
 assert.equal(result.llmReview.status,'NOT_SHARED_WITH_RESEARCH_AGENT');
 assert.deepEqual(result.llmReview.suggestions,[]);
 assert.equal(result.internalReport.summary,'AI_INTERNAL_ONLY');
 assert(!JSON.stringify(result).includes('TEST_SHOW_REPORT'));
 assert(!JSON.stringify(result).includes('UI_MIRROR'));
}
console.log('DT372_AI_REPORT_ISOLATION_PASS 4 source combinations, internal report retrieved without paid Research copies');
