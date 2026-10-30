import { evaluateLiveResearch36 } from "./research-live36.mjs";
import { alpacaConfigured, fetchIntradayBars, fetchLatestQuotes } from "./alpaca.mjs";

const BASE_WEIGHTS = { trend: 0.30, momentum: 0.20, volume: 0.20, structure: 0.20, market: 0.10 };

// v3.2: lightweight theme map for the screened universe. Theme strength is only
// a ranking/confirmation input; it never overrides liquidity, spread, news-risk
// or setup safety gates.
const THEME_BY_SYMBOL = {
  NVDA:"SEMIS_AI", AMD:"SEMIS_AI", SMCI:"SEMIS_AI", AVGO:"SEMIS_AI", ARM:"SEMIS_AI", MU:"SEMIS_AI",
  MSFT:"MEGA_CAP_AI", GOOGL:"MEGA_CAP_AI", META:"MEGA_CAP_AI", AMZN:"MEGA_CAP_AI", AAPL:"MEGA_CAP_AI",
  RGTI:"QUANTUM", RKLB:"SPACE", PLTR:"AI_SOFTWARE"
};

export const STRATEGY_MODES = {
  active: {
    id: "active", label: "Active Flexible 0.6–1.0%", minConfidence: 60, minRvol: 0.75, minRoomR: 0.65,
    minRetestQuality: 42, minMtfAlignment: 42, minInPlay: 32, minLiquidityScore: 32,
    maxChaseAtr: 1.08, minBreakoutVolume: 0.90, minConfirmationVolume: 0.88, maxRetestMinutes:35, maxConfirmationAgeMinutes:30, maxSpreadBps:35, smartSpreadBps:70,
    minRelativeStrengthLong: -0.30, maxRelativeStrengthShort: 0.10, scoreGap: 2, minExpectedR: -0.02,
    target1Pct:0.006, target2Pct:0.008, target3Pct:0.010, minStopPct:0.0055, maxStopPct:0.0110,
  },
  precision: {
    id: "precision", label: "High Precision", minConfidence: 82, minRvol: 1.50, minRoomR: 1.70,
    minRetestQuality: 75, minMtfAlignment: 72, minInPlay: 62, minLiquidityScore: 65,
    maxChaseAtr: 0.60, minBreakoutVolume: 1.15, minConfirmationVolume: 1.15, maxRetestMinutes:14, maxConfirmationAgeMinutes:6, maxSpreadBps:20,
    minRelativeStrengthLong: 0.10, maxRelativeStrengthShort: -0.10, scoreGap: 9, minExpectedR: 0.20,
  },
  balanced: {
    id: "balanced", label: "Balanced", minConfidence: 75, minRvol: 1.30, minRoomR: 1.40,
    minRetestQuality: 62, minMtfAlignment: 60, minInPlay: 50, minLiquidityScore: 50,
    maxChaseAtr: 0.80, minBreakoutVolume: 1.05, minConfirmationVolume: 1.05, maxRetestMinutes:20, maxConfirmationAgeMinutes:8, maxSpreadBps:30,
    minRelativeStrengthLong: -0.05, maxRelativeStrengthShort: 0.05, scoreGap: 7, minExpectedR: 0.08,
  },
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
  const results = await Promise.allSettled(
    needed.map(async (symbol) => [symbol, researchOptions.replayBars
      ? (researchOptions.replayBars[symbol] || (()=>{throw Error(`Replay missing ${symbol}`)})())
      : useAlpaca
        ? await fetchIntradayBars(symbol, process.env.ALPACA_API_KEY_ID, process.env.ALPACA_API_SECRET_KEY, {lookbackDays:12})
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
      liveResearchQuotes[row.symbol]||null,{now:researchNow,shariaApproved:true,allowHistorical:!!researchOptions.replayBars});
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
      stateReason:decision.reason,quality:confirmed?'CONFIRMED PAPER — V3.6 Research':'3.6 Research — '+decision.reason,
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
        setupState:confirmed?'CONFIRMED':decision.state==='SMART'?'WAIT_RETEST':'WAIT_OPENING',
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

function sessionContext(candles, atrValue, cfg = STRATEGY_MODES.precision) {
  const parsed = candles.map((c) => ({ c, p: dateParts(c.datetime) })).filter((x) => x.p);
  const latest = parsed.at(-1);
  if (!latest) return emptySession(candles.at(-1)?.close || 0);
  const dateKey = latest.p.date;
  const byDate = new Map();
  for (const x of parsed) {
    if (!byDate.has(x.p.date)) byDate.set(x.p.date, []);
    byDate.get(x.p.date).push(x);
  }
  const todayRows = (byDate.get(dateKey) || []).filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay < 960);
  const currentMinute = latest.p.minuteOfDay;
  const openingRows = todayRows.filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay <= 584);
  const sessionRows = todayRows.filter((x) => x.p.minuteOfDay <= currentMinute);
  const opening = openingRows.map((x) => x.c);
  const session = sessionRows.map((x) => x.c);
  const openingHigh = opening.length ? Math.max(...opening.map((c) => c.high)) : latest.c.high;
  const openingLow = opening.length ? Math.min(...opening.map((c) => c.low)) : latest.c.low;
  const vwaps = cumulativeVwap(session);
  const vwap = vwaps.at(-1) ?? latest.c.close;
  const priorVwap = vwaps[Math.max(0, vwaps.length - 6)] ?? vwap;
  const vwapSlope = atrValue > 0 ? ((vwap - priorVwap) / atrValue) : 0;
  const price = latest.c.close;

  const currentVolume = session.reduce((s, c) => s + finite(c.volume), 0);
  const prevDates = [...byDate.keys()].filter((d) => d < dateKey).sort().reverse().slice(0, 10);
  const comparable = prevDates.map((d) => (byDate.get(d) || [])
    .filter((x) => x.p.minuteOfDay >= 570 && x.p.minuteOfDay <= currentMinute)
    .reduce((s, x) => s + finite(x.c.volume), 0)).filter((v) => v > 0);
  const expectedCum = median(comparable);
  const cumulativeRvol = expectedCum > 0 ? currentVolume / expectedCum : 0;
  const recentStart = Math.max(570, currentMinute - 14);
  const currentRecent = sessionRows.filter((x)=>x.p.minuteOfDay>=recentStart&&x.p.minuteOfDay<=currentMinute).reduce((s,x)=>s+finite(x.c.volume),0);
  const recentComparable = prevDates.map((d)=>(byDate.get(d)||[])
    .filter((x)=>x.p.minuteOfDay>=recentStart&&x.p.minuteOfDay<=currentMinute)
    .reduce((s,x)=>s+finite(x.c.volume),0)).filter((v)=>v>0);
  const expectedRecent = median(recentComparable);
  const recentRvol = expectedRecent > 0 ? currentRecent / expectedRecent : 0;
  let relativeVolume = cumulativeRvol > 0 && recentRvol > 0 ? cumulativeRvol * .70 + recentRvol * .30
    : cumulativeRvol > 0 ? cumulativeRvol : recentRvol > 0 ? recentRvol : fallbackVolumeRatio(candles);
  if (!Number.isFinite(relativeVolume) || relativeVolume <= 0) relativeVolume = 1;
  relativeVolume = Math.max(.05, Math.min(8, relativeVolume));
  const sessionOpen = session.at(0)?.open ?? price;
  const sessionChangePct = sessionOpen ? ((price - sessionOpen) / sessionOpen) * 100 : 0;
  const sessionHigh = session.length ? Math.max(...session.map(c=>finite(c.high))) : price;
  const sessionLow = session.length ? Math.min(...session.map(c=>finite(c.low))) : price;
  const recent5=session.slice(-5);
  const recent5High=recent5.length?Math.max(...recent5.map(c=>finite(c.high))):price;
  const recent5Low=recent5.length?Math.min(...recent5.map(c=>finite(c.low))):price;
  const distanceFromSessionHighPct = sessionHigh>0 ? Math.max(0,(sessionHigh-price)/sessionHigh*100) : 0;
  const liquidRows = session.slice(-20);
  const avgMinuteDollarVolume = liquidRows.length ? liquidRows.reduce((sum, c) => sum + finite(c.volume) * finite(c.close), 0) / liquidRows.length : 0;

  const longSetup = detectBreakoutRetest("LONG", sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const shortSetup = detectBreakoutRetest("SHORT", sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const first15mSetup = detectFirst15mCandleBreak(sessionRows, openingHigh, openingLow, atrValue, vwaps, cfg);
  const vwapReclaimSetup = detectVwapReclaim(sessionRows, vwaps, atrValue, cfg);
  const momentumSetup = detectMomentumContinuation(sessionRows, vwaps, atrValue, cfg);
  return {
    ready: currentMinute >= 590 && opening.length >= 12 && session.length >= 16,
    openingHigh, openingLow, vwap, vwapSlope, aboveVwap: price > vwap,
    longBreakout: ["WAIT_RETEST","WAIT_CONFIRMATION","CONFIRMED","EXPIRED"].includes(longSetup.state),
    shortBreakout: ["WAIT_RETEST","WAIT_CONFIRMATION","CONFIRMED","EXPIRED"].includes(shortSetup.state),
    longSetup, shortSetup, first15mSetup, vwapReclaimSetup, momentumSetup, relativeVolume, cumulativeRvol, recentRvol, rvolSampleDays:comparable.length, sessionChangePct, sessionHigh, sessionLow, recent5High, recent5Low, distanceFromSessionHighPct, avgMinuteDollarVolume,
  };
}

function detectBreakoutRetest(side, sessionRows, openingHigh, openingLow, a, vwaps, cfg = STRATEGY_MODES.precision) {
  const isLong = side === "LONG";
  const level = isLong ? openingHigh : openingLow;
  const empty = () => ({
    state:"WAIT_BREAKOUT", breakoutIndex:-1, retestIndex:-1, confirmationIndex:-1,
    breakoutVolumeRatio:0, retestVolumeRatio:0, confirmationVolumeRatio:0,
    breakoutBodyRatio:0, confirmationBodyRatio:0,
    retestLow:null, retestHigh:null, retestDepthAtr:null, retestHoldStrength:0,
    chaseDistanceAtr:null, minutesSinceConfirmation:null, attemptNumber:0,
  });
  if (sessionRows.length < 16 || !Number.isFinite(level)) return empty();

  const firstTradeIdx = sessionRows.findIndex((x) => x.p.minuteOfDay >= 585);
  if (firstTradeIdx < 0) return empty();
  const lastIdx = sessionRows.length - 1;
  const maxAttempts = 6;
  let cursor = firstTradeIdx;
  let attemptNumber = 0;
  let requireReset = false;
  let lastResult = empty();

  while (cursor <= lastIdx && attemptNumber < maxAttempts) {
    let breakout = -1;
    let resetSeen = !requireReset;
    for (let i = cursor; i <= lastIdx; i++) {
      const c = sessionRows[i].c;
      const localA = Math.max(a, Math.abs(c.close) * .0005);
      if (requireReset && (isLong ? (c.low <= level + localA * .14 || c.close <= level + localA * .08) : (c.high >= level - localA * .14 || c.close >= level - localA * .08))) resetSeen = true;
      if (!resetSeen) continue;
      const avgVol = avgPriorVolume(sessionRows, i, 10);
      const volRatio = avgVol > 0 ? finite(c.volume) / avgVol : 1;
      const beyond = isLong ? c.close > level + a * 0.05 : c.close < level - a * 0.05;
      const expanded = isLong ? c.high > level + a * 0.08 : c.low < level - a * 0.08;
      const directional = isLong ? c.close >= c.open : c.close <= c.open;
      if (beyond && expanded && directional && volRatio >= 1.05) { breakout = i; break; }
    }
    if (breakout < 0) return lastResult.attemptNumber ? lastResult : empty();

    attemptNumber++;
    const result = empty();
    result.attemptNumber = attemptNumber;
    result.breakoutIndex = breakout;
    const breakoutC = sessionRows[breakout].c;
    const breakoutAvgVol = avgPriorVolume(sessionRows, breakout, 10);
    result.breakoutVolumeRatio = breakoutAvgVol > 0 ? finite(breakoutC.volume) / breakoutAvgVol : 1;
    result.breakoutBodyRatio = candleBodyRatio(breakoutC);
    result.state = "WAIT_RETEST";

    const breakoutVol = finite(breakoutC.volume);
    const maxRetestBars = Math.max(6, Math.min(30, Number(cfg.maxRetestMinutes || 14)));
    const maxRetestIdx = Math.min(lastIdx, breakout + maxRetestBars);
    let retest = -1, failedIndex = -1;
    for (let i = breakout + 1; i <= maxRetestIdx; i++) {
      const c = sessionRows[i].c;
      const failed = isLong ? c.close < level - a * 0.30 : c.close > level + a * 0.30;
      if (failed) { failedIndex = i; break; }
      const touched = isLong ? c.low <= level + a * 0.14 : c.high >= level - a * 0.14;
      const held = isLong ? c.close >= level - a * 0.05 : c.close <= level + a * 0.05;
      if (touched && held) { retest = i; break; }
    }
    if (failedIndex >= 0) {
      lastResult = { ...result, state:"FAILED_RETEST" };
      cursor = failedIndex + 1; requireReset = false; continue;
    }
    if (retest < 0) {
      if (lastIdx <= maxRetestIdx) return result; // latest attempt is still developing
      lastResult = { ...result, state:"EXPIRED" };
      cursor = maxRetestIdx + 1; requireReset = true; continue;
    }

    result.retestIndex = retest;
    result.retestLow = sessionRows[retest].c.low;
    result.retestHigh = sessionRows[retest].c.high;
    result.retestDepthAtr = a > 0 ? Math.abs((isLong ? result.retestLow : result.retestHigh) - level) / a : 99;
    result.retestVolumeRatio = breakoutVol > 0 ? finite(sessionRows[retest].c.volume) / breakoutVol : 1;
    const closeDistance = isLong ? (sessionRows[retest].c.close - level) / Math.max(a, 1e-9) : (level - sessionRows[retest].c.close) / Math.max(a, 1e-9);
    result.retestHoldStrength = clamp(50 + closeDistance * 160);
    result.state = "WAIT_CONFIRMATION";

    let confirmation = -1, confirmationFail = -1;
    for (let i = retest + 1; i <= lastIdx; i++) {
      const c = sessionRows[i].c;
      const avgVol = avgPriorVolume(sessionRows, i, 10);
      const volRatio = avgVol > 0 ? finite(c.volume) / avgVol : 1;
      const sessionVwap = vwaps[i] ?? c.close;
      const beyond = isLong ? c.close > Math.max(level + a * 0.05, result.retestHigh ?? level) : c.close < Math.min(level - a * 0.05, result.retestLow ?? level);
      const directional = isLong ? c.close > c.open : c.close < c.open;
      const vwapOk = isLong ? c.close > sessionVwap : c.close < sessionVwap;
      if (beyond && directional && vwapOk && volRatio >= 1.05) { confirmation = i; result.confirmationVolumeRatio = volRatio; result.confirmationBodyRatio = candleBodyRatio(c); break; }
      const failed = isLong ? c.close < level - a * 0.30 : c.close > level + a * 0.30;
      if (failed) { confirmationFail = i; break; }
    }
    if (confirmationFail >= 0) {
      lastResult = { ...result, state:"FAILED_RETEST" };
      cursor = confirmationFail + 1; requireReset = false; continue;
    }
    if (confirmation < 0) return result;

    result.confirmationIndex = confirmation;
    const latest = sessionRows[lastIdx].c.close;
    const chaseDistanceAtr = a > 0 ? Math.abs(latest - level) / a : 99;
    const minutesSinceConfirmation = Math.max(0, sessionRows[lastIdx].p.minuteOfDay - sessionRows[confirmation].p.minuteOfDay);
    result.chaseDistanceAtr = chaseDistanceAtr;
    result.minutesSinceConfirmation = minutesSinceConfirmation;
    if (minutesSinceConfirmation <= Number(cfg.maxConfirmationAgeMinutes||6) && chaseDistanceAtr <= Math.max(.80,Number(cfg.maxChaseAtr||.60)+.20)) return { ...result, state:"CONFIRMED" };

    lastResult = { ...result, state:"EXPIRED" };
    cursor = confirmation + 1;
    requireReset = true;
  }
  return lastResult.attemptNumber ? lastResult : empty();
}


function detectFirst15mCandleBreak(sessionRows, openingHigh, openingLow, a, vwaps, cfg = STRATEGY_MODES.active) {
  const empty={type:"FIRST_15M_CANDLE",label:"15-Minute Candle Breakout",state:"WAIT_15M_BREAK",quality:20,breakoutIndex:-1,confirmationIndex:-1,breakoutVolumeRatio:0,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null,openingCandleHigh:openingHigh,openingCandleLow:openingLow};
  if(!sessionRows?.length||sessionRows.length<18||!Number.isFinite(openingHigh))return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c;
  let best=null;
  const start=Math.max(0,sessionRows.findIndex(x=>x.p.minuteOfDay>=585));
  if(start<0)return empty;
  for(let i=start;i<=last;i++){
    const c=sessionRows[i].c,vw=vwaps[i]??c.close,avgVol=avgPriorVolume(sessionRows,i,12),vr=avgVol>0?finite(c.volume)/avgVol:1;
    const prev=i>0?sessionRows[i-1].c:null;
    const crossed=Boolean(prev&&prev.close<=openingHigh+a*.035&&c.close>openingHigh+a*.035);
    const decisive=c.close>c.open&&c.high>openingHigh+a*.06&&c.close>vw&&vr>=Math.max(.72,Number(cfg.minBreakoutVolume||.92)-.20);
    if(!crossed||!decisive)continue;
    let confirmation=i,confVr=vr,confBody=candleBodyRatio(c),held=true;
    // If the breakout candle is weak-bodied, require a follow-through candle that holds the 15m high.
    if(confBody<.42){
      confirmation=-1;
      for(let j=i+1;j<=Math.min(last,i+3);j++){
        const cc=sessionRows[j].c,v=vwaps[j]??cc.close,av=avgPriorVolume(sessionRows,j,10),vr2=av>0?finite(cc.volume)/av:1;
        if(cc.close<openingHigh-a*.08){held=false;break;}
        if(cc.close>openingHigh+a*.025&&cc.close>v&&cc.close>=cc.open&&vr2>=.68){confirmation=j;confVr=vr2;confBody=candleBodyRatio(cc);break;}
      }
      if(confirmation<0)continue;
    }
    const age=Math.max(0,sessionRows[last].p.minuteOfDay-sessionRows[confirmation].p.minuteOfDay);
    const chase=a>0?Math.max(0,(latest.close-openingHigh)/a):99;
    const stillHolds=latest.close>=openingHigh-a*.06&&latest.close>(vwaps[last]??latest.close)-a*.02;
    let quality=48;
    quality+=vr>=1.5?18:vr>=1.15?14:vr>=.90?9:4;
    quality+=confBody>=.65?13:confBody>=.45?9:5;
    quality+=stillHolds?12:0;
    quality+=age<=5?9:age<=12?6:age<=20?3:0;
    quality+=chase<=.55?8:chase<=1.0?5:1;
    const fresh=age<=Math.max(20,Number(cfg.maxConfirmationAgeMinutes||12)+8)&&stillHolds&&held;
    const candidate={...empty,state:fresh?"CONFIRMED":"EXPIRED",quality:clamp(quality),breakoutIndex:i,confirmationIndex:confirmation,breakoutVolumeRatio:vr,confirmationVolumeRatio:confVr,confirmationBodyRatio:confBody,retestHoldStrength:stillHolds?78:25,chaseDistanceAtr:chase,minutesSinceConfirmation:age};
    if(!best||Number(candidate.quality)>Number(best.quality))best=candidate;
  }
  if(best)return best;
  const chase=a>0?Math.max(0,(latest.close-openingHigh)/a):null;
  return {...empty,chaseDistanceAtr:chase,state:latest.close>openingHigh?"WAIT_15M_CONFIRMATION":"WAIT_15M_BREAK"};
}


function detectVwapReclaim(sessionRows, vwaps, a, cfg = STRATEGY_MODES.active) {
  const empty={type:"VWAP_RECLAIM",label:"VWAP Reclaim",state:"WAIT_RECLAIM",quality:20,confirmationIndex:-1,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null};
  if(!sessionRows?.length||sessionRows.length<24)return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c,latestVwap=vwaps[last]??latest.close;
  const start=Math.max(8,last-55);let touch=-1;
  for(let i=start;i<last;i++){
    const c=sessionRows[i].c,v=vwaps[i]??c.close;
    const touched=c.low<=v+a*.12;
    const held=c.close>=v-a*.06;
    const cameFromAbove=i>1 && sessionRows[Math.max(0,i-3)].c.close>(vwaps[Math.max(0,i-3)]??c.close);
    if(touched&&held&&cameFromAbove)touch=i;
  }
  if(touch<0)return {...empty,chaseDistanceAtr:a>0?Math.max(0,(latest.close-latestVwap)/a):null};
  const touchC=sessionRows[touch].c,touchVwap=vwaps[touch]??touchC.close;
  let confirmation=-1,volRatio=0,body=0;
  for(let i=touch+1;i<=last;i++){
    const c=sessionRows[i].c,v=vwaps[i]??c.close,avgVol=avgPriorVolume(sessionRows,i,12),vr=avgVol>0?finite(c.volume)/avgVol:1;
    if(c.close>v+a*.04&&c.close>c.open&&c.close>touchC.high-a*.03&&vr>=Math.max(.75,Number(cfg.minConfirmationVolume||.9)-.15)){
      confirmation=i;volRatio=vr;body=candleBodyRatio(c);break;
    }
    if(c.close<v-a*.35)return {...empty,state:"FAILED_RECLAIM",quality:18,retestDepthAtr:a>0?Math.abs(touchC.low-touchVwap)/a:null};
  }
  const depth=a>0?Math.abs(touchC.low-touchVwap)/a:99;
  const hold=clamp(70-Math.max(0,depth-.05)*90);
  if(confirmation<0)return {...empty,state:"WAIT_CONFIRMATION",quality:clamp(48+hold*.22),retestDepthAtr:depth,retestHoldStrength:hold,chaseDistanceAtr:a>0?Math.max(0,(latest.close-latestVwap)/a):null};
  const age=Math.max(0,sessionRows[last].p.minuteOfDay-sessionRows[confirmation].p.minuteOfDay);
  const chase=a>0?Math.max(0,(latest.close-latestVwap)/a):99;
  let quality=52;
  quality+=volRatio>=1.3?16:volRatio>=1.05?12:volRatio>=.85?8:3;
  quality+=body>=.6?11:body>=.4?7:3;
  quality+=hold*.12;
  quality+=age<=5?8:age<=12?4:0;
  const fresh=age<=Math.max(12,Number(cfg.maxConfirmationAgeMinutes||10)+3);
  return {type:"VWAP_RECLAIM",label:"VWAP Reclaim",state:fresh?"CONFIRMED":"EXPIRED",quality:clamp(quality),confirmationIndex:confirmation,confirmationVolumeRatio:volRatio,confirmationBodyRatio:body,retestDepthAtr:depth,retestHoldStrength:hold,chaseDistanceAtr:chase,minutesSinceConfirmation:age};
}

function detectMomentumContinuation(sessionRows, vwaps, a, cfg = STRATEGY_MODES.active) {
  const empty={type:"MOMENTUM_CONTINUATION",label:"Momentum Continuation",state:"WAIT_MOMENTUM",quality:20,confirmationIndex:-1,confirmationVolumeRatio:0,confirmationBodyRatio:0,retestDepthAtr:null,retestHoldStrength:0,chaseDistanceAtr:null,minutesSinceConfirmation:null};
  if(!sessionRows?.length||sessionRows.length<30)return empty;
  const last=sessionRows.length-1,latest=sessionRows[last].c,v=vwaps[last]??latest.close;
  const recent=sessionRows.slice(Math.max(0,last-9),last+1).map(x=>x.c);
  const prior=sessionRows.slice(Math.max(0,last-24),Math.max(0,last-4)).map(x=>x.c);
  if(recent.length<6||prior.length<8)return empty;
  const higherCloses=recent.slice(1).filter((c,i)=>c.close>=recent[i].close).length;
  const green=recent.filter(c=>c.close>c.open).length;
  const localHigh=Math.max(...prior.map(c=>c.high));
  const nearHigh=latest.close>=localHigh-a*.12;
  const move=a>0?(latest.close-recent[0].close)/a:0;
  const avgRecent=recent.reduce((x,c)=>x+finite(c.volume),0)/recent.length;
  const avgPrior=prior.reduce((x,c)=>x+finite(c.volume),0)/Math.max(1,prior.length);
  const vr=avgPrior>0?avgRecent/avgPrior:1;
  const aboveVwap=latest.close>v;
  const vwapSlope=(v-(vwaps[Math.max(0,last-6)]??v))/Math.max(a,1e-9);
  const confirmed=aboveVwap&&vwapSlope>=-.03&&nearHigh&&move>=.18&&higherCloses>=5&&green>=4&&vr>=.72;
  let quality=35;
  quality+=aboveVwap?12:0;quality+=vwapSlope>.04?10:vwapSlope>=0?6:2;quality+=nearHigh?10:0;
  quality+=move>=.65?15:move>=.35?11:move>=.18?7:0;quality+=vr>=1.25?13:vr>=1?10:vr>=.8?7:3;quality+=higherCloses>=7?7:higherCloses>=5?4:0;
  const anchor=recent.slice(-5).reduce((sum,c)=>sum+finite(c.close),0)/Math.max(1,recent.slice(-5).length);
  const chase=a>0?Math.max(0,(latest.close-anchor)/a):99;
  return {...empty,state:confirmed?"CONFIRMED":"WAIT_MOMENTUM",quality:clamp(quality),confirmationIndex:confirmed?last:-1,confirmationVolumeRatio:vr,confirmationBodyRatio:candleBodyRatio(latest),retestHoldStrength:clamp(higherCloses*11),chaseDistanceAtr:chase,minutesSinceConfirmation:confirmed?0:null};
}

function chooseLongSetup(ctx, breakoutQuality=20, cfg = STRATEGY_MODES.active){
  const breakout={...(ctx.longSetup||{}),type:"BREAKOUT_RETEST",label:"Breakout + Retest",quality:breakoutQuality};
  if(cfg.id!=="active")return breakout;
  const candidates=[ctx.first15mSetup,breakout,ctx.vwapReclaimSetup,ctx.momentumSetup].filter(Boolean);
  const confirmed=candidates.filter(x=>x.state==="CONFIRMED").sort((a,b)=>Number(b.quality||0)-Number(a.quality||0));
  if(confirmed.length)return confirmed[0];
  return candidates.sort((a,b)=>Number(b.quality||0)-Number(a.quality||0))[0]||breakout;
}

function avgPriorVolume(rows, index, lookback = 10) {
  const start = Math.max(0, index - lookback);
  const vols = rows.slice(start, index).map((x) => finite(x.c.volume)).filter((v) => v > 0);
  if (!vols.length) return 0;
  return vols.reduce((a,b)=>a+b,0) / vols.length;
}

function emptySession(price) {
  const setup = { state:"WAIT_BREAKOUT", breakoutIndex:-1, retestIndex:-1, confirmationIndex:-1, breakoutVolumeRatio:0, retestVolumeRatio:0, confirmationVolumeRatio:0, breakoutBodyRatio:0, confirmationBodyRatio:0, retestLow:null, retestHigh:null, retestDepthAtr:null, retestHoldStrength:0, chaseDistanceAtr:null };
  return { ready:false, openingHigh:price, openingLow:price, vwap:price, vwapSlope:0, aboveVwap:false, longBreakout:false, shortBreakout:false, longSetup:{...setup}, shortSetup:{...setup}, relativeVolume:1, sessionChangePct:0, avgMinuteDollarVolume:0 };
}

function setupScore(side, { longTrend, shortTrend, market, ctx }) {
  const isLong = side === "LONG";
  const s = isLong ? ctx.longSetup : ctx.shortSetup;
  let score = 0;
  if (s.state === "CONFIRMED") score += 38;
  else if (s.state === "WAIT_CONFIRMATION") score += 24;
  else if (s.state === "WAIT_RETEST") score += 14;
  else if (s.state === "EXPIRED") score += 6;

  const vwapAligned = isLong ? ctx.aboveVwap && ctx.vwapSlope >= 0 : !ctx.aboveVwap && ctx.vwapSlope <= 0;
  if (vwapAligned) score += 17;
  else if (isLong ? ctx.aboveVwap : !ctx.aboveVwap) score += 8;

  const rv = ctx.relativeVolume;
  score += rv >= 1.8 ? 17 : rv >= 1.5 ? 15 : rv >= 1.3 ? 12 : rv >= 1.15 ? 7 : 0;
  score += s.breakoutVolumeRatio >= 1.5 ? 8 : s.breakoutVolumeRatio >= 1.2 ? 6 : s.breakoutVolumeRatio >= 1.05 ? 4 : 0;
  score += s.confirmationVolumeRatio >= 1.4 ? 8 : s.confirmationVolumeRatio >= 1.15 ? 6 : s.confirmationVolumeRatio >= 1.05 ? 4 : 0;
  const trend = isLong ? longTrend : shortTrend;
  score += trend >= 82 ? 7 : trend >= 65 ? 5 : trend >= 50 ? 2 : 0;
  const m = isLong ? market.combined : 100 - market.combined;
  score += m >= 60 ? 5 : m >= 50 ? 3 : 0;
  return clamp(score);
}

function precisionScore({ mtf, retest, relativeStrength, liquidity, inPlay }) {
  return clamp(mtf * .26 + retest * .31 + relativeStrength * .18 + liquidity * .12 + inPlay * .13);
}

function retestQualityScore(side, s, ctx, a) {
  if (!s || s.state !== "CONFIRMED") return s?.state === "WAIT_CONFIRMATION" ? 58 : s?.state === "WAIT_RETEST" ? 42 : 20;
  let score = 30;
  score += s.breakoutVolumeRatio >= 1.50 ? 12 : s.breakoutVolumeRatio >= 1.20 ? 9 : s.breakoutVolumeRatio >= 1.05 ? 5 : 0;
  // Healthy retests usually contract in volume versus the breakout candle.
  score += s.retestVolumeRatio <= .65 ? 15 : s.retestVolumeRatio <= .85 ? 12 : s.retestVolumeRatio <= 1.05 ? 7 : 1;
  const depth = Number(s.retestDepthAtr ?? 99);
  score += depth <= .12 ? 12 : depth <= .22 ? 10 : depth <= .35 ? 6 : 1;
  score += Number(s.retestHoldStrength || 0) >= 65 ? 8 : Number(s.retestHoldStrength || 0) >= 50 ? 5 : 1;
  score += s.confirmationVolumeRatio >= 1.50 ? 10 : s.confirmationVolumeRatio >= 1.20 ? 8 : s.confirmationVolumeRatio >= 1.05 ? 5 : 0;
  score += s.confirmationBodyRatio >= .65 ? 8 : s.confirmationBodyRatio >= .50 ? 6 : s.confirmationBodyRatio >= .35 ? 3 : 0;
  const vwapAligned = side === "LONG" ? ctx.aboveVwap && ctx.vwapSlope >= 0 : !ctx.aboveVwap && ctx.vwapSlope <= 0;
  if (vwapAligned) score += 5;
  return clamp(score);
}

function multiTimeframeAlignment(candles) {
  const one = directionalTrendScore(candles);
  const five = directionalTrendScore(aggregateCandles(candles, 5));
  const fifteen = directionalTrendScore(aggregateCandles(candles, 15));
  return {
    long: clamp(one.long * .30 + five.long * .40 + fifteen.long * .30),
    short: clamp(one.short * .30 + five.short * .40 + fifteen.short * .30),
    oneMinLong:one.long, oneMinShort:one.short,
    fiveMinLong:five.long, fiveMinShort:five.short,
    fifteenMinLong:fifteen.long, fifteenMinShort:fifteen.short,
  };
}

function directionalTrendScore(candles) {
  if (!candles || candles.length < 25) return { long:50, short:50 };
  const closes = candles.map(c => c.close);
  const p = closes.at(-1), e9 = ema(closes,9).at(-1), e20 = ema(closes,20).at(-1), e50 = ema(closes,Math.min(50,Math.max(20,closes.length-2))).at(-1);
  let long = p > e9 && e9 > e20 && e20 > e50 ? 100 : p > e20 && e20 >= e50 ? 82 : p > e20 ? 64 : p < e9 && e9 < e20 ? 18 : 42;
  return { long, short:100-long };
}

function aggregateCandles(candles, minutes) {
  const buckets = new Map();
  for (const c of candles) {
    const p = dateParts(c.datetime); if (!p) continue;
    const bucketMinute = Math.floor(p.minuteOfDay / minutes) * minutes;
    const key = `${p.date}-${bucketMinute}`;
    const prev = buckets.get(key);
    if (!prev) buckets.set(key,{ datetime:c.datetime, open:c.open, high:c.high, low:c.low, close:c.close, volume:finite(c.volume) });
    else { prev.high=Math.max(prev.high,c.high); prev.low=Math.min(prev.low,c.low); prev.close=c.close; prev.volume+=finite(c.volume); }
  }
  return [...buckets.values()];
}

function directionalRelativeStrengthScore(side, relativePct) {
  const d = side === "SHORT" ? -relativePct : relativePct;
  return d >= .80 ? 100 : d >= .50 ? 92 : d >= .30 ? 84 : d >= .15 ? 74 : d >= 0 ? 62 : d >= -.15 ? 45 : 25;
}

function calcLiquidityScore(avgMinuteDollarVolume, price, a) {
  const dv = Number(avgMinuteDollarVolume || 0);
  const dollar = dv >= 2_000_000 ? 100 : dv >= 1_000_000 ? 90 : dv >= 500_000 ? 78 : dv >= 250_000 ? 64 : dv >= 100_000 ? 48 : 28;
  const atrPct = price > 0 ? (a / price) * 100 : 0;
  const execution = atrPct <= .80 ? 90 : atrPct <= 1.20 ? 78 : atrPct <= 1.80 ? 62 : 42;
  return clamp(dollar * .78 + execution * .22);
}

function candleBodyRatio(c) {
  const range = Math.max(1e-9, finite(c.high) - finite(c.low));
  return Math.min(1, Math.abs(finite(c.close) - finite(c.open)) / range);
}

function structureWithSetup(side, price, support, resistance, a, ctx) {
  const base = side === "LONG" ? structureScoreLong(price, support, resistance, a) : structureScoreShort(price, support, resistance, a);
  const s = side === "LONG" ? ctx.longSetup : ctx.shortSetup;
  const setupComponent = s.state === "CONFIRMED" ? 100 : s.state === "WAIT_CONFIRMATION" ? 70 : s.state === "WAIT_RETEST" ? 50 : 25;
  return clamp(base * 0.45 + setupComponent * 0.55);
}

function stopForSetup(side, price, support, resistance, a, setup, ctx) {
  if (side === "LONG") {
    const retest = Number.isFinite(setup?.retestLow) ? setup.retestLow - a * 0.10 : ctx.openingHigh - a * 0.30;
    const structure = Math.max(retest, ctx.vwap - a * 0.25, support - a * 0.08);
    return Math.min(price - a * 0.60, Math.max(price - a * 1.75, structure));
  }
  const retest = Number.isFinite(setup?.retestHigh) ? setup.retestHigh + a * 0.10 : ctx.openingLow + a * 0.30;
  const structure = Math.min(retest, ctx.vwap + a * 0.25, resistance + a * 0.08);
  return Math.max(price + a * 0.60, Math.min(price + a * 1.75, structure));
}

function roomToStructureR(side, price, structure, risk, a) {
  if (!(risk > 0) || !Number.isFinite(structure)) return 3;
  const distance = side === "LONG" ? structure - price : price - structure;
  // Ignore a tiny nearby wick; it is not treated as meaningful established structure.
  if (distance < a * 0.25) return 3;
  return Math.max(0, distance / risk);
}

function calcInPlayScore(rvol, a, price, absChangePct) {
  const rv = rvol >= 2 ? 100 : rvol >= 1.7 ? 90 : rvol >= 1.5 ? 82 : rvol >= 1.3 ? 70 : rvol >= 1.1 ? 52 : 30;
  const atrPct = price > 0 ? (a / price) * 100 : 0;
  const movement = atrPct >= 1.8 ? 100 : atrPct >= 1.2 ? 85 : atrPct >= .8 ? 70 : atrPct >= .5 ? 55 : 35;
  const change = absChangePct >= 4 ? 100 : absChangePct >= 2.5 ? 85 : absChangePct >= 1.5 ? 70 : absChangePct >= .8 ? 55 : 35;
  return clamp(rv * .50 + movement * .30 + change * .20);
}

function setupFamilyArabic(s){
  if(!s)return "بانتظار Setup";
  const label=s.type==="FIRST_15M_CANDLE"?"15-Minute Candle":s.type==="VWAP_RECLAIM"?"VWAP Reclaim":s.type==="MOMENTUM_CONTINUATION"?"Momentum Continuation":"Breakout + Retest";
  if(s.type!=="BREAKOUT_RETEST"&&(s.state==="CONFIRMED"||s.state==="REVALIDATED"))return `${label} ✓`;
  if(s.type==="FIRST_15M_CANDLE"&&s.state==="WAIT_15M_BREAK")return `${label} · بانتظار كسر High أول 15 دقيقة`;
  if(s.type==="FIRST_15M_CANDLE"&&s.state==="WAIT_15M_CONFIRMATION")return `${label} · الكسر موجود وبانتظار تثبيت`;
  if(s.type==="VWAP_RECLAIM"&&s.state==="WAIT_CONFIRMATION")return `${label} · بانتظار التأكيد`;
  if(s.type==="VWAP_RECLAIM"&&s.state==="WAIT_RECLAIM")return `${label} · بانتظار استعادة VWAP`;
  if(s.type==="MOMENTUM_CONTINUATION"&&s.state==="WAIT_MOMENTUM")return `${label} · الزخم غير مكتمل`;
  return `${label} · ${setupStateArabic(s.state)}`;
}

function setupStateArabic(state) {
  return state === "WAIT_BREAKOUT" ? "بانتظار الاختراق"
    : state === "WAIT_RETEST" ? "اختراق ✓ — بانتظار Retest"
    : state === "WAIT_CONFIRMATION" ? "اختراق ✓ Retest ✓ — بانتظار التأكيد"
    : state === "CONFIRMED" ? "Breakout ✓ Retest ✓ Confirmation ✓"
    : state === "REVALIDATED" ? "الإشارة ما زالت صالحة بعد إعادة التحقق"
    : state === "FAILED_RETEST" ? "Failed Breakout — مرفوض"
    : state === "EXPIRED" ? "التأكيد قديم/السعر ابتعد — مرفوض"
    : "بانتظار Setup";
}

function rvolScore(v) { return v >= 1.8 ? 100 : v >= 1.5 ? 92 : v >= 1.3 ? 84 : v >= 1.15 ? 68 : v >= 1.0 ? 52 : 25; }

export function trendScore(candles) {
  if (!candles || candles.length < 200) return 50;
  const closes = candles.map((x) => x.close);
  const e9 = ema(closes, 9).at(-1), e20 = ema(closes, 20).at(-1), e50 = ema(closes, 50).at(-1), e200 = ema(closes, 200).at(-1), price = closes.at(-1);
  if (price > e9 && e9 > e20 && e20 > e50 && price > e200) return 100;
  if (price > e20 && e20 > e50 && price > e200) return 82;
  if (price > e20) return 65;
  if (price < e9 && e9 < e20 && e20 < e50) return 0;
  if (price < e20 && e20 < e50) return 18;
  return 45;
}
function weighted(f, w) { return f.trend*w.trend + f.momentum*w.momentum + f.volume*w.volume + f.structure*w.structure + f.market*w.market; }
function momentumRsiLong(v) { return v >= 52 && v <= 68 ? 95 : v >= 48 && v <= 72 ? 75 : v > 75 ? 35 : 45; }
function momentumRsiShort(v) { return v >= 32 && v <= 48 ? 95 : v >= 28 && v <= 52 ? 75 : v < 25 ? 35 : 45; }
function structureScoreLong(price, support, resistance, a) { return clamp(55 + Math.min(25, ((price-support)/a)*6) + Math.min(20, Math.max(0, (resistance-price)/a)*4)); }
function structureScoreShort(price, support, resistance, a) { return clamp(55 + Math.min(25, ((resistance-price)/a)*6) + Math.min(20, Math.max(0, (price-support)/a)*4)); }
function clamp(v) { return Math.max(0, Math.min(100, v)); }
function supportResistance(candles) {
  const recent = candles.slice(-120), price = recent.at(-1).close;
  const lows = recent.map((x) => x.low).filter((x) => x < price).sort((a,b) => b-a);
  const highs = recent.map((x) => x.high).filter((x) => x > price).sort((a,b) => a-b);
  return [lows[2] ?? Math.min(...recent.map((x)=>x.low)), highs[2] ?? Math.max(...recent.map((x)=>x.high))];
}
function fallbackVolumeRatio(candles) {
  const recent = candles.slice(-21), current = finite(recent.at(-1)?.volume), previous = recent.slice(0,-1);
  const avg = Math.max(1, previous.reduce((a,b)=>a+finite(b.volume),0)/Math.max(1,previous.length));
  return current/avg;
}
function cumulativeVwap(candles) {
  let pv = 0, vol = 0;
  return candles.map((c) => {
    const v = finite(c.volume), typical = (c.high + c.low + c.close) / 3;
    if (v > 0) { pv += typical * v; vol += v; }
    return vol > 0 ? pv / vol : c.close;
  });
}
function dateParts(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[2]), minute = Number(m[3]);
  return { date:m[1], hour, minute, minuteOfDay:hour*60+minute };
}
function ema(values, period) {
  if (!values.length) return [];
  const k = 2/(period+1), out=[]; let prev=values[0];
  for (const v of values) { prev=v*k+prev*(1-k); out.push(prev); }
  return out;
}
function rsi(values, period) {
  if (values.length <= period) return 50;
  const slice = values.slice(-(period+1)); let gains=0, losses=0;
  for (let i=1;i<slice.length;i++){ const d=slice[i]-slice[i-1]; if(d>=0) gains+=d; else losses-=d; }
  if (losses===0) return 100; const rs=(gains/period)/(losses/period); return 100-100/(1+rs);
}
function macdHistogram(values) {
  const e12=ema(values,12), e26=ema(values,26), macd=values.map((_,i)=>e12[i]-e26[i]), signal=ema(macd,9);
  return macd.at(-1)-signal.at(-1);
}
function atr(candles, period) {
  const trs=[];
  for(let i=1;i<candles.length;i++){ const c=candles[i], p=candles[i-1]; trs.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close))); }
  const recent=trs.slice(-period); return recent.reduce((a,b)=>a+b,0)/Math.max(1,recent.length);
}
function median(values){const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function finite(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function fmt(v){ return Number(v||0).toFixed(2); }
