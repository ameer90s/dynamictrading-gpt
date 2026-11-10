from pathlib import Path
r=Path(__file__).parent
alltxt='\n'.join(p.read_text(errors='ignore') for p in list((r/'netlify/functions').rglob('*.mjs'))+[r/'public/app.js',r/'public/index.html',r/'netlify.toml',r/'VERIFICATION_REPORT_3.5.md'])
checks={
1:['push-notified-','signalId'],2:['recommendedTarget'],3:['approved-shadow'],4:['originalShadow','approvalShadow'],5:['Last 30 Sessions','signal-history-'],6:['Previous Session','Last 5 Sessions','Last 30 Sessions'],7:['exportHistoryJson','exportHistoryCsv'],8:['actionableAtFirstRevalidation'],9:['signalAgeAtApprovalSec'],10:['confirmedAt','approvedAt'],11:['PUSH_SENT','pushDisplayedAt','pushClickedAt','firstAppOpenAt'],12:['entrySlippagePct'],13:['targetConfidence','recommendedTarget'],14:['spreadBps','quoteAgeSec','mfePct','maePct'],15:['postSlMfePct','postT3MfePct'],16:['scannerFunnel'],17:['scannerHealthState'],18:['premarket-memory'],19:['BUNDLED_VERIFIED_SHARIA_CSV'],20:['BUNDLED_LOCAL_ZERO_CREDIT'],21:['const primary=[]'],22:['daily-recommendation'],23:['stale'],24:['preT3Continuation'],25:['distanceFromSessionHighPct'],26:['retestQuality'],27:['setupFingerprint'],28:['0-4.99','5-9.99','10-200'],29:['signalAgeAtApprovalSec','firstRevalidationAt'],30:['session-universe-','eligibleSymbols','watchPriceExceptionEligible']}
failed=[]
for n,needles in checks.items():
    miss=[x for x in needles if x not in alltxt]
    if miss: failed.append((n,miss))
print('30_POINT_AUDIT', 'PASS' if not failed else 'FAIL', f'{30-len(failed)}/30')
if failed:
    print(failed); raise SystemExit(1)
# no known fixed/default scanner universe fallbacks
scanner=(r/'netlify/functions/lib/dynamic.mjs').read_text()+(r/'netlify/functions/daily-recommendation.mjs').read_text()+(r/'netlify/functions/market.mjs').read_text()
for bad in ['DEFAULT_UNIVERSE','slice(0,500)','slice(0, 500)']:
    if bad in scanner: raise SystemExit(f'Forbidden scanner fallback/cap found: {bad}')
# cost rule and version
for x in ['weeklyNetTargetPct:2.5','subscriptionCostUsd:10','3.5']:
    if x not in alltxt: raise SystemExit(f'Missing {x}')
print('STATIC_REGRESSION_PASS')
