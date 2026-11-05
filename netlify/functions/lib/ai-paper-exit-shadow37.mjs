/**
 * Independent as-of 1-minute PAPER shadow only; does NOT alter baseline position
 * status, stop, target, fills or official PnL. Disabled by default at call site.
 */
import {createPaperExit,applyCompletedCandle,closePaperAtSessionEnd} from './ai-paper-exit37.mjs';
export function updateAiExitShadow37(record, completedBars=[], {forceClose=false}={}) {
  const p=record?.position;
  if(!p || p.status!=='OPEN')return record;
  let shadow=p.adaptiveExitShadow37;
  if(!shadow){
    try{shadow=createPaperExit({entry:p.entry,initialStop:p.stop,target:p.target,
      quantity:p.qty,feeRoundTrip:p.feesUsd||0,partialFraction:0.5});}
    catch{return {...record,position:{...p,adaptiveExitShadow37:{mode:'PAPER_SHADOW_ONLY',status:'INVALID_INITIAL_RISK',netUsd:null}}};}
  }
  if(shadow.status!=='OPEN')return {...record,position:{...p,adaptiveExitShadow37:shadow}};
  const ordered=[...completedBars].filter(b=>b?.datetime && String(b.datetime)>String(p.openedBarTime||'') &&
    (!shadow.lastCompletedAt || String(b.datetime)>shadow.lastCompletedAt))
    .sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
  for(const b of ordered){
    try{shadow=applyCompletedCandle(shadow,b);}
    catch{shadow={...shadow,status:'INVALID_BAR_NO_PNL',netUsd:null,errorAt:String(b.datetime)};break;}
    if(shadow.status!=='OPEN')break;
  }
  if(forceClose&&shadow.status==='OPEN'){
    const latest=ordered.at(-1);
    const lastClose=latest?.close??shadow.lastCompletedClose;
    const lastAt=latest?.datetime??shadow.lastCompletedAt;
    shadow=lastClose!=null?closePaperAtSessionEnd(shadow,lastClose,lastAt):
      {...shadow,status:'UNPRICED_AT_CLOSE',netUsd:null};
  }
  return {...record,position:{...p,adaptiveExitShadow37:shadow}};
}
