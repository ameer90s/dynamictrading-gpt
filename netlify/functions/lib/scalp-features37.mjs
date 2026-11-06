/** Scalp-specific, pure and independently versioned completed-bar features.
 * No Dynamic AI strategy state, adaptive thresholds or recommendations imported.
 */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const pct=(a,b)=>finite(a)&&finite(b)&&a>0&&b>0?100*(a/b-1):null;
const median=a=>{const s=a.filter(finite).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null};
const ema=(rows,n)=>rows.reduce((prior,x,i)=>i===0?x:prior+(2/(n+1))*(x-prior),0);
const num=(v,d=5)=>finite(v)?Number(v.toFixed(d)):null;
export function scalpFeatures37(rows,spyRows=[]){
 if(!Array.isArray(rows)||rows.length<2)return null;
 const bar=rows.at(-1),prev=rows.at(-2);
 const today=rows.filter(x=>x._time?.day===bar._time?.day);
 const openings=today.filter(x=>x._time?.min>=570&&x._time?.min<585);
 const spy=spyRows.filter(x=>x._time?.day===bar._time?.day&&x._time?.min<=bar._time?.min);
 const spyOpen=spy.find(x=>x._time?.min===570),spyLast=spy.at(-1);
 const currentMove=pct(bar.close,today[0]?.open),benchmarkMove=pct(spyLast?.close,spyOpen?.open);
 const trueRanges=today.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-today[i].close),Math.abs(x.low-today[i].close)));
 const atr=trueRanges.length>=5?avg(trueRanges.slice(-20)):null;
 let totalV=0,totalPV=0;for(const x of today){totalV+=x.volume;totalPV+=((x.high+x.low+x.close)/3)*x.volume}
 const close=today.map(x=>x.close),lastVol=today.slice(-12,-1).map(x=>x.volume);
 const moves=close.slice(-15).map((v,i,a)=>i?v-a[i-1]:0),gains=avg(moves.map(v=>Math.max(v,0))),losses=avg(moves.map(v=>Math.max(-v,0)));
 const green=bar.close>bar.open,closePosition=bar.high>bar.low?(bar.close-bar.low)/(bar.high-bar.low):.5;
 const retOpen=openings.length>=10?pct(openings.at(-1).close,openings[0].open):null;
 const spyOpening=spy.filter(x=>x._time?.min>=570&&x._time?.min<585);
 const benchmarkOpening=spyOpening.length>=10?pct(spyOpening.at(-1).close,spyOpening[0].open):null;
 return {minute:bar._time.min,day:bar._time.day,barTime:bar.datetime,price:bar.close,high:bar.high,low:bar.low,
  priorClose:prev.close,priorLow:prev.low,barCount:today.length,green,closePosition:num(closePosition),
  atr:num(atr),atrPct:num(atr!=null?atr/bar.close*100:null),vwap:num(totalV>0?totalPV/totalV:bar.close),
  ema9:num(ema(close.slice(-50),9)),ema21:num(ema(close.slice(-50),21)),
  momentum3Pct:num(today.length>=4?pct(bar.close,today.at(-4).close):null),
  momentum5Pct:num(today.length>=6?pct(bar.close,today.at(-6).close):null),
  volumeRatio:num(lastVol.length>=4?bar.volume/Math.max(1,median(lastVol)):null),
  openingDollarVolume:num(openings.reduce((s,x)=>s+x.volume*x.close,0),2),
  openingReturnPct:num(retOpen),relativeStrengthPct:num(retOpen!=null&&benchmarkOpening!=null?retOpen-benchmarkOpening:null),
  sessionRelativeStrengthPct:num(currentMove!=null&&benchmarkMove!=null?currentMove-benchmarkMove:null),
  benchmarkMovePct:num(benchmarkMove),benchmarkLagMinutes:spyLast?bar._time.min-spyLast._time.min:null,
  rsi14:num(losses===0?(gains>0?100:50):100-100/(1+gains/losses))};
}
export function scalpMarket37(features=[]){
 const rows=features.filter(x=>x&&finite(x.benchmarkMovePct)&&finite(x.atrPct));
 if(rows.length<3)return {regime:'UNKNOWN',confidence:0,reason:'INSUFFICIENT_CROSS_SECTION'};
 const move=median(rows.map(x=>x.benchmarkMovePct)),atr=median(rows.map(x=>x.atrPct));
 const breadth=rows.filter(x=>x.momentum5Pct>0).length/rows.length;
 const liquid=rows.filter(x=>x.openingDollarVolume>=200000).length/rows.length;
 const trend=move>.3&&breadth>.6?'TREND_UP':move<-.3&&breadth<.4?'TREND_DOWN':'RANGE';
 const vol=atr>=.75?'HIGH_VOL':atr<=.18?'LOW_VOL':'NORMAL_VOL';
 return {regime:`${trend}_${vol}_${liquid<.5?'THIN_LIQUIDITY':'LIQUID'}`,confidence:Math.min(1,rows.length/15),
  sample:rows.length,move,atr,breadth,liquid};
}
