import { getStore } from '@netlify/blobs';
import { recommendationWindow } from './lib/time.mjs';
import { alpacaConfigured } from './lib/alpaca.mjs';
import { refreshScannerLearning } from './lib/learning.mjs';
import {updateShadowSix} from './lib/shadow36.mjs';
const H={Accept:'application/json','APCA-API-KEY-ID':process.env.ALPACA_API_KEY_ID||'','APCA-API-SECRET-KEY':process.env.ALPACA_API_SECRET_KEY||''};
async function barsSince(symbol,iso){const start=new Date(Math.max(Date.parse(iso||new Date().toISOString()),Date.now()-8*3600e3));const u=new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);u.searchParams.set('timeframe','1Min');u.searchParams.set('start',start.toISOString());u.searchParams.set('end',new Date().toISOString());u.searchParams.set('adjustment','raw');u.searchParams.set('feed','iex');u.searchParams.set('sort','asc');u.searchParams.set('limit','1000');const r=await fetch(u,{headers:H});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||`Alpaca ${r.status}`);return (d.bars||[]).map(b=>({t:b.t,o:+b.o,h:+b.h,l:+b.l,c:+b.c}));}
function highestHit(sig){return ['T3','T2','T1'].find(x=>sig.hits.includes(x))||null;}

function shadowAccuracy(sig){
 const rec=String(sig?.recommendedTarget||'').toUpperCase();
 const reached=new Set(sig?.hits||[]);
 const target=rec.includes('T3')?'T3':rec.includes('T2')?'T2':rec.includes('T1')?'T1':null;
 return {mode:'MEASUREMENT_ONLY',recommendedTarget:target||sig?.recommendedTarget||null,reachedRecommendedTarget:target?reached.has(target):null,highestTarget:highestHit(sig),finalOutcome:sig?.finalOutcome||null};
}
function firstFullMinuteAfter(iso){const d=new Date(iso);d.setUTCSeconds(0,0);d.setUTCMinutes(d.getUTCMinutes()+1);return d.getTime();}
export default async()=>{
 const clock=recommendationWindow();if(!clock.isTradingDay||clock.session!=='REGULAR'||clock.minuteOfDay<590||clock.minuteOfDay>960)return new Response('Skipped');if(!alpacaConfigured())return new Response('Skipped: Alpaca required');
 const store=getStore('dynamic-trading'),key=`signal-history-${clock.dateKey}`,p=await store.get(key,{type:'json',consistency:'strong'});if(!p?.signals)return new Response('No signals');
 let changed=false;const now=new Date().toISOString();
 for(const rec of Object.values(p.signals))for(const sig of (rec.confirmedSignals||[])){
   if(!sig.active&&!sig.followAfterStop&&!sig.followAfterT3)continue;
   let bars=[];try{bars=await barsSince(rec.symbol,sig.lastBarAt||sig.confirmedAt);}catch{continue;}
   const safeStart=firstFullMinuteAfter(sig.confirmedAt);
   for(const b of bars){if(Date.parse(b.t)<safeStart)continue;if(sig.lastBarAt&&Date.parse(b.t)<=Date.parse(sig.lastBarAt))continue;sig.lastBarAt=b.t;changed=updateShadowSix(sig,b)||changed;sig.maxPrice=Math.max(+sig.maxPrice||0,b.h);sig.minPrice=Math.min(Number.isFinite(+sig.minPrice)?+sig.minPrice:b.l,b.l);sig.mfePct=Number(((sig.maxPrice/sig.entry-1)*100).toFixed(3));sig.maePct=Number(((sig.minPrice/sig.entry-1)*100).toFixed(3));sig.entryDrawdownPct=sig.maePct;sig.entryDrawdownPrice=Number((sig.entry-sig.minPrice).toFixed(4));if(!sig.hits?.some(x=>['T1','T2','T3'].includes(x))&&(!Number.isFinite(+sig.lowestBeforeRally)||b.l<+sig.lowestBeforeRally)){sig.lowestBeforeRally=b.l;sig.lowestBeforeRallyAt=b.t;sig.timeToLowSec=Math.max(0,(Date.parse(b.t)-Date.parse(sig.confirmedAt))/1000);}if(sig.lowestBeforeRallyAt&&!sig.recoveryAt&&b.h>=sig.entry){sig.recoveryAt=b.t;sig.recoveryTimeSec=Math.max(0,(Date.parse(b.t)-Date.parse(sig.lowestBeforeRallyAt))/1000);}
     if(sig.active){const fresh=[];if(b.h>=sig.t1&&!sig.hits.includes('T1'))fresh.push('T1');if(b.h>=sig.t2&&!sig.hits.includes('T2'))fresh.push('T2');if(b.h>=sig.t3&&!sig.hits.includes('T3'))fresh.push('T3');const slNow=b.l<=sig.sl&&!sig.hits.includes('SL');
       if(slNow&&fresh.length){sig.ambiguous=true;sig.ambiguousAt=b.t;sig.active=false;sig.finalOutcome='AMBIGUOUS';sig.closedAt=b.t;sig.followAfterStop=true;p.events.push({at:now,symbol:rec.symbol,event:'AMBIGUOUS_TARGET_SL_SAME_MINUTE',signalId:sig.signalId,signalAt:sig.confirmedAt});changed=true;break;}
       for(const x of fresh){sig.hits.push(x);p.events.push({at:now,symbol:rec.symbol,event:x,signalId:sig.signalId,signalAt:sig.confirmedAt});if(x==='T2'){sig.preT3Continuation={mode:'SHADOW_MEASUREMENT',status:preT3Status(sig,b),armedAt:b.t,price:b.h,t3:sig.t3,score:preT3Score(sig,b)};}changed=true;}
       if(sig.hits.includes('T3')){sig.finalOutcome='T3';sig.active=false;sig.closedAt=b.t;if(sig.preT3Continuation)sig.preT3Continuation={...sig.preT3Continuation,result:'T3_REACHED',resolvedAt:b.t};sig.shadowAccuracy=shadowAccuracy(sig);sig.followAfterT3=true;sig.postT3Peak=sig.t3;sig.postT3PeakAt=b.t;changed=true;continue;}
       if(slNow){sig.hits.push('SL');if(sig.preT3Continuation?.armedAt)sig.preT3Continuation={...sig.preT3Continuation,result:'FAILED_BEFORE_T3',resolvedAt:b.t};const best=highestHit(sig);sig.finalOutcome=best||'SL';sig.active=false;sig.closedAt=b.t;sig.stoppedAfterTarget=Boolean(best);sig.shadowAccuracy=shadowAccuracy(sig);sig.followAfterStop=true;sig.postSlPeak=sig.sl; // 3.6 research shadow continues after official exit
p.events.push({at:now,symbol:rec.symbol,event:best?`CLOSED_${best}_BEFORE_SL`:'SL',signalId:sig.signalId,signalAt:sig.confirmedAt});changed=true;continue;}
     }
     if(sig.followAfterStop){sig.postSlPeak=Math.max(Number(sig.postSlPeak||sig.sl),b.h);sig.postSlMfePct=Number(((sig.postSlPeak/sig.entry-1)*100).toFixed(3));for(const [name,val] of [['POST_SL_T1',sig.t1],['POST_SL_T2',sig.t2],['POST_SL_T3',sig.t3]])if(b.h>=val&&!sig.hits.includes(name)){sig.hits.push(name);p.events.push({at:now,symbol:rec.symbol,event:name,signalId:sig.signalId,signalAt:sig.confirmedAt});changed=true;}} // keep watching other shadow targets until session end
     if(sig.followAfterT3){if(b.h>Number(sig.postT3Peak||sig.t3)){sig.postT3Peak=b.h;sig.postT3PeakAt=b.t;changed=true;}sig.postT3MfePct=Number(((Number(sig.postT3Peak||sig.t3)/sig.t3-1)*100).toFixed(3));sig.postT3GivebackPct=Number(((Number(sig.postT3Peak||sig.t3)-b.c)/Number(sig.postT3Peak||sig.t3)*100).toFixed(3));}
   }
   if(sig.active&&clock.minuteOfDay>=959){const best=highestHit(sig);sig.finalOutcome=best||'EXPIRED';sig.active=false;sig.closedAt=now;sig.shadowAccuracy=shadowAccuracy(sig);p.events.push({at:now,symbol:rec.symbol,event:`SESSION_${sig.finalOutcome}`,signalId:sig.signalId,signalAt:sig.confirmedAt});changed=true;}
   if(clock.minuteOfDay>=959){sig.followAfterStop=false;sig.followAfterT3=false;for(const x of Object.values(sig.shadowTargets||{})){if(x.status==='TRACKING')x.status='EXPIRED';x.closedAt=now;}}
 }
 if(changed){p.updatedAt=now;p.events=p.events.slice(-2500);await store.setJSON(key,p);await store.setJSON('signal-history-latest',p);await refreshScannerLearning(store,p);}return new Response(changed?'Outcomes updated':'No changes');
};

function preT3Score(sig,b){const f=sig?.features||{};let z=0;z+=Math.min(25,Number(f.relativeVolume||0)*10);z+=Math.min(20,Number(f.mtfAlignment||0)*.2);z+=Math.min(20,Math.max(0,Number(f.retestQuality||0))*.2);z+=Math.min(15,Math.max(0,Number(f.setupQuality||0))*.15);z+=f.quoteFresh?10:0;z+=Number(f.spreadBps||999)<=20?10:0;return Math.max(0,Math.min(100,Math.round(z)));}
function preT3Status(sig,b){const z=preT3Score(sig,b);return z>=75?'STRONG':z>=55?'NEUTRAL':'WEAK';}

