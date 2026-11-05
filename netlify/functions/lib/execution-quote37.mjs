/**
 * Real IEX level-1 approval gate. Pure local validation: never sends orders.
 * Missing/crossed/aged quotes fail closed; no fallback to a candle or last price.
 */
export function validateExecutionQuote37(quote, trade, nowMs=Date.now()) {
  const blocked=(reason, details={})=>({ok:false,reason,...details});
  const bid=Number(quote?.bid), ask=Number(quote?.ask);
  const bidSize=Number(quote?.bidSize), askSize=Number(quote?.askSize);
  if(!quote || ![bid,ask,bidSize,askSize].every(Number.isFinite) ||
     bid<=0 || ask<=0 || bidSize<=0 || askSize<=0)
    return blocked('EXECUTION_QUOTE_INCOMPLETE');
  if(ask<bid)return blocked('EXECUTION_QUOTE_CROSSED');
  const timestampMs=Date.parse(quote.timestamp||'');
  if(!Number.isFinite(timestampMs)||!Number.isFinite(nowMs))return blocked('EXECUTION_QUOTE_MISSING_TIMESTAMP');
  const ageSec=(nowMs-timestampMs)/1000;
  if(ageSec>90 || ageSec< -10)return blocked('EXECUTION_QUOTE_STALE_OR_FUTURE',{ageSec});
  const mid=(bid+ask)/2;
  const spreadBps=(ask-bid)/mid*10000;
  const maxBps=Number(trade?.filters?.maxSpreadBps ?? trade?.metrics?.maxSpreadBps ?? 20);
  if(!Number.isFinite(maxBps)||maxBps<=0)return blocked('EXECUTION_SPREAD_LIMIT_INVALID');
  if(spreadBps>maxBps)return blocked('EXECUTION_SPREAD_TOO_WIDE',{spreadBps,maxBps});
  const reference=Number(trade?.price), entryHigh=Number(trade?.entryHigh);
  if(!Number.isFinite(reference)||reference<=0||!Number.isFinite(entryHigh)||entryHigh<=0)
    return blocked('EXECUTION_ENTRY_RANGE_MISSING');
  const deviationPct=Math.abs(mid-reference)/reference*100;
  if(deviationPct>2)return blocked('EXECUTION_QUOTE_DEVIATION',{deviationPct});
  if(ask>entryHigh)return blocked('EXECUTION_ASK_ABOVE_ENTRY',{ask,entryHigh});
  return {ok:true,reason:'FRESH_EXECUTION_QUOTE',bid,ask,bidSize,askSize,mid,spreadBps,maxBps,deviationPct,ageSec,source:quote.source||null};
}
