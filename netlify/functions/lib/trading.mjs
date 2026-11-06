import { evaluateLiveResearch36 } from "./research-live36.mjs";
import { alpacaConfigured, fetchIntradayBars, fetchLatestQuotes } from "./alpaca.mjs";
// Consolidation 2026-11-04: moved declarations have identical bodies to baseline.
import { STRATEGY_MODES } from './trading-config37.mjs';
import { avgPriorVolume, emptySession, multiTimeframeAlignment, directionalTrendScore, aggregateCandles, candleBodyRatio, trendScore, supportResistance, fallbackVolumeRatio, cumulativeVwap, dateParts, ema, rsi, macdHistogram, atr, median, finite, fmt } from './trading-technical37.mjs';
import { setupScore, precisionScore, retestQualityScore, directionalRelativeStrengthScore, calcLiquidityScore, structureWithSetup, stopForSetup, roomToStructureR, calcInPlayScore, setupFamilyArabic, setupStateArabic, rvolScore, weighted, momentumRsiLong, momentumRsiShort, structureScoreLong, structureScoreShort, clamp } from './trading-scoring37.mjs';
import { sessionContext, detectBreakoutRetest, detectFirst15mCandleBreak, detectVwapReclaim, detectMomentumContinuation, chooseLongSetup } from './trading-setups37.mjs';
export { STRATEGY_MODES, trendScore };

const BASE_WEIGHTS = { trend: 0.30, momentum: 0.20, volume: 0.20, structure: 0.20, market: 0.10 };

// v3.2: lightweight theme map for the screened universe. Theme strength is only
// a ranking/confirmation input; it never overrides liquidity, spread, news-risk
// or setup safety gates.
const THEME_BY_SYMBOL = {
  NVDA:"SEMIS_AI", AMD:"SEMIS_AI", SMCI:"SEMIS_AI", AVGO:"SEMIS_AI", ARM:"SEMIS_AI", MU:"SEMIS_AI",
  MSFT:"MEGA_CAP_AI", GOOGL:"MEGA_CAP_AI", META:"MEGA_CAP_AI", AMZN:"MEGA_CAP_AI", AAPL:"MEGA_CAP_AI",
  RGTI:"QUANTUM", RKLB:"SPACE", PLTR:"AI_SOFTWARE"
};


function modeConfig(mode) { return STRATEGY_MODES[mode] || STRATEGY_MODES.active; }


export async function fetchCandles(symbol, apiKey, interval = "1min", outputSize = 1100, options = {}) {
  const includePrepost = options.includePrepost === true;
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputSize));
  if (includePrepost) url.searchParams.set("prepost", "true");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("format", "JSON");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const root = await response.json().catch(() => ({}));
  if (!response.ok || root.status === "error" || root.code) {
    const detail = root.message || `HTTP ${response.status}`;
    throw new Error(`${symbol}: ${detail}`);
  }
  if (!Array.isArray(root.values)) throw new Error(`لا توجد بيانات كافية لـ ${symbol}`);

  return root.values.map((o) => ({
    datetime: o.datetime,
    open: Number(o.open), high: Number(o.high), low: Number(o.low), close: Number(o.close), volume: Number(o.volume || 0),
  })).filter((x) => [x.open, x.high, x.low, x.close].every(Number.isFinite)).reverse();
}

export async function analyzeUniverse(symbols, apiKey, weights = BASE_WEIGHTS, calibration = {}, phase = "09:30–10:09", mode = "active", newsContext = {}, microstructureContext = {}, symbolProfiles = {}, researchOptions = {}) {
  const cfg = modeConfig(mode);
  const clean = [...new Set(symbols.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
  const useAlpaca = alpacaConfigured();
  // Analysis count is dynamic: do not discard valid SMART candidates because of a fixed Top-8 cap.
  const universe = clean;
  const needed = [...new Set([...universe, "SPY", "QQQ"])];

  // Offline deterministic Alpaca replay injection used ONLY by node-based
  // verification scripts; routes never pass this option in production.
  const loadBars=researchOptions.barsLoader;
  const results = await Promise.allSettled(
    needed.map(async (symbol) => [symbol, researchOptions.replayBars
      ? (researchOptions.replayBars[symbol] || (()=>{throw Error(`Replay missing ${symbol}`)})())
      : useAlpaca
        ? (loadBars ? await loadBars(symbol) : await fetchIntradayBars(symbol, process.env.ALPACA_API_KEY_ID, process.env.ALPACA_API_SECRET_KEY, {lookbackDays:12}))
        : await fetchCandles(symbol, apiKey, "1min", 1100, { includePrepost: false })])
  );
  const candlesBySymbol = new Map();
  const errors = [];
  const successfulSymbols=[]; const failedSymbols=[];
  for (let i=0;i<results.length;i++) { const item=results[i], symbol=needed[i];
    if (item.status === "fulfilled") {candlesBySymbol.set(item.value[0], item.value[1]);successfulSymbols.push(symbol);}
    else {const message=item.reason?.message || "فشل جلب بيانات سهم";errors.push(`${symbol}: ${message}`);failedSymbols.push(symbol);}
  }

  if (!candlesBySymbol.has("SPY")) {
    const details=errors.filter(x=>/^SPY:/.test(x)).join(" | ");
    throw new Error(`Research36 يحتاج SPY للمقارنة وقت الافتتاح.${details ? ` ${details}` : ""}`);
  }

  const spyCandles=candlesBySymbol.get("SPY");
  const qqqCandles=candlesBySymbol.get("QQQ")||[];
  const spyTrend=combinedMarketTrend(spyCandles);
  // QQQ is optional diagnostic context, NOT a historical/research36 execution gate.
  const qqqTrend=qqqCandles.length?combinedMarketTrend(qqqCandles):null;
  const spyCtx=sessionContext(spyCandles,Math.max(atr(spyCandles,14),(spyCandles.at(-1)?.close||1)*.001));
  const qqqCtx=qqqCandles.length?sessionContext(qqqCandles,Math.max(atr(qqqCandles,14),(qqqCandles.at(-1)?.close||1)*.001)):{sessionChangePct:null};
  const market = {
    spyTrend, qqqTrend, combined: qqqTrend==null?spyTrend:(spyTrend+qqqTrend)/2,
    qqqDataStatus:qqqTrend==null?'UNAVAILABLE_OPTIONAL_DIAGNOSTIC':'AVAILABLE',
    spySessionChangePct:spyCtx.sessionChangePct,
    qqqSessionChangePct:qqqCtx.sessionChangePct,
    benchmarkChangePct:qqqCtx.sessionChangePct==null?spyCtx.sessionChangePct:(spyCtx.sessionChangePct+qqqCtx.sessionChangePct)/2,
  };
  market.regime = market.combined >= 60 ? "TREND_UP" : market.combined <= 40 ? "TREND_DOWN" : "NEUTRAL";

  // v3.2 uses a two-pass pipeline. First calculate each stock independently,
  // then measure breadth/theme leadership across the scanned universe before
  // applying the final execution/performance gates.
  const staged = [];
  for (const symbol of universe) {
    const candles = candlesBySymbol.get(symbol);
    if (!candles || candles.length < 1) continue;
    const symbolCfg = applySymbolProfile(cfg, symbolProfiles?.[symbol] || null);
    // 3.6 decision NEVER depends on the old 220-bar minimum / 3.5 scoring.
    // Legacy diagnostics are computed only when enough bars exist. This does
    // not change eligibility for the research candidate engine.
    const fallback={symbol,price:candles.at(-1).close,confidence:0,tradePriority:0,side:'WAIT',
      recommendationState:'WAIT',hiddenV32:false,metrics:{setupQuality:0,retestQuality:0,
        mtfAlignment:0,liquidityScore:0,relativeVolume:0,relativeStrengthPct:0,
        sessionChangePct:0,atrPct:0,roomR:0,spreadBps:0,setupFamily:'RESEARCH36_OPENING'},
      reason:'Research36 is active independent of old 3.5 technical analyzer'};
    let withNews=fallback,analysisReady=false;
    if(candles.length>=220){
      try{const old=analyze(symbol,candles,market,weights,symbolCfg);
        const q=applyMicrostructureContext(old,microstructureContext?.[symbol]||null,symbolCfg);
        withNews=applyNewsContext(q,newsContext?.[symbol]||null);analysisReady=true;
      }catch(err){errors.push(`Legacy DIAGNOSTICS ONLY (${symbol}) skipped: ${err?.message||err}`);}
    }
    staged.push({row:{...withNews,_legacyAnalysisReady:analysisReady},cfg:symbolCfg});
  }
  const universeContext = buildV31UniverseContext(staged.map(x=>x.row), market);
  Object.assign(market, universeContext.marketPatch);
  // 3.6: the selected V4 research gates are now the actual scanner decision logic.
  // Keep the existing 3.5 analyzer as the context/diagnostic source ONLY; it cannot
  // create CONFIRMED without V4 retest + authentic recent L1 + positive net-R gate.
  // Fresh execution quote AFTER candle downloads and legacy technical calculations.
  // Using the quote fetched *before* network-heavy analysis can cause every
  // real CONFIRMED to be rejected as STALE_QUOTE, even when the market is healthy.
  // Do not silently substitute stale/estimated quotes if this request fails.
  let liveResearchQuotes = researchOptions.replayBars ? (researchOptions.replayQuotes || {}) : {};
  if (!researchOptions.replayBars && useAlpaca && staged.length) {
    try {
      const syms=staged.map(x=>x.row.symbol);
      for(let i=0;i<syms.length;i+=50){Object.assign(liveResearchQuotes,await fetchLatestQuotes(syms.slice(i,i+50),
        process.env.ALPACA_API_KEY_ID, process.env.ALPACA_API_SECRET_KEY));}
    } catch (e) {
      errors.push(`Fresh execution quote refresh failed: ${e?.message||String(e)}`);
    }
  }
  const researchNow = researchOptions.replayBars ? new Date(researchOptions.replayNow) : new Date();
  const recommendations = staged.map(({row,cfg:symbolCfg}) => {
    // Preserve old analytics as context ONLY; it can never veto or select a V3.6 trade.
    let legacy=row;
    if(row._legacyAnalysisReady){try{legacy=applyAdaptiveTargetShadow(classifyV32(applyPerformanceFilter(
      applyV31Context(row, universeContext, market, symbolCfg), calibration, phase, market, symbolCfg), symbolCfg));}
      catch(err){errors.push(`Legacy diagnostics only (${row.symbol}) failed: ${err?.message||err}`);}}
    // IMPORTANT: even if old diagnostics fail, research36 execution still runs.
    const decision = evaluateLiveResearch36(row.symbol,candlesBySymbol.get(row.symbol),spyCandles,
      liveResearchQuotes[row.symbol]||null,{now:researchNow,shariaApproved:true,modeConfig:symbolCfg,allowHistorical:!!researchOptions.replayBars});
    const confirmed = decision.state === 'CONFIRMED' && !!decision.risk;
    const risk = decision.risk;
    // Profit-potential score combines signal quality with net reward potential;
    // it is NOT a calibrated probability or expected return.
    const score = confirmed ? Math.round(Math.max(0,Math.min(100,
      (decision.qualityScore||0)*.50 + Math.min(100,Math.max(0,risk.netRewardR||0)*45)*.35 +
      Math.min(100,Math.max(0,decision.features?.hodGapPct||0)*45)*.15)))
      : Math.round(Math.max(0,Math.min(100,(decision.qualityScore||0)*.75+
       Math.min(100,Math.max(0,decision.features?.hodGapPct||0)*45)*.25)));
    const targetLevels = confirmed ? {
      entryLow:risk.entry, entryHigh:risk.entry, stopLoss:risk.stop,
      target1:Number((risk.entry + .50*(risk.exitTarget-risk.entry)).toFixed(4)),
      target2:Number((risk.entry + .75*(risk.exitTarget-risk.entry)).toFixed(4)),
      target3:risk.exitTarget,
    } : {};
    return {...legacy,...targetLevels,
      price:confirmed?risk.entry:legacy.price,
      side:confirmed?'LONG':'WAIT',tradeable:confirmed,
      recommendationState:decision.state,hiddenV32:false,badTrade:false,conditionalTrade:decision.state==='SMART',
      stateReason:decision.reason,quality:confirmed?'CONFIRMED PAPER — V3.7 Active Research':'3.7 Research — '+decision.reason,
      confidence:score,profitPotentialScore:score,setupQualityScore:decision.qualityScore??null,
      confidenceProbability:null,confidenceStatus:'UNCALIBRATED',
      shadowTargets:confirmed?risk.shadow:null,
      exitPlan:confirmed?{profile:'V36_BLEND_DYNAMIC',t1R:.5,t2R:.75,t3R:1,
        target1Pct:(targetLevels.target1/risk.entry-1),target2Pct:(targetLevels.target2/risk.entry-1),
        target3Pct:(targetLevels.target3/risk.entry-1),afterT1:'Monitor / research only',
        afterT2:'Monitor / research only',runner:'Shadow of 6 alternatives'}:legacy.exitPlan,
      entryCostModel:confirmed?{feeRoundTripUsd:2,capitalUsd:1000,
        netRewardR:risk.netRewardR,netGainUsd:risk.netGainUsd,netLossUsd:risk.netLossUsd}:null,
      research36:{...decision,originalV35State:legacy.recommendationState,originalV35Confidence:legacy.confidence,legacyDiagnosticOnly:true},
      recommendedTarget:confirmed?'BLEND_DYNAMIC':'WAIT',targetConfidence:null,
      metrics:{...legacy.metrics,setupFamily:decision.retestModel||'OPENING_RESEARCH',setupFamilyLabel:decision.retestModel?`3.6 ${decision.retestModel} Retest`:'3.6 Opening Watch',
        setupState:confirmed?'CONFIRMED':decision.smartStage==='PENDING_VALID'?'PENDING_VALID':decision.smartStage==='EXPIRED'?'EXPIRED':decision.smartStage==='OPENING_WATCH'?'OPENING_WATCH':'WAIT_OPENING',
        setupQuality:decision.qualityScore??0,atr:decision.features?.atr14??null,
        relativeStrengthPct:decision.features?.relativeStrengthPct??null,
        relativeVolume:decision.features?.openingVolRatio??null,
        vwap:decision.features?.vwap??null,rsi:decision.features?.rsi14??null,
        macdHistogram:decision.features?.macd??null,
        distanceFromSessionHighPct:decision.features?.hodGapPct??null,
        bid:decision.quote?.bid??null,ask:decision.quote?.ask??null,
        quoteAgeSec:decision.quote?.ageSec??null,spreadBps:decision.quote?.spreadBps??null,
        quoteFresh:decision.quote?.ageSec!=null&&decision.quote.ageSec>=0&&decision.quote.ageSec<=7,
        spreadSource:decision.quote?.source||'MISSING',
        trigger:decision.trigger,retestSupport:decision.retestSupport,
        v36Research:true}
    };
  });

  recommendations.sort((a,b)=>Number(b.profitPotentialScore||0)-Number(a.profitPotentialScore||0));
  const tradeable = recommendations.filter((r) => r.recommendationState === "CONFIRMED");
  const fallbackTrade = null;
  const display5 = recommendations.slice(0, 5);
  return {
    generatedAt: new Date().toISOString(),
    market,
    focus: recommendations[0] || null,
    top5: tradeable.slice(0, 5),
    display5,
    fallbackTrade,
    dailyRecommendation: tradeable[0] || fallbackTrade || null,
    all: recommendations,
    errors,
    scanHealth:{attemptedSymbols:needed,successfulSymbols,failedSymbols,attemptedCount:needed.length,successfulCount:successfulSymbols.length,failedCount:failedSymbols.length,coveragePct:needed.length?Number((successfulSymbols.length/needed.length*100).toFixed(2)):100},
    strategyVersion: "3.6",
    strategyMode: cfg.id,
    strategyModeLabel: cfg.label,
    performanceCalibration: { active: Boolean(calibration?.active), sampleSize: Number(calibration?.sampleSize || 0), minConfidence: Math.max(cfg.minConfidence, Number(calibration?.minConfidence || cfg.minConfidence)), phase },
    dataCoverage: "REGULAR_SESSION",
    dataProvider: useAlpaca ? "Alpaca IEX 1Min" : "Twelve Data 1Min",
    coverageNote: `Dynamic Trading 3.6: Sharia-first Dynamic Scanner تحت $200 بدون استثناءات سعرية، Better Entry/HOD protection، Signal History، وSpread/quote validation. أهداف CONFIRMED ديناميكية وفق V4 وShadow ×6، وConfidence غير مُعاير.`,
  };
}


function buildBadTradeFallback(r, calibration = {}, phase = "09:30–10:09", cfg = STRATEGY_MODES.active) {
  if (!r) return null;
  const side = "LONG"; // Halal mode: BAD TRADE is still buy-only; SHORT is never actionable.
  const expectation = Number.isFinite(Number(r.metrics?.expectedR))
    ? { expectedR:Number(r.metrics.expectedR), winRate:Number(r.metrics?.expectedWinRate || 0), avgWinR:Number(r.metrics?.expectedAvgWinR || 1.5), source:r.metrics?.expectationSource || "model" }
    : estimateExpectedValue({ ...r, side }, calibration, phase, cfg);
  const rejected = r.filters?.rejectedReason || (r.side === "WAIT" ? `Setup ${r.metrics?.setupState || "غير مكتمل"}` : "لم يمر شرط الدقة");
  return {
    ...r,
    side,
    tradeable:false,
    badTrade:true,
    paperOnly:true,
    quality:`BAD TRADE — شراء فقط / شروط ${cfg.label} غير مكتملة`,
    metrics:{...(r.metrics||{}), expectedR:expectation.expectedR, expectedWinRate:expectation.winRate, expectationSource:expectation.source, expectedAvgWinR:expectation.avgWinR},
    reason:`BAD TRADE / متابعة شراء فقط — الوضع الشرعي يمنع البيع على المكشوف. سبب الرفض: ${rejected}. ${r.reason}`,
    filters:{...(r.filters||{}), rejectedReason:rejected, strategyMode:cfg.id, badTradeFallback:true},
  };
}


function buildDisplayRow(r, calibration = {}, phase = "09:30–10:09", cfg = STRATEGY_MODES.active) {
  if (!r || r.hiddenV32) return null;
  return r;
}

export function buildRecommendationDeck(data, primarySymbols=[], calibration={}, phase="10:10–10:29", mode="active", maxRecommendations=8){
  if(!data)return data;
  const primary=[...new Set((primarySymbols||[]).map(x=>String(x).trim().toUpperCase()).filter(Boolean))].slice(0,5);
  const visible=(data.all||[]).filter(r=>r&&!r.hiddenV32&&["BAD","WAIT","SMART","CONFIRMED"].includes(r.recommendationState));
  const bySymbol=new Map(visible.map(r=>[r.symbol,r]));
  const primaryRows=primary.map(symbol=>bySymbol.get(symbol)).filter(Boolean).map(r=>({...r,recommendationSource:"PRIMARY",sourceLabel:"من قائمتك",alternativeFor:null}));
  const altPool=visible.filter(r=>!primary.includes(r.symbol)).sort((a,b)=>Number(b.tradePriority||b.confidence||0)-Number(a.tradePriority||a.confidence||0));
  // Recommendation count follows quality, not a fixed card quota. BAD/WAIT rows never fill a quota at the expense of SMART.
  const actionable=altPool.filter(r=>r.recommendationState==="CONFIRMED"||r.recommendationState==="SMART");
  const display8=[...primaryRows,...actionable]; // legacy field name retained for UI/API compatibility; no 8-symbol cap.
  const confirmed=display8.filter(r=>r.recommendationState==="CONFIRMED");
  return {...data,primarySymbols:primary,primaryCount:primaryRows.length,alternativesAdded:actionable.length,display8,display5:display8.slice(0,5),focus:display8[0]||null,top5:confirmed.slice(0,5),allConfirmed:confirmed,fallbackTrade:null,dailyRecommendation:confirmed[0]||display8.find(r=>r.recommendationState==="SMART")||null,recommendationDeck:{max:null,visible:display8.length,dynamic:true,note:"عدد التوصيات ديناميكي حسب جودة الفرص؛ CONFIRMED وSMART فقط."}};
}

function applyPerformanceFilter(r, calibration = {}, phase = "09:30–10:09", market = {}, cfg = STRATEGY_MODES.precision) {
  if (!r) return r;
  if (r.side === "WAIT" && cfg.id !== "active") return r;
  const activeCalibration = Boolean(calibration?.active) && Number(calibration?.sampleSize || 0) >= 20;
  const globalMin = activeCalibration ? Math.max(cfg.minConfidence, Number(calibration?.minConfidence || cfg.minConfidence)) : cfg.minConfidence;
  const symbolMin = activeCalibration ? Math.max(cfg.minConfidence, Number(calibration?.symbolThresholds?.[r.symbol] || globalMin)) : globalMin;
  const phaseMin = activeCalibration ? Math.max(cfg.minConfidence, Number(calibration?.phaseThresholds?.[phase] || globalMin)) : globalMin;
  let required = Math.max(globalMin, symbolMin, phaseMin);
  let reason = "";
  const rv = Number(r.metrics?.relativeVolume || 0);
  const roomR = Number(r.metrics?.roomR || 0);
  const retestQuality = Number(r.metrics?.retestQuality || 0);
  const setupQuality = Number(r.metrics?.setupQuality || retestQuality || 0);
  const mtf = Number(r.metrics?.mtfAlignment || 0);
  const inPlay = Number(r.inPlayScore || 0);
  const liquidity = Number(r.metrics?.liquidityScore || 0);
  const rs = Number(r.metrics?.relativeStrengthPct || 0);
  const atrPct = Number(r.metrics?.atrPct || 0);
  const chaseRaw = r.metrics?.chaseDistanceAtr;
  const chase = chaseRaw === null || chaseRaw === undefined ? null : Number(chaseRaw);
  const newsSentiment = Number(r.news?.sentimentScore || 0);
  const newsRisk = Number(r.news?.riskScore || 0);
  const newsCatalyst = Number(r.news?.catalystScore || 0);
  const expectation = estimateExpectedValue(r, calibration, phase, cfg);
  const ov = calibration?.riskOverrides || {};

  // v2.7 Active Flexible: safety/execution remain hard gates, while RVOL, MTF,
  // Retest, In-Play and relative strength are scoring inputs. One mediocre soft
  // metric can no longer cancel an otherwise usable long setup.
  if(cfg.id === "active"){
    const softWarnings=[];
    if(rv < Number(cfg.minRvol||.75))softWarnings.push(`RVOL ${rv.toFixed(2)} منخفض`);
    if(roomR < Number(cfg.minRoomR||.75))softWarnings.push(`Room ${roomR.toFixed(2)}R محدود`);
    if(retestQuality < Number(cfg.minRetestQuality||45) && r.metrics?.setupFamily === "BREAKOUT_RETEST")softWarnings.push(`Retest ${Math.round(retestQuality)}/100`);
    if(setupQuality < 55)softWarnings.push(`Setup ${Math.round(setupQuality)}/100`);
    if(mtf < Number(cfg.minMtfAlignment||45))softWarnings.push(`MTF ${Math.round(mtf)}/100`);
    if(inPlay < Number(cfg.minInPlay||35))softWarnings.push(`In-Play ${Math.round(inPlay)}/100`);
    if(rs < Number(cfg.minRelativeStrengthLong||-.30))softWarnings.push(`RS ${rs.toFixed(2)}%`);
    if(market.regime === "NEUTRAL")softWarnings.push("السوق متوازن");

    const spreadBps=Number(r.metrics?.spreadBps),quoteFresh=r.metrics?.quoteFresh===true;
    const spreadSource=String(r.metrics?.spreadSource||""); const consolidatedSpread=/SIP|NBBO|CONSOLIDATED/i.test(spreadSource);
    const family=String(r.metrics?.setupFamily||"BREAKOUT_RETEST");
    const chaseLimit=family==="MOMENTUM_CONTINUATION"?1.35:family==="VWAP_RECLAIM"?1.15:family==="FIRST_15M_CANDLE"?1.20:Number(cfg.maxChaseAtr||1.05);
    if(liquidity < 28)reason=`السيولة ضعيفة جداً للتنفيذ (${Math.round(liquidity)}/100)`;
    if(quoteFresh && Number.isFinite(spreadBps) && spreadBps > Number(cfg.maxSpreadBps||35))softWarnings.push(`Spread ${spreadBps.toFixed(1)} bps يحتاج تحسن`);
    if(!reason && consolidatedSpread && quoteFresh && Number.isFinite(spreadBps) && spreadBps > Number(cfg.smartSpreadBps||70))reason=`الـSpread غير آمن (${spreadBps.toFixed(1)} bps)`;
    if(Number.isFinite(chase) && chase > chaseLimit)softWarnings.push(`السعر ممتد ${chase.toFixed(2)} ATR — انتظر Retest`);
    if(!reason && newsRisk >= 85)reason="خبر/إعلان عالي المخاطر جداً — تم منع الدخول";
    if(!reason && newsCatalyst >= 75 && newsSentiment < -22)reason="Catalyst قوي لكنه سلبي بوضوح للشراء";
    if(!reason && ov.newsStrict && newsSentiment < -12)reason="Error Lab فعّل فلتر أخبار مشدد والخبر معاكس";
    if(!reason && expectation.expectedR < -0.08)reason=`Expectation ${expectation.expectedR.toFixed(2)}R سالب أكثر من الحد الآمن`;
    if(market.regime === "TREND_DOWN" && rs < -.35)required += 3;
    if(atrPct > 1.8)required += 2;
    // Active must stay usable: adaptive learning can tighten, but never turn the
    // everyday mode into High Precision. The hard-risk gates above still veto.
    required=Math.min(72,required);
    const rawConfidence=Number(r.confidence||0);
    const setupState=String(r.metrics?.setupState||"");
    const setupQualityNow=Number(r.metrics?.setupQuality||0);
    const sessionReady=r.metrics?.sessionReady!==false;
    const closeToTrigger=["WAIT_15M_CONFIRMATION","WAIT_CONFIRMATION","WAIT_RETEST","WAIT_MOMENTUM","WAIT_RECLAIM","WAIT_BREAKOUT"].includes(setupState);

    if(reason){
      return {...r,rawSide:r.side,rawConfidence,side:"WAIT",tradeable:false,conditionalTrade:false,badTrade:true,
        metrics:{...(r.metrics||{}),expectedR:expectation.expectedR,expectedWinRate:expectation.winRate,expectationSource:expectation.source,expectedAvgWinR:expectation.avgWinR},
        quality:"D — تجنب / فلتر أمان",
        reason:`${r.reason} | EV ${expectation.expectedR>=0?"+":""}${expectation.expectedR.toFixed(2)}R (${Math.round(expectation.winRate*100)}% تقديري) | سبب الرفض: ${reason}${softWarnings.length?` | ملاحظات: ${softWarnings.join("، ")}`:""}`,
        filters:{requiredConfidence:required,minExpectedR:-.08,maxSpreadBps:Number(cfg.maxSpreadBps||35),performanceActive:activeCalibration,phase,marketRegime:market.regime,strategyMode:cfg.id,rejectedReason:reason,hardReject:true,softWarnings,appliedOverrides:ov}};
    }

    if(r.side === "WAIT" || rawConfidence < required){
      const conditional = sessionReady && rawConfidence >= 58 && setupQualityNow >= 48 && (closeToTrigger || rawConfidence >= 66);
      return {...r,rawSide:r.side,rawConfidence,side:"WAIT",tradeable:false,conditionalTrade:conditional,badTrade:false,
        metrics:{...(r.metrics||{}),expectedR:expectation.expectedR,expectedWinRate:expectation.winRate,expectationSource:expectation.source,expectedAvgWinR:expectation.avgWinR},
        quality:conditional?"WAIT — توصية مشروطة / قريبة من التفعيل":"C — مراقبة",
        reason:`${r.reason} | EV ${expectation.expectedR>=0?"+":""}${expectation.expectedR.toFixed(2)}R (${Math.round(expectation.winRate*100)}% تقديري) | ${conditional?"ليست BAD TRADE؛ انتظر Trigger/تأكيد السعر":"الجودة أو الـSetup ما زالا ضعيفين"}${rawConfidence<required?` · الجودة ${rawConfidence}% مقابل ${required}%`:""}${softWarnings.length?` | ملاحظات: ${softWarnings.join("، ")}`:""}`,
        filters:{requiredConfidence:required,minExpectedR:-.08,maxSpreadBps:Number(cfg.maxSpreadBps||35),performanceActive:activeCalibration,phase,marketRegime:market.regime,strategyMode:cfg.id,rejectedReason:null,hardReject:false,conditionalReason:conditional?"WAIT_TRIGGER":null,softWarnings,appliedOverrides:ov}};
    }
    return {...r,conditionalTrade:false,badTrade:false,tradePriority:Number(r.tradePriority||0)+Math.max(-4,Math.min(10,expectation.expectedR*12)),
      metrics:{...(r.metrics||{}),expectedR:expectation.expectedR,expectedWinRate:expectation.winRate,expectationSource:expectation.source,expectedAvgWinR:expectation.avgWinR},
      reason:`${r.reason} | EV ${expectation.expectedR>=0?"+":""}${expectation.expectedR.toFixed(2)}R (${Math.round(expectation.winRate*100)}% تقديري)${softWarnings.length?` | ملاحظات: ${softWarnings.join("، ")}`:""}`,
      filters:{requiredConfidence:required,minExpectedR:-.08,maxSpreadBps:Number(cfg.maxSpreadBps||35),performanceActive:activeCalibration,phase,marketRegime:market.regime,strategyMode:cfg.id,rejectedReason:null,hardReject:false,softWarnings,appliedOverrides:ov}};
  }

  // Balanced / High Precision preserve the stricter legacy gate stack.
  const effectiveMinRvol = cfg.minRvol + Math.max(0, Number(ov.rvolBoost || 0));
  const effectiveRetest = cfg.minRetestQuality + Math.max(0, Number(ov.retestBoost || 0));
  const effectiveMtf = cfg.minMtfAlignment + Math.max(0, Number(ov.mtfBoost || 0));
  const effectiveRoom = cfg.minRoomR + Math.max(0, Number(ov.roomRBoost || 0));
  const effectiveChase = Math.max(0.35, cfg.maxChaseAtr - Math.max(0, Number(ov.chaseCut || 0)));
  const rsBoost = Math.max(0, Number(ov.relativeStrengthBoost || 0));
  const effectiveRsLong = cfg.minRelativeStrengthLong + rsBoost;
  const effectiveRsShort = cfg.maxRelativeStrengthShort - rsBoost;

  if (market.regime === "NEUTRAL") {
    required += cfg.id === "precision" ? 4 : 3;
    const exceptionalRs = r.side === "LONG" ? rs >= 0.35 : rs <= -0.35;
    if (cfg.id === "precision" && !exceptionalRs && rv < Math.max(1.80, effectiveMinRvol)) reason = `السوق متوازن؛ High Precision يحتاج RVOL ${Math.max(1.80,effectiveMinRvol).toFixed(2)}+ أو قوة نسبية استثنائية`;
    else if (rv < Math.max(effectiveMinRvol, 1.45)) reason = `السوق متوازن وRVOL أقل من ${Math.max(effectiveMinRvol,1.45).toFixed(2)}`;
  } else if (market.regime === "TREND_UP" && r.side === "SHORT") required += cfg.id === "precision" ? 6 : 5;
  else if (market.regime === "TREND_DOWN" && r.side === "LONG") required += cfg.id === "precision" ? 6 : 5;

  if (!reason && rv < effectiveMinRvol) reason = `RVOL أقل من ${effectiveMinRvol.toFixed(2)}`;
  if (!reason && roomR < effectiveRoom) reason = `المساحة قبل المقاومة/الدعم أقل من ${effectiveRoom.toFixed(1)}R`;
  if (!reason && retestQuality < effectiveRetest) reason = `جودة الـRetest ${Math.round(retestQuality)}/100 أقل من المطلوب ${Math.round(effectiveRetest)}`;
  if (!reason && mtf < effectiveMtf) reason = `توافق 1m/5m/15m غير كافٍ (${Math.round(mtf)}/100؛ المطلوب ${Math.round(effectiveMtf)})`;
  if (!reason && inPlay < cfg.minInPlay) reason = `السهم ليس Stocks in Play بما يكفي (${Math.round(inPlay)}/100)`;
  if (!reason && liquidity < cfg.minLiquidityScore) reason = `السيولة اللحظية التقديرية ضعيفة (${Math.round(liquidity)}/100)`;
  const spreadBps=Number(r.metrics?.spreadBps),quoteFresh=r.metrics?.quoteFresh===true;
  if (!reason && quoteFresh && Number.isFinite(spreadBps) && spreadBps > Number(cfg.maxSpreadBps||20)) reason = `الـSpread واسع (${spreadBps.toFixed(1)} bps؛ الحد ${Number(cfg.maxSpreadBps||20).toFixed(0)} bps)`;
  if (!reason && Number.isFinite(chase) && chase > effectiveChase) reason = `الدخول متأخر/مطاردة (${chase.toFixed(2)} ATR؛ الحد ${effectiveChase.toFixed(2)})`;
  if (!reason && r.side === "LONG" && rs < effectiveRsLong) reason = `القوة النسبية ضعيفة (${rs.toFixed(2)}%)`;
  if (!reason && r.side === "LONG" && newsRisk >= 80) reason = "إعلان رسمي عالي المخاطر — High Precision يرفض LONG";
  if (!reason && newsCatalyst >= 70 && r.side === "LONG" && newsSentiment < -18) reason = "Catalyst قوي لكنه معاكس للشراء";
  if (!reason && expectation.expectedR < cfg.minExpectedR) reason = `Expectation ${expectation.expectedR.toFixed(2)}R أقل من الحد ${cfg.minExpectedR.toFixed(2)}R`;
  if (!reason && atrPct > 1.40) required += 4; else if (!reason && atrPct > .90) required += 2;
  required=Math.min(94,required);
  const rawConfidence=Number(r.confidence||0);
  if(reason||rawConfidence<required){return {...r,rawSide:r.side,rawConfidence,side:"WAIT",tradeable:false,metrics:{...(r.metrics||{}),expectedR:expectation.expectedR,expectedWinRate:expectation.winRate,expectationSource:expectation.source,expectedAvgWinR:expectation.avgWinR},quality:"مراقبة — High Precision",reason:`${r.reason} | EV ${expectation.expectedR>=0?"+":""}${expectation.expectedR.toFixed(2)}R (${Math.round(expectation.winRate*100)}% تقديري) | لم تُعتمد: ${reason||`تحتاج درجة توافق ${required}%+`}`,filters:{requiredConfidence:required,minExpectedR:cfg.minExpectedR,maxSpreadBps:Number(cfg.maxSpreadBps||20),performanceActive:activeCalibration,phase,marketRegime:market.regime,strategyMode:cfg.id,rejectedReason:reason||"CONFIDENCE",appliedOverrides:ov}};}
  return {...r,tradePriority:Number(r.tradePriority||0)+Math.max(-5,Math.min(10,expectation.expectedR*12)),metrics:{...(r.metrics||{}),expectedR:expectation.expectedR,expectedWinRate:expectation.winRate,expectationSource:expectation.source,expectedAvgWinR:expectation.avgWinR},reason:`${r.reason} | EV ${expectation.expectedR>=0?"+":""}${expectation.expectedR.toFixed(2)}R (${Math.round(expectation.winRate*100)}% تقديري)`,filters:{requiredConfidence:required,minExpectedR:cfg.minExpectedR,maxSpreadBps:Number(cfg.maxSpreadBps||20),performanceActive:activeCalibration,phase,marketRegime:market.regime,strategyMode:cfg.id,rejectedReason:null,appliedOverrides:ov}};
}

export function analyze(symbol, candles, market, weights = BASE_WEIGHTS, cfg = STRATEGY_MODES.precision) {
  if (candles.length < 220) throw new Error(`بيانات غير كافية لـ ${symbol}`);
  const closes = candles.map((x) => x.close);
  const price = closes.at(-1);
  const atrValue = Math.max(atr(candles, 14), price * 0.003);
  const e9 = ema(closes, 9).at(-1), e20 = ema(closes, 20).at(-1), e50 = ema(closes, 50).at(-1), e200 = ema(closes, 200).at(-1);
  const rsiValue = rsi(closes, 14), macdHist = macdHistogram(closes);
  const ctx = sessionContext(candles, atrValue, cfg);
  const [support, resistance] = supportResistance(candles);

  const longTrend = price > e9 && e9 > e20 && e20 > e50 && price > e200 ? 100
    : price > e20 && e20 > e50 && price > e200 ? 82
    : price > e20 ? 65 : price > e50 ? 48 : 25;
  const shortTrend = 100 - longTrend;
  const longMomentum = (momentumRsiLong(rsiValue) + (macdHist > 0 ? 90 : 30)) / 2;
  const shortMomentum = (momentumRsiShort(rsiValue) + (macdHist < 0 ? 90 : 30)) / 2;
  const volScore = rvolScore(ctx.relativeVolume);
  const longStructure = structureWithSetup("LONG", price, support, resistance, atrValue, ctx);
  const shortStructure = structureWithSetup("SHORT", price, support, resistance, atrValue, ctx);

  const mtf = multiTimeframeAlignment(candles);
  const relativeStrengthPct = ctx.sessionChangePct - Number(market.benchmarkChangePct || 0);
  const liquidityScore = calcLiquidityScore(ctx.avgMinuteDollarVolume, price, atrValue);
  const longRetestQuality = retestQualityScore("LONG", ctx.longSetup, ctx, atrValue);
  const shortRetestQuality = retestQualityScore("SHORT", ctx.shortSetup, ctx, atrValue);
  const setupChoice = chooseLongSetup(ctx, longRetestQuality, cfg);
  const setupQuality = Number(setupChoice?.quality || longRetestQuality || 20);
  const longRelativeStrengthScore = directionalRelativeStrengthScore("LONG", relativeStrengthPct);
  const shortRelativeStrengthScore = directionalRelativeStrengthScore("SHORT", relativeStrengthPct);
  const inPlayScore = calcInPlayScore(ctx.relativeVolume, atrValue, price, Math.abs(ctx.sessionChangePct));

  const longFeatures = { trend: longTrend, momentum: longMomentum, volume: volScore, structure: longStructure, market: market.combined };
  const shortFeatures = { trend: shortTrend, momentum: shortMomentum, volume: volScore, structure: shortStructure, market: 100 - market.combined };
  const longBase = weighted(longFeatures, weights), shortBase = weighted(shortFeatures, weights);
  const legacyLongSetup = setupScore("LONG", { longTrend, shortTrend, market, ctx });
  const shortSetup = setupScore("SHORT", { longTrend, shortTrend, market, ctx });
  const longPrecision = precisionScore({ mtf:mtf.long, retest:cfg.id === "active" ? setupQuality : longRetestQuality, relativeStrength:longRelativeStrengthScore, liquidity:liquidityScore, inPlay:inPlayScore });
  const shortPrecision = precisionScore({ mtf:mtf.short, retest:shortRetestQuality, relativeStrength:shortRelativeStrengthScore, liquidity:liquidityScore, inPlay:inPlayScore });

  // Active Flexible uses four independent setup families. RVOL/MTF/Retest/In-Play
  // influence the score but no longer veto a valid setup one-by-one.
  const longScore = cfg.id === "active"
    ? longBase * .38 + setupQuality * .28 + mtf.long * .12 + inPlayScore * .08 + liquidityScore * .06 + longRelativeStrengthScore * .05 + market.combined * .03
    : (()=>{const blend=cfg.id === "precision" ? {base:.25,setup:.43,precision:.32}:{base:.34,setup:.46,precision:.20};return longBase*blend.base+legacyLongSetup*blend.setup+longPrecision*blend.precision;})();
  const shortScore = cfg.id === "active"
    ? shortBase * .42 + shortSetup * .38 + shortPrecision * .20
    : (()=>{const blend=cfg.id === "precision" ? {base:.25,setup:.43,precision:.32}:{base:.34,setup:.46,precision:.20};return shortBase*blend.base+shortSetup*blend.setup+shortPrecision*blend.precision;})();

  const rawLongStop = cfg.id === "active" && setupChoice?.type !== "BREAKOUT_RETEST"
    ? price - atrValue * .75
    : stopForSetup("LONG", price, support, resistance, atrValue, ctx.longSetup, ctx);
  const shortStop = stopForSetup("SHORT", price, support, resistance, atrValue, ctx.shortSetup, ctx);
  const plannedLongStop = cfg.id === "active" ? boundedActiveStop(price, rawLongStop, cfg, atrValue) : rawLongStop;
  const longRisk = cfg.id === "active" ? Math.max(price - plannedLongStop, price * Number(cfg.minStopPct || 0.0050)) : Math.max(price - rawLongStop, atrValue * 0.60);
  const shortRisk = Math.max(shortStop - price, atrValue * 0.60);
  const longRoomR = roomToStructureR("LONG", price, resistance, longRisk, atrValue);
  const shortRoomR = roomToStructureR("SHORT", price, support, shortRisk, atrValue);
  const atrPct = price ? (atrValue / price) * 100 : 0;

  const longMarketGate = market.regime !== "NEUTRAL" ? market.combined >= 48 : (cfg.id !== "precision" || relativeStrengthPct >= 0.35 || ctx.relativeVolume >= 1.80);
  const shortMarketGate = market.regime !== "NEUTRAL" ? market.combined <= 52 : (cfg.id !== "precision" || relativeStrengthPct <= -0.35 || ctx.relativeVolume >= 1.80);

  let longGate;
  let activeRevalidated = false;
  if(cfg.id === "active"){
    const confirmed = setupChoice?.state === "CONFIRMED";
    const chaseLimit = setupChoice?.type === "MOMENTUM_CONTINUATION" ? 1.35 : setupChoice?.type === "VWAP_RECLAIM" ? 1.18 : setupChoice?.type === "FIRST_15M_CANDLE" ? 1.25 : Number(cfg.maxChaseAtr||1.08);
    const chase = Number(setupChoice?.chaseDistanceAtr ?? 0);
    // A strong signal is not discarded merely because its confirmation is a few
    // minutes old. Revalidate only if price still holds above VWAP, trend is intact,
    // quality is high and the entry has not become a chase.
    activeRevalidated = setupChoice?.state === "EXPIRED" && setupQuality >= 72 && ctx.aboveVwap && longTrend >= 65 && chase <= chaseLimit * .82;
    const actionable = confirmed || activeRevalidated;
    longGate = ctx.ready && actionable && ctx.aboveVwap
      && longTrend >= 48
      && liquidityScore >= Number(cfg.minLiquidityScore||32)
      && chase <= chaseLimit
      && longRoomR >= .50
      && (market.combined >= 28 || relativeStrengthPct >= .05 || longTrend >= 82);
  }else{
    longGate = ctx.ready
      && ctx.longSetup.state === "CONFIRMED"
      && ctx.aboveVwap && ctx.vwapSlope >= 0
      && ctx.relativeVolume >= cfg.minRvol
      && ctx.longSetup.breakoutVolumeRatio >= cfg.minBreakoutVolume
      && ctx.longSetup.confirmationVolumeRatio >= cfg.minConfirmationVolume
      && (ctx.longSetup.chaseDistanceAtr ?? 99) <= cfg.maxChaseAtr
      && longTrend >= 65 && mtf.long >= cfg.minMtfAlignment
      && longRetestQuality >= cfg.minRetestQuality
      && relativeStrengthPct >= cfg.minRelativeStrengthLong
      && liquidityScore >= cfg.minLiquidityScore
      && inPlayScore >= cfg.minInPlay
      && longMarketGate && longRoomR >= cfg.minRoomR;
  }
  const shortGate = ctx.ready
    && ctx.shortSetup.state === "CONFIRMED"
    && !ctx.aboveVwap && ctx.vwapSlope <= 0
    && ctx.relativeVolume >= cfg.minRvol
    && ctx.shortSetup.breakoutVolumeRatio >= cfg.minBreakoutVolume
    && ctx.shortSetup.confirmationVolumeRatio >= cfg.minConfirmationVolume
    && (ctx.shortSetup.chaseDistanceAtr ?? 99) <= cfg.maxChaseAtr
    && shortTrend >= 65 && mtf.short >= cfg.minMtfAlignment
    && shortRetestQuality >= cfg.minRetestQuality
    && relativeStrengthPct <= cfg.maxRelativeStrengthShort
    && liquidityScore >= cfg.minLiquidityScore
    && inPlayScore >= cfg.minInPlay
    && shortMarketGate && shortRoomR >= cfg.minRoomR;

  // HALAL MODE: only LONG recommendations can become actionable.
  let side = "WAIT";
  if (longGate && longScore >= cfg.minConfidence && (cfg.id === "active" || longScore >= shortScore + cfg.scoreGap)) side = "LONG";

  const preferredSetup = cfg.id === "active"
    ? (activeRevalidated ? {...setupChoice,state:"REVALIDATED",label:`${setupChoice?.label||"Setup"} · Revalidated`} : setupChoice)
    : ctx.longSetup;
  const confidence = clamp(Math.round(longScore));
  const features = longFeatures;
  const chosenMtf = mtf.long;

  const entryHalf = atrValue * (cfg.id === "precision" ? 0.06 : cfg.id === "active" ? 0.05 : 0.08);
  const entryLow = price - entryHalf, entryHigh = price + entryHalf;
  const stopLoss = plannedLongStop;
  const actualRisk = cfg.id === "active" ? Math.max(Math.abs(price - stopLoss), price * Number(cfg.minStopPct || 0.0050)) : Math.max(Math.abs(price - stopLoss), atrValue * 0.60);
  const roomR = longRoomR;
  const exitPlan = adaptiveExitPlan({side:"LONG", market, relativeVolume:ctx.relativeVolume, roomR, confidence, retestQuality:setupQuality, price, actualRisk}, cfg);
  const t1 = Number(exitPlan.target1Pct) > 0 ? price * (1 + Number(exitPlan.target1Pct)) : price + actualRisk * exitPlan.t1R;
  const t2 = Number(exitPlan.target2Pct) > 0 ? price * (1 + Number(exitPlan.target2Pct)) : price + actualRisk * exitPlan.t2R;
  const t3 = Number(exitPlan.target3Pct) > 0 ? price * (1 + Number(exitPlan.target3Pct)) : price + actualRisk * exitPlan.t3R;
  const quality = side === "WAIT"
    ? confidence >= 55 ? "C — مراقبة / فرصة غير مكتملة" : "D — ضعيفة / للمراقبة"
    : confidence >= 84 ? "A — قوية" : confidence >= 72 ? "B+ — جيدة جداً" : "B — قابلة للتداول";
  const actionText = side === "LONG" ? "شراء" : "انتظار شراء";
  const vwapDir = ctx.vwapSlope > 0.02 ? "صاعد" : ctx.vwapSlope < -0.02 ? "هابط" : "مسطح";
  const setupText = setupFamilyArabic(preferredSetup);
  const tradePriority = confidence * 0.55 + inPlayScore * 0.09 + setupQuality * 0.16 + chosenMtf * 0.08 + liquidityScore * 0.06 + longRelativeStrengthScore * 0.06;

  return {
    symbol, side, fallbackSide:"LONG", tradeable:side === "LONG" && confidence >= cfg.minConfidence, halalMode:true, shariaActivityScreened:true, shariaFinancialScreen:"REVIEW_REQUIRED",
    price, entryLow, entryHigh, target1:t1, target2:t2, target3:t3, stopLoss, exitPlan,
    support, resistance, confidence, quality, inPlayScore:Math.round(inPlayScore), tradePriority,
    reason:`${actionText} | ${setupText} | OR15 ${fmt(ctx.openingLow)}–${fmt(ctx.openingHigh)} | VWAP ${fmt(ctx.vwap)} (${vwapDir}) | RVOL ×${ctx.relativeVolume.toFixed(2)} | MTF ${Math.round(chosenMtf)}/100 | Setup ${Math.round(setupQuality)}/100 | RS ${relativeStrengthPct>=0?'+':''}${relativeStrengthPct.toFixed(2)}% | السوق ${Math.round(market.combined)}%`,
    generatedAt:new Date().toISOString(),
    features,
    scores:{long:Math.round(longScore),short:Math.round(shortScore),longSetup:Math.round(cfg.id === "active" ? setupQuality : legacyLongSetup),shortSetup:Math.round(shortSetup),longPrecision:Math.round(longPrecision),shortPrecision:Math.round(shortPrecision)},
    metrics:{
      ema9:e9,ema20:e20,ema50:e50,ema200:e200,rsi:rsiValue,macdHistogram:macdHist,
      relativeVolume:ctx.relativeVolume,cumulativeRvol:ctx.cumulativeRvol,recentRvol:ctx.recentRvol,rvolSampleDays:ctx.rvolSampleDays,atr:atrValue,atrPct,sessionChangePct:ctx.sessionChangePct,sessionHigh:ctx.sessionHigh,sessionLow:ctx.sessionLow,recent5High:ctx.recent5High,recent5Low:ctx.recent5Low,distanceFromSessionHighPct:ctx.distanceFromSessionHighPct,
      vwap:ctx.vwap,vwapSlope:ctx.vwapSlope,
      openingRangeHigh:ctx.openingHigh,openingRangeLow:ctx.openingLow,sessionReady:ctx.ready,
      setupState:preferredSetup?.state||ctx.longSetup.state,
      setupFamily:preferredSetup?.type||"BREAKOUT_RETEST",setupFamilyLabel:preferredSetup?.label||"Breakout + Retest",setupQuality,
      longSetupState:ctx.longSetup.state,shortSetupState:ctx.shortSetup.state,
      breakoutVolumeRatio:preferredSetup?.breakoutVolumeRatio||ctx.longSetup.breakoutVolumeRatio||0,
      retestVolumeRatio:preferredSetup?.retestVolumeRatio||ctx.longSetup.retestVolumeRatio||0,
      confirmationVolumeRatio:preferredSetup?.confirmationVolumeRatio||0,
      confirmationBodyRatio:preferredSetup?.confirmationBodyRatio||0,
      retestDepthAtr:preferredSetup?.retestDepthAtr??null,
      chaseDistanceAtr:preferredSetup?.chaseDistanceAtr??null,
      retestQuality:longRetestQuality,longRetestQuality,shortRetestQuality,
      mtfAlignment:chosenMtf,mtf1m:mtf.oneMinLong,mtf5m:mtf.fiveMinLong,mtf15m:mtf.fifteenMinLong,
      relativeStrengthPct,benchmarkChangePct:Number(market.benchmarkChangePct||0),
      liquidityScore,avgMinuteDollarVolume:ctx.avgMinuteDollarVolume,
      roomR,longRoomR,shortRoomR,
      strategyMode:cfg.id,symbolProfileId:cfg.symbolProfileId||"BASE",maxSpreadBps:Number(cfg.maxSpreadBps||20),maxRetestMinutes:Number(cfg.maxRetestMinutes||14),exitProfile:exitPlan.profile,target1R:exitPlan.t1R,target2R:exitPlan.t2R,target3R:exitPlan.t3R,target1Pct:Number(exitPlan.target1Pct||0),target2Pct:Number(exitPlan.target2Pct||0),target3Pct:Number(exitPlan.target3Pct||0),stopDistancePct:price>0?Number(((actualRisk/price)*100).toFixed(2)):0,stopLogic:cfg.id==="active"?"ATR_STRUCTURE_DYNAMIC":"STRUCTURE",
    },
  };
}

function applySymbolProfile(base, profile){
  if(!profile||profile.enabled!==true)return base;
  const allowed=["minRvol","maxChaseAtr","minBreakoutVolume","minConfirmationVolume","maxRetestMinutes","maxConfirmationAgeMinutes","maxSpreadBps","target1Pct","target2Pct","target3Pct","minStopPct","maxStopPct"];
  const out={...base,symbolProfileId:profile.id||profile.profileId||"CUSTOM"};
  for(const k of allowed){const v=Number(profile[k]);if(Number.isFinite(v))out[k]=v;}
  // v3.0 migration: old approved profiles must not restore the old 0.35–0.55%
  // stop or the old 0.5–0.8% exits. Backtest may tune setup filters, while
  // the current Active risk/exit plan remains global and consistent.
  if(base.id==="active"){
    out.target1Pct=base.target1Pct; out.target2Pct=base.target2Pct; out.target3Pct=base.target3Pct;
    out.minStopPct=base.minStopPct; out.maxStopPct=base.maxStopPct;
  }
  return out;
}
function applyMicrostructureContext(r, quote, cfg){
  if(!r)return r;
  if(!quote||!Number.isFinite(Number(quote.bid))||!Number.isFinite(Number(quote.ask))||Number(quote.bid)<=0||Number(quote.ask)<=0){
    return {...r,metrics:{...(r.metrics||{}),quoteFresh:false,spreadAvailable:false,spreadSource:quote?.source||"غير متاح"}};
  }
  const ageSec=quote.timestamp?Math.max(0,(Date.now()-new Date(quote.timestamp).getTime())/1000):9999;
  const fresh=Number.isFinite(ageSec)&&ageSec<=180;
  const bps=Number(quote.spreadBps);
  const score=!fresh||!Number.isFinite(bps)?50:clamp(100-(bps/Math.max(1,Number(cfg.maxSpreadBps||20)))*50);
  return {...r,tradePriority:Number(r.tradePriority||0)+(fresh?Math.max(-8,Math.min(3,(score-70)/10)):0),metrics:{...(r.metrics||{}),quoteFresh:fresh,quoteAgeSec:ageSec,spreadAvailable:true,bid:Number(quote.bid),ask:Number(quote.ask),bidSize:Number(quote.bidSize||0),askSize:Number(quote.askSize||0),spread:Number(quote.spread||0),spreadPct:Number(quote.spreadPct||0),spreadBps:bps,spreadScore:Math.round(score),spreadSource:quote.source||"Alpaca IEX"}};
}

function applyNewsContext(r, news) {
  if (!r) return r;
  const n = news && typeof news === "object" ? news : {status:"unavailable",count:0,sentimentScore:0,riskScore:0,catalystScore:0,latest:[],note:"لم يتم تحديث الأخبار بعد"};
  const sentiment=Number(n.sentimentScore||0), catalyst=Number(n.catalystScore||0), risk=Number(n.riskScore||0);
  // v3.2: catalyst strength is directional. A strong negative catalyst must not
  // receive the same ranking bonus as a positive catalyst merely because it is newsworthy.
  const direction = sentiment >= 8 ? 1 : sentiment <= -8 ? -1 : 0;
  const catalystImpact = direction * Math.min(6, catalyst * .06) - (risk >= 70 ? Math.min(3,(risk-65)*.06) : 0);
  const newsClass = risk >= 80 ? "HIGH_RISK" : direction > 0 ? "POSITIVE" : direction < 0 ? "NEGATIVE" : "NEUTRAL";
  return { ...r, news:{...n,direction:newsClass}, tradePriority:Number(r.tradePriority||0)+catalystImpact,
    metrics:{...(r.metrics||{}),newsDirectionalImpact:Number(catalystImpact.toFixed(2)),newsClass},
    reason:`${r.reason} | News ${sentiment>=0?"+":""}${sentiment} / Risk ${risk} / ${newsClass}` };
}


function buildV31UniverseContext(rows, market){
  const usable=(rows||[]).filter(r=>r&&Number.isFinite(Number(r.metrics?.sessionChangePct)));
  const up=usable.filter(r=>Number(r.metrics.sessionChangePct)>0).length;
  const strong=usable.filter(r=>Number(r.metrics.relativeStrengthPct)>0.15).length;
  const breadthPct=usable.length?up/usable.length*100:50;
  const relativeBreadthPct=usable.length?strong/usable.length*100:50;
  const breadthRegime=breadthPct>=62&&relativeBreadthPct>=50?"BULLISH":breadthPct<=38&&relativeBreadthPct<=35?"BEARISH":"MIXED";
  const groups={};
  for(const r of usable){
    const theme=THEME_BY_SYMBOL[r.symbol]||`SINGLE_${r.symbol}`;
    (groups[theme] ||= []).push(r);
  }
  const themes={};
  for(const [theme,list] of Object.entries(groups)){
    const avgMove=list.reduce((a,r)=>a+Number(r.metrics?.sessionChangePct||0),0)/list.length;
    const avgRs=list.reduce((a,r)=>a+Number(r.metrics?.relativeStrengthPct||0),0)/list.length;
    const avgRvol=list.reduce((a,r)=>a+Number(r.metrics?.relativeVolume||0),0)/list.length;
    const participation=list.filter(r=>Number(r.metrics?.sessionChangePct||0)>0&&Number(r.metrics?.relativeStrengthPct||0)>0).length/Math.max(1,list.length);
    const score=clamp(50+avgMove*8+avgRs*12+(avgRvol-1)*12+(participation-.5)*22);
    themes[theme]={theme,count:list.length,avgMovePct:Number(avgMove.toFixed(2)),avgRelativeStrengthPct:Number(avgRs.toFixed(2)),avgRvol:Number(avgRvol.toFixed(2)),participation:Number(participation.toFixed(2)),score:Math.round(score)};
  }
  return {themes,marketPatch:{breadthPct:Number(breadthPct.toFixed(1)),relativeBreadthPct:Number(relativeBreadthPct.toFixed(1)),breadthRegime}};
}

function applyV31Context(r, context, market, cfg){
  if(!r)return r;
  const theme=THEME_BY_SYMBOL[r.symbol]||`SINGLE_${r.symbol}`;
  const t=context?.themes?.[theme]||{count:1,score:50,participation:.5};
  const rs=Number(r.metrics?.relativeStrengthPct||0), rv=Number(r.metrics?.relativeVolume||0), liq=Number(r.metrics?.liquidityScore||0);
  const spreadScore=Number.isFinite(Number(r.metrics?.spreadScore))?Number(r.metrics.spreadScore):55;
  const setup=Number(r.metrics?.setupQuality||0), mtf=Number(r.metrics?.mtfAlignment||0), inPlay=Number(r.inPlayScore||0);
  const sentiment=Number(r.news?.sentimentScore||0), catalyst=Number(r.news?.catalystScore||0), risk=Number(r.news?.riskScore||0);
  const rsScore=directionalRelativeStrengthScore("LONG",rs);
  const rvolQuality=clamp(35+Math.max(0,rv-.6)*42);
  const newsScore=risk>=80?15:clamp(50+Math.max(-25,Math.min(25,sentiment))*1.2+(sentiment>0?Math.min(15,catalyst*.15):sentiment<0?-Math.min(15,catalyst*.15):0));
  const breadthScore=market.breadthRegime==="BULLISH"?78:market.breadthRegime==="BEARISH"?32:52;
  const themeScore=t.count>=2?Number(t.score||50):50;
  const qualityScore=clamp(setup*.24+rsScore*.16+themeScore*.13+rvolQuality*.11+liq*.10+spreadScore*.08+mtf*.07+inPlay*.05+newsScore*.04+breadthScore*.02);
  let contextBoost=(qualityScore-60)*.12;
  if(t.count>=2&&t.score>=65&&rs>0.10)contextBoost+=2.5;
  if(market.breadthRegime==="BEARISH"&&rs<0.20)contextBoost-=3;
  if(risk>=80||sentiment<=-18)contextBoost-=4;
  const family=String(r.metrics?.setupFamily||"");
  // VWAP reclaim is useful, but v3.1 no longer lets a mediocre standalone reclaim
  // outrank genuine sector/theme momentum without relative-strength confirmation.
  if(family==="VWAP_RECLAIM"&&rs<0.10&&themeScore<60)contextBoost-=3;
  contextBoost=Math.max(-7,Math.min(7,contextBoost));
  const baseConfidence=Number(r.confidence||0);
  const confidence=clamp(Math.round(baseConfidence+contextBoost));
  const confirmed=String(r.metrics?.setupState||"")==="CONFIRMED"||String(r.metrics?.setupState||"")==="REVALIDATED";
  const promotable=cfg?.id==="active"&&r.side==="WAIT"&&confirmed&&baseConfidence>=56&&qualityScore>=64&&liq>=32&&risk<80;
  const side=promotable?"LONG":r.side;
  return {...r,side,tradeable:side==="LONG"&&confidence>=Number(cfg?.minConfidence||60),confidence,
    tradePriority:Number(r.tradePriority||0)+contextBoost+(themeScore-50)*.05+(rsScore-50)*.04,
    metrics:{...(r.metrics||{}),qualityScoreV31:Math.round(qualityScore),baseConfidence,contextBoost:Number(contextBoost.toFixed(2)),theme,themeScore:Math.round(themeScore),themePeerCount:Number(t.count||1),marketBreadthRegime:market.breadthRegime,marketBreadthPct:market.breadthPct,relativeBreadthPct:market.relativeBreadthPct},
    reason:`${r.reason} | v3.1 Quality ${Math.round(qualityScore)}/100 · ${market.breadthRegime} breadth · Theme ${Math.round(themeScore)}/100${promotable?" · setup promoted after context confirmation":""}`};
}

export function classifyV32(r,cfg=STRATEGY_MODES.active){
  if(!r)return r;
  const price=Number(r.price||0), conf=Number(r.confidence||0), setup=Number(r.metrics?.setupQuality||0);
  // Price eligibility is frozen by Session Universe at the session check. Do not re-reject an eligible symbol if it later trades above $200 in the same session.
  const raw=String(r.rawSide||r.side||"");
  const reason=String(r.filters?.rejectedReason||"");
  const spread=Number(r.metrics?.spreadBps), spreadSoft=Number(cfg.maxSpreadBps||35), spreadHard=Number(cfg.smartSpreadBps||70);
  const spreadSource=String(r.metrics?.spreadSource||""); const consolidatedSpread=/SIP|NBBO|CONSOLIDATED/i.test(spreadSource);
  const chase=Number(r.metrics?.chaseDistanceAtr), family=String(r.metrics?.setupFamily||"");
  const setupState=String(r.metrics?.setupState||"");
  const shortSignal=raw==="SHORT" || /short|هابط/i.test(String(r.reason||"")) && Number(r.metrics?.relativeStrengthPct||0)<-.25;
  if(r.metrics?.spreadAvailable===true && r.metrics?.quoteFresh===false) return {...r,side:"WAIT",tradeable:false,badTrade:false,conditionalTrade:true,recommendationState:"SMART",stateReason:"WAIT_FRESH_QUOTE",quality:"SMART — بيانات التنفيذ قديمة، انتظر Quote حديث"};
  if(shortSignal) return {...r,side:"WAIT",tradeable:false,badTrade:true,conditionalTrade:false,recommendationState:"BAD",stateReason:"SHORT_SIGNAL",quality:"BAD TRADE — اتجاه SHORT/هابط"};
  const severe = Number(r.metrics?.liquidityScore||0)<28 || Number(r.news?.riskScore||0)>=85 || (consolidatedSpread&&Number.isFinite(spread)&&spread>spreadHard) || /غير آمن|عالي المخاطر|Catalyst قوي لكنه سلبي|السيولة ضعيفة جداً/.test(reason);
  if(severe) return {...r,tradeable:false,badTrade:true,conditionalTrade:false,recommendationState:"BAD",stateReason:reason||"HARD_RISK",quality:"BAD TRADE — رفض حقيقي"};
  if(r.tradeable){
    const familyChaseLimit=family==="MOMENTUM_CONTINUATION"?1.35:family==="VWAP_RECLAIM"?1.15:family==="FIRST_15M_CANDLE"?1.20:Number(cfg.maxChaseAtr||1.08);
    const extended=Number.isFinite(chase)&&chase>familyChaseLimit;
    const liquidity=Number(r.metrics?.liquidityScore||0);
    // IEX is one venue, not consolidated NBBO. An IEX-only wide quote is corroborating
    // execution evidence, never a stand-alone veto. Consolidated spread may remain a gate.
    const spreadNeeds=Number.isFinite(spread)&&spread>spreadSoft&&(consolidatedSpread||liquidity<45);
    const hodDistancePct=Number(r.metrics?.distanceFromSessionHighPct);
    const sessionGain=Number(r.metrics?.sessionChangePct||0);
    const momentumException=family==="MOMENTUM_CONTINUATION"&&Number(r.metrics?.relativeVolume||0)>=1.20&&Number(r.metrics?.setupQuality||0)>=65&&conf>=Number(r.filters?.requiredConfidence||cfg.minConfidence||60);
    const nearHod=Number.isFinite(hodDistancePct)&&hodDistancePct<=0.30&&sessionGain>=1.0&&Number(r.metrics?.roomR||0)<1.40&&!momentumException;
    const weakRetest=family==="BREAKOUT_RETEST"&&Number(r.metrics?.retestQuality||0)<65;
    const blocker=extended?'WAIT_CHASE':nearHod?'WAIT_RETEST_HOD':weakRetest?'WAIT_RETEST':spreadNeeds?'WAIT_SPREAD':null;
    if(blocker) return {...r,side:"WAIT",tradeable:false,badTrade:false,conditionalTrade:true,recommendationState:"SMART",stateReason:blocker,quality:nearHod?"SMART — قريب من قمة اليوم، انتظر Retest":"SMART — فرصة جيدة، انتظر دخولاً أفضل"};
    return {...r,badTrade:false,conditionalTrade:false,recommendationState:"CONFIRMED",stateReason:"ENTRY_CONFIRMED",quality:"CONFIRMED BUY — دخول مؤكد"};
  }
  const smart = r.conditionalTrade || conf>=62 || setup>=55 || ["WAIT_RETEST","WAIT_RECLAIM","WAIT_BREAKOUT","WAIT_MOMENTUM"].includes(setupState);
  if(smart) return {...r,badTrade:false,conditionalTrade:true,recommendationState:"SMART",stateReason:r.filters?.conditionalReason||setupState||"WAIT_ENTRY",quality:"SMART — فرصة شراء، انتظر Trigger"};
  if(conf>=50 || setup>=42) return {...r,badTrade:false,conditionalTrade:false,recommendationState:"WAIT",stateReason:setupState||"UNCLEAR",quality:"WAIT — الصورة لم تكتمل"};
  return {...r,hiddenV32:true,recommendationState:"HIDDEN",stateReason:"NO_CLEAR_STATE"};
}

function applyAdaptiveTargetShadow(r){
  if(!r)return r;
  const m=r.metrics||{}, conf=Number(r.confidence||0), setup=Number(m.setupQuality||0), retest=Number(m.retestQuality||0), mtf=Number(m.mtfAlignment||0), room=Number(m.roomR||0), rs=Number(m.relativeStrengthPct||0), rv=Number(m.relativeVolume||0), chase=Number(m.chaseDistanceAtr||0), spread=Number(m.spreadBps||0);
  let base=conf*.34+setup*.20+retest*.12+mtf*.10+Math.min(100,Math.max(0,50+rs*45))*.08+Math.min(100,rv*42)*.08+Math.min(100,room*35)*.08;
  if(chase>.75)base-=8;if(Number.isFinite(spread)&&spread>35)base-=7;if(m.quoteFresh===false&&m.spreadAvailable)base-=4;
  const t1=Math.max(35,Math.min(96,Math.round(base+10))),t2=Math.max(25,Math.min(93,Math.round(base))),t3=Math.max(15,Math.min(90,Math.round(base-10)));
  const recommendedTarget=t3>=70?'T3':t2>=70?'T2':t1>=70?'T1':'WAIT';
  return {...r,recommendedTarget,targetConfidence:{mode:'SHADOW',t1,t2,t3},agenticPlan:{signalVersion:'3.5',entryLow:Number(r.entryLow||0),entryHigh:Number(r.entryHigh||0),stopLoss:Number(r.stopLoss||0),recommendedTarget,targetConfidence:{t1,t2,t3},expiresAfterMinutes:8,cancelOn:['ENTRY_RANGE_LOST','STRUCTURE_BREAK','STALE_QUOTE']}};
}

function estimateExpectedValue(r, calibration = {}, phase = "09:30–10:09", cfg = STRATEGY_MODES.precision) {
  const perf=calibration?.performanceModel||{};
  const confidence=Number(r.confidence||0);
  const defaultP=cfg.id==="precision" ? clamp01(.45 + Math.max(0,confidence-82)*.012) : cfg.id==="active" ? clamp01(.48 + Math.max(0,confidence-72)*.008) : clamp01(.42 + Math.max(0,confidence-75)*.011);
  const avgWinDefault=cfg.id==="precision"?1.75:cfg.id==="active"?Math.max(.9,Math.min(1.6,Number(r.exitPlan?.t2R||1.2))):1.60;
  const candidates=[];
  if(perf.global?.count>=8)candidates.push(perf.global);
  if(perf.symbol?.[r.symbol]?.count>=5)candidates.push(perf.symbol[r.symbol]);
  if(perf.phase?.[phase]?.count>=5)candidates.push(perf.phase[phase]);
  const band=confidence>=90?"90%+":confidence>=85?"85–89%":confidence>=80?"80–84%":"<80%";
  if(perf.confidence?.[band]?.count>=5)candidates.push(perf.confidence[band]);
  let wins=defaultP*8,count=8,winR=avgWinDefault*defaultP*8,winCount=defaultP*8;
  for(const x of candidates){const w=Number(x.wins||0),c=Number(x.count||0);wins+=w;count+=c;winR+=Number(x.avgWinR||avgWinDefault)*w;winCount+=w;}
  let p=clamp01(wins/Math.max(1,count));
  const avgWinR=Math.max(.8,Math.min(3.5,winR/Math.max(1,winCount)));
  const ev=p*avgWinR-(1-p)*1.0;
  return {expectedR:Number(ev.toFixed(3)),winRate:p,avgWinR:Number(avgWinR.toFixed(2)),source:candidates.length?"Bayesian + نتائجك":"Conservative model prior"};
}

function boundedActiveStop(price, structureStop, cfg, atrValue=0){
  // v3.0: do not squeeze volatile stocks into an unrealistically tight fixed stop.
  // The minimum distance expands with ATR, while the maximum risk stays capped.
  const baseMin=Math.max(.0040,Number(cfg.minStopPct||.0050));
  const atrPct=price>0?Math.max(0,Number(atrValue||0))/price:0;
  const dynamicMin=Math.min(.0085,Math.max(baseMin,atrPct*.65));
  const maxPct=Math.max(dynamicMin,Math.min(.0110,Number(cfg.maxStopPct||.0110)));
  const far=price*(1-maxPct),near=price*(1-dynamicMin);
  return Math.min(Math.max(Number(structureStop||far),far),near);
}
function adaptiveExitPlan({side,market,relativeVolume,roomR,confidence,retestQuality,price,actualRisk}, cfg = STRATEGY_MODES.precision) {
  if(cfg.id==="active"){
    const p1=Number(cfg.target1Pct||0.006),p2=Number(cfg.target2Pct||0.008),p3=Number(cfg.target3Pct||0.010);
    const risk=Math.max(Number(actualRisk||0),Number(price||0)*Number(cfg.minStopPct||0.0050),1e-9);
    return{profile:"ACTIVE_0.6–1.0%",target1Pct:p1,target2Pct:p2,target3Pct:p3,t1R:Number(((Number(price||0)*p1)/risk).toFixed(2)),t2R:Number(((Number(price||0)*p2)/risk).toFixed(2)),t3R:Number(((Number(price||0)*p3)/risk).toFixed(2)),afterT1:"عند +0.6% خفّض المخاطرة؛ لا تحرك الوقف إلى Break-even قبل ثبات الحركة",afterT2:"عند +0.8% اقفل جزءاً من الربح وفعّل Trailing خلف آخر Swing 5m",runner:"الهدف النهائي +1.0%؛ اخرج إذا كُسر VWAP/آخر Swing بوضوح"};
  }
  const aligned=(side==="LONG"&&market.regime==="TREND_UP")||(side==="SHORT"&&market.regime==="TREND_DOWN");
  const strong=aligned&&Number(relativeVolume)>=1.8&&Number(roomR)>=3&&Number(confidence)>=86&&Number(retestQuality)>=82;
  const defensive=market.regime==="NEUTRAL"||Number(roomR)<2.2;
  if(strong)return{profile:"TREND_RUNNER",t1R:1.0,t2R:2.0,t3R:3.2,afterT1:"نقل SL إلى Break-even بعد تأكيد T1",afterT2:"Trailing تحت/فوق آخر Swing على 5m",runner:"اترك الجزء الأخير إلى T3 أو كسر VWAP/5m swing"};
  if(defensive)return{profile:"DEFENSIVE",t1R:.8,t2R:1.4,t3R:2.0,afterT1:"خفض المخاطرة إلى Break-even",afterT2:"قفل +0.8R واستخدم 5m trailing",runner:"لا تطارد T3 إذا ضعف الحجم"};
  return{profile:"STANDARD",t1R:1.0,t2R:1.7,t3R:2.5,afterT1:"نقل SL إلى Break-even",afterT2:"Trailing عند آخر 5m swing",runner:"الجزء الأخير إلى T3 أو كسر VWAP"};
}
function clamp01(v){return Math.max(.25,Math.min(.68,Number(v)||0));}

function combinedMarketTrend(candles) {
  const base = trendScore(candles);
  const price = candles.at(-1)?.close || 0;
  const a = Math.max(atr(candles, 14), price * 0.001);
  const ctx = sessionContext(candles, a);
  let session = 50;
  if (ctx.ready) {
    session = 50 + (ctx.aboveVwap ? 20 : -20) + (ctx.vwapSlope > 0.02 ? 15 : ctx.vwapSlope < -0.02 ? -15 : 0) + (ctx.sessionChangePct > 0 ? 10 : -10);
  }
  return clamp(base * 0.60 + clamp(session) * 0.40);
}


