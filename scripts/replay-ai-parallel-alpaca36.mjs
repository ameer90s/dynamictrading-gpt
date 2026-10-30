/** Historical as-of audit on archived Alpaca 1-minute events.
 * NO AUTHENTIC HISTORICAL QUOTES: does NOT claim AI fills or return.
 * This is coverage of saved candidate-symbol-days, NOT a full-universe AI backtest.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {evaluateIndependentAi} from '../netlify/functions/lib/ai-parallel36.mjs';
import {evaluateResearch36} from '../netlify/functions/lib/research36.mjs';
const archive=JSON.parse(gunzipSync(readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const rows=[],days=new Set(),summaries={REGULAR:0,SMART:0,AI_PAPER_CONFIRMED:0},daily={};
for(const [key,entries] of Object.entries(archive.bars)){
 const [date,symbol]=key.split('|');if(symbol==='SPY')continue;
 const sr=archive.bars[`${date}|SPY`];if(!sr?.length)continue;days.add(date);
 const bars=entries.map(x=>({datetime:`${date} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
 const spy=sr.map(x=>({datetime:`${date} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
 let prior=null,visited=0,smart=false,pending=0,firstSmart=null,last=null;
 for(let m=579;m<=750;m+=5){const [y,mo,d]=date.split('-').map(Number),now=new Date(Date.UTC(y,mo-1,d,Math.floor((m+1)/60)+4,(m+1)%60,5));
  const r=evaluateIndependentAi(symbol,bars.filter(x=>Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))<=m),spy.filter(x=>Number(x.datetime.slice(11,13))*60+Number(x.datetime.slice(14,16))<=m),null,{now,prior,approved:true,allowHistorical:true});if(!r.features)continue;
  visited++;if(r.state==='SMART'&&!smart){smart=true;firstSmart=m;}if(r.pending)pending++;
  assert.notEqual(r.state,'AI_PAPER_CONFIRMED','real-quote gate must reject historical OHLCV-only replay');
  assert.equal(r.confidence.profitProbability,null,'unadjusted profit probability');
  prior={state:r.state,reason:r.reason,pending:r.pending,position:r.position};last=r;
 }
 if(last){summaries[last.state]=(summaries[last.state]||0)+1;rows.push({date,symbol,visited,smart,pendingChecks:pending,firstSmartMinute:firstSmart,lastState:last.state,lastReason:last.reason,source:'ALPACA_1MIN_ARCHIVED_CANDIDATE_ONLY',quotePresent:false});daily[date]=(daily[date]||0)+1;}
}
const r={source:'ALPACA_1MIN_CANDIDATE_SYMBOL_DAYS',sessionsCovered:days.size,daySymbolPairs:rows.length,sourceBarsKeyCount:Object.keys(archive.bars).length,
  candidatesWithSmart:rows.filter(x=>x.smart).length,candidatesWithPending:rows.filter(x=>x.pendingChecks>0).length,
  confirmedWithAuthenticQuotes:0,confirmedEvaluation:'CANNOT_VALIDATE_LIVE_QUOTES_WITH_ARCHIVED_OHLCV',
  disclaimer:'NOT full-universe independent discovery; NO AI net return/backtest or actual historical execution claimed.',stateByLastScan:summaries,symbolDays:rows};
writeFileSync(new URL('../AI_PARALLEL_ASOF_ALPACA_CANDIDATES_REPORT.json',import.meta.url),JSON.stringify(r,null,2));
console.log(JSON.stringify({sessionsCovered:r.sessionsCovered,daySymbolPairs:r.daySymbolPairs,candidatesWithSmart:r.candidatesWithSmart,
 candidatesWithPending:r.candidatesWithPending,confirmedWithAuthenticQuotes:r.confirmedWithAuthenticQuotes,limitation:r.confirmedEvaluation},null,2));
