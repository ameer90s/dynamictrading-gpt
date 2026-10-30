import { getStore } from "@netlify/blobs";
import { analyzeUniverse, buildRecommendationDeck } from "./lib/trading.mjs";
import { recommendationWindow, nextTradingDateKey } from "./lib/time.mjs";
import { normalizePool, discoveryBatches, mergeDiscovery, selectedUniverse } from "./lib/dynamic.mjs";
import { getOrBuildSessionUniverse } from "./lib/session-universe.mjs";
import { reserveApiMinute, isApiCreditError } from "./lib/credits.mjs";
import { fetchLatestQuotes, alpacaConfigured } from "./lib/alpaca.mjs";
import { updateSignalHistory } from "./lib/signal-history.mjs";
import { getShariaUniverse } from "./lib/sharia.mjs";
import { getSmartWatch, smartWatchSymbols, updateSmartWatch } from "./lib/smart-watch.mjs";
import { SMART_FOCUS_SIZE, selectSmartFocus, persistFocusRanks, confirmationDiagnostics, applyFocusMetadata } from "./lib/smart-focus.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  const hasAlpaca=alpacaConfigured();
  if (!apiKey && !hasAlpaca) return json({ error: "أضف مفاتيح Alpaca أو TWELVE_DATA_API_KEY في Netlify" }, 500);

  try {
    const clock = recommendationWindow();
    const store = getStore("dynamic-trading");
    const existing = await store.get(`selection-${clock.dateKey}`, { type: "json", consistency: "strong" });
    // Dynamic Trading 3.6 keeps scanning after a trade is selected. The daily lock prevents a second
    // selection, but must not blind the scanner or Signal History.
    if (!clock.isTradingDay) return json({ error: clock.holidayNameAr ? `السوق الأمريكي مغلق اليوم بسبب ${clock.holidayNameAr}. التوصية الجديدة تبدأ في يوم التداول التالي.` : "اليوم ليس يوم تداول أمريكي.", marketClosed:true, holiday:clock.holidayNameAr||null, nextTradeDate:nextTradingDateKey() }, 425);
    if (clock.minuteOfDay < clock.startMinute) return json({ error: "المراقبة تبدأ 09:30 نيويورك، وتبدأ مراقبة SMART من 09:45." }, 425);
    if (clock.minuteOfDay > clock.endMinute || clock.session !== "REGULAR") return json({ error: clock.earlyClose ? "انتهت نافذة التوصيات اليوم مع الإغلاق المبكر للسوق." : "انتهت نافذة البحث عن توصيات جديدة لليوم مع إغلاق السوق النظامي." }, 425);

    const url=new URL(req.url);
    const requestedMode=url.searchParams.get("mode");const mode=["active","balanced","precision"].includes(requestedMode)?requestedMode:"active";
    const requested=(url.searchParams.get("symbols")||"").split(",").map((x)=>x.trim().toUpperCase()).filter(Boolean);
    const sharia=await getShariaUniverse(store);
    if(!sharia.symbols?.length) return json({error:"تعذر تحميل كون شرعي موثّق. تم إيقاف المسح بدلاً من استخدام قائمة أسهم ثابتة."},503);
    const primary=[]; // Manual symbols are review-only and never become privileged scanner seeds.
    const searchPool=normalizePool(sharia.symbols);
    const sessionUniverse=await getOrBuildSessionUniverse(store,clock.dateKey,searchPool);
    const eligiblePool=normalizePool(sessionUniverse.eligibleSymbols);

    const savedCalibration=await store.get("scanner-calibration-v35",{type:"json",consistency:"strong"}) || await store.get("performance-calibration-v17",{type:"json",consistency:"strong"}) || {};
    const requestedWeights=parseWeights(url.searchParams.get("weights"));
    const weights=url.searchParams.get("weights")?requestedWeights:parseSavedWeights(savedCalibration.weights);
    const phase=phaseFor(clock.minuteOfDay);
    const news=await store.get(`news-${clock.dateKey}`,{type:"json",consistency:"strong"}) || {};
    const symbolProfiles=await store.get("symbol-profiles-v24",{type:"json",consistency:"strong"}) || {};
    let discovery=await store.get(`dynamic-discovery-${clock.dateKey}`,{type:"json",consistency:"strong"});

    if(!hasAlpaca){
      const budget=await reserveApiMinute(store,"manual-market",8);
      if(!budget.allowed){
        const cached=await store.get(`candidate-${clock.dateKey}-${mode}`,{type:"json",consistency:"strong"}) || await store.get("latest-daily",{type:"json",consistency:"strong"});
        if(cached && cached.tradeDate===clock.dateKey) return json({...cached,creditSmart:{reused:true,waitSeconds:budget.waitSeconds,note:"تم عرض آخر توصيات محفوظة لتجنب تجاوز حصة Twelve Data."}},200,{"Cache-Control":"no-store"});
        return json({error:`جاري تحديث توصيات السوق. أعد المحاولة بعد ${budget.waitSeconds} ثانية.`,creditWaitSeconds:budget.waitSeconds},429);
      }
    }

    if(clock.minuteOfDay < 610){
      const batches=discoveryBatches(eligiblePool,clock.minuteOfDay);let data=null;
      for(const batch of batches){const micro=await loadMicrostructure(batch);const part=await analyzeUniverse(batch,apiKey,weights,savedCalibration,phase,mode,news.bySymbol||{},micro,symbolProfiles);discovery=mergeDiscovery(discovery,part,clock.minuteOfDay,eligiblePool,batch);await updateSmartWatch(store,clock.dateKey,part);data=part;}
      data=data||await analyzeUniverse([],apiKey,weights,savedCalibration,phase,mode,news.bySymbol||{}, {},symbolProfiles);
      await store.setJSON(`dynamic-discovery-${clock.dateKey}`,discovery);
      data.tradeDate=clock.dateKey;data.appName="Dynamic Trading";data.strategyVersion="3.6";data.performanceCostPolicy={weeklyNetTargetPct:2.5,subscriptionCostUsd:10,subscriptionTreatment:"DEDUCT_FROM_WEEKLY_NET_TARGET_AND_RETURN"};data.shariaUniverseSource=sharia.source;data.shariaMethodology=sharia.methodology;data.shariaUniverseUpdatedAt=sharia.fetchedAt;data.shariaCacheStatus=sharia.cacheStatus;data.shariaUniverseCount=sharia.count;data.selectionLocked=false;data.candidateFrozen=false;data.scanMinuteNY=clock.minuteOfDay;data.evaluationPhase=phase;data.discoveryPhase=true;data.primarySymbols=primary;
      data.dynamicSelection={mode:"DISCOVERY",poolSize:eligiblePool.length,shariaPoolSize:searchPool.length,priceBands:sessionUniverse.priceBands,priceScreenCoveragePct:sessionUniverse.quoteCoveragePct,batch:batches.flat(),primary,scannedSymbols:discovery.scannedSymbols,leaders:discovery.leaders,note:"09:30–10:09: يتم تدوير الكون الشرعي ديناميكياً وتجميع أفضل المرشحين. SMART يبدأ من 09:45، CONFIRMED بعد 10:30."};
      data.top5=[];data.display8=clock.minuteOfDay>=585?(data.all||[]).filter(x=>["SMART","CONFIRMED"].includes(x.recommendationState)):[];data.fallbackTrade=null;data.dailyRecommendation=null;
      if(clock.minuteOfDay>=585)await updateSignalHistory(store,data,clock.dateKey);
      await store.setJSON(`candidate-${clock.dateKey}-${mode}`,data);if(mode==="active"){await store.setJSON(`candidate-${clock.dateKey}`,data);await store.setJSON("latest-daily",data);}
      return json(data,200,{"Cache-Control":"no-store"});
    }

    // Continue full-universe discovery after 10:10 as well; recommendations use the best scanned leaders while coverage keeps expanding.
    const discoveryBatchesNow=discoveryBatches(eligiblePool,clock.minuteOfDay,10);const cycleRows=[];
    for(const discoveryBatchNow of discoveryBatchesNow){if(discoveryBatchNow.length){const discoveryMicro=await loadMicrostructure(discoveryBatchNow);let discoveryData=await analyzeUniverse(discoveryBatchNow,apiKey,weights,savedCalibration,phase,mode,news.bySymbol||{},discoveryMicro,symbolProfiles);discovery=mergeDiscovery(discovery,discoveryData,clock.minuteOfDay,eligiblePool,discoveryBatchNow);cycleRows.push(...(discoveryData.all||[]));await updateSmartWatch(store,clock.dateKey,discoveryData);discoveryData=buildRecommendationDeck(discoveryData,[],savedCalibration,phase,mode);await updateSignalHistory(store,discoveryData,clock.dateKey);}}
    if(discoveryBatchesNow.length)await store.setJSON(`dynamic-discovery-${clock.dateKey}`,discovery);
    let watch=await getSmartWatch(store,clock.dateKey);const focusSelection=selectSmartFocus(watch,SMART_FOCUS_SIZE);await persistFocusRanks(store,clock.dateKey,watch,focusSelection.ranked);watch=await getSmartWatch(store,clock.dateKey);const universe=focusSelection.focus.map(x=>x.symbol);
    const micro=await loadMicrostructure(universe);
    let data=await analyzeUniverse(universe,apiKey,weights,savedCalibration,phase,mode,news.bySymbol||{},micro,symbolProfiles);data=applyFocusMetadata(data,focusSelection.ranked);
    await updateSmartWatch(store,clock.dateKey,data);const merged=new Map();for(const r of cycleRows)if(r?.symbol&&(r.recommendationState==='SMART'||r.recommendationState==='CONFIRMED'))merged.set(r.symbol,r);for(const r of (data.all||[]))if(r?.symbol)merged.set(r.symbol,r);data.all=[...merged.values()];
    data=buildRecommendationDeck(data,primary,savedCalibration,phase,mode);
    const watchAfter=await getSmartWatch(store,clock.dateKey);data.smartFocus={size:SMART_FOCUS_SIZE,focusSymbols:universe,ranked:focusSelection.ranked.map(x=>({symbol:x.symbol,rank:x.focusRank,tier:x.focusTier,score:x.focusScore})),backgroundCount:focusSelection.background.length,rolling:true,persistentAll:true};data.confirmationDiagnostics=confirmationDiagnostics(watchAfter,data);
  data.scannerFunnel={shariaUniverse:Number(sharia.count||sharia.symbols.length||0),priceScreenAttempted:Number(sessionUniverse.universeCount||0),priceScreenQuoted:Number(sessionUniverse.pricedSymbols||0),priceScreenCoveragePct:Number(sessionUniverse.quoteCoveragePct||0),under200:Number(sessionUniverse.eligibleCount||0),priceBands:sessionUniverse.priceBands||{},discoveryAttempted:Number(discovery?.scannedSymbols||0),discoveryAnalyzed:Number(discovery?.analyzedSymbols||0),discoveryCoveragePct:sessionUniverse.eligibleCount?Number(((discovery?.scannedSymbols||0)/sessionUniverse.eligibleCount*100).toFixed(2)):0,evaluated:Number(universe.length||0),smartWatchActive:smartWatchSymbols(await getSmartWatch(store,clock.dateKey)).length,smart:(data.display8||[]).filter(x=>x.recommendationState==='SMART').length,confirmed:(data.display8||[]).filter(x=>x.recommendationState==='CONFIRMED').length};data.missTaxonomy=['SCANNER_MISS','CONFIRMATION_MISS','LATE_ENTRY'];
    data.tradeDate=clock.dateKey;data.appName="Dynamic Trading";data.strategyVersion="3.6";data.performanceCostPolicy={weeklyNetTargetPct:2.5,subscriptionCostUsd:10,subscriptionTreatment:"DEDUCT_FROM_WEEKLY_NET_TARGET_AND_RETURN"};data.shariaUniverseSource=sharia.source;data.shariaMethodology=sharia.methodology;data.shariaUniverseUpdatedAt=sharia.fetchedAt;data.shariaCacheStatus=sharia.cacheStatus;data.shariaUniverseCount=sharia.count;data.selectionLocked=false;data.candidateFrozen=false;data.fallbackFinal=!data.top5.length&&!!data.fallbackTrade&&clock.minuteOfDay>=840;data.scanMinuteNY=clock.minuteOfDay;data.evaluationPhase=phase;data.discoveryPhase=false;
    data.dynamicSelection={mode:"DYNAMIC_SMART_WATCH",poolSize:eligiblePool.length,shariaPoolSize:searchPool.length,priceBands:sessionUniverse.priceBands,priceScreenCoveragePct:sessionUniverse.quoteCoveragePct,primary,selected:universe,alternativeCandidates:[],scannedSymbols:discovery?.scannedSymbols||0,leaders:(discovery?.leaders||[]),newsGeneratedAt:news.generatedAt||null,note:"كل سهم يصل SMART يبقى في متابعة ديناميكية مستقلة حتى CONFIRMED أو INVALID/EXPIRED. Active يختار بين 15-Minute Candle Breakout أو Breakout+Retest أو VWAP Reclaim أو Momentum Continuation."};
    await updateSignalHistory(store,data,clock.dateKey);
    await store.setJSON(`candidate-${clock.dateKey}-${mode}`,data);
    if(mode==="active"){await store.setJSON(`candidate-${clock.dateKey}`,data);await store.setJSON("latest-daily",data);}
    if(data.top5.length>0){await store.setJSON(`candidate-ready-${clock.dateKey}-${mode}`,data);if(mode==="active")await store.setJSON(`candidate-ready-${clock.dateKey}`,data);}
    return json(data,200,{"Cache-Control":"no-store"});
  } catch(error){
    try{
      if(isApiCreditError(error)){
        const clock=recommendationWindow(); const store=getStore("dynamic-trading");
        const cached=await store.get("latest-daily",{type:"json",consistency:"strong"});
        if(cached?.tradeDate===clock.dateKey) return json({...cached,creditSmart:{reused:true,note:"تم استخدام آخر توصيات محفوظة لأن حصة Twelve Data ممتلئة."}},200,{"Cache-Control":"no-store"});
      }
    }catch{}
    return json({error:error.message||"تعذر تحليل السوق"},502);
  }
};

async function loadMicrostructure(symbols){
  if(!alpacaConfigured())return {};
  try{return await fetchLatestQuotes(symbols,process.env.ALPACA_API_KEY_ID,process.env.ALPACA_API_SECRET_KEY);}catch{return {};}
}
export const config={path:"/api/market"};
function phaseFor(m){return m<610?"09:30–10:09":m<630?"10:10–10:29":m<690?"10:30–11:29":m<750?"11:30–12:29":m<840?"12:30–13:59":"14:00–16:00";}
function parseWeights(raw){const base={trend:.30,momentum:.20,volume:.20,structure:.20,market:.10};if(!raw)return base;const parts=raw.split(",").map(Number);if(parts.length!==5||parts.some((v)=>!Number.isFinite(v)||v<.05||v>.60))return base;const sum=parts.reduce((a,b)=>a+b,0);if(sum<.95||sum>1.05)return base;return{trend:parts[0]/sum,momentum:parts[1]/sum,volume:parts[2]/sum,structure:parts[3]/sum,market:parts[4]/sum};}
function parseSavedWeights(v){const base={trend:.30,momentum:.20,volume:.20,structure:.20,market:.10};if(!Array.isArray(v)||v.length!==5)return base;const x=v.map(Number),sum=x.reduce((a,b)=>a+b,0);if(x.some(n=>!Number.isFinite(n))||sum<.8||sum>1.2)return base;return{trend:x[0]/sum,momentum:x[1]/sum,volume:x[2]/sum,structure:x[3]/sum,market:x[4]/sum};}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...extra}});}
