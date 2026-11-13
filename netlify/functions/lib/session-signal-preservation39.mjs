/** Historical display evidence only. Never relaxes scanner thresholds, creates confirmations or trades. */
const SIGNAL_STATES = new Set(['SMART','CONFIRMED']);
function snapshot(r, observedAt) {
  const result = {
    symbol:r.symbol, recommendationState:r.recommendationState,
    companyName:r.companyName || r.company || r.name || null,
    stateReason:r.stateReason || null, price:r.price ?? null,
    entryLow:r.entryLow ?? null, entryHigh:r.entryHigh ?? null,
    target1:r.target1 ?? null, stopLoss:r.stopLoss ?? null,
    confidence:r.confidence ?? null, confirmedAt:r.confirmedAt ?? null,
    generatedAt:r.generatedAt || observedAt || null,
    observedAt:observedAt || null, signalId:r.signalId || null,
    historicalOnly:true, confirmationLocked:true, tradeable:false,
    paperOnly:true, side:'WAIT'
  };
  return result;
}
export function mergeDiscoveryCycleRows(parts=[]) {
  const bySymbol=new Map();
  for (const part of parts) for (const row of part?.all || []) if(row?.symbol)bySymbol.set(row.symbol,row);
  return [...bySymbol.values()];
}
export function mergeObservedSessionSignals(previous, current, dateKey) {
  const prior = previous?.tradeDate===dateKey
    ? (Array.isArray(previous.sessionSignalArchive) ? previous.sessionSignalArchive :
       [...(previous.display8||[]),...(previous.all||[])].filter(r=>SIGNAL_STATES.has(r?.recommendationState))) : [];
  const map=new Map();
  for(const row of prior) if(row?.symbol && SIGNAL_STATES.has(row.recommendationState))
    map.set(row.symbol,{...snapshot(row,row.observedAt || previous?.generatedAt),
      ...(row.supersededBy?{supersededBy:row.supersededBy}:{})});
  for(const row of current?.all || []){
    if(!row?.symbol)continue;
    if(SIGNAL_STATES.has(row.recommendationState))map.set(row.symbol,snapshot(row,current.generatedAt));
    else if(map.has(row.symbol))map.set(row.symbol,{...map.get(row.symbol),supersededBy:row.recommendationState,
      lastEvaluatedAt:current.generatedAt||null});
  }
  // Display-only snapshots, never the engine's SMART focus; cap storage writes.
  return [...map.values()].slice(-120);
}
export function preserveSessionSignalEvidence(previous,data,dateKey){
  if(!data||!dateKey)return data;
  data.sessionSignalArchive=mergeObservedSessionSignals(previous,data,dateKey);
  data.sessionSignalArchiveDate=dateKey;
  return data;
}
export function historicalDisplayRows(data){
  if(!data || data.sessionSignalArchiveDate!==data.tradeDate || !Array.isArray(data.sessionSignalArchive))return [];
  return data.sessionSignalArchive.filter(r=>SIGNAL_STATES.has(r?.recommendationState))
    .map(r=>({...r,historicalOnly:true,tradeable:false,confirmationLocked:true,paperOnly:true,side:'WAIT'}));
}

/** Reuse the signal-history payload returned by its existing write path.
    No extra Netlify Blob read, API call, or scheduled function is introduced. */
export function preserveSignalHistoryEvidence(history,data,dateKey){
  if(!data || !dateKey)return data;
  const out=new Map();
  if(history?.dateKey===dateKey){
    for(const [symbol,rec] of Object.entries(history.signals||{})){
      const first=rec.confirmedSignals?.[0]||null;
      const smart=rec.smartObservations?.at(-1)||[...(rec.transitions||[])].reverse().find(t=>t.state==='SMART');
      if(!first&&!smart)continue;
      const signal={symbol,recommendationState:first?'CONFIRMED':'SMART',
        stateReason:rec.lastGateReason||smart?.reason||null,
        price:first?.entry??rec.lastPrice??null,entryLow:first?.entryLow??null,
        entryHigh:first?.entryHigh??null,target1:first?.t1??null,stopLoss:first?.sl??null,
        confirmedAt:first?.confirmedAt||null,generatedAt:rec.lastSeenAt||null,
        observedAt:first?.confirmedAt||smart?.at||null,signalId:first?.signalId||null,
        ...(rec.lastState && !SIGNAL_STATES.has(rec.lastState)?{supersededBy:rec.lastState}:{}),
        historicalOnly:true,tradeable:false,confirmationLocked:true,paperOnly:true,side:'WAIT'};
      out.set(symbol,signal);
    }
  }
  // The current scan can contain an actual SMART whose full record has not yet
  // been compacted into smartObservations (e.g. no completed bar).
  for(const r of data.all||[]){if(!r?.symbol || !SIGNAL_STATES.has(r.recommendationState))continue;
    if(!out.has(r.symbol))out.set(r.symbol,snapshot(r,data.generatedAt));}
  data.sessionSignalArchive=[...out.values()].slice(-120);
  data.sessionSignalArchiveDate=dateKey;
  return data;
}
