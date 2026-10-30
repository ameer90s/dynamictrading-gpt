import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {evaluateLiveResearch36} from '../netlify/functions/lib/research-live36.mjs';
const fixture=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const log=fs.readFileSync(new URL('../tests/fixtures/reference_9_trades.csv',import.meta.url),'utf8').trim().split(/\r?\n/);const fields=log.shift().split(',');
const reference=log.map(row=>Object.fromEntries(row.split(',').map((v,i)=>[fields[i],v])));
const bars=(a,day,m)=>a.filter(x=>x[0]<=m).map(x=>({datetime:`${day} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
const info=[];for(const r of reference){const day=r.date,sym=r.symbol,t=+r.validation_minute;
 const stock=bars(fixture.bars[`${day}|${sym}`],day,t),spy=bars(fixture.bars[`${day}|SPY`],day,t);
 const now=new Date(`${day}T15:00:00Z`); // quote omitted: only test candidate detector (historical clock minutes set via allowHistorical)
 const result=evaluateLiveResearch36(sym,stock,spy,null,{now,allowHistorical:true,shariaApproved:true});
 const matched=(result.pendingCandidate?.minute===t && result.pendingCandidate?.retestModel===r.retest_model);
 info.push({day,sym,validation:t,expected:r.retest_model,pending:result.pendingCandidate?.minute,model:result.pendingCandidate?.retestModel,state:result.state,reason:result.reason,matched,
  openingGates:result.openingChecks.filter(x=>!x.passed).map(x=>x.reason),discovery:result.recentDiscoveredSetups?.length});
}
assert.equal(info.length,9);
assert.ok(info.every(x=>x.matched),`Live candidate detector mismatched frozen reference: ${JSON.stringify(info.filter(x=>!x.matched))}`);
const ref=reference[0],day=ref.date,ts=+ref.validation_minute;
const stock=bars(fixture.bars[`${day}|${ref.symbol}`],day,ts),spy=bars(fixture.bars[`${day}|SPY`],day,ts);
const next=ts+1,now=new Date(`${day}T${String(Math.floor(next/60)+4).padStart(2,'0')}:${String(next%60).padStart(2,'0')}:04Z`);
const stamp=new Date(now.getTime()-4_000).toISOString(),ask=+ref.entry;
const quote={bid:ask*.9995,ask,bidSize:150,askSize:150,timestamp:stamp,source:'Alpaca IEX latest quote'};
const accepted=evaluateLiveResearch36(ref.symbol,stock,spy,quote,{now,allowHistorical:true,shariaApproved:true});
const missing=evaluateLiveResearch36(ref.symbol,stock,spy,null,{now,allowHistorical:true,shariaApproved:true});
const stale=evaluateLiveResearch36(ref.symbol,stock,spy,{...quote,timestamp:new Date(now.getTime()-120000).toISOString()},{now,allowHistorical:true,shariaApproved:true});
const invalidSource=evaluateLiveResearch36(ref.symbol,stock,spy,{...quote,source:'SIMULATED_BID_ASK'},{now,allowHistorical:true,shariaApproved:true});
const notApproved=evaluateLiveResearch36(ref.symbol,stock,spy,quote,{now,allowHistorical:true,shariaApproved:false});
assert.equal(accepted.state,'CONFIRMED',JSON.stringify({reason:accepted.reason,checks:accepted.checks.filter(x=>!x.passed)},null,2));
assert.equal(missing.state,'SMART');assert.equal(stale.state,'SMART');
assert.equal(invalidSource.state,'SMART');assert.equal(notApproved.state,'WAIT');
assert.equal(accepted.risk.shadow!=null,true);assert.equal(Object.keys(accepted.risk.shadow).length,6);
const future={datetime:`${day} ${String(Math.floor((ts+4)/60)).padStart(2,'0')}:${String((ts+4)%60).padStart(2,'0')}:00`,open:2000,high:3000,low:1000,close:2200,volume:999999};
const noLookahead=evaluateLiveResearch36(ref.symbol,[...stock,future],spy,quote,{now,allowHistorical:false,shariaApproved:true});
assert.equal(noLookahead.pendingCandidate?.minute,accepted.pendingCandidate?.minute,'future candle changed as-of setup');
assert.equal(noLookahead.state,accepted.state);
assert.ok(accepted.features.openingRankVerification==='NOT_FULLY_VERIFIED');
console.log('LIVE_RESEARCH36_PASS 9/9 as-of retest + 6 paper quote/safety checks');
