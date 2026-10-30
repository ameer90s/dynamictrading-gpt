# Dynamic Trading v3.5 — Final Verified Revision

- Removed fixed/privileged primary-stock scanner path.
- Scanner now starts from verified AAOIFI Sharia universe; manual symbols are review-only.
- Fixed `/api/latest` to accept v3.5 so open UI receives background SMART→CONFIRMED updates.
- Background scheduled scan remains independent of manual Force Refresh.
- Scanner Learning migrated to v3.5 storage/model labels; no v3.3 learning key is used.
- Added Scanner Health Monitor (LIVE / DELAYED / STOPPED / market-closed states).
- Added Ask execution gate at approval.
- Fixed fresh re-confirmation to create a fresh Signal ID.
- Expanded CSV export with v3.5 analytics fields.
- Preserved T1/T2/T3 at +0.6/+0.8/+1.0 and kept adaptive targets/Pre-T3/post-T3 as Shadow/measurement only.
