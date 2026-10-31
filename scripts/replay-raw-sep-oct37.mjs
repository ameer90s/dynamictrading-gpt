import fs from 'node:fs';
import {evaluateResearch36} from '../netlify/functions/lib/research36.mjs';
const raw=JSON.parse(fs.readFileSync('/mnt/data/dt37_final/raw_engine_input.json','utf8'));
const summary={source:'RAW_ALPACA_SEP_OCT_2026',symbolDays:0,evaluations:0,openingPassSymbolDays:0,smartSymbolDays:0,confirmationGatesPassedSymbolDays:0,confirmedWithAuthenticQuotes:0,missingSpySymbolDays:0,rejectionReasons:{},notes:['Historical dataset contains OHLCV, not authentic bid/ask quotes','Sharia approval set true ONLY for mechanical gate audit; NOT proof of Sharia eligibility','5-minute checkpoints from 10:35 to 12:00 ET; not complete 1-minute replay']};
const convert=(day,rows)=>rows.sort((a,b)=>a[0]-b[0]).map(x=>({datetime:`${day} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
for(const [key,arr] of Object.entries(raw)){
 const [day,symbol]=key.split('|');if(symbol==='SPY')continue;
 const sr=raw[`${day}|SPY`];if(!sr){summary.missingSpySymbolDays++;continue;}
 summary.symbolDays++;const bars=convert(day,arr),spy=convert(day,sr);let opening=false,smart=false,passed=false;let lastReason='NO_EVALUATION';
 for(let m=635;m<=720;m+=5){const cb=bars.filter(b=>Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))<=m),sb=spy.filter(b=>Number(b.datetime.slice(11,13))*60+Number(b.datetime.slice(14,16))<=m);if(!cb.length)continue;
 const result=evaluateResearch36(symbol,cb,sb,null,{allowHistorical:true,shariaApproved:true});summary.evaluations++;
 if(result.openingChecks?.every(x=>x.passed))opening=true;
 if(result.state==='SMART')smart=true;
 if(result.openingChecks?.every(x=>x.passed)&&result.confirmationChecks?.every(x=>x.passed))passed=true;
 lastReason=result.reason;
 }
 if(opening)summary.openingPassSymbolDays++;
 if(smart)summary.smartSymbolDays++;
 if(passed)summary.confirmationGatesPassedSymbolDays++;
 summary.rejectionReasons[lastReason]=(summary.rejectionReasons[lastReason]||0)+1;
}
fs.writeFileSync('/mnt/data/DT37_RAW_ENGINE_REPLAY.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
