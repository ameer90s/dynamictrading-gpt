/** Independent paper-scalp pattern recognition; completed 1m bars only.
 * No quotes inferred from OHLCV, no short orders, no self-approval of a pattern.
 */
const ok=v=>typeof v==='number'&&Number.isFinite(v);
const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SCALP_PATTERN_IDS37=Object.freeze([
 'MOMENTUM_SCALP','VWAP_RECLAIM_SCALP','PULLBACK_SCALP',
 'OPENING_RANGE_BREAKOUT_SCALP','CONSOLIDATION_BREAKOUT_SCALP',
 'EMA_RECLAIM_SCALP','VWAP_BOUNCE_SCALP','BREAKOUT_RETEST_SCALP',
 'FAILED_BREAKDOWN_RECOVERY_SCALP','RANGE_RECOVERY_SCALP',
 'RELATIVE_STRENGTH_SCALP','AFTERNOON_BREAKOUT_SCALP'
]);
const pct=(a,b)=>ok(a)&&ok(b)&&b>0?(a/b-1)*100:null;
export function detectIndependentScalpPatterns37({features:f,rows=[],market={},policy={}}={}){
 if(!f||!Array.isArray(rows)||rows.length<20||!rows.every(b=>b&&[b.open,b.high,b.low,b.close,b.volume].every(ok)&&b.low>0&&b.high>=b.low))
  return {patterns:[],reason:'SCALP_MISSING_VERIFIED_COMPLETED_BARS',checks:[]};
 const bar=rows.at(-1),prev=rows.at(-2),before=rows.slice(0,-1);
 if(f.barTime!==bar.datetime)return {patterns:[],reason:'SCALP_FEATURE_BAR_MISMATCH',checks:[]};
 const trend=String(market?.regime||'UNKNOWN');
 const v=cap((f.atrPct??0.35)/.35,.65,2.0),liquid=f.openingDollarVolume>=Math.max(210000,380000/v);
 const lower=Math.min(...before.slice(-12).map(b=>b.low)),upper=Math.max(...before.slice(-12).map(b=>b.high));
 const tight=before.slice(-8);const tightHigh=Math.max(...tight.map(b=>b.high)),tightLow=Math.min(...tight.map(b=>b.low));
 const open=rows.filter(b=>Number(String(b.datetime).slice(11,13))*60+Number(String(b.datetime).slice(14,16))<585);
 const openingHigh=open.length?Math.max(...open.map(b=>b.high)):null;
 const recover=bar.close>bar.open&&f.closePosition>=.62;
 const vol=ok(f.volumeRatio)&&f.volumeRatio>=cap(1.18/Math.sqrt(v),.92,1.55);
 const strong=ok(f.momentum3Pct)&&f.momentum3Pct>=cap(.12/v,.06,.25);
 const rel=ok(f.relativeStrengthPct)&&f.relativeStrengthPct>=cap(.14/v,.05,.35);
 const aboveVwap=bar.close>f.vwap,aboveEma=bar.close>f.ema9;
 const down=trend.startsWith('TREND_DOWN'),thin=trend.includes('THIN_LIQUIDITY');
 const checks=[{gate:'SCALP_MARKET_CLASSIFIED',passed:trend!=='UNKNOWN'&&Number(market?.confidence)>=.2,observed:trend},
  {gate:'SCALP_LIQUIDITY',passed:liquid,observed:f.openingDollarVolume},
  {gate:'SCALP_MOMENTUM_OR_RECOVERY',passed:strong||recover,observed:f.momentum3Pct},
  {gate:'SCALP_VOLUME_OR_RETEST',passed:vol||bar.low<=f.vwap,observed:f.volumeRatio},
  {gate:'SCALP_ATR',passed:ok(f.atr)&&f.atr>0,observed:f.atr},
  {gate:'SCALP_SESSION_TIME',passed:f.minute>=policy.entryMinMinute&&f.minute<=policy.entryMaxMinute,observed:f.minute}];
 if(checks.some(x=>!x.passed))return {patterns:[],reason:checks.find(x=>!x.passed).gate,checks};
 // A falling market is not a blanket prohibition: only recovery/reversal forms
 // may qualify, with a larger recovery-strength requirement. No short selling.
 const ideas=[
  ['MOMENTUM_SCALP',!down&&strong&&vol&&aboveEma&&f.ema9>f.ema21&&recover,3],
  ['VWAP_RECLAIM_SCALP',prev.close<=f.vwap&&aboveVwap&&bar.low<=f.vwap&&recover,3],
  ['PULLBACK_SCALP',!down&&prev.low<=f.ema9&&aboveEma&&f.momentum5Pct>=.10&&recover,2],
  ['OPENING_RANGE_BREAKOUT_SCALP',!down&&openingHigh!==null&&f.minute>=585&&bar.close>openingHigh&&prev.close<=openingHigh&&vol&&recover,4],
  ['CONSOLIDATION_BREAKOUT_SCALP',!down&&pct(tightHigh,tightLow)<=cap(1.2*v,.65,2.1)&&bar.close>tightHigh&&vol&&recover,4],
  ['EMA_RECLAIM_SCALP',prev.close<=f.ema9&&aboveEma&&f.ema9>=f.ema21&&recover,2],
  ['VWAP_BOUNCE_SCALP',bar.low<=f.vwap&&aboveVwap&&prev.close>=f.vwap&&recover,2],
  ['BREAKOUT_RETEST_SCALP',prev.close>=upper*.998&&bar.low<=upper&&bar.close>upper&&recover,4],
  ['FAILED_BREAKDOWN_RECOVERY_SCALP',bar.low<lower&&bar.close>lower&&recover&&(!down||f.momentum3Pct>=.20),4],
  ['RANGE_RECOVERY_SCALP',bar.low<=lower*1.005&&bar.close>(upper+lower)/2&&recover&&(!down||f.momentum3Pct>=.20),3],
  ['RELATIVE_STRENGTH_SCALP',!down&&rel&&strong&&aboveVwap&&vol&&recover,3],
  ['AFTERNOON_BREAKOUT_SCALP',!down&&f.minute>=720&&bar.close>upper&&vol&&recover,4]
 ];
 const patterns=ideas.filter(([,pass])=>pass).map(([type,,priority])=>({type,priority,at:f.barTime,
  score:Math.round(cap(40+8*priority+Math.min(15,Math.max(0,f.volumeRatio||0)*4)+Math.min(10,Math.max(0,f.momentum3Pct||0)*6),0,100)),
  evidence:{price:bar.close,volumeRatio:f.volumeRatio,momentum3Pct:f.momentum3Pct,relativeStrengthPct:f.relativeStrengthPct,
   atr:f.atr,marketRegime:trend,barTime:f.barTime},eligibleForPaperOnly:true,canSendOrders:false}));
 patterns.sort((a,b)=>b.score-a.score||a.type.localeCompare(b.type));
 return {patterns,reason:patterns.length?'SCALP_PATTERNS_DETECTED':'SCALP_NO_PATTERN_CONFIRMED',checks};
}
