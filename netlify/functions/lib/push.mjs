import webpush from 'web-push';
import {STRATEGY_VERSION} from './version.mjs';
function configured(){return Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY);}function setup(){if(!configured())return false;webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:alerts@dynamic-trading.local',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);return true;}
export async function sendConfirmedPushes(store,data,dateKey){if(!store)return{sent:0,status:'NO_STORE'};const rows=(data?.display8||[]).filter(x=>x.recommendationState==='CONFIRMED');if(!rows.length)return{sent:0,status:'NO_CONFIRMED'};if(!setup()){for(const r of rows)if(r.signalId)await stamp(store,dateKey,r.signalId,'PUSH_SKIPPED',{reason:'VAPID_NOT_CONFIGURED'});return{sent:0,status:'VAPID_NOT_CONFIGURED'};}const subs=await store.get('push-subscriptions-v33',{type:'json',consistency:'strong'})||[];if(!subs.length){for(const r of rows)if(r.signalId)await stamp(store,dateKey,r.signalId,'PUSH_SKIPPED',{reason:'NO_SUBSCRIPTIONS'});return{sent:0,status:'NO_SUBSCRIPTIONS'};}const notified=await store.get(`push-notified-${dateKey}`,{type:'json',consistency:'strong'})||{};let sent=0,failed=0;
 for(const r of rows){const key=r.signalId||`${dateKey}:${r.symbol}:${r.metrics?.setupFamily||'SETUP'}:${Number(r.entryLow||0).toFixed(2)}-${Number(r.entryHigh||0).toFixed(2)}`;if(notified[key])continue;const attemptedAt=new Date().toISOString();await stamp(store,dateKey,key,'PUSH_ATTEMPTED',{attemptedAt,subscriberCount:subs.length});const confirmedAt=r.signalId?await signalTime(store,dateKey,r.signalId):null;const latencyMs=Math.max(0,Date.now()-Date.parse(confirmedAt||data.generatedAt||attemptedAt));const tp=r.recommendedTarget?` · Shadow ${r.recommendedTarget}`:'';const body=`${r.symbol} · دخول ${Number(r.entryLow).toFixed(2)}–${Number(r.entryHigh).toFixed(2)}${tp} · SL ${Number(r.stopLoss).toFixed(2)}`;const payload=JSON.stringify({title:`🟢 CONFIRMED PAPER · ${r.symbol}`,body,url:'/?alert=confirmed',tag:`dynamic-trading-${key}`,signalId:key,symbol:r.symbol,confirmedAt:r.confirmedAt||data.generatedAt||null,pushSentAt:attemptedAt,version:STRATEGY_VERSION});const alive=[];let accepted=0;
  for(const sub of subs){try{await webpush.sendNotification(sub,payload,{TTL:180,urgency:'high'});alive.push(sub);accepted++;sent++;}catch(e){failed++;if(![404,410].includes(Number(e.statusCode)))alive.push(sub);await stamp(store,dateKey,key,'PUSH_PROVIDER_FAILED',{statusCode:Number(e.statusCode||0),message:String(e.message||'push failed').slice(0,200)});}}
  await store.setJSON('push-subscriptions-v33',alive);if(accepted>0){notified[key]={sentAt:attemptedAt,latencyMs,accepted};await stamp(store,dateKey,key,'PUSH_ACCEPTED',{sentAt:attemptedAt,latencyMs,accepted});await stamp(store,dateKey,key,'PUSH_SENT',{sentAt:attemptedAt,latencyMs,accepted});}}
 await store.setJSON(`push-notified-${dateKey}`,notified);return{sent,failed,status:failed?'PARTIAL':'OK'};}
async function signalTime(store,dateKey,id){const p=await store.get(`signal-history-${dateKey}`,{type:'json',consistency:'strong'});for(const rec of Object.values(p?.signals||{})){const s=(rec.confirmedSignals||[]).find(x=>x.signalId===id);if(s)return s.confirmedAt;}return null;}
async function stamp(store,dateKey,id,event,meta={}){const key=`signal-history-${dateKey}`,p=await store.get(key,{type:'json',consistency:'strong'});if(!p)return;const at=new Date().toISOString();for(const rec of Object.values(p.signals||{})){const s=(rec.confirmedSignals||[]).find(x=>x.signalId===id);if(!s)continue;s.delivery=s.delivery||{};s.delivery[event]=at;if(event==='PUSH_ATTEMPTED')s.pushAttemptedAt=at;if(event==='PUSH_ACCEPTED'||event==='PUSH_SENT'){s.pushSentAt=meta.sentAt||at;s.pushLatencyMs=meta.latencyMs??null;}if(event==='PUSH_PROVIDER_FAILED')s.pushProviderFailure=meta;p.events.push({at,symbol:rec.symbol,event,signalId:id,version:STRATEGY_VERSION,...meta});break;}p.events=p.events.slice(-4000);p.updatedAt=at;await store.setJSON(key,p);await store.setJSON('signal-history-latest',p);}

// 3.6 SMART stage: separate notification per day/symbol, deduplicated by persisted
// delivery key. Existing CONFIRMED Push subscriptions and VAPID remain unchanged.
export async function sendSmartPushes(store,data,dateKey){
 if(!store)return {sent:0,status:'NO_STORE'};
 const rows=(data?.display8||data?.all||[]).filter(x=>x?.recommendationState==='SMART'&&x.research36?.openingChecks?.every(g=>g.passed));
 if(!rows.length)return{sent:0,status:'NO_SMART'};
 if(!setup())return{sent:0,status:'VAPID_NOT_CONFIGURED'};
 let subs=await store.get('push-subscriptions-v33',{type:'json',consistency:'strong'})||[];
 if(!subs.length)return{sent:0,status:'NO_SUBSCRIPTIONS'};
 const key=`push-smart-notified-${dateKey}`;
 const notified=await store.get(key,{type:'json',consistency:'strong'})||{};
 let sent=0;
 for(const row of rows){
   const id=`SMART:${dateKey}:${row.symbol}`;
   if(notified[id])continue;
   const payload=JSON.stringify({title:`🟠 SMART مراقبة · ${row.symbol}`,
      body:`درجة جودة ${Math.round(row.profitPotentialScore||0)}/100 · ${row.stateReason||'في انتظار Retest'} · ليست توصية شراء`,
      tag:`dynamic-trading-${id}`,url:'/?alert=smart',signalId:id,symbol:row.symbol,
      version:STRATEGY_VERSION});
   let accepted=0;const alive=[];
   for(const sub of subs){try{await webpush.sendNotification(sub,payload,{TTL:180,urgency:'normal'});alive.push(sub);accepted++;sent++;}
     catch(e){if(![404,410].includes(Number(e.statusCode)))alive.push(sub);}}
   subs=alive;
   if(accepted>0){notified[id]={sentAt:new Date().toISOString(),accepted};await store.setJSON(key,notified);}
 }
 await store.setJSON('push-subscriptions-v33',subs);
 return {sent,status:'OK'};
}
