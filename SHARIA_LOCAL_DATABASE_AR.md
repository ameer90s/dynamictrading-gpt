# قاعدة الشرعية المحلية — v3.5

المصدر الأساسي البديل للشرعية لا يعتمد على API أو Credits. يتم حفظ Snapshot موثّق وفق AAOIFI في Netlify Blobs تحت مفتاح مستقل، ثم يأخذ Dynamic Scanner الـUniverse منه مباشرة.

## الأولوية
1. Local Sharia Database حديثة (حتى 90 يوماً).
2. Halal Terminal cache/API كمصدر مساعد إن كان متاحاً.
3. Local Sharia Database القديمة كـfallback مستقل عند فشل التحديث الخارجي.
4. Manual environment fallback للطوارئ فقط.
5. إذا لا يوجد أي مصدر موثوق: Fail Closed ولا يتم اختراع قائمة أسهم ثابتة.

## إدخال Snapshot موثّق
POST إلى `/.netlify/functions/sharia-local-import` مع Header باسم `x-sharia-admin-token` يساوي `SHARIA_ADMIN_TOKEN`، وJSON يحتوي `sourceName`, `asOf`, و`rows`. كل row يحتوي `symbol` و `aaoifiStatus: COMPLIANT`. الصفوف غير COMPLIANT لا تدخل القاعدة.

مثال payload:
```json
{"sourceName":"Verified AAOIFI snapshot","asOf":"2026-10-20","rows":[{"symbol":"XYZ","aaoifiStatus":"COMPLIANT"}]}
```

لا توجد قائمة أسهم شرعية ثابتة مدمجة في الكود. يجب أن يأتي الـSnapshot من مصدر شرعي موثّق؛ البرنامج لا يخمّن التصنيف.
