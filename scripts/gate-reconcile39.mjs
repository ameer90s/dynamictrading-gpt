/** Offline-only research reconciliation. Inputs are exported JSON, never Netlify credentials. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {reconcileResearch39,attachForwardOutcomes39,summarizeGateEvidence39,gateOutcomeMatrix39} from '../netlify/functions/lib/gate-evidence39.mjs';
const args=process.argv.slice(2);if(args.length!==2){console.error('Usage: node scripts/gate-reconcile39.mjs <exported-evidence.json> <output.json>');process.exit(2)}
const [source,dest]=args.map(x=>resolve(x));const d=JSON.parse(readFileSync(source,'utf8'));
if(!Array.isArray(d.scannerAudits)||!Array.isArray(d.researchRecommendations)||!Array.isArray(d.positions)||!d.barsByDaySymbol||typeof d.barsByDaySymbol!=='object')throw Error('EVIDENCE39_INVALID_INPUT');
const scans=d.scannerAudits.flatMap(doc=>{
 if(!/^20\d\d-\d\d-\d\d$/.test(doc?.day||'')||!Number.isInteger(doc?.minute)||!Array.isArray(doc?.records))throw Error('EVIDENCE39_INVALID_ARCHIVE');
 return doc.records.map(row=>({...row,day:doc.day,minute:doc.minute,
  decisionAt:doc.decisionAt||doc.storedAt||null}));
});
const linked=reconcileResearch39({scannerRows:scans,researchRows:d.researchRecommendations,positionRows:d.positions});
const followed=attachForwardOutcomes39(scans,d.barsByDaySymbol,{roundTripCostBps:20});
const unmatchedResearch=linked.filter(x=>x.matchStatus!=='EXACT_MINUTE').length;
const verifiedHorizons=followed.flatMap(x=>Object.values(x.followUp?.outcomes||{})).filter(x=>x.status==='SIMULATED_MARK_TO_MARKET').length;
const report={schema:'DT39_EVIDENCE_AUDIT_V1',provenance:'OFFLINE_EXPORTED_DATA',computedAt:new Date().toISOString(),
 scannerRows:scans.length,researchRows:linked.length,positionRows:d.positions.length,
 rawGateSummary:summarizeGateEvidence39(scans),gateOutcomeMatrix60m:gateOutcomeMatrix39(followed,{horizon:60}),researchReconciliation:linked,forwardFollowUp:followed,
 qualityGates:{scannerArchivesAvailable:d.scannerAudits.length>0,unmatchedResearch,verifiedSimulatedHorizons:verifiedHorizons,
  liveBrokerFillsVerified:false,netlifyReadVerified:false,allRequiredEvidenceVerified:false},
 restrictions:['No research report is an executable signal','A missing archive is not evidence of zero signals','Minute and day matching required','OHLCV returns are simulated, not broker fills','Do not change trading thresholds based on these data alone','Gate comparisons use observed checks only and may contain repeated ticker-minute observations; not independent cases']};
writeFileSync(dest,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({scannerRows:scans.length,researchRows:linked.length,unmatchedResearch,verifiedSimulatedHorizons:verifiedHorizons,allRequiredEvidenceVerified:false}));
