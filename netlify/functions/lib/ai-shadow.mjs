// #40 Monitoring-only contextual shadow. It NEVER changes scanner state or levels.
// The output is frozen at CONFIRMED time so later comparison is not hindsight-biased.
const round=(v,d=2)=>{const n=Number(v);if(!Number.isFinite(n))return null;const p=10**d;return Math.round(n*p)/p;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function buildAiShadow(r){
  const m=r?.metrics||{}, f=r?.filters||{}; const entry=Number(r?.price||0);
  const market=String(f.marketRegime||'UNKNOWN'); const rs=Number(m.relativeStrengthPct||0);
  const setup=Number(m.setupQuality||0),retest=Number(m.retestQuality||0),mtf=Number(m.mtfAlignment||0),rv=Number(m.relativeVolume||0),chase=Number(m.chaseDistanceAtr||0),spread=Number(m.spreadBps||0),room=Number(m.roomR||0);
  let score=50+clamp((setup-60)*.20,-10,10)+clamp((retest-55)*.14,-8,8)+clamp((mtf-60)*.12,-7,7)+clamp(rs*8,-8,8)+clamp((rv-1)*5,-5,8)+clamp((room-1)*4,-4,6)-clamp(chase*7,0,8)-clamp(spread/12,0,6);
  if(market==='TREND_DOWN')score-=8; else if(market==='TREND_UP')score+=5;
  score=Math.round(clamp(score,0,100));
  const quality=score>=72?'STRONG':score>=55?'MODERATE':'WEAK';
  // Independent shadow levels: modestly adapt reward/risk to contextual quality.
  // Monitoring only; scanner's original targets/SL remain untouched.
  const t1Pct=quality==='STRONG'?.0065:quality==='MODERATE'?.0055:.0045;
  const t2Pct=quality==='STRONG'?.0090:quality==='MODERATE'?.0075:.0060;
  const t3Pct=quality==='STRONG'?.0120:quality==='MODERATE'?.0095:.0075;
  const scannerStopPct=entry>0&&Number(r?.stopLoss)>0?(entry-Number(r.stopLoss))/entry:null;
  const slPct=clamp(Number.isFinite(scannerStopPct)?scannerStopPct:(quality==='WEAK'?.006:.0075),.004,.012);
  const reasons=[]; if(market==='TREND_DOWN')reasons.push('MARKET_HEADWIND');if(market==='TREND_UP')reasons.push('MARKET_ALIGNED');if(rs<0)reasons.push('RELATIVE_STRENGTH_WEAK');else if(rs>.25)reasons.push('RELATIVE_STRENGTH_STRONG');if(chase>.75)reasons.push('LATE_CHASE_RISK');if(retest>=65)reasons.push('RETEST_SUPPORTIVE');if(rv<1)reasons.push('LOW_RVOL');
  return {mode:'MONITORING_ONLY',model:'AI_SHADOW_CONTEXT_V1',frozenAt:new Date().toISOString(),quality,qualityScore:score,entry:round(entry),t1:round(entry*(1+t1Pct)),t2:round(entry*(1+t2Pct)),t3:round(entry*(1+t3Pct)),sl:round(entry*(1-slPct)),context:{marketRegime:market,indexAlignment:market==='TREND_UP'?'ALIGNED':market==='TREND_DOWN'?'NON_ALIGNED':'MIXED',sectorAlignment:'UNAVAILABLE',relativeStrengthAlignment:rs>=0?'ALIGNED':'NON_ALIGNED',relativeStrengthPct:round(rs),benchmarkChangePct:round(m.benchmarkChangePct),setupFamily:m.setupFamily||null},reasons};
}
