/** Pure scoring, target and presentation helpers. No network calls or trading orders. */

export function setupScore(side, { longTrend, shortTrend, market, ctx }) {
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

export function precisionScore({ mtf, retest, relativeStrength, liquidity, inPlay }) {
  return clamp(mtf * .26 + retest * .31 + relativeStrength * .18 + liquidity * .12 + inPlay * .13);
}

export function retestQualityScore(side, s, ctx, a) {
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

export function directionalRelativeStrengthScore(side, relativePct) {
  const d = side === "SHORT" ? -relativePct : relativePct;
  return d >= .80 ? 100 : d >= .50 ? 92 : d >= .30 ? 84 : d >= .15 ? 74 : d >= 0 ? 62 : d >= -.15 ? 45 : 25;
}

export function calcLiquidityScore(avgMinuteDollarVolume, price, a) {
  const dv = Number(avgMinuteDollarVolume || 0);
  const dollar = dv >= 2_000_000 ? 100 : dv >= 1_000_000 ? 90 : dv >= 500_000 ? 78 : dv >= 250_000 ? 64 : dv >= 100_000 ? 48 : 28;
  const atrPct = price > 0 ? (a / price) * 100 : 0;
  const execution = atrPct <= .80 ? 90 : atrPct <= 1.20 ? 78 : atrPct <= 1.80 ? 62 : 42;
  return clamp(dollar * .78 + execution * .22);
}

export function structureWithSetup(side, price, support, resistance, a, ctx) {
  const base = side === "LONG" ? structureScoreLong(price, support, resistance, a) : structureScoreShort(price, support, resistance, a);
  const s = side === "LONG" ? ctx.longSetup : ctx.shortSetup;
  const setupComponent = s.state === "CONFIRMED" ? 100 : s.state === "WAIT_CONFIRMATION" ? 70 : s.state === "WAIT_RETEST" ? 50 : 25;
  return clamp(base * 0.45 + setupComponent * 0.55);
}

export function stopForSetup(side, price, support, resistance, a, setup, ctx) {
  if (side === "LONG") {
    const retest = Number.isFinite(setup?.retestLow) ? setup.retestLow - a * 0.10 : ctx.openingHigh - a * 0.30;
    const structure = Math.max(retest, ctx.vwap - a * 0.25, support - a * 0.08);
    return Math.min(price - a * 0.60, Math.max(price - a * 1.75, structure));
  }
  const retest = Number.isFinite(setup?.retestHigh) ? setup.retestHigh + a * 0.10 : ctx.openingLow + a * 0.30;
  const structure = Math.min(retest, ctx.vwap + a * 0.25, resistance + a * 0.08);
  return Math.max(price + a * 0.60, Math.min(price + a * 1.75, structure));
}

export function roomToStructureR(side, price, structure, risk, a) {
  if (!(risk > 0) || !Number.isFinite(structure)) return 3;
  const distance = side === "LONG" ? structure - price : price - structure;
  // Ignore a tiny nearby wick; it is not treated as meaningful established structure.
  if (distance < a * 0.25) return 3;
  return Math.max(0, distance / risk);
}

export function calcInPlayScore(rvol, a, price, absChangePct) {
  const rv = rvol >= 2 ? 100 : rvol >= 1.7 ? 90 : rvol >= 1.5 ? 82 : rvol >= 1.3 ? 70 : rvol >= 1.1 ? 52 : 30;
  const atrPct = price > 0 ? (a / price) * 100 : 0;
  const movement = atrPct >= 1.8 ? 100 : atrPct >= 1.2 ? 85 : atrPct >= .8 ? 70 : atrPct >= .5 ? 55 : 35;
  const change = absChangePct >= 4 ? 100 : absChangePct >= 2.5 ? 85 : absChangePct >= 1.5 ? 70 : absChangePct >= .8 ? 55 : 35;
  return clamp(rv * .50 + movement * .30 + change * .20);
}

export function setupFamilyArabic(s){
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

export function setupStateArabic(state) {
  return state === "WAIT_BREAKOUT" ? "بانتظار الاختراق"
    : state === "WAIT_RETEST" ? "اختراق ✓ — بانتظار Retest"
    : state === "WAIT_CONFIRMATION" ? "اختراق ✓ Retest ✓ — بانتظار التأكيد"
    : state === "CONFIRMED" ? "Breakout ✓ Retest ✓ Confirmation ✓"
    : state === "REVALIDATED" ? "الإشارة ما زالت صالحة بعد إعادة التحقق"
    : state === "FAILED_RETEST" ? "Failed Breakout — مرفوض"
    : state === "EXPIRED" ? "التأكيد قديم/السعر ابتعد — مرفوض"
    : "بانتظار Setup";
}

export function rvolScore(v) { return v >= 1.8 ? 100 : v >= 1.5 ? 92 : v >= 1.3 ? 84 : v >= 1.15 ? 68 : v >= 1.0 ? 52 : 25; }

export function weighted(f, w) { return f.trend*w.trend + f.momentum*w.momentum + f.volume*w.volume + f.structure*w.structure + f.market*w.market; }

export function momentumRsiLong(v) { return v >= 52 && v <= 68 ? 95 : v >= 48 && v <= 72 ? 75 : v > 75 ? 35 : 45; }

export function momentumRsiShort(v) { return v >= 32 && v <= 48 ? 95 : v >= 28 && v <= 52 ? 75 : v < 25 ? 35 : 45; }

export function structureScoreLong(price, support, resistance, a) { return clamp(55 + Math.min(25, ((price-support)/a)*6) + Math.min(20, Math.max(0, (resistance-price)/a)*4)); }

export function structureScoreShort(price, support, resistance, a) { return clamp(55 + Math.min(25, ((resistance-price)/a)*6) + Math.min(20, Math.max(0, (price-support)/a)*4)); }

export function clamp(v) { return Math.max(0, Math.min(100, v)); }
