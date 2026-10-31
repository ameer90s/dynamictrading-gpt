# Dynamic Trading 3.7 — Corrected local build (not yet live-verified)

## Corrections made
- Every attempted scanner symbol missing a completed result now has an explicit UNRESOLVED/ATTEMPTED_NO_RESULT row; coverage completed count is kept separate from unresolved rows.
- Per-minute CSV export includes a NO_CANDIDATES row for archived minutes with zero symbols, rather than silently omitting the minute.
- Export defaults to the full 390-minute window when `format=csv` or `format=json` is selected; explicit `minutes=` still overrides it.
- CSV includes eligibleCount, attemptedSymbols, feedErrors, transitions, closedNew, recommendations when present.
- Regression assertion updated for the expanded audit semantics.

## Verified
- Full local npm test: exit 0 (see DT37_FIX_TEST.log).
- Historical replay is fixture-based; AI historical replay has zero confirmations with authentic bid/ask, because original historical quotes are not available.

## Not verified / outstanding
- Actual persistence/retrieval on deployed Netlify Blobs; provider credentials and running environment not available here.
- End-to-end live Alpaca quotes, notifications, real Monday session.
- Raw September–October Alpaca ZIP is not mounted; cannot honestly claim a complete two-month minute replay.
- This is NOT a verified solution to the zero-CONFIRMED issue or a final production signoff.

Paper-only. No brokerage execution.
