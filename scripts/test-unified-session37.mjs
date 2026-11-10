import assert from 'node:assert/strict';
import {marketSession,recommendationWindow} from '../netlify/functions/lib/time.mjs';
import {sessionPlan37} from '../netlify/functions/lib/trading-session-plan37.mjs';
import {researchExpectedMinutes37} from '../netlify/functions/lib/daily-research-diagnostic37.mjs';
import {aiOpenSymbols37,followAiOpenPositions37} from '../netlify/functions/lib/ai-followup37.mjs';
import {readFileSync} from 'node:fs';
let successes=0;
async function test(name,fn){await fn();successes++;console.log('PASS UNIFIED_WINDOW',name)}
function ny(ymd,hh,mm){const [y,m,d]=ymd.split('-').map(Number);let start=new Date(Date.UTC(y,m-1,d,12,0));for(let i=0;i<20;i++){const candidate=new Date(start.getTime()+i*3600000);const p=marketSession(candidate);if(p.hour===hh){return new Date(candidate.getTime()+mm*60000)}}throw Error('bad NY date '+ymd+' '+hh)}
const plan=(d,h,m)=>sessionPlan37(recommendationWindow(ny(d,h,m)));
await test('EST normal scan starts 09:30 and ends before 15:00',()=>{
 const d='2026-11-05';assert.equal(plan(d,9,29).discovery,false);
 assert.equal(plan(d,9,30).discovery,true);assert.equal(plan(d,14,59).discovery,true);
 assert.equal(plan(d,15,0).discovery,false);assert.equal(plan(d,15,0).followupDue,true);
 assert.equal(plan(d,15,1).followupDue,false);assert.equal(plan(d,15,5).followupDue,true);
 assert.equal(plan(d,15,59).followupDue,false);assert.equal(plan(d,16,0).followupDue,true);
 assert.equal(plan(d,16,1).followupDue,false);
 assert.equal(plan(d,9,30).expectedDiscoveryMinutes,330);
});
await test('EDT same boundaries, including close-day rollover independent of Dubai',()=>{
 const d='2026-07-02';assert.equal(plan(d,9,30).discovery,true);
 assert.equal(plan(d,14,59).discovery,true);assert.equal(plan(d,15,0).followupDue,true);
 assert.equal(plan(d,16,0).followupDue,true);
});
await test('NYSE early close shortens discovery 09:30..11:59, follows 12:00..13:00',()=>{
 const d='2026-11-27';assert.equal(plan(d,9,30).discovery,true);
 assert.equal(plan(d,11,59).discovery,true);
 assert.equal(plan(d,12,0).discovery,false);assert.equal(plan(d,12,0).followupDue,true);
 assert.equal(plan(d,12,1).followupDue,false);assert.equal(plan(d,13,0).followupDue,true);
 assert.equal(plan(d,13,1).followupDue,false);
 assert.equal(plan(d,12,0).expectedDiscoveryMinutes,150);
 assert.equal(researchExpectedMinutes37({},d),150);
});
await test('holiday/weekend cannot scan nor make follow-up',()=>{
 for(const d of ['2026-11-26','2026-11-07']){
  assert.equal(plan(d,10,0).discovery,false);assert.equal(plan(d,15,0).followupDue,false);
 }
});
await test('Research Agent expected evidence 330, early close 150 without external setting',()=>{
 assert.equal(researchExpectedMinutes37({}),330);
 assert.equal(researchExpectedMinutes37({},'2026-11-05'),330);
 assert.equal(researchExpectedMinutes37({},'2026-11-27'),150);
 assert.equal(researchExpectedMinutes37({DT37_RESEARCH_EXPECTED_MINUTES:'390'},'2026-11-05'),390);
});
await test('AI follow-up updates only existing OPEN paper positions; no new trade or pending',()=>{
 const day='2026-11-05',t=ny(day,15,5);
 const p={id:'AI:1',symbol:'AAA',status:'OPEN',openedBarTime:`${day} 14:05:00`,lastEvaluatedBarTime:`${day} 14:05:00`,
  openedAt:ny(day,14,6).toISOString(),entry:100,stop:99,target:101,qty:1,feesUsd:2,
  shadow:{},shadowHits:{},mfePct:0,maePct:0};
 const state={records:{AAA:{symbol:'AAA',state:'AI_PAPER_CONFIRMED',pending:{type:'OLD'},position:p},
   BBB:{symbol:'BBB',state:'SMART',pending:{type:'WILL_NOT_EVALUATE'},position:null}},cycles:330,closedOutcomes:[]};
 const bar={datetime:`${day} 15:04:00`,open:100.5,high:101.1,low:100.3,close:101,volume:10000};
 const follow=followAiOpenPositions37({state,barMap:{AAA:[bar]},now:t,minute:905,closeMinute:960});
 assert.deepEqual(aiOpenSymbols37(state),['AAA']);
 assert.equal(follow.closedNew.length,1);assert.equal(follow.state.records.AAA.position.status,'CLOSED');
 assert.equal(follow.state.records.AAA.pending,null);assert.deepEqual(follow.state.records.BBB,state.records.BBB);
 assert.equal(follow.state.closedOutcomes.length,1);assert.equal(follow.state.lastMinuteProcessed,905);
 assert.equal(follow.state.records.AAA.position.outcome,'TARGET');
});
await test('AI end-of-session missing candles cannot fabricate profit',()=>{
 const day='2026-11-05',state={records:{AAA:{symbol:'AAA',position:{id:'1',status:'OPEN',entry:100,target:102,
 stop:99,qty:1,feesUsd:2,openedBarTime:`${day} 14:00:00`,lastEvaluatedBarTime:`${day} 14:00:00`,shadow:{}}}}};
 const r=followAiOpenPositions37({state,barMap:{AAA:[]},now:ny(day,16,0),minute:960,closeMinute:960});
 assert.equal(r.closedNew.length,1);assert.equal(r.closedNew[0].outcome,'UNPRICED_AT_CLOSE');
 assert.equal(r.closedNew[0].netUsd,null);
});
await test('3.7.2 retires scalp schedule and preserves both main scanners',()=>{
 const toml=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.doesNotMatch(toml,/\[functions\."scalp-paper-scan37"\]/);
 const ai=readFileSync(new URL('../netlify/functions/ai-parallel-scan.mjs',import.meta.url),'utf8');
 assert.match(ai,/followAiOpenPositions37/);
 const main=readFileSync(new URL('../netlify/functions/daily-recommendation.mjs',import.meta.url),'utf8');
 assert.match(main,/sessionPlan37\(clock\)\.discovery/);
 assert.match(toml,/\[functions\."ai-parallel-scan"\]/);
 assert.match(toml,/\[functions\."daily-recommendation"\]/);
});
console.log(`DT37_UNIFIED_SESSION_TESTS_PASS ${successes}/${successes}`);
