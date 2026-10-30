import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {analyzeUniverse} from '../netlify/functions/lib/trading.mjs';
const fixture=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const rows=fs.readFileSync(new URL('../tests/fixtures/reference_9_trades.csv',import.meta.url),'utf8').trim().split(/\r?\n/),fields=rows.shift().split(',');
const ref=rows.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[fields[i],v])));
const asBars=(a,day,t)=>a.filter(r=>r[0]<=t).map(r=>({datetime:`${day} ${String(Math.floor(r[0]/60)).padStart(2,'0')}:${String(r[0]%60).padStart(2,'0')}:00`,open:r[1],high:r[2],low:r[3],close:r[4],volume:r[5]}));
let confirmations=0,smart=0;const outcomes=[];
for(const r of ref){const d=r.date,s=r.symbol,t=+r.validation_minute,next=t+1;
 const stock=asBars(fixture.bars[`${d}|${s}`],d,t),spy=asBars(fixture.bars[`${d}|SPY`],d,t);
 const now=new Date(`${d}T${String(Math.floor(next/60)+4).padStart(2,'0')}:${String(next%60).padStart(2,'0')}:04Z`);
 const ask=+r.entry;const quote={bid:ask*.9995,ask,bidSize:100,askSize:100,timestamp:new Date(now-4000).toISOString(),source:'Alpaca IEX latest quote'};
 const out=await analyzeUniverse([s],'',{}, {},'10:30–11:29','active',{}, {}, {},{
  replayBars:{[s]:stock,SPY:spy,QQQ:spy},replayQuotes:{[s]:quote},replayNow:now.toISOString()});
 const decision=out.all.find(x=>x.symbol===s);
 assert.ok(decision,`${d} ${s}: no decision`);
 const matches=decision.research36?.pendingCandidate?.minute===t&&decision.research36?.retestModel===r.retest_model;
 assert.ok(matches,`${d} ${s}: mismatch candidate / legacy filter still active`);
 assert.equal(decision.research36?.researchPolicy,'FROZEN_LATE_BREAKOUT_V36_WITH_LIVE_QUOTE_GATES');
 assert.equal(decision.confidenceProbability,null);
 if(decision.recommendationState==='CONFIRMED')confirmations++;
 if(decision.recommendationState==='SMART')smart++;
 outcomes.push({date:d,symbol:s,referenceRetest:r.retest_model,validationMinute:t,
  finalState:decision.recommendationState,reason:decision.stateReason,profitPotentialScore:decision.profitPotentialScore,
  netGainUsd:decision.research36.risk?.netGainUsd??null});
}
console.log(JSON.stringify({pass:true,referenceTrades:ref.length,asofEventsMatched:ref.length,confirmedUsingMOCKQuotes:confirmations,smartUsingMOCKQuotes:smart,
 note:'Mock quotes are used for TEST ONLY and never presented as historical Alpaca bid/ask',outcomes},null,2));
