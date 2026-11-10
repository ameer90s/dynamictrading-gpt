/** Bounded evidence-first, always-local post-close research digest.
 * No OpenAI, broker or market-data network. A failure/missing shard is never
 * described as a quiet market or a zero-opportunity minute.
 */
import {createHash} from 'node:crypto';
import {combineLedgerShards,ledgerKey,researchHours,summarizeDailyLedger} from './research-ledger37.mjs';
import {marketSession} from './time.mjs';
export const dailyResearchKey37=day=>`dt37-research-daily-diagnostic-${day}`;
const integer=x=>Number.isInteger(x)&&x>=0?x:0;
const text=x=>String(x??'').slice(0,100);
export function researchExpectedMinutes37(env={},day=null){
 // Unified pre-close discovery window: 330m normal / 150m early close.
 // Explicit overrides remain available only for testing/rollback.
 const v=Number(env.DT37_RESEARCH_EXPECTED_MINUTES);
 if([150,330,390].includes(v))return v;
 if(day&&/^20\d{2}-\d{2}-\d{2}$/.test(day)){
  const market=marketSession(new Date(`${day}T17:00:00Z`));
  return Math.max(0,market.regularCloseMinute-60-570);
 }
 return 330;
}
export function buildDailyDiagnostic37({day,scanner=null,ai=null,now=new Date(),expectedMinutes=330,readErrors=[]}={}){
 if(!/^20\d{2}-\d\d-\d\d$/.test(day||''))throw Error('BAD_RESEARCH_DAY');
 const summarize=(kind,ledger)=>{
  if(!ledger)return {status:'NOT_RECORDED',storedMinutes:null,expectedMinutes,missingMinutes:null,
    failedCycles:null,observations:null,topReasons:[],dataGapIsNotZeroSignals:true};
  const sum=summarizeDailyLedger(ledger);
  const end=570+expectedMinutes;
  const stored=Object.keys(ledger.minutes||{}).map(Number).filter(n=>n>=570&&n<end).length;
  const misses=(sum.missingMinutes||[]).filter(n=>n>=570&&n<end);
  return {status:readErrors.length?'READ_ERRORS_PRESENT':stored>=expectedMinutes&&sum.failedCycles===0?'FULL_WINDOW_RECORDED':'PARTIAL_WINDOW',
   storedMinutes:stored,expectedMinutes,missingMinutes:misses.length,failedCycles:integer(sum.failedCycles),
   observations:integer(sum.attemptedRows),topReasons:(sum.reasonCounts||[]).slice(0,5).map(x=>({reason:text(x.name),count:integer(x.count)})),
   quoteQuality:{valid:integer(sum.quote?.valid),missing:integer(sum.quote?.missing)},
   sourceDigest:sum.recordedMinutesDigest,dataGapIsNotZeroSignals:true};
 };
 const sc=summarize('scanner',scanner),a=summarize('ai',ai);
 const missing=(!scanner||!ai)||sc.missingMinutes>0||a.missingMinutes>0||
  (sc.failedCycles||0)>0||(a.failedCycles||0)>0||readErrors.length>0;
 const status=!scanner&&!ai?'NO_VERIFIED_SCANNER_DATA':missing?'PARTIAL_EVIDENCE':'LOCAL_EVIDENCE_RECORDED';
 const observations=[];
 const add=(engine,rec)=>{
  if(!rec||rec.observations===null)return;
  observations.push({engine,observedRows:rec.observations,storedMinutes:rec.storedMinutes,
   expectedMinutes,missingMinutes:rec.missingMinutes,
   topRejection:rec.topReasons[0]||null,interpretation:'Recorded evaluations, not distinct trade opportunities or proof of execution'});
 };
 add('SCANNER',sc);add('DYNAMIC_AI',a);
 const recommendations=[];
 if(missing)recommendations.push({area:'ARCHIVE_COVERAGE',status:'PROPOSED_UNTESTED',
  hypothesis_ar:'قد تؤدي فجوات التسجيل إلى فوات معلومات مهمة؛ لا نعتبر الدقائق المفقودة بلا فرص.',
  test_ar:'قارن الدقائق المفقودة مع سجلات تشغيل الوظائف والتغذية، ثم اختبر اكتمال الحفظ في جلسة لاحقة.',
  acceptance_metric_ar:'نسبة دقائق مؤرشفة وموثقة لكل ماسح دون زيادة وقت المسح أو التكلفة.',
  evidence:'RECORDED_MINUTE_COUNTS',canApply:false});
 for(const [engine,rec] of [['SCANNER',sc],['DYNAMIC_AI',a]]){
  const blocker=rec.topReasons.find(x=>x.count>=5&&x.reason!=='UNKNOWN');
  if(blocker)recommendations.push({area:'REJECTION_GATES',engine,status:'PROPOSED_UNTESTED',
   hypothesis_ar:`تكرار ${blocker.reason} في ${blocker.count} تقييم محفوظ قد يستحق فحصاً؛ ليس عدد فرص ضائعة مثبتة.`,
   test_ar:'راجع عينات رفض مختلفة زمنياً واربطها بأسعار لاحقة موثقة قبل اقتراح أي تعديل.',
   acceptance_metric_ar:'انخفاض الرفض الخاطئ المثبت دون تراجع نتائج الورقي بعد التكاليف.',
   evidence:`${engine}:REASON_COUNTS`,canApply:false});
 }
 const generatedAt=now.toISOString();
 const result={schemaVersion:'DT37-DAILY-DIAGNOSTIC-1',day,generatedAt,
  status,mode:'LOCAL_NO_OPENAI_SPEND',summary_ar:status==='NO_VERIFIED_SCANNER_DATA'?`جلسة ${day}: لم تتوفر سجلات موثقة لأي من الماسحين؛ لا يمكن الجزم بوجود أو غياب فرص.`:
   `جلسة ${day}: الأساسي ${sc.storedMinutes??'غير متاح'}/${expectedMinutes} دقيقة، وDynamic AI ${a.storedMinutes??'غير متاح'}/${expectedMinutes} دقيقة؛ جودة الأدلة ${status==='PARTIAL_EVIDENCE'?'غير مكتملة':'مكتملة زمنياً ضمن النافذة'}.`,
  engines:{scanner:sc,ai:a},observations,recommendations:recommendations.slice(0,5),
  readFailures:readErrors.slice(0,18).map(x=>({source:text(x.source),reason:'ARCHIVE_READ_FAILED'})),
  limits:['NO_REAL_BROKER_FILLS','MISSING_MINUTES_NOT_ZERO_TRADES','CAUSAL_IMPROVEMENT_NOT_PROVEN',
   'UNPRICED_OUTCOMES_NOT_PROFIT','MODEL_OUTPUT_NOT_USED_IN_THIS_REPORT'],
  canTrade:false,canApplyChanges:false,externalAuditVerified:false};
 result.digest=createHash('sha256').update(JSON.stringify({day,status,engines:result.engines,readFailures:result.readFailures})).digest('hex');
 return result;
}
export async function publishDailyDiagnostic37({store,day,now=new Date(),env={}}={}){
 if(!store)throw Error('DAILY_RESEARCH_STORE_REQUIRED');
 const key=dailyResearchKey37(day),prior=await store.get(key,{type:'json',consistency:'strong'});
 if(prior?.schemaVersion==='DT37-DAILY-DIAGNOSTIC-1'&&prior.day===day&&prior.digest)
  return {report:prior,prepared:null,alreadySaved:true};
 const sources=['scanner','ai'].flatMap(kind=>researchHours.map(hour=>({kind,hour,
  key:ledgerKey(kind,day,hour*60)})));
 const settled=await Promise.all(sources.map(async source=>{
  try{return {source,ok:true,value:await store.get(source.key,{type:'json',consistency:'strong'})}}
  catch{return {source,ok:false,value:null}};
 }));
 const failures=settled.filter(x=>!x.ok).map(x=>({source:x.source.key}));
 const shards=kind=>settled.filter(x=>x.source.kind===kind).map(x=>x.value);
 let sc=null,ai=null;
 try{sc=combineLedgerShards('scanner',day,shards('scanner'))}
 catch{failures.push({source:'SCANNER_LEDGER_INVALID'});}
 try{ai=combineLedgerShards('ai',day,shards('ai'))}
 catch{failures.push({source:'AI_LEDGER_INVALID'});}
 const report=buildDailyDiagnostic37({day,scanner:sc,ai,now,
  expectedMinutes:researchExpectedMinutes37(env,day),readErrors:failures});
 await store.setJSON(key,report);
 const actual=await store.get(key,{type:'json',consistency:'strong'});
 if(actual?.digest!==report.digest||actual?.day!==day||actual?.schemaVersion!==report.schemaVersion)
  throw Error('DAILY_DIAGNOSTIC_PERSIST_NOT_VERIFIED');
 return {report:actual,prepared:{scLedger:sc,aiLedger:ai},alreadySaved:false};
}
