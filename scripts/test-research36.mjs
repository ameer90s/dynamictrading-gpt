import assert from 'node:assert/strict';
import {evaluateResearch36,shadowSix,completedSessionRows,RESEARCH36_POLICY} from '../netlify/functions/lib/research36.mjs';
import {computeAiAdvisor36} from '../netlify/functions/lib/ai-advisor36.mjs';
const day='2026-10-29', stamp=m=>`${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
function bar(m,close,open=close-.12,high=close+.2,low=close-.2,vol=2000){return{datetime:stamp(m),open,high,low,close,volume:vol};}
const stock=[],spy=[];
for(let m=570;m<=631;m++){
 let close=m<=584?100+(m-570)*.08:101.26+Math.sin((m-584)/3)*.035;
 let b=bar(m,close,close-.07,close+.17,close-.16,m<=579?1800:m<=584?2300:2000);
 if(m===600){b.high=103.00;}
 if(m===630){b=bar(m,101.27,101.22,101.48,101.10,1800);}
 if(m===631){b=bar(m,101.48,101.29,101.58,101.26,2500);}
 stock.push(b);spy.push(bar(m,500+.006*(m-570),500+.006*(m-570)-.015,500+.006*(m-570)+.02,500+.006*(m-570)-.02,4000));
}
const now=new Date('2026-10-29T14:33:04Z');
const q={bid:101.60,ask:101.61,bidSize:100,askSize:130,timestamp:'2026-10-29T14:33:00Z',source:'Alpaca IEX latest quote'};
const c=evaluateResearch36('AAA',stock,spy,q,{now,allowHistorical:true});

assert.equal(c.features.openingReady,true,'opening bars complete');
assert.ok(c.openingChecks.every(x=>x.passed),'opening qualified');
assert.equal(c.state,'CONFIRMED','fresh ask + completed retest should confirm');
assert.ok(c.risk?.netRewardR>=1);
assert.equal(Object.keys(c.risk.shadow).length,6);
const noQuote=evaluateResearch36('AAA',stock,spy,null,{now,allowHistorical:true});
assert.equal(noQuote.state,'SMART');assert.ok(noQuote.executionChecks.some(x=>!x.passed));
const stale=evaluateResearch36('AAA',stock,spy,{...q,timestamp:'2026-10-29T14:31:00Z'},{now,allowHistorical:true});
assert.equal(stale.state,'SMART');assert.equal(stale.reason,'STALE_QUOTE');
const spread=evaluateResearch36('AAA',stock,spy,{...q,bid:101.30},{now,allowHistorical:true});
assert.equal(spread.state,'SMART');assert.equal(spread.reason,'SPREAD_TOO_WIDE');
const none=evaluateResearch36('AAA',stock,spy,q,{now,allowHistorical:true,shariaApproved:false});
assert.notEqual(none.state,'CONFIRMED');
const old=evaluateResearch36('AAA',stock.slice(0,-1),spy.slice(0,-1),q,{now,allowHistorical:true});
assert.notEqual(old.state,'CONFIRMED');
// Any later *uncompleted* bar (from any ticker/day) must not influence current signal.
const future={...bar(633,150,140,160,130),datetime:stamp(633)};
const still=evaluateResearch36('AAA',[...stock,future],[...spy,bar(633,510)],q,{now,allowHistorical:false});
assert.deepEqual(still.features,c.features,'no future bar leakage into decision features');
const badQuote=evaluateResearch36('AAA',stock,spy,{...q,source:'synthetic proxy quote'},{now,allowHistorical:true});
assert.equal(badQuote.state,'SMART');
// Bid/Ask fail-closed regression: fabricated provenance, crossed book, sizes, time order.
for (const [name,override,reason] of [
 ['spoofed source',{source:'simulated not Alpaca'},'NO_AUTHENTIC_ALPACA_QUOTE'],
 ['crossed book',{bid:101.70,ask:101.61},'INVALID_BID_ASK'],
 ['missing depth',{bidSize:0},'INVALID_BID_ASK'],
 ['future quote',{timestamp:'2026-10-29T14:33:06Z'},'FUTURE_QUOTE'],
 ['quote before signal close',{timestamp:'2026-10-29T14:31:59Z'},'STALE_QUOTE'],
]) {
 const result=evaluateResearch36('AAA',stock,spy,{...q,...override},{now,allowHistorical:true});
 assert.notEqual(result.state,'CONFIRMED',`${name} must never confirm`);
 assert.ok(result.executionChecks.some(x=>!x.passed&&x.reason===reason),`${name}: expected ${reason}`);
}
const ai=computeAiAdvisor36([{signals:{AAA:{transitions:[{version:'3.6',state:'SMART'}],confirmedSignals:[]}}}]);
assert.equal(ai.calibration.status,'UNCALIBRATED');assert.equal(ai.automaticStrategyChange,false);
assert.ok(shadowSix(101,100,0.4,103,stock).atr_4>101);
console.log('RESEARCH36_PASS 12/12');
