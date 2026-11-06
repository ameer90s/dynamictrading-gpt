import { getStore } from "@netlify/blobs";
import { recommendationWindow, nextTradingDateKey, previousTradingDateKey } from "./lib/time.mjs";
import {sessionPlan37} from "./lib/trading-session-plan37.mjs";
import { fetchLatestQuotes, alpacaConfigured } from "./lib/alpaca.mjs";
import {STRATEGY_VERSION} from "./lib/version.mjs";
import {validateExecutionQuote37} from "./lib/execution-quote37.mjs";
import {randomUUID} from "node:crypto";

export default async (req) => {
  const store = getStore("dynamic-trading");
  const clock = recommendationWindow();
  const key = `selection-${clock.dateKey}`;
  const riskKey = `daily-risk-${clock.dateKey}`;
  try {
    if (req.method === "GET") {
      const selected = await store.get(key, { type:"json", consistency:"strong" });
      const dailyRisk = await store.get(riskKey, { type:"json", consistency:"strong" }) || { slCount:0, trades:0 };
      if (dailyRisk.slCount >= 2) return json({ selected:false, dailyStop:true, slCount:dailyRisk.slCount, tradeDate:clock.dateKey, nextTradeDate:nextTradingDateKey() }, 200, { "Cache-Control":"no-store" });
      if (selected?.side === "LONG" && !selected.outcome) return json({ selected:true, trade:selected, tradeDate:clock.dateKey, nextTradeDate:nextTradingDateKey(), carryOver:false, slCount:dailyRisk.slCount }, 200, { "Cache-Control":"no-store" });
      // Keep the previous trading day's chosen trade visible through weekends / before the next 09:30 window.
      if (!clock.isTradingDay || clock.minuteOfDay < clock.startMinute) {
        const previousKey = previousTradingDateKey();
        const previous = await store.get(`selection-${previousKey}`, { type:"json", consistency:"strong" });
        if (previous?.side === "LONG") return json({ selected:true, trade:previous, tradeDate:previousKey, nextTradeDate:clock.isTradingDay?clock.dateKey:nextTradingDateKey(), carryOver:true }, 200, { "Cache-Control":"no-store" });
      }
      return json({ selected:false, tradeDate:clock.dateKey, nextTradeDate:nextTradingDateKey() }, 200, { "Cache-Control":"no-store" });
    }
    if (req.method === "PATCH") {
      const existing = await store.get(key, { type:"json", consistency:"strong" });
      if (!existing?.side || existing.side !== "LONG") return json({ error:"لا توجد صفقة معتمدة لليوم لتسجيل نتيجتها." }, 404);
      if (existing.outcome) return json({ error:"تم تسجيل نتيجة هذه الصفقة مسبقاً.", trade:existing }, 409);
      const body = await req.json().catch(() => ({}));
      const result = String(body.result || "").toUpperCase();
      if (!["T1","T2","T3","SL"].includes(result)) return json({ error:"النتيجة يجب أن تكون T1 أو T2 أو T3 أو SL." }, 400);
      // A persistent, atomic claim prevents concurrent settlement side effects.
      // Retain the claim on failure: fail closed rather than risk a duplicate close.
      const settlementKey=`${key}-settlement-claim`;
      const settlementClaimId=randomUUID();
      const claim=await store.setJSON(settlementKey,{
        claimId:settlementClaimId,selectionClaimId:existing.selectionClaimId||null,
        claimedAt:new Date().toISOString(),status:'CLAIMED'
      },{onlyIfNew:true});
      if(claim?.modified!==true)return json({error:'نتيجة الصفقة قيد التسجيل أو تم تسجيلها مسبقاً.',reason:'SETTLEMENT_ALREADY_CLAIMED'},409);
      const confirmedClaim=await store.get(settlementKey,{type:'json',consistency:'strong'});
      if(confirmedClaim?.claimId!==settlementClaimId)return json({error:'تعذر تأكيد حجز إغلاق الصفقة؛ راجع الحالة المحفوظة.',reason:'SETTLEMENT_CLAIM_NOT_VERIFIED'},503);
      const ep = existing.exitPlan || {};
      const R = result === "T1" ? Number(ep.t1R || 1) : result === "T2" ? Number(ep.t2R || 1.7) : result === "T3" ? Number(ep.t3R || 2.5) : -1;
      const updated = { ...existing, outcome:result, outcomeR:R, closedAt:new Date().toISOString() };
      const dailyRisk = await store.get(riskKey, { type:"json", consistency:"strong" }) || { slCount:0, trades:0 };
      if (result === "SL") dailyRisk.slCount = Number(dailyRisk.slCount||0) + 1;
      dailyRisk.lastClosedAt = updated.closedAt; dailyRisk.lastResult = result;
      await store.setJSON(riskKey, dailyRisk);
      await store.setJSON(`${key}-closed-${Date.now()}`, updated);
      await store.delete(key);
      const dailyStop = dailyRisk.slCount >= 2;
      return json({ selected:false, trade:updated, result, R, dailyStop, slCount:dailyRisk.slCount, nextTradeDate:dailyStop?nextTradingDateKey():clock.dateKey }, 200, { "Cache-Control":"no-store" });
    }
    if (req.method !== "POST") return json({ error:"Method not allowed" }, 405);
    if(!sessionPlan37(clock).discovery)return json({error:'انتهت فترة اعتماد فرص جديدة قبل إغلاق السوق بساعة؛ تستمر متابعة الصفقة المعتمدة فقط.',reason:'PRE_CLOSE_NO_NEW_APPROVALS'},409);

    const existing = await store.get(key, { type:"json", consistency:"strong" });
    const dailyRisk = await store.get(riskKey, { type:"json", consistency:"strong" }) || { slCount:0, trades:0 };
    if (dailyRisk.slCount >= 2) return json({ error:"تم إيقاف اعتماد صفقات جديدة بعد تسجيل 2 SL في جلسة اليوم. يستمر البحث والمراقبة حتى يوم التداول التالي.", dailyStop:true, slCount:dailyRisk.slCount, locked:true }, 409);
    if (existing?.side === "LONG" && !existing.outcome) return json({ error:"هناك صفقة معتمدة ما زالت مفتوحة. سجّل نتيجتها أولاً قبل اعتماد فرصة جديدة.", trade:existing, locked:true }, 409);

    const body = await req.json().catch(() => ({}));
    const symbol = String(body.symbol || "").trim().toUpperCase();
    if (!symbol) return json({ error:"اختر السهم أولاً" }, 400);
    const mode = ["active","balanced","precision"].includes(body.mode) ? body.mode : "active";
    // Recommendations refresh through the regular-session close; validate against the latest dynamic SMART/CONFIRMED deck.
    const candidates = await store.get(`candidate-${clock.dateKey}-${mode}`, { type:"json", consistency:"strong" })
      || await store.get(`candidate-${clock.dateKey}`, { type:"json", consistency:"strong" })
      || await store.get(`candidate-ready-${clock.dateKey}-${mode}`, { type:"json", consistency:"strong" })
      || await store.get(`candidate-ready-${clock.dateKey}`, { type:"json", consistency:"strong" });
    if (!candidates) return json({ error:"لا توجد توصيات محفوظة لليوم بعد. شغّل تحديث السوق خلال نافذة التوصيات." }, 404);
    if (body.generatedAt && candidates.generatedAt !== body.generatedAt) return json({ error:"تم تحديث توصيات السوق بعد عرض هذه القائمة. اضغط تحليل توصيات اليوم مرة واحدة ثم اختر الصفقة من القائمة الجديدة." }, 409);
    const candidateAgeSec=candidates.generatedAt?Math.max(0,(Date.now()-Date.parse(candidates.generatedAt))/1000):99999;if(candidateAgeSec>180)return json({error:`STALE — DO NOT TRADE: عمر التحليل ${Math.round(candidateAgeSec)} ثانية. انتظر دورة حديثة قبل الاعتماد.`,stale:true,dataAgeSec:candidateAgeSec},409);
    const normalTrade = (candidates.all || []).find((r) => r.symbol === symbol && r.tradeable && r.side === "LONG");
    const badCandidate = (candidates.display8 || []).find((r)=>r.symbol===symbol && r.badTrade && r.side==="LONG") || (candidates.fallbackTrade && candidates.fallbackTrade.symbol === symbol ? candidates.fallbackTrade : null);
    const acceptBadTrade = body.acceptBadTrade === true;
    const trade = normalTrade || (acceptBadTrade && badCandidate?.badTrade && badCandidate?.side === "LONG" ? badCandidate : null);
    if (trade && trade.side !== "LONG") return json({ error:"الوضع الشرعي في البرنامج يمنع البيع على المكشوف. المسموح اعتماد توصيات شراء LONG فقط لأسهم مملوكة فعلياً." }, 400);
    if (!trade) return json({ error:badCandidate?.badTrade?"هذه BAD TRADE لا تمر شروط High Precision. إذا أردت تثبيتها للمتابعة فقط استخدم خيار اعتماد BAD TRADE.":"هذه الإشارة ليست صفقة تنفيذية صالحة للاعتماد حالياً." }, 400);

    // Execution-quality gate: if Alpaca is configured, re-check the latest IEX bid/ask
    // immediately before locking the trade. A stale or wide spread can invalidate an otherwise
    // good technical setup.
    let latestQuote=null;
    if(!trade.badTrade && !alpacaConfigured())return json({error:'تعذر اعتماد الصفقة: بيانات السعر التنفيذي المباشر غير مفعلة.',reason:'EXECUTION_QUOTE_PROVIDER_UNAVAILABLE'},503);
    if(alpacaConfigured() && !trade.badTrade){
      try{
        const q=await fetchLatestQuotes([symbol],process.env.ALPACA_API_KEY_ID,process.env.ALPACA_API_SECRET_KEY);
        latestQuote=q[symbol]||null;
        const quoteGate=validateExecutionQuote37(latestQuote,trade);
        if(!quoteGate.ok)return json({error:'تم منع اعتماد الصفقة: تعذر إثبات سعر تنفيذ حديث ومكتمل ضمن حدود المخاطرة.',reason:quoteGate.reason,
          quoteValidation:{ageSec:quoteGate.ageSec??null,spreadBps:quoteGate.spreadBps??null,
            maxBps:quoteGate.maxBps??null,deviationPct:quoteGate.deviationPct??null,ask:quoteGate.ask??null}},409);

      }catch(error){return json({error:'تعذر التحقق من السعر التنفيذي مباشرة؛ تم إيقاف الاعتماد لحماية التداول.',reason:'EXECUTION_QUOTE_REVALIDATION_FAILED'},503);}
    }

    // Revalidate the currently displayed candidate against the freshest cached news/catalyst data
    // before allowing the user to lock it for the day. This prevents selecting an old
    // technical signal after a new high-risk catalyst appeared.
    const latestNewsPayload = await store.get(`news-${clock.dateKey}`, { type:"json", consistency:"strong" });
    const latestNews = latestNewsPayload?.bySymbol?.[symbol] || trade.news || null;
    if (latestNews && !trade.badTrade) {
      const sentiment = Number(latestNews.sentimentScore || 0);
      const risk = Number(latestNews.riskScore || 0);
      const catalyst = Number(latestNews.catalystScore || 0);
      if (trade.side === "LONG" && risk >= 85) return json({ error:"ظهر خبر/إعلان جديد عالي المخاطر جداً بعد تحديث التوصية؛ تم منع اعتماد LONG.", news:latestNews }, 409);
      if (trade.side === "SHORT" && risk >= 80 && sentiment > 15) return json({ error:"ظهر إعلان رسمي جديد عالي المخاطر لكن اتجاهه إيجابي؛ تم منع اعتماد SHORT.", news:latestNews }, 409);
      if (catalyst >= 75 && ((trade.side === "LONG" && sentiment < -22) || (trade.side === "SHORT" && sentiment > 18))) return json({ error:"ظهر Catalyst قوي معاكس لاتجاه الصفقة؛ تم منع اعتماد التوصية.", news:latestNews }, 409);
    }

    const selected = {
      ...trade,
      version:STRATEGY_VERSION,
      strategyVersion:STRATEGY_VERSION,
      news: latestNews || trade.news || null,
      executionQuote: latestQuote || trade.executionQuote || null,
      executableEntry: Number(latestQuote?.ask||0)||Number(trade.price||0),
      signalId: trade.signalId||null,
      confirmedAt: trade.confirmedAt||null,
      signalAgeAtApprovalSec: trade.confirmedAt?Math.max(0,(Date.now()-Date.parse(trade.confirmedAt))/1000):Number(trade.signalAgeSec||0)||null,
      originalShadow: trade.recommendedTarget||null,
      approvalShadow: trade.recommendedTarget||null,
      shadowTracking:{mode:'MEASUREMENT_ONLY',original:trade.recommendedTarget||null,current:trade.recommendedTarget||null,startedAt:new Date().toISOString()},
      tradeDate: clock.dateKey,
      selectedAt: new Date().toISOString(),
      lockedUntilTradeDate: nextTradingDateKey(),
      selectionId: `${clock.dateKey}:${trade.symbol}`,
      selectionClaimId: randomUUID(),
      badTrade: Boolean(trade.badTrade),
      paperOnly: Boolean(trade.badTrade),
      halalMode:true,
      ownershipRule:"CASH_LONG_ONLY",
    };
    // Conditional claim guarantees at most one approved trade per session, even
    // when two clients submit simultaneously. Do not increment risk on losers.
    const receipt=await store.setJSON(key,selected,{onlyIfNew:true});
    if(receipt?.modified!==true)return json({error:'تم اعتماد صفقة أخرى بالتزامن؛ اقرأ الصفقة المحفوظة قبل إعادة المحاولة.',reason:'SELECTION_ALREADY_CLAIMED'},409);
    const stored=await store.get(key,{type:'json',consistency:'strong'});
    if(stored?.selectionClaimId!==selected.selectionClaimId)return json({error:'تعذر التحقق من ملكية اعتماد الصفقة. افحص الحالة المحفوظة.',reason:'SELECTION_CLAIM_NOT_VERIFIED'},503);
    dailyRisk.trades = Number(dailyRisk.trades||0) + 1; dailyRisk.lastSelectedAt = selected.selectedAt;
    await store.setJSON(riskKey, dailyRisk);
    // Mark the matching scanner signal as approved without changing scanner statistics.
    try {
      const shKey=`signal-history-${clock.dateKey}`; const sh=await store.get(shKey,{type:"json",consistency:"strong"});
      const rec=sh?.signals?.[symbol]; const sig=rec?.confirmedSignals?.slice().reverse().find(x=>(trade.signalId?x.signalId===trade.signalId:x.active)&&!x.approvedAt);
      if(sig){sig.approvedAt=selected.selectedAt;sig.selectionId=selected.selectionId;sig.signalAgeAtApprovalSec=Math.max(0,(Date.parse(selected.selectedAt)-Date.parse(sig.confirmedAt))/1000);sig.responseTimeBucket=sig.signalAgeAtApprovalSec<=120?'<=2m':sig.signalAgeAtApprovalSec<=300?'2-5m':'>5m';sig.approvalShadow=trade.recommendedTarget||sig.recommendedTarget||null;sig.shadow={...(sig.shadow||{}),mode:'MEASUREMENT_ONLY',startedAt:selected.selectedAt,approvedAt:selected.selectedAt,originalRecommendedTarget:sig.recommendedTarget||null,approvalRecommendedTarget:trade.recommendedTarget||null,originalEntry:sig.entry,approvalEntry:Number(selected.executableEntry||trade.price||0),entrySlippagePct:sig.entry?((Number(selected.executableEntry||trade.price||0)-Number(sig.entry))/Number(sig.entry))*100:null,originalT1:sig.t1,originalT2:sig.t2,originalT3:sig.t3,originalSl:sig.sl};sh.events.push({at:selected.selectedAt,symbol,event:'APPROVED',version:STRATEGY_VERSION,signalId:sig.signalId,signalAgeSec:sig.signalAgeAtApprovalSec,originalShadow:sig.recommendedTarget||null,approvalShadow:sig.approvalShadow,executableEntry:selected.executableEntry});await store.setJSON(shKey,sh);await store.setJSON("signal-history-latest",sh);}
    } catch {}
    return json({ selected:true, trade:selected, tradeDate:clock.dateKey, nextTradeDate:selected.lockedUntilTradeDate, slCount:dailyRisk.slCount }, 201, { "Cache-Control":"no-store" });
  } catch (error) {
    return json({ error:error.message || "تعذر حفظ صفقة اليوم" }, 500);
  }
};

export const config = { path: "/api/selection" };
function json(body, status=200, extra={}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type":"application/json; charset=utf-8", ...extra } }); }
