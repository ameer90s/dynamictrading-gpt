/** Safe read-only public dashboard projection, no credentials or raw minute records. */
export function publicResearchSummary({day,review,local,evidence,budget}={}){
  const status=review?.status||(local?.hypotheses?.length?'LOCAL_RESEARCH_ONLY':'NO_REVIEW');
  return {day,status,mode:'PAPER_ONLY',updatedAt:review?.reviewedAt||local?.generatedAt||null,
      openaiModel:review?.model||null,summary:review?.review?.summary_ar||null,
      usage:review?.usage?{estimatedUsd:review.usage.estimatedUsd,inputTokens:review.usage.input_tokens,outputTokens:review.usage.output_tokens}:null,
      budget:budget?{calls:budget.calls||0,reservedUsd:budget.reservedUsd||0,limitUsd:5}:null,
      evidence:evidence?{status:evidence.readiness?.ok?'READY':(evidence.readiness?.reason||'INCOMPLETE'),
        aiMinutes:evidence.streams?.ai?.storedMinutes??null,scannerMinutes:evidence.streams?.scanner?.storedMinutes??null,
        missingMinutes:(evidence.streams?.ai?.missingMinutes||0)+(evidence.streams?.scanner?.missingMinutes||0)}:null,
      localHypotheses:(local?.hypotheses||[]).slice(0,5).map(x=>({id:x.id,status:x.status,observedFact:x.observedFact,
        hypothesis:x.hypothesis,experiment:x.experiment,acceptanceMetric:x.acceptanceMetric,limitation:x.limitation})),
      experiments:(review?.review?.experiments||[]).slice(0,5).map(x=>({area:x.area,hypothesis_ar:x.hypothesis_ar,
        test_ar:x.test_ar,acceptance_metric_ar:x.acceptance_metric_ar,status:x.status,confidence:x.confidence})),
      canApplyChanges:false,canTrade:false};
}
