/**
 * DT 3.7: deterministic, source-attributed daily learning above BOTH independent scanners.
 * Aggregates EVERY recorded reason/gate (not just selected LLM case studies).
 * Proposes versioned PAPER-ONLY strategy variants for tests and manual approval.
 * No broker calls, deploys, parameter mutation, or automatic strategy activation.
 */
import {createHash} from 'node:crypto';
import {marketTimestamp372} from './market-time372.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const integer=x=>Number.isInteger(x)&&x>=0?x:0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const round=x=>Math.round(x*1000)/1000;
const id=x=>String(x??'').replace(/[^A-Za-z0-9_:\-.]/g,'').slice(0,90);
const tidy=x=>String(x??'').trim().slice(0,480);
const AREA_SET=new Set(['DISCOVERY','CONFIRMATION','RETEST','COSTS_SPREAD','EXECUTION','EXIT_SHADOW','DATA_INGESTION','COVERAGE','RISK_GATES','AUDIT_RETENTION']);
const riskReadOnly=Object.freeze(['PAPER_ONLY','NO_AUTOMATIC_STRATEGY_APPLICATION','NO_BROKER_ORDERS','NO_RISK_GATE_WEAKENING','SHARIA_UNCHANGED','NO_NETLIFY_DEPLOY']);
const totals=(list)=>(Array.isArray(list)?list:[]).reduce((acc,x)=>{if(typeof x?.name==='string'&&integer(x.count)>0){const key=id(x.name);acc[key]=(acc[key]||0)+x.count;}return acc;},{});
const countMatches=(obj,regex)=>Object.entries(obj).reduce((v,[key,n])=>v+(regex.test(key)?n:0),0);
const closedAsOf=(iso,day,at)=>{if(typeof iso!=='string'||!/^20\d{2}-\d\d-\d\d/.test(iso)||iso.slice(0,10)>day)return false;
 const stamp=marketTimestamp372(iso),cutoff=marketTimestamp372(at);return stamp!==null&&cutoff!==null&&stamp<=cutoff;};
function scannerTrades(history,day,now){
 const out=[],seen=new Set();
 for(const rec of Object.values(history?.signals||{}))for(const s of rec?.confirmedSignals||[]){
  const key=s.signalId||`${rec.symbol}:${s.confirmedAt}`;
  if(seen.has(key)||!closedAsOf(s.closedAt,day,now))continue;
  seen.add(key);
  if(!['T1','T2','T3','SL','EXPIRED','AMBIGUOUS'].includes(s.finalOutcome))continue;
  out.push({id:id(key),outcome:s.finalOutcome,ambiguous:!!s.ambiguous,
   // Scanner target touches are not executable P&L.
   outcomeType:'SHADOW_TARGET_TOUCH_NOT_REAL_FILL'});
 }
 return out;
}
function aiTrades(states,day,now){
 const rows=[],seen=new Set();
 for(const state of states)for(const p of [...Object.values(state?.records||{}).map(x=>x?.position),...(state?.closedOutcomes||[])]){
  if(!p||p.status!=='CLOSED'||!closedAsOf(p.closedAt,day,now))continue;
  const key=p.id||`${p.symbol}:${p.openedAt}`;
  if(seen.has(key))continue;seen.add(key);
  rows.push({id:id(key),outcome:id(p.outcome),setupType:id(p.setupType),
   netUsd:finite(p.netUsd)?p.netUsd:null,outcomeType:'PAPER_PROJECTION_NOT_BROKER_FILL'});
 }
 return rows;
}
export function observedMistakes37(audit,day,{expectedMinutes=390}={}){
 if(!/^20\d{2}-\d\d-\d\d$/.test(day||'')||audit?.dateKey!==day||!audit?.streams?.scanner||!audit?.streams?.ai)
  throw Error('LEARNING_AUDIT_IDENTITY_MISMATCH');
 const engines={};
 for(const engine of ['scanner','ai']){
  const a=audit.streams[engine];
  // reasonCountsAll/failedGatesAll are built from EVERY row in the seven minute-ledger shards.
  const reasons=totals(a.reasonCountsAll||a.reasonCounts);
  const gates=totals(a.failedGatesAll||a.failedGates);
  const missing=integer((a.missingMinutes||[]).filter(m=>m>=570&&m<570+expectedMinutes).length), failed=integer(a.failedCycles);
  const invalid=integer(a.quote?.invalid),stale=integer(a.quote?.stale);
  const wide=integer(a.quote?.wide),unavailable=integer(a.quote?.missing);
  engines[engine]={observedRows:integer(a.attemptedRows),observedMinutes:integer(a.storedMinutes),
   expectedMinutes,missingMinutes:missing,failedCycles:failed,recordedErrorItems:integer(a.errors),errorDetailsTruncated:integer(a.truncatedErrorDetails),
   reasons,gates,unclassifiedReasons:Object.keys(reasons).filter(k=>!/(WAIT|CONFIRMED|PAPER|SMART|TARGET|HIT|RETEST|OPEN|MOMENTUM|SPREAD|QUOTE|CANDLE|BAR|LIQUID|VOLUME|SHARIA|NO_|UNAPPROVED|WEAK|PRICE|HOD|ATR|RISK|EXPIRED|STALE|DATA|FEED|TIME|EARLY|REGULAR|PENDING|STOP|EXIT|BEFORE|AFTER|ERROR|RANGE|MARKET)/i.test(k)),
   quote:{unavailable,invalid,stale,wide},
   lossProxy:countMatches(reasons,/\bSTOP\b|\bSL\b/i),
   gapIsNotZeroOpportunity:missing>0};
 }
 return {schemaVersion:'3.7-OBSERVED-ERRORS-2',day,sourceDigest:audit.sourceDigest,
  engines,crossScanner:{...audit.comparison},
  guarantee:'ALL_RECORDED_LEDGER_REASON_AND_FAILED_GATE_COUNTS_EVALUATED',
  limitations:['Unrecorded/missing minutes and uncaptured external failures cannot be learned from',
   'A gate rejection is not necessarily a mistake or missed profitable trade',
   'Full individual rows are archived separately; aggregation preserves counts, not every row in this report',
   'Same-minute different-scanner trades must not be compared without comparable quotes']};
}
function variantTemplate(area,engine,policy){
 const both=engine==='BOTH';
 const base=policy?.params?.maxSpreadBps;
 // Constrained draft proposals: tightening a risk gate, never loosening it.
 if(area==='COSTS_SPREAD'||area==='EXECUTION')return {
  kind:'TIGHTER_EXECUTION_GATES',target:engine,
  scanner:both||engine==='SCANNER'?{maxSpreadBps:{from:12,to:10.8}}:null,
  ai:both||engine==='AI'?{maxSpreadBps:{from:finite(base)?base:null,to:finite(base)?round(base*.9):null,rule:'MULTIPLY_BASELINE_BY_0.90'}}:null,
  applicability:'SIMULATION_ONLY_NO_CONFIG_PATCH'};
 if(area==='DISCOVERY'||area==='RETEST')return {kind:'ADDITIONAL_CANDIDATE_RESEARCH',target:engine,
  setups:['BREAKOUT_CONTINUATION','VWAP_RECLAIM','RANGE_REVERSAL'],
  applicability:'DETECTOR_REPLAY_ONLY_NO_ORDER_PATH'};
 if(area==='RISK_GATES'||area==='EXIT_SHADOW')return {kind:'PAPER_RISK_COMPARISON',target:engine,
  rules:['BASELINE_SHADOW_VS_CONSERVATIVE_TRAILING_EXIT','NO_HIGHER_CASH_RISK'],
  applicability:'INDEPENDENT_SHADOW_REPLAY_REQUIRED'};
 if(area==='DATA_INGESTION'||area==='COVERAGE'||area==='AUDIT_RETENTION')return {kind:'DATA_QUALITY_EXPERIMENT',target:engine,
  rules:['KEEP_SAME_UNIVERSE','MEASURE_MISSING_ROWS','NO_RISK_RELAXATION'],
  applicability:'TEST_WITHOUT_PAID_PROVIDER_BY_DEFAULT'};
 return {kind:'ASOF_REPLAY_COMPARISON',target:engine,
  rules:['FREEZE_BASELINE','NET_AFTER_COSTS','RISK_NON_INFERIORITY'],
  applicability:'REPLAY_ONLY'};
}
function makeProposal({day,area,engine,observed,source,sourceIds,policy,variantKey}){
 const fingerprint=sha([area,engine,variantKey||source]).slice(0,20);
 return {id:`DT37_PROP_${fingerprint}`,fingerprint,firstSeenDay:day,lastSeenDay:day,seenDays:[day],
  engines:engine==='BOTH'?['SCANNER','AI']:[engine],area,
  hypothesis_ar:tidy(observed),source,sourceIds:sourceIds.map(id),
  candidateStrategy:variantTemplate(area,engine,policy),
  proposedDevelopment:'AUTO_GENERATED_CANDIDATE_VARIANT_NOT_PRODUCTION_PATCH',
  acceptanceCriteria:{baseline:'FROZEN_3_7',asOfReplay:true,walkForward:true,
   netAfterCostsPositive:true,riskNotWorse:true,coverageNotWorse:true,independentReview:true,
   minimumIndependentSampleSize:60,actualEvidenceRequired:true},
  testResult:'NOT_VERIFIED',independentAudit:'NOT_VERIFIED',
  approvalStatus:'AWAITING_TEST_EVIDENCE',approvedBy:null,approvedAt:null,
  applied:false,canDeploy:false,canTrade:false,safetyInvariants:riskReadOnly};
}
function deterministicHypotheses(learn,day,policy){
 const proposals=[];
 for(const [engine,report] of Object.entries(learn.engines)){
  const e=engine==='scanner'?'SCANNER':'AI',ref=`${engine}:${day}:${learn.sourceDigest}`;
  if(report.missingMinutes||report.failedCycles||report.recordedErrorItems||report.quote.unavailable||report.quote.invalid)
   proposals.push(makeProposal({day,area:'DATA_INGESTION',engine:e,source:'RECORDS',sourceIds:[ref],policy,
    observed:`فجوات ${report.missingMinutes}، دورات فاشلة ${report.failedCycles}، أخطاء حفظ ${report.recordedErrorItems}، اقتباسات مفقودة ${report.quote.unavailable}.`,variantKey:'DATA_QUALITY'}));
  const spread=countMatches(report.reasons,/SPREAD/i)+countMatches(report.gates,/SPREAD/i);
  if(spread>0||report.quote.wide)proposals.push(makeProposal({day,area:'COSTS_SPREAD',engine:e,source:'RECORDS',sourceIds:[ref],policy,
   observed:`رُصدت ${spread} حالات سبريد في سجل الأسباب والبوابات (قد تتداخل) و${report.quote.wide} سعراً واسعاً؛ اختبر تشديد الحد دون افتراض وجود فرص ضائعة.`,variantKey:'SPREAD_GATE'}));
  if(report.lossProxy>0)proposals.push(makeProposal({day,area:'RISK_GATES',engine:e,source:'RECORDS',sourceIds:[ref],policy,
   observed:`رُصدت ${report.lossProxy} إشارات STOP/SL في أسباب التقييم؛ تحتاج مطابقة بسجلات الصفقات المغلقة قبل الاستنتاج.`,variantKey:'LOSS_DIAGNOSTICS'}));
 }
 if(learn.crossScanner?.disagreeState>0)proposals.push(makeProposal({day,area:'CONFIRMATION',engine:'BOTH',source:'PAIRED_MINUTES',sourceIds:[`DT37_${day}`],policy,
  observed:`اختلاف حالات ${learn.crossScanner.disagreeState} في دقائق ورموز متطابقة؛ التحليل السببي يحتاج أسعاراً وأوقاتاً متزامنة.`,variantKey:'CROSS_SCANNER_DIFFERENCE'}));
 return proposals;
}
function validateOpenAi(review,day){
 return review?.status==='REVIEW_CREATED_NOT_APPLIED'&&review?.day===day&&Array.isArray(review?.review?.experiments);
}
export function generateStrategyLearningCycle37({day,audit,aiState={},scannerHistory={},pastAiStates=[],pastScannerHistories=[],previousCycles=[],openaiReview=null,now=null,expectedMinutes=390}={}){
 const mistakes=observedMistakes37(audit,day,{expectedMinutes});
 const priorAi=aiTrades([aiState,...pastAiStates],day,now),priorScanner=[scannerHistory,...pastScannerHistories].flatMap(x=>scannerTrades(x,day,now));
 const historical={ai:{closedUnique:priorAi.length,withNetUsd:priorAi.filter(p=>p.netUsd!=null).length,
   netPaperUsd:round(priorAi.reduce((a,p)=>a+(p.netUsd||0),0)),
   losses:priorAi.filter(p=>p.netUsd!=null&&p.netUsd<0).length,
   perSetup:Object.fromEntries([...new Set(priorAi.map(p=>p.setupType))].sort().filter(Boolean).map(k=>[k,{count:priorAi.filter(x=>x.setupType===k).length,meanNetUsd:round(priorAi.filter(x=>x.setupType===k).reduce((a,p)=>a+(p.netUsd||0),0)/priorAi.filter(x=>x.setupType===k).length)}]))},
  scanner:{closedUnique:priorScanner.length,outcomes:Object.fromEntries([...new Set(priorScanner.map(p=>p.outcome))].sort().map(k=>[k,priorScanner.filter(x=>x.outcome===k).length])),
   realFillPnLAvailable:false},source:'CLOSED_AS_OF_POSTCLOSE_REPORT_TIME_NO_FUTURE_OUTCOMES',historyDepth:{aiSessions:1+pastAiStates.length,scannerSessions:1+pastScannerHistories.length}};
 // Scalp history remains in archival readers only, never in active proposals.
 let proposals=deterministicHypotheses(mistakes,day,aiState?.lastPolicy);
 if(validateOpenAi(openaiReview,day)){
  const acceptedIds=new Set([`DT37_${day}`,...(openaiReview.review?.observations||[]).flatMap(x=>x.evidence_ids||[])
   .filter(v=>typeof v==='string'&&new RegExp(`^(?:scanner|ai):${day}:\\d{4}:[A-Za-z0-9._-]+$`).test(v))]);
  for(const exp of openaiReview.review.experiments){
   if(!AREA_SET.has(exp.area)||!Array.isArray(exp.evidence_ids)||!exp.evidence_ids.some(e=>acceptedIds.has(e)))continue;
   const obs=exp.hypothesis_ar;
   // REVIEW data are untrusted suggestions, never instructions or executable code.
   proposals.push(makeProposal({day,area:exp.area,engine:'BOTH',source:'OPENAI_REVIEW',
    sourceIds:exp.evidence_ids.filter(e=>acceptedIds.has(e)),observed:obs,policy:aiState?.lastPolicy,
    variantKey:`OPENAI_${exp.area}_${sha(tidy(obs)).slice(0,12)}`}));
  }
 }
 const oldById=new Map(previousCycles.flatMap(x=>x?.proposals||[]).filter(x=>x?.id).map(x=>[x.id,x]));
 const today=new Map();
 for(const p of proposals){const old=oldById.get(p.id);
  today.set(p.id,old?{...p,firstSeenDay:old.firstSeenDay||p.firstSeenDay,
   seenDays:[...new Set([...(old.seenDays||[]),day])].slice(-30),
   // Approval/evaluation evidence is never fabricated by the daily learner.
   testResult:old.testResult==='PASS_INDEPENDENTLY_VERIFIED'?'NOT_VERIFIED':p.testResult,
   approvalStatus:'AWAITING_TEST_EVIDENCE',applied:false,approvedBy:null,approvedAt:null}:p);
 }
 // Retain older pending proposals even when the same issue was not observed today.
 // No observed error is not proof of resolution when audit coverage is incomplete.
 for(const previous of previousCycles.slice().sort((a,b)=>String(b.day).localeCompare(String(a.day)))){
  for(const old of previous?.proposals||[]){
   if(today.size>=40)break;
   if(old?.id&&!today.has(old.id)&&old.applied!==true&&old.approvedBy==null&&old.canTrade!==true)
    today.set(old.id,{...old,approvalStatus:'AWAITING_TEST_EVIDENCE',testResult:'NOT_VERIFIED',
     independentAudit:'NOT_VERIFIED',approvedBy:null,approvedAt:null,applied:false,canTrade:false,
     canDeploy:false,notObservedToday:true});
  }
 }
 const last=previousCycles.filter(x=>x?.day<day&&x?.cumulative)
   .sort((a,b)=>String(b.day).localeCompare(String(a.day)))[0];
 const cumulative={daysObserved:(last?.cumulative?.daysObserved||0)+1,throughDay:day,
  priorTrackingAvailable:!!last,engines:{}};
 for(const engine of ['scanner','ai']){
  const p=last?.cumulative?.engines?.[engine]||{},q=mistakes.engines[engine];
  const reasons={...(p.reasons||{})},gates={...(p.gates||{})};
  for(const [k,n] of Object.entries(q.reasons))reasons[k]=(reasons[k]||0)+n;
  for(const [k,n] of Object.entries(q.gates))gates[k]=(gates[k]||0)+n;
  cumulative.engines[engine]={recordedRows:(p.recordedRows||0)+q.observedRows,
   missingMinutes:(p.missingMinutes||0)+q.missingMinutes,
   failedCycles:(p.failedCycles||0)+q.failedCycles,reasons,gates};
 }
 const coverageOk=Object.values(mistakes.engines).every(x=>x.missingMinutes===0&&x.failedCycles===0&&x.observedMinutes>=expectedMinutes);
 const cycle={schemaVersion:'3.7-RESEARCH-STRATEGY-CYCLE-1',day,generatedAt:now,
  sourceDigest:audit.sourceDigest,recordedEvidenceComplete:coverageOk,cumulative,
  scannerMistakes:mistakes.engines.scanner,aiMistakes:mistakes.engines.ai,
  crossScanner:mistakes.crossScanner,historical,openai:{status:openaiReview?.status||'NOT_AVAILABLE',
   included:validateOpenAi(openaiReview,day),reviewId:openaiReview?.id||null},
  proposals:[...today.values()].slice(0,40),
  approvalQueueStatus:'SUGGESTIONS_ONLY_NO_AUTOMATIC_APPROVAL',
  learnedFrom:'ALL_RECORDED_REASON_GATE_COUNTS_PLUS_PRIOR_CLOSED_OUTCOMES',
  unobservedErrorsCovered:false,causalImprovementVerified:false,independentBacktestVerified:false,
  canAutoApply:false,canTrade:false,canDeploy:false,policy:riskReadOnly,
  limitations:[...mistakes.limitations,'A daily report proposes testable variants; it does not prove a profitable autonomous strategy',
   'External reviewer and live environment have not been verified by local tests']};
 return {...cycle,digest:sha([cycle.sourceDigest,cycle.proposals.map(x=>x.id),historical,cycle.openai])};
}
