// Dynamic Trading 3.5 SMART Focus Queue (#43-#50).
// All SMART candidates remain persistent; only the highest-priority candidates
// receive heavy revalidation each cycle. No candidate is deleted because of rank.
export const SMART_FOCUS_SIZE=12;
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
export function focusPriority(item={}){
  const m=item.metrics||{}; const prev=item.previousMetrics||{};
  const conf=n(item.confidence), setup=n(m.setupQuality), retest=n(m.retestQuality), rv=n(m.relativeVolume), rs=n(m.relativeStrengthPct), chase=n(m.chaseDistanceAtr,9), room=n(m.roomR), spread=n(m.spreadBps,999), age=n(item.smartAgeMin);
  const dConf=conf-n(prev.confidence,conf), dRv=rv-n(prev.relativeVolume,rv), dRs=rs-n(prev.relativeStrengthPct,rs), dRetest=retest-n(prev.retestQuality,retest);
  const state=String(item.stateReason||m.setupState||'');
  const nearConfirmed=/WAIT_TRIGGER|WAIT_CONFIRMATION|WAIT_RETEST|WAIT_RECLAIM|WAIT_BREAKOUT|WAIT_MOMENTUM|WAIT_RETEST_HOD/.test(state)?18:0;
  const momentum=String(m.setupFamily||'')==='MOMENTUM_CONTINUATION'?8:0;
  const execution=clamp(12-Math.max(0,chase-.55)*10-Math.max(0,spread-35)/20, -10,12);
  const trend=clamp(dConf*.7+dRv*8+dRs*8+dRetest*.25,-12,16);
  const freshness=clamp(8-age*.35,-5,8);
  const score=conf*.25+setup*.14+retest*.10+clamp(rv*35,0,100)*.10+clamp(50+rs*45,0,100)*.08+clamp(room*30,0,100)*.07+nearConfirmed+momentum+execution+trend+freshness;
  return {score:Number(score.toFixed(2)),components:{nearConfirmed,momentum,execution:Number(execution.toFixed(2)),trend:Number(trend.toFixed(2)),freshness:Number(freshness.toFixed(2)),dConfidence:Number(dConf.toFixed(2)),dRvol:Number(dRv.toFixed(2)),dRs:Number(dRs.toFixed(2)),dRetest:Number(dRetest.toFixed(2))}};
}
export function rankSmartWatch(watch={},now=new Date()){
  const rows=Object.values(watch?.active||{}).map(x=>{const first=new Date(x.firstSmartAt||now);const age=Math.max(0,(now-first)/60000);const p=focusPriority({...x,smartAgeMin:age});return {...x,smartAgeMin:Number(age.toFixed(1)),focusScore:p.score,focusComponents:p.components};}).sort((a,b)=>b.focusScore-a.focusScore||n(b.confidence)-n(a.confidence));
  return rows.map((x,i)=>({...x,focusRank:i+1,focusTier:i<5?'1-5':i<SMART_FOCUS_SIZE?'6-12':i<20?'13-20':'21+'}));
}
export function selectSmartFocus(watch={},size=SMART_FOCUS_SIZE){const ranked=rankSmartWatch(watch);return {ranked,focus:ranked,background:[]};}
export async function persistFocusRanks(store,dateKey,watch,ranked=[]){
  if(!store||!watch)return watch; const by=new Map(ranked.map(x=>[x.symbol,x]));
  for(const [s,v] of Object.entries(watch.active||{})){const r=by.get(s);if(r)watch.active[s]={...v,focusRank:r.focusRank,focusTier:r.focusTier,focusScore:r.focusScore,focusComponents:r.focusComponents};}
  watch.focusUpdatedAt=new Date().toISOString(); await store.setJSON(`smart-watch-${dateKey}`,watch); return watch;
}
export function confirmationDiagnostics(watch={},data={}){
  const counts={WAIT_HOD:0,WAIT_CHASE:0,WAIT_RETEST:0,WAIT_SPREAD:0,WAIT_CONFIDENCE:0,WAIT_MOMENTUM:0,WAIT_TRIGGER:0,WAIT_LIQUIDITY:0,WAIT_FRESH_QUOTE:0,OTHER:0};
  for(const x of Object.values(watch.active||{})){const r=String(x.stateReason||'');if(/HOD/.test(r))counts.WAIT_HOD++;else if(/CHASE/.test(r))counts.WAIT_CHASE++;else if(/RETEST/.test(r))counts.WAIT_RETEST++;else if(/SPREAD/.test(r))counts.WAIT_SPREAD++;else if(/CONFIDENCE/.test(r))counts.WAIT_CONFIDENCE++;else if(/MOMENTUM/.test(r))counts.WAIT_MOMENTUM++;else if(/TRIGGER|CONFIRMATION|BREAKOUT|RECLAIM/.test(r))counts.WAIT_TRIGGER++;else if(/LIQUID/.test(r))counts.WAIT_LIQUIDITY++;else if(/FRESH_QUOTE/.test(r))counts.WAIT_FRESH_QUOTE++;else counts.OTHER++;}
  const confirmed=(data.all||[]).filter(x=>x.recommendationState==='CONFIRMED').length;
  return {activeSmart:Object.keys(watch.active||{}).length,confirmedThisCycle:confirmed,blockers:counts};
}

export function applyFocusMetadata(data={},ranked=[]){const by=new Map(ranked.map(x=>[x.symbol,x]));const add=r=>{const x=by.get(r?.symbol);return x?{...r,focusRank:x.focusRank,focusTier:x.focusTier,focusScore:x.focusScore}:r;};return {...data,all:(data.all||[]).map(add),display8:(data.display8||[]).map(add),top5:(data.top5||[]).map(add)};}
