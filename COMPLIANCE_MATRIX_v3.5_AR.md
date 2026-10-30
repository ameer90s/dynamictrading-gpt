# Dynamic Trading v3.5 — Verified Compliance Matrix

تاريخ التدقيق: 2026-10-17

**قاعدة الاعتماد:** لا تعني ✅ أن السوق الحي تم اختباره خارجياً؛ تعني أن المتطلب موجود في الكود، ومساره راجعناه، واجتاز فحوص syntax/static المناسبة. السلوك الذي يعتمد على مفاتيح Netlify أو بيانات السوق الحية يُؤكد بعد النشر بواسطة Scanner Health Monitor وسجل Signal History.

| # | المتطلب | الحالة | دليل التنفيذ |
|---|---|---|---|
|1|Sharia-first dynamic universe|✅|`lib/sharia.mjs` + `daily-recommendation.mjs`; AAOIFI/cache 48h؛ لا primary ثابتة|
|2|New candidates < $200|✅|`PRICE_CAP=200` + dynamic eligibility|
|3|No TSLA exception|✅|لا يوجد TSLA في منطق التشغيل|
|4|≤$199 same-setup watch exception|✅|`WATCH_ENTRY_CAP=199` + `watchPriceExceptionEligible`|
|5|Background scanner independent of button|✅|Netlify scheduled `daily-recommendation` every minute؛ الزر Force Refresh فقط|
|6|Automatic SMART→CONFIRMED|✅|إعادة تحليل خلفية كل دقيقة + recommendation state|
|7|Manual button = Force Refresh|✅|UI label/function منفصل عن scheduled scanner|
|8|Instant CONFIRMED push|✅|`sendConfirmedPushes` بعد `updateSignalHistory`|
|9|CONFIRMED revalidation|✅|كل دورة تعيد تقييم setup/context/quote/news|
|10|Stale signal expiry/downgrade|✅|setup freshness/EXPIRED + WAIT/SMART downgrade|
|11|Signal age|✅|`confirmedAt/signalAgeSec` + setup confirmation-age gates|
|12|Better Entry/Retest|✅|Retest/chase filters|
|13|HOD/Extension protection|✅|`WAIT_RETEST_HOD` + extension checks|
|14|Fresh re-entry|✅|Fresh transition back to CONFIRMED gets new Signal ID|
|15|Immutable Signal ID|✅|fingerprint + sequence stored in Signal History|
|16|Push dedup|✅|`push-notified-${date}` keyed by Signal ID|
|17|Shadow after Approved|✅|`selection.mjs` starts shadow only at approval|
|18|Actual vs Shadow separated|✅|actual outcome fields separate from `shadow`/`preT3Continuation`|
|19|Lowest Price Before Rally|✅|Outcome tracker logs low/time before target rally|
|20|Entry Drawdown / MAE|✅|`entryDrawdownPct`, `entryDrawdownPrice`, `maePct`|
|21|Time to Low + Recovery|✅|`timeToLowSec`, `recoveryTimeSec`|
|22|SL integrity|✅|SL-first stays SL; later post-SL targets do not rewrite outcome|
|23|Post-SL T1/T2/T3|✅|separate `POST_SL_*` events|
|24|MFE|✅|`mfePct`|
|25|Post-T3 extension|✅|`postT3Peak/postT3MfePct/giveback`|
|26|Bid/Ask/Last snapshot|✅|Signal feature snapshot|
|27|Spread + Quote Age|✅|spread/quote freshness gates + stored fields|
|28|Executable Ask|✅|Approval blocked when Ask exceeds entry range; executableEntry stored|
|29|Rejection reasons|✅|filters + transition history `rejectedReason`|
|30|Miss taxonomy|✅|schema exposes Scanner/Confirmation/Late Entry taxonomy; hypothetical misses are not auto-attributed|
|31|Scanner funnel|✅|Sharia universe → discovered → evaluated → SMART → CONFIRMED; approval/outcome in Signal History|
|32|Actual vs Expected/Missed|✅|program records tagged `ACTUAL_PROGRAM_SIGNAL`; missed analysis remains separate|
|33|30 trading sessions|✅|Signal History endpoint retrieves up to 30 stored sessions|
|34|Today/Previous/5/30|✅|UI range selector|
|35|JSON + CSV export|✅|30-session exports; CSV includes v3.5 analytics fields|
|36|Version/schema metadata|✅|`strategyVersion 3.5.0`, `schemaVersion 3.5.0`, signal version|

## Measurement / Shadow only — intentionally does not change real exits
- Price buckets $0–4.99 / $5–9.99 / $10–49.99 / $50–199.99: ✅ logged.
- Pre-T3 STRONG/NEUTRAL/WEAK: ✅ shadow measurement.
- Adaptive target: ✅ shadow only.
- Lowest-before-rally: ✅ analytics only.
- SL widening: **not enabled by design**.
- Post-T3 runner: ✅ measurement only.
- T1/T2/T3 remain +0.6% / +0.8% / +1.0%: ✅.

## Scanner Health Monitor — added in this revision
- LIVE: latest scheduled cycle ≤150 sec during active scanner window.
- DELAYED: 151–300 sec.
- STOPPED: >300 sec/no current cycle during active window.
- Outside active window shows Ready/Market Closed/Waiting/Session Done instead of a false failure.
- Displays last-cycle age, Sharia-universe count, scanned count, source/method/cache status.

## Audit executed
- `node --check` passed for all public JS and Netlify function modules.
- `scripts/audit-v35.mjs` passed all release-critical checks.
- Dynamic-selection unit smoke test passed: no fixed-primary leak, minute batch rotation, <$200 gate, same-setup watch exception.
- Search found no operational v3.3/v3.4 references and no stored `primary-symbols-v27` logic.

## Live-deployment boundary
Code audit cannot simulate Netlify credentials, Halal Terminal quota, Alpaca/Twelve live feeds, Android push delivery, or a real market session. After deployment, the new Scanner Health Monitor + Signal History are the runtime proof. A live failure will show DELAYED/STOPPED rather than being silently treated as working.
