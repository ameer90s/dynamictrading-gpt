/** Report structure QA only. Predictive validity requires independent future results. */
export function reportStructureQuality38({review=null,source=null}={}){
 const summary=String(review?.summary_ar||review?.summary||'');const observations=Array.isArray(review?.observations)?review.observations:[];
 const experiments=Array.isArray(review?.experiments)?review.experiments:[];
 const evidenceLinked=observations.filter(x=>Array.isArray(x.evidence_ids)&&x.evidence_ids.length).length;
 const testable=experiments.filter(x=>String(x.test_ar||'').length>15&&String(x.acceptance_metric_ar||'').length>8).length;
 const metrics=[{name:'ARABIC_SUMMARY_PRESENT',pass:summary.length>=80},{name:'OBSERVATIONS_PRESENT',pass:observations.length>0},{name:'EVIDENCE_CITATIONS_PRESENT',pass:evidenceLinked>0},{name:'TESTABLE_EXPERIMENTS_PRESENT',pass:testable>0},{name:'UNCERTAINTIES_PRESENT',pass:Array.isArray(review?.uncertainties_ar)&&review.uncertainties_ar.length>0}];
 const allowedIds=new Set(Array.isArray(source?.evidenceIndex)?source.evidenceIndex:[]);
 const citations=observations.flatMap(x=>Array.isArray(x.evidence_ids)?x.evidence_ids:[]);
 const sourceGrounding=allowedIds.size ? {status:citations.length&&citations.every(id=>allowedIds.has(id))?'MATCHED_SOURCE_INDEX':'UNSUPPORTED_CITATION',citations:citations.length,sourceIds:allowedIds.size} : {status:'NOT_VERIFIED_NO_SOURCE_INDEX',citations:citations.length,sourceIds:0};
 const completed=metrics.filter(x=>x.pass).length;
 return {status:review?'STRUCTURAL_QA_ONLY':'NO_PAID_REVIEW',source:typeof source==='string'?source:null,sourceGrounding,scorePct:review?Math.round(completed/metrics.length*100):null,metrics,predictiveAccuracy:'NOT_VERIFIED',strategyImprovement:'NOT_VERIFIED',independentAudit:'NOT_VERIFIED'};
}
