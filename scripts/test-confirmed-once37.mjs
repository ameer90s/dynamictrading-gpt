import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {evaluateLiveResearch36,inspectResearchCandidates36,liveConfirmationPolicy37} from '../netlify/functions/lib/research-live36.mjs';
import {STRATEGY_MODES} from '../netlify/functions/lib/trading-config37.mjs';
import {claimFirstConfirmation37} from '../netlify/functions/lib/confirm-lock37.mjs';
import {updateSignalHistory} from '../netlify/functions/lib/signal-history.mjs';
import {dispatchPushSafely37} from '../netlify/functions/lib/notification-safe37.mjs';
import {claimPushAttemptOnce37} from '../netlify/functions/lib/push-once37.mjs';
let n=0;async function test(name,fn){await fn();n++;console.log('PASS',name)}
const clone=x=>structuredClone(x);
const memStore=()=>{const map=new Map();const stats={claims:0};return {map,stats,
 get:async(key)=>map.has(key)?clone(map.get(key)):null,
 setJSON:async(key,val,opts={})=>{if(opts.onlyIfNew){stats.claims++;if(map.has(key))return {modified:false};map.set(key,clone(val));return {modified:true}}map.set(key,clone(val));return {modified:true};}}};
const day='2026-11-05';const row=(symbol='ABC',state='CONFIRMED',price=15,family='VWAP')=>({symbol,
 recommendationState:state,price,entryLow:price,entryHigh:price,target1:price+0.3,target2:price+0.5,target3:price+0.9,stopLoss:price-0.5,
 tradeable:state==='CONFIRMED',side:state==='CONFIRMED'?'LONG':'WAIT',recommendedTarget:'BLEND_DYNAMIC',
 metrics:{setupFamily:family},stateReason:state==='CONFIRMED'?'PAPER_CONFIRMED':'WAIT_RETEST'});
const fixture=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../tests/fixtures/alpaca_40_sessions_research_events.json.gz',import.meta.url))));
const historicalDay='2026-09-10',symbol='NOW';
const bars=(series,tm)=>series.filter(x=>x[0]<=tm).map(x=>({datetime:`${historicalDay} ${String(Math.floor(x[0]/60)).padStart(2,'0')}:${String(x[0]%60).padStart(2,'0')}:00`,open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
function evaluate(minute,quote=null){const now=new Date(`${historicalDay}T${String(Math.floor(minute/60)+4).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}:04Z`);
 const stock=bars(fixture.bars[`${historicalDay}|NOW`],minute-1),spy=bars(fixture.bars[`${historicalDay}|SPY`],minute-1);
 return evaluateLiveResearch36(symbol,stock,spy,quote,{now,allowHistorical:true,shariaApproved:true});}
await test('active mode reaches actual confirmation thresholds',()=>{
 const active=liveConfirmationPolicy37(STRATEGY_MODES.active),reference=liveConfirmationPolicy37();
 assert.equal(active.openMin,.4);assert.equal(active.maxSpreadBps,35);assert.equal(active.relativeStrengthMin,-.3);
 assert.equal(reference.maxSpreadBps,12);assert.equal(active.maxQuoteAgeSec,7);assert.equal(active.latestRetest,900);assert.ok(active.minHodRoomR>=1);
});
await test('opening watch is not falsely labeled SMART pending',()=>{const a=evaluate(600);assert.equal(a.state,'WAIT');assert.equal(a.smartStage,'OPENING_WATCH');assert.equal(a.canConfirmNow,false)});
await test('latest valid retest wins at real quote minute',()=>{const a=evaluate(641);assert.equal(a.pendingCandidate.minute,640);assert.equal(a.selectedPendingAgeMinutes,1);assert.equal(a.state,'SMART');assert.ok(a.recentDiscoveredSetups.length)});
await test('no old pending is resurrected after expiration',()=>{const a=evaluate(660);assert.equal(a.state,'WAIT');assert.equal(a.canConfirmNow,false);assert.equal(a.smartStage,'PENDING_EXPIRED')});
await test('no new entry beyond 15:00 New York',()=>{const a=evaluate(901);assert.equal(a.state,'WAIT');assert.equal(a.reason,'DISCOVERY_WINDOW_CLOSED')});
await test('same pattern can rediscover without per-minute spam',()=>{const now=new Date(`${historicalDay}T19:01:04Z`);const doc=inspectResearchCandidates36(bars(fixture.bars[`${historicalDay}|NOW`],900),now,{allowHistorical:true});assert.ok(doc.discovery.length>new Set(doc.discovery.map(x=>x.type)).size);for(const x of doc.discovery)assert.ok(x.eventKey)});
await test('missing quote cannot cause confirmation',()=>{const a=evaluate(641);assert.equal(a.state,'SMART');assert.equal(a.reason,'NO_ALPACA_QUOTE')});
await test('first confirmation lock is atomic under two concurrent claimants',async()=>{const store=memStore(),one=row('RACE','CONFIRMED',15),two=row('RACE','CONFIRMED',20);const [x,y]=await Promise.all([
 claimFirstConfirmation37(store,day,'RACE',one,'2026-11-05T15:01:00Z'),
 claimFirstConfirmation37(store,day,'RACE',two,'2026-11-05T15:01:01Z')]);
 assert.equal([x,y].filter(v=>v.created).length,1);assert.deepEqual(x.signal,y.signal);assert.equal(store.stats.claims,2);});
await test('confirmed signal stored once, levels frozen across new pattern and price',async()=>{
 const store=memStore(),a=row(),data={all:[a],display8:[a],generatedAt:'2026-11-05T16:00:00Z'};
 await updateSignalHistory(store,data,day);const first=clone(store.map.get(`signal-history-${day}`).signals.ABC.confirmedSignals[0]);
 const b=row('ABC','CONFIRMED',22,'BREAKOUT_RETEST'),later={all:[b],display8:[b],generatedAt:'2026-11-05T16:01:00Z'};
 await updateSignalHistory(store,later,day);const h=store.map.get(`signal-history-${day}`);assert.equal(h.signals.ABC.confirmedSignals.length,1);
 assert.equal(h.events.filter(x=>x.event==='CONFIRMED_CREATED').length,1);
 assert.equal(h.signals.ABC.confirmedSignals[0].signalId,first.signalId);
 assert.equal(h.signals.ABC.confirmedSignals[0].entry,15);assert.equal(h.signals.ABC.confirmedSignals[0].t3,15.9);
 assert.equal(h.signals.ABC.confirmedSignals[0].sl,14.5);
 assert.equal(b.price,15);assert.equal(b.target3,15.9);assert.equal(b.stopLoss,14.5);
 assert.equal(b.confirmationLocked,true);assert.equal(b.tradeable,false);
 assert.equal(store.stats.claims,1);
 const w=row('ABC','SMART',25);await updateSignalHistory(store,{all:[w],display8:[w],generatedAt:'2026-11-05T16:02:00Z'},day);
 assert.equal(w.recommendationState,'CONFIRMED');assert.equal(w.target3,first.t3);
 assert.equal(store.map.get(`signal-history-${day}`).signals.ABC.confirmedSignals.length,1);
});
await test('new session may create its own independent confirmation',async()=>{const store=memStore();for(const d of ['2026-11-05','2026-11-06']){const r=row();await updateSignalHistory(store,{all:[r],display8:[r],generatedAt:`${d}T16:00:00Z`},d)}assert.equal(store.stats.claims,2)});
await test('uncertain atomic lock write refuses to declare CONFIRMED',async()=>{const store=memStore(),original=store.setJSON;store.setJSON=async(k,v,o)=>o?.onlyIfNew?undefined:original(k,v,o);await assert.rejects(updateSignalHistory(store,{all:[row('FAIL')],generatedAt:'2026-11-05T15:00:00Z'},day),/LOCK_WRITE_UNVERIFIED/);assert.equal(store.map.has(`signal-history-${day}`),false)});
await test('pending creation, replacement and expiry remain separate from CONFIRMED',async()=>{
 const store=memStore();for(const [minute,id] of [[0,'abc'],[1,'def'],[2,null]]){
  const r=row('WATCH','SMART',15);r.research36={pendingId:id,pendingCandidate:id?{minute:600+minute}:null,features:{completedBarAt:`2026-11-05 10:0${minute}:00`},checks:[],quote:null,reason:'WAIT_TRIGGER'};
  await updateSignalHistory(store,{all:[r],generatedAt:`2026-11-05T16:0${minute}:00Z`},day);
 }
 const h=store.map.get(`signal-history-${day}`);assert.deepEqual(h.signals.WATCH.pendingEvents.map(x=>x.event),['PENDING_CREATED','PENDING_REPLACED','PENDING_EXPIRED']);
 assert.equal(h.signals.WATCH.confirmedSignals.length,0);
});
await test('VAPID or push failures never mark successful scan as failed',async()=>{
 const store=memStore();await store.setJSON('latest-daily',{tradeDate:day,generatedAt:'2026-11-05T16:00:00Z'});
 const res=await dispatchPushSafely37(store,{display8:[row()]},day,{sendSmartPushes:async()=>{throw Error('VAPID bad')},sendConfirmedPushes:async()=>{throw Error('provider') }});
 assert.equal(res.SMART.status,'DISABLED_CONFIRMED_ONLY');assert.equal(res.CONFIRMED.status,'PUSH_FAILED_NOT_SCAN_FAILED');
 assert.ok((await store.get('latest-daily')).generatedAt);
});

await test('confirmed notification is claimed at most once under concurrent dispatch',async()=>{
 const store=memStore();const [a,b]=await Promise.all([claimPushAttemptOnce37(store,day,'ABC:FIRST_CONFIRMED'),claimPushAttemptOnce37(store,day,'ABC:FIRST_CONFIRMED')]);
 assert.equal([a,b].filter(x=>x.claimed).length,1);assert.equal(store.stats.claims,2);
});
await test('uncertain push lock result never sends an unverified notification',async()=>{
 const store=memStore();store.setJSON=async()=>undefined;
 const outcome=await claimPushAttemptOnce37(store,day,'ABC:FIRST_CONFIRMED');
 assert.equal(outcome.claimed,false);assert.equal(outcome.status,'UNVERIFIED_CLAIM');
});
await test('manual refresh response uses current strategy version',()=>{
 const s=fs.readFileSync(new URL('../netlify/functions/market.mjs',import.meta.url),'utf8');
 assert.ok(s.includes('data.strategyVersion=STRATEGY_VERSION'));assert.equal(s.includes('data.strategyVersion="3.6"'),false);
});
await test('locked confirmation display cannot offer re-approval',()=>{
 const s=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(s.includes('showLevels&&!r.confirmationLocked'));
 assert.ok(s.includes('if(!r||r.confirmationLocked'));
});


await test('recent first confirmation remains selectable and synchronized for up to 180 seconds',async()=>{
 const store=memStore(),today=new Date().toISOString().slice(0,10),time=new Date().toISOString();
 const initial=row('FRESH','CONFIRMED',15),display=clone(initial);
 await updateSignalHistory(store,{all:[initial],display8:[display],generatedAt:time},today);
 assert.equal(initial.signalId,display.signalId);
 const follow=row('FRESH','SMART',19);const next={all:[follow],display8:[],generatedAt:new Date(Date.now()+1000).toISOString()};
 await updateSignalHistory(store,next,today);
 assert.equal(follow.recommendationState,'CONFIRMED');assert.equal(follow.price,15);
 assert.equal(follow.tradeable,true);assert.equal(follow.confirmationLocked,false);
 assert.equal(next.display8.length,1);assert.equal(next.display8[0].signalId,initial.signalId);
 assert.equal(store.map.get(`signal-history-${today}`).signals.FRESH.confirmedSignals.length,1);
});

console.log(`DT37_CONFIRMATION_HARDENING_PASS ${n}/${n}`);
