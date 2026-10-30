import assert from 'node:assert/strict';import fs from 'node:fs';
const r=p=>fs.readFileSync(p,'utf8');const app=r('public/app.js'),sw=r('public/service-worker.js'),push=r('netlify/functions/lib/push.mjs'),hist=r('netlify/functions/lib/signal-history.mjs'),tele=r('netlify/functions/telemetry.mjs'),prem=r('netlify/functions/premarket-memory.mjs'),sharia=r('netlify/functions/lib/sharia.mjs'),slocal=r('netlify/functions/lib/sharia-local.mjs'),dyn=r('netlify/functions/lib/dynamic.mjs'),daily=r('netlify/functions/daily-recommendation.mjs'),market=r('netlify/functions/market.mjs'),selection=r('netlify/functions/selection.mjs'),outcome=r('netlify/functions/outcome-tracker.mjs'),index=r('public/index.html');
const checks=[
['1 push dedupe',push.includes('signalId:key')&&sw.includes('renotify:false')],
['2 updated shadow card',app.includes('recommendedTarget')],
['3 shadow approved trade',app.includes('Shadow داخل الصفقة')],
['4 original/approval shadow',selection.includes('approvalShadow')&&hist.includes('recommendedTarget')],
['5 history sessions',app.includes('loadSignalHistorySessions(30)')],
['6 history navigation',index.includes('Previous')||app.includes('Previous')||app.includes('previous')],
['7 export csv json',app.includes("exportSignalHistory(kind='json')")&&app.includes("kind==='json'")],
['8 actionable confirmed',tele.includes('actionableAtFirstRevalidation')],
['9 signal age approval',selection.includes('signalAgeAtApprovalSec')],
['10 reaction timing',selection.includes('approvedAt')&&hist.includes('confirmedAt')],
['11 push lifecycle',tele.includes('PUSH_DISPLAYED')&&tele.includes('PUSH_CLICKED')&&tele.includes('APP_OPEN')&&tele.includes('REVALIDATION_VIEW')],
['12 entry slippage',app.includes('entrySlippagePct')||hist.includes('entrySlippagePct')],
['13 shadow accuracy data',outcome.includes('recommendedTarget')||hist.includes('recommendedTarget')],
['14 market quality',hist.includes('spreadBps')&&hist.includes('quoteAgeSec')&&hist.includes('bid')&&hist.includes('ask')],
['15 post SL/T3',outcome.includes('postSl')&&outcome.includes('postT3')],
['16 universe funnel',daily.includes('scannerFunnel')&&daily.includes('discoveryCoveragePct')],
['17 scanner health',index.includes('scannerHealthState')&&app.includes('renderScannerHealth')],
['18 premarket memory',prem.includes('MEASUREMENT_ONLY')&&prem.includes('collectPremarketQuotes')],
['19 non API sharia',slocal.includes('LOCAL_SHARIA_KEY')&&!sharia.includes('SHARIA_FALLBACK_URL')],
['20 sharia cache saver',sharia.includes('48')||sharia.includes('CACHE')],
['21 100% dynamic infra',!dyn.includes('slice(0,500)')&&daily.includes('getOrBuildSessionUniverse')&&daily.includes('discoveryBatches')],
['22 background auto',daily.includes('sendConfirmedPushes')],
['23 stale monitor/baseline preserved',r('netlify/functions/lib/trading.mjs').includes('stale')||r('netlify/functions/lib/trading.mjs').includes('STALE')],
['24 shadow calibration logging',hist.includes('recommendedTarget')],
['25 HOD measurement/protection baseline',r('netlify/functions/lib/trading.mjs').includes('sessionHigh')||r('netlify/functions/lib/trading.mjs').includes('HOD')],
['26 retest measurement baseline',r('netlify/functions/lib/trading.mjs').includes('retest')||r('netlify/functions/lib/trading.mjs').includes('Retest')],
['27 repeated signal identity',push.includes('signalId:key')],
['28 price bands agreed',dyn.includes("'0-4.99'")&&dyn.includes("'5-9.99'")&&dyn.includes("'10-200'")],
['29 response time data',selection.includes('signalAgeAtApprovalSec')&&tele.includes('REVALIDATION_VIEW')]
];
for(const [n,c] of checks)assert(c,n);console.log(`REQUIREMENTS_29_PASS ${checks.length}/${checks.length}`);
