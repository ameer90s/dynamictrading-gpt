/** Dynamic Trading 3.6 independent adaptive AI-PAPER observer.
 * Research agent, NOT a neural LLM and NOT a calibrated probability model.
 * All *strategy* thresholds adapt from as-of market features / strictly prior closed
 * PAPER outcomes. Non-negotiable safety gates (Sharia, quote validity, no future bars,
 * positive net economics and cash-only) are NEVER adapted away.
 * This module neither imports the production research gate nor changes its signals.
 */
import {completedSessionRows} from './research36.mjs';
import {newYorkParts} from './time.mjs';
import {detectResearchPatterns37} from './ai-pattern-catalog37.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=(x,d=5)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:0;
const quantile=(x,q)=>{const a=x.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;const z=(a.length-1)*q,k=Math.floor(z);return a[k]+(a[Math.min(k+1,a.length-1)]-a[k])*(z-k);};
const pchange=(a,b)=>a>0&&b>0?(a/b-1)*100:null;
const g=(gate,observed,operator,threshold,reason)=>({gate,observed:observed??null,operator,threshold:round(threshold),passed:Number.isFinite(observed)&&(operator==='>='?observed>=threshold:operator==='<='?observed<=threshold:operator==='>'?observed>threshold:operator==='=='?observed===threshold:false),reason});
const anyFail=x=>x.find(y=>!y.passed)?.reason||null;
const median=x=>quantile(x,.5);
function ema(arr,n){const k=2/(n+1);return arr.reduce((v,x,i)=>i===0?x:v+k*(x-v),0)}
function featureSet(rows,benchmark=[]){if(!rows.length)return null;
 const b=rows.at(-1),open=rows.filter(x=>x._time.min>=570&&x._time.min<=584),vol=rows.slice(-12,-1).map(x=>x.volume),hi=Math.max(...rows.map(x=>x.high));
 const dollarOpen=open.reduce((s,x)=>s+x.volume*x.close,0),close=rows.map(x=>x.close);
 const changes=rows.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-rows[i].close),Math.abs(x.low-rows[i].close)));
 const atr=changes.length>=5?mean(changes.slice(-Math.min(20,changes.length))):null;
 let pv=0,v=0;for(const x of rows){pv+=(x.high+x.low+x.close)/3*x.volume;v+=x.volume;}
 const vwap=v?pv/v:b.close,benchmarkOpen=benchmark.find(x=>x._time.min===570);
  // Compare returns over *matching* as-of windows. Never compare the stock's
  // 09:30-09:44 move against SPY's 09:30-to-now move.
  const benchmarkBar=benchmark.filter(x=>x._time.min<=b._time.min).at(-1);
  const benchmarkOpening=benchmark.filter(x=>x._time.min>=open[0]?._time?.min&&x._time.min<=open.at(-1)?._time?.min);
  const benchmarkMatchedStart=benchmark.find(x=>x._time.min===rows[0]._time.min);
 const benchmarkMove=benchmarkOpen&&benchmarkBar?pchange(benchmarkBar.close,benchmarkOpen.open):null;
  const benchmarkOpeningMove=benchmarkOpening.length>=10?
    pchange(benchmarkOpening.at(-1).close,benchmarkOpening[0].open):null;
  const sessionReturnPct=pchange(b.close,rows[0].open);
  const benchmarkMatchedMove=benchmarkMatchedStart&&benchmarkBar?
    pchange(benchmarkBar.close,benchmarkMatchedStart.open):null;
 const signalSpread=(b.high-b.low)/b.close*100;
 const recent=rows.slice(-10),mom3=rows.length>=4?pchange(b.close,rows.at(-4).close):null,mom5=rows.length>=6?pchange(b.close,rows.at(-6).close):null;
 const fast=ema(close.slice(-50),9),slow=ema(close.slice(-50),21);
 const gains=close.slice(-15).map((x,i,a)=>i?Math.max(0,x-a[i-1]):0),losses=close.slice(-15).map((x,i,a)=>i?Math.max(0,a[i-1]-x):0);
 const rs=mean(gains)/(mean(losses)||1e-9),rsi=100-100/(1+rs);
 const retOpen=open.length>=10?pchange(open.at(-1).close,open[0].open):null;
  const priorRows=rows.slice(0,-1);
  const priorHod=priorRows.length?Math.max(...priorRows.map(x=>x.high)):null;
  const recentHigh=priorRows.length?Math.max(...priorRows.slice(-12).map(x=>x.high)):null;
  const last5DollarVolume=rows.slice(-5).reduce((z,x)=>z+x.close*x.volume,0);
 return {minute:b._time.min,day:b._time.day,barTime:b.datetime,price:b.close,openingBars:open.length,
  openingReturnPct:round(retOpen),openingDollarVolume:round(dollarOpen,2),openingVolRatio:open.length>=10?round(2*mean(open.slice(-5).map(x=>x.volume))/Math.max(1,mean(open.slice(0,10).map(x=>x.volume)))):null,
  volumeRatio:vol.length>=4?round(b.volume/Math.max(1,median(vol))):null,
  momentum3Pct:round(mom3),momentum5Pct:round(mom5),
   benchmarkMovePct:round(benchmarkMove),benchmarkOpeningMovePct:round(benchmarkOpeningMove),
   openingRelativeStrengthPct:round(retOpen!=null&&benchmarkOpeningMove!=null?retOpen-benchmarkOpeningMove:null),
   // Legacy relativeStrengthPct now has consistent opening-vs-opening semantics.
   relativeStrengthPct:round(retOpen!=null&&benchmarkOpeningMove!=null?retOpen-benchmarkOpeningMove:null),
   sessionReturnPct:round(sessionReturnPct),sessionRelativeStrengthPct:round(sessionReturnPct!=null&&benchmarkMatchedMove!=null?sessionReturnPct-benchmarkMatchedMove:null),
   benchmarkMatchedMovePct:round(benchmarkMatchedMove),firstObservedMinute:rows[0]._time.min,
   benchmarkLagMinutes:benchmarkBar?b._time.min-benchmarkBar._time.min:null,
   last5DollarVolume:round(last5DollarVolume,2),priorHod:round(priorHod),recentHigh:round(recentHigh),
  atr:round(atr),atrPct:round(atr!=null?atr/b.close*100:null),vwap:round(vwap),ema9:round(fast),ema21:round(slow),rsi14:round(rsi),macdProxy:round(fast-slow),hod:round(hi),hodGapPct:round(pchange(hi,b.close)),
  closePosition:round(b.high>b.low?(b.close-b.low)/(b.high-b.low):.5),barRangePct:round(signalSpread),green:b.close>b.open,
  priorClose:rows.at(-2)?.close??null,priorLow:rows.at(-2)?.low??null,low3:Math.min(...rows.slice(-3).map(x=>x.low)),high:b.high,low:b.low,volume:b.volume,barCount:rows.length,
  regimeFromBenchmark:benchmarkMove==null?'UNKNOWN':benchmarkMove>.25?'UP':benchmarkMove<-.25?'DOWN':'SIDEWAYS',quoteSource:'SEPARATE_LEVEL1'};
}
export function adaptiveAiPolicy(featureRows=[],historicalClosed=[],minute=585,observedQuotes=[]){
 // Quantiles & volatility of THIS as-of batch, then shrinkage toward neutral
 // baseline. Everything below is recalculated every cycle and logged in full.
 const f=featureRows.filter(Boolean),atr=median(f.map(x=>x.atrPct)),volume=median(f.map(x=>x.openingDollarVolume)),mom=median(f.map(x=>x.momentum5Pct)),rs=median(f.map(x=>x.relativeStrengthPct));
 const market=median(f.map(x=>x.benchmarkMovePct));
 const liveSpread=median((observedQuotes||[]).map(q=>Number(q?.spreadBps)).filter(x=>Number.isFinite(x)&&x>=0));
 const volatility=clamp((atr??.25)/.35,.55,2.5),liquidity=clamp(Math.log10(Math.max(10000,volume??300000))/6,.7,1.35),regime=market==null?'UNKNOWN':market>.25?'UP':market<-.25?'DOWN':'SIDEWAYS';
 const completed=historicalClosed.filter(x=>Number.isFinite(x.netUsd)&&['TARGET','STOP','EXPIRED'].includes(x.outcome));
 const early=completed.filter(x=>x.setupType==='EARLY'),late=completed.filter(x=>x.setupType!=='EARLY');
  const continuation=completed.filter(x=>x.setupType==='BREAKOUT_CONTINUATION');
  const vwapReclaim=completed.filter(x=>x.setupType==='VWAP_RECLAIM');
  const reversal=completed.filter(x=>x.setupType==='RANGE_REVERSAL');
 // No learning from same day's still-open trades; outcome adjustment requires >=30.
 const rate=x=>(x.filter(t=>t.netUsd>0).length+5)/(x.length+10);
 const e=edge=>(edge.length>=30?clamp((rate(edge)-.5)*.45,-.12,.12):0);
 const edgeEarly=e(early),edgeLate=e(late);
  // Learning uses only *prior* closed paper outcomes, with a 30-trade gate.
  const edgeBreakout=e(continuation),edgeVwap=e(vwapReclaim),edgeReversal=e(reversal);
 const m=clamp(1+(market??0)*.16,.75,1.28),q=clamp(1+((mom??0)-.18)*.12,.88,1.17);
 const v=volatility;
 const params={
  openReturnMinPct:round(clamp(.40/v*(regime==='DOWN'?1.14:1),.16,1.05)),
   // Late-session setups use current session context, not a fixed 15-minute opening gate.
   sessionReturnMinPct:round(clamp(.12/v + (regime==='DOWN'?.12:regime==='UP'?-.06:0),.03,.42)),
   sessionRelativeStrengthMinPct:round(clamp(.10-(market??0)*.10,-.10,.32)),
   breakoutVolumeMin:round(clamp((1.45-edgeBreakout)*liquidity/v,1.10,2.30)),
   vwapReclaimVolumeMin:round(clamp((1.10-edgeVwap)*liquidity/v,.85,1.80)),
   rangeReversalVolumeMin:round(clamp((.95-edgeReversal)*liquidity/v,.8,1.65)),
   reversalMaxRsi:round(clamp(43+(v-1)*4+edgeReversal*20,34,52)),
  openReturnMaxPct:round(clamp(6.5*v,2.5,10)),
  openVolumeRatioMin:round(clamp(.5/liquidity,.32,1.15)),
  openDollarVolumeMin:round(clamp(420000*liquidity*(.85+.15*v),170000,900000),2),
  relativeStrengthMinPct:round(clamp(.10-(market??0)*.14,-.2,.42)),
  momentumMinPct:round(clamp(.18/v*q,.05,.6)),
  retestVolumeMin:round(clamp(.74*liquidity/q,.4,1.55)),
  earlyVolumeMin:round(clamp(1.2*liquidity/q,.7,2.6)),
  earlyMomentumMinPct:round(clamp(.23/v*(1-edgeEarly),.10,.68)),
  earlyMinMinute:Math.round(clamp(577+(v>1.5?2:0),574,583)),
  earlyMaxMinute:Math.round(clamp(604+(m-1)*15,589,626)),
  normalMinMinute:Math.round(clamp(624+(v>1.5?5:0),600,665)),
  // Permit new PAPER setups until 15:00 ET. Risk gates never disappear.
   // The proposed *production* 15:00 stop requires separate approval and is NOT changed here.
   normalMaxMinute:900,
  pendingBars:Math.round(clamp(3*v,2,7)),
  maxRetestDistanceAtr:round(clamp(.32*v,.15,.75)),
  minClosePosition:round(clamp(.63+(regime==='DOWN'?.07:0)-edgeLate*.15,.51,.84)),
  maxChasePct:round(clamp(.30*v,.12,.60)),
  maxSpreadBps:round(clamp((liveSpread==null?9:Math.min(14,liveSpread*1.45+2))*liquidity/v,4,19)),
  quoteAgeSec:round(clamp(7*liquidity/v,3,9)),
  maxBarRangePct:round(clamp(.85*v,.45,1.9)),
  minHodRoomR:round(clamp(1.2/v*(1-edgeLate),.7,1.8)),
  minRewardR:round(clamp(1.0*(1-edgeLate),.75,1.35)),
  minRiskPct:round(clamp(.32*v,.20,.55)),
  maxRiskPct:round(clamp(1.1*v,.7,1.85)),
  atrStopMultiple:round(clamp(1.75*v,.8,3.2)),
  atrTargetMultiple:round(clamp(3.5*m*(1+edgeLate),2,5.5)),
  earlyTargetMultiple:round(clamp(2.5*m*(1+edgeEarly),1.5,4.5)),
  hodTargetCapture:round(clamp(.84+(market??0)*.08,.66,.98)),
  cashRiskPct:round(clamp(.0075/(v**.5),.0035,.009)),
  maxPositionCapitalUsd:1000,
  roundTripCostUsd:2,
 };
 return {atMinute:minute,regime,inputs:{observedSymbols:f.length,medianAtrPct:round(atr),medianOpeningDollarVolume:round(volume,2),medianMomentum5Pct:round(mom),medianRelativeStrengthPct:round(rs),marketMovePct:round(market),observedMarketSpreadBps:round(liveSpread),completedHistorical:completed.length,earlyHistorical:early.length,retestHistorical:late.length,earlyOutcomeWeight:round(edgeEarly),retestOutcomeWeight:round(edgeLate),
   breakoutOutcomeWeight:round(edgeBreakout),vwapOutcomeWeight:round(edgeVwap),reversalOutcomeWeight:round(edgeReversal)},params,
  dynamicStatus:'RECOMPUTED_FROM_ASOF_CONTEXT',statisticalCalibration:completed.length>=60?'RESEARCH_SAMPLE_ONLY':'UNCALIBRATED',
  safetyInvariants:['APPROVED_SHARIA','REAL_FRESH_BID_ASK','NO_FUTURE_BARS','CASH_LONG_ONLY','POSITIVE_NET_PROFIT','NO_AUTO_BROKER_ORDERS']};
}
function quoteGates(q,now,p){const bid=Number(q?.bid),ask=Number(q?.ask),bids=Number(q?.bidSize),asks=Number(q?.askSize);const ts=Date.parse(q?.timestamp||''),age=Number.isFinite(ts)?(now.getTime()-ts)/1000:null,spread=bid>0&&ask>=bid?1e4*(ask-bid)/((bid+ask)/2):null;
 const checks=[g('authentic_alpaca_quote',String(q?.source||'').startsWith('Alpaca')?1:0,'==',1,'MISSING_AUTHENTIC_QUOTE'),g('valid_level1_sizes',bid>0&&ask>=bid&&bids>0&&asks>0?1:0,'==',1,'INVALID_LEVEL1'),g('quote_age_min',age,'>=',0,'FUTURE_QUOTE'),g('quote_age_max',age,'<=',p.quoteAgeSec,'QUOTE_STALE'),g('spread_bps',spread,'<=',p.maxSpreadBps,'SPREAD_TOO_WIDE')];
 return {bid,ask,bidSize:bids,askSize:asks,age:round(age),spreadBps:round(spread),checks,source:q?.source||null,timestamp:q?.timestamp||null};}
export function evaluateIndependentAi(symbol,candles,spy,quote,{now=new Date(),prior=null,policy=null,approved=false,allowHistorical=false}={}){
 const rows=completedSessionRows(candles,now,{allowHistorical});const bench=completedSessionRows(spy,now,{allowHistorical});const f=featureSet(rows,bench);
 const dynamic=policy||adaptiveAiPolicy(f?[f]:[],[],f?.minute??585);const p=dynamic.params;
 if(!f)return {symbol,state:'REGULAR',reason:'NO_COMPLETED_CANDLES',features:null,checks:[],policy:dynamic,quote:null};
 const nowNY=newYorkParts(now),barAgeMinutes=nowNY.dateKey===f.day?nowNY.minuteOfDay-f.minute:null;
 const researchPatterns=detectResearchPatterns37({symbol,features:f,rows,policy:dynamic,approved,
    verifiedSource:barAgeMinutes>=1&&barAgeMinutes<=2&&f.benchmarkLagMinutes>=0&&f.benchmarkLagMinutes<=2});
 const opening=[g('completed_bar_age_min',barAgeMinutes,'>=',1,'FUTURE_OR_INCOMPLETE_BAR'),
   g('completed_bar_age_max',barAgeMinutes,'<=',2,'STALE_CANDLE'),
   g('benchmark_lag_minutes',f.benchmarkLagMinutes,'<=',2,'STALE_BENCHMARK'),
   g('approved_sharia',approved?1:0,'==',1,'UNAPPROVED_SHARIA'),g('opening_bars',f.openingBars,'>=',10,'OPENING_DATA_INCOMPLETE'),g('opening_return_low',f.openingReturnPct,'>=',p.openReturnMinPct,'OPEN_RETURN_LOW'),g('opening_return_high',f.openingReturnPct,'<=',p.openReturnMaxPct,'OPEN_RETURN_TOO_HIGH'),g('opening_volume_ratio',f.openingVolRatio,'>=',p.openVolumeRatioMin,'OPEN_VOLUME_RATIO_LOW'),g('opening_dollar_volume',f.openingDollarVolume,'>=',p.openDollarVolumeMin,'OPEN_LIQUIDITY_LOW'),g('relative_strength',f.relativeStrengthPct,'>=',p.relativeStrengthMinPct,'RELATIVE_STRENGTH_LOW'),g('momentum_5m',f.momentum5Pct,'>=',p.momentumMinPct,'MOMENTUM_WEAK')];
 const openingPass=opening.every(x=>x.passed);const candidateChecks=[],executionChecks=[];
  const bar=rows.at(-1),priorBar=rows.at(-2),range=f.barRangePct;
  const late=f.minute>=p.normalMinMinute&&f.minute<=p.normalMaxMinute;
  const early=f.minute>=p.earlyMinMinute&&f.minute<=p.earlyMaxMinute;
  const sessionChecks=[g('completed_bar_age_min',barAgeMinutes,'>=',1,'FUTURE_OR_INCOMPLETE_BAR'),
    g('completed_bar_age_max',barAgeMinutes,'<=',2,'STALE_CANDLE'),
    g('benchmark_lag_minutes',f.benchmarkLagMinutes,'<=',2,'STALE_BENCHMARK'),
    g('approved_sharia',approved?1:0,'==',1,'UNAPPROVED_SHARIA'),
    g('minimum_completed_bars',f.barCount,'>=',15,'INSUFFICIENT_SESSION_BARS'),
    g('session_return',f.sessionReturnPct,'>=',p.sessionReturnMinPct,'SESSION_RETURN_LOW'),
    g('matched_session_relative_strength',f.sessionRelativeStrengthPct,'>=',p.sessionRelativeStrengthMinPct,'SESSION_RELATIVE_STRENGTH_LOW'),
    g('session_momentum',f.momentum5Pct,'>=',p.momentumMinPct,'SESSION_MOMENTUM_LOW'),
    g('opening_liquidity',f.openingDollarVolume,'>=',p.openDollarVolumeMin,'OPEN_LIQUIDITY_LOW'),
    g('session_liquidity',f.last5DollarVolume,'>=',p.openDollarVolumeMin*.4,'SESSION_LIQUIDITY_LOW')];
  const sessionPass=sessionChecks.every(x=>x.passed);
  const supports=[['VWAP',f.vwap],['EMA9',f.ema9],['EMA21',f.ema21],['OPENING_HIGH',Math.max(...rows.filter(x=>x._time.min<=584).map(x=>x.high),0)]];
  const retest=f.atr>0?supports.filter(([,s])=>s>0&&bar.low<=s+f.atr*p.maxRetestDistanceAtr&&bar.close>s&&bar.close>bar.open&&bar.close>(priorBar?.close??0))
   .map(([model,support])=>({model,support,distanceAtr:Math.abs(bar.low-support)/f.atr})).sort((a,b)=>a.distanceAtr-b.distanceAtr)[0]||null:null;
  const earlySetup=early&&openingPass&&f.momentum3Pct!=null&&f.momentum3Pct>=p.earlyMomentumMinPct&&f.price>f.vwap&&f.price>f.ema9&&f.ema9>f.ema21;
  const retraceSetup=late&&(openingPass||sessionPass)&&!!retest;
  const breakoutSetup=late&&sessionPass&&f.priorHod>0&&bar.close>f.priorHod&&
    f.volumeRatio>=p.breakoutVolumeMin&&f.closePosition>=p.minClosePosition&&bar.close>bar.open;
  const vwapSetup=late&&sessionPass&&priorBar&&priorBar.close<=f.vwap&&bar.close>f.vwap&&
    bar.close>f.ema9&&f.volumeRatio>=p.vwapReclaimVolumeMin;
  // A range reversal needs confirmed recovery; never enter solely because RSI is low.
  const reversalSetup=late&&sessionPass&&dynamic.regime!=='UP'&&f.rsi14<=p.reversalMaxRsi&&
    priorBar&&priorBar.close<=f.ema9&&bar.close>f.ema9&&bar.close>bar.open&&
    f.volumeRatio>=p.rangeReversalVolumeMin&&f.closePosition>=p.minClosePosition;
  const eligibleSetups=[
    {type:'BREAKOUT_CONTINUATION',valid:breakoutSetup,model:'PRIOR_HOD_BREAKOUT'},
    {type:'RETEST',valid:retraceSetup,model:retest?.model||null},
    {type:'VWAP_RECLAIM',valid:vwapSetup,model:'VWAP_RECOVERY'},
    {type:'RANGE_REVERSAL',valid:reversalSetup,model:'EMA9_RECOVERY'},
    {type:'EARLY',valid:earlySetup,model:'EARLY_MOMENTUM'}
  ];
  // Adaptive selection AMONG already trade-eligible paper setups only.
  // Research-only catalog detections must never enter this list.
  // Every candidate is ranked using as-of context, not hindsight or uncalibrated PnL.
  const strategyContextScore=x=>{
   const momentum=Math.max(-1,Math.min(1,f.momentum5Pct??0));
   const volume=Math.max(0,Math.min(3,f.volumeRatio??0));
   const bases={BREAKOUT_CONTINUATION:14,RETEST:8,VWAP_RECLAIM:8,RANGE_REVERSAL:8,EARLY:10};
   const marketFit=x.type==='BREAKOUT_CONTINUATION'?(dynamic.regime==='UP'?6:dynamic.regime==='DOWN'?-3:2):
    x.type==='RETEST'?(dynamic.regime==='UP'?3:dynamic.regime==='DOWN'?0:5):
    x.type==='VWAP_RECLAIM'?(dynamic.regime==='DOWN'?6:3):
    x.type==='RANGE_REVERSAL'?(dynamic.regime==='DOWN'?7:dynamic.regime==='UP'?-3:5):3;
   return Math.round((bases[x.type]||0)+marketFit+4*momentum+2*volume);
  };
  const strategyRanking=eligibleSetups.filter(x=>x.valid).map(x=>({...x,contextScore:strategyContextScore(x)}))
    .sort((a,b)=>b.contextScore-a.contextScore||a.type.localeCompare(b.type));
  const selected=strategyRanking[0]||null,type=selected?.type||null;
  const tradeWindow=early||late;
  candidateChecks.push(g('trading_time',tradeWindow?1:0,'==',1,'OUTSIDE_ADAPTIVE_WINDOW'),
    g('green_bar',f.green?1:0,'==',1,'RED_BAR'),
    g('close_position',f.closePosition,'>=',p.minClosePosition,'WEAK_CLOSE'),
    g('bar_range_pct',range,'<=',p.maxBarRangePct,'BAR_TOO_WIDE'),
    g('volume_signal',f.volumeRatio,'>=',type==='EARLY'?p.earlyVolumeMin:p.retestVolumeMin,'VOLUME_WEAK'),
    g('strategy_signal',type?1:0,'==',1,'NO_SUPPORTED_SETUP'));
  const originEligible=type==='EARLY'?openingPass:(openingPass||sessionPass);
  const entryEligible=originEligible&&candidateChecks.every(x=>x.passed);
  const q=quoteGates(quote,now,p);
  const previous=prior?.pending||null;
  const validPending=previous&&previous.day===f.day&&f.minute>previous.signalMinute&&f.minute<=previous.validUntil;
  let pending=validPending?previous:null;
  if(!pending&&entryEligible){pending={day:f.day,signalMinute:f.minute,signalBarTime:f.barTime,
    validUntil:f.minute+p.pendingBars,trigger:round(f.high+.025*f.atr),low3:f.low3,atr:f.atr,
    hod:f.hod,type,model:selected.model,setupPrice:f.price,policyAtSignal:dynamic,
    originGate:type==='EARLY'?'OPENING':'ADAPTIVE_SESSION',originChecks:type==='EARLY'?opening:sessionChecks,
    candidateChecks:[...candidateChecks],signalFeatures:f};}
  const positionOpen=prior?.position?.status==='OPEN';
  // WATCH only when there is a genuine setup or a pending trigger. This bounds
  // the active every-minute watch list and protects Netlify/Alpaca usage.
  let state=entryEligible||pending?'SMART':'REGULAR';
  let reason=(early?anyFail(opening):anyFail(sessionChecks))||anyFail(candidateChecks)||'WAIT_BREAKOUT';
  let position=prior?.position??null;
  let tradeEvaluation=null;
  if(positionOpen){state='AI_PAPER_CONFIRMED';reason='PAPER_TRADE_ACTIVE';}
  else if(pending&&f.minute>pending.signalMinute){
   const ask=q.ask,bid=q.bid;
   // Use policy frozen at signal creation for the setup's economic/risk checks.
   const pp=pending.policyAtSignal?.params||p;
   const stop=Number.isFinite(ask)?Math.min(pending.low3*.9985,ask*(1-Math.max(pp.minRiskPct,pending.atr*pp.atrStopMultiple/ask*100)/100)):null;
   const risk=ask>stop?ask-stop:null;
   const riskPct=risk?100*risk/ask:null;
   const targetAtr=ask+(pending.type==='EARLY'?pp.earlyTargetMultiple:pp.atrTargetMultiple)*pending.atr;
   const hodRoom=Math.max(0,Math.max(f.hod,pending.hod)-ask);
   // HOD-capped targets are incompatible with a legitimate fresh high breakout.
   // Breakouts use an ATR target but remain subject to reward, fees, spread and chase gates.
   const breakout=pending.type==='BREAKOUT_CONTINUATION';
   const targetHod=ask+pp.hodTargetCapture*hodRoom;
   const target=breakout?targetAtr:Math.min(targetAtr,targetHod);
   const reward=risk?(target-ask)/risk:null;
   const shares=risk?Math.min((pp.maxPositionCapitalUsd-pp.roundTripCostUsd/2)/ask,Math.max(0,pp.maxPositionCapitalUsd*pp.cashRiskPct-pp.roundTripCostUsd)/risk):null;
   const netProfit=Number.isFinite(shares)?shares*(target-ask)-pp.roundTripCostUsd:null;
   executionChecks.push(g('approved_sharia_still_valid',approved?1:0,'==',1,'UNAPPROVED_SHARIA'),
     g('setup_origin_still_valid',pending.originGate==='OPENING'?(openingPass?1:0):(sessionPass?1:0),'==',1,'SETUP_ELIGIBILITY_CHANGED'),
     ...q.checks,g('later_bar_after_signal',f.minute,'>',pending.signalMinute,'SIGNAL_BAR_NOT_CLOSED'),
     g('entry_within_session_window',f.minute,'<=',pp.normalMaxMinute,'AFTER_LAST_ENTRY_WINDOW'),
     g('breakout_at_ask',ask,'>=',pending.trigger,'WAIT_TRIGGER'),
     g('chase_pct',pchange(ask,pending.setupPrice),'<=',pp.maxChasePct,'CHASE_TOO_HIGH'),
     g('stop_risk_min_pct',riskPct,'>=',pp.minRiskPct,'STOP_TOO_CLOSE'),
     g('stop_risk_max_pct',riskPct,'<=',pp.maxRiskPct,'STOP_TOO_FAR'),
     ...(breakout?[]:[g('room_to_hod_in_r',risk?hodRoom/risk:null,'>=',pp.minHodRoomR,'HOD_NO_ROOM')]),
     g('reward_r',reward,'>=',pp.minRewardR,'REWARD_R_LOW'),
     g('net_profit_after_fees',netProfit,'>',0,'NO_NET_PROFIT'));
   tradeEvaluation={ask,bid,stop,risk,riskPct,target,reward,shares,netProfit,hodRoom,breakout,
     signalPolicy:pp,quoteAgeSec:q.age,spreadBps:q.spreadBps};
   reason=anyFail(executionChecks)||'WAIT_BREAKOUT';
   if(!anyFail(executionChecks)){
    state='AI_PAPER_CONFIRMED';reason='AI_INDEPENDENT_ENTRY';
    const signalId=`${f.day}:${symbol}:${pending.signalMinute}:${pending.type}`;
    position={id:signalId,symbol,day:f.day,status:'OPEN',openedAt:now.toISOString(),signalMinute:pending.signalMinute,
      signalBarTime:pending.signalBarTime,setupType:pending.type,model:pending.model,entry:round(ask),entryAsk:round(ask),
      stop:round(stop),target:round(target),qty:round(shares,6),feesUsd:pp.roundTripCostUsd,
      openedBarTime:f.barTime,lastEvaluatedBarTime:f.barTime,mfePct:0,maePct:0,
      dynamicPolicyAtEntry:pending.policyAtSignal,shadow:{ATR2:round(ask+2*pending.atr),ATR4:round(ask+4*pending.atr),
      R1:round(ask+risk),R2:round(ask+2*risk),HOD:round(Math.max(f.hod,pending.hod))},shadowHits:{},
      quote:{...q},outcome:null,entryEvidence:{signal:pending,checks:executionChecks,
        marketFeatures:f,tradeEvaluation,completedBarTime:f.barTime,quoteTimestamp:quote?.timestamp||null,
        provider:quote?.source||null,costModel:'MODELED_PAPER_NO_BROKER_FILL'},
      timeline:[{type:'PAPER_ENTRY_CONFIRMED',at:now.toISOString(),signalId,barTime:f.barTime,
        quote:{...q},checks:executionChecks,tradeEvaluation}],exitEvidence:null};
    pending=null;
   }
  }
 return {symbol,at:now.toISOString(),state,reason,setupType:type??pending?.type??prior?.position?.setupType??null,features:f,checks:{opening,session:sessionChecks,candidate:candidateChecks,execution:executionChecks},
   setupDiscovery:eligibleSetups.map(x=>({type:x.type,eligible:x.valid,model:x.model})),
   paperStrategyRanking:strategyRanking.map(x=>({type:x.type,contextScore:x.contextScore,tradeApprovedLocally:true})),
   researchPatterns,
   tradeEvaluation,quote:q,policy:dynamic,pending,position,
  confidence:{profitPotentialScore:round(clamp((f.momentum3Pct??0)*17+(f.volumeRatio??0)*14+(f.closePosition??0)*18+(f.relativeStrengthPct??0)*10+(f.hodGapPct??0)*4,0,100),1),profitProbability:null,calibration:'UNCALIBRATED'},
  decisionTrace:{openingPassed:openingPass,sessionPassed:sessionPass,candidateFound:!!type,barAgeMinutes,
     selectedType:type,eligibleForPending:entryEligible,retainedPending:!!validPending,
     expiredPending:!!previous&&!validPending,usedOnlyCompletedBars:true,allFailedChecks:
     [...opening,...sessionChecks,...candidateChecks,...executionChecks].filter(x=>!x.passed).map(x=>({gate:x.gate,reason:x.reason,observed:x.observed,threshold:x.threshold}))}};
}
export function updateAiPaperOutcome(record,rawBars,now,{forceClose=false}={}){
 if(!record?.position)return record;
 const pos={...record.position,shadowHits:{...record.position.shadowHits}};
 const ordered=[...(rawBars||[])].sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
 for(const b of ordered){if(!b.datetime||b.datetime<=pos.lastEvaluatedBarTime||b.datetime<=pos.openedBarTime)continue;
  // Same minute as the entry quote is not counted; no fabricated tick ordering.
  const hitStop=b.low<=pos.stop,hitTarget=b.high>=pos.target;
  const wasOpen=pos.status==='OPEN';
  if(wasOpen){pos.mfePct=round(Math.max(pos.mfePct??0,pchange(b.high,pos.entry)??0));pos.maePct=round(Math.min(pos.maePct??0,pchange(b.low,pos.entry)??0));
   if(hitStop&&hitTarget){pos.status='CLOSED';pos.outcome='AMBIGUOUS_SAME_BAR';pos.netUsd=null;pos.closedAt=b.datetime;}
   else if(hitStop){pos.status='CLOSED';pos.outcome='STOP';pos.exit=pos.stop;pos.netUsd=round(pos.qty*(pos.stop-pos.entry)-pos.feesUsd,3);pos.closedAt=b.datetime;}
   else if(hitTarget){pos.status='CLOSED';pos.outcome='TARGET';pos.exit=pos.target;pos.netUsd=round(pos.qty*(pos.target-pos.entry)-pos.feesUsd,3);pos.closedAt=b.datetime;}
  }
  for(const [name,target] of Object.entries(pos.shadow||{})){
   if(b.high>=target&&!pos.shadowHits[name])pos.shadowHits[name]={hitAt:b.datetime,scope:wasOpen?'BEFORE_OFFICIAL_EXIT':'AFTER_OFFICIAL_EXIT',uncertainWithStop:wasOpen&&hitStop};
  }
  pos.lastEvaluatedBarTime=b.datetime;
 }
 if(forceClose&&pos.status==='OPEN'){
  // A 12:00 (or earlier) print cannot be presented as a verified 15:59 exit.
  // Close the paper observation without fabricating an EOD fill or P&L.
  const latest=ordered.filter(x=>x.datetime>pos.openedBarTime).at(-1)||null;
  const ny=newYorkParts(now),barDay=latest?.datetime?.slice(0,10);
  const barMinute=latest?Number(latest.datetime.slice(11,13))*60+Number(latest.datetime.slice(14,16)):null;
  const age=barDay===ny.dateKey&&Number.isFinite(barMinute)?ny.minuteOfDay-barMinute:null;
  const timely=age!==null&&age>=1&&age<=3&&Number.isFinite(latest.close);
  pos.status='CLOSED';pos.closedAt=timely?latest.datetime:now.toISOString();
  if(timely){pos.outcome='EXPIRED';pos.exit=latest.close;pos.netUsd=round(pos.qty*(pos.exit-pos.entry)-pos.feesUsd,3);}
  else{pos.outcome='UNPRICED_AT_CLOSE';pos.netUsd=null;pos.exit=null;}
 }
  if(pos.status==='CLOSED'&&record.position?.status==='OPEN'){
    const exitBar=ordered.find(b=>b.datetime===pos.closedAt)||null;
    pos.exitEvidence={outcome:pos.outcome,exit:pos.exit??null,netUsd:pos.netUsd,feesUsd:pos.feesUsd,
      qty:pos.qty,closedAt:pos.closedAt,bar:exitBar,
      ambiguity:pos.outcome==='AMBIGUOUS_SAME_BAR',pricingMode:pos.outcome==='EXPIRED'?'CLOSE_OF_LAST_COMPLETED_BAR':
        pos.outcome==='TARGET'||pos.outcome==='STOP'?'OHLC_TOUCH_ASSUMPTION':
        pos.outcome==='AMBIGUOUS_SAME_BAR'?'NO_FILL_PRICE_PROVEN':'UNPRICED_OR_UNKNOWN',
      evidenceOnly:true,noBrokerFill:true};
    pos.timeline=[...(pos.timeline||[]),{type:'PAPER_EXIT_RECORDED',at:now.toISOString(),...pos.exitEvidence}];
  }
 return {...record,position:pos};
}
export function buildAiRecommendations({records=[],historicalClosed=[],scannerEvents=[],coverage=null,reasonCounters={},deliveryStats=null,scannerOutcomes=[]}={}){
 const closed=[...historicalClosed,...records.map(x=>x.position).filter(x=>x?.status==='CLOSED')];
 const comparable=closed.filter(x=>x.netUsd!=null);
 const byReason={...reasonCounters};if(!Object.keys(reasonCounters).length)for(const r of records)if(r.reason)byReason[r.reason]=(byReason[r.reason]||0)+1;
 const sorted=Object.entries(byReason).sort((a,b)=>b[1]-a[1]);
 const aiEntries=records.filter(x=>x.position?.id),scanner= new Set(scannerEvents.filter(x=>x.state==='CONFIRMED'||x.event==='CONFIRMED_CREATED').map(x=>`${x.symbol}:${String(x.at||x.signalAt||'').slice(0,10)}`));
 const independentOnly=aiEntries.filter(x=>!scanner.has(`${x.symbol}:${String(x.position.openedAt).slice(0,10)}`));
 const comparableScanner=scannerOutcomes.filter(x=>['T1','T2','T3','SL'].includes(x.finalOutcome));
 const scannerWin=comparableScanner.filter(x=>x.finalOutcome!=='SL').length;
 const scannerKeys=new Map(comparableScanner.map(x=>[`${x.symbol}:${String(x.confirmedAt||x.day||'').slice(0,10)}`,x]));
 const matchedTrades=comparable.filter(x=>scannerKeys.has(`${x.symbol}:${String(x.openedAt||'').slice(0,10)}`));
 const matchedDisagreements=matchedTrades.filter(x=>(x.netUsd>0)!==(scannerKeys.get(`${x.symbol}:${String(x.openedAt||'').slice(0,10)}`)?.finalOutcome!=='SL'));
 const byType={};for(const type of ['EARLY','RETEST']){const s=comparable.filter(x=>x.setupType===type),wins=s.filter(x=>x.netUsd>0);byType[type]={sample:s.length,wins:wins.length,netUsd:round(s.reduce((a,b)=>a+b.netUsd,0),2),winRate:s.length?round(wins.length/s.length*100,1):null};}
 const suggestions=[];
 if((coverage?.coveragePct??100)<95)suggestions.push({area:'DISCOVERY',priority:'HIGH',title:'راجع تغطية الكون الشرعي وتأخير التحديث',evidence:{coverage},hypothesis:'عدم اكتمال الاكتشاف يؤثر في فرص الدخول المبكر والمقارنة',experiment:'قياس التأخير وزيادة قدرة ingestion تدريجياً دون تغيير شروط التداول',changeApproved:false});
 if(sorted[0]?.[1]>=5)suggestions.push({area:'DATA_AND_GATES',priority:'RESEARCH',title:`تحليل تكرار الرفض: ${sorted[0][0]}`,evidence:{reason:sorted[0][0],count:sorted[0][1]},hypothesis:'قد يعكس المصدر أو توقيت التحديث أو شرطاً صارماً؛ لا يمكن الجزم قبل تتبع النتائج الفائتة',experiment:'قارن MFE/MAE للإشارات المرفوضة على عينة مستقبلية',changeApproved:false});
 for(const type of ['EARLY','RETEST'])if(byType[type].sample>=30)suggestions.push({area:'ENTRY_AND_EXIT',priority:'RESEARCH',title:`اختبر مسار ${type} ومقارنة Shadow`,evidence:byType[type],hypothesis:'قد تختلف فعالية توقيت الدخول والوقف والهدف باختلاف تقلب السوق',experiment:'اختبار walk-forward مستقل مع رسوم وسبريد وتقييم المفقود من الفرص',changeApproved:false});
 if(!comparable.length)suggestions.push({area:'OUTCOMES',priority:'DATA',title:'جمع نتائج ورقية مستقلة قابلة للمقارنة قبل تغيير المعايير',evidence:{closed:closed.length,comparable:comparable.length},hypothesis:'التوصيات من دون نتائج لا تبرهن تحسين الربح',experiment:'اترك المراقب الموازي يعمل مع حفظ كل الحالات والأهداف',changeApproved:false});
 if(matchedTrades.length>=10)suggestions.push({area:'AI_VS_SCANNER_OUTCOMES',priority:'RESEARCH',title:'مقارنة نتائج الماسحين على نفس السهم والجلسة',evidence:{matched:matchedTrades.length,disagree:matchedDisagreements.length},hypothesis:'اختلاف شروط الدخول والخروج قد يؤثر في الربحية، وليس بالضرورة جودة الاكتشاف وحدها',experiment:'وحّد افتراضات التكلفة والتوقيت وتحقق من Bid/Ask وحالات الشمعة الملتبسة قبل أي اعتماد',changeApproved:false});
 if(coverage?.lastFeedErrors?.length)suggestions.push({area:'INFRASTRUCTURE_AND_RUNTIME',priority:'HIGH',title:'متابعة أخطاء مزود البيانات ووقت الاستجابة',evidence:{errors:coverage.lastFeedErrors.slice(0,10),scanned:coverage.everScanned,eligible:coverage.eligible},hypothesis:'قد تتسبب فجوات البيانات أو حدود الاستضافة في فوات إشارات مهما كانت شروط الاستراتيجية جيدة',experiment:'قياس معدل الفشل وزمن كل دورة ومقارنة مواقيت آخر شمعة وآخر Bid/Ask',changeApproved:false});
 if(deliveryStats?.confirmedCount>0&&deliveryStats?.pushAcceptedCount<deliveryStats.confirmedCount)suggestions.push({area:'NOTIFICATIONS_AND_DELIVERY',priority:'RESEARCH',title:'مراجعة مسار تنبيهات CONFIRMED والفرق بين الإرسال والاستلام',evidence:deliveryStats,hypothesis:'تأخر أو فقد التنبيه قد يقلل الفرص القابلة للتنفيذ حتى لو كان الماسح يكتشفها',experiment:'قارن confirmedAt وpushSentAt والقبول لدى مزود Push واستلام الجوال؛ لا تفترض وصول الإشعار من قبول المزود',changeApproved:false});
 if(closed.some(x=>x.shadowHits&&Object.keys(x.shadowHits).length))suggestions.push({area:'TARGETS_AND_POST_EXIT',priority:'RESEARCH',title:'قارن بلوغ أهداف Shadow قبل وبعد الإغلاق',evidence:{tradesWithShadow:closed.filter(x=>Object.keys(x.shadowHits||{}).length>0).length,totalClosed:closed.length},hypothesis:'قد يكشف توقيت الخروج عن فرص تحسين صافي الربح أو زيادة التذبذب غير المرغوب',experiment:'قارن MFE/MAE والتوقيت ونتائج after-exit بعد خصم تكاليف التنفيذ على جلسات جديدة',changeApproved:false});
 if(independentOnly.length)suggestions.push({area:'COMPETITIVE_COMPARISON',priority:'RESEARCH',title:'تقييم فرص AI التي لم يؤكدها الماسح الأساسي',evidence:{independentOnly:independentOnly.length,examples:independentOnly.slice(0,10).map(x=>x.symbol)},hypothesis:'قد يكشف عن فرص دخول مبكر أو عن زيادة مخاطرة غير مبررة',experiment:'قارن صافي العائد ومعدل الوقف والسبريد بين الماسحين في نفس الجلسات',changeApproved:false});
 return {generatedAt:new Date().toISOString(),type:'ADAPTIVE_STATISTICAL_AI_AGENT',isLLM:false,productionScannerUnchanged:true,calibration:'UNCALIBRATED',
  comparison:{aiTrades:aiEntries.length,scannerComparableEvents:scanner.size,aiOnly:independentOnly.length,matchedClosed:matchedTrades.length,oppositeOutcomeProxy:matchedDisagreements.length,scannerComparableClosed:comparableScanner.length,scannerPositiveOutcomeProxy:scannerWin,aiComparableClosed:comparable.length,aiPositiveNetProxy:comparable.filter(x=>x.netUsd>0).length,comparisonBasis:'SAME_SYMBOL_SAME_DAY; DIFFERENT TARGETS/ENTRY; NOT PNL PARITY'},outcomes:{comparable:comparable.length,byType},topBlockers:sorted.slice(0,15).map(([reason,count])=>({reason,count})),suggestions};
}
export {featureSet};
