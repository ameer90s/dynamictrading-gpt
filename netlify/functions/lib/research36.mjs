/** Dynamic Trading 3.6 research engine, JS port of the chosen V4 paper rules.
 * No brokerage orders. Point-in-time: only completed minute bars and actual Alpaca quotes.
 * Quote checks fail closed; numerical quality is NOT a calibrated probability.
 */
export const RESEARCH36_POLICY=Object.freeze({
  openingReturnPct:.40, openingMomentum5Pct:.15, relativeStrengthPct:.10,
  openingDollarVolume:500000, openingVolRatio:.50, earliestConfirmationMinute:631,
  lastEntryMinute:720, maxQuoteAgeSec:7, maxSpreadBps:12, maxSignalBarLagMin:2,
  minHodGapPct:.8, maxEntryJumpPct:.35, minClosePosition:.65,
  minRetestVolume:.75, minRiskPct:.45, maxRiskPct:1.10,
  minNetR:1, roundTripFeeUsd:2, paperCapitalUsd:1000,
});
const n=v=>v==null?null:(Number.isFinite(Number(v))?Number(v):null);
const rnd=(v,d=4)=>v==null||!Number.isFinite(v)?null:Number(v.toFixed(d));
const pct=(a,b)=>a>0&&b>0?100*(a/b-1):null;
function validBar(b){return ['open','high','low','close','volume'].every(k=>n(b?.[k])!=null)&&b.high>=b.low&&b.low>0&&b.volume>=0}
function minute(b){const x=String(b?.datetime||'').match(/^(\d{4}-\d\d-\d\d)[ T](\d\d):(\d\d)/);return x?{day:x[1],min:Number(x[2])*60+Number(x[3])}:null}
function numEval(value,op,limit){return value!=null&&Number.isFinite(Number(value))&&(op==='>='?value>=limit:op==='<='?value<=limit:op==='>'?value>limit:op==='=='?value===limit:false)}
function gate(name,value,op,limit,reason){return {gate:name,observed:value??null,operator:op,threshold:limit,passed:numEval(value,op,limit),reason};}
function ema(xs,p){if(!xs.length)return null;const k=2/(p+1);return xs.reduce((v,x,i)=>i===0?x:v+k*(x-v),0)}
function mean(x){return x.length?x.reduce((a,b)=>a+b,0)/x.length:null}
function atr(rows){if(rows.length<15)return null;const ranges=rows.map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(i?rows[i-1].close:x.close)),Math.abs(x.low-(i?rows[i-1].close:x.close))));return mean(ranges.slice(-14));}
function rsi(rows){if(rows.length<15)return null;let up=0,down=0;for(let i=1;i<rows.length;i++){const delta=rows[i].close-rows[i-1].close;const p=Math.max(0,delta),q=Math.max(0,-delta);up=i===1?p:(up*13+p)/14;down=i===1?q:(down*13+q)/14;}return down===0?up===0?50:100:100-100/(1+up/down)}
function spreadSource(quote){return String(quote?.source||'MISSING');}
function nyTimestampParts(value){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 const z=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {day:`${z.year}-${z.month}-${z.day}`,minute:(Number(z.hour)%24)*60+Number(z.minute)};
}
function observedDate(row,now){const p=minute(row);if(!p)return false;const t=new Date(now);const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(t).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.day===`${parts.year}-${parts.month}-${parts.day}`&&p.min<((Number(parts.hour)%24)*60+Number(parts.minute));}
export function completedSessionRows(candles,now=new Date(),{allowHistorical=false}={}){
  const all=(candles||[]).filter(validBar).map(b=>({...b,_time:minute(b)})).filter(b=>b._time&&b._time.min>=570&&b._time.min<960);
  if(!all.length)return [];
  const day=allowHistorical?all.at(-1)._time.day:null;
  return all.filter(b=>allowHistorical?b._time.day===day:observedDate(b,now)).sort((a,b)=>a._time.min-b._time.min);
}
function buildFeatures(rows,spyRows){
  if(!rows.length)return null;
  const last=rows.at(-1),first=rows[0],opening=rows.filter(b=>b._time.min>=570&&b._time.min<=584);
  const atOpening=opening.find(b=>b._time.min===584);
  const firstTen=opening.filter(b=>b._time.min<=579),lastFive=opening.filter(b=>b._time.min>=580);
  const opClose=atOpening?.close??null;
  const momStart=opening.find(b=>b._time.min===579)?.close??null;
  const spyOpen=spyRows.find(b=>b._time.min===570)?.open??null;
  const spyEnd=spyRows.find(b=>b._time.min===584)?.close??null;
  const opRet=pct(opClose,first.open),spyRet=pct(spyEnd,spyOpen);
  let cumPv=0,cumVol=0;for(const b of rows){cumPv+=((b.high+b.low+b.close)/3)*b.volume;cumVol+=b.volume;}
  const vwap=cumVol?cumPv/cumVol:last.close;
  const a=atr(rows);const vMedian=median(rows.slice(-7,-1).map(b=>b.volume));
  const prev=rows.at(-2),range=last.high-last.low;
  const closePos=range>0?(last.close-last.low)/range:.5;
  const hod=Math.max(...rows.map(b=>b.high));
  const ema12=ema(rows.map(b=>b.close),12),ema9=ema(rows.map(b=>b.close),9),ema20=ema(rows.map(b=>b.close),20);
  const macd=ema(rows.map(b=>b.close),12)-ema(rows.map(b=>b.close),26);
  const openingDollarVolume=opening.reduce((s,b)=>s+b.close*b.volume,0);
  const openingVolRatio=firstTen.length&&lastFive.length ? 2*lastFive.reduce((s,b)=>s+b.volume,0)/Math.max(1,firstTen.reduce((s,b)=>s+b.volume,0)):null;
  return {
    minute:last._time.min, day:last._time.day, completedBarAt:last.datetime,
    openingBars:opening.length, openingReady:Boolean(opening.find(x=>x._time.min===570)&&atOpening&&opening.length>=13),
    openingReturnPct:rnd(opRet), openingMomentum5Pct:rnd(pct(opClose,momStart)),
    openingDollarVolume:rnd(openingDollarVolume,2), openingVolRatio:rnd(openingVolRatio),
    relativeStrengthPct:rnd(opRet!=null&&spyRet!=null?opRet-spyRet:null), benchmarkOpeningReturnPct:rnd(spyRet),
    price:last.close, open:last.open, high:last.high, low:last.low, volume:last.volume,
    vwap:rnd(vwap),ema9:rnd(ema9),ema12:rnd(ema12),ema20:rnd(ema20),
    macd:rnd(macd,6),rsi14:rnd(rsi(rows)),atr14:rnd(a),
    hod:rnd(hod),hodGapPct:rnd(pct(hod,last.close)),
    momentum3Pct:rnd(rows.length>=4?pct(last.close,rows.at(-4).close):null),
    momentum5Pct:rnd(rows.length>=6?pct(last.close,rows.at(-6).close):null),
    momentum10Pct:rnd(rows.length>=11?pct(last.close,rows.at(-11).close):null),
    retestVolumeRatio:rnd(vMedian?last.volume/vMedian:null),
    closePosition:rnd(closePos),green:last.close>last.open,
    aboveVwap:last.close>vwap, recentLow3:rnd(Math.min(...rows.slice(-3).map(b=>b.low))),
    openingRange5High:rnd(Math.max(...opening.slice(0,5).map(b=>b.high))),
    dollarVolumeLast5:rnd(rows.slice(-5).reduce((s,b)=>s+b.volume*b.close,0),2),
    candleRangePct:rnd(pct(last.high,last.low)),
    source:'COMPLETED_1MIN_BARS',quoteSource:'NOT_IN_BAR',confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
  };
}
function median(x){if(!x.length)return null;const z=[...x].sort((a,b)=>a-b);return z.length%2?z[Math.floor(z.length/2)]:(z[z.length/2-1]+z[z.length/2])/2;}
function openingGates(f,sharia=true,p=RESEARCH36_POLICY){
  return [gate('sharia_approved',sharia?1:0,'==',1,'SHARIA_NOT_APPROVED'),
    gate('opening_bars_complete',f?.openingReady?1:0,'==',1,'INCOMPLETE_OPENING'),
    gate('opening_return',f?.openingReturnPct,'>=',p.openingReturnPct,'OPEN_RETURN_WEAK'),
    gate('opening_momentum5',f?.openingMomentum5Pct,'>=',p.openingMomentum5Pct,'OPEN_MOMENTUM_WEAK'),
    gate('relative_strength',f?.relativeStrengthPct,'>=',p.relativeStrengthPct,'RELATIVE_STRENGTH_WEAK'),
    gate('dollar_volume',f?.openingDollarVolume,'>=',p.openingDollarVolume,'OPEN_LIQUIDITY_WEAK'),
    gate('opening_volume_ratio',f?.openingVolRatio,'>=',p.openingVolRatio,'OPEN_VOLUME_WEAK')];
}
function retestModels(rows,f){if(!f?.atr14||rows.length<20)return [];
 const last=rows.at(-1),prev=rows.at(-2),a=f.atr14;
 return [['VWAP',f.vwap],['EMA12',f.ema12],['OR5',f.openingRange5High]].filter(([,support])=>support>0)
   .filter(([,support])=>last.low<=support+.25*a&&Math.min(prev.low,last.low)<=support+.25*a&&last.close>support+.05*a&&last.close>prev.close&&last.close>last.open)
   .map(([model,support])=>({model,support,low3:f.recentLow3}));
}
function confirmationGates(f,model,p){return [
  gate('after_1030',f?.minute,'>=',p.earliestConfirmationMinute,'BEFORE_1030'),
  gate('before_1200',f?.minute,'<=',p.lastEntryMinute,'AFTER_NEW_ENTRY_WINDOW'),
  gate('retest_model',model?1:0,'==',1,'WAIT_CONFIRMED_RETEST'),
  gate('green_confirmation',f?.green?1:0,'==',1,'NO_GREEN_CONFIRMATION'),
  gate('upper_candle_close',f?.closePosition,'>=',p.minClosePosition,'WEAK_CONFIRMATION_CANDLE'),
  gate('retest_volume',f?.retestVolumeRatio,'>=',p.minRetestVolume,'WEAK_RETEST_VOLUME'),
  gate('above_vwap',f?.aboveVwap?1:0,'==',1,'BELOW_VWAP'),
  gate('hod_gap_on_bar',f?.hodGapPct,'>=',p.minHodGapPct,'TOO_CLOSE_TO_HOD')];}
export function shadowSix(entry,stop,atrValue,hod,rows){
 const risk=entry-stop;const prev=(rows||[]).slice(-30,-1).map(b=>b.high).filter(x=>x>entry*1.0007);
 const resistance=prev.length?Math.min(...prev)*.9997:hod*.9997;
 return {blend:rnd(Math.min(entry+3.5*atrValue,entry+.92*(hod-entry))),atr_3:rnd(entry+3*atrValue),
   atr_4:rnd(entry+4*atrValue),hod_85:rnd(entry+.85*(hod-entry)),fixed_1p8R:rnd(entry+1.8*risk),resistance:rnd(resistance)};
}
function executionGates(f,quote,trigger,p,now){
 const bid=n(quote?.bid),ask=n(quote?.ask),bidSize=n(quote?.bidSize),askSize=n(quote?.askSize);
 const age=quote?.timestamp? (new Date(now).getTime()-Date.parse(quote.timestamp))/1000:null;
 const quoteNy=nyTimestampParts(quote?.timestamp), nowNy=nyTimestampParts(new Date(now).toISOString());
 const signalBarLag=nowNy?.day===f.day?nowNy.minute-f.minute:null;
 const quoteAfterClose=quoteNy?.day===f.day&&quoteNy.minute>=f.minute+1;
 const spread=bid>0&&ask>=bid?10000*(ask-bid)/((ask+bid)/2):null;
 const stop=ask>0?Math.min(f.recentLow3*.9985,ask*(1-.0045)):null;
 const target=ask>0?Math.min(ask+3.5*f.atr14,ask+.92*(f.hod-ask)):null;
 const riskPct=ask>0&&stop>0?(ask-stop)/ask*100:null;
 const qty=ask>0?p.paperCapitalUsd/ask:null;
 const gain=ask>0&&target!=null&&qty!=null?(target-ask)*qty-p.roundTripFeeUsd:null;
 const loss=ask>0&&stop!=null&&qty!=null?(ask-stop)*qty+p.roundTripFeeUsd:null;
 const netR=loss>0?gain/loss:null;
 const checks=[gate('alpaca_quote',String(quote?.source||'').startsWith('Alpaca')?1:0,'==',1,'NO_AUTHENTIC_ALPACA_QUOTE'),
   gate('bid_ask_valid',bid>0&&ask>=bid&&bidSize>0&&askSize>0?1:0,'==',1,'INVALID_BID_ASK'),
   gate('quote_age_nonnegative',age,'>=',0,'FUTURE_QUOTE'),
   gate('quote_age_max',age,'<=',p.maxQuoteAgeSec,'STALE_QUOTE'),
   gate('signal_bar_lag_minutes',signalBarLag,'<=',p.maxSignalBarLagMin,'CONFIRMATION_BAR_TOO_OLD'),
   gate('quote_after_completed_confirmation_bar',quoteAfterClose?1:0,'==',1,'QUOTE_PRECEDES_SIGNAL'),
   gate('spread_bps',rnd(spread),'<=',p.maxSpreadBps,'SPREAD_TOO_WIDE'),
   gate('ask_above_prior_candle_trigger',ask,'>=',trigger,'AWAITING_ASK_BREAKOUT'),
   gate('entry_jump_pct',ask>0?rnd(Math.abs(pct(ask,f.price))):null,'<=',p.maxEntryJumpPct,'PRICE_MOVED_BEFORE_ENTRY'),
   gate('hod_gap_at_ask',ask>0?rnd(pct(f.hod,ask)):null,'>=',p.minHodGapPct,'ASK_TOO_CLOSE_TO_HOD'),
   gate('stop_risk_min',rnd(riskPct),' >= '.trim(),p.minRiskPct,'STOP_TOO_CLOSE'),
   gate('stop_risk_max',rnd(riskPct),'<=',p.maxRiskPct,'STOP_TOO_WIDE'),
   gate('net_reward_R',rnd(netR),' >= '.trim(),p.minNetR,'INSUFFICIENT_NET_REWARD')];
 return {checks,stop:rnd(stop),target:rnd(target),qty:rnd(qty,5),netR:rnd(netR),
   netGainUsd:rnd(gain,2),netLossUsd:rnd(loss,2),ageSec:rnd(age,2),spreadBps:rnd(spread,2)};
}
function quality(f,checks){const clamp=(v,a,b)=>v==null?0:Math.max(0,Math.min(1,(v-a)/(b-a)));
 return rnd(Math.max(0,Math.min(100,
  clamp(f?.openingReturnPct,.3,2.5)*15+clamp(f?.openingMomentum5Pct,.1,1.2)*12+
  clamp(f?.openingVolRatio,.5,2.5)*12+clamp(f?.retestVolumeRatio,.6,2)*12+
  clamp(f?.closePosition,.5,.95)*10+clamp(f?.hodGapPct,.6,2.5)*10+
  clamp(f?.relativeStrengthPct,0,2)*12+17*(checks.filter(x=>x.passed).length/Math.max(1,checks.length)))),1);}
export function evaluateResearch36(symbol,candles,spyCandles,quote,{now=new Date(),shariaApproved=true,allowHistorical=false,policy=RESEARCH36_POLICY}={}){
 const rows=completedSessionRows(candles,now,{allowHistorical}),spy=completedSessionRows(spyCandles,now,{allowHistorical});
 const f=buildFeatures(rows,spy);if(!f)return {state:'WAIT',reason:'NO_COMPLETED_BARS',features:null,checks:[],model:null};
 const openChecks=openingGates(f,shariaApproved,policy);
 const opened=openChecks.every(x=>x.passed),model=retestModels(rows,f)[0]||null;
 const confirmChecks=confirmationGates(f,model,policy);
 const signalTrigger=model?rnd(f.high+.03*f.atr14):null;
 const ex=opened&&confirmChecks.every(x=>x.passed)?executionGates(f,quote,signalTrigger,policy,now):null;
 const allChecks=[...openChecks,...confirmChecks,...(ex?.checks||[])];
 let state='WAIT',reason='WAIT_OPENING_WINDOW';
 if(f.minute>=585){
   if(!opened){reason=openChecks.find(x=>!x.passed)?.reason||'OPENING_GATE_FAILED';state='WAIT';}
   else {state='SMART';reason=confirmChecks.find(x=>!x.passed)?.reason||'WAIT_LIVE_ASK';
     if(ex){reason=ex.checks.find(x=>!x.passed)?.reason||'CONFIRMED_RESEARCH_V36';if(ex.checks.every(x=>x.passed))state='CONFIRMED';}}
 }
 const ask=n(quote?.ask),entry=state==='CONFIRMED'?ask:null;
 const shadow=entry&&ex?.stop!=null?shadowSix(entry,ex.stop,f.atr14,f.hod,rows):null;
 const risk=state==='CONFIRMED'&&ex?{entry:rnd(entry),stop:ex.stop,exitTarget:ex.target,qty:ex.qty,
   netRewardR:ex.netR,netGainUsd:ex.netGainUsd,netLossUsd:ex.netLossUsd,
   shadow,ts:now.toISOString(),quoteTimestamp:quote.timestamp}:null;
 return {symbol,state,reason,features:f,openingChecks:openChecks,confirmationChecks:confirmChecks,
   executionChecks:ex?.checks||[],checks:allChecks,retestModel:model?.model||null,retestSupport:model?.support||null,
   trigger:signalTrigger,qualityScore:quality(f,allChecks),confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
   quote:{bid:n(quote?.bid),ask:n(quote?.ask),bidSize:n(quote?.bidSize),askSize:n(quote?.askSize),timestamp:quote?.timestamp||null,
     ageSec:ex?.ageSec??null,spreadBps:ex?.spreadBps??null,source:spreadSource(quote)},risk,
   researchMode:'LONG_PAPER_ONLY',providerNote:'Alpaca IEX is venue-only (not consolidated NBBO)',
   eventKey:`${f.day}:${symbol}:${f.minute}:${state}:${model?.model||'NONE'}`};
}
