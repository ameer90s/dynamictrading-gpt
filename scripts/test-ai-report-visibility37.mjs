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
  [`ai-parallel-llm-review-${day}`,mirror]]);
 globalThis.__dt37AuditStore={async get(k){return doc.get(k)??null;}};
 const reply=await handler(new Request(`https://local.invalid/api/ai-parallel?day=${day}`));
 assert.equal(reply.status,200);
 return (await reply.json()).days[0].llmReview;
}
assert.equal((await run(baseDoc,null,null)).suggestions[0].title_ar,'TEST_SHOW_REPORT');
assert.equal((await run({status:'RESERVED'},baseDoc,null)).suggestions[0].title_ar,'TEST_SHOW_REPORT');
assert.equal((await run(baseDoc,null,{status:'REVIEW_CREATED_NOT_APPLIED',suggestions:[{title_ar:'UI_MIRROR'}]})).suggestions[0].title_ar,'UI_MIRROR');
assert.equal((await run(null,null,null)).status,'DISABLED_OR_NOT_RUN');
console.log('DT37_AI_REPORT_VISIBILITY_OFFLINE_PASS 4/4');
