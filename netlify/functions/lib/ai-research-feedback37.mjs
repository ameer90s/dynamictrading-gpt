/** Research learning overlay for both independent PAPER scanners.
 * Never changes production strategy or broker orders; research suggestions need approval.
 */
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const TYPES=['EARLY','RETEST','BREAKOUT_CONTINUATION','VWAP_RECLAIM','RANGE_REVERSAL'];
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]};
export function classifyMarket37(features=[]){
 const f=features.filter(x=>x&&finite(x.benchmarkMovePct)&&finite(x.atrPct));
 if(f.length<3)return {regime:'UNKNOWN',confidence:0,reason:'INSUFFICIENT_CROSS_SECTION'};
 const move=median(f.map(x=>x.benchmarkMovePct)),atr=median(f.map(x=>x.atrPct));
 const breadth=f.filter(x=>finite(x.momentum5Pct)&&x.momentum5Pct>0).length/f.length;
 const liquid=f.filter(x=>finite(x.openingDollarVolume)&&x.openingDollarVolume>=200000).length/f.length;
 const trend=move>.3&&breadth>.6?'TREND_UP':move<-.3&&breadth<.4?'TREND_DOWN':'RANGE';
 const volatility=atr>=.75?'HIGH_VOL':atr<=.18?'LOW_VOL':'NORMAL_VOL';
 return {regime:`${trend}_${volatility}_${liquid<.5?'THIN_LIQUIDITY':'LIQUID'}`,confidence:Math.min(1,f.length/15),sample:f.length,move,atr,breadth,liquid};
}
export function learnFromClosed37(outcomes=[],asOfDay){
 const seen=new Set(),rows=outcomes.filter(x=>x&&x.status==='CLOSED'&&finite(x.netUsd)&&TYPES.includes(x.setupType)&&String(x.closedAt||'').slice(0,10)<asOfDay).filter(x=>{const id=x.id||`${x.symbol}:${x.openedAt}`;if(seen.has(id))return false;seen.add(id);return true});
 const byType={};for(const type of TYPES){const a=rows.filter(x=>x.setupType===type),wins=a.filter(x=>x.netUsd>0).length,sum=a.reduce((s,x)=>s+x.netUsd,0);byType[type]={sample:a.length,netUsd:+sum.toFixed(2),smoothedWinRate:(wins+5)/(a.length+10),eligibleForResearch:a.length>=30,productionApproved:false};}
 return {asOfDay,uniqueClosed:rows.length,byType,policy:'PRIOR_CLOSED_ONLY_DEDUPLICATED'};
}
export function discoverCandidateSetups37(f,market){
 if(!f||market.regime==='UNKNOWN')return [];
 const ideas=[];
 if(f.closePosition>=.75&&f.volumeRatio>=1.5&&f.momentum5Pct>=.35)ideas.push({type:'BREAKOUT_CONTINUATION',reason:'VOLUME_MOMENTUM_CONFLUENCE'});
 if(f.price>f.vwap&&f.priorClose<f.vwap&&f.volumeRatio>=1.2)ideas.push({type:'VWAP_RECLAIM',reason:'PRICE_RECLAIMED_VWAP'});
 if(market.regime.startsWith('RANGE')&&f.rsi14<=35&&f.closePosition>=.5)ideas.push({type:'RANGE_REVERSAL',reason:'OVERSOLD_RANGE_REVERSION'});
 return ideas.map(x=>({...x,status:'DISCOVERED_UNTESTED',canEnterTrade:false}));
}
export function researchAgentLearningLayer37({scannerOutcomes=[],aiOutcomes=[],asOfDay,proposals=[],experiments=[]}={}){
 const scanner=learnFromClosed37(scannerOutcomes,asOfDay),ai=learnFromClosed37(aiOutcomes,asOfDay);
 const exp=new Map(experiments.filter(x=>x?.proposalId).map(x=>[x.proposalId,x]));
 const recommendations=proposals.filter(p=>p&&TYPES.includes(p.setupType)&&Array.isArray(p.evidenceIds)&&p.evidenceIds.length).map(p=>{const e=exp.get(p.id);const verified=e?.outOfSample===true&&e?.independentAudit===true&&e?.netAfterCostsPositive===true&&e?.riskNotWorse===true&&e?.sampleSize>=60;return {id:p.id,setupType:p.setupType,status:verified?'ELIGIBLE_FOR_MANUAL_APPROVAL':'UNTESTED',productionApplied:false};});
 return {layer:'ABOVE_BOTH_SCANNERS',asOfDay,scanner,ai,recommendations,appliesToTrading:false};
}
