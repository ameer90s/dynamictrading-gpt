import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base=process.cwd();
const {updateAiExitShadow37}=await import(`file://${base}/netlify/functions/lib/ai-paper-exit-shadow37.mjs`);
const {validateExecutionQuote37}=await import(`file://${base}/netlify/functions/lib/execution-quote37.mjs`);
let counts={pass:0,fail:0};const log=(name,pass,details)=>{counts[pass?'pass':'fail']++;console.log(`${pass?'PASS':'FINDING'} ${name}: ${JSON.stringify(details)}`)};
// Probe 1: the code accepts unsigned PATCH requests and allows concurrent duplicate settlements.
function loadHandler(p,injected){let source=readFileSync(p,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export default async \(req\) =>/,'const handler = async (req) =>').replace(/^export /gm,'');return new Function(...Object.keys(injected),source+'\nreturn handler;')(...Object.values(injected))}
const day='2026-11-03';let writes=[];const state=new Map([
  [`selection-${day}`,{symbol:'ABC',side:'LONG',selectedAt:new Date().toISOString(),exitPlan:{t1R:1},version:'3.7'}],
  [`daily-risk-${day}`,{slCount:0,trades:1}],
]);const store={get:async k=>state.has(k)?structuredClone(state.get(k)):null,setJSON:async(k,v,o={})=>{writes.push({key:k,value:structuredClone(v)});if(o.onlyIfNew&&state.has(k))return{modified:false};state.set(k,structuredClone(v));return{modified:true}},delete:async k=>{state.delete(k)}};
const handler=loadHandler(base+'/netlify/functions/selection.mjs',{
  getStore:()=>store,recommendationWindow:()=>({dateKey:day,isTradingDay:true,startMinute:570,minuteOfDay:800}),
  nextTradingDateKey:()=>day,previousTradingDateKey:()=>day,STRATEGY_VERSION:'3.7',
  validateExecutionQuote37,randomUUID,Response,URL,
  alpacaConfigured:()=>true,fetchLatestQuotes:async()=>({})
});
const patch=()=>({method:'PATCH',json:async()=>({result:'SL'})});
const results=await Promise.all([handler(patch()),handler(patch())]);
log('PATCH concurrent duplicate accepted',results.filter(x=>x.status===200).length!==2,
  {statuses:results.map(x=>x.status),closedWrites:writes.filter(x=>x.key.includes('-closed-')).length,slCount:state.get(`daily-risk-${day}`).slCount});
// Probe 2: paper EOD replay with a completed bar that has already been processed.
const bar={datetime:'2026-11-03T14:32:00Z',open:100,high:100.5,low:99.8,close:100.25};
const pos={entry:100,stop:98,target:105,qty:1,feesUsd:0,openedBarTime:'2026-11-03T14:31:00Z',status:'OPEN'};
const once=updateAiExitShadow37({position:pos},[bar]);
const twice=updateAiExitShadow37(once,[bar],{forceClose:true});
const eod=twice.position.adaptiveExitShadow37;
log('EOD closes using latest already-processed close',eod.status==='CLOSED',
  {status:eod.status,netUsd:eod.netUsd,lastCompletedAt:eod.lastCompletedAt,barClose:bar.close});
// Probe 3: no-code auth gate (fact: route has no authentication check).
const selectionText=readFileSync(base+'/netlify/functions/selection.mjs','utf8');
log('Selection mutation request has upstream authorization gate in source',
 /authorize|verifyToken|authorization|authSession|sessionUser|jwtVerify|checkPermission/.test(selectionText),
 {hasAuthCheck:/authorize|verifyToken|authorization|authSession|sessionUser|jwtVerify|checkPermission/.test(selectionText),status:'RUNTIME_EDGE_AUTH_NOT_VERIFIED'});
// Probe 4: missing quote validation never invents executable entry.
const q=validateExecutionQuote37(null,{price:100,entryHigh:101});
log('Missing quote blocked independent validation',!q.ok,{reason:q.reason});
console.log('INDEPENDENT_PROBES',JSON.stringify(counts));
