/** Alpaca Live-Paper port of frozen research candidate lifecycle.
 * 1) Opening research eligibility; 2) historical 3.5-style as-of discovery
 * used by original study (NOT 3.5's production scoring/classifyV32);
 * 3) retest candidate from last completed bar; 4) pending stop order for 3 bars;
 * 5) live authentic bid/ask gate. Price cap + opening top8 are visible research
 * constraints: cross-universe top8 requires complete opening scan; when incomplete
 * label the setup OPENING_RANK_UNVERIFIED, not backtest equivalent.
 * No brokerage order API. Quotes are only from authenticated market-data provider.
 */
import {evaluateResearch36,completedSessionRows,shadowSix,RESEARCH36_POLICY} from './research36.mjs';
const R=Object.freeze({openMin:.5,openMax:6.5,volumeRatioMin:.5,openingMomentum5Min:.15,relativeStrengthMin:.1,usdVolumeMin:500000,earliestRetest:631,latestRetest:720,retentionBars:3,minSignalVolume:.75,minReclaimPct:.08,minPullbackPct:.55,maxPullbackPct:3.5,minHodGapPct:.35,maxHodGapPct:3.5,maxBarRangePct:1.0,maxSpreadBps:12,maxQuoteAgeSec:7,maxEntryJumpPct:.35,minEntryHodGapPct:.8,minRiskPct:.45,maxRiskPct:1.10,minHodRoomR:1.35,minRawRewardR:1.0,feeUsd:2,paperCapitalUsd:1000});
const round=(x,n=5)=>x!=null&&Number.isFinite(x)?Number(x.toFixed(n)):null;
const px=(a,b)=>a>0&&b>0?100*(a/b-1):null;
const median=x=>{const a=[...x].sort((a,b)=>a-b);return a.length?(a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2):null;};
const check=(name,value,op,threshold,reason)=>({gate:name,observed:value??null,operator:op,threshold,passed:value!=null&&(op==='>='?value>=threshold:op==='<='?value<=threshold:op==='>'?value>threshold:op==='=='?value===threshold:false),reason});
function series(rows){const e12=[],e26=[],vw=[],hod=[];let a12=0,a26=0,pv=0,v=0,high=0;
 for(let i=0;i<rows.length;i++){const b=rows[i];a12=i===0?b.close:a12+2/13*(b.close-a12);a26=i===0?b.close:a26+2/27*(b.close-a26);pv+=(b.high+b.low+b.close)/3*b.volume;v+=b.volume;high=Math.max(high,b.high);e12.push(a12);e26.push(a26);vw.push(pv/Math.max(1,v));hod.push(high);}
 return {e12,e26,vw,hod};
}
function atrAsOf(rows,idx){if(idx<14)return null;const values=[];for(let i=1;i<=idx;i++)values.push(Math.max(rows[i].high-rows[i].low,Math.abs(rows[i].high-rows[i-1].close),Math.abs(rows[i].low-rows[i-1].close)));return values.slice(-14).reduce((a,b)=>a+b,0)/14;}
function asofCandidate(rows,s,opening){
 const set=new Set(),discovery=[];const found=[];
 const op=rows.map((b,i)=>[b,i]).filter(([b])=>b._time.min>=570&&b._time.min<=584).map(([,i])=>i);
 const five=op.filter(i=>rows[i]._time.min<=574);if(op.length<12||!five.length)return {discovery,found};
 const openingHigh=Math.max(...op.map(i=>rows[i].high)),fiveHi=Math.max(...five.map(i=>rows[i].high));
 const opLast=op.at(-1);
 for(let k=0;k<rows.length;k++){
  const b=rows[k],m=b._time.min;if(m<585||m>R.latestRetest||k<15)continue;
  if(k>0&&m-rows[k-1]._time.min>2)continue;
  if(b.close<3||b.close>200)continue;
  const prev=rows[k-1],priorVol=rows.slice(Math.max(0,k-10),k).map(x=>x.volume);
  const med10=priorVol.length>=7?Math.max(1,median(priorVol)):null;
  const rv=med10?b.volume/med10:0;
  const ret5=px(b.close,rows[k-5].close);
  const green=b.close>b.open;const types=[];
  if(b.close>openingHigh*1.001&&prev.close<=openingHigh*1.001&&green&&rv>=1.5&&ret5>=.15)types.push('FIRST_15M_CANDLE');
  if(b.close>s.e12[k]&&s.e12[k]>s.e26[k]&&b.close>s.vw[k]&&green&&rv>=1.2&&ret5>=.35)types.push('MOMENTUM_CONTINUATION');
  if(b.low<=s.vw[k]*1.001&&b.close>=s.vw[k]*1.0005&&green&&rv>=1.2&&ret5>=.1)types.push('VWAP_RECLAIM');
  const highSinceOpen=Math.max(...rows.slice(opLast+1,k+1).map(x=>x.high));
  if(b.low<=openingHigh*1.002&&b.close>openingHigh*1.001&&highSinceOpen>openingHigh*1.003&&green&&rv>=1.2)types.push('BREAKOUT_RETEST');
  for(const type of types)if(!set.has(type)){set.add(type);discovery.push({type,minute:m,price:b.close});}
  if(m<R.earliestRetest||k<5||b.high<=b.low||b.volume<100)continue;
  const closePosition=(b.close-b.low)/(b.high-b.low);
  if(!(green&&b.close>prev.close&&closePosition>=.65))continue;
  const barRange=100*(b.high-b.low)/b.close;
  if(barRange>1.8)continue;
  const hodGap=px(s.hod[k],b.close),formerHod=s.hod[k-1];
  if(!(hodGap>=R.minHodGapPct&&hodGap<=5))continue;
  const low3=Math.min(b.low,prev.low,rows[k-2].low),pull=px(formerHod,low3);
  if(!(pull>=R.minPullbackPct&&pull<=R.maxPullbackPct))continue;
  const low2=Math.min(b.low,prev.low),pv=s.vw[k],ma=s.e12[k],cl=b.close;
  const supports=[['VWAP',pv,low2<=pv*1.0025&&cl>=pv*1.0005&&prev.close>=pv*.994],
    ['EMA12',ma,low2<=ma*1.0025&&cl>=ma*1.0005&&cl>=pv*.997],
    ['OR5',fiveHi,low2<=fiveHi*1.0025&&cl>=fiveHi*1.0005&&formerHod>fiveHi*1.002],
    ['OR15',openingHigh,low2<=openingHigh*1.0025&&cl>=openingHigh*1.0005&&formerHod>openingHigh*1.002]];
  const prior6=median(rows.slice(Math.max(0,k-6),k).map(x=>x.volume));
  for(const [model,support,ok] of supports){if(!ok||!Number.isFinite(support)||support<=0||cl/support>1.018)continue;
    const signalVol=b.volume/Math.max(prior6,1),reclaim=px(cl,support);
    if(signalVol<R.minSignalVolume||reclaim<R.minReclaimPct||hodGap>R.maxHodGapPct||barRange>R.maxBarRangePct)continue;
    const prior=discovery.filter(x=>x.minute<m&&m-x.minute<=45).at(-1);
    if(!prior)continue;
    const atr=atrAsOf(rows,k);if(!(atr>0&&atr<cl*.035))continue;
    found.push({date:b._time.day,minute:m,sourceModel:prior.type,sourceMinute:prior.minute,retestModel:model,support,
      signalHigh:b.high,signalClose:b.close,localLow:low3,atr,barRange,signalVol,reclaim,pull,hodGap,closePosition,
      trigger:b.high+.03*atr,validUntil:m+R.retentionBars});
  }
 }
 return {discovery,found};
}
function execution(f,c,quote,now){const ask=Number(quote?.ask),bid=Number(quote?.bid),bidSize=Number(quote?.bidSize),askSize=Number(quote?.askSize);
 const age=quote?.timestamp?(new Date(now)-new Date(quote.timestamp))/1000:null;
 const currentParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
 const z=Object.fromEntries(currentParts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const minute=(+z.hour%24)*60+(+z.minute);
 const date=`${z.year}-${z.month}-${z.day}`;
 const spread=ask>0&&bid>0&&ask>=bid?10000*(ask-bid)/((ask+bid)/2):null;
 const stop=ask>0?Math.min(c.localLow*.9985,ask*(1-.0045)):null;
 const hod=f?.hod??null;const target=ask>0&&hod!=null?Math.min(ask+3.5*c.atr,ask+.92*(hod-ask)):null;
 const risk=stop!=null?ask-stop:null,riskPct=risk&&ask>0?100*risk/ask:null;
 const rawR=risk>0?(target-ask)/risk:null;
 const qty=risk>0?Math.min((R.paperCapitalUsd-R.feeUsd/2)/ask,Math.max(0,R.paperCapitalUsd*.0075-R.feeUsd)/risk):null;
 const netGainUsd=qty!=null?(target-ask)*qty-R.feeUsd:null;
 const netLossUsd=qty!=null?(ask-stop)*qty+R.feeUsd:null;
 const netR=netLossUsd>0?netGainUsd/netLossUsd:null;
 const checks=[check('quote_is_authentic_alpaca',String(quote?.source||'').startsWith('Alpaca')?1:0,'==',1,'NO_ALPACA_QUOTE'),
  check('valid_bid_ask_sizes',ask>0&&bid>0&&ask>=bid&&bidSize>0&&askSize>0?1:0,'==',1,'INVALID_LEVEL1'),
  check('quote_age_nonnegative',age,'>=',0,'QUOTE_IN_FUTURE'),check('quote_age_seconds',age,'<=',R.maxQuoteAgeSec,'QUOTE_STALE'),
  check('within_pending_window',minute-c.minute,'<=',R.retentionBars,'PENDING_EXPIRED'),
  check('quote_after_retest_bar',date===c.date&&minute>c.minute?1:0,'==',1,'QUOTE_BEFORE_RETEST_CLOSE'),
  check('spread_bps',spread,'<=',R.maxSpreadBps,'SPREAD_TOO_WIDE'),
  check('ask_above_breakout_trigger',ask,'>=',c.trigger,'WAIT_BREAKOUT_ASK'),
  check('entry_jump_pct',ask>0?Math.abs(px(ask,c.signalClose)):null,'<=',R.maxEntryJumpPct,'PRICE_CHASE'),
  check('previous_hod_gap_pct',hod>0?px(hod,ask):null,'>=',R.minEntryHodGapPct,'HOD_NO_ROOM'),
  check('stop_risk_min_pct',riskPct,'>=',R.minRiskPct-1e-8,'STOP_TOO_CLOSE'),
  check('stop_risk_max_pct',riskPct,'<=',R.maxRiskPct,'STOP_TOO_FAR'),
  check('hod_room_in_R',riskPct>0?px(hod,ask)/riskPct:null,'>=',R.minHodRoomR,'HOD_ROOM_R_INSUFFICIENT'),
  check('blend_reward_in_R',rawR,'>=',R.minRawRewardR,'TARGET_BELOW_1R'),
  check('net_paper_profit_usd',netGainUsd,'>',0,'NET_PROFIT_NOT_POSITIVE')];
 return {checks,stop,target,qty,netR,netGainUsd,netLossUsd,age,spread,riskPct,rawR};
}
export function evaluateLiveResearch36(symbol,candles,spy,quote,opts={}){
 const now=opts.now||new Date();const rows=completedSessionRows(candles,now,{allowHistorical:opts.allowHistorical===true});
 const baseline=evaluateResearch36(symbol,candles,spy,null,{now,allowHistorical:opts.allowHistorical===true,shariaApproved:opts.shariaApproved===true});
 if(!rows.length)return baseline;
 const f=baseline.features||{};
 const open=[check('sharia_approved',opts.shariaApproved===true?1:0,'==',1,'SHARIA_BLOCKED'),
  check('opening_15m_valid',f.openingReady?1:0,'==',1,'OPENING_INCOMPLETE'),
  check('opening_return_min',f.openingReturnPct,'>=',R.openMin,'OPENING_RETURN_LOW'),
  check('opening_return_max',f.openingReturnPct,'<=',R.openMax,'OPENING_RETURN_HIGH'),
  check('opening_momentum5',f.openingMomentum5Pct,'>=',R.openingMomentum5Min,'OPEN_MOMENTUM_WEAK'),
  check('opening_relative_strength',f.relativeStrengthPct,'>=',R.relativeStrengthMin,'RELATIVE_STRENGTH_WEAK'),
  check('opening_volume',f.openingDollarVolume,'>=',R.usdVolumeMin,'OPEN_DOLLAR_VOLUME_LOW'),
  check('opening_volume_ratio',f.openingVolRatio,'>=',R.volumeRatioMin,'OPEN_VOLUME_RATIO_LOW')];
 const openingPassed=open.every(x=>x.passed);
 const s=series(rows),det=openingPassed?asofCandidate(rows,s,f):{discovery:[],found:[]};
 const currentMinute=rows.at(-1)._time.min;
 // A completed signal candle can be used for at most the next THREE minutes.
 const candidate=det.found.filter(x=>currentMinute-x.minute<=R.retentionBars).sort((a,b)=>a.minute-b.minute||a.retestModel.localeCompare(b.retestModel))[0]||null;
 const foundPending=!!candidate;
 const hod=rows.length?Math.max(...rows.map(x=>x.high)):null;
 const ex=openingPassed&&candidate?execution({hod},candidate,quote,now):null;
 const checks=[...open,...(candidate?[check('retail_retest_from_asof_setup',1,'==',1,'RETEST_MISSING'),
  check('retest_after_1030',candidate.minute,'>',630,'BEFORE_1030'),check('last_new_retest_before_noon',candidate.minute,'<=',720,'AFTER_1200')]:[check('retest_candidate',0,'==',1,'WAIT_RETEST')]),...(ex?.checks||[])];
 let state='WAIT',reason='WAIT_OPENING';
 if(currentMinute>=585){state=openingPassed?'SMART':'WAIT';reason=open.find(x=>!x.passed)?.reason||'WAIT_VALID_RETEST';}
 if(openingPassed&&candidate){reason=ex?.checks.find(x=>!x.passed)?.reason||'PAPER_CONFIRMED';if(ex?.checks.every(x=>x.passed))state='CONFIRMED';}
 const risk=state==='CONFIRMED'?{entry:round(quote.ask),stop:round(ex.stop),exitTarget:round(ex.target),qty:round(ex.qty,6),
  netRewardR:round(ex.netR),netGainUsd:round(ex.netGainUsd,2),netLossUsd:round(ex.netLossUsd,2),rawRewardR:round(ex.rawR),
  shadow:shadowSix(quote.ask,ex.stop,candidate.atr,hod,rows),ts:now.toISOString(),quoteTimestamp:quote.timestamp}:null;
 const quoteDetail={bid:Number.isFinite(Number(quote?.bid))?Number(quote?.bid):null,ask:Number.isFinite(Number(quote?.ask))?Number(quote?.ask):null,
  bidSize:quote?.bidSize??null,askSize:quote?.askSize??null,timestamp:quote?.timestamp??null,
  ageSec:round(ex?.age,2),spreadBps:round(ex?.spread,2),source:quote?.source||'MISSING'};
 const trace={...baseline,state,reason,features:{...f,source:'ALPACA_COMPLETED_BARS',openingRank:opts.openingRank??null,
  openingRankVerification:opts.openingRank==null?'NOT_FULLY_VERIFIED':'PARTIAL_LIVE_UNIVERSE'},
  openingChecks:open,confirmationChecks:checks.slice(open.length,open.length+(candidate?3:1)),executionChecks:ex?.checks||[],checks,
  quote:quoteDetail,risk,retestModel:candidate?.retestModel||null,retestSupport:candidate?.support??null,
  trigger:round(candidate?.trigger),pendingCandidate:candidate?{...candidate}:null,
  recentDiscoveredSetups:det.discovery.slice(-8),seenRetestEvents:det.found.length,
  researchPolicy:'FROZEN_LATE_BREAKOUT_V36_WITH_LIVE_QUOTE_GATES',
  candidateDetector:'ASOF_RETEST_AND_DISCOVERY_MATCHES_PYTHON_PROXY_RULES',
  historicalEquivalenceStatus:'REQUIRES_LIVE_OPENING_TOP8_AND_REAL_QUOTES',
  eventKey:`${f.day}:${symbol}:${candidate?.minute??currentMinute}:${state}:${candidate?.retestModel||'NONE'}`};
 return trace;
}
// Pure as-of candidate inspection for verification and decision audits.
export function inspectResearchCandidates36(candles,now,{allowHistorical=false}={}){
 const rows=completedSessionRows(candles,now,{allowHistorical});
 if(!rows.length)return {discovery:[],found:[]};
 return asofCandidate(rows,series(rows));
}
