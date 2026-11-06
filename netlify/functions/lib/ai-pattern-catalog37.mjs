/** Dynamic Trading 3.7, independent research-only OHLCV pattern catalog.
 * CRITICAL: Detecting any item here NEVER authorizes paper entry or production trading.
 * No market data calls: observations use already-fetched *completed* 1-minute bars.
 * Missing source data => UNAVAILABLE, not an imagined signal.
 */
import {newYorkParts} from './time.mjs';
export const PATTERN_CATALOG_VERSION37='dt37-research-patterns-v1';
export const RESEARCH_ONLY_PATTERN_IDS37=Object.freeze([
 'OPENING_RANGE_BREAKOUT','CONSOLIDATION_BREAKOUT','MOMENTUM_CONTINUATION',
 'VWAP_BOUNCE','EMA_RECLAIM','TREND_CONTINUATION','PULLBACK_CONTINUATION',
 'FAILED_BREAKDOWN','LIQUIDITY_SWEEP_OHLCV_PROXY','RANGE_RECOVERY',
 'RELATIVE_STRENGTH_LEADER','BREAKOUT_RETEST','VOLATILITY_SQUEEZE_BREAKOUT',
 'AFTERNOON_BREAKOUT','MEAN_REVERSION_RECOVERY','SUPPORT_RECLAIM',
 'GAP_AND_GO','GAP_FILL_RECOVERY','ORDER_BOOK_IMBALANCE',
 'NEWS_CATALYST_MOMENTUM'
]);
const r=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?(a/b-1)*100:null;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const cap=(x,low,high)=>Math.max(low,Math.min(high,x));
const validBar=b=>b&&['open','high','low','close','volume'].every(k=>finite(b[k]))&&b.low>0&&b.high>=b.low&&b.open>0&&b.close>0&&b.volume>=0;
const unavailable=(type,requirement)=>({type,status:'UNAVAILABLE_DATA',reason:requirement,tradeEligible:false,canEnterTrade:false});
const blocked=(type,reason)=>({type,status:'NOT_DETECTED',reason,tradeEligible:false,canEnterTrade:false});

export function detectResearchPatterns37({symbol,features:f,rows=[],policy={},approved=false,verifiedSource=false}={}){
 const meta={version:PATTERN_CATALOG_VERSION37,symbol,barTime:f?.barTime||null,
  evaluated:RESEARCH_ONLY_PATTERN_IDS37.length,eligibleForAutoPromotion:false,automaticTrading:false};
 const missing=RESEARCH_ONLY_PATTERN_IDS37.map(type=>({type,status:'BLOCKED_UNTRUSTED_SOURCE',reason:'NO_VERIFIED_COMPLETED_BARS',canEnterTrade:false,tradeEligible:false}));
 if(!f||!Array.isArray(rows)||rows.length<16||!rows.every(validBar))return {...meta,detected:[],assessments:missing,blockedReason:'NO_VERIFIED_COMPLETED_BARS'};
 // Only whole completed bars, validated upstream; research signals also fail closed
 // when a benchmark / provenance / source timestamp is not fresh.
 const stale= !verifiedSource?'STALE_OR_UNVERIFIED_COMPLETED_BAR':!approved?'UNAPPROVED_SHARIA':
  !finite(f.benchmarkLagMinutes)||f.benchmarkLagMinutes>2||f.benchmarkLagMinutes<0?'BENCHMARK_NOT_FRESH':
  !finite(f.atr)||f.atr<=0?'ATR_UNAVAILABLE':
  !finite(f.volumeRatio)||!finite(f.closePosition)||!finite(f.sessionRelativeStrengthPct)?'MISSING_MARKET_FEATURES':null;
 if(stale)return {...meta,detected:[],assessments:RESEARCH_ONLY_PATTERN_IDS37.map(type=>({type,status:'BLOCKED_UNTRUSTED_SOURCE',reason:stale,tradeEligible:false,canEnterTrade:false})),blockedReason:stale};
 const b=rows.at(-1),prev=rows.at(-2),before=rows.slice(0,-1),last=(n)=>before.slice(-n), hi=a=>Math.max(...a.map(x=>x.high)),lo=a=>Math.min(...a.map(x=>x.low));
 const p=policy?.params||{},atr=f.atr,vol=f.volumeRatio,ret=f.momentum5Pct??0;
 const regime=String(policy?.regime||'UNKNOWN');
 const volatility=cap((f.atrPct??.3)/.35,.55,2.5);
 const volumeStrong=cap(1.25/Math.sqrt(volatility),.85,1.65);
 const momentumStrong=cap(.20/volatility,.08,.42);
 const minRelative=cap(.30+(regime==='DOWN'?.15:0),.18,.7);
 const condWidth=cap(.009*volatility,.004,.018); // prior-range width / price
 const closingStrong=f.closePosition>=Math.max(.57,(p.minClosePosition??.62)-.04);
 const up=b.close>b.open&&closingStrong;
 const top8=hi(last(8)),bottom8=lo(last(8)),top12=hi(last(12)),bottom12=lo(last(12));
 const top5=hi(last(5)),bottom5=lo(last(5));
 const priorBreakoutReference=hi(before.slice(-9,-1)),priorSupportReference=lo(before.slice(-6,-1));
 const opens=rows.filter(x=>x?._time?.min>=570&&x?._time?.min<=584),openingHi=opens.length>=10?hi(opens):null;
 const priorWidth=pct(top8,bottom8),priorWidthPct=finite(priorWidth)?priorWidth/100:null;
 const volumeOk=vol>=volumeStrong;
 const signalList=[];
 const specs=[
  ['OPENING_RANGE_BREAKOUT',openingHi!=null&&b.close>openingHi&&prev.close<=openingHi&&volumeOk&&up,openingHi==null?'OPENING_RANGE_INCOMPLETE':'OR_HIGH_NOT_BROKEN', 'BREAKOUT'],
  ['CONSOLIDATION_BREAKOUT',priorWidthPct!=null&&priorWidthPct<=condWidth&&b.close>top8&&volumeOk&&up,'NO_TIGHT_RANGE_BREAKOUT','BREAKOUT'],
  ['MOMENTUM_CONTINUATION',ret>=momentumStrong&&f.momentum3Pct>0&&vol>=.9&&b.close>f.vwap&&up,'NO_POSITIVE_MOMENTUM_CONFLUENCE','MOMENTUM'],
  ['VWAP_BOUNCE',b.low<=f.vwap+atr*.25&&b.close>f.vwap&&prev.close>f.vwap&&up&&vol>=.8,'NO_VWAP_BOUNCE','PULLBACK'],
  ['EMA_RECLAIM',prev.close<=f.ema9&&b.close>f.ema9&&vol>=.9&&up,'NO_EMA_RECLAIM','RECOVERY'],
  ['TREND_CONTINUATION',f.ema9>f.ema21&&b.close>f.ema9&&b.close>f.vwap&&ret>=momentumStrong&&volumeOk,'NO_TREND_CONFLUENCE','TREND'],
  ['PULLBACK_CONTINUATION',f.ema9>f.ema21&&b.low<=f.ema21+atr*.35&&b.close>f.ema9&&up&&vol>=.8,'NO_PULLBACK_RECLAIM','PULLBACK'],
  ['FAILED_BREAKDOWN',b.low<bottom8&&b.close>bottom8&&up&&vol>=volumeStrong,'NO_FAILED_BREAKDOWN','REVERSAL'],
  ['LIQUIDITY_SWEEP_OHLCV_PROXY',b.low<bottom12&&b.close>bottom12&&f.closePosition>=.7&&vol>=volumeStrong,'NO_OHLCV_SWEEP_PROXY','REVERSAL'],
  ['RANGE_RECOVERY',prev.close<=(top12+bottom12)/2&&b.close>(top12+bottom12)/2&&up&&vol>=.85,'NO_RANGE_MID_RECOVERY','RECOVERY'],
  ['RELATIVE_STRENGTH_LEADER',f.sessionRelativeStrengthPct>=minRelative&&b.close>f.vwap&&vol>=.85&&up,'NO_RELATIVE_STRENGTH_CONFIRMATION','RELATIVE_STRENGTH'],
  ['BREAKOUT_RETEST',prev.low<=priorBreakoutReference+atr*.25&&prev.close>priorBreakoutReference&&b.low<=priorBreakoutReference+atr*.25&&b.close>priorBreakoutReference&&up&&vol>=.85,'NO_BREAKOUT_RETEST','RETEST'],
  ['VOLATILITY_SQUEEZE_BREAKOUT',priorWidthPct!=null&&priorWidthPct<=condWidth*.8&&b.close>top8&&vol>=volumeStrong&&up,'NO_SQUEEZE_BREAKOUT','BREAKOUT'],
  ['AFTERNOON_BREAKOUT',f.minute>=750&&b.close>top12&&volumeOk&&up,'NO_AFTERNOON_BREAKOUT','BREAKOUT'],
  ['MEAN_REVERSION_RECOVERY',f.rsi14<=38&&prev.close<prev.open&&up&&b.close>prev.close&&vol>=.8,'NO_OVERSOLD_RECOVERY','REVERSAL'],
  ['SUPPORT_RECLAIM',prev.close<priorSupportReference&&b.close>priorSupportReference&&up&&volumeOk,'NO_SUPPORT_RECLAIM','RECOVERY']
 ];
 const assessments=specs.map(([type,hit,miss,family])=>{
  if(!hit)return blocked(type,miss);
  const score=cap(40+Math.max(0,ret)*12+Math.min(3,vol)*8+Math.max(0,f.sessionRelativeStrengthPct)*9+
   f.closePosition*9+(regime==='UP'&&family==='TREND'?5:0)+(regime==='DOWN'&&family==='REVERSAL'?5:0),0,100);
  const observed={close:r(b.close),volume:b.volume,volumeRatio:r(vol),atr:r(atr),momentum5Pct:r(ret),
   sessionRelativeStrengthPct:r(f.sessionRelativeStrengthPct),closePosition:r(f.closePosition),
   priorRangeHigh:r(top8),priorRangeLow:r(bottom8),openingRangeHigh:r(openingHi),vwap:r(f.vwap),ema9:r(f.ema9),ema21:r(f.ema21)};
  const result={type,family,status:'DETECTED_RESEARCH_ONLY',reason:'PATTERN_CONFLUENCE_OBSERVED',
   researchScore:r(score,1),scoreType:'UNVALIDATED_HEURISTIC_NOT_PROFIT_PROBABILITY',regime,
   evidence:{barTime:f.barTime,observed,thresholds:{volumeStrong:r(volumeStrong),momentumStrongPct:r(momentumStrong),minRelativeStrengthPct:r(minRelative),maxConsolidationWidthPct:r(condWidth*100)},
    dataType:type==='LIQUIDITY_SWEEP_OHLCV_PROXY'?'OHLCV_PROXY_NOT_ORDER_FLOW':'COMPLETED_1MIN_OHLCV'},
   tradeEligible:false,canEnterTrade:false,manualApprovalRequired:true,validatedOutOfSample:false};
  signalList.push(result);return {type,status:result.status,reason:result.reason,researchScore:result.researchScore,
    tradeEligible:false,canEnterTrade:false};
 });
 for(const type of ['GAP_AND_GO','GAP_FILL_RECOVERY'])assessments.push(unavailable(type,'PRIOR_SESSION_OFFICIAL_CLOSE_MISSING'));
 assessments.push(unavailable('ORDER_BOOK_IMBALANCE','LEVEL2_ORDER_BOOK_NOT_AVAILABLE'));
 assessments.push(unavailable('NEWS_CATALYST_MOMENTUM','TIMESTAMPED_CATALYST_NOT_IN_AI_BAR_FEED'));
 signalList.sort((a,b)=>b.researchScore-a.researchScore||a.type.localeCompare(b.type));
 return {...meta,marketRegime:regime,detected:signalList,assessments,
  detectedCount:signalList.length,unavailableCount:assessments.filter(x=>x.status==='UNAVAILABLE_DATA').length,
  scoredCandidatesOnly:true,noNewMarketDataRequests:true};
}

/** Research observation is NOT an order/fill: close-price proxies are descriptive only.
 * Later completed bars may show hypothetical favorable/adverse movement; same-bar
 * dual hits are recorded as indeterminate. No PnL is fabricated.
 */
export function updateResearchPatternShadows37({previous={},detected=[],bars=[],at,day,symbol,maxHorizonBars=10,maxStudiesPerTypePerDay=3,cooldownMinutes=10}={}){
 const shadows={...(previous||{})},events=[];
 const now=Date.parse(at||''),ny=Number.isFinite(now)?newYorkParts(new Date(now)):null;
 // A later scheduled caller may hand us bars beyond the as-of time.
 // Filter at this boundary as well as in the normal upstream completed-bars loader.
 const verifiedBars=(ny?.dateKey===day?bars.filter(b=>{
   const minute=Number(String(b.datetime||'').slice(11,13))*60+Number(String(b.datetime||'').slice(14,16));
   return validBar(b)&&b.datetime?.startsWith(day+' ')&&Number.isFinite(minute)&&minute<ny.minuteOfDay;
 }):[]);
 const latest=verifiedBars.at(-1),currentBarTime=latest?.datetime||null;
 for(const [type,obs] of Object.entries(shadows)){
  if(obs.status!=='OBSERVING')continue;
  const later=verifiedBars.filter(b=>b.datetime>obs.barTime);
  let next={...obs};
  for(const bar of later){
   if(bar.datetime<=String(next.lastCheckedBarTime||next.barTime))continue;
   const favorable=bar.high>=next.favorableThreshold,adverse=bar.low<=next.adverseThreshold;
   next.lastCheckedBarTime=bar.datetime;next.observedBars=(next.observedBars||0)+1;
   if(favorable||adverse){next.status='OBSERVED_OUTCOME';next.outcome=favorable&&adverse?'AMBIGUOUS_BOTH_IN_SAME_BAR':favorable?'FAVORABLE_PROXY_MOVE':'ADVERSE_PROXY_MOVE';next.outcomeBarTime=bar.datetime;break;}
   if(next.observedBars>=maxHorizonBars){next.status='OBSERVED_OUTCOME';next.outcome='HORIZON_EXPIRED_NO_HIT';next.outcomeBarTime=bar.datetime;break;}
  }
  if(next.status==='OBSERVED_OUTCOME')events.push({kind:'RESEARCH_PATTERN_OBSERVED_OUTCOME',symbol,type,at,observationId:next.id,
   outcome:next.outcome,barTime:next.outcomeBarTime,observedBars:next.observedBars,
   pricing:'BAR_HIGH_LOW_PROXY_NOT_TRADE_EXECUTION',netUsd:null});
  shadows[type]=next;
 }
 for(const p of detected){
  const prev=shadows[p.type];
  // Start only on a fresh pattern transition. A prior completed study may be
  // replaced after cooldown; the previous result remains in append-only minute
  // audit events and daily outcome counters. Active studies never overlap.
  if(prev?.status==='OBSERVING')continue;
  const currentMinute=Number(currentBarTime?.slice(11,13))*60+Number(currentBarTime?.slice(14,16));
  const prevMinute=Number(prev?.barTime?.slice(11,13))*60+Number(prev?.barTime?.slice(14,16));
  if(prev?.day===day&&((prev.studyCount||1)>=maxStudiesPerTypePerDay||
     !Number.isFinite(currentMinute)||!Number.isFinite(prevMinute)||currentMinute-prevMinute<cooldownMinutes))continue;
  if(!latest||!finite(latest.close)||!finite(p?.evidence?.observed?.atr)||p.evidence.observed.atr<=0)continue;
  const atr=p.evidence.observed.atr;
  const next={id:`${day}:${symbol}:${p.type}:${currentBarTime}`,type:p.type,symbol,day,barTime:currentBarTime,
   status:'OBSERVING',at,studyCount:prev?.day===day?(prev.studyCount||1)+1:1,entryProxyClose:latest.close,favorableThreshold:r(latest.close+atr),
   adverseThreshold:r(latest.close-atr),observedBars:0,lastCheckedBarTime:currentBarTime,
   outcome:null,netUsd:null,simulation:'RESEARCH_BAR_PROXY_NO_BROKER_EXECUTION'};
  shadows[p.type]=next;
  events.push({kind:'RESEARCH_PATTERN_OBSERVATION_STARTED',symbol,type:p.type,at,observationId:next.id,
   barTime:currentBarTime,entryProxyClose:next.entryProxyClose,favorableThreshold:next.favorableThreshold,
   adverseThreshold:next.adverseThreshold,netUsd:null});
 }
 return {shadows,events};
}

/** Explicit evidence gate for considering a new catalog pattern at a later,
 * separately authorized local release. Shadow bar proxies are never counted
 * as paper trades or independent validation. This DOES NOT enable anything.
 */
export function assessResearchPatternReadiness37(type,evidence={}){
 const recognized=RESEARCH_ONLY_PATTERN_IDS37.includes(type);
 const prerequisites={
  catalogSupported:recognized,
  minimumIndependentPaperTrades:Number.isInteger(evidence.independentlyReviewedClosedPaperTrades)&&evidence.independentlyReviewedClosedPaperTrades>=60,
  independentExternalAudit:evidence.independentExternalAuditPassed===true,
  authenticOutOfSampleReplay:evidence.authenticOutOfSampleReplayPassed===true,
  feesAndSpreadValidated:evidence.feesSpreadAndSlippageValidated===true,
  netAfterCostsPositive:evidence.netAfterCostsPositive===true,
  riskNotWorse:evidence.riskNotWorse===true,
  sourceProvenanceVerified:evidence.sourceProvenanceVerified===true,
 };
 const allPass=Object.values(prerequisites).every(Boolean);
 return {type,prerequisites,status:allPass?'ELIGIBLE_FOR_SEPARATE_MANUAL_REVIEW':'NOT_VALIDATED_FOR_PAPER_ENTRY',
  autoPromotion:false,canEnterTrade:false,productionApplied:false,
  manualApprovalAndCodeReviewRequired:true,
  observationalBarProxiesNotEligibleAsPaperTrades:true};
}
