import { getStore } from "@netlify/blobs";
import { fetchCandles } from "./lib/trading.mjs";
import { reserveApiMinute } from "./lib/credits.mjs";
import { marketSession } from "./lib/time.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  const u=new URL(req.url); const symbol=String(u.searchParams.get('symbol')||'SPY').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'').slice(0,16)||'SPY';
  if (!apiKey) return json({ error: "TWELVE_DATA_API_KEY غير مضاف في Netlify" }, 500);

  try {
    const store=getStore("dynamic-trading");
    const budget=await reserveApiMinute(store,"market-pro",1);
    if(!budget.allowed){
      const cached=await store.get("market-pro-latest-v35",{type:"json",consistency:"strong"});
      if(cached)return json({...cached,creditSmartReused:true,creditWaitSeconds:budget.waitSeconds},200,{"Cache-Control":"no-store"});
      return json({error:`تحديث السوق يستخدم حصة هذه الدقيقة. جرّب Market Pro بعد ${budget.waitSeconds} ثانية.`,creditWaitSeconds:budget.waitSeconds},429);
    }
    // الخطة المجانية لا توفر extended-hours لحظياً. نستخدم الجلسة العادية افتراضياً،
    // ويمكن تفعيل pre/post لاحقاً بإضافة TWELVE_DATA_PREPOST=true بعد الترقية إلى Pro.
    const allowExtended = String(process.env.TWELVE_DATA_PREPOST || "").toLowerCase() === "true";
    let candles;
    let extendedHoursAvailable = false;
    let extendedHoursNote = "Premarket اللحظي غير مفعل. الخطة المجانية تعمل أثناء الجلسة العادية؛ لتفعيل الـPremarket أضف TWELVE_DATA_PREPOST=true بعد الترقية إلى Pro.";
    if (allowExtended) {
      try {
        candles = await fetchCandles(symbol, apiKey, "1min", 5000, { includePrepost: true });
        extendedHoursAvailable = true;
        extendedHoursNote = "Extended-hours مفعلة.";
      } catch (extendedError) {
        candles = await fetchCandles(symbol, apiKey, "1min", 5000, { includePrepost: false });
        extendedHoursNote = `تعذر تفعيل الـPremarket؛ تم التحويل تلقائياً للجلسة العادية. ${extendedError.message || ""}`.trim();
      }
    } else {
      candles = await fetchCandles(symbol, apiKey, "1min", 5000, { includePrepost: false });
    }
    const currentMarket = marketSession();
    const data = analyzeMarketProCandles(candles, currentMarket, symbol);
    data.extendedHoursAvailable = extendedHoursAvailable;
    data.extendedHoursNote = extendedHoursNote;
    data.currentMarket = currentMarket;
    await store.setJSON("market-pro-latest-v35",data);
    return json(data, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return json({ error: error.message || "تعذر تحديث لوحة Market Pro" }, 502);
  }
};

export const config = { path: "/api/market-pro" };

export function analyzeMarketProCandles(candles, currentMarket = marketSession(), symbol = "PLTR") {
  if (!Array.isArray(candles) || candles.length < 30) throw new Error("لا توجد بيانات كافية لـ Market Pro");
  const valid = candles.filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low));
  const latest = valid.at(-1);
  const latestParts = dateParts(latest.datetime);
  if (!latestParts) throw new Error("صيغة وقت بيانات السهم غير معروفة");

  const latestDate = latestParts.date;
  const latestMinute = latestParts.minuteOfDay;
  const byDate = groupByDate(valid);
  const today = byDate.get(latestDate) || [];

  const premarket = today.filter(c => {
    const p = dateParts(c.datetime);
    return p && p.minuteOfDay >= 240 && p.minuteOfDay < 570;
  });
  const premarketHigh = premarket.length ? Math.max(...premarket.map(c => c.high)) : null;
  const premarketLow = premarket.length ? Math.min(...premarket.map(c => c.low)) : null;
  const postmarket = today.filter(c => {
    const p = dateParts(c.datetime);
    return p && p.minuteOfDay >= 960 && p.minuteOfDay < 1200;
  });
  const postmarketHigh = postmarket.length ? Math.max(...postmarket.map(c => c.high)) : null;
  const postmarketLow = postmarket.length ? Math.min(...postmarket.map(c => c.low)) : null;

  const currentDateMatches = currentMarket?.dateKey === latestDate;
  const effectiveSession = currentDateMatches ? currentMarket.session : (latestMinute < 570 ? "PREMARKET" : latestMinute < 960 ? "REGULAR" : "POSTMARKET");
  const sessionStart = effectiveSession === "PREMARKET" ? 240 : effectiveSession === "POSTMARKET" ? 960 : 570;
  const naturalEnd = effectiveSession === "PREMARKET" ? 570 : effectiveSession === "POSTMARKET" ? 1200 : 960;
  const sessionEnd = currentDateMatches ? Math.min(latestMinute, naturalEnd) : Math.min(latestMinute, naturalEnd);
  const vwapMode = effectiveSession === "PREMARKET" ? "Premarket VWAP" : effectiveSession === "POSTMARKET" ? "Postmarket VWAP" : "Regular VWAP";
  const sessionCandles = today.filter(c => {
    const p = dateParts(c.datetime);
    return p && p.minuteOfDay >= sessionStart && p.minuteOfDay <= sessionEnd;
  });

  const currentVolume = sessionCandles.reduce((sum, c) => sum + finite(c.volume), 0);
  const historicalDates = [...byDate.keys()].filter(d => d < latestDate).sort().reverse().slice(0, 5);
  const comparableVolumes = historicalDates.map(date => {
    const list = byDate.get(date) || [];
    return list.filter(c => {
      const p = dateParts(c.datetime);
      return p && p.minuteOfDay >= sessionStart && p.minuteOfDay <= sessionEnd;
    }).reduce((sum, c) => sum + finite(c.volume), 0);
  }).filter(v => v > 0);
  const avgComparable = comparableVolumes.length ? comparableVolumes.reduce((a,b)=>a+b,0) / comparableVolumes.length : 0;
  let relativeVolume = avgComparable > 0 ? currentVolume / avgComparable : fallbackVolumeRatio(valid);
  if (!Number.isFinite(relativeVolume)) relativeVolume = 1;

  const vwap = calcVwap(sessionCandles);
  const pressureCandles = sessionCandles.slice(-30);
  const pressure = directionalPressure(pressureCandles);
  const sr = supportResistance(valid.slice(-90));

  // نبني VWAP متحركاً للجلسة الحالية للرسم، ويعاد ضبطه عند بداية الـPremarket أو الجلسة العادية.
  let cumPV = 0, cumVol = 0;
  const vwapByDatetime = new Map();
  for (const c of sessionCandles) {
    const typical = (c.high + c.low + c.close) / 3;
    const vol = finite(c.volume);
    if (vol > 0) { cumPV += typical * vol; cumVol += vol; }
    vwapByDatetime.set(c.datetime, cumVol > 0 ? cumPV / cumVol : c.close);
  }

  const chartSource = today.length ? today : valid.slice(-360);
  const chart = chartSource.slice(-360).map(c => ({
    t: c.datetime,
    o: round(c.open), h: round(c.high), l: round(c.low), c: round(c.close),
    v: finite(c.volume),
    vwap: vwapByDatetime.has(c.datetime) ? round(vwapByDatetime.get(c.datetime)) : null,
  }));

  const firstSession = sessionCandles.at(0)?.open ?? today.at(0)?.open ?? latest.open;
  const changePct = firstSession ? ((latest.close - firstSession) / firstSession) * 100 : 0;

  return {
    symbol,
    generatedAt: new Date().toISOString(),
    marketDatetime: latest.datetime,
    price: round(latest.close),
    changePct: round(changePct, 2),
    vwap: round(vwap),
    vwapMode,
    premarketHigh: nullableRound(premarketHigh),
    premarketLow: nullableRound(premarketLow),
    postmarketHigh: nullableRound(postmarketHigh),
    postmarketLow: nullableRound(postmarketLow),
    relativeVolume: round(relativeVolume, 2),
    rvolSampleDays: comparableVolumes.length,
    buyPressure: Math.round(pressure.buy),
    sellPressure: Math.round(pressure.sell),
    pressureMethod: "تقديري من اتجاه شموع الدقيقة وحجمها — وليس بيانات Bid/Ask فعلية",
    support: round(sr.support),
    resistance: round(sr.resistance),
    session: currentMarket?.session === "POSTMARKET" ? "POSTMARKET" : currentMarket?.session || effectiveSession,
    priceStale: !currentDateMatches,
    latestDataDate: latestDate,
    chart,
  };
}

function dateParts(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { date: m[1], hour: Number(m[2]), minute: Number(m[3]), minuteOfDay: Number(m[2]) * 60 + Number(m[3]) };
}
function groupByDate(candles) {
  const map = new Map();
  for (const c of candles) {
    const p = dateParts(c.datetime); if (!p) continue;
    if (!map.has(p.date)) map.set(p.date, []);
    map.get(p.date).push(c);
  }
  return map;
}
function calcVwap(candles) {
  let pv = 0, vol = 0;
  for (const c of candles) {
    const v = finite(c.volume); if (v <= 0) continue;
    pv += ((c.high + c.low + c.close) / 3) * v; vol += v;
  }
  return vol > 0 ? pv / vol : candles.at(-1)?.close ?? 0;
}
function directionalPressure(candles) {
  let buy = 0, sell = 0;
  for (const c of candles) {
    const v = finite(c.volume);
    if (c.close > c.open) buy += v;
    else if (c.close < c.open) sell += v;
    else { buy += v / 2; sell += v / 2; }
  }
  const total = buy + sell;
  if (total <= 0) return { buy: 50, sell: 50 };
  return { buy: buy / total * 100, sell: sell / total * 100 };
}
function supportResistance(candles) {
  const price = candles.at(-1)?.close ?? 0;
  const lows = candles.map(c=>c.low).filter(x=>x<price).sort((a,b)=>b-a);
  const highs = candles.map(c=>c.high).filter(x=>x>price).sort((a,b)=>a-b);
  return {
    support: lows[2] ?? Math.min(...candles.map(c=>c.low)),
    resistance: highs[2] ?? Math.max(...candles.map(c=>c.high)),
  };
}
function fallbackVolumeRatio(candles) {
  const recent = candles.slice(-21); const cur = finite(recent.at(-1)?.volume);
  const prev = recent.slice(0,-1); const avg = prev.reduce((s,c)=>s+finite(c.volume),0) / Math.max(1, prev.length);
  return avg > 0 ? cur / avg : 1;
}
function finite(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round(v, digits=2){ const n=Number(v); if(!Number.isFinite(n)) return 0; const p=10**digits; return Math.round(n*p)/p; }
function nullableRound(v){ return v == null || !Number.isFinite(Number(v)) ? null : round(v); }
function json(body, status=200, extra={}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type":"application/json; charset=utf-8", ...extra } }); }
