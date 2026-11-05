/** Session and setup detection extracted verbatim from trading.mjs. */
import { STRATEGY_MODES } from './trading-config37.mjs';
import { finite, median, dateParts, cumulativeVwap, emptySession, avgPriorVolume, candleBodyRatio, fallbackVolumeRatio } from './trading-technical37.mjs';
import { clamp } from './trading-scoring37.mjs';

export function sessionContext(candles, atrValue, cfg = STRATEGY_MODES.precision) {
  const parsed = candles.map((c) => ({ c, p: dateParts(c.datetime) })).filter((x) => x.p);
  const latest = parsed.at(-1);
  if (!latest) return emptySession(candles.at(-1)?.close || 0);
  const dateKey = latest.p.date;
  const byDate = new Map();
  for (const x of parsed) {
    if (!byDate.has(x.p.date)) byDate.set(x.p.date, []);
    byDate.get(x.p.date).push(x);
  }
  const todayRows = (byDate.get(dateKey) || []).filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay < 960);
  const currentMinute = latest.p.minuteOfDay;
  const openingRows = todayRows.filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay <= 584);
  const sessionRows = todayRows.filter((x) => x.p.minuteOfDay <= currentMinute);
  const opening = openingRows.map((x) => x.c);
  const session = sessionRows.map((x) => x.c);
  const openingHigh = opening.length ? Math.max(...opening.map((c) => c.high)) : latest.c.high;
  const openingLow = opening.length ? Math.min(...opening.map((c) => c.low)) : latest.c.low;
  const vwaps = cumulativeVwap(session);
  const vwap = vwaps.at(-1) ?? latest.c.close;
  const priorVwap = vwaps[Math.max(0, vwaps.length - 6)] ?? vwap;
  const vwapSlope = atrValue > 0 ? ((vwap - priorVwap) / atrValue) : 0;
  const price = latest.c.close;

  const currentVolume = session.reduce((s, c) => s + finite(c.volume), 0);
  const prevDates = [...byDate.keys()].filter((d) => d < dateKey).sort().reverse().slice(0, 10);
  const comparable = prevDates.map((d) => (byDate.get(d) || [])
    .filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay <= currentMinute)
    .reduce((s, x) => s + finite(x.c.volume), 0)).filter((v) => v > 0);
  const expectedCum = median(comparable);
  const cumulativeRvol = expectedCum > 0 ? currentVolume / expectedCum : 0;
  const recentStart = Math.max(570, currentMinute - 14);
  const currentRecent = sessionRows.filter((x)=>x.p.minuteOfDay>=recentStart&&x.p.minuteOfDay<=currentMinute).reduce((s,x)=>s+finite(x.c.volume),0);
  const recentComparable = prevDates.map((d)=>(byDate.get(d)||[])
    .filter((x)=>x.p.minuteOfDay>=recentStart&&x.p.minuteOfDay<=currentMinute)
    .reduce((s,x)=>s+finite(x.c.volume),0)).filter((v)=>v>0);
  const expectedRecent = median(recentComparable);
  const recentRvol = expectedRecent > 0 ? currentRecent / expectedRecent : 0;
  let relativeVolume = cumulativeRvol > 0 && recentRvol > 0 ? cumulativeRvol * .70 + recentRvol * .30
    : cumulativeRvol > 0 ? cumulativeRvol : recentRvol > 0 ? recentRvol : fallbackVolumeRatio(candles);
  if (!Number.isFinite(relativeVolume) || relativeVolume <= 0) relativeVolume = 1;
  relativeVolume = Math.max(.05, Math.min(8, relativeVolume));
  const sessionOpen = session.at(0)?.open ?? price;
  const sessionChangePct = sessionOpen ? ((price - sessionOpen) / sessionOpen) * 100 : 0;
  const sessionHigh = session.length ? Math.max(...session.map(c=>finite(c.high))) : price;
  const sessionLow = session.length ? Math.min(...session.map(c=>finite(c.low))) : price;
  const recent5=session.slice(-5);
  const recent5High=recent5.length?Math.max(...recent5.map(c=>finite(c.high))):price;
  const recent5Low=recent5.length?Math.min(...recent5.map(c=>finite(c.low))):price;
  const distanceFromSessionHighPct = sessionHigh>0 ? Math.max(0,(sessionHigh-price)/sessionHigh*100) : 0;
  const liquidRows = session.slice(-20);
  const avgMinuteDollarVolume = liquidRows.length ? liquidRows.reduce((sum, c) => sum + finite(c.volume) * finite(c.close), 0) / liquidRows.length : 0;

  const longSetup = detectBreakoutRetest("LONG", sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const shortSetup = detectBreakoutRetest("SHORT", sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const first15mSetup = detectFirst15mCandleBreak(sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const vwapReclaimSetup = detectVwapReclaim(sessionRows, vwaps, atrValue, cfg);
  const momentumSetup = detectMomentumContinuation(sessionRows, vwaps, atrValue, cfg);
  return {
    ready: currentMinute >= 590 && opening.length >= 12 && session.length >= 16,
    openingHigh, openingLow, vwap, vwapSlope, aboveVwap: price > vwap,
    longBreakout: ["WAIT_RETEST","WAIT_CONFIRMATION","CONFIRMED","EXPIRED"].includes(longSetup.state),
    shortBreakout: ["WAIT_RETEST","WAIT_CONFIRMATION","CONFIRMED","EXPIRED"].includes(shortSetup.state),
    longSetup, shortSetup, first15mSetup, vwapReclaimSetup, momentumSetup, relativeVolume, cumulativeRvol, recentRvol, rvolSampleDays:comparable.length, sessionChangePct, sessionHigh, sessionLow, recent5High, recent5Low, distanceFromSessionHighPct, avgMinuteDollarVolume,
  };
}

export function detectBreakoutRetest(side, sessionRows, openingHigh, openingLow, a, vwaps, cfg = STRATEGY_MODES.precision) {
  const isLong = side === "LONG";
  const level = isLong ? openingHigh : openingLow;
  const empty = () => ({
    state:"WAIT_BREAKOUT", breakoutIndex:-1, retestIndex:-1, confirmationIndex:-1,
    breakoutVolumeRatio:0, retestVolumeRatio:0, confirmationVolumeRatio:0,
    breakoutBodyRatio:0, confirmationBodyRatio:0,
    retestLow:null, retestHigh:null, retestDepthAtr:null, retestHoldStrength:0,
    chaseDistanceAtr:null, minutesSinceConfirmation:null, attemptNumber:0,
  });
  if (sessionRows.length < 16 || !Number.isFinite(level)) return empty();

  const firstTradeIdx = sessionRows.findIndex((x) => x.p.minuteOfDay >= 585);
  if (firstTradeIdx < 0) return empty();
  const lastIdx = sessionRows.length - 1;
  const maxAttempts = 6;
  let cursor = firstTradeIdx;
  let attemptNumber = 0;
  let requireReset = false;
  let lastResult = empty();

  while (cursor <= lastIdx && attemptNumber < maxAttempts) {
    let breakout = -1;
    let resetSeen = !requireReset;
    for (let i = cursor; i <= lastIdx; i++) {
      const c = sessionRows[i].c;
      const localA = Math.max(a, Math.abs(c.close) * .0005);
      if (requireReset && (isLong ? (c.low <= level + localA * .14 || c.close <= level + localA * .08) : (c.high >= level - localA * .14 || c.close >= level - localA * .08))) resetSeen = true;
      if (!resetSeen) continue;
      const avgVol = avgPriorVolume(sessionRows, i, 10);
      const volRatio = avgVol > 0 ? finite(c.volume) / avgVol : 1;
      const beyond = isLong ? c.close > level + a * 0.05 : c.close < level - a * 0.05;
      const expanded = isLong ? c.high > level + a * 0.08 : c.low < level - a * 0.08;
      const directional = isLong ? c.close >= c.open : c.close <= c.open;
      if (beyond && expanded && directional && volRatio >= 1.05) { breakout = i; break; }
    }
    if (breakout < 0) return lastResult.attemptNumber ? lastResult : empty();

    attemptNumber++;
    const result = empty();
    result.attemptNumber = attemptNumber;
    result.breakoutIndex = breakout;
    const breakoutC = sessionRows[breakout].c;
    const breakoutAvgVol = avgPriorVolume(sessionRows, breakout, 10);
    result.breakoutVolumeRatio = breakoutAvgVol > 0 ? finite(breakoutC.volume) / breakoutAvgVol : 1;
    result.breakoutBodyRatio = candleBodyRatio(breakoutC);
    result.state = "WAIT_RETEST";

    const breakoutVol = finite(breakoutC.volume);
    const maxRetestBars = Math.max(6, Math.min(30, Number(cfg.maxRetestMinutes || 14)));
    const maxRetestIdx = Math.min(lastIdx, breakout + maxRetestBars);
    let retest = -1, failedIndex = -1;
    for (let i = breakout + 1; i <= maxRetestIdx; i++) {
      const c = sessionRows[i].c;
      const failed = isLong ? c.close < level - a * 0.30 : c.close > level + a * 0.30;
      if (failed) { failedIndex = i; break; }
      const touched = isLong ? c.low <= level + a * 0.14 : c.high >= level - a * 0.14;
      const held = isLong ? c.close >= level - a * 0.05 : c.close <= level + a * 0.05;
      if (touched && held) { retest = i; break; }
    }
    if (failedIndex >= 0) {
      lastResult = { ...result, state:"FAILED_RETEST" };
      cursor = failedIndex + 1; requireReset = false; continue;
    }
    if (retest < 0) {
      if (lastIdx <= maxRetestIdx) return result; // latest attempt is still developing
      lastResult = { ...result, state:"EXPIRED" };
      cursor = maxRetestIdx + 1; requireReset = true; continue;
    }

    result.retestIndex = retest;
    result.retestLow = sessionRows[retest].c.low;
    result.retestHigh = sessionRows[retest].c.high;
    result.retestDepthAtr = a > 0 ? Math.abs((isLong ? result.retestLow : result.retestHigh) - level) / a : 99;
    result.retestVolumeRatio = breakoutVol > 0 ? finite(sessionRows[retest].c.volume) / breakoutVol : 1;
    const closeDistance = isLong ? (sessionRows[retest].c.close - level) / Math.max(a, 1e-9) : (level - sessionRows[retest].c.close) / Math.max(a, 1e-9);
    result.retestHoldStrength = clamp(50 + closeDistance * 160);
    result.state = "WAIT_CONFIRMATION";

    let confirmation = -1, confirmationFail = -1;
    for (let i = retest + 1; i <= lastIdx; i++) {
      const c = sessionRows[i].c;
      const avgVol = avgPriorVolume(sessionRows, i, 10);
      const volRatio = avgVol > 0 ? finite(c.volume) / avgVol : 1;
      const sessionVwap = vwaps[i] ?? c.close;
      const beyond = isLong ? c.close > Math.max(level + a * 0.05, result.retestHigh ?? level) : c.close < Math.min(level - a * 0.05, result.retestLow ?? level);
      const directional = isLong ? c.close > c.open : c.close < c.open;
      const vwapOk = isLong ? c.close > sessionVwap : c.close < sessionVwap;
      if (beyond && directional && vwapOk && volRatio >= 1.05) { confirmation = i; result.confirmationVolumeRatio = volRatio; result.confirmationBodyRatio = candleBodyRatio(c); break; }
      const failed = isLong ? c.close < level - a * 0.30 : c.close > level + a * 0.30;
      if (failed) { confirmationFail = i; break; }
    }
    if (confirmationFail >= 0) {
      lastResult = { ...result, state:"FAILED_RETEST" };
      cursor = confirmationFail + 1; requireReset = false; continue;
    }
    if (confirmation < 0) return result;

    result.confirmationIndex = confirmation;
    const latest = sessionRows[lastIdx].c.close;
    const chaseDistanceAtr = a > 0 ? Math.abs(latest - level) / a : 99;
    const minutesSinceConfirmation = Math.max(0, sessionRows[lastIdx].p.minuteOfDay - sessionRows[confirmation].p.minuteOfDay);
    result.chaseDistanceAtr = chaseDistanceAtr;
    result.minutesSinceConfirmation = minutesSinceConfirmation;
    if (minutesSinceConfirmation <= Number(cfg.maxConfirmationAgeMinutes||6) && chaseDistanceAtr <= Math.max(.80,Number(cfg.maxChaseAtr||.60)+.20)) return { ...result, state:"CONFIRMED" };

    lastResult = { ...result, state:"EXPIRED" };
    cursor = confirmation + 1;
    requireReset = true;
  }
  return lastResult.attemptNumber ? lastResult : empty();
}

export function detectFirst15mCandleBreak(sessionRows, openingHigh, openingLow, a, vwaps, cfg = STRATEGY_MODES.active) {
  const empty={type:"FIRST_15M_CANDLE",label:"15-Minute Candle Breakout",state:"WAIT_15M_BREAK",quality:20,breakoutIndex:-1,confirmationIndex:-1,breakoutVolumeRatio:0,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null,openingCandleHigh:openingHigh,openingCandleLow:openingLow};
  if(!sessionRows?.length||sessionRows.length<18||!Number.isFinite(openingHigh))return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c;
  let best=null;
  const start=Math.max(0,sessionRows.findIndex(x=>x.p.minuteOfDay>=585));
  if(start<0)return empty;
  for(let i=start;i<=last;i++){
    const c=sessionRows[i].c,vw=vwaps[i]??c.close,avgVol=avgPriorVolume(sessionRows,i,12),vr=avgVol>0?finite(c.volume)/avgVol:1;
    const prev=i>0?sessionRows[i-1].c:null;
    const crossed=Boolean(prev&&prev.close<=openingHigh+a*.035&&c.close>openingHigh+a*.035);
    const decisive=c.close>c.open&&c.high>openingHigh+a*.06&&c.close>vw&&vr>=Math.max(.72,Number(cfg.minBreakoutVolume||.92)-.20);
    if(!crossed||!decisive)continue;
    let confirmation=i,confVr=vr,confBody=candleBodyRatio(c),held=true;
    // If the breakout candle is weak-bodied, require a follow-through candle that holds the 15m high.
    if(confBody<.42){
      confirmation=-1;
      for(let j=i+1;j<=Math.min(last,i+3);j++){
        const cc=sessionRows[j].c,v=vwaps[j]??cc.close,av=avgPriorVolume(sessionRows,j,10),vr2=av>0?finite(cc.volume)/av:1;
        if(cc.close<openingHigh-a*.08){held=false;break;}
        if(cc.close>openingHigh+a*.025&&cc.close>v&&cc.close>=cc.open&&vr2>=.68){confirmation=j;confVr=vr2;confBody=candleBodyRatio(cc);break;}
      }
      if(confirmation<0)continue;
    }
    const age=Math.max(0,sessionRows[last].p.minuteOfDay-sessionRows[confirmation].p.minuteOfDay);
    const chase=a>0?Math.max(0,(latest.close-openingHigh)/a):99;
    const stillHolds=latest.close>=openingHigh-a*.06&&latest.close>(vwaps[last]??latest.close)-a*.02;
    let quality=48;
    quality+=vr>=1.5?18:vr>=1.15?14:vr>=.90?9:4;
    quality+=confBody>=.65?13:confBody>=.45?9:5;
    quality+=stillHolds?12:0;
    quality+=age<=5?9:age<=12?6:age<=20?3:0;
    quality+=chase<=.55?8:chase<=1.0?5:1;
    const fresh=age<=Math.max(20,Number(cfg.maxConfirmationAgeMinutes||12)+8)&&stillHolds&&held;
    const candidate={...empty,state:fresh?"CONFIRMED":"EXPIRED",quality:clamp(quality),breakoutIndex:i,confirmationIndex:confirmation,breakoutVolumeRatio:vr,confirmationVolumeRatio:confVr,confirmationBodyRatio:confBody,retestHoldStrength:stillHolds?78:25,chaseDistanceAtr:chase,minutesSinceConfirmation:age};
    if(!best||Number(candidate.quality)>Number(best.quality))best=candidate;
  }
  if(best)return best;
  const chase=a>0?Math.max(0,(latest.close-openingHigh)/a):null;
  return {...empty,chaseDistanceAtr:chase,state:latest.close>openingHigh?"WAIT_15M_CONFIRMATION":"WAIT_15M_BREAK"};
}

export function detectVwapReclaim(sessionRows, vwaps, a, cfg = STRATEGY_MODES.active) {
  const empty={type:"VWAP_RECLAIM",label:"VWAP Reclaim",state:"WAIT_RECLAIM",quality:20,confirmationIndex:-1,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null};
  if(!sessionRows?.length||sessionRows.length<24)return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c,latestVwap=vwaps[last]??latest.close;
  const start=Math.max(8,last-55);let touch=-1;
  for(let i=start;i<last;i++){
    const c=sessionRows[i].c,v=vwaps[i]??c.close;
    const touched=c.low<=v+a*.12;
    const held=c.close>=v-a*.06;
    const cameFromAbove=i>1 && sessionRows[Math.max(0,i-3)].c.close>(vwaps[Math.max(0,i-3)]??c.close);
    if(touched&&held&&cameFromAbove)touch=i;
  }
  if(touch<0)return {...empty,chaseDistanceAtr:a>0?Math.max(0,(latest.close-latestVwap)/a):null};
  const touchC=sessionRows[touch].c,touchVwap=vwaps[touch]??touchC.close;
  let confirmation=-1,volRatio=0,body=0;
  for(let i=touch+1;i<=last;i++){
    const c=sessionRows[i].c,v=vwaps[i]??c.close,avgVol=avgPriorVolume(sessionRows,i,12),vr=avgVol>0?finite(c.volume)/avgVol:1;
    if(c.close>v+a*.04&&c.close>c.open&&c.close>touchC.high-a*.03&&vr>=Math.max(.75,Number(cfg.minConfirmationVolume||.9)-.15)){
      confirmation=i;volRatio=vr;body=candleBodyRatio(c);break;
    }
    if(c.close<v-a*.35)return {...empty,state:"FAILED_RECLAIM",quality:18,retestDepthAtr:a>0?Math.abs(touchC.low-touchVwap)/a:null};
  }
  const depth=a>0?Math.abs(touchC.low-touchVwap)/a:99;
  const hold=clamp(70-Math.max(0,depth-.05)*90);
  if(confirmation<0)return {...empty,state:"WAIT_CONFIRMATION",quality:clamp(48+hold*.22),retestDepthAtr:depth,retestHoldStrength:hold,chaseDistanceAtr:a>0?Math.max(0,(latest.close-latestVwap)/a):null};
  const age=Math.max(0,sessionRows[last].p.minuteOfDay-sessionRows[confirmation].p.minuteOfDay);
  const chase=a>0?Math.max(0,(latest.close-latestVwap)/a):99;
  let quality=52;
  quality+=volRatio>=1.3?16:volRatio>=1.05?12:volRatio>=.85?8:3;
  quality+=body>=.6?11:body>=.4?7:3;
  quality+=hold*.12;
  quality+=age<=5?8:age<=12?4:0;
  const fresh=age<=Math.max(12,Number(cfg.maxConfirmationAgeMinutes||10)+3);
  return {type:"VWAP_RECLAIM",label:"VWAP Reclaim",state:fresh?"CONFIRMED":"EXPIRED",quality:clamp(quality),confirmationIndex:confirmation,confirmationVolumeRatio:volRatio,confirmationBodyRatio:body,retestDepthAtr:depth,retestHoldStrength:hold,chaseDistanceAtr:chase,minutesSinceConfirmation:age};
}

export function detectMomentumContinuation(sessionRows, vwaps, a, cfg = STRATEGY_MODES.active) {
  const empty={type:"MOMENTUM_CONTINUATION",label:"Momentum Continuation",state:"WAIT_MOMENTUM",quality:20,confirmationIndex:-1,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null};
  if(!sessionRows?.length||sessionRows.length<30)return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c,v=vwaps[last]??latest.close;
  const recent=sessionRows.slice(Math.max(0,last-9),last+1).map(x=>x.c);
  const prior=sessionRows.slice(Math.max(0,last-24),Math.max(0,last-4)).map(x=>x.c);
  if(recent.length<6||prior.length<8)return empty;
  const higherCloses=recent.slice(1).filter((c,i)=>c.close>=recent[i].close).length;
  const green=recent.filter(c=>c.close>c.open).length;
  const localHigh=Math.max(...prior.map(c=>c.high));
  const nearHigh=latest.close>=localHigh-a*.12;
  const move=a>0?(latest.close-recent[0].close)/a:0;
  const avgRecent=recent.reduce((x,c)=>x+finite(c.volume),0)/recent.length;
  const avgPrior=prior.reduce((x,c)=>x+finite(c.volume),0)/Math.max(1,prior.length);
  const vr=avgPrior>0?avgRecent/avgPrior:1;
  const aboveVwap=latest.close>v;
  const vwapSlope=(v-(vwaps[Math.max(0,last-6)]??v))/Math.max(a,1e-9);
  const confirmed=aboveVwap&&vwapSlope>=-.03&&nearHigh&&move>=.18&&higherCloses>=5&&green>=4&&vr>=.72;
  let quality=35;
  quality+=aboveVwap?12:0;quality+=vwapSlope>.04?10:vwapSlope>=0?6:2;quality+=nearHigh?10:0;
  quality+=move>=.65?15:move>=.35?11:move>=.18?7:0;quality+=vr>=1.25?13:vr>=1?10:vr>=.8?7:3;quality+=higherCloses>=7?7:higherCloses>=5?4:0;
  const anchor=recent.slice(-5).reduce((sum,c)=>sum+finite(c.close),0)/Math.max(1,recent.slice(-5).length);
  const chase=a>0?Math.max(0,(latest.close-anchor)/a):99;
  return {...empty,state:confirmed?"CONFIRMED":"WAIT_MOMENTUM",quality:clamp(quality),confirmationIndex:confirmed?last:-1,confirmationVolumeRatio:vr,confirmationBodyRatio:candleBodyRatio(latest),retestHoldStrength:clamp(higherCloses*11),chaseDistanceAtr:chase,minutesSinceConfirmation:confirmed?0:null};
}

export function chooseLongSetup(ctx, breakoutQuality=20, cfg = STRATEGY_MODES.active){
  const breakout={...(ctx.longSetup||{}),type:"BREAKOUT_RETEST",label:"Breakout + Retest",quality:breakoutQuality};
  if(cfg.id!=="active")return breakout;
  const candidates=[ctx.first15mSetup,breakout,ctx.vwapReclaimSetup,ctx.momentumSetup].filter(Boolean);
  const confirmed=candidates.filter(x=>x.state==="CONFIRMED").sort((a,b)=>Number(b.quality||0)-Number(a.quality||0));
  if(confirmed.length)return confirmed[0];
  return candidates.sort((a,b)=>Number(b.quality||0)-Number(a.quality||0))[0]||breakout;
}
