import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {replayFrozenAlpaca40,FROZEN_RESEARCH_POLICY} from '../netlify/functions/lib/research-parity36.mjs';
const path=new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url);
const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(path)).toString());
const expected=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/reference_summary.json',import.meta.url)));
const result=replayFrozenAlpaca40(data);
const csv=fs.readFileSync(new URL('../tests/fixtures/reference_9_trades.csv',import.meta.url),'utf8').trim().split(/\r?\n/);
const keys=csv.shift().split(',');const references=csv.map(x=>Object.fromEntries(x.split(',').map((v,i)=>[keys[i],v])));
const deviations=[];
if(result.trades.length!==references.length)deviations.push({field:'trade_count',reference:references.length,observed:result.trades.length});
for(let i=0;i<Math.max(result.trades.length,references.length);i++){
 const found=result.trades[i],exp=references[i];if(!found||!exp)continue;
 for(const f of ['date','symbol','retest_model','validation_minute','entry_minute','exit_minute','reason'])if(String(found[f])!==String(exp[f]))deviations.push({trade:i+1,field:f,reference:exp[f],observed:found[f]});
 for(const f of ['entry','stop','target','exit','qty','net_pnl_usd','equity_usd'])if(Math.abs(Number(found[f])-Number(exp[f]))>1e-6)deviations.push({trade:i+1,field:f,reference:exp[f],observed:found[f]});
}
for(const f of ['trades','wins','ending_equity','net_pct','maxdd_pct'])if(Math.abs(Number(result.summary[f])-Number(expected[f]))>1e-5)deviations.push({field:f,reference:expected[f],observed:result.summary[f]});
const stress=[{spreadBps:5,trades:9,net_pct:1.60374},{spreadBps:10,trades:10,net_pct:.92408},{spreadBps:15,trades:10,net_pct:-.28739}].map(c=>{
 const o=replayFrozenAlpaca40(data,{...FROZEN_RESEARCH_POLICY,spreadBps:c.spreadBps});
 const passed=o.summary.trades===c.trades&&Math.abs(o.summary.net_pct-c.net_pct)<1e-5;
 if(!passed)deviations.push({field:`SPREAD_${c.spreadBps}_STRESS`,expected:c,observed:o.summary});
 return {spreadBps:c.spreadBps,reference:c,observed:o.summary,passed};
});
const report={stress,comparison:'FROZEN_PYTHON_VS_INDEPENDENT_JS_OHLC_REPLAY',simulatedQuotes:true,historicalL1QuotesAvailable:false,scope:'PRESELECTED_RETEST_EVENTS_40_SESSIONS_NOT_COMPLETE_LIVE_DISCOVERY',...result,reference:expected,deviations,passed:deviations.length===0&&result.audit.rejectedAsOf===0};
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,summary:result.summary,audit:result.audit,deviations:deviations.slice(0,6)},null,2));
if(!report.passed)process.exitCode=1;
