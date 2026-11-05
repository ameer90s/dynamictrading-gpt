/** Pure candle indicators, averages and market measurements. No network calls or trading orders. */
import { clamp } from './trading-scoring37.mjs';

export function avgPriorVolume(rows, index, lookback = 10) {
  const start = Math.max(0, index - lookback);
  const vols = rows.slice(start, index).map((x) => finite(x.c.volume)).filter((v) => v > 0);
  if (!vols.length) return 0;
  return vols.reduce((a,b)=>a+b,0) / vols.length;
}

export function emptySession(price) {
  const setup = { state:"WAIT_BREAKOUT", breakoutIndex:-1, retestIndex:-1, confirmationIndex:-1, breakoutVolumeRatio:0, retestVolumeRatio:0, confirmationVolumeRatio:0, breakoutBodyRatio:0, confirmationBodyRatio:0, retestLow:null, retestHigh:null, retestDepthAtr:null, retestHoldStrength:0, chaseDistanceAtr:null };
  return { ready:false, openingHigh:price, openingLow:price, vwap:price, vwapSlope:0, aboveVwap:false, longBreakout:false, shortBreakout:false, longSetup:{...setup}, shortSetup:{...setup}, relativeVolume:1, sessionChangePct:0, avgMinuteDollarVolume:0 };
}

export function multiTimeframeAlignment(candles) {
  const one = directionalTrendScore(candles);
  const five = directionalTrendScore(aggregateCandles(candles, 5));
  const fifteen = directionalTrendScore(aggregateCandles(candles, 15));
  return {
    long: clamp(one.long * .30 + five.long * .40 + fifteen.long * .30),
    short: clamp(one.short * .30 + five.short * .40 + fifteen.short * .30),
    oneMinLong:one.long, oneMinShort:one.short,
    fiveMinLong:five.long, fiveMinShort:five.short,
    fifteenMinLong:fifteen.long, fifteenMinShort:fifteen.short,
  };
}

export function directionalTrendScore(candles) {
  if (!candles || candles.length < 25) return { long:50, short:50 };
  const closes = candles.map(c => c.close);
  const p = closes.at(-1), e9 = ema(closes,9).at(-1), e20 = ema(closes,20).at(-1), e50 = ema(closes,Math.min(50,Math.max(20,closes.length-2))).at(-1);
  let long = p > e9 && e9 > e20 && e20 > e50 ? 100 : p > e20 && e20 >= e50 ? 82 : p > e20 ? 64 : p < e9 && e9 < e20 ? 18 : 42;
  return { long, short:100-long };
}

export function aggregateCandles(candles, minutes) {
  const buckets = new Map();
  for (const c of candles) {
    const p = dateParts(c.datetime); if (!p) continue;
    const bucketMinute = Math.floor(p.minuteOfDay / minutes) * minutes;
    const key = `${p.date}-${bucketMinute}`;
    const prev = buckets.get(key);
    if (!prev) buckets.set(key,{ datetime:c.datetime, open:c.open, high:c.high, low:c.low, close:c.close, volume:finite(c.volume) });
    else { prev.high=Math.max(prev.high,c.high); prev.low=Math.min(prev.low,c.low); prev.close=c.close; prev.volume+=finite(c.volume); }
  }
  return [...buckets.values()];
}

export function candleBodyRatio(c) {
  const range = Math.max(1e-9, finite(c.high) - finite(c.low));
  return Math.min(1, Math.abs(finite(c.close) - finite(c.open)) / range);
}

export function trendScore(candles) {
  if (!candles || candles.length < 200) return 50;
  const closes = candles.map((x) => x.close);
  const e9 = ema(closes, 9).at(-1), e20 = ema(closes, 20).at(-1), e50 = ema(closes, 50).at(-1), e200 = ema(closes, 200).at(-1), price = closes.at(-1);
  if (price > e9 && e9 > e20 && e20 > e50 && price > e200) return 100;
  if (price > e20 && e20 > e50 && price > e200) return 82;
  if (price > e20) return 65;
  if (price < e9 && e9 < e20 && e20 < e50) return 0;
  if (price < e20 && e20 < e50) return 18;
  return 45;
}

export function supportResistance(candles) {
  const recent = candles.slice(-120), price = recent.at(-1).close;
  const lows = recent.map((x) => x.low).filter((x) => x < price).sort((a,b) => b-a);
  const highs = recent.map((x) => x.high).filter((x) => x > price).sort((a,b) => a-b);
  return [lows[2] ?? Math.min(...recent.map((x)=>x.low)), highs[2] ?? Math.max(...recent.map((x)=>x.high))];
}

export function fallbackVolumeRatio(candles) {
  const recent = candles.slice(-21), current = finite(recent.at(-1)?.volume), previous = recent.slice(0,-1);
  const avg = Math.max(1, previous.reduce((a,b)=>a+finite(b.volume),0)/Math.max(1,previous.length));
  return current/avg;
}

export function cumulativeVwap(candles) {
  let pv = 0, vol = 0;
  return candles.map((c) => {
    const v = finite(c.volume), typical = (c.high + c.low + c.close) / 3;
    if (v > 0) { pv += typical * v; vol += v; }
    return vol > 0 ? pv / vol : c.close;
  });
}

export function dateParts(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[2]), minute = Number(m[3]);
  return { date:m[1], hour, minute, minuteOfDay:hour*60+minute };
}

export function ema(values, period) {
  if (!values.length) return [];
  const k = 2/(period+1), out=[]; let prev=values[0];
  for (const v of values) { prev=v*k+prev*(1-k); out.push(prev); }
  return out;
}

export function rsi(values, period) {
  if (values.length <= period) return 50;
  const slice = values.slice(-(period+1)); let gains=0, losses=0;
  for (let i=1;i<slice.length;i++){ const d=slice[i]-slice[i-1]; if(d>=0) gains+=d; else losses-=d; }
  if (losses===0) return 100; const rs=(gains/period)/(losses/period); return 100-100/(1+rs);
}

export function macdHistogram(values) {
  const e12=ema(values,12), e26=ema(values,26), macd=values.map((_,i)=>e12[i]-e26[i]), signal=ema(macd,9);
  return macd.at(-1)-signal.at(-1);
}

export function atr(candles, period) {
  const trs=[];
  for(let i=1;i<candles.length;i++){ const c=candles[i], p=candles[i-1]; trs.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close))); }
  const recent=trs.slice(-period); return recent.reduce((a,b)=>a+b,0)/Math.max(1,recent.length);
}

export function median(values){const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}

export function finite(v){ const n=Number(v); return Number.isFinite(n)?n:0; }

export function fmt(v){ return Number(v||0).toFixed(2); }
