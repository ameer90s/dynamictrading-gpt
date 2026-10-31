import { getStore } from "@netlify/blobs";
import { analyzeUniverse, buildRecommendationDeck } from "./lib/trading.mjs";
import { recommendationWindow } from "./lib/time.mjs";
import { normalizePool, discoveryBatches, mergeDiscovery, selectedUniverse } from "./lib/dynamic.mjs";
import { getOrBuildSessionUniverse } from "./lib/session-universe.mjs";
import { reserveApiMinute } from "./lib/credits.mjs";
import { fetchLatestQuotes, alpacaConfigured } from "./lib/alpaca.mjs";
import { updateSignalHistory } from "./lib/signal-history.mjs";
import { sendConfirmedPushes, sendSmartPushes } from "./lib/push.mjs";
import { getShariaUniverse } from "./lib/sharia.mjs";
import { getSmartWatch, smartWatchSymbols, updateSmartWatch } from "./lib/smart-watch.mjs";
import { SMART_FOCUS_SIZE, selectSmartFocus, persistFocusRanks, confirmationDiagnostics, applyFocusMetadata } from "./lib/smart-focus.mjs";
import {STRATEGY_VERSION} from "./lib/version.mjs";
import {writeScannerAudit36,writeScannerFailure37} from "./lib/scanner-audit36.mjs";
import {shariaSnapshotEvidence} from "./lib/research-sharia37.mjs";

export default async()=>{
  const clock=recommendationWindow();
  if(!clock.isTradingDay||clock.session!=="REGULAR"||clock.minuteOfDay<clock.startMinute||clock.minuteOfDay>clock.endMinute)return new Response("Skipped: outside Dynamic Trading 3.7 recommendation window",{status:200});
  const store=getStore('dynamic-trading');
  try{
  const apiKey=process.env.TWELVE_DATA_API_KEY;const hasAlpaca=alpacaConfigured();if(!apiKey&&!hasAlpaca)throw new Error("أضف Alpaca أو TWELVE_DATA_API_KEY");
  const sharia=await getShariaUniverse(store);
  if(!sharia.symbols?.length) throw new Error("تعذر تحميل كون شرعي موثّق. تم إيقاف المسح بدلاً من استخدام قائمة أسهم ثابتة.");
  const shariaEvidence=shariaSnapshotEvidence(sharia);
  const primary=[]; // no fixed/privileged symbols.
  const searchPool=normalizePool(sharia.symbols);
  const sessionUniverse=await getOrBuildSessionUniverse(store,clock.dateKey,searchPool);
  const eligiblePool=normalizePool(sessionUniverse.eligibleSymbols);
  const calibration=await store.get("scanner-calibration-v35",{type:"json",consistency:"strong"}) || await store.get("performance-calibration-v17",{type:"json",consistency:"strong"}) || {};
  const weights=weightsFromCalibration(calibration);const phase=phaseFor(clock.minuteOfDay);
  const news=await store.get(`news-${clock.dateKey}`,{type:"json",consistency:"strong"})||{};
  const symbolProfiles=await store.get("symbol-profiles-v24",{type:"json",consistency:"strong"}) || {};
  let discovery=await store.get(`dynamic-discovery-${clock.dateKey}`,{type:"json",consistency:"strong"});
  if(!hasAlpaca){const budget=await reserveApiMinute(store,"scheduled-market",8);if(!budget.allowed)return new Response(`Skipped: API minute reserved by ${budget.existing?.source||"another task"}`,{status:200});}

  if(clock.minuteOfDay<610){
    const batches=discoveryBatches(eligiblePool,clock.minuteOfDay);let data=null;const allDiscoveryAudit=[];for(const batch of batches){const micro=await loadMicrostructure(batch);const part=await analyzeUniverse(batch,apiKey,weights,calibration,phase,"active",news.bySymbol||{},micro,symbolProfiles);discovery=mergeDiscovery(discovery,part,clock.minuteOfDay,eligiblePool,batch);allDiscoveryAudit.push(...(part.all||[]));await updateSmartWatch(store,clock.dateKey,part);data=part;}
    data=data||await analyzeUniverse([],apiKey,weights,calibration,phase,"active",news.bySymbol||{}, {},symbolProfiles);await store.setJSON(`dynamic-discovery-${clock.dateKey}`,discovery);
    await writeScannerAudit36(store,clock.dateKey,clock.minuteOfDay,allDiscoveryAudit,{eligibleCount:eligiblePool.length,attempted:batches.flat(),errors:data.errors||[],shariaEvidence});
    data.tradeDate=clock.dateKey;data.appName='Dynamic Trading';data.strategyVersion=STRATEGY_VERSION;data.performanceCostPolicy={weeklyNetTargetPct:2.5,subscriptionCostUsd:10,subscriptionTreatment:'DEDUCT_FROM_WEEKLY_NET_TARGET_AND_RETURN'};data.shariaUniverseSource=sharia.source;data.shariaMethodology=sharia.methodology;data.shariaUniverseUpdatedAt=sharia.fetchedAt;data.shariaCacheStatus=sharia.cacheStatus;data.shariaUniverseCount=sharia.count;data.evaluationPhase=phase;data.discoveryPhase=true;data.primarySymbols=primary;data.top5=[];data.display8=clock.minuteOfDay>=585?(data.all||[]).filter(x=>["SMART","CONFIRMED"].includes(x.recommendationState)):[];data.fallbackTrade=null;data.dailyRecommendation=null;data.candidateFrozen=false;data.dynamicSelection={mode:"DISCOVERY",poolSize:eligiblePool.length,shariaPoolSize:searchPool.length,priceBands:sessionUniverse.priceBands,priceScreenCoveragePct:sessionUniverse.quoteCoveragePct,batch:batches.flat(),primary,scannedSymbols:discovery.scannedSymbols,leaders:discovery.leaders};
    // 3.7: SMART can start at 09:45 ET; persist and notify in discovery phase.
    if(clock.minuteOfDay>=585){await updateSignalHistory(store,data,clock.dateKey);
      await sendSmartPushes(store,data,clock.dateKey);await sendConfirmedPushes(store,data,clock.dateKey);}
    await store.setJSON("latest-daily",data);await store.setJSON(`candidate-${clock.dateKey}`,data);await store.setJSON(`candidate-${clock.dateKey}-active`,data);
    return new Response(`Dynamic discovery ${(batches.flat()).join(",")}`,{status:200});
  }

  // Continue full-universe discovery after 10:10 as well; recommendations use the best scanned leaders while coverage keeps expanding.
  const discoveryBatchesNow=discoveryBatches(eligiblePool,clock.minuteOfDay,10);
  const cycleRows=[];
  for(const discoveryBatchNow of discoveryBatchesNow){if(discoveryBatchNow.length){const discoveryMicro=await loadMicrostructure(discoveryBatchNow);let discoveryData=await analyzeUniverse(discoveryBatchNow,apiKey,weights,calibration,phase,"active",news.bySymbol||{},discoveryMicro,symbolProfiles);discovery=mergeDiscovery(discovery,discoveryData,clock.minuteOfDay,eligiblePool,discoveryBatchNow);cycleRows.push(...(discoveryData.all||[]));await updateSmartWatch(store,clock.dateKey,discoveryData);discoveryData=buildRecommendationDeck(discoveryData,[],calibration,phase,"active");await updateSignalHistory(store,discoveryData,clock.dateKey);await sendSmartPushes(store,discoveryData,clock.dateKey);await sendConfirmedPushes(store,discoveryData,clock.dateKey);}}
  if(discoveryBatchesNow.length)await store.setJSON(`dynamic-discovery-${clock.dateKey}`,discovery);
  // Persistent SMART candidates are re-evaluated every scheduled minute, independent of discovery rank.
  let watch=await getSmartWatch(store,clock.dateKey);const focusSelection=selectSmartFocus(watch,SMART_FOCUS_SIZE);await persistFocusRanks(store,clock.dateKey,watch,focusSelection.ranked);watch=await getSmartWatch(store,clock.dateKey);const universe=focusSelection.focus.map(x=>x.symbol);const micro=await loadMicrostructure(universe);
  let data=await analyzeUniverse(universe,apiKey,weights,calibration,phase,"active",news.bySymbol||{},micro,symbolProfiles);data=applyFocusMetadata(data,focusSelection.ranked);
  await updateSmartWatch(store,clock.dateKey,data);
  await writeScannerAudit36(store,clock.dateKey,clock.minuteOfDay,[...cycleRows,...(data.all||[])],{eligibleCount:eligiblePool.length,attempted:[...discoveryBatchesNow.flat(),...universe],errors:data.errors||[],shariaEvidence});
  const merged=new Map();for(const r of cycleRows)if(r?.symbol&&(r.recommendationState==='SMART'||r.recommendationState==='CONFIRMED'))merged.set(r.symbol,r);for(const r of (data.all||[]))if(r?.symbol)merged.set(r.symbol,r);data.all=[...merged.values()];
  data=buildRecommendationDeck(data,primary,calibration,phase,"active");
  const watchAfter=await getSmartWatch(store,clock.dateKey);data.smartFocus={size:SMART_FOCUS_SIZE,focusSymbols:universe,ranked:focusSelection.ranked.map(x=>({symbol:x.symbol,rank:x.focusRank,tier:x.focusTier,score:x.focusScore})),backgroundCount:focusSelection.background.length,rolling:true,persistentAll:true};data.confirmationDiagnostics=confirmationDiagnostics(watchAfter,data);
  data.scannerFunnel={shariaUniverse:Number(sharia.count||sharia.symbols.length||0),priceScreenAttempted:Number(sessionUniverse.universeCount||0),priceScreenQuoted:Number(sessionUniverse.pricedSymbols||0),priceScreenCoveragePct:Number(sessionUniverse.quoteCoveragePct||0),priceScreenFailed:Number(sessionUniverse.failedSymbols?.length||0),priceScreenRetries:Number(sessionUniverse.retryLog?.filter(x=>x.status==='RETRYING').length||0),under200:Number(sessionUniverse.eligibleCount||0),priceBands:sessionUniverse.priceBands||{},discoveryAttempted:Number(discovery?.attemptedCount||0),discoverySuccessful:Number(discovery?.successfulCount||0),discoveryFailed:Number(discovery?.failedCount||0),discoveryAnalyzed:Number(discovery?.analyzedSymbols||0),discoveryCoveragePct:Number(discovery?.coveragePct||0),evaluated:Number(universe.length||0),smartWatchActive:smartWatchSymbols(await getSmartWatch(store,clock.dateKey)).length,smart:(data.display8||[]).filter(x=>x.recommendationState==='SMART').length,confirmed:(data.display8||[]).filter(x=>x.recommendationState==='CONFIRMED').length};data.scannerHealth={version:STRATEGY_VERSION,lastSuccessfulAnalysisAt:data.generatedAt,lastSuccessfulDiscoveryAt:discovery?.lastSuccessfulScanAt||null,apiProvider:data.dataProvider||null,endpointHealth:(data.errors||[]).length?'DEGRADED':'OK',attempted:Number(discovery?.attemptedCount||0),scanned:Number(discovery?.successfulCount||0),failed:Number(discovery?.failedCount||0),failedSymbols:discovery?.failedSymbols||[],retried:Number(sessionUniverse.retryLog?.filter(x=>x.status==='RETRYING').length||0),coveragePct:Number(discovery?.coveragePct||0),smart:Number((data.display8||[]).filter(x=>x.recommendationState==='SMART').length),confirmed:Number((data.display8||[]).filter(x=>x.recommendationState==='CONFIRMED').length)};data.missTaxonomy=['SCANNER_MISS','CONFIRMATION_MISS','LATE_ENTRY'];
  data.tradeDate=clock.dateKey;data.appName='Dynamic Trading';data.strategyVersion=STRATEGY_VERSION;data.performanceCostPolicy={weeklyNetTargetPct:2.5,subscriptionCostUsd:10,subscriptionTreatment:'DEDUCT_FROM_WEEKLY_NET_TARGET_AND_RETURN'};data.shariaUniverseSource=sharia.source;data.shariaMethodology=sharia.methodology;data.shariaUniverseUpdatedAt=sharia.fetchedAt;data.shariaCacheStatus=sharia.cacheStatus;data.shariaUniverseCount=sharia.count;data.selectionLocked=false;data.evaluationPhase=phase;data.scanMinuteNY=clock.minuteOfDay;data.candidateFrozen=false;data.fallbackFinal=!data.top5.length&&!!data.fallbackTrade&&clock.minuteOfDay>=840;data.discoveryPhase=false;data.dynamicSelection={mode:"DYNAMIC_SMART_WATCH",primary,selected:universe,alternativeCandidates:[],poolSize:eligiblePool.length,shariaPoolSize:searchPool.length,priceBands:sessionUniverse.priceBands,priceScreenCoveragePct:sessionUniverse.quoteCoveragePct,scannedSymbols:discovery?.scannedSymbols||0,leaders:(discovery?.leaders||[]),newsGeneratedAt:news.generatedAt||null};
  await updateSignalHistory(store,data,clock.dateKey);
  await sendSmartPushes(store,data,clock.dateKey);
  await sendConfirmedPushes(store,data,clock.dateKey);
  await store.setJSON("latest-daily",data);await store.setJSON(`candidate-${clock.dateKey}`,data);await store.setJSON(`candidate-${clock.dateKey}-active`,data);
  if(data.top5.length){await store.setJSON(`candidate-ready-${clock.dateKey}`,data);await store.setJSON(`candidate-ready-${clock.dateKey}-active`,data);return new Response(`Actionable setup refreshed at ${phase}; ${data.display8?.length||0} cards`,{status:200});}
  return new Response(data.fallbackTrade?`BAD TRADE deck saved at ${phase}; ${data.display8?.length||0} cards`:`No signal available at ${phase}`,{status:200});
  }catch(e){
   try{await writeScannerFailure37(store,clock.dateKey,clock.minuteOfDay,e?.message||'SCANNER_CYCLE_ERROR');}
   catch(logError){console.error('DT37_SCANNER_FAILURE_LOGGING_ERROR',String(logError?.message||logError).slice(0,100));}
   throw e;
  }
};
async function loadMicrostructure(symbols){if(!alpacaConfigured())return {};try{return await fetchLatestQuotes(symbols,process.env.ALPACA_API_KEY_ID,process.env.ALPACA_API_SECRET_KEY);}catch{return {};}}
function phaseFor(m){return m<610?"09:30–10:09":m<630?"10:10–10:29":m<690?"10:30–11:29":m<750?"11:30–12:29":m<840?"12:30–13:59":"14:00–16:00";}
function weightsFromCalibration(c){const v=Array.isArray(c?.weights)?c.weights.map(Number):[.30,.20,.20,.20,.10],sum=v.reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);if(v.length!==5||sum<.8||sum>1.2)return{trend:.30,momentum:.20,volume:.20,structure:.20,market:.10};return{trend:v[0]/sum,momentum:v[1]/sum,volume:v[2]/sum,structure:v[3]/sum,market:v[4]/sum};}
