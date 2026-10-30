# نقل خصائص 3.5 إلى Dynamic Trading 3.6

| خاصية 3.5 | حالة 3.6 | الملف/ملاحظة |
|---|---|---|
| واجهة اليوم والمراقبة الآلية | محفوظة مع قسم كروت جديد | `public/index.html`, `public/app.js` |
| Market Pro والشارتات | محفوظة | `netlify/functions/market-pro.mjs` |
| الاكتشاف الديناميكي للكون الشرعي | محفوظ ويستخدم محرك 3.6 للقرار | `lib/session-universe.mjs`, `lib/trading.mjs` |
| شريعة AAOIFI المخزنة محلياً | محفوظة بلا قائمة بديلة تلقائية | `lib/sharia.mjs` |
| SMART Focus والمتابعة كل دقيقة | محفوظة | `lib/smart-watch.mjs`, `lib/smart-focus.mjs`, `daily-recommendation.mjs` |
| إشعار Push للـ CONFIRMED | محفوظ ومعدل إلى PAPER مع معرّف إشارة ثابت | `lib/push.mjs` |
| إشعار Push للـ SMART | جديد مع منع تكرار الإشعار لنفس الرمز والجلسة | `lib/push.mjs` |
| تسجيل التاريخ والأرشفة/JSON/CSV | محفوظ مع أعمدة ومرفقات أسباب جديدة | `lib/signal-history.mjs` وخدمات السجل القديمة |
| Outcome Tracker وMFE/MAE | محفوظ وموسع بستة Shadow Targets | `outcome-tracker.mjs`, `lib/shadow36.mjs` |
| PWA وService Worker | محفوظ مع مسح cache 3.6 | `public/service-worker.js`, `manifest.webmanifest` |
| خيارات وضع الاستراتيجية القديمة | لا تزال تظهر وتؤثر على المؤشرات القديمة؛ القرار النهائي للبحث موحد | `lib/trading.mjs` |
| BAD/WAIT ومؤشرات السياق القديمة | محفوظة كمعلومات سياقية، لا تصدر CONFIRMED وحدها | `lib/trading.mjs` |
| سجل REGULAR→SMART وSMART→CONFIRMED | جديد | `lib/signal-history.mjs`, `transition-cards.mjs` |
| تحليل AI | جديد، تحليل قواعد/إحصاء لا تعلّم آلي ذاتي | `lib/ai-advisor36.mjs`, `ai-insights.mjs` |
| حماية السعر قبل CONFIRMED | جديد، تحديث L1 بعد تحليل الشموع | `lib/trading.mjs`, `lib/research36.mjs` |

**التحقق:** جميع اختبارات النظام المتاحة محلياً نجحت. **لم يجر اختبار استقبال Push من هاتفك أو عمل الإصدار على الاستضافة الفعلية**، ولا تعني عبارة «محفوظة» أن خدمة خارجية متصلة الآن.
