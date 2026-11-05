/** Deterministic SYNTHETIC 390-minute integration exercise only.
 * NEVER claim historical market profitability: quotes and bars are artificial.
 * Does not call Alpaca, OpenAI, Netlify, or the broker.
 */
import assert from 'node:assert/strict';
import {independentCycle} from '../netlify/functions/lib/ai-parallel-runner36.mjs';
const day='2026-10-30',syms=['ABC','DEF','GHI'];
const b=(m,index,spy=false)=>{
 const drift=spy?.02:.09,base=(spy?500:100+index*12)+(m-570)*drift;
 const close=base+(spy?.035:.18),high=close+(spy?.015:.09),low=base-(spy?.018:.12);
 return {datetime:`${day} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`,
  open:base,high,low,close,volume:m%4===2?6500:1800};
};
const feed={SPY:Array.from({length:390},(_,i)=>b(570+i,0,true)),
 ...Object.fromEntries(syms.map((s,i)=>[s,Array.from({length:390},(_,j)=>b(570+j,i,false))]))};
const env=process.env.DT37_AI_SCALP_PAPER_ENABLED;process.env.DT37_AI_SCALP_PAPER_ENABLED='true';
let existing={},entries=0,closed=0,openAtEnd=0,unknownAtEnd=0,cycles=0;
try{
 for(let m=590;m<=959;m++){
  const now=new Date(Date.UTC(2026,9,30,Math.floor(m/60)+4,m%60,4));
  const quotes=Object.fromEntries(syms.map((s,i)=>{
   const last=b(m-1,i,false),ask=last.close+.15;
   return [s,{source:'Alpaca IEX latest quote',bid:ask-.05,ask,bidSize:200,askSize:200,
    timestamp:new Date(now.getTime()-1000).toISOString()}];
  }));
  // Bounded test transport: opening bars plus recent 35; every minute is exercised,
  // but this is NOT a full-history VWAP or actual-market backtest.
  const narrow=Object.fromEntries(Object.entries(feed).map(([sym,rows])=>[sym,[...rows.slice(0,15),...rows.slice(Math.max(15,m-570-35),m-570)]]));
  const result=independentCycle({dateKey:day,now,minute:m,batch:syms,universe:syms,barMap:narrow,quotes,
   existing,history:[],approved:syms,sessionEndMinute:959});
  existing=result.state;cycles++;entries+=result.audit.scalp37.events.filter(x=>x.reason==='SCALP_PAPER_ENTRY').length;
  closed+=result.audit.scalp37.closedNew.length;
  assert.equal(result.audit.scalp37.summary.noOrders,true);
  assert.equal(result.audit.scalp37.events.length,3);
 }
 assert.equal(cycles,370);
 assert.equal(existing.scalp37.tradeCount,entries);
 assert.equal(existing.scalp37.closedOutcomes.length,closed);
 openAtEnd=Object.values(existing.scalp37.records).filter(x=>x?.position?.status==='OPEN').length;
 unknownAtEnd=existing.scalp37.closedOutcomes.filter(x=>x.status==='UNPRICED_AT_CLOSE').length;
 assert.equal(openAtEnd,0,'session end must not retain an active simulated trade');
 assert(entries<=8,'daily trade cap');
 console.log(JSON.stringify({kind:'SYNTHETIC_BARS_AND_QUOTES_NOT_ALPACA_REPLAY',cycles,attemptedSymbols:3,
  scalpPaperEntries:entries,scalpPaperClosed:closed,unpriced:unknownAtEnd,
  noBrokerOrders:true,profitabilityNotVerified:true,realMarketQuotesNotUsed:true},null,2));
 console.log('DT37_SCALP_SYNTHETIC_390MIN_PASS');
}finally{
 if(env===undefined)delete process.env.DT37_AI_SCALP_PAPER_ENABLED;
 else process.env.DT37_AI_SCALP_PAPER_ENABLED=env;
}
