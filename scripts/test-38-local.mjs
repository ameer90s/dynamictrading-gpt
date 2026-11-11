/** Local-only v3.8 acceptance checks. No Netlify, broker or OpenAI calls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDiscoverySlot38,selectResearchFocus38} from '../netlify/functions/lib/discovery-cadence38.mjs';
import {planEvidence38,recombineEvidence38,RESEARCH_BUDGET_38} from '../netlify/functions/lib/research-budget38.mjs';
import {fetchFinnhubContext38} from '../netlify/functions/lib/finnhub38.mjs';
import {learnRegimePatterns38,evaluateWalkForward38} from '../netlify/functions/lib/ai-regime-lab38.mjs';
import {reportStructureQuality38} from '../netlify/functions/lib/research-quality38.mjs';
import {summarizeScannerWeek371} from '../netlify/functions/lib/scanner-weekly-profit371.mjs';
let n=0;async function t(label,fn){await fn();n++;console.log('PASS',label)}
await t('Discovery runs exactly every fifteen NY trading minutes',()=>{
 for(let m=570;m<961;m++)assert.equal(isDiscoverySlot38(m),m<960&&(m-570)%15===0);
 assert.equal(isDiscoverySlot38(569),false);assert.equal(isDiscoverySlot38(570),true);assert.equal(isDiscoverySlot38(575),false);
});
await t('Twelve-focus ranks and deduplicates, no forced universe truncation at input',()=>{
 const a=Array.from({length:18},(_,i)=>({symbol:`S${i}`,focusScore:i}));const x=selectResearchFocus38(a);
 assert.equal(x.length,12);assert.equal(x[0].symbol,'S17');assert.equal(new Set(x.map(z=>z.symbol)).size,12);
});
await t('Soft/hard 80k/100k and 4k output limits are exact',()=>{
 assert.deepEqual([RESEARCH_BUDGET_38.softChars,RESEARCH_BUDGET_38.hardChars,RESEARCH_BUDGET_38.outputTokens],[80000,90000,4000]);
 assert.equal(planEvidence38({text:'x'.repeat(66751)}).status,'SINGLE_REQUEST');
 assert.equal(planEvidence38({text:'x'.repeat(79999)}).status,'SINGLE_REQUEST');
});
await t('Oversized essential evidence fails closed and never creates paid split requests',()=>{
 const evidence={rows:Array.from({length:1000},(_,i)=>({i,reason:'WHY_'+i,text:'z'.repeat(150)}))};const plan=planEvidence38(evidence);
 assert.equal(plan.status,'EVIDENCE_ESSENTIAL_DATA_OVER_BUDGET');assert.equal(plan.extraPaidCalls,0);assert.equal(plan.parts.length,0);
});
await t('Finnhub is OFF with missing key without a network call',async()=>{
 let calls=0;const r=await fetchFinnhubContext38(['AAPL'],{fetchFn:async()=>{calls++;throw Error('NETWORK_SHOULD_NOT_BE_CALLED')}});assert.equal(r.status,'NOT_CONFIGURED');assert.equal(calls,0);
});
await t('Finnhub mocks: bounded to 12 unique symbols, no secrets in payload',async()=>{
 let calls=0;const symbols=Array.from({length:20},(_,i)=>`T${i}`);const result=await fetchFinnhubContext38([...symbols,'T0'],{apiKey:'SECRET_LOCAL_ONLY',fetchFn:async(url,opt)=>{calls++;assert.equal(opt.headers['X-Finnhub-Token'],'SECRET_LOCAL_ONLY');return {ok:true,json:async()=>url.includes('/calendar/earnings')?{earningsCalendar:[{symbol:'T0',date:'2026-11-12',hour:'bmo'}]}:[{headline:'Company earnings',source:'news',datetime:1750000000}]}}});
 assert.equal(calls,13);assert.equal(result.requested,12);assert.equal(result.earningsStatus,'LIVE');assert.equal(result.bySymbol.T0.earnings.length,1);assert.equal(result.status,'LIVE');assert(!JSON.stringify(result).includes('SECRET_LOCAL_ONLY'));
});
await t('Finnhub outage returns degraded, does not stop scanner',async()=>{
 const r=await fetchFinnhubContext38(['AAPL'],{apiKey:'test',fetchFn:async()=>{throw Error('OFFLINE')}});assert.equal(r.status,'DEGRADED');assert.equal(r.bySymbol.AAPL,undefined);
});
await t('AI learning uses only previous closed unique paper trades',()=>{
 const rows=[{id:'A',status:'CLOSED',netUsd:3,closedAt:'2026-11-09',setupType:'RETEST',marketRegime:'TREND_UP'},{id:'A',status:'CLOSED',netUsd:3,closedAt:'2026-11-09',setupType:'RETEST',marketRegime:'TREND_UP'},{id:'B',status:'CLOSED',netUsd:-2,closedAt:'2026-11-10',setupType:'EARLY',marketRegime:'RANGE'},{id:'C',status:'OPEN',netUsd:300,closedAt:'2026-11-09'}];
 const r=learnRegimePatterns38({closedPositions:rows,asOfDay:'2026-11-10',regime:'TREND_UP'});
 assert.equal(r.uniqueClosed,1);assert.equal(r.patterns[0].netUsd,3);assert.equal(r.eligibleForProduction,false);
});
await t('AI strategy lab needs independent 60 out-of-sample results',()=>{
 assert.equal(evaluateWalkForward38({baseline:[],candidate:[]}).status,'NOT_VERIFIED_INSUFFICIENT_SAMPLE');
 const b=Array.from({length:60},(_,i)=>({id:'b'+i,time:'2026-10-01',independent:true,outOfSample:true,grossUsd:2,notionalUsd:100}));const c=b.map((x,i)=>({...x,id:'c'+i,grossUsd:3}));
 const x=evaluateWalkForward38({baseline:b,candidate:c});assert.equal(x.status,'RESEARCH_COMPARISON_NOT_INDEPENDENT_AUDIT');assert.equal(x.productionAuthorized,false);
});
await t('Agent QA separates structural report score from real prediction accuracy',()=>{
 const x=reportStructureQuality38({review:{summary_ar:'تقرير '.repeat(40),observations:[{evidence_ids:['X']}],experiments:[{test_ar:'test '.repeat(10),acceptance_metric_ar:'metric test'}],uncertainties_ar:['missing']}});
 assert.equal(x.scorePct,100);assert.equal(x.predictiveAccuracy,'NOT_VERIFIED');assert.equal(x.independentAudit,'NOT_VERIFIED');
});
await t('Weekly target is 2 percent rather than 2.5 percent',()=>{
 const x=summarizeScannerWeek371('2026-11-09',[null,null,null,null,null],{now:new Date('2026-11-12T18:00:00Z')});
 assert.equal(x.targetPct,2);assert.equal(x.targetUsd,20);
});
await t('Exactly four bottom tabs and settings in header',()=>{
 const html=readFileSync('public/index.html','utf8');const count=(html.match(/class="tab-button(?: active)?" data-tab=/g)||[]).length;
 assert.equal(count,4);for(const t of ['market','ai','research','performance'])assert(html.includes(`data-tab="${t}"`));assert(html.includes('id="dt38Settings"'));assert(!html.includes('data-tab="today"'));
});
await t('Research decisions require owner token, not applied automatically',()=>{
 const js=readFileSync('netlify/functions/research-decision38.mjs','utf8');assert(js.includes('DT38_DECISION_ADMIN_TOKEN'));assert(js.includes('onlyIfNew:true'));assert(js.includes('productionApplied:false'));assert(!js.includes('sendOrder'));
});
await t('PWA approved assets and cache version belong to 3.8',()=>{
 const pwa=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));assert(pwa.icons.some(x=>x.src.includes('dt-pulse-approved-pwa-512')));assert(readFileSync('public/service-worker.js','utf8').includes('dynamic-trading-v3.8'));
});
console.log(`DT38_LOCAL_TESTS_PASS ${n}/${n}`);
