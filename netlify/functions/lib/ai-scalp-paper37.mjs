/** Dynamic Trading 3.7: independent SMART SCALP PAPER simulator (not a broker).
 * Data: completed New York 1m candles and actual, fresh Alpaca L1 quote for ENTRY.
 * Closed-bar extrema are NOT actual executable bid/ask fills. Exits are conservative
 * projections with extra adverse slippage and explicit trading costs.
 * No network I/O, account permissions, learning-policy writes, or brokerage orders.
 */
import {completedSessionRows} from './research36.mjs';
const round=(x,d=5)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const nyDay=b=>String(b?.datetime||'').slice(0,10);
const unique=(xs)=>[...new Set(xs)];
export const SCALP37_VERSION='3.7-SCALP-PAPER-1';
export const SCALP37_DEFAULTS=Object.freeze({
  entryMinMinute:590,entryMaxMinute:935,maxHoldBars:9,maxOpen:2,maxTradesDay:8,
  maxCapitalPerTrade:1000,maxRiskPerTradeUsd:9,maxDailyLossUsd:25,
  roundTripFeesUsd:2,exitSlippageBps:5,minNetProfitUsd:0.75,
  quoteMaxAgeSec:5,maxSpreadBps:8,maxQuoteDeviationPct:0.45,
  signalTtlMinutes:2,cooldownBars:5,
});
function check(name,passed,observed=null,limit=null){return {gate:name,passed:passed===true,observed,limit};}
const failed=checks=>checks.find(c=>!c.passed)?.gate||null;
function nyIsoDay(now){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function scalpPolicy37(market={},baseline={}){
 const regime=String(market?.regime||'UNKNOWN'),vol=regime.includes('HIGH_VOL'),thin=regime.includes('THIN_LIQUIDITY');
 const spread=clamp(vol?5:thin?4:7,4,SCALP37_DEFAULTS.maxSpreadBps);
 return {...SCALP37_DEFAULTS,regime,regimeConfidence:finite(market?.confidence)?market.confidence:0,
  maxSpreadBps:spread,minVolumeRatio:vol?1.7:1.25,
  minMomentum3Pct:vol?.22:.12,stopAtrMultiple:vol?1.15:.9,
  targetAtrMultiple:vol?3.0:2.7,
  baselinePolicyVersion:baseline?.dynamicStatus||'UNKNOWN',
  tradingMode:'INDEPENDENT_PAPER_ONLY',canSendOrders:false};
}
export function scalpFreshQuote37(quote,now,policy){
 const bid=quote?.bid,ask=quote?.ask,bs=quote?.bidSize,as=quote?.askSize;
 const timestamp=Date.parse(quote?.timestamp||'');
 const age=Number.isFinite(timestamp)?(now.getTime()-timestamp)/1000:null;
 const spread=finite(bid)&&finite(ask)&&bid>0&&ask>=bid?1e4*(ask-bid)/((bid+ask)/2):null;
 const checks=[
  check('SCALP_AUTHENTIC_ALPACA_L1',quote?.source==='Alpaca IEX latest quote',quote?.source||null),
  check('SCALP_VALID_BID_ASK_SIZES',finite(bid)&&finite(ask)&&bid>0&&ask>=bid&&finite(bs)&&bs>0&&finite(as)&&as>0),
  check('SCALP_QUOTE_NOT_FUTURE',age!==null&&age>=0,age),
  check('SCALP_QUOTE_FRESH',age!==null&&age<=policy.quoteMaxAgeSec,age,policy.quoteMaxAgeSec),
  check('SCALP_SPREAD_LIMIT',spread!==null&&spread<=policy.maxSpreadBps,round(spread),policy.maxSpreadBps),
 ];
 return {bid:finite(bid)?bid:null,ask:finite(ask)?ask:null,bidSize:finite(bs)?bs:null,askSize:finite(as)?as:null,ageSec:round(age),spreadBps:round(spread),source:quote?.source||null,
  timestamp:quote?.timestamp||null,checks,passed:!failed(checks)};
}
/** Explicitly limited, deterministic setup detectors. Discovery is not a trained model. */
export function detectScalpSetup37(features,market,policy){
 if(!features)return {type:null,reason:'NO_COMPLETED_FEATURES',checks:[]};
 const reg=String(market?.regime||'UNKNOWN');
 const common=[
  check('SCALP_MARKET_CLASSIFIED',reg!=='UNKNOWN'&&Number(market?.confidence)>=.2,reg),
  check('SCALP_NOT_DOWNTREND',!reg.startsWith('TREND_DOWN'),reg),
  check('SCALP_MARKET_NOT_THIN',!reg.includes('THIN_LIQUIDITY'),reg),
  check('SCALP_AT_LEAST_20_COMPLETED_BARS',features.barCount>=20,features.barCount,20),
  check('SCALP_PRICE_AND_ATR_VALID',finite(features.price)&&features.price>0&&finite(features.atr)&&features.atr>0),
  check('SCALP_SIGNAL_TIME',features.minute>=policy.entryMinMinute&&features.minute<=policy.entryMaxMinute,features.minute),
  check('SCALP_LIQUIDITY',finite(features.openingDollarVolume)&&features.openingDollarVolume>=500000,features.openingDollarVolume,500000),
  check('SCALP_VOLUME',finite(features.volumeRatio)&&features.volumeRatio>=policy.minVolumeRatio,features.volumeRatio,policy.minVolumeRatio),
  check('SCALP_CLOSE_QUALITY',features.green===true&&features.closePosition>=.7,features.closePosition,.7),
  check('SCALP_UPWARD_MOMENTUM',finite(features.momentum3Pct)&&features.momentum3Pct>=policy.minMomentum3Pct,features.momentum3Pct,policy.minMomentum3Pct),
  check('SCALP_ABOVE_VWAP',features.price>features.vwap),
 ];
 if(failed(common))return {type:null,reason:failed(common),checks:common};
 const momentum=features.price>features.ema9&&features.ema9>features.ema21&&features.momentum5Pct>=.15;
 const reclaim=features.priorClose<=features.vwap&&features.price>features.vwap&&features.low<=features.vwap;
 const pullback=features.priorLow<=features.ema9&&features.price>features.ema9&&features.momentum5Pct>=.12;
 const type=momentum?'MOMENTUM_SCALP':reclaim?'VWAP_RECLAIM_SCALP':pullback?'PULLBACK_SCALP':null;
 return {type,reason:type?'SCALP_DETECTED':'SCALP_NO_SUPPORTED_SETUP',checks:common,
  trigger:round(features.high+Math.max(features.atr*.04,features.price*.0001)),
  signalBarTime:features.barTime,signalMinute:features.minute,
  atr:features.atr,signalPrice:features.price};
}
function hasValidToday(state,day){return state?.day===day&&state?.schemaVersion===SCALP37_VERSION;}
function newState(day){return {schemaVersion:SCALP37_VERSION,day,records:{},closedOutcomes:[],
  tradeCount:0,completedBars:0,entryRejections:{},cycleCount:0,lastMinute:null,
  mode:'LOCAL_PAPER_NO_ORDERS',dataTrust:'ASOF_COMPLETED_1MIN_BARS_ALPACA_LEVEL1_ENTRY'};}
function markExit(position,price,bar,reason,policy,{ambiguous=false,unpriced=false}={}){
 if(unpriced)return {...position,status:'UNPRICED_AT_CLOSE',outcome:'UNPRICED_AT_CLOSE',
  closedAt:bar?.datetime||null,netUsd:null,exit:null,exitModel:'MISSING_POST_ENTRY_BAR_NOT_A_FILL'};
 const adverse=Math.max(0,policy.exitSlippageBps)/10000;
 const execution=Math.max(0,price*(1-adverse));
 const net=(position.realizedGrossUsd||0)+(position.remainingQty??position.qty)*(execution-position.entry)-position.feesUsd;
 return {...position,status:'CLOSED',closedAt:bar.datetime,exit:round(execution),netUsd:round(net,3),
  outcome:reason,ambiguousSameBar:ambiguous,exitModel:'BAR_LEVEL_LESS_ADVERSE_SLIPPAGE_NOT_LIVE_BID_FILL',
  holdBars:position.holdBars||0};
}
export function settleScalpPosition37(position,completedBars,policy,{forceClose=false,asOfMinute=null,maxCloseLagMinutes=3}={}){
 if(!position||position.status!=='OPEN')return position;
 const out={...position};
 const next=(completedBars||[]).filter(b=>b?.datetime&&b.datetime>out.lastEvaluatedBarTime&&b.datetime>out.openedBarTime)
  .sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
 for(const bar of next){
  out.holdBars=(out.holdBars||0)+1;
  const stop=bar.low<=out.stop,target=bar.high>=out.target;
  out.lastEvaluatedBarTime=bar.datetime;
  out.mfePct=round(Math.max(out.mfePct||0,100*(bar.high/out.entry-1)));
  out.maePct=round(Math.min(out.maePct||0,100*(bar.low/out.entry-1)));
  if(stop){
   // If both levels touch within a candle, the adverse outcome wins; no optimistic ordering.
   return markExit(out,Math.min(out.stop,bar.open),bar,stop&&target?'SCALP_AMBIGUOUS_STOP_FIRST':'SCALP_STOP',policy,{ambiguous:target});
  }
  if(target)return markExit(out,out.target,bar,'SCALP_TARGET',policy);
  // The partial close and protective stop adjustment occur ONLY after a full bar
  // completes, so that updated stop cannot be retroactively hit in that candle.
  if(!out.partialTaken&&out.qty>=2&&bar.high>=out.entry+(out.initialRisk||out.entry-out.initialStop)){
   const qty=Math.floor(out.qty/2),level=out.entry+(out.initialRisk||out.entry-out.initialStop);
   const modeled=level*(1-policy.exitSlippageBps/10000);
   out.realizedGrossUsd=round((out.realizedGrossUsd||0)+qty*(modeled-out.entry),6);
   out.remainingQty=out.qty-qty;out.partialTaken=true;
   out.partialExit={at:bar.datetime,qty,exit:round(modeled),model:'BAR_TOUCH_ADVERSE_SLIPPAGE_ESTIMATE'};
   out.stop=round(Math.max(out.stop,out.entry+out.entry*policy.exitSlippageBps/10000));
  }
  if(bar.close>out.entry+1.4*(out.initialRisk||out.entry-out.initialStop)){
   out.stop=round(Math.min(out.target-(out.initialRisk||out.entry-out.initialStop)*.15,
    Math.max(out.stop,bar.close-1.2*(out.initialRisk||out.entry-out.initialStop))));
  }
  out.weakBars=bar.close<out.entry&&bar.close<bar.open?(out.weakBars||0)+1:0;
  if(out.weakBars>=2&&out.holdBars>=3)return markExit(out,bar.close,bar,'SCALP_MOMENTUM_FADE',policy);
  if(out.holdBars>=policy.maxHoldBars)return markExit(out,bar.close,bar,'SCALP_TIME_EXIT',policy);
 }
 if(forceClose){
  const latest=(completedBars||[]).filter(b=>b?.datetime&&b.datetime>out.openedBarTime).at(-1);
  const m=latest?Number(String(latest.datetime).slice(11,13))*60+Number(String(latest.datetime).slice(14,16)):null;
  const fresh=latest&&(asOfMinute===null||(Number.isFinite(m)&&asOfMinute-m<=maxCloseLagMinutes));
  return fresh?markExit(out,latest.close,latest,'SCALP_SESSION_EXIT',policy):markExit(out,null,null,'SCALP_SESSION_EXIT',policy,{unpriced:true});
 }
 return out;
}
function explainEntry37(symbol,f,pending,quote,now,policy,day,globalState,approved,market){
 const q=scalpFreshQuote37(quote,now,policy),entry=q.ask;
 const stop=finite(entry)&&finite(pending?.atr)?entry-Math.max(entry*.0018,pending.atr*policy.stopAtrMultiple):null;
 const target=finite(entry)&&finite(stop)?entry+Math.min(entry*.012,Math.max((entry-stop)*2.0,pending.atr*policy.targetAtrMultiple,entry*.005)):null;
 const risk=finite(stop)&&finite(entry)?entry-stop:null;
 const qty=finite(risk)&&risk>0&&entry>0?Math.floor(Math.min(policy.maxCapitalPerTrade/entry,(policy.maxRiskPerTradeUsd-policy.roundTripFeesUsd)/risk)):null;
 const expectedExit=finite(target)?target*(1-policy.exitSlippageBps/10000):null;
 const expectedNet=finite(qty)&&finite(expectedExit)?qty*(expectedExit-entry)-policy.roundTripFeesUsd:null;
 const estimatedWorstLoss=finite(qty)&&finite(stop)?qty*(entry-stop*(1-policy.exitSlippageBps/10000))+policy.roundTripFeesUsd:null;
 const stopPct=finite(risk)&&entry>0?risk/entry*100:null;
 const checks=[
  check('SCALP_SHARIA_REVERIFIED',approved),
  check('SCALP_MARKET_STILL_ALLOWED',market?.regime!=='UNKNOWN'&&!String(market.regime).startsWith('TREND_DOWN')&&!String(market.regime).includes('THIN_LIQUIDITY')&&market?.confidence>=.2),
  check('SCALP_DAY_MATCHES',pending?.day===day,pending?.day,day),
  check('SCALP_SIGNAL_NOT_SAME_BAR',finite(f?.minute)&&f.minute>pending?.signalMinute),
  check('SCALP_PENDING_NOT_EXPIRED',finite(f?.minute)&&f.minute<=pending?.validUntil),
  check('SCALP_ENTRY_WINDOW',finite(f?.minute)&&f.minute<=policy.entryMaxMinute),
  check('SCALP_TRIGGER_REACHED',finite(entry)&&entry>=pending?.trigger,entry,pending?.trigger),
  check('SCALP_MAX_CHASE',finite(entry)&&Math.abs((entry/pending?.signalPrice-1)*100)<=policy.maxQuoteDeviationPct),
  check('SCALP_STOP_RISK_BOUNDS',finite(stopPct)&&stopPct>=.15&&stopPct<=.9,round(stopPct)),
  check('SCALP_WHOLE_SHARES_POSITIVE',finite(qty)&&qty>=1,qty),
  check('SCALP_L1_DEPTH_FOR_PAPER_QTY',finite(qty)&&qty>=1&&q.bidSize>=qty&&q.askSize>=qty,{bidSize:q.bidSize,askSize:q.askSize,qty}),
  check('SCALP_EXPECTED_NET_AFTER_COSTS',finite(expectedNet)&&expectedNet>=policy.minNetProfitUsd,round(expectedNet),policy.minNetProfitUsd),
  check('SCALP_REWARD_NET_VS_RISK',finite(expectedNet)&&finite(estimatedWorstLoss)&&estimatedWorstLoss>0&&expectedNet/estimatedWorstLoss>=1.1,round(expectedNet/estimatedWorstLoss)),
  check('SCALP_DAILY_TRADE_CAP',globalState.tradeCount<policy.maxTradesDay,globalState.tradeCount),
  check('SCALP_OPEN_POSITION_CAP',Object.values(globalState.records).filter(x=>x?.position?.status==='OPEN').length<policy.maxOpen),
  check('SCALP_DAILY_LOSS_LOCK',-globalState.closedOutcomes.reduce((s,x)=>s+(finite(x?.netUsd)?Math.min(x.netUsd,0):0),0)
    +Object.values(globalState.records).filter(x=>x?.position?.status==='OPEN').reduce((s,x)=>s+(x.position.estimatedWorstLossUsd||0),0)
    +(finite(estimatedWorstLoss)?estimatedWorstLoss:policy.maxDailyLossUsd+1)<=policy.maxDailyLossUsd),
  ...q.checks
 ];
 return {symbol,quote:q,entry,stop,target,qty,expectedNet,estimatedWorstLoss,checks,reason:failed(checks)};
}
/** Inputs are already-fetched market data. A symbol cannot re-enter after any position today. */
export function scalpCycle37({day,now,minute,candidates=[],barMap={},quotes={},features={},approved=[],market={},baselinePolicy=null,previous=null,sessionEndMinute=959,enabled=false}={}){
 const p=scalpPolicy37(market,baselinePolicy),state=hasValidToday(previous,day)?structuredClone(previous):newState(day);
 const approvedSymbols=new Set(approved.map(x=>String(x).toUpperCase()));
 const events=[],closedNew=[];
 if(enabled&&previous?.day===day&&!hasValidToday(previous,day))return {state:{...state,status:'INVALID_PREVIOUS_STATE_FAIL_CLOSED'},events,closedNew,summary:scalpSummary37(state),policy:p};
 const draining=!enabled&&Object.values(state.records||{}).some(x=>x?.position?.status==='OPEN');
 if(!enabled&&!draining){
  for(const x of Object.values(state.records||{}))if(x?.pending){x.pending=null;x.status='DISABLED_NO_PENDING';}
  return {state:{...state,status:'DISABLED_BY_DEFAULT',lastMinute:minute},events,closedNew,
   summary:scalpSummary37(state),policy:p};
 }
 if(nyIsoDay(now)!==day)return {state:{...state,status:'DATE_MISMATCH_FAIL_CLOSED'},events,closedNew,
  summary:scalpSummary37(state),policy:p};
 if(!Number.isInteger(minute)||minute<570||minute>sessionEndMinute)return {state:{...state,status:'OUTSIDE_SESSION_FAIL_CLOSED'},events,closedNew,summary:scalpSummary37(state),policy:p};
 if(state.lastMinute===minute)return {state:{...state,status:'DUPLICATE_MINUTE_REJECTED'},events,closedNew,summary:scalpSummary37(state),policy:p};
 const list=unique([...candidates,...Object.keys(state.records).filter(s=>state.records[s]?.position?.status==='OPEN'||state.records[s]?.pending)]).filter(x=>x!=='SPY');
 for(const symbol of list){
  const prior=state.records[symbol]||{symbol,day,status:'OBSERVING',position:null,pending:null};
  const rows=completedSessionRows(barMap[symbol]||[],now);
  const last=rows.at(-1),f=features[symbol]||null;
  let next={...prior,day,reason:prior.reason||null,latestBarTime:last?.datetime||null};
  if(prior.position?.status==='OPEN'){
   const settled=settleScalpPosition37(prior.position,rows,p,{forceClose:minute>=sessionEndMinute,asOfMinute:minute});
   next={...next,position:settled,status:settled.status==='OPEN'?'OPEN':'CLOSED',pending:null,reason:settled.outcome||'SCALP_POSITION_OPEN'};
   if(settled.status!=='OPEN'&&prior.position.status==='OPEN'){
    // Record once, by position ID. Lost/unknown data never becomes a fabricated win.
    if(!state.closedOutcomes.some(x=>x.id===settled.id)){
     state.closedOutcomes.push({symbol,...settled});closedNew.push({symbol,...settled});
    }
   }
  }else if(!prior.position){
   if(!enabled)next={...next,pending:null,status:'DISABLED_NO_NEW_ENTRIES',reason:'SCALP_DISABLED_DRAINING_ONLY'};
   else if(!approvedSymbols.has(symbol))next={...next,status:'REJECTED',reason:'SCALP_SHARIA_NOT_APPROVED',pending:null};
   else if(!rows.length||!f||f.barTime!==last.datetime)next={...next,status:'OBSERVING',reason:'SCALP_BAR_DATA_UNAVAILABLE_OR_STALE'};
   else{
    const old=prior.pending&&prior.pending.day===day&&f.minute<=prior.pending.validUntil?prior.pending:null;
    if(old&&f.minute>old.signalMinute){
     const entry=explainEntry37(symbol,f,old,quotes[symbol],now,p,day,state,true,market);
     if(!entry.reason){
      const id=`SCALP37:${day}:${symbol}:${old.signalMinute}:${old.type}`;
      const pos={id,symbol,day,setupType:old.type,strategyVariantId:'SCALP37_V1_PAPER',
       status:'OPEN',openedAt:now.toISOString(),openedBarTime:f.barTime,lastEvaluatedBarTime:f.barTime,
       entry:round(entry.entry),entryAsk:round(entry.entry),stop:round(entry.stop),target:round(entry.target),
       qty:entry.qty,remainingQty:entry.qty,initialStop:round(entry.stop),initialRisk:round(entry.entry-entry.stop),
       realizedGrossUsd:0,partialTaken:false,estimatedWorstLossUsd:round(entry.estimatedWorstLoss,3),feesUsd:p.roundTripFeesUsd,entryQuote:entry.quote,expectedNetUsdAtTarget:round(entry.expectedNet,3),
       assumedExitSlippageBps:p.exitSlippageBps,holdBars:0,mfePct:0,maePct:0,
       policyAtEntry:p,signal:old,netUsd:null};
      next={...next,position:pos,pending:null,status:'OPEN',reason:'SCALP_PAPER_ENTRY',entryChecks:entry.checks};state.tradeCount++;
     }else{
      next={...next,pending:old,status:'PENDING',reason:entry.reason,entryChecks:entry.checks};
      state.entryRejections[entry.reason]=(state.entryRejections[entry.reason]||0)+1;
     }
    }else if(old){next={...next,pending:old,status:'PENDING',reason:'SCALP_WAIT_NEXT_COMPLETED_BAR'};}
    else{
     const detected=detectScalpSetup37(f,market,p);
     const pending=detected.type?{day,type:detected.type,signalMinute:detected.signalMinute,signalBarTime:detected.signalBarTime,
      validUntil:detected.signalMinute+p.signalTtlMinutes,signalPrice:detected.signalPrice,atr:detected.atr,trigger:detected.trigger}:null;
     next={...next,pending,status:pending?'PENDING':'OBSERVING',reason:detected.reason,signalChecks:detected.checks};
    }
   }
  }else{next={...next,status:'CLOSED',pending:null,reason:'SCALP_NO_REENTRY_SAME_DAY'};}
  state.records[symbol]=next;
  events.push({symbol,status:next.status,reason:next.reason,setupType:next.position?.setupType||next.pending?.type||null,
   positionId:next.position?.id||null,entry:next.position?.entry||null,netUsd:next.position?.netUsd??null,
   quoteStatus:next.entryChecks?.find(c=>c.gate==='SCALP_QUOTE_FRESH')?.passed??null,
   lastCompletedBarAt:last?.datetime||null});
 }
 state.cycleCount++;state.lastMinute=minute;state.status=draining?'DRAINING_DISABLED_POSITIONS_NO_NEW_ENTRY':'ACTIVE_INDEPENDENT_PAPER';
 return {state,events,closedNew,summary:scalpSummary37(state),policy:p};
}
export function scalpSummary37(state){
 const positions=Object.values(state?.records||{}).map(x=>x.position).filter(Boolean);
 const closed=unique((state?.closedOutcomes||[]).map(x=>x.id)).map(id=>(state?.closedOutcomes||[]).find(x=>x.id===id));
 const priced=closed.filter(x=>x.status==='CLOSED'&&finite(x.netUsd));
 const bySetup={};for(const x of priced){const k=x.setupType||'UNKNOWN';const c=bySetup[k]||(bySetup[k]={trades:0,wins:0,netUsd:0});
  c.trades++;c.wins+=Number(x.netUsd>0);c.netUsd=round(c.netUsd+x.netUsd,3);}
 return {status:state?.status||'UNINITIALIZED',entered:state?.tradeCount||0,open:positions.filter(x=>x.status==='OPEN').length,
  closed:closed.length,priced:priced.length,unknownOutcome:closed.length-priced.length,
  wins:priced.filter(x=>x.netUsd>0).length,netPaperUsd:round(priced.reduce((s,x)=>s+x.netUsd,0),3),
  bySetup,entryRejections:state?.entryRejections||{},paperOnly:true,noOrders:true,
  profitabilityProven:false,exitFillsReal:false,feesAndSlippageEstimated:true};
}
