/* Arabic presentation only. Backend field names, codes, decisions, exports and storage are unchanged. */
(()=>{'use strict';
const statuses={
 NO_REVIEW:'لا توجد مراجعة محفوظة',NOT_RECORDED:'لم تُسجّل بيانات',RECORDED:'مسجّل',READY:'الأدلة جاهزة',
 LOCAL_DAILY_REPORT:'تقرير يومي محلي',LOCAL_RESEARCH_ONLY:'بحث محلي فقط',LOCAL_EVIDENCE_REVIEW:'مراجعة محلية للأدلة',
 REVIEW_CREATED_NOT_APPLIED:'مراجعة محفوظة ولم تُطبّق',REVIEW_CREATED_NOT_VALIDATED:'مراجعة محفوظة ولم تُعتمد',
 OPENAI_CONNECTED_TO_STRATEGY_LEARNING:'تقرير OpenAI مرتبط بتحليل التعلم',
 NOT_RUN:'لم تُشغّل',NOT_VERIFIED:'لم يتم التحقق',UNVERIFIED:'غير متحقق',INSUFFICIENT_AUDIT:'أرشيف غير كافٍ',
 PARTIAL_EVIDENCE:'أدلة جزئية',MISSING:'مفقود',FAILED:'فشل',FAILED_NO_RETRY:'فشل دون إعادة محاولة',
 DISABLED:'غير مفعل',DISABLED_OR_NOT_RUN:'غير مفعل أو لم يُشغّل',NOT_CONFIGURED:'غير مهيأ',
 RESERVED:'قيد التحليل',ARCHIVE_UNAVAILABLE:'الأرشيف غير متاح',HTTP_UNAVAILABLE:'الاتصال غير متاح',
 PROPOSED_UNTESTED:'مقترح يحتاج اختباراً',PROPOSED:'مقترح',NOT_APPLIED:'غير مطبق',
 PASS:'اجتاز',FAIL:'لم يجتز',COMPLETED:'مكتمل',COMPLETE:'مكتمل',IN_PROGRESS:'قيد التنفيذ',PENDING:'بانتظار التنفيذ',
 REJECTED:'مرفوض',ACCEPTED:'مقبول',APPROVED:'معتمد',DENIED:'مرفوض',
 CLOSED:'مغلقة',OPEN:'مفتوحة',WAIT:'انتظار',BAD:'ضعيفة',SMART:'متابعة ذكية',CONFIRMED:'مؤكدة',
 NO_CANDIDATES:'لا توجد فرص',NO_DATA:'لا توجد بيانات',NO_FEED:'مصدر البيانات غير متاح',
 PAPER:'ورقي',TRACKING:'قيد المتابعة',NO_TRADES:'لا توجد صفقات',UNKNOWN:'غير معروف',
 LOW:'منخفضة',MEDIUM:'متوسطة',HIGH:'مرتفعة',NOT_ENOUGH_EVIDENCE:'الأدلة غير كافية',
 SCANNER_COVERAGE_TOO_LOW:'تغطية أرشيف الماسح الأساسي غير كافية',AI_COVERAGE_TOO_LOW:'تغطية أرشيف ماسح AI غير كافية',
 SCALP_COVERAGE_TOO_LOW:'تغطية السكالب غير كافية',DATA_UNAVAILABLE:'البيانات غير متاحة',
 LOCAL_REPORT:'تقرير محلي',DAILY:'يومي',WEEKLY:'أسبوعي',MONTHLY:'شهري',
 FULL_EVIDENCE:'أدلة مكتملة',PARTIAL:'غير مكتمل',SKIPPED:'تم التجاوز',
 DATA_GAP:'فجوة بيانات',ERROR:'خطأ',TIMEOUT:'انتهت المهلة',PAID_REPORT_CREATED:'أُنشئ التقرير المدفوع',
 NO_PAID_REPORT:'لا يوجد تقرير مدفوع',NOT_READY:'غير جاهز',RESEARCH_ONLY:'بحث فقط',
 AWAITING_TEST_EVIDENCE:'بانتظار أدلة الاختبار',PASS_INDEPENDENTLY_VERIFIED:'نجاح موثق بتدقيق مستقل',
 TEST_PASSED:'اجتاز الاختبار',TEST_INCONCLUSIVE:'نتيجة الاختبار غير حاسمة',
 REJECTED_BY_OWNER:'رفضه صاحب المشروع',INDEPENDENT_TEST_FAILED:'فشل الاختبار المستقل',
 HARMFUL_OBSERVED:'تأثير سلبي موثق',ROLLED_BACK:'أُلغي التعديل',
 APPROVED_FOR_PAPER:'معتمد للتجربة الورقية',APPROVED_FOR_PRODUCTION:'معتمد للتشغيل الحقيقي',
 NO_VERIFIED_OUTCOME:'لا توجد نتيجة موثقة',
 CONSOLIDATED_REQUIRES_INDEPENDENT_VALIDATION:'تقرير مجمّع بانتظار تدقيق مستقل',
 INSUFFICIENT_SAMPLE_CARRY_FORWARD:'عينة غير كافية؛ تستمر المتابعة للفترة التالية',
 WAITING_FOR_COMPLETE_ARCHIVES:'بانتظار اكتمال الأرشيف',
 FINAL_REPORT_NOT_VERIFIED:'لم يتم التحقق من حفظ التقرير النهائي',
 NO_CYCLES_YET:'لم تُسجل دورات بعد',NO_PERIOD_DUE:'لا توجد فترة مستحقة',
 ALREADY_CONSOLIDATED:'التقرير الدوري مجمّع مسبقاً',
 RECORDED_PAPER_ONLY:'نتائج ورقية محفوظة فقط',
 RECORDED_SCALP_PAPER_ONLY:'نتائج سكالب ورقية محفوظة فقط',
 RECORDED_PAPER_OUTCOMES_ONLY:'نتائج صفقات ورقية محفوظة فقط',
 MONTHLY_SAMPLE_INSUFFICIENT_CARRY_FORWARD:'العينة الشهرية غير كافية؛ تُرحّل للمراجعة التالية',
 WEEKLY_RESEARCH_SHORTLIST_ONLY:'قائمة بحث أسبوعية أولية فقط',
 MONTHLY_RESEARCH_SHORTLIST_ONLY:'قائمة بحث شهرية أولية فقط',
 STATIC_SCANNER_ONLY:'الماسح الأساسي فقط',PAPER_ONLY:'تداول ورقي فقط',
 VALIDATED:'تم التحقق',RUNNING:'قيد التشغيل',REVIEW_PENDING:'المراجعة قيد الانتظار',
 AUTOMATICALLY_APPLIED:'مطبق تلقائياً',SUPPRESSED:'محجوب بسبب قرار سابق',
 UNKNOWN_OUTCOME:'نتيجة غير معروفة',UNPRICED:'نتيجة غير مسعرة',
 PROPOSED_VARIANT:'نسخة استراتيجية مقترحة',SHADOW_EXPERIMENT:'تجربة بحثية دون تنفيذ'
};
const areas={
 RESEARCH:'بحث وتقييم',RETEST:'إعادة الاختبار',QUOTE_COMPLETENESS:'اكتمال عروض الأسعار',SPREAD:'فارق سعر العرض والطلب',
 CONFIRMATION:'تأكيد الإشارات',COSTS_SPREAD:'التكاليف والسبريد',EXIT_SHADOW:'الخروج والأهداف البحثية',
 DATA_INGESTION:'استقبال بيانات الأسعار',RISK_GATES:'شروط ضبط المخاطر',AUDIT_RETENTION:'حفظ الأرشيف وأدلة التدقيق',
 DISCOVERY:'اكتشاف الفرص',DATA_AND_GATES:'البيانات وشروط الفرز',ENTRY_AND_EXIT:'الدخول والخروج',
 OUTCOMES:'نتائج الصفقات',AI_VS_SCANNER_OUTCOMES:'مقارنة نتائج AI والماسح الأساسي',
 INFRASTRUCTURE_AND_RUNTIME:'البنية وسرعة التشغيل',NOTIFICATIONS_AND_DELIVERY:'الإشعارات ووصولها',
 TARGETS_AND_POST_EXIT:'الأهداف وما بعد الخروج',COMPETITIVE_COMPARISON:'مقارنة فرص المحركين',
 SCALP_ENTRY_GATES:'شروط دخول السكالب',SCALP_SAMPLE_SIZE:'حجم عينة السكالب',
 SCALP_RISK_COSTS:'مخاطر وتكاليف السكالب',SCALP_UNRESOLVED_POSITIONS:'مراكز السكالب غير المحسومة',
 SCALP_DATA_GAPS:'فجوات بيانات السكالب',DATA_QUALITY:'جودة البيانات',QUOTE_QUALITY:'جودة عروض الأسعار',
 ALERTS:'التنبيهات',EXECUTION:'التنفيذ',SCANNER:'الماسح الأساسي',AI:'الماسح الذكي',
 RISK:'المخاطر',LEARNING:'التعلم',COVERAGE:'التغطية',STRATEGY:'الاستراتيجية',
 OPENING:'الافتتاح',CANDIDATE:'المرشح',ADAPTIVE_SESSION:'متابعة الجلسة',
 REJECTION:'الاستبعاد',SIGNAL:'الإشارات',OUTCOME:'نتيجة الصفقة'
};
const gates={
 approved_sharia:'اعتماد السهم شرعياً',opening_bars:'شموع الافتتاح',opening_return_low:'الحد الأدنى لعائد الافتتاح',
 opening_return_high:'الحد الأعلى لعائد الافتتاح',opening_volume_ratio:'نسبة حجم تداول الافتتاح',
 opening_dollar_volume:'سيولة الافتتاح بالدولار',relative_strength:'القوة النسبية',momentum_5m:'زخم خمس دقائق',
 setup_origin_still_valid:'استمرار صلاحية إشارة الدخول',price_above_vwap:'السعر فوق VWAP',
 vwap:'متوسط السعر المرجّح بالحجم',spread:'فارق العرض والطلب',quote_freshness:'حداثة عرض السعر',
 quote_age:'عمر عرض السعر',entry:'سعر الدخول',volume:'الحجم',liquidity:'السيولة',
 opening:'شروط الافتتاح',candidate:'شروط اختيار المرشح',execution:'شروط التنفيذ'
};
const reasons={
 UNAPPROVED_SHARIA:'السهم غير معتمد شرعياً',OPENING_DATA_INCOMPLETE:'بيانات الافتتاح غير مكتملة',
 OPEN_RETURN_LOW:'عائد الافتتاح دون الحد المطلوب',OPEN_RETURN_TOO_HIGH:'ارتفاع الافتتاح يتجاوز الحد',
 OPEN_VOLUME_RATIO_LOW:'نسبة حجم الافتتاح منخفضة',OPEN_LIQUIDITY_LOW:'سيولة الافتتاح غير كافية',
 RELATIVE_STRENGTH_LOW:'القوة النسبية منخفضة',MOMENTUM_WEAK:'الزخم ضعيف',
 SETUP_ELIGIBILITY_CHANGED:'تغيرت صلاحية شروط الإشارة',OR_HIGH_NOT_BROKEN:'لم تُخترق قمة نطاق الافتتاح',
 OPENING_RANGE_INCOMPLETE:'نطاق الافتتاح غير مكتمل',QUOTE_STALE:'عرض السعر قديم',
 SPREAD_TOO_WIDE:'فارق العرض والطلب واسع',RETEST_PENDING:'بانتظار إعادة الاختبار',
 NO_CANDIDATES:'لا توجد فرص',MINUTE_ARCHIVED_ZERO_RECORDS:'دقيقة محفوظة دون فرص',
 NO_DATA:'البيانات غير متاحة',QUOTE_MISSING:'عرض السعر مفقود',
 FEED_PROVIDER_EXCEPTION:'خطأ من مزود بيانات السوق',BENCHMARK_STALE_OR_MISALIGNED:'بيانات المؤشر المرجعي قديمة أو غير متزامنة',
 NO_VALID_SCALP_CANDIDATE_BARS:'شموع فرص السكالب غير صالحة',
 NO_COMPLETED_SPY_BARS:'شموع SPY المكتملة غير متاحة',
 SCALP_MINUTE_CLAIMED_NO_RESULT_YET:'دقيقة السكالب قيد المعالجة ولم تكتمل بعد',
 SCALP_DATA_GAPS:'فجوات بيانات السكالب'
};
const params={
 openReturnMinPct:'أدنى عائد افتتاح (%)',openReturnMaxPct:'أعلى عائد افتتاح (%)',
 openVolumeRatioMin:'أدنى نسبة حجم الافتتاح',openDollarVolumeMin:'أدنى سيولة افتتاح',
 relativeStrengthMinPct:'أدنى قوة نسبية (%)',momentumMinPct:'أدنى زخم (%)',
 spreadMaxBps:'أقصى سبريد (نقطة أساس)',maxSpreadBps:'أقصى سبريد (نقطة أساس)',
 rvolMin:'أدنى حجم نسبي',confidenceMin:'حد درجة الجودة',
 profitPotentialScore:'درجة جودة الفرصة',EARLY:'الدخول المبكر',RETEST:'إعادة الاختبار'
};
function label(value,group='status'){
 if(value==null||value==='')return 'غير متاح';
 const raw=String(value),key=raw.trim();
 const dict=group==='area'?areas:group==='gate'?gates:group==='reason'?reasons:group==='parameter'?params:statuses;
 if(Object.hasOwn(dict,key))return dict[key];
 if(Object.hasOwn(statuses,key))return statuses[key];
 if(Object.hasOwn(areas,key))return areas[key];
 if(Object.hasOwn(reasons,key))return reasons[key];
 if(Object.hasOwn(gates,key))return gates[key];
 if(Object.hasOwn(params,key))return params[key];
 // Technical identifiers remain intact in the source. Unclassified codes are shown with Arabic context.
 if(/^[A-Z][A-Z0-9_.\/-]{2,}$/.test(key))return `رمز تقني: ${key}`;
 if(/^[a-z][a-zA-Z0-9_]{2,}$/.test(key))return `معرّف فني: ${key}`;
 return raw;
}
function scalpAdvice(s,summary={}){
 const e=s?.evidence||{},area=s?.area||'';
 const num=(x)=>Number.isFinite(Number(x))?Number(x).toLocaleString('ar-AE'): 'غير محدد';
 switch(area){
  case 'SCALP_ENTRY_GATES':return {observation:`تكرر سبب منع الدخول «${label(e.reason,'reason')}» في ${num(e.count)} رصداً؛ لا يعني ذلك ضياع عدد مماثل من الفرص الفريدة.`,hypothesis:'قد يكون السبب تأخر شموع الأسعار، أو تكاليف التنفيذ، أو طبيعة السوق، أو شرطاً مقيداً.',test:'مقارنة الأسهم المستبعدة بالشموع المكتملة اللاحقة وبعروض أسعار متزامنة، مع عدّ الحالات الفريدة فقط.',acceptanceMetric:'إثبات تقليل الفرص الجيدة الفائتة دون زيادة المخاطر أو تدهور العائد الورقي بعد التكاليف.'};
  case 'SCALP_SAMPLE_SIZE':return {observation:`هناك ${num(e.count)} صفقات سكالب ورقية مغلقة ومسعّرة وفريدة؛ النتائج غير المعروفة لا تُحتسب أرباحاً.`,hypothesis:'العينة الحالية قد لا تكفي لإثبات ربحية صافية أو اعتماد نمط جديد.',test:'جمع نتائج ورقية غير مكررة عبر جلسات مستقلة من دون تغيير شروط التنفيذ.',acceptanceMetric:'60 نتيجة مغلقة مستقلة على الأقل لكل نمط مرشح، مع اختبار زمني لاحق وتدقيق مستقل.'};
  case 'SCALP_RISK_COSTS':return {observation:`النمط ${label(e.type,'area')}: ${num(e.losses)} خسائر ورقية من ${num(e.sample)} نتائج؛ صافي النتيجة بعد التكلفة: ${Number.isFinite(summary?.bySetup?.[e.type]?.netUsd)?Number(summary.bySetup[e.type].netUsd).toFixed(2)+' دولار':'غير متاح'}.`,hypothesis:'قد ترتبط الخسائر بتوقيت الدخول أو السيولة والسبريد أو الانزلاق أو موضع الوقف.',test:'مقارنة افتراضات الانزلاق وظروف السوق وأقصى تحرك لصالح/ضد الصفقة وفحوص الدخول تاريخياً.',acceptanceMetric:'نتائج صافية موجبة بعد المخاطر في عينة اختبار مستقلة، دون زيادة الحد الأقصى للخسارة.'};
  case 'SCALP_UNRESOLVED_POSITIONS':return {observation:`بقيت ${num(e.count)} مراكز ورقية مفتوحة في السجل؛ لا نفترض إغلاقها أو احتساب نتيجتها صفراً.`,hypothesis:'فقدان دورة مجدولة أو نقص بيانات الشموع بعد الإغلاق قد يترك النتيجة دون حسم.',test:'تتبع كل مركز إلى آخر شمعة مؤهلة مكتملة، أو توثيق عدم إمكانية تسعيره صراحةً.',acceptanceMetric:'نتيجة نهائية فريدة ومؤرخة لكل مركز ورقي، إما إغلاق مسعّر أو إغلاق غير مسعّر موثّق.'};
  case 'SCALP_DATA_GAPS':return {observation:`سُجلت ${num(e.count)} أخطاء من مصدر البيانات؛ لا تعتبر دقائق الخطأ خالية من الفرص.`,hypothesis:'انقطاع البيانات أو قدمها قد يحجب فرص السكالب.',test:'تدقيق الشموع المفقودة وتوقيت عروض الأسعار وتأخر دورات المسح لكل دقيقة.',acceptanceMetric:'عدم وجود فجوات أرشيفية غير مفسرة، وقياس أسوأ زمن للمسح ضمن الميزانية.'};
  default:return {observation:s?.observation||'لا توجد ملاحظة عربية موثقة لهذا التصنيف.',hypothesis:s?.hypothesis||'فرضية غير محددة',test:s?.test||'لم تُحدد تجربة',acceptanceMetric:s?.acceptanceMetric||'لم يُحدد معيار قبول'};
 }
}
window.DT37ReportArabic=Object.freeze({label,scalpAdvice});
})();
