import assert from 'node:assert/strict';
import {detectResearchPatterns37,RESEARCH_ONLY_PATTERN_IDS37} from '../netlify/functions/lib/ai-pattern-catalog37.mjs';
const date='2026-10-30',tm=m=>`${date} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:00`;
const make=(m,c)=>({datetime:tm(m),_time:{min:m,day:date},open:c-.02,high:c+.03,low:c-.04,close:c,volume:1000});
const base=Array.from({length:30},(_,i)=>make(i+570,10+i*.002));
const baseF={barTime:tm(599),minute:599,atr:.18,atrPct:1.7,benchmarkLagMinutes:0,volumeRatio:2.8,
 closePosition:.95,momentum5Pct:.7,momentum3Pct:.8,sessionRelativeStrengthPct:1.1,
 ema9:10.24,ema21:10.12,vwap:10.14,rsi14:62};
const modifiers={
 OPENING_RANGE_BREAKOUT:()=>{},CONSOLIDATION_BREAKOUT:()=>{},MOMENTUM_CONTINUATION:()=>{},
 VWAP_BOUNCE:(r,f)=>{f.vwap=10.05;r.at(-1).low=10.06;},
 EMA_RECLAIM:()=>{},TREND_CONTINUATION:()=>{},PULLBACK_CONTINUATION:()=>{},
 FAILED_BREAKDOWN:(r)=>{r.at(-1).low=9.8;},
 LIQUIDITY_SWEEP_OHLCV_PROXY:(r)=>{r.at(-1).low=9.8;},
 RANGE_RECOVERY:(r)=>{r.at(-2).close=9.90;r.at(-2).low=9.78;},
 RELATIVE_STRENGTH_LEADER:()=>{},
 BREAKOUT_RETEST:(r)=>{r.at(-2).close=10.4;r.at(-2).high=10.43;r.at(-2).low=10.08;},
 VOLATILITY_SQUEEZE_BREAKOUT:()=>{},
 AFTERNOON_BREAKOUT:(r,f)=>{f.minute=750;f.barTime=tm(750);r.at(-1)._time.min=750;r.at(-1).datetime=tm(750);},
 MEAN_REVERSION_RECOVERY:(r,f)=>{f.rsi14=30;r.at(-2).open=10.08;r.at(-2).close=10.04;},
 SUPPORT_RECLAIM:(r)=>{r.at(-2).low=9.8;r.at(-2).close=9.95;r.at(-2).high=10.1;},
};
let success=0;
for(const [type,modify] of Object.entries(modifiers)){
 const rows=base.map(x=>({...x,_time:{...x._time}}));rows.at(-1).open=10.12;rows.at(-1).close=10.65;rows.at(-1).high=10.68;rows.at(-1).low=10.1;rows.at(-1).volume=4500;
 const f={...baseF};modify(rows,f);
 const x=detectResearchPatterns37({symbol:'A',rows,features:f,policy:{regime:'UP',params:{}},approved:true,verifiedSource:true});
 assert(x.detected.some(z=>z.type===type),`${type} failed to detect, observed=${JSON.stringify(x.assessments.find(a=>a.type===type))}`);
 success++;console.log('PASS DETECTOR '+type);
}
assert.equal(success,16);assert.equal(RESEARCH_ONLY_PATTERN_IDS37.length-success,4);
console.log('DT37_PATTERN_COVERAGE_PASS',success);
