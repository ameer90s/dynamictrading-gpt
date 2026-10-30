import { getStore } from '@netlify/blobs';
import { reserveApiMinute } from './lib/credits.mjs';
import { alpacaConfigured } from './lib/alpaca.mjs';
import { fetchHistoricalBundle } from './lib/history.mjs';

const PROFILES=[
  {id:'ACTIVE',label:'Active Flexible 0.6–1.0%',minRvol:.75,minBreakoutVolume:.92,minConfirmationVolume:.90,maxRetestMinutes:28,maxChaseAtr:1.05,maxConfirmationAgeMinutes:12,maxSpreadBps:35,target1Pct:.006,target2Pct:.008,target3Pct:.010,minStopPct:.0050,maxStopPct:.0085},
  {id:'BASE',label:'High Precision الأساسي',minRvol:1.50,minBreakoutVolume:1.15,minConfirmationVolume:1.15,maxRetestMinutes:15,maxChaseAtr:.60,maxConfirmationAgeMinutes:6,maxSpreadBps:20},
  {id:'TIGHT',label:'Tight Momentum',minRvol:1.70,minBreakoutVolume:1.25,minConfirmationVolume:1.20,maxRetestMinutes:10,maxChaseAtr:.45,maxConfirmationAgeMinutes:5,maxSpreadBps:16},
  {id:'PATIENT',label:'Patient Retest',minRvol:1.55,minBreakoutVolume:1.20,minConfirmationVolume:1.15,maxRetestMinutes:25,maxChaseAtr:.55,maxConfirmationAgeMinutes:6,maxSpreadBps:18},
  {id:'VOLUME',label:'Volume Confirmation',minRvol:1.85,minBreakoutVolume:1.30,minConfirmationVolume:1.25,maxRetestMinutes:15,maxChaseAtr:.55,maxConfirmationAgeMinutes:5,maxSpreadBps:16},
];

export default async(req)=>{
  const store=getStore('dynamic-trading');
  if(req.method==='POST')return applyProfile(req,store);
  if(req.method!=='GET')return json({error:'Method not allowed'},405);
  const tdKey=process.env.TWELVE_DATA_API_KEY;
  if(!tdKey&&!alpacaConfigured())return json({error:'أضف Twelve Data أو Alpaca لتشغيل Backtest التاريخي'},500);
  const url=new URL(req.url);const symbol=cleanSymbol(url.searchParams.get('symbol')||'PLTR');const months=Math.max(3,Math.min(12,Number(url.searchParams.get('months')||6)));
  if(!symbol)return json({error:'رمز سهم غير صالح'},400);
  try{
    const dayKey=new Date().toISOString().slice(0,10),cacheKey=`backtest-v30-${dayKey}-${symbol}-${months}m`;
    const cached=await store.get(cacheKey,{type:'json',consistency:'strong'});if(cached)return json({...cached,cached:true,cacheNote:'تم عرض Backtest التاريخي المحفوظ لليوم بدون طلبات جديدة.'},200,{'Cache-Control':'no-store'});
    if(!alpacaConfigured()){
      const budget=await reserveApiMinute(store,'historical-backtest',6);if(!budget.allowed)return json({error:`انتظر ${budget.waitSeconds} ثانية. Backtest عدة أشهر يحتاج نافذة بيانات مستقلة.`,creditWaitSeconds:budget.waitSeconds},429);
    }
    const bundle=await fetchHistoricalBundle(symbol,tdKey,{months});
    const appliedMap=await store.get('symbol-profiles-v24',{type:'json',consistency:'strong'})||{};
    const currentProfile=appliedMap[symbol]?.enabled?appliedMap[symbol]:(PROFILES.find(x=>x.id==='ACTIVE')||PROFILES[0]);
    const profileResults=PROFILES.map(profile=>runProfile(symbol,bundle.stock,bundle.spy,bundle.qqq,profile));
    const ranked=[...profileResults].sort((a,b)=>profileScore(b)-profileScore(a));
    const best=ranked.find(x=>x.trades>0&&x.outOfSample?.trades>0)||null;
    const evidenceReady=Boolean(best&&best.trades>=12&&best.outOfSample?.trades>=5&&best.outOfSample.expectancy>=.10&&Number(best.outOfSample.profitFactor||0)>=1.20&&best.stability?.positiveSegments>=2&&best.maxDrawdownR<=10);
    const changeNeeded=Boolean(best&&best.profile.id!==(currentProfile.id||'ACTIVE'));
    const eligible=Boolean(evidenceReady&&changeNeeded);
    const baseResult=profileResults.find(x=>x.profile.id===(currentProfile.id||'ACTIVE'))||profileResults.find(x=>x.profile.id==='ACTIVE')||null;
    const improvement=best&&baseResult?{
      expectancyDelta:Number((Number(best.outOfSample?.expectancy||0)-Number(baseResult.outOfSample?.expectancy||0)).toFixed(2)),
      winRateDeltaPct:Number(((Number(best.outOfSample?.winRate||0)-Number(baseResult.outOfSample?.winRate||0))*100).toFixed(1)),
      drawdownDeltaR:Number((Number(best.maxDrawdownR||0)-Number(baseResult.maxDrawdownR||0)).toFixed(2))
    }:null;
    const proposal=best?{id:best.profile.id,label:best.profile.label,...best.profile,eligibleToApply:eligible,evidenceReady,changeNeeded,improvement,reason:!changeNeeded?'الإعداد الحالي هو الأفضل في هذا الاختبار؛ لا يوجد تعديل مطلوب.':eligible?'المقترح اجتاز شروط العينة وOOS. لن يُطبق تلقائياً؛ يحتاج موافقتك.':'يوجد فرق تاريخي، لكن العينة/الثبات غير كافيين للتطبيق. يظهر للمراقبة فقط.'}:null;
    const result={symbol,generatedAt:new Date().toISOString(),period:{months,start:bundle.period.startDate,end:bundle.period.endDate},provider:bundle.provider,bars:'5min',currentProfile:{id:currentProfile.id||'ACTIVE',label:currentProfile.label||currentProfile.id||'Active Flexible 0.6–1.0%'},profiles:profileResults,recommendedProfile:proposal,proposalMode:'USER_APPROVAL_REQUIRED',...(best||emptyStats()),note:'Backtest v3.0 تاريخي 3–12 شهراً على 5min. Active Flexible يقارن 15-Minute Candle + Breakout/Retest + VWAP Reclaim + Momentum Continuation ويظل تقريبياً مقارنة بمحرك 1min الحي. يبقي صفقة واحدة كحد أقصى لكل يوم خلال الجلسة النظامية حتى الإغلاق، ويعطي مقترحاً فقط؛ لا يغيّر التوصيات الحية إلا بعد موافقة المستخدم. الأخبار والـSpread التاريخيان غير معادَي البناء.'};
    await store.setJSON(cacheKey,result);await store.setJSON(`backtest-latest-v30-${symbol}`,result);
    return json(result,200,{'Cache-Control':'no-store'});
  }catch(error){return json({error:error.message||'تعذر تشغيل Backtest التاريخي'},502);}
};
export const config={path:'/api/backtest'};

async function applyProfile(req,store){
  const body=await req.json().catch(()=>({}));const symbol=cleanSymbol(body.symbol||'');const profileId=String(body.profileId||'').toUpperCase();
  if(!symbol||!profileId)return json({error:'حدد السهم والإعداد أولاً'},400);
  const last=await store.get(`backtest-latest-v30-${symbol}`,{type:'json',consistency:'strong'});if(!last)return json({error:'شغّل Backtest لهذا السهم أولاً.'},404);
  const rec=last.recommendedProfile;if(!rec||rec.id!==profileId)return json({error:'لا يمكن تطبيق إعداد غير موصى به من آخر Backtest.'},409);
  if(!rec.eligibleToApply)return json({error:'الـOut-of-Sample غير كافٍ لتطبيق هذا الإعداد على التوصيات الحية.'},409);
  const map=await store.get('symbol-profiles-v24',{type:'json',consistency:'strong'})||{};
  map[symbol]={id:rec.id,label:rec.label,enabled:true,minRvol:Number(rec.minRvol),minBreakoutVolume:Number(rec.minBreakoutVolume),minConfirmationVolume:Number(rec.minConfirmationVolume),maxRetestMinutes:Number(rec.maxRetestMinutes),maxChaseAtr:Number(rec.maxChaseAtr),maxConfirmationAgeMinutes:Number(rec.maxConfirmationAgeMinutes),maxSpreadBps:Number(rec.maxSpreadBps),target1Pct:Number(rec.target1Pct||0),target2Pct:Number(rec.target2Pct||0),target3Pct:Number(rec.target3Pct||0),minStopPct:Number(rec.minStopPct||0),maxStopPct:Number(rec.maxStopPct||0),appliedAt:new Date().toISOString(),sourcePeriod:last.period,provider:last.provider};
  await store.setJSON('symbol-profiles-v24',map);
  return json({ok:true,symbol,profile:map[symbol]},200,{'Cache-Control':'no-store'});
}

function runProfile(symbol,stock,spy,qqq,profile){
  const by=groupDays(stock),spyBy=groupDays(spy),qqqBy=groupDays(qqq);
  const dates=[...by.keys()].filter(d=>spyBy.has(d)&&qqqBy.has(d)).sort();
  const trades=[];
  const diag={sessions:0,attempts:0,multiAttemptSessions:0,breakoutFound:0,retestFound:0,confirmationFound:0,first15mFound:0,vwapReclaimFound:0,momentumFound:0,finalSetups:0,rejected:{rows:0,openingRange:0,breakout:0,retest:0,confirmation:0,rvol:0,emaTrend:0,market:0,chase:0,risk:0}};

  for(let di=5;di<dates.length;di++){
    diag.sessions++;
    const date=dates[di],rows=by.get(date).filter(x=>x.m>=570&&x.m<960);
    if(rows.length<20){diag.rejected.rows++;continue;}
    const opening=rows.filter(x=>x.m>=570&&x.m<=580);
    if(opening.length<3){diag.rejected.openingRange++;continue;}
    const orH=Math.max(...opening.map(x=>x.c.high));
    const scanStart=rows.findIndex(x=>x.m>=590);
    const scanEnd=rows.findIndex(x=>x.m>959);
    const endIdx=scanEnd<0?rows.length:scanEnd;
    if(scanStart<0||scanStart>=endIdx){diag.rejected.rows++;continue;}

    let setup=null;
    let cursor=scanStart;
    let sessionAttempts=0;
    let requireReset=false;
    const maxAttempts=6;

    while(cursor<endIdx && sessionAttempts<maxAttempts && !setup){
      let breakoutIndex=-1,atrAtBreakout=0;
      let resetSeen=!requireReset;
      for(let i=cursor;i<endIdx;i++){
        const row=rows[i],a=Math.max(localAtr(rows,i,14),row.c.close*.0025),avgVol=avgPrior(rows,i,6),vr0=avgVol?row.c.volume/avgVol:1;
        if(requireReset && (row.c.low<=orH+a*.14 || row.c.close<=orH+a*.08)) resetSeen=true;
        if(!resetSeen)continue;
        if(row.c.close>orH+a*.05&&row.c.high>orH+a*.08&&row.c.close>row.c.open&&vr0>=profile.minBreakoutVolume){breakoutIndex=i;atrAtBreakout=a;break;}
      }
      if(breakoutIndex<0){if(sessionAttempts===0)diag.rejected.breakout++;break;}

      sessionAttempts++;diag.attempts++;diag.breakoutFound++;
      const a=atrAtBreakout;
      const maxBars=Math.max(2,Math.ceil(profile.maxRetestMinutes/5));
      const retEnd=Math.min(endIdx,breakoutIndex+1+maxBars);
      let retIndex=-1;
      for(let j=breakoutIndex+1;j<retEnd;j++){
        const rr=rows[j];
        if(rr.c.close<orH-a*.30)break;
        if(rr.c.low<=orH+a*.14&&rr.c.close>=orH-a*.05){retIndex=j;break;}
      }
      if(retIndex<0){diag.rejected.retest++;cursor=Math.min(endIdx,breakoutIndex+Math.max(2,maxBars));requireReset=true;continue;}
      diag.retestFound++;

      const maxConfBars=Math.max(2,Math.ceil(profile.maxConfirmationAgeMinutes/5)+1);
      const confEnd=Math.min(endIdx,retIndex+1+maxConfBars);
      let confIndex=-1;
      for(let j=retIndex+1;j<confEnd;j++){
        const cc=rows[j],av=avgPrior(rows,j,6),vr=av?cc.c.volume/av:1,vw=vwapTo(rows,j);
        if(cc.c.close>Math.max(orH+a*.05,rows[retIndex].c.high)&&cc.c.close>cc.c.open&&cc.c.close>vw&&vr>=profile.minConfirmationVolume){confIndex=j;break;}
      }
      if(confIndex<0){diag.rejected.confirmation++;cursor=Math.min(endIdx,retIndex+maxConfBars);requireReset=true;continue;}
      diag.confirmationFound++;

      const conf=rows[confIndex],rv=relativeVolume(by,dates,di,conf.m,rows,confIndex);
      if(rv<profile.minRvol){diag.rejected.rvol++;cursor=confIndex+1;requireReset=true;continue;}
      const closes=rows.slice(0,confIndex+1).map(x=>x.c.close),e9=emaLast(closes,9),e20=emaLast(closes,20);
      if(e9<=e20){diag.rejected.emaTrend++;cursor=confIndex+1;requireReset=true;continue;}
      const market=marketAlignment(date,conf.m,spyBy,qqqBy);
      if(market<0){diag.rejected.market++;cursor=confIndex+1;requireReset=true;continue;}
      const chase=Math.abs(conf.c.close-orH)/Math.max(a,1e-9);
      if(chase>profile.maxChaseAtr){diag.rejected.chase++;cursor=confIndex+1;requireReset=true;continue;}
      const entry=conf.c.close;let stop=Math.min(rows[retIndex].c.low,orH-a*.20);
      if(profile.id==='ACTIVE') stop=boundedStop(entry,stop,profile,a);
      const risk=profile.id==='ACTIVE'?Math.max(Math.abs(entry-stop),entry*Number(profile.minStopPct||.0050)):Math.max(Math.abs(entry-stop),a*.60);
      if(!Number.isFinite(risk)||risk<=0){diag.rejected.risk++;cursor=confIndex+1;requireReset=true;continue;}
      const exit=profile.id==='ACTIVE'?activeExit(entry,risk,profile):(market>1&&rv>=1.8)?{name:'TREND_RUNNER',t1:1,t2:2,t3:3.2}:{name:'STANDARD',t1:1,t2:1.7,t3:2.5};
      setup={date,entry,stop,risk,profile:exit,rv,minute:conf.m,startIndex:confIndex,attemptNumber:sessionAttempts};
      diag.finalSetups++;
    }

    if(!setup && profile.id==='ACTIVE'){
      const flex=findFlexibleHistoricalSetup(date,rows,scanStart,endIdx,by,dates,di,spyBy,qqqBy,profile);
      if(flex){setup=flex;diag.attempts++;diag.finalSetups++;if(flex.setupFamily==='FIRST_15M_CANDLE')diag.first15mFound++;if(flex.setupFamily==='VWAP_RECLAIM')diag.vwapReclaimFound++;if(flex.setupFamily==='MOMENTUM_CONTINUATION')diag.momentumFound++;}
    }
    if(sessionAttempts>1)diag.multiAttemptSessions++;
    if(setup)trades.push({...setup,...simulate(rows,setup)});
  }

  const stats=summarize(trades),split=Math.max(1,Math.floor(trades.length*.70)),ins=summarize(trades.slice(0,split)),oos=summarize(trades.slice(split));
  const thirds=[0,1,2].map(i=>{const a=Math.floor(trades.length*i/3),b=i===2?trades.length:Math.floor(trades.length*(i+1)/3);return summarize(trades.slice(a,b));});
  const positiveSegments=thirds.filter(x=>x.trades>=3&&x.expectancy>0).length;
  return {profile,diagnostics:diag,...stats,inSample:ins,outOfSample:oos,stability:{stable:oos.trades>=5&&oos.expectancy>0&&positiveSegments>=2,positiveSegments,totalSegments:thirds.filter(x=>x.trades>0).length,segments:thirds},recent:trades.slice(-10).reverse()};
}

function findFlexibleHistoricalSetup(date,rows,scanStart,endIdx,by,dates,di,spyBy,qqqBy,profile){
  const start=Math.max(scanStart,rows.findIndex(x=>x.m>=610));
  if(start<0)return null;
  const opening=rows.filter(x=>x.m>=570&&x.m<585);
  const first15High=opening.length?Math.max(...opening.map(x=>x.c.high)):null;
  for(let i=start;i<endIdx;i++){
    const cur=rows[i],a=Math.max(localAtr(rows,i,14),cur.c.close*.0025);if(!(a>0))continue;
    const closes=rows.slice(0,i+1).map(x=>x.c.close),e9=emaLast(closes,9),e20=emaLast(closes,20);if(!(e9>e20))continue;
    const vw=vwapTo(rows,i),priorVw=i>0?vwapTo(rows,i-1):vw;
    const av=avgPrior(rows,i,8),volRatio=av?Number(cur.c.volume||0)/av:1;
    const rv=relativeVolume(by,dates,di,cur.m,rows,i);
    const market=marketAlignment(date,cur.m,spyBy,qqqBy);
    const prev=rows[Math.max(0,i-1)]?.c;

    // Independent first 15-minute candle breakout. It does not require a retest.
    let first15=false;
    if(Number.isFinite(first15High)){
      const lookbackStart=Math.max(0,i-3);
      for(let j=lookbackStart;j<=i;j++){
        const cc=rows[j]?.c,pp=rows[Math.max(0,j-1)]?.c;if(!cc||!pp)continue;
        const avj=avgPrior(rows,j,8),vrj=avj?Number(cc.volume||0)/avj:1;
        if(pp.close<=first15High+a*.04&&cc.close>first15High+a*.04&&cc.close>cc.open&&cc.close>vwapTo(rows,j)&&vrj>=.72){first15=true;break;}
      }
      first15=first15&&cur.c.close>=first15High-a*.05&&cur.c.close>vw;
    }

    const reclaim=Boolean(prev&&prev.low<=priorVw+a*.14&&prev.close>=priorVw-a*.07&&cur.c.close>vw+a*.035&&cur.c.close>cur.c.open&&volRatio>=.72);
    const recent=rows.slice(Math.max(0,i-5),i+1).map(x=>x.c),prior=rows.slice(Math.max(0,i-18),Math.max(0,i-3)).map(x=>x.c);
    const higher=recent.length>=5?recent.slice(1).filter((c,j)=>c.close>=recent[j].close).length:0;
    const localHigh=prior.length?Math.max(...prior.map(c=>c.high)):cur.c.high;
    const recentAvg=recent.length?recent.reduce((x,c)=>x+Number(c.volume||0),0)/recent.length:0;
    const priorAvg=prior.length?prior.reduce((x,c)=>x+Number(c.volume||0),0)/prior.length:0;
    const momentum=cur.c.close>vw&&cur.c.close>=localHigh-a*.15&&higher>=3&&recentAvg>=priorAvg*.68&&cur.c.close>recent[0].close+a*.10;
    if(!first15&&!reclaim&&!momentum)continue;
    if(market<=-2 && cur.c.close<(rows[0]?.c.open||cur.c.close))continue;
    const entry=cur.c.close;let structureStop=entry-a*.75;
    if(first15&&Number.isFinite(first15High))structureStop=Math.min(entry-a*.45,first15High-a*.10);
    let stop=boundedStop(entry,structureStop,profile,a);const risk=Math.max(Math.abs(entry-stop),entry*Number(profile.minStopPct||.0050));if(!(risk>0))continue;
    const exit=activeExit(entry,risk,profile);
    const setupFamily=first15?'FIRST_15M_CANDLE':reclaim?'VWAP_RECLAIM':'MOMENTUM_CONTINUATION';
    return {date,entry,stop,risk,profile:exit,rv,minute:cur.m,startIndex:i,attemptNumber:1,setupFamily};
  }
  return null;
}

function boundedStop(price,structureStop,p,a=0){const baseMin=Math.max(.0040,Number(p.minStopPct||.0050)),atrPct=price>0?Math.max(0,Number(a||0))/price:0,minPct=Math.min(.0070,Math.max(baseMin,atrPct*.55)),maxPct=Math.max(minPct,Math.min(.0085,Number(p.maxStopPct||.0085))),far=price*(1-maxPct),near=price*(1-minPct);return Math.min(Math.max(Number(structureStop||far),far),near);}
function activeExit(price,risk,p){const p1=Number(p.target1Pct||.006),p2=Number(p.target2Pct||.008),p3=Number(p.target3Pct||.010);return{name:'ACTIVE_0.6–1.0%',t1:(price*p1)/risk,t2:(price*p2)/risk,t3:(price*p3)/risk};}
function profileScore(x){const o=x.outOfSample||{};if(!o.trades)return -999;return Number(o.expectancy||0)*12+Math.min(5,Number(o.profitFactor||0))*1.4+Math.min(10,o.trades)*.15-Number(x.maxDrawdownR||0)*.18+(x.stability?.positiveSegments||0)*.8;}
function emptyStats(){return {trades:0,winRate:0,expectancy:0,profitFactor:null,netR:0,maxDrawdownR:0,outOfSample:{trades:0,winRate:0,expectancy:0,profitFactor:null,netR:0,maxDrawdownR:0},stability:{stable:false,positiveSegments:0,totalSegments:0}};}
function summarize(ts){const wins=ts.filter(t=>t.R>0),loss=ts.filter(t=>t.R<0),net=ts.reduce((a,b)=>a+b.R,0),gp=wins.reduce((a,b)=>a+b.R,0),gl=Math.abs(loss.reduce((a,b)=>a+b.R,0));let eq=0,peak=0,dd=0;for(const t of ts){eq+=t.R;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}return{trades:ts.length,winRate:ts.length?wins.length/ts.length:0,expectancy:ts.length?net/ts.length:0,profitFactor:gl?gp/gl:(gp?999:null),netR:net,maxDrawdownR:dd,avgWinR:wins.length?gp/wins.length:0,avgLossR:loss.length?loss.reduce((a,b)=>a+b.R,0)/loss.length:0};}
function simulate(rows,t){const t1=t.entry+t.risk*t.profile.t1,t2=t.entry+t.risk*t.profile.t2,t3=t.entry+t.risk*t.profile.t3;let stage=0,locked=-1,last=t.entry;for(const r of rows.slice(t.startIndex+1)){const hi=r.c.high,lo=r.c.low;last=r.c.close;if(stage===0){if(lo<=t.stop)return{R:-1,result:'SL'};if(hi>=t1){stage=1;locked=0;}}if(stage===1){if(lo<=t.entry)return{R:0,result:'BE_AFTER_T1'};if(hi>=t2){stage=2;locked=.8;}}if(stage===2){if(hi>=t3)return{R:t.profile.t3,result:'T3'};if(lo<=t.entry+t.risk*.8)return{R:.8,result:'TRAIL'};}}const raw=(last-t.entry)/t.risk;return{R:Number(Math.max(locked,Math.min(t.profile.t3,raw)).toFixed(2)),result:'EOD'};}
function groupDays(candles){const m=new Map();for(const c of candles){const p=parts(c.datetime);if(!p)continue;if(!m.has(p.date))m.set(p.date,[]);m.get(p.date).push({c,m:p.min});}for(const a of m.values())a.sort((x,y)=>x.m-y.m);return m;}
function parts(v){const m=String(v).match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);return m?{date:m[1],min:Number(m[2])*60+Number(m[3])}:null;}
function localAtr(rows,i,n){const a=rows.slice(Math.max(0,i-n),i+1);if(a.length<2)return 0;let s=0,k=0;for(let j=1;j<a.length;j++){const c=a[j].c,p=a[j-1].c.close;s+=Math.max(c.high-c.low,Math.abs(c.high-p),Math.abs(c.low-p));k++;}return k?s/k:0;}
function avgPrior(rows,i,n){const a=rows.slice(Math.max(0,i-n),i).map(x=>Number(x.c.volume||0)).filter(v=>v>0);return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function vwapTo(rows,i){let pv=0,v=0;for(const x of rows.slice(0,i+1)){const vol=Number(x.c.volume||0),tp=(x.c.high+x.c.low+x.c.close)/3;pv+=tp*vol;v+=vol;}return v?pv/v:rows[i].c.close;}
function relativeVolume(by,dates,di,minute,rows,ci){const cur=rows.slice(0,ci+1).reduce((a,x)=>a+Number(x.c.volume||0),0),vals=[];for(let k=Math.max(0,di-10);k<di;k++){const r=(by.get(dates[k])||[]).filter(x=>x.m>=570&&x.m<=minute),v=r.reduce((a,x)=>a+Number(x.c.volume||0),0);if(v>0)vals.push(v);}const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;return avg?cur/avg:1;}
function emaLast(vals,p){if(!vals.length)return 0;const k=2/(p+1);let e=vals[0];for(const v of vals.slice(1))e=v*k+e*(1-k);return e;}
function marketAlignment(date,minute,spy,qqq){let score=0;for(const map of [spy,qqq]){const rows=(map.get(date)||[]).filter(x=>x.m>=570&&x.m<=minute);if(rows.length<2)continue;score+=(rows.at(-1).c.close-rows[0].c.open)>=0?1:-1;}return score;}
function cleanSymbol(x){return String(x||'').toUpperCase().replace(/[^A-Z0-9.\-]/g,'').slice(0,12);}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8',...extra}});}
