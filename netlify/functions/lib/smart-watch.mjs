// Persistent SMART watch for Dynamic Trading 3.5.
// Trading thresholds are NOT changed here. This module only preserves candidates
// that already reached SMART so they cannot disappear merely because discovery rank changed.
const KEY_PREFIX='smart-watch-';
export async function getSmartWatch(store,dateKey){
  const p=await store.get(`${KEY_PREFIX}${dateKey}`,{type:'json',consistency:'strong'});
  return p&&p.dateKey===dateKey?p:{dateKey,active:{},terminal:[],updatedAt:null};
}
export function smartWatchSymbols(watch){return Object.keys(watch?.active||{});}
export async function updateSmartWatch(store,dateKey,data,{sessionClosed=false}={}){
  if(!store||!dateKey)return null;
  const watch=await getSmartWatch(store,dateKey);const now=data?.generatedAt||new Date().toISOString();
  const rows=Array.isArray(data?.all)?data.all:Array.isArray(data?.display8)?data.display8:[];
  for(const r of rows){
    if(!r?.symbol||!r.recommendationState)continue;
    const s=String(r.symbol).toUpperCase(),state=r.recommendationState,existing=watch.active[s];
    if(state==='SMART'){
      watch.active[s]={symbol:s,firstSmartAt:existing?.firstSmartAt||now,lastEvaluatedAt:now,lastState:'SMART',stateReason:r.stateReason||r.filters?.conditionalReason||r.metrics?.setupState||'WAIT_ENTRY',confidence:Number(r.confidence||0),setupFamily:r.metrics?.setupFamily||null,lastPrice:Number(r.price||0),previousMetrics:existing?.metrics?{confidence:Number(existing.confidence||0),relativeVolume:Number(existing.metrics.relativeVolume||0),relativeStrengthPct:Number(existing.metrics.relativeStrengthPct||0),retestQuality:Number(existing.metrics.retestQuality||0)}:(existing?.previousMetrics||{}),focusRank:r.focusRank||existing?.focusRank||null,focusTier:r.focusTier||existing?.focusTier||null,focusScore:Number(r.focusScore||existing?.focusScore||0),metrics:{setupFamily:r.metrics?.setupFamily||null,setupQuality:Number(r.metrics?.setupQuality||0),retestQuality:Number(r.metrics?.retestQuality||0),relativeVolume:Number(r.metrics?.relativeVolume||0),relativeStrengthPct:Number(r.metrics?.relativeStrengthPct||0),chaseDistanceAtr:Number(r.metrics?.chaseDistanceAtr||0),roomR:Number(r.metrics?.roomR||0),spreadBps:Number(r.metrics?.spreadBps||0),spreadSource:r.metrics?.spreadSource||null,setupState:r.metrics?.setupState||null}};
    }else if(existing){
      if(state==='CONFIRMED'||state==='BAD'){
        watch.terminal.push({...existing,terminalState:state,terminalAt:now,terminalReason:r.stateReason||r.filters?.rejectedReason||null});delete watch.active[s];
      }else{
        // WAIT does not silently drop a previously SMART setup; keep watching it.
        watch.active[s]={...existing,lastEvaluatedAt:now,lastState:state,confidence:Number(r.confidence||existing.confidence||0),lastPrice:Number(r.price||existing.lastPrice||0)};
      }
    }
  }
  if(sessionClosed){for(const [s,v] of Object.entries(watch.active)){watch.terminal.push({...v,terminalState:'EXPIRED',terminalAt:now,terminalReason:'REGULAR_SESSION_CLOSED'});delete watch.active[s];}}
  watch.terminal=watch.terminal.slice(-500);watch.updatedAt=now;await store.setJSON(`${KEY_PREFIX}${dateKey}`,watch);return watch;
}
