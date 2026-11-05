/**
 * Dynamic Trading 3.7 -- PAPER-only, independent shadow exit simulator.
 * No broker orders, scanner threshold writes, or API calls.
 * State changes from a completed candle become effective on the NEXT candle.
 * Does not use live or future OHLC values when choosing a stop.
 */
const finite = x => typeof x === 'number' && Number.isFinite(x);
const rounded = x => Math.round(x * 10000) / 10000;

export function createPaperExit({entry, initialStop, target, quantity=1, feeRoundTrip=0, atrAtEntry=null, partialFraction=0.5}={}) {
  if (![entry,initialStop,target,quantity,feeRoundTrip].every(finite) || !(entry>initialStop && target>entry && quantity>0 && feeRoundTrip>=0)) throw Error('INVALID_INITIAL_PAPER_RISK');
  if (!(partialFraction>=0&&partialFraction<=1)) throw Error('INVALID_PARTIAL_FRACTION');
  const r=entry-initialStop;
  return { mode:'PAPER_SHADOW_ONLY', status:'OPEN', entry, stop:initialStop, initialStop,
    target, quantity, remaining:quantity, feeRoundTrip, partialFraction, atrAtEntry,
    realizedGross:0, exitEvents:[], barCount:0, highWater:entry,
    maxAdversePct:0,maxFavorablePct:0,at:null,netUsd:null, ambiguity:false,
    target1:entry+r, target1Filled:false, breakEvenArmed:false, trailingArmed:false,
    lastCompletedAt:null, lastCompletedClose:null };
}

/**
 * When a target and stop occur in the same completed 1m candle, intrabar order is
 * unknown; record AMBIGUOUS, do not assign optimistic net profit.
 */
export function applyCompletedCandle(prev, candle, opts={}) {
  if(prev.status!=='OPEN')return {...prev};
  const {datetime,high,low,close,open}=candle||{};
  if(!datetime||![high,low,close].every(finite)||low<=0||high<low||close<low||close>high|| (open!=null&&(!finite(open)||open<low||open>high)))throw Error('INVALID_COMPLETED_CANDLE');
  if(prev.lastCompletedAt && String(datetime)<=prev.lastCompletedAt)throw Error('NON_MONOTONIC_CANDLE');
  const state={...prev,exitEvents:[...prev.exitEvents],barCount:prev.barCount+1,at:datetime,lastCompletedAt:String(datetime),lastCompletedClose:close};
  state.highWater=Math.max(prev.highWater,high);
  state.maxFavorablePct=Math.max(prev.maxFavorablePct,100*(high-prev.entry)/prev.entry);
  state.maxAdversePct=Math.min(prev.maxAdversePct,100*(low-prev.entry)/prev.entry);
  const stopHit=low<=prev.stop;
  const t1Hit=!prev.target1Filled && high>=prev.target1;
  const targetHit=high>=prev.target;
  if(stopHit&&(t1Hit||targetHit)){
    state.ambiguity=true;state.status='AMBIGUOUS';state.netUsd=null;
    state.exitEvents.push({at:datetime,type:'AMBIGUOUS_SAME_BAR',stop:prev.stop,target:targetHit?prev.target:prev.target1});
    return state;
  }
  if(stopHit){
    state.realizedGross+=prev.remaining*(prev.stop-prev.entry);state.remaining=0;
    state.status='CLOSED';state.netUsd=rounded(state.realizedGross-prev.feeRoundTrip);
    state.exitEvents.push({at:datetime,type:'STOP',price:prev.stop});
    return state;
  }
  if(targetHit){
    state.realizedGross+=prev.remaining*(prev.target-prev.entry);state.remaining=0;
    state.status='CLOSED';state.netUsd=rounded(state.realizedGross-prev.feeRoundTrip);
    state.exitEvents.push({at:datetime,type:'TARGET',price:prev.target});
    return state;
  }
  if(t1Hit&&prev.partialFraction>0){
    const qty=prev.quantity*prev.partialFraction;
    state.realizedGross+=qty*(prev.target1-prev.entry);
    state.remaining-=qty; state.target1Filled=true;
    state.exitEvents.push({at:datetime,type:'PARTIAL_T1',price:prev.target1,quantity:qty});
  }
  const r=prev.entry-prev.initialStop;
  // A completed bar can tighten a stop; it must NEVER widen it. Tightening
  // only takes effect starting on the following bar, not the candle just read.
  if(state.highWater>=prev.entry+1.1*r) {
    const nextStop=Math.max(state.stop,prev.entry);
    if(nextStop>state.stop){state.stop=rounded(nextStop);state.breakEvenArmed=true;
      state.exitEvents.push({at:datetime,type:'BREAK_EVEN_ARMED_NEXT_BAR',price:state.stop});}
  }
  if(state.highWater>=prev.entry+1.75*r){
    const trailingDistance=finite(prev.atrAtEntry)&&prev.atrAtEntry>0?Math.max(r*0.8,prev.atrAtEntry):r;
    const nextStop=Math.max(state.stop,close-trailingDistance);
    if(nextStop>state.stop){state.stop=rounded(nextStop);state.trailingArmed=true;
      state.exitEvents.push({at:datetime,type:'TRAILING_ARMED_NEXT_BAR',price:state.stop});}
  }
  return state;
}

export function closePaperAtSessionEnd(prev,lastClose,datetime){
  if(prev.status!=='OPEN')return {...prev};
  if(!finite(lastClose)||lastClose<=0)return {...prev,status:'UNPRICED_AT_CLOSE',netUsd:null,at:datetime};
  return {...prev,status:'CLOSED',at:datetime,remaining:0,
    realizedGross:prev.realizedGross+prev.remaining*(lastClose-prev.entry),
    netUsd:rounded(prev.realizedGross+prev.remaining*(lastClose-prev.entry)-prev.feeRoundTrip),
    exitEvents:[...prev.exitEvents,{at:datetime,type:'SESSION_CLOSE_PAPER',price:lastClose}]};
}

export function paperShadowReplay({position,candles=[]}={}){
  let state=createPaperExit(position);for(const candle of candles){state=applyCompletedCandle(state,candle)}return state;
}
