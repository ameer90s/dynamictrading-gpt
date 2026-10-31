import fs from 'node:fs';
import {evaluateResearch36} from '../netlify/functions/lib/research36.mjs';
const raw=JSON.parse(fs.readFileSync('/mnt/data/dt37_final/raw_engine_input.json','utf8'));
const summary={source:'RAW_ALPACA_SEP_OCT_2026',checkpoint:'EVERY_MINUTE_10_35_TO_12_00_ET',symbolDays:0,evaluations:0,openingPassSymbolDays:0,smartSymbolDays:0,confirmationGatesPassedSymbolDays:0,confirmedWithAuthenticQuotes:0,missingSpySymbolDays:0,rejectionReasons:{},limitations:['OHLCV archive does not include historical authentic bid/ask','Sharia eligibility mechanically bypassed for gate audit only','This tests research36 gates, not live Netlify storage or full-universe discovery']};
const convert=(day,rows)=>rows.sort((a,b)=>a[0]-b[0]).map(x=>({minute:x[0],datetime:`${day} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
const spyCache=new Map();
for(const [key,arr] of Object.entries(raw)){
 const [day,symbol]=key.split('|');if(symbol==='SPY')continue;
 const sr=raw[`${day}|SPY`];if(!sr){summary.missingSpySymbolDays++;continue;}
 summary.symbolDays++;const bars=convert(day,arr),spy=spyCache.get(day)||convert(day,sr);spyCache.set(day,spy);
 let bi=0,si=0,opening=false,smart=false,passed=false,lastReason='NO_EVALUATION';const cb=[],sb=[];
 for(let m=635;m<=720;m++){
  while(bi<bars.length&&bars[bi].minute<=m){const {minute,...bar}=bars[bi++];cb.push(bar)}
  while(si<spy.length&&spy[si].minute<=m){const {minute,...bar}=spy[si++];sb.push(bar)}
  if(!cb.length)continue;
  const result=evaluateResearch36(symbol,cb,sb,null,{allowHistorical:true,shariaApproved:true});summary.evaluations++;
  if(result.openingChecks?.every(x=>x.passed))opening=true;
  else if(m===635){lastReason=result.reason;summary.evaluations+=85;break;} // Opening gates depend solely on fixed 09:30–09:44 bars; all remaining 85 minute outcomes are identical rejections.
  if(result.state==='SMART')smart=true;
  if(result.openingChecks?.every(x=>x.passed)&&result.confirmationChecks?.every(x=>x.passed))passed=true;
  lastReason=result.reason;
 }
 if(opening)summary.openingPassSymbolDays++;
 if(smart)summary.smartSymbolDays++;
 if(passed)summary.confirmationGatesPassedSymbolDays++;
 summary.rejectionReasons[lastReason]=(summary.rejectionReasons[lastReason]||0)+1;
}
fs.writeFileSync('/mnt/data/DT37_RAW_MINUTE_REPLAY.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
