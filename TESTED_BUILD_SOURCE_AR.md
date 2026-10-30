# وصف مصدر النسخة
- الأساس البرمجي: Dynamic_Trading_3.5_SMART_FOCUS_RECOVERY_TESTED.zip، مع ترقيات 3.6 السابقة وكروت الانتقال وPush/Shadow/AI.
- مرجع سياسة البحث: DT35_Improved_Entry_Dynamic_Profitability_Research_2026-10-29.zip.
- مصدر الأسعار التاريخية للمقارنة: ALPACA_SEP_OCT_2026.zip.
- تنفيذ JavaScript مستقل للمحاكاة: netlify/functions/lib/research-parity36.mjs.
- تنفيذ JavaScript المستهدف للحي الورقي: netlify/functions/lib/research-live36.mjs.
- **مساران مختلفان في إتمام السعر**: المحاكاة التاريخية OHLC تضع fills افتراضية؛ Live Paper يتطلب Bid/Ask فعلياً ولا يرسل أوامر شراء.
