/** Independent JavaScript replay of the FROZEN Python late_after_1030 + breakout_2bars + blend research policy.
 * Input: original Alpaca one-minute OHLCV as-of candidate event stream and bars (no quotes).
 * NEVER use these simulated fills as a live quote or a broker fill.
 * Implementation matches entry_dynamic_research.py and best_selected_robustness.py policy.
 */
export const FROZEN_RESEARCH_POLICY=Object.freeze({validationMinuteStrictlyAfter:630,spreadBps:5,slippageBpsPerSide:2.5,roundTripFeeUsd:2,startingCapital:1000,maxHoldMinutes:90,plannedRiskPct:.75,maxEntryJumpPct:.35,minHodGapPct:.8,minHodRoomR:1.35,minRiskPct:.45,maxRiskPct:1.10,minRewardR:1.0,pendingBars:3,holdOnePerDay:true});
const eq=(x,y)=>Math.abs(x-y)<=1e-8;
const p100=(x,y)=>100*(x/y-1);
function indexFor(a,m){let lo=0,hi=a.length;while(lo<hi){const k=(lo+hi)>>1;if(a[k][0]<m)lo=k+1;else hi=k;}return lo;}
function stopFor(entry,localLow){return Math.max(0,Math.min(localLow*.9985,entry*(1-.0045)));}
export function validateCandidateAsOf(r,a){
  const ix=indexFor(a,r.validation_minute);
  if(ix>=a.length||!eq(a[ix][0],r.validation_minute)||ix<20)return {valid:false,reason:'BAR_NOT_AVAILABLE_ASOF'};
  for(let z=Math.max(1,ix-14);z<=ix;z++)if(a[z][0]-a[z-1][0]>2)return {valid:false,reason:'NONCONTIGUOUS_BARS'};
  const trs=[];for(let j=1;j<=ix;j++){const b=a[j],prev=a[j-1];trs.push(Math.max(b[2]-b[3],Math.abs(b[2]-prev[4]),Math.abs(b[3]-prev[4])));}
  const atr=trs.slice(-14).reduce((x,y)=>x+y,0)/14;
  if(!(atr>0&&atr<a[ix][4]*.035))return {valid:false,reason:'ATR_INVALID'};
  if(Math.abs(atr-r.atr)>1e-7 || Math.abs(a[ix][2]-r.signal_high)>1e-7)return {valid:false,reason:'CANDIDATE_ASOF_FEATURE_MISMATCH',atr,expectedAtr:r.atr};
  return {valid:true,reason:'VALID_ASOF',atr};
}
export function validateCandidateEntry(r,a,policy=FROZEN_RESEARCH_POLICY){
  const ix=r.bar_ix,signalAt=r.validation_minute;
  const half=policy.spreadBps/20000,slip=policy.slippageBpsPerSide/10000;
  const level=r.signal_high+.03*r.atr;
  let entryIx=null,entry=null;
  for(let j=ix+1;j<Math.min(ix+4,a.length);j++){
    if(a[j][0]!==signalAt+(j-ix))break;
    const askOpen=a[j][1]*(1+half),askHigh=a[j][2]*(1+half);
    if(askHigh>=level){entryIx=j;entry=Math.max(askOpen,level)*(1+slip);break;}
  }
  if(entryIx===null)return {valid:false,reason:'NO_BREAKOUT_FILL_WITHIN_3_BARS'};
  if(Math.abs(p100(entry,r.signal_close))>policy.maxEntryJumpPct)return {valid:false,reason:'EXCESS_ENTRY_JUMP'};
  const hod=Math.max(...a.slice(0,entryIx).map(x=>x[2]));
  if(p100(hod,entry)<policy.minHodGapPct)return {valid:false,reason:'HOD_ROOM_BELOW_0P8'};
  const stop=stopFor(entry,r.local_low),risk=entry-stop,riskPct=100*risk/entry;
  if(riskPct<policy.minRiskPct-1e-8||riskPct>policy.maxRiskPct)return {valid:false,reason:'RISK_OUTSIDE_ALLOWED'};
  if(p100(hod,entry)/riskPct<policy.minHodRoomR)return {valid:false,reason:'HOD_REWARD_RISK_INSUFFICIENT'};
  return {valid:true,entryIx,entryMinute:a[entryIx][0],entry,stop,hod,atr:r.atr,risk,riskPct,entryLevel:level};
}
export function replayExit(r,e,a,policy=FROZEN_RESEARCH_POLICY){
  const target=Math.min(e.entry+3.5*e.atr,e.entry+.92*(e.hod-e.entry));
  const rewardR=(target-e.entry)/e.risk;
  if(rewardR<policy.minRewardR||target<=e.entry)return {valid:false,reason:'REWARD_R_TOO_SMALL',target,rewardR};
  const half=policy.spreadBps/20000,slip=policy.slippageBpsPerSide/10000;
  const endMinute=Math.min(959,e.entryMinute+policy.maxHoldMinutes);
  const last=indexFor(a,endMinute+1);if(last<=e.entryIx)return {valid:false,reason:'NO_EXIT_BARS'};
  let exitPrice=NaN,exitReason='TIME',exitMinute=a[last-1][0];
  for(let j=e.entryIx;j<last;j++){
    const b=a[j],bidOpen=b[1]*(1-half),bidHigh=b[2]*(1-half),bidLow=b[3]*(1-half);
    if(bidLow<=e.stop){exitPrice=Math.min(bidOpen,e.stop)*(1-slip);exitReason='SL';exitMinute=b[0];break;}
    if(j>e.entryIx&&bidHigh>=target){exitPrice=target*(1-slip);exitReason='TARGET';exitMinute=b[0];break;}
  }
  if(!Number.isFinite(exitPrice))exitPrice=a[last-1][4]*(1-half)*(1-slip);
  return {valid:true,target,exitPrice,exitReason,exitMinute,rewardR};
}
export function replayFrozenAlpaca40(fixture,policy=FROZEN_RESEARCH_POLICY){
  const events=(fixture.events||[]),byDay=new Map(),checks=[];
  for(const r of events){const a=fixture.bars?.[`${r.date}|${r.symbol}`];if(!a){checks.push({date:r.date,symbol:r.symbol,validationMinute:r.validation_minute,passed:false,reason:'BARS_MISSING'});continue;}
    const diagnostic=validateCandidateAsOf(r,a);checks.push({date:r.date,symbol:r.symbol,validationMinute:r.validation_minute,model:r.retest_model,passed:diagnostic.valid,reason:diagnostic.reason});
    if(!diagnostic.valid)continue;
    if(r.validation_minute<=policy.validationMinuteStrictlyAfter)continue;
    const group=byDay.get(r.date)||[];group.push(r);byDay.set(r.date,group);
  }
  let equity=policy.startingCapital,peak=equity,maxDrawdown=0;const trades=[],rejections={};
  const reject=key=>rejections[key]=(rejections[key]||0)+1;
  for(const day of [...byDay.keys()].sort()){
    const selected=byDay.get(day).sort((a,b)=>a.validation_minute-b.validation_minute||a.rank-b.rank||b.vol_ratio-a.vol_ratio||a.symbol.localeCompare(b.symbol)||a.retest_model.localeCompare(b.retest_model));
    let pendingUntil=-1;
    for(const r of selected){if(r.validation_minute<=pendingUntil)continue;
      const a=fixture.bars[`${r.date}|${r.symbol}`];const e=validateCandidateEntry(r,a,policy);
      if(!e.valid){pendingUntil=r.validation_minute+policy.pendingBars;reject('ENTRY_INVALID_OR_NOT_FILLED');continue;}
      const x=replayExit(r,e,a,policy);
      if(!x.valid){reject('TARGET_TOO_CLOSE_OR_LOW_RR');continue;}
      const plannedRisk=Math.max(0,equity*(policy.plannedRiskPct/100)-policy.roundTripFeeUsd);
      const qty=Math.min(Math.max(0,equity-policy.roundTripFeeUsd/2)/e.entry,plannedRisk/e.risk);
      if(!(qty>0))continue;
      const pnl=qty*(x.exitPrice-e.entry)-policy.roundTripFeeUsd;
      equity+=pnl;peak=Math.max(peak,equity);maxDrawdown=Math.min(maxDrawdown,equity/peak-1);
      trades.push({date:day,symbol:r.symbol,retest_model:r.retest_model,validation_minute:r.validation_minute,
        entry_minute:e.entryMinute,exit_minute:x.exitMinute,entry:e.entry,stop:e.stop,target:x.target,exit:x.exitPrice,
        reason:x.exitReason,qty,net_pnl_usd:pnl,equity_usd:equity,hod_gap_pct:p100(e.hod,e.entry),atr:e.atr,risk_pct:e.riskPct,reward_r:x.rewardR});
      break;
    }
  }
  return {trades,summary:{trades:trades.length,wins:trades.filter(x=>x.net_pnl_usd>0).length,
    ending_equity:+equity.toFixed(4),net_pct:+(100*(equity/policy.startingCapital-1)).toFixed(5),
    maxdd_pct:+(maxDrawdown*100).toFixed(5),rejections},
    audit:{inputEvents:events.length,validatedAsOf:checks.filter(x=>x.passed).length,rejectedAsOf:checks.filter(x=>!x.passed).length,
      researchTradingDays:[...byDay.keys()].length,allRawDates:[...new Set(events.map(x=>x.date))].length},checks};
}
