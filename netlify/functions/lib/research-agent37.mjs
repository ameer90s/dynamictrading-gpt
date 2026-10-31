/** Independent deterministic Stage-3 evidence researcher. Read-only hypotheses.
 * NO strategy thresholds, brokerage calls or automatic experiments are changed.
 */
import {createHash} from 'node:crypto';
const total=(list,name)=>(list||[]).filter(x=>x.name===name).reduce((a,x)=>a+x.count,0);
export function researchAgent37FromAudit({day,audit,generatedAt=null}={}){
 if(!audit?.streams?.scanner||!audit?.streams?.ai||!day)throw Error('MISSING_RESEARCH_EVIDENCE');
 const sc=audit.streams.scanner,ai=audit.streams.ai,why=[],sum={};
 const base=`DT37_${day}`;
 const add=(id,observedFact,hypothesis,experiment,metric,limitation)=>{
   why.push({id,status:'PROPOSED_UNTESTED',evidenceId:base,observedFact,hypothesis,experiment,
     acceptanceMetric:metric,limitation,canApply:false});
 };
 const missing=(sc.missingMinutes?.length||0)+(ai.missingMinutes?.length||0);
 if(missing||sc.readErrors.length||ai.readErrors.length) add('ARCHIVE_COVERAGE',
   `الأرشيف حفظ ${sc.storedMinutes}/390 دقيقة للماسح و${ai.storedMinutes}/390 للـAI، والدقائق المفقودة ${missing}.`,
   'قد تؤدي فجوات التشغيل أو الحفظ إلى فقد إشارات ومقارنات أداء.',
   'قارن وقت وظائف Netlify ومفاتيح الدقائق المفقودة وفشل API، ثم أعد اختبار الأرشفة قبل وبعد الإصلاح.',
   'نسبة الدقائق المؤرشفة لكل محرك وعدد أخطاء الحفظ/القراءة.',
   'الفقد قد يعني عدم جدولة الوظيفة أو فشل حفظ، وليس فرصاً ربحية مفقودة مثبتة.');
 const spread=total(sc.reasonCounts,'SPREAD_TOO_WIDE')+total(ai.reasonCounts,'SPREAD_TOO_WIDE');
 if(spread||ai.quote.invalidCrossed||sc.quote.invalidCrossed) add('QUOTE_FRICTION',
   `الرفض بسبب السبريد: ${spread}، والأسعار المتقاطعة: ${ai.quote.invalidCrossed+sc.quote.invalidCrossed}.`,
   'قد يقلل تحسين توقيت أو مصدر أسعار التنفيذ من الرفض دون التنازل عن حدود المخاطر.',
   'اختبر Bid/Ask أصلياً عند نفس دقيقة القرار، على عينة خارج التدريب ومع تكاليف واقعية.',
   'صافي الربح الورقي بعد السبريد والرسوم، ومعه معدل الرفض والـMFE/MAE.',
   'IEX L1 ليس SIP/NBBO ولا يثبت تنفيذ الأوامر الحقيقية.');
 const missingQuotes=ai.quote.missing+sc.quote.missing;
 if(missingQuotes||!ai.quote.withSizes) add('QUOTE_COMPLETENESS',
   `سجلات بدون Quote: ${missingQuotes}؛ وسجلات AI التي تتضمن أحجام bid/ask: ${ai.quote.withSizes}.`,
   'قد ينتج فقد الأسعار أو أحجامها عن ضعف التغطية أو البيانات وقت القرار.',
   'افصل حالات عدم وصول السعر عن الرفض الفني، وقارن زمن المصدر وحالة API الدقيقة.',
   'نسبة توفر bid/ask والكمية والتوقيت الأصلي لكل تقييم.',
   'بعض تقييمات WAIT لا تحتاج L1؛ غياب السعر لا يعني دائماً خطأ في الاستراتيجية.');
 if(!audit.comparison?.matchingBothBidAsk) add('PAIR_COMPARABILITY',
   `تقييمات مشتركة لنفس السهم والدقيقة: ${audit.comparison?.sameMinuteSameSymbol||0}؛ أسعار مقارنة مكتملة: 0.`,
   'قد يكون اختلاف الماسحين ناتجاً عن اختلاف لحظة السوق أو غياب أسعار موحدة.',
   'سجّل طلب سعر موحد لكل سهم/دقيقة، وقارن بوابات القرار قبل تعديل الاستراتيجية.',
   'عدد فرص المقارنة بسعر ووقت ومصدر موحد بين الماسحين.',
   'المقارنة بين فرص غير متزامنة لا تعطي نسبة نجاح نسبية موثوقة.');
 if(why.length===0)add('NO_CAUSAL_EVIDENCE',
   'لا توجد حتى الآن أدلة كافية على سبب خسائر الصفقات.',
   'قد تحتاج الدراسة فترات أكثر وبيانات تنفيذ وأهلية شرعية مؤرخة.',
   'اجمع نتائج متعددة الجلسات واختبر خارج العينة بعد خصم التكاليف.',
   'العائد الصافي ومخاطر السحب على بيانات جديدة.',
   'هذه فرضية جمع بيانات وليست توصية تغيير للاستراتيجية.');
 const digest=createHash('sha256').update(JSON.stringify({day,auditDigest:audit.sourceDigest,hypotheses:why})).digest('hex');
 return {schemaVersion:'3.7-STAGE3-RESEARCH-1',day,generatedAt,evidenceCount:sc.attemptedRows+ai.attemptedRows,
   evidenceDigest:audit.sourceDigest,stage3Digest:digest,sourceIds:[base],independent:true,
   historicalResultsAreNotActualFills:true,testsOutOfSamplePerformed:false,
   hypotheses:why.slice(0,4),recommendationCount:Math.min(4,why.length),
   canApplyChanges:false,noBrokerOrders:true,source:'REAL_RECORDED_PER_MINUTE_AUDITS_NOT_SYNTHETIC_480_REPLAY'};
}
