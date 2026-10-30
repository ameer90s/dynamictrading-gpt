# Dynamic Trading 3.5 — Verification Report

## Scope
Approved improvement batch #34–#42, built from the latest SMART Watch baseline while renumbering the active release line to 3.5.

## Implemented
- #34 Full-universe coverage accounting: attempted/successful/failed, Alpaca 429/5xx retry with backoff, quote-batch retry, coverage percentage and failed symbols.
- #35 CONFIRMED delivery integrity: CREATED/SAVED, PUSH_ATTEMPTED, PUSH_ACCEPTED/PUSH_SENT, provider failures, client DISPLAYED/CLICKED/APP_OPEN/REVALIDATION telemetry.
- #36 Quality instrumentation: market regime, index alignment, relative strength, entry/setup/retest/MTF/RVOL/chase/spread context captured for outcome analysis. No unsupported threshold change was introduced from one week of evidence. Sector alignment is explicitly UNAVAILABLE until a trustworthy sector feed/mapping is supplied.
- #37 NEW_SETUP vs REPEAT_SAME_SETUP classification and occurrence count.
- #38 Stale protection: 180-second regular-session freshness gate, STALE — DO NOT TRADE UI, non-JSON response protection, last successful analysis/data age, and server-side stale approval rejection.
- #39 Legacy cleanup: operational OKLO references removed; Market Pro symbol is explicitly read from request with SPY fallback; active code uses version 3.5.
- #40 AI Trade Quality Shadow: monitoring-only contextual shadow record with independent Entry/T1/T2/T3/SL, quality and reasons. It does not alter scanner state/targets. This local shadow is deterministic; no paid external LLM call is silently enabled.
- #41 30-session persistence: persistent session index plus backward-compatible historical-key recovery; export continues to request 30 actual stored sessions.
- #42 Unified active version: Dynamic Trading 3.5 across active UI, scanner records, telemetry, push payloads, session universe and exports.
- Scanner Health 2.0 fields: attempted/scanned/failed/retried/coverage, last successful analysis/discovery, endpoint state, SMART and CONFIRMED counts.

## Local verification
- Syntax: PASS
- Functional suite: PASS
- 30-point audit: 30/30 PASS
- Requirements regression: 29/29 PASS
- v3.5 audit: PASS
- Dynamic coverage audit: 6/6 PASS
- Delivery stress: 12/12 PASS
- New #34–#42 tests: 24/24 PASS
- Repeated intensive loop: 10/10 PASS (improvements + full-universe + delivery stress each iteration)
- Operational legacy grep: no OKLO / 4.5.1 references in netlify/, public/, package.json or netlify.toml

## LIVE REQUIRED — not claimed as locally verified
- Real Alpaca rate-limit recovery under production limits and 100% session coverage.
- Netlify scheduled-function cadence and recovery from real HTML/non-JSON platform responses.
- Real Web Push provider acceptance → device display/click lifecycle.
- Cross-day Netlify Blobs persistence/export across 30 real U.S. trading sessions.
- Profitability effect of #36 and accuracy of #40 shadow versus real outcomes.

## Delivery gate
Code Audit: PASS
Functional Test: PASS
Regression Test: PASS
Intensive Local Stress: PASS
Live-dependent items: explicitly classified above.

## Recovery Patch #43–#50 — SMART → CONFIRMED (2026-10-26)

### Implemented
- #43 Dynamic SMART Focus Queue: persistent watch retains every SMART; Top 12 receives heavy per-cycle revalidation.
- #44 Momentum/HOD/Chase logic fix: family-specific chase limits preserved; strong Momentum Continuation can use the agreed HOD exception; ordinary near-HOD setups remain SMART.
- #45 Discovery SMART seeding: SMART candidates discovered before 10:10 are persisted instead of discarded.
- #46 Spread-source logic: IEX-only spread is not treated as consolidated NBBO and cannot alone hard-reject an otherwise liquid setup; consolidated SIP/NBBO remains eligible for hard spread protection.
- #47 SMART→CONFIRMED diagnostics: blocker counters for HOD, chase, retest, spread, confidence, momentum, trigger, liquidity, stale quote and other.
- #48 Focus Priority Engine: near-confirmed state, momentum family, confidence, setup/retest, RVOL, RS, room, execution quality, freshness and direction of improvement.
- #49 Rolling promotion/demotion: ranking is recomputed; candidates outside Top 12 remain persistent and can promote on later discovery/update.
- #50 Focus effectiveness logging: focus rank/tier/score is retained and Signal History snapshots carry rank/tier/score for later 1–5 / 6–12 / 13–20 / 21+ analysis.

### Preserved intentionally
- HOD protection remains enabled for ordinary setups.
- Retest 65 secondary protection remains under observation; it was not relaxed.
- Active Confidence/RVOL thresholds were not reduced.
- T1/T2/T3/SL were not changed.
- Full dynamic Sharia universe remains; Top 12 is analysis priority only, never an eligibility cap.

### Local verification
- Full npm test suite: PASS.
- 30-point audit: PASS 30/30.
- Requirements regression: PASS 29/29.
- v3.5 audit: PASS 15/15 + historical audit 11/11 + dynamic coverage 6/6.
- v3.5 improvements: PASS 24/24.
- SMART Focus recovery scenarios: PASS 16/16.
- Intensive repeated focus/full-universe/delivery loops: PASS 5/5.
- Randomized Focus Queue preservation/ranking stress: PASS 250/250.

### LIVE REQUIRED (not claimed as locally verified)
- Actual production SMART→CONFIRMED conversion rate after deployment.
- Whether Top 12 is empirically optimal versus 10/15; rank buckets must be evaluated across real sessions.
- Real IEX quote behavior and execution quality during production market conditions.
- Netlify scheduled cadence and credit consumption under the new Focus Queue.
- Real Push/device delivery and 30-session Blob persistence remain Live-dependent as previously documented.
