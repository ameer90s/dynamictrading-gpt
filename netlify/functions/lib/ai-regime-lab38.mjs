/** Shadow-only AI regime learning and walk-forward evaluation. Never changes risk gates. */
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function learnRegimePatterns38({closedPositions=[],asOfDay,regime='UNKNOWN',minimum=30}={}){
 if(!/^20\d\d-\d\d-\d\d$/.test(asOfDay||''))return {status:'INVALID_AS_OF',patterns:[],eligibleForProduction:false};
 const seen=new Set(),rows=(closedPositions||[]).filter(p=>p?.status==='CLOSED'&&finite(p.netUsd)&&String(p.closedAt||'').slice(0,10)<asOfDay)
 .filter(p=>{const id=p.id||`${p.symbol}:${p.openedAt}`;if(seen.has(id))return false;seen.add(id);return true});
 const groups=new Map();for(const x of rows){const setup=x.setupType||'UNKNOWN',market=x.marketRegime||x.regimeAtEntry||'UNVERIFIED',key=`${market}:${setup}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)}
 const patterns=[...groups].map(([key,v])=>{const [market,setupType]=key.split(':');const netUsd=+v.reduce((a,x)=>a+x.netUsd,0).toFixed(2);return {market,setupType,closed:v.length,wins:v.filter(x=>x.netUsd>0).length,losses:v.filter(x=>x.netUsd<0).length,netUsd,eligibleForLearning:v.length>=minimum,scope:'PRIOR_CLOSED_PAPER_ONLY',tradeAuthorized:false}})
 .sort((a,b)=>(b.market===regime)-(a.market===regime)||b.closed-a.closed);
 return {status:rows.length?'DESCRIPTIVE_ONLY':'INSUFFICIENT_CLOSED_HISTORY',asOfDay,uniqueClosed:rows.length,patterns,marketRegime:regime,eligibleForProduction:false};
}
export function evaluateWalkForward38({baseline=[],candidate=[],minIndependentTrades=60,spreadBps=10,feePerTrade=0}={}){
 const check=rows=>Array.isArray(rows)&&rows.every(x=>finite(x.grossUsd)&&x.independent===true&&x.outOfSample===true&&x.time&&x.id);
 if(!check(baseline)||!check(candidate)||spreadBps<0||feePerTrade<0)return {status:'NOT_VERIFIED_INVALID_SAMPLE',productionAuthorized:false};
 const unique=rows=>[...new Map(rows.map(x=>[x.id,x])).values()];const b=unique(baseline),c=unique(candidate);
 if(b.length<minIndependentTrades||c.length<minIndependentTrades)return {status:'NOT_VERIFIED_INSUFFICIENT_SAMPLE',baselineCount:b.length,candidateCount:c.length,productionAuthorized:false};
 const sum=rows=>rows.reduce((a,x)=>a+(x.grossUsd-2*feePerTrade-(finite(x.notionalUsd)?x.notionalUsd*spreadBps/10000:0)),0);
 const baselineNet=sum(b),candidateNet=sum(c);
 return {status:'RESEARCH_COMPARISON_NOT_INDEPENDENT_AUDIT',baselineNetUsd:+baselineNet.toFixed(2),candidateNetUsd:+candidateNet.toFixed(2),improvementUsd:+(candidateNet-baselineNet).toFixed(2),independentAudit:false,productionAuthorized:false};
}
