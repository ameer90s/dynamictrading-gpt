# DT PULSE 3.8 — Research Background 90-minute recovery — local patch
Date: 2026-11-12. Status: LOCAL ONLY / NOT DEPLOYED / PRODUCTION NOT VERIFIED.

## Implemented
- Four weekday UTC scheduled invocations preserved in count: 22:15 POST; 22:30, 23:00, 23:45 GET-only checks. Netlify now uses two scheduler function entries but four total runs, not additional runs.
- Session background poll deadline extended to 90 minutes; a pending response remains recoverable by the same response ID after the deadline.
- After a successful response-ID persistence, an indexed list of outstanding session days is stored in Netlify Blobs. Before the next day's daily POST, at most one past pending report is retried with GET only. Old pending sessions remain indexed for later daily attempts; completed sessions are pruned.
- No additional OpenAI POST for existing session IDs. Existing fail-closed rules and paper-only restrictions preserved. No phone notifications added.
- The pending index is bounded to the documented 30-day default retention horizon, but availability and provider completion remain unverified.

## Local validation actually executed
- Syntax checks on JS/MJS in netlify, public, scripts: PASS.
- Background lifecycle and recovery tests: 13/13 PASS, including next-day recovery, one GET cap, completed cleanup, and index outage handling.
- test-background372.mjs: PASS (8 checks).
- test-research-openai37.mjs: PASS (19/19).
- test-research-learning-integration37.mjs: PASS (7/7).
- test-38-research-packing.mjs: PASS (5/5).
- test-38-local.mjs: PASS (14/14).
- test-38-cadence.mjs: PASS (23/23).
- test-38-final-gates.mjs: PASS (10/10).
- test-netlify-routing37.mjs, test-372-invariants.mjs: PASS.

## Limitations / operational risks
- NOT VERIFIED: production Netlify scheduler, OpenAI API key/model and vendor response completion, API retention for this account, UI integration after deploy, end-to-end live local runtime; full npm test requires @netlify/blobs to be installed in the local environment.
- A storage failure while creating the recovery index is logged and prevents automatic next-day recovery for that record; the response ID remains saved in existing review state, and a manual recovery path may still be necessary. Do not claim guaranteed recovery in a storage outage.
- No guarantee of unchanged Netlify Credits: scheduled invocation count is unchanged (four), but extra Blob index reads/writes and a daily GET for an older pending report consume resources.
- The patch has not been independently verified by an external audit service. Tests are local simulations.
- A single recovery GET can happen only on the 22:15 run, not all four. On a persistent outage it retries on subsequent weekdays, with no new provider POST.
- All deploy, GitHub and Netlify settings are unchanged. Deployment requires explicit separate authorization and release gates.
