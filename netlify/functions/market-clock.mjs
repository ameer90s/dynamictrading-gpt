import { marketSession, nextMarketOpenLabel, nextTradingDateKey } from "./lib/time.mjs";

export default async (req) => {
  if (req.method !== "GET") return json({ error:"Method not allowed" }, 405);
  const s = marketSession();
  return json({
    ...s,
    nextTradingDate: nextTradingDateKey(),
    nextOpen: nextMarketOpenLabel(),
    timezone: "America/New_York",
    sessions: {
      premarket: "04:00–09:30 ET",
      regular: s.earlyClose ? "09:30–13:00 ET" : "09:30–16:00 ET",
      postmarket: s.earlyClose ? "13:00–17:00 ET" : "16:00–20:00 ET",
    },
    liveExtendedDataNote: "Twelve Data real-time extended-hours requires Pro; status is shown regardless of data plan.",
  }, 200, { "Cache-Control":"no-store, max-age=0" });
};

export const config = { path:"/api/market-clock" };
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8",...extra}});}
